// Read-only: validacion FINAL de IVA con split gravado/exento + base de fecha afinada.
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { executeQuery } = require('../config/database');
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const $ = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 });
const serialToYM = (s) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

function leerXls(file, iFecha, iExento, iNeto, iIva, iTotal) {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }).slice(1).filter(r => r[iFecha] !== '' && r[iFecha] != null);
  let exento = 0, neto = 0, iva = 0, total = 0; const ym = {};
  for (const r of rows) { exento += num(r[iExento]); neto += num(r[iNeto]); iva += num(r[iIva]); total += num(r[iTotal]); const k = serialToYM(num(r[iFecha])); ym[k] = (ym[k] || 0) + 1; }
  return { filas: rows.length, exento, neto, iva, total, periodo: Object.entries(ym).sort((a, b) => b[1] - a[1])[0][0] };
}
const line = (l, e, d) => console.log(`    ${l.padEnd(8)} export=$${$(e).padStart(16)}  geclisa=$${$(d).padStart(16)}  dif=$${$(d - e)}`);

(async () => {
  // ===== VENTAS =====
  const v = leerXls('C:\\FISCAL\\Exportaciones\\202605\\IVA VENTAS\\iva ventas.xls', 4, 9, 10, 11, 15);
  const [vy, vm] = v.periodo.split('-').map(Number);
  const vq = await executeQuery(`
    WITH ventas AS (
      SELECT mve.Mve_Total total, mve.Mve_Neto neto, mve.Mve_Iva iva, mve.Mve_Signo signo
      FROM MovValoresEnca mve JOIN TipoComp tc ON mve.TComp_id=tc.TComp_id
      WHERE YEAR(mve.Mve_Fecha)=@vy AND MONTH(mve.Mve_Fecha)=@vm AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
      UNION ALL
      SELECT p.PF_Total, p.PF_Neto, p.PF_Iva, p.pf_signo
      FROM PFComp p JOIN TipoComp tc ON p.TComp_id=tc.TComp_id
      WHERE YEAR(p.PF_Fecha)=@vy AND MONTH(p.PF_Fecha)=@vm AND (p.PFComp_Anulado IS NULL OR p.PFComp_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
    )
    SELECT COUNT(*) filas,
      SUM(CASE WHEN iva<>0 THEN neto*signo ELSE 0 END) gravado,
      SUM(CASE WHEN iva=0 THEN (total-iva)*signo ELSE 0 END) exento,
      SUM(iva*signo) iva, SUM(total*signo) total FROM ventas`, { vy, vm });
  const vr = vq.recordset[0];
  console.log(`===== IVA VENTAS (${v.periodo}) =====  filas export=${v.filas} geclisa=${vr.filas}  (dif ${vr.filas - v.filas})`);
  line('exento', v.exento, num(vr.exento));
  line('neto', v.neto, num(vr.gravado));
  line('iva', v.iva, num(vr.iva));
  line('total', v.total, num(vr.total));

  // ===== COMPRAS ===== (base de fecha: COALESCE(FecContable, Fecha))
  const c = leerXls('C:\\FISCAL\\Exportaciones\\202605\\IVA COMPRAS\\iva compras.xls', 3, 12, 13, 14, 19);
  const [cy, cm] = c.periodo.split('-').map(Number);
  const cq = await executeQuery(`
    SELECT COUNT(*) filas,
      SUM(CASE WHEN mp.IVA<>0 THEN mp.Neto*tc.TComp_Signo ELSE 0 END) gravado,
      SUM(CASE WHEN mp.IVA=0 THEN (mp.Total-mp.IVA-ISNULL(mp.PercepcionIva,0)-ISNULL(mp.PercepcionIB,0))*tc.TComp_Signo ELSE 0 END) exento,
      SUM(mp.IVA*tc.TComp_Signo) iva, SUM(mp.Total*tc.TComp_Signo) total
    FROM MovProv mp JOIN TipoComp tc ON mp.TComp_id=tc.TComp_id
    WHERE YEAR(COALESCE(mp.FecContable, mp.Fecha))=@cy AND MONTH(COALESCE(mp.FecContable, mp.Fecha))=@cm
      AND (mp.Anulado IS NULL OR mp.Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')`, { cy, cm });
  const cr = cq.recordset[0];
  console.log(`\n===== IVA COMPRAS (${c.periodo}) =====  filas export=${c.filas} geclisa=${cr.filas}  (dif ${cr.filas - c.filas})`);
  line('exento', c.exento, num(cr.exento));
  line('neto', c.neto, num(cr.gravado));
  line('iva', c.iva, num(cr.iva));
  line('total', c.total, num(cr.total));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
