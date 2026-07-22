// Configuración de la Calculadora aislada.
// FUENTE ÚNICA DE VERDAD: window.RECICLEAN_CONFIG (definido en el <head> de index.html).
// Antes acá se hardcodeaban URL/anon/EF, lo que causaba "drift": el EF de este archivo
// omitía precioCommand y podía divergir del global. Ahora se CONSUME el global (igual que
// public/js/config.js). En v2 la Calculadora SIEMPRE va embebida en el panel, así que el
// global existe; igual dejamos fallbacks defensivos para no romper si faltara.
const C = (typeof window !== "undefined" && window.RECICLEAN_CONFIG) || {};
if (!C.SUPABASE_URL) {
  console.error("[calculadora] Falta window.RECICLEAN_CONFIG — ¿se cargó dentro de index.html?");
}

// Repo público: la anon key NO es secreto. No se hardcodea acá para evitar duplicación.
export const SUPABASE_URL = C.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = C.SUPABASE_ANON_KEY || "";

// Endpoints de Edge Functions: heredados COMPLETOS del global (incluye precioCommand).
export const EF = C.EF || {};

// Objetos de BD (schema/relación). Son mapeos propios de la Calculadora, no credenciales,
// así que viven acá (no en el global). Un solo lugar para cambiarlos.
export const DB = {
  bandeja: { schema: "staging", rel: "v_bandeja_precios" },
  propuestos: { schema: "staging", rel: "precios_propuestos" },
  vigente: { schema: "curated", rel: "vw_materiales_sucursal_precios_vigente" },
  materiales: { schema: "curated", rel: "materiales" },
  sucursales: { schema: "curated", rel: "sucursales" },
  metas: { schema: "curated", rel: "margen_metas" },
};

// Valores por defecto de los sliders cuando el caso no trae metadata
export const DEFAULTS = { mg_pct: 30, flete: 0, spread_pct: 20, volumen_kg: 500, iva_pct: 0 };
