// CONTROLADOR · Usuarios y permisos. Solo gerencia.
//
// El panel NO crea cuentas auth (eso exige la service_role key, que jamás debe estar en el
// navegador): las cuentas se invitan desde el dashboard de Supabase y aparecen aquí solas
// como 'lector'. Lo que sí hace el panel:
//   · asignar rol (plantilla de permisos)
//   · activar / desactivar (baja lógica = "eliminar" reversible, conserva el historial)
//   · encender/apagar módulos por persona (overrides sobre el rol)
//
// El rol es la PLANTILLA; los overrides ajustan casos puntuales. mis_permisos (en la base)
// combina ambos, así que estos toggles no son cosméticos: cambian el acceso real.
import { getClient, getSession } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal } from "../components/modal.js";
import { toast, toastError } from "../components/toast.js";
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

// Módulos que pueden encenderse/apagarse por usuario, con nombre legible.
const MODULOS = [
  { ruta: "carga-manual", label: "Carga Manual" },
  { ruta: "calculadora",  label: "Calculadora" },
  { ruta: "publicados",   label: "Publicados" },
  { ruta: "historial",    label: "Historial" },
  { ruta: "materiales",   label: "Materiales y Precios" },
  { ruta: "catalogo",     label: "Catálogo" },
  { ruta: "usuarios",     label: "Usuarios y permisos" },
];
// Permisos por rol (espejo de precios_v3.rol_permiso). Gerencia = '*' (todo).
const ROL_DEFAULT = {
  gerencia: "*",
  operador: new Set(["carga-manual", "calculadora", "publicados", "historial", "materiales", "catalogo"]),
  lector:   new Set(["publicados", "historial", "catalogo"]),
};
const defaultDaAcceso = (rol, ruta) => rol === "gerencia" || !!ROL_DEFAULT[rol]?.has?.(ruta);

let _filas = [];
let _tabla = null;
let _rol = "lector";
let _yo = null;   // email propio, para no auto-bloquearse en la UI

