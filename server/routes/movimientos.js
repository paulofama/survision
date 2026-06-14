// ============================================
// RUTAS DE MOVIMIENTOS (ATENCIONES)
// Sistema de Costos - Instituto Dr. Mercado
// Tabla: MovEnca + MovPrac + ObrasSociales
// ============================================
// VERSIÓN 3.5 - Prorrateo de ingresos por prestador
// ============================================
// FIX CRÍTICO: Los ingresos "Por Prestador" ahora coinciden
// exactamente con los otros reportes ($91.580.274)
// 
// Problema: Atención compartida (cirujano + ayudante) contaba
// 100% del monto para cada profesional, inflando el total.
//
// Solución: Dividir el monto entre la cantidad de prestadores
// que participaron en cada atención.
// ============================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ============================================
// GET /api/movimientos
// Obtener lista de atenciones con JOINs
// ============================================

router.get('/', async (req, res) => {
  try {
    console.log('📋 Obteniendo movimientos...');

    const { 
      fechaDesde, 
      fechaHasta, 
      osId, 
      prestador,
      anio,
      mes,
      grupoPracticas,
      limit = 500,
      offset = 0 
    } = req.query;

    let query = `
      SELECT 
        mp.Mp_id AS id,
        m.Me_id AS atencion_id,
        m.Me_Fecha AS fecha,
        m.Me_Hs AS hora,
        RTRIM(ISNULL(m.Me_Ape, '')) + ', ' + RTRIM(ISNULL(m.Me_Nombre, '')) AS paciente,
        ISNULL(m.Me_Cose, 0) AS coseguro,
        ISNULL(m.Me_ValorPrac, 0) AS cobertura,
        ISNULL(m.Me_Cose, 0) + ISNULL(m.Me_ValorPrac, 0) AS total,
        m.Me_Edad AS edad,
        m.Me_Diagnostico AS diagnostico,
        m.Me_estado AS estado,
        m.Usu_Alta AS usuario_alta,
        os.os_id AS os_id,
        os.os_nombre AS obra_social_nombre,
        os.os_sigla AS obra_social_sigla,
        mp.nom_cod AS practica_codigo,
        mp.Serv_id AS grupo_id,
        CASE 
          WHEN CHARINDEX('(', n.nom_nom) > 0 
          THEN RTRIM(LEFT(n.nom_nom, CHARINDEX('(', n.nom_nom) - 1))
          ELSE RTRIM(ISNULL(n.nom_nom, 'Sin Prestación'))
        END AS practica_nombre,
        pre.pre_id AS prestador_id,
        pre.pre_nombre AS prestador_nombre,
        YEAR(m.Me_Fecha) AS anio,
        MONTH(m.Me_Fecha) AS mes_numero
      FROM MovEnca m
      LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id
      OUTER APPLY (
        SELECT TOP 1 mp2.Mp_id, mp2.nom_id, mp2.nom_cod, mp2.Serv_id
        FROM MovPrac mp2 
        WHERE mp2.Me_id = m.Me_id
        ORDER BY mp2.Mp_id ASC
      ) mp
      LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      OUTER APPLY (
        SELECT TOP 1 mpr.Pre_id
        FROM MovPre mpr 
        WHERE mpr.Mp_id = mp.Mp_id
        ORDER BY mpr.MPre_id ASC
      ) mpr
      LEFT JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
      WHERE m.Me_Area = 'A'
    `;

    const params = {};

    if (fechaDesde) {
      query += ` AND m.Me_Fecha >= @fechaDesde`;
      params.fechaDesde = fechaDesde;
    }

    if (fechaHasta) {
      query += ` AND m.Me_Fecha <= @fechaHasta`;
      params.fechaHasta = fechaHasta;
    }

    if (anio) {
      query += ` AND YEAR(m.Me_Fecha) = @anio`;
      params.anio = parseInt(anio);
    }

    if (mes) {
      query += ` AND MONTH(m.Me_Fecha) = @mes`;
      params.mes = parseInt(mes);
    }

    if (osId) {
      query += ` AND m.Os_id = @osId`;
      params.osId = parseInt(osId);
    }

    if (prestador) {
      query += ` AND pre.pre_id = @prestadorId`;
      params.prestadorId = parseInt(prestador);
    }

    if (grupoPracticas) {
      query += ` AND mp.Serv_id = @grupoPracticas`;
      params.grupoPracticas = parseInt(grupoPracticas);
    }

    query += ` ORDER BY m.Me_Fecha DESC, m.Me_id DESC`;
    query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    
    params.limit = parseInt(limit);
    params.offset = parseInt(offset);

    const result = await executeQuery(query, params);

    const movimientos = result.recordset.map(row => ({
      id: row.id,
      atencion_id: row.atencion_id,
      fecha: row.fecha,
      hora: row.hora,
      paciente: row.paciente?.trim().replace(/^,\s*/, '').replace(/,\s*$/, '') || 'Sin nombre',
      coseguro: row.coseguro || 0,
      cobertura: row.cobertura || 0,
      total: row.total || 0,
      edad: row.edad,
      diagnostico: row.diagnostico?.trim() || '',
      estado: row.estado,
      usuario_alta: row.usuario_alta?.trim() || '',
      os_id: row.os_id,
      os_nombre: row.obra_social_nombre?.trim() || 'Sin OS',
      os_sigla: row.obra_social_sigla?.trim() || '',
      codigo_prestacion: row.practica_codigo?.trim() || '',
      prestacion: row.practica_nombre?.trim() || 'Sin práctica',
      grupo_id: row.grupo_id,
      prestador_id: row.prestador_id || null,
      prestador: row.prestador_nombre?.trim() || 'Sin prestador',
      anio: row.anio,
      mes_numero: row.mes_numero
    }));

    console.log(`✅ ${movimientos.length} movimientos encontrados`);

    res.json({
      success: true,
      data: movimientos,
      total: movimientos.length,
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo movimientos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo movimientos',
      message: error.message
    });
  }
});

// ============================================
// GET /api/movimientos/comparativa-inteligente
// Comparaciones justas por período
// ============================================

