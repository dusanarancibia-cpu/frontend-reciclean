// CONTROLADOR · Revisión. Propuestas calculadas (ruta manual_calc) pendientes de aprobar.
// Fuente: staging.precios_propuestos · estado='pendiente' AND ruta='manual_calc'.
// Aprobar → POST EF /functions/v1/precio-aplicar { propuesta_id } con token real (por fila).
import { SUPABASE_URL, SUPABASE_ANON_KEY, EF } from "../js/config.js";
import { getClient, getSession, loadNombres } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, horaChile } from "../js/util.js";

let _apiRev = null;   // handle de la tabla (para re-render tras aprobar)
let _rowsRev = [];    // filas pendientes en memoria

const $ = (id) => document.getElementById(id);
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const esc = escapeHTML; // helper único (cubre < > & " ')
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;
const EF_URL = SUPABASE_URL + (EF.precioAplicar || "/functions/v1/precio-aplicar");
const EF_CMD_URL = SUPABASE_URL + (EF.precioCommand || "/functions/v1/precio-command");
// Una fila del modal de detalle (etiqueta a la izquierda, valor a la derecha).
const filaDet = (label, valor) =>
  `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f1f5f9">
     <span style="color:#64748b">${label}</span><span style="font-weight:600;color:#0f172a;text-align:right">${valor}</span></div>`;

function refrescarSeleccion() {
  const checks = [...document.querySelectorAll(".revChk")];
  const n = checks.filter((c) => c.checked).length;
  $("revSelCount").textContent = n;
  $("btnConfirmarSel").disabled = n === 0;
  const all = $("revSelAll");
  if (all) {
    all.checked = n > 0 && n === checks.length;
    all.indeterminate = n > 0 && n < checks.length;
  }
}

// Aprueba UNA propuesta contra la EF autoritativa.
// compra = costo transitorio (metadata.precio_compra_transitorio) para materiales sin
// costo vigente; la EF lo ignora si ya hay costo. Así se publican casos independientes.
async function aprobarUno(id, token, compra) {
  const resp = await fetch(EF_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ propuesta_id: Number(id), ...(compra > 0 ? { precio_compra_transitorio: compra } : {}) }),
  });
  const raw = await resp.text();
  let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
  return { ok: resp.ok && json.ok !== false, status: resp.status, json };
}

// Rechaza UNA propuesta vía Edge Function (cambia estado con service_role).
async function rechazarUno(id, token, motivo) {
  const resp = await fetch(EF_CMD_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rechazar", propuesta_id: Number(id), motivo }),
  });
  const raw = await resp.text();
  let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
  return { ok: resp.ok && json.ok !== false, status: resp.status, json };
}

// Saca una fila de memoria y re-renderiza (respeta orden/paginación).
function quitarFila(id) {
  _rowsRev = _rowsRev.filter((r) => String(r.id) !== String(id));
  if (_apiRev) _apiRev.setRows(_rowsRev);
}

// Aceptar por fila = aprobar + publicar (misma EF autoritativa que el lote).
async function aceptarFila(id) {
  const sess = await getSession().catch(() => null);
  if (!sess?.access_token) { $("revisionInfo").textContent = "Sin sesión de Supabase. Inicia sesión e inténtalo de nuevo."; return; }
  $("revisionInfo").textContent = "Aprobando…";
  const row = _rowsRev.find((x) => String(x.id) === String(id));
  const compra = row?.metadata?.precio_compra_transitorio || null;
  const r = await aprobarUno(id, sess.access_token, compra).catch(() => ({ ok: false, json: {} }));
  if (r.ok) { quitarFila(id); $("revisionInfo").textContent = "Precio aprobado y publicado."; }
  else { $("revisionInfo").textContent = "No pude aprobar: " + (r.json?.error || r.status || "error"); }
}

