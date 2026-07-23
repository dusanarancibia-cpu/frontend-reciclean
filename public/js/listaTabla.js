// HELPER · Tabla con paginación + orden por columnas (clic en el encabezado).
// Reutilizable por las listas de Precios (Recibidos, Propuestas, Revisión, Publicados).
// No conoce el dominio: recibe las filas, cómo renderizar cada una y cómo ordenar cada columna.
//
// Uso:
//   montarTabla({
//     tbody, thead, info, pager,          // elementos del DOM
//     rows,                               // array de datos
//     renderRow: (row) => "<tr>…</tr>",   // HTML de una fila
//     sorters: { colKey: (row) => valor },// valor para ordenar por columna (data-sort)
//     colspan, vacio, pageSize,           // opcionales
//     sortInicial: { key, dir },          // opcional
//     onRender: (filasPagina) => {},      // opcional: re-cablear eventos de fila
//   });
// En el <thead>, marcar los <th> ordenables con data-sort="colKey".

export function montarTabla(cfg) {
  const {
    tbody, thead, info = null, pager = null,
    rows = [], renderRow, sorters = {},
    pageSize = 25, sortInicial = null,
    colspan = 6, vacio = "Sin registros.",
    infoText = null, onRender = null,
  } = cfg;

  let _rows = Array.isArray(rows) ? rows.slice() : [];
  let sortKey = sortInicial?.key || null;
  let sortDir = sortInicial?.dir || "asc";
  let page = 1;

  const cmp = (a, b) => {
    const f = sorters[sortKey];
    if (!f) return 0;
    let va = f(a), vb = f(b);
    if (va == null) va = "";
    if (vb == null) vb = "";
    const na = Number(va), nb = Number(vb);
    const numerico = va !== "" && vb !== "" && !isNaN(na) && !isNaN(nb);
    const r = numerico ? (na - nb) : String(va).localeCompare(String(vb), "es", { numeric: true });
    return sortDir === "asc" ? r : -r;
  };

  function pintarFlechas() {
    if (!thead) return;
    thead.querySelectorAll("[data-sort]").forEach((th) => {
      th.style.cursor = "pointer";
      const base = th.textContent.replace(/\s*[▲▼]\s*$/, "").trim();
      th.textContent = base + (th.dataset.sort === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");
    });
  }

  function pintarPager(total, pages) {
    if (!pager) return;
    if (pages <= 1) { pager.innerHTML = ""; return; }
    pager.innerHTML =
      `<div style="display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:10px;font-size:13px;color:#57534e">
        <button data-pg="prev" class="lt-pg" ${page <= 1 ? "disabled" : ""} style="border:1px solid #d6d3d1;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer${page <= 1 ? ";opacity:.5" : ""}">« Anterior</button>
        <span>Página ${page} de ${pages}</span>
        <button data-pg="next" class="lt-pg" ${page >= pages ? "disabled" : ""} style="border:1px solid #d6d3d1;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer${page >= pages ? ";opacity:.5" : ""}">Siguiente »</button>
      </div>`;
    pager.querySelectorAll(".lt-pg").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.pg === "prev" && page > 1) page--;
      else if (b.dataset.pg === "next" && page < pages) page++;
      render();
    }));
  }

  function render() {
    if (sortKey && sorters[sortKey]) _rows.sort(cmp);
    const total = _rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page > pages) page = pages;
    const slice = _rows.slice((page - 1) * pageSize, page * pageSize);
    tbody.innerHTML = slice.length
      ? slice.map(renderRow).join("")
      : `<tr><td colspan="${colspan}" class="px-4 py-8 text-center text-stone-400">${vacio}</td></tr>`;
    pintarFlechas();
    pintarPager(total, pages);
    if (info) {
      info.textContent = infoText
        ? infoText(total, page, pages)
        : (total ? `${total} registro(s) · página ${page} de ${pages}.` : vacio);
    }
    if (onRender) onRender(slice);
  }

  if (thead) {
    thead.querySelectorAll("[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (sortKey === k) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortKey = k; sortDir = "asc"; }
        page = 1;
        render();
      });
    });
  }

  render();
  return {
    setRows(r) { _rows = Array.isArray(r) ? r.slice() : []; page = 1; render(); },
    render,
  };
}

// HELPER · Selección múltiple con "seleccionar todos" en el encabezado.
//
// Pensado para usarse junto a montarTabla: se llama sincronizar() desde su `onRender`,
// porque cada repintado destruye los <input> anteriores y hay que volver a cablearlos.
//
// DECISIONES QUE IMPORTAN:
//  · La selección vive en un Set de ids, no en el DOM. Así SOBREVIVE al cambio de página,
//    al reordenar y al filtrar; si dependiera de los checkboxes, cambiar de página
//    "perdería" lo marcado sin avisar.
//  · El maestro actúa solo sobre las filas VISIBLES de la página actual. Marcar en
//    silencio 1.000 registros que el usuario no tiene a la vista es una trampa.
//  · Los checkboxes deshabilitados se ignoran siempre (filas no accionables).
//  · El maestro queda en estado indeterminado (guion) cuando hay selección parcial.
//
// IMPORTANTE: el <th> que contiene el checkbox maestro NO debe llevar `data-sort`.
// pintarFlechas() reescribe el textContent de los <th> ordenables y borraría el input.
//
// Uso:
//   const seleccion = conectarSeleccion({
//     tbody: document.getElementById("hisBody"),
//     master: document.getElementById("hisTodos"),
//     clase: "hisChk",                 // clase de los checkbox de fila
//     onCambio: (n) => pintarBarra(n), // opcional: reaccionar al total marcado
//   });
//   // en renderRow: <input type="checkbox" class="hisChk" data-id="123">
//   // en onRender:  seleccion.sincronizar()
export function conectarSeleccion({ tbody, master = null, clase, onCambio = null }) {
  const marcados = new Set();

  const deFila = () => Array.from(tbody.querySelectorAll("." + clase));
  const accionables = () => deFila().filter((c) => !c.disabled);
  const avisar = () => { if (onCambio) onCambio(marcados.size); };

  // El maestro refleja el estado de lo visible: todo / nada / parcial.
  function pintarMaestro() {
    if (!master) return;
    const items = accionables();
    const n = items.filter((c) => c.checked).length;
    master.disabled = items.length === 0;
    master.checked = items.length > 0 && n === items.length;
    master.indeterminate = n > 0 && n < items.length;
  }

  // Se llama tras cada repintado de la tabla: restaura los marcados y recablea eventos.
  function sincronizar() {
    deFila().forEach((chk) => {
      const id = chk.dataset.id;
      if (!chk.disabled) chk.checked = marcados.has(id);
      chk.onchange = () => {
        if (chk.checked) marcados.add(id); else marcados.delete(id);
        pintarMaestro();
        avisar();
      };
    });
    pintarMaestro();
    avisar();
  }

  if (master) {
    master.onchange = () => {
      accionables().forEach((chk) => {
        chk.checked = master.checked;
        if (master.checked) marcados.add(chk.dataset.id); else marcados.delete(chk.dataset.id);
      });
      master.indeterminate = false;
      avisar();
    };
  }

  return {
    sincronizar,
    // Los ids salen como string (vienen de data-id). `numericos()` los devuelve como
    // número, que es lo que esperan los RPC cuando la clave es bigint.
    seleccionados: () => [...marcados],
    numericos: () => [...marcados].map(Number).filter(Number.isFinite),
    total: () => marcados.size,
    limpiar() {
      marcados.clear();
      deFila().forEach((c) => { c.checked = false; });
      pintarMaestro();
      avisar();
    },
  };
}
