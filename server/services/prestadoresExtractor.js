// ============================================================
// SERVICIO: Extractor de prestadores GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Replica la lógica que hoy corre en el frontend (usePrestadoresSync):
// trae los prestadores ACTIVOS de GECLISA (con prácticas en los últimos 2
// años) y los upsertea en la tabla Supabase `prestadores`.
//
// IMPORTANTE: NO pisa `es_socio` (lo togglea el usuario a mano). Solo refresca
// los campos que vienen de GECLISA (nombre, matrícula, CUIT) y da de alta los
// nuevos con la detección automática de socios.
//
// Lo dispara el daemon de sync on-prem (sync-all.cjs) y el CLI de carga.
// Patrón: igual que pacientesExtractor.js / ivaExtractor.js.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// Prestadores que son socios (mismo criterio que el hook del frontend).
const SOCIOS_NOMBRES = [
  'MERCADO JORGE', 'JORGE MERCADO',
  'MAHIA PABLO', 'PABLO MAHIA',
  'MUSA CARLOS', 'CARLOS MUSA',
];
function esSocio(nombre) {
  const u = (nombre || '').toUpperCase().trim();
  return SOCIOS_NOMBRES.some((s) => u.includes(s) || s.includes(u));
}

// Solo prestadores con prácticas en los últimos 2 años (endpoint /activos).
const QUERY_ACTIVOS = `
  SELECT
    p.pre_id,
    RTRIM(LTRIM(p.pre_nombre)) AS nombre,
    p.pre_matp AS matricula_provincial,
    RTRIM(LTRIM(p.pre_cuit)) AS cuit
  FROM Prestadores p
  INNER JOIN MovPre mpr ON p.pre_id = mpr.Pre_id
  INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
  INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
  WHERE p.pre_nombre IS NOT NULL
    AND p.pre_nombre != ''
    AND me.Me_Fecha >= DATEADD(YEAR, -2, GETDATE())
  GROUP BY p.pre_id, p.pre_nombre, p.pre_matp, p.pre_cuit
  ORDER BY p.pre_nombre
`;

/** Lee los prestadores activos de GECLISA y los devuelve planos. */
async function extraerPrestadores() {
  const r = await executeQuery(QUERY_ACTIVOS, {});
  return (r.recordset || [])
    .map((row) => ({
      geclisa_pre_id: row.pre_id,
      nombre: (row.nombre || '').trim(),
      matricula_provincial: row.matricula_provincial ?? null,
      cuit: (row.cuit || '').trim() || null,
    }))
    .filter((p) => p.nombre);
}

/** Sincroniza GECLISA -> Supabase preservando es_socio (alta nuevos + update cambios). */
async function sincronizarPrestadores({ write = false } = {}) {
  const geclisa = await extraerPrestadores();
  if (!write) return { total: geclisa.length, escrito: false };

  const { data: existentes, error: selErr } = await supabase
    .from('prestadores')
    .select('id, geclisa_pre_id, nombre, matricula_provincial, cuit');
  if (selErr) throw new Error('select: ' + selErr.message);

  const byPreId = new Map();
  (existentes || []).forEach((p) => {
    if (p.geclisa_pre_id != null) byPreId.set(p.geclisa_pre_id, p);
  });

  const inserts = [];
  const updates = [];
  for (const g of geclisa) {
    const ex = byPreId.get(g.geclisa_pre_id);
    if (ex) {
      if (ex.nombre !== g.nombre || ex.matricula_provincial !== g.matricula_provincial || ex.cuit !== g.cuit) {
        updates.push({ id: ex.id, data: { nombre: g.nombre, matricula_provincial: g.matricula_provincial, cuit: g.cuit } });
      }
    } else {
      inserts.push({
        geclisa_pre_id: g.geclisa_pre_id,
        nombre: g.nombre,
        matricula_provincial: g.matricula_provincial,
        cuit: g.cuit,
        es_socio: esSocio(g.nombre),
        activo: true,
      });
    }
  }

  let nuevos = 0;
  let actualizados = 0;
  if (inserts.length) {
    const { error } = await supabase.from('prestadores').insert(inserts);
    if (error) throw new Error('insert: ' + error.message);
    nuevos = inserts.length;
  }
  for (const { id, data } of updates) {
    const { error } = await supabase.from('prestadores').update(data).eq('id', id);
    if (error) throw new Error('update ' + id + ': ' + error.message);
    actualizados++;
  }

  return {
    total: geclisa.length,
    nuevos,
    actualizados,
    sinCambios: geclisa.length - nuevos - actualizados,
    insertados: nuevos + actualizados, // lo que el daemon loguea como "filas tocadas"
    escrito: true,
  };
}

module.exports = { extraerPrestadores, sincronizarPrestadores };
