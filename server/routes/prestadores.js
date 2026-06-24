// ============================================
// RUTAS DE PRESTADORES - GECLISA → SUPABASE
// Sistema de Costos - Instituto Dr. Mercado
// Sincronización de prestadores
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// GET /api/prestadores-geclisa
// Obtener todos los prestadores de GECLISA
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('👨‍⚕️ Obteniendo prestadores de GECLISA...');

    // Whitelist de cirujanos habilitados (pre_id de GECLISA)
    // Para agregar uno nuevo: sumar su pre_id a esta lista
    const CIRUJANOS_HABILITADOS = [0, 1, 2, 3, 4, 14, 16, 17];
    const ids = CIRUJANOS_HABILITADOS.join(',');

    const query = `
      SELECT 
        pre_id,
        RTRIM(LTRIM(pre_nombre)) AS nombre,
        pre_matp AS matricula_provincial,
        RTRIM(LTRIM(pre_cuit)) AS cuit,
        RTRIM(LTRIM(pre_email)) AS email,
        tp_id AS tipo_prestador
      FROM Prestadores
      WHERE pre_id IN (${ids})
        AND pre_nombre IS NOT NULL 
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
      SELECT DISTINCT
        p.pre_id,
        RTRIM(LTRIM(p.pre_nombre)) AS nombre,
        p.pre_matp AS matricula_provincial,
        RTRIM(LTRIM(p.pre_cuit)) AS cuit,
        COUNT(DISTINCT mpr.Mp_id) AS total_practicas
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


// ============================================
// POST /api/prestadores-geclisa/sync
// Sincroniza prestadores GECLISA → Supabase
// Solo actualiza pre_id + pre_nombre
// ============================================

router.post('/sync', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Supabase no configurado' });

    console.log('🔄 Iniciando sync prestadores GECLISA → Supabase...');

    const query = `
      SELECT pre_id, RTRIM(LTRIM(pre_nombre)) AS pre_nombre
      FROM Prestadores
      WHERE pre_nombre IS NOT NULL AND pre_nombre != ''
      ORDER BY pre_nombre
    `;
    const result = await executeQuery(query);
    const rows = result.recordset;
    console.log(`📋 ${rows.length} prestadores obtenidos de GECLISA`);

    if (rows.length === 0) return res.json({ success: true, insertados: 0, actualizados: 0 });

    const upsertRows = rows.map(r => ({
      pre_id: r.pre_id,
      pre_nombre: r.pre_nombre?.trim() || ''
    }));

    const LOTE = 100;
    let insertados = 0;
    let actualizados = 0;

    const { data: existentes } = await supabase.from('prestadores').select('pre_id');
    const idsExistentes = new Set((existentes || []).map(r => r.pre_id));

    for (let i = 0; i < upsertRows.length; i += LOTE) {
      const lote = upsertRows.slice(i, i + LOTE);
      const { error } = await supabase
        .from('prestadores')
        .upsert(lote, { onConflict: 'pre_id' });

      if (error) {
        console.error(`❌ Error lote ${i}:`, error.message);
      } else {
        lote.forEach(r => {
          if (idsExistentes.has(r.pre_id)) actualizados++;
          else insertados++;
        });
        console.log(`  ✅ Lote ${Math.floor(i / LOTE) + 1}: ${lote.length} registros`);
      }
    }

    console.log(`✅ Sync prestadores: ${insertados} nuevos, ${actualizados} actualizados`);
    res.json({ success: true, total_geclisa: rows.length, insertados, actualizados, timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Error sync prestadores:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
