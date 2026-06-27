// ============================================================
// SERVICIO: Extractor del análisis de turnos GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Corre las mismas queries que la ruta GET /api/turnos/analisis y arma el
// MISMO payload del dashboard (resumen, próximos 7 días, por prestador, por
// servicio, turnos de hoy, pendientes). `sincronizarTurnos` lo guarda como
// snapshot (1 fila) en la tabla Supabase `turnos_analisis`.
//
// Así el dashboard de turnos (frontend remoto) lee el snapshot de Supabase sin
// pegarle a GECLISA en vivo. Lo refresca el daemon on-prem 2 veces/día.
//
// La ruta /api/turnos/analisis también usa extraerAnalisisTurnos() -> una sola
// fuente de verdad (sin drift entre LAN y snapshot).
//
// NOTA: el snapshot es date-sensible (turnos de hoy, próximos 7 días). Refleja
// el momento del último sync (ver synced_at). Aceptable para un dashboard
// analítico; el frontend muestra la hora del snapshot.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

function traducirDia(dia) {
  const t = {
    Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mié', Thursday: 'Jue',
    Friday: 'Vie', Saturday: 'Sáb', Sunday: 'Dom',
  };
  return t[dia] || dia;
}

/** Corre las 6 queries y arma el payload completo del dashboard de turnos. */
async function extraerAnalisisTurnos() {
  // 1. RESUMEN GENERAL DEL MES
  const queryResumen = `
    SELECT
      (SELECT COUNT(*) FROM Turnos
        WHERE YEAR(tur_fecha) = YEAR(GETDATE()) AND MONTH(tur_fecha) = MONTH(GETDATE())) AS totalMes,
      (SELECT COUNT(*) FROM Turnos
        WHERE (Me_id = 0 OR Me_id IS NULL)
          AND tur_fecha >= CAST(GETDATE() AS DATE)
          AND tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)) AS pendientesFuturos,
      (SELECT COUNT(*) FROM Turnos
        WHERE Me_id > 0 AND YEAR(tur_fecha) = YEAR(GETDATE()) AND MONTH(tur_fecha) = MONTH(GETDATE())) AS atendidos,
      (SELECT COUNT(*) FROM Turnos
        WHERE (Me_id = 0 OR Me_id IS NULL)
          AND tur_fecha < CAST(GETDATE() AS DATE)
          AND YEAR(tur_fecha) = YEAR(GETDATE()) AND MONTH(tur_fecha) = MONTH(GETDATE())) AS ausentes,
      (SELECT COUNT(*) FROM Turnos
        WHERE CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)) AS turnosHoy,
      (SELECT COUNT(*) FROM Turnos
        WHERE (Me_id = 0 OR Me_id IS NULL) AND CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)) AS pendientesHoy
  `;
  const resultResumen = await executeQuery(queryResumen);
  const r = resultResumen.recordset[0];

  const totalPasados = r.atendidos + r.ausentes;
  const tasaOcupacion = totalPasados > 0 ? (r.atendidos / totalPasados) * 100 : 0;
  const tasaAusentismo = totalPasados > 0 ? (r.ausentes / totalPasados) * 100 : 0;

  const resumen = {
    totalMes: r.totalMes || 0,
    pendientesFuturos: r.pendientesFuturos || 0,
    atendidos: r.atendidos || 0,
    ausentes: r.ausentes || 0,
    turnosHoy: r.turnosHoy || 0,
    pendientesHoy: r.pendientesHoy || 0,
    tasaOcupacion,
    tasaAusentismo,
  };

  // 2. PRÓXIMOS 7 DÍAS
  const queryProximos7Dias = `
    SELECT
      CAST(tur_fecha AS DATE) AS fecha,
      DATENAME(WEEKDAY, tur_fecha) AS diaSemana,
      COUNT(*) AS total,
      SUM(CASE WHEN Me_id = 0 OR Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN Me_id > 0 THEN 1 ELSE 0 END) AS atendidos,
      SUM(CASE WHEN confirmado = 1 THEN 1 ELSE 0 END) AS confirmados
    FROM Turnos
    WHERE tur_fecha >= CAST(GETDATE() AS DATE)
      AND tur_fecha < DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
    GROUP BY CAST(tur_fecha AS DATE), DATENAME(WEEKDAY, tur_fecha)
    ORDER BY fecha
  `;
  const resultProximos = await executeQuery(queryProximos7Dias);
  const proximos7Dias = resultProximos.recordset.map((row) => ({
    fecha: row.fecha,
    diaSemana: traducirDia(row.diaSemana),
    total: row.total || 0,
    pendientes: row.pendientes || 0,
    atendidos: row.atendidos || 0,
    confirmados: row.confirmados || 0,
  }));

  // 3. POR PRESTADOR (mes actual)
  const queryPorPrestador = `
    SELECT TOP 15
      ISNULL(p.pre_nombre, 'Sin Prestador') AS prestador,
      COUNT(*) AS total,
      SUM(CASE WHEN t.Me_id = 0 OR t.Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN t.Me_id > 0 THEN 1 ELSE 0 END) AS atendidos
    FROM Turnos t
    LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
    WHERE YEAR(t.tur_fecha) = YEAR(GETDATE()) AND MONTH(t.tur_fecha) = MONTH(GETDATE())
    GROUP BY p.pre_nombre
    ORDER BY COUNT(*) DESC
  `;
  const resultPrestadores = await executeQuery(queryPorPrestador);
  const porPrestador = resultPrestadores.recordset.map((row) => {
    const ausentes = row.total - row.pendientes - row.atendidos;
    const pasados = row.atendidos + ausentes;
    return {
      prestador: row.prestador,
      total: row.total || 0,
      pendientes: row.pendientes || 0,
      atendidos: row.atendidos || 0,
      tasaAusentismo: pasados > 0 ? (ausentes / pasados) * 100 : 0,
    };
  });

  // 4. POR SERVICIO (mes actual)
  const queryPorServicio = `
    SELECT TOP 10
      ISNULL(s.Serv_Nombre, 'Sin Servicio') AS servicio,
      COUNT(*) AS total,
      SUM(CASE WHEN t.Me_id = 0 OR t.Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN t.Me_id > 0 THEN 1 ELSE 0 END) AS atendidos
    FROM Turnos t
    LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
    WHERE YEAR(t.tur_fecha) = YEAR(GETDATE()) AND MONTH(t.tur_fecha) = MONTH(GETDATE())
    GROUP BY s.Serv_Nombre
    ORDER BY COUNT(*) DESC
  `;
  const resultServicios = await executeQuery(queryPorServicio);
  const porServicio = resultServicios.recordset.map((row) => ({
    servicio: row.servicio,
    total: row.total || 0,
    pendientes: row.pendientes || 0,
    atendidos: row.atendidos || 0,
  }));

  // 5. TURNOS DE HOY (detalle)
  const queryTurnosHoy = `
    SELECT TOP 50
      t.turno_id AS id,
      t.tur_fecha AS fecha,
      CAST(t.Hs_Ini / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(t.Hs_Ini % 100 AS VARCHAR), 2) AS hora,
      RTRIM(ISNULL(t.tfic_ape, '')) + ', ' + RTRIM(ISNULL(t.tfic_nombre, '')) AS paciente,
      RTRIM(ISNULL(t.nom_nom, 'S/D')) AS practica,
      ISNULL(p.pre_nombre, 'S/D') AS prestador,
      ISNULL(s.Serv_Nombre, 'S/D') AS servicio,
      ISNULL(os.os_nombre, 'PARTICULAR') AS obraSocial,
      ISNULL(t.confirmado, 0) AS confirmado,
      ISNULL(t.esWeb, 0) AS esWeb,
      CASE WHEN t.Me_id > 0 THEN 'ATENDIDO' ELSE 'PENDIENTE' END AS estado
    FROM Turnos t
    LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
    LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
    LEFT JOIN ObrasSociales os ON t.os_id = os.os_id
    WHERE CAST(t.tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
    ORDER BY t.Hs_Ini
  `;
  const resultHoy = await executeQuery(queryTurnosHoy);
  const turnosHoy = resultHoy.recordset.map((row) => ({
    id: row.id,
    fecha: row.fecha,
    hora: row.hora,
    paciente: row.paciente?.trim() || 'Sin nombre',
    practica: row.practica?.trim() || 'S/D',
    prestador: row.prestador,
    servicio: row.servicio,
    obraSocial: row.obraSocial,
    confirmado: row.confirmado === 1,
    esWeb: row.esWeb === 1,
    estado: row.estado,
  }));

  // 6. PRÓXIMOS TURNOS PENDIENTES
  const queryPendientes = `
    SELECT TOP 30
      t.turno_id AS id,
      t.tur_fecha AS fecha,
      CAST(t.Hs_Ini / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(t.Hs_Ini % 100 AS VARCHAR), 2) AS hora,
      RTRIM(ISNULL(t.tfic_ape, '')) + ', ' + RTRIM(ISNULL(t.tfic_nombre, '')) AS paciente,
      RTRIM(ISNULL(t.nom_nom, 'S/D')) AS practica,
      ISNULL(p.pre_nombre, 'S/D') AS prestador,
      ISNULL(s.Serv_Nombre, 'S/D') AS servicio,
      ISNULL(os.os_nombre, 'PARTICULAR') AS obraSocial,
      ISNULL(t.confirmado, 0) AS confirmado,
      ISNULL(t.esWeb, 0) AS esWeb,
      'PENDIENTE' AS estado
    FROM Turnos t
    LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
    LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
    LEFT JOIN ObrasSociales os ON t.os_id = os.os_id
    WHERE (t.Me_id = 0 OR t.Me_id IS NULL) AND t.tur_fecha >= CAST(GETDATE() AS DATE)
    ORDER BY t.tur_fecha, t.Hs_Ini
  `;
  const resultPendientes = await executeQuery(queryPendientes);
  const turnosPendientes = resultPendientes.recordset.map((row) => ({
    id: row.id,
    fecha: row.fecha,
    hora: row.hora,
    paciente: row.paciente?.trim() || 'Sin nombre',
    practica: row.practica?.trim() || 'S/D',
    prestador: row.prestador,
    servicio: row.servicio,
    obraSocial: row.obraSocial,
    confirmado: row.confirmado === 1,
    esWeb: row.esWeb === 1,
    estado: row.estado,
  }));

  return {
    resumen,
    proximos7Dias,
    porPrestador,
    porServicio,
    turnosHoy,
    turnosPendientes,
    metadata: {
      timestamp: new Date().toISOString(),
      servidor: '192.168.1.73',
      baseDatos: 'Geclisa',
    },
  };
}

/** Calcula el análisis y lo guarda como snapshot (1 fila) en Supabase. */
async function sincronizarTurnos({ write = false } = {}) {
  const payload = await extraerAnalisisTurnos();
  if (!write) return { total: 1, escrito: false, resumen: payload.resumen };

  const { error } = await supabase
    .from('turnos_analisis')
    .upsert({ id: 1, payload, synced_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw new Error('upsert turnos_analisis: ' + error.message);

  return {
    total: 1,
    insertados: 1,
    escrito: true,
    resumen: payload.resumen,
  };
}

module.exports = { extraerAnalisisTurnos, sincronizarTurnos };
