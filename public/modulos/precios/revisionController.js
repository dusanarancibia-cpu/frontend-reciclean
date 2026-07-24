// CONTROLADOR · Revisión. Paso previo a publicar (compuerta de aprobación).
//
// Muestra los borradores en estado 'revision' —lo que salió de la Calculadora con su
// escalera ya calculada— y deja a gerencia aprobarlos (recién ahí se publican en la vitrina)
// o rechazarlos. Cada fila abre un Modal de Detalle Completo antes de aprobar.
//
// Fuente: public.borradores_panel (estado='revision'). Aprobar → f_borrador_aprobar (publica,
// con fanout de Santiago). Rechazar → f_borrador_descartar.
import { listarBorradores, aprobarRevision, descartar } from "./flujoRepo.js";
import { montarTabla, conectarSeleccion } from "../../shared/js/listaTabla.js";
import { abrirModal } from "../../shared/components/modal.js";
import { toast, toastError } from "../../shared/components/toast.js";
import { escapeHTML, horaChile } from "../../shared/js/util.js";
import { rolActual } from "../../shared/js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const pct = (v) => (v == null || v === "" ? "—" : Number(v) + "%");
const fechaCorta = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("-") : "—");
const nombreSuc = (id) => (id === "santiago" ? "Santiago (Maipú + Cerrillos)" : (id || "—"));

const BADGES = [
  "background:#dbeafe;color:#1e40af", "background:#dcfce7;color:#166534",
  "background:#fef3c7;color:#92400e", "background:#ede9fe;color:#5b21b6",
  "background:#ffe4e6;color:#9f1239", "background:#cffafe;color:#155e75",
];
function badgeEmpresa(nombre) {
  if (!nombre) return `<span style="color:#a8a29e">—</span>`;
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return `<span style="${BADGES[h % BADGES.length]};padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700">${esc(nombre)}</span>`;
}
const filaDet = (label, valor) =>
  `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f1f5f9">
     <span style="color:#64748b">${label}</span><span style="font-weight:600;color:#0f172a;text-align:right">${valor}</span></div>`;

let _rows = [];
let _tabla = null;
let _sel = null;
let _rol = "lector";

export async function mountRevision() {
  const body = $("revBody");
  body.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-stone-400">Cargando…</td></tr>`;

  try {
    _rows = await listarBorradores({ estados: ["revision"], limite: 500 });
    _rol = _rows[0]?.mi_rol || rolActual();
    pintarRol();

    if (_rol !== "gerencia") {
      body.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-stone-400">Solo gerencia aprueba precios.</td></tr>`;
      return;
    }

    _tabla = montarTabla({
      tbody: body, thead: $("revHead"), info: $("revInfo"), pager: $("revPager"),
      rows: _rows, renderRow, colspan: 7, pageSize: 25,
      vacio: "Nada pendiente de aprobar. Lo que envíes desde la Calculadora aparecerá aquí.",
      sortInicial: { key: "material", dir: "asc" },
      sorters: {
        material: (r) => r.material || r.material_texto || "",
        empresa:  (r) => r.empresa_cliente || "",
        sucursal: (r) => r.sucursal || r.sucursal_id || "",
        recibido: (r) => Number(r.precio_recibido_clp ?? -1),
        lista:    (r) => Number(r.precio_publicado_clp ?? -1),
      },
      infoText: (t, p, pg) => `${t} en revisión · página ${p} de ${pg}.`,
      onRender: () => { _sel?.sincronizar(); cablearFilas(); },
    });

    _sel = conectarSeleccion({
      tbody: body, master: $("revSelAll"), clase: "revChk",
      onCambio: (n) => {
        $("revSelCount").textContent = n;
        $("btnAprobarSel").disabled = n === 0;
      },
    });
    _sel.sincronizar();

    cablearControles();
    resumen();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-rose-600">No pude cargar la revisión: ${esc(e.message)}</td></tr>`;
  }
}

function visibles() {
  const q = ($("revBuscar")?.value || "").toLowerCase().trim();
  if (!q) return _rows;
  return _rows.filter((r) =>
    `${r.material || ""} ${r.material_texto || ""} ${r.empresa_cliente || ""} ${r.sucursal || ""}`.toLowerCase().includes(q));
}

function renderRow(r) {
  return `<tr class="hover:bg-stone-50">
    <td class="px-3 py-2.5 text-center"><input type="checkbox" class="revChk" data-id="${r.id}"></td>
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material || r.material_texto || "—")}</td>
    <td class="px-4 py-2.5">${badgeEmpresa(r.empresa_cliente)}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(nombreSuc(r.sucursal || r.sucursal_id))}</td>
    <td class="px-4 py-2.5 text-right text-stone-500">${clp(r.precio_recibido_clp)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_publicado_clp)}</td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      <button type="button" class="revVer text-stone-600 text-xs font-medium hover:underline" data-id="${r.id}" style="background:none;border:0;cursor:pointer">Detalle</button>
      <button type="button" class="revAcc text-emerald-700 text-xs font-semibold hover:underline ml-2" data-id="${r.id}" style="background:none;border:0;cursor:pointer">Aprobar</button>
      <button type="button" class="revDel text-rose-700 text-xs font-medium hover:underline ml-2" data-id="${r.id}" style="background:none;border:0;cursor:pointer">Rechazar</button>
    </td>
  </tr>`;
}

