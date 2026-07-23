// CONTROLADOR · Pendientes. Segunda etapa del flujo: lo que el operador ya revisó
// espera aquí a que gerencia le asigne sucursal y defina el precio a publicar.
//
// Publicar es exclusivo de gerencia y lo resuelve el RPC f_borrador_publicar, que a su
// vez reutiliza f_actualizar_precio (mismo cuello de botella auditado que el resto).
import { listarBorradores, publicar, descartar, catalogos } from "../models/flujoRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, horaChile, filtroGlobal } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

let _filas = [];
let _tabla = null;
let _rol = "lector";
let _sucursales = [];

export async function mountPendientes() {
  const body = $("penBody");
  body.innerHTML = fila(7, "Cargando…");

  try {
    const [filas, cat] = await Promise.all([
      listarBorradores({ estados: ["pendiente"] }),
      catalogos(),
    ]);
    _filas = filas;
    _sucursales = cat.sucursales;
    _rol = filas[0]?.mi_rol || "lector";

    pintarRol();
    if (!_filas.length) { body.innerHTML = fila(7, "No hay precios pendientes. 🎉"); return; }

    _tabla = montarTabla({
      tbody: body, thead: $("penHead"), info: $("penInfo"), pager: $("penPager"),
      rows: _filas, renderRow, colspan: 7, pageSize: 25,
      sortInicial: { key: "creado", dir: "desc" },
      sorters: {
        material: (r) => r.material || "",
        recibido: (r) => Number(r.precio_recibido_clp ?? 0),
        vigencia: (r) => r.vigencia_desde || "",
        origen:   (r) => r.origen || "",
        creado:   (r) => r.created_at || "",
      },
      infoText: (t, p, pg) => `${t} pendiente(s) · página ${p} de ${pg}.`,
      onRender: cablearFilas,
    });

    cablearBuscador();
    cablearLote();
    actualizarResumen();
  } catch (e) {
    body.innerHTML = fila(7, "❌ No pude cargar los pendientes: " + esc(e.message));
  }
}

function renderRow(r) {
  const puedePublicar = _rol === "gerencia";
  return `<tr class="hover:bg-stone-50" data-id="${r.id}">
    <td class="px-3 py-2.5 text-center"><input type="checkbox" class="penChk" value="${r.id}"></td>
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-stone-700">${clp(r.precio_recibido_clp)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${r.vigencia_desde || "—"}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${esc(r.origen)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${esc(r.creado_por || "—")}<br>${horaChile(r.created_at)}</td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      <button class="penPub bg-emerald-700 text-white px-3 py-1 rounded text-xs font-medium ${puedePublicar ? "" : "opacity-50"}"
        ${puedePublicar ? "" : "disabled title='Solo gerencia puede publicar'"}>Publicar</button>
    </td>
  </tr>`;
}

function cablearFilas() {
  document.querySelectorAll("#penBody .penPub").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const id = Number(b.closest("tr").dataset.id);
      abrirPublicar(_filas.find((f) => f.id === id));
    });
  });
  const todos = $("penTodos");
  if (todos) todos.onchange = () =>
    document.querySelectorAll("#penBody .penChk").forEach((c) => { c.checked = todos.checked; });
}

