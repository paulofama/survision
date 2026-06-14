// ============================================================
// BACKEND - API ENDPOINT: INFORME DE GESTIÓN MENSUAL
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================
// 
// INSTRUCCIONES DE INTEGRACIÓN:
// const informesRoutes = require('./routes/informes');
// app.use('/api/informes', informesRoutes);
// ============================================================
// FIX 1: Reemplazado SUM(mp.Mp_Tot) por SUM(me.Me_Cose + me.Me_ValorPrac)
// en las 12 queries monetarias. Mp_Tot de MovPrac = 0 para datos recientes.
// Los endpoints que SÍ funcionan (prestaciones-realizadas/stats-*) usan
// Me_Cose + Me_ValorPrac de MovEnca, que es donde está la data monetaria.
// ============================================================
// FIX 2: Reemplazada conexión standalone sql.connect(dbConfig) con
// credenciales hardcodeadas por executeQuery() de config/database.js
// (misma conexión compartida que usa el resto del sistema).
// ============================================================

const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');

// ---- IDs de prestadores socios (configurar según instituto) ----
const SOCIOS_IDS = [
  // Agregar los pre_id de: Jorge L. Mercado, Pablo D. Mahia, 
  // Leandro N. Roca, Carlos A. Musa
  // Ejemplo: 1, 2, 3, 4
];

