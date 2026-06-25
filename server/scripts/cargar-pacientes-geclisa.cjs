// ============================================================
// CARGA/SYNC: maestro de pacientes GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-pacientes-geclisa.cjs            -> DRY-RUN (cuenta, no escribe)
//   node scripts/cargar-pacientes-geclisa.cjs --write     -> sincroniza a Supabase
//
// Reusa server/services/pacientesExtractor.js. Lo mismo que correrá el daemon.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarPacientes, freshness } = require('../services/pacientesExtractor');

const WRITE = process.argv.includes('--write');

(async () => {
  console.log('='.repeat(60));
  console.log(`SYNC PACIENTES GECLISA -> Supabase — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  console.log('='.repeat(60));

  const t0 = Date.now();
  const fr = await freshness();
  console.log(`Freshness: GECLISA=${fr.geclisa} pacientes | Supabase=${fr.supabase} | stale=${fr.stale}`);

  const r = await sincronizarPacientes({ write: WRITE });
  const seg = ((Date.now() - t0) / 1000).toFixed(1);

  if (!WRITE) {
    console.log(`\nDRY-RUN: ${r.total} pacientes extraídos (doc >= 6 dígitos) en ${seg}s. No se escribió.`);
    console.log('Para escribir: node scripts/cargar-pacientes-geclisa.cjs --write');
  } else {
    console.log(`\nListo: ${r.insertados}/${r.total} pacientes sincronizados a Supabase en ${seg}s.`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
