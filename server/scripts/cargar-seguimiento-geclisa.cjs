// ============================================================
// CLI: snapshots del seguimiento de pacientes GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-seguimiento-geclisa.cjs                      -> DRY-RUN (recientes)
//   node scripts/cargar-seguimiento-geclisa.cjs --write              -> escribe mes actual + anterior
//   node scripts/cargar-seguimiento-geclisa.cjs --write --historico  -> escribe TODOS los meses con datos
//
// El --historico se corre UNA vez en la puesta en marcha. Después el daemon
// mantiene frescos el mes actual + anterior (los que todavía pueden cambiar).
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarSeguimiento } = require('../services/seguimientoExtractor');

const write = process.argv.includes('--write');
const historico = process.argv.includes('--historico');

(async () => {
  const modo = historico ? 'HISTÓRICO (todos los meses)' : 'recientes (mes actual + anterior)';
  console.log(write ? `== Seguimiento (WRITE) — ${modo} ==` : `== Seguimiento (DRY-RUN) — ${modo} ==`);
  const t0 = Date.now();
  const r = await sincronizarSeguimiento({ write, soloRecientes: !historico });
  if (write) {
    console.log(`${r.insertados}/${r.total} meses escritos en dashboards_snapshot (modulo='seguimiento')`);
  } else {
    console.log(`${r.total} meses a procesar (dry-run, no se escribió)`);
  }
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
