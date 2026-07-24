// CONTROLADOR · Usuarios y permisos. Solo gerencia.
//
// Qué hace el panel:
//   · CREAR usuarios (email + contraseña + nombre/apellido + rol) vía Edge Function segura
//     (la creación de cuentas exige service_role, que vive en el servidor, nunca en el browser).
//   · asignar rol · activar/desactivar (baja lógica) · overrides de permiso por persona
//   · GESTIONAR ROLES: crear, renombrar, eliminar y definir qué vistas ve cada rol (RBAC).
//
// El rol es la PLANTILLA; los overrides por usuario ajustan casos puntuales. mis_permisos
// (en la base) combina ambos.
import { getClient, getSession } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal, cerrarModal } from "../components/modal.js";
import { toast, toastError } from "../components/toast.js";
import { escapeHTML, horaChile, filtroGlobal } from "../js/util.js";
import { rolActual } from "../js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

// Colores base; los roles nuevos caen a un color neutro.
const COLOR = {
  gerencia: "bg-emerald-100 text-emerald-800",
  operador: "bg-sky-100 text-sky-800",
  lector:   "bg-stone-100 text-stone-700",
};
const colorRol = (id) => COLOR[id] || "bg-violet-100 text-violet-800";

// Módulos que pueden encenderse/apagarse (por rol o por usuario), con nombre legible.
const MODULOS = [
  { ruta: "inicio",       label: "Inicio" },
  { ruta: "carga-manual", label: "Carga Manual" },
  { ruta: "calculadora",  label: "Calculadora" },
  { ruta: "publicados",   label: "Publicados" },
  { ruta: "historial",    label: "Historial" },
  { ruta: "materiales",   label: "Materiales y Precios" },
  { ruta: "catalogo",     label: "Catálogo" },
  { ruta: "usuarios",     label: "Usuarios y permisos" },
];

let _filas = [];   // usuarios
let _roles = [];    // roles_panel: [{id,nombre,protegido,es_admin,rutas,usuarios}]
let _tabla = null;
let _rol = "lector";
let _yo = null;

const rolNombre = (id) => _roles.find((r) => r.id === id)?.nombre || id;
// ¿El rol da acceso a la ruta por defecto (sin override)? Admin = todo.
function defaultDaAcceso(rolId, ruta) {
  const r = _roles.find((x) => x.id === rolId);
  if (!r) return false;
  return r.es_admin || (r.rutas || []).includes(ruta);
}

export async function mountUsuarios() {
  const body = $("usrBody");
  body.innerHTML = fila(5, "Cargando…");

  try {
    const session = await getSession().catch(() => null);
    _yo = session?.user?.email || null;

    const [usr, rls] = await Promise.all([
      getClient().from("usuarios_panel")
        .select("user_id, email, rol, nombre, apellido, asignado_por, updated_at, last_sign_in_at, activo, permisos, mi_rol")
        .order("email"),
      getClient().from("roles_panel").select("id, nombre, protegido, es_admin, rutas, usuarios").order("id"),
    ]);
    if (usr.error) throw new Error(usr.error.message);
    _filas = usr.data || [];
    _roles = rls.data || [];
    _rol = _filas[0]?.mi_rol || rolActual();
    pintarRol();
    poblarSelectorLote();
    contar();

    if (!_filas.length) { body.innerHTML = fila(5, "Sin usuarios."); }
    else {
      _tabla = montarTabla({
        tbody: body, thead: $("usrHead"), info: $("usrInfo"), pager: $("usrPager"),
        rows: _filas, renderRow, colspan: 5, pageSize: 30,
        sortInicial: { key: "email", dir: "asc" },
        sorters: {
          email:  (r) => r.email || "",
          rol:    (r) => r.rol || "",
          estado: (r) => (r.activo ? 0 : 1),
        },
        infoText: (t, p, pg) => `${t} usuario(s) · página ${p} de ${pg}.`,
        onRender: cablearFilas,
      });
    }

    cablearBuscador();
    cablearLote();
    cablearBotonesGerencia();
  } catch (e) {
    body.innerHTML = fila(5, "❌ No pude cargar los usuarios: " + esc(e.message));
  }
}

function nombreDe(r) {
  return [r.nombre, r.apellido].filter(Boolean).join(" ").trim() || r.email.split("@")[0];
}

