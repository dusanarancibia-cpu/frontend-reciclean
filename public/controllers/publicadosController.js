// CONTROLADOR · Publicados. Absorbió a la antigua "Vitrina pública".
//
// Una fila por MATERIAL, con:
//   · una columna por sucursal con el precio vigente ahí (lo que le pagamos a la gente)
//   · una casilla por empresa que decide si aparece en esa web
//
// POR QUÉ UNA FILA POR MATERIAL Y NO POR MATERIAL×SUCURSAL: la visibilidad se decide por
// material y empresa (precios_v3.catalogo_publico tiene PK (empresa_id, material_id)), así
// que una tabla por par obligaría a repetir la misma casilla 4 veces y a preguntarse cuál
// manda. La matriz deja explícito lo que es único por material y lo que varía por sucursal.
//
// Las columnas de sucursal se construyen desde los datos: agregar una sucursal nueva no
// requiere tocar código ni la vista.
import { listarPrecios, listarVitrina, publicarMaterial, rolDesdeToken } from "../models/preciosRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML, normalizarTexto } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));

// Las webs que existen. Si mañana hay una tercera empresa, se agrega acá.
const EMPRESAS = [
  { id: "farex", etiqueta: "FAREX" },
  { id: "reciclean_spa", etiqueta: "Reciclean" },
];

let _filas = [];        // una por material, ya fusionada
let _sucursales = [];   // [{ sucursal_id, nombre }]
let _tabla = null;
let _rol = "lector";

export async function mountPublicados() {
  const body = $("publicadosBody");

  try {
    // Las dos fuentes son independientes y ninguna depende de la otra: van en paralelo.
    const [precios, vitrina] = await Promise.all([listarPrecios(), listarVitrina()]);

    _rol = precios[0]?.mi_rol || vitrina[0]?.mi_rol || (await rolDesdeToken()) || "lector";
    _sucursales = sucursalesDesde(precios);
    _filas = fusionar(precios, vitrina);

    pintarRol();
    pintarCabecera();
    pintarSelectorSucursal();

    if (!_filas.length) {
      body.innerHTML = filaVacia("Sin materiales en el catálogo.");
      return;
    }

    _tabla = montarTabla({
      tbody: body, thead: $("publicadosHead"), info: $("publicadosInfo"), pager: $("publicadosPager"),
      rows: visibles(), renderRow, colspan: totalColumnas(), pageSize: 25,
      vacio: "Sin materiales que coincidan.",
      sortInicial: { key: "material", dir: "asc" },
      sorters: sorters(),
      infoText: (t, p, pg) => `${t} material(es) · página ${p} de ${pg}.`,
      onRender: cablearChecks,
    });

    cablearControles();
    actualizarResumen();
  } catch (e) {
    body.innerHTML = filaVacia("❌ No pude cargar los publicados: " + esc(e.message));
  }
}

const filaVacia = (txt) =>
  `<tr><td colspan="${totalColumnas()}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

const totalColumnas = () => 1 + _sucursales.length + EMPRESAS.length;

// ── Fusión de las dos fuentes ─────────────────────────────────────────────────
function sucursalesDesde(precios) {
  const m = new Map();
  precios.forEach((p) => { if (p.sucursal_id) m.set(p.sucursal_id, p.sucursal); });
  return [...m.entries()]
    .map(([sucursal_id, nombre]) => ({ sucursal_id, nombre }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

// Se parte de la vitrina (tiene TODO el catálogo, con o sin precio) y se le cuelgan los
// precios. Al revés se perderían los materiales activos que aún no tienen precio, que son
// justo los que gerencia necesita detectar.
function fusionar(precios, vitrina) {
  const porMaterial = new Map();
  vitrina.forEach((v) => {
    porMaterial.set(v.material_id, {
      material_id: v.material_id,
      material: v.material,
      visible: v.visible || {},
      precios: {},           // sucursal_id → { precio, vigencia, requiere_revision }
      revisar: false,
    });
  });

  precios.forEach((p) => {
    let f = porMaterial.get(p.material_id);
    if (!f) {
      // Precio de un material que no está en el catálogo público: se muestra igual, para
      // que no quede invisible en el panel.
      f = { material_id: p.material_id, material: p.material, visible: {}, precios: {}, revisar: false };
      porMaterial.set(p.material_id, f);
    }
    f.precios[p.sucursal_id] = {
      precio: p.precio_publicado_clp,
      vigencia: p.vigencia_desde,
      requiere_revision: !!p.requiere_revision,
    };
    if (p.requiere_revision) f.revisar = true;
  });

  return [...porMaterial.values()];
}

// ── Cabecera dinámica ─────────────────────────────────────────────────────────
function pintarCabecera() {
  const head = $("publicadosHead");
  if (!head) return;
  const suc = _sucursales.filter(enFiltroSucursal)
    .map((s) => `<th class="text-right px-4 py-2.5" data-sort="suc_${esc(s.sucursal_id)}">${esc(s.nombre)}</th>`)
    .join("");
  const emp = EMPRESAS
    .map((e) => `<th class="text-center px-4 py-2.5" data-sort="emp_${esc(e.id)}">${esc(e.etiqueta)}</th>`)
    .join("");
  head.innerHTML = `<tr>
    <th class="text-left px-4 py-2.5" data-sort="material">Material</th>
    ${suc}${emp}
  </tr>`;
}

// El orden acepta cualquier columna, incluidas las que se generan en runtime.
function sorters() {
  const s = { material: (r) => r.material || "" };
  _sucursales.forEach((x) => {
    s["suc_" + x.sucursal_id] = (r) => Number(r.precios[x.sucursal_id]?.precio ?? -1);
  });
  EMPRESAS.forEach((e) => { s["emp_" + e.id] = (r) => (r.visible[e.id] ? 1 : 0); });
  return s;
}

// ── Filas ─────────────────────────────────────────────────────────────────────
function renderRow(r) {
  const editable = _rol === "gerencia";

  const celdasPrecio = _sucursales.filter(enFiltroSucursal).map((s) => {
    const p = r.precios[s.sucursal_id];
    if (!p || p.precio == null) {
      return `<td class="px-4 py-2.5 text-right text-stone-300">—</td>`;
    }
    // Los precios migrados del modelo antiguo tienen semántica dudosa: se marcan a la vista.
    const aviso = p.requiere_revision
      ? ` <span title="Migrado del sistema antiguo: verifica el valor antes de confiar en él">⚠️</span>` : "";
    return `<td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(p.precio)}${aviso}</td>`;
  }).join("");

  const celdasEmpresa = EMPRESAS.map((e) => {
    const on = !!r.visible[e.id];
    const sinPrecio = !Object.values(r.precios).some((p) => p?.precio != null);
    // Sin precio en ninguna sucursal no hay nada que publicar: la casilla se desactiva
    // para que nadie crea que activándola aparecerá algo en la web.
    const bloqueada = !editable || sinPrecio;
    return `<td class="px-4 py-2.5 text-center">
      <input type="checkbox" class="pubChk" style="width:18px;height:18px;cursor:${bloqueada ? "not-allowed" : "pointer"}"
        data-mat="${esc(r.material_id)}" data-emp="${esc(e.id)}"
        ${on ? "checked" : ""} ${bloqueada ? "disabled" : ""}
        title="${sinPrecio ? "Sin precio vigente en ninguna sucursal" : "Mostrar en " + esc(e.etiqueta)}">
    </td>`;
  }).join("");

  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}</td>
    ${celdasPrecio}${celdasEmpresa}
  </tr>`;
}

