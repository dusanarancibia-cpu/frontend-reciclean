// ROUTER · Punto de entrada del panel modular.
// Monta sidebar + navbar, inyecta la vista pedida en #content y arranca su controlador.
import { renderSidebar, setActive, refrescarBadges, MENU } from "../components/sidebar.js";
import { renderNavbar, setUsuario } from "../components/navbar.js";
import { renderDiegoWidget } from "../components/diegoWidget.js";
import { getSession, waitSupabase } from "./supabase.js";
import { iniciarRelojChile } from "./util.js";
import { cargarPermisos, puede, htmlAccesoDenegado, rolActual } from "./permisos.js";
import { mountCalculadora } from "../../modulos/precios/calculadoraController.js";
import { initDiego } from "./diegoController.js";
import { mountCargaManual } from "../../modulos/precios/cargaManualController.js";
import { mountPropuestas } from "../../modulos/precios/propuestasController.js";
import { mountRevision } from "../../modulos/precios/revisionController.js";
import { mountRecibidos } from "../../modulos/precios/recibidosController.js";
import { mountPublicados } from "../../modulos/precios/publicadosController.js";
import { mountMateriales } from "../../modulos/precios/materialesController.js";
import { mountHistorial } from "../../modulos/precios/historialController.js";
import { mountUsuarios } from "../../modulos/administracion/usuariosController.js";
import { mountCatalogo } from "../../modulos/precios/catalogoController.js";
// Dominio COMERCIAL (integrado del repo de Pablo). Módulo aislado: sus controladores solo
// dependen de models/comercialStore.js (store local simulado), no de nuestros componentes.
import { mountComercialShell } from "../../modulos/comercial/comercialShellController.js";
import { mountComercialClientes } from "../../modulos/comercial/comercialClientesController.js";
import { mountComercialClienteDetalle } from "../../modulos/comercial/comercialClienteDetalleController.js";
import { mountComercialOportunidades } from "../../modulos/comercial/comercialOportunidadesController.js";
import { mountComercialAgenda } from "../../modulos/comercial/comercialAgendaController.js";
import { mountComercialContratos } from "../../modulos/comercial/comercialContratosController.js";
import { mountComercialCotizador } from "../../modulos/comercial/comercialCotizadorController.js";
import { mountComercialCobranza } from "../../modulos/comercial/comercialCobranzaController.js";

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