function cablearFilas() {
  document.querySelectorAll("#revBody .revVer").forEach((b) => b.addEventListener("click", () => verDetalle(b.dataset.id)));
  document.querySelectorAll("#revBody .revAcc").forEach((b) => b.addEventListener("click", () => aprobar([b.dataset.id])));
  document.querySelectorAll("#revBody .revDel").forEach((b) => b.addEventListener("click", () => rechazar(b.dataset.id)));
}

// Modal de Detalle Completo: todo el precio calculado antes de aprobarse.
function verDetalle(id) {
  const r = _rows.find((x) => String(x.id) === String(id));
  if (!r) return;
  const c = r.calculo || {};
  abrirModal({
    titulo: "Detalle del precio",
    cuerpoHTML:
      filaDet("Material", esc(r.material || r.material_texto || "—")) +
      filaDet("Empresa / Cliente", r.empresa_cliente ? esc(r.empresa_cliente) : "—") +
      filaDet("Sucursal", esc(nombreSuc(r.sucursal || r.sucursal_id))) +
      filaDet("Nos pagan (recibido)", clp(r.precio_recibido_clp)) +
      filaDet("P.Lista (saldrá a la web)", `<span style="color:#047857">${clp(r.precio_publicado_clp)}</span>`) +
      filaDet("P.Ejecutivo", clp(c.ejecutivo)) +
      filaDet("P.Máximo", clp(c.maximo)) +
      filaDet("Margen sobre recibido", pct(r.margen_pct)) +
      filaDet("Flete", clp(c.flete)) +
      filaDet("Spread Lista/Máx", pct(c.spread)) +
      filaDet("Retención IVA", pct(c.iva)) +
      filaDet("Redondeo", esc(c.redondeo || "—")) +
      filaDet("Vigencia", fechaCorta(r.vigencia_desde)) +
      filaDet("Ingresado por", esc(r.creado_por || "—")) +
      filaDet("Enviado", horaChile(r.updated_at)),
    acciones: [
      { texto: "Rechazar", onClick: () => rechazar(id) },
      { texto: "Aprobar y publicar", primario: true, onClick: () => aprobar([id]) },
    ],
  });
}

async function aprobar(ids) {
  const resumenEl = $("revResumen");
  let ok = 0, fail = 0;
  for (const id of ids) {
    resumenEl.textContent = `Aprobando ${ok + fail + 1}/${ids.length}…`;
    try { await aprobarRevision({ id: Number(id) }); ok++; _rows = _rows.filter((r) => String(r.id) !== String(id)); }
    catch (e) { fail++; toastError(e.message); }
  }
  _tabla.setRows(_rows);
  resumen();
  if (ok) toast(`${ok} precio(s) aprobado(s) y publicado(s).`);
}

function rechazar(id) {
  const r = _rows.find((x) => String(x.id) === String(id));
  abrirModal({
    titulo: "Rechazar precio",
    cuerpoHTML: `<p>¿Rechazar <b>${esc(r?.material || r?.material_texto || "este precio")}</b>? Sale de la revisión y queda en el Historial.</p>
      <textarea id="revMotivo" rows="2" placeholder="Motivo (opcional)"
        style="width:100%;border:1px solid #d6d3d1;border-radius:8px;padding:8px;font-size:14px;font-family:inherit;resize:vertical;margin-top:8px"></textarea>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Rechazar", primario: true, onClick: async () => {
          const motivo = ($("revMotivo")?.value || "").trim() || "Rechazado en Revisión";
          try {
            await descartar([Number(id)], motivo);
            _rows = _rows.filter((x) => String(x.id) !== String(id));
            _tabla.setRows(_rows); resumen();
            toast("Precio rechazado.");
          } catch (e) { toastError(e.message); }
        } },
    ],
  });
}

function cablearControles() {
  $("revBuscar")?.addEventListener("input", () => _tabla.setRows(visibles()));
  $("btnAprobarSel")?.addEventListener("click", () => {
    const ids = _sel.seleccionados();
    if (!ids.length) return;
    abrirModal({
      titulo: "Aprobar seleccionados",
      cuerpoHTML: `<p>¿Aprobar y publicar <b>${ids.length}</b> precio(s)? Saldrán a la vitrina web.</p>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Aprobar", primario: true, onClick: () => { const c = _sel.seleccionados(); _sel.limpiar(); aprobar(c); } },
      ],
    });
  });
}

function resumen() {
  const el = $("revResumen");
  if (el) el.textContent = `${_rows.length} en revisión`;
}

function pintarRol() {
  const chip = $("revRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes aprobar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("revAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `Tu perfil es <b>${esc(_rol)}</b>: solo gerencia aprueba y publica precios.`;
  aviso.classList.remove("hidden");
}
