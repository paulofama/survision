// ============================================================
// SERVICIO: Generador de la Propuesta de Asiento de devengamiento
// Modulo Sueldos - Fase 4 - Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// Funcion PURA que arma la propuesta de asiento de devengamiento de sueldos
// (borrador para contabilidad) a partir de la minuta (Fase 2) + el F.931
// confirmado (Fase 3). NO toca la BD — solo computa. El endpoint que la llama
// persiste el resultado (cabecera + lineas + bruto_estimado por empleado).
//
// API:
//   const { generarAsiento } = require('./services/asientoGenerator');
//   const { cabecera, lineas, repartos, warnings } =
//     generarAsiento(liquidacionCompleta, f931, empleadosMap, {
//       criterio: 'RECONCILIABLE',   // default; o 'REM1_AJUSTE'
//     });
//
// METODOLOGIA (decidida con Paulo):
//   - Bruto al Debe. Bruto total = Rem.1 del F.931 (criterio REM1_AJUSTE) o
//     neto+aportes+sindicato (criterio RECONCILIABLE), repartido entre empleados
//     segun el peso de su neto sobre el total de netos.
//   - La brecha [bruto_total - (neto + aporte_301 + aporte_302 + sindicato)] se
//     imputa a una LINEA DE AJUSTE ("Otras retenciones a pagar / a determinar").
//     Con REM1_AJUSTE suele ser > 0 (retenciones no capturadas en la minuta:
//     Ganancias, etc.). Con RECONCILIABLE es 0 (el asiento cuadra sin ajuste).
//   - Seccion 'recibo': devengamiento del recibo (bruto, cargas, netos).
//   - Seccion 'facturado': horas complementarias (Debe 4.1.1.0X / Haber 2.1.2.01).
//     Paulo las reimputa en el sistema contable real a 4.1.2.02.
//
// El bruto estimado por empleado vuelve en `repartos` para que el endpoint lo
// persista en liquidacion_lineas_empleado.bruto_estimado.
// ============================================================

// ------------------------------------------------------------
// Cuentas (espejo de src/utils/sueldos/constantes.ts)
// ------------------------------------------------------------
const CUENTA_SUELDOS_POR_AREA = {
  'Administración': '4.1.1.01',
  'Limpieza': '4.1.1.02',
  'Cirugías': '4.1.1.03',
  'Medición': '4.1.1.05',
  'Recepción': '4.1.1.06',
  'Cajera': '4.1.1.07',
  'Telefonista': '4.1.1.08',
};

const CTA = {
  CONTRIB_SS: '4.1.1.04.01',
  CONTRIB_OS: '4.1.1.04.02',
  ART_GASTO: '4.1.1.04.03',
  SCVO_GASTO: '4.1.1.04.04',
  SUELDOS_A_PAGAR: '2.1.2.01',
  SS_A_PAGAR: '2.1.2.02.01',
  OS_A_PAGAR: '2.1.2.02.02',
  ART_A_PAGAR: '2.1.2.02.03',
  SCVO_A_PAGAR: '2.1.2.02.04',
  SINDICATO_A_PAGAR: '2.1.2.03',
};

// Nombres legibles (snapshot que se guarda en la linea)
const NOMBRE_CUENTA = {
  '4.1.1.01': 'Sueldos Administración',
  '4.1.1.02': 'Sueldos Limpieza',
  '4.1.1.03': 'Sueldos Cirugías',
  '4.1.1.05': 'Sueldos Medición',
  '4.1.1.06': 'Sueldos Recepción',
  '4.1.1.07': 'Sueldos Cajera',
  '4.1.1.08': 'Sueldos Telefonista',
  '4.1.1.04.01': 'Contribuciones Seguridad Social',
  '4.1.1.04.02': 'Contribuciones Obra Social',
  '4.1.1.04.03': 'ART',
  '4.1.1.04.04': 'SCVO',
  '2.1.2.01': 'Sueldos y jornales a pagar',
  '2.1.2.02.01': 'SS a pagar',
  '2.1.2.02.02': 'OS a pagar',
  '2.1.2.02.03': 'ART a pagar',
  '2.1.2.02.04': 'SCVO a pagar',
  '2.1.2.03': 'Sindicato a pagar',
};

