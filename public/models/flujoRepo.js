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
export async function publicar({ id, sucursalId, precioPublicado, nota = null }) {
  const { data, error } = await getClient().rpc("f_borrador_publicar", {
    p_id: id, p_sucursal_id: sucursalId,
    p_precio_publicado: precioPublicado, p_nota: nota,
  });
  if (error) throw new Error(traducir(error.message));
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
