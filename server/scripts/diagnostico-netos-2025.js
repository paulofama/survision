// ============================================================
// DIAGNOSTICO (read-only) - Estado para carga masiva de netos 2025
// Modulo Sueldos - Fase 4 - Survision S.A.
// ============================================================
// USO:  cd server && node scripts/diagnostico-netos-2025.js
// Para cada mes 2025: si existe liquidacion + bloque pago_sueldos, cuantos
// empleados trae la hoja de la minuta, y cuantos matchean el maestro.
// NO modifica nada.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { supabase, mensajeError } = require('../config/supabase');

const ARCHIVO = 'C:\\FISCAL\\Minuta contable 2025.xlsx';
const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
    out.push({ nombre: String(fila[0]).trim(), monto });
  }
  return out;
}

const ALIAS = { 'giulini claudia': 'giuliani claudia' };

(async () => {
  const wb = XLSX.readFile(ARCHIVO);

  const { data: empleados, error: eEmp } = await supabase
    .from('empleados').select('id, apellido, nombre');
  if (eEmp) throw new Error(mensajeError(eEmp));
  const idx = new Map();
  for (const e of empleados) { idx.set(norm(`${e.apellido} ${e.nombre}`), e); idx.set(norm(`${e.nombre} ${e.apellido}`), e); }
  const match = (n) => idx.get(norm(n)) || (ALIAS[norm(n)] && idx.get(ALIAS[norm(n)])) || null;

  const { data: liqs, error: eLiq } = await supabase
    .from('liquidaciones_mes').select('id, mes, estado').eq('anio', 2025);
  if (eLiq) throw new Error(mensajeError(eLiq));
  const liqByMes = new Map((liqs || []).map((l) => [l.mes, l]));

  let bloquesByLiq = new Map();
  if (liqs && liqs.length) {
    const { data: blqs } = await supabase
      .from('liquidacion_bloques').select('liquidacion_id, tipo').in('liquidacion_id', liqs.map((l) => l.id));
    for (const b of blqs || []) {
      const arr = bloquesByLiq.get(b.liquidacion_id) || []; arr.push(b.tipo); bloquesByLiq.set(b.liquidacion_id, arr);
    }
  }

  log('Mes     | Liq? estado          | bloques pago/hc | Hoja empl | match | sin match (nombres)         | total neto');
  log('-'.repeat(120));
  for (let mes = 1; mes <= 12; mes++) {
    const hoja = `${String(mes).padStart(2, '0')}-2025`;
    const ws = wb.Sheets[hoja];
    const liq = liqByMes.get(mes);
    const bloques = liq ? (bloquesByLiq.get(liq.id) || []) : [];
    const tienePago = bloques.includes('pago_sueldos');
    const tieneHC = bloques.includes('horas_complementarias');

    let nEmpl = 0, nMatch = 0, sinMatch = [], total = 0;
    if (ws) {
      const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      const pago = parsearSeccion(filas, /^pago de sueldos/, /^(pago de horas|seguridad social|sindicato)/);
      nEmpl = pago.length;
      for (const r of pago) { total += r.monto; if (match(r.nombre)) nMatch++; else sinMatch.push(r.nombre); }
    }

    const liqTxt = liq ? `SI  ${liq.estado}`.padEnd(20) : 'NO'.padEnd(20);
    const blqTxt = liq ? `${tienePago ? 'pago' : '----'}/${tieneHC ? 'hc' : '--'}`.padEnd(15) : '---'.padEnd(15);
    const smTxt = sinMatch.length ? sinMatch.join(', ').slice(0, 27) : '-';
    log(`${hoja} | ${liqTxt} | ${blqTxt} | ${String(nEmpl).padStart(9)} | ${String(nMatch).padStart(5)} | ${smTxt.padEnd(27)} | ${$(total).padStart(12)}`);
  }
  log('\n(Solo lectura. No se modifico nada.)');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
