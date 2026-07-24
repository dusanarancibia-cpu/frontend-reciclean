// CONTROLADOR · Recibidos. Auditoría histórica de precios que nos entregan los clientes.
//
// Es un registro de SOLO LECTURA: cada fila es un precio recibido (lo que nos pagan) por
// material y empresa/cliente, con su fecha. Fuente: public.recibidos_panel, que solo
// devuelve datos a gerencia/operador (el precio recibido es interno).
//
// Vista PLANA (sin acordeón por categoría): la tabla se ordena estrictamente por fecha de
// vigencia y, dentro del mismo día, por hora de ingreso, del más reciente al más antiguo.
// NO muestra sucursal: esa asignación ocurre después, en la Calculadora.
import { listarRecibidos } from "./preciosRepo.js";
import { montarTabla } from "../../shared/js/listaTabla.js";
import { toast, toastError } from "../../shared/components/toast.js";
import { escapeHTML, normalizarTexto, descargarCSV, horaChile } from "../../shared/js/util.js";
import { rolActual } from "../../shared/js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const fechaCorta = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("-") : "—");

// Paleta estable para los badges de empresa: la misma empresa siempre cae en el mismo color
// (hash del nombre). Así se distinguen de un vistazo sin depender del orden.
const BADGES = [
  "background:#dbeafe;color:#1e40af", "background:#dcfce7;color:#166534",
  "background:#fef3c7;color:#92400e", "background:#ede9fe;color:#5b21b6",
  "background:#ffe4e6;color:#9f1239", "background:#cffafe;color:#155e75",
  "background:#fae8ff;color:#86198f", "background:#e0e7ff;color:#3730a3",
];
function badgeEmpresa(nombre) {
  if (!nombre) return `<span style="color:#a8a29e">—</span>`;
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return `<span style="${BADGES[h % BADGES.length]};padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700">${esc(nombre)}</span>`;
}

let _rows = [];
let _tabla = null;
let _rol = "lector";
let _debounce = null;

export async function mountRecibidos() {
  const body = $("recBody");
  body.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-stone-400">Cargando…</td></tr>`;

  try {
    // El servidor ya devuelve las filas ordenadas por fecha DESC y luego por hora de ingreso.
    _rows = await listarRecibidos({});
    _rol = _rows[0]?.mi_rol || rolActual();
    pintarRol();

    if (_rol !== "gerencia" && _rol !== "operador") {
      body.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-stone-400">Sin acceso.</td></tr>`;
      $("recAviso").innerHTML = `Tu perfil es <b>${esc(_rol)}</b>: los precios recibidos son información interna, ` +
        `visible solo para gerencia y operadores.`;
      $("recAviso").classList.remove("hidden");
      return;
    }

    poblarFiltros();
    // Tabla con orden por columnas (clic en cabecera): asc → desc → orden original (el del
    // servidor: fecha/hora de ingreso desc). Paginada para no colgar el navegador con miles.
    _tabla = montarTabla({
      tbody: body, thead: $("recHead"), info: $("recInfo"), pager: $("recPager"),
      rows: visibles(), renderRow: filaHTML, colspan: 4, pageSize: 50,
      vacio: "Sin precios recibidos con estos filtros.",
      sorters: {
        material: (r) => r.material || "",
        empresa:  (r) => r.empresa_cliente || "",
        precio:   (r) => Number(r.precio_recibido ?? -1),
        // La fecha ordena por fecha de vigencia y desempata por hora de ingreso.
        fecha:    (r) => `${r.fecha || ""} ${r.creado || ""}`,
      },
      infoText: (t) => `${t} de ${_rows.length} registro(s).`,
    });

    cablearControles();
    resumen();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-rose-600">No pude cargar los recibidos: ${esc(e.message)}</td></tr>`;
  }
}

// Filtro en memoria. Conserva el orden ya aplicado por el servidor (fecha/hora desc).
function visibles() {
  const q = normalizarTexto($("recBuscar")?.value || "");
  const cat = $("recCategoria")?.value || "";
  const emp = $("recEmpresa")?.value || "";
  const soloVig = $("recSoloVigentes")?.checked;
  return _rows.filter((r) => {
    if (cat && r.categoria !== cat) return false;
    if (emp && (r.empresa_cliente || "") !== emp) return false;
    if (soloVig && !r.vigente) return false;
    if (!q) return true;
    const heno = normalizarTexto(`${r.material} ${r.empresa_cliente || ""}`);
    return q.split(" ").every((p) => heno.includes(p));
  });
}

