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

  // TECHO DE LA ESCALERA: ningún precio de compra puede superar el precio recibido (lo que
  // nos paga la fundición, i.p). La BD lo exige con precio_escalera_coherente:
  //   publicado <= ejecutivo <= maximo <= recibido   (y publicado <= recibido).
  // Un margen bajo con spread alto haría pmax > recibido y la inserción fallaría. Se capa el
  // resultado FINAL a i.p y se reordena la escalera para que SIEMPRE cumpla el constraint.
  const techo = i.p;
  const plista = Math.min(redondear(plistaBruto - ivaAmt, i.modo), techo);
  let pmax     = Math.min(redondear(pmaxBruto  - ivaAmt, i.modo), techo);
  pmax = Math.max(pmax, plista);                         // maximo >= publicado
  let pejec    = redondear(pejecBruto - ivaAmt, i.modo);
  pejec = Math.min(Math.max(pejec, plista), pmax);       // publicado <= ejecutivo <= maximo

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
