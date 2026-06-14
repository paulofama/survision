// ============================================
// RUTAS DE ELEMENTOS (INSUMOS) - GECLISA
// Sistema de Costos - Instituto Dr. Mercado
// Sincronización con Supabase
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/elementos-geclisa
// Obtener todos los elementos del tipo insumos médicos (Te_id = 125)
// con su precio vigente desde ElementosCostos
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('📦 Obteniendo elementos/insumos de GECLISA...');

    const { tipoElemento = 125 } = req.query;

    // Query para obtener elementos con precio vigente
    // ElementosCostos con Tce_id = 3 y fecha vigente
    const query = `
      SELECT 
        e.Ele_id,
        RTRIM(LTRIM(e.Ele_Cod)) AS codigo,
        RTRIM(LTRIM(e.Ele_nombre)) AS descripcion,
        RTRIM(LTRIM(ISNULL(e.UnidadMedida, 'Unidad'))) AS unidad,
        e.Te_id AS tipo_elemento,
        e.Stock_Actual AS stock_actual,
        e.Stock_Min AS stock_minimo,
        e.Punto_Reposicion AS punto_reposicion,
        ISNULL(ec.Costo, 0) AS precio_unitario,
        ec.Fec_Ini AS precio_fecha_desde,
        ec.Fec_Modi AS precio_ultima_modificacion
      FROM Elementos e
      OUTER APPLY (
        SELECT TOP 1 
          ec2.Costo,
          ec2.Fec_Ini,
          ec2.Fec_Modi
        FROM ElementosCostos ec2
        WHERE ec2.Ele_id = e.Ele_id
          AND ec2.Tce_id = 3
          AND ec2.Fec_Fin = '9999-12-31'
        ORDER BY ec2.Fec_Ini DESC
      ) ec
      WHERE e.Te_id = @tipoElemento
      ORDER BY e.Ele_Cod
    `;

    const result = await executeQuery(query, { tipoElemento: parseInt(tipoElemento) });

    const elementos = result.recordset.map(row => ({
      geclisa_ele_id: row.Ele_id,
      codigo: row.codigo?.trim() || '',
      descripcion: row.descripcion?.trim() || '',
      unidad: row.unidad?.trim() || 'Unidad',
      tipo_elemento: row.tipo_elemento,
      stock_actual: row.stock_actual || 0,
      stock_minimo: row.stock_minimo || 0,
      punto_reposicion: row.punto_reposicion || 0,
      precio_unitario: row.precio_unitario || 0,
      precio_fecha_desde: row.precio_fecha_desde,
      precio_ultima_modificacion: row.precio_ultima_modificacion
    }));

    console.log(`✅ ${elementos.length} elementos encontrados en GECLISA`);

    res.json({
      success: true,
      data: elementos,
      total: elementos.length,
      tipoElemento: parseInt(tipoElemento),
      fuente: 'SQL Server Local - GECLISA (Elementos + ElementosCostos)',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo elementos de GECLISA:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo elementos de GECLISA',
      message: error.message
    });
  }
});

// ============================================
// GET /api/elementos-geclisa/stats
// Estadísticas de elementos
// ============================================

