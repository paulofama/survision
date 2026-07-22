// Corre el match presupuesto -> práctica realizada.
//   node scripts/correr-match-practicas.cjs           -> DRY-RUN
//   node scripts/correr-match-practicas.cjs --write    -> escribe
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { correrMatch } = require('../services/matchPracticasService');
const WRITE = process.argv.includes('--write');
(async () => {
  console.log('Match presupuesto->práctica realizada —', WRITE ? 'ESCRITURA' : 'DRY-RUN');
  const r = await correrMatch({ write: WRITE });
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
