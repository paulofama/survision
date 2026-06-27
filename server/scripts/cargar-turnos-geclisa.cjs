// ============================================================
// CLI: snapshot del análisis de turnos GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-turnos-geclisa.cjs            -> DRY-RUN (no escribe)
//   node scripts/cargar-turnos-geclisa.cjs --write     -> escribe el snapshot
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarTurnos } = require('../services/turnosExtractor');

const write = process.argv.includes('--write');

(async () => {
  console.log(write ? '== Snapshot turnos (WRITE) ==' : '== Snapshot turnos (DRY-RUN) ==');
  const t0 = Date.now();
  const r = await sincronizarTurnos({ write });
  const s = r.resumen;
  console.log(
    `resumen: ${s.totalMes} turnos del mes | hoy ${s.turnosHoy} (${s.pendientesHoy} pend.) | ` +
    `atendidos ${s.atendidos}, ausentes ${s.ausentes} | ocupación ${s.tasaOcupacion.toFixed(1)}%`,
  );
  console.log(write ? 'snapshot escrito en turnos_analisis (id=1)' : '(dry-run, no se escribió)');
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