// ── Interacción ───────────────────────────────────────────────────────────────
function cablearChecks() {
  if (_rol !== "gerencia") return;
  document.querySelectorAll("#publicadosBody .pubChk").forEach((chk) => {
    if (chk.disabled) return;
    chk.addEventListener("change", async () => {
      const materialId = chk.dataset.mat;
      const empresaId = chk.dataset.emp;
      const visible = chk.checked;
      chk.disabled = true;
      try {
        await publicarMaterial({ empresaId, materialId, visible });
        const f = _filas.find((x) => x.material_id === materialId);
        if (f) f.visible[empresaId] = visible;
        actualizarResumen();
      } catch (e) {
        chk.checked = !visible;   // revierte: manda el servidor, no la UI
        alert("No se pudo cambiar: " + e.message);
      } finally {
        chk.disabled = false;
      }
    });
  });
}

function enFiltroSucursal(s) {
  const sel = $("publicadosSucursal")?.value;
  return !sel || s.sucursal_id === sel;
}

function pintarSelectorSucursal() {
  const sel = $("publicadosSucursal");
  if (!sel) return;
  sel.innerHTML = `<option value="">Todas</option>` +
    _sucursales.map((s) => `<option value="${esc(s.sucursal_id)}">${esc(s.nombre)}</option>`).join("");
}

function visibles() {
  const q = $("publicadosBuscar")?.value || "";
  const solo = $("publicadosSoloVisibles")?.checked;
  const t = normalizarTexto(q);
  return _filas.filter((r) => {
    if (solo && !EMPRESAS.some((e) => r.visible[e.id])) return false;
    return !t || normalizarTexto(r.material).includes(t);
  });
}

function cablearControles() {
  const refrescar = () => _tabla.setRows(visibles());
  $("publicadosBuscar")?.addEventListener("input", refrescar);
  $("publicadosSoloVisibles")?.addEventListener("change", refrescar);
  // Cambiar de sucursal reconstruye las columnas, así que hay que repintar la cabecera.
  $("publicadosSucursal")?.addEventListener("change", () => {
    pintarCabecera();
    _tabla.setRows(visibles());
  });
}

// ── Estado ────────────────────────────────────────────────────────────────────
function actualizarResumen() {
  const el = $("publicadosResumen");
  if (!el) return;
  const cuenta = (id) => _filas.filter((r) => r.visible[id]).length;
  const conPrecio = _filas.filter((r) => Object.values(r.precios).some((p) => p?.precio != null)).length;
  el.textContent =
    `En la web: ${cuenta("farex")} en FAREX · ${cuenta("reciclean_spa")} en Reciclean. ` +
    `${conPrecio} de ${_filas.length} materiales tienen precio vigente.`;
}

function pintarRol() {
  const chip = $("publicadosRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes publicar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("publicadosAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes consultar los precios vigentes, ` +
    `pero solo gerencia publica o retira materiales de las webs.`;
  aviso.classList.remove("hidden");
}
