// ============================================================
// SERVICIO: Extractor de erogaciones (costos fijos) GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Espeja las 3 fuentes de erogaciones (mismas queries que /api/erogaciones/:anio/:mes)
// a la tabla `erogaciones_geclisa`. El frontend (useErogaciones) las cruza con
// erogaciones_clasificacion (Supabase) por fuente + id_geclisa.
//
// ~5.4k filas (2024+): full refresh (DELETE all + INSERT). Refresca el daemon.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// Las 3 fuentes unificadas (idéntico a la ruta), parametrizado por rango.
const QUERY = `
  SELECT 'MovProv' AS fuente, mp.MProv_id AS id_geclisa, mp.Fecha AS fecha,
    ISNULL(p.Prov_Nombre, mp.Nombre) AS proveedor_nombre, ISNULL(mp.Obs, '') AS descripcion,
    ABS(ISNULL(mp.Total, 0)) AS monto, 'Gastos Proveedores' AS categoria_sugerida,
    ISNULL(tc.TComp_Nombre, 'Comprobante') AS tipo_comprobante,
    ISNULL(mp.Letra, '') + ' ' + ISNULL(CAST(mp.Suc AS VARCHAR), '') + '-' + ISNULL(CAST(mp.Numero AS VARCHAR), '') AS numero_comprobante
  FROM MovProv mp
  LEFT JOIN Proveedores p ON mp.Prov_id = p.Prov_id
  INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
  WHERE mp.Fecha >= @desde AND mp.Fecha <= @hasta AND ISNULL(mp.Anulado, 0) = 0 AND ABS(ISNULL(mp.Total, 0)) > 0 AND tc.TComp_Signo = -1

  UNION ALL

  SELECT 'MovValoresEnca' AS fuente, mve.Mve_id AS id_geclisa, mve.Mve_Fecha AS fecha,
    ISNULL(mve.Mve_Nombre, 'Egreso de Caja') AS proveedor_nombre, ISNULL(mve.Mve_Obs, '') AS descripcion,
    ABS(ISNULL(mve.Mve_Total, 0)) AS monto,
    CASE WHEN tc.TComp_sigla = 'PV' THEN 'Pagos Varios' WHEN tc.TComp_sigla = 'EC' THEN 'Egresos de Caja'
         WHEN tc.TComp_sigla = 'PS' THEN 'Pagos Sueldos' WHEN tc.TComp_sigla = 'OP' THEN 'Orden de Pago'
         WHEN tc.TComp_sigla = 'OPL' THEN 'Orden Pago Liquidación' ELSE ISNULL(tc.TComp_Nombre, 'Egreso') END AS categoria_sugerida,
    ISNULL(tc.TComp_Nombre, 'Egreso') AS tipo_comprobante,
    ISNULL(mve.Mve_Letra, '') + ' ' + ISNULL(CAST(mve.Mve_Suc AS VARCHAR), '') + '-' + ISNULL(CAST(mve.Mve_NroDoc AS VARCHAR), '') AS numero_comprobante
  FROM MovValoresEnca mve
  LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
  WHERE mve.Mve_Fecha >= @desde AND mve.Mve_Fecha <= @hasta AND ISNULL(mve.Mve_Anulado, 0) = 0 AND ISNULL(mve.Mve_Signo, 0) = -1 AND ABS(ISNULL(mve.Mve_Total, 0)) > 0

  UNION ALL

  SELECT 'LiqComp' AS fuente, lc.LiqComp_id AS id_geclisa, lc.LiqComp_Fecha AS fecha,
    ISNULL(pre.pre_nombre, lc.LiqComp_Nombre) AS proveedor_nombre, 'Liquidación de honorarios' AS descripcion,
    ABS(ISNULL(lc.LiqComp_Total, 0)) AS monto, 'Honorarios Profesionales' AS categoria_sugerida, 'Liquidación' AS tipo_comprobante,
    ISNULL(lc.LiqComp_Letra, '') + ' ' + ISNULL(CAST(lc.LiqComp_Suc AS VARCHAR), '') + '-' + ISNULL(CAST(lc.LiqComp_NroDoc AS VARCHAR), '') AS numero_comprobante
  FROM LiqComp lc
  LEFT JOIN Prestadores pre ON lc.Pre_id = pre.pre_id
  WHERE lc.LiqComp_Fecha >= @desde AND lc.LiqComp_Fecha <= @hasta AND ISNULL(lc.LiqComp_Anulado, 0) = 0 AND ABS(ISNULL(lc.LiqComp_Total, 0)) > 0
`;

function fechaUTC(v) {
  const d = new Date(v);
  return { fecha: d.toISOString().split('T')[0], anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

async function extraerErogaciones(desde, hasta) {
  const r = await executeQuery(QUERY, { desde, hasta });
  return (r.recordset || []).map((row) => {
    const f = fechaUTC(row.fecha);
    return {
      fuente: row.fuente,
      id_geclisa: row.id_geclisa,
      fecha: f.fecha, anio: f.anio, mes: f.mes,
      proveedor_nombre: (row.proveedor_nombre || '').trim() || null,
      descripcion: (row.descripcion || '').trim() || null,
      monto: Number(row.monto) || 0,
      categoria_sugerida: (row.categoria_sugerida || '').trim() || null,
      tipo_comprobante: (row.tipo_comprobante || '').trim() || null,
      numero_comprobante: (row.numero_comprobante || '').trim() || null,
    };
  });
}

/** Sincroniza erogaciones. Full refresh del rango (desde 2024-01-01 por defecto). */
async function sincronizarErogaciones({ write = false } = {}) {
  const desde = '2024-01-01';
  const hasta = new Date().toISOString().split('T')[0];
  const filas = await extraerErogaciones(desde, hasta);
  if (!write) return { total: filas.length, escrito: false };

  const { error: delErr } = await supabase.from('erogaciones_geclisa').delete().gte('fecha', desde).lte('fecha', hasta);
  if (delErr) throw new Error('delete: ' + delErr.message);

  let insertados = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await supabase.from('erogaciones_geclisa').insert(lote);
    if (error) throw new Error(`insert lote ${i}: ${error.message}`);
    insertados += lote.length;
  }
  return { total: filas.length, insertados, escrito: true };
}

module.exports = { extraerErogaciones, sincronizarErogaciones };
