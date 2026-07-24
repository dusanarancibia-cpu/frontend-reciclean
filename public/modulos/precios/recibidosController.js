// CONTROLADOR · Recibidos. Auditoría histórica de precios que nos entregan los clientes.
//
// Es un registro de SOLO LECTURA: cada fila es un precio recibido (lo que nos pagan) por
// material, empresa/cliente y sucursal, con su fecha. Fuente: public.recibidos_panel, que
// solo devuelve datos a gerencia/operador (el precio recibido es interno).
//
// Se agrupa por categoría en un acordeón (como Publicados/Historial) y ofrece buscador +
// filtros rápidos por categoría y por empresa. Las combinaciones material+empresa se
// distinguen con badges de color.
import { listarRecibidos } from "./preciosRepo.js";
import { montarAcordeon, agruparPorCategoria } from "../../shared/components/acordeon.js";
import { toast, toastError } from "../../shared/components/toast.js";
import { escapeHTML, normalizarTexto, descargarCSV } from "../../shared/js/util.js";
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
let _acc = null;
let _rol = "lector";
let _debounce = null;

export async function mountRecibidos() {
  const cont = $("recAcc");
  cont.innerHTML = `<div class="text-center text-stone-400 text-sm py-8">Cargando…</div>`;

  try {
    _rows = await listarRecibidos({});
    _rol = _rows[0]?.mi_rol || rolActual();
    pintarRol();

    if (_rol !== "gerencia" && _rol !== "operador") {
      cont.innerHTML = "";
      $("recAviso").innerHTML = `Tu perfil es <b>${esc(_rol)}</b>: los precios recibidos son información interna, ` +
        `visible solo para gerencia y operadores.`;
      $("recAviso").classList.remove("hidden");
      return;
    }

    poblarFiltros();
    _acc = montarAcordeon({
      contenedor: cont,
      columnas: [
        { th: "Material", sort: "material" }, { th: "Empresa / Cliente", sort: "empresa" },
        { th: "Precio Recibido", align: "right", sort: "precio" },
        { th: "Fecha", sort: "fecha" }, { th: "Sucursal", sort: "sucursal" },
      ],
      sorters: {
        material: (r) => r.material || "",
        empresa:  (r) => r.empresa_cliente || "",
        precio:   (r) => Number(r.precio_recibido ?? -1),
        fecha:    (r) => r.fecha || "",
        sucursal: (r) => r.sucursal || "",
      },
      grupos: gruposVisibles(),
      renderRow,
      abrir: "primero",
      vacio: "Sin precios recibidos en esta categoría.",
    });

    cablearControles();
    resumen();
  } catch (e) {
    cont.innerHTML = `<div class="text-center text-rose-600 text-sm py-8">No pude cargar los recibidos: ${esc(e.message)}</div>`;
  }
}

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
    const heno = normalizarTexto(`${r.material} ${r.empresa_cliente || ""} ${r.sucursal || ""}`);
    return q.split(" ").every((p) => heno.includes(p));
  });
}

function gruposVisibles() {
  return agruparPorCategoria(visibles()).filter((g) => g.filas.length);
}

function renderRow(r) {
  return `<tr class="hover:bg-stone-50 ${r.vigente ? "" : "opacity-70"}">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}${
      r.vigente ? "" : ` <span style="background:#f5f5f4;color:#78716c;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700">histórico</span>`}</td>
    <td class="px-4 py-2.5">${badgeEmpresa(r.empresa_cliente)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-stone-800">${clp(r.precio_recibido)}</td>
    <td class="px-4 py-2.5 text-stone-600 text-xs whitespace-nowrap">${fechaCorta(r.fecha)}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal || "—")}</td>
  </tr>`;
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
  const refrescar = () => { _acc.setGrupos(gruposVisibles()); resumen(); };
  $("recBuscar")?.addEventListener("input", () => { clearTimeout(_debounce); _debounce = setTimeout(refrescar, 200); });
  $("recCategoria")?.addEventListener("change", refrescar);
  $("recEmpresa")?.addEventListener("change", refrescar);
  $("recSoloVigentes")?.addEventListener("change", refrescar);
  $("recExpandir")?.addEventListener("click", () => {
    const abierto = document.querySelector("#recAcc .rc-acc-grupo.abierto");
    if (abierto) _acc.cerrarTodos(); else _acc.abrirTodos();
  });
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
    { clave: "sucursal", titulo: "Sucursal" },
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
  if (el) el.textContent = `${visibles().length} de ${_rows.length} registro(s)`;
  const info = $("recInfo");
  if (info) info.textContent = `${gruposVisibles().length} categoría(s).`;
}

function pintarRol() {
  const chip = $("recRolChip");
  if (chip) {
    chip.textContent = _rol === "lector" ? "lector · sin acceso" : `${_rol} · lectura`;
    chip.className = "chip " + (_rol === "lector" ? "off" : "on");
  }
}