// Modal de publicación: asignar sucursal + precio público. El margen se muestra solo
// como información — ya no hay categorías de margen ni cálculo automático.
function abrirPublicar(r) {
  if (!r) return;
  const opts = _sucursales.map((s) =>
    `<option value="${esc(s.sucursal_id)}">${esc(s.nombre)}</option>`).join("");

  abrirModal({
    titulo: `Publicar · ${r.material}`,
    cuerpoHTML: `
      <p style="margin:0 0 12px;font-size:13px;color:#57534e">
        La fundición nos paga <b>${clp(r.precio_recibido_clp)}</b> por este material.
        Define cuánto le pagamos a la gente: ese es el precio que verán las webs.
      </p>
      <label style="display:block;margin-bottom:10px">
        <span style="font-size:12px;color:#57534e">Sucursal</span>
        <select id="pubSuc" style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px">
          <option value="">— elige sucursal —</option>${opts}
        </select>
      </label>
      <label style="display:block;margin-bottom:10px">
        <span style="font-size:12px;color:#57534e">Precio a publicar (lo que pagamos) $/kg</span>
        <input id="pubPrecio" type="number" min="0" step="1" style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px">
      </label>
      <div id="pubMargen" style="font-size:13px;color:#57534e;background:#f5f5f4;padding:8px 10px;border-radius:6px">
        Margen resultante: <b>—</b>
      </div>
      <div id="pubError" style="display:none;margin-top:10px;color:#be123c;font-size:13px;font-weight:600"></div>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Publicar", primario: true, cerrar: false, onClick: () => confirmarPublicar(r) },
    ],
  });

  // Margen en vivo: informativo, no condiciona el guardado.
  const inp = $("pubPrecio");
  const box = $("pubMargen");
  inp.addEventListener("input", () => {
    const v = Number(inp.value);
    const rec = Number(r.precio_recibido_clp);
    if (!v || !rec) { box.innerHTML = "Margen resultante: <b>—</b>"; return; }
    const m = ((rec - v) / rec) * 100;
    const alerta = v > rec;
    box.innerHTML = alerta
      ? `⛔ <b>Pagarías más de lo que nos pagan</b> (${clp(v)} vs ${clp(rec)}): sería comprar con pérdida.`
      : `Margen resultante: <b>${m.toFixed(1)}%</b>`;
    box.style.background = alerta ? "#ffe4e6" : "#f5f5f4";
    box.style.color = alerta ? "#be123c" : "#57534e";
  });
}

async function confirmarPublicar(r) {
  const suc = $("pubSuc").value;
  const precio = Number($("pubPrecio").value);
  const err = $("pubError");
  const mostrar = (m) => { err.textContent = m; err.style.display = "block"; };

  if (!suc) return mostrar("Elige la sucursal.");
  if (!precio || precio <= 0) return mostrar("Escribe el precio a publicar.");
  if (precio > Number(r.precio_recibido_clp))
    return mostrar("No puedes pagar más de lo que nos paga la fundición.");

  try {
    await publicar({ id: r.id, sucursalId: suc, precioPublicado: precio });
    document.getElementById("rcModalBackdrop")?.classList.remove("open");
    _filas = _filas.filter((f) => f.id !== r.id);   // sale de pendientes
    _tabla.setRows(_filas);
    actualizarResumen();
  } catch (e) {
    mostrar(e.message);
  }
}

function cablearLote() {
  const btn = $("penDescartar");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll("#penBody .penChk:checked")].map((c) => Number(c.value));
    if (!ids.length) return;
    abrirModal({
      titulo: "Descartar precios",
      cuerpoHTML: `<p>¿Descartar <b>${ids.length}</b> precio(s)? Quedarán en el Historial como descartados.</p>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Descartar", primario: true, onClick: async () => {
            try {
              await descartar(ids, "Descartado desde Pendientes");
              _filas = _filas.filter((f) => !ids.includes(f.id));
              _tabla.setRows(_filas);
              actualizarResumen();
            } catch (e) {
              abrirModal({ titulo: "No se pudo descartar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
            }
          } },
      ],
    });
  });
}

function cablearBuscador() {
  const b = $("penBuscar");
  if (!b) return;
  // Filtra en memoria: la lista de pendientes es acotada por definición. El Historial,
  // que sí puede tener miles, filtra en el servidor contra el índice de trigramas.
  b.addEventListener("input", () => {
    _tabla.setRows(filtroGlobal(_filas, b.value,
      ["material", "material_texto", "origen", "creado_por", "revisado_por", "precio_recibido_clp"]));
  });
}

function pintarRol() {
  const chip = $("penRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes publicar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("penAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes revisar y descartar, ` +
    `pero solo gerencia publica precios a la web.`;
  aviso.classList.remove("hidden");
}

function actualizarResumen() {
  const el = $("penResumen");
  if (el) el.textContent = `${_filas.length} pendiente(s)`;
}
