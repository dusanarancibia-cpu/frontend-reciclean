// COMPONENTE · Acordeón por categoría. Sin librerías.
//
// Reemplaza a la "tabla plana inmensa": las filas se agrupan en secciones colapsables
// (una por categoría). Cada sección tiene su propia tabla con scroll horizontal.
//
// DOS GARANTÍAS DE UX (críticas):
//  1. El estado abierto/cerrado de cada sección SOBREVIVE a los re-render (setGrupos):
//     vive en un Set y la política de apertura inicial ("todos"/"primero") solo se aplica
//     a secciones nuevas que nunca se han visto. Así, marcar una casilla o guardar un
//     precio NO vuelve a expandir todo ni pierde la posición del usuario.
//  2. Ordenamiento por columnas dentro de las sub-listas: al hacer clic en un <th>
//     marcado con `sort`, se cicla asc → desc → orden original, aplicándose a TODAS las
//     categorías a la vez (orden global coherente). Requiere pasar `sorters`.
//
//   const acc = montarAcordeon({
//     contenedor, grupos, renderRow,
//     columnas: [{ th:"Material", sort:"material" }, { th:"Precio", align:"right", sort:"precio" }],
//     sorters:  { material:(r)=>r.material, precio:(r)=>Number(r.precio ?? -1) },
//     onRender, resumenExtra, abrir: "primero",
//   });
//   acc.setGrupos(nuevos); acc.abrirTodos(); acc.cerrarTodos();

let _cssMontado = false;
const CSS = `
.rc-acc{display:flex;flex-direction:column;gap:10px}
.rc-acc-grupo{background:#fff;border:1px solid #d6d3d1;border-radius:12px;overflow:hidden}
.rc-acc-head{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fafaf9;
  border:0;cursor:pointer;text-align:left;font:inherit;color:#1c1917}
.rc-acc-head:hover{background:#f5f5f4}
.rc-acc-caret{transition:transform .15s ease;color:#78716c;font-size:12px;flex:none;width:14px;text-align:center}
.rc-acc-grupo.abierto .rc-acc-caret{transform:rotate(90deg)}
.rc-acc-titulo{font-weight:700;font-size:15px}
.rc-acc-count{background:#e7e5e4;color:#57534e;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:700}
.rc-acc-extra{margin-left:auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end}
.rc-acc-body{display:none;border-top:1px solid #ececeb;overflow-x:auto}
.rc-acc-grupo.abierto .rc-acc-body{display:block}
.rc-acc table{width:100%;font-size:14px;border-collapse:collapse;min-width:520px}
.rc-acc thead{background:#f8fafc;color:#78716c;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.rc-acc thead th{padding:8px 14px;font-weight:600;white-space:nowrap}
.rc-acc thead th.rc-sortable:hover{color:#1c1917}
.rc-acc tbody tr{border-top:1px solid #f5f5f4}
.rc-acc-vacio{padding:16px;text-align:center;color:#a8a29e;font-size:13px}
`;

function ensureCss() {
  if (_cssMontado) return;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
  _cssMontado = true;
}

