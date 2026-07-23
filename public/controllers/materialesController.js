// CONTROLADOR · Materiales y Precios (modelo precios_v3).
// Lee de public.precios_panel (la vista ya enmascara costo/margen según el rol) y escribe
// por el RPC public.f_actualizar_precio, que revalida el rol contra el JWT del usuario.
//
// Reparto de responsabilidades:
//   vista (materiales.html) → marcado e IDs
//   este controlador        → datos, filtros, tabla y reglas de confirmación
//   precioCelda.js          → la interacción de editar una celda
import { listarPrecios, actualizarPrecio } from "../models/preciosRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { activarEdicion } from "../components/precioCelda.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, horaChile } from "../js/util.js";
import { rolActual } from "../js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const pct = (n) => (n == null ? "—" : Number(n).toFixed(1) + "%");
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

// Umbral sobre el que sí pedimos confirmación. Bajo esto, editar es Enter y listo:
// confirmar cada cambio rutinario entrena a la gente a aceptar sin leer el aviso.
const VARIACION_QUE_ALERTA = 0.15; // 15%

let _filas = [];
let _tabla = null;
let _rol = "lector";

export async function mountMateriales() {
  const body = $("matBody");
  body.innerHTML = fila(6, "Cargando…");

  try {
    _filas = await listarPrecios();
    // mi_rol viene calculado por la base; si aún no hay filas caemos al claim del JWT.
    _rol = _filas[0]?.mi_rol || rolActual();   // sin filas, el rol de mis_permisos (no "lector")

    pintarRol();
    poblarSucursales();

    if (!_filas.length) { body.innerHTML = fila(6, "Sin precios cargados."); return; }

    _tabla = montarTabla({
      tbody: body, thead: $("matHead"), info: $("matInfo"), pager: $("matPager"),
      rows: _filas, renderRow, colspan: 6, pageSize: 25,
      vacio: "Sin precios que coincidan con el filtro.",
      sortInicial: { key: "material", dir: "asc" },
      sorters: {
        material: (r) => r.material || "",
        sucursal: (r) => r.sucursal || "",
        publicado: (r) => Number(r.precio_publicado_clp ?? 0),
        recibido:  (r) => Number(r.precio_recibido_clp ?? 0),
        margen:    (r) => Number(r.margen_pct ?? 0),
        vigencia:  (r) => r.vigencia_desde || "",
      },
      infoText: (total, page, pages) =>
        `${total} precio(s) vigente(s) · página ${page} de ${pages}.`,
      onRender: cablearCeldas,
    });

    cablearFiltros();
    actualizarResumen();
  } catch (e) {
    body.innerHTML = fila(6, "❌ No pude cargar los precios: " + esc(e.message));
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderRow(r) {
  // data-* identifica la fila para el guardado; van escapados porque son ids de texto.
  // Lo editable es el PRECIO PUBLICADO (lo que le pagamos a la gente). La clase que lo
  // vuelve editable solo se pone si el rol lo permite: sin permiso no existe el gancho.
  const clasePub = _rol === "gerencia" ? " matPublicado" : "";
  // Los precios migrados del modelo antiguo tienen semántica dudosa: se marcan a la vista.
  const aviso = r.requiere_revision
    ? ` <span title="Migrado del sistema antiguo: verifica el valor antes de publicarlo">⚠️</span>` : "";
  return `<tr class="hover:bg-stone-50" data-mat="${esc(r.material_id)}" data-suc="${esc(r.sucursal_id)}">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}${aviso}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700${clasePub}"
        data-valor="${r.precio_publicado_clp ?? ""}">${clp(r.precio_publicado_clp)}</td>
    <td class="px-4 py-2.5 text-right text-stone-600 matSoloGerencia">${clp(r.precio_recibido_clp)}</td>
    <td class="px-4 py-2.5 text-right text-stone-600 matSoloGerencia">${pct(r.margen_pct)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs whitespace-nowrap">${r.vigencia_desde || "—"}${
      r.creado_por ? " · " + esc(r.creado_por) : ""}
      <button type="button" class="matDetalle" data-mat="${esc(r.material_id)}" data-suc="${esc(r.sucursal_id)}"
        title="Ver desglose de IVA, flete, márgenes y costos"
        style="margin-left:6px;border:1px solid #d6d3d1;background:#fff;border-radius:6px;padding:1px 7px;font-size:11px;cursor:pointer;color:#0f766e;font-weight:600">Detalle</button>
    </td>
  </tr>`;
}

// ── Detalle de precio (punto 6): desglose de IVA, flete, márgenes y costos ─────
const detFila = (etq, val) =>
  `<tr><td style="padding:4px 0;color:#57534e">${etq}</td><td style="padding:4px 0;text-align:right;font-weight:600">${val}</td></tr>`;

function abrirDetalle(r) {
  if (!r) return;
  const soloGerencia = _rol === "gerencia";
  // Los campos internos (costo/margen/flete) llegan null desde la base si no eres gerencia.
  const interno = soloGerencia
    ? detFila("Precio Venta (fundición nos paga)", clp(r.precio_recibido_clp)) +
      detFila("Margen", pct(r.margen_pct)) +
      detFila("Flete", clp(r.flete_clp)) +
      detFila("Retención IVA", r.iva_pct == null ? "—" : Number(r.iva_pct).toFixed(0) + "%") +
      detFila("Spread Lista/Máx", r.spread_pct == null ? "—" : Number(r.spread_pct).toFixed(0) + "%")
    : `<tr><td colspan="2" style="padding:6px 0;color:#a8a29e;font-size:12px">
         Los costos internos y márgenes solo los ve gerencia.</td></tr>`;
  abrirModal({
    titulo: `Detalle · ${esc(r.material)} — ${esc(r.sucursal)}`,
    cuerpoHTML: `
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td colspan="2" style="padding:2px 0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8a29e">Precio público</td></tr>
        ${detFila("Precio publicado (a la gente)", `<span style="color:#047857">${clp(r.precio_publicado_clp)}</span>`)}
        ${detFila("P. Ejecutivo (negociable)", clp(r.precio_ejecutivo_clp))}
        ${detFila("P. Máximo", clp(r.precio_maximo_clp))}
        <tr><td colspan="2" style="padding:10px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8a29e">Costos y márgenes</td></tr>
        ${interno}
        <tr><td colspan="2" style="padding:10px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#a8a29e">Trazabilidad</td></tr>
        ${detFila("Vigente desde", r.vigencia_desde || "—")}
        ${detFila("Ingresado por", esc(r.creado_por || "—"))}
        ${detFila("Redondeo", r.redondeo ? esc(r.redondeo) : "—")}
      </table>`,
  });
}

// Se ejecuta en cada re-render de la tabla (paginar, ordenar, filtrar).
function cablearCeldas(filasPagina) {
  ocultarColumnasSensibles();

  // Botón "Detalle": disponible para todos los roles (los costos ya vienen enmascarados
  // por la base si no eres gerencia). Va antes del corte por rol.
  document.querySelectorAll("#matBody .matDetalle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = filasPagina.find(
        (f) => f.material_id === btn.dataset.mat && f.sucursal_id === btn.dataset.suc);
      abrirDetalle(r);
    });
  });

  if (_rol !== "gerencia") return; // sin permiso no se cablea edición: la UI ni siquiera lo ofrece

  document.querySelectorAll("#matBody .matPublicado").forEach((td) => {
    const tr = td.closest("tr");
    const materialId = tr.dataset.mat;
    const sucursalId = tr.dataset.suc;
    const valor = Number(td.dataset.valor);
    const datos = filasPagina.find(
      (f) => f.material_id === materialId && f.sucursal_id === sucursalId);

    activarEdicion(td, {
      valor,
      formato: clp,
      // Confirmación selectiva: solo cuando el cambio es grande o dejaría el negocio en pérdida.
      confirmar: (nuevo, anterior) => {
        const recibido = datos?.precio_recibido_clp;
        if (recibido != null && nuevo > Number(recibido)) {
          return `⛔ Pagarías <b>${clp(nuevo)}</b> por un material que la fundición nos paga a ` +
                 `${clp(recibido)}. Estarías comprando con pérdida.`;
        }
        const base = Number(anterior) || 0;
        if (base > 0 && Math.abs(nuevo - base) / base >= VARIACION_QUE_ALERTA) {
          const dir = nuevo > base ? "sube" : "baja";
          const delta = Math.round(Math.abs(nuevo - base) / base * 100);
          return `Este precio <b>${dir} un ${delta}%</b> respecto del actual. ¿Es correcto?`;
        }
        return null; // cambio rutinario: se guarda sin interrumpir
      },
      onGuardar: async (nuevo) => {
        await actualizarPrecio({ materialId, sucursalId, publicado: nuevo });
        // Mantiene el estado local en sintonía para que ordenar/filtrar no reviva el valor viejo.
        const f = _filas.find((x) => x.material_id === materialId && x.sucursal_id === sucursalId);
        if (f) {
          f.precio_publicado_clp = nuevo;
          f.requiere_revision = false;   // el RPC lo limpia al guardar
          const rec = Number(f.precio_recibido_clp);
          if (f.precio_recibido_clp != null && rec > 0) {
            f.margen_pct = ((rec - nuevo) / rec) * 100;
          }
        }
        actualizarResumen();
      },
    });
  });
}

