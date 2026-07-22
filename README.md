# Reciclean · Panel de precios (v2)

Panel modular de precios (Recibidos → Calculadora / Propuestas → Revisión → Publicados), con
carga manual (CSV/Excel) y el asistente Diego. Es un **sitio estático** de módulos JavaScript
nativos (sin bundler): todo el sitio vive en `public/` y se sirve tal cual.

## Correr en local
```bash
npm install
npm run dev        # http://localhost:3000
```
Abre `http://localhost:3000/`. Sin sesión te manda a `/login.html`; entra con tu correo y clave
(los mismos usuarios de Supabase Auth de hoy).

## Compilar los estilos (Tailwind)
```bash
npm run build:css  # regenera public/tailwind.css
```
`public/tailwind.css` ya viene compilado y versionado, así que el sitio se ve bien aunque no corras
el build.

## Publicar (Vercel)
1. `git init` + subir este repo a GitHub.
2. En Vercel: New Project → importar el repo. La config ya está en `vercel.json`
   (build `npm run build:css`, sirve `public/`). No necesita variables de entorno.
3. Cada push a `main` publica. Si el login fallara por el dominio nuevo, agrégalo en Supabase:
   Auth → URL Configuration.

## Estructura
```
index.html              → panel (página principal, "/")
login.html              → inicio de sesión (Supabase Auth)
public/
  js/ models/ components/ controllers/ views/   → app modular (ES modules)
  calculadora/          → motor de cálculo reutilizado (MVC)
  css/app.css  tailwind.css                       → estilos
tailwind.config.js  tailwind.input.css            → build de Tailwind
```
Nota: `index.html` y `login.html` viven dentro de `public/` (raíz del sitio).

## Backend
El backend (Edge Functions `precio-aplicar`, `precio-command`, `diego-chat-process` y la base) vive
en **Supabase** (proyecto `eknmtsrtfkzroxnovfqn`) y su código canónico está en el repo
`reciclean-rdo/supabase/**`. Este sitio solo lo consume; la URL + llave pública van embebidas en el
HTML. Para desplegar una función:
```bash
# desde reciclean-rdo
npx supabase functions deploy <fn> --project-ref eknmtsrtfkzroxnovfqn
```
