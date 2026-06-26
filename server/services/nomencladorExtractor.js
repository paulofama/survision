// ============================================================
// SERVICIO: Extractor de nomenclador/prestaciones GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Replica el endpoint POST /api/nomenclador/sync pero server-side: trae los
// códigos+nombres del Nomenclador de GECLISA (agrupación nom_id=10) y los
// upsertea en la tabla Supabase `prestaciones`.
//
// IMPORTANTE: SOLO toca código+practica (el nombre). NUNCA pisa precio/moneda/
// activa/agrupacion_id/segmento_honorarios (los carga/edita el usuario). Para
// los existentes hace UPDATE del nombre si cambió; para los nuevos hace INSERT
// con precio NULL. Así el precio cargado a mano queda intacto.
//
// Lo dispara el daemon de sync on-prem (sync-all.cjs) y el CLI de maestros.
// Patrón: igual que pacientesExtractor.js / prestadoresExtractor.js.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

const AGRUPACION_ID = 10; // misma constante que la ruta /api/nomenclador

const QUERY_NOMENCLADOR = `
  SELECT RTRIM(LTRIM(nom_cod)) AS codigo, RTRIM(LTRIM(nom_nom)) AS practica
  FROM Nomenclador
  WHERE nom_id = @ag
  ORDER BY nom_cod ASC
`;

/** Lee el nomenclador (nom_id=10) de GECLISA: codigo + practica (nombre).
 *  Dedup por código (primero gana): GECLISA tiene algún nom_cod repetido con
 *  distinto nombre bajo nom_id=10; sin dedup, el sync oscilaría escribiendo un
 *  nombre distinto en cada corrida (no sería idempotente). */
async function extraerNomenclador() {
  const r = await executeQuery(QUERY_NOMENCLADOR, { ag: AGRUPACION_ID });
  const porCodigo = new Map();
  for (const row of r.recordset || []) {
    const codigo = (row.codigo || '').trim();
    if (!codigo || porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, { codigo, practica: (row.practica || '').trim() || codigo });
  }
  return [...porCodigo.values()];
}

/** Sincroniza nombres GECLISA -> Supabase preservando precio/moneda/activa. */
async function sincronizarNomenclador({ write = false } = {}) {
  const geclisa = await extraerNomenclador();
  if (!write) return { total: geclisa.length, escrito: false };

  const { data: existentes, error: selErr } = await supabase
    .from('prestaciones')
    .select('codigo, practica');
  if (selErr) throw new Error('select: ' + selErr.message);

  const byCodigo = new Map();
  (existentes || []).forEach((p) => {
    if (p.codigo) byCodigo.set(p.codigo.trim(), p);
  });

  const inserts = [];
  const updates = [];
  for (const g of geclisa) {
    const ex = byCodigo.get(g.codigo);
    if (ex) {
      if ((ex.practica || '').trim() !== g.practica) {
        updates.push({ codigo: g.codigo, practica: g.practica });
      }
    } else {
      // Alta: solo nombre. Precio NULL (lo carga el usuario), defaults del resto.
      inserts.push({ codigo: g.codigo, practica: g.practica, precio: null, moneda: 'USD', activa: true });
    }
  }

  let nuevos = 0;
  let actualizados = 0;
  if (inserts.length) {
    const LOTE = 100;
    for (let i = 0; i < inserts.length; i += LOTE) {
      const lote = inserts.slice(i, i + LOTE);
      const { error } = await supabase.from('prestaciones').insert(lote);
      if (error) throw new Error(`insert lote ${i}: ${error.message}`);
      nuevos += lote.length;
    }
  }
  for (const { codigo, practica } of updates) {
    const { error } = await supabase.from('prestaciones').update({ practica }).eq('codigo', codigo);
    if (error) throw new Error('update ' + codigo + ': ' + error.message);
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

module.exports = { extraerNomenclador, sincronizarNomenclador };
