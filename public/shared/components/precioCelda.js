// COMPONENTE · Edición de precio in-situ, tipo celda de Excel.
//
// Objetivo de UX: la gerencia no es técnica, así que actualizar un precio debe costar
// lo mismo que corregir una celda de planilla — clic, escribir, Enter. Sin formularios,
// sin pantallas intermedias.
//
// Red de seguridad en tres capas:
//   1. Aquí: se confirma con modal SOLO cuando el cambio es grande o baja del costo.
//      Confirmar cada edición rutinaria entrena al usuario a aceptar sin leer.
//   2. En el RPC: revalida rol y costo en el servidor.
//   3. En la tabla: un CHECK hace imposible guardar venta < costo.
//
//   activarEdicion(td, { valor, onGuardar, confirmar, formato })
import { abrirModal } from "./modal.js";

let _cssListo = false;
const CSS = `
.pc-editable{cursor:cell;position:relative}
.pc-editable:hover{background:#f0fdf4;outline:1px solid #86efac}
.pc-editable::after{content:"✎";opacity:0;margin-left:6px;font-size:11px;color:#059669}
.pc-editable:hover::after{opacity:1}
.pc-input{width:100%;max-width:130px;border:2px solid #059669;border-radius:6px;padding:3px 6px;
  font-size:14px;font-weight:600;text-align:right;outline:none;font-family:inherit}
.pc-guardando{opacity:.5}
.pc-ok{animation:pcFlash .9s ease}
.pc-error{animation:pcShake .35s ease;color:#be123c!important}
@keyframes pcFlash{0%{background:#bbf7d0}100%{background:transparent}}
@keyframes pcShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
`;

function ensureCSS() {
  if (_cssListo) return;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
  _cssListo = true;
}

const clp = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("es-CL"));

export function activarEdicion(td, cfg) {
  ensureCSS();
  // La config viaja entera en cada re-cableado para que el valor de partida y la regla
  // de confirmación nunca queden desincronizados tras guardar.
  const { valor, onGuardar, confirmar = () => null, formato = clp } = cfg;
  td.classList.add("pc-editable");
  td.title = "Clic para editar · Enter guarda · Esc cancela";

  td.addEventListener("click", () =>
    abrirEditor(td, valor, { onGuardar, confirmar, formato }));
}

function abrirEditor(td, valorInicial, cfg) {
  const { onGuardar, confirmar, formato } = cfg;
  if (td.querySelector("input")) return; // ya está en edición

  const anterior = valorInicial;
  const input = document.createElement("input");
  input.type = "number";
  input.className = "pc-input";
  input.value = anterior ?? "";
  input.min = "0";
  input.step = "1";

  td.innerHTML = "";
  td.appendChild(input);
  input.focus();
  input.select();

  let cerrado = false; // evita que Enter y blur disparen el guardado dos veces

  const restaurar = (v) => {
    if (cerrado) return;
    cerrado = true;
    td.innerHTML = formato(v);
  };

  const intentarGuardar = async () => {
    if (cerrado) return;
    const nuevo = Number(input.value);

    if (!input.value.trim() || isNaN(nuevo) || nuevo <= 0) return restaurar(anterior);
    if (nuevo === Number(anterior)) return restaurar(anterior);           // sin cambios, sin ruido

    const aviso = confirmar(nuevo, anterior);
    if (aviso) {
      cerrado = true;
      td.innerHTML = formato(anterior);
      abrirModal({
        titulo: "Confirmar cambio de precio",
        cuerpoHTML: `<p style="margin:0 0 10px">${aviso}</p>
          <p style="margin:0;font-size:15px">
            <b>${formato(anterior)}</b> &nbsp;→&nbsp;
            <b style="color:#047857">${formato(nuevo)}</b>
          </p>`,
        acciones: [
          { texto: "Cancelar" },
          { texto: "Sí, cambiar", primario: true, onClick: () => guardar(td, nuevo, anterior, cfg) },
        ],
      });
      return;
    }

    cerrado = true;
    await guardar(td, nuevo, anterior, cfg);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); intentarGuardar(); }
    else if (e.key === "Escape") { e.preventDefault(); restaurar(anterior); }
  });
  input.addEventListener("blur", intentarGuardar);
}

// Actualización optimista: se pinta el valor nuevo de inmediato y se revierte si el
// servidor lo rechaza. Así la edición se siente instantánea sin mentir sobre el resultado.
async function guardar(td, nuevo, anterior, cfg) {
  const { onGuardar, formato } = cfg;
  td.innerHTML = formato(nuevo);
  td.classList.add("pc-guardando");
  try {
    await onGuardar(nuevo);
    td.classList.remove("pc-guardando");
    td.classList.add("pc-ok");
    setTimeout(() => td.classList.remove("pc-ok"), 900);
    // El valor guardado pasa a ser el nuevo punto de partida de la celda.
    reactivar(td, nuevo, cfg);
  } catch (e) {
    td.classList.remove("pc-guardando");
    td.innerHTML = formato(anterior);
    td.classList.add("pc-error");
    setTimeout(() => td.classList.remove("pc-error"), 400);
    reactivar(td, anterior, cfg);
    // El mensaje ya viene traducido a lenguaje de negocio desde preciosRepo.
    abrirModal({ titulo: "No se pudo guardar", cuerpoHTML: `<p>${escaparTexto(e.message)}</p>` });
  }
}

// Se reemplaza la celda por un clon para descartar los listeners viejos (que seguirían
// apuntando al valor anterior) y se vuelve a cablear con el valor ya actualizado.
function reactivar(td, valor, cfg) {
  const limpio = td.cloneNode(true);
  td.parentNode.replaceChild(limpio, td);
  limpio.dataset.valor = valor;
  activarEdicion(limpio, { ...cfg, valor });
}

// El mensaje de error puede venir del servidor: se escapa antes de inyectarlo como HTML.
function escaparTexto(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}
