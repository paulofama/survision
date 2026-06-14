// ============================================================
// PROTOTIPO (read-only) - Propuesta de Asiento de devengamiento
// Modulo Sueldos - Fase 4 - Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// USO:
//   cd server
//   node scripts/prototipo-asiento.js [anio] [mes]   (default: 2025 12)
//
// QUE HACE (NO MODIFICA DATOS, solo SELECT):
//   1. Carga la liquidacion completa del periodo (bloques + lineas) y el F.931
//      confirmado del mes desde Supabase.
//   2. Calcula el BRUTO ESTIMADO por empleado con reparto proporcional segun
//      el peso de su neto sobre el total (metodologia CLAUDE.md), usando como
//      total a repartir DOS bases alternativas para que Paulo elija:
//        (A) Rem.1 del F.931  -> lectura literal de CLAUDE.md
//        (B) Bruto reconciliable = sum(netos) + aporte_301 + aporte_302 + sindicato
//            -> hace que el asiento cuadre por construccion
//   3. Arma la propuesta de asiento (Debe/Haber) con ambos criterios y muestra
//      el descuadre resultante.
//
// El objetivo es validar la metodologia con numeros reales ANTES de crear la
// migracion 05 y las tablas de asiento.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { supabase, mensajeError } = require('../config/supabase');

