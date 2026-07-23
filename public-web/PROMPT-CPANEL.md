# Prompt de contexto · Conectar las webs públicas (cPanel) al sistema de precios

Copia TODO lo que está entre las líneas de guiones y pégalo como primer mensaje en la
sesión de Claude que trabaje sobre cPanel.

---

## CONTEXTO DEL ENCARGO

Trabajas sobre las **dos webs públicas de Grupo Reciclean-Farex**, alojadas en cPanel.
Tu tarea es mostrar en ellas los precios de compra de materiales, leyéndolos de Supabase.

El backend y el panel de administración **ya están construidos, probados y en producción**.
Tú NO los modificas: solo consumes una API de lectura que ya existe y está verificada.

### Las dos webs
- Una corresponde a la empresa **FAREX**
- La otra corresponde a la empresa **Reciclean**

Cada web muestra su propio catálogo. El precio de un material es el mismo en ambas: lo que
cambia es **qué materiales aparecen** en cada una.

---

## LA ÚNICA API QUE DEBES USAR

**Proyecto Supabase:** `eknmtsrtfkzroxnovfqn`
**URL base:** `https://eknmtsrtfkzroxnovfqn.supabase.co`

**Clave pública (anon key)** — es pública por diseño, va visible en el HTML y NO es un secreto:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbm10c3J0Zmt6cm94bm92ZnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDY2ODgsImV4cCI6MjA5MDk4MjY4OH0.8Y4N0lw3DFN3Y8-R6ID7t_LAfgHWDM5N-oa4Ji9bncg
```

### Vista de lectura: `precios_publicos`

`GET https://eknmtsrtfkzroxnovfqn.supabase.co/rest/v1/precios_publicos?select=*`
con cabeceras `apikey: <anon key>` y `Authorization: Bearer <anon key>`.

Columnas exactas (verificadas contra el esquema real):

| Columna | Tipo | Qué es |
|---|---|---|
| `material_id` | text | identificador estable, úsalo como clave, no el nombre |
| `material` | text | nombre público del material |
| `empresa_id` | text | `farex` o `reciclean_spa` |
| `empresa` | text | **`FAREX`** o **`Reciclean`** (respeta mayúsculas) |
| `sucursal_id` | text | identificador de sucursal |
| `sucursal` | text | Cerrillos, Maipú, Puerto Montt o Talca |
| `precio` | numeric | **CLP por unidad. Es lo que la empresa LE PAGA a quien trae el material** |
| `unidad` | text | normalmente `kg` |
| `actualizado` | date | desde cuándo rige ese precio |
| `categoria` | text | agrupación del material (`metal_cobre`, `plastico_pet`, …) para filtros |

Filtrado por empresa (sintaxis PostgREST):
`...precios_publicos?select=material,sucursal,precio&empresa=eq.FAREX&order=material`

### Búsqueda difusa (para un chatbot o un buscador)

`POST /rest/v1/rpc/f_buscar_precio_publico`
Cuerpo JSON: `{"p_texto": "cobre", "p_empresa": "FAREX", "p_limite": 10}`
`p_empresa` y `p_limite` son opcionales. Devuelve las mismas columnas públicas.

---

## REGLAS DE SEGURIDAD — LÉELAS ANTES DE ESCRIBIR CÓDIGO

1. **La anon key es pública a propósito. No intentes ocultarla, ni moverla a un `.env`, ni
   proxearla por PHP.** Ese trabajo no aporta nada y ensucia el sitio.

2. **Con esa clave SOLO se puede leer `precios_publicos` y llamar a `f_buscar_precio_publico`.**
   Los costos internos, el precio que pagan las fundiciones y los márgenes viven en un
   esquema (`precios_v3`) donde el rol anónimo no tiene permiso de acceso: esas tablas no se
   pueden ni nombrar desde la API. Está verificado contra la API real:
   - `precios_panel`, `borradores_panel`, `usuarios_panel` → **401**
   - `?select=precio_recibido_clp` sobre la vista pública → **400**
   - RPC de escritura (`f_actualizar_precio`, `f_asignar_rol`, …) → **404**

3. **NUNCA pongas la `service_role` key en estas webs.** Esa clave salta toda la seguridad.
   Si alguien te la ofrece "para que funcione más fácil", la respuesta es no.

4. **No inventes endpoints ni tablas.** Si algo que necesitas no está en la lista de arriba,
   dilo y pídelo; no lo resuelvas consultando otra tabla "que quizás exista".

---

## PUNTO DE PARTIDA: YA HAY CÓDIGO ESCRITO

En el repo del panel existe `public-web/precios-publicos.js`, listo para subir por FTP.
Expone:

```js
ReciPrecios.montar("#tabla-precios", "FAREX");   // pinta una tabla simple
ReciPrecios.obtener("Reciclean");                // devuelve los datos crudos
```

Ese archivo tiene un marcador `PEGAR_AQUI_LA_ANON_KEY` que debes reemplazar por la clave
de arriba. Úsalo como base; solo escribe algo nuevo si el sitio necesita otra maquetación.