// ============================================================
// ENDPOINT PRINCIPAL: GET /api/informes/gestion-mensual
// Query params: mes (1-12), anio (2020-2030)
// ============================================================
router.get('/gestion-mensual', async (req, res) => {
  const { mes, anio } = req.query;

  if (!mes || !anio) {
    return res.status(400).json({ error: 'Parámetros mes y anio son requeridos' });
  }

  const mesNum = parseInt(mes);
  const anioNum = parseInt(anio);

  if (mesNum < 1 || mesNum > 12 || anioNum < 2020 || anioNum > 2030) {
    return res.status(400).json({ error: 'Parámetros fuera de rango' });
  }

  try {
    console.log(`✅ [INFORMES] Generando informe mes=${mesNum} anio=${anioNum}`);

    // Calcular rangos de fechas
    const fechaIniMesActual = `${anioNum}-${String(mesNum).padStart(2, '0')}-01`;
    const fechaFinMesActual = new Date(anioNum, mesNum, 0).toISOString().split('T')[0];

    const mesAnt = mesNum === 1 ? 12 : mesNum - 1;
    const anioAnt = mesNum === 1 ? anioNum - 1 : anioNum;
    const fechaIniMesAnterior = `${anioAnt}-${String(mesAnt).padStart(2, '0')}-01`;
    const fechaFinMesAnterior = new Date(anioAnt, mesAnt, 0).toISOString().split('T')[0];

    const fechaIniAcumActual = `${anioNum}-01-01`;
    const fechaFinAcumActual = fechaFinMesActual;

    const fechaIniAcumAnterior = `${anioNum - 1}-01-01`;
    const fechaFinAcumAnterior = new Date(anioNum - 1, mesNum, 0).toISOString().split('T')[0];

    // ---- QUERY 1: Resumen mensual (mes actual y anterior) ----
    const queryResumen = `
      SELECT 
        'ACTUAL' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
    `;

    const resumenResult = await executeQuery(queryResumen, {
      fechaIniActual: fechaIniMesActual,
      fechaFinActual: fechaFinMesActual,
      fechaIniAnterior: fechaIniMesAnterior,
      fechaFinAnterior: fechaFinMesAnterior,
    });

    // ---- QUERY 2: Total honorarios por período ----
    const queryHonorarios = `
      SELECT 
        'ACTUAL' AS periodo,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
    `;

    const honorariosResult = await executeQuery(queryHonorarios, {
      fechaIniActual: fechaIniMesActual,
      fechaFinActual: fechaFinMesActual,
      fechaIniAnterior: fechaIniMesAnterior,
      fechaFinAnterior: fechaFinMesAnterior,
    });

    // ---- QUERY 3: Acumulado anual (actual vs anterior) ----
    const queryAcumulado = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
    `;

    const acumuladoResult = await executeQuery(queryAcumulado, {
      fechaIniAcumActual,
      fechaFinAcumActual,
      fechaIniAcumAnterior,
      fechaFinAcumAnterior,
    });

    // ---- QUERY 4: Honorarios acumulados ----
    const queryHonorariosAcum = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
    `;

    const honorariosAcumResult = await executeQuery(queryHonorariosAcum, {
      fechaIniAcumActual,
      fechaFinAcumActual,
      fechaIniAcumAnterior,
      fechaFinAcumAnterior,
    });

    // ---- QUERY 5: Desglose por Obra Social (mes actual y anterior) ----
    const queryPorOS = `
      SELECT 
        'ACTUAL' AS periodo,
        os.os_id AS osId,
        os.os_nombre AS osNombre,
        os.os_sigla AS osSigla,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(mp.Mp_id) AS practicas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
      GROUP BY os.os_id, os.os_nombre, os.os_sigla

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        os.os_id AS osId,
        os.os_nombre AS osNombre,
        os.os_sigla AS osSigla,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(mp.Mp_id) AS practicas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY os.os_id, os.os_nombre, os.os_sigla

      ORDER BY facturado DESC
    `;

    const porOSResult = await executeQuery(queryPorOS, {
      fechaIniActual: fechaIniMesActual,
      fechaFinActual: fechaFinMesActual,
      fechaIniAnterior: fechaIniMesAnterior,
      fechaFinAnterior: fechaFinMesAnterior,
    });

    // ---- QUERY 6: Honorarios por OS ----
    const queryHonorariosPorOS = `
      SELECT 
        'ACTUAL' AS periodo,
        os.os_id AS osId,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
      GROUP BY os.os_id

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        os.os_id AS osId,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY os.os_id
    `;

    const honorariosPorOSResult = await executeQuery(queryHonorariosPorOS, {
      fechaIniActual: fechaIniMesActual,
      fechaFinActual: fechaFinMesActual,
      fechaIniAnterior: fechaIniMesAnterior,
      fechaFinAnterior: fechaFinMesAnterior,
    });

    // ---- QUERY 7: Desglose por Prestador (Mensual) ----
    // FIX: MPre_Tot de MovPre = 0. Se usa Me_Cose + Me_ValorPrac de MovEnca.
    // CTE con DISTINCT (Pre_id, Me_id) evita doble conteo cuando un prestador
    // tiene múltiples prácticas en el mismo encuentro.
    const queryPrestador = `
      ;WITH EncPre AS (
        SELECT DISTINCT
          mpr.Pre_id,
          me.Me_id,
          ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0) AS facturado
        FROM MovPre mpr
        INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
        INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
        WHERE me.Me_Fecha BETWEEN @fechaIni AND @fechaFin
      )
      SELECT
        ep.Pre_id AS preId,
        pre.pre_nombre AS preNombre,
        COUNT(ep.Me_id) AS atenciones,
        ISNULL(SUM(ep.facturado), 0) AS honorarios
      FROM EncPre ep
      INNER JOIN Prestadores pre ON ep.Pre_id = pre.pre_id
      GROUP BY ep.Pre_id, pre.pre_nombre
      ORDER BY honorarios DESC
    `;

    const prestadorActualResult = await executeQuery(queryPrestador, {
      fechaIni: fechaIniMesActual,
      fechaFin: fechaFinMesActual,
    });
    const prestadorAnteriorResult = await executeQuery(queryPrestador, {
      fechaIni: fechaIniMesAnterior,
      fechaFin: fechaFinMesAnterior,
    });

    // ---- QUERY 8: Top 20 Prácticas ----
    const queryPorPractica = `
      SELECT TOP 20
        'ACTUAL' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC
    `;

    const porPracticaActualResult = await executeQuery(queryPorPractica, {
      fechaIniActual: fechaIniMesActual,
      fechaFinActual: fechaFinMesActual,
    });

    const queryPorPracticaAnt = `
      SELECT TOP 20
        'ANTERIOR' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC
    `;

    const porPracticaAnteriorResult = await executeQuery(queryPorPracticaAnt, {
      fechaIniAnterior: fechaIniMesAnterior,
      fechaFinAnterior: fechaFinMesAnterior,
    });

    // ---- QUERY 9: Honorarios por práctica (para calcular margen) ----
    const queryHonorariosPorPractica = `
      SELECT 
        'ACTUAL' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
      GROUP BY n.nom_id, n.nom_cod

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY n.nom_id, n.nom_cod
    `;

    const honorariosPorPracticaResult = await executeQuery(queryHonorariosPorPractica, {
      fechaIniActual: fechaIniMesActual,
      fechaFinActual: fechaFinMesActual,
      fechaIniAnterior: fechaIniMesAnterior,
      fechaFinAnterior: fechaFinMesAnterior,
    });

    // ============================================================
    // ✅ QUERIES NUEVAS: ACUMULADOS POR OS, PRESTADOR Y PRÁCTICA
    // ============================================================

    // ---- QUERY 10: OS Acumulado (año actual y anterior) ----
    const queryPorOSAcum = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        os.os_id AS osId,
        os.os_nombre AS osNombre,
        os.os_sigla AS osSigla,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(mp.Mp_id) AS practicas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
      GROUP BY os.os_id, os.os_nombre, os.os_sigla

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        os.os_id AS osId,
        os.os_nombre AS osNombre,
        os.os_sigla AS osSigla,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(mp.Mp_id) AS practicas,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY os.os_id, os.os_nombre, os.os_sigla

      ORDER BY facturado DESC
    `;

    const porOSAcumResult = await executeQuery(queryPorOSAcum, {
      fechaIniAcumActual,
      fechaFinAcumActual,
      fechaIniAcumAnterior,
      fechaFinAcumAnterior,
    });

    // ---- QUERY 11: Honorarios por OS Acumulado ----
    const queryHonorariosPorOSAcum = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        os.os_id AS osId,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
      GROUP BY os.os_id

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        os.os_id AS osId,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY os.os_id
    `;

    const honorariosPorOSAcumResult = await executeQuery(queryHonorariosPorOSAcum, {
      fechaIniAcumActual,
      fechaFinAcumActual,
      fechaIniAcumAnterior,
      fechaFinAcumAnterior,
    });

    // ---- QUERY 12: Prestadores Acumulado ----
    // FIX: Mismo patrón CTE que Query 7 - reutiliza queryPrestador
    const prestadorAcumActualResult = await executeQuery(queryPrestador, {
      fechaIni: fechaIniAcumActual,
      fechaFin: fechaFinAcumActual,
    });
    const prestadorAcumAnteriorResult = await executeQuery(queryPrestador, {
      fechaIni: fechaIniAcumAnterior,
      fechaFin: fechaFinAcumAnterior,
    });

    // ---- QUERY 13: Top 20 Prácticas Acumulado Actual ----
    const queryPorPracticaAcumActual = `
      SELECT TOP 20
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC
    `;

    const porPracticaAcumActualResult = await executeQuery(queryPorPracticaAcumActual, {
      fechaIniAcumActual,
      fechaFinAcumActual,
    });

    // ---- QUERY 14: Top 20 Prácticas Acumulado Anterior ----
    const queryPorPracticaAcumAnterior = `
      SELECT TOP 20
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC
    `;

    const porPracticaAcumAnteriorResult = await executeQuery(queryPorPracticaAcumAnterior, {
      fechaIniAcumAnterior,
      fechaFinAcumAnterior,
    });

    // ---- QUERY 15: Honorarios por práctica acumulados ----
    const queryHonorariosPorPracticaAcum = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
      GROUP BY n.nom_id, n.nom_cod

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY n.nom_id, n.nom_cod
    `;

    const honorariosPorPracticaAcumResult = await executeQuery(queryHonorariosPorPracticaAcum, {
      fechaIniAcumActual,
      fechaFinAcumActual,
      fechaIniAcumAnterior,
      fechaFinAcumAnterior,
    });

    // ============================================================
    // PROCESAMIENTO Y ARMADO DE RESPUESTA
    // ============================================================

    // 🔍 LOG DIAGNÓSTICO: verificar datos monetarios desde MovEnca
    const resumenRaw = resumenResult.recordset;
    console.log('📊 [INFORMES] Resumen raw:', JSON.stringify(resumenRaw.map(r => ({
      periodo: r.periodo,
      atenciones: r.totalAtenciones,
      practicas: r.totalPracticas,
      facturado: r.totalFacturado
    }))));

    // Helper para encontrar fila por periodo
    const findByPeriodo = (rows, periodo) => rows.find(r => r.periodo === periodo) || {};

    // --- Resumen mensual ---
    const resActual = findByPeriodo(resumenResult.recordset, 'ACTUAL');
    const resAnterior = findByPeriodo(resumenResult.recordset, 'ANTERIOR');
    const honActual = findByPeriodo(honorariosResult.recordset, 'ACTUAL');
    const honAnterior = findByPeriodo(honorariosResult.recordset, 'ANTERIOR');

    const buildMetricas = (res, hon) => {
      const totalFacturado = parseFloat(res.totalFacturado || 0);
      const totalHonorarios = parseFloat(hon.totalHonorarios || 0);
      const totalAtenciones = parseInt(res.totalAtenciones || 0);
      const totalPracticas = parseInt(res.totalPracticas || 0);
      const margenBruto = totalFacturado - totalHonorarios;

      return {
        totalAtenciones,
        totalPracticas,
        totalFacturado,
        totalHonorarios,
        margenBruto,
        margenBrutoPct: totalFacturado > 0 ? (margenBruto / totalFacturado) * 100 : 0,
        ticketPromedio: totalAtenciones > 0 ? totalFacturado / totalAtenciones : 0,
        pacientesUnicos: parseInt(res.pacientesUnicos || 0),
        practicasPorAtencion: totalAtenciones > 0 ? totalPracticas / totalAtenciones : 0,
      };
    };

    const calcVariacion = (actual, anterior) => {
      const result = {};
      for (const key of Object.keys(actual)) {
        result[key] = actual[key] - anterior[key];
      }
      return result;
    };

    const calcVariacionPct = (actual, anterior) => {
      const result = {};
      for (const key of Object.keys(actual)) {
        result[key] = anterior[key] !== 0
          ? ((actual[key] - anterior[key]) / Math.abs(anterior[key])) * 100
          : (actual[key] > 0 ? 100 : 0);
      }
      return result;
    };

    const metricasActual = buildMetricas(resActual, honActual);
    const metricasAnterior = buildMetricas(resAnterior, honAnterior);

    // --- Acumulado ---
    const acumActual = findByPeriodo(acumuladoResult.recordset, 'ACUM_ACTUAL');
    const acumAnterior = findByPeriodo(acumuladoResult.recordset, 'ACUM_ANTERIOR');
    const honAcumActual = findByPeriodo(honorariosAcumResult.recordset, 'ACUM_ACTUAL');
    const honAcumAnterior = findByPeriodo(honorariosAcumResult.recordset, 'ACUM_ANTERIOR');

    const metricasAcumActual = buildMetricas(acumActual, honAcumActual);
    const metricasAcumAnterior = buildMetricas(acumAnterior, honAcumAnterior);

    // --- Por OS (mensual) ---
    const osActual = porOSResult.recordset.filter(r => r.periodo === 'ACTUAL');
    const osAnterior = porOSResult.recordset.filter(r => r.periodo === 'ANTERIOR');
    const honOsActual = honorariosPorOSResult.recordset.filter(r => r.periodo === 'ACTUAL');
    const honOsAnterior = honorariosPorOSResult.recordset.filter(r => r.periodo === 'ANTERIOR');

    const totalFacturadoOS = osActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
    const totalFacturadoOSAnt = osAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

    const buildOSData = (osRows, honRows, totalFact) => {
      return osRows.map(os => {
        const facturado = parseFloat(os.facturado || 0);
        const hon = honRows.find(h => h.osId === os.osId);
        const honorarios = parseFloat(hon?.honorarios || 0);
        const margen = facturado - honorarios;
        return {
          osId: os.osId,
          osNombre: os.osNombre?.trim() || '',
          osSigla: os.osSigla?.trim() || '',
          atenciones: parseInt(os.atenciones || 0),
          practicas: parseInt(os.practicas || 0),
          facturado,
          honorarios,
          margen,
          margenPct: facturado > 0 ? (margen / facturado) * 100 : 0,
          participacionPct: totalFact > 0 ? (facturado / totalFact) * 100 : 0,
        };
      }).sort((a, b) => b.facturado - a.facturado);
    };

    // --- Por OS (acumulado) ---
    const osAcumActual = porOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const osAcumAnterior = porOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');
    const honOsAcumActual = honorariosPorOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const honOsAcumAnterior = honorariosPorOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');

    const totalFacturadoOSAcumAct = osAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
    const totalFacturadoOSAcumAnt = osAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

    // --- Por Prestador (mensual) ---
    const preActual = prestadorActualResult.recordset;
    const preAnterior = prestadorAnteriorResult.recordset;

    const buildPrestadorData = (rows) => {
      return rows.map(pre => ({
        preId: pre.preId,
        preNombre: pre.preNombre?.trim() || '',
        atenciones: parseInt(pre.atenciones || 0),
        practicas: parseInt(pre.practicas || 0),
        honorarios: parseFloat(pre.honorarios || 0),
        facturado: parseFloat(pre.honorarios || 0), // Para comparativas
        facturadoAsociado: 0,
        productividad: 0,
        esSocio: SOCIOS_IDS.includes(pre.preId),
      })).sort((a, b) => b.honorarios - a.honorarios);
    };

    // --- Por Prestador (acumulado) ---
    const preAcumActual = prestadorAcumActualResult.recordset;
    const preAcumAnterior = prestadorAcumAnteriorResult.recordset;

    // --- Por Práctica (mensual) ---
    const pracActual = porPracticaActualResult.recordset;
    const pracAnterior = porPracticaAnteriorResult.recordset;
    const honPracActual = honorariosPorPracticaResult.recordset.filter(r => r.periodo === 'ACTUAL');
    const honPracAnterior = honorariosPorPracticaResult.recordset.filter(r => r.periodo === 'ANTERIOR');

    const totalFactPrac = pracActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
    const totalFactPracAnt = pracAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

    const buildPracticaData = (pracRows, honRows, totalFact) => {
      return pracRows.map(prac => {
        const facturado = parseFloat(prac.facturado || 0);
        const cantidad = parseInt(prac.cantidad || 0);
        const hon = honRows.find(h => h.nomId === prac.nomId && h.nomCod === prac.nomCod);
        const honorarios = parseFloat(hon?.honorarios || 0);
        const margen = facturado - honorarios;
        return {
          nomId: prac.nomId,
          nomCod: prac.nomCod?.trim() || '',
          nomNombre: prac.nomNombre?.trim() || '',
          cantidad,
          facturado,
          honorarios,
          margen,
          margenPct: facturado > 0 ? (margen / facturado) * 100 : 0,
          participacionPct: totalFact > 0 ? (facturado / totalFact) * 100 : 0,
          ticketPromedio: cantidad > 0 ? facturado / cantidad : 0,
        };
      });
    };

    // --- Por Práctica (acumulado) ---
    const pracAcumActual = porPracticaAcumActualResult.recordset;
    const pracAcumAnterior = porPracticaAcumAnteriorResult.recordset;
    const honPracAcumActual = honorariosPorPracticaAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const honPracAcumAnterior = honorariosPorPracticaAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');

    const totalFactPracAcumAct = pracAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
    const totalFactPracAcumAnt = pracAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

    // ============================================================
    // RESPUESTA FINAL
    // ============================================================
    const response = {
      generadoEn: new Date().toISOString(),
      periodo: {
        mes: mesNum,
        anio: anioNum,
        label: `${getMesNombre(mesNum)} ${anioNum}`,
        periodoGeclisa: `${anioNum}${String(mesNum).padStart(2, '0')}`,
      },

      resumenMensual: {
        actual: metricasActual,
        anterior: metricasAnterior,
        variacion: calcVariacion(metricasActual, metricasAnterior),
        variacionPct: calcVariacionPct(metricasActual, metricasAnterior),
      },

      resumenAcumulado: {
        actual: metricasAcumActual,
        anterior: metricasAcumAnterior,
        variacion: calcVariacion(metricasAcumActual, metricasAcumAnterior),
        variacionPct: calcVariacionPct(metricasAcumActual, metricasAcumAnterior),
      },

      porObraSocial: {
        mesActual: buildOSData(osActual, honOsActual, totalFacturadoOS),
        mesAnterior: buildOSData(osAnterior, honOsAnterior, totalFacturadoOSAnt),
        acumActual: buildOSData(osAcumActual, honOsAcumActual, totalFacturadoOSAcumAct),
        acumAnterior: buildOSData(osAcumAnterior, honOsAcumAnterior, totalFacturadoOSAcumAnt),
      },

      porPrestador: {
        mesActual: buildPrestadorData(preActual),
        mesAnterior: buildPrestadorData(preAnterior),
        acumActual: buildPrestadorData(preAcumActual),
        acumAnterior: buildPrestadorData(preAcumAnterior),
      },

      porPractica: {
        mesActual: buildPracticaData(pracActual, honPracActual, totalFactPrac),
        mesAnterior: buildPracticaData(pracAnterior, honPracAnterior, totalFactPracAnt),
        acumActual: buildPracticaData(pracAcumActual, honPracAcumActual, totalFactPracAcumAct),
        acumAnterior: buildPracticaData(pracAcumAnterior, honPracAcumAnterior, totalFactPracAcumAnt),
      },
    };

    console.log(`✅ [INFORMES] Informe generado exitosamente - Facturado actual: $${metricasActual.totalFacturado}`);
    res.json(response);

  } catch (error) {
    console.error('Error generando informe de gestión:', error);
    res.status(500).json({
      error: 'Error al generar el informe de gestión',
      detalle: error.message,
    });
  }
});

// ---- Helper ----
function getMesNombre(mes) {
  const nombres = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
  };
  return nombres[mes] || '';
}

module.exports = router;