router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Calculando estadísticas de elementos...');

    const { tipoElemento = 125 } = req.query;

    const query = `
      SELECT 
        COUNT(*) AS total_elementos,
        COUNT(CASE WHEN ec.Costo > 0 THEN 1 END) AS con_precio,
        COUNT(CASE WHEN ec.Costo IS NULL OR ec.Costo = 0 THEN 1 END) AS sin_precio,
        SUM(ISNULL(ec.Costo, 0)) AS suma_precios,
        AVG(CASE WHEN ec.Costo > 0 THEN ec.Costo END) AS precio_promedio,
        MAX(ec.Fec_Modi) AS ultima_actualizacion_precio
      FROM Elementos e
      OUTER APPLY (
        SELECT TOP 1 
          ec2.Costo,
          ec2.Fec_Modi
        FROM ElementosCostos ec2
        WHERE ec2.Ele_id = e.Ele_id
          AND ec2.Tce_id = 3
          AND ec2.Fec_Fin = '9999-12-31'
        ORDER BY ec2.Fec_Ini DESC
      ) ec
      WHERE e.Te_id = @tipoElemento
    `;

    const result = await executeQuery(query, { tipoElemento: parseInt(tipoElemento) });
    const stats = result.recordset[0];

    console.log('✅ Estadísticas calculadas');

    res.json({
      success: true,
      data: {
        total_elementos: stats.total_elementos || 0,
        con_precio: stats.con_precio || 0,
        sin_precio: stats.sin_precio || 0,
        suma_precios: stats.suma_precios || 0,
        precio_promedio: stats.precio_promedio || 0,
        ultima_actualizacion_precio: stats.ultima_actualizacion_precio
      },
      tipoElemento: parseInt(tipoElemento),
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
// GET /api/elementos-geclisa/tipos
// Obtener tipos de elementos disponibles
// ============================================

router.get('/tipos', async (req, res) => {
  try {
    console.log('📋 Obteniendo tipos de elementos...');

    const query = `
      SELECT 
        te.Te_id,
        RTRIM(LTRIM(te.Te_Nombre)) AS nombre,
        COUNT(e.Ele_id) AS cantidad_elementos
      FROM TipoEle te
      LEFT JOIN Elementos e ON te.Te_id = e.Te_id
      GROUP BY te.Te_id, te.Te_Nombre
      HAVING COUNT(e.Ele_id) > 0
      ORDER BY te.Te_Nombre
    `;

    const result = await executeQuery(query);

    const tipos = result.recordset.map(row => ({
      id: row.Te_id,
      nombre: row.nombre?.trim() || '',
      cantidad_elementos: row.cantidad_elementos
    }));

    console.log(`✅ ${tipos.length} tipos de elementos encontrados`);

    res.json({
      success: true,
      data: tipos,
      total: tipos.length,
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo tipos de elementos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo tipos de elementos',
      message: error.message
    });
  }
});

// ============================================
// GET /api/elementos-geclisa/:eleId
// Obtener un elemento específico por Ele_id
// ============================================

router.get('/:eleId', async (req, res) => {
  try {
    const { eleId } = req.params;
    console.log(`📦 Obteniendo elemento ${eleId} de GECLISA...`);

    const query = `
      SELECT 
        e.Ele_id,
        RTRIM(LTRIM(e.Ele_Cod)) AS codigo,
        RTRIM(LTRIM(e.Ele_nombre)) AS descripcion,
        RTRIM(LTRIM(ISNULL(e.UnidadMedida, 'Unidad'))) AS unidad,
        e.Te_id AS tipo_elemento,
        e.Stock_Actual AS stock_actual,
        e.Stock_Min AS stock_minimo,
        e.Punto_Reposicion AS punto_reposicion,
        ISNULL(ec.Costo, 0) AS precio_unitario,
        ec.Fec_Ini AS precio_fecha_desde,
        ec.Fec_Modi AS precio_ultima_modificacion
      FROM Elementos e
      OUTER APPLY (
        SELECT TOP 1 
          ec2.Costo,
          ec2.Fec_Ini,
          ec2.Fec_Modi
        FROM ElementosCostos ec2
        WHERE ec2.Ele_id = e.Ele_id
          AND ec2.Tce_id = 3
          AND ec2.Fec_Fin = '9999-12-31'
        ORDER BY ec2.Fec_Ini DESC
      ) ec
      WHERE e.Ele_id = @eleId
    `;

    const result = await executeQuery(query, { eleId: parseInt(eleId) });

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Elemento no encontrado',
        eleId: parseInt(eleId)
      });
    }

    const row = result.recordset[0];
    const elemento = {
      geclisa_ele_id: row.Ele_id,
      codigo: row.codigo?.trim() || '',
      descripcion: row.descripcion?.trim() || '',
      unidad: row.unidad?.trim() || 'Unidad',
      tipo_elemento: row.tipo_elemento,
      stock_actual: row.stock_actual || 0,
      stock_minimo: row.stock_minimo || 0,
      punto_reposicion: row.punto_reposicion || 0,
      precio_unitario: row.precio_unitario || 0,
      precio_fecha_desde: row.precio_fecha_desde,
      precio_ultima_modificacion: row.precio_ultima_modificacion
    };

    console.log(`✅ Elemento ${eleId} encontrado`);

    res.json({
      success: true,
      data: elemento,
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo elemento:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo elemento',
      message: error.message
    });
  }
});

// ============================================
// POST /api/elementos-geclisa/sync-supabase
// Sincronizar elementos de GECLISA a Supabase
// ============================================

