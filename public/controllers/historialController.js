// CONTROLADOR · Historial. Reemplaza a la antigua sección "Recibidos".
// Muestra todo el flujo procesado en cualquier estado.
//
// El buscador filtra EN EL SERVIDOR contra la columna indexada `busqueda` (GIN de
// trigramas): el historial puede tener decenas de miles de filas y no tiene sentido
// traérselas al navegador.
//
// Además absorbió el DESCARTE EN LOTE que vivía en la desaparecida sección "Pendientes".
// Solo se puede descartar lo que aún no se resolvió (crudo o pendiente): lo publicado ya
// generó un precio vigente y lo descartado ya está descartado.
import { listarBorradores, descartar, vaciarHistorial, contarVaciadoHistorial } from "../models/flujoRepo.js";
import { montarTabla, conectarSeleccion } from "../js/listaTabla.js";
import { abrirModal, cerrarModal } from "../components/modal.js";
import { escapeHTML, horaChile } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const COLS = 8;
const fila = (txt) => `<tr><td colspan="${COLS}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

const ETIQUETA = {
  crudo:      { txt: "Cargado",    css: "bg-stone-100 text-stone-700" },
  pendiente:  { txt: "Pendiente",  css: "bg-amber-100 text-amber-800" },
  publicado:  { txt: "Publicado",  css: "bg-emerald-100 text-emerald-800" },
  descartado: { txt: "Descartado", css: "bg-rose-100 text-rose-700" },
};

// Estados sobre los que el descarte tiene sentido.
const DESCARTABLE = new Set(["crudo", "pendiente"]);

let _tabla = null;
let _debounce = null;
let _seleccion = null;    // helper de selección múltiple (sobrevive al cambio de página)
let _rol = "lector";

export async function mountHistorial() {
  const body = $("hisBody");
  body.innerHTML = fila("Cargando…");

  try {
    const filas = await consultar();
    _rol = filas[0]?.mi_rol || "lector";

    _seleccion = conectarSeleccion({
      tbody: body, master: $("hisTodos"), clase: "hisChk", onCambio: pintarLote,
    });

    _tabla = montarTabla({
      tbody: body, thead: $("hisHead"), info: $("hisInfo"), pager: $("hisPager"),
      rows: filas, renderRow, colspan: COLS, pageSize: 50,
      vacio: "Sin movimientos que coincidan.",
      sortInicial: { key: "creado", dir: "desc" },
      sorters: {
        estado:    (r) => r.estado || "",
        material:  (r) => r.material || "",
        sucursal:  (r) => r.sucursal || "",
        recibido:  (r) => Number(r.precio_recibido_clp ?? 0),
        publicado: (r) => Number(r.precio_publicado_clp ?? 0),
        origen:    (r) => r.origen || "",
        creado:    (r) => r.created_at || "",
      },
      infoText: (t, p, pg) => `${t} movimiento(s) · página ${p} de ${pg}.`,
      // Cada repintado destruye los <input> anteriores: hay que restaurarlos.
      onRender: () => _seleccion.sincronizar(),
    });
    cablearFiltros();
    cablearLote();
    cablearVaciado();
    resumen(filas.length);
  } catch (e) {
    body.innerHTML = fila("❌ No pude cargar el historial: " + esc(e.message));
  }
}

function consultar() {
  const texto = $("hisBuscar")?.value || "";
  const estado = $("hisEstado")?.value || "";
  return listarBorradores({ estados: estado ? [estado] : null, texto, limite: 1000 });
}

function renderRow(r) {
  const e = ETIQUETA[r.estado] || { txt: r.estado, css: "bg-stone-100 text-stone-700" };
  const puede = _rol !== "lector" && DESCARTABLE.has(r.estado);
  // El estado marcado lo restaura conectarSeleccion() tras el render: acá no se decide.
  const chk = `<input type="checkbox" class="hisChk" data-id="${r.id}" ${puede ? "" : "disabled"}
      title="${puede ? "Seleccionar para descartar" : "Solo se descarta lo cargado o pendiente"}"
      style="cursor:${puede ? "pointer" : "not-allowed"}">`;
  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5">${chk}</td>
    <td class="px-4 py-2.5"><span class="${e.css}" style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${e.txt}</span></td>
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material || r.material_texto || "—")}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal || "—")}</td>
    <td class="px-4 py-2.5 text-right text-stone-700">${clp(r.precio_recibido_clp)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_publicado_clp)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${esc(r.origen)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${horaChile(r.created_at)}<br>${esc(r.creado_por || "—")}</td>
  </tr>`;
}

