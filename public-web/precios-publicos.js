/* ============================================================================
 * PRECIOS PÚBLICOS · Widget para las webs de cPanel (FAREX / Reciclean)
 * ----------------------------------------------------------------------------
 * Implementación de referencia del modelo de precios v3. Las dos webs deben usar
 * ESTE archivo, no una copia adaptada: así una corrección se hace una vez.
 *
 * USO MÍNIMO
 *   <div id="precios"></div>
 *   <script src="/js/precios-publicos.js"></script>
 *   <script>ReciPrecios.montar("#precios", { empresa: "farex" });</script>
 *
 * NO NECESITA supabase-js. Usa fetch contra la API REST: un archivo menos que cargar
 * en WordPress y una dependencia menos que se puede romper.
 *
 * ---------------------------------------------------------------------------
 * LAS REGLAS DEL MODELO NUEVO (respetarlas al maquetar)
 *
 * 1. `precio` es lo que NOSOTROS LE PAGAMOS a quien trae el material. Redáctalo como
 *    "te pagamos $X por kilo". Nunca "precio de venta" ni "precio lista": ese es el
 *    precio interno que pagan las fundiciones y no sale por esta vía.
 * 2. Un material aparece SOLO si gerencia lo activó en la Vitrina del panel, y por
 *    empresa. Que FAREX muestre algo no implica que Reciclean lo muestre.
 * 3. Hay una fila por material × sucursal. El widget agrupa por sucursal en pestañas.
 * 4. La agrupación de categorías vive en la base (`precios_v3.categoria_publica`),
 *    no acá. Usa el campo `grupo`; no inventes categorías por el nombre del material.
 * 5. Lista vacía NO es un error: significa que aún no hay nada publicado.
 *
 * SOBRE LA CLAVE: la anon key es pública por diseño y va a la vista en el HTML. No es
 * un secreto y no hay que ocultarla. Lo que la vuelve inofensiva es que con ella solo
 * se llega a `public.precios_publicos` y a `f_buscar_precio_publico`; el esquema
 * `precios_v3` (precio recibido, margen, flete) no tiene USAGE para el rol anónimo.
 * Verificado contra la API real: cualquier otro objeto responde 401.
 * ========================================================================== */
