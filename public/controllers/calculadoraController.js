// CONTROLADOR · Calculadora soporte de decisión.
//
// Tercera etapa del flujo: gerencia toma un pendiente, le asigna sucursal y define la
// escalera de precios con la que se negocia.
//
// REUTILIZA EL MOTOR, NO LO REIMPLEMENTA: importa `calcular` y `semaforo` de
// /calculadora/js/model/formula.js, que es puro (sin DOM ni Supabase) y está cubierto por
// los 6 casos de test/formula.test.js. Así la fórmula de precios tiene UNA sola fuente de
// verdad y los tests siguen protegiéndola. No se importa el resto del MVC antiguo
// (view.js, controller.js, db.js) porque estaba atado al flujo por proposalId.
//
// MAPEO con el modelo precios_v3:
//   p      → precio_recibido_clp  · lo que pagan las fundiciones (INTERNO)
//   plista → precio_publicado_clp · lo que pagamos a la gente, sale a las webs
//   pejec / pmax → rango de negociación (INTERNO, nunca en la vista pública)
//
// Respecto de la versión original se quitó el selector de "Categoría margen": el semáforo
// ahora compara contra un umbral único configurable en precios_v3.config_calculadora.
import { calcular, semaforo } from "../calculadora/js/model/formula.js";
import { listarBorradores, publicar, descartar, catalogos, configCalculadora } from "../models/flujoRepo.js";
import { precioVigente, actualizarPrecio } from "../models/preciosRepo.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, filtroGlobal } from "../js/util.js";
import { rolActual } from "../js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const num = (id, def = 0) => { const v = Number($(id)?.value); return Number.isFinite(v) ? v : def; };

// Regla de negocio: el "Precio Venta" editado no puede superar en más de 15% el precio base
// asignado originalmente al material (el que traía el pendiente al cargarse).
const TOPE_VENTA = 0.15;

// "Santiago" no es una sucursal real: es un atajo que replica el mismo precio en las dos
// sucursales de la zona (Maipú y Cerrillos). Elegir Maipú o Cerrillos por separado NO replica.
const SANTIAGO = "santiago";
const SANTIAGO_FANOUT = ["maipu", "cerrillos"];

let _pendientes = [];
let _sucursales = [];
let _cfg = null;      // umbrales del semáforo + valores iniciales
let _sel = null;      // el pendiente en el que se está trabajando
let _baseVenta = 0;   // Precio Venta base del material seleccionado (para el tope +15%)
let _vigente = null;  // precio vigente del par material×sucursal (para el delta)
let _rol = "lector";
let _modo = "0";      // redondeo activo

export async function mountCalculadora() {
  try {
    const [filas, cat, cfg] = await Promise.all([
      listarBorradores({ estados: ["pendiente"] }),
      catalogos(),
      configCalculadora(),
    ]);
    _pendientes = filas;
    _sucursales = cat.sucursales;
    _cfg = cfg;
    _modo = cfg.def_redondeo || "0";
    // El rol autoritativo se cargó al arranque desde mis_permisos (rolActual). Antes se
    // infería de filas[0].mi_rol, pero con la lista vacía caía a "lector" y trataba a
    // gerencia como solo lectura. Se usa mi_rol solo si viene, y si no, el de permisos.
    _rol = filas[0]?.mi_rol || rolActual();
    _sel = null;

    pintarRol();
    // "Santiago" va primero como atajo (replica a Maipú + Cerrillos); luego las reales.
    const tieneSantiago = SANTIAGO_FANOUT.every((id) => _sucursales.some((s) => s.sucursal_id === id));
    $("calcSucursal").innerHTML = `<option value="">— elige sucursal —</option>` +
      (tieneSantiago ? `<option value="${SANTIAGO}">Santiago (Maipú + Cerrillos)</option>` : "") +
      _sucursales.map((s) => `<option value="${esc(s.sucursal_id)}">${esc(s.nombre)}</option>`).join("");

    pintarLista(_pendientes);
    cablearBuscador();
    cablearSliders();
    cablearRedondeo();
    cablearAcciones();
  } catch (e) {
    const l = $("calcLista");
    if (l) l.innerHTML = `<p class="text-sm text-rose-600 py-6 text-center">❌ ${esc(e.message)}</p>`;
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
        <div class="font-medium text-stone-800 text-sm">${esc(r.material || r.material_texto || "—")}</div>
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
    pintarLista(filtroGlobal(_pendientes, b.value, ["material", "material_texto", "origen", "creado_por"])));
}

