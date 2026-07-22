// CONTROLADOR · Propuestas. Ajustes de precio que genera Diego y que gerencia
// debe CONFIRMAR o RECHAZAR (se saltan la calculadora).
// Fuente: staging.precios_propuestos · estado='pendiente'
//   AND (fuente_rol='referencia' OR fuente_id='diego_lista_*')  ← lo de Diego
//   AND ruta <> 'manual_calc'                                    ← lo aún NO aceptado
// Aceptar  → update ruta='manual_calc' (permitido desde el navegador; el trigger
//            de estado NO se dispara) → aparece en Revisión.
// Rechazar → EF precio-command { action:'rechazar' } con token real (cambia estado
//            vía service_role; el navegador no puede tocar estado directo).
import { SUPABASE_URL, SUPABASE_ANON_KEY, EF } from "../js/config.js";
import { getClient, getSession, loadNombres } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const esc = escapeHTML; // helper único (cubre < > & " '); solo para innerHTML, no para textContent
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;
const EF_CMD_URL = SUPABASE_URL + (EF.precioCommand || "/functions/v1/precio-command");

let _rows = [];      // filas crudas (sin filtro de confianza)
let _api = null;     // handle de la tabla
let _sel = null;     // <select> de confianza

function chipConf(c) {
  const v = Number(c);
  // Estilos inline: no dependen del purge de Tailwind (estas clases solo viven en JS).
  const st = v >= 1 ? "background:#d1fae5;color:#047857"
    : v >= 0.85 ? "background:#fef3c7;color:#b45309" : "background:#f5f5f4;color:#78716c";
  return `<span style="${st};padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600">${isNaN(v) ? "—" : v.toFixed(2)}</span>`;
}

// Botones con estilo inline (robustos ante el purge de Tailwind).
const BTN_ACEPTAR = "background:#047857;color:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer";
const BTN_RECHAZAR = "background:#fff;color:#b91c1c;border:1px solid #fca5a5;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-left:6px";

function filtrar(min) {
  return _rows.filter((r) => Number(r.confidence_score) >= min);
}

// Saca una fila de memoria y re-renderiza respetando orden/paginación/filtro.
function quitarFila(id) {
  _rows = _rows.filter((r) => String(r.id) !== String(id));
  if (_api) _api.setRows(filtrar(parseFloat(_sel.value)));
}

async function onAceptar(id) {
  $("propuestasInfo").textContent = "Aceptando…";
  const { error } = await getClient()
    .schema("staging").from("precios_propuestos")
    .update({ ruta: "manual_calc" }).eq("id", Number(id));
  if (error) {
    // textContent ya escapa: no usar esc() aquí (mostraría entidades como &amp;).
    $("propuestasInfo").textContent = "❌ No pude aceptar: " + error.message +
      " (¿sesión iniciada?)";
    return;
  }
  quitarFila(id);
  $("propuestasInfo").textContent = "✅ Propuesta aceptada → pasó a Revisión.";
}

async function onRechazar(id) {
  const sess = await getSession().catch(() => null);
  if (!sess?.access_token) {
    $("propuestasInfo").textContent = "⚠️ Sin sesión de Supabase. Inicia sesión e inténtalo de nuevo.";
    return;
  }
  const motivo = prompt("Motivo del rechazo (opcional):") || null;
  $("propuestasInfo").textContent = "Rechazando…";
  try {
    const resp = await fetch(EF_CMD_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + sess.access_token,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "rechazar", propuesta_id: Number(id), motivo }),
    });
    const raw = await resp.text();
    let js = {}; try { js = raw ? JSON.parse(raw) : {}; } catch { js = { raw }; }
    if (!resp.ok || js.ok === false) {
      $("propuestasInfo").textContent = "❌ No pude rechazar: " + (js.error || resp.status);
      return;
    }
    quitarFila(id);
    $("propuestasInfo").textContent = "🗑️ Propuesta rechazada.";
  } catch (e) {
    $("propuestasInfo").textContent = "❌ Error de red al rechazar: " + e.message;
  }
}

// Re-cablea los botones de cada página tras render (orden/paginación/filtro).
function wireBotones() {
  document.querySelectorAll(".propAcc").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (b.dataset.act === "aceptar") onAceptar(id);
      else onRechazar(id);
    });
  });
}

export async function mountPropuestas() {
  const body = $("propuestasBody");
  _sel = $("propFiltroConf");
  body.innerHTML = fila(6, "Cargando…");

  try {
    const sb = getClient();
    const [{ data, error }, nombres] = await Promise.all([
      sb.schema("staging").from("precios_propuestos")
        .select("id, material_id, sucursal_id, precio_clp_kg, confidence_score, ruta, origen, fuente_rol, fuente_id, estado, created_at")
        // Propuestas de Diego pendientes de confirmar, que aún NO fueron aceptadas
        // (aceptar = ruta 'manual_calc' → se van a Revisión).
        .eq("estado", "pendiente")
        .neq("ruta", "manual_calc")
        .or("fuente_rol.eq.referencia,fuente_id.like.diego_lista_*")
        .order("created_at", { ascending: false })
        .limit(500),
      loadNombres(),
    ]);
    if (error) throw error;
    _rows = data || [];

    const renderRow = (r) => `<tr class="hover:bg-stone-50">
      <td class="px-4 py-2.5 font-medium text-stone-800">${esc(nombres.material(r.material_id))}</td>
      <td class="px-4 py-2.5 text-stone-600">${esc(nombres.sucursal(r.sucursal_id))}</td>
      <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_clp_kg)}</td>
      <td class="px-4 py-2.5 text-right">${chipConf(r.confidence_score)}</td>
      <td class="px-4 py-2.5 text-stone-500">${esc(r.origen || r.ruta || "Diego")}</td>
      <td class="px-4 py-2.5 text-right whitespace-nowrap">
        <button class="propAcc" data-id="${r.id}" data-act="aceptar" style="${BTN_ACEPTAR}">Aceptar</button>
        <button class="propAcc" data-id="${r.id}" data-act="rechazar" style="${BTN_RECHAZAR}">Rechazar</button>
      </td>
    </tr>`;
    const sorters = {
      material: (r) => nombres.material(r.material_id),
      sucursal: (r) => nombres.sucursal(r.sucursal_id),
      precio_clp_kg: (r) => Number(r.precio_clp_kg),
      confidence_score: (r) => Number(r.confidence_score),
      origen: (r) => r.origen || r.ruta || "Diego",
    };

    _api = montarTabla({
      tbody: body, thead: $("propuestasHead"), info: $("propuestasInfo"), pager: $("propuestasPager"),
      rows: filtrar(parseFloat(_sel.value)), renderRow, sorters, colspan: 6, pageSize: 25,
      vacio: "Sin propuestas para ese filtro.",
      sortInicial: { key: "confidence_score", dir: "desc" },
      infoText: (total, page, pages) => `${total} propuesta(s) de Diego · página ${page} de ${pages}. Aceptar → Revisión.`,
      onRender: wireBotones,
    });
    _sel.onchange = () => _api.setRows(filtrar(parseFloat(_sel.value)));
  } catch (e) {
    body.innerHTML = fila(6, "❌ No pude cargar las propuestas: " + esc(e.message));
  }
}
