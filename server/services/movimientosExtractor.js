// ============================================================
// SERVICIO: Extractor de movimientos crudos GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Espeja las atenciones (Me_Area='A') al grano atención×práctica×prestador en la
// tabla Supabase `movimientos_geclisa`, desnormalizado. Es la base del explorador
// de Análisis (listado + stats-periodo + por-OS/prestador/prestación/grupo +
// evolución) para que el frontend remoto filtre/agregue sin pegarle a GECLISA.
//
// Reglas de monto (ver migración 12): el monto vive a nivel ATENCIÓN y se repite
// en cada fila. es_principal marca la fila del listado (1ª práctica + 1er
// prestador); cant_prestadores habilita el prorrateo por prestador.
//
// Refresh por DELETE de rango de fechas + INSERT (idempotente):
//   - histórico: desde 2024-01-01 hasta hoy (una vez, por CLI).
//   - daemon: solo el mes en curso (las atenciones viejas no cambian).
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// LEFT JOINs para conservar atenciones sin práctica/prestador (las muestra el
// listado). El monto sale de MovEnca. es_principal y cant_prestadores se
// calculan con funciones de ventana por atención.
// cant_prestadores (distintos por atención) en un CTE aparte: SQL Server no
// permite COUNT(DISTINCT ...) OVER(). es_principal con ROW_NUMBER (sin distinct).
const QUERY_RANGO = `
  WITH prest_por_at AS (
    SELECT m.Me_id, COUNT(DISTINCT mpr.Pre_id) AS cant
    FROM MovEnca m
    INNER JOIN MovPrac mp ON mp.Me_id = m.Me_id
    INNER JOIN MovPre mpr ON mpr.Mp_id = mp.Mp_id
    WHERE m.Me_Area = 'A' AND m.Me_Fecha >= @desde AND m.Me_Fecha <= @hasta
    GROUP BY m.Me_id
  ),
  base AS (
    SELECT
      m.Me_id AS atencion_id,
      ISNULL(mp.Mp_id, 0) AS mp_id,
      ISNULL(mpr.Pre_id, 0) AS pre_id,
      m.Me_Fecha AS fecha,
      m.Me_Hs AS hora,
      RTRIM(ISNULL(m.Me_Ape, '')) + ', ' + RTRIM(ISNULL(m.Me_Nombre, '')) AS paciente,
      m.Me_Edad AS edad,
      m.Me_Diagnostico AS diagnostico,
      m.Me_estado AS estado,
      m.Usu_Alta AS usuario_alta,
      m.Os_id AS os_id,
      os.os_sigla AS os_sigla,
      os.os_nombre AS os_nombre,
      mp.nom_cod AS practica_codigo,
      CASE WHEN CHARINDEX('(', n.nom_nom) > 0
           THEN RTRIM(LEFT(n.nom_nom, CHARINDEX('(', n.nom_nom) - 1))
           ELSE RTRIM(ISNULL(n.nom_nom, '')) END AS practica_nombre,
      mp.Serv_id AS grupo_id,
      s.Serv_Nombre AS grupo_nombre,
      pre.pre_nombre AS prestador_nombre,
      m.EntDer_id AS derivador_id,
      ed.EntDer_nombre AS derivador,
      ISNULL(m.Me_Cose, 0) AS coseguro,
      ISNULL(m.Me_ValorPrac, 0) AS cobertura,
      ISNULL(ppa.cant, 0) AS cant_prestadores,
      ROW_NUMBER() OVER (PARTITION BY m.Me_id ORDER BY ISNULL(mp.Mp_id, 0), ISNULL(mpr.Pre_id, 0)) AS rn_principal
    FROM MovEnca m
    LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id
    LEFT JOIN EntidadesDerivantes ed ON m.EntDer_id = ed.EntDer_id
    LEFT JOIN MovPrac mp ON mp.Me_id = m.Me_id
    LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    LEFT JOIN Servicios s ON mp.Serv_id = s.Serv_Id
    LEFT JOIN MovPre mpr ON mpr.Mp_id = mp.Mp_id
    LEFT JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
    LEFT JOIN prest_por_at ppa ON ppa.Me_id = m.Me_id
    WHERE m.Me_Area = 'A' AND m.Me_Fecha >= @desde AND m.Me_Fecha <= @hasta
  )
  SELECT * FROM base
`;

function limpiarPaciente(s) {
  return (s || '').trim().replace(/^,\s*/, '').replace(/,\s*$/, '');
}

