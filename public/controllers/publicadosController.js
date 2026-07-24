// CONTROLADOR · Publicados. Absorbió a la antigua "Vitrina pública".
//
// Vista de acordeón POR CATEGORÍA (ya no una tabla plana inmensa). Cada categoría se
// expande y muestra su tabla con:
//   · una columna por sucursal con el precio vigente ahí (lo que le pagamos a la gente)
//   · una casilla por empresa que decide si ese material aparece en esa web
// Y en la CABECERA de cada categoría, una casilla por empresa para publicar o quitar la
// categoría entera de una web de un solo clic (publicación modular por categoría o material).
//
// POR QUÉ VISIBILIDAD POR MATERIAL×EMPRESA: precios_v3.catalogo_publico tiene PK
// (empresa_id, material_id). La casilla de categoría no es un estado nuevo: es un atajo que
// aplica el mismo cambio a todos los materiales de la categoría que tengan precio.
//
// Las columnas de sucursal se construyen desde los datos: agregar una sucursal nueva no
// requiere tocar código ni la vista.
import { listarPrecios, listarVitrina, publicarMaterial, actualizarPrecio, retirarPrecio,
         reiniciarPrecios, contarReinicioPrecios } from "../models/preciosRepo.js";
import { montarAcordeon, agruparPorCategoria } from "../components/acordeon.js";
import { activarEdicion } from "../components/precioCelda.js";
import { abrirModal, cerrarModal } from "../components/modal.js";
import { toast, toastError } from "../components/toast.js";
import { escapeHTML, normalizarTexto, descargarCSV } from "../js/util.js";
import { rolActual } from "../js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));

// Las webs que existen. Si mañana hay una tercera empresa, se agrega acá.
const EMPRESAS = [
  { id: "farex", etiqueta: "FAREX" },
  { id: "reciclean_spa", etiqueta: "Reciclean" },
];
const etiquetaEmp = (id) => EMPRESAS.find((e) => e.id === id)?.etiqueta || id;

let _filas = [];        // una por material, ya fusionada (solo materiales con precio vigente)
let _sucursales = [];   // [{ sucursal_id, nombre }]
let _grupos = [];       // agrupación por categoría del render actual (para los toggles)
let _acc = null;
let _rol = "lector";

export async function mountPublicados() {
  const cont = $("publicadosAcc");
  cont.innerHTML = `<div class="text-center text-stone-400 text-sm py-8">Cargando…</div>`;

  try {
    // Las dos fuentes son independientes y ninguna depende de la otra: van en paralelo.
    const [precios, vitrina] = await Promise.all([listarPrecios(), listarVitrina()]);

    _rol = precios[0]?.mi_rol || vitrina[0]?.mi_rol || rolActual();
    _sucursales = sucursalesDesde(precios);
    _filas = fusionar(precios, vitrina);

    pintarRol();
    pintarSelectorSucursal();
    construir();

    cablearControles();
    cablearReinicio();
    actualizarResumen();
  } catch (e) {
    cont.innerHTML = `<div class="text-center text-rose-600 text-sm py-8">❌ No pude cargar los publicados: ${esc(e.message)}</div>`;
  }
}

