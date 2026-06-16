// ============================================================
// ETL Modulo Fiscal: IVA Ventas + Compras  GECLISA -> Supabase
// ============================================================
// USO:  cd server
//   node scripts/cargar-iva.cjs                 -> DRY-RUN (extrae + valida, no escribe)
//   node scripts/cargar-iva.cjs --write          -> sincroniza por periodo en Supabase
//   node scripts/cargar-iva.cjs --periodo 2025-05 [--write]
//
// La logica de extraccion/sync vive en server/services/ivaExtractor.js (fuente unica).
// Este script: recorre los 16 periodos (2025-02..2026-05), valida contra los exports
// de C:\FISCAL\Exportaciones y (con --write) llama a sincronizarPeriodo.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const iva = require('../services/ivaExtractor');

const WRITE = process.argv.includes('--write');
const argPer = (() => { const i = process.argv.indexOf('--periodo'); return i >= 0 ? process.argv[i + 1] : null; })();
const EXPORT_DIR = 'C:\\FISCAL\\Exportaciones';
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const $ = (n) => num(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });

function periodosRango() {
  if (argPer) return [argPer];
  const out = []; let y = 2025, m = 2;
  while (y < 2026 || (y === 2026 && m <= 5)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

const sumCol = (rows, i) => r2(rows.reduce((a, r) => a + num(r[i]), 0));

function indexarExports() {
  const idx = {};
  const serialToYM = (s) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const buscarCompras = (folder) => { for (const base of [folder, path.dirname(folder)]) { try { for (const e of fs.readdirSync(base, { withFileTypes: true })) { if (e.isDirectory() && /compras/i.test(e.name)) { for (const f of fs.readdirSync(path.join(base, e.name))) if (/^(0?\d\.\s*)?iva compras.*\.xls$/i.test(f) && !/total/i.test(f)) return path.join(base, e.name, f); } } } catch (e) {} } return null; };
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/^iva ventas.*\.xls$/i.test(e.name)) {
    try { const wb = XLSX.readFile(p); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }).slice(1).filter(r => r[4] !== ''); if (!rows.length) return;
      const ym = {}; rows.forEach(r => { const k = serialToYM(num(r[4])); ym[k] = (ym[k] || 0) + 1; }); const per = Object.entries(ym).sort((a, b) => b[1] - a[1])[0][0];
      idx[per] = idx[per] || {}; idx[per].ventas = { filas: rows.length, iva: sumCol(rows, 11), total: sumCol(rows, 15) };
      const cf = buscarCompras(path.dirname(p)); if (cf) { const crows = XLSX.utils.sheet_to_json(XLSX.readFile(cf).Sheets[XLSX.readFile(cf).SheetNames[0]], { header: 1, raw: true, defval: '' }).slice(1).filter(r => r[1] !== '');
        idx[per].compras = { filas: crows.length, iva: sumCol(crows, 14), total: sumCol(crows, 19) }; }
    } catch (e) {}
  } } };
  try { walk(EXPORT_DIR); } catch (e) { console.log('  (no se pudo indexar exports: ' + e.message + ')'); }
  return idx;
}

(async () => {
  console.log('='.repeat(72));
  console.log(`ETL IVA GECLISA -> Supabase  —  ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  console.log('='.repeat(72));
  const exports = indexarExports();

  for (const periodo of periodosRango()) {
    const [y, m] = periodo.split('-').map(Number);
    const ventas = await iva.extraerVentas(y, m);
    const compras = await iva.extraerCompras(y, m);
    const t = iva.totalesDe(ventas, compras);
    console.log(`\n# ${periodo}`);
    console.log(`  VENTAS : ${t.v.filas} comp | gravado $${$(t.v.neto)} | iva $${$(t.v.iva)} | exento $${$(t.v.exento)} | total $${$(t.v.total)}`);
    console.log(`  COMPRAS: ${t.c.filas} comp | gravado $${$(t.c.neto)} | iva $${$(t.c.iva)} | exento $${$(t.c.exento)} | total $${$(t.c.total)}`);
    console.log(`  POSICION IVA (debito-credito): $${$(t.posicion)}`);

    const ex = exports[periodo];
    if (ex) {
      if (ex.ventas) console.log(`  [val ventas]  export filas=${ex.ventas.filas} iva=$${$(ex.ventas.iva)} total=$${$(ex.ventas.total)}  | DIF filas=${t.v.filas - ex.ventas.filas} iva=$${$(r2(t.v.iva - ex.ventas.iva))} total=$${$(r2(t.v.total - ex.ventas.total))}`);
      if (ex.compras) console.log(`  [val compras] export filas=${ex.compras.filas} iva=$${$(ex.compras.iva)} total=$${$(ex.compras.total)}  | DIF filas=${t.c.filas - ex.compras.filas} iva=$${$(r2(t.c.iva - ex.compras.iva))} total=$${$(r2(t.c.total - ex.compras.total))}`);
    } else { console.log('  [val] sin export para validar este periodo'); }

    if (WRITE) { await iva.sincronizarPeriodo(periodo); console.log('  -> sincronizado en Supabase OK'); }
  }

  console.log('\n' + '='.repeat(72));
  console.log(WRITE ? 'Listo. IVA cargado en Supabase.' : 'DRY-RUN. Para escribir: node scripts/cargar-iva.cjs --write');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