function filaHTML(r) {
  return `<tr class="hover:bg-stone-50 ${r.vigente ? "" : "opacity-70"}">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}${
      r.vigente ? "" : ` <span style="background:#f5f5f4;color:#78716c;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700">histórico</span>`}</td>
    <td class="px-4 py-2.5">${badgeEmpresa(r.empresa_cliente)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-stone-800">${clp(r.precio_recibido)}</td>
    <td class="px-4 py-2.5 text-stone-600 text-xs whitespace-nowrap">
      <div>${fechaCorta(r.fecha)}</div>
      <div class="text-stone-400">${esc(horaChile(r.creado))}</div>
    </td>
  </tr>`;
}

// Reaplica filtros y repinta la tabla (montarTabla conserva el orden elegido por columna).
function refrescarTabla() {
  _tabla.setRows(visibles());
  resumen();
}

// ── Filtros ─────────────────────────────────────────────────────────────────
function poblarFiltros() {
  const cats = new Map();
  _rows.forEach((r) => { if (r.categoria) cats.set(r.categoria, { nombre: r.categoria_nombre || r.categoria, orden: r.categoria_orden ?? 99 }); });
  const catOrd = [...cats.entries()].sort((a, b) => a[1].orden - b[1].orden);
  const selC = $("recCategoria");
  if (selC) selC.innerHTML = `<option value="">Todas las categorías</option>` +
    catOrd.map(([id, v]) => `<option value="${esc(id)}">${esc(v.nombre)}</option>`).join("");

  const emps = [...new Set(_rows.map((r) => r.empresa_cliente).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "es"));
  const selE = $("recEmpresa");
  if (selE) selE.innerHTML = `<option value="">Todas las empresas</option>` +
    emps.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
}

function cablearControles() {
  $("recBuscar")?.addEventListener("input", () => { clearTimeout(_debounce); _debounce = setTimeout(refrescarTabla, 200); });
  $("recCategoria")?.addEventListener("change", refrescarTabla);
  $("recEmpresa")?.addEventListener("change", refrescarTabla);
  $("recSoloVigentes")?.addEventListener("change", refrescarTabla);
  $("recExportar")?.addEventListener("click", exportar);
}

function exportar() {
  const filas = visibles();
  if (!filas.length) return toastError("No hay registros para exportar.");
  descargarCSV("recibidos", filas, [
    { clave: "categoria_nombre", titulo: "Categoría" },
    { clave: "material", titulo: "Material" },
    { clave: "empresa_cliente", titulo: "Empresa/Cliente" },
    { clave: "precio_recibido", titulo: "Precio Recibido" },
    { clave: "fecha", titulo: "Fecha", map: (v) => fechaCorta(v) },
    { clave: "creado", titulo: "Hora de ingreso", map: (v) => horaChile(v) },
    { clave: "vigente", titulo: "Vigente", map: (v) => (v ? "Sí" : "No") },
  ]);
  toast(`Exportados ${filas.length} registro(s).`);
}

function pintarKpis() {
  const v = visibles();
  const set = (id, n) => { const el = $(id); if (el) el.textContent = n; };
  set("recKpiTotal", v.length);
  set("recKpiVigentes", v.filter((r) => r.vigente).length);
  set("recKpiEmpresas", new Set(v.map((r) => r.empresa_cliente).filter(Boolean)).size);
  set("recKpiMateriales", new Set(v.map((r) => r.material_id)).size);
}

function resumen() {
  pintarKpis();
  const el = $("recResumen");
  // recInfo lo administra montarTabla (conteo + página). Aquí solo el chip de resumen.
  if (el) el.textContent = `${visibles().length} de ${_rows.length} registro(s)`;
}

function pintarRol() {
  const chip = $("recRolChip");
  if (chip) {
    chip.textContent = _rol === "lector" ? "lector · sin acceso" : `${_rol} · lectura`;
    chip.className = "chip " + (_rol === "lector" ? "off" : "on");
  }
}
