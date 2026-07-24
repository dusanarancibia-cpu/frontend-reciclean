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
import { calcular, semaforo } from "../../calculadora/js/model/formula.js";
import { listarBorradores, enviarARevisionMulti, descartar, catalogos, configCalculadora } from "./flujoRepo.js";
import { precioVigente } from "./preciosRepo.js";
import { abrirModal } from "../../shared/components/modal.js";
import { toast } from "../../shared/components/toast.js";
import { escapeHTML, filtroGlobal } from "../../shared/js/util.js";
import { rolActual } from "../../shared/js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const num = (id, def = 0) => { const v = Number($(id)?.value); return Number.isFinite(v) ? v : def; };
const fechaCorta = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("-") : "—");

// Badge de color por empresa/cliente: la misma empresa siempre cae en el mismo color (hash),
// para distinguir de un vistazo las combinaciones material+empresa en la lista de pendientes.
const BADGES = [
  "background:#dbeafe;color:#1e40af", "background:#dcfce7;color:#166534",
  "background:#fef3c7;color:#92400e", "background:#ede9fe;color:#5b21b6",
  "background:#ffe4e6;color:#9f1239", "background:#cffafe;color:#155e75",
  "background:#fae8ff;color:#86198f", "background:#e0e7ff;color:#3730a3",
];
function badgeEmpresa(nombre) {
  if (!nombre) return "";
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return ` <span style="${BADGES[h % BADGES.length]};padding:1px 8px;border-radius:999px;font-size:10px;font-weight:700">${esc(nombre)}</span>`;
}

// El "Precio Venta" (precio recibido de la fundición) es ahora un DATO FIJO de solo lectura:
// no se edita a mano. Se toma del pendiente y alimenta la escalera. Así nunca puede romper
// el constraint precio_escalera_coherente (que además formula.js capa por si acaso).

// Regla de margen (punto 3): parte en 20% por defecto (config def_margen_pct) y NO puede
// superar 60% — validación bloqueante que impide publicar.
const MARGEN_MAX = 60;

// "Santiago" no es una sucursal real: es un atajo que replica el mismo precio en las dos
// sucursales de la zona (Maipú y Cerrillos). Marcar "Santiago" marca también esas dos.
const SANTIAGO = "santiago";
const SANTIAGO_FANOUT = ["maipu", "cerrillos"];

// Límites duros de los sliders (punto 3): margen 20–60, spread ≥10. El <input range> ya
// impide salirse arrastrando (min/max en el HTML); esto cierra el escape de teclear a mano.
const LIMITES = { calcMgNum: { min: 20, max: 60 }, calcBNum: { min: 10 } };

