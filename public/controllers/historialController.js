// CONTROLADOR · Historial. Reemplaza a la antigua sección "Recibidos".
// Muestra todo el flujo procesado en cualquier estado.
//
// El buscador filtra EN EL SERVIDOR contra la columna indexada `busqueda` (GIN de
// trigramas): el historial puede tener decenas de miles de filas y no tiene sentido
// traérselas al navegador.
//
// Además absorbió el DESCARTE EN LOTE que vivía en la desaparecida sección "Pendientes".
// Solo se puede descartar lo que aún no se resolvió (crudo o pendiente): lo publicado ya
// generó un precio vigente y lo descartado ya está descartado.
import { listarBorradores, descartar } from "../models/flujoRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, horaChile } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const COLS = 8;
const fila = (txt) => `<tr><td colspan="${COLS}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

const ETIQUETA = {
  crudo:      { txt: "Cargado",    css: "bg-stone-100 text-stone-700" },
  pendiente:  { txt: "Pendiente",  css: "bg-amber-100 text-amber-800" },
  publicado:  { txt: "Publicado",  css: "bg-emerald-100 text-emerald-800" },
  descartado: { txt: "Descartado", css: "bg-rose-100 text-rose-700" },
};

// Estados sobre los que el descarte tiene sentido.
const DESCARTABLE = new Set(["crudo", "pendiente"]);

let _tabla = null;
let _debounce = null;
let _sel = new Set();     // ids marcados; sobrevive al cambio de página
let _rol = "lector";

export async function mountHistorial() {
  const body = $("hisBody");
  body.innerHTML = fila("Cargando…");

  try {
    const filas = await consultar();
    _rol = filas[0]?.mi_rol || "lector";
    _sel.clear();

    _tabla = montarTabla({
      tbody: body, thead: $("hisHead"), info: $("hisInfo"), pager: $("hisPager"),
      rows: filas, renderRow, colspan: COLS, pageSize: 50,
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
      onRender: cablearChecks,
    });
    cablearFiltros();
    cablearLote();
    resumen(filas.length);
  } catch (e) {
    body.innerHTML = fila("❌ No pude cargar el historial: " + esc(e.message));
  }
}

function consultar() {
  const texto = $("hisBuscar")?.value || "";
  const estado = $("hisEstado")?.value || "";
  return listarBorradores({ estados: estado ? [estado] : null, texto, limite: 1000 });
}

function renderRow(r) {
  const e = ETIQUETA[r.estado] || { txt: r.estado, css: "bg-stone-100 text-stone-700" };
  const puede = _rol !== "lector" && DESCARTABLE.has(r.estado);
  const chk = `<input type="checkbox" class="hisChk" data-id="${r.id}"
      ${_sel.has(r.id) ? "checked" : ""} ${puede ? "" : "disabled"}
      title="${puede ? "Seleccionar para descartar" : "Solo se descarta lo cargado o pendiente"}"
      style="cursor:${puede ? "pointer" : "not-allowed"}">`;
  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5">${chk}</td>
    <td class="px-4 py-2.5"><span class="${e.css}" style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${e.txt}</span></td>
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material || r.material_texto || "—")}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal || "—")}</td>
    <td class="px-4 py-2.5 text-right text-stone-700">${clp(r.precio_recibido_clp)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_publicado_clp)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${esc(r.origen)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${horaChile(r.created_at)}<br>${esc(r.creado_por || "—")}</td>
  </tr>`;
}

// ── Selección en lote ─────────────────────────────────────────────────────────
function cablearChecks() {
  document.querySelectorAll("#hisBody .hisChk").forEach((chk) => {
    if (chk.disabled) return;
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      if (chk.checked) _sel.add(id); else _sel.delete(id);
      pintarLote();
    });
  });
  // "Seleccionar todo" actúa solo sobre lo visible en la página actual, que es lo que el
  // usuario tiene a la vista; marcar en silencio 1.000 filas sería una trampa.
  const todos = $("hisTodos");
  if (todos) {
    todos.checked = false;
    todos.onchange = () => {
      document.querySelectorAll("#hisBody .hisChk").forEach((c) => {
        if (c.disabled) return;
        c.checked = todos.checked;
        const id = Number(c.dataset.id);
        if (todos.checked) _sel.add(id); else _sel.delete(id);
      });
      pintarLote();
    };
  }
  pintarLote();
}

function pintarLote() {
  const caja = $("hisLote");
  if (!caja) return;
  if (!_sel.size) { caja.classList.add("hidden"); return; }
  caja.classList.remove("hidden");
  $("hisLoteMsg").textContent = `${_sel.size} seleccionado(s)`;
}

function cablearLote() {
  $("hisLimpiar")?.addEventListener("click", () => {
    _sel.clear();
    document.querySelectorAll("#hisBody .hisChk").forEach((c) => { c.checked = false; });
    const t = $("hisTodos"); if (t) t.checked = false;
    pintarLote();
  });

  $("hisDescartar")?.addEventListener("click", () => {
    if (!_sel.size) return;
    const ids = [..._sel];
    abrirModal({
      titulo: "Descartar en lote",
      cuerpoHTML:
        `<p>¿Descartar <b>${ids.length}</b> registro(s)?</p>
         <p style="font-size:13px;color:#78716c;margin-top:8px">
           No se borran: quedan en el Historial marcados como descartados.</p>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Descartar", primario: true, onClick: async () => {
            try {
              await descartar(ids, "Descartado en lote desde Historial");
              _sel.clear();
              const filas = await consultar();
              _tabla.setRows(filas);
              resumen(filas.length);
              pintarLote();
            } catch (e) {
              abrirModal({ titulo: "No se pudo descartar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
            }
          } },
      ],
    });
  });
}

// ── Filtros ───────────────────────────────────────────────────────────────────
function cablearFiltros() {
  const recargar = async () => {
    try {
      const filas = await consultar();
      _sel.clear();               // cambió el conjunto: la selección anterior ya no aplica
      _tabla.setRows(filas);
      resumen(filas.length);
      pintarLote();
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
