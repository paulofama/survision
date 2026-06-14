// ============================================================
// CARGADOR de Seguridad Social + Sindicato 2025 (Fase 4)
// Modulo Sueldos - Survision S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-ss-sindicato-2025.js            -> DRY-RUN
//   node scripts/cargar-ss-sindicato-2025.js --write     -> escribe
//
// Para cada mes 01..11 de 2025 (12 ya cargado por UI) parsea las secciones
// "Seguridad Social" y "Sindicato" de la hoja MM-2025 y hace upsert de las
// lineas por concepto en los bloques seguridad_social y sindicato.
//
// Plantilla (concepto_nombre/cuenta_contable/origen) tomada de las lineas
// reales de Dic-2025 cargadas por la UI, para consistencia total.
//
// Conceptos no canonicos (Retenciones CSS/COS = retenciones SUSS practicadas)
// se REPORTAN y se SALTEAN (no son parte de los 6 conceptos del bloque).
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { supabase, mensajeError } = require('../config/supabase');

const ARCHIVO = 'C:\\FISCAL\\Minuta contable 2025.xlsx';
const WRITE = process.argv.includes('--write');
const ANIO = 2025;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Plantilla por concepto (de las lineas reales de Dic-2025)
const TPL = {
  APORTE_SS:  { nombre: 'Aporte SS (301)',           cuenta: '2.1.2.02.01' },
  CONTRIB_SS: { nombre: 'Contribución SS (351)',     cuenta: '2.1.2.02.01' },
  APORTE_OS:  { nombre: 'Aporte OS (302)',           cuenta: '2.1.2.02.02' },
  CONTRIB_OS: { nombre: 'Contribución OS (352)',     cuenta: '2.1.2.02.02' },
  ART:        { nombre: 'ART',                        cuenta: '2.1.2.02.03' },
  SCVO:       { nombre: 'SCVO (Seguro Vida Oblig.)', cuenta: '2.1.2.02.04' },
  SINDICATO:  { nombre: 'Cuota sindical',            cuenta: '2.1.2.03' },
};