function renderRow(r) {
  const editable = _rol === "gerencia";
  const nOverrides = Object.keys(r.permisos || {}).length;
  const estado = r.activo
    ? `<span class="bg-emerald-100 text-emerald-800" style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">Activo</span>`
    : `<span class="bg-rose-100 text-rose-700" style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">Inactivo</span>`;
  const badgeOv = nOverrides
    ? ` <span title="${nOverrides} permiso(s) personalizado(s)" style="background:#ede9fe;color:#6d28d9;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700">★ ${nOverrides}</span>`
    : "";
  return `<tr class="hover:bg-stone-50 ${r.activo ? "" : "opacity-70"}" data-uid="${esc(r.user_id)}">
    <td class="px-3 py-2.5 text-center"><input type="checkbox" class="usrChk" value="${esc(r.user_id)}" ${editable ? "" : "disabled"}></td>
    <td class="px-4 py-2.5">
      <div class="font-medium text-stone-800">${esc(nombreDe(r))}</div>
      <div class="text-xs text-stone-400">${esc(r.email)} · ${r.last_sign_in_at ? "último ingreso " + horaChile(r.last_sign_in_at) : "nunca ha entrado"}</div>
    </td>
    <td class="px-4 py-2.5">
      <span class="${colorRol(r.rol)}" style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${esc(rolNombre(r.rol))}</span>${badgeOv}
    </td>
    <td class="px-4 py-2.5">${estado}</td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      <button class="usrEditar bg-stone-800 text-white px-3 py-1 rounded text-xs font-medium"
        ${editable ? "" : "disabled style=opacity:.5"}>Editar</button>
    </td>
  </tr>`;
}

function cablearFilas() {
  document.querySelectorAll("#usrBody .usrEditar").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const uid = b.closest("tr").dataset.uid;
      abrirEditor(_filas.find((r) => r.user_id === uid));
    });
  });
  const todos = $("usrTodos");
  if (todos) todos.onchange = () =>
    document.querySelectorAll("#usrBody .usrChk:not([disabled])")
      .forEach((c) => { c.checked = todos.checked; });
}

// ── Editor de un usuario: rol + estado + permisos por módulo ───────────────────
function abrirEditor(r) {
  if (!r) return;
  const esYo = r.email === _yo;

  const opcRol = _roles.map((rol) =>
    `<option value="${esc(rol.id)}" ${r.rol === rol.id ? "selected" : ""}>${esc(rol.nombre)}</option>`).join("");

  const filaPermiso = (m) => {
    const ov = r.permisos?.[m.ruta];
    const valor = ov === true ? "on" : ov === false ? "off" : "";
    const heredado = defaultDaAcceso(r.rol, m.ruta) ? "acceso" : "sin acceso";
    return `<tr style="border-top:1px solid #f1f0ef">
      <td style="padding:6px 4px;font-size:13px;color:#1c1917">${esc(m.label)}</td>
      <td style="padding:6px 4px;text-align:right">
        <select class="usrPerm" data-ruta="${esc(m.ruta)}" style="padding:5px 8px;border:1px solid #d6d3d1;border-radius:6px;font-size:12px;background:#fff">
          <option value=""   ${valor === "" ? "selected" : ""}>Según rol (${heredado})</option>
          <option value="on" ${valor === "on" ? "selected" : ""}>✔ Permitir</option>
          <option value="off"${valor === "off" ? "selected" : ""}>✕ Bloquear</option>
        </select>
      </td>
    </tr>`;
  };

  const esAdmin = _roles.find((x) => x.id === r.rol)?.es_admin;
  const adminAviso = esAdmin
    ? `<p style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:8px 10px;font-size:12px;color:#065f46;margin-top:8px">
         Este rol tiene acceso total: los overrides por módulo no aplican.</p>`
    : "";

  abrirModal({
    titulo: `Editar · ${esc(nombreDe(r))}`,
    cuerpoHTML: `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <label style="flex:1;min-width:140px">
          <span style="font-size:12px;color:#57534e">Rol (plantilla)</span>
          <select id="usrEdRol" style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px;background:#fff">${opcRol}</select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1c1917;padding-bottom:8px">
          <input type="checkbox" id="usrEdActivo" ${r.activo ? "checked" : ""} ${esYo ? "disabled title='No puedes desactivarte a ti mismo'" : ""} style="width:18px;height:18px">
          Cuenta activa
        </label>
      </div>
      ${adminAviso}
      <div style="font-size:12px;color:#57534e;font-weight:600;margin:6px 0 2px">Permisos por módulo</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody id="usrPermBody">${MODULOS.map(filaPermiso).join("")}</tbody>
      </table>
      <p style="font-size:11px;color:#a8a29e;margin-top:8px">Los cambios se guardan al instante.</p>`,
    acciones: [{ texto: "Cerrar", primario: true }],
  });

  $("usrEdRol")?.addEventListener("change", async (e) => {
    const nuevo = e.target.value, anterior = r.rol;
    try {
      await rpc("f_asignar_rol", { p_user_ids: [r.user_id], p_rol: nuevo });
      r.rol = nuevo;
      _tabla?.setRows(_filas); contar();
      toast(`Rol de ${r.email} → ${rolNombre(nuevo)}.`);
      refrescarEtiquetasPermisos(r);
    } catch (err) {
      e.target.value = anterior;
      toastError(/administrador/i.test(err.message) ? "No puedes quitarte a ti mismo el acceso de administrador." : err.message);
    }
  });

  $("usrEdActivo")?.addEventListener("change", async (e) => {
    const activo = e.target.checked;
    try {
      await rpc("f_usuario_activar", { p_user_id: r.user_id, p_activo: activo });
      r.activo = activo; _tabla?.setRows(_filas);
      toast(activo ? "Cuenta reactivada." : "Cuenta desactivada.");
    } catch (err) {
      e.target.checked = !activo;
      toastError(/ti mismo/i.test(err.message) ? "No puedes desactivarte a ti mismo." : err.message);
    }
  });

  document.querySelectorAll("#usrPermBody .usrPerm").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const ruta = sel.dataset.ruta, v = sel.value;
      const permitido = v === "" ? null : v === "on";
      const previo = valorSelectDesde(r.permisos?.[ruta]);
      try {
        await rpc("f_usuario_permiso", { p_user_id: r.user_id, p_ruta: ruta, p_permitido: permitido });
        r.permisos = { ...(r.permisos || {}) };
        if (permitido === null) delete r.permisos[ruta]; else r.permisos[ruta] = permitido;
        _tabla?.setRows(_filas);
        toast("Permiso actualizado.");
      } catch (err) {
        sel.value = previo;
        toastError(/ti mismo/i.test(err.message) ? "No puedes quitarte a ti mismo el acceso a Usuarios." : err.message);
      }
    });
  });
}

