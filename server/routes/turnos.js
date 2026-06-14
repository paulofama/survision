// ============================================
// RUTAS DE TURNOS - ANÁLISIS
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/turnos/analisis
// Dashboard analítico completo de turnos
// ============================================

router.get('/analisis', async (req, res) => {
  try {
    console.log('📊 Cargando análisis de turnos...');

    // ============================================
    // 1. RESUMEN GENERAL DEL MES
    // ============================================
    const queryResumen = `
      SELECT 
        -- Total del mes
        (SELECT COUNT(*) 
         FROM Turnos 
         WHERE YEAR(tur_fecha) = YEAR(GETDATE()) 
           AND MONTH(tur_fecha) = MONTH(GETDATE())
        ) AS totalMes,
        
        -- Pendientes futuros (Me_id = 0 significa pendiente)
        (SELECT COUNT(*) 
         FROM Turnos 
         WHERE (Me_id = 0 OR Me_id IS NULL)
           AND tur_fecha >= CAST(GETDATE() AS DATE)
           AND tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)
        ) AS pendientesFuturos,
        
        -- Atendidos del mes (Me_id > 0)
        (SELECT COUNT(*) 
         FROM Turnos 
         WHERE Me_id > 0
           AND YEAR(tur_fecha) = YEAR(GETDATE()) 
           AND MONTH(tur_fecha) = MONTH(GETDATE())
        ) AS atendidos,
        
        -- Ausentes (pendientes en fechas pasadas)
        (SELECT COUNT(*) 
         FROM Turnos 
         WHERE (Me_id = 0 OR Me_id IS NULL)
           AND tur_fecha < CAST(GETDATE() AS DATE)
           AND YEAR(tur_fecha) = YEAR(GETDATE()) 
           AND MONTH(tur_fecha) = MONTH(GETDATE())
        ) AS ausentes,
        
        -- Turnos de hoy
        (SELECT COUNT(*) 
         FROM Turnos 
         WHERE CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
        ) AS turnosHoy,
        
        -- Pendientes de hoy
        (SELECT COUNT(*) 
         FROM Turnos 
         WHERE (Me_id = 0 OR Me_id IS NULL)
           AND CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
        ) AS pendientesHoy
    `;

    const resultResumen = await executeQuery(queryResumen);
    const r = resultResumen.recordset[0];

    // Calcular tasas
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
      tasaOcupacion: tasaOcupacion,
      tasaAusentismo: tasaAusentismo
    };

    // ============================================
    // 2. PRÓXIMOS 7 DÍAS
    // ============================================
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
    
    // Traducir días de la semana
    const traducirDia = (dia) => {
      const traducciones = {
        'Monday': 'Lun',
        'Tuesday': 'Mar',
        'Wednesday': 'Mié',
        'Thursday': 'Jue',
        'Friday': 'Vie',
        'Saturday': 'Sáb',
        'Sunday': 'Dom'
      };
      return traducciones[dia] || dia;
    };

    const proximos7Dias = resultProximos.recordset.map(row => ({
      fecha: row.fecha,
      diaSemana: traducirDia(row.diaSemana),
      total: row.total || 0,
      pendientes: row.pendientes || 0,
      atendidos: row.atendidos || 0,
      confirmados: row.confirmados || 0
    }));

    // ============================================
    // 3. POR PRESTADOR (mes actual)
    // ============================================
    const queryPorPrestador = `
      SELECT TOP 15
        ISNULL(p.pre_nombre, 'Sin Prestador') AS prestador,
        COUNT(*) AS total,
        SUM(CASE WHEN t.Me_id = 0 OR t.Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN t.Me_id > 0 THEN 1 ELSE 0 END) AS atendidos
      FROM Turnos t
      LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
      WHERE YEAR(t.tur_fecha) = YEAR(GETDATE()) 
        AND MONTH(t.tur_fecha) = MONTH(GETDATE())
      GROUP BY p.pre_nombre
      ORDER BY COUNT(*) DESC
    `;

    const resultPrestadores = await executeQuery(queryPorPrestador);
    
    const porPrestador = resultPrestadores.recordset.map(row => {
      const totalPasados = row.atendidos + (row.total - row.pendientes - row.atendidos);
      const ausentes = row.total - row.pendientes - row.atendidos;
      return {
        prestador: row.prestador,
        total: row.total || 0,
        pendientes: row.pendientes || 0,
        atendidos: row.atendidos || 0,
        tasaAusentismo: totalPasados > 0 ? ((row.total - row.pendientes - row.atendidos) / totalPasados) * 100 : 0
      };
    });

    // ============================================
    // 4. POR SERVICIO (mes actual)
    // ============================================
    const queryPorServicio = `
      SELECT TOP 10
        ISNULL(s.Serv_Nombre, 'Sin Servicio') AS servicio,
        COUNT(*) AS total,
        SUM(CASE WHEN t.Me_id = 0 OR t.Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN t.Me_id > 0 THEN 1 ELSE 0 END) AS atendidos
      FROM Turnos t
      LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
      WHERE YEAR(t.tur_fecha) = YEAR(GETDATE()) 
        AND MONTH(t.tur_fecha) = MONTH(GETDATE())
      GROUP BY s.Serv_Nombre
      ORDER BY COUNT(*) DESC
    `;

    const resultServicios = await executeQuery(queryPorServicio);
    
    const porServicio = resultServicios.recordset.map(row => ({
      servicio: row.servicio,
      total: row.total || 0,
      pendientes: row.pendientes || 0,
      atendidos: row.atendidos || 0
    }));

    // ============================================
    // 5. TURNOS DE HOY (detalle)
    // ============================================
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
        CASE 
          WHEN t.Me_id > 0 THEN 'ATENDIDO'
          WHEN t.Me_id = 0 OR t.Me_id IS NULL THEN 'PENDIENTE'
          ELSE 'PENDIENTE'
        END AS estado
      FROM Turnos t
      LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
      LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
      LEFT JOIN ObrasSociales os ON t.os_id = os.os_id
      WHERE CAST(t.tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY t.Hs_Ini
    `;

    const resultHoy = await executeQuery(queryTurnosHoy);
    
    const turnosHoy = resultHoy.recordset.map(row => ({
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
      estado: row.estado
    }));

    // ============================================
    // 6. PRÓXIMOS TURNOS PENDIENTES
    // ============================================
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
      WHERE (t.Me_id = 0 OR t.Me_id IS NULL)
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
      ORDER BY t.tur_fecha, t.Hs_Ini
    `;

    const resultPendientes = await executeQuery(queryPendientes);
    
    const turnosPendientes = resultPendientes.recordset.map(row => ({
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
      estado: row.estado
    }));

    // ============================================
    // RESPUESTA
    // ============================================
    console.log('✅ Análisis de turnos completado');

    res.json({
      resumen,
      proximos7Dias,
      porPrestador,
      porServicio,
      turnosHoy,
      turnosPendientes,
      metadata: {
        timestamp: new Date().toISOString(),
        servidor: '192.168.1.73',
        baseDatos: 'Geclisa'
      }
    });

  } catch (error) {
    console.error('❌ Error en análisis de turnos:', error);
    res.status(500).json({
      error: 'Error al cargar análisis de turnos',
      detalle: error.message
    });
  }
});

