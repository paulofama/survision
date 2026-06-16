// ============================================================
// ETL Modulo Fiscal: IVA Ventas + Compras  GECLISA -> Supabase
// ============================================================
// USO:  cd server
//   node scripts/cargar-iva.cjs                 -> DRY-RUN (extrae + valida, no escribe)
//   node scripts/cargar-iva.cjs --write          -> borra+inserta por periodo en Supabase
//   node scripts/cargar-iva.cjs --periodo 2025-05 [--write]
//
// Reglas (validadas, ver migration 07_fiscal_iva.sql):
//   VENTAS  = MovValoresEnca UNION PFComp (FAC/NC/ND, por fecha comprobante, no anulados)
//             neto gravado/IVA del detalle por alicuota; exento = neto_total - gravado.
//   COMPRAS = MovProv (FAC/NC/ND, por FECHA CONTABLE, no anulados); split via MovProv_Deta.
//   Importes con SIGNO aplicado (NC negativas). Periodos 2025-02 .. 2026-05.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { executeQuery } = require('../config/database');
const { supabase, mensajeError } = require('../config/supabase');

const WRITE = process.argv.includes('--write');
const argPer = (() => { const i = process.argv.indexOf('--periodo'); return i >= 0 ? process.argv[i + 1] : null; })();
const EXPORT_DIR = 'C:\\FISCAL\\Exportaciones';
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const $ = (n) => num(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });

