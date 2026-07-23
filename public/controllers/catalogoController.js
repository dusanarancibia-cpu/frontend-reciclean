// CONTROLADOR · Catálogo de materiales (CRUD de la tabla estática).
//
// Separado a propósito de "Materiales y Precios": aquí se define QUÉ material existe,
// allá cuánto vale. Mezclarlos confundía, porque la tabla de precios tiene una fila por
// material × sucursal y esta tiene una fila por material.
//
// La baja es LÓGICA (activo = false): borrar de verdad rompería las claves foráneas de
// los precios históricos y perderíamos la trazabilidad.
import { getClient } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { abrirModal, cerrarModal } from "../components/modal.js";
import { escapeHTML, filtroGlobal } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

let _filas = [];
let _tabla = null;
let _rol = "lector";

export async function mountCatalogo() {
  const body = $("catBody");
  body.innerHTML = fila(5, "Cargando…");

  try {
    await recargar();
    pintarRol();

    _tabla = montarTabla({
      tbody: body, thead: $("catHead"), info: $("catInfo"), pager: $("catPager"),
      rows: visibles(), renderRow, colspan: 5, pageSize: 30,
      vacio: "Sin materiales que coincidan.",
      sortInicial: { key: "nombre", dir: "asc" },
      sorters: {
        nombre:    (r) => r.nombre_interno || "",
        publico:   (r) => r.nombre_publico || "",
        categoria: (r) => r.categoria || "",
        precios:   (r) => Number(r.precios_vigentes ?? 0),
      },
      infoText: (t, p, pg) => `${t} material(es) · página ${p} de ${pg}.`,
      onRender: cablearFilas,
    });

    cablearControles();
  } catch (e) {
    body.innerHTML = fila(5, "❌ No pude cargar el catálogo: " + esc(e.message));
  }
}

async function recargar() {
  const { data, error } = await getClient()
    .from("materiales_panel")
    .select("material_id, nombre_interno, nombre_publico, categoria, unidad, activo, precios_vigentes, mi_rol")
    .order("nombre_interno");
  if (error) throw new Error(error.message);
  _filas = data || [];
  _rol = _filas[0]?.mi_rol || "lector";
}

function visibles() {
  const verInactivos = $("catVerInactivos")?.checked;
  const q = $("catBuscar")?.value || "";
  const base = verInactivos ? _filas : _filas.filter((r) => r.activo);
  return filtroGlobal(base, q, ["material_id", "nombre_interno", "nombre_publico", "categoria"]);
}

function renderRow(r) {
  const editable = _rol === "gerencia";
  const estado = r.activo ? "" :
    ` <span style="background:#f5f5f4;color:#78716c;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700">inactivo</span>`;
  return `<tr class="hover:bg-stone-50 ${r.activo ? "" : "opacity-60"}" data-id="${esc(r.material_id)}">
    <td class="px-4 py-2.5">
      <div class="font-medium text-stone-800">${esc(r.nombre_interno)}${estado}</div>
      <div class="text-xs text-stone-400">${esc(r.material_id)}</div>
    </td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.nombre_publico)}</td>
    <td class="px-4 py-2.5 text-stone-500 text-xs">${esc(r.categoria || "—")}</td>
    <td class="px-4 py-2.5 text-center text-stone-600">${r.precios_vigentes ?? 0}</td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      <button class="catEdit bg-stone-800 text-white px-3 py-1 rounded text-xs font-medium"
        ${editable ? "" : "disabled style=opacity:.5"}>Editar</button>
      <button class="catToggle bg-white border px-3 py-1 rounded text-xs font-medium ml-1 ${
        r.activo ? "border-rose-300 text-rose-700" : "border-emerald-300 text-emerald-700"}"
        ${editable ? "" : "disabled style=opacity:.5"}>${r.activo ? "Desactivar" : "Reactivar"}</button>
    </td>
  </tr>`;
}

function cablearFilas() {
  document.querySelectorAll("#catBody .catEdit").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const id = b.closest("tr").dataset.id;
      abrirFormulario(_filas.find((r) => r.material_id === id));
    });
  });
  document.querySelectorAll("#catBody .catToggle").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const id = b.closest("tr").dataset.id;
      const r = _filas.find((x) => x.material_id === id);
      confirmarToggle(r);
    });
  });
}

