import {
  finalizeContract,
  generateInstancesFromContract,
  listContracts,
  listServices,
  renewContract,
  saveContract,
} from "../models/comercialStore.js";

const $ = (id) => document.getElementById(id);
let selectedId = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function tone(value) {
  if (value === "Vigente") return "ok";
  if (["Por vencer", "Renegociando"].includes(value)) return "warn";
  return "soft";
}

function openContractModal(contract = null) {
  let modal = document.getElementById("comContratoModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "comContratoModal";
    modal.className = "com-overlay hidden";
    modal.innerHTML = `
      <div class="com-dialog max-w-3xl">
        <div class="flex items-center justify-between gap-3">
          <h3 id="comContratoModalTitle" class="text-xl font-bold text-stone-900">Contrato</h3>
          <button id="comContratoModalClose" class="text-stone-500 hover:text-stone-800 text-xl">×</button>
        </div>
        <div class="grid gap-4 mt-5 md:grid-cols-2">
          <label class="com-field"><span class="com-label">Cliente</span><input id="comCtCliente" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Sucursal</span><input id="comCtSucursal" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Acuerdo</span><input id="comCtAcuerdo" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Frecuencia</span><select id="comCtFrecuencia" class="com-select"><option>Semanal</option><option>Quincenal</option><option>Mensual</option><option>Variable</option></select></label>
          <label class="com-field"><span class="com-label">Material</span><input id="comCtMaterial" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Precio</span><input id="comCtPrecio" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Vigencia desde</span><input id="comCtDesde" type="date" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Vigencia hasta</span><input id="comCtHasta" type="date" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Cumplimiento %</span><input id="comCtCumplimiento" type="number" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Rentabilidad %</span><input id="comCtRentabilidad" type="number" step="0.1" class="com-input" /></label>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button id="comContratoModalCancel" class="com-action-btn">Cancelar</button>
          <button id="comContratoModalSave" class="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Guardar contrato</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.add("hidden"); });
    $("comContratoModalClose").addEventListener("click", () => modal.classList.add("hidden"));
    $("comContratoModalCancel").addEventListener("click", () => modal.classList.add("hidden"));
  }
  const current = contract || {
    id: "",
    clientId: "",
    cliente: "",
    sucursal: "Santiago",
    acuerdo: "Retiro recurrente",
    frecuencia: "Semanal",
    material: "",
    precio: "$ 0/kg",
    vigenciaDesde: new Date().toISOString().slice(0, 10),
    vigenciaHasta: new Date(Date.now() + 86400000 * 180).toISOString().slice(0, 10),
    estado: "Vigente",
    cumplimiento: 0,
    kilos: "0 ton",
    rentabilidad: 0,
    proxima: "Sin instancia",
    ultima: "—",
    alerta: "Completar parametros del contrato",
    historial: [],
  };
  setText("comContratoModalTitle", contract ? `Editar ${contract.cliente}` : "Nuevo contrato");
  $("comCtCliente").value = current.cliente;
  $("comCtSucursal").value = current.sucursal;
  $("comCtAcuerdo").value = current.acuerdo;
  $("comCtFrecuencia").value = current.frecuencia;
  $("comCtMaterial").value = current.material;
  $("comCtPrecio").value = current.precio;
  $("comCtDesde").value = current.vigenciaDesde;
  $("comCtHasta").value = current.vigenciaHasta;
  $("comCtCumplimiento").value = current.cumplimiento;
  $("comCtRentabilidad").value = current.rentabilidad;
  $("comContratoModalSave").onclick = () => {
    const saved = saveContract({
      ...current,
      cliente: $("comCtCliente").value.trim(),
      sucursal: $("comCtSucursal").value.trim(),
      acuerdo: $("comCtAcuerdo").value.trim(),
      frecuencia: $("comCtFrecuencia").value,
      material: $("comCtMaterial").value.trim(),
      precio: $("comCtPrecio").value.trim(),
      vigenciaDesde: $("comCtDesde").value,
      vigenciaHasta: $("comCtHasta").value,
      cumplimiento: Number($("comCtCumplimiento").value || 0),
      rentabilidad: Number($("comCtRentabilidad").value || 0),
    });
    selectedId = saved.id;
    sessionStorage.setItem("comercial:selectedContractId", saved.id);
    modal.classList.add("hidden");
    render();
  };
  modal.classList.remove("hidden");
}

function openInstancesModal(contract) {
  let modal = document.getElementById("comContratoInstanciasModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "comContratoInstanciasModal";
    modal.className = "com-overlay hidden";
    modal.innerHTML = `
      <div class="com-dialog max-w-4xl">
        <div class="flex items-center justify-between gap-3">
          <h3 id="comContratoInstanciasTitle" class="text-xl font-bold text-stone-900">Instancias</h3>
          <button id="comContratoInstanciasClose" class="text-stone-500 hover:text-stone-800 text-xl">×</button>
        </div>
        <div id="comContratoInstanciasBody" class="mt-5 space-y-3"></div>
        <div class="flex justify-end gap-3 mt-6">
          <button id="comContratoGenerarInstancias" class="com-action-btn">Generar 4 instancias</button>
          <button id="comContratoIrAgenda" class="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Ir a Agenda</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.add("hidden"); });
    $("comContratoInstanciasClose").addEventListener("click", () => modal.classList.add("hidden"));
  }
  setText("comContratoInstanciasTitle", `Instancias · ${contract.cliente}`);
  const rows = listServices().filter((item) => item.clientId === contract.clientId && item.notas?.includes(contract.id));
  $("comContratoInstanciasBody").innerHTML = rows.length
    ? rows.map((item) => `<div class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"><div class="font-semibold text-stone-900">${esc(item.fecha)} · ${esc(item.hora)}</div><div class="text-sm text-stone-700 mt-1">${esc(item.cliente)} · ${esc(item.material)} · ${esc(item.estado)}</div></div>`).join("")
    : '<div class="text-sm text-stone-500">Este contrato no tiene instancias precargadas en Agenda.</div>';
  $("comContratoGenerarInstancias").onclick = () => {
    generateInstancesFromContract(contract.id, 4);
    openInstancesModal(contract);
  };
  $("comContratoIrAgenda").onclick = () => {
    sessionStorage.setItem("comercial:selectedContractId", contract.id);
    modal.classList.add("hidden");
    location.hash = "#comercial-agenda";
  };
  modal.classList.remove("hidden");
}

