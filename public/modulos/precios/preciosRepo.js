// MODELO · Único punto de acceso a datos del módulo Precios y Materiales (precios_v3).
//
// Por qué todo pasa por aquí: la base expone SOLO dos puertas y ninguna es una tabla.
//   · public.precios_panel   → lectura, enmascara costo/margen salvo rol gerencia
//   · public.f_actualizar_precio(...) → escritura, valida el rol con el JWT del usuario
// El esquema precios_v3 no tiene USAGE para anon, así que no hay forma de alcanzarlo
// desde el navegador aunque alguien manipule el cliente.
import { getClient, getSession } from "../../shared/js/supabase.js";

// Lee el rol desde el JWT. El token lo firma Supabase, así que no se puede falsear
// editando JS. Igual es solo para pintar la UI: quien autoriza de verdad es el RPC.
export async function rolDesdeToken() {
  const s = await getSession();
  return s?.user?.app_metadata?.rol || null;
}

// Precios vigentes visibles para el usuario actual.
//
// SEMÁNTICA (no confundir, el modelo antiguo la tenía invertida):
//   precio_publicado_clp → lo que LE PAGAMOS A LA GENTE. Es lo que sale a las webs.
//   precio_recibido_clp  → lo que NOS PAGAN LAS FUNDICIONES. Interno, solo gerencia.
// La vista ya decide qué columnas entrega según el rol: un operador recibe
// precio_recibido_clp = null desde la base, no oculto por CSS.
export async function listarPrecios() {
  const { data, error } = await getClient()
    .from("precios_panel")
    .select("id, material_id, material, nombre_publico, sucursal_id, sucursal, " +
            "precio_publicado_clp, precio_recibido_clp, margen_pct, flete_clp, iva_pct, " +
            "spread_pct, precio_ejecutivo_clp, precio_maximo_clp, redondeo, requiere_revision, " +
            "vigencia_desde, creado_por, updated_at, mi_rol")
    .order("material");
  if (error) throw new Error(error.message);
  return data || [];
}

