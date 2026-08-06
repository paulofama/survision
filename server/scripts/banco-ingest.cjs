// ============================================================================
// CLI diario de ingesta bancaria: lee el extracto de C:\ia, lo sube (idempotente),
// sincroniza los valores de GECLISA del período y corre la conciliación.
// Sistema de Gestión Integral - Survisión S.A.
//
// Reutiliza el MISMO parser/ingesta/motor que la subida manual del navegador
// (core isomórfico en src/modules/tesoreria/bancos/core/, cargado con import()).
//
// Manejo sin intervención: si no hay archivo, o no cambió desde la última corrida,
// o la validación de saldos falla -> loguea y registra la corrida; nunca deja
// datos a medias. Programable con el Programador de tareas (ver README).
// ============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { supabase } = require('../config/supabase');       // service_role
const { closeConnection } = require('../config/database');
const { sincronizarGeclisaValores } = require('../services/geclisaValoresExtractor');

const DIR_EXTRACTO = process.env.BANCO_EXTRACTO_DIR || 'C:\\ia';
const CORE = path.resolve(__dirname, '..', '..', 'src', 'modules', 'tesoreria', 'bancos', 'core');
const LOG_FILE = path.join(__dirname, '..', 'banco-ingest.log');
const VENTANA_DIAS = 8; // colchón de días para extraer GECLISA alrededor del período

function log(msg) {
  const linea = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${msg}`;
  console.log(linea);
  try { fs.appendFileSync(LOG_FILE, linea + '\n'); } catch { /* ignore */ }
}

async function cargarCore() {
  const ingesta = await import(pathToFileURL(path.join(CORE, 'ingesta.mjs')).href);
  const engine = await import(pathToFileURL(path.join(CORE, 'conciliacionEngine.mjs')).href);
  return { ingesta, engine };
}

// Encuentra el extracto más reciente (acepta variantes "extracto bco*.xlsx").
function encontrarArchivo() {
  try {
    const files = fs.readdirSync(DIR_EXTRACTO)
      .filter((f) => /^extracto\s*bco.*\.xls[xm]?$/i.test(f))
      .map((f) => ({ f, m: fs.statSync(path.join(DIR_EXTRACTO, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return files.length ? path.join(DIR_EXTRACTO, files[0].f) : null;
  } catch { return null; }
}

async function main() {
  log('=== Ingesta bancaria iniciada ===');

  const archivo = encontrarArchivo();
  if (!archivo) { log(`OMITIDA: no se encontró extracto en ${DIR_EXTRACTO} (extracto bco*.xlsx).`); return; }
  const bytes = fs.readFileSync(archivo);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  log(`Archivo: ${path.basename(archivo)} (${bytes.length} bytes, sha256 ${hash.slice(0, 12)}…)`);

  const { data: cuenta } = await supabase.from('banco_cuentas').select('id, nro_cuenta').eq('activa', true).order('created_at').limit(1).maybeSingle();
  if (!cuenta) { log('OMITIDA: no hay cuenta bancaria configurada.'); return; }
  const { data: reglas } = await supabase.from('banco_reglas').select('*').order('orden');

  // ¿El archivo no cambió desde la última corrida OK?
  const { data: ult } = await supabase.from('banco_importaciones')
    .select('archivo_hash, estado').eq('cuenta_id', cuenta.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (ult && ult.estado === 'ok' && ult.archivo_hash === hash) {
    log('OMITIDA: el archivo no cambió desde la última corrida.');
    await supabase.from('banco_importaciones').insert({
      cuenta_id: cuenta.id, estado: 'omitida', motivo: 'archivo sin cambios',
      origen: 'daemon', archivo_nombre: path.basename(archivo), archivo_hash: hash,
    });
    return;
  }

  const { ingesta, engine } = await cargarCore();

  // 1) Ingesta idempotente (parser + validación de saldos + upsert por hash)
  const res = await ingesta.ingestarExtracto({
    supabase, cuentaId: cuenta.id, nroCuenta: cuenta.nro_cuenta,
    bytes: new Uint8Array(bytes), reglas, origen: 'daemon',
    archivoNombre: path.basename(archivo), archivoHash: hash,
  });
  if (!res.ok) { log(`RECHAZADA (no se subió nada): ${res.motivo}`); return; }
  log(`Ingesta OK: ${res.nuevos} nuevos, ${res.duplicados} duplicados | período ${res.resumen.periodoDesde}..${res.resumen.periodoHasta} | saldo final ${res.resumen.saldoFinal}.`);

  // 2) Extracción de GECLISA del período ± ventana
  const d0 = new Date(new Date(res.resumen.periodoDesde + 'T00:00:00Z').getTime() - VENTANA_DIAS * 86400000).toISOString().slice(0, 10);
  const d1 = new Date(new Date(res.resumen.periodoHasta + 'T00:00:00Z').getTime() + VENTANA_DIAS * 86400000).toISOString().slice(0, 10);
  const gv = await sincronizarGeclisaValores({ write: true, desde: d0, hasta: d1 });
  log(`GECLISA valores sincronizados: ${gv.insertados} filas (${d0}..${d1}).`);

  // 3) Conciliación automática del período (1:1 cobranzas/pagos + lote Getnet)
  const c = await engine.conciliarTodo(supabase, {
    cuentaId: cuenta.id, usuario: 'daemon',
    desde: res.resumen.periodoDesde, hasta: res.resumen.periodoHasta,
  });
  log(`Conciliación 1:1: ${c.auto} auto, ${c.ambiguos} ambiguos, ${c.sinCandidato} sin candidato (de ${c.banco} movimientos).`);
  log(`Conciliación Getnet: ${c.getnet.auto} auto, ${c.getnet.ambiguos} ambiguos (de ${c.getnet.getnet} créditos getnet).`);
  log('=== Ingesta bancaria terminada ===');
}

main()
  .then(async () => { await closeConnection(); process.exit(0); })
  .catch(async (e) => { log('ERROR FATAL: ' + e.message); await closeConnection(); process.exit(1); });
