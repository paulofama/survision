// ============================================================
// CLI: carga de maestros GECLISA -> Supabase (prestadores + insumos)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-maestros-geclisa.cjs            -> DRY-RUN (no escribe)
//   node scripts/cargar-maestros-geclisa.cjs --write     -> escribe a Supabase
//
// Dispara los extractores de prestadores e insumos. Mismo resultado que el
// daemon (sync-all.cjs), pero pensado para correr a mano / verificar.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const { sincronizarPrestadores } = require('../services/prestadoresExtractor');
const { sincronizarInsumos } = require('../services/insumosExtractor');
const { sincronizarNomenclador } = require('../services/nomencladorExtractor');

const write = process.argv.includes('--write');

(async () => {
  console.log(write ? '== Cargando maestros (WRITE) ==' : '== Maestros (DRY-RUN, no escribe) ==');

  const t0 = Date.now();
  const pres = await sincronizarPrestadores({ write });
  console.log(
    `prestadores: ${pres.total} en GECLISA` +
    (write ? ` -> ${pres.nuevos} nuevos, ${pres.actualizados} actualizados, ${pres.sinCambios} sin cambios` : ''),
  );

  const ins = await sincronizarInsumos({ write });
  console.log(
    `insumos:     ${ins.total} en GECLISA` +
    (write ? ` -> ${ins.nuevos} nuevos, ${ins.actualizados} actualizados, ${ins.sinCambios} sin cambios` : ''),
  );

  const nom = await sincronizarNomenclador({ write });
  console.log(
    `nomenclador: ${nom.total} en GECLISA` +
    (write ? ` -> ${nom.nuevos} nuevos, ${nom.actualizados} actualizados, ${nom.sinCambios} sin cambios` : ''),
  );

  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
