// CONTROLADOR · Shell y placeholders del dominio COMERCIAL.
// Mantiene la jerarquía del funnel visible mientras los modulos se migran
// progresivamente al nuevo repo modular.
import { getComercialState } from "./comercialStore.js";

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

export function mountComercialShell() {
  const hoy = new Date();
  const state = getComercialState();
  const fecha = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(hoy);

  setText("comercialFecha", fecha);
  setText("comercialReadyCount", String(6));
  setText("comercialBuildCount", String(
    (state.opportunities?.length || 0)
    + (state.services?.length || 0)
    + (state.contracts?.length || 0)
  ));
}

export function mountComercialPlaceholder(config) {
  setText("comercialPlaceholderIcono", config.icono || "");
  setText("comercialPlaceholderTitulo", config.titulo || "Modulo en construccion");
  setText("comercialPlaceholderEtapa", config.etapa || "Preparacion");
  setText("comercialPlaceholderDescripcion", config.descripcion || "");
  setText("comercialPlaceholderFoco", config.foco || "");
  setText("comercialPlaceholderSiguientePaso", config.siguientePaso || "");
}
