// ============================================
// RUTAS DE PRESTADORES - GECLISA → SUPABASE
// Sistema de Costos - Instituto Dr. Mercado
// Sincronización de prestadores
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/prestadores-geclisa
// Obtener todos los prestadores de GECLISA
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('👨‍⚕️ Obteniendo prestadores de GECLISA...');

    const query = `
      SELECT 
        pre_id,
        RTRIM(LTRIM(pre_nombre)) AS nombre,
        pre_matp AS matricula_provincial,
        RTRIM(LTRIM(pre_cuit)) AS cuit,
        RTRIM(LTRIM(pre_email)) AS email,
        tp_id AS tipo_prestador
      FROM Prestadores
      WHERE pre_nombre IS NOT NULL 
        AND pre_nombre != ''
      ORDER BY pre_nombre
    `;

    const result = await executeQuery(query);

    const prestadores = result.recordset.map(row => ({
      geclisa_pre_id: row.pre_id,
      nombre: row.nombre?.trim() || '',
      matricula_provincial: row.matricula_provincial,
      cuit: row.cuit?.trim() || null,
      email: row.email?.trim() || null,
      tipo_prestador: row.tipo_prestador
    }));

    console.log(`✅ ${prestadores.length} prestadores encontrados en GECLISA`);

    res.json({
      success: true,
      data: prestadores,
      total: prestadores.length,
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo prestadores de GECLISA:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo prestadores de GECLISA',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestadores-geclisa/activos
// Solo prestadores que han realizado prácticas
// ============================================

router.get('/activos', async (req, res) => {
  try {
    console.log('👨‍⚕️ Obteniendo prestadores activos de GECLISA...');

    const query = `
      SELECT 
        p.pre_id,
        RTRIM(LTRIM(p.pre_nombre)) AS nombre,
        p.pre_matp AS matricula_provincial,
        RTRIM(LTRIM(p.pre_cuit)) AS cuit,
        COUNT(mpr.Mp_id) AS total_practicas
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

    const result = await executeQuery(query);

    const prestadores = result.recordset.map(row => ({
      geclisa_pre_id: row.pre_id,
      nombre: row.nombre?.trim() || '',
      matricula_provincial: row.matricula_provincial,
      cuit: row.cuit?.trim() || null,
      total_practicas: row.total_practicas
    }));

    console.log(`✅ ${prestadores.length} prestadores activos encontrados`);

    res.json({
      success: true,
      data: prestadores,
      total: prestadores.length,
      fuente: 'SQL Server Local - GECLISA (últimos 2 años)',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo prestadores activos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo prestadores activos',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestadores-geclisa/stats
// Estadísticas de prestadores
// ============================================

router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Calculando estadísticas de prestadores...');

    const query = `
      SELECT 
        COUNT(*) AS total_prestadores,
        COUNT(CASE WHEN pre_cuit IS NOT NULL AND pre_cuit != '' THEN 1 END) AS con_cuit,
        COUNT(CASE WHEN pre_matp IS NOT NULL THEN 1 END) AS con_matricula
      FROM Prestadores
      WHERE pre_nombre IS NOT NULL AND pre_nombre != ''
    `;

    const result = await executeQuery(query);
    const stats = result.recordset[0];

    res.json({
      success: true,
      data: {
        total_prestadores: stats.total_prestadores || 0,
        con_cuit: stats.con_cuit || 0,
        con_matricula: stats.con_matricula || 0
      },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error calculando estadísticas:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando estadísticas',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestadores-geclisa/:preId
// Obtener un prestador específico
// ============================================

router.get('/:preId', async (req, res) => {
  try {
    const { preId } = req.params;
    console.log(`👨‍⚕️ Obteniendo prestador ${preId} de GECLISA...`);

    const query = `
      SELECT 
        pre_id,
        RTRIM(LTRIM(pre_nombre)) AS nombre,
        pre_matp AS matricula_provincial,
        pre_matn AS matricula_nacional,
        RTRIM(LTRIM(pre_cuit)) AS cuit,
        RTRIM(LTRIM(pre_email)) AS email,
        RTRIM(LTRIM(pre_tel)) AS telefono,
        RTRIM(LTRIM(pre_cel)) AS celular,
        tp_id AS tipo_prestador
      FROM Prestadores
      WHERE pre_id = @preId
    `;

    const result = await executeQuery(query, { preId: parseInt(preId) });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Prestador no encontrado',
        preId: parseInt(preId)
      });
    }

    const row = result.recordset[0];
    const prestador = {
      geclisa_pre_id: row.pre_id,
      nombre: row.nombre?.trim() || '',
      matricula_provincial: row.matricula_provincial,
      matricula_nacional: row.matricula_nacional,
      cuit: row.cuit?.trim() || null,
      email: row.email?.trim() || null,
      telefono: row.telefono?.trim() || null,
      celular: row.celular?.trim() || null,
      tipo_prestador: row.tipo_prestador
    };

    res.json({
      success: true,
      data: prestador,
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo prestador:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo prestador',
      message: error.message
    });
  }
});

module.exports = router;
