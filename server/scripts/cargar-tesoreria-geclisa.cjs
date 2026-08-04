// ============================================================
// CLI: espejo de Tesorería (caja + proveedores + medios de pago) GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-tesoreria-geclisa.cjs                      -> DRY-RUN (recientes)
//   node scripts/cargar-tesoreria-geclisa.cjs --write              -> caja+valores últimos 2 meses + proveedores
//   node scripts/cargar-tesoreria-geclisa.cjs --write --historico  -> caja 2018+ , valores 2024+ , proveedores full
//
// El --historico se corre UNA vez por alcance nuevo.
// Tablas: tesoreria_caja, tesoreria_proveedores, tesoreria_valores, tesoreria_prov_valores.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { sincronizarTesoreria } = require('../services/tesoreriaExtractor');

const write = process.argv.includes('--write');
const historico = process.argv.includes('--historico');
const num = (n) => Number(n || 0).toLocaleString('es-AR');

(async () => {
  const modo = historico ? 'HISTÓRICO (caja 2018+ / valores 2024+)' : 'recientes (últimos 2 meses)';
  console.log(write ? `== Tesorería (WRITE) — ${modo} ==` : `== Tesorería (DRY-RUN) — ${modo} ==`);
  const t0 = Date.now();
  const r = await sincronizarTesoreria({ write, historico });
  console.log(`  caja                  : ${num(r.caja)} filas`);
  console.log(`  valores (medios pago) : ${num(r.valores)} filas`);
  console.log(`  proveedores           : ${num(r.proveedores)} filas`);
  console.log(`  valores de proveedores: ${num(r.provValores)} filas`);
  console.log(write
    ? 'escrito en tesoreria_caja / tesoreria_valores / tesoreria_proveedores / tesoreria_prov_valores'
    : '(dry-run, no se escribió)');
  console.log(`== Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s ==`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
