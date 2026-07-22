// CONTROLADOR · Recibidos. Historial crudo de propuestas (datos reales, solo lectura).
// Fuente: staging.precios_propuestos · orden created_at DESC (trazabilidad).
// Nombres de material/sucursal vía loadNombres() (join id text → nombre).
import { getClient, loadNombres } from "../models/supabase.js";
import { montarTabla } from "../js/listaTabla.js";
import { escapeHTML, horaChile } from "../js/util.js";

const $ = (id) => document.getElementById(id);
const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));
const esc = escapeHTML; // helper único (cubre < > & " ')
const fila = (cols, txt) => `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-stone-400">${txt}</td></tr>`;

// Fecha/hora exacta en horario de Chile continental → "22 Jul 2026, 14:30" (helper compartido).
const fechaExacta = horaChile;

// Píldora amigable para el proposalId → #1045
const badgeId = (id) =>
  `<span style="background:#eef2ff;color:#4338ca;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700">#${id}</span>`;

export async function mountRecibidos() {
  const body = $("recibidosBody");
  body.innerHTML = fila(6, "Cargando…");

  try {
    const sb = getClient();
    const [{ data, error }, nombres] = await Promise.all([
      sb.schema("staging").from("precios_propuestos")
        .select("id, material_id, sucursal_id, precio_clp_kg, created_at, ruta, estado")
        .order("created_at", { ascending: false })
        .limit(200),
      loadNombres(),
    ]);
    if (error) throw error;
    if (!data || !data.length) { body.innerHTML = fila(6, "Sin registros aún."); return; }

    const renderRow = (r) => {
      const suc = r.sucursal_id
        ? esc(nombres.sucursal(r.sucursal_id))
        : `<span class="text-stone-400">(sin sucursal)</span>`;
      // Botón "Calcular" → Calculadora con el proposalId (ruteo app_modular por ?vista=)
      const calcHref = `/?vista=calculadora&proposalId=${encodeURIComponent(r.id)}`;
      return `<tr class="hover:bg-stone-50">
        <td class="px-4 py-2.5">${badgeId(r.id)}</td>
        <td class="px-4 py-2.5 font-medium text-stone-800">${esc(nombres.material(r.material_id))}</td>
        <td class="px-4 py-2.5 text-stone-600">${suc}</td>
        <td class="px-4 py-2.5 text-stone-500 whitespace-nowrap">${fechaExacta(r.created_at)}</td>
        <td class="px-4 py-2.5 text-right font-semibold text-emerald-700">${clp(r.precio_clp_kg)}</td>
        <td class="px-4 py-2.5 text-right">
          <a href="${calcHref}" class="bg-emerald-700 text-white px-3 py-1 rounded text-xs font-medium" style="text-decoration:none">🧮 Calcular</a>
        </td>
      </tr>`;
    };

    montarTabla({
      tbody: body, thead: $("recibidosHead"), info: $("recibidosInfo"), pager: $("recibidosPager"),
      rows: data, renderRow, colspan: 6, pageSize: 25,
      vacio: "Sin registros aún.",
      sortInicial: { key: "created_at", dir: "desc" },
      sorters: {
        id: (r) => Number(r.id),
        material: (r) => nombres.material(r.material_id),
        sucursal: (r) => r.sucursal_id ? nombres.sucursal(r.sucursal_id) : "",
        created_at: (r) => r.created_at || "",
        precio_clp_kg: (r) => Number(r.precio_clp_kg),
      },
      infoText: (total, page, pages) => `${total} registro(s) · página ${page} de ${pages} · más recientes primero (máx 200).`,
    });
  } catch (e) {
    body.innerHTML = fila(6, "❌ No pude cargar los recibidos: " + esc(e.message));
  }
}
