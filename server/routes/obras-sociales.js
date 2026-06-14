// ============================================
// RUTAS DE OBRAS SOCIALES
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/obras-sociales
// Obtener lista de obras sociales
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('🏥 Obteniendo obras sociales...');

    const query = `
      SELECT 
        os_id AS id,
        os_sigla AS sigla,
        os_nombre AS nombre
      FROM ObrasSociales
      ORDER BY os_nombre ASC
    `;

    const result = await executeQuery(query);

    const obrasSociales = result.recordset.map(row => ({
      id: row.id,
      sigla: row.sigla?.trim() || '',
      nombre: row.nombre?.trim() || ''
    }));

    console.log(`✅ ${obrasSociales.length} obras sociales encontradas`);

    res.json({
      success: true,
      data: obrasSociales,
      total: obrasSociales.length,
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo obras sociales:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo obras sociales',
      message: error.message
    });
  }
});

// ============================================
// GET /api/obras-sociales/:id
// Obtener una obra social específica
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        os_id AS id,
        os_sigla AS sigla,
        os_nombre AS nombre
      FROM ObrasSociales
      WHERE os_id = @id
    `;

    const result = await executeQuery(query, { id: parseInt(id) });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Obra social no encontrada'
      });
    }

    const os = result.recordset[0];

    res.json({
      success: true,
      data: {
        id: os.id,
        sigla: os.sigla?.trim() || '',
        nombre: os.nombre?.trim() || ''
      },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo obra social:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo obra social',
      message: error.message
    });
  }
});

module.exports = router;
