// ============================================
// RUTAS DE DIAGNÓSTICO - TURNOS GECLISA
// Sistema de Costos - Instituto Dr. Mercado
// Endpoint para investigar tabla Turnos
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/diagnostico/turnos
// Diagnóstico completo de la tabla Turnos
// ============================================

router.get('/turnos', async (req, res) => {
  try {
    console.log('🔍 Ejecutando diagnóstico completo de Turnos...');
    
    const diagnostico = {
      timestamp: new Date().toISOString(),
      servidor: '192.168.1.73',
      baseDatos: 'Geclisa',
      tabla: 'Turnos',
      secciones: {}
    };

    // ============================================
    // 1. VERIFICAR EXISTENCIA DE LA TABLA
    // ============================================
    const queryTablas = `
      SELECT TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME LIKE '%Turno%'
      ORDER BY TABLE_NAME
    `;
    const resultTablas = await executeQuery(queryTablas);
    diagnostico.secciones.tablasEncontradas = resultTablas.recordset;

    // ============================================
    // 2. ESTRUCTURA DE LA TABLA
    // ============================================
    const queryEstructura = `
      SELECT 
        COLUMN_NAME AS columna,
        DATA_TYPE AS tipoDato,
        CHARACTER_MAXIMUM_LENGTH AS longitud,
        IS_NULLABLE AS nullable
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Turnos'
      ORDER BY ORDINAL_POSITION
    `;
    const resultEstructura = await executeQuery(queryEstructura);
    diagnostico.secciones.estructura = resultEstructura.recordset;

    // ============================================
    // 3. ESTADÍSTICAS GENERALES
    // ============================================
    const queryEstadisticas = `
      SELECT 
        COUNT(*) AS totalTurnos,
        MIN(tur_fecha) AS fechaMasAntigua,
        MAX(tur_fecha) AS fechaMasReciente,
        COUNT(DISTINCT YEAR(tur_fecha)) AS aniosConDatos
      FROM Turnos
      WHERE tur_fecha IS NOT NULL
    `;
    const resultEstadisticas = await executeQuery(queryEstadisticas);
    diagnostico.secciones.estadisticasGenerales = resultEstadisticas.recordset[0];

    // ============================================
    // 4. DISTRIBUCIÓN ATENDIDOS vs PENDIENTES
    // ============================================
    const queryDistribucion = `
      SELECT 
        CASE 
          WHEN Me_id IS NULL THEN 'PENDIENTE'
          ELSE 'ATENDIDO'
        END AS estado,
        COUNT(*) AS cantidad,
        CAST(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM Turnos) AS DECIMAL(5,2)) AS porcentaje
      FROM Turnos
      GROUP BY CASE WHEN Me_id IS NULL THEN 'PENDIENTE' ELSE 'ATENDIDO' END
    `;
    const resultDistribucion = await executeQuery(queryDistribucion);
    diagnostico.secciones.distribucionEstado = resultDistribucion.recordset;

    // ============================================
    // 5. TURNOS POR AÑO (últimos 5)
    // ============================================
    const queryPorAnio = `
      SELECT 
        YEAR(tur_fecha) AS anio,
        COUNT(*) AS totalTurnos,
        SUM(CASE WHEN Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN Me_id IS NOT NULL THEN 1 ELSE 0 END) AS atendidos
      FROM Turnos
      WHERE tur_fecha IS NOT NULL
        AND YEAR(tur_fecha) >= YEAR(GETDATE()) - 4
      GROUP BY YEAR(tur_fecha)
      ORDER BY anio DESC
    `;
    const resultPorAnio = await executeQuery(queryPorAnio);
    diagnostico.secciones.turnosPorAnio = resultPorAnio.recordset;

    // ============================================
    // 6. TURNOS DEL MES ACTUAL
    // ============================================
    const queryMesActual = `
      SELECT 
        COUNT(*) AS totalTurnosMes,
        SUM(CASE WHEN Me_id IS NULL THEN 1 ELSE 0 END) AS todosPendientes,
        SUM(CASE WHEN Me_id IS NOT NULL THEN 1 ELSE 0 END) AS todosAtendidos,
        SUM(CASE WHEN Me_id IS NULL AND tur_fecha >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS pendientesFuturos,
        SUM(CASE WHEN Me_id IS NULL AND tur_fecha < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS pendientesPasados,
        SUM(CASE WHEN CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS turnosHoy
      FROM Turnos
      WHERE YEAR(tur_fecha) = YEAR(GETDATE())
        AND MONTH(tur_fecha) = MONTH(GETDATE())
    `;
    const resultMesActual = await executeQuery(queryMesActual);
    diagnostico.secciones.mesActual = resultMesActual.recordset[0];

    // ============================================
    // 7. QUERY ACTUAL DEL SISTEMA
    // ============================================
    const queryActualSistema = `
      SELECT COUNT(*) AS turnosPendientesSistema
      FROM Turnos t
      WHERE t.Me_id IS NULL
        AND YEAR(t.tur_fecha) = YEAR(GETDATE())
        AND MONTH(t.tur_fecha) = MONTH(GETDATE())
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
    `;
    const resultActualSistema = await executeQuery(queryActualSistema);
    diagnostico.secciones.queryActualSistema = {
      query: 'Me_id IS NULL AND mes actual AND fecha >= hoy',
      resultado: resultActualSistema.recordset[0]?.turnosPendientesSistema || 0
    };

    // ============================================
    // 8. ANÁLISIS CAMPO "confirmado"
    // ============================================
    const queryConfirmado = `
      SELECT 
        confirmado,
        COUNT(*) AS cantidad,
        SUM(CASE WHEN Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN Me_id IS NOT NULL THEN 1 ELSE 0 END) AS atendidos
      FROM Turnos
      WHERE YEAR(tur_fecha) = YEAR(GETDATE())
        AND MONTH(tur_fecha) = MONTH(GETDATE())
      GROUP BY confirmado
    `;
    const resultConfirmado = await executeQuery(queryConfirmado);
    diagnostico.secciones.analisisConfirmado = resultConfirmado.recordset;

    // ============================================
    // 9. TURNOS DE HOY (detalle)
    // ============================================
    const queryHoyDetalle = `
      SELECT TOP 20
        turno_id AS id,
        tur_fecha AS fecha,
        CAST(Hs_Ini / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(Hs_Ini % 100 AS VARCHAR), 2) AS horaInicio,
        RTRIM(ISNULL(tfic_ape, '')) + ', ' + RTRIM(ISNULL(tfic_nombre, '')) AS paciente,
        RTRIM(ISNULL(nom_nom, 'S/D')) AS practica,
        CASE WHEN confirmado = 1 THEN 'Sí' ELSE 'No' END AS confirmado,
        CASE WHEN esWeb = 1 THEN 'Web' ELSE 'Presencial' END AS tipoTurno,
        CASE WHEN Me_id IS NULL THEN 'PENDIENTE' ELSE 'ATENDIDO' END AS estado,
        Me_id AS atencionId
      FROM Turnos
      WHERE CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY Hs_Ini
    `;
    const resultHoyDetalle = await executeQuery(queryHoyDetalle);
    diagnostico.secciones.turnosHoy = {
      fecha: new Date().toLocaleDateString('es-AR'),
      cantidad: resultHoyDetalle.recordset.length,
      detalle: resultHoyDetalle.recordset
    };

    // ============================================
    // 10. PRÓXIMOS 7 DÍAS
    // ============================================
    const queryProximos7Dias = `
      SELECT 
        CAST(tur_fecha AS DATE) AS fecha,
        DATENAME(WEEKDAY, tur_fecha) AS diaSemana,
        COUNT(*) AS totalTurnos,
        SUM(CASE WHEN Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes
      FROM Turnos
      WHERE tur_fecha >= CAST(GETDATE() AS DATE)
        AND tur_fecha < DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
      GROUP BY CAST(tur_fecha AS DATE), DATENAME(WEEKDAY, tur_fecha)
      ORDER BY fecha
    `;
    const resultProximos7Dias = await executeQuery(queryProximos7Dias);
    diagnostico.secciones.proximos7Dias = resultProximos7Dias.recordset;

    // ============================================
    // 11. COLUMNAS DE ESTADO ADICIONALES
    // ============================================
    const queryColumnasEstado = `
      SELECT COLUMN_NAME AS columna, DATA_TYPE AS tipo
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Turnos'
        AND (COLUMN_NAME LIKE '%estado%' 
             OR COLUMN_NAME LIKE '%cancel%' 
             OR COLUMN_NAME LIKE '%ausente%'
             OR COLUMN_NAME LIKE '%asist%'
             OR COLUMN_NAME LIKE '%anulado%')
    `;
    const resultColumnasEstado = await executeQuery(queryColumnasEstado);
    diagnostico.secciones.columnasEstadoAdicionales = resultColumnasEstado.recordset;

    // ============================================
    // 12. TURNOS POR PRESTADOR
    // ============================================
    const queryPorPrestador = `
      SELECT TOP 10
        ISNULL(p.pre_nombre, 'Sin Prestador') AS prestador,
        COUNT(*) AS turnosPendientes
      FROM Turnos t
      LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
      WHERE t.Me_id IS NULL
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
        AND YEAR(t.tur_fecha) = YEAR(GETDATE())
        AND MONTH(t.tur_fecha) = MONTH(GETDATE())
      GROUP BY p.pre_nombre
      ORDER BY turnosPendientes DESC
    `;
    const resultPorPrestador = await executeQuery(queryPorPrestador);
    diagnostico.secciones.pendientesPorPrestador = resultPorPrestador.recordset;

    // ============================================
    // 13. TURNOS POR SERVICIO
    // ============================================
    const queryPorServicio = `
      SELECT 
        ISNULL(s.Serv_Nombre, 'Sin Servicio') AS servicio,
        COUNT(*) AS turnosPendientes
      FROM Turnos t
      LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
      WHERE t.Me_id IS NULL
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
        AND YEAR(t.tur_fecha) = YEAR(GETDATE())
        AND MONTH(t.tur_fecha) = MONTH(GETDATE())
      GROUP BY s.Serv_Nombre
      ORDER BY turnosPendientes DESC
    `;
    const resultPorServicio = await executeQuery(queryPorServicio);
    diagnostico.secciones.pendientesPorServicio = resultPorServicio.recordset;

    // ============================================
    // 14. ÚLTIMOS 10 TURNOS REGISTRADOS
    // ============================================
    const queryUltimos = `
      SELECT TOP 10
        turno_id AS id,
        tur_fecha AS fechaTurno,
        tur_fsol AS fechaSolicitud,
        RTRIM(ISNULL(tfic_ape, '')) + ', ' + RTRIM(ISNULL(tfic_nombre, '')) AS paciente,
        CASE WHEN Me_id IS NULL THEN 'PENDIENTE' ELSE 'ATENDIDO' END AS estado,
        Me_id AS atencionId
      FROM Turnos
      ORDER BY turno_id DESC
    `;
    const resultUltimos = await executeQuery(queryUltimos);
    diagnostico.secciones.ultimosTurnosRegistrados = resultUltimos.recordset;

    // ============================================
    // 15. INTEGRIDAD TURNOS ↔ MovEnca
    // ============================================
    const queryIntegridad = `
      SELECT 
        'Con Me_id válido' AS verificacion,
        COUNT(*) AS cantidad
      FROM Turnos t
      WHERE t.Me_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM MovEnca me WHERE me.Me_id = t.Me_id)
      UNION ALL
      SELECT 
        'Con Me_id inválido (huérfanos)' AS verificacion,
        COUNT(*) AS cantidad
      FROM Turnos t
      WHERE t.Me_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM MovEnca me WHERE me.Me_id = t.Me_id)
      UNION ALL
      SELECT 
        'Pendientes (Me_id NULL)' AS verificacion,
        COUNT(*) AS cantidad
      FROM Turnos t
      WHERE t.Me_id IS NULL
    `;
    const resultIntegridad = await executeQuery(queryIntegridad);
    diagnostico.secciones.integridadDatos = resultIntegridad.recordset;

    // ============================================
    // 16. RESUMEN EJECUTIVO
    // ============================================
    const queryResumen = `
      SELECT 'Total Turnos en BD' AS metrica, CAST(COUNT(*) AS VARCHAR) AS valor FROM Turnos
      UNION ALL
      SELECT 'Turnos Año Actual', CAST(COUNT(*) AS VARCHAR) FROM Turnos WHERE YEAR(tur_fecha) = YEAR(GETDATE())
      UNION ALL
      SELECT 'Turnos Mes Actual (Total)', CAST(COUNT(*) AS VARCHAR) FROM Turnos WHERE YEAR(tur_fecha) = YEAR(GETDATE()) AND MONTH(tur_fecha) = MONTH(GETDATE())
      UNION ALL
      SELECT 'Pendientes Mes Actual', CAST(COUNT(*) AS VARCHAR) FROM Turnos WHERE YEAR(tur_fecha) = YEAR(GETDATE()) AND MONTH(tur_fecha) = MONTH(GETDATE()) AND Me_id IS NULL
      UNION ALL
      SELECT 'PENDIENTES DESDE HOY', CAST(COUNT(*) AS VARCHAR) FROM Turnos WHERE Me_id IS NULL AND tur_fecha >= CAST(GETDATE() AS DATE) AND tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)
      UNION ALL
      SELECT 'Turnos de HOY (total)', CAST(COUNT(*) AS VARCHAR) FROM Turnos WHERE CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
      UNION ALL
      SELECT 'Turnos de HOY pendientes', CAST(COUNT(*) AS VARCHAR) FROM Turnos WHERE CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE) AND Me_id IS NULL
      UNION ALL
      SELECT 'Última fecha con turno', CONVERT(VARCHAR, MAX(tur_fecha), 103) FROM Turnos
    `;
    const resultResumen = await executeQuery(queryResumen);
    diagnostico.secciones.resumenEjecutivo = resultResumen.recordset;

    // ============================================
    // 17. OPCIONES DE QUERY PARA TARJETA
    // ============================================
    const queryOpcionA = `
      SELECT COUNT(*) AS valor FROM Turnos t
      WHERE t.Me_id IS NULL
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
        AND t.tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)
    `;
    const queryOpcionB = `
      SELECT COUNT(*) AS valor FROM Turnos t
      WHERE t.Me_id IS NULL
        AND t.confirmado = 1
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
        AND t.tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)
    `;
    const queryOpcionC = `
      SELECT COUNT(*) AS valor FROM Turnos t
      WHERE t.Me_id IS NULL
        AND YEAR(t.tur_fecha) = YEAR(GETDATE())
        AND MONTH(t.tur_fecha) = MONTH(GETDATE())
    `;

    const [resultOpcionA, resultOpcionB, resultOpcionC] = await Promise.all([
      executeQuery(queryOpcionA),
      executeQuery(queryOpcionB),
      executeQuery(queryOpcionC)
    ]);

    diagnostico.secciones.opcionesQueryTarjeta = {
      opcionA: {
        descripcion: 'Pendientes desde HOY hasta fin de mes',
        valor: resultOpcionA.recordset[0]?.valor || 0
      },
      opcionB: {
        descripcion: 'Solo CONFIRMADOS pendientes desde hoy',
        valor: resultOpcionB.recordset[0]?.valor || 0
      },
      opcionC: {
        descripcion: 'TODOS los pendientes del mes (incluye pasados)',
        valor: resultOpcionC.recordset[0]?.valor || 0
      }
    };

    console.log('✅ Diagnóstico de Turnos completado');

    res.json({
      success: true,
      diagnostico,
      fuente: 'SQL Server Local - GECLISA'
    });

  } catch (error) {
    console.error('❌ Error en diagnóstico de Turnos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error ejecutando diagnóstico de Turnos',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// GET /api/diagnostico/turnos/resumen
// Resumen rápido de turnos pendientes
// ============================================

router.get('/turnos/resumen', async (req, res) => {
  try {
    console.log('📊 Obteniendo resumen rápido de turnos...');

    const queryResumen = `
      SELECT 
        (SELECT COUNT(*) FROM Turnos) AS totalTurnosBD,
        (SELECT COUNT(*) FROM Turnos WHERE YEAR(tur_fecha) = YEAR(GETDATE())) AS turnosAnioActual,
        (SELECT COUNT(*) FROM Turnos WHERE YEAR(tur_fecha) = YEAR(GETDATE()) AND MONTH(tur_fecha) = MONTH(GETDATE())) AS turnosMesActual,
        (SELECT COUNT(*) FROM Turnos WHERE CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)) AS turnosHoy,
        (SELECT COUNT(*) FROM Turnos WHERE Me_id IS NULL) AS totalPendientes,
        (SELECT COUNT(*) FROM Turnos WHERE Me_id IS NULL AND tur_fecha >= CAST(GETDATE() AS DATE)) AS pendientesFuturos,
        (SELECT COUNT(*) FROM Turnos WHERE Me_id IS NULL AND CAST(tur_fecha AS DATE) = CAST(GETDATE() AS DATE)) AS pendientesHoy,
        (SELECT COUNT(*) FROM Turnos WHERE Me_id IS NULL AND tur_fecha >= CAST(GETDATE() AS DATE) AND tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)) AS pendientesHastaFinMes,
        (SELECT MAX(tur_fecha) FROM Turnos) AS ultimaFechaTurno
    `;

    const result = await executeQuery(queryResumen);
    const resumen = result.recordset[0];

    console.log('✅ Resumen de turnos obtenido');

    res.json({
      success: true,
      data: {
        totalTurnosBD: resumen.totalTurnosBD,
        turnosAnioActual: resumen.turnosAnioActual,
        turnosMesActual: resumen.turnosMesActual,
        turnosHoy: resumen.turnosHoy,
        pendientes: {
          total: resumen.totalPendientes,
          futuros: resumen.pendientesFuturos,
          hoy: resumen.pendientesHoy,
          hastaFinMes: resumen.pendientesHastaFinMes
        },
        ultimaFechaTurno: resumen.ultimaFechaTurno
      },
      timestamp: new Date().toISOString(),
      fuente: 'SQL Server Local - GECLISA'
    });

  } catch (error) {
    console.error('❌ Error obteniendo resumen de turnos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo resumen de turnos',
      message: error.message
    });
  }
});

// ============================================
// GET /api/diagnostico/turnos/hoy
// Turnos de hoy con detalle
// ============================================

router.get('/turnos/hoy', async (req, res) => {
  try {
    console.log('📅 Obteniendo turnos de hoy...');

    const queryHoy = `
      SELECT 
        t.turno_id AS id,
        t.tur_fecha AS fecha,
        CAST(t.Hs_Ini / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(t.Hs_Ini % 100 AS VARCHAR), 2) AS horaInicio,
        CAST(t.Hs_Fin / 100 AS VARCHAR) + ':' + RIGHT('0' + CAST(t.Hs_Fin % 100 AS VARCHAR), 2) AS horaFin,
        RTRIM(ISNULL(t.tfic_ape, '')) + ', ' + RTRIM(ISNULL(t.tfic_nombre, '')) AS paciente,
        RTRIM(ISNULL(t.nom_nom, 'S/D')) AS practica,
        ISNULL(p.pre_nombre, 'S/D') AS prestador,
        ISNULL(s.Serv_Nombre, 'S/D') AS servicio,
        ISNULL(os.os_nombre, 'PARTICULAR') AS obraSocial,
        t.confirmado,
        t.esWeb,
        CASE WHEN t.Me_id IS NULL THEN 'PENDIENTE' ELSE 'ATENDIDO' END AS estado,
        t.Me_id AS atencionId
      FROM Turnos t
      LEFT JOIN Prestadores p ON t.pre_id = p.pre_id
      LEFT JOIN Servicios s ON t.serv_id = s.Serv_Id
      LEFT JOIN ObrasSociales os ON t.os_id = os.os_id
      WHERE CAST(t.tur_fecha AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY t.Hs_Ini
    `;

    const result = await executeQuery(queryHoy);

    const estadisticas = {
      total: result.recordset.length,
      pendientes: result.recordset.filter(t => t.estado === 'PENDIENTE').length,
      atendidos: result.recordset.filter(t => t.estado === 'ATENDIDO').length,
      confirmados: result.recordset.filter(t => t.confirmado === true).length,
      web: result.recordset.filter(t => t.esWeb === true).length
    };

    console.log(`✅ ${result.recordset.length} turnos de hoy encontrados`);

    res.json({
      success: true,
      data: {
        fecha: new Date().toLocaleDateString('es-AR'),
        estadisticas,
        turnos: result.recordset
      },
      timestamp: new Date().toISOString(),
      fuente: 'SQL Server Local - GECLISA'
    });

  } catch (error) {
    console.error('❌ Error obteniendo turnos de hoy:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo turnos de hoy',
      message: error.message
    });
  }
});

// ============================================
// GET /api/diagnostico/turnos/semana
// Turnos de la semana actual
// ============================================

router.get('/turnos/semana', async (req, res) => {
  try {
    console.log('📆 Obteniendo turnos de la semana...');

    const querySemana = `
      SELECT 
        CAST(tur_fecha AS DATE) AS fecha,
        DATENAME(WEEKDAY, tur_fecha) AS diaSemana,
        COUNT(*) AS totalTurnos,
        SUM(CASE WHEN Me_id IS NULL THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN Me_id IS NOT NULL THEN 1 ELSE 0 END) AS atendidos,
        SUM(CASE WHEN confirmado = 1 THEN 1 ELSE 0 END) AS confirmados
      FROM Turnos
      WHERE tur_fecha >= CAST(GETDATE() AS DATE)
        AND tur_fecha < DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
      GROUP BY CAST(tur_fecha AS DATE), DATENAME(WEEKDAY, tur_fecha)
      ORDER BY fecha
    `;

    const result = await executeQuery(querySemana);

    console.log(`✅ Turnos de ${result.recordset.length} días obtenidos`);

    res.json({
      success: true,
      data: {
        periodo: 'Próximos 7 días',
        dias: result.recordset,
        totales: {
          turnos: result.recordset.reduce((sum, d) => sum + d.totalTurnos, 0),
          pendientes: result.recordset.reduce((sum, d) => sum + d.pendientes, 0),
          atendidos: result.recordset.reduce((sum, d) => sum + d.atendidos, 0)
        }
      },
      timestamp: new Date().toISOString(),
      fuente: 'SQL Server Local - GECLISA'
    });

  } catch (error) {
    console.error('❌ Error obteniendo turnos de la semana:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo turnos de la semana',
      message: error.message
    });
  }
});

// ============================================
// GET /api/diagnostico/conexion
// Verificar conexión a la base de datos
// ============================================

router.get('/conexion', async (req, res) => {
  try {
    console.log('🔌 Verificando conexión a GECLISA...');

    const queryTest = `
      SELECT 
        @@SERVERNAME AS servidor,
        DB_NAME() AS baseDatos,
        @@VERSION AS version,
        GETDATE() AS fechaHoraServidor
    `;

    const result = await executeQuery(queryTest);
    const info = result.recordset[0];

    console.log('✅ Conexión verificada');

    res.json({
      success: true,
      conexion: {
        estado: 'CONECTADO',
        servidor: info.servidor,
        baseDatos: info.baseDatos,
        version: info.version?.split('\n')[0] || 'N/D',
        fechaHoraServidor: info.fechaHoraServidor
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    res.status(500).json({
      success: false,
      conexion: {
        estado: 'ERROR',
        mensaje: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