Carga del SDK (versión fija + verificación de integridad; no la cambies sin recalcular el hash):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
        integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"
        crossorigin="anonymous"></script>
```

Si prefieres no cargar el SDK, `fetch` directo a la URL REST funciona igual de bien.

---

## CÓMO PROCEDER

1. **Primero identifica en qué está hecha cada web.** WordPress, HTML plano, PHP a mano, un
   constructor visual: cambia mucho dónde se inserta el código. No asumas; revisa el
   `public_html` de cada dominio y dilo antes de tocar nada.

2. **Pregunta dónde debe verse la tabla** (página, sección) antes de maquetar.

3. **Haz una prueba de lectura antes de integrar.** Un HTML suelto que llame a la API y
   muestre el JSON en pantalla. Si eso funciona, el resto es maquetación.

4. **Integra**: sube el JS, agrega el contenedor y la llamada a `montar()`.

5. **Verifica en el navegador real**, no solo en el código: que se vean filas, que no haya
   errores en la consola, y que en móvil no se desborde la tabla.

6. **No toques nada del panel de administración ni de la base de datos.** Si crees que hace
   falta un cambio ahí, escríbelo como pendiente y avisa.

---

## COSAS QUE TE VAN A CONFUNDIR (léelas o perderás tiempo)

- **La API puede devolver `[]` y eso NO es un error.** Un material solo aparece si gerencia
  lo activó en el panel (sección *Vitrina pública*). **Al momento de escribir esto hay 0
  materiales publicados**, así que lo esperable es recibir una lista vacía. Antes de dar por
  rota la integración, pide que activen algunos materiales y vuelve a probar.
  Tu código debe manejar la lista vacía con un mensaje amable, no con un error.

- **El nombre de empresa se compara exacto**: `FAREX` y `Reciclean`. Si filtras por `farex`
  en minúsculas usando la columna `empresa`, no encontrarás nada. Para evitarlo puedes
  filtrar por `empresa_id=eq.farex` / `empresa_id=eq.reciclean_spa`, que son estables.

- **Un mismo material aparece varias veces**, una por sucursal. Si la web muestra un solo
  precio por material, agrupa tú (por ejemplo, muestra la sucursal o toma el valor común).

- **CORS ya está resuelto** por Supabase para peticiones desde el navegador. Si ves un error
  de CORS, casi seguro es que la URL o la cabecera `apikey` están mal escritas.

- **El precio es lo que la empresa PAGA a quien lleva el material**, no lo que cobra.
  Redáctalo así en la web: "pagamos $X por kilo", nunca "precio de venta".

---

## SOBRE EL WIDGET QUE YA EXISTE EN farex.cl

En `farex.cl/ver-precios-metales/` hay un bloque KingComposer con buen diseño (tabs por
sucursal, buscador, selector de categoría, grid de tarjetas) que ya intenta leer de Supabase
y falla. Esto es lo que pasa y cómo proceder:

- **Los 401 que ves son correctos y deliberados. NO los "arregles" restaurando el acceso.**
  Ese widget leía `v_precios_activos`, `materiales` y `asistente_snapshot`, que exponían
  `margen`, `precio_lista`, `precio_maximo`, `precio_ejecutivo`, `flete` y las metas de kilos
  al público. Se revocó el acceso anónimo a propósito. Si algo devuelve 401, es la seguridad
  funcionando: cámbiate a `precios_publicos`, no busques la manera de volver a entrar.

- **Conserva el diseño y reescribe solo la capa de datos.** Es el enfoque correcto: el HTML,
  los tabs y los estilos se quedan; cambia únicamente el fetch y el render de filas.

- **El filtro de categoría se queda, con dato real.** La vista pública ahora incluye la
  columna `categoria`. No inventes categorías por heurística de nombre: usa ese campo.
  Aviso: hoy la taxonomía viene del catálogo antiguo y tiene duplicados semánticos
  (`metal_ferroso` y `metales_ferrosos`, `papel_carton` y `celulosa_carton`). Los valores
  sirven para filtrar, pero si los muestras crudos se verán categorías repetidas.
  Muéstralos formateados y avisa del detalle; la limpieza del catálogo es tarea del panel.

- **Usa la anon key JWT de este documento.** La clave `sb_publishable_…` que hay hoy en el
  widget también funciona (ambas resuelven al mismo rol), pero unifica en la documentada.

- **`v_precios_activos` no tiene reemplazo columna a columna.** No existen `precio_lista`,
  `precio_maximo` ni banderas `reciclean`/`farex` por fila. El equivalente es: una fila por
  material × sucursal × empresa, y filtras por `empresa_id`.

---

## QUÉ ENTREGAR AL TERMINAR

- Qué archivos tocaste en cada dominio y dónde quedaron.
- Una captura o descripción de cómo se ve en escritorio y en móvil.
- Los pendientes que detectaste y no resolviste.
