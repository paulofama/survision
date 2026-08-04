// ============================================================
// SERVICIO: Extractor de turnos futuros GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
//
// Alimenta la sección operativa "Turnos" (agenda de turnos futuros +
// recordatorios por WhatsApp). A diferencia de turnosExtractor.js (que arma el
// snapshot analítico del dashboard), acá espejamos el DETALLE fila-por-fila de
// los turnos VIGENTES para listarlos y mandar recordatorios.
//
// Vigente = tur_fecha >= hoy AND (Me_id = 0 OR Me_id IS NULL). No hay flag de
// anulado en GECLISA (los anulados se borran), así que esto es todo turno vivo.
//
// El celular del paciente sale de Turnos.tfic_cel (cobertura 100% y formato
// consistente de 10 dígitos), NO de ttelefono (3.6%, formatos viejos). Se
// normaliza en JS a "549XXXXXXXXXX" (Argentina móvil, listo para wa.me) o NULL
// si es inválido -> el frontend no hace lógica de teléfono.
//
// Full refresh (~280 filas): borra todo e inserta. Lo corre el daemon on-prem.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

/**
 * Normaliza un celular argentino a formato wa.me ("549" + 10 dígitos).
 * Devuelve null si no se puede validar.
 * @param {string|null} cel - valor crudo de tfic_cel
 * @returns {string|null}
 */
function normalizarCelular(cel) {
  if (!cel) return null;
  let d = String(cel).replace(/\D/g, ''); // solo dígitos
  if (!d) return null;

  // Sacar prefijo país si vino pegado (54 / 549).
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);

  // Sacar 0 de característica y 15 de celular si aparecieran (defensivo;
  // en este dato no vienen, pero no molesta).
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12 && d.startsWith('15')) d = d.slice(2); // raro, por las dudas

  // Tiene que quedar en 10 dígitos (característica + número).
  if (d.length !== 10) return null;

  // Descartar basura conocida: todos iguales, o relleno 0000/9999.
  if (/^(\d)\1{9}$/.test(d)) return null;          // 0000000000, 9999999999, etc.
  if (/^0000|9999$/.test(d) || d.startsWith('0000') || d.endsWith('9999')) {
    // patrones tipo 0000XXXX00 / 9999XXXX99 vistos en el diagnóstico
    if (d.startsWith('0000') || d.startsWith('9999')) return null;
  }
  if (d.startsWith('0')) return null;

  return '549' + d;
}

/** Trae los turnos futuros vigentes de GECLISA (detalle fila-por-fila). */
async function extraerTurnosFuturos() {
  const query = `
    SELECT
      t.turno_id AS turno_id,
      CAST(t.tur_fecha AS DATE) AS fecha,
      CAST(t.Hs_Ini / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(t.Hs_Ini % 100 AS VARCHAR), 2) AS hora,
      t.Hs_Ini AS hs_ini,
      RTRIM(ISNULL(t.tfic_ape, '')) + ', ' + RTRIM(ISNULL(t.tfic_nombre, '')) AS paciente,
      t.tfic_cel AS cel,
      ISNULL(p.pre_nombre, 'S/D') AS prestador,
      t.serv_id AS serv_id,
      ISNULL(s.Serv_Nombre, 'S/D') AS servicio,
      ISNULL(os.os_nombre, 'PARTICULAR') AS obra_social,
      ISNULL(t.confirmado, 0) AS confirmado
    FROM Turnos t
    LEFT JOIN Prestadores p   ON t.pre_id = p.pre_id
    LEFT JOIN Servicios s     ON t.serv_id = s.Serv_Id
    LEFT JOIN ObrasSociales os ON t.os_id = os.os_id
    WHERE t.tur_fecha >= CAST(GETDATE() AS DATE)
      AND (t.Me_id = 0 OR t.Me_id IS NULL)
    ORDER BY t.tur_fecha, t.Hs_Ini
  `;
  const result = await executeQuery(query);
  return result.recordset.map((row) => ({
    turno_id: row.turno_id,
    fecha: row.fecha,
    hora: row.hora,
    hs_ini: row.hs_ini ?? null,
    paciente: row.paciente?.trim() || 'Sin nombre',
    telefono_norm: normalizarCelular(row.cel),
    prestador: row.prestador,
    serv_id: row.serv_id ?? null,
    servicio: row.servicio,
    obra_social: row.obra_social,
    confirmado: row.confirmado === 1,
  }));
}

/**
 * Trae los turnos futuros y refresca la tabla turnos_futuros.
 * Estrategia upsert + borrado de obsoletos (NO delete-all): la tabla nunca
 * queda vacía, así esta sync puede correr muy seguido (cada ~15 min) para que
 * un turno recién cargado aparezca afuera casi en el momento y se le pueda
 * mandar el recordatorio. Cada corrida estampa synced_at con un timestamp único;
 * lo que no se refrescó en esta corrida (turnos ya atendidos/pasados/anulados)
 * se borra al final.
 */
async function sincronizarTurnosFuturos({ write = false } = {}) {
  const filas = await extraerTurnosFuturos();
  const conTel = filas.filter((f) => f.telefono_norm).length;

  if (!write) {
    return { total: filas.length, escrito: false, conTelefono: conTel };
  }

  const runTs = new Date().toISOString();
  const rows = filas.map((f) => ({ ...f, synced_at: runTs }));

  // Upsert por lotes (onConflict turno_id): inserta nuevos, actualiza existentes.
  let insertados = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const lote = rows.slice(i, i + 500);
    const { error: upErr } = await supabase
      .from('turnos_futuros')
      .upsert(lote, { onConflict: 'turno_id' });
    if (upErr) throw new Error('upsert turnos_futuros: ' + upErr.message);
    insertados += lote.length;
  }

  // Borrar los obsoletos: filas que esta corrida NO refrescó (synced_at viejo).
  const { error: delErr } = await supabase
    .from('turnos_futuros')
    .delete()
    .lt('synced_at', runTs);
  if (delErr) throw new Error('delete obsoletos turnos_futuros: ' + delErr.message);

  return { total: filas.length, insertados, escrito: true, conTelefono: conTel };
}

module.exports = { extraerTurnosFuturos, sincronizarTurnosFuturos, normalizarCelular };