export async function mountUsuarios() {
  const body = $("usrBody");
  body.innerHTML = fila(5, "Cargando…");

  try {
    const session = await getSession().catch(() => null);
    _yo = session?.user?.email || null;

    const { data, error } = await getClient()
      .from("usuarios_panel")
      .select("user_id, email, rol, asignado_por, updated_at, last_sign_in_at, activo, permisos, mi_rol")
      .order("email");
    if (error) throw new Error(error.message);

    _filas = data || [];
    _rol = _filas[0]?.mi_rol || rolActual();
    pintarRol();
    contar();

    if (!_filas.length) { body.innerHTML = fila(5, "Sin usuarios."); return; }

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

    cablearBuscador();
    cablearLote();
  } catch (e) {
    body.innerHTML = fila(5, "❌ No pude cargar los usuarios: " + esc(e.message));
  }
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
      <div class="font-medium text-stone-800">${esc(r.email)}</div>
      <div class="text-xs text-stone-400">${r.last_sign_in_at ? "último ingreso " + horaChile(r.last_sign_in_at) : "nunca ha entrado"}</div>
    </td>
    <td class="px-4 py-2.5">
      <span class="${COLOR[r.rol] || COLOR.lector}" style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700">${esc(r.rol)}</span>${badgeOv}
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

  const opcRol = ROLES.map((rol) =>
    `<option value="${rol}" ${r.rol === rol ? "selected" : ""}>${rol}</option>`).join("");

  const filaPermiso = (m) => {
    const ov = r.permisos?.[m.ruta];               // true | false | undefined
    const valor = ov === true ? "on" : ov === false ? "off" : "";
    const heredado = defaultDaAcceso(r.rol, m.ruta) ? "acceso" : "sin acceso";
    return `<tr style="border-top:1px solid #f1f0ef">
      <td style="padding:6px 4px;font-size:13px;color:#1c1917">${esc(m.label)}</td>
      <td style="padding:6px 4px;text-align:right">
        <select class="usrPerm" data-ruta="${esc(m.ruta)}" style="padding:5px 8px;border:1px solid #d6d3d1;border-radius:6px;font-size:12px;background:#fff">
          <option value=""   ${valor === "" ? "selected" : ""}>Según rol (${heredado})</option>
          <option value="on" ${valor === "on" ? "selected" : ""}>✅ Permitir</option>
          <option value="off"${valor === "off" ? "selected" : ""}>⛔ Bloquear</option>
        </select>
      </td>
    </tr>`;
  };

  const gerenciaTotal = r.rol === "gerencia"
    ? `<p style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:8px 10px;font-size:12px;color:#065f46;margin-top:8px">
         Gerencia tiene acceso total: los overrides por módulo no aplican a este rol.</p>`
    : "";

  abrirModal({
    titulo: `Editar · ${r.email}`,
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
      ${gerenciaTotal}
      <div style="font-size:12px;color:#57534e;font-weight:600;margin:6px 0 2px">Permisos por módulo</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody id="usrPermBody">${MODULOS.map(filaPermiso).join("")}</tbody>
      </table>
      <p style="font-size:11px;color:#a8a29e;margin-top:8px">Los cambios se guardan al instante.</p>`,
    acciones: [{ texto: "Cerrar", primario: true }],
  });

  // Rol
  $("usrEdRol")?.addEventListener("change", async (e) => {
    const nuevo = e.target.value;
    const anterior = r.rol;
    try {
      await rpc("f_asignar_rol", { p_user_ids: [r.user_id], p_rol: nuevo });
      r.rol = nuevo;
      _tabla.setRows(_filas); contar();
      toast(`Rol de ${r.email} → ${nuevo}.`);
      // Cambió el rol → cambian los "según rol": repinta las etiquetas del editor.
      refrescarEtiquetasPermisos(r);
    } catch (err) {
      e.target.value = anterior;
      toastError(/a ti mismo/i.test(err.message)
        ? "No puedes quitarte a ti mismo el rol de gerencia." : err.message);
    }
  });

  // Estado (baja lógica)
  $("usrEdActivo")?.addEventListener("change", async (e) => {
    const activo = e.target.checked;
    try {
      await rpc("f_usuario_activar", { p_user_id: r.user_id, p_activo: activo });
      r.activo = activo;
      _tabla.setRows(_filas);
      toast(activo ? "Cuenta reactivada." : "Cuenta desactivada.");
    } catch (err) {
      e.target.checked = !activo;
      toastError(/ti mismo/i.test(err.message) ? "No puedes desactivarte a ti mismo." : err.message);
    }
  });

  // Permisos por módulo
  document.querySelectorAll("#usrPermBody .usrPerm").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const ruta = sel.dataset.ruta;
      const v = sel.value;               // "" | "on" | "off"
      const permitido = v === "" ? null : v === "on";
      const previo = valorSelectDesde(r.permisos?.[ruta]);
      try {
        await rpc("f_usuario_permiso", { p_user_id: r.user_id, p_ruta: ruta, p_permitido: permitido });
        r.permisos = { ...(r.permisos || {}) };
        if (permitido === null) delete r.permisos[ruta];
        else r.permisos[ruta] = permitido;
        _tabla.setRows(_filas);          // actualiza el badge ★ de overrides
        toast("Permiso actualizado.");
      } catch (err) {
        sel.value = previo;
        toastError(/ti mismo/i.test(err.message)
          ? "No puedes quitarte a ti mismo el acceso a Usuarios." : err.message);
      }
    });
  });
}

const valorSelectDesde = (ov) => (ov === true ? "on" : ov === false ? "off" : "");

// Al cambiar el rol, actualiza el texto "(acceso/sin acceso)" de cada módulo en el editor.
function refrescarEtiquetasPermisos(r) {
  document.querySelectorAll("#usrPermBody .usrPerm").forEach((sel) => {
    const ruta = sel.dataset.ruta;
    const heredado = defaultDaAcceso(r.rol, ruta) ? "acceso" : "sin acceso";
    const opt = sel.querySelector('option[value=""]');
    if (opt) opt.textContent = `Según rol (${heredado})`;
  });
}

async function rpc(nombre, args) {
  const { error } = await getClient().rpc(nombre, args);
  if (error) throw new Error(error.message);
}

// ── Aplicar rol en lote (roster) ──────────────────────────────────────────────
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
      cuerpoHTML: `<p>¿Aplicar el rol <b>${esc(rol)}</b> a <b>${ids.length}</b> persona(s)?</p>`,
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
    _tabla.setRows(_filas); contar();
    toast(`Rol ${rol} aplicado a ${ids.length} persona(s).`);
  } catch (e) {
    toastError(/a ti mismo/i.test(e.message)
      ? "No puedes quitarte a ti mismo el rol de gerencia." : e.message);
  }
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
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes administrar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("usrAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: solo gerencia administra usuarios.`;
  aviso.classList.remove("hidden");
}