let _pendientes = [];
let _sucursales = [];
let _sucOpciones = []; // opciones de sucursal para los tickets (incluye "santiago")
let _sucSel = new Set(); // sucursales marcadas (selección múltiple)
let _cfg = null;      // umbrales del semáforo + valores iniciales
let _sel = null;      // el pendiente en el que se está trabajando
let _baseVenta = 0;   // Precio Venta base del material seleccionado (para el tope +15%)
let _vigente = null;  // precio vigente del par material×sucursal (para el delta)
let _rol = "lector";
let _modo = "0";      // redondeo activo
let _buscar = "";     // texto del buscador (se preserva al re-render de la lista)

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
    // Opciones de sucursal para los tickets. "Santiago" va primero como atajo (replica a
    // Maipú + Cerrillos); luego las reales. Se marca con selección múltiple.
    const tieneSantiago = SANTIAGO_FANOUT.every((id) => _sucursales.some((s) => s.sucursal_id === id));
    _sucOpciones = (tieneSantiago ? [{ sucursal_id: SANTIAGO, nombre: "Santiago (Maipú + Cerrillos)" }] : [])
      .concat(_sucursales.map((s) => ({ sucursal_id: s.sucursal_id, nombre: s.nombre })));
    pintarSucursales();

    pintarLista(_pendientes);
    cablearBuscador();
    cablearSliders();
    cablearRedondeo();
    cablearAcciones();
  } catch (e) {
    const l = $("calcLista");
    if (l) l.innerHTML = `<p class="text-sm text-rose-600 py-6 text-center">${esc(e.message)}</p>`;
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
        <div class="font-medium text-stone-800 text-sm">${esc(r.material || r.material_texto || "—")}${badgeEmpresa(r.empresa_cliente)}</div>
        <div class="text-xs text-stone-500">Nos pagan ${clp(r.precio_recibido_clp)} · ${esc(r.origen)}</div>
        <div class="text-xs text-gray-400">Vigencia ${fechaCorta(r.vigencia_desde)}</div>
      </button>`).join("");
    lista.querySelectorAll(".calcItem").forEach((b) =>
      b.addEventListener("click", () => seleccionar(Number(b.dataset.id))));
  }
  $("calcResumen").textContent = `${filas.length} pendiente(s) de ${_pendientes.length}`;
}

// Pendientes que pasan el filtro del buscador (según _buscar). Es la única fuente para
// pintar la lista, así el filtro se mantiene aunque re-renderice (ej. al elegir un caso).
function filasFiltradas() {
  return filtroGlobal(_pendientes, _buscar, ["material", "material_texto", "empresa_cliente", "origen", "creado_por"]);
}

function cablearBuscador() {
  const b = $("calcBuscar");
  if (!b) return;
  b.value = _buscar; // restaura el texto si se re-montó la vista
  b.addEventListener("input", () => { _buscar = b.value; pintarLista(filasFiltradas()); });
}

// ── Sucursales (selección múltiple con tickets) ───────────────────────────────
// Devuelve las sucursales marcadas en el orden en que aparecen en los tickets.
function sucursalesElegidas() {
  return _sucOpciones.map((o) => o.sucursal_id).filter((id) => _sucSel.has(id));
}

function pintarSucursales() {
  const cont = $("calcSucursales");
  if (!cont) return;
  cont.innerHTML = _sucOpciones.map((o) => {
    const on = _sucSel.has(o.sucursal_id);
    const cls = on
      ? "bg-emerald-600 border-emerald-600 text-white"
      : "bg-white border-stone-300 text-stone-600 hover:bg-stone-50";
    return `<button type="button" class="calcSucTicket text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${cls}"
      data-suc="${esc(o.sucursal_id)}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(o.nombre)}</button>`;
  }).join("");
  cont.querySelectorAll(".calcSucTicket").forEach((b) =>
    b.addEventListener("click", () => toggleSucursal(b.dataset.suc)));

  // El conteo cuenta sucursales FÍSICAS: "santiago" es un meta-ticket (sus 2 miembros ya
  // están en el set cuando está activo), así que no se suma para no inflar el número.
  const n = [..._sucSel].filter((id) => id !== SANTIAGO).length;
  const hint = $("calcSucursalHint");
  if (hint) hint.textContent = n === 0 ? "Ninguna seleccionada."
    : `${n} sucursal(es): el precio se publicará en todas.`;
}

// "Santiago" es un META-TICKET: está activo si y solo si SUS DOS sucursales (Maipú y
// Cerrillos) lo están. Reconciliar esa invariante después de cada clic cubre las 4 reglas:
//   1. Activar Santiago      → activa Maipú y Cerrillos.
//   2. Desactivar Santiago   → desactiva Maipú y Cerrillos.
//   3. Quitar Maipú/Cerrillos → Santiago se apaga solo (el grupo dejó de estar completo).
//   4. Poner Maipú y Cerrillos por separado → Santiago se enciende solo (grupo completo).
// Talca y Puerto Montt no participan del grupo: sus clics no lo tocan (regla 5).
function toggleSucursal(id) {
  const activar = !_sucSel.has(id);
  if (activar) _sucSel.add(id); else _sucSel.delete(id);

  if (id === SANTIAGO) {
    // Clic sobre el grupo: arrastra a sus dos sucursales (reglas 1 y 2).
    SANTIAGO_FANOUT.forEach((s) => { if (activar) _sucSel.add(s); else _sucSel.delete(s); });
  } else if (SANTIAGO_FANOUT.includes(id)) {
    // Clic sobre una sucursal del grupo: puede completarlo (regla 4) o romperlo (regla 3).
    sincronizarSantiago();
  }
  // Talca / Puerto Montt (u otras futuras) caen fuera de ambos ifs: independientes (regla 5).

  pintarSucursales();
  cargarVigente(); // el delta vs vigente se recalcula contra la primera sucursal marcada
}

