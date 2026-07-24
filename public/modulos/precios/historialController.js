// CONTROLADOR · Historial de precios. Auditoría de variaciones, agrupada por categoría.
//
// Vista de solo lectura enfocada en cómo varió cada precio en el tiempo: fecha, usuario,
// sucursal, material, precio anterior y nuevo. Fuente: public.historial_precios.
//
// Ahora se agrupa en un acordeón POR CATEGORÍA (ya no una tabla plana inmensa): cada
// categoría lista sus cambios, del más reciente al más antiguo.
//
// Preparado para graficar: seriesParaGrafico() arma un {material×sucursal → [{x:fecha,
// y:precio}]} listo para Chart.js. Se deja en window.__historialSeries.
import { listarHistorialPrecios } from "./preciosRepo.js";
import { montarAcordeon, agruparPorCategoria } from "../../shared/components/acordeon.js";
import { toast, toastError } from "../../shared/components/toast.js";
import { escapeHTML, horaChile, descargarCSV } from "../../shared/js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));

const VAR = {
  alta:   { txt: "Alta",    css: "bg-sky-100 text-sky-800",         ico: "＋" },
  sube:   { txt: "Subió",   css: "bg-emerald-100 text-emerald-800", ico: "▲" },
  baja:   { txt: "Bajó",    css: "bg-amber-100 text-amber-800",     ico: "▼" },
  retiro: { txt: "Retiro",  css: "bg-rose-100 text-rose-700",       ico: "×" },
  igual:  { txt: "Igual",   css: "bg-stone-100 text-stone-600",     ico: "=" },
};

let _acc = null;
let _debounce = null;
let _rows = [];

export async function mountHistorial() {
  const cont = $("hisAcc");
  cont.innerHTML = `<div class="text-center text-stone-400 text-sm py-8">Cargando…</div>`;

  try {
    _rows = await consultar();
    _acc = montarAcordeon({
      contenedor: cont,
      columnas: [
        { th: "Fecha", sort: "fecha" }, { th: "Usuario", sort: "usuario" },
        { th: "Material", sort: "material" }, { th: "Sucursal", sort: "sucursal" },
        { th: "Precio anterior", align: "right", sort: "anterior" },
        { th: "Precio nuevo", align: "right", sort: "nuevo" },
        { th: "Variación", sort: "variacion" },
      ],
      sorters: {
        fecha:     (r) => r.created_at || "",
        usuario:   (r) => r.actor_email || "",
        material:  (r) => r.material || "",
        sucursal:  (r) => r.sucursal || "",
        anterior:  (r) => Number(r.precio_anterior ?? -1),
        nuevo:     (r) => Number(r.precio_nuevo ?? -1),
        variacion: (r) => Number(r.variacion_pct ?? 0),
      },
      grupos: gruposVisibles(),
      renderRow,
      abrir: "primero",
      vacio: "Sin cambios de precio en esta categoría.",
    });
    cablearControles();
    pintarKpis(_rows);
    seriesParaGrafico(_rows);
    resumen(_rows.length);
  } catch (e) {
    cont.innerHTML = `<div class="text-center text-rose-600 text-sm py-8">No pude cargar el historial: ${esc(e.message)}</div>`;
  }
}

function consultar() {
  return listarHistorialPrecios({ texto: $("hisBuscar")?.value || "", limite: 2000 });
}

// El tipo de variación se filtra en memoria (columna calculada por la base).
function aplicarFiltroLocal(rows) {
  const v = $("hisVariacion")?.value || "";
  return v ? rows.filter((r) => r.variacion === v) : rows;
}

function gruposVisibles() {
  return agruparPorCategoria(aplicarFiltroLocal(_rows)).filter((g) => g.filas.length);
}

