// ============================================================
// SERVICIO: Extractor de insumos (elementos médicos) GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Replica la lógica que hoy corre en el frontend (useInsumosSync): trae los
// elementos del tipo insumos médicos (Te_id = 125) con su precio vigente
// (ElementosCostos Tce_id=3, Fec_Fin abierta) y los upsertea en la tabla
// Supabase `insumos_variables`.
//
// IMPORTANTE: NO pisa `segmento` ni `consumo`/`cantidad` de los insumos ya
// existentes (los edita el usuario). Solo refresca descripción, unidad y
// precio desde GECLISA, y da de alta los nuevos con un segmento estimado por
// código. El matcheo es por geclisa_ele_id y, como fallback, por código.
//
// Lo dispara el daemon de sync on-prem (sync-all.cjs) y el CLI de carga.
// Patrón: igual que pacientesExtractor.js / ivaExtractor.js.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

const TIPO_ELEMENTO_INSUMOS = 125; // Te_id de insumos médicos

// Estima el segmento por prefijo de código (solo para ALTAS; los existentes
// conservan el segmento que el usuario les asignó). Igual al de la ruta vieja.
function determinarSegmento(codigo) {
  if (!codigo) return 'Otros';
  const prefix = codigo.substring(0, 2);
  switch (prefix) {
    case '01':
      if (codigo.startsWith('0104')) return 'Insumos Quirófano';
      if (codigo.startsWith('0105')) return 'Insumos Quirófano';
      if (codigo.startsWith('0107')) return 'Insumos Quirófano';
      if (codigo.startsWith('0111')) return 'Suturas';
      return 'Descartables';
    case '02':
      if (codigo.startsWith('0203')) return 'Lentes Intraoculares';
      return 'Implantes';
    case '03':
      return 'Descartables';
    case '04':
      if (codigo.startsWith('0408')) return 'Colirios';
      if (codigo.startsWith('0409')) return 'Medicamentos';
      if (codigo.startsWith('0413')) return 'Viscoelásticos';
      return 'Medicamentos';
    case '05':
      if (codigo.startsWith('0502') || codigo.startsWith('0501')) return 'Instrumental Retina';
      if (codigo.startsWith('0503')) return 'Insumos Quirófano';
      if (codigo.startsWith('0504') || codigo.startsWith('0505')) return 'Descartables';
      return 'Instrumental';
    default:
      return 'Otros';
  }
}

const QUERY_INSUMOS = `
  SELECT
    e.Ele_id,
    RTRIM(LTRIM(e.Ele_Cod)) AS codigo,
    RTRIM(LTRIM(e.Ele_nombre)) AS descripcion,
    RTRIM(LTRIM(ISNULL(e.UnidadMedida, 'Unidad'))) AS unidad,
    ISNULL(ec.Costo, 0) AS precio_unitario
  FROM Elementos e
  OUTER APPLY (
    SELECT TOP 1 ec2.Costo
    FROM ElementosCostos ec2
    WHERE ec2.Ele_id = e.Ele_id
      AND ec2.Tce_id = 3
      AND ec2.Fec_Fin = '9999-12-31'
    ORDER BY ec2.Fec_Ini DESC
  ) ec
  WHERE e.Te_id = @tipoElemento
    AND e.Ele_nombre IS NOT NULL
    AND e.Ele_nombre != ''
  ORDER BY e.Ele_Cod
`;

/** Lee los insumos (Te_id=125) de GECLISA con su precio vigente, planos. */
async function extraerInsumos() {
  const r = await executeQuery(QUERY_INSUMOS, { tipoElemento: TIPO_ELEMENTO_INSUMOS });
  return (r.recordset || [])
    .map((row) => ({
      geclisa_ele_id: row.Ele_id,
      codigo: (row.codigo || '').trim().toUpperCase(),
      descripcion: (row.descripcion || '').trim().toUpperCase(),
      unidad: (row.unidad || '').trim() || 'Unidad',
      precio_unitario: row.precio_unitario || 0,
    }))
    .filter((e) => e.codigo);
}

/** Sincroniza GECLISA -> Supabase preservando segmento/consumo/cantidad. */
async function sincronizarInsumos({ write = false } = {}) {
  const geclisa = await extraerInsumos();
  if (!write) return { total: geclisa.length, escrito: false };

  const { data: existentes, error: selErr } = await supabase
    .from('insumos_variables')
    .select('id, geclisa_ele_id, codigo, precio_unitario');
  if (selErr) throw new Error('select: ' + selErr.message);

  const byEleId = new Map();
  const byCodigo = new Map();
  (existentes || []).forEach((i) => {
    if (i.geclisa_ele_id != null) byEleId.set(i.geclisa_ele_id, i);
    if (i.codigo) byCodigo.set(i.codigo.toUpperCase(), i);
  });

  const inserts = [];
  const updates = [];
  for (const g of geclisa) {
    const ex = byEleId.get(g.geclisa_ele_id) || byCodigo.get(g.codigo);
    if (ex) {
      const precioCambio = g.precio_unitario > 0 && Math.abs((ex.precio_unitario || 0) - g.precio_unitario) > 0.01;
      const faltaVinculo = ex.geclisa_ele_id == null;
      if (precioCambio || faltaVinculo) {
        updates.push({
          id: ex.id,
          data: {
            geclisa_ele_id: g.geclisa_ele_id,
            descripcion: g.descripcion,
            unidad: g.unidad,
            ...(g.precio_unitario > 0 ? { precio_unitario: g.precio_unitario } : {}),
          },
        });
      }
    } else {
      inserts.push({
        codigo: g.codigo.substring(0, 50),
        descripcion: g.descripcion,
        unidad: g.unidad,
        precio_unitario: g.precio_unitario,
        segmento: determinarSegmento(g.codigo),
        consumo: 'Por Práctica',
        cantidad: 1,
        activo: true,
        geclisa_ele_id: g.geclisa_ele_id,
      });
    }
  }

  let nuevos = 0;
  let actualizados = 0;
  if (inserts.length) {
    const LOTE = 100;
    for (let i = 0; i < inserts.length; i += LOTE) {
      const lote = inserts.slice(i, i + LOTE);
      const { error } = await supabase.from('insumos_variables').insert(lote);
      if (error) throw new Error(`insert lote ${i}: ${error.message}`);
      nuevos += lote.length;
    }
  }
  for (const { id, data } of updates) {
    const { error } = await supabase.from('insumos_variables').update(data).eq('id', id);
    if (error) throw new Error('update ' + id + ': ' + error.message);
    actualizados++;
  }

  return {
    total: geclisa.length,
    nuevos,
    actualizados,
    sinCambios: geclisa.length - nuevos - actualizados,
    insertados: nuevos + actualizados,
    escrito: true,
  };
}

module.exports = { extraerInsumos, sincronizarInsumos };
