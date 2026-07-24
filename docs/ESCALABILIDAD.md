# Auditoría de escalabilidad — Reciclean (Vanilla JS + Supabase)

**Objetivo:** soportar *miles* de filas (historial gigante, miles de clientes/precios) y uso
concurrente masivo, sin que se congele el navegador ni se degrade la base.

**Veredicto corto:** la base de datos ya está **muy bien preparada**; el cuello de botella
real a escala está en el **frontend**, que hoy trae listas completas a memoria. Abajo, qué
está bien, qué se agregó en esta ronda y qué falta por hacer (con código listo).

---

## 1. Base de datos (Supabase / PostgreSQL)

### 1.1 Lo que YA estaba bien (no se toca)

El esquema `precios_v3` fue diseñado pensando en escala. Índices destacados ya existentes:

| Tabla | Índice | Para qué |
|---|---|---|
| `precio` | `precio_par_vigencia_idx (material_id, sucursal_id, vigencia_desde DESC)` | histórico de un par material×sucursal |
| `precio` | `precio_vigente_publicado_idx … INCLUDE (precio_publicado_clp) WHERE vigencia_hasta IS NULL` | *covering index*: la vitrina lee el precio vigente sin tocar la tabla |
| `precio` | `precio_vigente_unico` (parcial único) | garantiza un solo precio vigente por par |
| `borrador` | `borrador_estado_fecha_idx (estado, created_at DESC)` | la cola de pendientes/revisión, ordenada |
| `borrador` | `borrador_busqueda_trgm_idx` (GIN trigramas) | búsqueda `%texto%` en el servidor |
| `material` | `material_nombre_trgm_idx` (GIN trigramas) | autocompletado y búsqueda de materiales |
| `precio_auditoria` | `auditoria_material_idx (material_id, sucursal_id, created_at DESC)` | historial de un material |

Esto ya cubre las lecturas más calientes (vitrina pública, cola de precios, búsqueda de
materiales) a decenas de miles de filas.

### 1.2 Índices agregados en esta ronda (migración `p15_indices_escalabilidad`)

El hueco estaba en el **Historial** (`public.historial_precios`, que se apoya en el log
`precios_v3.precio_auditoria` — la tabla que más crece con el tiempo). Se agregaron:

```sql
-- "Top N más reciente" sin ordenar el log entero:
CREATE INDEX IF NOT EXISTS precio_auditoria_fecha_idx
  ON precios_v3.precio_auditoria USING btree (created_at DESC);

-- Búsqueda por autor del cambio (ilike '%texto%'):
CREATE INDEX IF NOT EXISTS precio_auditoria_actor_trgm
  ON precios_v3.precio_auditoria USING gin (actor_email gin_trgm_ops);

-- Drill-down del historial de UN precio:
CREATE INDEX IF NOT EXISTS precio_auditoria_precio_idx
  ON precios_v3.precio_auditoria USING btree (precio_id) WHERE (precio_id IS NOT NULL);
```

> **Nota operativa a gran escala:** cuando `precio_auditoria` tenga cientos de miles de filas
> y esté en uso, crear índices nuevos con `CREATE INDEX CONCURRENTLY` (conexión directa, fuera
> de una transacción) para no bloquear escrituras. En esta ronda se usó `CREATE INDEX` normal
> porque la tabla aún es chica y el lock es de milisegundos.

### 1.3 Recomendaciones futuras (cuando el volumen lo pida)

- **Paginación en el servidor por rango de fechas** para el Historial (particionar mentalmente
  por mes). Si el log llega a millones, evaluar **particionar `precio_auditoria` por rango de
  `created_at`** (declarative partitioning) y archivar particiones antiguas.
- **`VACUUM`/`ANALYZE`** los mantiene Supabase por autovacuum; vigilar `pg_stat_user_tables`
  si hay cargas masivas para que las estadísticas del planner no se queden viejas.
- **Concurrencia:** la seguridad se apoya en funciones `SECURITY DEFINER` y `rol_actual()`.
  Ese patrón escala bien en lectura; para escritura masiva simultánea, el punto de contención
  es el índice único `precio_vigente_unico` (correcto: es la integridad del dato, no un
  problema de rendimiento).

---

## 2. Frontend (Vanilla JS) — el verdadero cuello de botella

