// ============================================================
// GENERADOR MASIVO de asientos 2025 (Fase 4) - Modulo Sueldos
// ============================================================
// USO:  cd server && node scripts/generar-asientos-2025.js
//
// Para cada mes 1..12 de 2025 elige el criterio de bruto segun los datos:
//   - Si Rem.1 >= (neto + aporte_301 + aporte_302 + sindicato) -> REM1_AJUSTE
//     (ajuste positivo = retenciones reales no capturadas en la minuta)
//   - Si no (Rem.1 topeado por debajo del bruto, p.ej. aguinaldo/tope) ->
//     RECONCILIABLE (cuadra sin linea-plug negativa)
// y llama a generarYPersistirAsiento() del servicio de orquestacion, que es la
// misma logica que corre detras de POST /api/asientos/:anio/:mes/generar.
//
// NO requiere el backend levantado.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { supabase, mensajeError } = require('../config/supabase');
// Llama al servicio directo, no por HTTP: la ruta exige JWT desde que se agrego
// autenticacion y este script es anterior (corregido 2026-08-24).
const { generarYPersistirAsiento, ErrorAsiento } = require('../services/asientoPersistencia');

const ANIO = 2025;
const NOMBRE = 'P. Famá (carga masiva)';
const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const log = console.log;
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
  log('='.repeat(92));
  log(`GENERACION MASIVA DE ASIENTOS ${ANIO}`);
  log('='.repeat(92));
  log('Mes     | criterio        | neto           | bruto          | ajuste         | cuadra | warns');
  log('-'.repeat(92));

  for (let mes = 1; mes <= 12; mes++) {
    const inp = await inputsMes(mes);
    if (!inp) { log(`${String(mes).padStart(2)}/${ANIO} | (sin datos suficientes, salteo)`); continue; }

    const criterio = inp.rem_1 >= inp.reconc ? 'REM1_AJUSTE' : 'RECONCILIABLE';

    let r;
    try {
      r = await generarYPersistirAsiento(ANIO, mes, { criterio, generadoPorNombre: NOMBRE });
    } catch (e) {
      if (e instanceof ErrorAsiento) {
        log(`${String(mes).padStart(2)}/${ANIO} | ${criterio.padEnd(15)} | ${e.codigo}: ${e.message}`);
        continue;
      }
      throw e;
    }

    const c = r.cabecera;
    const cuadra = Math.abs(Number(c.total_debe) - Number(c.total_haber)) < 0.01;
    log(`${String(mes).padStart(2)}/${ANIO} | ${criterio.padEnd(15)} | $ ${$(c.total_neto).padStart(12)} | $ ${$(c.bruto_total).padStart(12)} | $ ${$(c.monto_ajuste).padStart(12)} | ${cuadra ? '  SI ' : ' NO '} | ${(r.warnings || []).length}`);
  }

  log('-'.repeat(92));
  log('Nota: ene/feb/mar tienen el neto sin "Castillo Romina" (no esta en el maestro) -> bruto/reparto incompletos en esos meses.');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
