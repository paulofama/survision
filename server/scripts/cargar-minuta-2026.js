// ============================================================
// CARGADOR de minuta 2026 (Fase 4) - Modulo Sueldos
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-minuta-2026.js            -> DRY-RUN
//   node scripts/cargar-minuta-2026.js --write     -> escribe
//
// Procesa TODAS las hojas mensuales MM-2026 presentes en
// 'C:\FISCAL\Minuta contable 2026.xlsx' (hoy solo 01-2026). Para cada mes:
//   1. Inicializa la liquidacion + 4 bloques si no existe.
//   2. Carga Pago de Sueldos (recibo) + HC (facturado) por empleado.
//   3. Carga Seguridad Social (6 conceptos) + Sindicato.
// NO carga F.931 (el de enero-2026 es un VEP; feb/mar no tienen minuta).
// Idempotente (upserts). Empleados/facturadores sin match se reportan y saltean.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { supabase, mensajeError } = require('../config/supabase');

const ARCHIVO = 'C:\\FISCAL\\Minuta contable 2026 (2).xlsx';
const WRITE = process.argv.includes('--write');
const ANIO = 2026;
const CTA_BANCO = '1.1.1.03';
const CTA_CAJA = '1.1.1.01';

const TPL = {
  APORTE_SS:  { nombre: 'Aporte SS (301)',           cuenta: '2.1.2.02.01' },
  CONTRIB_SS: { nombre: 'Contribución SS (351)',     cuenta: '2.1.2.02.01' },
  APORTE_OS:  { nombre: 'Aporte OS (302)',           cuenta: '2.1.2.02.02' },
  CONTRIB_OS: { nombre: 'Contribución OS (352)',     cuenta: '2.1.2.02.02' },
  ART:        { nombre: 'ART',                        cuenta: '2.1.2.02.03' },
  SCVO:       { nombre: 'SCVO (Seguro Vida Oblig.)', cuenta: '2.1.2.02.04' },
  SINDICATO:  { nombre: 'Cuota sindical',            cuenta: '2.1.2.03' },
};
const SS_MAP = {
  'aporte seguridad social': 'APORTE_SS', 'contribucion seg social': 'CONTRIB_SS',
  'aporte obra social': 'APORTE_OS', 'contribuicion obra social': 'CONTRIB_OS',
  'art': 'ART', 'seguro': 'SCVO',
};
const ALIAS = { 'giulini claudia': 'giuliani claudia' };
const IGNORAR = new Set(['banco', 'caja', 'sumas iguales']);

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const log = console.log;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// Agrega lineas por empleado (suma montos): la minuta puede traer 2+ bloques del
// mismo tipo (ej. 03-2026 tiene 2 bloques de HC) -> se suman por empleado para no
// romper el upsert (mismo bloque_id,empleado_id repetido en el lote).
function aggLineas(arr) {
  const m = new Map();
  for (const x of arr) {
    const prev = m.get(x.empleado_id);
    if (prev) prev.monto_neto_cargado = r2(prev.monto_neto_cargado + x.monto_neto_cargado);
    else m.set(x.empleado_id, { ...x });
  }
  return [...m.values()];
}
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function montoFila(fila) { for (let i = fila.length - 1; i >= 1; i--) { const v = fila[i]; if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v); } return null; }
function seccionEmpleados(filas, headerRe, finRe) {
  const o = []; let d = false;
  for (const fila of filas) { const c = norm(fila[0]);
    if (!d) { if (headerRe.test(c)) d = true; continue; }
    if (finRe.test(c)) break;
    if (!c || c.startsWith('area ') || IGNORAR.has(c)) continue;
    const m = montoFila(fila); if (m === null) continue;
    o.push({ nombre: String(fila[0]).trim(), monto: r2(m) });
  }
  return o;
}

async function inicializarMes(mes) {
  const { data: liqRow, error: e1 } = await supabase.from('liquidaciones_mes')
    .insert({ anio: ANIO, mes, estado: 'VACIO', observaciones: 'Inicializado por carga minuta 2026' }).select().single();
  if (e1) throw new Error('crear liquidacion ' + mes + ': ' + mensajeError(e1));
  const bloques = [
    { liquidacion_id: liqRow.id, tipo: 'pago_sueldos', medio_pago: 'banco_santander_rio', cuenta_contracuenta: CTA_BANCO, completo: false },
    { liquidacion_id: liqRow.id, tipo: 'horas_complementarias', medio_pago: 'caja', cuenta_contracuenta: CTA_CAJA, completo: false },
    { liquidacion_id: liqRow.id, tipo: 'seguridad_social', medio_pago: 'banco_santander_rio', cuenta_contracuenta: CTA_BANCO, completo: false },
    { liquidacion_id: liqRow.id, tipo: 'sindicato', medio_pago: 'banco_santander_rio', cuenta_contracuenta: CTA_BANCO, completo: false },
  ];
  const { error: e2 } = await supabase.from('liquidacion_bloques').insert(bloques);
  if (e2) { await supabase.from('liquidaciones_mes').delete().eq('id', liqRow.id); throw new Error('crear bloques ' + mes + ': ' + mensajeError(e2)); }
  return liqRow.id;
}

