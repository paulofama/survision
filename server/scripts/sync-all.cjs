// ============================================================
// DAEMON DE SYNC: GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Corre TODOS los extractores de sync (GECLISA -> Supabase) registrados.
// A medida que se sumen módulos (movimientos, tesorería, etc.), se agregan acá.
//
// USO:
//   cd server
//   node scripts/sync-all.cjs              -> corre una vez y termina (one-shot)
//   node scripts/sync-all.cjs --loop 60     -> corre cada 60 min (proceso que queda vivo)
//
// RECOMENDADO en la PC de la clínica (siempre prendida): programar el modo
// one-shot con Windows Task Scheduler (sobrevive reinicios, no hay que cuidar
// un proceso). Ver instrucciones que da Claude al crearlo.
//
// Loguea a consola y a server/sync-daemon.log (gitignored por *.log).
// Cada sync corre aislado: si uno falla, los demás siguen.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');

const { sincronizarPacientes } = require('../services/pacientesExtractor');
const { sincronizarPrestadores } = require('../services/prestadoresExtractor');
const { sincronizarInsumos } = require('../services/insumosExtractor');

// ------------------------------------------------------------
// Registro de sincronizaciones (agregar más módulos acá)
// ------------------------------------------------------------
const SYNCS = [
  { nombre: 'pacientes (GECLISA→Supabase)', fn: () => sincronizarPacientes({ write: true }) },
  { nombre: 'prestadores (GECLISA→Supabase)', fn: () => sincronizarPrestadores({ write: true }) },
  { nombre: 'insumos (GECLISA→Supabase)', fn: () => sincronizarInsumos({ write: true }) },
  // Próximos: movimientos, prestaciones-realizadas, tesoreria, etc.
];

// ------------------------------------------------------------
const LOG_FILE = path.join(__dirname, '..', 'sync-daemon.log');
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(msg) {
  const linea = `[${ts()}] ${msg}`;
  console.log(linea);
  try { fs.appendFileSync(LOG_FILE, linea + '\n'); } catch { /* ignore */ }
}

async function correrTodo() {
  log(`=== Sync iniciado (${SYNCS.length} tareas) ===`);
  const t0 = Date.now();
  for (const s of SYNCS) {
    const ti = Date.now();
    try {
      const r = await s.fn();
      const seg = ((Date.now() - ti) / 1000).toFixed(1);
      const detalle = r && r.insertados !== undefined ? `${r.insertados}/${r.total} filas` : 'OK';
      log(`  ✔ ${s.nombre}: ${detalle} (${seg}s)`);
    } catch (e) {
      log(`  ✖ ${s.nombre}: ERROR ${e.message}`); // no frena las demás
    }
  }
  log(`=== Sync terminado en ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
}

// ------------------------------------------------------------
// Modo: one-shot (default) o --loop <minutos>
// ------------------------------------------------------------
const loopIdx = process.argv.indexOf('--loop');
if (loopIdx >= 0) {
  const min = parseInt(process.argv[loopIdx + 1], 10) || 60;
  log(`Modo LOOP: cada ${min} min. (Ctrl+C para cortar.)`);
  (async () => {
    await correrTodo();
    setInterval(() => { correrTodo().catch((e) => log('ERROR loop: ' + e.message)); }, min * 60 * 1000);
  })();
} else {
  correrTodo()
    .then(() => process.exit(0))
    .catch((e) => { log('ERROR fatal: ' + e.message); process.exit(1); });
}