// ── Rol ───────────────────────────────────────────────────────────────────────
function pintarRol() {
  const chip = $("matRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes editar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("matAvisoRol");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes consultar los precios, pero no ` +
    `modificarlos ni ver los costos. Si necesitas editar, pide a gerencia que cambie tu rol.`;
  aviso.classList.remove("hidden");
}

// Las columnas de costo y margen llegan vacías desde la base cuando no eres gerencia;
// se ocultan para no mostrar una columna de guiones sin explicación.
function ocultarColumnasSensibles() {
  const mostrar = _rol === "gerencia";
  document.querySelectorAll(".matSoloGerencia").forEach((el) => {
    el.style.display = mostrar ? "" : "none";
  });
}

// ── Filtros ───────────────────────────────────────────────────────────────────
function poblarSucursales() {
  const sel = $("matSucursal");
  if (!sel) return;
  const vistas = [...new Map(_filas.map((r) => [r.sucursal_id, r.sucursal])).entries()]
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "es"));
  sel.innerHTML = `<option value="">Todas las sucursales</option>` +
    vistas.map(([id, nom]) => `<option value="${esc(id)}">${esc(nom)}</option>`).join("");
}

function cablearFiltros() {
  const buscar = $("matBuscar");
  const suc = $("matSucursal");
  const aplicar = () => {
    const q = (buscar?.value || "").trim().toLowerCase();
    const s = suc?.value || "";
    _tabla.setRows(_filas.filter((r) =>
      (!s || r.sucursal_id === s) &&
      (!q || String(r.material).toLowerCase().includes(q))));
    actualizarResumen();
  };
  if (buscar) buscar.addEventListener("input", aplicar);
  if (suc) suc.addEventListener("change", aplicar);
}

function actualizarResumen() {
  const el = $("matResumen");
  if (!el) return;
  const total = _filas.length;
  const materiales = new Set(_filas.map((r) => r.material_id)).size;
  el.textContent = `${materiales} materiales · ${total} precios · actualizado ${horaChile(new Date())}`;
}
