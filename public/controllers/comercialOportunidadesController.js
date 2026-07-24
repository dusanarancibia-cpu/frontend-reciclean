import {
  addOpportunityComment,
  addOpportunityFiles,
  createContractFromOpportunity,
  handoffOpportunityToAgenda,
  listClients,
  listOpportunities,
  moveOpportunity,
  saveOpportunity,
  takeOpportunity,
} from "../models/comercialStore.js";

const ETAPAS = ["Lead", "Calificado", "Cotizado", "Negociando", "Ganado", "Perdido", "En pausa"];
const $ = (id) => document.getElementById(id);
let selectedId = null;
let dragId = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function toggleSelectedState(row) {
  const workspace = $("comercialOpWorkspace");
  const rail = $("comercialOpRail");
  const empty = $("comercialOpEmptyState");
  const panel = $("comercialOpSelectedPanel");
  const sideSummary = $("comercialOpSideSummary");
  const hasSelection = Boolean(row);

  workspace?.classList.toggle("rail-open", hasSelection);
  rail?.classList.toggle("com-rail-hidden", !hasSelection);
  empty?.classList.toggle("hidden", hasSelection);
  panel?.classList.toggle("hidden", !hasSelection);
  sideSummary?.classList.toggle("hidden", !hasSelection);
}

function money(value) {
  return `$ ${(Number(value || 0) / 1000000).toFixed(1)} MM`;
}

function chipTone(row) {
  if (row.etapa === "Ganado") return "ok";
  if (row.prioridad === "Alta" || row.etapa === "Negociando") return "warn";
  return "soft";
}

function stageSlug(stage) {
  return stage.toLowerCase().replace(/\s+/g, "-");
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function dueTone(row) {
  const due = parseDateOnly(row.vencimiento);
  if (!due) return "soft";
  const today = startOfDay();
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "danger";
  if (diff <= 3) return "warn";
  return "soft";
}

function getFilters() {
  return {
    search: ($("comercialOpSearch")?.value || "").trim().toLowerCase(),
    owner: $("comercialOpOwner")?.value || "todos",
    stage: $("comercialOpStageFilter")?.value || "todas",
    datePreset: $("comercialOpDatePreset")?.value || "todas",
    dateFrom: $("comercialOpDateFrom")?.value || "",
    dateTo: $("comercialOpDateTo")?.value || "",
  };
}

function matchesDateFilter(row, filters) {
  const due = parseDateOnly(row.vencimiento);
  if (!due) return filters.datePreset === "todas" && !filters.dateFrom && !filters.dateTo;
  const today = startOfDay();

  if (filters.datePreset === "hoy" && due.getTime() !== today.getTime()) return false;
  if (filters.datePreset === "7d") {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 7);
    if (due < today || due > limit) return false;
  }
  if (filters.datePreset === "30d") {
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);
    if (due < today || due > limit) return false;
  }
  if (filters.datePreset === "vencidas" && due >= today) return false;

  const from = parseDateOnly(filters.dateFrom);
  const to = parseDateOnly(filters.dateTo);
  if (from && due < from) return false;
  if (to && due > to) return false;
  return true;
}

function getRows() {
  const filters = getFilters();
  return listOpportunities().filter((row) => {
    const textOk = !filters.search || [row.titulo, row.material, row.descripcion, row.siguiente, row.ejecutivo].join(" ").toLowerCase().includes(filters.search);
    const ownerOk = filters.owner === "todos" || row.ejecutivo === filters.owner;
    const stageOk = filters.stage === "todas" || row.etapa === filters.stage;
    const dateOk = matchesDateFilter(row, filters);
    return textOk && ownerOk && stageOk && dateOk;
  });
}

