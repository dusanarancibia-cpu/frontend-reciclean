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
import { listarPrecios, listarVitrina, publicarMaterial, actualizarPrecio, retirarPrecio,
         reiniciarPrecios, contarReinicioPrecios } from "../models/preciosRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { activarEdicion } from "../components/precioCelda.js";
import { abrirModal, cerrarModal } from "../components/modal.js";
import { escapeHTML, normalizarTexto } from "../js/util.js";
import { rolActual } from "../js/permisos.js";

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

    // rolDesdeToken() leía app_metadata del JWT, que es null mientras el hook no esté
    // activo; por eso caía a "lector". rolActual() viene de mis_permisos y siempre está.
    _rol = precios[0]?.mi_rol || vitrina[0]?.mi_rol || rolActual();
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
      // Orden por defecto = el de la lista en papel (cobre → bronce → aluminio → …).
      sortInicial: { key: "orden", dir: "asc" },
      sorters: sorters(),
      infoText: (t, p, pg) => `${t} material(es) · página ${p} de ${pg}.`,
      onRender: cablearChecks,
    });

    cablearControles();
    cablearReinicio();
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
      orden: v.orden ?? 9999,   // orden de la lista en papel
      precios: {},              // sucursal_id → { precio, vigencia, requiere_revision }
      revisar: false,
    });
  });

  precios.forEach((p) => {
    let f = porMaterial.get(p.material_id);
    if (!f) {
      // Precio de un material que no está en el catálogo público: se muestra igual, para
      // que no quede invisible en el panel.
      f = { material_id: p.material_id, material: p.material, visible: {}, orden: 9999, precios: {}, revisar: false };
      porMaterial.set(p.material_id, f);
    }
    f.precios[p.sucursal_id] = {
      precio: p.precio_publicado_clp,
      recibido: p.precio_recibido_clp,     // para el tope al editar (solo gerencia lo ve)
      vigencia: p.vigencia_desde,
      creado_por: p.creado_por,
      requiere_revision: !!p.requiere_revision,
    };
    if (p.requiere_revision) f.revisar = true;
  });

  // Publicados es la pantalla de lo que SE PUBLICA: solo materiales con al menos un precio
  // vigente. Los materiales sin precio (inactivos para publicar) confundían con filas de
  // puros guiones; esos se gestionan en el Catálogo, no acá.
  return [...porMaterial.values()]
    .filter((f) => Object.values(f.precios).some((p) => p?.precio != null));
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
// "orden" es el de la lista en papel por planta (categorías cobre → bronce → aluminio → …);
// es el orden por defecto porque así lee gerencia. Al hacer clic en una columna se reordena.
function sorters() {
  const s = {
    orden:    (r) => r.orden,
    material: (r) => r.material || "",
  };
  _sucursales.forEach((x) => {
    s["suc_" + x.sucursal_id] = (r) => Number(r.precios[x.sucursal_id]?.precio ?? -1);
  });
  EMPRESAS.forEach((e) => { s["emp_" + e.id] = (r) => (r.visible[e.id] ? 1 : 0); });
  return s;
}

// ── Filas ─────────────────────────────────────────────────────────────────────
const fechaCorta = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("-") : "—");