function periodosRango() {
  if (argPer) return [argPer.split('-').map(Number)];
  const out = []; let y = 2025, m = 2;
  while (y < 2026 || (y === 2026 && m <= 5)) { out.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

// ---------- EXTRACCION GECLISA ----------
async function extraerVentas(y, m) {
  const q = await executeQuery(`
    SELECT v.fuente, v.origen_id, CONVERT(varchar(10), v.fecha, 23) fecha, v.tipo_comprobante, v.letra,
      v.sucursal, v.numero, v.razon_social, v.cuit, v.condicion_iva, v.neto_flat, v.iva, v.perc_ib, v.otros, v.total, v.signo,
      ISNULL(g.gravado, 0) gravado, ISNULL(g.iva_det, 0) iva_det
    FROM (
      SELECT 'MVE' fuente, mve.Mve_id origen_id, mve.Mve_Fecha fecha, RTRIM(tc.TComp_sigla) tipo_comprobante,
        RTRIM(mve.Mve_Letra) letra, mve.Mve_Suc sucursal, mve.Mve_NroDoc numero, RTRIM(ISNULL(mve.Mve_Nombre,'')) razon_social,
        RTRIM(ISNULL(mve.Mve_Cuit,'')) cuit, RTRIM(ISNULL(ti.TIva_Sigla,'')) condicion_iva,
        mve.Mve_Neto neto_flat, mve.Mve_Iva iva, ISNULL(mve.PercIB,0) perc_ib, ISNULL(mve.OtrosConceptos,0) otros,
        mve.Mve_Total total, mve.Mve_Signo signo
      FROM MovValoresEnca mve JOIN TipoComp tc ON mve.TComp_id=tc.TComp_id LEFT JOIN TipoIva ti ON mve.Tiva_id=ti.TIva_id
      WHERE YEAR(mve.Mve_Fecha)=@y AND MONTH(mve.Mve_Fecha)=@m AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
      UNION ALL
      SELECT 'PFCOMP', p.PFComp_id, p.PF_Fecha, RTRIM(tc.TComp_sigla), RTRIM(p.PF_Letra), p.PF_Suc, p.PF_NroDoc, RTRIM(ISNULL(p.PF_Nombre,'')),
        RTRIM(ISNULL(p.PF_Cuit,'')), RTRIM(ISNULL(ti.TIva_Sigla,'')), p.PF_Neto, p.PF_Iva, ISNULL(p.PercIB,0), ISNULL(p.OtrosConceptos,0), p.PF_Total, p.pf_signo
      FROM PFComp p JOIN TipoComp tc ON p.TComp_id=tc.TComp_id LEFT JOIN TipoIva ti ON p.Tiva_id=ti.TIva_id
      WHERE YEAR(p.PF_Fecha)=@y AND MONTH(p.PF_Fecha)=@m AND (p.PFComp_Anulado IS NULL OR p.PFComp_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
    ) v
    LEFT JOIN (
      SELECT 'MVE' fuente, Mve_id origen_id, SUM(Neto) gravado, SUM(Iva) iva_det FROM MovValoresEnca_IvaPorc WHERE IvaPorc>0 GROUP BY Mve_id
      UNION ALL SELECT 'PFCOMP', pfComp_id, SUM(Neto), SUM(Iva) FROM PFComp_IvaPorc WHERE IvaPorc>0 GROUP BY pfComp_id
    ) g ON g.fuente=v.fuente AND g.origen_id=v.origen_id`, { y, m });
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  return q.recordset.map(r => {
    const s = num(r.signo) < 0 ? -1 : 1;
    // IVA y gravado del detalle por alicuota (autoritativo del libro). exento = balance.
    const grav = num(r.gravado), ivaDet = num(r.iva_det), netoFlat = num(r.neto_flat);
    const perc = num(r.perc_ib), otros = num(r.otros), totalFlat = num(r.total);
    const exento = totalFlat - grav - ivaDet - perc - otros;
    return {
      periodo, fecha: r.fecha, tipo_comprobante: r.tipo_comprobante, letra: r.letra, sucursal: num(r.sucursal),
      numero: num(r.numero), razon_social: r.razon_social, cuit: r.cuit, condicion_iva: r.condicion_iva,
      neto_gravado: r2(grav * s), iva: r2(ivaDet * s), exento: r2(exento * s),
      perc_ib: r2(perc * s), otros: r2(otros * s), total: r2(totalFlat * s),
      signo: s, fuente: r.fuente, origen_id: num(r.origen_id),
    };
  });
}

async function extraerVentasAlic(y, m) {
  const q = await executeQuery(`
    SELECT fuente, origen_id, alicuota, SUM(neto) neto, SUM(iva) iva FROM (
      SELECT 'MVE' fuente, mve.Mve_id origen_id, d.IvaPorc alicuota, d.Neto*mve.Mve_Signo neto, d.Iva*mve.Mve_Signo iva
      FROM MovValoresEnca mve JOIN TipoComp tc ON mve.TComp_id=tc.TComp_id JOIN MovValoresEnca_IvaPorc d ON d.Mve_id=mve.Mve_id
      WHERE YEAR(mve.Mve_Fecha)=@y AND MONTH(mve.Mve_Fecha)=@m AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
      UNION ALL
      SELECT 'PFCOMP', p.PFComp_id, d.IvaPorc, d.Neto*p.pf_signo, d.Iva*p.pf_signo
      FROM PFComp p JOIN TipoComp tc ON p.TComp_id=tc.TComp_id JOIN PFComp_IvaPorc d ON d.pfComp_id=p.PFComp_id
      WHERE YEAR(p.PF_Fecha)=@y AND MONTH(p.PF_Fecha)=@m AND (p.PFComp_Anulado IS NULL OR p.PFComp_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
    ) x GROUP BY fuente, origen_id, alicuota`, { y, m });
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  return q.recordset.map(r => ({ tipo: 'venta', periodo, fuente: r.fuente, comprobante_origen_id: num(r.origen_id), alicuota: num(r.alicuota), neto: r2(r.neto), iva: r2(r.iva) }));
}

async function extraerCompras(y, m) {
  const q = await executeQuery(`
    SELECT mp.MProv_id origen_id, CONVERT(varchar(10), mp.Fecha, 23) fecha, CONVERT(varchar(10), mp.FecContable, 23) fecha_contable,
      RTRIM(tc.TComp_sigla) tipo_comprobante, RTRIM(mp.Letra) letra, mp.Suc sucursal, mp.Numero numero,
      RTRIM(ISNULL(mp.Nombre,'')) proveedor, RTRIM(ISNULL(mp.CUIT,'')) cuit, RTRIM(ISNULL(ti.TIva_Sigla,'')) condicion_iva,
      mp.Neto neto_flat, mp.IVA iva, ISNULL(mp.PercepcionIva,0) perc_iva, ISNULL(mp.PercepcionIB,0) perc_ib,
      ISNULL(mp.ImpuestosInternos,0) imp_internos, ISNULL(mp.OtrosConceptos,0) otros, mp.Total total, tc.TComp_Signo signo,
      ISNULL(g.gravado,0) gravado, ISNULL(g.iva_det,0) iva_det, ISNULL(g.ndeta,0) ndeta
    FROM MovProv mp JOIN TipoComp tc ON mp.TComp_id=tc.TComp_id LEFT JOIN TipoIva ti ON mp.TIva_id=ti.TIva_id
    LEFT JOIN (SELECT MProv_id, SUM(CASE WHEN IvaPorc>0 THEN Neto ELSE 0 END) gravado, SUM(Iva) iva_det, COUNT(*) ndeta FROM MovProv_Deta GROUP BY MProv_id) g ON g.MProv_id=mp.MProv_id
    WHERE YEAR(mp.FecContable)=@y AND MONTH(mp.FecContable)=@m AND (mp.Anulado IS NULL OR mp.Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')`, { y, m });
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  return q.recordset.map(r => {
    const s = num(r.signo) < 0 ? -1 : 1;
    const netoFlat = num(r.neto_flat), ivaFlat = num(r.iva), nd = num(r.ndeta);
    const percIva = num(r.perc_iva), percIb = num(r.perc_ib), imp = num(r.imp_internos), otros = num(r.otros), totalFlat = num(r.total);
    // gravado/iva del detalle si hay; si no, fallback al header.
    const grav = nd > 0 ? num(r.gravado) : (ivaFlat !== 0 ? netoFlat : 0);
    const iva = nd > 0 ? num(r.iva_det) : ivaFlat;
    const exento = totalFlat - grav - iva - percIva - percIb - imp - otros;
    return {
      periodo, fecha: r.fecha, fecha_contable: r.fecha_contable, tipo_comprobante: r.tipo_comprobante, letra: r.letra,
      sucursal: num(r.sucursal), numero: num(r.numero), proveedor: r.proveedor, cuit: r.cuit, condicion_iva: r.condicion_iva,
      neto_gravado: r2(grav * s), iva: r2(iva * s), exento: r2(exento * s), perc_iva: r2(percIva * s),
      perc_ib: r2(percIb * s), imp_internos: r2(imp * s), otros: r2(otros * s),
      total: r2(totalFlat * s), signo: s, origen_id: num(r.origen_id),
    };
  });
}

async function extraerComprasAlic(y, m) {
  const q = await executeQuery(`
    SELECT mp.MProv_id origen_id, d.IvaPorc alicuota, SUM(d.Neto*tc.TComp_Signo) neto, SUM(d.Iva*tc.TComp_Signo) iva
    FROM MovProv mp JOIN TipoComp tc ON mp.TComp_id=tc.TComp_id JOIN MovProv_Deta d ON d.MProv_id=mp.MProv_id
    WHERE YEAR(mp.FecContable)=@y AND MONTH(mp.FecContable)=@m AND (mp.Anulado IS NULL OR mp.Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
    GROUP BY mp.MProv_id, d.IvaPorc`, { y, m });
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  return q.recordset.map(r => ({ tipo: 'compra', periodo, fuente: 'MOVPROV', comprobante_origen_id: num(r.origen_id), alicuota: num(r.alicuota), neto: r2(r.neto), iva: r2(r.iva) }));
}

const sum = (arr, k) => r2(arr.reduce((a, x) => a + num(x[k]), 0));

// ---------- VALIDACION CONTRA EXPORTS ----------
function indexarExports() {
  const idx = {}; // periodo -> { ventas, compras }
  const serialToYM = (s) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/^iva ventas.*\.xls$/i.test(e.name)) {
    try { const wb = XLSX.readFile(p); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }).slice(1).filter(r => r[4] !== ''); if (!rows.length) continue;
      const ym = {}; rows.forEach(r => { const k = serialToYM(num(r[4])); ym[k] = (ym[k] || 0) + 1; }); const per = Object.entries(ym).sort((a, b) => b[1] - a[1])[0][0];
      const v = { filas: rows.length, neto: sum(rows.map(r => ({ x: num(r[10]) })), 'x'), iva: sum(rows.map(r => ({ x: num(r[11]) })), 'x'), total: sum(rows.map(r => ({ x: num(r[15]) })), 'x') };
      idx[per] = idx[per] || {}; idx[per].ventas = v;
      // compras hermano en la misma carpeta padre
      const comprasFile = buscarCompras(path.dirname(p)); if (comprasFile) { const cwb = XLSX.readFile(comprasFile); const crows = XLSX.utils.sheet_to_json(cwb.Sheets[cwb.SheetNames[0]], { header: 1, raw: true, defval: '' }).slice(1).filter(r => r[1] !== '');
        idx[per].compras = { filas: crows.length, neto: sum(crows.map(r => ({ x: num(r[13]) })), 'x'), iva: sum(crows.map(r => ({ x: num(r[14]) })), 'x'), total: sum(crows.map(r => ({ x: num(r[19]) })), 'x') }; }
    } catch (e) { /* ignora xls corruptos */ }
  } } };
  const buscarCompras = (folder) => { const up = path.dirname(folder); for (const base of [folder, up]) { try { for (const e of fs.readdirSync(base, { withFileTypes: true })) { if (e.isDirectory() && /compras/i.test(e.name)) { for (const f of fs.readdirSync(path.join(base, e.name))) if (/^(0?\d\.\s*)?iva compras.*\.xls$/i.test(f) && !/total/i.test(f)) return path.join(base, e.name, f); } } } catch (e) {} } return null; };
  try { walk(EXPORT_DIR); } catch (e) { console.log('  (no se pudo indexar exports: ' + e.message + ')'); }
  return idx;
}

