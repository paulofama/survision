// ============================================================
// CARGADOR MASIVO de netos 2025 (Fase 4) - Modulo Sueldos
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-netos-2025.js            -> DRY-RUN (no escribe)
//   node scripts/cargar-netos-2025.js --write     -> inicializa meses + carga
//
// Para cada mes 01..11 de 2025 (12 ya esta cargado):
//   1. Si no existe liquidacion, la crea (estado VACIO) + 4 bloques estables
//      (replica inicializarMes del front).
//   2. Parsea la hoja MM-2025 de la minuta xlsx, matchea contra empleados y
//      hace upsert de las lineas de Pago de Sueldos (recibo) y Horas
//      Complementarias (facturado).
// Empleados sin match (ej. Castillo Romina ene-mar, no esta en el maestro;
// Rodriguez/Narambuena en HC = facturan honorarios) se reportan y se saltean.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { supabase, mensajeError } = require('../config/supabase');

const ARCHIVO = 'C:\\FISCAL\\Minuta contable 2025.xlsx';
const WRITE = process.argv.includes('--write');
const ANIO = 2025;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 12 ya cargado

// Cuentas activos (espejo de constantes.ts)
const CTA_BANCO = '1.1.1.03';
const CTA_CAJA = '1.1.1.01';

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const log = console.log;

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
const STOP = ['caja', 'banco', 'sumas iguales', 'retenciones css', 'retenciones cos'];
function parsearSeccion(filas, headerRegex, finRegex) {
  const out = []; let dentro = false;
  for (const fila of filas) {
    const c0 = norm(fila[0]);
    if (!dentro) { if (headerRegex.test(c0)) dentro = true; continue; }
    if (finRegex.test(c0)) break;
    if (!c0 || c0.startsWith('area ') || STOP.includes(c0)) continue;
    let monto = null;
    for (let i = fila.length - 1; i >= 1; i--) {
      const v = fila[i];
      if (typeof v === 'number' && Number.isFinite(v)) { monto = v; break; }
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) { monto = Number(v); break; }
    }
    if (monto === null) continue;
    out.push({ nombre: String(fila[0]).trim(), monto: Math.round(monto * 100) / 100 });
  }
  return out;
}
const ALIAS = { 'giulini claudia': 'giuliani claudia' }; // typo del Excel

// Crea liquidacion + 4 bloques estables (replica inicializarMes del front)
async function inicializarMes(mes) {
  const { data: liqRow, error: e1 } = await supabase
    .from('liquidaciones_mes')
    .insert({ anio: ANIO, mes, estado: 'VACIO', observaciones: 'Inicializado por carga masiva netos 2025' })
    .select().single();
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
  log('='.repeat(70));
  log(`CARGA MASIVA NETOS ${ANIO} — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  log('='.repeat(70));

  const wb = XLSX.readFile(ARCHIVO);

  const { data: empleados, error: eEmp } = await supabase
    .from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (eEmp) throw new Error(mensajeError(eEmp));
  const idx = new Map();
  for (const e of empleados) { idx.set(norm(`${e.apellido} ${e.nombre}`), e); idx.set(norm(`${e.nombre} ${e.apellido}`), e); }
  const match = (n) => idx.get(norm(n)) || (ALIAS[norm(n)] && idx.get(ALIAS[norm(n)])) || null;

  const { data: liqs } = await supabase.from('liquidaciones_mes').select('id, mes').eq('anio', ANIO);
  const liqByMes = new Map((liqs || []).map((l) => [l.mes, l]));

  const skippedGlobal = new Set();
  let totalPago = 0, totalHC = 0;

  for (const mes of MESES) {
    const hoja = `${String(mes).padStart(2, '0')}-${ANIO}`;
    const ws = wb.Sheets[hoja];
    if (!ws) { log(`\n${hoja}: hoja inexistente, salteo.`); continue; }
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const pago = parsearSeccion(filas, /^pago de sueldos/, /^(pago de horas|seguridad social|sindicato)/);
    const hc = parsearSeccion(filas, /^pago de horas/, /^(seguridad social|sindicato)/);

    // liquidacion + bloques
    let liq = liqByMes.get(mes);
    let bloquePagoId = null, bloqueHCId = null, creada = false;
    if (!liq) {
      if (WRITE) { const id = await inicializarMes(mes); liq = { id, mes }; creada = true; }
      else { creada = true; } // en dry-run marcamos que se crearia
    }
    if (liq && liq.id) {
      const { data: blqs } = await supabase.from('liquidacion_bloques').select('id, tipo').eq('liquidacion_id', liq.id);
      bloquePagoId = (blqs || []).find((b) => b.tipo === 'pago_sueldos')?.id || null;
      bloqueHCId = (blqs || []).find((b) => b.tipo === 'horas_complementarias')?.id || null;
    }

    // match + armar lineas
    function preparar(filasSec, origen, bloqueId) {
      const ins = [], skip = [];
      for (const r of filasSec) {
        const emp = match(r.nombre);
        if (!emp) { skip.push(r.nombre); skippedGlobal.add(r.nombre); continue; }
        ins.push({ bloque_id: bloqueId, empleado_id: emp.id, monto_neto_cargado: r.monto, origen, area_snapshot: emp.area, cuenta_contable_snapshot: emp.cuenta_contable });
      }
      return { ins, skip };
    }
    const p = preparar(pago, 'recibo', bloquePagoId);
    const h = preparar(hc, 'facturado', bloqueHCId);
    totalPago += p.ins.reduce((s, r) => s + r.monto_neto_cargado, 0);
    totalHC += h.ins.reduce((s, r) => s + r.monto_neto_cargado, 0);

    log(`\n${hoja}  liq=${liq ? (creada ? 'CREAR/creada' : 'existe') : 'CREAR'}  | Pago: ${p.ins.length} ok${p.skip.length ? ', salteo [' + p.skip.join(', ') + ']' : ''}  | HC: ${h.ins.length} ok${h.skip.length ? ', salteo ' + h.skip.length : ''}`);

    if (WRITE) {
      if (p.ins.length && bloquePagoId) {
        const { error } = await supabase.from('liquidacion_lineas_empleado').upsert(p.ins, { onConflict: 'bloque_id,empleado_id' });
        if (error) throw new Error(`upsert pago ${hoja}: ` + mensajeError(error));
      }
      if (h.ins.length && bloqueHCId) {
        const { error } = await supabase.from('liquidacion_lineas_empleado').upsert(h.ins, { onConflict: 'bloque_id,empleado_id' });
        if (error) throw new Error(`upsert hc ${hoja}: ` + mensajeError(error));
      }
    }
  }

  log('\n' + '='.repeat(70));
  log(`Total netos Pago de Sueldos (matcheados): $ ${$(totalPago)}`);
  log(`Total HC (matcheados):                    $ ${$(totalHC)}`);
  if (skippedGlobal.size) log(`Empleados sin match (salteados): ${[...skippedGlobal].join(', ')}`);
  if (!WRITE) log('\nDRY-RUN. Para escribir: node scripts/cargar-netos-2025.js --write');
  else log('\nListo. Netos 2025 cargados (meses 01-11).');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
