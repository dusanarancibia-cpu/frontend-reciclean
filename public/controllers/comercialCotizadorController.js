import {
  convertQuoteToOpportunity,
  createContractFromOpportunity,
  formatMoney,
  listClientOptions,
  listQuotes,
  saveQuote,
} from "../models/comercialStore.js";

const $ = (id) => document.getElementById(id);
let activeId = null;
let working = null;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function blankQuote() {
  return {
    id: "",
    clientId: listClientOptions()[0]?.id || "",
    titulo: "",
    frecuencia: "Semanal",
    lectura: "",
    lineas: [{ id: `ql-${Date.now()}`, desc: "", qty: 1, unidad: "kg", precio: 0, costo: 0 }],
  };
}

function currentQuote() {
  if (working) return working;
  const found = listQuotes().find((item) => item.id === activeId);
  working = found ? JSON.parse(JSON.stringify(found)) : blankQuote();
  return working;
}

function calc() {
  const quote = currentQuote();
  const total = quote.lineas.reduce((acc, item) => acc + (Number(item.qty) * Number(item.precio)), 0);
  const cost = quote.lineas.reduce((acc, item) => acc + (Number(item.qty) * Number(item.costo)), 0);
  const margen = total > 0 ? ((total - cost) / total) * 100 : 0;
  const atractivo = margen >= 18 && total >= 3000000 ? "Alto" : margen >= 10 ? "Medio" : "Bajo";
  const destino = margen >= 18 && ["Semanal", "Quincenal"].includes(quote.frecuencia) ? "Contrato" : margen >= 10 ? "Oportunidad" : "Revisar";
  return { total, cost, margen, atractivo, destino };
}

function hydrateClients() {
  const select = $("comCotCliente");
  if (!select) return;
  const clientId = currentQuote().clientId;
  select.innerHTML = listClientOptions().map((item) => `<option value="${item.id}"${item.id === clientId ? " selected" : ""}>${esc(item.nombre)} · ${esc(item.plaza)}</option>`).join("");
}

function renderList() {
  $("comCotizadorLista").innerHTML = listQuotes().map((item) => `
    <button type="button" class="com-route-card ${item.id === activeId ? "active" : ""}" data-quote-id="${item.id}">
      <div class="text-sm font-semibold text-stone-900">${esc(item.titulo || "Sin titulo")}</div>
      <div class="mt-1 text-xs text-stone-500">${esc(item.frecuencia)} · ${item.lineas.length} linea(s)</div>
    </button>`).join("") || '<div class="text-sm text-stone-500">Sin cotizaciones guardadas.</div>';
  $("comCotizadorLista").querySelectorAll("[data-quote-id]").forEach((button) => button.addEventListener("click", () => {
    activeId = button.dataset.quoteId;
    working = null;
    render();
  }));
}

function updateWorkingFromForm() {
  const quote = currentQuote();
  quote.titulo = $("comCotTitulo").value.trim();
  quote.clientId = $("comCotCliente").value;
  quote.frecuencia = $("comCotFrecuencia").value;
  quote.lectura = $("comCotLectura").value.trim();
}