const DEFAULTS = {
  // RECONCILIABLE por default: en esta nómina el Rem.1 (base SIPA) está topeado
  // por debajo del bruto real casi siempre, así que REM1_AJUSTE produciría una
  // línea de ajuste negativa. Ver decisión P. Famá 2026-06-13.
  criterio: 'RECONCILIABLE',
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Redondeo a 2 decimales estable. */
function r2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function buscarBloque(liq, tipo) {
  if (!liq || !Array.isArray(liq.bloques)) return null;
  return liq.bloques.find((b) => b.tipo === tipo) || null;
}

function montoConcepto(bloque, codigo) {
  if (!bloque || !Array.isArray(bloque.lineas_concepto)) return 0;
  const l = bloque.lineas_concepto.find((x) => x.concepto_codigo === codigo);
  return num(l?.monto);
}

function nombreCuenta(codigo) {
  return NOMBRE_CUENTA[codigo] || codigo || '';
}

/**
 * Reparte `total` entre las lineas segun el peso de su neto. Ajusta la ultima
 * linea para que la suma cierre exacto (evita centavos perdidos por redondeo).
 * Devuelve [{ ...linea, bruto }].
 */
function repartirPorNeto(lineas, total) {
  const totalNeto = lineas.reduce((s, l) => s + num(l.monto_neto_cargado), 0);
  if (totalNeto <= 0) return lineas.map((l) => ({ ...l, bruto: 0 }));

  let acum = 0;
  return lineas.map((l, i) => {
    let bruto;
    if (i === lineas.length - 1) {
      bruto = r2(total - acum);
    } else {
      bruto = r2(total * (num(l.monto_neto_cargado) / totalNeto));
      acum = r2(acum + bruto);
    }
    return { ...l, bruto };
  });
}

/** Resuelve area y cuenta de gasto de una linea de empleado (con snapshots). */
function resolverAreaCuenta(linea, empleadosMap) {
  const emp = empleadosMap && empleadosMap.get ? empleadosMap.get(linea.empleado_id) : null;
  const area = linea.area_snapshot || emp?.area || 'Administración';
  const cuenta =
    linea.cuenta_contable_snapshot ||
    emp?.cuenta_contable ||
    CUENTA_SUELDOS_POR_AREA[area] ||
    CUENTA_SUELDOS_POR_AREA['Administración'];
  return { area, cuenta };
}

/**
 * Agrupa montos de lineas de empleado por cuenta de gasto (4.1.1.0X).
 * Devuelve Map<cuenta, { area, monto }>.
 */
function agruparPorCuentaGasto(lineas, campoMonto, empleadosMap) {
  const map = new Map();
  for (const l of lineas) {
    const { area, cuenta } = resolverAreaCuenta(l, empleadosMap);
    const prev = map.get(cuenta) || { area, monto: 0 };
    prev.monto = r2(prev.monto + num(l[campoMonto]));
    map.set(cuenta, prev);
  }
  return map;
}

// ============================================================
// API PRINCIPAL
// ============================================================

/**
 * Genera la propuesta de asiento de devengamiento.
 *
 * @param {Object} liquidacionCompleta - LiquidacionMesCompleta (Fase 2)
 * @param {Object} f931 - F931Declaracion confirmada (Fase 3)
 * @param {Map}    empleadosMap - Map<empleado_id, { area, cuenta_contable, ... }>
 * @param {Object} [opciones] - { criterio: 'REM1_AJUSTE' | 'RECONCILIABLE' }
 * @returns {{ cabecera, lineas, repartos, warnings }}
 */
function generarAsiento(liquidacionCompleta, f931, empleadosMap, opciones = {}) {
  const opts = { ...DEFAULTS, ...opciones };
  const warnings = [];

  if (!liquidacionCompleta) throw new Error('generarAsiento: falta liquidacionCompleta');
  if (!f931) throw new Error('generarAsiento: falta f931');
  if (opts.criterio !== 'REM1_AJUSTE' && opts.criterio !== 'RECONCILIABLE') {
    throw new Error(`generarAsiento: criterio invalido "${opts.criterio}"`);
  }

  // ---- 1. Datos de la minuta -------------------------------------------
  // Día Sanidad se INTEGRA al recibo (decisión P. Famá 2026-06-12): sus netos
  // por empleado se suman a Pago de Sueldos para el total de netos y el reparto
  // del bruto. Se asume que su remuneración ya está incluida en el Rem.1 del
  // F.931 (es remunerativa y se declaró), por lo que NO hay doble cómputo: el
  // bruto total sigue siendo el Rem.1, solo se reparte también sobre estos netos.
  const bloquePago = buscarBloque(liquidacionCompleta, 'pago_sueldos');
  const lineasPagoBase = bloquePago ? bloquePago.lineas_empleado || [] : [];

  const bloqueDiaSanidad = buscarBloque(liquidacionCompleta, 'dia_sanidad');
  const lineasDiaSanidad = bloqueDiaSanidad ? bloqueDiaSanidad.lineas_empleado || [] : [];

  const lineasPago = [...lineasPagoBase, ...lineasDiaSanidad];
  const totalNeto = r2(lineasPago.reduce((s, l) => s + num(l.monto_neto_cargado), 0));

  if (lineasPago.length === 0 || totalNeto <= 0) {
    const err = new Error(
      'No hay netos por empleado cargados en el bloque Pago de Sueldos. ' +
      'Cargá la minuta de Pago de Sueldos antes de generar el asiento.'
    );
    err.codigo = 'SIN_NETOS';
    throw err;
  }

  if (lineasDiaSanidad.length > 0) {
    const totalDS = r2(lineasDiaSanidad.reduce((s, l) => s + num(l.monto_neto_cargado), 0));
    warnings.push(
      `Día Sanidad integrado al recibo: ${lineasDiaSanidad.length} línea(s) por $ ${totalDS} sumadas a Pago de Sueldos ` +
      '(se asume incluido en el Rem.1 del F.931).'
    );
  }

  const sindicato = montoConcepto(buscarBloque(liquidacionCompleta, 'sindicato'), 'SINDICATO');

  // Horas complementarias (seccion facturado)
  const bloqueHC = buscarBloque(liquidacionCompleta, 'horas_complementarias');
  const lineasHC = bloqueHC ? bloqueHC.lineas_empleado || [] : [];
  const totalHC = r2(lineasHC.reduce((s, l) => s + num(l.monto_neto_cargado), 0));

  // ---- 2. Datos del F.931 ----------------------------------------------
  const rem1 = num(f931.rem_1);
  const aporte301 = num(f931.aporte_ss_301);
  const aporte302 = num(f931.aporte_os_302);
  const contrib351 = num(f931.contrib_ss_351);
  const contrib352 = num(f931.contrib_os_352);
  const art = num(f931.art);
  const scvo = num(f931.scvo);

  // ---- 3. Bruto total y reparto ----------------------------------------
  const brutoReconciliable = r2(totalNeto + aporte301 + aporte302 + sindicato);

  if (opts.criterio === 'REM1_AJUSTE' && rem1 <= 0) {
    warnings.push('El F.931 no tiene Rem.1 cargado (> 0). Se usa el bruto reconciliable como base.');
  }
  const brutoTotal =
    opts.criterio === 'REM1_AJUSTE' && rem1 > 0 ? r2(rem1) : brutoReconciliable;

  const repartidas = repartirPorNeto(lineasPago, brutoTotal);
  const repartos = repartidas.map((l) => ({
    empleado_id: l.empleado_id,
    linea_id: l.id,
    neto: r2(num(l.monto_neto_cargado)),
    bruto: r2(num(l.bruto)),
  }));

  const montoAjuste = r2(brutoTotal - brutoReconciliable);

  // ---- 4. Lineas del asiento (seccion recibo) --------------------------
  const lineas = [];
  let orden = 0;
  const push = (l) => lineas.push({ orden: orden++, ...l });

  // DEBE: sueldos por area (bruto estimado)
  const sueldosPorCuenta = agruparPorCuentaGasto(repartidas, 'bruto', empleadosMap);
  for (const [cuenta, { area, monto }] of sueldosPorCuenta) {
    push({
      seccion: 'recibo',
      cuenta_codigo: cuenta,
      cuenta_nombre: nombreCuenta(cuenta),
      detalle: `Sueldos ${area} (bruto estimado)`,
      debe: r2(monto),
      haber: 0,
      es_ajuste: false,
      es_estimado: true,
      empleado_id: null,
      area,
    });
  }

  // DEBE: contribuciones patronales (del F.931)
  const debeContrib = [
    { cuenta: CTA.CONTRIB_SS, detalle: 'Contribuciones Seguridad Social (351)', monto: contrib351 },
    { cuenta: CTA.CONTRIB_OS, detalle: 'Contribuciones Obra Social (352)', monto: contrib352 },
    { cuenta: CTA.ART_GASTO, detalle: 'ART', monto: art },
    { cuenta: CTA.SCVO_GASTO, detalle: 'SCVO', monto: scvo },
  ];
  for (const c of debeContrib) {
    if (c.monto <= 0) continue;
    push({
      seccion: 'recibo',
      cuenta_codigo: c.cuenta,
      cuenta_nombre: nombreCuenta(c.cuenta),
      detalle: c.detalle,
      debe: r2(c.monto),
      haber: 0,
      es_ajuste: false,
      es_estimado: false,
      empleado_id: null,
      area: null,
    });
  }

  // HABER: pasivos
  const haberPasivos = [
    { cuenta: CTA.SUELDOS_A_PAGAR, detalle: 'Sueldos y jornales a pagar (neto)', monto: totalNeto },
    { cuenta: CTA.SS_A_PAGAR, detalle: 'SS a pagar (aporte 301 + contrib 351)', monto: r2(aporte301 + contrib351) },
    { cuenta: CTA.OS_A_PAGAR, detalle: 'OS a pagar (aporte 302 + contrib 352)', monto: r2(aporte302 + contrib352) },
    { cuenta: CTA.ART_A_PAGAR, detalle: 'ART a pagar', monto: art },
    { cuenta: CTA.SCVO_A_PAGAR, detalle: 'SCVO a pagar', monto: scvo },
    { cuenta: CTA.SINDICATO_A_PAGAR, detalle: 'Sindicato a pagar', monto: sindicato },
  ];
  for (const c of haberPasivos) {
    if (c.monto <= 0) continue;
    push({
      seccion: 'recibo',
      cuenta_codigo: c.cuenta,
      cuenta_nombre: nombreCuenta(c.cuenta),
      detalle: c.detalle,
      debe: 0,
      haber: r2(c.monto),
      es_ajuste: false,
      es_estimado: false,
      empleado_id: null,
      area: null,
    });
  }

  // Linea de ajuste (cuadre de la brecha). Cuenta a determinar por Paulo.
  if (Math.abs(montoAjuste) >= 0.01) {
    push({
      seccion: 'recibo',
      cuenta_codigo: null,
      cuenta_nombre: 'Otras retenciones a pagar (a determinar)',
      detalle:
        montoAjuste > 0
          ? 'Ajuste de cuadre: brecha Rem.1 vs neto+aportes+sindicato (retenciones no capturadas en la minuta)'
          : 'Ajuste de cuadre (negativo): la minuta supera el Rem.1 del F.931',
      debe: montoAjuste < 0 ? r2(Math.abs(montoAjuste)) : 0,
      haber: montoAjuste > 0 ? r2(montoAjuste) : 0,
      es_ajuste: true,
      es_estimado: false,
      empleado_id: null,
      area: null,
    });
    if (opts.criterio === 'REM1_AJUSTE') {
      warnings.push(
        `Línea de ajuste de $ ${r2(Math.abs(montoAjuste))} (${montoAjuste > 0 ? 'Haber' : 'Debe'}): ` +
        'Rem.1 del F.931 no coincide con neto+aportes+sindicato. Resolver la cuenta de destino en contabilidad.'
      );
    }
  }

  // ---- 5. Seccion facturado (horas complementarias) --------------------
  if (totalHC > 0) {
    const hcPorCuenta = agruparPorCuentaGasto(lineasHC, 'monto_neto_cargado', empleadosMap);
    for (const [cuenta, { area, monto }] of hcPorCuenta) {
      push({
        seccion: 'facturado',
        cuenta_codigo: cuenta,
        cuenta_nombre: nombreCuenta(cuenta),
        detalle: `Horas complementarias ${area} (facturado)`,
        debe: r2(monto),
        haber: 0,
        es_ajuste: false,
        es_estimado: false,
        empleado_id: null,
        area,
      });
    }
    push({
      seccion: 'facturado',
      cuenta_codigo: CTA.SUELDOS_A_PAGAR,
      cuenta_nombre: nombreCuenta(CTA.SUELDOS_A_PAGAR),
      detalle: 'Horas complementarias a pagar (facturado)',
      debe: 0,
      haber: totalHC,
      es_ajuste: false,
      es_estimado: false,
      empleado_id: null,
      area: null,
    });
  }

  // ---- 6. Totales y cabecera -------------------------------------------
  const totalDebe = r2(lineas.reduce((s, l) => s + num(l.debe), 0));
  const totalHaber = r2(lineas.reduce((s, l) => s + num(l.haber), 0));

  if (Math.abs(r2(totalDebe - totalHaber)) >= 0.01) {
    warnings.push(
      `El asiento no cuadra: Debe $ ${totalDebe} vs Haber $ ${totalHaber} (diferencia $ ${r2(totalDebe - totalHaber)}).`
    );
  }

  const cabecera = {
    liquidacion_id: liquidacionCompleta.id,
    anio: liquidacionCompleta.anio,
    mes: liquidacionCompleta.mes,
    f931_declaracion_id: f931.id || null,
    criterio_bruto: opts.criterio,
    rem_1_usado: r2(rem1),
    total_neto: totalNeto,
    bruto_total: r2(brutoTotal),
    monto_ajuste: montoAjuste,
    total_debe: totalDebe,
    total_haber: totalHaber,
  };

  return { cabecera, lineas, repartos, warnings };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  generarAsiento,
  // Helpers exportados para tests / debug
  repartirPorNeto,
  CUENTA_SUELDOS_POR_AREA,
  CTA,
  NOMBRE_CUENTA,
  DEFAULTS,
};
