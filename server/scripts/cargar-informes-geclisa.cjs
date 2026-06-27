// ============================================================
// CLI: snapshots del informe de gestión GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-informes-geclisa.cjs                      -> DRY-RUN (recientes)
//   node scripts/cargar-informes-geclisa.cjs --write              -> escribe mes actual + anterior
//   node scripts/cargar-informes-geclisa.cjs --write --historico  -> escribe el rango de los selectores (3 años)
//
// El --historico se corre UNA vez en la puesta en marcha. Después el daemon
// mantiene frescos el mes actual + anterior.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarInformes } = require('../services/informesExtractor');

const write = process.argv.includes('--write');
const historico = process.argv.includes('--historico');

(async () => {
  const modo = historico ? 'HISTÓRICO (3 años)' : 'recientes (mes actual + anterior)';
  console.log(write ? `== Informes (WRITE) — ${modo} ==` : `== Informes (DRY-RUN) — ${modo} ==`);
  const t0 = Date.now();
  const r = await sincronizarInformes({ write, soloRecientes: !historico });
  if (write) {
    console.log(`${r.insertados}/${r.total} meses escritos en dashboards_snapshot (modulo='informes')`);
  } else {
    console.log(`${r.total} meses a procesar (dry-run, no se escribió)`);
  }
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
