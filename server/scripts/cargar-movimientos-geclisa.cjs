// ============================================================
// CLI: espejo de movimientos crudos GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-movimientos-geclisa.cjs                      -> DRY-RUN (mes en curso)
//   node scripts/cargar-movimientos-geclisa.cjs --write              -> escribe el mes en curso
//   node scripts/cargar-movimientos-geclisa.cjs --write --historico  -> escribe desde 2024-01-01
//
// El --historico se corre UNA vez en la puesta en marcha. Después el daemon
// mantiene fresco el mes en curso (las atenciones viejas no cambian).
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarMovimientos } = require('../services/movimientosExtractor');

const write = process.argv.includes('--write');
const historico = process.argv.includes('--historico');

(async () => {
  const modo = historico ? 'HISTÓRICO (desde 2024-01-01)' : 'mes en curso';
  console.log(write ? `== Movimientos (WRITE) — ${modo} ==` : `== Movimientos (DRY-RUN) — ${modo} ==`);
  const t0 = Date.now();
  const r = await sincronizarMovimientos({ write, historico });
  console.log(`rango: ${r.desde} .. ${r.hasta}`);
  if (write) {
    console.log(`${r.insertados.toLocaleString('es-AR')} filas escritas en movimientos_geclisa`);
  } else {
    console.log(`${r.total.toLocaleString('es-AR')} filas a escribir (dry-run, no se escribió)`);
  }
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