// Eliminar por fila = rechazar (con modal de confirmación + motivo opcional).
function eliminarFila(id) {
  abrirModal({
    titulo: "Rechazar precio",
    cuerpoHTML: `<p style="margin:0 0 8px;color:#475569">¿Rechazar este precio? Sale de Aprobación Final. Puedes anotar el motivo (opcional).</p>
      <textarea id="revMotivo" rows="3" placeholder="Motivo (opcional)"
        style="width:100%;border:1px solid #d6d3d1;border-radius:8px;padding:8px;font-size:14px;font-family:inherit;resize:vertical"></textarea>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Rechazar", primario: true, onClick: async () => {
          const motivo = (document.getElementById("revMotivo")?.value || "").trim() || null;
          const sess = await getSession().catch(() => null);
          if (!sess?.access_token) { $("revisionInfo").textContent = "Sin sesión de Supabase."; return; }
          $("revisionInfo").textContent = "Rechazando…";
          const r = await rechazarUno(id, sess.access_token, motivo).catch(() => ({ ok: false, json: {} }));
          if (r.ok) { quitarFila(id); $("revisionInfo").textContent = "🗑 Precio rechazado."; }
          else { $("revisionInfo").textContent = "No pude rechazar: " + (r.json?.error || r.status || "error"); }
        } },
    ],
  });
}

async function onConfirmar() {
  const ids = [...document.querySelectorAll(".revChk:checked")].map((c) => c.dataset.id);
  if (!ids.length) return;
  const sess = await getSession().catch(() => null);
  if (!sess?.access_token) {
    $("revisionInfo").textContent = "Sin sesión de Supabase. Inicia sesión en el panel e inténtalo de nuevo.";
    return;
  }
  $("btnConfirmarSel").disabled = true;
  let ok = 0, fail = 0;
  const aprobados = [];
  for (const id of ids) {
    $("revisionInfo").textContent = `Aprobando ${ok + fail + 1}/${ids.length}…`;
    try {
      const row = _rowsRev.find((x) => String(x.id) === String(id));
      const compra = row?.metadata?.precio_compra_transitorio || null;
      const r = await aprobarUno(id, sess.access_token, compra);
      if (r.ok) { ok++; aprobados.push(String(id)); } else fail++;
    } catch { fail++; }
  }
  // Saca las aprobadas del set en memoria y re-renderiza (respeta orden/paginación).
  if (aprobados.length && _apiRev) {
    _rowsRev = _rowsRev.filter((r) => !aprobados.includes(String(r.id)));
    _apiRev.setRows(_rowsRev);
  }
  $("revisionInfo").textContent = `Aprobadas: ${ok}` + (fail ? ` · Fallidas: ${fail}` : "");
  refrescarSeleccion();
}

export async function mountRevision() {
  const body = $("revisionBody");
  body.innerHTML = fila(6, "Cargando…");

  try {
    const sb = getClient();
    const [{ data, error }, nombres, vigRes] = await Promise.all([
      sb.schema("staging").from("precios_propuestos")
        .select("id, material_id, sucursal_id, precio_clp_kg, desviacion_pct, ruta, estado, created_at, creado_por, metadata")
        .eq("estado", "pendiente").eq("ruta", "manual_calc")
        .order("created_at", { ascending: false })
        .limit(500),
      loadNombres(),
      // Precios oficiales hoy publicados (para la columna "P. Lista Actual").
      sb.schema("curated").from("vw_materiales_sucursal_precios_vigente")
        .select("material_id, sucursal_id, precio_venta_clp").limit(2000),
    ]);
    if (error) throw error;
    _rowsRev = data || [];

    // Mapa material|sucursal → precio de venta vigente (el que está publicado ahora).
    const vigMap = new Map();
    (vigRes?.data || []).forEach((v) =>
      vigMap.set(`${v.material_id}|${v.sucursal_id}`, Number(v.precio_venta_clp)));
    const precioActual = (r) => {
      const v = vigMap.get(`${r.material_id}|${r.sucursal_id}`);
      return v == null || isNaN(v) ? null : v;
    };

    // Modal "ver detalle": arma el precio completo (usa metadata de la propuesta).
    function verDetalle(id) {
      const r = _rowsRev.find((x) => String(x.id) === String(id));
      if (!r) return;
      const m = r.metadata || {};
      const pct = (v) => (v == null || v === "" ? "—" : Number(v) + "%");
      const kg = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("es-CL") + " kg");
      const cuerpo =
        filaDet("Material", esc(nombres.material(r.material_id))) +
        filaDet("Sucursal", esc(nombres.sucursal(r.sucursal_id))) +
        filaDet("P. Lista Nuevo", clp(r.precio_clp_kg)) +
        filaDet("P. Lista Actual", clp(precioActual(r))) +
        filaDet("P. Ejecutivo", clp(m.pejec)) +
        filaDet("P. Máximo", clp(m.pmax)) +
        filaDet("Margen objetivo", pct(m.mg_pct)) +
        filaDet("Flete", clp(m.flete)) +
        filaDet("Spread Lista/Máx", pct(m.spread_pct)) +
        filaDet("Volumen mensual", kg(m.volumen_kg)) +
        filaDet("Retención IVA", pct(m.iva_pct)) +
        filaDet("Origen", esc(r.ruta || "—")) +
        filaDet("Ingresado por", esc(r.creado_por || m.editado_por || "—")) +
        filaDet("Creado", horaChile(r.created_at));
      abrirModal({
        titulo: "Detalle del precio",
        cuerpoHTML: cuerpo,
        acciones: [
          { texto: "Abrir en Calculadora →", href: `/?proposalId=${r.id}#calculadora` },
          { texto: "Cerrar", primario: true },
        ],
      });
    }

    const renderRow = (r) => {
      const act = precioActual(r);
      const actHtml = act == null
        ? `<span class="text-stone-400">— sin publicar</span>`
        : `<span class="text-stone-700">${clp(act)}</span>`;
      return `<tr class="hover:bg-stone-50">
        <td class="px-4 py-2.5"><input type="checkbox" class="revChk" data-id="${r.id}"></td>
        <td class="px-4 py-2.5 font-medium text-stone-800">${esc(nombres.material(r.material_id))}</td>
        <td class="px-4 py-2.5 text-stone-600">${esc(nombres.sucursal(r.sucursal_id))}</td>
        <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_clp_kg)}</td>
        <td class="px-4 py-2.5 text-right">${actHtml}</td>
        <td class="px-4 py-2.5 text-right whitespace-nowrap">
          <button type="button" class="revVer text-stone-600 text-xs font-medium hover:underline" data-id="${r.id}" style="background:none;border:0;cursor:pointer">Ver</button>
          <button type="button" class="revAcc text-emerald-700 text-xs font-semibold hover:underline ml-2" data-id="${r.id}" style="background:none;border:0;cursor:pointer">Aceptar</button>
          <a href="/?proposalId=${r.id}#calculadora" class="revMod text-sky-700 text-xs font-medium hover:underline ml-2" style="text-decoration:none">Modificar</a>
          <button type="button" class="revDel text-rose-700 text-xs font-medium hover:underline ml-2" data-id="${r.id}" style="background:none;border:0;cursor:pointer">Eliminar</button>
        </td>
      </tr>`;
    };

    _apiRev = montarTabla({
      tbody: body, thead: $("revisionHead"), pager: $("revisionPager"),
      rows: _rowsRev, renderRow, colspan: 6, pageSize: 25,
      vacio: "Nada pendiente de revisión.",
      sorters: {
        material: (r) => nombres.material(r.material_id),
        sucursal: (r) => nombres.sucursal(r.sucursal_id),
        precio_clp_kg: (r) => Number(r.precio_clp_kg),
        precio_actual: (r) => { const v = precioActual(r); return v == null ? -Infinity : v; },
      },
      // Tras cada render (orden/paginación/aprobación) se re-cablean los checkboxes de la página.
      onRender: () => {
        document.querySelectorAll(".revChk").forEach((c) => c.addEventListener("change", refrescarSeleccion));
        document.querySelectorAll(".revVer").forEach((b) => b.addEventListener("click", () => verDetalle(b.dataset.id)));
        document.querySelectorAll(".revAcc").forEach((b) => b.addEventListener("click", () => aceptarFila(b.dataset.id)));
        document.querySelectorAll(".revDel").forEach((b) => b.addEventListener("click", () => eliminarFila(b.dataset.id)));
        const all = $("revSelAll"); if (all) all.checked = false;
        refrescarSeleccion();
      },
    });

    $("revSelAll").addEventListener("change", (e) => {
      document.querySelectorAll(".revChk").forEach((c) => { c.checked = e.target.checked; });
      refrescarSeleccion();
    });
    $("btnConfirmarSel").addEventListener("click", onConfirmar);
    $("revisionInfo").textContent = `${_rowsRev.length} pendiente(s) · aprobar publica el precio oficial.`;
  } catch (e) {
    body.innerHTML = fila(6, "No pude cargar la revisión: " + esc(e.message));
  }
}
