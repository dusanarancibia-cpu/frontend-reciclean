// MODELO · Acceso a datos (Supabase) de la Calculadora.
// El CLIENTE es único y COMPARTIDO con el panel (public/models/supabase.js): así hay una
// sola instancia y una sola sesión Auth en toda la app (antes cada uno hacía su createClient).
// En v2 la Calculadora siempre va embebida, por eso puede reusar el cliente del panel.
import { SUPABASE_URL, SUPABASE_ANON_KEY, EF, DB } from "../config.js";
import { getClient } from "../../../models/supabase.js";

const sb = getClient; // getClient() devuelve el singleton compartido (lazy, tras waitSupabase)
const t = (o) => sb().schema(o.schema).from(o.rel);

export async function getSession() {
  const { data } = await sb().auth.getSession();
  return data?.session || null;
}

// Caso capturado por Diego: v_bandeja_precios trae nombres + precio_vigente ya resuelto
export async function loadCaso(id) {
  const { data, error } = await t(DB.bandeja).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Fallback de precio vigente si la vista de bandeja no lo trajo
export async function loadVigente(materialId, sucursalId) {
  const { data } = await t(DB.vigente)
    .select("precio_venta_clp, vigencia_desde")
    .eq("material_id", materialId).eq("sucursal_id", sucursalId)
    .order("vigencia_desde", { ascending: false }).limit(1);
  return data && data.length ? data[0] : null;
}

export async function loadMateriales() {
  const { data, error } = await t(DB.materiales)
    .select("material_id, nombre, categoria").eq("activo", true).order("nombre").limit(500);
  if (error) throw error;
  return data || [];
}

export async function loadSucursales() {
  const { data, error } = await t(DB.sucursales)
    .select("sucursal_id, nombre").eq("activa", true).order("nombre").limit(50);
  if (error) throw error;
  return data || [];
}

// Metas de margen por categoría → normalizadas a {categoria, descripcion, min, meta}
export async function loadMetas() {
  const { data, error } = await t(DB.metas)
    .select("categoria_id, descripcion, margen_minimo_pct, margen_meta_pct").order("categoria_id");
  if (error) throw error;
  return (data || []).map((c) => ({
    categoria: c.categoria_id, descripcion: c.descripcion,
    min: c.margen_minimo_pct, meta: c.margen_meta_pct,
  }));
}

// Set de material_id con propuesta pendiente de cliente real (para el filtro "en análisis")
export async function loadEnAnalisis() {
  const { data, error } = await t(DB.propuestos)
    .select("material_id").eq("estado", "pendiente").eq("fuente_rol", "referencia");
  if (error) throw error;
  return new Set((data || []).map((r) => r.material_id));
}

// Guardar Borrador · UPDATE de la misma propuesta (no toca 'estado')
export async function guardarBorrador(id, patch) {
  const { error } = await t(DB.propuestos).update(patch).eq("id", id);
  if (error) throw error;
}

// Crear Borrador · INSERT de una propuesta NUEVA (viene de Publicados → Editar,
// sin proposalId todavía). No toca 'estado' (default 'pendiente'). Devuelve { id }.
export async function crearBorrador(payload) {
  const { data, error } = await t(DB.propuestos).insert(payload).select("id").single();
  if (error) throw error;
  return data;
}

// Aprobar y Publicar · EF autoritativa (requiere token real de Supabase Auth).
// precioCompraTransitorio: costo para materiales sin precio de compra vigente
// (caso independiente). La EF lo ignora si ya hay costo vigente.
export async function aprobar(propuestaId, precioAjustado, accessToken, precioCompraTransitorio = null) {
  const resp = await fetch(SUPABASE_URL + EF.precioAplicar, {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      propuesta_id: propuestaId,
      precio_ajustado: precioAjustado > 0 ? precioAjustado : null,
      precio_compra_transitorio: precioCompraTransitorio > 0 ? precioCompraTransitorio : null,
    }),
  });
  const raw = await resp.text();
  let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
  return { ok: resp.ok, status: resp.status, json };
}
