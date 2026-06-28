// ============================================================
// SERVICIO: Extractor de Tesorería GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Espeja a Supabase:
//   tesoreria_caja        <- MovValoresEnca (caja/valores)
//   tesoreria_proveedores <- MovProv OP(4)/PV(13)
//
// La CAJA se espeja COMPLETA (el saldo es acumulado histórico). El daemon
// refresca los últimos meses (los viejos no cambian); el histórico se carga una
// vez con --historico. Proveedores es chico (~2.4k): full refresh siempre.
//
// Refresh por DELETE de rango (caja) / DELETE all (proveedores) + INSERT. Idempotente.
// Importes: la caja guarda Mve_Total con su Mve_Signo (ingreso/egreso se derivan
// en el cliente).
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

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
 *   historico=true  -> caja desde 2018 (full) + proveedores full
 *   default (daemon) -> caja últimos 2 meses (DELETE rango + INSERT) + proveedores full
 */
async function sincronizarTesoreria({ write = false, historico = false } = {}) {
  // Rango de caja
  let desde;
  const hasta = new Date().toISOString().split('T')[0];
  if (historico) {
    desde = '2018-01-01';
  } else {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // mes en curso + anterior
    desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const caja = await extraerCaja(desde, hasta);
  const proveedores = await extraerProveedores();
  if (!write) return { caja: caja.length, proveedores: proveedores.length, escrito: false };

  // Caja: DELETE del rango + INSERT
  const { error: delCaja } = await supabase.from('tesoreria_caja').delete().gte('fecha', desde).lte('fecha', hasta);
  if (delCaja) throw new Error('delete caja: ' + delCaja.message);
  const nCaja = await insertarLotes('tesoreria_caja', caja);

  // Proveedores: full refresh (tabla chica)
  const { error: delProv } = await supabase.from('tesoreria_proveedores').delete().neq('id', -1);
  if (delProv) throw new Error('delete proveedores: ' + delProv.message);
  const nProv = await insertarLotes('tesoreria_proveedores', proveedores);

  return { caja: nCaja, proveedores: nProv, insertados: nCaja + nProv, total: nCaja + nProv, escrito: true };
}

module.exports = { extraerCaja, extraerProveedores, sincronizarTesoreria };
