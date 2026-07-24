// PERMISOS · Qué rutas puede abrir el usuario actual.
//
// La lista viene de public.mis_permisos, que en Postgres filtra por precios_v3.rol_actual().
// O sea: el navegador no elige su rol, lo lee.
//
// IMPORTANTE — hasta dónde llega esta guardia:
// Bloquear rutas en el frontend es una mejora de experiencia, NO la barrera de seguridad.
// Cualquiera puede editar el JS en su navegador y saltarse este módulo. Lo que hace que eso
// no sirva de nada es que cada vista consulta vistas y RPC que revalidan el rol en la base
// (`precios_v3.rol_actual()`): saltarse la guardia muestra una pantalla vacía o un error,
// nunca datos. Por eso acá se puede fallar "hacia cerrado" sin miedo a romper nada.
import { getClient } from "./supabase.js";

let _rutas = null;   // Set de rutas permitidas; '*' significa acceso total
let _rol = "lector";

export async function cargarPermisos() {
  try {
    const { data, error } = await getClient().from("mis_permisos").select("ruta, rol");
    if (error) throw error;
    _rutas = new Set((data || []).map((r) => r.ruta));
    _rol = data?.[0]?.rol || "lector";
  } catch (e) {
    // Sin permisos legibles se asume el mínimo: solo el inicio. Falla hacia cerrado.
    console.error("[permisos] no pude cargar los permisos:", e.message);
    _rutas = new Set(["inicio"]);
    _rol = "lector";
  }
  return { rol: _rol, rutas: _rutas };
}

export function puede(ruta) {
  if (!_rutas) return false;            // aún no se cargaron: no se abre nada
  return _rutas.has("*") || _rutas.has(ruta);
}

export const rolActual = () => _rol;
export const esGerencia = () => _rol === "gerencia";

// Aviso visual de acceso denegado. Se inyecta en #content antes de redirigir al inicio.
export function htmlAccesoDenegado(ruta) {
  return `<section class="max-w-2xl mx-auto p-6">
    <div class="rounded-lg border border-rose-300 bg-rose-50 text-rose-800 px-5 py-4">
      <div class="font-bold text-lg mb-1">Acceso denegado</div>
      <p class="text-sm">Tu perfil <b>${_rol}</b> no tiene acceso a <b>${ruta}</b>.
      Te llevamos al inicio. Si necesitas entrar, pide a gerencia que ajuste tus permisos.</p>
    </div>
  </section>`;
}
