// ============================================================
// SERVICIO: Extractor de Tesorería GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Espeja a Supabase:
//   tesoreria_caja         <- MovValoresEnca (comprobantes de caja/valores)
//   tesoreria_proveedores  <- MovProv OP(4)/PV(13)
//   tesoreria_valores      <- MovValores      (medios de pago de cada comprobante)
//   tesoreria_prov_valores <- MovProv_Valores (medios de pago de cada OP/PV)
//
// POR QUÉ EL DETALLE DE VALORES (migración 30): el encabezado NO dice con qué
// se cobró/pagó. Una factura cobrada por transferencia o tarjeta va al BANCO,
// no a la caja. Sin este detalle el "saldo de caja" mezclaba todo y daba
// $1.041M (ficticio). Con él se puede aislar el EFECTIVO, que es la caja real.
// Además los OP/PV pagados en efectivo SALEN de la caja y hay que restarlos.
//
// La CAJA se espeja COMPLETA desde 2018 (el listado de movimientos la usa);
// el DETALLE DE VALORES desde 2024 (alcance decidido, igual que movimientos_geclisa).
// El daemon refresca los últimos meses; el histórico se carga una vez con --historico.
//
// Refresh por DELETE de rango (caja/valores) / DELETE all (proveedores y sus
// valores, tablas chicas) + INSERT. Idempotente.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// Alcance histórico del detalle de valores de CAJA (el de caja es 2018).
const DESDE_VALORES_HISTORICO = '2024-01-01';
// El detalle de OP/PV es chico (~2.7k filas totales) y su encabezado
// (tesoreria_proveedores) se espeja completo -> se trae completo también,
// para que tabla y detalle cubran el mismo período.
const DESDE_PROV_VALORES = '2018-01-01';

const QUERY_CAJA = `
  SELECT
    mve.Mve_id AS id,
    mve.Mve_Fecha AS fecha,
    RTRIM(tc.TComp_sigla) AS tipo_comprobante,
    RTRIM(tc.TComp_Nombre) AS tipo_nombre,
    RTRIM(mve.Mve_Letra) AS letra,
    mve.Mve_Suc AS sucursal,
    mve.Mve_NroDoc AS numero,
    RTRIM(ISNULL(mve.Mve_Nombre, '')) AS nombre,
    RTRIM(COALESCE(NULLIF(RTRIM(mve.Mve_Obs), ''), cc.ConcCaja_TextoComp, '')) AS observaciones,
    mve.Mve_Total AS importe,
    mve.Mve_Signo AS signo,
    mve.Usu_Alta AS usuario,
    mve.Fec_Alta AS fecha_alta
  FROM MovValoresEnca mve
  LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
  LEFT JOIN ConceptosCaja cc ON mve.ConcCaja_Id = cc.ConcCaja_id
  WHERE (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
    AND mve.Mve_Fecha >= @desde AND mve.Mve_Fecha <= @hasta
`;

const QUERY_PROVEEDORES = `
  SELECT
    mp.MProv_id AS id,
    mp.Fecha AS fecha,
    mp.TComp_id AS tcomp_id,
    RTRIM(tc.TComp_sigla) AS tipo_comprobante,
    RTRIM(tc.TComp_Nombre) AS tipo_nombre,
    RTRIM(mp.Letra) AS letra,
    mp.Suc AS sucursal,
    mp.Numero AS numero,
    RTRIM(ISNULL(mp.Nombre, '')) AS proveedor,
    RTRIM(ISNULL(mp.CUIT, '')) AS cuit,
    RTRIM(COALESCE(NULLIF(RTRIM(mp.ObsPagosVarios), ''), mp.Obs, '')) AS observaciones,
    mp.Total AS importe,
    mp.Usu_Alta AS usuario,
    mp.Fec_Alta AS fecha_alta
  FROM MovProv mp
  LEFT JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
  WHERE (mp.Anulado IS NULL OR mp.Anulado = 0) AND mp.TComp_id IN (4, 13)
`;

// Detalle de medios de pago de la caja. La fecha y el signo salen del
// ENCABEZADO (MovValores.Fecha es la fecha del valor -ej. vto del cheque-,
// no la del movimiento, y viene NULL en efectivo).
const QUERY_VALORES = `
  SELECT
    mv.MovVal_id AS id,
    mv.Mve_id AS mve_id,
    mve.Mve_Fecha AS fecha,
    mve.Mve_Signo AS signo,
    RTRIM(tc.TComp_sigla) AS tipo_comprobante,
    mv.Tv_id AS medio_id,
    RTRIM(ISNULL(tv.Tv_Nombre, '')) AS medio_nombre,
    tv.esEfectivo, tv.esTarjeta, tv.esTransferencia, tv.esCartera, tv.esCtaCte,
    tv.esRetGanancias, tv.esRetIngrBrutos, tv.esRetIva, tv.esRetMunicipal, tv.EsReteSuss,
    mv.Imp AS importe
  FROM MovValores mv
  JOIN MovValoresEnca mve ON mv.Mve_id = mve.Mve_id
  LEFT JOIN TipoValores tv ON mv.Tv_id = tv.Tv_id
  LEFT JOIN TipoComp tc ON mve.TComp_id = tc.TComp_id
  WHERE (mve.Mve_Anulado IS NULL OR mve.Mve_Anulado = 0)
    AND mve.Mve_Fecha >= @desde AND mve.Mve_Fecha <= @hasta
`;

