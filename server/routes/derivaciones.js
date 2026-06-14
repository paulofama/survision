// ============================================
// RUTAS DE LIQUIDACIÓN DE DERIVACIONES
// Sistema de Costos - Instituto Dr. Mercado
// v2.0.0 - Lógica corregida según Power BI DAX
// ============================================
// DAX Original:
//   %Liq Derivador = SWITCH(SELECTEDVALUE('MovEnca'[EntDer_Id]), 1,0.05, 2,0.05, 3,0.05, 4,0.05, 5,0.10, BLANK())
//   Devengado Derivador = CALCULATE(SUM(MovEnca[Me_Cose]) * [%Liq Derivador])
//
// Granularidad: 1 fila = 1 MovEnca (atención)
// Coseguro: MovEnca.Me_Cose (nivel atención, NO práctica)
// Porcentaje: desde Supabase derivadores_config (configurable)
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/derivaciones/derivadores
// Obtener lista de derivadores desde GECLISA
// ============================================

router.get('/derivadores', async (req, res) => {
  try {
    console.log('👨‍⚕️ Obteniendo derivadores...');

    const query = `
      SELECT DISTINCT 
        ed.EntDer_id AS id, 
        RTRIM(ed.EntDer_nombre) AS nombre
      FROM EntidadesDerivantes ed
      INNER JOIN MovEnca me ON me.EntDer_id = ed.EntDer_id
      WHERE ed.EntDer_nombre IS NOT NULL 
        AND RTRIM(ed.EntDer_nombre) != ''
      ORDER BY RTRIM(ed.EntDer_nombre)
    `;

    const result = await executeQuery(query);

    const derivadores = result.recordset.map(r => ({
      id: r.id,
      nombre: r.nombre || ''
    }));

    console.log(`✅ ${derivadores.length} derivadores encontrados`);

    res.json({
      success: true,
      data: derivadores,
      total: derivadores.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo derivadores:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo derivadores',
      message: error.message
    });
  }
});

// ============================================
// GET /api/derivaciones/liquidacion
// Detalle de liquidación - 1 fila por ATENCIÓN (MovEnca)
// Replica exacta de la tabla Power BI "Derivaciones"
// ============================================

router.get('/liquidacion', async (req, res) => {
  try {
    const { anio, mes, derivador_id, dia } = req.query;

    if (!anio) {
      return res.status(400).json({
        success: false,
        error: 'El año es requerido'
      });
    }

    const anioNum = parseInt(anio);
    const mesNum = mes ? parseInt(mes) : null;
    const diaNum = dia ? parseInt(dia) : null;
    const derivadorId = derivador_id ? parseInt(derivador_id) : null;

    console.log(`📊 Liquidación derivaciones: ${anioNum}/${mesNum || 'todos'}${derivadorId ? ` - Derivador: ${derivadorId}` : ''}`);

    // =============================================
    // QUERY PRINCIPAL - Granularidad: 1 fila = 1 MovEnca
    // Replica la tabla del Power BI:
    //   ID | Fecha | Apellido y Nombre | Prestador | Derivador | Prestacion | Coseguro | % | Devengado
    // =============================================
    let query = `
      SELECT 
        me.Me_id AS atencion_id,
        me.Me_Fecha AS fecha,
        RTRIM(ISNULL(me.Me_Ape, '')) + ', ' + RTRIM(ISNULL(me.Me_Nombre, '')) AS apellido_nombre,
        me.EntDer_id AS derivador_id,
        RTRIM(ed.EntDer_nombre) AS derivador,
        ISNULL(me.Me_Cose, 0) AS coseguro,
        -- Prestador principal (TOP 1 por mayor importe en MovPre)
        ISNULL(prestador_info.pre_nombre, 'S/D') AS prestador,
        -- Prestación principal (TOP 1 práctica de la atención)
        ISNULL(practica_info.nom_nom, 'Sin Prestación') AS prestacion,
        ISNULL(practica_info.nom_cod, '') AS prestacion_codigo
      FROM MovEnca me
      INNER JOIN EntidadesDerivantes ed ON me.EntDer_id = ed.EntDer_id
      -- Prestador principal: el de mayor importe en la atención
      OUTER APPLY (
        SELECT TOP 1 pre.pre_nombre
        FROM MovPre mpr
        INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
        INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
        WHERE mp.Me_id = me.Me_id
        ORDER BY mpr.MPre_Tot DESC
      ) prestador_info
      -- Prestación principal: primera práctica de la atención
      OUTER APPLY (
        SELECT TOP 1 
          RTRIM(n.nom_nom) AS nom_nom,
          RTRIM(mp2.nom_cod) AS nom_cod
        FROM MovPrac mp2
        INNER JOIN Nomenclador n ON mp2.nom_id = n.nom_id AND mp2.nom_cod = n.nom_cod
        WHERE mp2.Me_id = me.Me_id
        ORDER BY mp2.Mp_id ASC
      ) practica_info
      WHERE YEAR(me.Me_Fecha) = @anio
        AND me.Me_Cose > 0
        AND ed.EntDer_id > 0
    `;

    // Filtros opcionales
    if (mesNum) {
      query += ` AND MONTH(me.Me_Fecha) = @mes`;
    }
    if (diaNum) {
      query += ` AND DAY(me.Me_Fecha) = @dia`;
    }
    if (derivadorId) {
      query += ` AND ed.EntDer_id = @derivador_id`;
    }

    query += ` ORDER BY me.Me_Fecha DESC, me.Me_id DESC`;

    // Preparar parámetros
    const params = { anio: anioNum };
    if (mesNum) params.mes = mesNum;
    if (diaNum) params.dia = diaNum;
    if (derivadorId) params.derivador_id = derivadorId;

    const result = await executeQuery(query, params);

    // Mapear resultados (sin calcular devengado - lo hace el frontend con % de Supabase)
    const registros = result.recordset.map(r => ({
      atencion_id: r.atencion_id,
      fecha: r.fecha,
      apellido_nombre: r.apellido_nombre?.trim() || '',
      prestador: r.prestador?.trim() || 'S/D',
      derivador_id: r.derivador_id,
      derivador: r.derivador?.trim() || 'S/D',
      prestacion: r.prestacion?.trim() || 'Sin Prestación',
      prestacion_codigo: r.prestacion_codigo?.trim() || '',
      coseguro: parseFloat(r.coseguro) || 0
    }));

    console.log(`✅ ${registros.length} atenciones con derivación encontradas`);

    res.json({
      success: true,
      data: registros,
      total: registros.length,
      filtros: { anio: anioNum, mes: mesNum, dia: diaNum, derivador_id: derivadorId },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en liquidación derivaciones:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo liquidación de derivaciones',
      message: error.message
    });
  }
});