router.post('/sync-supabase', async (req, res) => {
  try {
    console.log('🔄 Iniciando sincronización de insumos GECLISA → Supabase...');

    const { tipoElemento = 125 } = req.query;

    // 1. Obtener elementos de GECLISA
    const query = `
      SELECT 
        e.Ele_id,
        RTRIM(LTRIM(e.Ele_Cod)) AS codigo,
        RTRIM(LTRIM(e.Ele_nombre)) AS descripcion,
        RTRIM(LTRIM(ISNULL(e.UnidadMedida, 'Unidad'))) AS unidad,
        e.Te_id AS tipo_elemento,
        ISNULL(ec.Costo, 0) AS precio_unitario
      FROM Elementos e
      OUTER APPLY (
        SELECT TOP 1 ec2.Costo
        FROM ElementosCostos ec2
        WHERE ec2.Ele_id = e.Ele_id
          AND ec2.Tce_id = 3
          AND ec2.Fec_Fin = '9999-12-31'
        ORDER BY ec2.Fec_Ini DESC
      ) ec
      WHERE e.Te_id = @tipoElemento
        AND e.Ele_nombre IS NOT NULL
        AND e.Ele_nombre != ''
      ORDER BY e.Ele_Cod
    `;

    const result = await executeQuery(query, { tipoElemento: parseInt(tipoElemento) });
    const elementosGeclisa = result.recordset;

    console.log(`📦 ${elementosGeclisa.length} elementos obtenidos de GECLISA`);

    // 2. Mapeo de segmentos por código
    const determinarSegmento = (codigo) => {
      if (!codigo) return 'Otros';
      const prefix = codigo.substring(0, 2);
      
      switch (prefix) {
        case '01': // 010xxx - Descartables y equipamiento
          if (codigo.startsWith('0104')) return 'Insumos Quirófano'; // Cassets
          if (codigo.startsWith('0105')) return 'Insumos Quirófano'; // Catridges
          if (codigo.startsWith('0107')) return 'Insumos Quirófano'; // Cuchilletes
          if (codigo.startsWith('0111')) return 'Suturas';
          return 'Descartables';
        case '02': // 020xxx - Implantes y lentes
          if (codigo.startsWith('0203')) return 'Lentes Intraoculares';
          return 'Implantes';
        case '03': // 030xxx - Indumentaria
          return 'Descartables';
        case '04': // 040xxx - Medicamentos y colirios
          if (codigo.startsWith('0408')) return 'Colirios';
          if (codigo.startsWith('0409')) return 'Medicamentos'; // Avastin, Eylia
          if (codigo.startsWith('0413')) return 'Viscoelásticos';
          return 'Medicamentos';
        case '05': // 050xxx - Instrumental
          if (codigo.startsWith('0502') || codigo.startsWith('0501')) return 'Instrumental Retina';
          if (codigo.startsWith('0503')) return 'Insumos Quirófano';
          if (codigo.startsWith('0504') || codigo.startsWith('0505')) return 'Descartables';
          return 'Instrumental';
        default:
          return 'Otros';
      }
    };

    // 3. Preparar datos para Supabase
    const insumosParaSupabase = elementosGeclisa.map(e => ({
      geclisa_ele_id: e.Ele_id,
      codigo: (e.codigo?.trim() || '').substring(0, 50), // Limitar a 50 chars
      descripcion: e.descripcion?.trim() || '',
      unidad: e.unidad?.trim() || 'Unidad',
      precio_unitario: e.precio_unitario || 0,
      segmento: determinarSegmento(e.codigo),
      consumo: 'Por Práctica',
      cantidad: 1,
      activo: true
    }));

    // 4. Enviar a Supabase (upsert)
    const { createClient } = require('@supabase/supabase-js');
    
    const supabaseUrl = process.env.SUPABASE_URL || 'https://ecraryyvngnyxusdggvj.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseKey) {
      throw new Error('SUPABASE_ANON_KEY no configurada en el servidor');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insertar todos directamente (tabla está vacía)
    let insertados = 0;
    let errores = [];

    // Procesar en lotes de 50
    const batchSize = 50;
    for (let i = 0; i < insumosParaSupabase.length; i += batchSize) {
      const batch = insumosParaSupabase.slice(i, i + batchSize);
      
      console.log(`📦 Insertando batch ${i/batchSize + 1}: ${batch.length} insumos`);
      
      const { data, error } = await supabase
        .from('insumos_variables')
        .insert(batch)
        .select();

      if (error) {
        console.error(`❌ Error en batch: ${error.message}`);
        errores.push(`Batch ${i/batchSize + 1}: ${error.message}`);
      } else {
        insertados += batch.length;
        console.log(`✅ Batch insertado: ${batch.length} insumos`);
      }
    }

    console.log(`✅ Sincronización completada: ${insertados} insertados`);

    res.json({
      success: true,
      resultado: {
        total_geclisa: elementosGeclisa.length,
        insertados,
        errores: errores.length > 0 ? errores : null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error en sincronización',
      message: error.message
    });
  }
});

module.exports = router;
