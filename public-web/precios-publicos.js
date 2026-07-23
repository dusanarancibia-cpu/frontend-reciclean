/* ============================================================================
 * PRECIOS PÚBLICOS · Snippet para las webs de cPanel (Farex / Reciclean)
 * ----------------------------------------------------------------------------
 * Cómo se usa (ejemplo al final del archivo):
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
 *           integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"
 *           crossorigin="anonymous"></script>
 *   <script src="/js/precios-publicos.js"></script>
 *   <div id="tabla-precios"></div>
 *   <script>ReciPrecios.montar("#tabla-precios", "FAREX");</script>
 *
 * QUÉ PRECIO ENTREGA: `precio` es el precio publicado, o sea lo que NOSOTROS LE PAGAMOS
 * A LA GENTE por su material. El precio que nos pagan las fundiciones es interno y no
 * sale por esta vía.
 *
 * SOBRE LA CLAVE: la anon key es pública por diseño y va a la vista en el HTML.
 * No es un secreto y no hay que ocultarla. Lo que la vuelve inofensiva es que con
 * ella SOLO se puede leer la vista public.precios_publicos:
 *   · el esquema precios_v3 (donde viven el precio recibido, el margen y el flete) no
 *     tiene USAGE para el rol anónimo → esas tablas son inalcanzables desde la API;
 *   · la vista pública proyecta columnas no sensibles;
 *   · pedir ?select=precio_recibido_clp devuelve HTTP 400.
 * Verificado contra la API REST real antes de publicar este archivo.
 * ========================================================================== */
(function (global) {
  "use strict";

  var SUPABASE_URL = "https://eknmtsrtfkzroxnovfqn.supabase.co";
  // Reemplazar por la anon key del proyecto (es pública; se puede versionar).
  var SUPABASE_ANON_KEY = "PEGAR_AQUI_LA_ANON_KEY";

  var _cliente = null;
  function cliente() {
    if (!_cliente) {
      if (!global.supabase || !global.supabase.createClient) {
        throw new Error("Falta cargar el script de supabase-js antes de este archivo.");
      }
      _cliente = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _cliente;
  }

  var clp = function (n) {
    return n == null ? "—" : "$" + Number(n).toLocaleString("es-CL");
  };

  /**
   * Trae los precios publicados de una empresa.
   * @param {string} empresa  "FAREX" o "Reciclean" (nombre_publico en la base)
   * @param {string} [sucursal] filtra por sucursal; omitir para traer todas
   */
  function obtener(empresa, sucursal) {
    var q = cliente()
      .from("precios_publicos")
      .select("material, sucursal, precio, actualizado")
      .eq("empresa", empresa)
      .order("material");
    if (sucursal) q = q.eq("sucursal", sucursal);

    return q.then(function (res) {
      if (res.error) {
        console.error("[precios] ", res.error.message);
        return [];
      }
      return res.data || [];
    });
  }

  /** Pinta una tabla simple y sin dependencias dentro del selector indicado. */
  function montar(selector, empresa, sucursal) {
    var cont = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!cont) return Promise.resolve([]);
    cont.innerHTML = '<p style="color:#78716c">Cargando precios…</p>';

    return obtener(empresa, sucursal).then(function (filas) {
      if (!filas.length) {
        cont.innerHTML = '<p style="color:#78716c">No hay precios publicados por ahora.</p>';
        return filas;
      }
      var html =
        '<table style="width:100%;border-collapse:collapse;font-family:inherit">' +
        '<thead><tr style="text-align:left;border-bottom:2px solid #e7e5e4">' +
        '<th style="padding:8px">Material</th>' +
        '<th style="padding:8px">Sucursal</th>' +
        '<th style="padding:8px;text-align:right">Precio por kg</th>' +
        "</tr></thead><tbody>";

      filas.forEach(function (f) {
        html +=
          '<tr style="border-bottom:1px solid #f5f5f4">' +
          '<td style="padding:8px">' + escapar(f.material) + "</td>" +
          '<td style="padding:8px;color:#57534e">' + escapar(f.sucursal) + "</td>" +
          '<td style="padding:8px;text-align:right;font-weight:700;color:#047857">' + clp(f.precio) + "</td>" +
          "</tr>";
      });

      cont.innerHTML = html + "</tbody></table>";
      return filas;
    });
  }

  // Los nombres vienen de la base; se escapan antes de inyectarlos como HTML.
  function escapar(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  global.ReciPrecios = { obtener: obtener, montar: montar, clp: clp };
})(window);
