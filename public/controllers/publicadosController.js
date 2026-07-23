// CONTROLADOR · Publicados. Los precios oficiales vigentes: lo que ven las webs públicas
// y consultará el chatbot.
//
// Fuente única: public.precios_panel (modelo precios_v3), que ya trae los nombres resueltos
// y enmascara el precio recibido de la fundición cuando el rol no es gerencia.
// El precio que se muestra es `precio_publicado_clp`: lo que le pagamos a la gente.
import { listarPrecios } from "../models/preciosRepo.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML, filtroGlobal } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const esc = escapeHTML;
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const fecha = (d) => (d ? String(d).slice(0, 10) : "—");
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

let _filas = [];
let _tabla = null;

export async function mountPublicados() {
  const body = $("publicadosBody");
  body.innerHTML = fila(5, "Cargando…");

  try {
    _filas = await listarPrecios();
    if (!_filas.length) { body.innerHTML = fila(5, "Sin precios vigentes."); return; }

    _tabla = montarTabla({
      tbody: body, thead: $("publicadosHead"), info: $("publicadosInfo"), pager: $("publicadosPager"),
      rows: _filas, renderRow, colspan: 5, pageSize: 25,
      vacio: "Sin precios que coincidan.",
      sortInicial: { key: "material", dir: "asc" },
      sorters: {
        material: (r) => r.material || "",
        sucursal: (r) => r.sucursal || "",
        precio:   (r) => Number(r.precio_publicado_clp ?? 0),
        vigencia: (r) => r.vigencia_desde || "",
      },
      infoText: (total, page, pages) => `${total} precio(s) vigente(s) · página ${page} de ${pages}.`,
    });

    const b = $("publicadosBuscar");
    if (b) {
      b.addEventListener("input", () =>
        _tabla.setRows(filtroGlobal(_filas, b.value,
          ["material", "sucursal", "precio_publicado_clp", "creado_por"])));
    }
  } catch (e) {
    body.innerHTML = fila(5, "❌ No pude cargar los vigentes: " + esc(e.message));
  }
}

function renderRow(r) {
  // Los precios migrados del modelo antiguo tienen semántica dudosa: se marcan a la vista.
  const aviso = r.requiere_revision
    ? ` <span title="Migrado del sistema antiguo: verifica el valor antes de confiar en él">⚠️</span>` : "";
  return `<tr class="hover:bg-stone-50">
    <td class="px-4 py-2.5 font-medium text-stone-800">${esc(r.material)}${aviso}</td>
    <td class="px-4 py-2.5 text-stone-600">${esc(r.sucursal)}</td>
    <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_publicado_clp)}</td>
    <td class="px-4 py-2.5 text-stone-500">desde ${fecha(r.vigencia_desde)}</td>
    <td class="px-4 py-2.5 text-right whitespace-nowrap">
      <a href="#materiales" class="bg-stone-800 text-white px-3 py-1 rounded text-xs font-medium"
         style="text-decoration:none" title="Editar el precio en Materiales y Precios">Editar</a>
    </td>
  </tr>`;
}
