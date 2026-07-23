# Prompt de contexto · Conectar las webs públicas (cPanel) al sistema de precios

Copia TODO lo que está entre las líneas de guiones y pégalo como primer mensaje en la
sesión de Claude que trabaje sobre cPanel. **Sirve igual para las dos cuentas**: el prompt
detecta en cuál estás.

---

## CONTEXTO DEL ENCARGO

Trabajas sobre las webs públicas de **Grupo Reciclean-Farex**, alojadas en cPanel.
Tu tarea: mostrar en ellas los precios de compra de materiales, leyéndolos de Supabase.

El backend y el panel de administración **ya están construidos, probados y en producción**.
Tú NO los modificas: consumes una API de lectura que ya existe y está verificada.

### Son dos sitios en DOS CUENTAS DE cPANEL DISTINTAS

| Sitio | Empresa | `empresa_id` | Dónde vive |
|---|---|---|---|
| `farex.cl` | FAREX | `farex` | una cuenta de cPanel |
| `reciclean.cl` | Reciclean | `reciclean_spa` | **otra** cuenta de cPanel |

**Tu sesión ve un solo dominio.** Mira qué hay en el `public_html` y trabaja ese. No busques
el otro ni pidas acceso: hay una sesión paralela ocupándose de él. Al terminar, informa cuál
te tocó.

Cada web muestra su propio catálogo. El precio de un material es el mismo en ambas; lo que
cambia es **qué materiales aparecen** en cada una.

---

## RECONOCIMIENTO YA HECHO · LO QUE VAS A ENCONTRAR

Ambos sitios son **WordPress** y **ambos ya tienen la sección de precios maquetada** por un
desarrollo anterior. **No hay que diseñar nada nuevo ni decidir dónde va: ya existe.**

**farex.cl** — tema `business-consultr`, editor KingComposer.
Página `/ver-precios-metales/` con encabezado, pestañas por sucursal (Cerrillos, Maipú),
buscador, selector de categoría y grid de tarjetas.

**reciclean.cl** — tema Betheme.
Sección "Lista de Precios" (ancla `#listadeprecios`) con pestañas por sucursal (Cerrillos,
Maipú, Talca, Puerto Montt), buscador, filtro de categoría y tarjetas de producto.
Se inyecta con el plugin **WPCode**, fragmento **ID 185 "Widget Precios Reciclean"**, activo,
ejecutándose en el pie del sitio. **No es un archivo por FTP: es un snippet en la base de
WordPress**, y editarlo es tocar producción.

**Los dos widgets están rotos hoy, de la misma forma**, y muestran "No hay precios
publicados". Ambos:
- usan una clave `sb_publishable_…` en vez de la anon key documentada abajo;
- leen `asistente_snapshot` como fuente principal;
- caen a `v_precios_activos` y `materiales` como respaldo, que devuelven **401**;
- esperan campos que no existen en la API real (`categoria`, `precio_lista`, banderas
  `farex`/`reciclean` por fila).

---

## RESPUESTAS A LAS PREGUNTAS QUE YA SE HICIERON

**1. ¿Qué es `asistente_snapshot`? ¿Hay que conservarla?**
Es una tabla real del sistema antiguo, no un invento. Guardaba un volcado por sucursal con
`margen`, `precioCompra`, `precioMaximo`, `precioEjecutivo` y metas de kilos — datos
internos que nunca debieron ser públicos. Un desarrollador anterior la usó como fuente del
widget. **Ya no se usa y no se restaura:**
- el acceso anónimo fue revocado (por eso ahora da 401);
- el cron que la regeneraba cada hora fue desactivado;
- su fuente `v_precios_activos` tiene **0 filas** hace tiempo.

Importante para que no te confundas: **el widget ya estaba roto antes de que se revocara
nada.** Recibía un objeto vacío `{}` y mostraba "No hay precios publicados". Al cortar el
acceso solo cambió el síntoma, de vacío a 401. No se perdió ninguna funcionalidad.

**2. ¿Reescribo la lógica de datos del widget existente, en producción?**
Sí. Conserva la maqueta, las pestañas y los estilos; reemplaza **solo** la capa de datos
para que lea `precios_publicos` (y `f_buscar_precio_publico` si quieres búsqueda difusa).
En reciclean.cl eso significa editar el fragmento WPCode ID 185.
**Antes de editar, guarda una copia del código original** en un archivo de texto o como
fragmento inactivo, y dime dónde la dejaste. Es producción y no hay control de versiones.

**3. ¿Y el otro fragmento, "Chatbot Reciclean v2"?**
Revísalo, no lo modifiques todavía. Si también consulta precios desde `asistente_snapshot`
u otra tabla, **repórtalo con el detalle de qué endpoints usa**. Si necesita precios, la vía
correcta es `f_buscar_precio_publico`. Cualquier otra cosa que consulte, avísala antes de
tocar.

---

## LA ÚNICA API QUE DEBES USAR

