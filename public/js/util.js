// UTILIDADES · Helpers compartidos, sin dependencias.

// escapeHTML — escapa los 5 caracteres peligrosos al interpolar texto NO confiable
// (respuestas del LLM/EF, nombres de material y de archivo del usuario, etc.) dentro
// de innerHTML. Cubre además contextos de ATRIBUTO gracias a " y ':
//   <a data-x="${escapeHTML(v)}">   ·   <div>${escapeHTML(v)}</div>
// El & se reemplaza PRIMERO para no doble-escapar las entidades que siguen.
// Nota: para asignaciones a textContent NO hace falta escapar (el DOM ya lo hace);
// usar este helper ahí mostraría las entidades literalmente.
const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

// ── Hora de Chile continental (America/Santiago) ─────────────────────────────
// Siempre en horario chileno, sin depender de la zona del equipo. Formatea a
// "22 Jul 2026, 14:30". Los timestamps de la BD son timestamptz (UTC) → se convierten.
const MESES_CL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const _fmtCL = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

export function horaChile(iso) {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = _fmtCL.formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  return `${g("day")} ${MESES_CL[parseInt(g("month"), 10) - 1]} ${g("year")}, ${g("hour")}:${g("minute")}`;
}

// Fecha+hora ACTUAL en Chile. Se recalcula en cada llamada, así refleja cualquier
// cambio de hora del equipo pero siempre expresado en horario chileno.
export function ahoraChile() { return horaChile(new Date()); }

// Reloj en vivo: actualiza cada 30 s el texto de todos los elementos que coincidan con
// `selector` (por defecto los que tengan la clase .reloj-chile). Un solo intervalo para
// header y footer. Devuelve el id del intervalo por si hay que detenerlo.
export function iniciarRelojChile(selector = ".reloj-chile") {
  const tick = () => document.querySelectorAll(selector).forEach((el) => { el.textContent = ahoraChile(); });
  tick();
  return setInterval(tick, 30000);
}