router.get('/comparativa-inteligente', async (req, res) => {
  try {
    console.log('🧠 Calculando comparativa inteligente...');

    const hoy = new Date();
    const diaActual = hoy.getDate();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    const diasEnMes = new Date(anioActual, mesActual, 0).getDate();
    
    const queryMesActual = `
      SELECT 
        COUNT(*) as practicas,
        ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
        ISNULL(SUM(Me_Cose), 0) as coseguro,
        ISNULL(SUM(Me_ValorPrac), 0) as cobertura
      FROM MovEnca
      WHERE Me_Area = 'A'
        AND YEAR(Me_Fecha) = @anio
        AND MONTH(Me_Fecha) = @mes
        AND DAY(Me_Fecha) <= @dia
    `;
    
    const resultMesActual = await executeQuery(queryMesActual, {
      anio: anioActual, mes: mesActual, dia: diaActual
    });
    const mesActualData = resultMesActual.recordset[0];
    
    const mesAnterior = mesActual === 1 ? 12 : mesActual - 1;
    const anioMesAnterior = mesActual === 1 ? anioActual - 1 : anioActual;
    
    const queryMesAnteriorPeriodo = `
      SELECT 
        COUNT(*) as practicas,
        ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
        ISNULL(SUM(Me_Cose), 0) as coseguro,
        ISNULL(SUM(Me_ValorPrac), 0) as cobertura
      FROM MovEnca
      WHERE Me_Area = 'A'
        AND YEAR(Me_Fecha) = @anio
        AND MONTH(Me_Fecha) = @mes
        AND DAY(Me_Fecha) <= @dia
    `;
    
    const resultMesAnteriorPeriodo = await executeQuery(queryMesAnteriorPeriodo, {
      anio: anioMesAnterior, mes: mesAnterior, dia: diaActual
    });
    const mesAnteriorPeriodoData = resultMesAnteriorPeriodo.recordset[0];
    
    const queryMesAnteriorCompleto = `
      SELECT 
        COUNT(*) as practicas,
        ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
        ISNULL(SUM(Me_Cose), 0) as coseguro,
        ISNULL(SUM(Me_ValorPrac), 0) as cobertura
      FROM MovEnca
      WHERE Me_Area = 'A'
        AND YEAR(Me_Fecha) = @anio
        AND MONTH(Me_Fecha) = @mes
    `;
    
    const resultMesAnteriorCompleto = await executeQuery(queryMesAnteriorCompleto, {
      anio: anioMesAnterior, mes: mesAnterior
    });
    const mesAnteriorCompletoData = resultMesAnteriorCompleto.recordset[0];
    
    const meses3Anteriores = [];
    for (let i = 1; i <= 3; i++) {
      let m = mesActual - i;
      let a = anioActual;
      if (m <= 0) { m += 12; a -= 1; }
      meses3Anteriores.push({ mes: m, anio: a });
    }
    
    const queryPromedio3M = `
      SELECT 
        COUNT(*) as practicas,
        ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
        ISNULL(SUM(Me_Cose), 0) as coseguro,
        ISNULL(SUM(Me_ValorPrac), 0) as cobertura
      FROM MovEnca
      WHERE Me_Area = 'A'
        AND (
          (YEAR(Me_Fecha) = @anio1 AND MONTH(Me_Fecha) = @mes1 AND DAY(Me_Fecha) <= @dia)
          OR (YEAR(Me_Fecha) = @anio2 AND MONTH(Me_Fecha) = @mes2 AND DAY(Me_Fecha) <= @dia)
          OR (YEAR(Me_Fecha) = @anio3 AND MONTH(Me_Fecha) = @mes3 AND DAY(Me_Fecha) <= @dia)
        )
    `;
    
    const resultPromedio3M = await executeQuery(queryPromedio3M, {
      anio1: meses3Anteriores[0].anio, mes1: meses3Anteriores[0].mes,
      anio2: meses3Anteriores[1].anio, mes2: meses3Anteriores[1].mes,
      anio3: meses3Anteriores[2].anio, mes3: meses3Anteriores[2].mes,
      dia: diaActual
    });
    const promedio3MData = resultPromedio3M.recordset[0];
    
    const promedio3M = {
      practicas: Math.round(promedio3MData.practicas / 3),
      ingresos: promedio3MData.ingresos / 3,
      coseguro: promedio3MData.coseguro / 3,
      cobertura: promedio3MData.cobertura / 3
    };
    
    const queryAnioAnterior = `
      SELECT 
        COUNT(*) as practicas,
        ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
        ISNULL(SUM(Me_Cose), 0) as coseguro,
        ISNULL(SUM(Me_ValorPrac), 0) as cobertura
      FROM MovEnca
      WHERE Me_Area = 'A'
        AND YEAR(Me_Fecha) = @anio
        AND MONTH(Me_Fecha) = @mes
        AND DAY(Me_Fecha) <= @dia
    `;
    
    const resultAnioAnterior = await executeQuery(queryAnioAnterior, {
      anio: anioActual - 1, mes: mesActual, dia: diaActual
    });
    const anioAnteriorData = resultAnioAnterior.recordset[0];
    
    const factorProyeccion = diasEnMes / diaActual;
    const proyeccionCierre = {
      practicas: Math.round(mesActualData.practicas * factorProyeccion),
      ingresos: mesActualData.ingresos * factorProyeccion,
      coseguro: mesActualData.coseguro * factorProyeccion,
      cobertura: mesActualData.cobertura * factorProyeccion
    };
    
    const calcVariacion = (actual, anterior) => {
      if (anterior === 0) return actual > 0 ? 100 : 0;
      return ((actual - anterior) / anterior) * 100;
    };
    
    const variaciones = {
      vsMesAnteriorPracticas: calcVariacion(mesActualData.practicas, mesAnteriorPeriodoData.practicas),
      vsMesAnteriorIngresos: calcVariacion(mesActualData.ingresos, mesAnteriorPeriodoData.ingresos),
      proyeccionVsMesAnterior: calcVariacion(proyeccionCierre.practicas, mesAnteriorCompletoData.practicas),
      proyeccionIngresosVsMesAnterior: calcVariacion(proyeccionCierre.ingresos, mesAnteriorCompletoData.ingresos),
      vsPromedio3MPracticas: calcVariacion(mesActualData.practicas, promedio3M.practicas),
      vsPromedio3MIngresos: calcVariacion(mesActualData.ingresos, promedio3M.ingresos),
      vsAnioAnteriorPracticas: calcVariacion(mesActualData.practicas, anioAnteriorData.practicas),
      vsAnioAnteriorIngresos: calcVariacion(mesActualData.ingresos, anioAnteriorData.ingresos)
    };
    
    const nombreMes = new Date(anioActual, mesActual - 1, 1).toLocaleDateString('es-AR', { month: 'long' });
    const nombreMesAnterior = new Date(anioMesAnterior, mesAnterior - 1, 1).toLocaleDateString('es-AR', { month: 'long' });

    const calcularSalud = () => {
      const score = (
        (variaciones.vsMesAnteriorPracticas > 5 ? 2 : variaciones.vsMesAnteriorPracticas > 0 ? 1 : variaciones.vsMesAnteriorPracticas > -5 ? 0 : -1) +
        (variaciones.proyeccionVsMesAnterior > 5 ? 2 : variaciones.proyeccionVsMesAnterior > 0 ? 1 : variaciones.proyeccionVsMesAnterior > -5 ? 0 : -1) +
        (variaciones.vsPromedio3MPracticas > 5 ? 2 : variaciones.vsPromedio3MPracticas > 0 ? 1 : variaciones.vsPromedio3MPracticas > -5 ? 0 : -1)
      );
      if (score >= 4) return 'excelente';
      if (score >= 2) return 'bueno';
      if (score >= 0) return 'estable';
      return 'atención';
    };

    console.log(`✅ Comparativa inteligente calculada - Día ${diaActual}/${diasEnMes}`);
    
    res.json({
      success: true,
      generadoEn: new Date().toISOString(),
      periodo: {
        diaActual, diasEnMes,
        diasRestantes: diasEnMes - diaActual,
        porcentajeMesTranscurrido: ((diaActual / diasEnMes) * 100).toFixed(1),
        mesActual: { numero: mesActual, nombre: nombreMes, anio: anioActual },
        mesAnterior: { numero: mesAnterior, nombre: nombreMesAnterior, anio: anioMesAnterior }
      },
      actual: {
        practicas: mesActualData.practicas,
        ingresos: parseFloat(mesActualData.ingresos),
        coseguro: parseFloat(mesActualData.coseguro),
        cobertura: parseFloat(mesActualData.cobertura),
        promedioDiario: {
          practicas: Math.round(mesActualData.practicas / diaActual),
          ingresos: mesActualData.ingresos / diaActual
        }
      },
      mesAnteriorMismoPeriodo: {
        practicas: mesAnteriorPeriodoData.practicas,
        ingresos: parseFloat(mesAnteriorPeriodoData.ingresos),
        coseguro: parseFloat(mesAnteriorPeriodoData.coseguro),
        cobertura: parseFloat(mesAnteriorPeriodoData.cobertura),
        variacionPracticas: parseFloat(variaciones.vsMesAnteriorPracticas.toFixed(1)),
        variacionIngresos: parseFloat(variaciones.vsMesAnteriorIngresos.toFixed(1)),
        diferenciaPracticas: mesActualData.practicas - mesAnteriorPeriodoData.practicas,
        diferenciaIngresos: parseFloat(mesActualData.ingresos) - parseFloat(mesAnteriorPeriodoData.ingresos)
      },
      mesAnteriorCompleto: {
        practicas: mesAnteriorCompletoData.practicas,
        ingresos: parseFloat(mesAnteriorCompletoData.ingresos),
        coseguro: parseFloat(mesAnteriorCompletoData.coseguro),
        cobertura: parseFloat(mesAnteriorCompletoData.cobertura)
      },
      proyeccion: {
        practicas: proyeccionCierre.practicas,
        ingresos: parseFloat(proyeccionCierre.ingresos.toFixed(2)),
        coseguro: parseFloat(proyeccionCierre.coseguro.toFixed(2)),
        cobertura: parseFloat(proyeccionCierre.cobertura.toFixed(2)),
        variacionVsMesAnterior: parseFloat(variaciones.proyeccionVsMesAnterior.toFixed(1)),
        variacionIngresosVsMesAnterior: parseFloat(variaciones.proyeccionIngresosVsMesAnterior.toFixed(1)),
        diferenciaPracticas: proyeccionCierre.practicas - mesAnteriorCompletoData.practicas,
        diferenciaIngresos: parseFloat((proyeccionCierre.ingresos - parseFloat(mesAnteriorCompletoData.ingresos)).toFixed(2))
      },
      promedioTrimestral: {
        practicas: promedio3M.practicas,
        ingresos: parseFloat(promedio3M.ingresos.toFixed(2)),
        coseguro: parseFloat(promedio3M.coseguro.toFixed(2)),
        cobertura: parseFloat(promedio3M.cobertura.toFixed(2)),
        variacionPracticas: parseFloat(variaciones.vsPromedio3MPracticas.toFixed(1)),
        variacionIngresos: parseFloat(variaciones.vsPromedio3MIngresos.toFixed(1)),
        mesesIncluidos: meses3Anteriores.map(m => ({
          mes: m.mes, anio: m.anio,
          nombre: new Date(m.anio, m.mes - 1, 1).toLocaleDateString('es-AR', { month: 'short' })
        }))
      },
      interanual: {
        practicas: anioAnteriorData.practicas,
        ingresos: parseFloat(anioAnteriorData.ingresos),
        coseguro: parseFloat(anioAnteriorData.coseguro),
        cobertura: parseFloat(anioAnteriorData.cobertura),
        variacionPracticas: parseFloat(variaciones.vsAnioAnteriorPracticas.toFixed(1)),
        variacionIngresos: parseFloat(variaciones.vsAnioAnteriorIngresos.toFixed(1)),
        diferenciaPracticas: mesActualData.practicas - anioAnteriorData.practicas,
        diferenciaIngresos: parseFloat(mesActualData.ingresos) - parseFloat(anioAnteriorData.ingresos)
      },
      resumen: {
        tendenciaMensual: variaciones.vsMesAnteriorPracticas > 0 ? 'up' : variaciones.vsMesAnteriorPracticas < 0 ? 'down' : 'stable',
        tendenciaProyeccion: variaciones.proyeccionVsMesAnterior > 0 ? 'up' : variaciones.proyeccionVsMesAnterior < 0 ? 'down' : 'stable',
        tendenciaTrimestral: variaciones.vsPromedio3MPracticas > 0 ? 'up' : variaciones.vsPromedio3MPracticas < 0 ? 'down' : 'stable',
        tendenciaInteranual: variaciones.vsAnioAnteriorPracticas > 0 ? 'up' : variaciones.vsAnioAnteriorPracticas < 0 ? 'down' : 'stable',
        saludGeneral: calcularSalud()
      },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error en comparativa-inteligente:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error calculando comparativa inteligente',
      message: error.message
    });
  }
});