// Detalle de medios de pago de OP/PV. Fecha del encabezado por el mismo motivo.
const QUERY_PROV_VALORES = `
  SELECT
    mpv.MpVal_id AS id,
    mpv.MProv_id AS mprov_id,
    mp.Fecha AS fecha,
    mp.TComp_id AS tcomp_id,
    RTRIM(tc.TComp_sigla) AS tipo_comprobante,
    RTRIM(ISNULL(mp.Nombre, '')) AS proveedor,
    mpv.Tv_id AS medio_id,
    RTRIM(ISNULL(tv.Tv_Nombre, '')) AS medio_nombre,
    tv.esEfectivo, tv.esTarjeta, tv.esTransferencia, tv.esCartera, tv.esCtaCte,
    tv.esRetGanancias, tv.esRetIngrBrutos, tv.esRetIva, tv.esRetMunicipal, tv.EsReteSuss,
    mpv.Imp AS importe
  FROM MovProv_Valores mpv
  JOIN MovProv mp ON mpv.MProv_id = mp.MProv_id
  LEFT JOIN TipoValores tv ON mpv.Tv_id = tv.Tv_id
  LEFT JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
  WHERE (mp.Anulado IS NULL OR mp.Anulado = 0) AND mp.TComp_id IN (4, 13)
    AND mp.Fecha >= @desde
`;

function fechaUTC(v) {
  const d = new Date(v);
  return {
    fecha: d.toISOString().split('T')[0],
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
  };
}
function fechaAltaISO(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Categoría del medio de pago.
 * OJO: los flags de TipoValores NO distinguen tarjeta de transferencia (tanto
 * "Tarjeta de Débito" como "Tarjeta de Crédito" tienen esTransferencia=1 y
 * esTarjeta=0), por eso el nombre manda antes que el flag.
 */
function categorizarMedio(row) {
  const nombre = (row.medio_nombre || '').trim();
  if (row.esEfectivo) return 'efectivo';
  if (row.esTarjeta || /tarjeta/i.test(nombre)) return 'tarjeta';
  if (row.esTransferencia || /transferencia/i.test(nombre)) return 'transferencia';
  if (row.esCartera || /cheque/i.test(nombre)) return 'cheque';
  if (row.esCtaCte) return 'cta_cte';
  if (
    row.esRetGanancias || row.esRetIngrBrutos || row.esRetIva ||
    row.esRetMunicipal || row.EsReteSuss || /retenci/i.test(nombre)
  ) return 'retencion';
  return 'otro';
}

async function extraerCaja(desde, hasta) {
  const r = await executeQuery(QUERY_CAJA, { desde, hasta });
  return (r.recordset || []).map((row) => {
    const f = fechaUTC(row.fecha);
    return {
      id: row.id, fecha: f.fecha, anio: f.anio, mes: f.mes,
      tipo_comprobante: (row.tipo_comprobante || '').trim() || null,
      tipo_nombre: (row.tipo_nombre || '').trim() || null,
      letra: (row.letra || '').trim() || null,
      sucursal: row.sucursal ?? null,
      numero: row.numero ?? null,
      nombre: (row.nombre || '').trim() || null,
      observaciones: (row.observaciones || '').trim() || null,
      importe: Number(row.importe) || 0,
      signo: Number(row.signo) || 1,
      usuario: (row.usuario || '').trim() || null,
      fecha_alta: fechaAltaISO(row.fecha_alta),
    };
  });
}

async function extraerProveedores() {
  const r = await executeQuery(QUERY_PROVEEDORES, {});
  return (r.recordset || []).map((row) => {
    const f = fechaUTC(row.fecha);
    return {
      id: row.id, fecha: f.fecha, anio: f.anio, mes: f.mes,
      tcomp_id: row.tcomp_id ?? null,
      tipo_comprobante: (row.tipo_comprobante || '').trim() || null,
      tipo_nombre: (row.tipo_nombre || '').trim() || null,
      letra: (row.letra || '').trim() || null,
      sucursal: row.sucursal ?? null,
      numero: row.numero ?? null,
      proveedor: (row.proveedor || '').trim() || null,
      cuit: (row.cuit || '').trim() || null,
      observaciones: (row.observaciones || '').trim() || null,
      importe: Number(row.importe) || 0,
      usuario: (row.usuario || '').trim() || null,
      fecha_alta: fechaAltaISO(row.fecha_alta),
    };
  });
}

async function extraerValores(desde, hasta) {
  const r = await executeQuery(QUERY_VALORES, { desde, hasta });
  return (r.recordset || []).map((row) => {
    const f = fechaUTC(row.fecha);
    return {
      id: row.id,
      mve_id: row.mve_id,
      fecha: f.fecha, anio: f.anio, mes: f.mes,
      signo: Number(row.signo) || 1,
      tipo_comprobante: (row.tipo_comprobante || '').trim() || null,
      medio_id: row.medio_id ?? null,
      medio_nombre: (row.medio_nombre || '').trim() || null,
      categoria: categorizarMedio(row),
      es_efectivo: !!row.esEfectivo,
      importe: Math.abs(Number(row.importe) || 0),
    };
  });
}

async function extraerProvValores(desde) {
  const r = await executeQuery(QUERY_PROV_VALORES, { desde });
  return (r.recordset || []).map((row) => {
    const f = fechaUTC(row.fecha);
    return {
      id: row.id,
      mprov_id: row.mprov_id,
      fecha: f.fecha, anio: f.anio, mes: f.mes,
      tcomp_id: row.tcomp_id ?? null,
      tipo_comprobante: (row.tipo_comprobante || '').trim() || null,
      proveedor: (row.proveedor || '').trim() || null,
      medio_id: row.medio_id ?? null,
      medio_nombre: (row.medio_nombre || '').trim() || null,
      categoria: categorizarMedio(row),
      es_efectivo: !!row.esEfectivo,
      importe: Math.abs(Number(row.importe) || 0),
    };
  });
}

async function insertarLotes(tabla, filas) {
  let n = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await supabase.from(tabla).insert(lote);
    if (error) throw new Error(`insert ${tabla} lote ${i}: ${error.message}`);
    n += lote.length;
  }
  return n;
}