// Tabla de rutas (arquitectura por dominios). Cada ruta tiene:
//   · clave  → la KEY interna (calculadora, usuarios…). Es la que usan los permisos
//              (rol_permiso.ruta), el sidebar y los data-goto. NO cambió: la BD sigue igual.
//   · archivo → ruta física del .html bajo public/ (nueva estructura modulos/<dominio>/).
//   · hash   → URL pública "bonita" (#/precios/calculadora). Solo presentación.
//   · mount  → controlador opcional.
const ROUTES = {
  // ── Precios (flujo: Carga → Calculadora → Revisión → Publicados → Historial → Recibidos)
  "carga-manual":{ archivo: "modulos/precios/cargaManual", hash: "/precios/carga-manual", mount: mountCargaManual },
  calculadora:   { archivo: "modulos/precios/calculadora", hash: "/precios/calculadora",  mount: mountCalculadora },
  revision:      { archivo: "modulos/precios/revision",    hash: "/precios/revision",     mount: mountRevision },
  publicados:    { archivo: "modulos/precios/publicados",  hash: "/precios/publicados",   mount: mountPublicados },
  historial:     { archivo: "modulos/precios/historial",   hash: "/precios/historial",    mount: mountHistorial },
  recibidos:     { archivo: "modulos/precios/recibidos",   hash: "/precios/recibidos",    mount: mountRecibidos },
  materiales:    { archivo: "modulos/precios/materiales",  hash: "/precios/materiales",   mount: mountMateriales },
  catalogo:      { archivo: "modulos/precios/catalogo",    hash: "/precios/catalogo",     mount: mountCatalogo },
  propuestas:    { archivo: "modulos/precios/propuestas",  hash: "/precios/propuestas",   mount: mountPropuestas },
  // ── Comercial
  comercial:                    { archivo: "modulos/comercial/comercial",                  hash: "/comercial",                  mount: mountComercialShell },
  "comercial-clientes":         { archivo: "modulos/comercial/comercial-clientes",         hash: "/comercial/clientes",         mount: mountComercialClientes },
  "comercial-clientes-detalle": { archivo: "modulos/comercial/comercial-clientes-detalle", hash: "/comercial/clientes-detalle", mount: mountComercialClienteDetalle },
  "comercial-oportunidades":    { archivo: "modulos/comercial/comercial-oportunidades",    hash: "/comercial/oportunidades",    mount: mountComercialOportunidades },
  "comercial-agenda":           { archivo: "modulos/comercial/comercial-agenda",           hash: "/comercial/agenda",           mount: mountComercialAgenda },
  "comercial-contratos":        { archivo: "modulos/comercial/comercial-contratos",        hash: "/comercial/contratos",        mount: mountComercialContratos },
  "comercial-cotizador":        { archivo: "modulos/comercial/comercial-cotizador",        hash: "/comercial/cotizador",        mount: mountComercialCotizador },
  "comercial-cobranza":         { archivo: "modulos/comercial/comercial-cobranza",         hash: "/comercial/cobranza",         mount: mountComercialCobranza },
  // ── Administración
  usuarios:      { archivo: "modulos/administracion/usuarios", hash: "/administracion/usuarios", mount: mountUsuarios },
  // ── Generales (placeholder sobre la plantilla "inicio")
  inicio:        { archivo: "modulos/generales/inicio", hash: "/inicio",       titulo: "Inicio", icono: "🏠" },
  "mi-dia":      { archivo: "modulos/generales/inicio", hash: "/mi-dia",       titulo: "Mi Día", icono: "📆" },
  bandeja:       { archivo: "modulos/generales/inicio", hash: "/bandeja",      titulo: "Mi Bandeja", icono: "📥" },
  firmas:        { archivo: "modulos/generales/inicio", hash: "/firmas",       titulo: "Firmas pendientes", icono: "✍️" },
  "mesa-control":{ archivo: "modulos/generales/inicio", hash: "/mesa-control", titulo: "Mesa Control", icono: "🎛️" },
  // (El login real es /login.html en la raíz — boot() redirige duro allí sin sesión.)
};
// Mapa hash-bonito → clave, para resolver la URL de vuelta a la KEY interna.
const HASH_A_CLAVE = {};
Object.entries(ROUTES).forEach(([k, r]) => { if (r.hash) HASH_A_CLAVE[r.hash] = k; });