const valorSelectDesde = (ov) => (ov === true ? "on" : ov === false ? "off" : "");

function refrescarEtiquetasPermisos(r) {
  document.querySelectorAll("#usrPermBody .usrPerm").forEach((sel) => {
    const heredado = defaultDaAcceso(r.rol, sel.dataset.ruta) ? "acceso" : "sin acceso";
    const opt = sel.querySelector('option[value=""]');
    if (opt) opt.textContent = `Según rol (${heredado})`;
  });
}

// ── Crear usuario (Edge Function) ──────────────────────────────────────────────
function abrirCrearUsuario() {
  const opcRol = _roles.map((r) => `<option value="${esc(r.id)}" ${r.id === "lector" ? "selected" : ""}>${esc(r.nombre)}</option>`).join("");
  const inp = "width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px";
  const lbl = "display:block;margin-bottom:10px;font-size:12px;color:#57534e";
  abrirModal({
    titulo: "Crear usuario",
    cuerpoHTML: `
      <div style="display:flex;gap:10px">
        <label style="${lbl};flex:1">Nombre<input id="cuNombre" style="${inp}"></label>
        <label style="${lbl};flex:1">Apellido<input id="cuApellido" style="${inp}"></label>
      </div>
      <label style="${lbl}">Email<input id="cuEmail" type="email" autocomplete="off" style="${inp}"></label>
      <label style="${lbl}">Contraseña (mínimo 8 caracteres)<input id="cuPass" type="password" autocomplete="new-password" style="${inp}"></label>
      <label style="${lbl}">Rol<select id="cuRol" style="${inp};background:#fff">${opcRol}</select></label>
      <div id="cuError" style="display:none;color:#be123c;font-size:13px;font-weight:600;margin-top:8px"></div>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: "Crear", primario: true, cerrar: false, onClick: crearUsuario },
    ],
  });
}

async function crearUsuario() {
  const err = $("cuError");
  const mostrar = (m) => { err.textContent = m; err.style.display = "block"; };
  const email = ($("cuEmail").value || "").trim().toLowerCase();
  const password = $("cuPass").value || "";
  const nombre = ($("cuNombre").value || "").trim();
  const apellido = ($("cuApellido").value || "").trim();
  const rol = $("cuRol").value;
  if (!nombre || !apellido) return mostrar("Nombre y apellido son obligatorios.");
  if (!email) return mostrar("El email es obligatorio.");
  if (password.length < 8) return mostrar("La contraseña debe tener al menos 8 caracteres.");

  const btnCrear = document.querySelector(".rc-modal-foot .rc-modal-btn.primario");
  if (btnCrear) { btnCrear.disabled = true; btnCrear.textContent = "Creando…"; }
  try {
    const { data, error } = await getClient().functions.invoke("crear-usuario", {
      body: { email, password, nombre, apellido, rol },
    });
    // En un error HTTP, supabase-js deja el cuerpo en error.context; lo leemos para el mensaje real.
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch (_) { /* usa error.message */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    cerrarModal();
    toast(`Usuario ${email} creado como ${rolNombre(rol)}.`);
    await mountUsuarios();
  } catch (e) {
    mostrar(e.message);
    if (btnCrear) { btnCrear.disabled = false; btnCrear.textContent = "Crear"; }
  }
}

// ── Gestión de roles ───────────────────────────────────────────────────────────
function abrirRoles() {
  const filaRol = (r) => {
    const chips = MODULOS.map((m) => {
      const on = r.es_admin || (r.rutas || []).includes(m.ruta);
      return `<label style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#57534e;margin:0 6px 4px 0;cursor:${r.es_admin ? "default" : "pointer"}">
        <input type="checkbox" class="rolPerm" data-rol="${esc(r.id)}" data-ruta="${esc(m.ruta)}" ${on ? "checked" : ""} ${r.es_admin ? "disabled" : ""}> ${esc(m.label)}</label>`;
    }).join("");
    return `<div data-rolrow="${esc(r.id)}" style="border:1px solid #e7e5e4;border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input class="rolNombre" value="${esc(r.nombre)}" ${r.protegido ? "disabled" : ""} style="font-weight:700;font-size:14px;border:1px solid ${r.protegido ? "#f1f0ef" : "#d6d3d1"};border-radius:6px;padding:5px 8px;background:${r.protegido ? "#f5f5f4" : "#fff"}">
        <span style="font-size:11px;color:#a8a29e">${r.usuarios} usuario(s)${r.es_admin ? " · acceso total" : ""}${r.protegido ? " · protegido" : ""}</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          ${r.protegido ? "" : `<button type="button" class="rolGuardar" data-rol="${esc(r.id)}" style="background:#047857;color:#fff;border:0;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer">Renombrar</button>`}
          ${r.protegido ? "" : `<button type="button" class="rolEliminar" data-rol="${esc(r.id)}" style="background:#fff;border:1px solid #fca5a5;color:#b91c1c;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer">Eliminar</button>`}
        </span>
      </div>
      ${r.es_admin ? "" : `<div style="margin-top:8px">${chips}</div>`}
    </div>`;
  };

  abrirModal({
    titulo: "Roles y permisos",
    cuerpoHTML: `
      <p style="font-size:13px;color:#78716c;margin-bottom:10px">Marca qué vistas ve cada rol. Los cambios de permiso se guardan al instante; el nombre, con "Renombrar".</p>
      <div id="rolLista">${_roles.map(filaRol).join("")}</div>
      <div style="border-top:1px solid #e7e5e4;margin-top:10px;padding-top:10px">
        <span style="font-size:12px;color:#57534e;font-weight:600">Nuevo rol</span>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="rolNuevoNombre" placeholder="Ej. Supervisor de planta" style="flex:1;padding:7px;border:1px solid #d6d3d1;border-radius:6px">
          <button type="button" id="rolCrear" style="background:#047857;color:#fff;border:0;border-radius:6px;padding:7px 12px;font-weight:600;cursor:pointer">Crear</button>
        </div>
      </div>`,
    acciones: [{ texto: "Cerrar", primario: true }],
  });

  const recargarRoles = async () => {
    const { data } = await getClient().from("roles_panel").select("id, nombre, protegido, es_admin, rutas, usuarios").order("id");
    _roles = data || [];
    poblarSelectorLote();
  };

  // Toggle de permiso por ruta (guarda al instante).
  document.querySelectorAll("#rolLista .rolPerm").forEach((chk) => {
    if (chk.disabled) return;
    chk.addEventListener("change", async () => {
      try {
        await rpc("f_rol_permiso_set", { p_rol: chk.dataset.rol, p_ruta: chk.dataset.ruta, p_permitido: chk.checked });
        await recargarRoles();
        toast("Permiso del rol actualizado.");
      } catch (e) { chk.checked = !chk.checked; toastError(e.message); }
    });
  });
  // Renombrar
  document.querySelectorAll("#rolLista .rolGuardar").forEach((b) => {
    b.addEventListener("click", async () => {
      const row = b.closest("[data-rolrow]");
      const nombre = row.querySelector(".rolNombre").value.trim();
      if (!nombre) return toastError("El nombre del rol no puede quedar vacío.");
      try { await rpc("f_rol_editar", { p_id: b.dataset.rol, p_nombre: nombre }); await recargarRoles(); toast("Rol renombrado."); }
      catch (e) { toastError(e.message); }
    });
  });
  // Eliminar
  document.querySelectorAll("#rolLista .rolEliminar").forEach((b) => {
    b.addEventListener("click", () => {
      abrirModal({
        titulo: "Eliminar rol",
        cuerpoHTML: `<p>¿Eliminar el rol <b>${esc(rolNombre(b.dataset.rol))}</b>? Solo se puede si nadie lo tiene asignado.</p>`,
        acciones: [
          { texto: "Cancelar", onClick: abrirRoles },
          { texto: "Eliminar", primario: true, onClick: async () => {
              try { await rpc("f_rol_eliminar", { p_id: b.dataset.rol }); toast("Rol eliminado."); await recargarRoles(); abrirRoles(); }
              catch (e) { toastError(e.message); abrirRoles(); }
            } },
        ],
      });
    });
  });
  // Crear
  $("rolCrear")?.addEventListener("click", async () => {
    const nombre = $("rolNuevoNombre").value.trim();
    if (!nombre) return toastError("Escribe el nombre del rol.");
    try { await rpc("f_rol_crear", { p_nombre: nombre }); await recargarRoles(); toast("Rol creado."); cerrarModal(); abrirRoles(); }
    catch (e) { toastError(e.message); }
  });
}

// ── RPC + roster helpers ───────────────────────────────────────────────────────
async function rpc(nombre, args) {
  const { error } = await getClient().rpc(nombre, args);
  if (error) throw new Error(error.message);
}

function cablearBotonesGerencia() {
  if (_rol !== "gerencia") return;
  const crear = $("usrCrear"); if (crear) { crear.classList.remove("hidden"); crear.addEventListener("click", abrirCrearUsuario); }
  const roles = $("usrRoles"); if (roles) { roles.classList.remove("hidden"); roles.addEventListener("click", abrirRoles); }
}

function poblarSelectorLote() {
  const sel = $("usrRolLote");
  if (!sel) return;
  sel.innerHTML = `<option value="">— rol a aplicar —</option>` +
    _roles.map((r) => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join("");
}

function cablearLote() {
  const btn = $("usrAplicarLote");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const rol = $("usrRolLote").value;
    const ids = [...document.querySelectorAll("#usrBody .usrChk:checked")].map((c) => c.value);
    if (!rol) return toastError("Elige el rol que quieres aplicar.");
    if (!ids.length) return toastError("Marca al menos una persona.");
    abrirModal({
      titulo: "Cambiar rol",
      cuerpoHTML: `<p>¿Aplicar el rol <b>${esc(rolNombre(rol))}</b> a <b>${ids.length}</b> persona(s)?</p>`,
      acciones: [
        { texto: "Cancelar" },
        { texto: "Aplicar", primario: true, onClick: () => aplicarRolLote(ids, rol) },
      ],
    });
  });
}

async function aplicarRolLote(ids, rol) {
  try {
    await rpc("f_asignar_rol", { p_user_ids: ids, p_rol: rol });
    _filas.forEach((f) => { if (ids.includes(f.user_id)) f.rol = rol; });
    _tabla?.setRows(_filas); contar();
    toast(`Rol ${rolNombre(rol)} aplicado a ${ids.length} persona(s).`);
  } catch (e) {
    toastError(/administrador/i.test(e.message) ? "No puedes quitarte a ti mismo el acceso de administrador." : e.message);
  }
}

function cablearBuscador() {
  const b = $("usrBuscar");
  if (!b) return;
  b.addEventListener("input", () =>
    _tabla?.setRows(filtroGlobal(_filas, b.value, ["email", "nombre", "apellido", "rol", "asignado_por"])));
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
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes administrar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("usrAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: solo gerencia administra usuarios.`;
  aviso.classList.remove("hidden");
}
