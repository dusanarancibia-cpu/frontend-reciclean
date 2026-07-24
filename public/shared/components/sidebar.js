// COMPONENTE · Menú lateral izquierdo con secciones desplegables (acordeón).
// MENU = lista de secciones; cada sección tiene items {ico,label,route,ready,badge?}.
// ready:false → muestra "pronto" (aún vive en el monolito).
// badge:true  → reserva un círculo rojo de notificación (ej. pendientes en Calculadora),
//               que refrescarBadges() rellena con el conteo real desde Supabase.
import { getClient } from "../js/supabase.js";

export const MENU = [
  { seccion: "Home", ico: "🏠", items: [
    { ico: "🏠", label: "Inicio",            route: "inicio",       ready: false },
    { ico: "📆", label: "Mi Día",            route: "mi-dia",       ready: false },
    { ico: "📥", label: "Mi Bandeja",        route: "bandeja",      ready: false },
    { ico: "✍️", label: "Firmas pendientes", route: "firmas",       ready: false },
    { ico: "🎛️", label: "Mesa Control",      route: "mesa-control", ready: false },
  ]},
  // Orden estricto del flujo operativo pedido: Carga Manual → Recibidos (auditoría de lo que
  // nos dan los clientes) → Calculadora (con badge de pendientes) → Revisión (aprobación) →
  // Publicados → Historial. "Pendientes" se retiró: la Calculadora lista la misma cola.
  { seccion: "Precios", ico: "🏷️", items: [
    { ico: "📝", label: "Carga Manual",  route: "carga-manual", ready: true },
    { ico: "📥", label: "Recibidos",     route: "recibidos",    ready: true },
    { ico: "🧮", label: "Calculadora",   route: "calculadora",  ready: true, badge: true },
    { ico: "🔎", label: "Revisión",      route: "revision",     ready: true },
    { ico: "🌐", label: "Publicados",    route: "publicados",   ready: true },
    { ico: "📚", label: "Historial",     route: "historial",    ready: true },
  ]},
  // Dominio COMERCIAL (integrado del repo de Pablo). Solo 3 módulos están pulidos
  // (Clientes, Oportunidades, Agenda); los demás quedan como "pronto" hasta terminarlos.
  { seccion: "COMERCIAL", ico: "🤝", items: [
    { ico: "🧭", label: "Mesa Comercial",     route: "comercial",               ready: true },
    { ico: "🏢", label: "Clientes / Cartera", route: "comercial-clientes",      ready: true },
    { ico: "🎯", label: "Oportunidades",      route: "comercial-oportunidades", ready: true },
    { ico: "🚚", label: "Agenda de servicios", route: "comercial-agenda",       ready: true },
    { ico: "📜", label: "Contratos",          route: "comercial-contratos",     ready: false },
    { ico: "💲", label: "Cotizador",          route: "comercial-cotizador",     ready: false },
    { ico: "💸", label: "Cobranza",           route: "comercial-cobranza",      ready: false },
  ]},
  // "Vitrina pública" se fusionó dentro de Publicados: publicar y ver lo publicado son
  // la misma decisión, y separarlas obligaba a gerencia a cruzar dos pantallas.
  { seccion: "Administración", ico: "⚙️", items: [
    { ico: "🏷️", label: "Materiales y Precios",   route: "materiales", ready: true },
    { ico: "📦", label: "Catálogo de materiales", route: "catalogo",   ready: true },
    { ico: "👥", label: "Usuarios",               route: "usuarios",   ready: true },
  ]},
  // "Propuestas IA" y "Aprobación Final" quedan fuera del menú por decisión de negocio
  // (se obvian por ahora). Sus rutas y controladores siguen existiendo: no se borró código.
];

// Mapa route → sección, para saber qué grupo abrir al activar una ruta
const SECCION_DE = {};
MENU.forEach((s) => s.items.forEach((it) => { SECCION_DE[it.route] = s.seccion; }));
// El detalle de cliente no es un ítem del menú, pero pertenece a COMERCIAL: al abrirlo,
// que la sección quede desplegada y no se cierre.
SECCION_DE["comercial-clientes-detalle"] = "COMERCIAL";