// ── Selección de un caso ──────────────────────────────────────────────────────
function seleccionar(id) {
  _sel = _pendientes.find((r) => r.id === id) || null;
  _vigente = null;
  if (!_sel) return;

  $("calcVacio").classList.add("hidden");
  $("calcTrabajo").classList.remove("hidden");
  $("calcMaterial").textContent = _sel.material || _sel.material_texto || "—";
  $("calcMeta").textContent =
    `Origen: ${_sel.origen} · cargado por ${_sel.creado_por || "—"}`;
  $("calcSucursal").value = _sel.sucursal_id || "";

  // Precio Venta: parte en el valor base del material. Se puede editar, pero no más de un
  // +15% sobre ese base (regla de negocio). El tope del slider ya es base×1.15; si alguien
  // escribe un número mayor en el input, validar() lo bloquea.
  const p = Number(_sel.precio_recibido_clp) || 0;
  _baseVenta = p;
  const sl = $("calcP");
  sl.min = 0; sl.max = Math.max(Math.round(p * (1 + TOPE_VENTA)), 1); sl.value = p;
  $("calcPNum").value = p;

  fijar("calcMg", "calcMgNum", _cfg.def_margen_pct);
  fijar("calcFl", "calcFlNum", _cfg.def_flete_clp);
  fijar("calcB", "calcBNum", _cfg.def_spread_pct);
  fijar("calcVol", "calcVolExacto", _cfg.def_volumen_kg);
  fijar("calcIva", "calcIvaNum", _cfg.def_iva_pct);

  marcarRedondeo();
  pintarLista(_pendientes);
  cargarVigente();
  recalcular();
}

function fijar(idRange, idNum, valor) {
  const v = Number(valor) || 0;
  if ($(idRange)) $(idRange).value = v;
  if ($(idNum)) $(idNum).value = v;
}

// El delta contra lo vigente solo tiene sentido con sucursal elegida.
async function cargarVigente() {
  const suc = $("calcSucursal").value;
  if (!_sel?.material_id || !suc) { _vigente = null; return recalcular(); }
  _vigente = await precioVigente(_sel.material_id, suc);
  recalcular();
}

// ── Sliders ───────────────────────────────────────────────────────────────────
// Cada slider tiene un input numérico gemelo: el slider explora, el número afina.
const PARES = [
  ["calcP", "calcPNum", "calcLblP", (v) => clp(v) + "/kg"],
  ["calcMg", "calcMgNum", "calcLblMg", (v) => v + "%"],
  ["calcFl", "calcFlNum", "calcLblFl", (v) => clp(v) + "/kg"],
  ["calcB", "calcBNum", "calcLblB", (v) => v + "%"],
  ["calcVol", "calcVolExacto", "calcLblVol", (v) => Number(v).toLocaleString("es-CL") + " kg"],
  ["calcIva", "calcIvaNum", "calcLblIva", (v) => v + "%"],
];

function cablearSliders() {
  PARES.forEach(([r, n]) => {
    const $r = $(r), $n = $(n);
    if (!$r || !$n) return;
    $r.addEventListener("input", () => { $n.value = $r.value; recalcular(); });
    $n.addEventListener("input", () => {
      // El número puede salirse del rango del slider (ej. volumen mayor al máximo):
      // se respeta el valor escrito y el slider solo se acerca lo que puede.
      $r.value = $n.value;
      recalcular();
    });
  });
  $("calcSucursal")?.addEventListener("change", cargarVigente);
}

function cablearRedondeo() {
  document.querySelectorAll(".calcRedondeoBtn").forEach((b) =>
    b.addEventListener("click", () => { _modo = b.dataset.modo; marcarRedondeo(); recalcular(); }));
  marcarRedondeo();
}

