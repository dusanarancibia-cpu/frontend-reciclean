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
// La vista ya decide qué columnas entrega según el rol: un operador recibe
// precio_compra_clp = null desde la base, no oculto por CSS.
export async function listarPrecios() {
  const { data, error } = await getClient()
    .from("precios_panel")
    .select("id, material_id, material, nombre_publico, sucursal_id, sucursal, " +
            "precio_venta_clp, precio_compra_clp, margen_pct, vigencia_desde, creado_por, updated_at, mi_rol")
    .order("material");
  if (error) throw new Error(error.message);
  return data || [];
}

// Actualiza el precio de venta de un material en una sucursal.
// El RPC cierra la vigencia anterior, inserta la nueva fila y escribe la auditoría
// en una sola transacción; si el usuario no es gerencia responde 42501.
export async function actualizarPrecio({ materialId, sucursalId, venta, compra = null, motivo = null }) {
  const { data, error } = await getClient().rpc("f_actualizar_precio", {
    p_material_id: materialId,
    p_sucursal_id: sucursalId,
    p_precio_venta: venta,
    p_precio_compra: compra,
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
  if (/menor que el costo/i.test(msg)) return msg; // ya viene en lenguaje claro desde el RPC
  if (/mayor que 0/i.test(msg)) return "El precio debe ser mayor que 0.";
  return msg || "No se pudo guardar el cambio.";
}
