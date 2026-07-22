// TEST · Motor puro de precios (public/calculadora/js/model/formula.js).
// Runner nativo de Node (node:test) para NO sumar dependencias. Correr con: npm test
// formula.js no toca DOM ni Supabase, así que se importa y prueba tal cual.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcular, semaforo } from "../public/calculadora/js/model/formula.js";

// Entrada base reutilizable; cada test sobreescribe lo que necesita.
const base = { p: 1000, mgPct: 30, fl: 0, spreadPct: 20, ivaPct: 0, vol: 500, modo: "exacto" };

test("calcular · caso base sin IVA ni flete (modo exacto)", () => {
  const c = calcular({ ...base });
  assert.equal(c.plistaBruto, 700); // 1000 * (1 - 0.30)
  assert.equal(c.pmaxBruto, 840);   // 700 * 1.20
  assert.equal(c.pejecBruto, 770);  // (700 + 840) / 2
  assert.equal(c.ivaAmt, 0);
  assert.equal(c.plista, 700);
  assert.equal(c.pmax, 840);
  assert.equal(c.pejec, 770);
  assert.equal(c.contrib, 150000);  // 500 * (1000 - 700 - 0)
});

test("calcular · redondeos 0 / 5 / exacto sobre el mismo P.Lista bruto", () => {
  // p=1005, mg=30 → plistaBruto = round(703.5) = 704 (base para ver los 3 modos).
  const inp = { ...base, p: 1005, vol: 100 };
  assert.equal(calcular({ ...inp, modo: "exacto" }).plistaBruto, 704);
  assert.equal(calcular({ ...inp, modo: "exacto" }).plista, 704); // sin redondeo
  assert.equal(calcular({ ...inp, modo: "0" }).plista, 700);      // múltiplo de 10 más cercano
  assert.equal(calcular({ ...inp, modo: "5" }).plista, 705);      // múltiplo de 5 más cercano
});

test("calcular · la retención de IVA baja los precios finales", () => {
  const c = calcular({ ...base, ivaPct: 19 });
  assert.equal(c.ivaAmt, 133);       // round(700 * 0.19)
  assert.equal(c.plista, 567);       // 700 - 133 (exacto)
  assert.equal(c.pmax, 707);         // 840 - 133
  assert.equal(c.pejec, 637);        // 770 - 133
  // El bruto NO cambia por IVA (el IVA solo afecta el neto final).
  assert.equal(c.plistaBruto, 700);
});

test("calcular · el flete se descuenta del P.Lista bruto y de la contribución", () => {
  const c = calcular({ ...base, fl: 50, vol: 100 });
  assert.equal(c.plistaBruto, 650);  // round(700 - 50)
  assert.equal(c.contrib, 30000);    // 100 * (1000 - 650 - 50)
});

test("semaforo · verde / amarillo / rojo según piso y meta", () => {
  const meta = { min: 6, meta: 30 };
  assert.equal(semaforo(40, meta).nivel, "verde");     // >= meta
  assert.equal(semaforo(30, meta).nivel, "verde");     // == meta (borde)
  assert.equal(semaforo(20, meta).nivel, "amarillo");  // entre piso y meta
  assert.equal(semaforo(6, meta).nivel, "amarillo");   // == piso (borde)
  assert.equal(semaforo(3, meta).nivel, "rojo");       // bajo el piso
});

test("semaforo · sin referencia de margen → gris", () => {
  assert.equal(semaforo(50, null).nivel, "gris");
  assert.equal(semaforo(50, { min: null, meta: 30 }).nivel, "gris");
  assert.equal(semaforo(50, { min: 6, meta: null }).nivel, "gris");
});
