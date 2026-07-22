// CONTROLADOR · Widget de Diego, MULTIMODAL (texto + imagen), canal 100% web.
// Al Enviar, empaqueta AMBAS cosas: el texto escrito y la imagen en Base64.
//
// Payload objetivo (pedido por el equipo, para que la IA tenga contexto infalible):
//     { texto: "mensaje", imagenBase64: "data:image..." }
// Se agregan además los campos que la EF diego-chat-process YA entiende hoy
// (mensaje, user_email, file_url por Storage) para no romper el flujo vivo
// mientras el backend no se toca. Cuando la EF adopte imagenBase64, sobran.
import { SUPABASE_URL, EF } from "../js/config.js";
import { getClient, getSession } from "../models/supabase.js";

const $ = (id) => document.getElementById(id);
const BUCKET = "diego-chat-files";
const EF_URL = SUPABASE_URL + (EF.diegoChatProcess || "/functions/v1/diego-chat-process");

let _staged = null; // { file, dataUrl }
let _historial = []; // turnos previos {role, content} → contexto para el backend (ej. CONFIRMAR una lista)

// ─── Persistencia del chat (sobrevive cambio de vista y recarga de página) ──
const STORE_KEY = "diego_chat_v1";
let _saveT = null;

function guardarChat() {
  try {
    const chat = $("diegoChat"), body = $("diegoChatBody");
    if (!chat || !body) return;
    sessionStorage.setItem(STORE_KEY, JSON.stringify({
      html: body.innerHTML,
      historial: _historial,
      open: chat.classList.contains("open"),
      minimized: chat.classList.contains("minimized"),
    }));
  } catch { /* sessionStorage lleno o no disponible: no rompe el chat */ }
}
function guardarChatDebounced() { clearTimeout(_saveT); _saveT = setTimeout(guardarChat, 150); }

function restaurarChat() {
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { s = null; }
  if (!s) return;
  const chat = $("diegoChat"), body = $("diegoChatBody");
  if (s.html && body) body.innerHTML = s.html;
  if (Array.isArray(s.historial)) _historial = s.historial;
  if (s.open && chat) {
    chat.classList.add("open");
    $("diegoFab").style.display = "none";
    if (s.minimized) { chat.classList.add("minimized"); $("diegoBackdrop").classList.remove("open"); }
    else { $("diegoBackdrop").classList.add("open"); }
  }
  recablearBotones();
  if (body) body.scrollTop = body.scrollHeight;
}

// Re-cablea los botones de acción tras restaurar (los closures se pierden al reinyectar HTML;
// el payload viaja en data-attributes).
function wireCargarBtn(b) {
  if (!b || b._wired) return; b._wired = true;
  b.addEventListener("click", () => {
    let items = []; try { items = JSON.parse(b.dataset.items || "[]"); } catch { items = []; }
    if (!items.length) return;
    b.disabled = true; b.textContent = "Cargando…";
    cargarListaDirecto(items, b.dataset.sucursal || "");
  });
}
function wireSucBtn(b) {
  if (!b || b._wired) return; b._wired = true;
  b.addEventListener("click", () => {
    let items = []; try { items = JSON.parse(b.dataset.items || "[]"); } catch { items = []; }
    b.closest(".diego-msg")?.remove();
    cargarListaDirecto(items, b.dataset.suc);
  });
}
function recablearBotones() {
  $("diegoChatBody")?.querySelectorAll(".diego-cargar-btn").forEach(wireCargarBtn);
  $("diegoChatBody")?.querySelectorAll(".diego-suc-btn").forEach(wireSucBtn);
}

// ─── Render ────────────────────────────────────────────────────────────
function pushMsg(texto, quien = "theirs") {
  const body = $("diegoChatBody");
  $("diegoEmpty")?.remove();
  const el = document.createElement("div");
  el.className = "diego-msg " + (quien === "mine" ? "mine" : "theirs");
  el.textContent = texto;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  return el;
}