function getFilters() {
  return {
    search: ($("comContratosSearch")?.value || "").trim().toLowerCase(),
    estado: $("comContratosEstadoFilter")?.value || "todos",
    plaza: $("comContratosPlazaFilter")?.value || "todas",
  };
}

function getRows() {
  const filters = getFilters();
  return listContracts().filter((row) => {
    const textOk = !filters.search || [row.cliente, row.material, row.sucursal, row.estado].join(" ").toLowerCase().includes(filters.search);
    const estadoOk = filters.estado === "todos" || row.estado === filters.estado;
    const plazaOk = filters.plaza === "todas" || row.sucursal === filters.plaza;
    return textOk && estadoOk && plazaOk;
  });
}

function renderSummary(rows) {
  setText("comContratosTotal", rows.length);
  setText("comContratosVigentes", rows.filter((row) => row.estado === "Vigente").length);
  setText("comContratosRentables", rows.filter((row) => row.rentabilidad >= 15).length);
  setText("comContratosAlertas", rows.filter((row) => row.alerta).length);
  setText("comContratosRenovar", rows.slice().sort((a, b) => a.vigenciaHasta.localeCompare(b.vigenciaHasta))[0]?.cliente || "Sin urgencia");
  $("comContratosVencimientos").innerHTML = rows.map((row) => `<div><span class="font-semibold text-stone-900">${esc(row.cliente)}</span><div class="text-xs text-stone-500 mt-1">${esc(row.vigenciaHasta)} · ${esc(row.estado)}</div></div>`).join("");
  $("comContratosRiesgo").innerHTML = rows.map((row) => `<div><span class="font-semibold text-stone-900">${esc(row.cliente)}</span><div class="text-xs text-stone-500 mt-1">${row.rentabilidad}% margen · ${row.cumplimiento}% cumplimiento</div></div>`).join("");
  $("comContratosRenovaciones").innerHTML = rows.map((row) => `<div><span class="font-semibold text-stone-900">${esc(row.cliente)}</span><div class="text-xs text-stone-500 mt-1">${esc(row.alerta)}</div></div>`).join("");
}