(function (global, doc) {
  "use strict";

  var URL_BASE = "https://eknmtsrtfkzroxnovfqn.supabase.co/rest/v1/";
  // Reemplazar por la anon key del proyecto (es pública; se puede versionar).
  var ANON_KEY = "PEGAR_AQUI_LA_ANON_KEY";

  var COLUMNAS = "material_id,material,grupo,grupo_orden,empresa_id,empresa," +
                 "sucursal_id,sucursal,precio,unidad,actualizado";

  function cabeceras() {
    return { apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY };
  }

  function pedir(ruta) {
    return fetch(URL_BASE + ruta, { headers: cabeceras() }).then(function (r) {
      if (!r.ok) {
        // 401 acá casi siempre significa que se pidió un objeto que no es público.
        return r.text().then(function (t) {
          throw new Error("API " + r.status + ": " + t.slice(0, 200));
        });
      }
      return r.json();
    });
  }

  /* ---------------------------------------------------------------- datos --- */

  /**
   * Trae los precios publicados.
   * @param {object} opc
   *   opc.empresa   {string} "farex" | "reciclean_spa"  (empresa_id, estable)
   *   opc.sucursal  {string} sucursal_id, opcional
   *   opc.grupo     {string} etiqueta de grupo, opcional
   */
  function obtener(opc) {
    opc = opc || {};
    var q = "precios_publicos?select=" + COLUMNAS + "&order=grupo_orden.asc,material.asc";
    if (opc.empresa)  q += "&empresa_id=eq." + encodeURIComponent(opc.empresa);
    if (opc.sucursal) q += "&sucursal_id=eq." + encodeURIComponent(opc.sucursal);
    if (opc.grupo)    q += "&grupo=eq." + encodeURIComponent(opc.grupo);
    return pedir(q);
  }

  /**
   * Búsqueda difusa por texto (tolera errores de tipeo). Pensada para el chatbot
   * o un buscador global; el widget filtra en memoria, que es instantáneo.
   */
  function buscar(texto, empresa, limite) {
    return fetch(URL_BASE + "rpc/f_buscar_precio_publico", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, cabeceras()),
      body: JSON.stringify({
        p_texto: texto || "",
        p_empresa: empresa || null,
        p_limite: limite || 20
      })
    }).then(function (r) { return r.ok ? r.json() : []; });
  }

  /* ------------------------------------------------------------- utilidades - */

  function clp(n) {
    return n == null ? "—" : "$" + Number(n).toLocaleString("es-CL");
  }

  // Los nombres vienen de la base; se escapan antes de inyectarlos como HTML.
  function esc(s) {
    var d = doc.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  // Compara sin tildes ni mayúsculas, para que "aluminio" encuentre "Aluminio Perfil A".
  // El rango va escrito con escapes \u para que el archivo sea ASCII puro: los editores
  // de cPanel a veces guardan en otra codificación y corromperían los signos crudos.
  var DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
  function normalizar(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICOS, "");
  }

  function fecha(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : "";
  }

  // Lista única preservando el orden en que vienen las filas.
  function unicos(filas, campo) {
    var vistos = {}, out = [];
    filas.forEach(function (f) {
      if (f[campo] != null && !vistos[f[campo]]) { vistos[f[campo]] = 1; out.push(f[campo]); }
    });
    return out;
  }

  /* ----------------------------------------------------------------- estilo - */
  // Se inyecta una sola vez y usa el prefijo .reci- para no chocar con el tema del
  // sitio. Todo hereda font-family, así que se ve como el resto de la página.
  var ESTILO = [
    ".reci{font-family:inherit;color:inherit}",
    ".reci-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}",
    ".reci-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}",
    ".reci-tab{padding:7px 14px;border:1px solid #d6d3d1;border-radius:999px;background:#fff;",
      "cursor:pointer;font-size:14px;line-height:1;color:#44403c}",
    ".reci-tab[aria-selected=true]{background:#047857;border-color:#047857;color:#fff;font-weight:600}",
    ".reci-input,.reci-select{padding:8px 12px;border:1px solid #d6d3d1;border-radius:8px;",
      "font-size:14px;font-family:inherit;background:#fff;color:#292524}",
    ".reci-input{flex:1;min-width:180px}",
    ".reci-grupo{margin:18px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;",
      "letter-spacing:.06em;color:#78716c}",
    ".reci-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}",
    ".reci-card{border:1px solid #e7e5e4;border-radius:10px;padding:12px 14px;background:#fff}",
    ".reci-mat{font-weight:600;margin-bottom:6px;line-height:1.3}",
    ".reci-precio{font-size:20px;font-weight:800;color:#047857;line-height:1.1}",
    ".reci-unidad{font-size:12px;font-weight:600;color:#78716c;margin-left:2px}",
    ".reci-fecha{font-size:11px;color:#a8a29e;margin-top:6px}",
    ".reci-aviso{padding:22px;text-align:center;color:#78716c;border:1px dashed #d6d3d1;border-radius:10px}",
    ".reci-pie{margin-top:16px;font-size:12px;color:#a8a29e}",
    "@media(max-width:480px){.reci-grid{grid-template-columns:1fr}}"
  ].join("");

  function asegurarEstilo() {
    if (doc.getElementById("reci-estilo")) return;
    var s = doc.createElement("style");
    s.id = "reci-estilo";
    s.textContent = ESTILO;
    doc.head.appendChild(s);
  }

  /* ----------------------------------------------------------------- widget - */

  /**
   * Pinta el widget completo: pestañas por sucursal, buscador, filtro por grupo y
   * tarjetas de precio.
   * @param {string|Element} selector
   * @param {object} opc  opc.empresa (obligatorio), opc.sucursal (fija una y oculta tabs)
   */
  function montar(selector, opc) {
    opc = opc || {};
    var cont = typeof selector === "string" ? doc.querySelector(selector) : selector;
    if (!cont) return Promise.resolve([]);

    asegurarEstilo();
    cont.className = (cont.className ? cont.className + " " : "") + "reci";
    cont.innerHTML = '<div class="reci-aviso">Cargando precios…</div>';

    return obtener(opc).then(function (filas) {
      if (!filas.length) {
        // Sin datos no es un fallo: gerencia todavía no publica nada para esta empresa.
        cont.innerHTML = '<div class="reci-aviso">Aún no hay precios publicados. ' +
                         "Escríbenos y te cotizamos tu material.</div>";
        return filas;
      }

      var sucursales = unicos(filas, "sucursal");
      var grupos = unicos(filas, "grupo");
      var estado = { sucursal: sucursales[0], grupo: "", texto: "" };

      cont.innerHTML =
        (sucursales.length > 1
          ? '<div class="reci-tabs" role="tablist">' + sucursales.map(function (s, i) {
              return '<button class="reci-tab" role="tab" data-suc="' + esc(s) + '" ' +
                     'aria-selected="' + (i === 0) + '">' + esc(s) + "</button>";
            }).join("") + "</div>"
          : "") +
        '<div class="reci-barra">' +
          '<input class="reci-input" type="search" placeholder="Buscar material…" ' +
                 'aria-label="Buscar material">' +
          (grupos.length > 1
            ? '<select class="reci-select" aria-label="Filtrar por categoría">' +
              '<option value="">Todas las categorías</option>' +
              grupos.map(function (g) {
                return '<option value="' + esc(g) + '">' + esc(g) + "</option>";
              }).join("") + "</select>"
            : "") +
        "</div>" +
        '<div class="reci-lista"></div>' +
        '<p class="reci-pie">Los valores son referenciales por kilo y pueden variar según ' +
        "el estado y la cantidad del material.</p>";

      var $lista = cont.querySelector(".reci-lista");
      var $input = cont.querySelector(".reci-input");
      var $select = cont.querySelector(".reci-select");

      function pintar() {
        var t = normalizar(estado.texto);
        var vis = filas.filter(function (f) {
          if (sucursales.length > 1 && f.sucursal !== estado.sucursal) return false;
          if (estado.grupo && f.grupo !== estado.grupo) return false;
          return !t || normalizar(f.material).indexOf(t) !== -1 ||
                      normalizar(f.grupo).indexOf(t) !== -1;
        });

        if (!vis.length) {
          $lista.innerHTML = '<div class="reci-aviso">No encontramos materiales con ese ' +
                             "criterio. Prueba con otra palabra.</div>";
          return;
        }

        // Las filas ya vienen ordenadas por grupo_orden desde la base; solo hay que
        // cortar el encabezado cuando cambia el grupo.
        var html = "", grupoActual = null;
        vis.forEach(function (f) {
          if (f.grupo !== grupoActual) {
            if (grupoActual !== null) html += "</div>";
            html += '<div class="reci-grupo">' + esc(f.grupo) + '</div><div class="reci-grid">';
            grupoActual = f.grupo;
          }
          html +=
            '<div class="reci-card">' +
              '<div class="reci-mat">' + esc(f.material) + "</div>" +
              '<div class="reci-precio">' + clp(f.precio) +
                '<span class="reci-unidad">/' + esc(f.unidad || "kg") + "</span></div>" +
              (f.actualizado ? '<div class="reci-fecha">Vigente desde ' + fecha(f.actualizado) + "</div>" : "") +
            "</div>";
        });
        $lista.innerHTML = html + (grupoActual !== null ? "</div>" : "");
      }

      cont.querySelectorAll(".reci-tab").forEach(function (b) {
        b.addEventListener("click", function () {
          estado.sucursal = b.getAttribute("data-suc");
          cont.querySelectorAll(".reci-tab").forEach(function (o) {
            o.setAttribute("aria-selected", String(o === b));
          });
          pintar();
        });
      });
      if ($input)  $input.addEventListener("input",  function () { estado.texto = $input.value; pintar(); });
      if ($select) $select.addEventListener("change", function () { estado.grupo = $select.value; pintar(); });

      pintar();
      return filas;
    }).catch(function (e) {
      console.error("[ReciPrecios]", e);
      cont.innerHTML = '<div class="reci-aviso">No pudimos cargar los precios en este ' +
                       "momento. Vuelve a intentarlo en unos minutos.</div>";
      return [];
    });
  }

  global.ReciPrecios = {
    montar: montar,
    obtener: obtener,
    buscar: buscar,
    clp: clp
  };
})(window, document);