**Proyecto Supabase:** `eknmtsrtfkzroxnovfqn`
**URL base:** `https://eknmtsrtfkzroxnovfqn.supabase.co`

**Clave pública (anon key)** — es pública por diseño, va visible en el HTML y NO es un secreto.
Usa esta, no la `sb_publishable_…` que hay hoy en los widgets:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbm10c3J0Zmt6cm94bm92ZnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MDY2ODgsImV4cCI6MjA5MDk4MjY4OH0.8Y4N0lw3DFN3Y8-R6ID7t_LAfgHWDM5N-oa4Ji9bncg
```

### Vista de lectura: `precios_publicos`

`GET https://eknmtsrtfkzroxnovfqn.supabase.co/rest/v1/precios_publicos?select=*`
con cabeceras `apikey: <anon key>` y `Authorization: Bearer <anon key>`.

Columnas exactas (verificadas contra el esquema real):

| Columna | Tipo | Qué es |
|---|---|---|
| `material_id` | text | identificador estable; úsalo como clave, no el nombre |
| `material` | text | nombre público del material |
| `empresa_id` | text | `farex` o `reciclean_spa` — **filtra por acá** |
| `empresa` | text | `FAREX` o `Reciclean` (respeta mayúsculas) |
| `sucursal_id` | text | identificador de sucursal |
| `sucursal` | text | Cerrillos, Maipú, Puerto Montt o Talca |
| `precio` | numeric | **CLP por unidad. Lo que la empresa LE PAGA a quien trae el material** |
| `unidad` | text | normalmente `kg` |
| `actualizado` | date | desde cuándo rige ese precio |
| `categoria` | text | slug crudo del catálogo. Para depurar, no para mostrar |
| `grupo` | text | **etiqueta legible para el filtro** (`Aluminios`, `Plásticos · PET`, …) |
| `grupo_orden` | int | orden de despliegue de los grupos |

Ejemplo de consulta real:
```
precios_publicos?select=material,grupo,sucursal,precio,unidad,actualizado
  &empresa_id=eq.farex&order=grupo_orden.asc,material.asc
```

### Búsqueda difusa (buscador o chatbot)

`POST /rest/v1/rpc/f_buscar_precio_publico`
Cuerpo: `{"p_texto": "cobre", "p_empresa": "FAREX", "p_limite": 10}`
`p_empresa` y `p_limite` son opcionales. Devuelve las mismas columnas públicas.

---

## LAS 6 REGLAS DEL MODELO (no son de estilo, son del negocio)

1. **El precio es lo que la empresa PAGA a quien trae el material.** Redáctalo como
   "te pagamos $X por kilo". Nunca "precio de venta", "precio lista" ni "precio de mercado":
   esos son los números internos y no salen por esta vía.

2. **Publicar es una decisión de gerencia, tomada en el panel.** Un material aparece solo si
   está activado en la *Vitrina pública*, y se activa **por empresa**. La web nunca decide
   qué mostrar: pinta lo que la vista le entrega.

3. **Una fila por material × sucursal.** Agrupa por sucursal en pestañas. No promedies ni
   te quedes con una sola: son precios reales distintos, y mostrar el de otra sucursal es un
   error de negocio, no de maquetación.
   **Construye las pestañas desde los datos, no las dejes fijas en el HTML.** reciclean.cl
   tiene 4 pestañas escritas a mano; si solo hay precios publicados en dos sucursales,
   las otras dos quedarían vacías y parecería que el sitio falla.

4. **Las categorías se agrupan en la base, no en el JavaScript.** El catálogo heredado trae
   25 slugs con duplicados (`metal_ferroso` y `metales_ferrosos`, `papel` y `papel_carton`).
   Ya está resuelto: usa `grupo` y ordena por `grupo_orden`. **No inventes categorías ni las
   deduzcas del nombre del material.** Si una agrupación se ve mal, se corrige en la base y
   las dos webs cambian solas: no lo parches en el JS, repórtalo.

5. **`actualizado` es la fecha desde la que rige el precio.** Muéstrala: da confianza y evita
   la pregunta "¿esto está vigente?".

6. **Lista vacía no es un error.** Significa que aún no hay nada publicado. Mensaje amable
   con invitación a contactar, nunca un error técnico.

---

## REGLAS DE SEGURIDAD — LÉELAS ANTES DE ESCRIBIR CÓDIGO

1. **La anon key es pública a propósito. No la ocultes, no la muevas a un `.env`, no la
   proxees por PHP.** Ese trabajo no aporta nada y ensucia el sitio.