(async () => {
  console.log('='.repeat(72));
  console.log(`ETL IVA GECLISA -> Supabase  —  ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  console.log('='.repeat(72));
  const exports = indexarExports();
  const periodos = periodosRango();

  for (const [y, m] of periodos) {
    const periodo = `${y}-${String(m).padStart(2, '0')}`;
    const ventas = await extraerVentas(y, m);
    const ventasAlic = await extraerVentasAlic(y, m);
    const compras = await extraerCompras(y, m);
    const comprasAlic = await extraerComprasAlic(y, m);

    const vt = { filas: ventas.length, neto: sum(ventas, 'neto_gravado'), iva: sum(ventas, 'iva'), exento: sum(ventas, 'exento'), total: sum(ventas, 'total') };
    const ct = { filas: compras.length, neto: sum(compras, 'neto_gravado'), iva: sum(compras, 'iva'), exento: sum(compras, 'exento'), total: sum(compras, 'total') };
    console.log(`\n# ${periodo}`);
    console.log(`  VENTAS : ${vt.filas} comp | gravado $${$(vt.neto)} | iva $${$(vt.iva)} | exento $${$(vt.exento)} | total $${$(vt.total)}`);
    console.log(`  COMPRAS: ${ct.filas} comp | gravado $${$(ct.neto)} | iva $${$(ct.iva)} | exento $${$(ct.exento)} | total $${$(ct.total)}`);
    console.log(`  POSICION IVA (debito-credito): $${$(r2(vt.iva - ct.iva))}`);

    const ex = exports[periodo];
    if (ex) {
      if (ex.ventas) { const d = r2(vt.total - ex.ventas.total), di = r2(vt.iva - ex.ventas.iva); console.log(`  [val ventas]  export filas=${ex.ventas.filas} iva=$${$(ex.ventas.iva)} total=$${$(ex.ventas.total)}  | DIF filas=${vt.filas - ex.ventas.filas} iva=$${$(di)} total=$${$(d)}`); }
      if (ex.compras) { const d = r2(ct.total - ex.compras.total), di = r2(ct.iva - ex.compras.iva); console.log(`  [val compras] export filas=${ex.compras.filas} iva=$${$(ex.compras.iva)} total=$${$(ex.compras.total)}  | DIF filas=${ct.filas - ex.compras.filas} iva=$${$(di)} total=$${$(d)}`); }
    } else { console.log('  [val] sin export para validar este periodo'); }

    if (WRITE) {
      // borrar periodo y reinsertar
      for (const t of ['fiscal_iva_ventas', 'fiscal_iva_compras']) { const { error } = await supabase.from(t).delete().eq('periodo', periodo); if (error) throw new Error(`del ${t} ${periodo}: ${mensajeError(error)}`); }
      { const { error } = await supabase.from('fiscal_iva_alicuotas').delete().eq('periodo', periodo); if (error) throw new Error(`del alic ${periodo}: ${mensajeError(error)}`); }
      await insertChunked('fiscal_iva_ventas', ventas);
      await insertChunked('fiscal_iva_compras', compras);
      await insertChunked('fiscal_iva_alicuotas', [...ventasAlic, ...comprasAlic]);
      const { error: pe } = await supabase.from('fiscal_iva_periodos').upsert({
        periodo, ventas_filas: vt.filas, ventas_neto_gravado: vt.neto, ventas_iva: vt.iva, ventas_exento: vt.exento, ventas_total: vt.total,
        compras_filas: ct.filas, compras_neto_gravado: ct.neto, compras_iva: ct.iva, compras_exento: ct.exento, compras_total: ct.total,
        posicion_iva: r2(vt.iva - ct.iva), ultima_sync: new Date().toISOString(), estado: 'ok',
      }, { onConflict: 'periodo' });
      if (pe) throw new Error(`periodos ${periodo}: ${mensajeError(pe)}`);
      console.log('  -> escrito en Supabase OK');
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(WRITE ? 'Listo. IVA cargado en Supabase.' : 'DRY-RUN. Para escribir: node scripts/cargar-iva.cjs --write');
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

async function insertChunked(tabla, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from(tabla).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert ${tabla}: ${mensajeError(error)}`);
  }
}
