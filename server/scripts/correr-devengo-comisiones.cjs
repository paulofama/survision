// Emite los devengos de comisiones de los presupuestos ya operados.
//   node scripts/correr-devengo-comisiones.cjs           -> DRY-RUN (no escribe)
//   node scripts/correr-devengo-comisiones.cjs --write    -> escribe el libro
//
// El dry-run devuelve además el detalle de cada movimiento que emitiría, con
// beneficiario, rol e importe. Mirarlo ANTES de la primera corrida en firme:
// lo que se escribe no se puede borrar, sólo contradecir con un reverso.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { correrDevengos } = require('../services/comisionesService');
const WRITE = process.argv.includes('--write');
const DETALLE = process.argv.includes('--detalle');
(async () => {
  console.log('Devengo de comisiones —', WRITE ? 'ESCRITURA' : 'DRY-RUN');
  const r = await correrDevengos({ write: WRITE });
  const { detalle, ...resumen } = r;
  console.log(JSON.stringify(resumen, null, 1));
  if (DETALLE && detalle) {
    console.log('\nDetalle:');
    for (const m of detalle) {
      console.log(` ${m.fecha_devengo}  ${m.beneficiario.padEnd(20)} ${m.rol.padEnd(13)} ${String(m.importe).padStart(12)}  ${m.evento_origen}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
