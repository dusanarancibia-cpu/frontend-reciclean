// CONTROLADOR · Orquesta Modelo + Vista. Mantiene el estado y reacciona a eventos.
import * as db from "../model/db.js";
import { calcular, semaforo } from "../model/formula.js";
import * as view from "../view/view.js";
import { DEFAULTS } from "../config.js";

const state = {
  modo: "0",
  caso: null,        // fila cruda de v_bandeja_precios (o null si se arma a mano)
  vigente: null,     // precio vigente oficial
  metas: [],         // margen_metas normalizadas
  enAnalisis: null,  // Set<material_id> (lazy)
};

function recompute() {
  const inp = view.readInputs(state.modo);
  const c = calcular(inp);
  view.renderOutputs(inp, c, state.vigente);
  const cat = view.getSel("calcCategoria");
  view.renderSemaforo(semaforo(inp.mgPct, state.metas.find((m) => m.categoria === cat)));
  // Regla: el precio de COMPRA recibido no puede superar al P. Lista Nuevo (sería vender
  // bajo costo). "Recibido" = costo tipeado, o el precio_clp_kg del caso cargado (Capa 1,
  // compra detectada por Diego). En casos nuevos sin caso (id null) no hay recibido salvo
  // que se tipee un costo → no se dispara falsamente.
  const recibido = view.getCompra() ?? (state.caso?.id != null ? Number(state.caso.precio_clp_kg) : null);
  const rec = (recibido != null && !isNaN(recibido) && recibido > 0) ? recibido : null;
  view.marcarAlertaCosto(rec != null && rec > c.plista, rec, c.plista);
  return c;
}

async function cargarCaso(id) {
  view.loadMsg("Cargando…", "muted");
  state.caso = null; state.vigente = null;
  let caso;
  try { caso = await db.loadCaso(id); }
  catch (e) { view.loadMsg("❌ " + e.message, "err"); return; }
  if (!caso) { view.loadMsg("No existe propuesta id " + id, "err"); return; }
  state.caso = caso;
  view.renderCapa1(caso);
  view.setSel("calcMaterial", caso.material_id);
  view.setSel("calcSucursal", caso.sucursal_id);

  // Precio vigente: la vista de bandeja ya lo trae; si no, fallback a la vista curated
  state.vigente = caso.precio_vigente != null ? Number(caso.precio_vigente) : null;
  if (state.vigente == null && caso.material_id && caso.sucursal_id) {
    const v = await db.loadVigente(caso.material_id, caso.sucursal_id);
    state.vigente = v ? Number(v.precio_venta_clp) : null;
  }

  const meta = caso.metadata || {};
  view.setSlider("calcP", Number(caso.precio_clp_kg) || 0);
  view.setSlider("calcMg", meta.mg_pct ?? DEFAULTS.mg_pct);
  view.setSlider("calcFl", meta.flete ?? DEFAULTS.flete);
  view.setSlider("calcB", meta.spread_pct ?? DEFAULTS.spread_pct);
  view.setSlider("calcVol", meta.volumen_kg ?? DEFAULTS.volumen_kg);
  view.setSlider("calcIva", meta.iva_pct ?? DEFAULTS.iva_pct);
  aplicarCategoriaDeMaterial(caso.material_id);
  recompute();
  view.loadMsg("✅ Caso " + id + " cargado", "ok");
  view.banner(caso.sucursal_id ? null : "Este caso no tiene sucursal concreta: no se puede comparar contra el vigente ni aprobar.");
}

function aplicarCategoriaDeMaterial(materialId) {
  const opt = document.querySelector(`#calcMaterial option[value="${materialId}"]`);
  const cat = opt?.dataset?.categoria;
  if (cat) view.setSel("calcCategoria", cat);
}

async function onSelect(id) {
  if (id === "calcMaterial") aplicarCategoriaDeMaterial(view.getSel("calcMaterial"));
  const mat = view.getSel("calcMaterial"), suc = view.getSel("calcSucursal");
  if (mat && suc) {
    const v = await db.loadVigente(mat, suc);
    state.vigente = v ? Number(v.precio_venta_clp) : null;
  }
  recompute();
}

