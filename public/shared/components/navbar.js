// COMPONENTE · Barra superior. Menú + perfil desplegable + cerrar sesión.
//
// El perfil (nombre, rol, email) se rellena de forma asíncrona vía setUsuario() cuando el
// router ya cargó la sesión y los permisos. Al hacer clic en el avatar se despliega un menú
// con los datos del usuario y el botón "Cerrar sesión". Se cierra al hacer clic fuera o Esc.
import { getClient } from "../js/supabase.js";

const ROL_ETIQUETA = { gerencia: "Gerencia", operador: "Operador", lector: "Lector", inactivo: "Inactivo" };
const ROL_COLOR = {
  gerencia: "background:#d1fae5;color:#065f46",
  operador: "background:#e0f2fe;color:#075985",
  lector:   "background:#f5f5f4;color:#57534e",
  inactivo: "background:#ffe4e6;color:#9f1239",
};

// Iniciales para el avatar: de "nombre apellido" o del prefijo del email.
function iniciales({ nombre, apellido, email }) {
  const n = (nombre || "").trim(), a = (apellido || "").trim();
  if (n || a) return ((n[0] || "") + (a[0] || "")).toUpperCase() || "?";
  const base = (email || "").split("@")[0] || "";
  const partes = base.split(/[.\-_]+/).filter(Boolean);
  return ((partes[0]?.[0] || base[0] || "?") + (partes[1]?.[0] || "")).toUpperCase();
}

export function renderNavbar(mountEl) {
  mountEl.innerHTML = `
    <button id="navMenuBtn" class="text-stone-500 text-xl leading-none px-1 hover:text-stone-800" title="Menú">☰</button>
    <span class="font-bold text-stone-800 sm:hidden">Reciclean</span>
    <div class="ml-auto flex items-center gap-3">
      <span class="reloj-chile text-[11px] text-stone-500 hidden sm:inline" title="Hora de Chile continental">—</span>
      <div class="relative">
        <button id="navPerfilBtn" type="button" aria-haspopup="true" aria-expanded="false"
          class="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-stone-100 transition-colors">
          <div class="text-right leading-tight hidden sm:block">
            <div id="navNombre" class="text-sm font-semibold text-stone-800">Sesión</div>
            <div id="navRol" class="text-[11px] text-stone-500">—</div>
          </div>
          <span id="navAvatar" class="w-9 h-9 rounded-full bg-emerald-700 text-white text-sm font-bold flex items-center justify-center">R</span>
        </button>
        <div id="navPerfilMenu" class="hidden absolute right-0 mt-2 w-64 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden z-50">
          <div class="px-4 py-3 border-b border-stone-100">
            <div id="navMenuNombre" class="text-sm font-semibold text-stone-800">Sesión</div>
            <div id="navMenuEmail" class="text-xs text-stone-500 truncate">—</div>
            <span id="navMenuRol" class="inline-block mt-2" style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">—</span>
          </div>
          <button id="navLogout" type="button"
            class="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2">
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>`;

  const btn = mountEl.querySelector("#navPerfilBtn");
  const menu = mountEl.querySelector("#navPerfilMenu");

  const abrir = () => { menu.classList.remove("hidden"); btn.setAttribute("aria-expanded", "true"); };
  const cerrar = () => { menu.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); };
  const alternar = () => (menu.classList.contains("hidden") ? abrir() : cerrar());

  btn.addEventListener("click", (e) => { e.stopPropagation(); alternar(); });
  // Clic fuera y Esc cierran el menú.
  document.addEventListener("click", (e) => { if (!menu.contains(e.target) && !btn.contains(e.target)) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });

  const logout = mountEl.querySelector("#navLogout");
  if (logout) logout.addEventListener("click", async () => {
    logout.disabled = true;
    try { await getClient().auth.signOut(); } catch (_) { /* igual salimos */ }
    location.href = "/login.html";
  });
}

// Rellena el perfil con los datos de sesión. Acepta un objeto { email, rol, nombre, apellido }.
// Retrocompatible: si se le pasa un string, se trata como el email.
export function setUsuario(mountEl, datos) {
  const d = typeof datos === "string" ? { email: datos } : (datos || {});
  const nombreCompleto = [d.nombre, d.apellido].filter(Boolean).join(" ").trim()
    || (d.email ? d.email.split("@")[0] : "Sesión");
  const rolTxt = ROL_ETIQUETA[d.rol] || (d.rol || "—");

  const set = (id, txt) => { const el = mountEl.querySelector(id); if (el) el.textContent = txt; };
  set("#navNombre", nombreCompleto);
  set("#navRol", rolTxt);
  set("#navMenuNombre", nombreCompleto);
  set("#navMenuEmail", d.email || "—");

  const avatar = mountEl.querySelector("#navAvatar");
  if (avatar) avatar.textContent = iniciales(d);

  const chip = mountEl.querySelector("#navMenuRol");
  if (chip) { chip.textContent = rolTxt; chip.setAttribute("style", (ROL_COLOR[d.rol] || ROL_COLOR.lector) + ";padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700"); }
}
