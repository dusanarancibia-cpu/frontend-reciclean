// CONTROLADOR · Vitrina pública. Decide qué materiales muestra cada web (Farex / Reciclean).
//
// Modelo de negocio acordado: el precio es único por material+sucursal y la empresa NO lo
// cambia; la empresa solo define el catálogo que ve el cliente. Por eso esta pantalla trabaja
// a nivel de material (no de material × sucursal) y solo enciende o apaga la visibilidad.
//
// El catálogo se sembró completo en "no visible" a propósito: nada llega a la web pública
// hasta que gerencia lo active explícitamente.
import { getClient } from "../models/supabase.js";
import { publicarMaterial, rolDesdeToken } from "../models/preciosRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

let _materiales = [];   // una fila por material, con un flag por empresa
let _tabla = null;
let _rol = "lector";

export async function mountVitrina() {
  const body = $("vitBody");
  body.innerHTML = fila(4, "Cargando…");

  try {
    const { data, error } = await getClient()
      .from("vitrina_panel")
      .select("material_id, material, empresa_id, visible, precio_referencia, mi_rol")
      .order("material");
    if (error) throw new Error(error.message);

    _rol = data?.[0]?.mi_rol || (await rolDesdeToken()) || "lector";
    _materiales = agruparPorMaterial(data || []);

    pintarRol();
    if (!_materiales.length) { body.innerHTML = fila(4, "Sin materiales en el catálogo."); return; }

    _tabla = montarTabla({
      tbody: body, thead: $("vitHead"), info: $("vitInfo"), pager: $("vitPager"),
      rows: _materiales, renderRow, colspan: 4, pageSize: 25,
      sortInicial: { key: "material", dir: "asc" },
      sorters: {
        material: (r) => r.material || "",
        precio:   (r) => Number(r.precio_referencia ?? 0),
      },
      infoText: (total, page, pages) => `${total} material(es) · página ${page} de ${pages}.`,
      onRender: cablearChecks,
    });

    cablearBuscador();
    actualizarResumen();
  } catch (e) {
    body.innerHTML = fila(4, "❌ No pude cargar la vitrina: " + esc(e.message));
  }
}

// La vista entrega una fila por (material, empresa); la tabla necesita una por material.
function agruparPorMaterial(filas) {
  const mapa = new Map();
  filas.forEach((f) => {
    if (!mapa.has(f.material_id)) {
      mapa.set(f.material_id, {
        material_id: f.material_id,
        material: f.material,
        precio_referencia: f.precio_referencia,
        visible: {},
      });
    }
    mapa.get(f.material_id).visible[f.empresa_id] = !!f.visible;
  });
  return [...mapa.values()];
}

function renderRow(r) {
  const editable = _rol === "gerencia";
  const check = (empresaId) => {
    const on = !!r.visible[empresaId];
    return `<td class="px-4 py-2.5 text-center">
      <input type="checkbox" class="vitChk" style="width:18px;height:18px;cursor:${editable ? "pointer" : "not-allowed"}"
        data-mat="${esc(r.material_id)}" data-emp="${esc(empresaId)}"
        ${on ? "checked" : ""} ${editable ? "" : "disabled"}>
    </td>`;
  };
  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}</td>
    <td class="px-4 py-2.5 text-right text-emerald-700 font-semibold">${clp(r.precio_referencia)}</td>
    ${check("farex")}
    ${check("reciclean_spa")}
  </tr>`;
}

function cablearChecks() {
  if (_rol !== "gerencia") return;
  document.querySelectorAll("#vitBody .vitChk").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const materialId = chk.dataset.mat;
      const empresaId = chk.dataset.emp;
      const visible = chk.checked;
      chk.disabled = true;
      try {
        await publicarMaterial({ empresaId, materialId, visible });
        const f = _materiales.find((x) => x.material_id === materialId);
        if (f) f.visible[empresaId] = visible;
        actualizarResumen();
      } catch (e) {
        chk.checked = !visible;          // revierte: el servidor mandó, no la UI
        alert("No se pudo cambiar: " + e.message);
      } finally {
        chk.disabled = false;
      }
    });
  });
}

function pintarRol() {
  const chip = $("vitRolChip");
  if (chip) {
    chip.textContent = _rol === "gerencia" ? "gerencia · puedes publicar" : `${_rol} · solo lectura`;
    chip.className = "chip " + (_rol === "gerencia" ? "on" : "off");
  }
  const aviso = $("vitAviso");
  if (!aviso) return;
  if (_rol === "gerencia") { aviso.classList.add("hidden"); return; }
  aviso.innerHTML = `🔒 Tu perfil es <b>${esc(_rol)}</b>: puedes ver la vitrina, pero solo ` +
    `gerencia puede publicar o retirar materiales de las webs.`;
  aviso.classList.remove("hidden");
}

function cablearBuscador() {
  const buscar = $("vitBuscar");
  if (!buscar) return;
  buscar.addEventListener("input", () => {
    const q = buscar.value.trim().toLowerCase();
    _tabla.setRows(_materiales.filter((r) => !q || String(r.material).toLowerCase().includes(q)));
  });
}

function actualizarResumen() {
  const el = $("vitResumen");
  if (!el) return;
  const enFarex = _materiales.filter((r) => r.visible.farex).length;
  const enReci = _materiales.filter((r) => r.visible.reciclean_spa).length;
  el.textContent = `Publicados: ${enFarex} en FAREX · ${enReci} en Reciclean · de ${_materiales.length} materiales`;
}