// ── Selección en lote ─────────────────────────────────────────────────────────
// La mecánica del maestro y la persistencia entre páginas viven en conectarSeleccion()
// (js/listaTabla.js); acá solo se reacciona a cuántos hay marcados.
function pintarLote(n) {
  const caja = $("hisLote");
  if (!caja) return;
  if (!n) { caja.classList.add("hidden"); return; }
  caja.classList.remove("hidden");
  $("hisLoteMsg").textContent = `${n} seleccionado(s)`;
}

function cablearLote() {
  $("hisLimpiar")?.addEventListener("click", () => _seleccion.limpiar());

  $("hisDescartar")?.addEventListener("click", () => {
    const ids = _seleccion.numericos();
    if (!ids.length) return;
    abrirModal({
      titulo: "Descartar en lote",
      cuerpoHTML:
        `<p>¿Descartar <b>${ids.length}</b> registro(s)?</p>
         <p style="font-size:13px;color:#78716c;margin-top:8px">
           No se borran: quedan en el Historial marcados como descartados.</p>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Descartar", primario: true, onClick: async () => {
            try {
              await descartar(ids, "Descartado en lote desde Historial");
              _seleccion.limpiar();
              await recargarTabla();
            } catch (e) {
              abrirModal({ titulo: "No se pudo descartar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
            }
          } },
      ],
    });
  });
}

// ── Vaciado del historial (solo gerencia) ─────────────────────────────────────
// El botón se oculta a quien no es gerencia por comodidad, no por seguridad: quien edite
// el JS igual choca con el RPC, que revalida el rol contra el JWT firmado por Supabase.
function cablearVaciado() {
  const btn = $("hisVaciar");
  if (!btn) return;
  if (_rol !== "gerencia") { btn.classList.add("hidden"); return; }
  btn.classList.remove("hidden");

  btn.addEventListener("click", async () => {
    let conteo;
    try {
      conteo = await contarVaciadoHistorial();
    } catch (e) {
      return abrirModal({ titulo: "No se pudo consultar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
    }

    abrirModal({
      titulo: "Vaciar historial",
      cuerpoHTML: `
        <p>Se eliminarán <b>${conteo.a_borrar}</b> de ${conteo.total} registro(s) del historial.</p>
        ${conteo.publicados_protegidos > 0 ? `
        <p style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px;margin-top:10px;font-size:13px;color:#065f46">
          🛡️ Se conservarán <b>${conteo.publicados_protegidos}</b> registro(s) publicados: son el
          único rastro de qué carga originó cada precio vigente.
        </p>` : ""}
        <label style="display:block;margin-top:12px">
          <span style="font-size:12px;color:#57534e">Motivo (queda registrado)</span>
          <input id="hisVacMotivo" placeholder="ej. limpieza de pruebas de marzo"
            style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px">
        </label>
        <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;color:#9f1239">
          <input type="checkbox" id="hisVacTodo"> Borrar también los publicados (pierdes la trazabilidad)
        </label>
        <p style="font-size:13px;color:#be123c;font-weight:600;margin-top:10px">
          Esta acción no se puede deshacer.</p>
        <div id="hisVacError" style="display:none;color:#be123c;font-size:13px;font-weight:600;margin-top:8px"></div>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Vaciar", primario: true, cerrar: false, onClick: async () => {
            const err = $("hisVacError");
            const motivo = ($("hisVacMotivo")?.value || "").trim();
            if (!motivo) {
              err.textContent = "Escribe el motivo para continuar.";
              err.style.display = "block";
              return;
            }
            try {
              const res = await vaciarHistorial({
                motivo, incluirPublicados: !!$("hisVacTodo")?.checked,
              });
              cerrarModal();
              _seleccion.limpiar();
              await recargarTabla();
              resumen(null, null, `🗑️ ${res.registros_borrados} registro(s) eliminados.`);
            } catch (e) {
              err.textContent = e.message;
              err.style.display = "block";
            }
          } },
      ],
    });
  });
}

// ── Filtros ───────────────────────────────────────────────────────────────────
async function recargarTabla() {
  const filas = await consultar();
  _tabla.setRows(filas);
  resumen(filas.length);
}

function cablearFiltros() {
  const recargar = async () => {
    try {
      _seleccion.limpiar();   // cambió el conjunto: la selección anterior ya no aplica
      await recargarTabla();
    } catch (e) {
      resumen(0, e.message);
    }
  };
  // Se espera a que el usuario deje de escribir: una consulta por tecla saturaría la API.
  $("hisBuscar")?.addEventListener("input", () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(recargar, 300);
  });
  $("hisEstado")?.addEventListener("change", recargar);
}

function resumen(n, error = null, aviso = null) {
  const el = $("hisResumen");
  if (!el) return;
  if (aviso) el.textContent = aviso;
  else el.textContent = error ? "⚠️ " + error : `${n} resultado(s)`;
}
