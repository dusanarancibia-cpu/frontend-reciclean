// CONTROLADOR · Catálogo de materiales, agrupado por categoría (acordeón).
//
// Separado a propósito de "Materiales y Precios": aquí se define QUÉ material existe y en
// qué categoría va, allá cuánto vale.
//
// La baja es LÓGICA (activo = false): borrar de verdad rompería las claves foráneas de
// los precios históricos y perderíamos la trazabilidad.
//
// Las categorías son ahora una tabla propia (precios_v3.categoria), ordenable y editable
// por gerencia: se administran desde el botón "Categorías" y se asignan en el formulario
// de cada material.
import { getClient } from "../../shared/js/supabase.js";
import { listarEmpresas } from "./preciosRepo.js";
import { montarAcordeon, agruparPorCategoria } from "../../shared/components/acordeon.js";
import { abrirModal, cerrarModal } from "../../shared/components/modal.js";
import { toast, toastError } from "../../shared/components/toast.js";
import { escapeHTML, filtroGlobal, descargarCSV } from "../../shared/js/util.js";
import { rolActual } from "../../shared/js/permisos.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;

let _filas = [];   // materiales (materiales_panel)
let _cats = [];    // categorías (categorias_panel)
let _acc = null;
let _rol = "lector";

export async function mountCatalogo() {
  const cont = $("catAcc");
  cont.innerHTML = `<div class="text-center text-stone-400 text-sm py-8">Cargando…</div>`;

  try {
    await recargar();
    pintarRol();

    _acc = montarAcordeon({
      contenedor: cont,
      columnas: [
        { th: "Nombre interno", sort: "nombre" }, { th: "Nombre público", sort: "publico" },
        { th: "Precios vigentes", align: "center", sort: "precios" }, { th: "Acciones", align: "right" },
      ],
      sorters: {
        nombre:  (r) => r.nombre_interno || "",
        publico: (r) => r.nombre_publico || "",
        precios: (r) => Number(r.precios_vigentes ?? 0),
      },
      grupos: gruposVisibles(),
      renderRow,
      onRender: cablearFilas,
      abrir: "primero",
      vacio: "Sin materiales en esta categoría.",
    });

    cablearControles();
  } catch (e) {
    cont.innerHTML = `<div class="text-center text-rose-600 text-sm py-8">No pude cargar el catálogo: ${esc(e.message)}</div>`;
  }
}

async function recargar() {
  const sb = getClient();
  const [mat, cat] = await Promise.all([
    sb.from("materiales_panel")
      .select("material_id, nombre_interno, nombre_publico, categoria, categoria_nombre, categoria_orden, unidad, activo, precios_vigentes, mi_rol")
      .order("nombre_interno"),
    sb.from("categorias_panel").select("id, nombre, orden, activa, materiales").order("orden"),
  ]);
  if (mat.error) throw new Error(mat.error.message);
  if (cat.error) throw new Error(cat.error.message);
  _filas = mat.data || [];
  _cats = cat.data || [];
  _rol = _filas[0]?.mi_rol || _cats[0]?.mi_rol || rolActual();
}

function visibles() {
  const verInactivos = $("catVerInactivos")?.checked;
  const q = $("catBuscar")?.value || "";
  const base = verInactivos ? _filas : _filas.filter((r) => r.activo);
  return filtroGlobal(base, q, ["material_id", "nombre_interno", "nombre_publico", "categoria_nombre"]);
}

// Agrupa por categoría respetando categoria_orden; oculta las categorías que quedan vacías
// tras el filtro para no mostrar acordeones vacíos.
function gruposVisibles() {
  return agruparPorCategoria(visibles()).filter((g) => g.filas.length);
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
  document.querySelectorAll("#catAcc .catEdit").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const id = b.closest("tr").dataset.id;
      abrirFormulario(_filas.find((r) => r.material_id === id));
    });
  });
  document.querySelectorAll("#catAcc .catToggle").forEach((b) => {
    if (b.disabled) return;
    b.addEventListener("click", () => {
      const id = b.closest("tr").dataset.id;
      confirmarToggle(_filas.find((x) => x.material_id === id));
    });
  });
}

