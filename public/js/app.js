// ROUTER · Punto de entrada del panel modular.
// Monta sidebar + navbar, inyecta la vista pedida en #content y arranca su controlador.
import { renderSidebar, setActive, MENU } from "../components/sidebar.js";
import { renderNavbar, setUsuario } from "../components/navbar.js";
import { renderDiegoWidget } from "../components/diegoWidget.js";
import { getSession, waitSupabase } from "../models/supabase.js";
import { iniciarRelojChile } from "./util.js";
import { mountCalculadora } from "../controllers/calculadoraController.js";
import { initDiego } from "../controllers/diegoController.js";
import { mountRecibidos } from "../controllers/recibidosController.js";
import { mountCargaManual } from "../controllers/cargaManualController.js";
import { mountPropuestas } from "../controllers/propuestasController.js";
import { mountRevision } from "../controllers/revisionController.js";
import { mountPublicados } from "../controllers/publicadosController.js";
import { mountMateriales } from "../controllers/materialesController.js";
import { mountVitrina } from "../controllers/vitrinaController.js";

const BASE = ""; // v2 raíz limpia: las vistas viven en /views/*.html
const $sidebar = document.getElementById("sidebar");
const $navbar = document.getElementById("navbar");
const $content = document.getElementById("content");
const $backdrop = document.getElementById("app-backdrop");

// Menú lateral: en móvil (<768px) es un drawer con backdrop; en escritorio se colapsa.
const esMovil = () => window.matchMedia("(max-width: 767px)").matches;
function cerrarDrawer() {
  $sidebar.classList.remove("open");
  if ($backdrop) $backdrop.classList.remove("show");
}
function toggleMenu() {
  if (esMovil()) {
    const abierto = $sidebar.classList.toggle("open");
    if ($backdrop) $backdrop.classList.toggle("show", abierto);
  } else {
    $sidebar.classList.toggle("collapsed");
  }
}

// Tabla de rutas. `view` = archivo en /views. `mount` = controlador opcional.
// Las pantallas aún no migradas reutilizan la plantilla "inicio" como placeholder.
const ROUTES = {
  // Precios (vistas propias)
  materiales:    { view: "materiales",  mount: mountMateriales },
  vitrina:       { view: "vitrina",     mount: mountVitrina },
  calculadora:   { view: "calculadora", mount: mountCalculadora },
  "carga-manual":{ view: "cargaManual", mount: mountCargaManual },
  recibidos:     { view: "recibidos",   mount: mountRecibidos },
  propuestas:    { view: "propuestas",  mount: mountPropuestas },
  revision:      { view: "revision",    mount: mountRevision },
  publicados:    { view: "publicados",  mount: mountPublicados },
  // Home (placeholder sobre plantilla "inicio")
  inicio:        { view: "inicio", titulo: "Inicio", icono: "🏠" },
  "mi-dia":      { view: "inicio", titulo: "Mi Día", icono: "📆" },
  bandeja:       { view: "inicio", titulo: "Mi Bandeja", icono: "📥" },
  firmas:        { view: "inicio", titulo: "Firmas pendientes", icono: "✍️" },
  "mesa-control":{ view: "inicio", titulo: "Mesa Control", icono: "🎛️" },
  // (No hay ruta "login" acá: el login real es /login.html — boot() redirige duro allí
  //  cuando no hay sesión. Una vista de login dentro del panel sería inalcanzable.)
};
const DEFAULT = "calculadora"; // primera pantalla funcional de la nueva arquitectura

async function loadView(name) {
  const res = await fetch(`${BASE}/views/${name}.html`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No pude cargar la vista "${name}" (HTTP ${res.status})`);
  $content.innerHTML = await res.text();
}

async function navigate(route) {
  const r = ROUTES[route] || ROUTES[DEFAULT];
  const key = ROUTES[route] ? route : DEFAULT;
  cerrarDrawer(); // en móvil, al elegir una vista se cierra el menú
  setActive($sidebar, key);
  if (location.hash.slice(1).split("?")[0] !== key)
    history.replaceState(null, "", `#${key}${location.search}`);

  try {
    await loadView(r.view);
  } catch (e) {
    $content.innerHTML = `<div class="p-8 text-rose-600 text-sm">${e.message}</div>`;
    return;
  }

  // Placeholder: rellena el título/ícono de la plantilla "inicio"
  if (r.view === "inicio" && r.titulo) {
    const t = document.getElementById("inicioTitulo");
    const i = document.getElementById("inicioIcono");
    if (t) t.textContent = r.titulo;
    if (i) i.textContent = r.icono || "🏠";
  }

  // Botones internos que navegan (ej. "Ir a la Calculadora")
  $content.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => navigate(b.dataset.goto)));

  // Controlador de la vista (si tiene)
  if (r.mount) await r.mount();
}

async function boot() {
  // Guardia de sesión: sin sesión de Supabase Auth → al login.
  await waitSupabase();
  const sesion = await getSession().catch(() => null);
  if (!sesion) { location.replace("/login.html"); return; }

  renderSidebar($sidebar, navigate);
  renderNavbar($navbar);

  // Reloj en vivo (siempre hora de Chile): actualiza header y footer cada 30 s.
  iniciarRelojChile();

  // Botón hamburguesa ☰ · drawer en móvil / colapso en escritorio
  $navbar.querySelector("#navMenuBtn").addEventListener("click", toggleMenu);
  if ($backdrop) $backdrop.addEventListener("click", cerrarDrawer);

  // Widget flotante de Diego (siempre disponible, sobre cualquier vista)
  renderDiegoWidget(document.getElementById("diego-widget"));
  initDiego();

  // Perfil: si hay sesión Supabase heredada, muestra el email real
  getSession().then((s) => { if (s?.user?.email) setUsuario($navbar, s.user.email); })
    .catch(() => {});

  // Ruta inicial: hash (#calculadora) o query ?vista=calculadora. Permite compartir enlaces.
  const vistaQS = new URLSearchParams(location.search).get("vista");
  const inicial = location.hash.slice(1).split("?")[0] || vistaQS || DEFAULT;
  await navigate(inicial);
}

window.addEventListener("hashchange", () => {
  const route = location.hash.slice(1).split("?")[0] || DEFAULT;
  if (!$sidebar.querySelector(".nav-item.active") ||
      $sidebar.querySelector(".nav-item.active").dataset.route !== route) {
    navigate(route);
  }
});

// Expone el menú por si otra vista quiere construir accesos directos
window.__reciMenu = MENU;

boot();
