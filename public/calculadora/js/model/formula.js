// MODELO · Motor de cálculo puro (sin DOM, sin Supabase).
// Réplica exacta de calcRecompute() en panel-rdo.html (líneas 16492-16522).

function redondear(x, modo) {
  if (modo === "exacto") return Math.round(x);
  if (modo === "5") return Math.round(x / 5) * 5;
  return Math.round(x / 10) * 10; // "terminado en 0"
}

/**
 * @param {{p:number, mgPct:number, fl:number, spreadPct:number, ivaPct:number, vol:number, modo:string}} i
 * @returns precios brutos, finales, iva y contribución
 */
export function calcular(i) {
  const mg = i.mgPct / 100, b = i.spreadPct / 100, iva = i.ivaPct / 100;
  const plistaBruto = Math.round(i.p * (1 - mg) - i.fl);
  const pmaxBruto   = Math.round(plistaBruto * (1 + b));
  const pejecBruto  = Math.round((plistaBruto + pmaxBruto) / 2);
  const ivaAmt      = Math.round(plistaBruto * iva);
  const plista = redondear(plistaBruto - ivaAmt, i.modo);
  const pmax   = redondear(pmaxBruto  - ivaAmt, i.modo);
  const pejec  = redondear(pejecBruto - ivaAmt, i.modo);
  const contrib = Math.round(i.vol * (i.p - plistaBruto - i.fl));
  return { plistaBruto, pmaxBruto, pejecBruto, plista, pmax, pejec, ivaAmt, contrib };
}

/**
 * Semáforo de margen. meta = { min:Number, meta:Number } o null.
 * @returns {{nivel:'verde'|'amarillo'|'rojo'|'gris', texto:string, detalle:string}}
 */
export function semaforo(mgPct, meta) {
  if (!meta || meta.min == null || meta.meta == null)
    return { nivel: "gris", texto: "SIN REFERENCIA", detalle: "Sin referencia de margen para esta categoría" };
  const detalle = `piso ${meta.min}% · meta ${meta.meta}% · actual ${mgPct}%`;
  if (mgPct >= meta.meta) return { nivel: "verde", texto: "VERDE — supera meta", detalle };
  if (mgPct >= meta.min)  return { nivel: "amarillo", texto: "AMARILLO — entre piso y meta", detalle };
  return { nivel: "rojo", texto: "ROJO — bajo el piso", detalle };
}