function refrescar() {
  _acc.setGrupos(gruposVisibles());
  $("catInfo").textContent = `${visibles().length} material(es) en ${gruposVisibles().length} categoría(s).`;
}

function cablearControles() {
  $("catBuscar")?.addEventListener("input", refrescar);
  $("catVerInactivos")?.addEventListener("change", refrescar);
  $("catExpandir")?.addEventListener("click", () => {
    // Alterna: si hay algo abierto, pliega todo; si no, expande todo.
    const algunAbierto = document.querySelector("#catAcc .rc-acc-grupo.abierto");
    if (algunAbierto) _acc.cerrarTodos(); else _acc.abrirTodos();
  });
  $("catExportar")?.addEventListener("click", exportar);
  $("catNuevo")?.addEventListener("click", () => {
    if (_rol !== "gerencia") return toastError("Solo gerencia puede crear materiales.");
    abrirFormulario(null);
  });
  const btnCat = $("catCategorias");
  if (btnCat && _rol === "gerencia") {
    btnCat.classList.remove("hidden");
    btnCat.addEventListener("click", abrirGestionCategorias);
  }
  const btnEmp = $("catEmpresas");
  if (btnEmp && _rol === "gerencia") {
    btnEmp.classList.remove("hidden");
    btnEmp.addEventListener("click", abrirGestionEmpresas);
  }
  refrescar();
}

function exportar() {
  const filas = visibles();
  if (!filas.length) return toastError("No hay materiales para exportar.");
  descargarCSV("catalogo_materiales", filas, [
    { clave: "material_id", titulo: "Código" },
    { clave: "nombre_interno", titulo: "Nombre interno" },
    { clave: "nombre_publico", titulo: "Nombre público" },
    { clave: "categoria_nombre", titulo: "Categoría" },
    { clave: "unidad", titulo: "Unidad" },
    { clave: "precios_vigentes", titulo: "Precios vigentes" },
    { clave: "activo", titulo: "Activo", map: (v) => (v ? "Sí" : "No") },
  ]);
  toast(`Exportados ${filas.length} material(es).`);
}

// ── Formulario de material (crear/editar) ─────────────────────────────────────
// El código solo es editable al crear: cambiarlo después rompería la relación con los
// precios ya cargados. La categoría se elige de la lista maestra.
function abrirFormulario(r) {
  const nuevo = !r;
  const campo = (id, etiqueta, valor, extra = "") => `
    <label style="display:block;margin-bottom:10px">
      <span style="font-size:12px;color:#57534e">${etiqueta}</span>
      <input id="${id}" value="${esc(valor || "")}" ${extra}
        style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px">
    </label>`;

  const opciones = _cats
    .filter((c) => c.activa || c.id === r?.categoria)
    .map((c) => `<option value="${esc(c.id)}" ${r?.categoria === c.id ? "selected" : ""}>${esc(c.nombre)}</option>`)
    .join("");

  abrirModal({
    titulo: nuevo ? "Nuevo material" : `Editar · ${r.nombre_interno}`,
    cuerpoHTML:
      campo("catId", "Código (sin espacios, ej. cobre_2da)", nuevo ? "" : r.material_id,
            nuevo ? "" : "disabled style=width:100%;padding:8px;border:1px solid #e7e5e4;border-radius:6px;margin-top:4px;background:#f5f5f4;color:#78716c") +
      campo("catNombre", "Nombre interno (como lo llama la operación)", r?.nombre_interno) +
      campo("catPublico", "Nombre público (como se ve en la web)", r?.nombre_publico) +
      `<label style="display:block;margin-bottom:10px">
        <span style="font-size:12px;color:#57534e">Categoría</span>
        <select id="catCategoria" style="width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:6px;margin-top:4px;background:#fff">
          ${opciones}
        </select>
      </label>` +
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
      p_categoria: $("catCategoria").value || null,
      p_unidad: ($("catUnidad").value || "kg").trim(),
    });
    if (error) throw new Error(error.message);
    cerrarModal();
    await recargar();
    refrescar();
    toast(nuevo ? "Material creado." : "Material actualizado.");
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
            refrescar();
            toast(desactivando ? "Material desactivado." : "Material reactivado.");
          } catch (e) {
            toastError(e.message);
          }
        } },
    ],
  });
}