function renderRow(r) {
  const v = VAR[r.variacion] || VAR.igual;
  const pct = r.variacion_pct == null ? ""
    : ` <span class="text-stone-500">(${r.variacion_pct > 0 ? "+" : ""}${r.variacion_pct}%)</span>`;
  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5 text-stone-500 text-xs whitespace-nowrap">${horaChile(r.created_at)}</td>
    <td class="px-4 py-2.5 text-stone-600 text-xs">${esc(r.actor_email || "—")}</td>
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal || "—")}</td>
    <td class="px-4 py-2.5 text-right text-stone-500">${clp(r.precio_anterior)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-stone-800">${clp(r.precio_nuevo)}</td>
    <td class="px-4 py-2.5">
      <span class="${v.css}" style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${v.ico} ${v.txt}</span>${pct}
    </td>
  </tr>`;
}

// ── KPIs de fluctuación ───────────────────────────────────────────────────────
function pintarKpis(rows) {
  const cuenta = (t) => rows.filter((r) => r.variacion === t).length;
  const set = (id, n) => { const el = $(id); if (el) el.textContent = n; };
  set("hisKpiTotal", rows.length);
  set("hisKpiAltas", cuenta("alta"));
  set("hisKpiSubas", cuenta("sube"));
  set("hisKpiBajas", cuenta("baja"));
  set("hisKpiRetiros", cuenta("retiro"));
}

// ── Estructura para gráficos (Chart.js futuro) ────────────────────────────────
function seriesParaGrafico(rows) {
  const series = {};
  [...rows].reverse().forEach((r) => {          // del más antiguo al más nuevo
    if (r.precio_nuevo == null) return;          // los retiros no aportan punto de precio
    const clave = `${r.material} · ${r.sucursal || "—"}`;
    (series[clave] ||= []).push({ x: r.created_at, y: Number(r.precio_nuevo) });
  });
  window.__historialSeries = series;
  return series;
}

// ── Controles ─────────────────────────────────────────────────────────────────
function cablearControles() {
  const recargar = async () => {
    try {
      _rows = await consultar();
      _acc.setGrupos(gruposVisibles());
      pintarKpis(_rows);
      seriesParaGrafico(_rows);
      resumen(_rows.length);
    } catch (e) {
      resumen(0, e.message);
    }
  };
  // Se espera a que el usuario deje de escribir: una consulta por tecla saturaría la API.
  $("hisBuscar")?.addEventListener("input", () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(recargar, 300);
  });
  // El tipo de variación filtra en memoria: no hace falta reconsultar.
  $("hisVariacion")?.addEventListener("change", () => _acc.setGrupos(gruposVisibles()));
  $("hisExpandir")?.addEventListener("click", () => {
    const algunAbierto = document.querySelector("#hisAcc .rc-acc-grupo.abierto");
    if (algunAbierto) _acc.cerrarTodos(); else _acc.abrirTodos();
  });
  $("hisExportar")?.addEventListener("click", exportar);
}

function exportar() {
  const filas = aplicarFiltroLocal(_rows);
  if (!filas.length) return toastError("No hay movimientos para exportar.");
  descargarCSV("historial_precios", filas, [
    { clave: "created_at", titulo: "Fecha", map: (v) => horaChile(v) },
    { clave: "actor_email", titulo: "Usuario" },
    { clave: "categoria_nombre", titulo: "Categoría" },
    { clave: "material", titulo: "Material" },
    { clave: "sucursal", titulo: "Sucursal" },
    { clave: "precio_anterior", titulo: "Precio anterior" },
    { clave: "precio_nuevo", titulo: "Precio nuevo" },
    { clave: "variacion", titulo: "Variación", map: (v) => (VAR[v]?.txt || v) },
    { clave: "variacion_pct", titulo: "Variación %" },
    { clave: "motivo", titulo: "Motivo" },
  ]);
  toast(`Exportados ${filas.length} movimiento(s).`);
}

function resumen(n, error = null) {
  const el = $("hisResumen");
  if (el) el.textContent = error ? "" + error : `${n} resultado(s)`;
  const info = $("hisInfo");
  if (info && !error) info.textContent = `${aplicarFiltroLocal(_rows).length} cambio(s) en ${gruposVisibles().length} categoría(s).`;
}
