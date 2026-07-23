// COMPONENTE · Barra superior. Menú + perfil + cerrar sesión.
// El email real (si hay sesión Supabase) se rellena de forma asíncrona vía setUsuario().
// Nota: se quitaron el buscador (#navSearch, sin handler) y la versión (#navVersion, que
// nunca se rellenaba). Eran UI muerta; se re-agregarán cuando exista búsqueda global real.
import { getClient } from "../models/supabase.js";

export function renderNavbar(mountEl) {
  mountEl.innerHTML = `
    <button id="navMenuBtn" class="text-stone-500 text-xl leading-none px-1 hover:text-stone-800" title="Menú">☰</button>
    <span class="font-bold text-stone-800 sm:hidden">Reciclean</span>
    <div class="ml-auto flex items-center gap-3">
      <span class="reloj-chile text-[11px] text-stone-500 hidden sm:inline" title="Hora de Chile continental">—</span>
      <div class="flex items-center gap-2">
        <div class="text-right leading-tight hidden sm:block">
          <div id="navNombre" class="text-sm font-semibold text-stone-800">Sesión</div>
          <div id="navEmail" class="text-[11px] text-stone-500">—</div>
        </div>
        <span class="w-9 h-9 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center">R</span>
      </div>
      <button id="navLogout" title="Cerrar sesión"
        style="background:#fff;border:1px solid #d6d3d1;color:#57534e;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Salir</button>
    </div>`;

  const logout = mountEl.querySelector("#navLogout");
  if (logout) logout.addEventListener("click", async () => {
    try { await getClient().auth.signOut(); } catch (_) { /* igual salimos */ }
    location.href = "/login.html";
  });
}

// Rellena el subtítulo del perfil con el email de sesión.
export function setUsuario(mountEl, email) {
  const el = mountEl.querySelector("#navEmail");
  if (el && email) el.textContent = email;
  const n = mountEl.querySelector("#navNombre");
  if (n && email) n.textContent = email.split("@")[0];
}