function itemHTML(m) {
  const soon = m.ready ? "" : `<span class="nav-soon">pronto</span>`;
  // El badge nace oculto (sin número aún). refrescarBadges() lo muestra si hay pendientes.
  const badge = m.badge
    ? `<span class="nav-badge" data-badge-route="${m.route}" hidden>0</span>` : "";
  return `<div class="nav-item" data-route="${m.route}" title="${m.label}">
    <span class="nav-ico">${m.ico}</span><span class="nav-label">${m.label}</span>${badge}${soon}</div>`;
}

// Las secciones nacen PLEGADAS (sin `open`) para no saturar el menú. setActive() abre solo
// la sección de la pantalla actual; el usuario expande el resto a demanda.
function grupoHTML(s) {
  return `<div class="nav-group" data-group="${s.seccion}">
    <button class="nav-group-h" type="button" title="${s.seccion}">
      <span class="nav-ico">${s.ico}</span>
      <span class="nav-label">${s.seccion}</span>
      <span class="nav-caret">▾</span>
    </button>
    <div class="nav-group-body">${s.items.map(itemHTML).join("")}</div>
  </div>`;
}

// `puede` (opcional) filtra el menú por permisos: lo que el usuario no puede abrir
// directamente no se dibuja, para que no descubra secciones que igual le serán negadas.
export function renderSidebar(mountEl, onNavigate, puede = null) {
  const MENU_VISIBLE = !puede ? MENU : MENU
    .map((s) => ({ ...s, items: s.items.filter((it) => puede(it.route)) }))
    .filter((s) => s.items.length);

  // Anti-parpadeo (layout shift): mientras se pinta el menú por primera vez, se anulan las
  // transiciones (ver .no-anim en app.css). Si no, las secciones —que nacen abiertas— animan
  // su max-height de 0→420 en el primer frame y se ve un "salto". Se reactivan al frame
  // siguiente, ya con el layout estable, para que el desplegar/colapsar posterior sí anime.
  mountEl.classList.add("no-anim");

  mountEl.innerHTML = `
    <div class="flex items-center gap-2 px-4 h-14 border-b border-stone-800">
      <span class="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">R</span>
      <div class="leading-tight sb-brand-text">
        <div class="font-bold text-white text-sm">Reciclean</div>
        <div class="text-[11px] text-stone-400">Panel modular · MVC</div>
      </div>
    </div>
    <nav class="py-2 flex-1 overflow-y-auto">${MENU_VISIBLE.map(grupoHTML).join("")}</nav>
    <div class="px-4 py-3 text-[11px] text-stone-500 border-t border-stone-800 sb-footer">
      Arquitectura modular · reemplaza gradualmente a panel-rdo.html
    </div>`;

  // Toggle de sección (acordeón)
  mountEl.querySelectorAll(".nav-group-h").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("open")));

  // Navegación por item
  mountEl.querySelectorAll(".nav-item").forEach((el) =>
    el.addEventListener("click", () => onNavigate(el.dataset.route)));

  // Reactivar transiciones una vez pintado el estado inicial (doble rAF: asegura que el
  // navegador ya hizo layout con el estado abierto antes de permitir animaciones).
  requestAnimationFrame(() => requestAnimationFrame(() => mountEl.classList.remove("no-anim")));
}

// Refresca los badges de notificación del menú. Hoy solo el de Calculadora: cuenta los
// borradores en estado 'pendiente' (precios recibidos que aún no se procesan). Usa un
// HEAD count (head:true) para traer solo el número, no las filas. Falla en silencio:
// un badge es informativo, nunca debe romper el menú si la consulta no responde.
export async function refrescarBadges(mountEl = document) {
  const el = mountEl.querySelector('[data-badge-route="calculadora"]');
  if (!el) return;
  try {
    const { count, error } = await getClient()
      .from("borradores_panel").select("id", { count: "exact", head: true })
      .eq("estado", "pendiente");
    if (error) return;
    const n = count || 0;
    if (n > 0) { el.textContent = n > 99 ? "99+" : String(n); el.hidden = false; }
    else { el.hidden = true; }
  } catch { /* silencioso a propósito */ }
}

// Marca el item activo y asegura que su sección quede abierta
export function setActive(mountEl, route) {
  mountEl.querySelectorAll(".nav-item").forEach((el) =>
    el.classList.toggle("active", el.dataset.route === route));
  const sec = SECCION_DE[route];
  if (sec) {
    const grupo = mountEl.querySelector(`.nav-group[data-group="${sec}"]`);
    if (grupo) grupo.classList.add("open");
  }
}