function cablearControles() {
  const refrescar = () => _tabla.setRows(visibles());
  $("catBuscar")?.addEventListener("input", refrescar);
  $("catVerInactivos")?.addEventListener("change", refrescar);
  $("catNuevo")?.addEventListener("click", () => {
    if (_rol !== "gerencia") {
      return abrirModal({ titulo: "Sin permiso", cuerpoHTML: "<p>Solo gerencia puede crear materiales.</p>" });
    }
    abrirFormulario(null);
  });
}

// Formulario único para crear y editar: el código solo es editable al crear, porque
// cambiarlo después rompería la relación con los precios ya cargados.
function abrirFormulario(r) {
  const nuevo = !r;
  const campo = (id, etiqueta, valor, extra = "") => `
    <label style="display:block;margin-bottom:10px">
      <span style="font-size:12px;color:#57534e">${etiqueta}</span>
      <input id="${id}" value="${esc(valor || "")}" ${extra}
        style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px">
    </label>`;

  abrirModal({
    titulo: nuevo ? "Nuevo material" : `Editar · ${r.nombre_interno}`,
    cuerpoHTML:
      campo("catId", "Código (sin espacios, ej. cobre_2da)", nuevo ? "" : r.material_id,
            nuevo ? "" : "disabled style=width:100%;padding:8px;border:1px solid #e7e5e4;border-radius:6px;margin-top:4px;background:#f5f5f4;color:#78716c") +
      campo("catNombre", "Nombre interno (como lo llama la operación)", r?.nombre_interno) +
      campo("catPublico", "Nombre público (como se ve en la web)", r?.nombre_publico) +
      campo("catCategoria", "Categoría (opcional)", r?.categoria) +
      campo("catUnidad", "Unidad", r?.unidad || "kg") +
      `<div id="catError" style="display:none;color:#be123c;font-size:13px;font-weight:600;margin-top:8px"></div>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: nuevo ? "Crear" : "Guardar", primario: true, cerrar: false,
        onClick: () => guardar(nuevo, r) },
    ],
  });
}

async function guardar(nuevo, r) {
  const err = $("catError");
  const mostrar = (m) => { err.textContent = m; err.style.display = "block"; };

  const id = nuevo ? ($("catId").value || "").trim().toLowerCase().replace(/\s+/g, "_") : r.material_id;
  const nombre = ($("catNombre").value || "").trim();
  if (!id) return mostrar("El código es obligatorio.");
  if (!nombre) return mostrar("El nombre interno es obligatorio.");
  if (nuevo && _filas.some((x) => x.material_id === id)) {
    return mostrar(`Ya existe un material con el código "${id}".`);
  }

  try {
    const { error } = await getClient().rpc("f_material_guardar", {
      p_material_id: id,
      p_nombre_interno: nombre,
      p_nombre_publico: ($("catPublico").value || "").trim(),
      p_categoria: ($("catCategoria").value || "").trim() || null,
      p_unidad: ($("catUnidad").value || "kg").trim(),
    });
    if (error) throw new Error(error.message);
    cerrarModal();
    await recargar();
    _tabla.setRows(visibles());
  } catch (e) {
    mostrar(/gerencia/i.test(e.message) ? "Solo gerencia puede administrar materiales." : e.message);
  }
}

function confirmarToggle(r) {
  if (!r) return;
  const desactivando = r.activo;
  abrirModal({
    titulo: desactivando ? "Desactivar material" : "Reactivar material",
    cuerpoHTML: desactivando
      ? `<p>¿Desactivar <b>${esc(r.nombre_interno)}</b>?</p>
         <p style="font-size:13px;color:#78716c;margin-top:8px">
           Dejará de aparecer en Carga Manual y en las webs, pero sus precios históricos se conservan.
           Puedes reactivarlo cuando quieras.</p>`
      : `<p>¿Reactivar <b>${esc(r.nombre_interno)}</b>?</p>`,
    acciones: [
      { texto: "Cancelar" },
      { texto: desactivando ? "Desactivar" : "Reactivar", primario: true, onClick: async () => {
          try {
            const { error } = await getClient().rpc("f_material_activar", {
              p_material_id: r.material_id, p_activo: !r.activo,
            });
            if (error) throw new Error(error.message);
            r.activo = !r.activo;
            _tabla.setRows(visibles());
          } catch (e) {
            abrirModal({ titulo: "No se pudo cambiar", cuerpoHTML: `<p>${esc(e.message)}</p>` });
          }
        } },
    ],
  });
}

function pintarRol() {
  const chip = $("catRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes editar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("catAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes consultar el catálogo, ` +
    `pero solo gerencia crea o modifica materiales.`;
  aviso.classList.remove("hidden");
}
