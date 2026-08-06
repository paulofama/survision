// ============================================================================
// SERVICIO: Extractor de valores bancarios de GECLISA -> Supabase (geclisa_valores)
// Sistema de Gestión Integral - Survisión S.A.
//
// Espeja las COBRANZAS con valor bancario (transferencia + tarjeta de débito de
// pacientes; NO efectivo; NO anuladas) para conciliar contra el extracto del
// banco. Grano = fila de MovValores (un medio de pago por comprobante).
//
// El efectivo NO se concilia contra el banco (queda afuera). Los pagos de obras
// sociales (Círculo/OSEP/OSDE) y la liquidación de Getnet NO viven en MovValores
// (verificado en Fase 0): esos créditos del banco quedan como pendientes hasta
// mapear su origen -> fuera del alcance de esta v1.
//
// Refresh: UPSERT por id_origen (los datos en GECLISA pueden corregirse). El
// payload NO incluye estado_conciliacion -> se preserva lo que marcó el motor.
//   - daemon / default: año en curso.
//   - { historico:true }: desde 2024-01-01.
//   - { desde, hasta }: rango explícito (lo usa la ingesta diaria del banco).
// ============================================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

const QUERY = `
  SELECT
    v.MovVal_id AS movval_id,
    CONVERT(varchar(10), e.Mve_Fecha, 23) AS fecha,
    RTRIM(ISNULL(e.Mve_Nombre, '')) AS tercero,
    RTRIM(ISNULL(e.Mve_Cuit, '')) AS cuit,
    v.Tv_id AS medio_id,
    RTRIM(ISNULL(tv.Tv_Nombre, '')) AS medio,
    RTRIM(ISNULL(b.Banco_Nombre, '')) AS banco,
    ISNULL(v.Imp, 0) AS importe,
    RTRIM(ISNULL(tc.TComp_sigla, '')) AS sigla,
    e.Mve_Letra AS letra, e.Mve_Suc AS suc, e.Mve_NroDoc AS nrodoc,
    v.Numero AS nro_valor,
    tv.esTransferencia AS es_transf, tv.esTarjeta AS es_tarjeta, tv.Banco AS es_banco
  FROM MovValores v
  INNER JOIN MovValoresEnca e ON v.Mve_id = e.Mve_id
  INNER JOIN TipoValores tv ON v.Tv_id = tv.Tv_id
  LEFT JOIN Bancos b ON v.Banco_id = b.Banco_id
  LEFT JOIN TipoComp tc ON e.TComp_id = tc.TComp_id
  WHERE e.Mve_Fecha >= @desde AND e.Mve_Fecha <= @hasta
    AND ISNULL(e.Mve_Anulado, 0) = 0
    AND ISNULL(tv.esEfectivo, 0) = 0
    AND (ISNULL(tv.esTransferencia, 0) = 1 OR ISNULL(tv.esTarjeta, 0) = 1 OR ISNULL(tv.Banco, 0) = 1)
`;

/** Lee las cobranzas bancarias de GECLISA en [desde, hasta] (YYYY-MM-DD). */
async function extraerValores(desde, hasta) {
  const r = await executeQuery(QUERY, { desde, hasta });
  return (r.recordset || []).map((row) => {
    const fecha = row.fecha; // 'YYYY-MM-DD'
    const nro = [row.letra, row.suc, row.nrodoc].map((x) => (x == null ? '' : String(x).trim())).filter(Boolean).join(' ');
    return {
      id_origen: `MOVVAL-${row.movval_id}`,
      tipo: 'cobranza',
      fecha,
      anio: fecha ? Number(fecha.slice(0, 4)) : null,
      mes: fecha ? Number(fecha.slice(5, 7)) : null,
      comprobante: nro || null,
      comprobante_sigla: (row.sigla || '').trim() || null,
      tercero_nombre: (row.tercero || '').trim() || null,
      tercero_cuit: (row.cuit || '').replace(/\s/g, '') || null,
      medio_id: row.medio_id ?? null,
      medio_nombre: (row.medio || '').trim() || null,
      banco_geclisa: (row.banco || '').trim() || null,
      importe: Math.abs(parseFloat(row.importe) || 0), // cobranza = ingreso (+)
      anulado: false,
      raw: {
        movval_id: row.movval_id, nro_valor: (row.nro_valor || '').trim() || null,
        es_transferencia: !!row.es_transf, es_tarjeta: !!row.es_tarjeta, es_banco: !!row.es_banco,
      },
    };
  });
}

