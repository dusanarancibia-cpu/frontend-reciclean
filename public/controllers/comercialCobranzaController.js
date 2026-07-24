import { addCobranzaTimeline, formatMoney, listCobranza } from "../models/comercialStore.js";

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

function tone(estado) {
  if (estado === "Vencida") return "warn";
  if (estado === "Por vencer") return "soft";
  return "ok";
}

function renderSummary(rows) {
  const total = rows.reduce((acc, item) => acc + item.monto, 0);
  setText("comCobranzaCasos", rows.length);
  setText("comCobranzaVencidas", rows.filter((item) => item.estado === "Vencida").length);
  setText("comCobranzaTotal", formatMoney(total));
  setText("comCobranzaHoy", rows.filter((item) => item.dias === "Hoy").length);
  setText("comCobranzaFoco", "Seguir sin romper cierres");
  $("comCobranzaResumen").innerHTML = rows.map((item) => `<div><span class="font-semibold text-stone-900">${esc(item.cliente)}</span><div class="text-xs text-stone-500 mt-1">${esc(item.gestion)}</div></div>`).join("");
  $("comCobranzaRiesgo").innerHTML = rows.map((item) => `<div><span class="font-semibold text-stone-900">${esc(item.cliente)}</span><div class="text-xs text-stone-500 mt-1">${esc(item.observacion)}</div></div>`).join("");
}

function renderList(rows) {
  setText("comCobranzaRows", rows.length);
  $("comCobranzaList").innerHTML = rows.map((item) => `
    <button type="button" class="com-route-card ${item.id === selectedId ? "active" : ""}" data-cob-id="${item.id}">
      <div class="flex items-start justify-between gap-3">
        <div><div class="text-sm font-semibold text-stone-900">${esc(item.cliente)}</div><div class="mt-1 text-xs text-stone-500">${esc(item.ejecutivo)} · vence ${esc(item.vencimiento)}</div></div>
        <span class="com-chip ${tone(item.estado)}">${esc(item.estado)}</span>
      </div>
      <div class="grid gap-2 mt-3 md:grid-cols-[0.6fr,0.45fr,1fr] text-sm text-stone-700">
        <div>${formatMoney(item.monto)}</div>
        <div>${esc(item.dias)}</div>
        <div>${esc(item.gestion)}</div>
      </div>
    </button>`).join("");
  $("comCobranzaList").querySelectorAll("[data-cob-id]").forEach((button) => button.addEventListener("click", () => {
    selectedId = button.dataset.cobId;
    render();
  }));
}

function renderSelected(item) {
  if (!item) return;
  setText("comCobranzaCliente", item.cliente);
  setText("comCobranzaEstado", item.estado);
  setText("comCobranzaMonto", formatMoney(item.monto));
  setText("comCobranzaVencimiento", item.vencimiento);
  setText("comCobranzaDias", item.dias);
  setText("comCobranzaEjecutivo", item.ejecutivo);
  setText("comCobranzaCompromiso", item.compromiso);
  setText("comCobranzaGestion", item.gestion);
  setText("comCobranzaObservacion", item.observacion);
  $("comCobranzaTimeline").innerHTML = item.timeline.map((row) => `<div class="com-timeline-item"><div class="com-timeline-dot"></div><div class="text-sm text-stone-700">${esc(row.texto)} <span class="text-xs text-stone-500">${esc(row.at.slice(0, 10))}</span></div></div>`).join("");
}

function bind() {
  $("comCobranzaGuardarGestion")?.addEventListener("click", () => {
    const text = $("comCobranzaNuevaGestion").value.trim();
    if (!text || !selectedId) return;
    addCobranzaTimeline(selectedId, text);
    $("comCobranzaNuevaGestion").value = "";
    render();
  });
  window.addEventListener("comercial:store-updated", render);
}

function render() {
  const rows = listCobranza();
  if (!selectedId || !rows.find((item) => item.id === selectedId)) selectedId = rows[0]?.id || null;
  renderSummary(rows);
  renderList(rows);
  if (selectedId) renderSelected(rows.find((item) => item.id === selectedId));
}

export function mountComercialCobranza() {
  bind();
  render();
}
