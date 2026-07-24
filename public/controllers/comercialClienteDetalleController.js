import {
  appendClientTimeline,
  listClientWorkspace,
  listClients,
  saveClient,
  updateClientCategory,
} from "../models/comercialStore.js";

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  } catch (_error) {
    return iso;
  }
}

function tone(segmento) {
  if (segmento === "Caliente") return "warn";
  if (segmento === "Activo") return "ok";
  return "soft";
}

function openClientModal(client) {
  let modal = document.getElementById("comClienteModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "comClienteModal";
    modal.className = "com-overlay hidden";
    modal.innerHTML = `
      <div class="com-dialog max-w-3xl">
        <div class="flex items-center justify-between gap-3">
          <h3 id="comClienteModalTitle" class="text-xl font-bold text-stone-900">Editar cliente</h3>
          <button id="comClienteModalClose" class="text-stone-500 hover:text-stone-800 text-xl">×</button>
        </div>
        <div class="grid gap-4 mt-5 md:grid-cols-2">
          <label class="com-field"><span class="com-label">Razon social</span><input id="comCliNombre" class="com-input" /></label>
          <label class="com-field"><span class="com-label">RUT</span><input id="comCliRut" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Plaza</span><input id="comCliPlaza" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Sucursal</span><input id="comCliSucursal" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Contacto</span><input id="comCliContacto" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Telefono</span><input id="comCliTelefono" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Email</span><input id="comCliEmail" class="com-input" /></label>
          <label class="com-field"><span class="com-label">Categoria</span><select id="comCliCategoria" class="com-select"><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label>
          <label class="com-field md:col-span-2"><span class="com-label">Direccion</span><input id="comCliDireccion" class="com-input" /></label>
          <label class="com-field md:col-span-2"><span class="com-label">Materiales</span><input id="comCliMateriales" class="com-input" /></label>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button id="comClienteModalCancel" class="com-action-btn">Cancelar</button>
          <button id="comClienteModalSave" class="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Guardar cliente</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.add("hidden");
    });
    document.getElementById("comClienteModalClose").addEventListener("click", () => modal.classList.add("hidden"));
    document.getElementById("comClienteModalCancel").addEventListener("click", () => modal.classList.add("hidden"));
  }

  $("comCliNombre").value = client.nombre;
  $("comCliRut").value = client.rut;
  $("comCliPlaza").value = client.plaza;
  $("comCliSucursal").value = client.sucursal;
  $("comCliContacto").value = client.contacto;
  $("comCliTelefono").value = client.telefono;
  $("comCliEmail").value = client.email;
  $("comCliDireccion").value = client.direccion;
  $("comCliCategoria").value = client.categoria || "C";
  $("comCliMateriales").value = Array.isArray(client.materiales) ? client.materiales.join(", ") : String(client.materiales || "");

  document.getElementById("comClienteModalSave").onclick = () => {
    saveClient({
      ...client,
      nombre: $("comCliNombre").value.trim(),
      rut: $("comCliRut").value.trim(),
      plaza: $("comCliPlaza").value.trim(),
      sucursal: $("comCliSucursal").value.trim(),
      contacto: $("comCliContacto").value.trim(),
      telefono: $("comCliTelefono").value.trim(),
      email: $("comCliEmail").value.trim(),
      direccion: $("comCliDireccion").value.trim(),
      categoria: $("comCliCategoria").value,
      materiales: $("comCliMateriales").value.trim(),
    });
    modal.classList.add("hidden");
  };

  modal.classList.remove("hidden");
}

function renderList(id, rows, empty) {
  const mount = $(id);
  if (!mount) return;
  mount.innerHTML = rows.length
    ? rows.map((item) => `<div class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">${item}</div>`).join("")
    : `<div class="text-sm text-stone-500">${empty}</div>`;
}

function buildMetaRows(client, workspace) {
  return [
    ["Nombre", client.nombre],
    ["RUT", client.rut],
    ["Telefono", client.telefono || "Sin telefono"],
    ["Email", client.email || "Sin email"],
    ["Plaza / sucursal", `${client.plaza} · ${client.sucursal}`],
    ["Ejecutivo", client.ejecutivo || "Sin asignar"],
    ["Categoria", client.categoria || "Sin categoria"],
    ["Segmento", client.segmento || "Sin segmento"],
    ["Score", `${client.score}/100`],
    ["Condiciones pago", client.condicionesPago || "Sin definir"],
    ["Forma pago", client.formaPago || "Sin definir"],
    ["Contrato actual", workspace.contracts[0]?.estado || "Sin contrato"],
  ];
}

function buildCustomFields(client, workspace) {
  const fields = Array.isArray(client.customFields) ? client.customFields.slice() : [];
  if (!fields.find((item) => item.label === "Oportunidades activas")) {
    fields.push({ label: "Oportunidades activas", value: String(workspace.opportunities.length) });
  }
  if (!fields.find((item) => item.label === "Agenda visible")) {
    fields.push({ label: "Agenda visible", value: workspace.services[0]?.fecha || "Sin agenda cargada" });
  }
  if (!fields.find((item) => item.label === "Alertas internas")) {
    fields.push({ label: "Alertas internas", value: String(client.saneamiento?.length || 0) });
  }
  return fields;
}

function buildOpportunityCards(workspace) {
  if (!workspace.opportunities.length) {
    return '<div class="com-empty">Sin oportunidades relacionadas.</div>';
  }
  return workspace.opportunities.map((item) => `
    <button class="com-client-case" data-client-opp="${item.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="text-sm font-bold leading-5 text-stone-900">${esc(item.titulo)}</div>
        <span class="com-chip soft">${esc(item.etapa)}</span>
      </div>
      <div class="mt-3 grid gap-x-3 gap-y-1 text-xs text-stone-600 sm:grid-cols-2">
        <div>${esc(item.monto ? new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(item.monto) : "Sin monto")}</div>
        <div>${esc(item.vencimiento || "Sin fecha")}</div>
        <div>${esc(item.material || "Sin material")}</div>
        <div>${esc(item.sucursal || "Sin sucursal")}</div>
      </div>
    </button>`).join("");
}

function render() {
  const selectedId = sessionStorage.getItem("comercial:selectedClientId");
  const workspace = listClientWorkspace(selectedId);
  const client = workspace.client;
  if (!client) {
    location.hash = "#comercial-clientes";
    return;
  }

  setText("comercialClienteDetalleNombre", client.nombre);
  setText("comercialClienteDetalleSub", `${client.plaza} · ${client.sucursal} · ${client.contacto || "Sin contacto principal"}`);
  setText("comercialClienteNombre", client.nombre);
  setText("comercialClienteRut", client.rut);
  setText("comercialClienteSegmento", client.segmento);
  $("comercialClienteSegmento")?.classList.remove("ok", "warn", "soft");
  $("comercialClienteSegmento")?.classList.add(tone(client.segmento));
  setText("comercialClienteScore", `Score ${client.score}/100`);
  setText("comercialClienteSiguiente", client.proximaAccion);
  $("comercialClienteCategoria").value = client.categoria || "C";

  $("comercialClienteFichaMeta").innerHTML = buildMetaRows(client, workspace)
    .map(([label, value]) => `<div class="com-client-meta-row"><div class="com-label">${esc(label)}</div><div class="text-sm text-stone-700">${esc(value)}</div></div>`)
    .join("");
  $("comercialClienteCampos").innerHTML = buildCustomFields(client, workspace)
    .map((item) => `<div class="com-client-field-row"><span class="com-client-field-dot"></span><div><span class="font-semibold text-stone-800">${esc(item.label)}:</span> ${esc(item.value)}</div></div>`)
    .join("");
  $("comercialClienteComentario").innerHTML = esc(client.comentario || client.proximaAccion || "Sin comentario operativo cargado.");

  $("comercialClienteTimeline").innerHTML = client.timeline.length
    ? client.timeline.map((item) => `<div class="com-timeline-item"><div class="com-timeline-dot"></div><div><div class="text-sm font-semibold text-stone-900">${esc(item.tipo)}</div><div class="text-xs text-stone-500">${fmtDate(item.at)}</div><div class="text-sm text-stone-700 mt-1">${esc(item.detalle)}</div></div></div>`).join("")
    : '<div class="text-sm text-stone-500">Sin movimientos recientes.</div>';

  renderList("comercialClienteAlertas", client.saneamiento || [], "Sin alertas internas activas.");
  $("comercialClienteOportunidades").innerHTML = buildOpportunityCards(workspace);
  $("comercialClienteContratosAgenda").innerHTML = [
    ...workspace.contracts.map((item) => `Contrato ${esc(item.estado)} · ${esc(item.frecuencia)} · ${esc(item.proxima)}`),
    ...workspace.services.map((item) => `Agenda ${esc(item.fecha)} ${esc(item.hora)} · ${esc(item.estado)}`),
  ].map((item) => `<div class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">${item}</div>`).join("") || '<div class="text-sm text-stone-500">Sin contratos ni agenda.</div>';
  $("comercialClienteExpedientes").innerHTML = client.expedientes?.length
    ? client.expedientes.map((item) => `<div class="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700"><div class="font-semibold text-stone-900">${esc(item.titulo)}</div><div class="text-xs text-stone-500 mt-1">${esc(item.fecha)} · ${esc(item.estado)} · ${esc(item.kilos)}</div><div class="text-xs mt-2">${item.comprobantes.map((file) => `${esc(file)}`).join("<br>")}</div></div>`).join("")
    : '<div class="text-sm text-stone-500">Sin expedientes operacionales registrados.</div>';

  $("comercialClienteOportunidades").querySelectorAll("[data-client-opp]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionStorage.setItem("comercial:selectedOpportunityId", button.dataset.clientOpp);
      location.hash = "#comercial-oportunidades";
    });
  });

  $("comercialClienteEditarBtn").onclick = () => openClientModal(client);
  $("comercialClienteAplicarCategoria").onclick = () => {
    updateClientCategory(selectedId, $("comercialClienteCategoria").value);
    appendClientTimeline(selectedId, "Categoria", `Se aplica categoria ${$("comercialClienteCategoria").value}.`);
    render();
  };
  $("comercialClienteNuevaOppBtn").onclick = () => { location.hash = "#comercial-oportunidades"; };
  $("comercialClienteAgendaBtn").onclick = () => { location.hash = "#comercial-agenda"; };
  $("comercialClienteContratoBtn").onclick = () => { location.hash = "#comercial-contratos"; };
  $("comercialClienteCobranzaBtn").onclick = () => { location.hash = "#comercial-cobranza"; };
}

export function mountComercialClienteDetalle() {
  if (!sessionStorage.getItem("comercial:selectedClientId")) {
    const first = listClients()[0];
    if (first) sessionStorage.setItem("comercial:selectedClientId", first.id);
  }
  window.addEventListener("comercial:store-updated", render);
  render();
}