// ============================================
// GET /api/turnos/hoy
// Turnos del día actual
// ============================================

router.get('/hoy', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.turno_id AS id,
        t.tur_fecha AS fecha,
        CAST(t.Hs_Ini / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(t.Hs_Ini % 100 AS VARCHAR), 2) AS hora,
        RTRIM(ISNULL(t.tfic_ape, '')) + ', ' + RTRIM(ISNULL(t.tfic_nombre, '')) AS paciente,
        RTRIM(ISNULL(t.nom_nom, 'S/D')) AS practica,
        ISNULL(p.pre_nombre, 'S/D') AS prestador,
        ISNULL(s.Serv_Nombre, 'S/D') AS servicio,
        ISNULL(os.os_nombre, 'PARTICULAR') AS obraSocial,
        ISNULL(t.confirmado, 0) AS confirmado,
        CASE 
          WHEN t.Me_id > 0 THEN 'ATENDIDO'
          ELSE 'PENDIENTE'
        END AS estado
      FROM Turnos t
      LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
      LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
      LEFT JOIN ObrasSociales os ON t.os_id = os.os_id
      WHERE CAST(t.tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY t.Hs_Ini
    `;

    const result = await executeQuery(query);
    res.json(result.recordset);

  } catch (error) {
    console.error('Error al obtener turnos de hoy:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET /api/turnos/semana
// Resumen de la próxima semana
// ============================================

router.get('/semana', async (req, res) => {
  try {
    const query = `
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

    const result = await executeQuery(query);
    res.json(result.recordset);

  } catch (error) {
    console.error('Error al obtener turnos de la semana:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
