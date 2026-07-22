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
