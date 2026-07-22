// COMPONENTE · Menú lateral izquierdo con secciones desplegables (acordeón).
// MENU = lista de secciones; cada sección tiene items {ico,label,route,ready}.
// ready:false → muestra "pronto" (aún vive en el monolito).

export const MENU = [
  { seccion: "Home", ico: "🏠", items: [
    { ico: "🏠", label: "Inicio",            route: "inicio",       ready: false },
    { ico: "📆", label: "Mi Día",            route: "mi-dia",       ready: false },
    { ico: "📥", label: "Mi Bandeja",        route: "bandeja",      ready: false },
    { ico: "✍️", label: "Firmas pendientes", route: "firmas",       ready: false },
    { ico: "🎛️", label: "Mesa Control",      route: "mesa-control", ready: false },
  ]},
  { seccion: "Precios", ico: "🏷️", items: [
    { ico: "📝", label: "Carga manual", route: "carga-manual", ready: true },
    { ico: "📥", label: "Recibidos",   route: "recibidos",   ready: true },
    { ico: "🧮", label: "Calculadora", route: "calculadora", ready: true },
    { ico: "💡", label: "Propuestas IA",   route: "propuestas",  ready: true },
    { ico: "✅", label: "Aprobación Final", route: "revision",    ready: true },
    { ico: "🌐", label: "Publicados",  route: "publicados",  ready: true },
  ]},
];

// Mapa route → sección, para saber qué grupo abrir al activar una ruta
const SECCION_DE = {};
MENU.forEach((s) => s.items.forEach((it) => { SECCION_DE[it.route] = s.seccion; }));

function itemHTML(m) {
  const soon = m.ready ? "" : `<span class="nav-soon">pronto</span>`;
  return `<div class="nav-item" data-route="${m.route}" title="${m.label}">
    <span class="nav-ico">${m.ico}</span><span class="nav-label">${m.label}</span>${soon}</div>`;
}

function grupoHTML(s) {
  return `<div class="nav-group open" data-group="${s.seccion}">
    <button class="nav-group-h" type="button" title="${s.seccion}">
      <span class="nav-ico">${s.ico}</span>
      <span class="nav-label">${s.seccion}</span>
      <span class="nav-caret">▾</span>
    </button>
    <div class="nav-group-body">${s.items.map(itemHTML).join("")}</div>
  </div>`;
}

export function renderSidebar(mountEl, onNavigate) {
  mountEl.innerHTML = `
    <div class="flex items-center gap-2 px-4 h-14 border-b border-stone-800">
      <span class="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0">R</span>
      <div class="leading-tight sb-brand-text">
        <div class="font-bold text-white text-sm">Reciclean</div>
        <div class="text-[11px] text-stone-400">Panel modular · MVC</div>
      </div>
    </div>
    <nav class="py-2 flex-1 overflow-y-auto">${MENU.map(grupoHTML).join("")}</nav>
    <div class="px-4 py-3 text-[11px] text-stone-500 border-t border-stone-800 sb-footer">
      Arquitectura modular · reemplaza gradualmente a panel-rdo.html
    </div>`;

  // Toggle de sección (acordeón)
  mountEl.querySelectorAll(".nav-group-h").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("open")));

  // Navegación por item
  mountEl.querySelectorAll(".nav-item").forEach((el) =>
    el.addEventListener("click", () => onNavigate(el.dataset.route)));
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
