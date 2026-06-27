// ============================================
// RUTAS DE TURNOS - ANÁLISIS
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');
const { extraerAnalisisTurnos } = require('../services/turnosExtractor');

// ============================================
// GET /api/turnos/analisis
// Dashboard analítico completo de turnos
// El cómputo vive en turnosExtractor.js (misma fuente que usa el daemon de
// sync para el snapshot de Supabase). Así no hay drift entre LAN y remoto.
// ============================================

router.get('/analisis', async (req, res) => {
  try {
    console.log('📊 Cargando análisis de turnos...');
    const data = await extraerAnalisisTurnos();
    console.log('✅ Análisis de turnos completado');
    res.json(data);
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