function pushMio(texto, dataUrl, nombre) {
  const body = $("diegoChatBody");
  $("diegoEmpty")?.remove();
  const el = document.createElement("div");
  el.className = "diego-msg mine";
  el.innerHTML =
    (dataUrl ? `<img src="${dataUrl}" alt="${nombre || ""}" style="max-width:180px;border-radius:10px;display:block;margin-bottom:4px;" />` : "") +
    (texto ? `<div>${texto.replace(/</g, "&lt;")}</div>` : "") +
    (dataUrl && !texto ? `<div class="diego-msg-attach">📎 ${nombre || "imagen"}</div>` : "");
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

function accionCalculadora(proposalId) {
  // Con proposalId (lo devuelve la EF): abre la Calculadora directo sobre esa propuesta.
  const href = proposalId
    ? `/?vista=calculadora&proposalId=${encodeURIComponent(proposalId)}`
    : `/?vista=calculadora`;
  return `<a href="${href}" style="display:inline-block;margin-top:8px;background:#059669;
      color:#fff;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:600;
      text-decoration:none;">Abrir en Calculadora →</a>`;
}

const esc = (s) => String(s ?? "").replace(/</g, "&lt;");
const clp = (n) => (n == null || isNaN(Number(n))) ? "—" : "$" + Number(n).toLocaleString("es-CL");
// "$9.480" / "9.480" / "1.300" → 9480 / 1300 (formato chileno: punto = miles).
const parsePrecio = (s) => {
  const n = parseInt(String(s ?? "").replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? null : n;
};

// items {material, precio_clp_kg} desde el array estructurado datos_extraidos.
function itemsDesdeDatos(datos) {
  if (!Array.isArray(datos)) return [];
  return datos.map((d) => ({
    material: String(d.material ?? d.material_nombre ?? "").trim(),
    precio_clp_kg: Number(d.precio ?? d.precio_clp_kg ?? d.precio_propuesto),
  })).filter((x) => x.material && isFinite(x.precio_clp_kg));
}

// Detecta la sucursal desde el texto de la respuesta (encabezado "Sucursal: MAIPÚ").
function sucursalDesdeTexto(text) {
  const t = String(text || "");
  const m = t.match(/sucursal\s*\**\s*:?\s*\**\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/i);
  if (m && m[1]) return m[1];
  for (const k of ["Cerrillos", "Maipú", "Maipu", "Talca", "Puerto Montt"]) {
    if (new RegExp(k, "i").test(t)) return k;
  }
  return "";
}

// Tabla desde el array estructurado datos_extraidos (Material / Precio)
function tablaPrecios(datos) {
  if (!Array.isArray(datos) || !datos.length) return "";
  const rows = datos.map((d) => {
    const mat = esc(d.material ?? d.material_nombre ?? d.material_id ?? "—");
    const precio = clp(d.precio ?? d.precio_clp_kg ?? d.precio_propuesto);
    return `<tr><td>${mat}</td><td class="precio">${precio}</td></tr>`;
  }).join("");
  return `<table class="diego-tabla"><thead><tr><th>Material</th>
    <th style="text-align:right">Precio/kg</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Fallback: si la respuesta trae una tabla en Markdown, la convierte a HTML limpio
// y devuelve además los items {material, precio_clp_kg} para la carga directa.
function tablaDesdeMarkdown(text) {
  const lines = String(text || "").split("\n");
  let start = -1, end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("|") && lines[i].trim()) { if (start < 0) start = i; end = i; }
    else if (start >= 0) break;
  }
  if (start < 0 || end <= start) return null;
  const block = lines.slice(start, end + 1)
    .filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l)); // saca la línea separadora ---|---
  if (block.length < 1) return null;
  const parse = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  const header = parse(block[0]);
  const bodyRows = block.slice(1).map(parse);
  if (!bodyRows.length) return null;
  const thead = `<tr>${header.map((h, i) => `<th${i > 0 ? ' style="text-align:right"' : ""}>${esc(h)}</th>`).join("")}</tr>`;
  const tbody = bodyRows.map((cells) =>
    `<tr>${cells.map((c, i) => `<td${i > 0 ? ' class="precio"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("");
  const rest = lines.slice(0, start).concat(lines.slice(end + 1)).join("\n").trim();
  const items = bodyRows.map((cells) => ({
    material: String(cells[0] ?? "").trim(),
    precio_clp_kg: parsePrecio(cells[1]),
  })).filter((x) => x.material && x.precio_clp_kg != null);
  return { html: `<table class="diego-tabla"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`, rest, items };
}

function pushRespuesta(reply, proposalId, datos) {
  const body = $("diegoChatBody");
  const el = document.createElement("div");
  el.className = "diego-msg theirs";
  let tabla = tablaPrecios(datos);
  let items = itemsDesdeDatos(datos);
  let texto = reply || "Listo.";
  if (!tabla) { // sin array estructurado: intento leer una tabla Markdown en el texto
    const md = tablaDesdeMarkdown(texto);
    if (md) { tabla = md.html; texto = md.rest || "Estos son los precios que leí:"; items = md.items || []; }
  }
  const sucursal = sucursalDesdeTexto(reply);
  // Botón determinístico: carga directa a Recibidos sin depender del modelo.
  const btnCargar = items.length
    ? `<button type="button" class="diego-cargar-btn" style="display:inline-block;margin-top:8px;margin-right:6px;background:#0369a1;color:#fff;border:0;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">✅ Cargar ${items.length} precios a Recibidos</button>`
    : "";
  el.innerHTML = `<div>${esc(texto)}</div>${tabla}${btnCargar}${accionCalculadora(proposalId)}`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  if (items.length) {
    const b = el.querySelector(".diego-cargar-btn");
    if (b) { b.dataset.items = JSON.stringify(items); b.dataset.sucursal = sucursal || ""; wireCargarBtn(b); }
  }
}

// Carga DIRECTA a Recibidos (sin LLM): pega a la EF con accion=cargar_lista_precios_directo.
async function cargarListaDirecto(items, sucursal) {
  const sess = await getSession().catch(() => null);
  const email = sess?.user?.email;
  const token = sess?.access_token;
  if (!email || !token) {
    pushMsg("⚠️ Para cargar los precios necesitas iniciar sesión en el panel.");
    return;
  }
  const estado = pushMsg("Cargando precios a Recibidos… ⏳");
  try {
    const resp = await fetch(EF_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "cargar_lista_precios_directo",
        sucursal: sucursal || undefined,
        items,
        user_email: email,
        request_id: crypto.randomUUID(),
      }),
    });
    const json = await resp.json().catch(() => ({}));
    estado.remove();
    if (!resp.ok) {
      pushMsg("❌ No pude cargar los precios (" + (json.error || ("HTTP " + resp.status)) + ").");
      return;
    }
    if (json.necesita_sucursal) { pedirSucursal(items); return; }
    renderResultadoCarga(json);
  } catch (err) {
    estado.remove();
    pushMsg("❌ Error de red al cargar: " + (err?.message || ""));
  }
}

// Si no se pudo deducir la sucursal, se la pide con 4 botones.
function pedirSucursal(items) {
  const body = $("diegoChatBody");
  const el = document.createElement("div");
  el.className = "diego-msg theirs";
  const itemsJson = JSON.stringify(items).replace(/"/g, "&quot;");
  el.innerHTML = `<div>¿A qué sucursal corresponde esta lista?</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">` +
    ["Cerrillos", "Maipú", "Talca", "Puerto Montt"].map((s) =>
      `<button type="button" class="diego-suc-btn" data-suc="${s}" data-items="${itemsJson}" style="background:#059669;color:#fff;border:0;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer">${s}</button>`
    ).join("") + `</div>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  el.querySelectorAll(".diego-suc-btn").forEach(wireSucBtn);
}

function renderResultadoCarga(json) {
  const body = $("diegoChatBody");
  const el = document.createElement("div");
  el.className = "diego-msg theirs";
  const dudosos = Array.isArray(json.dudosos) ? json.dudosos : [];
  let extra = "";
  if (dudosos.length) {
    const filas = dudosos.map((d) =>
      `<li>${esc(d.material)} — ${esc(d.motivo || "revisar")}</li>`).join("");
    extra = `<div style="margin-top:8px;font-size:12px;color:#92400e"><b>Para revisar (no cargados):</b>
      <ul style="margin:4px 0 0 16px">${filas}</ul></div>`;
  }
  el.innerHTML = `<div>✅ ${esc(json.reply || "Precios cargados.")}</div>${extra}
    <a href="/?vista=recibidos" style="display:inline-block;margin-top:8px;background:#059669;
      color:#fff;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">Ver en Recibidos →</a>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

// ─── Adjuntar (staging: se guarda, se envía al Enviar) ─────────────────
function leerDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No pude leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function onImageSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    pushMsg("⚠️ Adjunta una imagen (foto o captura de la lista de precios).");
    return;
  }
  try {
    const dataUrl = await leerDataUrl(file);
    _staged = { file, dataUrl };
    $("diegoAttachName").textContent = "📎 " + file.name;
    $("diegoAttachPreview").style.display = "flex";
    $("diegoChatInput").focus();
  } catch (err) {
    pushMsg("❌ " + err.message);
  }
}

function limpiarAdjunto() {
  _staged = null;
  $("diegoAttachPreview").style.display = "none";
  $("diegoAttachName").textContent = "";
}

// ─── Subida a Storage (para la EF viva) ────────────────────────────────
async function subirImagen(file, email) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${email || "web"}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { data, error } = await getClient().storage.from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error("No pude subir la imagen: " + error.message);
  return { file_url: data.path, file_mime: file.type, file_name: file.name };
}

// ─── Envío multimodal ──────────────────────────────────────────────────
async function onSubmit(e) {
  e.preventDefault();
  const input = $("diegoChatInput");
  const texto = input.value.trim();
  const staged = _staged;
  if (!texto && !staged) return;

  // Burbuja del usuario (texto + miniatura)
  pushMio(texto, staged?.dataUrl || null, staged?.file?.name);
  input.value = "";
  limpiarAdjunto();

  // Sesión real obligatoria (la EF viva rechaza anónimo con 401)
  const sess = await getSession().catch(() => null);
  const email = sess?.user?.email;
  const token = sess?.access_token;
  if (!email || !token) {
    pushMsg("⚠️ Para que Diego procese esto necesitas iniciar sesión en el panel (mismo navegador).");
    return;
  }

  const cargando = pushMsg(staged ? "Analizando lista de precios… ⏳" : "Pensando… ⏳");

  try {
    // Si hay imagen: la subo a Storage (file_url para la EF viva) y ya tengo su Base64.
    let attach = null;
    if (staged) attach = await subirImagen(staged.file, email);

    // Payload: forma pedida { texto, imagenBase64 } + compatibilidad con la EF viva.
    const payload = {
      texto: texto,                                   // ← pedido
      imagenBase64: staged?.dataUrl || null,          // ← pedido (data:image...;base64,...)
      // --- compatibilidad EF diego-chat-process actual ---
      mensaje: texto || (staged ? "Adjunto una lista de precios; extraé material, sucursal y precio." : ""),
      user_email: email,
      request_id: crypto.randomUUID(),
      // Contexto del hilo: permite que Diego recuerde la lista al recibir "CONFIRMAR".
      conversacion_previa: _historial.slice(-8),
      ...(attach ? { file_url: attach.file_url, file_mime: attach.file_mime, file_name: attach.file_name } : {}),
    };

    const resp = await fetch(EF_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await resp.text();
    let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { reply: raw }; }

    cargando.remove();
    if (!resp.ok) {
      pushMsg(resp.status === 401
        ? "⚠️ Tu sesión expiró. Cierra y vuelve a abrir el panel, e inténtalo de nuevo."
        : "❌ Diego no pudo procesar esto (" + (json.error || ("HTTP " + resp.status)) + ").");
      return;
    }
    const proposalId = json.proposalId ?? json.propuesta_id ?? json.propuesta?.id ?? null;
    const datos = json.datos_extraidos ?? json.datosExtraidos ?? null;
    pushRespuesta(json.reply, proposalId, datos);

    // Guardar el turno para el próximo mensaje (contexto del CONFIRMAR).
    _historial.push({ role: "user", content: payload.mensaje || texto || "(imagen adjunta)" });
    _historial.push({ role: "assistant", content: String(json.reply || "") });
    if (_historial.length > 16) _historial = _historial.slice(-16);
  } catch (err) {
    cargando.textContent = "❌ " + (err?.message || "Error de red") + ". Inténtalo de nuevo en un momento.";
  }
}

// ─── Abrir / cerrar / minimizar (modal + backdrop) ─────────────────────
function open() {
  $("diegoChat").classList.add("open");
  $("diegoChat").classList.remove("minimized");
  $("diegoBackdrop").classList.add("open");
  $("diegoFab").style.display = "none";
  $("diegoChatInput").focus();
  guardarChat();
}
function close() {
  $("diegoChat").classList.remove("open", "minimized");
  $("diegoBackdrop").classList.remove("open");
  $("diegoFab").style.display = "flex";
  guardarChat();
}
function toggleMinimize() {
  const min = $("diegoChat").classList.toggle("minimized");
  $("diegoBackdrop").classList.toggle("open", !min); // sin backdrop cuando está minimizado
  guardarChat();
}

// ─── Eventos ───────────────────────────────────────────────────────────
export function initDiego() {
  $("diegoFab").addEventListener("click", open);
  $("diegoChatClose").addEventListener("click", close);
  $("diegoBackdrop").addEventListener("click", close);
  $("diegoChatMinimize").addEventListener("click", toggleMinimize);
  $("diegoChatHeader").addEventListener("dblclick", toggleMinimize);
  $("diegoAttachBtn").addEventListener("click", () => $("diegoFileInput").click());
  $("diegoFileInput").addEventListener("change", onImageSelected);
  $("diegoAttachRemove").addEventListener("click", limpiarAdjunto);
  $("diegoChatForm").addEventListener("submit", onSubmit);

  // Enter envía · Shift+Enter hace salto de línea.
  $("diegoChatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("diegoChatForm").requestSubmit(); }
  });

  // Persistencia: cualquier cambio en el hilo se guarda (sobrevive recarga y cambio de vista).
  new MutationObserver(guardarChatDebounced)
    .observe($("diegoChatBody"), { childList: true, subtree: true });

  restaurarChat();
}
