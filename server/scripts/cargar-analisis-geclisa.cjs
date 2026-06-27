// ============================================================
// CLI: snapshot de la comparativa inteligente GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-analisis-geclisa.cjs            -> DRY-RUN (no escribe)
//   node scripts/cargar-analisis-geclisa.cjs --write     -> escribe el snapshot
//
// Singleton dinámico (depende del día). El daemon lo refresca 2 veces/día.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarComparativa } = require('../services/analisisExtractor');

const write = process.argv.includes('--write');

(async () => {
  console.log(write ? '== Comparativa de Análisis (WRITE) ==' : '== Comparativa de Análisis (DRY-RUN) ==');
  const t0 = Date.now();
  const r = await sincronizarComparativa({ write });
  const p = r.resumen;
  console.log(
    `período: ${p.periodo.mesActual.nombre} ${p.periodo.mesActual.anio} (día ${p.periodo.diaActual}/${p.periodo.diasEnMes}) | ` +
    `prácticas ${p.actual.practicas} | ingresos ${Math.round(p.actual.ingresos).toLocaleString('es-AR')} | salud ${p.resumen.saludGeneral}`,
  );
  console.log(write ? "snapshot escrito en dashboards_snapshot (modulo='analisis', 0/0)" : '(dry-run, no se escribió)');
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