// ============================================
// GET /api/derivaciones/resumen
// Resumen agrupado por derivador para un período
// Equivale a: SUM(Me_Cose) GROUP BY EntDer_id
// ============================================

router.get('/resumen', async (req, res) => {
  try {
    const { anio, mes } = req.query;

    if (!anio) {
      return res.status(400).json({
        success: false,
        error: 'El año es requerido'
      });
    }

    const anioNum = parseInt(anio);
    const mesNum = mes ? parseInt(mes) : null;

    console.log(`📊 Resumen derivaciones: ${anioNum}/${mesNum || 'todos'}`);

    let query = `
      SELECT 
        ed.EntDer_id AS derivador_id,
        RTRIM(ed.EntDer_nombre) AS derivador,
        COUNT(me.Me_id) AS cant_atenciones,
        SUM(ISNULL(me.Me_Cose, 0)) AS total_coseguro,
        MIN(me.Me_Fecha) AS primera_atencion,
        MAX(me.Me_Fecha) AS ultima_atencion
      FROM MovEnca me
      INNER JOIN EntidadesDerivantes ed ON me.EntDer_id = ed.EntDer_id
      WHERE YEAR(me.Me_Fecha) = @anio
        AND me.Me_Cose > 0
        AND ed.EntDer_id > 0
    `;

    if (mesNum) {
      query += ` AND MONTH(me.Me_Fecha) = @mes`;
    }

    query += `
      GROUP BY ed.EntDer_id, ed.EntDer_nombre
      ORDER BY SUM(ISNULL(me.Me_Cose, 0)) DESC
    `;

    const params = { anio: anioNum };
    if (mesNum) params.mes = mesNum;

    const result = await executeQuery(query, params);

    const resumen = result.recordset.map(r => ({
      derivador_id: r.derivador_id,
      derivador: r.derivador?.trim() || 'S/D',
      cant_atenciones: r.cant_atenciones,
      total_coseguro: parseFloat(r.total_coseguro) || 0,
      primera_atencion: r.primera_atencion,
      ultima_atencion: r.ultima_atencion
    }));

    console.log(`✅ Resumen: ${resumen.length} derivadores`);

    res.json({
      success: true,
      data: resumen,
      total: resumen.length,
      filtros: { anio: anioNum, mes: mesNum },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en resumen derivaciones:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo resumen de derivaciones',
      message: error.message
    });
  }
});

// ============================================
// GET /api/derivaciones/anios-disponibles
// Años con datos de derivaciones
// ============================================

router.get('/anios-disponibles', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT YEAR(me.Me_Fecha) AS anio
      FROM MovEnca me
      INNER JOIN EntidadesDerivantes ed ON me.EntDer_id = ed.EntDer_id
      WHERE me.Me_Cose > 0
        AND ed.EntDer_id > 0
      ORDER BY anio DESC
    `;

    const result = await executeQuery(query);
    const anios = result.recordset.map(r => r.anio);

    res.json({
      success: true,
      data: anios,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo años:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo años disponibles',
      message: error.message
    });
  }
});

module.exports = router;