// ── Fusión de las dos fuentes ─────────────────────────────────────────────────
function sucursalesDesde(precios) {
  const m = new Map();
  precios.forEach((p) => { if (p.sucursal_id) m.set(p.sucursal_id, p.sucursal); });
  return [...m.entries()]
    .map(([sucursal_id, nombre]) => ({ sucursal_id, nombre }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

// Se parte de la vitrina (tiene TODO el catálogo, con o sin precio, y la categoría) y se le
// cuelgan los precios.
function fusionar(precios, vitrina) {
  const porMaterial = new Map();
  vitrina.forEach((v) => {
    porMaterial.set(v.material_id, {
      material_id: v.material_id,
      material: v.material,
      visible: v.visible || {},
      orden: v.orden ?? 9999,
      categoria: v.categoria || "_sin",
      categoria_nombre: v.categoria_nombre || "Sin categoría",
      categoria_orden: v.categoria_orden ?? 999,
      precios: {},              // sucursal_id → { precio, recibido, vigencia, creado_por, requiere_revision }
      revisar: false,
    });
  });

  precios.forEach((p) => {
    let f = porMaterial.get(p.material_id);
    if (!f) {
      f = { material_id: p.material_id, material: p.material, visible: {}, orden: 9999,
            categoria: "_sin", categoria_nombre: "Sin categoría", categoria_orden: 999,
            precios: {}, revisar: false };
      porMaterial.set(p.material_id, f);
    }
    f.precios[p.sucursal_id] = {
      precio: p.precio_publicado_clp,
      recibido: p.precio_recibido_clp,
      vigencia: p.vigencia_desde,
      creado_por: p.creado_por,
      requiere_revision: !!p.requiere_revision,
    };
    if (p.requiere_revision) f.revisar = true;
  });

  // Publicados = lo que SE PUBLICA: solo materiales con al menos un precio vigente.
  return [...porMaterial.values()]
    .filter((f) => Object.values(f.precios).some((p) => p?.precio != null));
}

// ── Construcción del acordeón ─────────────────────────────────────────────────
const sucVisibles = () => _sucursales.filter(enFiltroSucursal);

function columnas() {
  return [
    { th: "Material", sort: "material" },
    ...sucVisibles().map((s) => ({ th: esc(s.nombre), align: "right", sort: "suc_" + s.sucursal_id })),
    ...EMPRESAS.map((e) => ({ th: esc(e.etiqueta), align: "center", sort: "emp_" + e.id })),
  ];
}

// Valores para ordenar cada columna (clic en el <th>): material A-Z, precio numérico,
// empresa por publicado/no. Funciona dentro de cada categoría del acordeón.
function sorters() {
  const s = { material: (r) => r.material || "" };
  _sucursales.forEach((x) => {
    s["suc_" + x.sucursal_id] = (r) => Number(r.precios[x.sucursal_id]?.precio ?? -1);
  });
  EMPRESAS.forEach((e) => { s["emp_" + e.id] = (r) => (r.visible[e.id] ? 1 : 0); });
  return s;
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

function gruposVisibles() {
  _grupos = agruparPorCategoria(visibles()).filter((g) => g.filas.length);
  return _grupos;
}

// (Re)crea el acordeón desde cero. Se usa al montar y cuando cambian las columnas (filtro de
// sucursal). Para búsqueda/solo-visibles basta con _acc.setGrupos (conserva qué está abierto).
function construir() {
  _acc = montarAcordeon({
    contenedor: $("publicadosAcc"),
    columnas: columnas(),
    sorters: sorters(),
    grupos: gruposVisibles(),
    renderRow,
    resumenExtra: resumenCategoria,
    onRender: cablear,
    abrir: "todos",
    vacio: "Sin materiales con precio en esta categoría.",
  });
}

// ── Cabecera de categoría: publicar/quitar la categoría entera por empresa ─────
function resumenCategoria(grupo) {
  const editable = _rol === "gerencia";
  return EMPRESAS.map((e) => {
    const n = grupo.filas.filter((r) => r.visible[e.id]).length;
    const todos = grupo.filas.length > 0 && n === grupo.filas.length;
    return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#57534e;font-weight:600;cursor:${editable ? "pointer" : "default"}">
      <input type="checkbox" class="pubCatChk" data-cat="${esc(grupo.id)}" data-emp="${esc(e.id)}"
        style="width:15px;height:15px" ${todos ? "checked" : ""} ${editable ? "" : "disabled"}>
      ${esc(e.etiqueta)}</label>`;
  }).join("");
}

// ── Filas ─────────────────────────────────────────────────────────────────────
const fechaCorta = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("-") : "—");

function renderRow(r) {
  const editable = _rol === "gerencia";
  const visibleEnAlguna = EMPRESAS.some((e) => r.visible[e.id]);

  const celdasPrecio = sucVisibles().map((s) => {
    const p = r.precios[s.sucursal_id];
    if (!p || p.precio == null) {
      return `<td class="px-4 py-2.5 text-right text-stone-300">—</td>`;
    }
    const aviso = p.requiere_revision
      ? ` <span title="Migrado del sistema antiguo: verifica el valor antes de confiar en él">⚠️</span>` : "";
    const meta = `<div class="text-[10px] text-stone-400 leading-tight">desde ${fechaCorta(p.vigencia)}${
      p.creado_por ? " · " + esc(p.creado_por) : ""}</div>`;
    const clase = editable ? " pubPrecio" : "";
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
function cablear() {
  const cont = $("publicadosAcc");
  if (_rol === "gerencia") {
    cablearCatToggles(cont);
    cablearChecksIndividuales(cont);
    cablearEdicionPrecio(cont);
    cablearRetiros(cont);
  }
}

// Casillas de categoría (cabecera): aplican el cambio a todos los materiales de la categoría.
function cablearCatToggles(cont) {
  cont.querySelectorAll(".pubCatChk").forEach((chk) => {
    if (chk.disabled) return;
    // Estado indeterminado si la categoría está parcialmente publicada en esa empresa.
    const grupo = _grupos.find((g) => g.id === chk.dataset.cat);
    if (grupo) {
      const n = grupo.filas.filter((r) => r.visible[chk.dataset.emp]).length;
      chk.indeterminate = n > 0 && n < grupo.filas.length;
    }
    chk.addEventListener("change", async () => {
      const cat = chk.dataset.cat, emp = chk.dataset.emp;
      const nuevo = chk.checked;
      const grupo = _grupos.find((g) => g.id === cat);
      const objetivo = (grupo?.filas || []).filter((r) => !!r.visible[emp] !== nuevo);
      if (!objetivo.length) return;
      chk.disabled = true;
      try {
        await Promise.all(objetivo.map((r) =>
          publicarMaterial({ empresaId: emp, materialId: r.material_id, visible: nuevo })));
        objetivo.forEach((r) => { r.visible[emp] = nuevo; });
        toast(`${objetivo.length} material(es) ${nuevo ? "publicado(s)" : "quitado(s)"} en ${etiquetaEmp(emp)}.`);
        actualizarResumen();
        _acc.setGrupos(gruposVisibles());   // repinta y re-cablea
      } catch (e) {
        chk.checked = !nuevo;
        toastError("No se pudo aplicar a la categoría: " + e.message);
      } finally {
        chk.disabled = false;
      }
    });
  });
}

function cablearChecksIndividuales(cont) {
  cont.querySelectorAll(".pubChk").forEach((chk) => {
    if (chk.disabled) return;
    chk.addEventListener("change", async () => {
      const materialId = chk.dataset.mat, empresaId = chk.dataset.emp, visible = chk.checked;
      chk.disabled = true;
      try {
        await publicarMaterial({ empresaId, materialId, visible });
        const f = _filas.find((x) => x.material_id === materialId);
        if (f) f.visible[empresaId] = visible;
        actualizarResumen();
        _acc.setGrupos(gruposVisibles());   // cambió la visibilidad: repinta cabecera y retiros
      } catch (e) {
        chk.checked = !visible;
        toastError("No se pudo cambiar: " + e.message);
      } finally {
        chk.disabled = false;
      }
    });
  });
}

function cablearEdicionPrecio(cont) {
  cont.querySelectorAll(".pubPrecio").forEach((div) => {
    const td = div.closest("td");
    const materialId = td.dataset.mat, sucursalId = td.dataset.suc;
    const f = _filas.find((x) => x.material_id === materialId);
    const p = f?.precios[sucursalId];
    activarEdicion(div, {
      valor: Number(div.dataset.valor),
      formato: clp,
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
        toast("Precio actualizado.");
      },
    });
  });
}

function cablearRetiros(cont) {
  cont.querySelectorAll(".pubRetirar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const materialId = btn.dataset.mat, sucursalId = btn.dataset.suc;
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
                toast("Precio retirado.");
                await mountPublicados();
              } catch (err) {
                toastError(err.message);
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

function cablearControles() {
  const refrescar = () => _acc.setGrupos(gruposVisibles());
  $("publicadosBuscar")?.addEventListener("input", refrescar);
  $("publicadosSoloVisibles")?.addEventListener("change", refrescar);
  // Cambiar de sucursal cambia las columnas → hay que reconstruir el acordeón entero.
  $("publicadosSucursal")?.addEventListener("change", construir);
  $("publicadosExpandir")?.addEventListener("click", () => {
    const algunAbierto = document.querySelector("#publicadosAcc .rc-acc-grupo.abierto");
    if (algunAbierto) _acc.cerrarTodos(); else _acc.abrirTodos();
  });
  $("publicadosExportar")?.addEventListener("click", exportar);
}

function exportar() {
  const filas = visibles();
  if (!filas.length) return toastError("No hay materiales para exportar.");
  const cols = [
    { clave: "categoria_nombre", titulo: "Categoría" },
    { clave: "material", titulo: "Material" },
    ...sucVisibles().map((s) => ({
      clave: "suc_" + s.sucursal_id, titulo: s.nombre,
      map: (_, r) => r.precios[s.sucursal_id]?.precio ?? "",
    })),
    ...EMPRESAS.map((e) => ({
      clave: "emp_" + e.id, titulo: e.etiqueta,
      map: (_, r) => (r.visible[e.id] ? "Sí" : "No"),
    })),
  ];
  descargarCSV("publicados", filas, cols);
  toast(`Exportados ${filas.length} material(es).`);
}

// ── Reinicio de precios (solo gerencia) ───────────────────────────────────────
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
      return toastError(e.message);
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
            if (!motivo) { err.textContent = "Escribe el motivo para continuar."; err.style.display = "block"; return; }
            try {
              const res = await reiniciarPrecios({ motivo, sucursalId: sucId });
              cerrarModal();
              await mountPublicados();
              toast(`♻️ ${res.precios_retirados} precio(s) retirados. Carga la lista nueva desde Carga Manual.`);
            } catch (e) {
              err.textContent = e.message; err.style.display = "block";
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
  const cuenta = (id) => _filas.filter((r) => r.visible[id]).length;
  el.textContent =
    `${_filas.length} material(es) con precio vigente. ` +
    `En la web: ${cuenta("farex")} en FAREX · ${cuenta("reciclean_spa")} en Reciclean. ` +
    `Los materiales sin precio se gestionan en el Catálogo.`;
  const info = $("publicadosInfo");
  if (info) info.textContent = `${visibles().length} material(es) en ${gruposVisibles().length} categoría(s).`;
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