function renderTable(rows) {
  setText("comContratosRows", rows.length);
  $("comContratosBody").innerHTML = rows.map((row) => `
    <tr class="com-table-row ${row.id === selectedId ? "active" : ""}" data-contrato-id="${row.id}">
      <td class="px-4 py-3"><div class="font-semibold text-stone-900">${esc(row.cliente)}</div><div class="text-xs text-stone-500 mt-1">${esc(row.material)}</div></td>
      <td class="px-4 py-3 text-sm text-stone-700">${esc(row.sucursal)}</td>
      <td class="px-4 py-3 text-sm text-stone-700">${esc(row.frecuencia)}</td>
      <td class="px-4 py-3 text-sm text-stone-700">${esc(row.kilos)}</td>
      <td class="px-4 py-3 text-sm text-stone-700">${row.rentabilidad}%</td>
      <td class="px-4 py-3 text-sm text-stone-700">${row.cumplimiento}%</td>
      <td class="px-4 py-3 text-sm"><span class="com-chip ${tone(row.estado)}">${esc(row.estado)}</span></td>
    </tr>`).join("");
  $("comContratosBody").querySelectorAll("[data-contrato-id]").forEach((row) => row.addEventListener("click", () => {
    selectedId = row.dataset.contratoId;
    sessionStorage.setItem("comercial:selectedContractId", selectedId);
    render();
  }));
}

function renderSelected(contract) {
  if (!contract) return;
  setText("comContratoCliente", contract.cliente);
  setText("comContratoEstado", contract.estado);
  setText("comContratoSucursal", contract.sucursal);
  setText("comContratoAcuerdo", contract.acuerdo);
  setText("comContratoFrecuencia", contract.frecuencia);
  setText("comContratoMaterial", contract.material);
  setText("comContratoPrecio", contract.precio);
  setText("comContratoCumplimiento", `${contract.cumplimiento}%`);
  setText("comContratoKilos", contract.kilos);
  setText("comContratoRentabilidad", `${contract.rentabilidad}%`);
  setText("comContratoVigencia", `${contract.vigenciaDesde} -> ${contract.vigenciaHasta}`);
  setText("comContratoProxima", contract.proxima);
  setText("comContratoUltima", contract.ultima);
  setText("comContratoAlerta", contract.alerta);
}

function bind() {
  ["comContratosSearch", "comContratosEstadoFilter", "comContratosPlazaFilter"].forEach((id) => {
    $(id)?.addEventListener(id === "comContratosSearch" ? "input" : "change", render);
  });
  $("comContratosReset")?.addEventListener("click", () => {
    $("comContratosSearch").value = "";
    $("comContratosEstadoFilter").value = "todos";
    $("comContratosPlazaFilter").value = "todas";
    render();
  });
  $("comContratosNuevoBtn")?.addEventListener("click", () => openContractModal(null));
  $("comContratoEditarBtn")?.addEventListener("click", () => {
    const row = getRows().find((item) => item.id === selectedId);
    if (row) openContractModal(row);
  });
  $("comContratoRenovarBtn")?.addEventListener("click", () => {
    const row = getRows().find((item) => item.id === selectedId);
    if (!row) return;
    const nextDate = prompt("Nueva vigencia hasta (YYYY-MM-DD)", row.vigenciaHasta);
    if (!nextDate) return;
    renewContract(row.id, nextDate);
    render();
  });
  $("comContratoFinalizarBtn")?.addEventListener("click", () => {
    const row = getRows().find((item) => item.id === selectedId);
    if (!row) return;
    const motivo = prompt("Motivo de finalizacion", row.alerta || "");
    if (motivo == null) return;
    finalizeContract(row.id, motivo);
    render();
  });
  $("comContratoInstanciasBtn")?.addEventListener("click", () => {
    const row = getRows().find((item) => item.id === selectedId);
    if (row) openInstancesModal(row);
  });
  window.addEventListener("comercial:store-updated", render);
}

function render() {
  const rows = getRows();
  if (!selectedId || !rows.find((item) => item.id === selectedId)) {
    selectedId = sessionStorage.getItem("comercial:selectedContractId") || rows[0]?.id || null;
  }
  renderSummary(rows);
  renderTable(rows);
  if (selectedId) renderSelected(rows.find((item) => item.id === selectedId));
}

export function mountComercialContratos() {
  bind();
  render();
}
