// ============================================================
// SERVICIO: ivaExtractor  (Modulo Fiscal)
// ============================================================
// Fuente UNICA de la logica de extraccion de IVA Ventas/Compras desde GECLISA
// y sincronizacion hacia Supabase. Lo usan:
//   - server/scripts/cargar-iva.cjs  (carga historica / CLI)
//   - server/routes/fiscal.js        (sync auto/manual desde la UI)
//
// Reglas (validadas, ver migrations/07_fiscal_iva.sql y memoria project-modulo-fiscal):
//   VENTAS  = MovValoresEnca UNION PFComp (FAC/NC/ND, por fecha de comprobante, no anulados)
//   COMPRAS = MovProv (FAC/NC/ND, por FECHA CONTABLE, no anulados)
//   gravado/IVA del detalle por alicuota; exento = balance; signo aplicado (NC negativas).
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase, mensajeError } = require('../config/supabase');

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function parsePeriodo(periodo) {
  const [y, m] = String(periodo).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error(`Periodo invalido: ${periodo} (esperado YYYY-MM)`);
  return [y, m];
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
    const grav = num(r.gravado), ivaDet = num(r.iva_det), perc = num(r.perc_ib), otros = num(r.otros), totalFlat = num(r.total);
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

const sumKey = (arr, k) => r2(arr.reduce((a, x) => a + num(x[k]), 0));

function totalesDe(ventas, compras) {
  const v = { filas: ventas.length, neto: sumKey(ventas, 'neto_gravado'), iva: sumKey(ventas, 'iva'), exento: sumKey(ventas, 'exento'), total: sumKey(ventas, 'total') };
  const c = { filas: compras.length, neto: sumKey(compras, 'neto_gravado'), iva: sumKey(compras, 'iva'), exento: sumKey(compras, 'exento'), total: sumKey(compras, 'total') };
  return { v, c, posicion: r2(v.iva - c.iva) };
}

// ---------- SYNC GECLISA -> SUPABASE ----------

async function insertChunked(tabla, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from(tabla).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert ${tabla}: ${mensajeError(error)}`);
  }
}

/** Extrae un periodo de GECLISA y lo reescribe en Supabase (borra+inserta). Devuelve totales. */
async function sincronizarPeriodo(periodo) {
  const [y, m] = parsePeriodo(periodo);
  const [ventas, ventasAlic, compras, comprasAlic] = await Promise.all([
    extraerVentas(y, m), extraerVentasAlic(y, m), extraerCompras(y, m), extraerComprasAlic(y, m),
  ]);
  const t = totalesDe(ventas, compras);

  for (const tabla of ['fiscal_iva_ventas', 'fiscal_iva_compras']) {
    const { error } = await supabase.from(tabla).delete().eq('periodo', periodo);
    if (error) throw new Error(`del ${tabla} ${periodo}: ${mensajeError(error)}`);
  }
  { const { error } = await supabase.from('fiscal_iva_alicuotas').delete().eq('periodo', periodo); if (error) throw new Error(`del alic ${periodo}: ${mensajeError(error)}`); }

  await insertChunked('fiscal_iva_ventas', ventas);
  await insertChunked('fiscal_iva_compras', compras);
  await insertChunked('fiscal_iva_alicuotas', [...ventasAlic, ...comprasAlic]);

  const { error: pe } = await supabase.from('fiscal_iva_periodos').upsert({
    periodo, ventas_filas: t.v.filas, ventas_neto_gravado: t.v.neto, ventas_iva: t.v.iva, ventas_exento: t.v.exento, ventas_total: t.v.total,
    compras_filas: t.c.filas, compras_neto_gravado: t.c.neto, compras_iva: t.c.iva, compras_exento: t.c.exento, compras_total: t.c.total,
    posicion_iva: t.posicion, ultima_sync: new Date().toISOString(), estado: 'ok',
  }, { onConflict: 'periodo' });
  if (pe) throw new Error(`periodos ${periodo}: ${mensajeError(pe)}`);

  return { periodo, ...t };
}

/** Compara conteos/totales GECLISA vs lo guardado en Supabase (liviano). stale=true si difieren. */
async function freshness(periodo) {
  const [y, m] = parsePeriodo(periodo);
  const gv = await executeQuery(`
    SELECT COUNT(*) filas, SUM(t.total*t.signo) total FROM (
      SELECT mve.Mve_Total total, mve.Mve_Signo signo FROM MovValoresEnca mve JOIN TipoComp tc ON mve.TComp_id=tc.TComp_id
      WHERE YEAR(mve.Mve_Fecha)=@y AND MONTH(mve.Mve_Fecha)=@m AND (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
      UNION ALL
      SELECT p.PF_Total, p.pf_signo FROM PFComp p JOIN TipoComp tc ON p.TComp_id=tc.TComp_id
      WHERE YEAR(p.PF_Fecha)=@y AND MONTH(p.PF_Fecha)=@m AND (p.PFComp_Anulado IS NULL OR p.PFComp_Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')
    ) t`, { y, m });
  const gc = await executeQuery(`
    SELECT COUNT(*) filas, SUM(mp.Total*tc.TComp_Signo) total FROM MovProv mp JOIN TipoComp tc ON mp.TComp_id=tc.TComp_id
    WHERE YEAR(mp.FecContable)=@y AND MONTH(mp.FecContable)=@m AND (mp.Anulado IS NULL OR mp.Anulado=0) AND RTRIM(tc.TComp_sigla) IN ('FAC','NC','ND')`, { y, m });
  const geclisa = { ventas_filas: num(gv.recordset[0].filas), ventas_total: r2(gv.recordset[0].total), compras_filas: num(gc.recordset[0].filas), compras_total: r2(gc.recordset[0].total) };

  const { data } = await supabase.from('fiscal_iva_periodos').select('ventas_filas, ventas_total, compras_filas, compras_total, ultima_sync').eq('periodo', periodo).maybeSingle();
  const sup = data || null;
  const stale = !sup
    || num(sup.ventas_filas) !== geclisa.ventas_filas || r2(sup.ventas_total) !== geclisa.ventas_total
    || num(sup.compras_filas) !== geclisa.compras_filas || r2(sup.compras_total) !== geclisa.compras_total;
  return { periodo, stale, geclisa, supabase: sup };
}

module.exports = {
  extraerVentas, extraerVentasAlic, extraerCompras, extraerComprasAlic,
  totalesDe, sincronizarPeriodo, freshness, parsePeriodo,
};
