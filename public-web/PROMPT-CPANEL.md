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
| `categoria` | text | slug crudo del catálogo (`metal_cobre`, …). Para depurar, no para mostrar |
| `grupo` | text | **etiqueta legible para el filtro** (`Aluminios`, `Plásticos · PET`, …) |
| `grupo_orden` | int | orden en que deben mostrarse los grupos; ordena por este campo |

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

## LA LÓGICA DEL SISTEMA QUE LAS WEBS DEBEN RESPETAR

Las webs no son un catálogo suelto: son la vitrina de un sistema que ya decide qué se
publica y cómo se agrupa. Estas reglas no son de estilo, son del modelo de datos.

1. **El precio es lo que la empresa PAGA a quien trae el material.** Redáctalo como
   "te pagamos $X por kilo". Nunca "precio de venta", "precio lista" ni "precio de
   mercado": esos son los números internos y no salen por esta vía.

2. **Publicar es una decisión de gerencia, tomada en el panel.** Un material aparece solo
   si está activado en la *Vitrina pública*, y se activa **por empresa**. Que FAREX muestre
   un material no implica que Reciclean lo muestre. La web nunca decide qué mostrar: pinta
   lo que la vista le entrega.

3. **Una fila por material × sucursal.** Agrupa por sucursal (pestañas). No colapses las
   sucursales en un solo precio "promedio": son precios distintos y reales.

4. **Las categorías se agrupan en la base, no en el JavaScript.** El catálogo heredado trae
   25 slugs con duplicados (`metal_ferroso` y `metales_ferrosos`, `papel` y `papel_carton`).
   Eso ya está resuelto en la tabla `precios_v3.categoria_publica`, que se proyecta como
   `grupo` y `grupo_orden`. **Usa `grupo`; no inventes categorías ni las deduzcas del
   nombre del material.** Si una agrupación se ve mal, se corrige en la base y las dos webs
   cambian solas: no toques el JS para eso, avísalo.

5. **`actualizado` es la fecha desde la que rige el precio.** Muéstrala; da confianza y
   evita que pregunten "¿esto está vigente?".

6. **Lista vacía no es un error.** Significa que aún no hay nada publicado. Muestra un
   mensaje amable con invitación a contactar, nunca un error técnico.

---

## PUNTO DE PARTIDA: YA HAY CÓDIGO ESCRITO

En el repo del panel existe `public-web/precios-publicos.js`: el widget completo, que ya
implementa las 6 reglas de arriba (pestañas por sucursal, buscador sin tildes, filtro por
`grupo`, tarjetas, estados vacíos y de error). Súbelo por FTP y úsalo como base.

```js
// Uso mínimo: pinta el widget entero dentro del contenedor.
ReciPrecios.montar("#precios", { empresa: "farex" });          // o "reciclean_spa"
ReciPrecios.montar("#precios", { empresa: "farex", sucursal: "maipu" }); // fija sucursal

ReciPrecios.obtener({ empresa: "farex" });        // datos crudos, por si maquetas tú
ReciPrecios.buscar("cobre", "FAREX");             // búsqueda difusa (chatbot)
```

**No requiere supabase-js.** Usa `fetch` contra la API REST: un archivo menos que cargar en
WordPress y una dependencia menos que se puede romper. Si ya cargaste el SDK para otra cosa,
no estorba, pero no lo agregues solo por esto.

Reemplaza el marcador `PEGAR_AQUI_LA_ANON_KEY` por la clave de más arriba.

Los estilos van con prefijo `.reci-` y heredan la tipografía del sitio, así que se integran
con el tema. Si el diseño existente ya tiene su propia maqueta (como en farex.cl), puedes
quedarte con esa maqueta y usar solo `ReciPrecios.obtener()` para los datos — pero respeta
las 6 reglas igual.

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

- **Un mismo material aparece varias veces**, una por sucursal. Sepáralos por pestañas (el
  widget ya lo hace). No los promedies ni te quedes con uno solo: son precios reales
  distintos y publicar el que no corresponde a esa sucursal es un error de negocio.

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

- **El filtro de categoría se queda, con dato real y ya limpio.** Usa la columna `grupo`
  (etiqueta legible) ordenando por `grupo_orden`. Los duplicados del catálogo heredado ya
  están fusionados en la base; no los resuelvas en el JS ni deduzcas categorías por el
  nombre del material. Si ves una agrupación rara, repórtala: se arregla en la base.

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