export function montarAcordeon(cfg) {
  const {
    contenedor, columnas = [], renderRow,
    onRender = null, resumenExtra = null, vacio = "Sin registros.",
    abrir = "todos", sorters = {},
  } = cfg;
  ensureCss();

  let grupos = cfg.grupos || [];
  const abiertos = new Set();     // ids de secciones abiertas (fuente de verdad)
  const conocidos = new Set();    // ids ya vistos: la política inicial no se re-aplica
  let sortKey = cfg.sortInicial?.key || null;
  let sortDir = cfg.sortInicial?.dir || null;   // "asc" | "desc" | null(=original)

  // La política de apertura solo decide para secciones NUEVAS. Las conocidas conservan
  // el estado que el usuario les dejó (abierto o cerrado).
  function politicaInicial(g) {
    conocidos.add(g.id);
    if (abrir instanceof Set) { if (abrir.has(g.id)) abiertos.add(g.id); }
    else if (abrir === "todos") abiertos.add(g.id);
    else if (abrir === "primero" && grupos[0] && g.id === grupos[0].id) abiertos.add(g.id);
  }
  const registrar = () => grupos.forEach((g) => { if (!conocidos.has(g.id)) politicaInicial(g); });
  registrar();

  const alinear = (a) => (a === "right" ? "text-align:right" : a === "center" ? "text-align:center" : "text-align:left");

  // Comparador para el orden por columna. Numérico si ambos lados lo son; si no, localeCompare.
  function cmp(a, b) {
    const f = sorters[sortKey];
    if (!f) return 0;
    let va = f(a), vb = f(b);
    if (va == null) va = "";
    if (vb == null) vb = "";
    const na = Number(va), nb = Number(vb);
    const numerico = va !== "" && vb !== "" && !isNaN(na) && !isNaN(nb);
    const r = numerico ? (na - nb) : String(va).localeCompare(String(vb), "es", { numeric: true });
    return sortDir === "asc" ? r : -r;
  }
  const filasOrdenadas = (g) =>
    (sortKey && sortDir && sorters[sortKey]) ? (g.filas || []).slice().sort(cmp) : (g.filas || []);

  function theadHTML() {
    return `<thead><tr>${columnas.map((c) => {
      const sortable = c.sort && sorters[c.sort];
      let suf = "";
      if (sortable) suf = (c.sort === sortKey && sortDir) ? (sortDir === "asc" ? " ▲" : " ▼") : " ↕";
      return `<th class="${sortable ? "rc-sortable" : ""}" style="${alinear(c.align)}${sortable ? ";cursor:pointer;user-select:none" : ""}"${
        sortable ? ` data-sort="${c.sort}"` : ""}>${c.th ?? ""}${suf}</th>`;
    }).join("")}</tr></thead>`;
  }

  function grupoHTML(g) {
    const abierta = abiertos.has(g.id);
    const filas = filasOrdenadas(g);
    const cuerpo = filas.length
      ? `<table>${theadHTML()}<tbody>${filas.map(renderRow).join("")}</tbody></table>`
      : `<div class="rc-acc-vacio">${vacio}</div>`;
    return `<div class="rc-acc-grupo ${abierta ? "abierto" : ""}" data-grupo="${g.id}">
      <button type="button" class="rc-acc-head" aria-expanded="${abierta}">
        <span class="rc-acc-caret">▸</span>
        <span class="rc-acc-titulo">${g.titulo}</span>
        <span class="rc-acc-count">${g.filas ? g.filas.length : 0}</span>
        ${resumenExtra ? `<span class="rc-acc-extra" data-extra="${g.id}">${resumenExtra(g) || ""}</span>` : ""}
      </button>
      <div class="rc-acc-body">${cuerpo}</div>
    </div>`;
  }

  function render() {
    contenedor.classList.add("rc-acc");
    contenedor.innerHTML = grupos.map(grupoHTML).join("") ||
      `<div class="rc-acc-vacio">${vacio}</div>`;

    // Abrir/cerrar sección. Clics dentro de "extra" (toggles de categoría) NO pliegan.
    contenedor.querySelectorAll(".rc-acc-head").forEach((head) => {
      head.addEventListener("click", (e) => {
        if (e.target.closest("[data-extra]")) return;
        const grupo = head.closest(".rc-acc-grupo");
        const id = grupo.dataset.grupo;
        const abierta = grupo.classList.toggle("abierto");
        head.setAttribute("aria-expanded", abierta);
        if (abierta) abiertos.add(id); else abiertos.delete(id);
      });
    });

    // Ordenamiento: clic en un <th> ordenable cicla asc → desc → original (global).
    contenedor.querySelectorAll(".rc-acc thead th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (sortKey !== k) { sortKey = k; sortDir = "asc"; }
        else if (sortDir === "asc") sortDir = "desc";
        else if (sortDir === "desc") { sortDir = null; sortKey = null; }
        else sortDir = "asc";
        render();   // conserva el estado abierto/cerrado (vive en `abiertos`)
      });
    });

    if (onRender) onRender(grupos.flatMap((g) => g.filas || []));
  }

  render();

  return {
    render,
    setGrupos(nuevos) {
      grupos = nuevos || [];
      registrar();          // solo abre las secciones NUEVAS; respeta las ya tocadas
      render();
    },
    abrirTodos() { grupos.forEach((g) => abiertos.add(g.id)); render(); },
    cerrarTodos() { abiertos.clear(); render(); },
  };
}

// Helper de dominio: agrupa filas por categoría respetando categoria_orden.
export function agruparPorCategoria(filas, {
  campoId = "categoria", campoNombre = "categoria_nombre", campoOrden = "categoria_orden",
  sinCategoria = "Sin categoría",
} = {}) {
  const mapa = new Map();
  filas.forEach((f) => {
    const id = f[campoId] || "_sin";
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        titulo: f[campoNombre] || sinCategoria,
        orden: f[campoOrden] ?? 999,
        filas: [],
      });
    }
    mapa.get(id).filas.push(f);
  });
  return [...mapa.values()].sort((a, b) => a.orden - b.orden || String(a.titulo).localeCompare(String(b.titulo), "es"));
}