/** Lee las atenciones de GECLISA en [desde, hasta] (date string YYYY-MM-DD), planas. */
async function extraerMovimientos(desde, hasta) {
  const r = await executeQuery(QUERY_RANGO, { desde, hasta });

  // Dedup por la clave (atencion_id, mp_id, pre_id): GECLISA puede tener el mismo
  // prestador repetido en una práctica (varias líneas MovPre). Para el grano de
  // agregación se colapsan; conservo la de menor rn_principal (la "principal").
  const porClave = new Map();
  for (const row of r.recordset || []) {
    const clave = `${row.atencion_id}-${row.mp_id || 0}-${row.pre_id || 0}`;
    const prev = porClave.get(clave);
    if (!prev || Number(row.rn_principal) < Number(prev.rn_principal)) porClave.set(clave, row);
  }

  return [...porClave.values()].map((row) => {
    // Fecha en UTC: mssql devuelve Me_Fecha a medianoche UTC; usar métodos
    // locales desfasaría el día/mes en TZ negativas (el 1° caería al mes anterior).
    const fecha = new Date(row.fecha);
    const coseguro = parseFloat(row.coseguro) || 0;
    const cobertura = parseFloat(row.cobertura) || 0;
    return {
      atencion_id: row.atencion_id,
      mp_id: row.mp_id || 0,
      pre_id: row.pre_id || 0,
      fecha: fecha.toISOString().split('T')[0],
      anio: fecha.getUTCFullYear(),
      mes: fecha.getUTCMonth() + 1,
      dia: fecha.getUTCDate(),
      hora: row.hora ?? null,
      paciente: limpiarPaciente(row.paciente) || 'Sin nombre',
      edad: row.edad ?? null,
      diagnostico: (row.diagnostico || '').trim() || null,
      estado: (row.estado || '').toString().trim() || null,
      usuario_alta: (row.usuario_alta || '').trim() || null,
      os_id: row.os_id ?? null,
      os_sigla: (row.os_sigla || '').trim() || null,
      os_nombre: (row.os_nombre || '').trim() || null,
      practica_codigo: (row.practica_codigo || '').trim() || null,
      practica_nombre: (row.practica_nombre || '').trim() || null,
      grupo_id: row.grupo_id ?? null,
      grupo_nombre: (row.grupo_nombre || '').trim() || null,
      prestador_nombre: (row.prestador_nombre || '').trim() || null,
      derivador_id: row.derivador_id ?? null,
      derivador: (row.derivador || '').trim() || null,
      coseguro,
      cobertura,
      total: coseguro + cobertura,
      cant_prestadores: Number(row.cant_prestadores) || 0,
      es_principal: Number(row.rn_principal) === 1,
    };
  });
}

/** Rango por defecto del daemon: el mes en curso (lo único que puede cambiar). */
function rangoMesEnCurso() {
  const hoy = new Date();
  const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hasta = hoy.toISOString().split('T')[0];
  return { desde, hasta };
}

/**
 * Sincroniza un rango de fechas (DELETE rango + INSERT). Idempotente.
 *   sin opts            -> mes en curso (daemon)
 *   { historico: true } -> desde 2024-01-01 hasta hoy (carga inicial)
 *   { desde, hasta }    -> rango explícito
 */
async function sincronizarMovimientos({ write = false, historico = false, desde, hasta } = {}) {
  let rDesde = desde;
  let rHasta = hasta;
  if (!rDesde || !rHasta) {
    if (historico) {
      rDesde = '2024-01-01';
      rHasta = new Date().toISOString().split('T')[0];
    } else {
      ({ desde: rDesde, hasta: rHasta } = rangoMesEnCurso());
    }
  }

  const filas = await extraerMovimientos(rDesde, rHasta);
  if (!write) return { total: filas.length, desde: rDesde, hasta: rHasta, escrito: false };

  // DELETE del rango (por fecha) antes de reinsertar -> idempotente
  const { error: delErr } = await supabase
    .from('movimientos_geclisa')
    .delete()
    .gte('fecha', rDesde)
    .lte('fecha', rHasta);
  if (delErr) throw new Error('delete rango: ' + delErr.message);

  let insertados = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await supabase.from('movimientos_geclisa').insert(lote);
    if (error) throw new Error(`insert lote ${i}: ${error.message}`);
    insertados += lote.length;
  }

  return { total: filas.length, insertados, desde: rDesde, hasta: rHasta, escrito: true };
}

module.exports = { extraerMovimientos, sincronizarMovimientos };
