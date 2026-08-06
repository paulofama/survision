// ============================================================================
// Categorización de movimientos bancarios por reglas (banco_reglas).
// Isomórfico (navegador + Node). Puro: recibe el movimiento y las reglas.
// ============================================================================

const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Devuelve { categoria, marcaSoloBanco } para un movimiento.
 * Primer match por 'orden' asc gana; respeta el signo si la regla lo fija.
 * @param {{importe:number, concepto?:string, descripcion?:string}} mov
 * @param {Array<{orden:number,patron:string,signo:string|null,categoria:string,marca_solo_banco:boolean,activa:boolean}>} reglas
 */
export function categorizar(mov, reglas) {
  const texto = norm(`${mov.concepto || ''} ${mov.descripcion || ''}`);
  const signoMov = mov.importe >= 0 ? 'credito' : 'debito';
  const activas = (reglas || [])
    .filter((r) => r.activa !== false)
    .slice()
    .sort((a, b) => (a.orden ?? 100) - (b.orden ?? 100));
  for (const r of activas) {
    if (r.signo && r.signo !== signoMov) continue;
    if (texto.includes(norm(r.patron))) {
      return { categoria: r.categoria, marcaSoloBanco: !!r.marca_solo_banco };
    }
  }
  return {
    categoria: signoMov === 'credito' ? 'transferencia_recibida' : 'otro_debito',
    marcaSoloBanco: false,
  };
}

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Deriva el detalle impositivo del período a partir de los movimientos ya
 * categorizados (ley 25.413 y SIRCREB vienen como movimientos del extracto).
 * computable33 = 33% del impuesto ley 25.413 (cómputo contra otros tributos).
 */
export function derivarImpositivo(movsCategorizados) {
  let leyCred = 0, leyDeb = 0, sircreb = 0, comision = 0, iva = 0;
  for (const m of movsCategorizados) {
    if (m.categoria === 'impuesto_ley_25413') {
      if (m.importe >= 0) leyCred += m.importe; else leyDeb += -m.importe;
    } else if (m.categoria === 'sircreb') {
      sircreb += Math.abs(m.importe);
    } else if (m.categoria === 'comision_bancaria') {
      comision += Math.abs(m.importe);
    } else if (m.categoria === 'iva') {
      iva += Math.abs(m.importe);
    }
  }
  const leyTotal = leyCred + leyDeb;
  return {
    ley25413_creditos: r2(leyCred),
    ley25413_debitos: r2(leyDeb),
    ley25413_total: r2(leyTotal),
    computable_33: r2(leyTotal * 0.33),
    sircreb_total: r2(sircreb),
    comisiones_total: r2(comision),
    iva_total: r2(iva),
  };
}
