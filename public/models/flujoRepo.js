// MODELO · Acceso al flujo de precios (precios_v3.borrador).
//
// Estados: crudo → pendiente → publicado, o descartado en cualquier punto.
//   crudo      · recién cargado en Carga Manual (a mano, Excel u OCR de Diego)
//   pendiente  · el operador lo revisó y espera a gerencia
//   publicado  · gerencia le asignó sucursal y precio público; ya está en precios_v3.precio
//   descartado · rechazado, se conserva para el Historial
//
// Igual que preciosRepo: la tabla base no tiene GRANT para nadie. Se lee por la vista
// public.borradores_panel y se escribe solo por RPC que revalidan el rol con el JWT real.
import { getClient } from "./supabase.js";

const COLS = "id, estado, material_id, material, material_texto, precio_recibido_clp, " +
             "sucursal_id, sucursal, precio_publicado_clp, margen_pct, vigencia_desde, " +
             "origen, creado_por, revisado_por, publicado_por, nota, created_at, updated_at, mi_rol";

// `estados` acepta uno o varios. `texto` filtra en el servidor contra la columna indexada
// `busqueda` (GIN de trigramas): así el buscador no se trae miles de filas al navegador.
export async function listarBorradores({ estados = null, texto = "", limite = 500 } = {}) {
  let q = getClient().from("borradores_panel").select(COLS);
  if (estados?.length) q = q.in("estado", estados);
  if (texto && texto.trim()) q = q.like("busqueda", `%${texto.trim().toLowerCase()}%`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

// Carga masiva: un solo viaje al servidor aunque sean miles de filas.
export async function cargarFilas(filas, origen = "carga_manual") {
  const { data, error } = await getClient().rpc("f_borrador_cargar", {
    p_filas: filas, p_origen: origen,
  });
  if (error) throw new Error(traducir(error.message));
  return data;
}

export async function pasarAPendiente(ids) {
  const { data, error } = await getClient().rpc("f_borrador_a_pendiente", { p_ids: ids });
  if (error) throw new Error(traducir(error.message));
  return data;
}

// Publicar es lo único reservado a gerencia: aquí se asigna sucursal y precio público.
// Además de P.Lista se guarda la escalera de negociación (P.Ejec, P.Máx) y los parámetros
// con que se calculó, para que el precio sea reproducible y el ejecutivo sepa su techo.
// Los parámetros nuevos son opcionales en el RPC: una llamada sin ellos sigue funcionando.
export async function publicar({
  id, sucursalId, precioPublicado, nota = null,
  precioEjecutivo = null, precioMaximo = null,
  flete = null, spreadPct = null, ivaPct = null, redondeo = null,
}) {
  const { data, error } = await getClient().rpc("f_borrador_publicar", {
    p_id: id, p_sucursal_id: sucursalId,
    p_precio_publicado: precioPublicado, p_nota: nota,
    p_precio_ejecutivo: precioEjecutivo, p_precio_maximo: precioMaximo,
    p_flete: flete, p_spread_pct: spreadPct,
    p_iva_pct: ivaPct, p_redondeo: redondeo,
  });
  if (error) throw new Error(traducir(error.message));
  return data;
}

// Umbrales del semáforo y valores iniciales de los sliders. Viven en la base para que
// gerencia los ajuste sin desplegar. Si la consulta falla se devuelven los mismos valores
// que traía el código antiguo, así la Calculadora nunca queda inutilizable.
const CONFIG_FALLBACK = {
  margen_min_pct: 6, margen_meta_pct: 30, def_margen_pct: 30, def_spread_pct: 20,
  def_flete_clp: 0, def_iva_pct: 0, def_volumen_kg: 500, def_redondeo: "0",
};

export async function configCalculadora() {
  const { data, error } = await getClient()
    .from("config_calculadora_panel").select("*").maybeSingle();
  if (error || !data) return { ...CONFIG_FALLBACK };
  return data;
}

export async function descartar(ids, motivo = null) {
  const { data, error } = await getClient().rpc("f_borrador_descartar", {
    p_ids: ids, p_motivo: motivo,
  });
  if (error) throw new Error(traducir(error.message));
  return data;
}

export async function editarFila({ id, materialId = null, precioRecibido = null, vigencia = null }) {
  const { data, error } = await getClient().rpc("f_borrador_editar", {
    p_id: id, p_material_id: materialId,
    p_precio_recibido: precioRecibido, p_vigencia: vigencia,
  });
  if (error) throw new Error(traducir(error.message));
  return data;
}

// Catálogos para los selectores del flujo.
export async function catalogos() {
  const sb = getClient();
  const [m, s] = await Promise.all([
    sb.from("materiales_panel").select("material_id, nombre_interno").eq("activo", true)
      .order("nombre_interno").limit(2000),
    sb.from("precios_panel").select("sucursal_id, sucursal").limit(1000),
  ]);
  const sucs = [...new Map((s.data || []).map((r) => [r.sucursal_id, r.sucursal])).entries()]
    .map(([id, nombre]) => ({ sucursal_id: id, nombre }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  return { materiales: m.data || [], sucursales: sucs };
}

// Los errores de Postgres llegan en jerga técnica; gerencia no tiene por qué leerla.
function traducir(msg = "") {
  if (/solo gerencia publica/i.test(msg)) return "Solo gerencia puede publicar precios.";
  if (/No autorizado/i.test(msg)) return "No tienes permiso para hacer esto.";
  if (/comprar con perdida|comprar con pérdida/i.test(msg)) return msg;
  if (/pendiente/i.test(msg) && /estado actual/i.test(msg)) return msg;
  return msg || "No se pudo completar la operación.";
}
