/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/*.html",                    // entradas en la raíz (index, login, reset)
    "./public/modulos/**/*.{html,js}",    // vistas + controladores + modelos por dominio
    "./public/shared/**/*.{html,js}",     // componentes, utilidades y router
    "./public/calculadora/**/*.js",       // motor de la calculadora (formula.js)
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
