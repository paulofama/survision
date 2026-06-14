// ============================================================
// EXPLORADOR (read-only) - Minuta contable .xlsx
// Modulo Sueldos - Fase 4 - Survision S.A.
// ============================================================
// USO:  cd server && node scripts/explorar-minuta.js [hoja]   (default: 12-2025)
// Lista las hojas y vuelca la hoja pedida como filas para entender el layout
// de la seccion "Pago de Sueldos". NO modifica nada.
// ============================================================

const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));

const ARCHIVO = 'C:\\FISCAL\\Minuta contable 2025.xlsx';
const hojaPedida = process.argv[2] || '12-2025';

const wb = XLSX.readFile(ARCHIVO);
console.log('Hojas:', wb.SheetNames.join(' | '));

const ws = wb.Sheets[hojaPedida];
if (!ws) {
  console.log(`\nNo existe la hoja "${hojaPedida}".`);
  process.exit(0);
}

// Volcar como matriz (filas), con numero de fila para ubicar secciones
const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
console.log(`\nHoja "${hojaPedida}" — ${filas.length} filas:\n`);

filas.forEach((fila, i) => {
  // Solo mostrar columnas con algo, recortando vacios al final
  const cols = fila.map((c) => (c === '' || c === null || c === undefined ? '' : String(c)));
  while (cols.length && cols[cols.length - 1] === '') cols.pop();
  if (cols.length === 0) { console.log(String(i).padStart(3) + ' |'); return; }
  console.log(String(i).padStart(3) + ' | ' + cols.map((c) => c.slice(0, 28)).join(' ┆ '));
});