function renderLineas() {
  const quote = currentQuote();
  $("comCotLineas").innerHTML = quote.lineas.map((linea, index) => `
    <tr>
      <td class="px-4 py-3"><input class="com-input" data-linea="${index}" data-field="desc" value="${esc(linea.desc)}" /></td>
      <td class="px-4 py-3"><input type="number" class="com-input" data-linea="${index}" data-field="qty" value="${linea.qty}" /></td>
      <td class="px-4 py-3"><select class="com-select" data-linea="${index}" data-field="unidad"><option value="kg"${linea.unidad === "kg" ? " selected" : ""}>kg</option><option value="t"${linea.unidad === "t" ? " selected" : ""}>t</option><option value="u"${linea.unidad === "u" ? " selected" : ""}>u</option></select></td>
      <td class="px-4 py-3"><input type="number" class="com-input" data-linea="${index}" data-field="precio" value="${linea.precio}" /></td>
      <td class="px-4 py-3"><input type="number" class="com-input" data-linea="${index}" data-field="costo" value="${linea.costo}" /></td>
      <td class="px-4 py-3 text-sm text-stone-700">${formatMoney(Number(linea.qty) * Number(linea.precio))}</td>
      <td class="px-4 py-3"><button type="button" class="com-mini-btn danger" data-delete-line="${index}">Quitar</button></td>
    </tr>`).join("");

  $("comCotLineas").querySelectorAll("[data-linea]").forEach((field) => field.addEventListener("input", () => {
    const line = quote.lineas[Number(field.dataset.linea)];
    line[field.dataset.field] = ["qty", "precio", "costo"].includes(field.dataset.field) ? Number(field.value || 0) : field.value;
    renderMetrics();
  }));
  $("comCotLineas").querySelectorAll("[data-delete-line]").forEach((button) => button.addEventListener("click", () => {
    quote.lineas.splice(Number(button.dataset.deleteLine), 1);
    if (!quote.lineas.length) quote.lineas.push({ id: `ql-${Date.now()}`, desc: "", qty: 1, unidad: "kg", precio: 0, costo: 0 });
    render();
  }));
}

function renderMetrics() {
  updateWorkingFromForm();
  const result = calc();
  setText("comCotizadorEscenarios", listQuotes().length);
  setText("comCotizadorMargenKpi", `${result.margen.toFixed(1)}%`);
  setText("comCotizadorValorKpi", formatMoney(result.total));
  setText("comCotizadorDestino", result.destino);
  setText("comCotTotal", formatMoney(result.total));
  setText("comCotCosto", formatMoney(result.cost));
  setText("comCotMargen", `${result.margen.toFixed(1)}%`);
  setText("comCotAtractivo", result.atractivo);
}

function renderForm() {
  const quote = currentQuote();
  hydrateClients();
  $("comCotTitulo").value = quote.titulo;
  $("comCotFrecuencia").value = quote.frecuencia;
  $("comCotLectura").value = quote.lectura;
  renderLineas();
  renderMetrics();
}

function saveCurrent() {
  updateWorkingFromForm();
  const saved = saveQuote(currentQuote());
  activeId = saved.id;
  working = null;
  render();
}

function bind() {
  ["comCotTitulo", "comCotCliente", "comCotFrecuencia", "comCotLectura"].forEach((id) => {
    $(id)?.addEventListener(id === "comCotLectura" ? "input" : "change", renderMetrics);
  });
  $("comCotAgregarLinea")?.addEventListener("click", () => {
    currentQuote().lineas.push({ id: `ql-${Date.now()}`, desc: "", qty: 1, unidad: "kg", precio: 0, costo: 0 });
    render();
  });
  $("comCotizadorNuevoBtn")?.addEventListener("click", () => {
    activeId = null;
    working = blankQuote();
    render();
  });
  $("comCotizadorGuardarBtn")?.addEventListener("click", saveCurrent);
  $("comCotReset")?.addEventListener("click", () => {
    working = blankQuote();
    render();
  });
  $("comCotPasarOportunidad")?.addEventListener("click", () => {
    saveCurrent();
    const quote = listQuotes().find((item) => item.id === activeId);
    const opp = convertQuoteToOpportunity(quote.id);
    if (opp) {
      sessionStorage.setItem("comercial:selectedOpportunityId", opp.id);
      location.hash = "#comercial-oportunidades";
    }
  });
  $("comCotCrearContrato")?.addEventListener("click", () => {
    saveCurrent();
    const quote = listQuotes().find((item) => item.id === activeId);
    const opp = convertQuoteToOpportunity(quote.id);
    const contract = createContractFromOpportunity(opp.id);
    if (contract) {
      sessionStorage.setItem("comercial:selectedContractId", contract.id);
      location.hash = "#comercial-contratos";
    }
  });
  window.addEventListener("comercial:store-updated", render);
}

function render() {
  if (!activeId) {
    activeId = listQuotes()[0]?.id || null;
  }
  working = null;
  renderList();
  renderForm();
}

export function mountComercialCotizador() {
  bind();
  render();
}
