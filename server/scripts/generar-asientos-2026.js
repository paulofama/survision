// ============================================================
// GENERADOR de asientos 2026 - Modulo Sueldos
// ============================================================
// USO:  cd server && node scripts/generar-asientos-2026.js
// Genera/regenera los asientos de 2026 para los meses que tengan netos (minuta)
// + F.931 REVISADO_CONFIRMADO. Los que no, los saltea (ej. junio-2026+ sin datos).
// Criterio por datos: REM1_AJUSTE si rem_1 >= reconciliable, si no RECONCILIABLE.
// Requiere el backend corriendo en localhost:3001.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { supabase } = require('../config/supabase');

const ANIO = 2026;
const BASE = 'http://localhost:3001';
const NOMBRE = 'P. Famá (carga masiva 2026)';
const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function inputsMes(mes) {
  const { data: liq } = await supabase.from('liquidaciones_mes').select('id').eq('anio', ANIO).eq('mes', mes).maybeSingle();
  if (!liq) return null;
  const { data: blqs } = await supabase.from('liquidacion_bloques').select('id, tipo').eq('liquidacion_id', liq.id);
  const bPago = (blqs || []).find((b) => b.tipo === 'pago_sueldos');
  const bSind = (blqs || []).find((b) => b.tipo === 'sindicato');
  let neto = 0, sind = 0;
  if (bPago) { const { data } = await supabase.from('liquidacion_lineas_empleado').select('monto_neto_cargado').eq('bloque_id', bPago.id); neto = (data || []).reduce((s, x) => s + Number(x.monto_neto_cargado), 0); }
  if (bSind) { const { data } = await supabase.from('liquidacion_lineas_concepto').select('monto').eq('bloque_id', bSind.id).eq('concepto_codigo', 'SINDICATO').maybeSingle(); sind = Number(data?.monto || 0); }
  const { data: f931 } = await supabase.from('f931_declaraciones').select('rem_1, aporte_ss_301, aporte_os_302').eq('anio', ANIO).eq('mes', mes).eq('estado', 'REVISADO_CONFIRMADO').maybeSingle();
  if (!f931) return null;
  const reconc = r2(neto + Number(f931.aporte_ss_301 || 0) + Number(f931.aporte_os_302 || 0) + sind);
  return { neto: r2(neto), sind, rem_1: Number(f931.rem_1 || 0), reconc };
}

(async () => {
  console.log('='.repeat(92));
  console.log(`GENERACION DE ASIENTOS ${ANIO}`);
  console.log('='.repeat(92));
  console.log('Mes     | criterio        | neto           | bruto          | ajuste         | cuadra | warns');
  console.log('-'.repeat(92));
  for (let mes = 1; mes <= 12; mes++) {
    const inp = await inputsMes(mes);
    if (!inp) { console.log(`${String(mes).padStart(2)}/${ANIO} | (sin netos+F.931, salteo)`); continue; }
    const criterio = inp.rem_1 >= inp.reconc ? 'REM1_AJUSTE' : 'RECONCILIABLE';
    const resp = await fetch(`${BASE}/api/asientos/${ANIO}/${mes}/generar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criterio, generado_por_nombre: NOMBRE }),
    });
    const j = await resp.json();
    if (!resp.ok) { console.log(`${String(mes).padStart(2)}/${ANIO} | ${criterio.padEnd(15)} | ERROR: ${j.error}`); continue; }
    const c = j.cabecera;
    const cuadra = Math.abs(Number(c.total_debe) - Number(c.total_haber)) < 0.01;
    console.log(`${String(mes).padStart(2)}/${ANIO} | ${criterio.padEnd(15)} | $ ${$(c.total_neto).padStart(12)} | $ ${$(c.bruto_total).padStart(12)} | $ ${$(c.monto_ajuste).padStart(12)} | ${cuadra ? '  SI ' : ' NO '} | ${(j.warnings || []).length}`);
  }
  console.log('-'.repeat(92));
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
