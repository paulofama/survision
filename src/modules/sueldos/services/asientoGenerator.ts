// ============================================================
// SERVICIO (browser): Generador de la Propuesta de Asiento de Sueldos
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Port literal de server/services/asientoGenerator.js. Función PURA: arma la
// propuesta de asiento de devengamiento desde la minuta + el F.931, repartiendo
// el bruto por peso del neto. Sin I/O. El hook la corre en el browser y persiste
// el resultado en Supabase.
// ============================================================

const CUENTA_SUELDOS_POR_AREA: Record<string, string> = {
  'Administración': '4.1.1.01',
  'Limpieza': '4.1.1.02',
  'Cirugías': '4.1.1.03',
  'Medición': '4.1.1.05',
  'Recepción': '4.1.1.06',
  'Cajera': '4.1.1.07',
  'Telefonista': '4.1.1.08',
};

const CTA = {
  CONTRIB_SS: '4.1.1.04.01', CONTRIB_OS: '4.1.1.04.02', ART_GASTO: '4.1.1.04.03', SCVO_GASTO: '4.1.1.04.04',
  SUELDOS_A_PAGAR: '2.1.2.01', SS_A_PAGAR: '2.1.2.02.01', OS_A_PAGAR: '2.1.2.02.02',
  ART_A_PAGAR: '2.1.2.02.03', SCVO_A_PAGAR: '2.1.2.02.04', SINDICATO_A_PAGAR: '2.1.2.03',
};

const NOMBRE_CUENTA: Record<string, string> = {
  '4.1.1.01': 'Sueldos Administración', '4.1.1.02': 'Sueldos Limpieza', '4.1.1.03': 'Sueldos Cirugías',
  '4.1.1.05': 'Sueldos Medición', '4.1.1.06': 'Sueldos Recepción', '4.1.1.07': 'Sueldos Cajera', '4.1.1.08': 'Sueldos Telefonista',
  '4.1.1.04.01': 'Contribuciones Seguridad Social', '4.1.1.04.02': 'Contribuciones Obra Social', '4.1.1.04.03': 'ART', '4.1.1.04.04': 'SCVO',
  '2.1.2.01': 'Sueldos y jornales a pagar', '2.1.2.02.01': 'SS a pagar', '2.1.2.02.02': 'OS a pagar',
  '2.1.2.02.03': 'ART a pagar', '2.1.2.02.04': 'SCVO a pagar', '2.1.2.03': 'Sindicato a pagar',
};

export type CriterioBruto = 'RECONCILIABLE' | 'REM1_AJUSTE';
const DEFAULTS = { criterio: 'RECONCILIABLE' as CriterioBruto };

interface LineaEmpleado { id?: string; empleado_id: string; monto_neto_cargado: number | null; area_snapshot?: string | null; cuenta_contable_snapshot?: string | null; bruto?: number }
interface LineaConcepto { concepto_codigo: string; monto: number | null }
interface Bloque { tipo: string; lineas_empleado?: LineaEmpleado[]; lineas_concepto?: LineaConcepto[] }
interface LiquidacionCompleta { id: string; anio: number; mes: number; bloques?: Bloque[] }
type F931Like = Record<string, number | string | null | undefined> & { id?: string };
type EmpleadosMap = Map<string, { area?: string; cuenta_contable?: string }>;

