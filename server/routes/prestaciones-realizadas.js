// ============================================
// RUTAS DE PRESTACIONES REALIZADAS
// Sistema de Costos - Instituto Dr. Mercado
// Dashboard similar a Power BI
// VERSIÓN 3.0 - ESTADÍSTICAS EN SERVIDOR
// ============================================
// CAMBIO v3.0: Nuevos endpoints de estadísticas que calculan
// totales en el servidor usando MovEnca (Me_Cose + Me_ValorPrac)
// en lugar de calcular en el frontend sobre datos paginados.
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/prestaciones-realizadas
// Obtener listado de prestaciones realizadas con filtros
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('📋 Obteniendo prestaciones realizadas (v3.0)...');

    const {
      fechaDesde,
      fechaHasta,
      anio,
      mes,
      dia,
      obraSocialId,
      prestadorId,
      derivadorId,
      paciente,
      prestacion,
      grupoPracticas,
      agenteFacturadorId,
      limit = 500,
      offset = 0
    } = req.query;

    let query = `
      SELECT 
        mp.Mp_id AS id,
        me.Me_id AS atencion_id,
        me.Me_Fecha AS fecha,
        me.Me_Hs AS hora,
        RTRIM(ISNULL(me.Me_Ape, '')) + ', ' + RTRIM(ISNULL(me.Me_Nombre, '')) AS apellido_nombre,
        ISNULL(pre_prac.pre_nombre, 'S/D') AS prestador,
        pre_prac.pre_id AS prestador_id,
        ISNULL(ed.EntDer_nombre, 'S/D') AS derivador,
        ISNULL(os.os_nombre, 'PARTICULAR') AS os_nombre,
        ISNULL(os.os_sigla, 'PART') AS os_sigla,
        os.os_id AS os_id,
        ISNULL(af.AgeFact_nombre, ISNULL(os.os_nombre, 'PARTICULAR')) AS agente_facturador,
        CASE WHEN ISNULL(os.esParticular, 1) = 1 THEN 1 ELSE 0 END AS particular,
        CASE 
          WHEN CHARINDEX('(', n.nom_nom) > 0 
          THEN RTRIM(LEFT(n.nom_nom, CHARINDEX('(', n.nom_nom) - 1))
          ELSE RTRIM(ISNULL(n.nom_nom, 'Sin Prestación'))
        END AS prestacion,
        mp.nom_cod AS codigo_prestacion,
        mp.nom_id AS grupo_id,
        ISNULL(me.Me_Cose, 0) AS coseguro,
        ISNULL(me.Me_ValorPrac, 0) AS cobertura,
        ISNULL(me.Me_ValorPrac, 0) + ISNULL(me.Me_Cose, 0) AS total,
        ISNULL(me.Usu_Alta, 'S/D') AS atendio,
        ISNULL(me.Me_PacTot, 0) AS total_paciente,
        me.Me_Diagnostico AS diagnostico,
        me.Me_estado AS estado,
        me.Nro_Afiliado AS nro_afiliado,
        me.Cod_Auto AS cod_autorizacion,
        YEAR(me.Me_Fecha) AS anio,
        MONTH(me.Me_Fecha) AS mes_numero,
        DATENAME(MONTH, me.Me_Fecha) AS mes_nombre

      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN Planes pl ON me.Plan_id = pl.plan_id
      LEFT JOIN AgentesFacturacion af ON os.AgeFact_id = af.AgeFact_id
      LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      LEFT JOIN EntidadesDerivantes ed ON me.EntDer_id = ed.EntDer_id

      OUTER APPLY (
          SELECT TOP 1 p.pre_nombre, p.pre_id
          FROM MovPre mpr
          INNER JOIN Prestadores p ON mpr.Pre_id = p.pre_id
          WHERE mpr.Mp_id = mp.Mp_id
          ORDER BY mpr.MPre_id
      ) pre_prac

      WHERE me.Me_Area = 'A'
    `;

    const params = {};

    if (fechaDesde) {
      query += ` AND me.Me_Fecha >= @fechaDesde`;
      params.fechaDesde = fechaDesde;
    }

    if (fechaHasta) {
      query += ` AND me.Me_Fecha <= @fechaHasta`;
      params.fechaHasta = fechaHasta;
    }

    if (anio) {
      query += ` AND YEAR(me.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      query += ` AND MONTH(me.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (dia) {
      query += ` AND DAY(me.Me_Fecha) = @dia`;
      params.dia = parseInt(dia);
    }

    if (obraSocialId) {
      query += ` AND me.Os_id = @obraSocialId`;
      params.obraSocialId = parseInt(obraSocialId);
    }

    if (prestadorId) {
      query += ` AND pre_prac.pre_id = @prestadorId`;
      params.prestadorId = parseInt(prestadorId);
    }

    if (derivadorId) {
      query += ` AND me.EntDer_id = @derivadorId`;
      params.derivadorId = parseInt(derivadorId);
    }

    if (paciente) {
      query += ` AND (me.Me_Ape LIKE @paciente OR me.Me_Nombre LIKE @paciente)`;
      params.paciente = `%${paciente}%`;
    }

    if (prestacion) {
      query += ` AND n.nom_nom LIKE @prestacion`;
      params.prestacion = `%${prestacion}%`;
    }

    if (grupoPracticas) {
      query += ` AND mp.nom_id = @grupoPracticas`;
      params.grupoPracticas = parseInt(grupoPracticas);
    }

    if (agenteFacturadorId) {
      query += ` AND os.AgeFact_id = @agenteFacturadorId`;
      params.agenteFacturadorId = parseInt(agenteFacturadorId);
    }

    query += ` ORDER BY me.Me_Fecha DESC, me.Me_Hs DESC, mp.Mp_id DESC`;
    query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    
    params.limit = parseInt(limit);
    params.offset = parseInt(offset);

    const result = await executeQuery(query, params);

    const prestaciones = result.recordset.map(row => ({
      id: row.id,
      atencion_id: row.atencion_id,
      fecha: row.fecha,
      hora: row.hora ? `${String(Math.floor(row.hora / 100)).padStart(2, '0')}:${String(row.hora % 100).padStart(2, '0')}` : '',
      apellido_nombre: row.apellido_nombre?.trim() || '',
      prestador: row.prestador?.trim() || 'S/D',
      prestador_id: row.prestador_id,
      derivador: row.derivador?.trim() || 'S/D',
      os_nombre: row.os_nombre?.trim() || 'PARTICULAR',
      os_sigla: row.os_sigla?.trim() || 'PART',
      os_id: row.os_id,
      agente_facturador: row.agente_facturador?.trim() || '',
      particular: row.particular === 1,
      prestacion: row.prestacion?.trim() || '',
      codigo_prestacion: row.codigo_prestacion?.trim() || '',
      grupo_id: row.grupo_id,
      coseguro: parseFloat(row.coseguro) || 0,
      cobertura: parseFloat(row.cobertura) || 0,
      total: parseFloat(row.total) || 0,
      atendio: row.atendio?.trim() || '',
      total_paciente: parseFloat(row.total_paciente) || 0,
      diagnostico: row.diagnostico?.trim() || '',
      estado: row.estado?.trim() || '',
      nro_afiliado: row.nro_afiliado?.trim() || '',
      cod_autorizacion: row.cod_autorizacion?.trim() || '',
      anio: row.anio,
      mes_numero: row.mes_numero,
      mes_nombre: row.mes_nombre
    }));

    console.log(`✅ ${prestaciones.length} prestaciones encontradas (v3.0)`);

    res.json({
      success: true,
      data: prestaciones,
      total: prestaciones.length,
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo prestaciones realizadas:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo prestaciones realizadas',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/stats
// Estadísticas generales (KPIs del dashboard)
// ============================================

router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Calculando estadísticas de prestaciones (v3.0)...');

    // Prácticas del día de hoy
    const queryHoy = `
      SELECT COUNT(mp.Mp_id) AS practicas_hoy
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE CAST(me.Me_Fecha AS DATE) = CAST(GETDATE() AS DATE)
        AND me.Me_Area = 'A'
    `;

    // Prácticas mes actual
    const queryMesActual = `
      SELECT COUNT(mp.Mp_id) AS practicas_mes_actual
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE YEAR(me.Me_Fecha) = YEAR(GETDATE())
        AND MONTH(me.Me_Fecha) = MONTH(GETDATE())
        AND me.Me_Area = 'A'
    `;

    // Prácticas mes anterior
    const queryMesAnterior = `
      SELECT COUNT(mp.Mp_id) AS practicas_mes_anterior
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE YEAR(me.Me_Fecha) = YEAR(DATEADD(MONTH, -1, GETDATE()))
        AND MONTH(me.Me_Fecha) = MONTH(DATEADD(MONTH, -1, GETDATE()))
        AND me.Me_Area = 'A'
    `;

    // Turnos pendientes
    const queryTurnosPendientes = `
      SELECT COUNT(*) AS turnos_pendientes
      FROM Turnos t
      WHERE (t.Me_id = 0 OR t.Me_id IS NULL)
        AND t.tur_fecha >= CAST(GETDATE() AS DATE)
        AND t.tur_fecha < DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) + 1, 0)
    `;

    const [resultHoy, resultMesActual, resultMesAnterior, resultTurnos] = await Promise.all([
      executeQuery(queryHoy),
      executeQuery(queryMesActual),
      executeQuery(queryMesAnterior),
      executeQuery(queryTurnosPendientes).catch(() => ({ recordset: [{ turnos_pendientes: 0 }] }))
    ]);

    const stats = {
      practicas_hoy: resultHoy.recordset[0]?.practicas_hoy || 0,
      practicas_mes_actual: resultMesActual.recordset[0]?.practicas_mes_actual || 0,
      practicas_mes_anterior: resultMesAnterior.recordset[0]?.practicas_mes_anterior || 0,
      turnos_pendientes: resultTurnos.recordset[0]?.turnos_pendientes || 0
    };

    console.log(`✅ Estadísticas calculadas (v3.0)`);

    res.json({
      success: true,
      data: stats,
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
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
// GET /api/prestaciones-realizadas/stats-totales
// Totales generales para un período (calculados en servidor)
// ============================================

router.get('/stats-totales', async (req, res) => {
  try {
    console.log('📊 Calculando totales del período (v3.0)...');

    const { anio, mes, obraSocialId, prestadorId, grupoPracticas } = req.query;

    let whereClause = `WHERE me.Me_Area = 'A'`;
    const params = {};

    if (anio) {
      whereClause += ` AND YEAR(me.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      whereClause += ` AND MONTH(me.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (obraSocialId) {
      whereClause += ` AND me.Os_id = @obraSocialId`;
      params.obraSocialId = parseInt(obraSocialId);
    }

    if (prestadorId) {
      whereClause += ` AND pre_prac.pre_id = @prestadorId`;
      params.prestadorId = parseInt(prestadorId);
    }

    if (grupoPracticas) {
      whereClause += ` AND mp.nom_id = @grupoPracticas`;
      params.grupoPracticas = parseInt(grupoPracticas);
    }

    const query = `
      SELECT 
        COUNT(DISTINCT mp.Mp_id) AS total_practicas,
        COUNT(DISTINCT me.Me_id) AS total_atenciones,
        ISNULL(SUM(me.Me_Cose), 0) AS total_coseguro,
        ISNULL(SUM(me.Me_ValorPrac), 0) AS total_cobertura,
        ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0) AS total_ingresos
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      OUTER APPLY (
          SELECT TOP 1 p.pre_id
          FROM MovPre mpr
          INNER JOIN Prestadores p ON mpr.Pre_id = p.pre_id
          WHERE mpr.Mp_id = mp.Mp_id
          ORDER BY mpr.MPre_id
      ) pre_prac
      ${whereClause}
    `;

    const result = await executeQuery(query, params);
    const totales = result.recordset[0];

    console.log(`✅ Totales calculados: ${totales.total_practicas} prácticas, $${totales.total_ingresos}`);

    res.json({
      success: true,
      data: {
        total_practicas: totales.total_practicas || 0,
        total_atenciones: totales.total_atenciones || 0,
        total_coseguro: parseFloat(totales.total_coseguro) || 0,
        total_cobertura: parseFloat(totales.total_cobertura) || 0,
        total_ingresos: parseFloat(totales.total_ingresos) || 0
      },
      filtros: { anio, mes, obraSocialId, prestadorId, grupoPracticas },
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error calculando totales:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando totales',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/stats-por-prestacion
// Estadísticas agrupadas por tipo de prestación
// ============================================

router.get('/stats-por-prestacion', async (req, res) => {
  try {
    console.log('📊 Calculando stats por prestación (v3.0)...');

    const { anio, mes, obraSocialId, prestadorId } = req.query;

    let whereClause = `WHERE me.Me_Area = 'A'`;
    const params = {};

    if (anio) {
      whereClause += ` AND YEAR(me.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      whereClause += ` AND MONTH(me.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (obraSocialId) {
      whereClause += ` AND me.Os_id = @obraSocialId`;
      params.obraSocialId = parseInt(obraSocialId);
    }

    if (prestadorId) {
      whereClause += ` AND pre_prac.pre_id = @prestadorId`;
      params.prestadorId = parseInt(prestadorId);
    }

    const query = `
      SELECT 
        mp.nom_cod AS codigo,
        CASE 
          WHEN CHARINDEX('(', n.nom_nom) > 0 
          THEN RTRIM(LEFT(n.nom_nom, CHARINDEX('(', n.nom_nom) - 1))
          ELSE RTRIM(ISNULL(n.nom_nom, 'Sin Prestación'))
        END AS prestacion,
        mp.nom_id AS grupo_id,
        COUNT(*) AS cantidad,
        ISNULL(SUM(me.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(me.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0) AS total_ingresos,
        (ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0)) / NULLIF(COUNT(*), 0) AS promedio
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      OUTER APPLY (
          SELECT TOP 1 p.pre_id
          FROM MovPre mpr
          INNER JOIN Prestadores p ON mpr.Pre_id = p.pre_id
          WHERE mpr.Mp_id = mp.Mp_id
          ORDER BY mpr.MPre_id
      ) pre_prac
      ${whereClause}
      GROUP BY mp.nom_cod, n.nom_nom, mp.nom_id
      ORDER BY total_ingresos DESC
    `;

    const result = await executeQuery(query, params);

    // Calcular totales para porcentajes
    const totalGeneral = result.recordset.reduce((sum, row) => sum + (parseFloat(row.total_ingresos) || 0), 0);
    const totalPracticas = result.recordset.reduce((sum, row) => sum + (row.cantidad || 0), 0);

    const datos = result.recordset.map(row => ({
      codigo: row.codigo?.trim() || '',
      prestacion: row.prestacion?.trim() || 'Sin Prestación',
      grupo_id: row.grupo_id,
      cantidad: row.cantidad || 0,
      coseguro: parseFloat(row.coseguro) || 0,
      cobertura: parseFloat(row.cobertura) || 0,
      total_ingresos: parseFloat(row.total_ingresos) || 0,
      promedio: parseFloat(row.promedio) || 0,
      porcentaje: totalGeneral > 0 ? ((parseFloat(row.total_ingresos) || 0) / totalGeneral * 100).toFixed(1) : '0'
    }));

    console.log(`✅ ${datos.length} prestaciones analizadas`);

    res.json({
      success: true,
      data: datos,
      totales: {
        prestaciones_unicas: datos.length,
        total_practicas: totalPracticas,
        total_ingresos: totalGeneral
      },
      filtros: { anio, mes, obraSocialId, prestadorId },
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en stats por prestación:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando stats por prestación',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/stats-por-obra-social
// Estadísticas agrupadas por obra social
// ============================================

router.get('/stats-por-obra-social', async (req, res) => {
  try {
    console.log('📊 Calculando stats por obra social (v3.0)...');

    const { anio, mes, prestadorId, grupoPracticas } = req.query;

    let whereClause = `WHERE me.Me_Area = 'A'`;
    const params = {};

    if (anio) {
      whereClause += ` AND YEAR(me.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      whereClause += ` AND MONTH(me.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (prestadorId) {
      whereClause += ` AND pre_prac.pre_id = @prestadorId`;
      params.prestadorId = parseInt(prestadorId);
    }

    if (grupoPracticas) {
      whereClause += ` AND mp.nom_id = @grupoPracticas`;
      params.grupoPracticas = parseInt(grupoPracticas);
    }

    const query = `
      SELECT 
        os.os_id,
        ISNULL(os.os_sigla, 'PART') AS sigla,
        ISNULL(os.os_nombre, 'PARTICULAR') AS nombre,
        COUNT(*) AS cantidad,
        ISNULL(SUM(me.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(me.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0) AS total_ingresos,
        (ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0)) / NULLIF(COUNT(*), 0) AS promedio
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
      OUTER APPLY (
          SELECT TOP 1 p.pre_id
          FROM MovPre mpr
          INNER JOIN Prestadores p ON mpr.Pre_id = p.pre_id
          WHERE mpr.Mp_id = mp.Mp_id
          ORDER BY mpr.MPre_id
      ) pre_prac
      ${whereClause}
      GROUP BY os.os_id, os.os_sigla, os.os_nombre
      ORDER BY total_ingresos DESC
    `;

    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (parseFloat(row.total_ingresos) || 0), 0);
    const totalPracticas = result.recordset.reduce((sum, row) => sum + (row.cantidad || 0), 0);

    const datos = result.recordset.map(row => ({
      os_id: row.os_id,
      sigla: row.sigla?.trim() || 'PART',
      nombre: row.nombre?.trim() || 'PARTICULAR',
      cantidad: row.cantidad || 0,
      coseguro: parseFloat(row.coseguro) || 0,
      cobertura: parseFloat(row.cobertura) || 0,
      total_ingresos: parseFloat(row.total_ingresos) || 0,
      promedio: parseFloat(row.promedio) || 0,
      porcentaje: totalGeneral > 0 ? ((parseFloat(row.total_ingresos) || 0) / totalGeneral * 100).toFixed(1) : '0'
    }));

    console.log(`✅ ${datos.length} obras sociales analizadas`);

    res.json({
      success: true,
      data: datos,
      totales: {
        obras_sociales: datos.length,
        total_practicas: totalPracticas,
        total_ingresos: totalGeneral
      },
      filtros: { anio, mes, prestadorId, grupoPracticas },
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en stats por obra social:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando stats por obra social',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/stats-por-prestador
// Estadísticas agrupadas por prestador/médico
// ============================================

router.get('/stats-por-prestador', async (req, res) => {
  try {
    console.log('📊 Calculando stats por prestador (v3.0)...');

    const { anio, mes, obraSocialId, grupoPracticas } = req.query;

    let whereClause = `WHERE me.Me_Area = 'A'`;
    const params = {};

    if (anio) {
      whereClause += ` AND YEAR(me.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      whereClause += ` AND MONTH(me.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (obraSocialId) {
      whereClause += ` AND me.Os_id = @obraSocialId`;
      params.obraSocialId = parseInt(obraSocialId);
    }

    if (grupoPracticas) {
      whereClause += ` AND mp.nom_id = @grupoPracticas`;
      params.grupoPracticas = parseInt(grupoPracticas);
    }

    const query = `
      SELECT 
        pre_prac.pre_id,
        ISNULL(pre_prac.pre_nombre, 'Sin Asignar') AS prestador,
        COUNT(*) AS cantidad,
        ISNULL(SUM(me.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(me.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0) AS total_ingresos,
        (ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0)) / NULLIF(COUNT(*), 0) AS promedio
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      OUTER APPLY (
          SELECT TOP 1 p.pre_id, p.pre_nombre
          FROM MovPre mpr
          INNER JOIN Prestadores p ON mpr.Pre_id = p.pre_id
          WHERE mpr.Mp_id = mp.Mp_id
          ORDER BY mpr.MPre_id
      ) pre_prac
      ${whereClause}
      GROUP BY pre_prac.pre_id, pre_prac.pre_nombre
      ORDER BY total_ingresos DESC
    `;

    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (parseFloat(row.total_ingresos) || 0), 0);
    const totalPracticas = result.recordset.reduce((sum, row) => sum + (row.cantidad || 0), 0);

    const datos = result.recordset.map(row => ({
      prestador_id: row.pre_id,
      prestador: row.prestador?.trim() || 'Sin Asignar',
      cantidad: row.cantidad || 0,
      coseguro: parseFloat(row.coseguro) || 0,
      cobertura: parseFloat(row.cobertura) || 0,
      total_ingresos: parseFloat(row.total_ingresos) || 0,
      promedio: parseFloat(row.promedio) || 0,
      porcentaje: totalGeneral > 0 ? ((parseFloat(row.total_ingresos) || 0) / totalGeneral * 100).toFixed(1) : '0'
    }));

    console.log(`✅ ${datos.length} prestadores analizados`);

    res.json({
      success: true,
      data: datos,
      totales: {
        prestadores: datos.length,
        total_practicas: totalPracticas,
        total_ingresos: totalGeneral
      },
      filtros: { anio, mes, obraSocialId, grupoPracticas },
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en stats por prestador:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando stats por prestador',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/stats-por-grupo
// Estadísticas agrupadas por grupo de prácticas
// ============================================

router.get('/stats-por-grupo', async (req, res) => {
  try {
    console.log('📊 Calculando stats por grupo (v3.0)...');

    const { anio, mes, obraSocialId, prestadorId } = req.query;

    let whereClause = `WHERE me.Me_Area = 'A'`;
    const params = {};

    if (anio) {
      whereClause += ` AND YEAR(me.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      whereClause += ` AND MONTH(me.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (obraSocialId) {
      whereClause += ` AND me.Os_id = @obraSocialId`;
      params.obraSocialId = parseInt(obraSocialId);
    }

    if (prestadorId) {
      whereClause += ` AND pre_prac.pre_id = @prestadorId`;
      params.prestadorId = parseInt(prestadorId);
    }

    const query = `
      SELECT 
        mp.nom_id AS grupo_id,
        CASE mp.nom_id 
          WHEN 1 THEN 'Consultas'
          WHEN 2 THEN 'Estudios Diagnósticos'
          WHEN 10 THEN 'Cirugías'
          WHEN 3 THEN 'Tratamientos'
          WHEN 4 THEN 'Procedimientos'
          ELSE 'Grupo ' + CAST(mp.nom_id AS VARCHAR)
        END AS grupo_nombre,
        COUNT(*) AS cantidad,
        COUNT(DISTINCT mp.nom_cod) AS tipos_unicos,
        ISNULL(SUM(me.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(me.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0) AS total_ingresos,
        (ISNULL(SUM(me.Me_Cose), 0) + ISNULL(SUM(me.Me_ValorPrac), 0)) / NULLIF(COUNT(*), 0) AS promedio
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      OUTER APPLY (
          SELECT TOP 1 p.pre_id
          FROM MovPre mpr
          INNER JOIN Prestadores p ON mpr.Pre_id = p.pre_id
          WHERE mpr.Mp_id = mp.Mp_id
          ORDER BY mpr.MPre_id
      ) pre_prac
      ${whereClause}
      GROUP BY mp.nom_id
      ORDER BY total_ingresos DESC
    `;

    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (parseFloat(row.total_ingresos) || 0), 0);
    const totalPracticas = result.recordset.reduce((sum, row) => sum + (row.cantidad || 0), 0);

    const datos = result.recordset.map(row => ({
      grupo_id: row.grupo_id,
      grupo_nombre: row.grupo_nombre,
      cantidad: row.cantidad || 0,
      tipos_unicos: row.tipos_unicos || 0,
      coseguro: parseFloat(row.coseguro) || 0,
      cobertura: parseFloat(row.cobertura) || 0,
      total_ingresos: parseFloat(row.total_ingresos) || 0,
      promedio: parseFloat(row.promedio) || 0,
      porcentaje: totalGeneral > 0 ? ((parseFloat(row.total_ingresos) || 0) / totalGeneral * 100).toFixed(1) : '0'
    }));

    console.log(`✅ ${datos.length} grupos analizados`);

    res.json({
      success: true,
      data: datos,
      totales: {
        grupos: datos.length,
        total_practicas: totalPracticas,
        total_ingresos: totalGeneral
      },
      filtros: { anio, mes, obraSocialId, prestadorId },
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en stats por grupo:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando stats por grupo',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/filtros
// Obtener valores para los filtros (dropdowns)
// ============================================

router.get('/filtros', async (req, res) => {
  try {
    console.log('🔽 Obteniendo opciones de filtros (v3.0)...');

    // Años disponibles
    const queryAnios = `
      SELECT DISTINCT YEAR(Me_Fecha) AS anio
      FROM MovEnca
      WHERE Me_Fecha IS NOT NULL
      ORDER BY anio DESC
    `;

    // Meses (estático)
    const meses = [
      { value: 1, label: 'Enero' },
      { value: 2, label: 'Febrero' },
      { value: 3, label: 'Marzo' },
      { value: 4, label: 'Abril' },
      { value: 5, label: 'Mayo' },
      { value: 6, label: 'Junio' },
      { value: 7, label: 'Julio' },
      { value: 8, label: 'Agosto' },
      { value: 9, label: 'Septiembre' },
      { value: 10, label: 'Octubre' },
      { value: 11, label: 'Noviembre' },
      { value: 12, label: 'Diciembre' }
    ];

    // Días (estático)
    const dias = Array.from({ length: 31 }, (_, i) => ({
      value: i + 1,
      label: String(i + 1).padStart(2, '0')
    }));

    // Obras sociales
    const queryOS = `
      SELECT os_id AS id, os_sigla AS sigla, os_nombre AS nombre
      FROM ObrasSociales
      WHERE estado = 1 OR estado IS NULL
      ORDER BY os_nombre
    `;

    // Prestadores (solo los que tienen prácticas)
    const queryPrestadores = `
      SELECT DISTINCT p.pre_id AS id, p.pre_nombre AS nombre
      FROM Prestadores p
      INNER JOIN MovPre mpr ON p.pre_id = mpr.Pre_id
      WHERE p.pre_nombre IS NOT NULL AND p.pre_nombre != ''
      ORDER BY p.pre_nombre
    `;

    // Agentes facturadores
    const queryAgentes = `
      SELECT AgeFact_id AS id, AgeFact_nombre AS nombre
      FROM AgentesFacturacion
      ORDER BY AgeFact_nombre
    `;

    // Grupos de prácticas
    const queryGrupos = `
      SELECT DISTINCT nom_id AS id, 
        CASE nom_id 
          WHEN 10 THEN 'Cirugías'
          WHEN 1 THEN 'Consultas'
          WHEN 2 THEN 'Estudios'
          ELSE 'Grupo ' + CAST(nom_id AS VARCHAR)
        END AS nombre
      FROM Nomenclador
      ORDER BY nom_id
    `;

    const [resultAnios, resultOS, resultPrestadores, resultAgentes, resultGrupos] = await Promise.all([
      executeQuery(queryAnios),
      executeQuery(queryOS),
      executeQuery(queryPrestadores),
      executeQuery(queryAgentes).catch(() => ({ recordset: [] })),
      executeQuery(queryGrupos)
    ]);

    const filtros = {
      anios: resultAnios.recordset.map(r => r.anio),
      meses: meses,
      dias: dias,
      obrasSociales: resultOS.recordset.map(r => ({
        id: r.id,
        sigla: r.sigla?.trim() || '',
        nombre: r.nombre?.trim() || ''
      })),
      prestadores: resultPrestadores.recordset.map(r => ({
        id: r.id,
        nombre: r.nombre?.trim() || ''
      })),
      agentesFacturadores: resultAgentes.recordset.map(r => ({
        id: r.id,
        nombre: r.nombre?.trim() || ''
      })),
      gruposPracticas: resultGrupos.recordset.map(r => ({
        id: r.id,
        nombre: r.nombre
      }))
    };

    console.log('✅ Filtros obtenidos (v3.0)');

    res.json({
      success: true,
      data: filtros,
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo filtros:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo filtros',
      message: error.message
    });
  }
});

// ============================================
// GET /api/prestaciones-realizadas/derivadores
// Obtener lista de derivadores
// ============================================

router.get('/derivadores', async (req, res) => {
  try {
    console.log('👨‍⚕️ Obteniendo derivadores (v3.0)...');

    const query = `
      SELECT DISTINCT 
        ed.EntDer_id AS id, 
        ed.EntDer_nombre AS nombre
      FROM EntidadesDerivantes ed
      INNER JOIN MovEnca me ON me.EntDer_id = ed.EntDer_id
      WHERE ed.EntDer_nombre IS NOT NULL AND ed.EntDer_nombre != ''
      ORDER BY ed.EntDer_nombre
    `;

    const result = await executeQuery(query);

    const derivadores = result.recordset.map(r => ({
      id: r.id,
      nombre: r.nombre?.trim() || ''
    }));

    console.log(`✅ ${derivadores.length} derivadores encontrados`);

    res.json({
      success: true,
      data: derivadores,
      total: derivadores.length,
      fuente: 'SQL Server Local - GECLISA',
      version: '3.0',
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

module.exports = router;