(async () => {
  log('='.repeat(66));
  log(`CARGA MINUTA ${ANIO} — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  log('='.repeat(66));

  const wb = XLSX.readFile(ARCHIVO);
  const hojasMes = wb.SheetNames.filter((s) => /^\d{2}-2026$/.test(s)).sort();
  log('Hojas mensuales encontradas: ' + (hojasMes.join(', ') || '(ninguna)'));

  const { data: emps, error: eEmp } = await supabase.from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (eEmp) throw new Error(mensajeError(eEmp));
  const idx = new Map();
  for (const e of emps) { idx.set(norm(`${e.apellido} ${e.nombre}`), e); idx.set(norm(`${e.nombre} ${e.apellido}`), e); }
  const match = (n) => idx.get(norm(n)) || (ALIAS[norm(n)] && idx.get(ALIAS[norm(n)])) || null;

  const { data: liqs } = await supabase.from('liquidaciones_mes').select('id, mes').eq('anio', ANIO);
  const liqByMes = new Map((liqs || []).map((l) => [l.mes, l]));

  for (const hoja of hojasMes) {
    const mes = parseInt(hoja.split('-')[0], 10);
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: '' });

    const pago = seccionEmpleados(filas, /^pago de sueldos/, /^(pago de horas|seguridad social|sindicato)/);
    const hc = seccionEmpleados(filas, /^pago de horas/, /^(seguridad social|sindicato)/);
    // SS por concepto
    const ssRows = seccionEmpleados(filas, /^seguridad social/, /^sindicato/);
    const ss = []; const ssFlags = [];
    for (const r of ssRows) { const cod = SS_MAP[norm(r.nombre)]; if (cod) ss.push({ cod, monto: r.monto }); else ssFlags.push(`${r.nombre} ($${$(r.monto)})`); }
    // Sindicato (suma filas con monto en la seccion)
    let sind = 0, sindOk = false;
    { let d = false; for (const fila of filas) { const c = norm(fila[0]); if (!d) { if (/^sindicato/.test(c)) d = true; continue; } const m = montoFila(fila); if (m === null || IGNORAR.has(c)) continue; sind += m; sindOk = true; } sind = r2(sind); }

    // liquidacion + bloques
    let liq = liqByMes.get(mes), creada = false;
    if (!liq) { if (WRITE) { const id = await inicializarMes(mes); liq = { id, mes }; } creada = true; }
    let bP = null, bH = null, bSS = null, bSind = null;
    if (liq && liq.id) { const { data: blqs } = await supabase.from('liquidacion_bloques').select('id, tipo').eq('liquidacion_id', liq.id);
      bP = (blqs||[]).find(b=>b.tipo==='pago_sueldos')?.id; bH=(blqs||[]).find(b=>b.tipo==='horas_complementarias')?.id;
      bSS=(blqs||[]).find(b=>b.tipo==='seguridad_social')?.id; bSind=(blqs||[]).find(b=>b.tipo==='sindicato')?.id; }

    const pIns = [], pSkip = [], hIns = [], hSkip = [];
    for (const r of pago) { const e = match(r.nombre); if (e) pIns.push({ bloque_id: bP, empleado_id: e.id, monto_neto_cargado: r.monto, origen: 'recibo', area_snapshot: e.area, cuenta_contable_snapshot: e.cuenta_contable }); else pSkip.push(r.nombre); }
    for (const r of hc) { const e = match(r.nombre); if (e) hIns.push({ bloque_id: bH, empleado_id: e.id, monto_neto_cargado: r.monto, origen: 'facturado', area_snapshot: e.area, cuenta_contable_snapshot: e.cuenta_contable }); else hSkip.push(r.nombre); }

    log(`\n${hoja}  liq=${liq ? (creada ? 'CREAR/creada' : 'existe') : 'CREAR'}`);
    log(`  Pago: ${pIns.length} ok ($${$(pIns.reduce((s,x)=>s+x.monto_neto_cargado,0))})${pSkip.length?' | salteo ['+pSkip.join(', ')+']':''}`);
    log(`  HC:   ${hIns.length} ok${hSkip.length?' | salteo ['+hSkip.join(', ')+']':''}`);
    log(`  SS:   ${ss.length}/6 conceptos ($${$(ss.reduce((s,x)=>s+x.monto,0))})${ssFlags.length?' | salteo '+ssFlags.join(', '):''}`);
    log(`  Sind: ${sindOk?'$'+$(sind):'(no)'}`);

    if (WRITE && liq) {
      if (pIns.length) { const { error } = await supabase.from('liquidacion_lineas_empleado').upsert(aggLineas(pIns), { onConflict: 'bloque_id,empleado_id' }); if (error) throw new Error('pago '+hoja+': '+mensajeError(error)); }
      if (hIns.length) { const { error } = await supabase.from('liquidacion_lineas_empleado').upsert(aggLineas(hIns), { onConflict: 'bloque_id,empleado_id' }); if (error) throw new Error('hc '+hoja+': '+mensajeError(error)); }
      if (ss.length) { const rows = ss.map(c=>({ bloque_id: bSS, concepto_codigo: c.cod, concepto_nombre: TPL[c.cod].nombre, cuenta_contable: TPL[c.cod].cuenta, monto: c.monto, origen: 'recibo' })); const { error } = await supabase.from('liquidacion_lineas_concepto').upsert(rows, { onConflict: 'bloque_id,concepto_codigo' }); if (error) throw new Error('ss '+hoja+': '+mensajeError(error)); }
      if (sindOk && sind > 0) { const { error } = await supabase.from('liquidacion_lineas_concepto').upsert([{ bloque_id: bSind, concepto_codigo: 'SINDICATO', concepto_nombre: TPL.SINDICATO.nombre, cuenta_contable: TPL.SINDICATO.cuenta, monto: sind, origen: 'recibo' }], { onConflict: 'bloque_id,concepto_codigo' }); if (error) throw new Error('sind '+hoja+': '+mensajeError(error)); }
    }
  }

  log('\n' + '='.repeat(66));
  if (!WRITE) log('DRY-RUN. Para escribir: node scripts/cargar-minuta-2026.js --write');
  else log('Listo. Minuta 2026 cargada (meses presentes en el Excel).');
  log('NOTA: los asientos se generan con generar-asientos-2026.js (para los meses con F.931 confirmado).');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