async function onFiltro() {
  if (view.filtroEnAnalisis() && state.enAnalisis === null) {
    try { state.enAnalisis = await db.loadEnAnalisis(); }
    catch { state.enAnalisis = new Set(); }
  }
  await pintarMateriales();
}

let _mats = [];
async function pintarMateriales() {
  const lista = (view.filtroEnAnalisis() && state.enAnalisis)
    ? _mats.filter((m) => state.enAnalisis.has(m.material_id)) : _mats;
  view.fillSelect("calcMaterial", lista, "material_id", "nombre", "(seleccionar)", "categoria");
}

// "Pasar a revisión" → NO publica. Deja la propuesta calculada (ruta manual_calc,
// estado pendiente) para que aparezca en Aprobación Final, donde gerencia publica.
// Si el material no tiene costo vigente, el "Precio de compra (costo)" se guarda en
// metadata para que la publicación final pueda usarlo.
async function onPasarRevision() {
  // Modo alta: si está marcado "Nuevo caso" pero aún no se inicializó, hacerlo ahora.
  if (view.esNuevo() && !state.caso) {
    const mat = view.getSel("calcMaterial"), suc = view.getSel("calcSucursal");
    if (!mat || !suc) return view.actMsg("Elige material y sucursal para crear el nuevo caso.", "warn");
    await cargarDesdeVigente(mat, suc);
  }
  if (!state.caso) return view.actMsg("Marca “Nuevo caso” o carga un caso por su ID primero.", "warn");
  const sess = await db.getSession();
  if (!sess?.user?.email) return view.actMsg("⚠️ Sin sesión — inicia sesión en el panel.", "warn");
  const c = recompute();
  const inp = view.readInputs(state.modo);
  const compra = view.getCompra(); // costo transitorio para casos sin precio de compra vigente
  const metadata = {
    ...(state.caso.metadata || {}), pmax: c.pmax, pejec: c.pejec, mg_pct: inp.mgPct,
    flete: inp.fl, spread_pct: inp.spreadPct, volumen_kg: inp.vol, iva_pct: inp.ivaPct,
    editado_por: sess.user.email, origen: "calculadora-mvc",
    ...(compra ? { precio_compra_transitorio: compra } : {}),
  };
  view.disable("btnAprobar", true); view.actMsg("Enviando a Aprobación Final…", "muted");
  try {
    if (state.caso.id == null) {
      // Caso NUEVO: INSERT (queda pendiente + ruta manual_calc → Aprobación Final)
      const row = await db.crearBorrador({
        material_id: state.caso.material_id, sucursal_id: state.caso.sucursal_id,
        precio_clp_kg: c.plista, ruta: "manual_calc", confidence_score: 1.0,
        origen: "calculadora-mvc", creado_por: sess.user.email, metadata,
      });
      state.caso.id = row.id;
      view.setPid(String(row.id));
      view.setNuevo(false);
      view.renderCapa1(state.caso);
      view.actMsg("✅ Enviado a Aprobación Final · caso #" + row.id + " · P. Lista Nuevo " + c.plista, "ok");
    } else {
      // Caso existente (venía de Recibidos/Diego): pasa a la vía calculada.
      await db.guardarBorrador(state.caso.id, { ruta: "manual_calc", precio_clp_kg: c.plista, metadata });
      view.actMsg("✅ Actualizado y en Aprobación Final · caso " + state.caso.id + " · P. Lista Nuevo " + c.plista, "ok");
    }
  } catch (e) {
    view.actMsg("❌ " + e.message + " (si es RLS, el guardado debe ir por Edge Function)", "err");
  } finally { view.disable("btnAprobar", false); }
}

// "← Regresar" → vuelve a Recibidos (paso previo natural). El router del panel
// escucha el cambio de hash y carga la vista.
function onRegresar() {
  window.location.hash = "#recibidos";
}

