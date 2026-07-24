// MODELO · Cliente Supabase compartido del panel modular.
// Reutiliza las mismas constantes que la calculadora aislada (una sola fuente de verdad).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let _sb = null;

// El login deja en localStorage la preferencia de "recordar sesión". El panel DEBE
// construir su cliente con el mismo storage: si el login guardó el token en
// sessionStorage y el panel lo buscara en localStorage, no encontraría la sesión,
// rebotaría al login, el login sí la vería y volvería a entrar → bucle infinito.
function storageDeSesion() {
  try {
    return localStorage.getItem("reci:recordar") === "0" ? sessionStorage : localStorage;
  } catch {
    return localStorage;
  }
}

// Cliente único (window.supabase viene del CDN cargado en index.html)
export function getClient() {
  if (!_sb) {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storage: storageDeSesion() },
    });
  }
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
