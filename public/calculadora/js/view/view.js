// VISTA · Todo el manejo del DOM. No conoce Supabase ni reglas de negocio.
const $ = (id) => document.getElementById(id);
export const clp = (n) => (n == null || isNaN(n)) ? "—" : "$" + Math.round(n).toLocaleString("es-CL");
export const numFmt = (n) => (n == null || isNaN(n)) ? "—" : Math.round(n).toLocaleString("es-CL");
const val = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? 0 : v; };

const SLIDERS = ["calcP", "calcMg", "calcFl", "calcB", "calcVol", "calcIva"];
// Cada slider tiene un input numérico gemelo para ingreso exacto (two-way binding).
const PARES = { calcP: "calcPNum", calcMg: "calcMgNum", calcFl: "calcFlNum",
  calcB: "calcBNum", calcVol: "calcVolExacto", calcIva: "calcIvaNum" };

// Lee los 6 sliders + modo de redondeo → objeto de entrada para la fórmula
export function readInputs(modo) {
  return {
    p: val("calcP"), mgPct: val("calcMg"), fl: val("calcFl"),
    spreadPct: val("calcB"), vol: val("calcVol"), ivaPct: val("calcIva"), modo,
  };
}
// Mueve el slider (y su gemelo numérico) a un valor; expande el max si hace falta.
export function setSlider(id, v) {
  const s = $(id); if (v > Number(s.max)) s.max = v; s.value = v;
  const n = $(PARES[id]); if (n) n.value = v;
}
// slider → input numérico (salvo que el usuario esté tipeando en ese input)
function numDesdeSlider(sid) {
  const n = $(PARES[sid]);
  if (n && document.activeElement !== n) n.value = $(sid).value;
}
export function syncNums() { Object.keys(PARES).forEach(numDesdeSlider); }
// input numérico → slider (clamp al min, expande max) para que se muevan juntos
function sliderDesdeNum(sid) {
  const s = $(sid), n = $(PARES[sid]);
  let v = parseFloat(n.value); if (isNaN(v)) return;
  if (v < Number(s.min)) v = Number(s.min);
  if (v > Number(s.max)) s.max = v;
  s.value = v;
}

// Pinta labels de los sliders + tarjetas de salida + cortes P&L + delta
export function renderOutputs(inp, c, vigente) {
  $("calcLblP").textContent = clp(inp.p);
  $("calcLblMg").textContent = inp.mgPct + "%";
  $("calcLblFl").textContent = clp(inp.fl);
  $("calcLblB").textContent = inp.spreadPct + "%";
  $("calcLblVol").textContent = numFmt(inp.vol);
  $("calcLblIva").textContent = inp.ivaPct + "%";
  syncNums();
  $("calcPmax").textContent = clp(c.pmax);
  $("calcPlista").textContent = clp(c.plista);
  $("calcPejec").textContent = clp(c.pejec);
  $("calcIvaAmt").textContent = clp(c.ivaAmt);
  $("calcContrib").textContent = clp(c.contrib);
  $("calcCorte100").textContent = clp(c.plista);
  $("calcCorte80").textContent = clp(c.plista * 0.8);
  $("calcCorte60").textContent = clp(c.plista * 0.6);
  // "P. Lista Actual" = precio de venta oficial que hoy está publicado en la web
  // para este material/sucursal (o "—" si aún no hay uno vigente).
  const elAct = $("calcDeltaVig");
  elAct.textContent = vigente != null ? clp(vigente) : "—";
  elAct.className = "text-stone-700";
}