// ── Gestión de categorías (solo gerencia) ─────────────────────────────────────
// Renombrar, reordenar (número), activar/desactivar y crear categorías nuevas. Cada fila
// guarda por separado vía f_categoria_guardar; al cerrar se recarga el catálogo.
function abrirGestionCategorias() {
  const filaCat = (c) => `
    <tr data-cat="${esc(c.id)}" style="border-top:1px solid #f1f0ef">
      <td style="padding:6px 4px"><input class="gcNombre" value="${esc(c.nombre)}" style="width:100%;padding:6px;border:1px solid #d6d3d1;border-radius:6px"></td>
      <td style="padding:6px 4px;width:64px"><input class="gcOrden" type="number" value="${c.orden}" style="width:100%;padding:6px;border:1px solid #d6d3d1;border-radius:6px;text-align:right"></td>
      <td style="padding:6px 4px;text-align:center;width:44px"><input class="gcActiva" type="checkbox" ${c.activa ? "checked" : ""}></td>
      <td style="padding:6px 4px;color:#a8a29e;font-size:12px;text-align:right;width:48px">${c.materiales ?? 0}</td>
      <td style="padding:6px 4px;text-align:right;white-space:nowrap;width:132px">
        <button type="button" class="gcGuardar" style="background:#047857;color:#fff;border:0;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer">Guardar</button>
        <button type="button" class="gcEliminar" style="background:#fff;border:1px solid #fca5a5;color:#b91c1c;border-radius:6px;padding:6px 9px;font-size:12px;font-weight:600;cursor:pointer;margin-left:4px">Eliminar</button>
      </td>
    </tr>`;

  abrirModal({
    titulo: "Categorías",
    cuerpoHTML: `
      <p style="font-size:13px;color:#78716c;margin-bottom:10px">Renombra, reordena (número menor = arriba) o desactiva. Las inactivas no salen al elegir la categoría de un material.</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <thead><tr style="color:#78716c;font-size:11px;text-transform:uppercase">
          <th style="text-align:left;padding:4px">Nombre</th><th style="padding:4px">Orden</th>
          <th style="padding:4px">Activa</th><th style="padding:4px">Mat.</th><th></th></tr></thead>
        <tbody id="gcBody">${_cats.map(filaCat).join("")}</tbody>
      </table>
      <div style="border-top:1px solid #e7e5e4;margin-top:12px;padding-top:12px">
        <span style="font-size:12px;color:#57534e;font-weight:600">Nueva categoría</span>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="gcNuevoNombre" placeholder="Nombre" style="flex:1;padding:7px;border:1px solid #d6d3d1;border-radius:6px">
          <input id="gcNuevoOrden" type="number" placeholder="Orden" style="width:80px;padding:7px;border:1px solid #d6d3d1;border-radius:6px;text-align:right">
          <button type="button" id="gcCrear" style="background:#047857;color:#fff;border:0;border-radius:6px;padding:7px 12px;font-weight:600;cursor:pointer">Crear</button>
        </div>
      </div>`,
    acciones: [{ texto: "Cerrar", primario: true }],
  });

  const guardarCat = async (id, nombre, orden, activa, btn) => {
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const { error } = await getClient().rpc("f_categoria_guardar", {
        p_id: id, p_nombre: nombre, p_orden: orden, p_activa: activa,
      });
      if (error) throw new Error(error.message);
      toast("Categoría guardada.");
      await recargar();
      refrescar();
    } catch (e) {
      toastError(/gerencia/i.test(e.message) ? "Solo gerencia administra categorías." : e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    }
  };

  document.querySelectorAll("#gcBody .gcGuardar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      guardarCat(
        tr.dataset.cat,
        tr.querySelector(".gcNombre").value.trim(),
        parseInt(tr.querySelector(".gcOrden").value, 10) || 99,
        tr.querySelector(".gcActiva").checked,
        btn,
      );
    });
  });
  document.querySelectorAll("#gcBody .gcEliminar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      confirmarEliminarCategoria(tr.dataset.cat, tr.querySelector(".gcNombre").value.trim());
    });
  });
  $("gcCrear")?.addEventListener("click", async () => {
    const nombre = $("gcNuevoNombre").value.trim();
    if (!nombre) return toastError("Escribe el nombre de la categoría.");
    await guardarCat(null, nombre, parseInt($("gcNuevoOrden").value, 10) || 99, true, $("gcCrear"));
    cerrarModal();
    abrirGestionCategorias();   // reabre con la lista fresca
  });
}

