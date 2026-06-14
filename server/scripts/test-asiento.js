// ============================================================
// SCRIPT DE PRUEBA - Generador de asiento (Fase 4)
// ============================================================
//
// USO:  cd server && node scripts/test-asiento.js
//
// Usa los montos reales del F.931 122025 + una distribucion sintetica de netos
// por empleado (9 empleados) para validar el generador NUMERICAMENTE:
//   - que el reparto del bruto cierre exacto al total
//   - que el asiento CUADRE (Debe == Haber) con la linea de ajuste
//   - ambos criterios: REM1_AJUSTE y RECONCILIABLE
//
// No toca la BD: arma objetos en memoria. (Espejo del enfoque de test-conciliacion.js)
// ============================================================

const { generarAsiento } = require('../services/asientoGenerator');

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const log = console.log;
const section = (t) => log('\n' + '='.repeat(64) + '\n' + t + '\n' + '='.repeat(64));

// F.931 122025 (validado con el parser real) + Rem.1
const f931 = {
  id: 'f931-test',
  rem_1: 11397795.79,
  aporte_ss_301: 1680562.30,
  aporte_os_302: 480935.33,
  contrib_ss_351: 446925.82,
  contrib_os_352: 961870.87,
  art: 330648.42,
  scvo: 3012.12,
  cantidad_trabajadores: 9,
};

// 9 empleados sinteticos (areas segun el plantel real Dic-2025)
// neto = sueldo neto; hc = horas complementarias (facturado); ds = dia sanidad
const EMPLEADOS = [
  { id: 'e1', apellido: 'A', nombre: '1', area: 'Medición', cuenta_contable: '4.1.1.05', neto: 950000, hc: 120000, ds: 45000 },
  { id: 'e2', apellido: 'B', nombre: '2', area: 'Medición', cuenta_contable: '4.1.1.05', neto: 910000, hc: 0, ds: 45000 },
  { id: 'e3', apellido: 'C', nombre: '3', area: 'Medición', cuenta_contable: '4.1.1.05', neto: 880000, hc: 80000, ds: 0 },
  { id: 'e4', apellido: 'D', nombre: '4', area: 'Recepción', cuenta_contable: '4.1.1.06', neto: 760000, hc: 0, ds: 30000 },
  { id: 'e5', apellido: 'E', nombre: '5', area: 'Recepción', cuenta_contable: '4.1.1.06', neto: 740000, hc: 0, ds: 0 },
  { id: 'e6', apellido: 'F', nombre: '6', area: 'Administración', cuenta_contable: '4.1.1.01', neto: 880000, hc: 0, ds: 0 },
  { id: 'e7', apellido: 'G', nombre: '7', area: 'Cajera', cuenta_contable: '4.1.1.07', neto: 820000, hc: 0, ds: 0 },
  { id: 'e8', apellido: 'H', nombre: '8', area: 'Limpieza', cuenta_contable: '4.1.1.02', neto: 690000, hc: 0, ds: 0 },
  { id: 'e9', apellido: 'I', nombre: '9', area: 'Telefonista', cuenta_contable: '4.1.1.08', neto: 870000, hc: 0, ds: 0 },
];

const empleadosMap = new Map(EMPLEADOS.map((e) => [e.id, e]));

function lineaEmp(e, campo) {
  return {
    id: `linea-${e.id}-${campo}`,
    empleado_id: e.id,
    monto_neto_cargado: e[campo],
    area_snapshot: e.area,
    cuenta_contable_snapshot: e.cuenta_contable,
  };
}

const liq = {
  id: 'liq-test',
  anio: 2025,
  mes: 12,
  bloques: [
    { id: 'b-pago', tipo: 'pago_sueldos', lineas_empleado: EMPLEADOS.map((e) => lineaEmp(e, 'neto')), lineas_concepto: [] },
    { id: 'b-hc', tipo: 'horas_complementarias', lineas_empleado: EMPLEADOS.filter((e) => e.hc > 0).map((e) => lineaEmp(e, 'hc')), lineas_concepto: [] },
    { id: 'b-ds', tipo: 'dia_sanidad', lineas_empleado: EMPLEADOS.filter((e) => e.ds > 0).map((e) => lineaEmp(e, 'ds')), lineas_concepto: [] },
    { id: 'b-sind', tipo: 'sindicato', lineas_empleado: [], lineas_concepto: [{ id: 'l-sind', concepto_codigo: 'SINDICATO', monto: 341934.00 }] },
  ],
};

function imprimir(criterio) {
  const { cabecera, lineas, repartos, warnings } = generarAsiento(liq, f931, empleadosMap, { criterio });

  section(`CRITERIO: ${criterio}`);
  log(`Rem.1=$ ${$(cabecera.rem_1_usado)}  total_neto=$ ${$(cabecera.total_neto)}  bruto_total=$ ${$(cabecera.bruto_total)}  ajuste=$ ${$(cabecera.monto_ajuste)}`);
  log('');
  for (const l of lineas) {
    const cta = (l.cuenta_codigo || '(a determinar)').padEnd(15);
    const det = (l.detalle || '').slice(0, 46).padEnd(46);
    const marca = l.es_estimado ? '*' : (l.es_ajuste ? '#' : ' ');
    const debe = l.debe ? $('' + l.debe).padStart(15) : ''.padStart(15);
    const haber = l.haber ? $('' + l.haber).padStart(15) : ''.padStart(15);
    log(`  [${l.seccion.slice(0, 4)}] ${cta} ${marca} ${det} D ${debe}  H ${haber}`);
  }
  log('');
  log(`  TOTAL DEBE  $ ${$(cabecera.total_debe).padStart(15)}`);
  log(`  TOTAL HABER $ ${$(cabecera.total_haber).padStart(15)}`);
  const desc = r2(cabecera.total_debe - cabecera.total_haber);
  log(Math.abs(desc) < 0.01 ? '  >> CUADRA' : `  >> DESCUADRE $ ${$(desc)}`);

  // Verificar reparto
  const sumBruto = r2(repartos.reduce((s, r) => s + r.bruto, 0));
  log(`  Suma bruto repartido: $ ${$(sumBruto)}  (debe = bruto_total $ ${$(cabecera.bruto_total)})`);
  log(Math.abs(r2(sumBruto - cabecera.bruto_total)) < 0.01 ? '  >> REPARTO OK' : '  >> REPARTO NO CIERRA');

  if (warnings.length) {
    log('  Warnings:');
    for (const w of warnings) log(`    - ${w}`);
  }
  return { desc, sumBruto, cabecera };
}

(function main() {
  section('TEST GENERADOR DE ASIENTO - F.931 122025 + netos sinteticos');
  const totalNeto = EMPLEADOS.reduce((s, e) => s + e.neto, 0);
  const totalHC = EMPLEADOS.reduce((s, e) => s + e.hc, 0);
  log(`Empleados: ${EMPLEADOS.length}  total neto: $ ${$(totalNeto)}  total HC: $ ${$(totalHC)}`);

  const a = imprimir('REM1_AJUSTE');
  const b = imprimir('RECONCILIABLE');

  section('RESULTADO');
  const okA = Math.abs(a.desc) < 0.01;
  const okB = Math.abs(b.desc) < 0.01;
  log(`  REM1_AJUSTE:   ${okA ? 'CUADRA ✅' : 'FALLA ❌'}`);
  log(`  RECONCILIABLE: ${okB ? 'CUADRA ✅' : 'FALLA ❌'}`);
  process.exit(okA && okB ? 0 : 1);
})();