// Deriva el estado del meta-ticket Santiago desde sus miembros: activo ⇔ ambos activos.
function sincronizarSantiago() {
  if (SANTIAGO_FANOUT.every((s) => _sucSel.has(s))) _sucSel.add(SANTIAGO);
  else _sucSel.delete(SANTIAGO);
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
  // Selección de sucursales para este pendiente: parte desde cero (o con la que trajera
  // el borrador, si venía asignada). El usuario marca las que quiera antes de enviar.
  _sucSel = new Set(_sel.sucursal_id ? [_sel.sucursal_id] : []);
  // Normaliza la invariante de Santiago: si venía "santiago", que sus miembros queden
  // marcados; y en cualquier caso, que el meta-ticket refleje si el grupo está completo.
  if (_sucSel.has(SANTIAGO)) SANTIAGO_FANOUT.forEach((s) => _sucSel.add(s));
  sincronizarSantiago();
  pintarSucursales();

  // Precio Venta: DATO FIJO = lo que nos paga la fundición (precio recibido del pendiente).
  // No es editable; se muestra como valor y alimenta el cálculo de la escalera.
  const p = Number(_sel.precio_recibido_clp) || 0;
  _baseVenta = p;
  $("calcVentaFijo").textContent = clp(p);

  fijar("calcMg", "calcMgNum", _cfg.def_margen_pct);
  fijar("calcFl", "calcFlNum", _cfg.def_flete_clp);
  fijar("calcB", "calcBNum", _cfg.def_spread_pct);
  fijar("calcVol", "calcVolExacto", _cfg.def_volumen_kg);
  fijar("calcIva", "calcIvaNum", _cfg.def_iva_pct);

  marcarRedondeo();
  pintarLista(filasFiltradas()); // conserva el filtro del buscador tras elegir un caso
  cargarVigente();
  recalcular();
}

function fijar(idRange, idNum, valor) {
  const v = Number(valor) || 0;
  if ($(idRange)) $(idRange).value = v;
  if ($(idNum)) $(idNum).value = v;
}

// El delta contra lo vigente solo tiene sentido con sucursal elegida. Con selección
// múltiple se compara contra la PRIMERA marcada (santiago → Maipú, su representante).
async function cargarVigente() {
  const elegidas = sucursalesElegidas();
  let suc = elegidas[0];
  if (suc === SANTIAGO) suc = SANTIAGO_FANOUT[0];
  if (!_sel?.material_id || !suc) { _vigente = null; return recalcular(); }
  _vigente = await precioVigente(_sel.material_id, suc);
  recalcular();
}

// ── Sliders ───────────────────────────────────────────────────────────────────
// Cada slider tiene un input numérico gemelo: el slider explora, el número afina.
// Las etiquetas muestran SOLO el valor: la unidad ($/kg, kg, %) ya está fija en el HTML,
// junto al <strong>. Antes se duplicaba (ej. "500 kg kg", "$0/kg/kg").
const PARES = [
  ["calcMg", "calcMgNum", "calcLblMg", (v) => v + "%"],
  ["calcFl", "calcFlNum", "calcLblFl", (v) => clp(v)],
  ["calcB", "calcBNum", "calcLblB", (v) => v + "%"],
  ["calcVol", "calcVolExacto", "calcLblVol", (v) => Number(v).toLocaleString("es-CL")],
  ["calcIva", "calcIvaNum", "calcLblIva", (v) => v + "%"],
];

function clampNum(id, v) {
  const L = LIMITES[id]; if (!L || !Number.isFinite(v)) return v;
  if (L.min != null && v < L.min) v = L.min;
  if (L.max != null && v > L.max) v = L.max;
  return v;
}

