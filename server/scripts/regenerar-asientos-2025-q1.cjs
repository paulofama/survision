// Regenera los asientos de ene/feb/mar 2025 tras agregar a Castillo Romina.
// Misma logica de criterio que generar-asientos-2025.js. Backend en :3001.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { supabase } = require('../config/supabase');
const ANIO = 2025, BASE = 'http://localhost:3001', NOMBRE = 'P. Famá (re-gen Castillo)';
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
  return { neto: r2(neto), rem_1: Number(f931.rem_1 || 0), reconc };
}

(async () => {
  console.log('Regeneracion asientos 2025 Q1 (ene/feb/mar) — incluye Castillo Romina\n');
  for (const mes of [1, 2, 3]) {
    const inp = await inputsMes(mes);
    if (!inp) { console.log(`${mes}/2025: sin datos suficientes, salteo`); continue; }
    const criterio = inp.rem_1 >= inp.reconc ? 'REM1_AJUSTE' : 'RECONCILIABLE';
    const resp = await fetch(`${BASE}/api/asientos/${ANIO}/${mes}/generar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criterio, generado_por_nombre: NOMBRE }),
    });
    const j = await resp.json();
    if (!resp.ok) { console.log(`${mes}/2025 | ${criterio} | ERROR: ${j.error}`); continue; }
    const c = j.cabecera;
    const cuadra = Math.abs(Number(c.total_debe) - Number(c.total_haber)) < 0.01;
    console.log(`${mes}/2025 | ${criterio.padEnd(13)} | neto $ ${$(c.total_neto).padStart(13)} | bruto $ ${$(c.bruto_total).padStart(13)} | ajuste $ ${$(c.monto_ajuste).padStart(11)} | cuadra=${cuadra ? 'SI' : 'NO'} | warns=${(j.warnings || []).length}`);
  }
  process.exit(0);
})();