Hoy varias vistas hacen **`.select("*").limit(N grande)`** y filtran/ordenan **en memoria**:

- `listarHistorialPrecios({ limite: 1000 })` — trae hasta 1.000 filas.
- `listarRecibidos({ limite: 3000 })` — trae hasta 3.000 filas y filtra en el controlador.
- Listas de la Calculadora / Publicados — renderizan todo el conjunto de una vez.

Con 5.000+ filas esto produce dos problemas: (a) descarga y parseo de un JSON enorme, y
(b) construir 5.000 `<tr>` en el DOM **congela el hilo principal** (jank, scroll trabado).

### 2.1 Estrategia recomendada: **Paginación del lado del servidor** (no Virtual Scrolling)

| Opción | Cuándo conviene | Veredicto |
|---|---|---|
| **Paginación server-side** (`LIMIT`/`OFFSET` vía `.range()`) | Datos que crecen sin techo (historial, recibidos, clientes) | ✅ **Elegida.** El navegador nunca tiene más de ~50 filas; la red tampoco. Simple y robusta. |
| Virtual scrolling | UX de "scroll infinito" sobre datos ya en memoria | ⚠️ Resuelve el DOM pero **no** la descarga: igual bajas 5.000 filas. Más código, más frágil. |
| Traer todo + filtrar en JS (hoy) | Cientos de filas como mucho | ❌ No escala a miles. |

Virtual scrolling sólo pinta lo visible, pero **igual descargas todo**: no ataca el problema
de red. La paginación en el servidor ataca los dos a la vez y es la que se implementa.

### 2.2 Código listo — helper de paginación (`public/shared/js/util.js`)

Ya agregado en esta ronda:

```js
// Rango para .range() de supabase-js → PostgREST lo traduce a LIMIT/OFFSET en el servidor.
export function rangoSupabase(pagina = 1, tam = 50) { … }   // → { desde, hasta }
export function totalPaginas(total, tam = 50) { … }
export function paginarLocal(filas, pagina = 1, tam = 50) { … } // corte en memoria (sets acotados)
```

### 2.3 Cómo aplicarlo en las consultas (ejemplo con el Historial)

Reemplazar el `select("*").limit(1000)` por lectura por página con conteo total:

```js
import { rangoSupabase } from "../../shared/js/util.js";

export async function listarHistorialPrecios({ texto = "", pagina = 1, tam = 50 } = {}) {
  const { desde, hasta } = rangoSupabase(pagina, tam);
  let q = getClient()
    .from("historial_precios")
    .select("*", { count: "exact" });         // ← count viaja en el mismo request
  if (texto?.trim()) {
    const t = texto.trim();
    q = q.or(`material.ilike.%${t}%,actor_email.ilike.%${t}%,sucursal.ilike.%${t}%`);
  }
  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(desde, hasta);                     // ← LIMIT/OFFSET en el servidor
  if (error) throw new Error(error.message);
  return { filas: data || [], total: count || 0 };
}
```

El controlador guarda `pagina` en su estado y pinta botones ‹ Anterior / Siguiente › usando
`totalPaginas(total, tam)`. `listaTabla.js` (usado en Revisión) ya tiene un pager cliente;
para tablas grandes conviene migrarlo a este pager **server-side** con el mismo helper.

### 2.4 Otras mejoras de frontend

- **Búsqueda con debounce** (~250 ms) antes de disparar la consulta: evita un request por
  tecla cuando el buscador va al servidor.
- **`DocumentFragment`** al construir filas (una sola inserción al DOM) en vez de `innerHTML`
  concatenado gigante; ya se usa el patrón por lotes en varias vistas.
- **Índice de scroll:** con paginación server-side el DOM queda acotado a la página, así que
  no hace falta virtualizar.

---

## 3. Resumen ejecutivo

1. **BD:** ya estaba lista; se cerró el hueco del Historial con 3 índices (`p15`).
2. **Frontend:** es donde hay que invertir. El helper de paginación ya está en `util.js`;
   falta cablear `listarHistorialPrecios` y `listarRecibidos` para leer **por página**
   (`.range()` + `count:'exact'`) en vez de traer miles de filas.
3. **Decisión de arquitectura:** paginación en el servidor por sobre virtual scrolling —
   resuelve red y DOM a la vez, con menos código y menos superficie de error.