function renderRow(r) {
  const editable = _rol === "gerencia";
  const visibleEnAlguna = EMPRESAS.some((e) => r.visible[e.id]);

  const celdasPrecio = _sucursales.filter(enFiltroSucursal).map((s) => {
    const p = r.precios[s.sucursal_id];
    if (!p || p.precio == null) {
      return `<td class="px-4 py-2.5 text-right text-stone-300">—</td>`;
    }
    const aviso = p.requiere_revision
      ? ` <span title="Migrado del sistema antiguo: verifica el valor antes de confiar en él">⚠️</span>` : "";
    // Metadatos por precio (punto 3): vigencia + quién lo ingresó, bajo el valor.
    const meta = `<div class="text-[10px] text-stone-400 leading-tight">desde ${fechaCorta(p.vigencia)}${
      p.creado_por ? " · " + esc(p.creado_por) : ""}</div>`;
    // Editable in-situ (gerencia). data-* identifica la celda para guardar/retirar.
    const clase = editable ? " pubPrecio" : "";
    // Retiro individual (punto 3): solo si el material NO está visible en ninguna web.
    const retiro = (editable && !visibleEnAlguna)
      ? `<button type="button" class="pubRetirar" data-mat="${esc(r.material_id)}" data-suc="${esc(s.sucursal_id)}"
           title="Quitar este precio (el material no está visible en ninguna web)"
           style="margin-left:6px;border:none;background:none;color:#be123c;cursor:pointer;font-weight:700">×</button>`
      : "";
    return `<td class="px-4 py-2.5 text-right" data-mat="${esc(r.material_id)}" data-suc="${esc(s.sucursal_id)}">
      <div class="font-semibold text-emerald-700${clase}" data-valor="${p.precio}">${clp(p.precio)}${aviso}${retiro}</div>
      ${meta}
    </td>`;
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

  // Casillas de visibilidad por empresa.
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
        // Cambió la visibilidad: aparece/desaparece la opción de retirar. Repinta.
        _tabla.render();
      } catch (e) {
        chk.checked = !visible;   // revierte: manda el servidor, no la UI
        alert("No se pudo cambiar: " + e.message);
      } finally {
        chk.disabled = false;
      }
    });
  });

  // Edición directa del precio por sucursal (punto 3), tipo celda de Excel.
  document.querySelectorAll("#publicadosBody .pubPrecio").forEach((div) => {
    const td = div.closest("td");
    const materialId = td.dataset.mat;
    const sucursalId = td.dataset.suc;
    const f = _filas.find((x) => x.material_id === materialId);
    const p = f?.precios[sucursalId];
    activarEdicion(div, {
      valor: Number(div.dataset.valor),
      formato: clp,
      // Mismo criterio que Materiales: alerta si baja del costo o cambia mucho.
      confirmar: (nuevo, anterior) => {
        const recibido = p?.recibido;
        if (recibido != null && nuevo > Number(recibido)) {
          return `⛔ Pagarías <b>${clp(nuevo)}</b> por algo que la fundición nos paga a ${clp(recibido)}.`;
        }
        const base = Number(anterior) || 0;
        if (base > 0 && Math.abs(nuevo - base) / base >= 0.15) {
          const dir = nuevo > base ? "sube" : "baja";
          return `Este precio <b>${dir} ${Math.round(Math.abs(nuevo - base) / base * 100)}%</b>. ¿Es correcto?`;
        }
        return null;
      },
      onGuardar: async (nuevo) => {
        await actualizarPrecio({ materialId, sucursalId, publicado: nuevo });
        if (p) { p.precio = nuevo; p.requiere_revision = false; }
      },
    });
  });

  // Retiro individual de un precio (punto 3): solo aparece si el material no está visible.
  document.querySelectorAll("#publicadosBody .pubRetirar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();   // no dispares la edición de la celda
      const materialId = btn.dataset.mat;
      const sucursalId = btn.dataset.suc;
      const f = _filas.find((x) => x.material_id === materialId);
      const nombreSuc = _sucursales.find((s) => s.sucursal_id === sucursalId)?.nombre || sucursalId;
      abrirModal({
        titulo: "Quitar precio",
        cuerpoHTML: `<p>¿Quitar el precio de <b>${esc(f?.material || materialId)}</b> en <b>${esc(nombreSuc)}</b>?</p>
          <p style="font-size:13px;color:#78716c;margin-top:8px">Se retira de la lista vigente
          (queda en el historial). Puedes volver a cargarlo cuando quieras.</p>`,
        acciones: [
          { texto: "Cancelar" },
          { texto: "Quitar", primario: true, onClick: async () => {
              try {
                await retirarPrecio({ materialId, sucursalId, motivo: "Retiro individual desde Publicados" });
                await mountPublicados();
              } catch (err) {
                abrirModal({ titulo: "No se pudo quitar", cuerpoHTML: `<p>${esc(err.message)}</p>` });
              }
            } },
        ],
      });
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

// ── Reinicio de precios (solo gerencia) ───────────────────────────────────────
// "Soft reset": no borra filas, cierra la vigencia de los precios actuales. La vitrina
// queda en blanco al instante porque las vistas filtran `vigencia_hasta IS NULL`, pero
// el histórico, la auditoría y la tabla de materiales quedan intactos.
//
// Respeta el filtro de sucursal de la pantalla: si hay una elegida, reinicia solo esa.
// Es la diferencia entre vaciar una sucursal y vaciarlas las cuatro.
function cablearReinicio() {
  const btn = $("publicadosReiniciar");
  if (!btn) return;
  if (_rol !== "gerencia") { btn.classList.add("hidden"); return; }
  btn.classList.remove("hidden");

  btn.addEventListener("click", async () => {
    const sucId = $("publicadosSucursal")?.value || null;
    const sucNombre = _sucursales.find((s) => s.sucursal_id === sucId)?.nombre;

    let cuantos;
    try {
      cuantos = await contarReinicioPrecios(sucId);
    } catch (e) {
      return abrirModal({ titulo: "No se pudo consultar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
    }
    if (!cuantos) {
      return abrirModal({
        titulo: "Nada que reiniciar",
        cuerpoHTML: `<p>No hay precios vigentes${sucNombre ? " en " + esc(sucNombre) : ""}.</p>`,
      });
    }

    abrirModal({
      titulo: "Reiniciar precios",
      cuerpoHTML: `
        <p>Se retirarán <b>${cuantos}</b> precio(s) vigente(s)${
          sucNombre ? ` de <b>${esc(sucNombre)}</b>` : " de <b>todas las sucursales</b>"}.</p>
        <p style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px;margin-top:10px;font-size:13px;color:#065f46">
          🛡️ El catálogo de materiales no se toca, y el histórico y la auditoría se conservan.
          Lo que se marcó como visible en cada web se mantiene: al cargar la lista nueva,
          los materiales reaparecen solos.
        </p>
        <p style="font-size:13px;color:#78716c;margin-top:10px">
          Las webs públicas quedarán sin precios hasta que cargues la lista nueva.</p>
        <label style="display:block;margin-top:12px">
          <span style="font-size:12px;color:#57534e">Motivo (queda en la auditoría)</span>
          <input id="pubReiMotivo" placeholder="ej. lista de precios de agosto"
            style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px">
        </label>
        <div id="pubReiError" style="display:none;color:#be123c;font-size:13px;font-weight:600;margin-top:8px"></div>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Reiniciar", primario: true, cerrar: false, onClick: async () => {
            const err = $("pubReiError");
            const motivo = ($("pubReiMotivo")?.value || "").trim();
            if (!motivo) {
              err.textContent = "Escribe el motivo para continuar.";
              err.style.display = "block";
              return;
            }
            try {
              const res = await reiniciarPrecios({ motivo, sucursalId: sucId });
              cerrarModal();
              await mountPublicados();   // recarga todo: precios y visibilidad
              const el = $("publicadosResumen");
              if (el) el.textContent = `♻️ ${res.precios_retirados} precio(s) retirados. ` +
                `Carga la lista nueva desde Carga Manual.`;
            } catch (e) {
              err.textContent = e.message;
              err.style.display = "block";
            }
          } },
      ],
    });
  });
}

// ── Estado ────────────────────────────────────────────────────────────────────
function actualizarResumen() {
  const el = $("publicadosResumen");
  if (!el) return;
  // _filas ya viene filtrada a materiales con precio vigente (los que se pueden publicar).
  const cuenta = (id) => _filas.filter((r) => r.visible[id]).length;
  el.textContent =
    `${_filas.length} material(es) con precio vigente. ` +
    `En la web: ${cuenta("farex")} en FAREX · ${cuenta("reciclean_spa")} en Reciclean. ` +
    `Los materiales sin precio se gestionan en el Catálogo.`;
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
