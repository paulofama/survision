// ============================================================
// SERVICIO: Conciliación agenda vs facturación GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
//
// POR QUÉ ESTE EXTRACTOR CORRE SOLO Y SEGUIDO
// --------------------------------------------
// `Turnos` es una VENTANA MÓVIL de ~4.500 filas que se purga: sostiene tres
// meses cerrados y cada mes que pasa se cae el más viejo. Medido: el 05/10/2026
// quedaban restos de junio; el 13/10/2026 la tabla arrancaba en julio.
//
// La conciliación de un mes sólo se puede CALCULAR mientras ese mes esté en la
// ventana. Por eso no alcanza con un CLI que alguien se acuerde de correr: lo
// corre el daemon, y lo que ya quedó espejado en Supabase sobrevive a la purga.
//
// QUÉ NO HACE: NO CORRIGE NADA
// -----------------------------
// El informe Por Prestación es fiel a lo FACTURADO. Lo que difiere es la
// agenda, en ~1,5 % de los turnos atendidos. La corrección se hace en GECLISA;
// este extractor sólo deja el detalle para que Administración sepa dónde.
//
// GRANO Y CAUSAS: ver `migrations/73_conciliacion_agenda.sql`.
//
// ⚠️ `tur_FechaAtendido`, NO `turt_id`
// -------------------------------------
// `turt_id` es el TIPO de turno, no el estado. Usarlo como "atendido" da 24
// turnos en septiembre cuando hubo 1.234: el denominador queda 50 veces más
// chico y cualquier porcentaje sale sin sentido.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS
// Lo que no toca ninguna base vive aparte, para poder testearlo.
const { finDeMes, aFila, resumirPorCausa } = require('./conciliacionAgendaReglas');

/**
 * Importes desde `MovEnca` (`Me_Cose` + `Me_ValorPrac`), que es el grano de la
 * ATENCIÓN. Los de MovPrac (`Mp_Tot`, `Mp_CoseTotal`) están en cero en esta
 * base: usarlos daría $0 en todo el informe.
 *
 * Verificado el 13/10/2026 sobre julio, agosto y septiembre: cero turnos
 * devuelven más de una fila, así que sumar por fila no infla el importe
 * (factor 1,00x). Si algún mes trajera una atención con dos prácticas, el
 * único por `turno_id` hace que quede una sola fila por turno.
 */
const QUERY = `
  WITH atendidos AS (
    SELECT t.turno_id, t.tur_fecha, LTRIM(RTRIM(t.nom_cod)) AS cod_turno, t.Me_id,
           LTRIM(RTRIM(ISNULL(t.tfic_ape, ''))) + ', ' + LTRIM(RTRIM(ISNULL(t.tfic_nombre, ''))) AS paciente,
           t.pre_id
      FROM Turnos t
     WHERE t.tur_fecha >= @desde AND t.tur_fecha < @hasta
       AND t.tur_FechaAtendido IS NOT NULL
  )
  SELECT a.turno_id,
         CAST(a.tur_fecha AS DATE) AS fecha_turno,
         a.paciente,
         a.cod_turno AS cod_agendado,
         LTRIM(RTRIM(ISNULL(mp.nom_cod, ''))) AS cod_facturado,
         ISNULL(n.nom_nom, '') AS practica,
         ISNULL(os.os_sigla, 'PART') AS obra_social,
         ISNULL(pre.pre_nombre, '') AS prestador,
         CAST(m.Me_Fecha AS DATE) AS fecha_movimiento,
         ISNULL(m.Me_Cose, 0) + ISNULL(m.Me_ValorPrac, 0) AS monto,
         CASE
           WHEN a.Me_id IS NULL THEN 'sin_atencion'
           WHEN mp.Mp_id IS NULL THEN 'sin_practica'
           WHEN DATEDIFF(month, m.Me_Fecha, a.tur_fecha) <> 0 THEN 'otro_mes'
           WHEN LTRIM(RTRIM(mp.nom_cod)) <> a.cod_turno THEN 'codigo_distinto'
           ELSE 'ok'
         END AS causa
    FROM atendidos a
    LEFT JOIN MovEnca m ON m.Me_id = a.Me_id
    LEFT JOIN MovPrac mp ON mp.Me_id = m.Me_id
    LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id
    LEFT JOIN Prestadores pre ON a.pre_id = pre.pre_id`;

