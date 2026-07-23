# Snippet de precios para las webs públicas (cPanel)

Esta carpeta **no se despliega en Vercel**. Son archivos sueltos para subir por FTP a las
webs de Farex y Reciclean alojadas en cPanel.

## Instalación (una vez por web)

1. Sube `precios-publicos.js` a la carpeta de scripts del sitio (ej. `/js/`).
2. Abre el archivo y reemplaza `PEGAR_AQUI_LA_ANON_KEY` por la anon key del proyecto.
3. En la página donde quieras la tabla, agrega:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
        integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"
        crossorigin="anonymous"></script>
<script src="/js/precios-publicos.js"></script>

<div id="tabla-precios"></div>
<script>
  // En la web de Farex:
  ReciPrecios.montar("#tabla-precios", "FAREX");
  // En la web de Reciclean:
  // ReciPrecios.montar("#tabla-precios", "Reciclean");
</script>
```

Si prefieres maquetar la tabla a tu manera, usa solo los datos:

```js
ReciPrecios.obtener("FAREX").then(function (filas) {
  // filas = [{ material, sucursal, precio, actualizado }, ...]
});
```

## Sobre la anon key

Va a la vista en el HTML y **eso está bien**: es pública por diseño. Lo que la vuelve
inofensiva es el modelo de permisos del backend:

- Los costos, márgenes y fletes viven en el esquema `precios_v3`, sobre el cual el rol
  anónimo **no tiene `USAGE`** → esas tablas no se pueden nombrar desde la API.
- Lo único otorgado a `anon` es `SELECT` sobre la vista `public.precios_publicos`, que
  proyecta 5 columnas: `material`, `empresa`, `sucursal`, `precio`, `actualizado`.
- Pedir una columna de costo devuelve **HTTP 400** (verificado contra la API real).

## Si la tabla sale vacía

Es el comportamiento por defecto: el catálogo se creó con todo en **no visible** para que
nada llegue a la web sin decisión explícita. Entra al panel → **Precios → Vitrina pública**
y marca los materiales que quieras publicar en cada web.