2. **Con esa clave SOLO se puede leer `precios_publicos` y llamar a `f_buscar_precio_publico`.**
   Los costos internos, el precio que pagan las fundiciones y los márgenes viven en un
   esquema (`precios_v3`) donde el rol anónimo no tiene permiso: esas tablas no se pueden ni
   nombrar desde la API. Verificado contra la API real:
   - `precios_panel`, `borradores_panel`, `usuarios_panel` → **401**
   - `asistente_snapshot`, `v_precios_activos`, `materiales` → **401**
   - `?select=precio_recibido_clp` sobre la vista pública → **400**
   - RPC de escritura (`f_actualizar_precio`, `f_asignar_rol`, …) → **404**

3. **Los 401 que veas son deliberados. NO los "arregles" restaurando accesos.** Si algo
   responde 401, la seguridad está funcionando: cámbiate a `precios_publicos`.

4. **NUNCA pongas la `service_role` key en estas webs.** Salta toda la seguridad. Si alguien
   te la ofrece "para que funcione más fácil", la respuesta es no.

5. **No inventes endpoints ni tablas.** Si necesitas algo que no está en la lista de arriba,
   dilo y pídelo; no lo resuelvas consultando otra tabla "que quizás exista".

---

## PUNTO DE PARTIDA: YA HAY CÓDIGO ESCRITO

En el repo del panel existe `public-web/precios-publicos.js`: el widget completo, que ya
implementa las 6 reglas (pestañas derivadas de los datos, buscador que ignora tildes, filtro
por `grupo`, tarjetas, fecha de vigencia, estados de vacío y de error).

```js
ReciPrecios.montar("#precios", { empresa: "farex" });           // o "reciclean_spa"
ReciPrecios.montar("#precios", { empresa: "farex", sucursal: "maipu" });

ReciPrecios.obtener({ empresa: "farex" });     // datos crudos, si maquetas tú
ReciPrecios.buscar("cobre", "FAREX");          // búsqueda difusa (chatbot)
```

**No requiere supabase-js.** Usa `fetch` contra la API REST: un archivo menos que cargar y
una dependencia menos que se puede romper. Reemplaza el marcador `PEGAR_AQUI_LA_ANON_KEY`.

Los estilos usan prefijo `.reci-` y heredan la tipografía del sitio.

**Como ambos sitios ya tienen maqueta propia y buena, lo esperable es que te quedes con esa
maqueta y uses solo `ReciPrecios.obtener()` para los datos**, o que copies su lógica de
carga y render dentro del widget existente. Respeta las 6 reglas igual.

---

## CÓMO PROCEDER

1. **Identifica qué dominio administra esta cuenta** y dilo antes de tocar nada.

2. **Localiza el widget existente** (página KingComposer en FAREX, fragmento WPCode ID 185 en
   Reciclean) y **guarda una copia del código original**. Di dónde la dejaste.

3. **Prueba la lectura antes de integrar.** Un HTML suelto que llame a la API y muestre el
   JSON en pantalla. Si eso funciona, el resto es maquetación.

4. **Reescribe solo la capa de datos** del widget: conserva HTML, pestañas y estilos.

5. **Verifica en el navegador real**, no solo en el código: que se vean filas, que la consola
   no tenga errores, que el filtro y el buscador respondan, y que en móvil no se desborde.

6. **Revisa el fragmento del chatbot** (si existe en tu sitio) y reporta qué endpoints usa.
   No lo modifiques sin confirmación.

7. **No toques el panel de administración ni la base de datos.** Si crees que hace falta un
   cambio ahí, escríbelo como pendiente y avisa.

---

## COSAS QUE TE VAN A CONFUNDIR (léelas o perderás tiempo)

- **La API puede devolver `[]` y eso NO es un error.** Un material solo aparece si gerencia
  lo activó en la Vitrina. Si recibes lista vacía, **no empieces a depurar CORS ni cabeceras**:
  pide que activen materiales y vuelve a probar. Tu código debe manejarlo con un mensaje
  amable.

- **Filtra por `empresa_id`, no por `empresa`.** `empresa` compara exacto contra `FAREX` /
  `Reciclean`; si escribes `farex` en minúsculas no encuentras nada. `empresa_id` (`farex`,
  `reciclean_spa`) es estable y en minúsculas.

- **Un mismo material aparece varias veces**, una por sucursal. Ver regla 3.

- **CORS ya está resuelto** por Supabase. Si ves un error de CORS, casi seguro la URL o la
  cabecera `apikey` están mal escritas.

- **`v_precios_activos` no tiene reemplazo columna a columna.** No existen `precio_lista`,
  `precio_maximo` ni banderas `reciclean`/`farex` por fila. El equivalente es: una fila por
  material × sucursal × empresa, filtrando por `empresa_id`.

- **El precio es lo que la empresa PAGA**, no lo que cobra. Ver regla 1.

---

## QUÉ ENTREGAR AL TERMINAR

- Qué dominio te tocó y qué archivos o fragmentos tocaste, con su ubicación exacta.
- Dónde quedó la copia de respaldo del código original.
- Cómo se ve en escritorio y en móvil.
- Qué endpoints usa el fragmento del chatbot, si existe.
- Los pendientes que detectaste y no resolviste.
