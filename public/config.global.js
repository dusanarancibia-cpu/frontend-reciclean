// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURACIÓN CENTRAL DE SUPABASE · ÚNICA FUENTE DE VERDAD DEL PANEL
//
//  >>> PARA APUNTAR A UN NUEVO PROYECTO SUPABASE, EDITA SOLO ESTE ARCHIVO <<<
//
//  Cambia SUPABASE_URL y SUPABASE_ANON_KEY por los del proyecto nuevo y listo: todo el
//  panel (index.html, login.html y reset.html cargan este archivo → shared/js/config.js →
//  shared/js/supabase.js) queda apuntando a la base nueva de inmediato.
//
//  Es un <script> CLÁSICO (no módulo): se carga en el <head> de cada página ANTES del
//  resto y define window.RECICLEAN_CONFIG. Por eso los valores viven aquí y no duplicados
//  en cada HTML.
//
//  SEGURIDAD: la anon/public key es PÚBLICA por diseño (viaja al navegador). Es correcto que
//  esté aquí. NUNCA pongas en este archivo la service_role key (esa vive solo en el servidor
//  / Edge Functions).
// ─────────────────────────────────────────────────────────────────────────────
window.RECICLEAN_CONFIG = {
  // 1) URL del proyecto  ·  Supabase → Project Settings → API → Project URL
  SUPABASE_URL: "https://eknmtsrtfkzroxnovfqn.supabase.co",

  // 2) Anon / public key ·  Supabase → Project Settings → API → Project API keys → anon public
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbm10c3J0Zmt6cm94bm92ZnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDY2ODgsImV4cCI6MjA5MDk4MjY4OH0.8Y4N0lw3DFN3Y8-R6ID7t_LAfgHWDM5N-oa4Ji9bncg",

  // Rutas de Edge Functions (relativas al proyecto; normalmente NO cambian al migrar).
  EF: {
    precioAplicar: "/functions/v1/precio-aplicar",
    precioCommand: "/functions/v1/precio-command",
    diegoChatProcess: "/functions/v1/diego-chat-process",
  },
};