function marcarRedondeo() {
  document.querySelectorAll(".calcRedondeoBtn").forEach((b) => {
    const on = b.dataset.modo === _modo;
    b.className = "calcRedondeoBtn px-3 py-1 text-xs font-medium " +
      (b.previousElementSibling ? "border-l border-stone-300 " : "") +
      (on ? "bg-stone-800 text-white" : "bg-white text-stone-600");
  });
}

// ── Cálculo ───────────────────────────────────────────────────────────────────
function recalcular() {
  if (!_sel) return;
  const i = {
    p: num("calcPNum"), mgPct: num("calcMgNum"), fl: num("calcFlNum"),
    spreadPct: num("calcBNum"), ivaPct: num("calcIvaNum"),
    vol: num("calcVolExacto"), modo: _modo,
  };
  const c = calcular(i);

  PARES.forEach(([r, n, lbl, fmt]) => { if ($(lbl)) $(lbl).textContent = fmt(num(n)); });

  $("calcPmax").textContent = clp(c.pmax);
  $("calcPlista").textContent = clp(c.plista);
  $("calcPejec").textContent = clp(c.pejec);
  $("calcIvaAmt").textContent = clp(c.ivaAmt);
  $("calcContrib").textContent = clp(c.contrib);

  $("calcCorte100").textContent = clp(c.plista);
  $("calcCorte80").textContent = clp(Math.round(c.plista * 0.8));
  $("calcCorte60").textContent = clp(Math.round(c.plista * 0.6));

  const vig = _vigente?.precio_publicado_clp;
  $("calcDeltaVig").textContent = vig == null ? "sin precio vigente"
    : (c.plista - vig >= 0 ? "+" : "") + clp(c.plista - vig).replace("$-", "-$");

  // Semáforo contra el umbral global (ya no por categoría margen).
  const s = semaforo(i.mgPct, { min: Number(_cfg.margen_min_pct), meta: Number(_cfg.margen_meta_pct) });
  const COLOR = { verde: "text-emerald-700", amarillo: "text-amber-700", rojo: "text-rose-700", gris: "text-stone-500" };
  const $s = $("calcSemaforo");
  $s.textContent = s.texto;
  $s.className = "text-lg font-bold mt-1 " + (COLOR[s.nivel] || COLOR.gris);
  $("calcSemaforoDetalle").textContent = s.detalle;

  validar(c);
}

// La base rechaza publicar sobre lo que nos pagan; el aviso lo dice antes de intentarlo.
function validar(c) {
  const recibido = Number(_sel?.precio_recibido_clp) || 0;
  const venta = num("calcPNum");
  const topeVenta = _baseVenta * (1 + TOPE_VENTA);
  const $a = $("calcAlerta");
  const $btn = $("calcPublicar");
  let msg = "";

  // El tope del Precio Venta se valida ANTES que el resto: es la regla dura del punto 2.
  if (_baseVenta > 0 && venta > topeVenta) {
    msg = `El Precio Venta ${clp(venta)} supera en más de 15% el precio base ` +
          `(${clp(_baseVenta)} · tope ${clp(Math.round(topeVenta))}). Corrígelo para continuar.`;
  }
  else if (!$("calcSucursal").value) msg = "Elige una sucursal para poder publicar.";
  else if (c.plista <= 0) msg = "El P.Lista debe ser mayor que 0.";
  else if (c.plista > recibido) msg = `El P.Lista ${clp(c.plista)} supera lo que nos pagan (${clp(recibido)}): sería comprar con pérdida.`;
  else if (c.pmax > recibido) msg = `El P.Máx ${clp(c.pmax)} supera lo que nos pagan (${clp(recibido)}). Baja el spread o el margen.`;
  else if (_rol !== "gerencia") msg = "Solo gerencia puede publicar precios.";

  if (msg) { $a.textContent = "⚠️ " + msg; $a.classList.remove("hidden"); $btn.disabled = true; }
  else { $a.classList.add("hidden"); $btn.disabled = false; }
}

