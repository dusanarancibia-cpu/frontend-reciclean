import { cancelService, listRoutes, listServices, saveRoute, saveService } from "./comercialStore.js";

const $ = (id) => document.getElementById(id);
let selectedRouteId = null;
let activeDate = "";
let plannerDate = "";
const SERVICE_TYPES = [
  "Retiro material",
  "Retiro programado",
  "Salida piloto",
  "Visita programada",
  "Instancia contrato",
  "Entrega contenedor",
  "Cambio contenedor",
];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function routeSlug(routeName) {
  return routeName.toLowerCase().replace(/\s+/g, "-");
}

function tone(estado) {
  if (["En ruta", "Lista para salir", "Agendado", "Confirmado"].includes(estado)) return "ok";
  if (["Borrador", "En armado"].includes(estado)) return "soft";
  return "warn";
}

function sortBySchedule(rows) {
  return rows.slice().sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

function suggestBoardDate(rows) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((item) => item.fecha >= today);
  const source = upcoming.length ? upcoming : rows;
  const counts = new Map();
  source.forEach((item) => counts.set(item.fecha, (counts.get(item.fecha) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || today;
}

function ensureDates() {
  const services = listServices();
  const suggested = suggestBoardDate(services);
  if (!activeDate) activeDate = suggested;
  if (!plannerDate) plannerDate = suggested;
}

function currentRoute() {
  return listRoutes().find((item) => item.id === selectedRouteId) || listRoutes()[0] || null;
}

function servicesForDate(date) {
  return sortBySchedule(listServices().filter((item) => item.fecha === date));
}

function servicesForRouteOnDate(routeId, date) {
  return servicesForDate(date).filter((item) => item.routeId === routeId);
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addDaysIso(value, days) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(value) {
  const date = parseIsoDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(value) {
  const date = parseIsoDate(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function shiftMonth(value, delta) {
  const date = parseIsoDate(value);
  const shifted = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const day = Math.min(date.getDate(), new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate());
  return isoDate(new Date(shifted.getFullYear(), shifted.getMonth(), day));
}

function monthLabel(value) {
  return parseIsoDate(value).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

function calendarCells(value) {
  const start = startOfMonth(value);
  const end = endOfMonth(value);
  const startWeekday = (start.getDay() + 6) % 7;
  const cells = [];

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ date: null, outside: true });
  }
  for (let day = 1; day <= end.getDate(); day += 1) {
    cells.push({ date: isoDate(new Date(start.getFullYear(), start.getMonth(), day)), outside: false });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, outside: true });
  }
  return cells;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveShareDate(date) {
  const today = isoDate(new Date());
  return date <= today ? addDaysIso(today, 1) : date;
}

function documentRouteTitle(route, date) {
  return `Ruta ${route.nombre} ${date}`;
}

function documentFileName(route, date) {
  return `${slugify(`ruta-${route.nombre}-${date}`)}.pdf`;
}

function openServiceModal(service = null, route = currentRoute()) {
  let modal = document.getElementById("comAgendaModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "comAgendaModal";
    modal.className = "com-overlay hidden";
    modal.innerHTML = `
      <div class="com-dialog max-w-3xl">
        <div class="flex items-center justify-between gap-3">
          <h3 id="comAgendaModalTitle" class="text-xl font-bold text-stone-900">Servicio</h3>
          <button id="comAgendaModalClose" class="text-stone-500 hover:text-stone-800 text-xl">×</button>
        </div>
        <div class="grid gap-4 mt-5 md:grid-cols-2">
          <label class="com-field"><span class="com-label">Plaza / ruta</span><select id="comAgendaSrvRoute" class="com-select"></select></label>
          <label class="com-field"><span class="com-label">Fecha</span><input id="comAgendaSrvFecha" type="date" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Cliente</span><input id="comAgendaSrvCliente" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Hora</span><input id="comAgendaSrvHora" type="time" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Material</span><input id="comAgendaSrvMaterial" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Estado</span><select id="comAgendaSrvEstado" class="com-select"><option>Agendado</option><option>Borrador</option><option>Lista para salir</option><option>En ruta</option><option>Confirmado</option><option>Cancelado</option></select></label>
          <label class="com-field md:col-span-2"><span class="com-label">Direccion</span><input id="comAgendaSrvDireccion" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Tipo de servicio</span><select id="comAgendaSrvTipo" class="com-select"></select></label>
          <label class="com-field"><span class="com-label">Kilos</span><input id="comAgendaSrvKilos" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Responsable</span><input id="comAgendaSrvResp" class="com-input" /></label>
          <label class="com-field md:col-span-2"><span class="com-label">Destino final / instrucciones</span><textarea id="comAgendaSrvNotas" rows="3" class="com-textarea"></textarea></label>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button id="comAgendaModalCancel" class="com-action-btn">Cancelar</button>
          <button id="comAgendaModalSave" class="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Guardar servicio</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.add("hidden"); });
    $("comAgendaModalClose").addEventListener("click", () => modal.classList.add("hidden"));
    $("comAgendaModalCancel").addEventListener("click", () => modal.classList.add("hidden"));
  }

  const routes = listRoutes();
  $("comAgendaSrvRoute").innerHTML = routes.map((item) => `<option value="${item.id}">${esc(item.nombre)}</option>`).join("");
  $("comAgendaSrvTipo").innerHTML = SERVICE_TYPES.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
  const current = service || {
    id: "",
    routeId: route?.id || routes[0]?.id || "",
    fecha: activeDate || new Date().toISOString().slice(0, 10),
    hora: "09:00",
    cliente: "",
    direccion: "",
    tipo: "Retiro material",
    material: "",
    estado: "Borrador",
    kilos: "Por definir",
    responsable: "Andrea",
    notas: "",
    clientId: "",
  };

  setText("comAgendaModalTitle", service ? `Editar ${service.cliente}` : `Nuevo servicio ${route ? `en ${route.nombre}` : ""}`.trim());
  $("comAgendaSrvRoute").value = current.routeId;
  $("comAgendaSrvFecha").value = current.fecha;
  $("comAgendaSrvCliente").value = current.cliente;
  $("comAgendaSrvHora").value = current.hora;
  $("comAgendaSrvMaterial").value = current.material;
  $("comAgendaSrvEstado").value = current.estado;
  $("comAgendaSrvDireccion").value = current.direccion;
  $("comAgendaSrvTipo").value = current.tipo;
  $("comAgendaSrvKilos").value = current.kilos;
  $("comAgendaSrvResp").value = current.responsable;
  $("comAgendaSrvNotas").value = current.notas;
  $("comAgendaModalSave").onclick = () => {
    saveService({
      ...current,
      routeId: $("comAgendaSrvRoute").value,
      fecha: $("comAgendaSrvFecha").value,
      cliente: $("comAgendaSrvCliente").value.trim(),
      hora: $("comAgendaSrvHora").value,
      material: $("comAgendaSrvMaterial").value.trim(),
      estado: $("comAgendaSrvEstado").value,
      direccion: $("comAgendaSrvDireccion").value.trim(),
      tipo: $("comAgendaSrvTipo").value.trim(),
      kilos: $("comAgendaSrvKilos").value.trim(),
      responsable: $("comAgendaSrvResp").value.trim(),
      notas: $("comAgendaSrvNotas").value.trim(),
    });
    activeDate = $("comAgendaSrvFecha").value || activeDate;
    modal.classList.add("hidden");
    render();
  };
  modal.classList.remove("hidden");
}

function printRoute(route, services, date, options = {}) {
  const w = window.open("", "_blank", "width=1180,height=900");
  if (!w || !route) return;
  const documentDate = options.documentDate || date;
  const title = options.title || documentRouteTitle(route, documentDate);
  const fileName = options.fileName || documentFileName(route, documentDate);
  w.document.write(`
    <html><head><title>${esc(fileName.replace(/\.pdf$/i, ""))}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1c1917}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px;vertical-align:top}
      th{background:#f5f5f4}
      .meta{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:12px}
      .meta div{border:1px solid #ddd;padding:8px;border-radius:8px}
    </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="meta">
        <div><strong>Fecha</strong><br>${esc(documentDate)}</div>
        <div><strong>Ruta</strong><br>${esc(route.nombre)}</div>
        <div><strong>Cobertura</strong><br>${esc(route.base)}</div>
        <div><strong>Chofer</strong><br>${esc(route.chofer)}</div>
        <div><strong>Salida</strong><br>${esc(route.salida)}</div>
      </div>
      <table><thead><tr><th>Proveedor</th><th>Camion</th><th>Reciclaje</th><th>Entrada</th><th>Salida</th><th>Destino final / instrucciones</th></tr></thead>
      <tbody>${services.map((item) => `<tr><td>${esc(item.cliente)}<br><small>${esc(item.direccion)}</small></td><td>${esc(route.vehiculo)}</td><td>${esc(item.material)}</td><td>${esc(item.hora)}</td><td>${esc(route.salida)}</td><td>${esc(item.notas || "Sin instruccion")}</td></tr>`).join("")}</tbody></table>
    </body></html>`);
  w.document.close();
  w.focus();
}

function renderBoardSummary(routes, dailyServices) {
  const readyRoutes = routes.filter((route) => servicesForRouteOnDate(route.id, activeDate).length > 0).length;
  setText("comAgendaBoardSummary", `${readyRoutes}/${routes.length} rutas con hoja cargada`);
  $("comAgendaPlazaStatus").innerHTML = routes.map((route) => {
    const count = servicesForRouteOnDate(route.id, activeDate).length;
    const toneClass = count ? "ok" : "warn";
    return `<span class="com-chip ${toneClass}">${esc(route.nombre)} · ${count} stop(s)</span>`;
  }).join("");
}

function renderRouteBoards(routes) {
  const mount = $("comAgendaRouteBoards");
  if (!mount) return;
  mount.innerHTML = routes.map((route) => {
    const rows = servicesForRouteOnDate(route.id, activeDate);
    return `
      <section class="com-route-board com-route-board--${routeSlug(route.nombre)} ${route.id === selectedRouteId ? "active" : ""}" data-route-select="${route.id}">
        <div class="com-route-board-head">
          <div>
            <div class="text-xl font-bold text-stone-900">${esc(route.nombre)}</div>
            <div class="mt-1 text-sm text-stone-600">${esc(route.base)} · ${esc(route.chofer)} · ${esc(route.vehiculo)}</div>
          </div>
          <span class="com-chip ${tone(route.estado)}">${esc(route.estado)}</span>
        </div>
        <div class="mt-4 grid gap-2 sm:grid-cols-3 text-sm text-stone-700">
          <div><span class="font-semibold">Salida:</span> ${esc(route.salida)}</div>
          <div><span class="font-semibold">Stops:</span> ${rows.length}</div>
          <div><span class="font-semibold">Carga:</span> ${(rows.length * 4.8).toFixed(1)} ton</div>
        </div>
        <div class="mt-4">
          <label class="com-label">Chofer asignado</label>
          <select class="com-select mt-2" data-route-driver="${route.id}">
            ${(route.choferes || [route.chofer]).map((driver) => `<option value="${esc(driver)}" ${driver === route.chofer ? "selected" : ""}>${esc(driver)}</option>`).join("")}
          </select>
        </div>
        <div class="mt-4 space-y-3">
          ${rows.length ? rows.map((item) => `
            <article class="com-route-stop">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-bold text-stone-900">${esc(item.hora)} · ${esc(item.cliente)}</div>
                  <div class="mt-1 text-xs text-stone-500">${esc(item.material)} · ${esc(item.tipo)}</div>
                </div>
                <span class="com-chip ${tone(item.estado)}">${esc(item.estado)}</span>
              </div>
              <div class="mt-3 text-sm text-stone-700">${esc(item.direccion)}</div>
              <div class="mt-3 text-xs text-stone-500">${esc(item.notas || "Sin instruccion final")}</div>
              <div class="mt-3 flex gap-2">
                <button class="com-mini-btn" data-edit-srv="${item.id}">Editar</button>
                <button class="com-mini-btn danger" data-cancel-srv="${item.id}">Cancelar</button>
              </div>
            </article>`).join("") : '<div class="com-empty">Sin stops cargados para esta plaza en la fecha activa.</div>'}
        </div>
        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <button class="com-action-btn" data-add-stop="${route.id}">Agregar stop</button>
          <button class="com-action-btn strong" data-print-route="${route.id}">Preparar hoja</button>
        </div>
      </section>`;
  }).join("");

  mount.querySelectorAll("[data-route-select]").forEach((card) => card.addEventListener("click", (event) => {
    if (event.target.closest("button") || event.target.closest("select")) return;
    selectedRouteId = card.dataset.routeSelect;
    renderSheetPreview(currentRoute());
    renderRouteBoards(routes);
  }));
  mount.querySelectorAll("[data-route-driver]").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => {
      saveRoute({ id: select.dataset.routeDriver, chofer: select.value });
      render();
    });
  });
  mount.querySelectorAll("[data-add-stop]").forEach((button) => button.addEventListener("click", () => {
    const route = routes.find((item) => item.id === button.dataset.addStop);
    openServiceModal(null, route);
  }));
  mount.querySelectorAll("[data-print-route]").forEach((button) => button.addEventListener("click", () => {
    const route = routes.find((item) => item.id === button.dataset.printRoute);
    printRoute(route, servicesForRouteOnDate(route.id, activeDate), activeDate);
  }));
  mount.querySelectorAll("[data-edit-srv]").forEach((button) => button.addEventListener("click", () => {
    const service = listServices().find((item) => item.id === button.dataset.editSrv);
    const route = routes.find((item) => item.id === service?.routeId);
    if (service) openServiceModal(service, route);
  }));
  mount.querySelectorAll("[data-cancel-srv]").forEach((button) => button.addEventListener("click", () => {
    cancelService(button.dataset.cancelSrv);
    render();
  }));
}

function renderPlanner() {
  const allServices = listServices();
  const monthStart = startOfMonth(plannerDate);
  const monthEnd = endOfMonth(plannerDate);
  const monthStartIso = isoDate(monthStart);
  const monthEndIso = isoDate(monthEnd);
  const monthRows = sortBySchedule(allServices.filter((item) => item.fecha >= monthStartIso && item.fecha <= monthEndIso));
  const countsByDate = monthRows.reduce((acc, item) => {
    acc[item.fecha] = (acc[item.fecha] || 0) + 1;
    return acc;
  }, {});
  if (!monthRows.find((item) => item.fecha === plannerDate)) {
    const sameMonthDate = monthRows[0]?.fecha || monthStartIso;
    plannerDate = sameMonthDate;
  }

  setText("comAgendaMonthLabel", monthLabel(plannerDate));
  $("comAgendaPlannerGrid").innerHTML = calendarCells(plannerDate).map((cell) => {
    if (!cell.date) {
      return '<div class="com-agenda-day muted"></div>';
    }
    const count = countsByDate[cell.date] || 0;
    const isSelected = cell.date === plannerDate;
    const isActive = cell.date === activeDate;
    return `
      <button type="button" class="com-agenda-day ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}" data-planner-date="${cell.date}">
        <span class="com-agenda-day-n">${cell.date.slice(-2)}</span>
        <span class="com-agenda-day-k">${count ? `${count} ruta(s)` : "—"}</span>
      </button>`;
  }).join("");

  const plannerRows = sortBySchedule(allServices.filter((item) => item.fecha === plannerDate));
  setText("comAgendaPlannerCount", `${plannerRows.length} ruta(s)`);
  setText("comAgendaPlannerDayTitle", plannerDate);
  $("comAgendaFutureList").innerHTML = plannerRows.length ? plannerRows.map((item) => {
    const route = listRoutes().find((row) => row.id === item.routeId);
    return `
      <article class="com-planner-item">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm font-bold text-stone-900">${esc(item.cliente)}</div>
            <div class="mt-1 text-xs text-stone-500">${esc(item.hora)} · ${esc(route?.nombre || "Sin plaza")} · ${esc(item.material)}</div>
          </div>
          <span class="com-chip ${tone(item.estado)}">${esc(item.estado)}</span>
        </div>
        <div class="mt-3 text-sm text-stone-700">${esc(item.direccion)}</div>
        <div class="mt-3 text-xs text-stone-500">${esc(item.notas || "Sin observacion")}</div>
        <div class="mt-3 flex gap-2">
          <button class="com-mini-btn" data-plan-edit="${item.id}">Editar</button>
          <button class="com-mini-btn" data-plan-focus="${item.routeId}">Abrir plaza</button>
        </div>
      </article>`;
  }).join("") : '<div class="com-empty">No hay rutas cargadas en el dia seleccionado.</div>';

  $("comAgendaPlannerGrid").querySelectorAll("[data-planner-date]").forEach((button) => button.addEventListener("click", () => {
    plannerDate = button.dataset.plannerDate;
    renderPlanner();
  }));
  $("comAgendaFutureList").querySelectorAll("[data-plan-edit]").forEach((button) => button.addEventListener("click", () => {
    const service = listServices().find((item) => item.id === button.dataset.planEdit);
    const route = listRoutes().find((item) => item.id === service?.routeId);
    if (service) openServiceModal(service, route);
  }));
  $("comAgendaFutureList").querySelectorAll("[data-plan-focus]").forEach((button) => button.addEventListener("click", () => {
    selectedRouteId = button.dataset.planFocus;
    activeDate = plannerDate;
    render();
  }));
}

function renderSheetPreview(route) {
  if (!route) return;
  const rows = servicesForRouteOnDate(route.id, activeDate);
  setText("comAgendaSheetTitle", `Hoja ${route.nombre} · ${activeDate}`);
  setText("comAgendaSheetMeta", `${route.base} · ${route.chofer} · ${route.vehiculo} · salida ${route.salida} · ${rows.length} stop(s)`);
  $("comAgendaSheetRows").innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${esc(item.cliente)}<div class="text-xs text-stone-500 mt-1">${esc(item.direccion)}</div></td>
      <td>${esc(route.vehiculo)}</td>
      <td>${esc(item.material)}</td>
      <td>${esc(item.hora)}</td>
      <td>${esc(route.salida)}</td>
      <td>${esc(item.notas || "Sin instruccion final")}</td>
    </tr>`).join("") : '<tr><td colspan="6" class="text-center text-sm text-stone-500 py-6">No hay filas para la hoja seleccionada.</td></tr>';
}

function bind() {
  $("comAgendaNuevoServicioBtn")?.addEventListener("click", () => openServiceModal(null, currentRoute()));
  $("comAgendaPrintSelectedBtn")?.addEventListener("click", () => printRoute(currentRoute(), servicesForRouteOnDate(selectedRouteId, activeDate), activeDate));
  $("comAgendaPreviewPrintBtn")?.addEventListener("click", () => printRoute(currentRoute(), servicesForRouteOnDate(selectedRouteId, activeDate), activeDate));
  $("comAgendaPreviewWhatsappBtn")?.addEventListener("click", () => {
    const route = currentRoute();
    if (!route) return;
    const shareDate = resolveShareDate(activeDate);
    printRoute(route, servicesForRouteOnDate(selectedRouteId, activeDate), activeDate, {
      documentDate: shareDate,
      title: documentRouteTitle(route, shareDate),
      fileName: documentFileName(route, shareDate),
    });
  });
  $("comAgendaActiveDate")?.addEventListener("change", (event) => {
    activeDate = event.target.value;
    render();
  });
  $("comAgendaMonthPrev")?.addEventListener("click", () => {
    plannerDate = shiftMonth(plannerDate, -1);
    renderPlanner();
  });
  $("comAgendaMonthNext")?.addEventListener("click", () => {
    plannerDate = shiftMonth(plannerDate, 1);
    renderPlanner();
  });
  window.addEventListener("comercial:store-updated", render);
}

function render() {
  ensureDates();
  const routes = listRoutes();
  if (!selectedRouteId || !routes.find((item) => item.id === selectedRouteId)) {
    selectedRouteId = routes[0]?.id || null;
  }
  $("comAgendaActiveDate").value = activeDate;
  renderBoardSummary(routes, servicesForDate(activeDate));
  renderRouteBoards(routes);
  renderPlanner();
  renderSheetPreview(currentRoute());
}

export function mountComercialAgenda() {
  bind();
  render();
}
