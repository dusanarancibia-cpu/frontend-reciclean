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

// ── Buscador global por cualquier campo ──────────────────────────────────────
// Una sola implementación para todas las listas (Pendientes, Historial, Publicados,
// Materiales) en vez de repetir el patrón en cada controlador.
// Compara sin acentos ni mayúsculas y acepta varias palabras: "cobre maipu" exige AMBAS.

export function normalizarTexto(s) {
  return String(s ?? "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // saca los acentos
    .replace(/\s+/g, " ").trim();
}

// Concatena los valores de la fila. `campos` limita qué columnas mirar; si se omite,
// se miran todas las de tipo simple (los objetos anidados se ignoran a propósito).
function textoDeFila(fila, campos) {
  const claves = campos || Object.keys(fila);
  return normalizarTexto(claves.map((k) => {
    const v = fila[k];
    return v == null || typeof v === "object" ? "" : v;
  }).join(" "));
}

export function filtroGlobal(filas, texto, campos = null) {
  const q = normalizarTexto(texto);
  if (!q) return filas;
  const palabras = q.split(" ");
  return filas.filter((f) => {
    const heno = textoDeFila(f, campos);
    return palabras.every((p) => heno.includes(p));
  });
}

// ── Exportar a CSV (abrible en Excel) ────────────────────────────────────────
// Descarga `filas` como CSV. `columnas` define qué exportar y en qué orden:
//   [{ clave, titulo, map? }]   → map(valor, fila) opcional para formatear.
// Detalles que importan para que Excel Chile lo abra bien:
//  · Separador ';' (Excel en configuración regional CL usa ';', no ',').
//  · BOM UTF-8 al inicio para que respete acentos y la ñ.
//  · Cada campo entre comillas, con las comillas internas duplicadas (RFC 4180).
// El nombre recibe la fecha para no pisar descargas anteriores.
function celdaCSV(v) {
  if (v == null) return '""';
  return '"' + String(v).replace(/"/g, '""') + '"';
}

// ── Paginación (escalabilidad) ───────────────────────────────────────────────
// A miles de filas, ni la red ni el navegador deben tragarse todo de una vez. Dos piezas:
//
//  1) rangoSupabase(pagina, tam) → { desde, hasta } para .range() de supabase-js, que en
//     PostgREST se traduce a LIMIT/OFFSET en el servidor. Solo viaja la página pedida:
//        const { desde, hasta } = rangoSupabase(pagina, 50);
//        const { data, count } = await getClient()
//          .from("historial_panel").select("*", { count: "exact" })
//          .order("created_at", { ascending:false }).range(desde, hasta);
//     `count:'exact'` devuelve el total (para pintar "página X de Y") en el mismo viaje.
//
//  2) paginarLocal(filas, pagina, tam) → corta en memoria una lista ya cargada (útil cuando
//     el conjunto es acotado —cientos— y se filtra/ordena en el cliente). Devuelve la página
//     y metadatos listos para pintar controles.
//
// La página es 1-indexada (la primera es 1). `tam` es el tamaño de página (por defecto 50).

export function rangoSupabase(pagina = 1, tam = 50) {
  const p = Math.max(1, Math.floor(pagina));
  const t = Math.max(1, Math.floor(tam));
  const desde = (p - 1) * t;
  return { desde, hasta: desde + t - 1 };
}

// Cantidad total de páginas dado un total de filas.
export function totalPaginas(total, tam = 50) {
  return Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, tam)));
}

export function paginarLocal(filas, pagina = 1, tam = 50) {
  const lista = Array.isArray(filas) ? filas : [];
  const t = Math.max(1, Math.floor(tam));
  const paginas = totalPaginas(lista.length, t);
  const p = Math.min(Math.max(1, Math.floor(pagina)), paginas); // acota a rango válido
  const desde = (p - 1) * t;
  return {
    filas: lista.slice(desde, desde + t),
    pagina: p, tam: t, total: lista.length, paginas,
    hayAnterior: p > 1, haySiguiente: p < paginas,
    desde: lista.length ? desde + 1 : 0, hasta: Math.min(desde + t, lista.length),
  };
}

export function descargarCSV(nombreBase, filas, columnas) {
  const cols = columnas && columnas.length
    ? columnas
    : Object.keys(filas[0] || {}).map((k) => ({ clave: k, titulo: k }));
  const sep = ";";
  const cabecera = cols.map((c) => celdaCSV(c.titulo ?? c.clave)).join(sep);
  const cuerpo = (filas || []).map((fila) =>
    cols.map((c) => {
      const bruto = fila[c.clave];
      const val = typeof c.map === "function" ? c.map(bruto, fila) : bruto;
      return celdaCSV(val);
    }).join(sep),
  );
  const texto = "﻿" + [cabecera, ...cuerpo].join("\r\n"); // ﻿ = BOM
  const hoy = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8;" }));
  a.download = `${nombreBase}_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  return filas.length;
}
