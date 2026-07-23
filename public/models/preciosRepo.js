// MODELO · Único punto de acceso a datos del módulo Precios y Materiales (precios_v3).
//
// Por qué todo pasa por aquí: la base expone SOLO dos puertas y ninguna es una tabla.
//   · public.precios_panel   → lectura, enmascara costo/margen salvo rol gerencia
//   · public.f_actualizar_precio(...) → escritura, valida el rol con el JWT del usuario
// El esquema precios_v3 no tiene USAGE para anon, así que no hay forma de alcanzarlo
// desde el navegador aunque alguien manipule el cliente.
import { getClient, getSession } from "./supabase.js";

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
            "precio_publicado_clp, precio_recibido_clp, margen_pct, requiere_revision, " +
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

// Enciende o apaga un material en la vitrina pública de una empresa.
export async function publicarMaterial({ empresaId, materialId, visible }) {
  const { data, error } = await getClient().rpc("f_publicar_material", {
    p_empresa_id: empresaId, p_material_id: materialId, p_visible: visible,
  });
  if (error) throw new Error(traducirError(error.message));
  return data;
}

// Los errores de Postgres llegan en jerga técnica; la gerencia no tiene por qué leerla.
function traducirError(msg = "") {
  if (/rol gerencia/i.test(msg)) return "No tienes permiso para cambiar precios. Solo gerencia puede hacerlo.";
  if (/comprar con perdida|comprar con pérdida/i.test(msg)) return msg; // el RPC ya explica en lenguaje claro
  if (/Falta el precio recibido/i.test(msg))
    return "Este material aún no tiene registrado el precio que pagan las fundiciones. Cárgalo primero.";
  if (/mayor que 0/i.test(msg)) return "El precio debe ser mayor que 0.";
  return msg || "No se pudo guardar el cambio.";
}