function cablearSliders() {
  PARES.forEach(([r, n]) => {
    const $r = $(r), $n = $(n);
    if (!$r || !$n) return;
    // El <input range> ya está acotado por sus min/max en el HTML: arrastrar no se sale.
    $r.addEventListener("input", () => { $n.value = $r.value; recalcular(); });
    // El número es el escape: se aplica el TECHO en vivo (no dejar teclear >max) y el PISO
    // al soltar/cambiar (change), para no bloquear el tecleo intermedio (ej. "2" → "25").
    $n.addEventListener("input", () => {
      const L = LIMITES[n];
      let v = Number($n.value);
      if (L && L.max != null && Number.isFinite(v) && v > L.max) { $n.value = L.max; }
      $r.value = $n.value;
      recalcular();
    });
    if (LIMITES[n]) {
      $n.addEventListener("change", () => {
        const v = Number($n.value);
        if (!Number.isFinite(v)) return;
        const c = clampNum(n, v);
        if (c !== v) { $n.value = c; $r.value = c; recalcular(); }
      });
    }
  });
  // Las sucursales ahora son tickets (selección múltiple); cada toggle ya llama a cargarVigente().
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
    p: _baseVenta, mgPct: num("calcMgNum"), fl: num("calcFlNum"),
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
// El Precio Venta es fijo (= recibido) y formula.js capa la escalera, así que estos avisos
// casi nunca se disparan: quedan como red de seguridad legible.
function validar(c) {
  const recibido = Number(_sel?.precio_recibido_clp) || 0;
  const $a = $("calcAlerta");
  const $btn = $("calcPublicar");
  let msg = "";

  // Tope de margen (punto 3): sobre 60% no se puede publicar.
  if (num("calcMgNum") > MARGEN_MAX) {
    msg = `El margen ${num("calcMgNum")}% supera el máximo permitido de ${MARGEN_MAX}%. Bájalo para continuar.`;
  }
  else if (_sucSel.size === 0) msg = "Marca al menos una sucursal para poder enviar a revisión.";
  else if (c.plista <= 0) msg = "El P.Lista debe ser mayor que 0.";
  else if (c.plista > recibido) msg = `El P.Lista ${clp(c.plista)} supera lo que nos pagan (${clp(recibido)}): sería comprar con pérdida.`;
  else if (c.pmax > recibido) msg = `El P.Máx ${clp(c.pmax)} supera lo que nos pagan (${clp(recibido)}). Baja el spread o el margen.`;
  else if (_rol !== "gerencia") msg = "Solo gerencia puede publicar precios.";

  if (msg) { $a.textContent = "" + msg; $a.classList.remove("hidden"); $btn.disabled = true; }
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
    p: _baseVenta, mgPct: num("calcMgNum"), fl: num("calcFlNum"),
    spreadPct: num("calcBNum"), ivaPct: num("calcIvaNum"),
    vol: num("calcVolExacto"), modo: _modo,
  });
  const elegidas = sucursalesElegidas();            // ej. ["santiago","talca"]
  const nombresSuc = elegidas
    .map((id) => _sucOpciones.find((o) => o.sucursal_id === id)?.nombre || id);

  abrirModal({
    titulo: "Enviar a revisión",
    cuerpoHTML:
      `<p>Vas a enviar a <b>revisión</b> <b>${esc(_sel.material || _sel.material_texto)}</b> en:</p>
       <div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px">${
         nombresSuc.map((n) => `<span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">${esc(n)}</span>`).join("")
       }</div>
       <table style="width:100%;margin-top:10px;font-size:14px">
         <tr><td style="padding:3px 0">P.Lista (saldrá a la web)</td><td style="text-align:right;font-weight:700;color:#047857">${clp(c.plista)}</td></tr>
         <tr><td style="padding:3px 0">P.Ejecutivo</td><td style="text-align:right;font-weight:600">${clp(c.pejec)}</td></tr>
         <tr><td style="padding:3px 0">P.Máximo</td><td style="text-align:right;font-weight:600">${clp(c.pmax)}</td></tr>
         <tr><td style="padding:3px 0;color:#78716c">Nos pagan</td><td style="text-align:right;color:#78716c">${clp(_sel.precio_recibido_clp)}</td></tr>
       </table>
       <p style="font-size:13px;color:#78716c;margin-top:10px">
         Gerencia lo aprueba en la pantalla <b>Revisión</b> y recién ahí se publica en la vitrina.</p>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Enviar a revisión", primario: true, onClick: async () => {
          const $m = $("calcMsg");
          try {
            $m.textContent = "Enviando…";
            // Multi-sucursal: se genera UNA fila de borrador POR sucursal (el servidor expande
            // "santiago" → Maipú + Cerrillos). Cada fila tiene un sucursal_id real, así se
            // respeta la llave foránea borrador_sucursal_id_fkey. La escalera va en `calculo`.
            const res = await enviarARevisionMulti({
              id: _sel.id, sucursales: elegidas, precioPublicado: c.plista,
              calculo: {
                ejecutivo: c.pejec, maximo: c.pmax, flete: num("calcFlNum"),
                spread: num("calcBNum"), iva: num("calcIvaNum"), redondeo: _modo,
              },
            });
            $m.textContent = "Enviado a revisión.";
            const nFilas = Array.isArray(res?.revision_ids) ? res.revision_ids.length : (res?.sucursales?.length || 1);
            toast(`Enviado a revisión: ${nFilas} fila(s), una por sucursal.`, "exito");
            // Resolución de duplicados: la BD descartó los otros pendientes del mismo material.
            const desc = Number(res?.descartados) || 0;
            if (desc > 0) toast(`Se archivaron ${desc} pendiente(s) duplicado(s) del mismo material (siguen en Recibidos).`, "info");
            await refrescar();
          } catch (e) {
            $m.textContent = "";
            abrirModal({ titulo: "No se pudo enviar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
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
  pintarLista(filasFiltradas());
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
  aviso.innerHTML = `Tu perfil es <b>${esc(_rol)}</b>: puedes simular precios, ` +
    `pero solo gerencia publica.`;
  aviso.classList.remove("hidden");
}
