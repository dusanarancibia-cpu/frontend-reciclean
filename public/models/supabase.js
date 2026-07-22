// MODELO · Cliente Supabase compartido del panel modular.
// Reutiliza las mismas constantes que la calculadora aislada (una sola fuente de verdad).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

let _sb = null;

// Cliente único (window.supabase viene del CDN cargado en dashboard.html)
export function getClient() {
  if (!_sb) _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// Sesión Auth compartida por mismo dominio (heredada del login del panel)
export async function getSession() {
  const { data } = await getClient().auth.getSession();
  return data?.session || null;
}

// Mapas id→nombre de materiales y sucursales (los ids son text; las tablas/vistas
// de precios no traen nombres). Se usa para "hidratar" las filas en las vistas.
export async function loadNombres() {
  const sb = getClient();
  const [m, s] = await Promise.all([
    sb.schema("curated").from("materiales").select("material_id, nombre").limit(2000),
    sb.schema("curated").from("sucursales").select("sucursal_id, nombre").limit(200),
  ]);
  const mat = new Map((m.data || []).map((r) => [String(r.material_id), r.nombre]));
  const suc = new Map((s.data || []).map((r) => [String(r.sucursal_id), r.nombre]));
  return {
    material: (id) => mat.get(String(id)) || id || "—",
    sucursal: (id) => suc.get(String(id)) || id || "—",
  };
}

// Espera a que el SDK de Supabase esté disponible (CDN con defer)
export function waitSupabase() {
  return new Promise((resolve) => {
    (function poll() {
      if (window.supabase && window.supabase.createClient) resolve();
      else setTimeout(poll, 50);
    })();
  });
}
