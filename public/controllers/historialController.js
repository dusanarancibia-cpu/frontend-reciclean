// CONTROLADOR · Historial. Reemplaza la antigua sección "Recibidos".
// Muestra todo el flujo procesado en cualquier estado, en solo lectura.
//
// A diferencia de Pendientes (lista acotada, filtra en memoria), aquí el buscador filtra
// EN EL SERVIDOR contra la columna indexada `busqueda` (GIN de trigramas): el historial
// puede tener decenas de miles de filas y no tiene sentido traérselas al navegador.
import { listarBorradores } from "../models/flujoRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML, horaChile } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

const ETIQUETA = {
  crudo:      { txt: "Cargado",    css: "bg-stone-100 text-stone-700" },
  pendiente:  { txt: "Pendiente",  css: "bg-amber-100 text-amber-800" },
  publicado:  { txt: "Publicado",  css: "bg-emerald-100 text-emerald-800" },
  descartado: { txt: "Descartado", css: "bg-rose-100 text-rose-700" },
};

let _tabla = null;
let _debounce = null;

export async function mountHistorial() {
  const body = $("hisBody");
  body.innerHTML = fila(7, "Cargando…");

  try {
    const filas = await consultar();
    _tabla = montarTabla({
      tbody: body, thead: $("hisHead"), info: $("hisInfo"), pager: $("hisPager"),
      rows: filas, renderRow, colspan: 7, pageSize: 50,
      vacio: "Sin movimientos que coincidan.",
      sortInicial: { key: "creado", dir: "desc" },
      sorters: {
        estado:    (r) => r.estado || "",
        material:  (r) => r.material || "",
        sucursal:  (r) => r.sucursal || "",
        recibido:  (r) => Number(r.precio_recibido_clp ?? 0),
        publicado: (r) => Number(r.precio_publicado_clp ?? 0),
        origen:    (r) => r.origen || "",
        creado:    (r) => r.created_at || "",
      },
      infoText: (t, p, pg) => `${t} movimiento(s) · página ${p} de ${pg}.`,
    });
    cablearFiltros();
    resumen(filas.length);
  } catch (e) {
    body.innerHTML = fila(7, "❌ No pude cargar el historial: " + esc(e.message));
  }
}

function consultar() {
  const texto = $("hisBuscar")?.value || "";
  const estado = $("hisEstado")?.value || "";
  return listarBorradores({
    estados: estado ? [estado] : null,
    texto,
    limite: 1000,
  });
}

function renderRow(r) {
  const e = ETIQUETA[r.estado] || { txt: r.estado, css: "bg-stone-100 text-stone-700" };
  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5"><span class="${e.css}" style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${e.txt}</span></td>
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal || "—")}</td>
    <td class="px-4 py-2.5 text-right text-stone-700">${clp(r.precio_recibido_clp)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_publicado_clp)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${esc(r.origen)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${horaChile(r.created_at)}<br>${esc(r.creado_por || "—")}</td>
  </tr>`;
}

function cablearFiltros() {
  const recargar = async () => {
    try {
      const filas = await consultar();
      _tabla.setRows(filas);
      resumen(filas.length);
    } catch (e) {
      resumen(0, e.message);
    }
  };
  // Se espera a que el usuario deje de escribir: una consulta por tecla saturaría la API.
  $("hisBuscar")?.addEventListener("input", () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(recargar, 300);
  });
  $("hisEstado")?.addEventListener("change", recargar);
}

function resumen(n, error = null) {
  const el = $("hisResumen");
  if (el) el.textContent = error ? "⚠️ " + error : `${n} resultado(s)`;
}
