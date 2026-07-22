// CONTROLADOR · Vista "Calculadora soporte de decisión".
// No reimplementa la lógica: reutiliza el MVC ya construido en /calculadora/js/
// (formula.js = motor puro, db.js = acceso a datos, view.js = DOM, controller.js = orquestación).
// Así la fórmula de precios tiene UNA sola fuente de verdad y no diverge.
import { init as initCalculadora } from "../calculadora/js/controller/controller.js";
import { waitSupabase } from "../models/supabase.js";

// Se llama después de inyectar views/calculadora.html en #content.
// Los IDs del HTML coinciden con los que espera el view.js reutilizado.
export async function mountCalculadora() {
  await waitSupabase();
  try {
    await initCalculadora();
  } catch (e) {
    console.error("[calculadora] init:", e);
  }
}