// Alerta de costo: si el precio de compra (recibido) supera el P. Lista Nuevo, pinta el
// slider "Precio venta" en rojo y muestra un aviso notorio. Se llama en cada recompute().
export function marcarAlertaCosto(activa, recibido, plista) {
  const slider = $("calcP");
  if (slider) slider.classList.toggle("slider-alerta", !!activa);
  const box = $("calcAlertaCosto");
  if (!box) return;
  if (activa) {
    box.textContent = `⛔ El precio de compra (${clp(recibido)}) es mayor que el P. Lista Nuevo (${clp(plista)}): estarías publicando bajo costo. Sube el “Precio venta”.`;
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

export function renderSemaforo(s) {
  const box = $("calcSemaforoBox"), lbl = $("calcSemaforo"), det = $("calcSemaforoDetalle");
  box.classList.remove("border-emerald-400", "border-amber-400", "border-rose-400", "bg-emerald-50", "bg-amber-50", "bg-rose-50");
  lbl.classList.remove("text-emerald-700", "text-amber-700", "text-rose-700", "text-stone-500");
  const map = {
    verde: ["border-emerald-400", "bg-emerald-50", "text-emerald-700"],
    amarillo: ["border-amber-400", "bg-amber-50", "text-amber-700"],
    rojo: ["border-rose-400", "bg-rose-50", "text-rose-700"],
    gris: ["text-stone-500"],
  }[s.nivel] || ["text-stone-500"];
  box.classList.add(...map.filter((x) => x.startsWith("b")));
  lbl.classList.add(map.find((x) => x.startsWith("text")));
  lbl.textContent = s.texto; det.textContent = s.detalle;
}

// Capa 1 · resumen del caso capturado por Diego
export function renderCapa1(caso) {
  $("capa1").classList.remove("hidden");
  $("c1Cli").textContent = caso.fuente_cliente_nombre || caso.cliente_nombre || caso.fuente_cliente_estado || "—";
  $("c1Mat").textContent = caso.material_nombre || caso.material_id || "—";
  $("c1Suc").textContent = caso.sucursal_nombre || caso.sucursal_id || "—";
  $("c1Precio").textContent = clp(caso.precio_clp_kg);
  $("calcHistorialInfo").textContent = "Caso " + (caso.id ?? "nuevo") + " · ruta " + (caso.ruta || "—") + " · estado " + (caso.estado || "—");
}

// Selects
export function fillSelect(id, rows, valueKey, labelKey, placeholder, dataAttr) {
  const sel = $(id);
  sel.innerHTML = `<option value="">${placeholder}</option>` + rows.map((r) => {
    const extra = dataAttr ? ` data-${dataAttr}="${r[dataAttr] || ""}"` : "";
    return `<option value="${r[valueKey]}"${extra}>${r[labelKey] || r[valueKey]}</option>`;
  }).join("");
}
export function fillCategorias(metas) {
  $("calcCategoria").innerHTML = `<option value="">(sin categoría)</option>` +
    metas.map((c) => `<option value="${c.categoria}">${c.descripcion || c.categoria} (piso ${c.min}%)</option>`).join("");
}
export const getSel = (id) => $(id).value;
export const setSel = (id, v) => { $(id).value = v || ""; };
export const filtroEnAnalisis = () => $("calcFiltroEnAnalisis").checked;
// Checkbox "Nuevo caso": modo alta (crear desde cero) vs. caso cargado.
export const esNuevo = () => $("calcNuevo")?.checked || false;
export const setNuevo = (v) => { const el = $("calcNuevo"); if (el) el.checked = !!v; };

// Estado / mensajes
export function chip(email) {
  const c = $("chip");
  if (email) { c.textContent = email; c.className = "chip"; }
  else { c.textContent = "sin sesión — inicia sesión en el panel"; c.className = "chip off"; }
}
export function banner(msg) {
  const b = $("banner");
  if (!msg) { b.classList.add("hidden"); return; }
  b.textContent = msg; b.classList.remove("hidden");
}
const TONE = { ok: "text-emerald-700", warn: "text-amber-700", err: "text-rose-700", muted: "text-stone-500" };
export const loadMsg = (t, tone = "muted") => { const e = $("loadMsg"); e.textContent = t; e.className = "text-xs " + TONE[tone]; };
export const actMsg = (t, tone = "muted") => { const e = $("actMsg"); e.textContent = t; e.className = "text-xs " + TONE[tone]; };
export const disable = (id, v) => { $(id).disabled = v; };
export const getPid = () => ($("pid").value || "").trim();
export const setPid = (v) => { $("pid").value = v; };
// Precio de compra (costo transitorio) — opcional; el input puede no existir en todos
// los HTML, por eso es defensivo. Devuelve número >0 o null.
export const getCompra = () => {
  const el = $("calcCompra"); if (!el) return null;
  const v = parseFloat(el.value); return Number.isFinite(v) && v > 0 ? v : null;
};
export const setCompra = (v) => { const el = $("calcCompra"); if (el) el.value = v ?? ""; };

export function activarRedondeo(modo) {
  document.querySelectorAll(".calcRedondeoBtn").forEach((b) => b.classList.toggle("active", b.dataset.modo === modo));
}

// Registro de eventos (el controlador pasa los handlers)
export function bind(handlers) {
  // Two-way binding: slider ↔ input numérico (ambos recalculan al instante)
  SLIDERS.forEach((id) =>
    $(id).addEventListener("input", () => { numDesdeSlider(id); handlers.onInput(); }));
  Object.keys(PARES).forEach((sid) => {
    const n = $(PARES[sid]); if (!n) return;
    n.addEventListener("input", () => { sliderDesdeNum(sid); handlers.onInput(); });
  });
  $("calcRedondeoToggle").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => handlers.onRedondeo(b.dataset.modo)));
  ["calcMaterial", "calcSucursal", "calcCategoria"].forEach((id) =>
    $(id).addEventListener("change", () => handlers.onSelect(id)));
  $("calcFiltroEnAnalisis").addEventListener("change", handlers.onFiltro);
  $("btnCargar").addEventListener("click", handlers.onCargar);
  // btnGuardar = "← Regresar" · btnAprobar = "Pasar a revisión →"
  $("btnGuardar").addEventListener("click", handlers.onRegresar);
  $("btnAprobar").addEventListener("click", handlers.onPasarRevision);
  if (handlers.onNuevo) $("calcNuevo")?.addEventListener("change", handlers.onNuevo);
}
