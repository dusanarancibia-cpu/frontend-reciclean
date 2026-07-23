// CONTROLADOR · Calculadora. Tercera etapa del flujo: gerencia toma un pendiente,
// le asigna la sucursal y define el precio que se publicará.
//
// CAMBIO DE MODELO respecto de la versión anterior: se eliminó la "categoría margen"
// (obsoleta por decisión de negocio) y con ella el semáforo, las metas por categoría y
// el cálculo automático del precio. Ahora gerencia escribe el precio final y el margen
// se muestra solo como consecuencia, nunca como condición.
//
// El MVC anterior (public/calculadora/js/**) queda en el repo sin uso desde el router;
// su formula.js sigue cubierto por los tests y disponible si se quiere reutilizar.
import { listarBorradores, publicar, descartar, catalogos } from "../models/flujoRepo.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, horaChile, filtroGlobal } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));

let _pendientes = [];
let _sucursales = [];
let _sel = null;      // el pendiente en el que se está trabajando
let _rol = "lector";

export async function mountCalculadora() {
  const lista = $("calcLista");
  try {
    const [filas, cat] = await Promise.all([
      listarBorradores({ estados: ["pendiente"] }),
      catalogos(),
    ]);
    _pendientes = filas;
    _sucursales = cat.sucursales;
    _rol = filas[0]?.mi_rol || "lector";
    _sel = null;

    pintarRol();
    $("calcSucursal").innerHTML = `<option value="">— elige sucursal —</option>` +
      _sucursales.map((s) => `<option value="${esc(s.sucursal_id)}">${esc(s.nombre)}</option>`).join("");

    pintarLista(_pendientes);
    cablearBuscador();
    cablearPanel();
  } catch (e) {
    lista.innerHTML = `<p class="text-sm text-rose-600 py-6 text-center">❌ ${esc(e.message)}</p>`;
  }
}

// ── Lista de pendientes ───────────────────────────────────────────────────────
function pintarLista(filas) {
  const lista = $("calcLista");
  if (!filas.length) {
    lista.innerHTML = `<p class="text-sm text-stone-400 py-6 text-center">No hay precios pendientes. 🎉</p>`;
  } else {
    lista.innerHTML = filas.map((r) => `
      <button type="button" class="calcItem w-full text-left px-2 py-2 hover:bg-stone-50 ${
        _sel?.id === r.id ? "bg-emerald-50" : ""}" data-id="${r.id}">
        <div class="font-medium text-stone-800 text-sm">${esc(r.material)}</div>
        <div class="text-xs text-stone-500">Nos pagan ${clp(r.precio_recibido_clp)} · ${esc(r.origen)}</div>
      </button>`).join("");
    lista.querySelectorAll(".calcItem").forEach((b) =>
      b.addEventListener("click", () => seleccionar(Number(b.dataset.id))));
  }
  $("calcResumen").textContent = `${filas.length} pendiente(s) de ${_pendientes.length}`;
}

function cablearBuscador() {
  const b = $("calcBuscar");
  if (!b) return;
  b.addEventListener("input", () =>
    pintarLista(filtroGlobal(_pendientes, b.value, ["material", "origen", "creado_por"])));
}

// ── Panel de trabajo ─────────────────────────────────────────────────────────
function seleccionar(id) {
  _sel = _pendientes.find((r) => r.id === id) || null;
  if (!_sel) return;

  $("calcVacio").classList.add("hidden");
  $("calcTrabajo").classList.remove("hidden");
  $("calcMaterial").textContent = _sel.material;
  $("calcMeta").textContent =
    `Cargado por ${_sel.creado_por || "—"} · ${horaChile(_sel.created_at)} · origen ${_sel.origen}`;
  $("calcRecibido").textContent = clp(_sel.precio_recibido_clp);

  // El slider va de 0 a lo que nos paga la fundición: por construcción no permite
  // arrastrar hasta un valor que significaría comprar con pérdida.
  const rec = Number(_sel.precio_recibido_clp);
  const slider = $("calcSlider");
  slider.min = 0;
  slider.max = Math.round(rec);
  const sugerido = Math.round(rec * 0.7);   // punto de partida cómodo, no una regla
  slider.value = sugerido;
  $("calcPrecio").value = sugerido;
  $("calcPrecio").max = Math.round(rec);
  $("calcMsg").textContent = "";

  recalcular();
  pintarLista(filtrarActual());
}