// EGRESOS (v2): OP/PV de proveedores pagadas por TRANSFERENCIA bancaria. Se toma
// SOLO la porción transferida (mpv.Imp de medios esTransferencia, sin efectivo ni
// tarjeta ni retenciones) porque es lo que impacta el extracto; el resto (efectivo,
// cheque, retenciones) no matchea el banco. Grano = OP/PV (sumando sus transferencias).
const QUERY_PAGOS = `
  SELECT mp.MProv_id AS mprov_id,
    CONVERT(varchar(10), mp.Fecha, 23) AS fecha,
    RTRIM(ISNULL(mp.Nombre, '')) AS tercero,
    RTRIM(ISNULL(mp.CUIT, '')) AS cuit,
    RTRIM(ISNULL(tc.TComp_sigla, '')) AS sigla, mp.TComp_id AS tcomp_id,
    SUM(mpv.Imp) AS transferido
  FROM MovProv mp
  INNER JOIN MovProv_Valores mpv ON mpv.MProv_id = mp.MProv_id
  INNER JOIN TipoValores tv ON mpv.Tv_id = tv.Tv_id
  LEFT JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
  WHERE mp.Fecha >= @desde AND mp.Fecha <= @hasta
    AND ISNULL(mp.Anulado, 0) = 0 AND mp.TComp_id IN (4, 13)
    AND ISNULL(tv.esEfectivo, 0) = 0 AND ISNULL(tv.esTransferencia, 0) = 1
    AND tv.Tv_Nombre NOT LIKE '%arjeta%'
  GROUP BY mp.MProv_id, mp.Fecha, mp.Nombre, mp.CUIT, tc.TComp_sigla, mp.TComp_id
  HAVING SUM(mpv.Imp) > 0
`;

/** Lee los pagos a proveedores por transferencia en [desde, hasta]. importe negativo. */
async function extraerPagos(desde, hasta) {
  const r = await executeQuery(QUERY_PAGOS, { desde, hasta });
  return (r.recordset || []).map((row) => {
    const fecha = row.fecha;
    return {
      id_origen: `MOVPROV-${row.mprov_id}`,
      tipo: 'pago',
      fecha,
      anio: fecha ? Number(fecha.slice(0, 4)) : null,
      mes: fecha ? Number(fecha.slice(5, 7)) : null,
      comprobante: (row.sigla || '').trim() || null,
      comprobante_sigla: (row.sigla || '').trim() || null,
      tercero_nombre: (row.tercero || '').trim() || null,
      tercero_cuit: (row.cuit || '').replace(/\D/g, '') || null,
      medio_id: null,
      medio_nombre: 'Transferencia',
      banco_geclisa: null,
      importe: -(Math.abs(parseFloat(row.transferido) || 0)), // egreso = negativo
      anulado: false,
      raw: { mprov_id: row.mprov_id, tcomp: (row.sigla || '').trim() },
    };
  });
}

function rangoAnioEnCurso() {
  const hoy = new Date();
  return { desde: `${hoy.getFullYear()}-01-01`, hasta: hoy.toISOString().split('T')[0] };
}

/**
 * Sincroniza geclisa_valores (UPSERT por id_origen, preserva estado_conciliacion).
 */
async function sincronizarGeclisaValores({ write = false, historico = false, desde, hasta } = {}) {
  let rDesde = desde, rHasta = hasta;
  if (!rDesde || !rHasta) {
    if (historico) { rDesde = '2024-01-01'; rHasta = new Date().toISOString().split('T')[0]; }
    else { ({ desde: rDesde, hasta: rHasta } = rangoAnioEnCurso()); }
  }

  const cobranzas = await extraerValores(rDesde, rHasta);
  const pagos = await extraerPagos(rDesde, rHasta);
  const filas = [...cobranzas, ...pagos];
  if (!write) return { total: filas.length, cobranzas: cobranzas.length, pagos: pagos.length, desde: rDesde, hasta: rHasta, escrito: false };

  let insertados = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    // OJO: el payload NO incluye estado_conciliacion -> en conflicto se preserva.
    const { error } = await supabase.from('geclisa_valores')
      .upsert(lote, { onConflict: 'id_origen', ignoreDuplicates: false });
    if (error) throw new Error(`upsert geclisa_valores lote ${i}: ${error.message}`);
    insertados += lote.length;
  }
  return { total: filas.length, cobranzas: cobranzas.length, pagos: pagos.length, insertados, desde: rDesde, hasta: rHasta, escrito: true };
}

module.exports = { extraerValores, extraerPagos, sincronizarGeclisaValores };
