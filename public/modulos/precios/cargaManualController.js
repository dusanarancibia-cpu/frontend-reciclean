// CONTROLADOR · Carga manual. Primera etapa del flujo: aquí caen los datos en crudo,
// se revisan a ojo y recién entonces se guardan.
//
// Tres orígenes, un solo camino de revisión:
//   1. a mano, fila por fila
//   2. archivo CSV/Excel (SheetJS con SRI, se carga solo si hace falta)
//   3. OCR de Diego → llega por el buzón de traspaso, SIN haber tocado la base
//
// Solo se piden Material, Precio Venta (lo que nos paga la fundición) y Vigencia:
// la sucursal y el precio público los asigna gerencia después, en la Calculadora.
import { getClient, getSession } from "../../shared/js/supabase.js";
import { cargarFilas, pasarAPendiente, listarBorradores, empresasClientes } from "./flujoRepo.js";
import { escapeHTML } from "../../shared/js/util.js";
import { tomarParaCargaManual } from "../../shared/js/traspaso.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
// Empresa/cliente global fijada para toda la hoja (null = cada fila define la suya).
let _empresaGlobal = null;
// Normaliza texto para emparejar (minúsculas, sin acentos, espacios colapsados).
const normId = (s) => String(s ?? "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

let _optMat = "";       // <option>s del datalist (autocompletado)
let _matByName = new Map();  // normId(nombre) → material_id
let _nameById = new Map();   // material_id → nombre (para mostrar el canónico)
let _email = null;

// CACHÉ del catálogo para el autocompletado: se consulta la BD UNA vez por sesión de página
// y se filtra en memoria (el datalist ya filtra local). Volver a entrar a Carga Manual no
// vuelve a pegarle a Supabase. Es una promesa para que llamadas concurrentes compartan la
// misma consulta en vuelo. `refrescarCacheMateriales()` la invalida si hiciera falta.
let _cacheMateriales = null;
function cargarMateriales() {
  if (_cacheMateriales) return _cacheMateriales;
  _cacheMateriales = getClient()
    .from("materiales_panel")
    .select("material_id, nombre_interno")
    .eq("activo", true).order("nombre_interno").limit(2000)
    .then(({ data, error }) => {
      if (error) { _cacheMateriales = null; throw error; }   // no cachees un fallo
      return data || [];
    });
  return _cacheMateriales;
}
export function refrescarCacheMateriales() { _cacheMateriales = null; }

// Fecha de hoy en formato YYYY-MM-DD, con la hora LOCAL (no UTC, que cerca de medianoche
// devolvería el día equivocado). La vigencia del modelo es por día.
function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// El material se ingresa por un combobox (input + <datalist>): filtra en tiempo real a
// medida que se escribe, y acepta seleccionar de la lista. El value es el NOMBRE; el
// material_id se resuelve al enviar contra _matByName. Ventaja sobre el <select>: se puede
// escribir para encontrar entre cientos de materiales sin scrollear.
function filaHTML() {
  return `<tr class="cmRow">
    <td><input class="cmMat cm-cell" list="cmMatList" autocomplete="off" placeholder="Escribe para buscar…"></td>
    <td><input class="cmEmpresa cm-cell" autocomplete="off" placeholder="Cliente (opcional)"></td>
    <td><input type="number" class="cmPrecio cm-cell" style="text-align:right" min="0" step="1" placeholder="0"></td>
    <td><input type="date" class="cmFecha cm-cell" value="${hoyISO()}"></td>
    <td style="text-align:center;padding:0 6px">
      <button type="button" class="cmDel" title="Quitar fila"
        style="background:#fff;border:1px solid #fca5a5;color:#b91c1c;width:26px;height:26px;border-radius:6px;font-weight:700;cursor:pointer">×</button>
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
  // Si hay una empresa global fijada, la fila nueva también nace con ella (rellenada+bloqueada).
  if (_empresaGlobal != null) bloquearEmpresa(tr, _empresaGlobal);
  return tr;
}

// ── Empresa/Cliente global (fija y bloquea la columna Empresa en todas las filas) ──────
function bloquearEmpresa(tr, nombre) {
  const inp = tr.querySelector(".cmEmpresa");
  if (!inp) return;
  inp.value = nombre;
  inp.readOnly = true;
}
function liberarEmpresaFila(tr) {
  const inp = tr.querySelector(".cmEmpresa");
  if (inp) inp.readOnly = false;
}
function aplicarEmpresaGlobal(nombre) {
  _empresaGlobal = nombre;
  [...$("cmBody").querySelectorAll(".cmRow")].forEach((tr) => bloquearEmpresa(tr, nombre));
}
function liberarEmpresaGlobal() {
  _empresaGlobal = null;
  [...$("cmBody").querySelectorAll(".cmRow")].forEach(liberarEmpresaFila);
}

// ── Lectura de archivos ───────────────────────────────────────────────────────
function parseNum(s) {
  const n = String(s ?? "").replace(/[^\d]/g, ""); // CLP entero: solo dígitos
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

// SheetJS desde CDN solo cuando hace falta leer un .xlsx. Versión FIJA + SRI: si el CDN
// devolviera un archivo alterado, el navegador lo rechaza y no ejecuta código no verificado.
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

// De [encabezado, ...filas] → objetos {material, precio, vigencia}.
// Acepta varios nombres de columna porque cada planilla viene distinta.
function matrizAObjetos(matriz) {
  if (!matriz.length) return [];
  const headers = matriz[0].map((h) => normId(h));
  const col = (cands) => headers.findIndex((h) => cands.some((c) => h.includes(c)));
  const iMat = col(["material"]);
  const iEmp = col(["empresa", "cliente", "fundicion", "fundición"]);
  const iPre = col(["precio", "venta", "valor"]);
  const iVig = col(["vigencia", "fecha"]);
  return matriz.slice(1).map((r) => ({
    material: iMat >= 0 ? r[iMat] : "",
    empresa:  iEmp >= 0 ? r[iEmp] : "",
    precio:   iPre >= 0 ? r[iPre] : "",
    vigencia: iVig >= 0 ? r[iVig] : "",
  }));
}

// Vuelca filas en la tabla editable. Es el punto común de Excel y del OCR de Diego:
// lo que no se reconoce queda en ámbar para que el usuario lo corrija a ojo.
function volcarFilas(objetos, etiquetaOrigen) {
  $("cmBody").innerHTML = "";
  let sinReconocer = 0;
  objetos.forEach((o) => {
    const matId = _matByName.get(normId(o.material)) || "";
    const tr = agregarFila();
    // El combobox muestra el NOMBRE: si se reconoció, el canónico del catálogo; si no, el
    // texto crudo para que el usuario lo corrija a ojo (queda en ámbar).
    tr.querySelector(".cmMat").value = matId ? (_nameById.get(matId) || o.material || "") : (o.material || "");
    // Si hay empresa global fijada, ella manda (toda la hoja es de esa empresa) y la celda
    // ya quedó rellenada+bloqueada por agregarFila; si no, se usa la del archivo.
    if (_empresaGlobal == null && o.empresa) tr.querySelector(".cmEmpresa").value = o.empresa;
    const precio = parseNum(o.precio);
    if (Number.isFinite(precio)) tr.querySelector(".cmPrecio").value = precio;
    const fecha = aFechaISO(o.vigencia);
    if (fecha) tr.querySelector(".cmFecha").value = fecha;
    if (!matId) {
      sinReconocer++;
      tr.style.background = "#fffbeb"; // ámbar suave
      tr.title = `No reconocí "${o.material}" en el catálogo: elígelo a mano.`;
    }
  });
  if (!$("cmBody").querySelector(".cmRow")) agregarFila();
  $("cmInfo").textContent = `${etiquetaOrigen} ${objetos.length} fila(s).` +
    (sinReconocer
      ? ` ${sinReconocer} sin reconocer el material (fondo ámbar): complétalas a mano.`
      : " Revisa y presiona Enviar a Pendientes.");
  return sinReconocer;
}

async function onImportar(file) {
  if (!file) return;
  $("cmInfo").textContent = "Leyendo archivo…";
  try {
    const nombre = file.name.toLowerCase();
    const matriz = (nombre.endsWith(".xlsx") || nombre.endsWith(".xls"))
      ? await leerXlsx(file) : parseCSV(await file.text());
    const objetos = matrizAObjetos(matriz);
    if (!objetos.length) { $("cmInfo").textContent = "El archivo no tiene filas de datos."; return; }
    volcarFilas(objetos, "Importadas");
  } catch (e) {
    $("cmInfo").textContent = "No pude leer el archivo: " + e.message +
      " (si es Excel, prueba guardarlo como CSV).";
  }
}

// Plantilla de ejemplo. Se genera como .xls (HTML que Excel abre nativo) para que el
// usuario reciba literalmente "un Excel", sin depender de SheetJS solo para descargar.
function descargarPlantilla() {
  const ejemplos = [
    ["Cobre 1 Tubo", 7050, "2026-08-01"],
    ["Aluminio Off Set", 1436, "2026-08-01"],
    ["Lata chatarra", 190, ""],
  ];
  const filas = ejemplos.map((e) =>
    `<tr><td>${esc(e[0])}</td><td>${e[1]}</td><td>${e[2]}</td></tr>`).join("");
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head>
    <meta charset="utf-8"></head><body><table border="1">
    <thead><tr><th>material</th><th>precio</th><th>vigencia</th></tr></thead>
    <tbody>${filas}</tbody></table></body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
  a.download = "ejemplo_carga_precios.xls";
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Envío ─────────────────────────────────────────────────────────────────────
function recolectar() {
  const filas = [...$("cmBody").querySelectorAll(".cmRow")];
  const payloads = [];
  const errores = [];
  filas.forEach((tr, i) => {
    const nombre = tr.querySelector(".cmMat").value.trim();
    const mat = _matByName.get(normId(nombre)) || "";   // resuelve nombre → material_id
    const empresa = tr.querySelector(".cmEmpresa").value.trim();
    const precioTxt = tr.querySelector(".cmPrecio").value;
    const precio = parseFloat(precioTxt);
    const fecha = tr.querySelector(".cmFecha").value || null;
    if (!nombre && !precioTxt) return;                   // fila vacía: se ignora
    if (!mat) {
      errores.push(`Fila ${i + 1}: material "${nombre}" no está en el catálogo (elígelo de la lista).`);
      return;
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      errores.push(`Fila ${i + 1}: precio inválido.`); return;
    }
    payloads.push({
      material_id: mat,
      empresa_cliente: empresa || null,
      precio_recibido_clp: precio,
      vigencia_desde: fecha,
    });
  });
  return { payloads, errores };
}

async function onEnviar() {
  const { payloads, errores } = recolectar();
  if (errores.length) { $("cmInfo").textContent = "" + errores.join("  "); return; }
  if (!payloads.length) { $("cmInfo").textContent = "No hay filas con datos para enviar."; return; }

  $("cmEnviar").disabled = true;
  $("cmInfo").textContent = `Enviando ${payloads.length} precio(s)…`;
  try {
    const origen = $("cmBody").dataset.origen || "carga_manual";
    await cargarFilas(payloads, origen);

    // Las filas entran como 'crudo'; se mueven a 'pendiente' de inmediato porque el
    // usuario ya las revisó en esta pantalla (que es justamente para eso).
    const recien = await listarBorradores({ estados: ["crudo"], limite: payloads.length });
    if (recien.length) await pasarAPendiente(recien.map((r) => r.id));

    $("cmBody").innerHTML = ""; agregarFila();
    $("cmBody").dataset.origen = "carga_manual";
    $("cmOrigen").classList.add("hidden");
    $("cmInfo").textContent = `${payloads.length} precio(s) enviado(s) a Pendientes.`;
  } catch (e) {
    $("cmInfo").textContent = "No pude cargar: " + e.message;
  } finally {
    $("cmEnviar").disabled = false;
  }
}

export async function mountCargaManual() {
  const body = $("cmBody");
  try {
    // El catálogo sale del caché (1 sola consulta por sesión de página); la sesión se lee
    // aparte. Ambas en paralelo.
    const [mats, sess, empresas] = await Promise.all([
      cargarMateriales(),
      getSession().catch(() => null),
      empresasClientes().catch(() => []),
    ]);

    _email = sess?.user?.email || null;
    // Opciones del datalist: el value es el NOMBRE (lo que se escribe y autocompleta).
    _optMat = (mats || []).map((m) =>
      `<option value="${esc(m.nombre_interno)}"></option>`).join("");
    _matByName = new Map((mats || []).map((m) => [normId(m.nombre_interno), m.material_id]));
    _nameById  = new Map((mats || []).map((m) => [m.material_id, m.nombre_interno]));
    const dl = $("cmMatList");
    if (dl) dl.innerHTML = _optMat;

    // Selector global de empresa: solo empresas ya existentes (se administran en el Catálogo).
    // Ya NO se pueden crear empresas desde aquí.
    const selG = $("cmEmpresaGlobal");
    if (selG && empresas.length) {
      selG.insertAdjacentHTML("beforeend",
        empresas.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join(""));
    }
    _empresaGlobal = null;

    body.innerHTML = "";
    agregarFila();   // arranca con UNA sola fila; el resto se agrega con "+ Agregar fila"

    // Al elegir empresa: fija+bloquea todas las filas; "— sin fijar —" libera la columna.
    selG?.addEventListener("change", () => {
      if (selG.value === "") liberarEmpresaGlobal();
      else aplicarEmpresaGlobal(selG.value);
    });

    $("cmAddRow").addEventListener("click", agregarFila);
    $("cmEnviar").addEventListener("click", onEnviar);
    $("cmPlantilla").addEventListener("click", descargarPlantilla);
    $("cmImportBtn").addEventListener("click", () => $("cmFileInput").click());
    $("cmFileInput").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      onImportar(f); e.target.value = ""; // permite reimportar el mismo archivo
    });
    $("cmInfo").textContent = _email ? `Sesión: ${_email}` : "Sin sesión — inicia sesión antes de enviar.";

    // ── Traspaso desde el OCR de Diego ──────────────────────────────────────
    // Diego NO escribe en la base: deja lo leído en el buzón y el usuario lo revisa acá.
    const traspaso = tomarParaCargaManual();
    if (traspaso?.items?.length) {
      const sinReconocer = volcarFilas(
        traspaso.items.map((i) => ({
          material: i.material,
          precio: i.precio_clp_kg,
          vigencia: "",
        })),
        "Diego leyó",
      );
      body.dataset.origen = traspaso.origen || "ocr_diego";
      const aviso = $("cmOrigen");
      aviso.innerHTML = `<b>${traspaso.items.length} precio(s) leídos por Diego desde una imagen.</b> ` +
        `Todavía <b>no se ha guardado nada</b>: revísalos${
          sinReconocer ? `, corrige los ${sinReconocer} en ámbar` : ""
        } y presiona “Enviar a Pendientes”.`;
      aviso.classList.remove("hidden");
    }
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-rose-600">No pude cargar el formulario: ${esc(e.message)}</td></tr>`;
  }
}
