// TRASPASO · Buzón de un solo uso para pasar datos entre vistas del panel.
//
// Por qué sessionStorage y no la URL: el router es por hash y sin bundler, así que al
// cambiar de vista se pierde cualquier variable en memoria. Una lista de precios leída
// por OCR puede traer decenas de filas y no cabe en un query string. sessionStorage
// sobrevive al cambio de vista, muere al cerrar la pestaña y no ensucia el enlace.
//
// Se lee UNA sola vez y se borra: si el usuario recarga la página después de haber
// revisado, no reaparecen filas fantasma que creería no haber cargado.

const CLAVE = "reci:traspaso:carga-manual";

export function dejarParaCargaManual(items, origen = "ocr_diego") {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ items, origen, ts: Date.now() }));
    return true;
  } catch {
    return false;   // sessionStorage lleno o bloqueado: no rompe el flujo
  }
}

export function tomarParaCargaManual() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(CLAVE);
    sessionStorage.removeItem(CLAVE);
  } catch { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
