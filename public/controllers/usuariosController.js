// CONTROLADOR · Usuarios y permisos. Solo gerencia.
//
// El panel ASIGNA roles, no crea cuentas: crear usuarios exige la service_role key, que
// nunca debe estar en el navegador (quien la tenga puede leer y escribir toda la base).
// Las cuentas se invitan desde el dashboard de Supabase y aparecen aquí solas gracias al
// trigger tg_alta_usuario_rol, que las da de alta como 'lector'.
import { getClient } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal } from "../components/modal.js";
import { escapeHTML, horaChile, filtroGlobal } from "../js/util.js";
import { rolActual } from "../js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

const ROLES = ["gerencia", "operador", "lector"];
const COLOR = {
  gerencia: "bg-emerald-100 text-emerald-800",
  operador: "bg-sky-100 text-sky-800",
  lector:   "bg-stone-100 text-stone-700",
};

let _filas = [];
let _tabla = null;
let _rol = "lector";

export async function mountUsuarios() {
  const body = $("usrBody");
  body.innerHTML = fila(4, "Cargando…");

  try {
    const { data, error } = await getClient()
      .from("usuarios_panel")
      .select("user_id, email, rol, asignado_por, updated_at, last_sign_in_at, mi_rol")
      .order("email");
    if (error) throw new Error(error.message);

    _filas = data || [];
    _rol = _filas[0]?.mi_rol || rolActual();   // sin filas, el rol de mis_permisos (no "lector")
    pintarRol();
    contar();

    if (!_filas.length) { body.innerHTML = fila(4, "Sin usuarios."); return; }

    _tabla = montarTabla({
      tbody: body, thead: $("usrHead"), info: $("usrInfo"), pager: $("usrPager"),
      rows: _filas, renderRow, colspan: 4, pageSize: 30,
      sortInicial: { key: "email", dir: "asc" },
      sorters: { email: (r) => r.email || "", rol: (r) => r.rol || "" },
      infoText: (t, p, pg) => `${t} usuario(s) · página ${p} de ${pg}.`,
      onRender: cablearFilas,
    });

    cablearBuscador();
    cablearLote();
  } catch (e) {
    body.innerHTML = fila(4, "❌ No pude cargar los usuarios: " + esc(e.message));
  }
}

function renderRow(r) {
  const editable = _rol === "gerencia";
  const botones = ROLES.map((rol) => {
    const activo = r.rol === rol;
    return `<button class="usrSet px-2 py-1 rounded text-xs font-semibold ${
      activo ? "bg-stone-800 text-white" : "bg-white border border-stone-300 text-stone-600"
    }" data-uid="${esc(r.user_id)}" data-rol="${rol}" ${
      editable && !activo ? "" : "disabled style=opacity:.6;cursor:default"
    }>${rol}</button>`;
  }).join(" ");

  return `<tr class="hover:bg-stone-50">
    <td class="px-3 py-2.5 text-center"><input type="checkbox" class="usrChk" value="${esc(r.user_id)}" ${editable ? "" : "disabled"}></td>
    <td class="px-4 py-2.5">
      <div class="font-medium text-stone-800">${esc(r.email)}</div>
      <div class="text-xs text-stone-400">${r.last_sign_in_at ? "último ingreso " + horaChile(r.last_sign_in_at) : "nunca ha entrado"}</div>
    </td>
    <td class="px-4 py-2.5">
      <span class="${COLOR[r.rol] || COLOR.lector}" style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${esc(r.rol)}</span>
    </td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">${botones}</td>
  </tr>`;
}

function cablearFilas() {
  document.querySelectorAll("#usrBody .usrSet").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => aplicarRol([b.dataset.uid], b.dataset.rol));
  });
  const todos = $("usrTodos");
  if (todos) todos.onchange = () =>
    document.querySelectorAll("#usrBody .usrChk:not([disabled])")
      .forEach((c) => { c.checked = todos.checked; });
}

async function aplicarRol(userIds, rol) {
  try {
    const { error } = await getClient().rpc("f_asignar_rol", {
      p_user_ids: userIds, p_rol: rol,
    });
    if (error) throw new Error(error.message);
    _filas.forEach((f) => { if (userIds.includes(f.user_id)) f.rol = rol; });
    _tabla.setRows(_filas);
    contar();
  } catch (e) {
    const msg = /a ti mismo/i.test(e.message)
      ? "No puedes quitarte a ti mismo el rol de gerencia: el sistema quedaría sin administrador."
      : e.message;
    abrirModal({ titulo: "No se pudo cambiar el rol", cuerpoHTML: `<p>${esc(msg)}</p>` });
  }
}

function cablearLote() {
  const btn = $("usrAplicarLote");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const rol = $("usrRolLote").value;
    const ids = [...document.querySelectorAll("#usrBody .usrChk:checked")].map((c) => c.value);
    if (!rol) return abrirModal({ titulo: "Falta el rol", cuerpoHTML: "<p>Elige el rol que quieres aplicar.</p>" });
    if (!ids.length) return abrirModal({ titulo: "Nadie seleccionado", cuerpoHTML: "<p>Marca al menos una persona.</p>" });
    abrirModal({
      titulo: "Cambiar rol",
      cuerpoHTML: `<p>¿Aplicar el rol <b>${esc(rol)}</b> a <b>${ids.length}</b> persona(s)?</p>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Aplicar", primario: true, onClick: () => aplicarRol(ids, rol) },
      ],
    });
  });
}

function cablearBuscador() {
  const b = $("usrBuscar");
  if (!b) return;
  b.addEventListener("input", () =>
    _tabla.setRows(filtroGlobal(_filas, b.value, ["email", "rol", "asignado_por"])));
}

function contar() {
  const n = (rol) => _filas.filter((f) => f.rol === rol).length;
  if ($("usrNGerencia")) $("usrNGerencia").textContent = n("gerencia");
  if ($("usrNOperador")) $("usrNOperador").textContent = n("operador");
  if ($("usrNLector")) $("usrNLector").textContent = n("lector");
}

function pintarRol() {
  const chip = $("usrRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes asignar roles" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("usrAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: solo gerencia puede administrar usuarios.`;
  aviso.classList.remove("hidden");
}
