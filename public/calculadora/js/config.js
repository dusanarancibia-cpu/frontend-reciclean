// Configuración global de la Calculadora aislada.
// Repo público: la anon key NO es secreto (mismo valor que usa panel-rdo.html).
export const SUPABASE_URL = "https://eknmtsrtfkzroxnovfqn.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbm10c3J0Zmt6cm94bm92ZnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDY2ODgsImV4cCI6MjA5MDk4MjY4OH0.8Y4N0lw3DFN3Y8-R6ID7t_LAfgHWDM5N-oa4Ji9bncg";

// Endpoints y objetos de BD (un solo lugar para cambiarlos)
export const EF = {
  precioAplicar: "/functions/v1/precio-aplicar",
  diegoChatProcess: "/functions/v1/diego-chat-process",
};
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
