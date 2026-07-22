// CONTROLADOR · Publicados. Precios oficiales VIGENTES (datos reales).
// Fuente: curated.vw_materiales_sucursal_precios_vigente (ids text, sin nombres).
// Hidratamos nombres con loadNombres() (materiales + sucursales) y mostramos Editar/Borrar.
import { getClient, loadNombres } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const fecha = (d) => (d ? String(d).slice(0, 10) : "—");
// helper único (cubre < > & " '): importante en los contextos de atributo data-mat/data-suc
const esc = escapeHTML;
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

export async function mountPublicados() {
  const body = $("publicadosBody");
  body.innerHTML = fila(5, "Cargando…");

  try {
    const sb = getClient();
    // Vista de vigentes + mapas de nombres, en paralelo.
    const [{ data, error }, nombres] = await Promise.all([
      sb.schema("curated").from("vw_materiales_sucursal_precios_vigente")
        .select("material_id, sucursal_id, precio_venta_clp, precio_compra_clp, vigencia_desde, vigencia_hasta")
        .order("vigencia_desde", { ascending: false })
        .limit(1000),
      loadNombres(),
    ]);
    if (error) throw error;
    if (!data || !data.length) { body.innerHTML = fila(5, "Sin precios vigentes."); return; }

    const renderRow = (r) => {
      const mat = esc(nombres.material(r.material_id));
      const suc = esc(nombres.sucursal(r.sucursal_id));
      const vig = "desde " + fecha(r.vigencia_desde) + (r.vigencia_hasta ? " · hasta " + fecha(r.vigencia_hasta) : "");
      // Editar → Calculadora para generar NUEVA propuesta a partir del precio actual
      const editHref = `/?material_id=${encodeURIComponent(r.material_id)}` +
        `&sucursal_id=${encodeURIComponent(r.sucursal_id)}#calculadora`;
      // "Borrar" está DESACTIVADO: no existe Edge Function para dar de baja un precio
      // vigente (precio-command solo hace rechazar/bulk sobre propuestas). Antes solo
      // atenuaba la fila y avisaba "pendiente de backend" — engañoso. Se deja deshabilitado
      // con tooltip claro hasta que exista la baja real en el servidor.
      return `<tr class="hover:bg-stone-50">
        <td class="px-4 py-2.5 font-medium text-stone-800">${mat}</td>
        <td class="px-4 py-2.5 text-stone-600">${suc}</td>
        <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_venta_clp)}</td>
        <td class="px-4 py-2.5 text-stone-500">${vig}</td>
        <td class="px-4 py-2.5 text-right whitespace-nowrap">
          <a href="${editHref}" class="pubEdit bg-stone-800 text-white px-3 py-1 rounded text-xs font-medium" style="text-decoration:none">Editar</a>
          <button class="pubDel bg-white border border-stone-200 text-stone-400 px-3 py-1 rounded text-xs font-medium ml-1"
            disabled title="La baja de precios oficiales aún no está disponible en el sistema" style="cursor:not-allowed">Borrar</button>
        </td>
      </tr>`;
    };

    montarTabla({
      tbody: body, thead: $("publicadosHead"), info: $("publicadosInfo"), pager: $("publicadosPager"),
      rows: data, renderRow, colspan: 5, pageSize: 25,
      vacio: "Sin precios vigentes.",
      sortInicial: { key: "vigencia_desde", dir: "desc" },
      sorters: {
        material: (r) => nombres.material(r.material_id),
        sucursal: (r) => nombres.sucursal(r.sucursal_id),
        precio_venta_clp: (r) => Number(r.precio_venta_clp),
        vigencia_desde: (r) => r.vigencia_desde || "",
      },
      infoText: (total, page, pages) => `${total} precio(s) vigente(s) · página ${page} de ${pages}.`,
    });
  } catch (e) {
    body.innerHTML = fila(5, "❌ No pude cargar los vigentes: " + esc(e.message));
  }
}
