// COMPONENTE · Modal simple y reutilizable (detalle, confirmaciones).
// Mismo lenguaje visual que el widget de Diego (header verde + fondo oscuro).
// Sin librerías. Se cierra con la ✕, con Esc o al hacer click en el fondo.
// ARRASTRABLE: se toma de la cabecera (header) y se mueve por la pantalla, para poder
// comparar su contenido con lo que hay de fondo. La posición se reinicia (recentra) en
// cada apertura.
//   abrirModal({ titulo, cuerpoHTML, acciones:[{texto, href?, onClick?, primario?, cerrar?}] })
//   cerrarModal()

let _mounted = false;
let _escHandler = null;
// Desplazamiento actual del modal respecto de su posición centrada (px).
let _dx = 0, _dy = 0;

const CSS = `
.rc-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:120;display:none;align-items:center;justify-content:center;padding:16px}
.rc-modal-backdrop.open{display:flex}
.rc-modal{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 24px 64px -16px rgba(15,23,42,.4);width:520px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;will-change:transform}
.rc-modal.dragging{user-select:none}
.rc-modal-h{background:#059669;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-weight:600;cursor:move;touch-action:none}
.rc-modal-h .rc-modal-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-modal-h button{background:none;border:0;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px}
.rc-modal-h button:hover{background:rgba(255,255,255,.15)}
.rc-modal-body{padding:16px;overflow-y:auto;color:#0f172a}
.rc-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #eef1f5;background:#fff;flex-wrap:wrap}
.rc-modal-btn{padding:8px 14px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid #d6d3d1;background:#fff;color:#44403c;text-decoration:none;display:inline-block}
.rc-modal-btn.primario{background:#047857;color:#fff;border-color:#047857}
`;

function aplicarPos(modal) { modal.style.transform = `translate(${_dx}px, ${_dy}px)`; }

// Arrastre desde la cabecera. Se usan mousedown/mousemove/mouseup (los listeners de move/up
// van en document para no "perder" el arrastre si el cursor sale del header). El botón ✕ se
// excluye para que cerrar no inicie un drag.
function cablearArrastre(modal, header) {
  let arrastrando = false, x0 = 0, y0 = 0, dx0 = 0, dy0 = 0;

  const onMove = (e) => {
    if (!arrastrando) return;
    _dx = dx0 + (e.clientX - x0);
    _dy = dy0 + (e.clientY - y0);
    aplicarPos(modal);
  };
  const onUp = () => {
    arrastrando = false;
    modal.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;  // la ✕ no arrastra
    if (e.button !== 0) return;               // solo botón izquierdo
    arrastrando = true;
    x0 = e.clientX; y0 = e.clientY; dx0 = _dx; dy0 = _dy;
    modal.classList.add("dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });
}

function ensureMount() {
  if (_mounted) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "rc-modal-backdrop";
  wrap.id = "rcModalBackdrop";
  wrap.innerHTML = `
    <div class="rc-modal" role="dialog" aria-modal="true">
      <div class="rc-modal-h">
        <span class="rc-modal-title" id="rcModalTitle"></span>
        <button type="button" id="rcModalX" aria-label="Cerrar">✕</button>
      </div>
      <div class="rc-modal-body" id="rcModalBody"></div>
      <div class="rc-modal-foot" id="rcModalFoot"></div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.addEventListener("click", (e) => { if (e.target === wrap) cerrarModal(); });
  document.getElementById("rcModalX").addEventListener("click", cerrarModal);
  cablearArrastre(wrap.querySelector(".rc-modal"), wrap.querySelector(".rc-modal-h"));
  _mounted = true;
}

export function abrirModal({ titulo = "", cuerpoHTML = "", acciones = [] } = {}) {
  ensureMount();
  // Cada apertura recentra el modal (descarta el arrastre anterior).
  _dx = 0; _dy = 0;
  aplicarPos(document.querySelector("#rcModalBackdrop .rc-modal"));
  document.getElementById("rcModalTitle").textContent = titulo;
  document.getElementById("rcModalBody").innerHTML = cuerpoHTML;

  const foot = document.getElementById("rcModalFoot");
  foot.innerHTML = "";
  const lista = acciones.length ? acciones : [{ texto: "Cerrar", primario: true }];
  lista.forEach((a) => {
    const el = document.createElement(a.href ? "a" : "button");
    el.className = "rc-modal-btn" + (a.primario ? " primario" : "");
    el.textContent = a.texto;
    if (a.href) {
      el.href = a.href;
    } else {
      el.type = "button";
      el.addEventListener("click", () => { if (a.onClick) a.onClick(); if (a.cerrar !== false) cerrarModal(); });
    }
    foot.appendChild(el);
  });

  document.getElementById("rcModalBackdrop").classList.add("open");
  _escHandler = (e) => { if (e.key === "Escape") cerrarModal(); };
  document.addEventListener("keydown", _escHandler);
}

export function cerrarModal() {
  const bd = document.getElementById("rcModalBackdrop");
  if (bd) bd.classList.remove("open");
  if (_escHandler) { document.removeEventListener("keydown", _escHandler); _escHandler = null; }
}