export interface AsientoLinea {
  orden: number; seccion: 'recibo' | 'facturado'; cuenta_codigo: string | null; cuenta_nombre: string;
  detalle: string; debe: number; haber: number; es_ajuste: boolean; es_estimado: boolean;
  empleado_id: string | null; area: string | null;
}
export interface AsientoReparto { empleado_id: string; linea_id?: string; neto: number; bruto: number }
export interface AsientoCabeceraCalc {
  liquidacion_id: string; anio: number; mes: number; f931_declaracion_id: string | null;
  criterio_bruto: CriterioBruto; rem_1_usado: number; total_neto: number; bruto_total: number;
  monto_ajuste: number; total_debe: number; total_haber: number;
}

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function r2(n: number): number { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function buscarBloque(liq: LiquidacionCompleta, tipo: string): Bloque | null {
  if (!liq || !Array.isArray(liq.bloques)) return null;
  return liq.bloques.find((b) => b.tipo === tipo) || null;
}
function montoConcepto(bloque: Bloque | null, codigo: string): number {
  if (!bloque || !Array.isArray(bloque.lineas_concepto)) return 0;
  const l = bloque.lineas_concepto.find((x) => x.concepto_codigo === codigo);
  return num(l?.monto);
}
function nombreCuenta(codigo: string | null): string { return (codigo && NOMBRE_CUENTA[codigo]) || codigo || ''; }

function repartirPorNeto(lineas: LineaEmpleado[], total: number): LineaEmpleado[] {
  const totalNeto = lineas.reduce((s, l) => s + num(l.monto_neto_cargado), 0);
  if (totalNeto <= 0) return lineas.map((l) => ({ ...l, bruto: 0 }));
  let acum = 0;
  return lineas.map((l, i) => {
    let bruto: number;
    if (i === lineas.length - 1) { bruto = r2(total - acum); }
    else { bruto = r2(total * (num(l.monto_neto_cargado) / totalNeto)); acum = r2(acum + bruto); }
    return { ...l, bruto };
  });
}

function resolverAreaCuenta(linea: LineaEmpleado, empleadosMap: EmpleadosMap) {
  const emp = empleadosMap && empleadosMap.get ? empleadosMap.get(linea.empleado_id) : null;
  const area = linea.area_snapshot || emp?.area || 'Administración';
  const cuenta = linea.cuenta_contable_snapshot || emp?.cuenta_contable || CUENTA_SUELDOS_POR_AREA[area] || CUENTA_SUELDOS_POR_AREA['Administración'];
  return { area, cuenta };
}

function agruparPorCuentaGasto(lineas: LineaEmpleado[], campoMonto: 'bruto' | 'monto_neto_cargado', empleadosMap: EmpleadosMap) {
  const map = new Map<string, { area: string; monto: number }>();
  for (const l of lineas) {
    const { area, cuenta } = resolverAreaCuenta(l, empleadosMap);
    const prev = map.get(cuenta) || { area, monto: 0 };
    prev.monto = r2(prev.monto + num((l as any)[campoMonto]));
    map.set(cuenta, prev);
  }
  return map;
}

export class SinNetosError extends Error { codigo = 'SIN_NETOS'; }

export function generarAsiento(
  liquidacionCompleta: LiquidacionCompleta, f931: F931Like, empleadosMap: EmpleadosMap,
  opciones: { criterio?: CriterioBruto } = {},
): { cabecera: AsientoCabeceraCalc; lineas: AsientoLinea[]; repartos: AsientoReparto[]; warnings: string[] } {
  const opts = { ...DEFAULTS, ...opciones };
  const warnings: string[] = [];

  if (!liquidacionCompleta) throw new Error('generarAsiento: falta liquidacionCompleta');
  if (!f931) throw new Error('generarAsiento: falta f931');
  if (opts.criterio !== 'REM1_AJUSTE' && opts.criterio !== 'RECONCILIABLE') throw new Error(`generarAsiento: criterio inválido "${opts.criterio}"`);

  const bloquePago = buscarBloque(liquidacionCompleta, 'pago_sueldos');
  const lineasPagoBase = bloquePago ? bloquePago.lineas_empleado || [] : [];
  const bloqueDiaSanidad = buscarBloque(liquidacionCompleta, 'dia_sanidad');
  const lineasDiaSanidad = bloqueDiaSanidad ? bloqueDiaSanidad.lineas_empleado || [] : [];
  const lineasPago = [...lineasPagoBase, ...lineasDiaSanidad];
  const totalNeto = r2(lineasPago.reduce((s, l) => s + num(l.monto_neto_cargado), 0));

  if (lineasPago.length === 0 || totalNeto <= 0) {
    throw new SinNetosError('No hay netos por empleado cargados en el bloque Pago de Sueldos. Cargá la minuta de Pago de Sueldos antes de generar el asiento.');
  }

  if (lineasDiaSanidad.length > 0) {
    const totalDS = r2(lineasDiaSanidad.reduce((s, l) => s + num(l.monto_neto_cargado), 0));
    warnings.push(`Día Sanidad integrado al recibo: ${lineasDiaSanidad.length} línea(s) por $ ${totalDS} sumadas a Pago de Sueldos (se asume incluido en el Rem.1 del F.931).`);
  }

  const sindicato = montoConcepto(buscarBloque(liquidacionCompleta, 'sindicato'), 'SINDICATO');
  const bloqueHC = buscarBloque(liquidacionCompleta, 'horas_complementarias');
  const lineasHC = bloqueHC ? bloqueHC.lineas_empleado || [] : [];
  const totalHC = r2(lineasHC.reduce((s, l) => s + num(l.monto_neto_cargado), 0));

  const rem1 = num(f931.rem_1);
  const aporte301 = num(f931.aporte_ss_301);
  const aporte302 = num(f931.aporte_os_302);
  const contrib351 = num(f931.contrib_ss_351);
  const contrib352 = num(f931.contrib_os_352);
  const art = num(f931.art);
  const scvo = num(f931.scvo);

  const brutoReconciliable = r2(totalNeto + aporte301 + aporte302 + sindicato);
  if (opts.criterio === 'REM1_AJUSTE' && rem1 <= 0) warnings.push('El F.931 no tiene Rem.1 cargado (> 0). Se usa el bruto reconciliable como base.');
  const brutoTotal = opts.criterio === 'REM1_AJUSTE' && rem1 > 0 ? r2(rem1) : brutoReconciliable;

  const repartidas = repartirPorNeto(lineasPago, brutoTotal);
  const repartos: AsientoReparto[] = repartidas.map((l) => ({ empleado_id: l.empleado_id, linea_id: l.id, neto: r2(num(l.monto_neto_cargado)), bruto: r2(num(l.bruto)) }));
  const montoAjuste = r2(brutoTotal - brutoReconciliable);

  const lineas: AsientoLinea[] = [];
  let orden = 0;
  const push = (l: Omit<AsientoLinea, 'orden'>) => lineas.push({ orden: orden++, ...l });

  const sueldosPorCuenta = agruparPorCuentaGasto(repartidas, 'bruto', empleadosMap);
  for (const [cuenta, { area, monto }] of sueldosPorCuenta) {
    push({ seccion: 'recibo', cuenta_codigo: cuenta, cuenta_nombre: nombreCuenta(cuenta), detalle: `Sueldos ${area} (bruto estimado)`, debe: r2(monto), haber: 0, es_ajuste: false, es_estimado: true, empleado_id: null, area });
  }

  const debeContrib = [
    { cuenta: CTA.CONTRIB_SS, detalle: 'Contribuciones Seguridad Social (351)', monto: contrib351 },
    { cuenta: CTA.CONTRIB_OS, detalle: 'Contribuciones Obra Social (352)', monto: contrib352 },
    { cuenta: CTA.ART_GASTO, detalle: 'ART', monto: art },
    { cuenta: CTA.SCVO_GASTO, detalle: 'SCVO', monto: scvo },
  ];
  for (const c of debeContrib) {
    if (c.monto <= 0) continue;
    push({ seccion: 'recibo', cuenta_codigo: c.cuenta, cuenta_nombre: nombreCuenta(c.cuenta), detalle: c.detalle, debe: r2(c.monto), haber: 0, es_ajuste: false, es_estimado: false, empleado_id: null, area: null });
  }

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
    push({ seccion: 'recibo', cuenta_codigo: c.cuenta, cuenta_nombre: nombreCuenta(c.cuenta), detalle: c.detalle, debe: 0, haber: r2(c.monto), es_ajuste: false, es_estimado: false, empleado_id: null, area: null });
  }

  if (Math.abs(montoAjuste) >= 0.01) {
    push({
      seccion: 'recibo', cuenta_codigo: null, cuenta_nombre: 'Otras retenciones a pagar (a determinar)',
      detalle: montoAjuste > 0
        ? 'Ajuste de cuadre: brecha Rem.1 vs neto+aportes+sindicato (retenciones no capturadas en la minuta)'
        : 'Ajuste de cuadre (negativo): la minuta supera el Rem.1 del F.931',
      debe: montoAjuste < 0 ? r2(Math.abs(montoAjuste)) : 0, haber: montoAjuste > 0 ? r2(montoAjuste) : 0,
      es_ajuste: true, es_estimado: false, empleado_id: null, area: null,
    });
    if (opts.criterio === 'REM1_AJUSTE') {
      warnings.push(`Línea de ajuste de $ ${r2(Math.abs(montoAjuste))} (${montoAjuste > 0 ? 'Haber' : 'Debe'}): Rem.1 del F.931 no coincide con neto+aportes+sindicato. Resolver la cuenta de destino en contabilidad.`);
    }
  }

  if (totalHC > 0) {
    const hcPorCuenta = agruparPorCuentaGasto(lineasHC, 'monto_neto_cargado', empleadosMap);
    for (const [cuenta, { area, monto }] of hcPorCuenta) {
      push({ seccion: 'facturado', cuenta_codigo: cuenta, cuenta_nombre: nombreCuenta(cuenta), detalle: `Horas complementarias ${area} (facturado)`, debe: r2(monto), haber: 0, es_ajuste: false, es_estimado: false, empleado_id: null, area });
    }
    push({ seccion: 'facturado', cuenta_codigo: CTA.SUELDOS_A_PAGAR, cuenta_nombre: nombreCuenta(CTA.SUELDOS_A_PAGAR), detalle: 'Horas complementarias a pagar (facturado)', debe: 0, haber: totalHC, es_ajuste: false, es_estimado: false, empleado_id: null, area: null });
  }

  const totalDebe = r2(lineas.reduce((s, l) => s + num(l.debe), 0));
  const totalHaber = r2(lineas.reduce((s, l) => s + num(l.haber), 0));
  if (Math.abs(r2(totalDebe - totalHaber)) >= 0.01) {
    warnings.push(`El asiento no cuadra: Debe $ ${totalDebe} vs Haber $ ${totalHaber} (diferencia $ ${r2(totalDebe - totalHaber)}).`);
  }

  const cabecera: AsientoCabeceraCalc = {
    liquidacion_id: liquidacionCompleta.id, anio: liquidacionCompleta.anio, mes: liquidacionCompleta.mes,
    f931_declaracion_id: (f931.id as string) || null, criterio_bruto: opts.criterio, rem_1_usado: r2(rem1),
    total_neto: totalNeto, bruto_total: r2(brutoTotal), monto_ajuste: montoAjuste, total_debe: totalDebe, total_haber: totalHaber,
  };

  return { cabecera, lineas, repartos, warnings };
}
