import {
  listClients,
  saveClient,
} from "../models/comercialStore.js";

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function tone(segmento) {
  if (segmento === "Caliente") return "warn";
  if (segmento === "Activo") return "ok";
  return "soft";
}

function openClientModal(client = null) {
  let modal = document.getElementById("comClienteModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "comClienteModal";
    modal.className = "com-overlay hidden";
    modal.innerHTML = `
      <div class="com-dialog max-w-3xl">
        <div class="flex items-center justify-between gap-3">
          <h3 id="comClienteModalTitle" class="text-xl font-bold text-stone-900">Cliente</h3>
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
          <label class="com-field md:col-span-2"><span class="com-label">Materiales</span><input id="comCliMateriales" class="com-input" placeholder="Carton, PET, Film" /></label>
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

  const current = client || {
    id: "",
    nombre: "",
    rut: "",
    plaza: "",
    sucursal: "",
    contacto: "",
    telefono: "",
    email: "",
    direccion: "",
    categoria: "C",
    materiales: [],
  };

  $("comCliNombre").value = current.nombre;
  $("comCliRut").value = current.rut;
  $("comCliPlaza").value = current.plaza;
  $("comCliSucursal").value = current.sucursal;
  $("comCliContacto").value = current.contacto;
  $("comCliTelefono").value = current.telefono;
  $("comCliEmail").value = current.email;
  $("comCliDireccion").value = current.direccion;
  $("comCliCategoria").value = current.categoria || "C";
  $("comCliMateriales").value = Array.isArray(current.materiales) ? current.materiales.join(", ") : String(current.materiales || "");
  document.getElementById("comClienteModalTitle").textContent = client ? `Editar ${client.nombre}` : "Nuevo cliente";

  document.getElementById("comClienteModalSave").onclick = () => {
    const saved = saveClient({
      ...current,
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
      segmento: current.segmento || "Tibio",
      ejecutivo: current.ejecutivo || "Andrea",
      color: current.color || "Ambar",
      score: current.score || 55,
      proximaAccion: current.proximaAccion || "Completar ficha y activar primera accion comercial.",
      formaPago: current.formaPago || "Pendiente",
      condicionesPago: current.condicionesPago || "Sin definir",
    });
    sessionStorage.setItem("comercial:selectedClientId", saved.id);
    modal.classList.add("hidden");
    location.hash = "#comercial-clientes-detalle";
  };

  modal.classList.remove("hidden");
}

function getFilters() {
  return {
    search: ($("comercialClientesSearch")?.value || "").trim().toLowerCase(),
  };
}

function getRows() {
  const filters = getFilters();
  return listClients().filter((row) => {
    const textOk = !filters.search || [
      row.nombre, row.rut,
    ].join(" ").toLowerCase().includes(filters.search);
    return textOk;
  });
}

function buildClientCard(row) {
  return `
    <button type="button" class="com-cliente-item com-client-pick" data-cliente-id="${row.id}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[15px] font-bold leading-5 text-stone-900">${esc(row.nombre)}</div>
          <div class="mt-1 text-xs text-stone-500">${esc(row.rut)}</div>
          <div class="mt-2 text-xs text-stone-500">${esc(row.contacto || "Sin contacto")}</div>
        </div>
        <span class="com-chip ${tone(row.segmento)}">${esc(row.segmento)}</span>
      </div>
      <div class="mt-3 text-xs text-stone-600">${esc(row.plaza)} · ${esc(row.sucursal)}</div>
      <div class="mt-3 flex gap-1.5">
        <span class="com-chip soft">${esc(row.categoria || "C")}</span>
      </div>
    </button>`;
}

function renderCards(rows) {
  const mount = $("comercialClientesCards");
  if (!mount) return;
  mount.innerHTML = rows.length
    ? rows.map(buildClientCard).join("")
    : '<div class="com-empty">No hay clientes para los filtros actuales.</div>';

  mount.querySelectorAll("[data-cliente-id]").forEach((button) => {
    button.addEventListener("click", () => {
      sessionStorage.setItem("comercial:selectedClientId", button.dataset.clienteId);
      location.hash = "#comercial-clientes-detalle";
    });
  });
}

function bind() {
  $("comercialClientesSearch")?.addEventListener("input", render);
  $("comercialClientesNuevoBtn")?.addEventListener("click", () => openClientModal(null));
  window.addEventListener("comercial:store-updated", render);
}

function render() {
  renderCards(getRows());
}

export function mountComercialClientes() {
  bind();
  render();
}
