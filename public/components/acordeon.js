// COMPONENTE · Acordeón por categoría. Sin librerías.
//
// Reemplaza a la "tabla plana inmensa": las filas se agrupan en secciones colapsables
// (una por categoría). Cada sección tiene su propia tabla con scroll horizontal, así se
// mantiene amigable en tablet/celular en las plantas.
//
// No conoce el dominio: recibe los grupos ya armados, cómo pintar cada fila y las columnas
// de la cabecera. La lógica de negocio (qué categoría, qué orden) vive en el controlador.
//
//   const acc = montarAcordeon({
//     contenedor: document.getElementById("catAcc"),
//     grupos: [{ id:"cobres", titulo:"Cobres", filas:[...] }, ...],   // ya ordenados
//     columnas: [{ th:"Material" }, { th:"Precios", align:"center" }],
//     renderRow: (fila) => `<tr>…</tr>`,
//     onRender: (filasVisibles) => { /* re-cablear eventos de fila */ },
//     resumenExtra: (grupo) => `<span>…</span>`,   // opcional: HTML en la cabecera (toggles)
//     abrir: "primero",                             // "todos" | "primero" | "ninguno" | Set(ids)
//   });
//   acc.abrirTodos(); acc.cerrarTodos(); acc.setGrupos(nuevos);
//
// El área `resumenExtra` NO propaga el clic al encabezado: sus controles (checkbox de
// categoría, etc.) no abren ni cierran la sección.

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
    abrir = "todos",
  } = cfg;
  ensureCss();

  let grupos = cfg.grupos || [];
  // Estado de apertura por id de grupo: sobrevive a los re-render (setGrupos).
  const abiertos = new Set();
  function estadoInicial() {
    if (abrir instanceof Set) { abrir.forEach((id) => abiertos.add(id)); return; }
    if (abrir === "todos") grupos.forEach((g) => abiertos.add(g.id));
    else if (abrir === "primero" && grupos[0]) abiertos.add(grupos[0].id);
    // "ninguno" → no se abre nada
  }
  estadoInicial();

  const alinear = (a) => (a === "right" ? "text-align:right" : a === "center" ? "text-align:center" : "text-align:left");
  const theadHTML = `<thead><tr>${
    columnas.map((c) => `<th style="${alinear(c.align)}">${c.th ?? ""}</th>`).join("")
  }</tr></thead>`;

  function grupoHTML(g) {
    const abierta = abiertos.has(g.id);
    const cuerpo = (g.filas && g.filas.length)
      ? `<table>${theadHTML}<tbody>${g.filas.map(renderRow).join("")}</tbody></table>`
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

    // Toggle abrir/cerrar. Los clics dentro del área "extra" (toggles de categoría) NO
    // deben plegar la sección: se ignoran acá y el propio control los maneja.
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

    if (onRender) onRender(grupos.flatMap((g) => g.filas || []));
  }

  render();

  return {
    render,
    setGrupos(nuevos) {
      grupos = nuevos || [];
      // Grupos nuevos que no existían: se abren si la política era "todos".
      if (abrir === "todos") grupos.forEach((g) => abiertos.add(g.id));
      render();
    },
    abrirTodos() { grupos.forEach((g) => abiertos.add(g.id)); render(); },
    cerrarTodos() { abiertos.clear(); render(); },
  };
}

// Helper de dominio compartido: agrupa filas por categoría respetando el orden de categoría
// (categoria_orden) y, dentro, el orden en que llegan. Devuelve [{id,titulo,orden,filas}].
// `campoId`/`campoNombre`/`campoOrden` permiten adaptarlo a cualquier vista.
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