// ============================================
// GET /api/movimientos/stats-periodo
// Estadísticas TOTALES del período con filtros
// ★★★ v3.5 - PRORRATEO de ingresos por prestador ★★★
// ============================================

router.get('/stats-periodo', async (req, res) => {
  try {
    console.log('📊 Calculando stats-periodo v3.5 (con prorrateo)...');

    const { fechaDesde, fechaHasta, anio, mes, obraSocialId, prestadorId, grupoPracticas } = req.query;

    let whereClause = `WHERE m.Me_Area = 'A'`;
    const params = {};

    if (fechaDesde) { whereClause += ` AND m.Me_Fecha >= @fechaDesde`; params.fechaDesde = fechaDesde; }
    if (fechaHasta) { whereClause += ` AND m.Me_Fecha <= @fechaHasta`; params.fechaHasta = fechaHasta; }
    if (anio) { whereClause += ` AND YEAR(m.Me_Fecha) = @anio`; params.anio = parseInt(anio); }
    if (mes) { whereClause += ` AND MONTH(m.Me_Fecha) = @mes`; params.mes = parseInt(mes); }
    if (obraSocialId) { whereClause += ` AND m.Os_id = @obraSocialId`; params.obraSocialId = parseInt(obraSocialId); }
    if (prestadorId) {
      whereClause += ` AND EXISTS (SELECT 1 FROM MovPrac mp2 INNER JOIN MovPre mpr ON mp2.Mp_id = mpr.Mp_id WHERE mp2.Me_id = m.Me_id AND mpr.Pre_id = @prestadorId)`;
      params.prestadorId = parseInt(prestadorId);
    }
    if (grupoPracticas) {
      whereClause += ` AND EXISTS (SELECT 1 FROM MovPrac mp3 WHERE mp3.Me_id = m.Me_id AND mp3.Serv_id = @grupoPracticas)`;
      params.grupoPracticas = parseInt(grupoPracticas);
    }

    // Query de totales generales (desde MovEnca directo - SIN duplicación)
    const queryTotales = `
      SELECT 
        COUNT(m.Me_id) AS total_atenciones,
        COUNT(m.Me_id) AS total_practicas,
        ISNULL(SUM(m.Me_Cose), 0) AS total_coseguro,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS total_cobertura,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS total_ingresos
      FROM MovEnca m
      ${whereClause}
    `;

    // Query por obra social (desde MovEnca, sin duplicación)
    const queryPorOS = `
      SELECT 
        os.os_id,
        ISNULL(os.os_sigla, 'S/D') AS sigla,
        ISNULL(os.os_nombre, 'Sin OS') AS nombre,
        COUNT(m.Me_id) AS cantidad,
        ISNULL(SUM(m.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS total_ingresos
      FROM MovEnca m
      LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id
      ${whereClause}
      GROUP BY os.os_id, os.os_sigla, os.os_nombre
      ORDER BY total_ingresos DESC
    `;

    // ★★★ v3.5: Query por prestador CON PRORRATEO ★★★
    const queryPorPrestador = `
      ;WITH PrestadoresPorAtencion AS (
        SELECT DISTINCT m.Me_id, m.Me_Cose, m.Me_ValorPrac, mpr.Pre_id
        FROM MovEnca m
        INNER JOIN MovPrac mp ON m.Me_id = mp.Me_id
        INNER JOIN MovPre mpr ON mp.Mp_id = mpr.Mp_id
        ${whereClause}
      ),
      ConteoPrestadores AS (
        SELECT Me_id, Me_Cose, Me_ValorPrac, Pre_id,
               COUNT(*) OVER (PARTITION BY Me_id) AS cant_prestadores
        FROM PrestadoresPorAtencion
      )
      SELECT 
        pre.pre_id,
        ISNULL(pre.pre_nombre, 'Sin Asignar') AS prestador,
        COUNT(cp.Me_id) AS cantidad,
        ISNULL(SUM(CAST(cp.Me_Cose AS DECIMAL(18,2)) / cp.cant_prestadores), 0) AS coseguro,
        ISNULL(SUM(CAST(cp.Me_ValorPrac AS DECIMAL(18,2)) / cp.cant_prestadores), 0) AS cobertura,
        ISNULL(SUM(CAST(cp.Me_Cose + cp.Me_ValorPrac AS DECIMAL(18,2)) / cp.cant_prestadores), 0) AS total_ingresos
      FROM ConteoPrestadores cp
      LEFT JOIN Prestadores pre ON cp.Pre_id = pre.pre_id
      GROUP BY pre.pre_id, pre.pre_nombre
      ORDER BY total_ingresos DESC
    `;

    // Query por prestación
    const queryPorPrestacion = `
      SELECT 
        mp.nom_cod AS codigo,
        CASE WHEN CHARINDEX('(', n.nom_nom) > 0 THEN RTRIM(LEFT(n.nom_nom, CHARINDEX('(', n.nom_nom) - 1))
             ELSE RTRIM(ISNULL(n.nom_nom, 'Sin Prestación')) END AS prestacion,
        ISNULL(mp.Serv_id, 0) AS grupo_id,
        COUNT(*) AS cantidad,
        ISNULL(SUM(m.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS total_ingresos
      FROM MovEnca m
      INNER JOIN MovPrac mp ON m.Me_id = mp.Me_id
      LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      ${whereClause}
      GROUP BY mp.nom_cod, n.nom_nom, mp.Serv_id
      ORDER BY cantidad DESC
    `;

    // Query por grupo (★ v3.6: Agrupado por SERVICIO en vez de nom_id)
    const queryPorGrupo = `
      SELECT 
        ISNULL(mp.Serv_id, 0) AS grupo_id,
        ISNULL(s.Serv_Nombre, 'Sin Servicio') AS grupo_nombre,
        COUNT(DISTINCT mp.nom_cod) AS tipos_prestacion,
        COUNT(*) AS cantidad,
        ISNULL(SUM(m.Me_Cose), 0) AS coseguro,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS cobertura,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS total_ingresos
      FROM MovEnca m
      INNER JOIN MovPrac mp ON m.Me_id = mp.Me_id
      LEFT JOIN Servicios s ON mp.Serv_id = s.Serv_Id
      ${whereClause}
      GROUP BY mp.Serv_id, s.Serv_Nombre
      ORDER BY total_ingresos DESC
    `;

    const [resultTotales, resultPorOS, resultPorPrestador, resultPorPrestacion, resultPorGrupo] = await Promise.all([
      executeQuery(queryTotales, params),
      executeQuery(queryPorOS, params),
      executeQuery(queryPorPrestador, params),
      executeQuery(queryPorPrestacion, params),
      executeQuery(queryPorGrupo, params)
    ]);

    const totales = resultTotales.recordset[0] || {
      total_atenciones: 0, total_practicas: 0, total_coseguro: 0, total_cobertura: 0, total_ingresos: 0
    };

    const calcularPorcentajes = (data, totalIngresos) => {
      return data.map(row => ({
        ...row,
        porcentaje: totalIngresos > 0 ? ((row.total_ingresos / totalIngresos) * 100).toFixed(1) : '0.0',
        promedio: row.cantidad > 0 ? row.total_ingresos / row.cantidad : 0
      }));
    };

    const porObraSocial = calcularPorcentajes(
      resultPorOS.recordset.map(row => ({
        os_id: row.os_id, sigla: row.sigla?.trim() || 'S/D', nombre: row.nombre?.trim() || 'Sin OS',
        cantidad: row.cantidad, coseguro: row.coseguro, cobertura: row.cobertura, total_ingresos: row.total_ingresos
      })), totales.total_ingresos
    );

    const porPrestador = calcularPorcentajes(
      resultPorPrestador.recordset.map(row => ({
        prestador_id: row.pre_id, prestador: row.prestador?.trim() || 'Sin Asignar',
        cantidad: row.cantidad, coseguro: parseFloat(row.coseguro) || 0,
        cobertura: parseFloat(row.cobertura) || 0, total_ingresos: parseFloat(row.total_ingresos) || 0
      })), totales.total_ingresos
    );

    const porPrestacion = calcularPorcentajes(
      resultPorPrestacion.recordset.map(row => ({
        codigo: row.codigo?.trim() || 'S/C', prestacion: row.prestacion?.trim() || 'Sin Prestación',
        grupo_id: row.grupo_id, cantidad: row.cantidad, coseguro: row.coseguro,
        cobertura: row.cobertura, total_ingresos: row.total_ingresos
      })), totales.total_ingresos
    );

    const porGrupo = calcularPorcentajes(
      resultPorGrupo.recordset.map(row => ({
        grupo_id: row.grupo_id, grupo_nombre: row.grupo_nombre?.trim() || 'Sin Grupo',
        tipos_prestacion: row.tipos_prestacion, cantidad: row.cantidad, coseguro: row.coseguro,
        cobertura: row.cobertura, total_ingresos: row.total_ingresos
      })), totales.total_ingresos
    );

    // Verificar que los totales por prestador sumen igual al total general
    const sumaPrestadores = porPrestador.reduce((sum, p) => sum + (p.total_ingresos || 0), 0);
    console.log(`✅ Stats-periodo v3.5:`);
    console.log(`   Total general: $${totales.total_ingresos.toLocaleString('es-AR')}`);
    console.log(`   Suma prestadores (prorrateado): $${sumaPrestadores.toLocaleString('es-AR')}`);
    console.log(`   Diferencia: $${Math.abs(totales.total_ingresos - sumaPrestadores).toFixed(2)}`);

    res.json({
      success: true,
      data: {
        totales: {
          atenciones: totales.total_atenciones, practicas: totales.total_practicas,
          coseguro: totales.total_coseguro, cobertura: totales.total_cobertura, ingresos: totales.total_ingresos
        },
        porObraSocial, porPrestador, porPrestacion, porGrupo
      },
      filtrosAplicados: {
        anio: anio || null, mes: mes || null, obraSocialId: obraSocialId || null,
        prestadorId: prestadorId || null, grupoPracticas: grupoPracticas || null
      },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error en stats-periodo:', error.message);
    res.status(500).json({ success: false, error: 'Error calculando estadísticas del período', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/stats
// Estadísticas generales (para Dashboard)
// ============================================

router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Calculando estadísticas...');

    const hoy = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const inicioMesAnterior = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
    const finMesAnterior = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];

    const [resultHoy, resultMesActual, resultMesAnterior, resultTotal] = await Promise.all([
      executeQuery(`SELECT COUNT(*) AS practicas, ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) AS ingreso FROM MovEnca WHERE CONVERT(DATE, Me_Fecha) = @hoy AND Me_Area = 'A'`, { hoy }),
      executeQuery(`SELECT COUNT(*) AS practicas, ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) AS ingreso FROM MovEnca WHERE Me_Fecha >= @inicioMes AND Me_Area = 'A'`, { inicioMes }),
      executeQuery(`SELECT COUNT(*) AS practicas, ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) AS ingreso FROM MovEnca WHERE Me_Fecha >= @inicioMesAnterior AND Me_Fecha <= @finMesAnterior AND Me_Area = 'A'`, { inicioMesAnterior, finMesAnterior }),
      executeQuery(`SELECT COUNT(*) AS practicas FROM MovEnca WHERE Me_Area = 'A'`)
    ]);

    console.log('✅ Estadísticas calculadas');

    res.json({
      success: true,
      data: {
        hoy: { practicas: resultHoy.recordset[0]?.practicas || 0, ingreso: resultHoy.recordset[0]?.ingreso || 0 },
        mesActual: { practicas: resultMesActual.recordset[0]?.practicas || 0, ingreso: resultMesActual.recordset[0]?.ingreso || 0 },
        mesAnterior: { practicas: resultMesAnterior.recordset[0]?.practicas || 0, ingreso: resultMesAnterior.recordset[0]?.ingreso || 0 },
        total: { practicas: resultTotal.recordset[0]?.practicas || 0 }
      },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error calculando estadísticas:', error.message);
    res.status(500).json({ success: false, error: 'Error calculando estadísticas', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/por-obra-social
// Análisis por obra social
// ============================================

router.get('/por-obra-social', async (req, res) => {
  try {
    console.log('🏥 Analizando por obra social...');

    const { anio, mes, limit = 50 } = req.query;

    let whereClause = `WHERE m.Me_Area = 'A'`;
    const params = {};

    if (anio) { whereClause += ` AND YEAR(m.Me_Fecha) = @anio`; params.anio = parseInt(anio); }
    if (mes) { whereClause += ` AND MONTH(m.Me_Fecha) = @mes`; params.mes = parseInt(mes); }

    const query = `
      SELECT TOP (@limit)
        os.os_id, ISNULL(os.os_sigla, 'S/D') AS sigla, ISNULL(os.os_nombre, 'Sin OS') AS nombre,
        COUNT(m.Me_id) AS cantidad,
        ISNULL(SUM(m.Me_Cose), 0) AS coseguro_total,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS cobertura_total,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS ingreso_total,
        AVG(ISNULL(m.Me_Cose, 0) + ISNULL(m.Me_ValorPrac, 0)) AS ingreso_promedio
      FROM MovEnca m
      LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id
      ${whereClause}
      GROUP BY os.os_id, os.os_sigla, os.os_nombre
      ORDER BY ingreso_total DESC
    `;

    params.limit = parseInt(limit);
    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (row.ingreso_total || 0), 0);
    const totalCantidad = result.recordset.reduce((sum, row) => sum + (row.cantidad || 0), 0);

    const analisis = result.recordset.map(row => ({
      os_id: row.os_id, sigla: row.sigla?.trim() || 'S/D', nombre: row.nombre?.trim() || 'Sin OS',
      cantidad: row.cantidad,
      porcentaje: totalCantidad > 0 ? ((row.cantidad / totalCantidad) * 100).toFixed(1) : '0',
      ingreso_total: row.ingreso_total, coseguro_total: row.coseguro_total,
      cobertura_total: row.cobertura_total, ingreso_promedio: row.ingreso_promedio
    }));

    console.log(`✅ ${analisis.length} obras sociales analizadas`);
    res.json({ success: true, data: analisis, totalGeneral, totalCantidad, fuente: 'SQL Server Local - GECLISA', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Error analizando por obra social:', error.message);
    res.status(500).json({ success: false, error: 'Error analizando por obra social', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/por-prestador
// Análisis por prestador
// ★★★ v3.5: CON PRORRATEO de ingresos ★★★
// ============================================

router.get('/por-prestador', async (req, res) => {
  try {
    console.log('👨‍⚕️ Analizando por prestador (v3.5 con prorrateo)...');

    const { anio, mes, limit = 50 } = req.query;

    let whereClause = `WHERE m.Me_Area = 'A'`;
    const params = {};

    if (anio) { whereClause += ` AND YEAR(m.Me_Fecha) = @anio`; params.anio = parseInt(anio); }
    if (mes) { whereClause += ` AND MONTH(m.Me_Fecha) = @mes`; params.mes = parseInt(mes); }

    // ★★★ v3.5: Query con PRORRATEO ★★★
    const query = `
      ;WITH PrestadoresPorAtencion AS (
        SELECT DISTINCT m.Me_id, m.Me_Cose, m.Me_ValorPrac, mpr.Pre_id
        FROM MovEnca m
        INNER JOIN MovPrac mp ON m.Me_id = mp.Me_id
        INNER JOIN MovPre mpr ON mp.Mp_id = mpr.Mp_id
        ${whereClause}
      ),
      ConteoPrestadores AS (
        SELECT Me_id, Me_Cose, Me_ValorPrac, Pre_id,
               COUNT(*) OVER (PARTITION BY Me_id) AS cant_prestadores
        FROM PrestadoresPorAtencion
      )
      SELECT TOP (@limit)
        pre.pre_id,
        ISNULL(pre.pre_nombre, 'Sin Asignar') AS prestador,
        COUNT(cp.Me_id) AS cantidad,
        ISNULL(SUM(CAST(cp.Me_Cose AS DECIMAL(18,2)) / cp.cant_prestadores), 0) AS coseguro_total,
        ISNULL(SUM(CAST(cp.Me_ValorPrac AS DECIMAL(18,2)) / cp.cant_prestadores), 0) AS cobertura_total,
        ISNULL(SUM(CAST(cp.Me_Cose + cp.Me_ValorPrac AS DECIMAL(18,2)) / cp.cant_prestadores), 0) AS ingreso_total,
        AVG(CAST(cp.Me_Cose + cp.Me_ValorPrac AS DECIMAL(18,2)) / cp.cant_prestadores) AS ingreso_promedio
      FROM ConteoPrestadores cp
      LEFT JOIN Prestadores pre ON cp.Pre_id = pre.pre_id
      GROUP BY pre.pre_id, pre.pre_nombre
      ORDER BY ingreso_total DESC
    `;

    params.limit = parseInt(limit);
    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (parseFloat(row.ingreso_total) || 0), 0);
    const totalCantidad = result.recordset.reduce((sum, row) => sum + (row.cantidad || 0), 0);

    const analisis = result.recordset.map(row => ({
      prestador_id: row.pre_id, prestador: row.prestador?.trim() || 'Sin Asignar',
      cantidad: row.cantidad,
      porcentaje: totalCantidad > 0 ? ((row.cantidad / totalCantidad) * 100).toFixed(1) : '0',
      ingreso_total: parseFloat(row.ingreso_total) || 0,
      coseguro_total: parseFloat(row.coseguro_total) || 0,
      cobertura_total: parseFloat(row.cobertura_total) || 0,
      ingreso_promedio: parseFloat(row.ingreso_promedio) || 0
    }));

    console.log(`✅ ${analisis.length} prestadores analizados (ingresos prorrateados)`);
    console.log(`   Total prorrateado: $${totalGeneral.toLocaleString('es-AR')}`);

    res.json({ success: true, data: analisis, totalGeneral, totalCantidad, fuente: 'SQL Server Local - GECLISA', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Error analizando por prestador:', error.message);
    res.status(500).json({ success: false, error: 'Error analizando por prestador', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/por-prestacion
// Análisis por tipo de prestación
// ============================================

router.get('/por-prestacion', async (req, res) => {
  try {
    console.log('📊 Analizando por prestación...');

    const { anio, mes, limit = 100 } = req.query;

    let whereClause = `WHERE m.Me_Area = 'A'`;
    const params = {};

    if (anio) { whereClause += ` AND YEAR(m.Me_Fecha) = @anio`; params.anio = parseInt(anio); }
    if (mes) { whereClause += ` AND MONTH(m.Me_Fecha) = @mes`; params.mes = parseInt(mes); }

    const query = `
      SELECT TOP (@limit)
        mp.nom_cod AS codigo,
        CASE WHEN CHARINDEX('(', n.nom_nom) > 0 THEN RTRIM(LEFT(n.nom_nom, CHARINDEX('(', n.nom_nom) - 1))
             ELSE RTRIM(ISNULL(n.nom_nom, 'Sin Prestación')) END AS prestacion,
        ISNULL(mp.Serv_id, 0) AS grupo_id, COUNT(*) AS cantidad,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS ingreso_total,
        ISNULL(SUM(m.Me_Cose), 0) AS coseguro_total,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS cobertura_total,
        AVG(ISNULL(m.Me_Cose, 0) + ISNULL(m.Me_ValorPrac, 0)) AS ingreso_promedio
      FROM MovEnca m
      INNER JOIN MovPrac mp ON m.Me_id = mp.Me_id
      LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      ${whereClause}
      GROUP BY mp.nom_cod, n.nom_nom, mp.Serv_id
      ORDER BY cantidad DESC
    `;

    params.limit = parseInt(limit);
    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (row.ingreso_total || 0), 0);
    const totalCantidad = result.recordset.reduce((sum, row) => sum + row.cantidad, 0);

    const analisis = result.recordset.map(row => ({
      codigo: row.codigo?.trim() || 'S/C', prestacion: row.prestacion?.trim() || 'Sin Prestación',
      grupo_id: row.grupo_id, cantidad: row.cantidad,
      porcentaje: totalCantidad > 0 ? ((row.cantidad / totalCantidad) * 100).toFixed(1) : '0',
      ingreso_total: row.ingreso_total, coseguro_total: row.coseguro_total,
      cobertura_total: row.cobertura_total, ingreso_promedio: row.ingreso_promedio
    }));

    console.log(`✅ ${analisis.length} prestaciones analizadas`);
    res.json({ success: true, data: analisis, totalGeneral, totalCantidad, fuente: 'SQL Server Local - GECLISA', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Error analizando por prestación:', error.message);
    res.status(500).json({ success: false, error: 'Error analizando por prestación', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/por-grupo
// Análisis por grupo de prácticas
// ============================================

router.get('/por-grupo', async (req, res) => {
  try {
    console.log('📊 Analizando por grupo de prácticas...');

    const { anio, mes, limit = 50 } = req.query;

    let whereClause = `WHERE m.Me_Area = 'A'`;
    const params = {};

    if (anio) { whereClause += ` AND YEAR(m.Me_Fecha) = @anio`; params.anio = parseInt(anio); }
    if (mes) { whereClause += ` AND MONTH(m.Me_Fecha) = @mes`; params.mes = parseInt(mes); }

    const query = `
      SELECT TOP (@limit)
        ISNULL(mp.Serv_id, 0) AS grupo_id,
        ISNULL(s.Serv_Nombre, 'Sin Servicio') AS grupo_nombre,
        COUNT(DISTINCT mp.nom_cod) AS tipos_prestacion, COUNT(*) AS cantidad,
        ISNULL(SUM(m.Me_Cose), 0) + ISNULL(SUM(m.Me_ValorPrac), 0) AS ingreso_total,
        ISNULL(SUM(m.Me_Cose), 0) AS coseguro_total,
        ISNULL(SUM(m.Me_ValorPrac), 0) AS cobertura_total,
        AVG(ISNULL(m.Me_Cose, 0) + ISNULL(m.Me_ValorPrac, 0)) AS ingreso_promedio
      FROM MovEnca m
      INNER JOIN MovPrac mp ON m.Me_id = mp.Me_id
      LEFT JOIN Servicios s ON mp.Serv_id = s.Serv_Id
      ${whereClause}
      GROUP BY mp.Serv_id, s.Serv_Nombre
      ORDER BY ingreso_total DESC
    `;

    params.limit = parseInt(limit);
    const result = await executeQuery(query, params);

    const totalGeneral = result.recordset.reduce((sum, row) => sum + (row.ingreso_total || 0), 0);
    const totalCantidad = result.recordset.reduce((sum, row) => sum + row.cantidad, 0);

    const analisis = result.recordset.map(row => ({
      grupo_id: row.grupo_id, grupo_nombre: row.grupo_nombre?.trim() || 'Sin Grupo',
      tipos_prestacion: row.tipos_prestacion, cantidad: row.cantidad,
      porcentaje: totalCantidad > 0 ? ((row.cantidad / totalCantidad) * 100).toFixed(1) : '0',
      ingreso_total: row.ingreso_total, coseguro_total: row.coseguro_total,
      cobertura_total: row.cobertura_total, ingreso_promedio: row.ingreso_promedio
    }));

    console.log(`✅ ${analisis.length} grupos analizados`);
    res.json({ success: true, data: analisis, totalGeneral, totalCantidad, fuente: 'SQL Server Local - GECLISA', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Error analizando por grupo:', error.message);
    res.status(500).json({ success: false, error: 'Error analizando por grupo', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/evolucion-mensual
// ============================================

router.get('/evolucion-mensual', async (req, res) => {
  try {
    console.log('📈 Obteniendo evolución mensual...');
    const { meses = 12 } = req.query;

    const query = `
      SELECT YEAR(Me_Fecha) AS anio, MONTH(Me_Fecha) AS mes, COUNT(*) AS practicas,
             ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) AS ingreso,
             ISNULL(SUM(Me_Cose), 0) AS coseguro, ISNULL(SUM(Me_ValorPrac), 0) AS cobertura
      FROM MovEnca WHERE Me_Fecha >= DATEADD(MONTH, -@meses, GETDATE()) AND Me_Area = 'A'
      GROUP BY YEAR(Me_Fecha), MONTH(Me_Fecha) ORDER BY anio ASC, mes ASC
    `;

    const result = await executeQuery(query, { meses: parseInt(meses) });
    const evolucion = result.recordset.map(row => ({
      periodo: `${row.anio}-${String(row.mes).padStart(2, '0')}`, anio: row.anio, mes: row.mes,
      mesNombre: new Date(row.anio, row.mes - 1).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }),
      practicas: row.practicas, ingreso: row.ingreso, coseguro: row.coseguro, cobertura: row.cobertura
    }));

    console.log(`✅ ${evolucion.length} meses de evolución`);
    res.json({ success: true, data: evolucion, fuente: 'SQL Server Local - GECLISA', timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Error obteniendo evolución:', error.message);
    res.status(500).json({ success: false, error: 'Error obteniendo evolución mensual', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/filtros
// ============================================

router.get('/filtros', async (req, res) => {
  try {
    console.log('🔍 Obteniendo opciones de filtros...');

    const [resultAnios, resultOS, resultPrestadores, resultGrupos] = await Promise.all([
      executeQuery(`SELECT DISTINCT YEAR(Me_Fecha) AS anio FROM MovEnca WHERE Me_Area = 'A' AND Me_Fecha IS NOT NULL ORDER BY anio DESC`),
      executeQuery(`SELECT DISTINCT os.os_id AS id, os.os_sigla AS sigla, os.os_nombre AS nombre FROM ObrasSociales os INNER JOIN MovEnca m ON os.os_id = m.Os_id WHERE m.Me_Area = 'A' ORDER BY os.os_nombre`),
      executeQuery(`SELECT DISTINCT p.pre_id AS id, p.pre_nombre AS nombre FROM Prestadores p INNER JOIN MovPre mpr ON p.pre_id = mpr.Pre_id INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca m ON mp.Me_id = m.Me_id WHERE m.Me_Area = 'A' ORDER BY p.pre_nombre`),
      executeQuery(`SELECT DISTINCT s.Serv_Id AS id, RTRIM(ISNULL(s.Serv_Nombre, 'Sin Servicio')) AS nombre FROM Servicios s INNER JOIN MovPrac mp ON s.Serv_Id = mp.Serv_id INNER JOIN MovEnca m ON mp.Me_id = m.Me_id WHERE m.Me_Area = 'A' AND mp.Serv_id IS NOT NULL AND ISNULL(s.serv_inactivo, 0) = 0 ORDER BY nombre`).catch(() => ({ recordset: [] }))
    ]);

    const meses = [
      { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
      { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
      { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
      { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
    ];

    res.json({
      success: true,
      data: {
        anios: resultAnios.recordset.map(r => r.anio),
        meses,
        obrasSociales: resultOS.recordset.map(r => ({ id: r.id, sigla: r.sigla?.trim() || '', nombre: r.nombre?.trim() || '' })),
        prestadores: resultPrestadores.recordset.map(r => ({ id: r.id, nombre: r.nombre?.trim() || '' })),
        grupos: resultGrupos.recordset.map(r => ({ id: r.id, nombre: r.nombre?.trim() || '' }))
      },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo filtros:', error.message);
    res.status(500).json({ success: false, error: 'Error obteniendo opciones de filtros', message: error.message });
  }
});

// ============================================
// GET /api/movimientos/detalle/:id
// ============================================

router.get('/detalle/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Obteniendo detalle de movimiento: ${id}`);

    const [resultMov, resultPrac] = await Promise.all([
      executeQuery(`SELECT m.*, os.os_nombre AS obra_social_nombre, os.os_sigla AS obra_social_sigla FROM MovEnca m LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id WHERE m.Me_id = @id`, { id: parseInt(id) }),
      executeQuery(`SELECT mp.*, n.nom_nom AS practica_nombre FROM MovPrac mp LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod WHERE mp.Me_id = @id`, { id: parseInt(id) })
    ]);

    if (resultMov.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Movimiento no encontrado' });
    }

    res.json({
      success: true,
      data: { movimiento: resultMov.recordset[0], practicas: resultPrac.recordset },
      fuente: 'SQL Server Local - GECLISA',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error obteniendo detalle:', error.message);
    res.status(500).json({ success: false, error: 'Error obteniendo detalle', message: error.message });
  }
});

module.exports = router;
