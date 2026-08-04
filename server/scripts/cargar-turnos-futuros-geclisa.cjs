// ============================================================
// CLI: espejo de turnos futuros GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-turnos-futuros-geclisa.cjs            -> DRY-RUN (no escribe)
//   node scripts/cargar-turnos-futuros-geclisa.cjs --write     -> full refresh de turnos_futuros
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarTurnosFuturos } = require('../services/turnosFuturosExtractor');

const write = process.argv.includes('--write');

(async () => {
  console.log(write ? '== Turnos futuros (WRITE) ==' : '== Turnos futuros (DRY-RUN) ==');
  const t0 = Date.now();
  const r = await sincronizarTurnosFuturos({ write });
  const sinTel = r.total - r.conTelefono;
  console.log(
    `turnos vigentes: ${r.total} | con celular válido: ${r.conTelefono} | sin celular válido: ${sinTel}`,
  );
  console.log(write ? `escritos en turnos_futuros: ${r.insertados}` : '(dry-run, no se escribió)');
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
