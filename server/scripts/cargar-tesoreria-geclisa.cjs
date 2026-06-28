// ============================================================
// CLI: espejo de Tesorería (caja + proveedores) GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-tesoreria-geclisa.cjs                      -> DRY-RUN (recientes)
//   node scripts/cargar-tesoreria-geclisa.cjs --write              -> caja últimos 2 meses + proveedores
//   node scripts/cargar-tesoreria-geclisa.cjs --write --historico  -> caja COMPLETA (2018+) + proveedores
//
// El --historico se corre UNA vez (la caja necesita todo para el saldo acumulado).
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarTesoreria } = require('../services/tesoreriaExtractor');

const write = process.argv.includes('--write');
const historico = process.argv.includes('--historico');

(async () => {
  const modo = historico ? 'HISTÓRICO (caja 2018+)' : 'recientes (caja últimos 2 meses)';
  console.log(write ? `== Tesorería (WRITE) — ${modo} ==` : `== Tesorería (DRY-RUN) — ${modo} ==`);
  const t0 = Date.now();
  const r = await sincronizarTesoreria({ write, historico });
  console.log(`caja: ${r.caja.toLocaleString('es-AR')} filas | proveedores: ${r.proveedores.toLocaleString('es-AR')} filas`);
  console.log(write ? 'escrito en tesoreria_caja / tesoreria_proveedores' : '(dry-run, no se escribió)');
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