/**
 * Sincroniza Tesorería.
 *   historico=true   -> caja desde 2018 + valores desde 2024 + proveedores/prov_valores full
 *   default (daemon) -> caja y valores últimos 2 meses (DELETE rango + INSERT)
 *                       + proveedores y prov_valores full (tablas chicas)
 */
async function sincronizarTesoreria({ write = false, historico = false } = {}) {
  // Rango a refrescar
  let desde;
  const hasta = new Date().toISOString().split('T')[0];
  if (historico) {
    desde = '2018-01-01';
  } else {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // mes en curso + anterior
    desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  // El detalle de valores nunca baja de 2024 (alcance histórico decidido).
  const desdeValores = desde < DESDE_VALORES_HISTORICO ? DESDE_VALORES_HISTORICO : desde;

  const caja = await extraerCaja(desde, hasta);
  const proveedores = await extraerProveedores();
  const valores = await extraerValores(desdeValores, hasta);
  const provValores = await extraerProvValores(DESDE_PROV_VALORES);

  if (!write) {
    return {
      caja: caja.length, proveedores: proveedores.length,
      valores: valores.length, provValores: provValores.length,
      escrito: false,
    };
  }

  // Caja: DELETE del rango + INSERT
  const { error: delCaja } = await supabase.from('tesoreria_caja').delete().gte('fecha', desde).lte('fecha', hasta);
  if (delCaja) throw new Error('delete caja: ' + delCaja.message);
  const nCaja = await insertarLotes('tesoreria_caja', caja);

  // Valores de caja: DELETE del rango + INSERT
  const { error: delVal } = await supabase.from('tesoreria_valores').delete().gte('fecha', desdeValores).lte('fecha', hasta);
  if (delVal) throw new Error('delete valores: ' + delVal.message);
  const nVal = await insertarLotes('tesoreria_valores', valores);

  // Proveedores: full refresh (tabla chica)
  const { error: delProv } = await supabase.from('tesoreria_proveedores').delete().neq('id', -1);
  if (delProv) throw new Error('delete proveedores: ' + delProv.message);
  const nProv = await insertarLotes('tesoreria_proveedores', proveedores);

  // Valores de proveedores: full refresh (tabla chica)
  const { error: delProvVal } = await supabase.from('tesoreria_prov_valores').delete().neq('id', -1);
  if (delProvVal) throw new Error('delete prov_valores: ' + delProvVal.message);
  const nProvVal = await insertarLotes('tesoreria_prov_valores', provValores);

  const total = nCaja + nProv + nVal + nProvVal;
  return {
    caja: nCaja, proveedores: nProv, valores: nVal, provValores: nProvVal,
    insertados: total, total, escrito: true,
  };
}

module.exports = {
  extraerCaja,
  extraerProveedores,
  extraerValores,
  extraerProvValores,
  categorizarMedio,
  sincronizarTesoreria,
};
