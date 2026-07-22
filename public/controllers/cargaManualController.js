// CONTROLADOR · Carga manual. Tabla editable (fluida, sin scroll horizontal) para
// cargar varios precios a mano o desde un archivo CSV/Excel, y mandarlos a Recibidos.
// Escribe en staging.precios_propuestos respetando las FK (ruta='andrea', estado='pendiente').
// El archivo se empareja POR NOMBRE de material y sucursal contra el catálogo.
import { getClient, getSession } from "../models/supabase.js";
import { escapeHTML } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML; // helper único (cubre < > & " '); usado en los <option> y filas (innerHTML)
const INP = "border border-stone-300 rounded px-2 py-1.5 text-sm bg-white";
// Normaliza texto para comparar/emparejar (minúsculas, sin acentos, espacios colapsados).
const normId = (s) => String(s ?? "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

let _optMat = "";           // <option> de materiales
let _optSuc = "";           // <option> de sucursales
let _matByName = new Map(); // nombre normalizado -> material_id
let _sucByName = new Map(); // nombre normalizado -> sucursal_id
let _email = null;

function filaHTML() {
  return `<tr class="cmRow hover:bg-stone-50">
    <td class="px-3 py-2"><select class="cmMat ${INP}" style="width:100%"><option value="">— material —</option>${_optMat}</select></td>
    <td class="px-3 py-2"><select class="cmSuc ${INP}" style="width:100%"><option value="">— sucursal —</option>${_optSuc}</select></td>
    <td class="px-3 py-2"><input type="number" class="cmCompra ${INP}" style="width:100%;text-align:right" min="0" step="1" placeholder="0"></td>
    <td class="px-3 py-2"><input type="number" class="cmVenta ${INP}" style="width:100%;text-align:right" min="0" step="1" placeholder="0"></td>
    <td class="px-3 py-2"><input type="date" class="cmFecha ${INP}" style="width:100%"></td>
    <td class="px-2 py-2 text-center">
      <button type="button" class="cmDel" title="Quitar fila"
        style="background:#fff;border:1px solid #fca5a5;color:#b91c1c;width:28px;height:28px;border-radius:6px;font-weight:700;cursor:pointer">×</button>
    </td>
  </tr>`;
}

function wireFila(tr) {
  tr.querySelector(".cmDel").addEventListener("click", () => {
    const body = $("cmBody");
    tr.remove();
    if (!body.querySelector(".cmRow")) agregarFila();
  });
}

function agregarFila() {
  const body = $("cmBody");
  body.insertAdjacentHTML("beforeend", filaHTML());
  const tr = body.lastElementChild;
  wireFila(tr);
  return tr;
}

// ── Importación de archivo ────────────────────────────────────────────────────
function parseNum(s) {
  const n = String(s ?? "").replace(/[^\d]/g, ""); // CLP entero: deja solo dígitos
  return n ? parseInt(n, 10) : NaN;
}
function aFechaISO(s) {
  s = String(s || "").trim(); if (!s) return "";
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/))) {
    const d = m[1].padStart(2, "0"), mo = m[2].padStart(2, "0");
    let y = m[3]; if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }
  return "";
}

// CSV quote-aware, autodetecta separador ',' o ';' (Excel Chile suele usar ';').
function parseCSV(text) {
  const s = String(text).replace(/\r\n?/g, "\n");
  const primera = s.split("\n")[0] || "";
  const sep = (primera.split(";").length > primera.split(",").length) ? ";" : ",";
  const out = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); out.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim() !== ""));
}

// Carga SheetJS desde CDN solo cuando hace falta leer un .xlsx.
// Versión FIJA + SRI (integrity/crossorigin): si el CDN devolviera un archivo alterado,
// el navegador lo rechaza y salta onerror (no ejecuta código no verificado).
function cargarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    sc.integrity = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
    sc.crossOrigin = "anonymous";
    sc.onload = () => resolve(window.XLSX);
    sc.onerror = () => reject(new Error("no pude cargar el lector de Excel"));
    document.head.appendChild(sc);
  });
}
async function leerXlsx(file) {
  const XLSX = await cargarSheetJS();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })
    .filter((r) => r.some((c) => String(c).trim() !== ""));
}