// ── Acciones ──────────────────────────────────────────────────────────────────
function cablearAcciones() {
  $("calcPublicar")?.addEventListener("click", onPublicar);
  $("calcDescartar")?.addEventListener("click", onDescartar);
}

async function onPublicar() {
  if (!_sel) return;
  const c = calcular({
    p: num("calcPNum"), mgPct: num("calcMgNum"), fl: num("calcFlNum"),
    spreadPct: num("calcBNum"), ivaPct: num("calcIvaNum"),
    vol: num("calcVolExacto"), modo: _modo,
  });
  const suc = $("calcSucursal").value;
  const nombreSuc = _sucursales.find((s) => s.sucursal_id === suc)?.nombre || suc;

  abrirModal({
    titulo: "Publicar precio",
    cuerpoHTML:
      `<p>Vas a publicar <b>${esc(_sel.material || _sel.material_texto)}</b> en <b>${esc(nombreSuc)}</b>.</p>
       <table style="width:100%;margin-top:10px;font-size:14px">
         <tr><td style="padding:3px 0">P.Lista (sale a la web)</td><td style="text-align:right;font-weight:700;color:#047857">${clp(c.plista)}</td></tr>
         <tr><td style="padding:3px 0">P.Ejecutivo</td><td style="text-align:right;font-weight:600">${clp(c.pejec)}</td></tr>
         <tr><td style="padding:3px 0">P.Máximo</td><td style="text-align:right;font-weight:600">${clp(c.pmax)}</td></tr>
         <tr><td style="padding:3px 0;color:#78716c">Nos pagan</td><td style="text-align:right;color:#78716c">${clp(_sel.precio_recibido_clp)}</td></tr>
       </table>
       <p style="font-size:13px;color:#78716c;margin-top:10px">
         Solo el P.Lista es público. El resto queda guardado para la negociación interna.</p>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Publicar", primario: true, onClick: async () => {
          const $m = $("calcMsg");
          try {
            $m.textContent = "Publicando…";
            // Santiago replica el mismo precio en Maipú y Cerrillos: el borrador se publica
            // en la primera (queda su trazabilidad) y la otra se escribe como precio directo.
            const [sucPrincipal, ...resto] = (suc === SANTIAGO) ? SANTIAGO_FANOUT : [suc];
            await publicar({
              id: _sel.id, sucursalId: sucPrincipal, precioPublicado: c.plista,
              precioEjecutivo: c.pejec, precioMaximo: c.pmax,
              flete: num("calcFlNum"), spreadPct: num("calcBNum"),
              ivaPct: num("calcIvaNum"), redondeo: _modo,
            });
            for (const s of resto) {
              await actualizarPrecio({
                materialId: _sel.material_id, sucursalId: s,
                publicado: c.plista, recibido: Number(_sel.precio_recibido_clp) || null,
                motivo: "Réplica de Santiago",
              });
            }
            $m.textContent = suc === SANTIAGO ? "✅ Publicado en Maipú y Cerrillos." : "✅ Publicado.";
            await refrescar();
          } catch (e) {
            $m.textContent = "";
            abrirModal({ titulo: "No se pudo publicar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
          }
        } },
    ],
  });
}

function onDescartar() {
  if (!_sel) return;
  abrirModal({
    titulo: "Descartar pendiente",
    cuerpoHTML: `<p>¿Descartar <b>${esc(_sel.material || _sel.material_texto)}</b>?</p>
      <p style="font-size:13px;color:#78716c;margin-top:8px">Queda registrado en el Historial.</p>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Descartar", primario: true, onClick: async () => {
          try { await descartar([_sel.id], "Descartado desde la Calculadora"); await refrescar(); }
          catch (e) { abrirModal({ titulo: "No se pudo descartar", cuerpoHTML: `<p>${esc(e.message)}</p>` }); }
        } },
    ],
  });
}

async function refrescar() {
  _pendientes = await listarBorradores({ estados: ["pendiente"] });
  _sel = null;
  $("calcTrabajo").classList.add("hidden");
  $("calcVacio").classList.remove("hidden");
  pintarLista(_pendientes);
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
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes simular precios, ` +
    `pero solo gerencia publica.`;
  aviso.classList.remove("hidden");
}
