// COMPONENTE · Toasts (notificaciones flotantes). Sin librerías.
//
// Reemplazan a los alert() nativos: no bloquean, se apilan en la esquina inferior derecha
// y se van solos a los 3 s (o al hacer clic). Mismo lenguaje visual que el modal/widget.
//
//   import { toast } from "../components/toast.js";
//   toast("Precio guardado");                 // éxito (por defecto)
//   toast("No se pudo guardar", "error");     // error (no se auto-cierra: hay que leerlo)
//   toast("Revisa el valor", "aviso");        // advertencia
//   toast("Cargando lista…", "info");
//
// Decisiones:
//  · Los errores NO se auto-cierran por defecto: un error que desaparece solo se pierde.
//    Igual se pueden cerrar con clic. El resto se va a los 3 s.
//  · Un solo contenedor y un solo <style>, montados una vez (patrón de modal.js).

let _mounted = false;

const CSS = `
.rc-toast-wrap{position:fixed;right:16px;bottom:16px;z-index:200;display:flex;flex-direction:column;
  gap:10px;align-items:flex-end;pointer-events:none;max-width:min(92vw,380px)}
.rc-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;width:100%;
  background:#fff;border:1px solid #e2e8f0;border-left-width:4px;border-radius:12px;
  box-shadow:0 16px 40px -12px rgba(15,23,42,.35);padding:12px 14px;font-size:14px;color:#1c1917;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;cursor:pointer;
  animation:rc-toast-in .18s ease-out}
.rc-toast.saliendo{animation:rc-toast-out .18s ease-in forwards}
.rc-toast .rc-toast-ico{font-size:16px;line-height:1.3;flex:none}
.rc-toast .rc-toast-msg{min-width:0;line-height:1.35;word-break:break-word}
.rc-toast.exito{border-left-color:#059669}
.rc-toast.error{border-left-color:#e11d48}
.rc-toast.aviso{border-left-color:#d97706}
.rc-toast.info{border-left-color:#0284c7}
@keyframes rc-toast-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rc-toast-out{to{opacity:0;transform:translateY(8px) scale(.98)}}
@media (max-width:600px){.rc-toast-wrap{left:16px;right:16px;max-width:none;align-items:stretch}}
`;

const ICONO = { exito: "✅", error: "⛔", aviso: "⚠️", info: "ℹ️" };

function ensureMount() {
  if (_mounted) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const wrap = document.createElement("div");
  wrap.className = "rc-toast-wrap";
  wrap.id = "rcToastWrap";
  wrap.setAttribute("aria-live", "polite");
  document.body.appendChild(wrap);
  _mounted = true;
}

// tipo: "exito" | "error" | "aviso" | "info". Alias en inglés/español por comodidad.
const NORMALIZA = { success: "exito", ok: "exito", warning: "aviso", warn: "aviso",
                    danger: "error", err: "error" };

export function toast(mensaje, tipo = "exito", opciones = {}) {
  ensureMount();
  const t = NORMALIZA[tipo] || tipo;
  const clase = ICONO[t] ? t : "info";
  // Los errores se quedan hasta que el usuario los cierre; el resto, 3 s.
  const duracion = opciones.duracion != null ? opciones.duracion : (clase === "error" ? 0 : 3000);

  const el = document.createElement("div");
  el.className = "rc-toast " + clase;
  el.setAttribute("role", clase === "error" ? "alert" : "status");
  el.innerHTML = `<span class="rc-toast-ico">${ICONO[clase]}</span><span class="rc-toast-msg"></span>`;
  // textContent: el mensaje no se interpreta como HTML (seguro con texto de errores/usuario).
  el.querySelector(".rc-toast-msg").textContent = String(mensaje ?? "");

  const cerrar = () => {
    if (el.dataset.saliendo) return;
    el.dataset.saliendo = "1";
    el.classList.add("saliendo");
    setTimeout(() => el.remove(), 180);
  };
  el.addEventListener("click", cerrar);
  document.getElementById("rcToastWrap").appendChild(el);
  if (duracion > 0) setTimeout(cerrar, duracion);
  return cerrar;
}

// Azúcar para los tres casos más comunes.
export const toastExito = (m, o) => toast(m, "exito", o);
export const toastError = (m, o) => toast(m, "error", o);
export const toastAviso = (m, o) => toast(m, "aviso", o);