// De una matriz [filaEncabezado, ...filas] → objetos {material,sucursal,compra,venta,vigencia}
function matrizAObjetos(matriz) {
  if (!matriz.length) return [];
  const headers = matriz[0].map((h) => normId(h));
  const col = (cands) => headers.findIndex((h) => cands.some((c) => h.includes(c)));
  const iMat = col(["material"]), iSuc = col(["sucursal", "sucur"]),
    iCom = col(["compra"]), iVen = col(["venta"]), iVig = col(["vigencia", "fecha"]);
  return matriz.slice(1).map((r) => ({
    material: iMat >= 0 ? r[iMat] : "",
    sucursal: iSuc >= 0 ? r[iSuc] : "",
    compra: iCom >= 0 ? r[iCom] : "",
    venta: iVen >= 0 ? r[iVen] : "",
    vigencia: iVig >= 0 ? r[iVig] : "",
  }));
}

function volcarImportadas(objetos) {
  $("cmBody").innerHTML = "";
  let sinReconocer = 0;
  objetos.forEach((o) => {
    const matId = _matByName.get(normId(o.material)) || "";
    const sucId = _sucByName.get(normId(o.sucursal)) || "";
    const tr = agregarFila();
    if (matId) tr.querySelector(".cmMat").value = matId;
    if (sucId) tr.querySelector(".cmSuc").value = sucId;
    const compra = parseNum(o.compra), venta = parseNum(o.venta);
    if (Number.isFinite(compra)) tr.querySelector(".cmCompra").value = compra;
    if (Number.isFinite(venta)) tr.querySelector(".cmVenta").value = venta;
    const fecha = aFechaISO(o.vigencia); if (fecha) tr.querySelector(".cmFecha").value = fecha;
    if (!matId || !sucId) {
      sinReconocer++;
      tr.style.background = "#fffbeb"; // ámbar suave
      tr.title = "Revisa material/sucursal: no se reconoció exactamente del archivo.";
    }
  });
  if (!$("cmBody").querySelector(".cmRow")) agregarFila();
  $("cmInfo").textContent = `📄 Importadas ${objetos.length} fila(s).` +
    (sinReconocer ? ` ⚠️ ${sinReconocer} sin reconocer material/sucursal (fondo ámbar): complétalas a mano.` : " Revisa y presiona Enviar a Recibidos.");
}

async function onImportar(file) {
  if (!file) return;
  $("cmInfo").textContent = "Leyendo archivo…";
  try {
    const nombre = file.name.toLowerCase();
    let matriz;
    if (nombre.endsWith(".xlsx") || nombre.endsWith(".xls")) matriz = await leerXlsx(file);
    else matriz = parseCSV(await file.text());
    const objetos = matrizAObjetos(matriz);
    if (!objetos.length) { $("cmInfo").textContent = "El archivo no tiene filas de datos."; return; }
    volcarImportadas(objetos);
  } catch (e) {
    $("cmInfo").textContent = "❌ No pude leer el archivo: " + e.message + " (si es Excel, prueba guardarlo como CSV).";
  }
}

function descargarPlantilla() {
  const csv = "material,sucursal,compra,venta,vigencia\nCobre 1 Tubo,Cerrillos,4468,7050,\nAluminio Off Set,Maipu,976,1436,\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "plantilla_carga_precios.csv";
  a.click(); URL.revokeObjectURL(a.href);
}

