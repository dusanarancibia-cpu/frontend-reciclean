// Config del panel modular. Los valores viven como GLOBAL en el <head> de dashboard.html
// (window.RECICLEAN_CONFIG). Acá se re-exportan como módulo para imports limpios y para
// NO importar por ruta absoluta un JS de /public (lo prohíbe Vite: import-analysis).
const C = (typeof window !== "undefined" && window.RECICLEAN_CONFIG) || {};

export const SUPABASE_URL = C.SUPABASE_URL;
export const SUPABASE_ANON_KEY = C.SUPABASE_ANON_KEY;
export const EF = C.EF || {};
