// Config del panel modular. Los VALORES viven en un solo lugar: /public/config.global.js
// (define window.RECICLEAN_CONFIG, cargado en el <head> de index/login/reset). Acá solo se
// re-exportan como módulo para imports limpios. Para migrar de proyecto Supabase, edita
// ese archivo — NO este.
const C = (typeof window !== "undefined" && window.RECICLEAN_CONFIG) || {};

export const SUPABASE_URL = C.SUPABASE_URL;
export const SUPABASE_ANON_KEY = C.SUPABASE_ANON_KEY;
export const EF = C.EF || {};