// ── Envío a Recibidos ─────────────────────────────────────────────────────────
function recolectar() {
  const filas = [...$("cmBody").querySelectorAll(".cmRow")];
  const payloads = [];
  const errores = [];
  filas.forEach((tr, i) => {
    const mat = tr.querySelector(".cmMat").value;
    const suc = tr.querySelector(".cmSuc").value;
    const compra = parseFloat(tr.querySelector(".cmCompra").value);
    const venta = parseFloat(tr.querySelector(".cmVenta").value);
    const fecha = tr.querySelector(".cmFecha").value || null;
    if (!mat && !suc && !tr.querySelector(".cmCompra").value && !tr.querySelector(".cmVenta").value) return;
    if (!mat || !suc) { errores.push(`Fila ${i + 1}: elige material y sucursal.`); return; }
    if (!Number.isFinite(venta) || venta <= 0) { errores.push(`Fila ${i + 1}: precio de venta inválido.`); return; }
    if (Number.isFinite(compra) && compra > venta) { errores.push(`Fila ${i + 1}: la venta no puede ser menor que la compra.`); return; }
    payloads.push({
      material_id: mat, sucursal_id: suc, precio_clp_kg: venta,
      fecha_vigencia: fecha, confidence_score: 1.0, ruta: "andrea",
      origen: "carga_manual_panel", estado: "pendiente", creado_por: _email,
      metadata: { origen: "carga_manual_panel", precio_compra_clp: Number.isFinite(compra) ? compra : null, cargado_por: _email },
    });
  });
  return { payloads, errores };
}

async function onEnviar() {
  const { payloads, errores } = recolectar();
  if (errores.length) { $("cmInfo").textContent = "⚠️ " + errores.join("  "); return; }
  if (!payloads.length) { $("cmInfo").textContent = "No hay filas con datos para enviar."; return; }
  $("cmEnviar").disabled = true;
  $("cmInfo").textContent = `Enviando ${payloads.length} precio(s)…`;
  const { error } = await getClient().schema("staging").from("precios_propuestos").insert(payloads);
  $("cmEnviar").disabled = false;
  if (error) { $("cmInfo").textContent = "❌ No pude cargar: " + error.message + " (¿sesión iniciada?)"; return; }
  $("cmBody").innerHTML = ""; agregarFila();
  $("cmInfo").textContent = `✅ ${payloads.length} precio(s) enviado(s) a Recibidos.`;
}

export async function mountCargaManual() {
  const body = $("cmBody");
  try {
    const sb = getClient();
    const [{ data: mats, error: em }, { data: sucs, error: es }, sess] = await Promise.all([
      sb.schema("curated").from("materiales").select("material_id, nombre").order("nombre").limit(2000),
      sb.schema("curated").from("sucursales").select("sucursal_id, nombre").order("nombre").limit(200),
      getSession().catch(() => null),
    ]);
    if (em) throw em;
    if (es) throw es;
    _email = sess?.user?.email || null;
    _optMat = (mats || []).map((m) => `<option value="${esc(m.material_id)}">${esc(m.nombre)}</option>`).join("");
    _optSuc = (sucs || []).map((s) => `<option value="${esc(s.sucursal_id)}">${esc(s.nombre)}</option>`).join("");
    _matByName = new Map((mats || []).map((m) => [normId(m.nombre), m.material_id]));
    _sucByName = new Map((sucs || []).map((s) => [normId(s.nombre), s.sucursal_id]));

    body.innerHTML = "";
    agregarFila(); agregarFila();

    $("cmAddRow").addEventListener("click", agregarFila);
    $("cmEnviar").addEventListener("click", onEnviar);
    $("cmPlantilla").addEventListener("click", descargarPlantilla);
    $("cmImportBtn").addEventListener("click", () => $("cmFileInput").click());
    $("cmFileInput").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      onImportar(f); e.target.value = ""; // permite reimportar el mismo archivo
    });
    $("cmInfo").textContent = _email ? `Sesión: ${_email}` : "⚠️ Sin sesión detectada — inicia sesión antes de enviar.";
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-rose-600">❌ No pude cargar el formulario: ${esc(e.message)}</td></tr>`;
  }
}