function filtrarActual() {
  const q = $("calcBuscar")?.value || "";
  return filtroGlobal(_pendientes, q, ["material", "origen", "creado_por"]);
}

function recalcular() {
  if (!_sel) return;
  const rec = Number(_sel.precio_recibido_clp);
  const val = Number($("calcPrecio").value);
  const alerta = $("calcAlerta");

  if (!val || val <= 0) {
    $("calcMargen").textContent = "—";
    alerta.classList.add("hidden");
    $("calcPublicar").disabled = true;
    return;
  }

  const margen = ((rec - val) / rec) * 100;
  $("calcMargen").textContent = margen.toFixed(1) + "%";

  // Publicar por encima de lo que nos pagan es comprar con pérdida. Se avisa acá y
  // además lo impide el CHECK de la tabla: la UI no es la única defensa.
  if (val > rec) {
    alerta.textContent = `⛔ Pagarías ${clp(val)} por un material que la fundición nos paga a ${clp(rec)}. Estarías comprando con pérdida.`;
    alerta.classList.remove("hidden");
    $("calcPublicar").disabled = true;
  } else {
    alerta.classList.add("hidden");
    $("calcPublicar").disabled = _rol !== "gerencia";
  }
}

function cablearPanel() {
  const slider = $("calcSlider");
  const num = $("calcPrecio");

  // Slider e input numérico son dos vistas del mismo valor: se sincronizan en ambos
  // sentidos para poder arrastrar rápido o escribir el monto exacto.
  slider.addEventListener("input", () => { num.value = slider.value; recalcular(); });
  num.addEventListener("input", () => {
    const v = Number(num.value);
    if (Number.isFinite(v)) slider.value = Math.min(Math.max(v, 0), Number(slider.max));
    recalcular();
  });

  $("calcPublicar").addEventListener("click", onPublicar);
  $("calcDescartar").addEventListener("click", onDescartar);
}

async function onPublicar() {
  if (!_sel) return;
  const suc = $("calcSucursal").value;
  const precio = Number($("calcPrecio").value);
  const msg = $("calcMsg");

  if (!suc) { msg.textContent = "⚠️ Elige la sucursal."; return; }
  if (!precio || precio <= 0) { msg.textContent = "⚠️ Escribe el precio a publicar."; return; }

  const item = _sel;                                    // se fija: la selección puede cambiar
  const nombreSuc = _sucursales.find((s) => s.sucursal_id === suc)?.nombre || suc;
  abrirModal({
    titulo: "Confirmar publicación",
    cuerpoHTML: `<p style="margin:0 0 10px">Se publicará en <b>${esc(nombreSuc)}</b>:</p>
      <p style="margin:0;font-size:15px"><b>${esc(item.material)}</b> → <b style="color:#047857">${clp(precio)}</b>/kg</p>
      <p style="margin:10px 0 0;font-size:12px;color:#78716c">
        Este es el precio que verá la gente en la web (si el material está activo en la Vitrina).</p>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Publicar", primario: true, onClick: async () => {
          try {
            $("calcPublicar").disabled = true;
            await publicar({ id: item.id, sucursalId: suc, precioPublicado: precio });
            quitarDeLista(item.id);
            msg.textContent = "✅ Publicado.";
          } catch (e) {
            msg.textContent = "❌ " + e.message;
            $("calcPublicar").disabled = false;
          }
        } },
    ],
  });
}

function onDescartar() {
  if (!_sel) return;
  const item = _sel;
  abrirModal({
    titulo: "Descartar precio",
    cuerpoHTML: `<p>¿Descartar <b>${esc(item.material)}</b>? Quedará en el Historial como descartado.</p>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Descartar", primario: true, onClick: async () => {
          try {
            await descartar([item.id], "Descartado desde la Calculadora");
            quitarDeLista(item.id);
            $("calcMsg").textContent = "Descartado.";
          } catch (e) {
            $("calcMsg").textContent = "❌ " + e.message;
          }
        } },
    ],
  });
}

function quitarDeLista(id) {
  _pendientes = _pendientes.filter((r) => r.id !== id);
  _sel = null;
  $("calcTrabajo").classList.add("hidden");
  $("calcVacio").classList.remove("hidden");
  pintarLista(filtrarActual());
}

function pintarRol() {
  const chip = $("calcRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes publicar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("calcAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes revisar los pendientes, ` +
    `pero solo gerencia define y publica precios.`;
  aviso.classList.remove("hidden");
}