// Eliminar una categoría. La BD bloquea si tiene materiales (avisa con el conteo) y protege
// "Otros". Reabre el modal de categorías al terminar (el modal es único).
function confirmarEliminarCategoria(id, nombre) {
  abrirModal({
    titulo: "Eliminar categoría",
    cuerpoHTML: `<p>¿Eliminar la categoría <b>${esc(nombre || id)}</b>?</p>
      <p style="font-size:13px;color:#78716c;margin-top:8px">Solo se puede si no tiene materiales asociados. Si los tiene, reasígnalos a otra categoría primero.</p>`,
    acciones: [
      // Cancelar: reabre la lista en el siguiente tick (el cierre por defecto corre después del onClick).
      { texto: "Cancelar", onClick: () => setTimeout(abrirGestionCategorias, 0) },
      { texto: "Eliminar", primario: true, onClick: async () => {
          try {
            const { error } = await getClient().rpc("f_categoria_eliminar", { p_id: id });
            if (error) throw new Error(error.message);
            toast("Categoría eliminada.");
            await recargar();
            refrescar();
          } catch (e) {
            toastError(/gerencia/i.test(e.message) ? "Solo gerencia administra categorías." : e.message);
          } finally {
            cerrarModal();
            abrirGestionCategorias();   // reabre con la lista fresca
          }
        } },
    ],
  });
}