// Mapeo de etiquetas de la minuta (normalizadas) -> concepto canonico
const SS_MAP = {
  'aporte seguridad social': 'APORTE_SS',
  'contribucion seg social': 'CONTRIB_SS',
  'aporte obra social': 'APORTE_OS',
  'contribuicion obra social': 'CONTRIB_OS',
  'art': 'ART',
  'seguro': 'SCVO',
};
// Filas que son totales/contracuenta, se ignoran sin avisar
const IGNORAR = new Set(['banco', 'caja', 'sumas iguales']);

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const log = console.log;

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function montoDeFila(fila) {
  for (let i = fila.length - 1; i >= 1; i--) {
    const v = fila[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Parsea la seccion SS: devuelve { conceptos: [{codigo,monto}], flags: [labels no mapeados] }
function parsearSS(filas) {
  const conceptos = [], flags = [];
  let dentro = false;
  for (const fila of filas) {
    const c0 = norm(fila[0]);
    if (!dentro) { if (/^seguridad social/.test(c0)) dentro = true; continue; }
    if (/^sindicato/.test(c0)) break;
    if (!c0) continue;
    const monto = montoDeFila(fila);
    if (monto === null) continue;            // fila sin monto (vacia)
    if (IGNORAR.has(c0)) continue;           // total banco / sumas
    const codigo = SS_MAP[c0];
    if (!codigo) { flags.push(`${fila[0]} ($ ${$(monto)})`); continue; }
    conceptos.push({ codigo, monto: r2(monto) });
  }
  return { conceptos, flags };
}

// Parsea la seccion Sindicato: suma las filas de cuota (label "sindicato" con monto)
function parsearSindicato(filas) {
  let total = 0, encontrado = false, dentro = false;
  for (const fila of filas) {
    const c0 = norm(fila[0]);
    if (!dentro) { if (/^sindicato/.test(c0)) dentro = true; continue; }
    const monto = montoDeFila(fila);
    if (monto === null) continue;
    if (IGNORAR.has(c0)) continue;
    // dentro de la seccion, cualquier fila con monto es la cuota (normalmente "Sindicato")
    total += monto; encontrado = true;
  }
  return encontrado ? r2(total) : null;
}

(async () => {
  log('='.repeat(70));
  log(`CARGA SS + SINDICATO ${ANIO} — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  log('='.repeat(70));

  const wb = XLSX.readFile(ARCHIVO);

  const { data: liqs, error: eLiq } = await supabase
    .from('liquidaciones_mes').select('id, mes').eq('anio', ANIO);
  if (eLiq) throw new Error(mensajeError(eLiq));
  const liqByMes = new Map((liqs || []).map((l) => [l.mes, l]));

  let totalSS = 0, totalSind = 0;
  const flagsGlobal = [];

  for (const mes of MESES) {
    const hoja = `${String(mes).padStart(2, '0')}-${ANIO}`;
    const ws = wb.Sheets[hoja];
    if (!ws) { log(`\n${hoja}: hoja inexistente.`); continue; }
    const liq = liqByMes.get(mes);
    if (!liq) { log(`\n${hoja}: SIN liquidacion (corré primero cargar-netos-2025).`); continue; }

    const { data: blqs } = await supabase
      .from('liquidacion_bloques').select('id, tipo').eq('liquidacion_id', liq.id);
    const bloqueSS = (blqs || []).find((b) => b.tipo === 'seguridad_social');
    const bloqueSind = (blqs || []).find((b) => b.tipo === 'sindicato');

    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const { conceptos, flags } = parsearSS(filas);
    const sind = parsearSindicato(filas);

    const sumSS = conceptos.reduce((s, c) => s + c.monto, 0);
    totalSS += sumSS; totalSind += (sind || 0);
    if (flags.length) flagsGlobal.push(`${hoja}: ${flags.join(', ')}`);

    log(`\n${hoja}  SS: ${conceptos.length}/6 conceptos ($ ${$(sumSS)})  | Sindicato: ${sind !== null ? '$ ' + $(sind) : '(no)'}` +
        (flags.length ? `  | salteado: ${flags.join(', ')}` : ''));
    log('   ' + conceptos.map((c) => c.codigo + '=' + $(c.monto)).join('  '));

    if (WRITE) {
      const filasSS = conceptos.map((c) => ({
        bloque_id: bloqueSS.id, concepto_codigo: c.codigo,
        concepto_nombre: TPL[c.codigo].nombre, cuenta_contable: TPL[c.codigo].cuenta,
        monto: c.monto, origen: 'recibo',
      }));
      if (filasSS.length) {
        const { error } = await supabase.from('liquidacion_lineas_concepto')
          .upsert(filasSS, { onConflict: 'bloque_id,concepto_codigo' });
        if (error) throw new Error(`upsert SS ${hoja}: ` + mensajeError(error));
      }
      if (sind !== null && sind > 0) {
        const { error } = await supabase.from('liquidacion_lineas_concepto')
          .upsert([{
            bloque_id: bloqueSind.id, concepto_codigo: 'SINDICATO',
            concepto_nombre: TPL.SINDICATO.nombre, cuenta_contable: TPL.SINDICATO.cuenta,
            monto: sind, origen: 'recibo',
          }], { onConflict: 'bloque_id,concepto_codigo' });
        if (error) throw new Error(`upsert sindicato ${hoja}: ` + mensajeError(error));
      }
    }
  }

  log('\n' + '='.repeat(70));
  log(`Total SS (6 conceptos): $ ${$(totalSS)}    Total Sindicato: $ ${$(totalSind)}`);
  if (flagsGlobal.length) { log('\nConceptos NO canonicos salteados (revisar):'); flagsGlobal.forEach((f) => log('  ' + f)); }
  if (!WRITE) log('\nDRY-RUN. Para escribir: node scripts/cargar-ss-sindicato-2025.js --write');
  else log('\nListo. SS + Sindicato 2025 cargados (meses 01-11).');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