export async function init() {
  view.bind({
    onInput: recompute,
    onRedondeo: (m) => { state.modo = m; view.activarRedondeo(m); recompute(); },
    onSelect, onFiltro,
    onCargar: () => { const id = view.getPid(); if (id) cargarCaso(id); },
    onPasarRevision, onRegresar,
    // Checkbox "Nuevo caso": marcado → parte de cero con el material/sucursal elegidos;
    // desmarcado → limpia el caso para volver a elegir o cargar por ID.
    onNuevo: () => {
      if (!view.esNuevo()) {
        state.caso = null; state.vigente = null; view.setPid("");
        view.loadMsg("Marca “Nuevo caso” o carga un caso por su ID.", "muted");
        recompute();
        return;
      }
      const mat = view.getSel("calcMaterial"), suc = view.getSel("calcSucursal");
      if (!mat || !suc) {
        view.setNuevo(false);
        return view.actMsg("Elige material y sucursal para crear el nuevo caso.", "warn");
      }
      view.setPid("");
      cargarDesdeVigente(mat, suc);
    },
  });
  view.activarRedondeo(state.modo);

  // Sesión + catálogos en paralelo
  const sess = await db.getSession();
  view.chip(sess?.user?.email || null);
  if (!sess) view.banner("Sin sesión en este navegador. Puedes simular, pero para Guardar/Aprobar inicia sesión primero en el panel (login.html) — la sesión se comparte por mismo dominio.");

  try {
    const [mats, sucs, metas] = await Promise.all([db.loadMateriales(), db.loadSucursales(), db.loadMetas()]);
    _mats = mats; state.metas = metas;
    await pintarMateriales();
    view.fillSelect("calcSucursal", sucs, "sucursal_id", "nombre", "Elige sucursal…");
    view.fillCategorias(metas);
  } catch (e) { view.banner("No pude cargar catálogos: " + e.message); }

  // Arranque por URL:
  //  • proposalId  → carga un caso existente
  //  • material_id + sucursal_id → propuesta NUEVA partiendo del precio vigente (botón Editar de Publicados)
  const qs = new URLSearchParams(location.search);
  const pid = qs.get("proposalId") || qs.get("id");
  const matUrl = qs.get("material_id");
  const sucUrl = qs.get("sucursal_id");
  if (pid) { view.setPid(pid); await cargarCaso(pid); }
  else if (matUrl && sucUrl) { await cargarDesdeVigente(matUrl, sucUrl); }
  else { recompute(); }
}

// Propuesta nueva desde el precio oficial vigente (no hay proposalId todavía).
// Deja un `state.caso` sintético (id null) para que la UI quede "cargada" — así no
// aparece "Cargá un caso primero"; Guardar hará INSERT (crea la propuesta).
async function cargarDesdeVigente(matId, sucId) {
  view.setSel("calcMaterial", matId);
  view.setSel("calcSucursal", sucId);
  aplicarCategoriaDeMaterial(matId);
  let v = null;
  try { v = await db.loadVigente(matId, sucId); } catch (_) { /* sin vigente */ }
  state.vigente = v ? Number(v.precio_venta_clp) : null;
  if (state.vigente != null) view.setSlider("calcP", state.vigente);
  state.caso = {
    id: null, material_id: matId, sucursal_id: sucId,
    precio_clp_kg: state.vigente, metadata: {}, ruta: "manual_calc", estado: "nuevo",
  };
  view.setCompra("");  // caso nuevo: sin costo heredado, se ingresa a mano si hace falta
  view.renderCapa1(state.caso);
  recompute();
  view.loadMsg(state.vigente != null
    ? "Nueva propuesta desde el precio vigente ($" + state.vigente + ")"
    : "Nueva propuesta (sin precio vigente de referencia)", "muted");
  view.banner(state.vigente != null
    ? "Estás creando una propuesta NUEVA para este material/sucursal. Ajusta y usa Guardar/Aprobar."
    : "Material/sucursal SIN costo vigente: para publicarlo, escribe el “Precio de compra (costo)” antes de Aprobar.");
}
