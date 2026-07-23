// CONTROLADOR · Materiales y Precios (modelo precios_v3).
// Lee de public.precios_panel (la vista ya enmascara costo/margen según el rol) y escribe
// por el RPC public.f_actualizar_precio, que revalida el rol contra el JWT del usuario.
//
// Reparto de responsabilidades:
//   vista (materiales.html) → marcado e IDs
//   este controlador        → datos, filtros, tabla y reglas de confirmación
//   precioCelda.js          → la interacción de editar una celda
import { listarPrecios, actualizarPrecio, rolDesdeToken } from "../models/preciosRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { activarEdicion } from "../components/precioCelda.js";
import { escapeHTML, horaChile } from "../js/util.js";

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
    _rol = _filas[0]?.mi_rol || (await rolDesdeToken()) || "lector";

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
        venta:    (r) => Number(r.precio_venta_clp),
        compra:   (r) => Number(r.precio_compra_clp ?? 0),
        margen:   (r) => Number(r.margen_pct ?? 0),
        vigencia: (r) => r.vigencia_desde || "",
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
  // La celda de venta solo lleva la clase que la vuelve editable si el rol lo permite:
  // sin permiso no existe el gancho, así que la UI ni siquiera invita al clic.
  const claseVenta = _rol === "gerencia" ? " matVenta" : "";
  return `<tr class="hover:bg-stone-50" data-mat="${esc(r.material_id)}" data-suc="${esc(r.sucursal_id)}">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700${claseVenta}"
        data-valor="${r.precio_venta_clp}">${clp(r.precio_venta_clp)}</td>
    <td class="px-4 py-2.5 text-right text-stone-600 matSoloGerencia">${clp(r.precio_compra_clp)}</td>
    <td class="px-4 py-2.5 text-right text-stone-600 matSoloGerencia">${pct(r.margen_pct)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${r.vigencia_desde || "—"}${
      r.creado_por ? " · " + esc(r.creado_por) : ""}</td>
  </tr>`;
}

// Se ejecuta en cada re-render de la tabla (paginar, ordenar, filtrar).
function cablearCeldas(filasPagina) {
  ocultarColumnasSensibles();
  if (_rol !== "gerencia") return; // sin permiso no se cablea nada: la UI ni siquiera lo ofrece

  document.querySelectorAll("#matBody .matVenta").forEach((td) => {
    const tr = td.closest("tr");
    const materialId = tr.dataset.mat;
    const sucursalId = tr.dataset.suc;
    const valor = Number(td.dataset.valor);
    const datos = filasPagina.find(
      (f) => f.material_id === materialId && f.sucursal_id === sucursalId);

    activarEdicion(td, {
      valor,
      formato: clp,
      // Confirmación selectiva: solo cuando el cambio es grande o rompe el costo.
      confirmar: (nuevo, anterior) => {
        const costo = datos?.precio_compra_clp;
        if (costo != null && nuevo < Number(costo)) {
          return `⛔ <b>${clp(nuevo)}</b> queda por debajo del costo (${clp(costo)}). ` +
                 `Estarías vendiendo con pérdida.`;
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
        await actualizarPrecio({ materialId, sucursalId, venta: nuevo });
        // Mantiene el estado local en sintonía para que ordenar/filtrar no reviva el valor viejo.
        const f = _filas.find((x) => x.material_id === materialId && x.sucursal_id === sucursalId);
        if (f) {
          f.precio_venta_clp = nuevo;
          if (f.precio_compra_clp != null && nuevo > 0) {
            f.margen_pct = ((nuevo - Number(f.precio_compra_clp)) / nuevo) * 100;
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