// Precio vigente de un par material×sucursal. Lo usa la Calculadora para mostrar el
// "Delta vs vigente": cuánto sube o baja respecto de lo que hoy está publicado.
// Devuelve null si el par todavía no tiene precio (material nuevo en esa sucursal).
export async function precioVigente(materialId, sucursalId) {
  const { data, error } = await getClient()
    .from("precios_panel")
    .select("precio_publicado_clp, precio_ejecutivo_clp, precio_maximo_clp, vigencia_desde")
    .eq("material_id", materialId).eq("sucursal_id", sucursalId)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

// Actualiza el precio que publicamos (lo que pagamos a la gente) para un material/sucursal.
// El RPC cierra la vigencia anterior, inserta la nueva fila y escribe la auditoría
// en una sola transacción; si el usuario no es gerencia responde 42501.
export async function actualizarPrecio({ materialId, sucursalId, publicado, recibido = null, motivo = null }) {
  const { data, error } = await getClient().rpc("f_actualizar_precio", {
    p_material_id: materialId,
    p_sucursal_id: sucursalId,
    p_precio_publicado: publicado,
    p_precio_recibido: recibido,
    p_motivo: motivo,
  });
  if (error) throw new Error(traducirError(error.message));
  return data;
}

// Visibilidad de cada material en cada web. Antes lo leía vitrinaController directamente
// con getClient(); al fusionarse Vitrina dentro de Publicados el acceso baja al modelo,
// que es donde vive el resto del módulo.
//
// La vista entrega una fila por (material, empresa). Se devuelve agrupado por material
// —{ material_id, material, visible: { farex: bool, reciclean_spa: bool } }— porque la
// pantalla muestra una fila por material con una casilla por empresa.
export async function listarVitrina() {
  const { data, error } = await getClient()
    .from("vitrina_panel")
    .select("material_id, material, nombre_publico, empresa_id, visible, precio_referencia, orden, " +
            "categoria, categoria_nombre, categoria_orden, mi_rol")
    .order("orden");
  if (error) throw new Error(error.message);

  const mapa = new Map();
  (data || []).forEach((f) => {
    if (!mapa.has(f.material_id)) {
      mapa.set(f.material_id, {
        material_id: f.material_id,
        material: f.material,
        nombre_publico: f.nombre_publico,
        precio_referencia: f.precio_referencia,
        orden: f.orden ?? 9999,   // el orden de la lista en papel; sin él, al final
        categoria: f.categoria || "_sin",
        categoria_nombre: f.categoria_nombre || "Sin categoría",
        categoria_orden: f.categoria_orden ?? 999,
        mi_rol: f.mi_rol,
        visible: {},
      });
    }
    mapa.get(f.material_id).visible[f.empresa_id] = !!f.visible;
  });
  return [...mapa.values()];
}

// Historial de variaciones de precio (auditoría). Fuente: public.historial_precios, que
// enmascara los valores internos salvo gerencia. Ordenado del más reciente al más antiguo.
// El buscador filtra en el servidor por material/usuario/sucursal (columnas indexables).
export async function listarHistorialPrecios({ texto = "", limite = 1000 } = {}) {
  let q = getClient().from("historial_precios").select("*");
  if (texto && texto.trim()) {
    const t = texto.trim();
    q = q.or(`material.ilike.%${t}%,actor_email.ilike.%${t}%,sucursal.ilike.%${t}%`);
  }
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

// Histórico de precios que nos entregan los clientes/fundiciones (INTERNO). Fuente:
// public.recibidos_panel, que solo devuelve filas a gerencia/operador (el precio recibido
// es interno). Incluye vigentes e históricos. El filtrado fino (empresa/categoría/texto)
// se hace en memoria en el controlador.
export async function listarRecibidos({ limite = 3000 } = {}) {
  const { data, error } = await getClient()
    .from("recibidos_panel")
    .select("id, material_id, material, categoria, categoria_nombre, categoria_orden, " +
            "empresa_cliente, precio_recibido, fecha, creado_por, vigente, mi_rol, creado")
    // Orden estricto: fecha (vigencia) del más reciente al más antiguo y, dentro del mismo
    // día, por hora de ingreso (created_at) también descendente.
    .order("fecha", { ascending: false })
    .order("creado", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

// Retira (cierra vigencia de) un precio de una sucursal. El RPC solo lo permite si el
// material no está visible en ninguna web; conserva el historial y no rompe FK.
export async function retirarPrecio({ materialId, sucursalId, motivo = null }) {
  const { data, error } = await getClient().rpc("f_precio_retirar", {
    p_material_id: materialId, p_sucursal_id: sucursalId, p_motivo: motivo,
  });
  if (error) throw new Error(traducirError(error.message));
  return data;
}

// Enciende o apaga un material en la vitrina pública de una empresa.
export async function publicarMaterial({ empresaId, materialId, visible }) {
  const { data, error } = await getClient().rpc("f_publicar_material", {
    p_empresa_id: empresaId, p_material_id: materialId, p_visible: visible,
  });
  if (error) throw new Error(traducirError(error.message));
  return data;
}

// Cuántos precios vigentes se retirarían, para avisarlo antes de ejecutar.
export async function contarReinicioPrecios(sucursalId = null) {
  const { data, error } = await getClient()
    .rpc("f_precios_reiniciar_conteo", { p_sucursal_id: sucursalId });
  if (error) throw new Error(traducirError(error.message));
  return Number(data) || 0;
}

// REINICIO DE PRECIOS (soft reset). Deja la vitrina en blanco para cargar una lista nueva.
//
// No borra filas: cierra la vigencia de los precios actuales. El histórico y la auditoría
// se conservan, y la tabla maestra de materiales no se toca. Las vistas (pública y de
// panel) filtran `vigencia_hasta IS NULL`, así que el efecto es inmediato.
// `sucursalId` permite reiniciar una sola sucursal en vez de todas.
export async function reiniciarPrecios({ motivo, sucursalId = null }) {
  const { data, error } = await getClient().rpc("f_precios_reiniciar", {
    p_motivo: motivo, p_sucursal_id: sucursalId,
  });
  if (error) throw new Error(traducirError(error.message));
  return data;
}

// Los errores de Postgres llegan en jerga técnica; la gerencia no tiene por qué leerla.
function traducirError(msg = "") {
  if (/rol gerencia/i.test(msg)) return "No tienes permiso para cambiar precios. Solo gerencia puede hacerlo.";
  if (/solo gerencia reinicia/i.test(msg)) return "Solo gerencia puede reiniciar los precios.";
  if (/solo gerencia retira/i.test(msg)) return "Solo gerencia puede retirar precios.";
  if (/visible en alguna web/i.test(msg)) return "Primero quita el material de las webs (casillas FAREX/Reciclean); luego podrás retirar su precio.";
  if (/Escribe el motivo/i.test(msg)) return msg;
  if (/comprar con perdida|comprar con pérdida/i.test(msg)) return msg; // el RPC ya explica en lenguaje claro
  if (/Falta el precio recibido/i.test(msg))
    return "Este material aún no tiene registrado el precio que pagan las fundiciones. Cárgalo primero.";
  if (/mayor que 0/i.test(msg)) return "El precio debe ser mayor que 0.";
  return msg || "No se pudo guardar el cambio.";
}