/**
 * Qué meses de `Turnos` se pueden conciliar hoy.
 *
 * Se pregunta a la base en vez de asumir un largo de ventana: la purga no es un
 * número fijo y asumir "los últimos 3 meses" haría que un cambio de política
 * pase inadvertido. Se excluyen los meses sin turnos atendidos y las fechas
 * basura (hay una fila con `tur_fecha` en 2000-01).
 *
 * @returns {Promise<string[]>} meses YYYY-MM, del más viejo al más nuevo
 */
async function mesesConciliables() {
  const r = await executeQuery(`
    SELECT FORMAT(tur_fecha, 'yyyy-MM') AS mes, count(*) AS atendidos
      FROM Turnos
     WHERE tur_FechaAtendido IS NOT NULL
       AND tur_fecha >= DATEADD(year, -2, CAST(GETDATE() AS DATE))
     GROUP BY FORMAT(tur_fecha, 'yyyy-MM')
    HAVING count(*) >= 10
     ORDER BY mes`);
  return (r.recordset || []).map((f) => f.mes);
}

/** Las discrepancias de un mes. Devuelve [] si el mes ya salió de la ventana. */
async function extraerMes(mes) {
  // Los parámetros van como Date: `executeQuery` infiere el tipo, y un string
  // dejaría que SQL Server lo convierta según la configuración regional.
  const r = await executeQuery(QUERY, {
    desde: new Date(`${mes}-01T00:00:00`),
    hasta: new Date(`${finDeMes(mes)}T00:00:00`),
  });
  const filas = r.recordset || [];
  const atendidos = new Set(filas.map((f) => f.turno_id)).size;

  const problemas = filas
    .filter((f) => f.causa !== 'ok')
    .map((f) => aFila(mes, f));

  return { atendidos, problemas, porCausa: resumirPorCausa(problemas) };
}

/**
 * Espeja la conciliación de todos los meses que todavía están en la ventana.
 *
 * Las filas NO se borran. Lo que esta corrida dejó de detectar en un mes que SÍ
 * recalculó se marca `resuelta_at`: es la métrica de cuánto corrigió
 * Administración. Un mes que ya salió de la ventana no se puede recalcular, así
 * que no se lo toca — sus filas son el registro de lo que pasó.
 */
async function sincronizarConciliacionAgenda({ write = false } = {}) {
  const meses = await mesesConciliables();
  const detalle = [];
  let total = 0;

  for (const mes of meses) {
    const { atendidos, problemas, porCausa } = await extraerMes(mes);
    detalle.push({ mes, atendidos, discrepancias: problemas.length, porCausa });
    total += problemas.length;
    if (!write) continue;

    const runTs = new Date().toISOString();
    if (problemas.length) {
      const rows = problemas.map((p) => ({ ...p, synced_at: runTs, resuelta_at: null }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase
          .from('conciliacion_agenda')
          .upsert(rows.slice(i, i + 500), { onConflict: 'turno_id' });
        if (error) throw new Error(`upsert conciliacion_agenda (${mes}): ${error.message}`);
      }
    }

    // Lo que ya no se detecta en ESTE mes quedó corregido en GECLISA.
    const { error: resErr } = await supabase
      .from('conciliacion_agenda')
      .update({ resuelta_at: runTs })
      .eq('mes', mes)
      .is('resuelta_at', null)
      .lt('synced_at', runTs);
    if (resErr) throw new Error(`marcar resueltas (${mes}): ${resErr.message}`);
  }

  return { total, meses: meses.length, detalle, escrito: write };
}

module.exports = {
  sincronizarConciliacionAgenda,
  mesesConciliables,
  extraerMes,
};