// Traduce el hash actual (bonito o clave plana) a la KEY interna. Acepta:
//   #/precios/calculadora  ·  #calculadora (compat)  ·  vacío
function claveDesdeHash() {
  const h = location.hash.slice(1).split("?")[0];
  if (!h) return "";
  if (HASH_A_CLAVE[h]) return HASH_A_CLAVE[h];        // URL bonita
  const plano = h.replace(/^\//, "");
  if (ROUTES[plano] || ALIAS[plano]) return plano;    // clave directa (enlaces viejos)
  return plano.split("/").pop();                       // último segmento como último recurso
}
// ALIAS de rutas retiradas → la vista que absorbió esa función.
// Se resuelven ANTES de la guardia de permisos: si no, `#pendientes` mostraría "acceso
// denegado" (esa ruta ya no existe en rol_permiso) en vez de llevar a la Calculadora.
// Sirven para no romper enlaces guardados ni #hash escritos a mano.
const ALIAS = {
  pendientes: "calculadora",  // Pendientes → Calculadora (resuelve la misma cola)
  vitrina:    "publicados",   // Vitrina    → Publicados (absorbió la publicación)
  // "recibidos" ya NO es alias de historial: es su propio módulo (auditoría de precios
  // recibidos de los clientes). Su ruta ya vive en ROUTES con mountRecibidos.
};

// Primera pantalla del flujo. Además es la ruta a la que todos los roles tienen acceso.
const DEFAULT = "inicio";

async function loadView(archivo) {
  const res = await fetch(`/${archivo}.html`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No pude cargar la vista "${archivo}" (HTTP ${res.status})`);
  $content.innerHTML = await res.text();
}

async function navigate(route) {
  const destino = ALIAS[route] || route;          // alias primero: ver comentario en ALIAS
  const r = ROUTES[destino] || ROUTES[DEFAULT];
  const key = ROUTES[destino] ? destino : DEFAULT;
  cerrarDrawer(); // en móvil, al elegir una vista se cierra el menú

  // GUARDIA DE ACCESO · va acá, dentro de navigate(), y no en el clic del menú:
  // este es el único punto por el que pasa TODA navegación (clic, #hash escrito a mano,
  // hashchange, enlace compartido). Una ruta no autorizada nunca llega a cargar su vista
  // ni su controlador, así que tampoco dispara sus consultas.
  if (!puede(key)) {
    $content.innerHTML = htmlAccesoDenegado(key);
    // Se deja ver el aviso un momento antes de mandar al inicio.
    setTimeout(() => {
      history.replaceState(null, "", "#inicio");
      navigate("inicio");
    }, 1800);
    return;
  }

  setActive($sidebar, key);
  const hashDeseado = r.hash || "/" + key;
  if (location.hash.slice(1).split("?")[0] !== hashDeseado)
    history.replaceState(null, "", `#${hashDeseado}${location.search}`);

  try {
    await loadView(r.archivo);
  } catch (e) {
    $content.innerHTML = `<div class="p-8 text-rose-600 text-sm">${e.message}</div>`;
    return;
  }

  // Placeholder: rellena el título/ícono de la plantilla "inicio"
  if (r.archivo === "modulos/generales/inicio" && r.titulo) {
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

  // El badge de pendientes puede haber cambiado (ej. tras enviar a revisión o cargar filas):
  // se recalcula al terminar cada navegación. Es un HEAD count barato y falla en silencio.
  refrescarBadges($sidebar);
}

async function boot() {
  // Guardia de sesión: sin sesión de Supabase Auth → al login.
  await waitSupabase();
  const sesion = await getSession().catch(() => null);
  if (!sesion) { location.replace("/login.html"); return; }

  // Los permisos se cargan ANTES del primer navigate(): así ninguna vista alcanza a
  // montarse sin haber pasado por la guardia, ni siquiera la inicial.
  await cargarPermisos();

  renderSidebar($sidebar, navigate, puede);
  renderNavbar($navbar);

  // Badge de pendientes: una lectura al arrancar y luego un refresco suave cada 60 s, para
  // que el número siga vivo aunque el usuario se quede en una pantalla. navigate() también
  // lo actualiza tras cada acción. Es un HEAD count (solo el número) y falla en silencio.
  refrescarBadges($sidebar);
  setInterval(() => refrescarBadges($sidebar), 60000);

  // Reloj en vivo (siempre hora de Chile): actualiza header y footer cada 30 s.
  iniciarRelojChile();

  // Botón hamburguesa ☰ · drawer en móvil / colapso en escritorio
  $navbar.querySelector("#navMenuBtn").addEventListener("click", toggleMenu);
  if ($backdrop) $backdrop.addEventListener("click", cerrarDrawer);

  // Widget flotante de Diego (siempre disponible, sobre cualquier vista)
  renderDiegoWidget(document.getElementById("diego-widget"));
  initDiego();

  // Perfil: muestra nombre/rol/email reales. El rol viene de los permisos ya cargados;
  // nombre/apellido, del metadata del usuario si existe (lo llena la creación de usuarios).
  getSession().then((s) => {
    if (!s?.user) return;
    const meta = s.user.user_metadata || {};
    setUsuario($navbar, {
      email: s.user.email,
      rol: rolActual(),
      nombre: meta.nombre || meta.first_name || null,
      apellido: meta.apellido || meta.last_name || null,
    });
  }).catch(() => {});

  // Ruta inicial: hash bonito (#/precios/calculadora), clave plana o ?vista=calculadora.
  const vistaQS = new URLSearchParams(location.search).get("vista");
  const inicial = claveDesdeHash() || vistaQS || DEFAULT;
  await navigate(inicial);
}

window.addEventListener("hashchange", () => {
  const route = claveDesdeHash() || DEFAULT;
  if (!$sidebar.querySelector(".nav-item.active") ||
      $sidebar.querySelector(".nav-item.active").dataset.route !== route) {
    navigate(route);
  }
});

// Expone el menú por si otra vista quiere construir accesos directos
window.__reciMenu = MENU;

boot();