// ------------------------------------------------------------
// Cuentas (espejo de src/utils/sueldos/constantes.ts)
// ------------------------------------------------------------
const CTA = {
  SUELDOS_AREA: {
    'Administración': '4.1.1.01',
    'Limpieza': '4.1.1.02',
    'Cirugías': '4.1.1.03',
    'Medición': '4.1.1.05',
    'Recepción': '4.1.1.06',
    'Cajera': '4.1.1.07',
    'Telefonista': '4.1.1.08',
  },
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

// ------------------------------------------------------------
// Helpers de formato AR + numeros
// ------------------------------------------------------------
const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const log = console.log;
const section = (t) => log('\n' + '='.repeat(64) + '\n' + t + '\n' + '='.repeat(64));

// ------------------------------------------------------------
// Carga de datos (mismos queries que routes/conciliacion.js)
// ------------------------------------------------------------
async function cargarLiquidacionCompleta(anio, mes) {
  const { data: liqRow, error: liqErr } = await supabase
    .from('liquidaciones_mes').select('*').eq('anio', anio).eq('mes', mes).maybeSingle();
  if (liqErr) throw new Error(mensajeError(liqErr));
  if (!liqRow) return null;

  const { data: bloques, error: blqErr } = await supabase
    .from('liquidacion_bloques').select('*').eq('liquidacion_id', liqRow.id);
  if (blqErr) throw new Error(mensajeError(blqErr));

  const bloqueIds = (bloques || []).map((b) => b.id);
  let lineasEmp = [], lineasConc = [];
  if (bloqueIds.length > 0) {
    const [empRes, concRes] = await Promise.all([
      supabase.from('liquidacion_lineas_empleado').select('*').in('bloque_id', bloqueIds),
      supabase.from('liquidacion_lineas_concepto').select('*').in('bloque_id', bloqueIds),
    ]);
    if (empRes.error) throw new Error(mensajeError(empRes.error));
    if (concRes.error) throw new Error(mensajeError(concRes.error));
    lineasEmp = empRes.data || [];
    lineasConc = concRes.data || [];
  }

  const bloquesCompletos = (bloques || []).map((b) => ({
    ...b,
    lineas_empleado: lineasEmp.filter((l) => l.bloque_id === b.id),
    lineas_concepto: lineasConc.filter((l) => l.bloque_id === b.id),
  }));
  return { ...liqRow, bloques: bloquesCompletos };
}

async function cargarF931Confirmado(anio, mes) {
  const { data, error } = await supabase
    .from('f931_declaraciones').select('*')
    .eq('anio', anio).eq('mes', mes).eq('estado', 'REVISADO_CONFIRMADO')
    .order('confirmado_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(mensajeError(error));
  return data || null;
}

async function cargarEmpleados() {
  const { data, error } = await supabase.from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (error) throw new Error(mensajeError(error));
  const map = new Map();
  for (const e of data || []) map.set(e.id, e);
  return map;
}

// ------------------------------------------------------------
// Logica del asiento
// ------------------------------------------------------------
function buscarBloque(liq, tipo) {
  return (liq.bloques || []).find((b) => b.tipo === tipo) || null;
}

function lineaConcepto(bloque, codigo) {
  if (!bloque) return 0;
  const l = (bloque.lineas_concepto || []).find((x) => x.concepto_codigo === codigo);
  return num(l?.monto);
}

/**
 * Reparte un total entre empleados segun el peso de su neto. Ajusta el ultimo
 * para que la suma cierre exacto (evita centavos perdidos por redondeo).
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

function construirAsiento(liq, f931, empleados, criterio) {
  const bloquePago = buscarBloque(liq, 'pago_sueldos');
  const lineasPago = bloquePago ? bloquePago.lineas_empleado : [];
  const totalNeto = lineasPago.reduce((s, l) => s + num(l.monto_neto_cargado), 0);

  const aporte301 = num(f931.aporte_ss_301);
  const aporte302 = num(f931.aporte_os_302);
  const contrib351 = num(f931.contrib_ss_351);
  const contrib352 = num(f931.contrib_os_352);
  const art = num(f931.art);
  const scvo = num(f931.scvo);
  const sindicato = lineaConcepto(buscarBloque(liq, 'sindicato'), 'SINDICATO');

  const brutoReconciliable = r2(totalNeto + aporte301 + aporte302 + sindicato);
  const totalARepartir = criterio === 'rem1' ? num(f931.rem_1) : brutoReconciliable;

  const repartidas = repartirPorNeto(lineasPago, totalARepartir);

  // Debe: sueldos por area
  const porArea = new Map();
  for (const l of repartidas) {
    const emp = empleados.get(l.empleado_id);
    const area = l.area_snapshot || emp?.area || 'Administración';
    const cuenta = l.cuenta_contable_snapshot || emp?.cuenta_contable || CTA.SUELDOS_AREA[area] || '4.1.1.01';
    const k = `${cuenta}::${area}`;
    porArea.set(k, r2((porArea.get(k) || 0) + num(l.bruto)));
  }

  const debe = [];
  for (const [k, monto] of porArea) {
    const [cuenta, area] = k.split('::');
    debe.push({ cuenta, detalle: `Sueldos ${area}`, monto });
  }
  debe.push({ cuenta: CTA.CONTRIB_SS, detalle: 'Contribuciones Seguridad Social (351)', monto: contrib351 });
  debe.push({ cuenta: CTA.CONTRIB_OS, detalle: 'Contribuciones Obra Social (352)', monto: contrib352 });
  debe.push({ cuenta: CTA.ART_GASTO, detalle: 'ART', monto: art });
  debe.push({ cuenta: CTA.SCVO_GASTO, detalle: 'SCVO', monto: scvo });

  const haber = [];
  haber.push({ cuenta: CTA.SUELDOS_A_PAGAR, detalle: 'Sueldos y jornales a pagar (neto)', monto: totalNeto });
  haber.push({ cuenta: CTA.SS_A_PAGAR, detalle: 'SS a pagar (301+351)', monto: r2(aporte301 + contrib351) });
  haber.push({ cuenta: CTA.OS_A_PAGAR, detalle: 'OS a pagar (302+352)', monto: r2(aporte302 + contrib352) });
  haber.push({ cuenta: CTA.ART_A_PAGAR, detalle: 'ART a pagar', monto: art });
  haber.push({ cuenta: CTA.SCVO_A_PAGAR, detalle: 'SCVO a pagar', monto: scvo });
  if (sindicato > 0) haber.push({ cuenta: CTA.SINDICATO_A_PAGAR, detalle: 'Sindicato a pagar', monto: sindicato });

  const totalDebe = r2(debe.reduce((s, l) => s + l.monto, 0));
  const totalHaber = r2(haber.reduce((s, l) => s + l.monto, 0));

  return { debe, haber, totalDebe, totalHaber, totalNeto, brutoReconciliable, totalARepartir, repartidas, empleados,
           f931: { aporte301, aporte302, contrib351, contrib352, art, scvo, sindicato, rem_1: num(f931.rem_1) } };
}

function imprimirAsiento(titulo, a) {
  section(titulo);
  log(`Total a repartir como bruto: $ ${$(a.totalARepartir)}`);
  log('');
  log('  DEBE');
  for (const l of a.debe) log(`    ${l.cuenta.padEnd(13)} ${l.detalle.padEnd(42)} $ ${$(l.monto).padStart(15)}`);
  log(`    ${''.padEnd(13)} ${'TOTAL DEBE'.padEnd(42)} $ ${$(a.totalDebe).padStart(15)}`);
  log('');
  log('  HABER');
  for (const l of a.haber) log(`    ${l.cuenta.padEnd(13)} ${l.detalle.padEnd(42)} $ ${$(l.monto).padStart(15)}`);
  log(`    ${''.padEnd(13)} ${'TOTAL HABER'.padEnd(42)} $ ${$(a.totalHaber).padStart(15)}`);
  log('');
  const desc = r2(a.totalDebe - a.totalHaber);
  if (Math.abs(desc) < 0.01) log('  >> CUADRA (descuadre $ 0,00)');
  else log(`  >> DESCUADRE: $ ${$(desc)}  (Debe - Haber)`);
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {
  const anio = parseInt(process.argv[2], 10) || 2025;
  const mes = parseInt(process.argv[3], 10) || 12;

  section(`PROTOTIPO ASIENTO DEVENGAMIENTO - ${mes}/${anio}`);

  const liq = await cargarLiquidacionCompleta(anio, mes);
  if (!liq) { log(`\nNo hay liquidacion para ${mes}/${anio}. Abortando.`); process.exit(0); }
  log(`Liquidacion: estado=${liq.estado}  bloques=${liq.bloques.length}`);

  const f931 = await cargarF931Confirmado(anio, mes);
  if (!f931) { log(`\nNo hay F.931 confirmado para ${mes}/${anio}. Abortando.`); process.exit(0); }
  log(`F.931: rem_1=$ ${$(f931.rem_1)}  cant_trab=${f931.cantidad_trabajadores}`);

  const empleados = await cargarEmpleados();

  // Diagnostico de datos cargados
  section('DATOS DE LA MINUTA (por bloque)');
  for (const tipo of ['pago_sueldos', 'horas_complementarias', 'dia_sanidad', 'seguridad_social', 'sindicato']) {
    const b = buscarBloque(liq, tipo);
    if (!b) { log(`  ${tipo.padEnd(22)} (sin bloque)`); continue; }
    const ne = (b.lineas_empleado || []).length;
    const nc = (b.lineas_concepto || []).length;
    const sumE = (b.lineas_empleado || []).reduce((s, l) => s + num(l.monto_neto_cargado), 0);
    const sumC = (b.lineas_concepto || []).reduce((s, l) => s + num(l.monto), 0);
    log(`  ${tipo.padEnd(22)} lineas_emp=${ne} ($ ${$(sumE)})  lineas_conc=${nc} ($ ${$(sumC)})  completo=${b.completo}`);
  }

  const bloquePago = buscarBloque(liq, 'pago_sueldos');
  const nLineasPago = bloquePago ? (bloquePago.lineas_empleado || []).length : 0;
  if (nLineasPago === 0) {
    section('SIN DATOS DE PAGO DE SUELDOS');
    log('El bloque pago_sueldos no tiene lineas por empleado cargadas para este mes.');
    log('No se puede repartir el bruto. Cargar la minuta de Pago de Sueldos y reintentar.');
    process.exit(0);
  }

  // Construir y mostrar ambos criterios
  const aRem1 = construirAsiento(liq, f931, empleados, 'rem1');
  const aRecon = construirAsiento(liq, f931, empleados, 'reconciliable');

  section('RECONCILIACION DEL BRUTO');
  log(`  Suma de netos (minuta pago_sueldos):      $ ${$(aRecon.totalNeto)}`);
  log(`  + Aporte 301 (SS empleado, F.931):        $ ${$(aRecon.f931.aporte301)}`);
  log(`  + Aporte 302 (OS empleado, F.931):        $ ${$(aRecon.f931.aporte302)}`);
  log(`  + Sindicato (minuta):                     $ ${$(aRecon.f931.sindicato)}`);
  log(`  = Bruto reconciliable (B):                $ ${$(aRecon.brutoReconciliable)}`);
  log(`  Rem.1 del F.931 (A):                      $ ${$(aRecon.f931.rem_1)}`);
  log(`  Gap (Rem.1 - Bruto reconciliable):        $ ${$(r2(aRecon.f931.rem_1 - aRecon.brutoReconciliable))}`);

  imprimirAsiento('CRITERIO A: BRUTO = REM.1 DEL F.931 (lectura literal CLAUDE.md)', aRem1);
  imprimirAsiento('CRITERIO B: BRUTO = NETO + APORTES + SINDICATO (reconciliable)', aRecon);

  section('REPARTO POR EMPLEADO (criterio B - reconciliable)');
  for (const l of aRecon.repartidas) {
    const emp = empleados.get(l.empleado_id);
    const nombre = emp ? `${emp.apellido}, ${emp.nombre}` : l.empleado_id;
    log(`  ${nombre.padEnd(32)} neto $ ${$(l.monto_neto_cargado).padStart(13)}  ->  bruto $ ${$(l.bruto).padStart(13)}`);
  }

  log('\nFIN DEL PROTOTIPO (no se modifico ningun dato).');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