// ── Gestión de empresas / clientes (CRUD, solo gerencia) ──────────────────────
// Crear, renombrar, activar/desactivar y ELIMINAR las empresas/fundiciones a las que
// vendemos. Fuente: public.empresas_panel; escribe con f_empresa_guardar / f_empresa_eliminar.
// Se lee fresco cada vez que se abre (no vive en el estado del catálogo).
async function abrirGestionEmpresas() {
  // Fetch FRESCO cada vez que se abre el modal (preciosRepo.listarEmpresas): así la lista no
  // se queda pegada con datos viejos tras crear/editar/eliminar en otra sesión.
  let empresas = [];
  try {
    empresas = await listarEmpresas();
  } catch (e) {
    return toastError(/gerencia/i.test(e.message) ? "Solo gerencia administra empresas." : e.message);
  }

  const filaEmp = (e) => `
    <tr data-emp="${esc(e.empresa_id)}" style="border-top:1px solid #f1f0ef">
      <td style="padding:6px 4px"><input class="geNombre" value="${esc(e.nombre_publico)}" style="width:100%;padding:6px;border:1px solid #d6d3d1;border-radius:6px"></td>
      <td style="padding:6px 4px"><input class="geRazon" value="${esc(e.razon_social || "")}" placeholder="—" style="width:100%;padding:6px;border:1px solid #d6d3d1;border-radius:6px"></td>
      <td style="padding:6px 4px;text-align:center;width:44px"><input class="geActiva" type="checkbox" ${e.activa ? "checked" : ""}></td>
      <td style="padding:6px 4px;color:#a8a29e;font-size:12px;text-align:right;width:48px">${e.usos ?? 0}</td>
      <td style="padding:6px 4px;text-align:right;white-space:nowrap;width:150px">
        <button type="button" class="geGuardar" style="background:#047857;color:#fff;border:0;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600;cursor:pointer">Guardar</button>
        <button type="button" class="geEliminar" style="background:#fff;border:1px solid #fca5a5;color:#b91c1c;border-radius:6px;padding:6px 9px;font-size:12px;font-weight:600;cursor:pointer;margin-left:4px">Eliminar</button>
      </td>
    </tr>`;

  abrirModal({
    titulo: "Empresas / Clientes",
    cuerpoHTML: `
      <p style="font-size:13px;color:#78716c;margin-bottom:10px">Empresas/fundiciones a las que vendemos. "Usos" = precios que llevan ese nombre. Alimentan el selector de Carga Manual.</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <thead><tr style="color:#78716c;font-size:11px;text-transform:uppercase">
          <th style="text-align:left;padding:4px">Nombre</th><th style="text-align:left;padding:4px">Razón social</th>
          <th style="padding:4px">Activa</th><th style="padding:4px">Usos</th><th></th></tr></thead>
        <tbody id="geBody">${empresas.map(filaEmp).join("") || `<tr><td colspan="5" style="padding:10px;color:#a8a29e;text-align:center">Sin empresas aún.</td></tr>`}</tbody>
      </table>
      <div style="border-top:1px solid #e7e5e4;margin-top:12px;padding-top:12px">
        <span style="font-size:12px;color:#57534e;font-weight:600">Nueva empresa</span>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">
          <input id="geNuevoNombre" placeholder="Nombre" style="flex:1;min-width:120px;padding:7px;border:1px solid #d6d3d1;border-radius:6px">
          <input id="geNuevaRazon" placeholder="Razón social (opcional)" style="flex:1;min-width:120px;padding:7px;border:1px solid #d6d3d1;border-radius:6px">
          <button type="button" id="geCrear" style="background:#047857;color:#fff;border:0;border-radius:6px;padding:7px 12px;font-weight:600;cursor:pointer">Crear</button>
        </div>
      </div>`,
    acciones: [{ texto: "Cerrar", primario: true }],
  });

  const guardarEmp = async (id, nombre, razon, activa, btn) => {
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const { error } = await getClient().rpc("f_empresa_guardar", {
        p_id: id, p_nombre_publico: nombre, p_razon_social: razon || null, p_activa: activa,
      });
      if (error) throw new Error(error.message);
      toast("Empresa guardada.");
    } catch (e) {
      toastError(/gerencia/i.test(e.message) ? "Solo gerencia administra empresas." : e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    }
  };

  document.querySelectorAll("#geBody .geGuardar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const nombre = tr.querySelector(".geNombre").value.trim();
      if (!nombre) return toastError("El nombre no puede quedar vacío.");
      guardarEmp(tr.dataset.emp, nombre, tr.querySelector(".geRazon").value.trim(),
        tr.querySelector(".geActiva").checked, btn);
    });
  });
  document.querySelectorAll("#geBody .geEliminar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      confirmarEliminarEmpresa(tr.dataset.emp, tr.querySelector(".geNombre").value.trim());
    });
  });
  $("geCrear")?.addEventListener("click", async () => {
    const nombre = $("geNuevoNombre").value.trim();
    if (!nombre) return toastError("Escribe el nombre de la empresa.");
    await guardarEmp(null, nombre, $("geNuevaRazon").value.trim(), true, $("geCrear"));
    cerrarModal();
    abrirGestionEmpresas();   // reabre con la lista fresca
  });
}

// Confirmación de borrado. Reabre la lista al cancelar o al confirmar (el modal es único).
function confirmarEliminarEmpresa(id, nombre) {
  abrirModal({
    titulo: "Eliminar empresa",
    cuerpoHTML: `<p>¿Eliminar <b>${esc(nombre || id)}</b> del maestro de empresas?</p>
      <p style="font-size:13px;color:#78716c;margin-top:8px">Los precios que ya llevan este nombre NO se tocan (queda como texto en su historial). Solo se quita de la lista de selección.</p>`,
    acciones: [
      { texto: "Cancelar", onClick: () => abrirGestionEmpresas() },
      { texto: "Eliminar", primario: true, onClick: async () => {
          try {
            const { error } = await getClient().rpc("f_empresa_eliminar", { p_id: id });
            if (error) throw new Error(error.message);
            toast("Empresa eliminada.");
          } catch (e) {
            toastError(/gerencia/i.test(e.message) ? "Solo gerencia administra empresas." : e.message);
          } finally {
            cerrarModal();
            abrirGestionEmpresas();
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
  aviso.innerHTML = `Tu perfil es <b>${esc(_rol)}</b>: puedes consultar el catálogo, ` +
    `pero solo gerencia crea o modifica materiales y categorías.`;
  aviso.classList.remove("hidden");
}