function ensureDrawer() {
  let drawer = document.getElementById("comOppDrawer");
  if (drawer) return drawer;
  drawer = document.createElement("aside");
  drawer.id = "comOppDrawer";
  drawer.className = "com-drawer hidden";
  drawer.innerHTML = `
    <div class="com-drawer-panel">
      <div class="flex items-center justify-between gap-3">
        <h3 id="comOppDrawerTitle" class="text-xl font-bold text-stone-900">Caso</h3>
        <button id="comOppDrawerClose" class="text-stone-500 hover:text-stone-800 text-xl">×</button>
      </div>
      <div id="comOppDrawerBody" class="mt-5 space-y-5"></div>
    </div>`;
  document.body.appendChild(drawer);
  drawer.addEventListener("click", (event) => { if (event.target === drawer) drawer.classList.add("hidden"); });
  document.getElementById("comOppDrawerClose").addEventListener("click", () => drawer.classList.add("hidden"));
  return drawer;
}

function openOppDrawer(id) {
  const row = listOpportunities().find((item) => item.id === id);
  if (!row) return;
  selectedId = row.id;
  sessionStorage.setItem("comercial:selectedOpportunityId", row.id);
  const drawer = ensureDrawer();
  setText("comOppDrawerTitle", row.titulo);
  $("comOppDrawerBody").innerHTML = `
    <div class="grid gap-3 md:grid-cols-2">
      <label class="com-field"><span class="com-label">Titulo</span><input id="comOppEditTitulo" class="com-input" value="${esc(row.titulo)}" /></label>
      <label class="com-field"><span class="com-label">Etapa</span><select id="comOppEditEtapa" class="com-select">${ETAPAS.map((stage) => `<option value="${stage}"${row.etapa === stage ? " selected" : ""}>${stage}</option>`).join("")}</select></label>
      <label class="com-field"><span class="com-label">Ejecutivo</span><input id="comOppEditEjecutivo" class="com-input" value="${esc(row.ejecutivo)}" /></label>
      <label class="com-field"><span class="com-label">Vencimiento</span><input id="comOppEditVencimiento" type="date" class="com-input" value="${esc(row.vencimiento)}" /></label>
      <label class="com-field"><span class="com-label">Monto</span><input id="comOppEditMonto" type="number" class="com-input" value="${row.monto}" /></label>
      <label class="com-field"><span class="com-label">Probabilidad</span><input id="comOppEditProb" type="number" min="0" max="100" class="com-input" value="${row.probabilidad}" /></label>
      <label class="com-field md:col-span-2"><span class="com-label">Descripcion</span><textarea id="comOppEditDescripcion" rows="3" class="com-textarea">${esc(row.descripcion)}</textarea></label>
      <label class="com-field md:col-span-2"><span class="com-label">Siguiente accion</span><textarea id="comOppEditSiguiente" rows="2" class="com-textarea">${esc(row.siguiente)}</textarea></label>
    </div>
    <div class="grid gap-3 sm:grid-cols-4">
      <button id="comOppTakeCase" class="com-action-btn">Tomar caso</button>
      <button id="comOppSaveCase" class="com-action-btn">Guardar cambios</button>
      <button id="comOppViewClient" class="com-action-btn">Ver cliente</button>
      <button id="comOppMoveCase" class="com-action-btn">Mover etapa</button>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="com-panel">
        <div class="com-label">Comentarios</div>
        <div class="mt-3 space-y-3">${row.comentarios.length ? row.comentarios.map((item) => `<div class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"><div class="text-xs text-stone-500">${esc(item.autor)} · ${esc(item.at.slice(0, 10))}</div><div class="text-sm text-stone-700 mt-1">${esc(item.texto)}</div></div>`).join("") : '<div class="text-sm text-stone-500">Sin comentarios aun.</div>'}</div>
        <textarea id="comOppNewComment" rows="3" class="com-textarea mt-4" placeholder="Agregar comentario operativo"></textarea>
        <button id="comOppAddComment" class="com-action-btn mt-3">Guardar comentario</button>
      </div>
      <div class="com-panel">
        <div class="com-label">Archivos y seguimiento</div>
        <div class="mt-3 space-y-2">${row.archivos.length ? row.archivos.map((item) => `<div class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">${esc(item.nombre)} <span class="text-xs text-stone-500">(${esc(item.size)})</span></div>`).join("") : '<div class="text-sm text-stone-500">Sin archivos aun.</div>'}</div>
        <input id="comOppFiles" type="file" class="mt-4 block w-full text-sm text-stone-600" multiple />
        <button id="comOppAddFiles" class="com-action-btn mt-3">Adjuntar</button>
        <div class="mt-5 space-y-2">${row.seguimiento.map((item) => `<div class="text-sm text-stone-700"><span class="text-xs text-stone-500">${esc(item.at.slice(0, 10))}</span> · ${esc(item.evento)}</div>`).join("")}</div>
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-3">
      <button id="comOppHandoffAgenda" class="com-action-btn">Handoff a Agenda</button>
      <button id="comOppCrearContrato" class="com-action-btn">Crear contrato activo</button>
      <button id="comOppDiferir" class="com-action-btn muted">Enviar a En pausa</button>
    </div>`;

  $("comOppTakeCase").onclick = () => { takeOpportunity(row.id); openOppDrawer(row.id); render(); };
  $("comOppSaveCase").onclick = () => {
    saveOpportunity({
      ...row,
      titulo: $("comOppEditTitulo").value.trim(),
      etapa: $("comOppEditEtapa").value,
      ejecutivo: $("comOppEditEjecutivo").value.trim(),
      vencimiento: $("comOppEditVencimiento").value,
      monto: Number($("comOppEditMonto").value || 0),
      probabilidad: Number($("comOppEditProb").value || 0),
      descripcion: $("comOppEditDescripcion").value.trim(),
      siguiente: $("comOppEditSiguiente").value.trim(),
    });
    openOppDrawer(row.id);
    render();
  };
  $("comOppMoveCase").onclick = () => {
    moveOpportunity(row.id, $("comOppEditEtapa").value, "drawer manual");
    openOppDrawer(row.id);
    render();
  };
  $("comOppViewClient").onclick = () => {
    sessionStorage.setItem("comercial:selectedClientId", row.clientId);
    drawer.classList.add("hidden");
    location.hash = "#comercial-clientes";
  };
  $("comOppAddComment").onclick = () => {
    addOpportunityComment(row.id, $("comOppNewComment").value);
    openOppDrawer(row.id);
    render();
  };
  $("comOppAddFiles").onclick = () => {
    addOpportunityFiles(row.id, Array.from($("comOppFiles").files || []));
    openOppDrawer(row.id);
    render();
  };
  $("comOppHandoffAgenda").onclick = () => {
    const service = handoffOpportunityToAgenda(row.id);
    if (service) {
      sessionStorage.setItem("comercial:highlightServiceId", service.id);
      drawer.classList.add("hidden");
      location.hash = "#comercial-agenda";
    }
  };
  $("comOppCrearContrato").onclick = () => {
    const contract = createContractFromOpportunity(row.id);
    if (contract) {
      sessionStorage.setItem("comercial:selectedContractId", contract.id);
      drawer.classList.add("hidden");
      location.hash = "#comercial-contratos";
    }
  };
  $("comOppDiferir").onclick = () => {
    moveOpportunity(row.id, "En pausa", "diferir agenda");
    openOppDrawer(row.id);
    render();
  };

  drawer.classList.remove("hidden");
}

function openCreateModal() {
  const title = prompt("Titulo de la oportunidad");
  if (!title) return;
  saveOpportunity({
    clientId: sessionStorage.getItem("comercial:selectedClientId") || "cli-001",
    titulo: title,
    etapa: "Lead",
    material: "Por definir",
    ejecutivo: "Andrea",
    sucursal: "Santiago",
    prioridad: "Media",
    probabilidad: 20,
    monto: 0,
    vencimiento: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
    descripcion: "Oportunidad creada desde el repo nuevo.",
    siguiente: "Completar lectura del caso.",
    owner: "",
    comentarios: [],
    archivos: [],
    seguimiento: [{ id: `seg-${Date.now()}`, at: new Date().toISOString(), evento: "Oportunidad creada." }],
    checklist: ["Completar cliente", "Definir material", "Definir siguiente paso"],
  });
  render();
}

function renderBoard(rows) {
  const mount = $("comercialOpBoard");
  if (!mount) return;
  mount.innerHTML = ETAPAS.map((stage) => {
    const stageRows = rows.filter((row) => row.etapa === stage);
    const slug = stageSlug(stage);
    return `
      <div class="com-kanban-col com-kanban-col--${slug}" data-drop-stage="${stage}">
        <div class="com-kanban-col-head flex items-center justify-between gap-3">
          <div class="font-semibold text-stone-800">${esc(stage)}</div>
          <span class="com-chip ${stage === "Ganado" ? "ok" : stage === "Negociando" ? "warn" : "soft"}">${stageRows.length}</span>
        </div>
        <div class="com-kanban-stack mt-4 space-y-3">
          ${stageRows.length ? stageRows.map((row) => `
            <article class="com-op-card com-op-card--${slug} ${row.id === selectedId ? "active" : ""}" draggable="true" data-op-id="${row.id}">
              <div class="flex items-start justify-between gap-3">
                <div class="text-[13px] font-semibold leading-5 text-stone-900">${esc(row.titulo)}</div>
                <span class="com-chip ${chipTone(row)}">${esc(row.prioridad)}</span>
              </div>
              <div class="mt-1.5 text-[11px] text-stone-500">${esc(row.ejecutivo)} · ${esc(row.sucursal)}</div>
              <div class="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-stone-600">
                <div>Valor: <span class="font-semibold text-stone-800">${money(row.monto)}</span></div>
                <div>Prob.: <span class="font-semibold text-stone-800">${row.probabilidad}%</span></div>
                <div>Vence: <span class="font-semibold text-stone-800">${esc(row.vencimiento)}</span></div>
                <div>Owner: <span class="font-semibold text-stone-800">${esc(row.owner || "Libre")}</span></div>
              </div>
              <div class="mt-2.5 text-[11px] leading-4 text-stone-600">${esc(row.siguiente)}</div>
              <div class="mt-2.5 flex flex-wrap gap-1.5 text-[10px] text-stone-500">
                <span class="com-chip soft">${row.comentarios.length} comentario(s)</span>
                <span class="com-chip soft">${row.archivos.length} adjunto(s)</span>
                <span class="com-chip soft">${esc(row.material)}</span>
              </div>
              <div class="mt-2.5 flex gap-2">
                <button class="com-mini-btn" data-open-drawer="${row.id}">Abrir caso</button>
                <button class="com-mini-btn" data-open-client="${row.clientId}">Ver cliente</button>
              </div>
            </article>`).join("") : '<div class="com-empty">Sin casos en esta etapa.</div>'}
        </div>
      </div>`;
  }).join("");

  mount.querySelectorAll("[data-op-id]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedId = card.dataset.opId;
      sessionStorage.setItem("comercial:selectedOpportunityId", selectedId);
      renderSelected(rows.find((item) => item.id === selectedId));
      renderBoard(rows);
    });
    card.addEventListener("dragstart", () => { dragId = card.dataset.opId; });
  });
  mount.querySelectorAll("[data-drop-stage]").forEach((col) => {
    col.addEventListener("dragover", (event) => event.preventDefault());
    col.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!dragId) return;
      moveOpportunity(dragId, col.dataset.dropStage, "drag&drop kanban");
      selectedId = dragId;
      dragId = null;
      render();
    });
  });
  mount.querySelectorAll("[data-open-drawer]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openOppDrawer(button.dataset.openDrawer);
  }));
  mount.querySelectorAll("[data-open-client]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    sessionStorage.setItem("comercial:selectedClientId", button.dataset.openClient);
    location.hash = "#comercial-clientes";
  }));
}

function renderSelected(row) {
  toggleSelectedState(row);
  if (!row) {
    setText("comercialOportunidadTitulo", "—");
    setText("comercialOportunidadCliente", "—");
    setText("comercialOportunidadEtapa", "—");
    setText("comercialOportunidadProbabilidad", "—");
    setText("comercialOportunidadMonto", "—");
    setText("comercialOportunidadVencimiento", "—");
    setText("comercialOportunidadMaterial", "—");
    setText("comercialOportunidadPrioridad", "—");
    setText("comercialOportunidadSucursal", "—");
    setText("comercialOportunidadEjecutivo", "—");
    setText("comercialOportunidadResumen", "—");
    setText("comercialOportunidadSiguiente", "—");
    setText("comercialOportunidadCommentCount", "0 comentario(s)");
    setText("comercialOportunidadFileCount", "0 adjunto(s)");
    if ($("comercialOportunidadFlags")) $("comercialOportunidadFlags").innerHTML = "";
    if ($("comercialOportunidadChecklist")) $("comercialOportunidadChecklist").innerHTML = "";
    if ($("comercialOportunidadComentarios")) $("comercialOportunidadComentarios").innerHTML = "";
    if ($("comercialOportunidadArchivos")) $("comercialOportunidadArchivos").innerHTML = "";
    if ($("comercialOportunidadSeguimiento")) $("comercialOportunidadSeguimiento").innerHTML = "";
    if ($("comercialOportunidadMoveStage")) $("comercialOportunidadMoveStage").value = "Lead";
    return;
  }
  const clientName = listClients().find((item) => item.id === row.clientId)?.nombre || row.clientId;
  setText("comercialOportunidadTitulo", row.titulo);
  setText("comercialOportunidadCliente", clientName);
  setText("comercialOportunidadEtapa", row.etapa);
  setText("comercialOportunidadProbabilidad", `${row.probabilidad}%`);
  setText("comercialOportunidadMonto", money(row.monto));
  setText("comercialOportunidadVencimiento", row.vencimiento);
  setText("comercialOportunidadMaterial", row.material);
  setText("comercialOportunidadPrioridad", row.prioridad);
  setText("comercialOportunidadSucursal", row.sucursal);
  setText("comercialOportunidadEjecutivo", row.ejecutivo);
  setText("comercialOportunidadResumen", row.descripcion);
  setText("comercialOportunidadSiguiente", row.siguiente);
  setText("comercialOportunidadCommentCount", `${row.comentarios.length} comentario(s)`);
  setText("comercialOportunidadFileCount", `${row.archivos.length} adjunto(s)`);
  if ($("comercialOportunidadMoveStage")) $("comercialOportunidadMoveStage").value = row.etapa;
  $("comercialOportunidadFlags").innerHTML = [
    `<span class="com-chip ${row.owner ? "ok" : "warn"}">Owner: ${esc(row.owner || "Libre")}</span>`,
    `<span class="com-chip ${dueTone(row)}">Vence: ${esc(row.vencimiento)}</span>`,
    `<span class="com-chip soft">${row.comentarios.length} comentario(s)</span>`,
    `<span class="com-chip soft">${row.archivos.length} adjunto(s)</span>`,
    `<span class="com-chip soft">${esc(row.material)}</span>`,
    `<span class="com-chip ${row.etapa === "Ganado" ? "ok" : "soft"}">${esc(row.etapa)}</span>`,
  ].join("");
  $("comercialOportunidadChecklist").innerHTML = row.checklist.map((item) => `<label class="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700"><input type="checkbox" class="mt-0.5 accent-emerald-700"><span>${esc(item)}</span></label>`).join("");
  $("comercialOportunidadComentarios").innerHTML = row.comentarios.length
    ? row.comentarios.map((item) => `<div class="com-op-note"><div class="text-xs font-semibold text-stone-500">${esc(item.autor)} · ${formatDate(item.at)}</div><div class="mt-1 text-sm leading-5 text-stone-700">${esc(item.texto)}</div></div>`).join("")
    : '<div class="com-empty">Sin comentarios todavia.</div>';
  $("comercialOportunidadArchivos").innerHTML = row.archivos.length
    ? row.archivos.map((item) => `<div class="com-op-file"><div><div class="text-sm font-semibold text-stone-800">${esc(item.nombre)}</div><div class="text-xs text-stone-500">${esc(item.size)} · ${formatDate(item.at)}</div></div><span class="com-chip soft">Adjunto</span></div>`).join("")
    : '<div class="com-empty">Sin adjuntos cargados.</div>';
  $("comercialOportunidadSeguimiento").innerHTML = row.seguimiento.length
    ? row.seguimiento.map((item) => `<div class="com-timeline-item"><span class="com-timeline-dot"></span><div><div class="text-xs font-semibold text-stone-500">${formatDate(item.at)}</div><div class="text-sm text-stone-700">${esc(item.evento)}</div></div></div>`).join("")
    : '<div class="com-empty">Sin movimientos registrados.</div>';
  const takeBtn = $("comercialOpTakeBtn");
  if (takeBtn) takeBtn.textContent = row.owner ? `Tomado por ${row.owner}` : "Tomar este caso";
  const agendaBtn = document.querySelector('[data-goto="comercial-agenda"]');
  const contractBtn = document.querySelector('[data-goto="comercial-contratos"]');
  if (agendaBtn) agendaBtn.textContent = row.etapa === "Ganado" ? "Bajar a Agenda" : "Preparar handoff";
  if (contractBtn) contractBtn.textContent = row.etapa === "Ganado" ? "Crear contrato activo" : "Preparar contrato";
}

function getSelectedRow() {
  return selectedId ? listOpportunities().find((item) => item.id === selectedId) || null : null;
}

function openSelectedClient() {
  const row = getSelectedRow();
  if (!row) return;
  sessionStorage.setItem("comercial:selectedClientId", row.clientId);
  location.hash = "#comercial-clientes";
}

function handleSelectedStageMove(stage = null, motivo = "movimiento desde ficha") {
  const row = getSelectedRow();
  if (!row) return;
  moveOpportunity(row.id, stage || $("comercialOportunidadMoveStage")?.value || row.etapa, motivo);
  render();
}

function handleSelectedComment() {
  const row = getSelectedRow();
  const input = $("comercialOportunidadNuevoComentario");
  if (!row || !input?.value.trim()) return;
  addOpportunityComment(row.id, input.value);
  input.value = "";
  render();
}

function handleSelectedFiles() {
  const row = getSelectedRow();
  const input = $("comercialOportunidadFiles");
  if (!row || !input?.files?.length) return;
  addOpportunityFiles(row.id, Array.from(input.files));
  input.value = "";
  render();
}

function bindSelectedPanelActions() {
  $("comercialOpTakeBtn")?.addEventListener("click", () => {
    const row = getSelectedRow();
    if (!row) return;
    takeOpportunity(row.id);
    render();
  });
  $("comercialOpViewClientBtn")?.addEventListener("click", openSelectedClient);
  $("comercialOpOpenDrawerBtn")?.addEventListener("click", () => selectedId && openOppDrawer(selectedId));
  $("comercialOpPauseBtn")?.addEventListener("click", () => handleSelectedStageMove("En pausa", "pausa manual desde ficha"));
  $("comercialOpMoveBtn")?.addEventListener("click", () => handleSelectedStageMove());
  $("comercialOpAddCommentBtn")?.addEventListener("click", handleSelectedComment);
  $("comercialOpAddFilesBtn")?.addEventListener("click", handleSelectedFiles);
  $("comercialOpMarkWonBtn")?.addEventListener("click", () => handleSelectedStageMove("Ganado", "cierre manual desde ficha"));
}

function renderSummary(rows) {
  const totalValue = rows.filter((row) => !["Ganado", "Perdido"].includes(row.etapa)).reduce((acc, row) => acc + row.monto, 0);
  const urgentes = rows.filter((row) => new Date(row.vencimiento).getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 3).length;
  const ganables = rows.filter((row) => ["Negociando", "Calificado", "Ganado"].includes(row.etapa)).length;
  const first = rows.slice().sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0];
  setText("comercialOpTotal", rows.length);
  setText("comercialOpValor", money(totalValue));
  setText("comercialOpUrgentes", urgentes);
  setText("comercialOpGanables", ganables);
  setText("comercialOpPrimero", first ? `${first.titulo} · ${first.vencimiento}` : "Sin urgencias");
  setText("comercialOpMiniTotal", `${rows.length} casos`);
  setText("comercialOpMiniUrgentes", `${urgentes} urgentes`);
  $("comercialOpUrgencyList").innerHTML = rows.filter((row) => new Date(row.vencimiento).getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 5).map((row) => `<div><span class="font-semibold text-stone-900">${esc(row.titulo)}</span><div class="text-xs text-stone-500 mt-1">${esc(row.vencimiento)} · ${esc(row.siguiente)}</div></div>`).join("") || '<div class="text-sm text-stone-500">Sin urgencias visibles.</div>';
  $("comercialOpBlockers").innerHTML = rows.map((row) => `<div><span class="font-semibold text-stone-900">${esc(row.titulo)}</span><div class="text-xs text-stone-500 mt-1">${esc(row.descripcion)}</div></div>`).join("");
  $("comercialOpSalidas").innerHTML = rows.filter((row) => ["Ganado", "Negociando", "Calificado"].includes(row.etapa)).map((row) => `<div><span class="font-semibold text-stone-900">${esc(row.titulo)}</span><div class="text-xs text-stone-500 mt-1">${esc(row.siguiente)}</div></div>`).join("");
}

function bind() {
  ["comercialOpSearch", "comercialOpOwner", "comercialOpStageFilter", "comercialOpDatePreset", "comercialOpDateFrom", "comercialOpDateTo"].forEach((id) => {
    $(id)?.addEventListener(id === "comercialOpSearch" ? "input" : "change", render);
  });
  $("comercialOpReset")?.addEventListener("click", () => {
    $("comercialOpSearch").value = "";
    $("comercialOpOwner").value = "todos";
    $("comercialOpStageFilter").value = "todas";
    $("comercialOpDatePreset").value = "todas";
    $("comercialOpDateFrom").value = "";
    $("comercialOpDateTo").value = "";
    render();
  });
  $("comercialOpNuevoBtn")?.addEventListener("click", openCreateModal);
  $("comercialOportunidadCliente")?.addEventListener("click", openSelectedClient);
  $("comercialOportunidadEtapa")?.addEventListener("click", () => selectedId && openOppDrawer(selectedId));
  $("comercialOportunidadSiguiente")?.addEventListener("click", () => selectedId && openOppDrawer(selectedId));
  document.querySelector('[data-goto="comercial-agenda"]')?.addEventListener("click", () => {
    if (selectedId) {
      const service = handoffOpportunityToAgenda(selectedId);
      if (service) sessionStorage.setItem("comercial:highlightServiceId", service.id);
    }
  });
  document.querySelector('[data-goto="comercial-contratos"]')?.addEventListener("click", () => {
    if (selectedId) {
      const contract = createContractFromOpportunity(selectedId);
      if (contract) sessionStorage.setItem("comercial:selectedContractId", contract.id);
    }
  });
  bindSelectedPanelActions();
  window.addEventListener("comercial:store-updated", render);
}

function render() {
  const rows = getRows();
  if (selectedId && !rows.find((item) => item.id === selectedId)) {
    selectedId = null;
    sessionStorage.removeItem("comercial:selectedOpportunityId");
  }
  renderSummary(rows);
  renderBoard(rows);
  renderSelected(selectedId ? rows.find((item) => item.id === selectedId) : null);
}

export function mountComercialOportunidades() {
  selectedId = null;
  sessionStorage.removeItem("comercial:selectedOpportunityId");
  bind();
  render();
}
