// ============================================================
// BACKEND - API ENDPOINT: INFORME DE GESTIÓN MENSUAL
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================
// 
// INSTRUCCIONES DE INTEGRACIÓN:
// Agregar estas rutas al archivo de rutas Express existente.
// Ejemplo: en tu server.js o routes/informes.js
//
// const informesRoutes = require('./routes/informes');
// app.use('/api/informes', informesRoutes);
// ============================================================
// CAMBIO: Se agregaron queries 10-15 para datos acumulados 
// desglosados por OS, Prestador y Práctica (acumActual/acumAnterior).
// Esto alimenta las tablas comparativas anuales del PDF.
// ============================================================

const express = require('express');
const router = express.Router();
const sql = require('mssql');

// ---- Configuración de conexión (usar la existente) ----
// Esta config ya debería estar en tu proyecto
const dbConfig = {
  server: '192.168.1.73',
  database: 'Geclisa',
  user: 'survision',
  password: 'survision', // ajustar según tu .env
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

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

  let pool;

  try {
    // Usar pool global SIN cerrarlo nunca
    pool = await sql.connect(dbConfig);
    console.log('✅ [INFORMES] Pool conectado - tipo:', pool.constructor.name, '- connected:', pool.connected);

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
        ISNULL(SUM(mp.Mp_Tot), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(mp.Mp_Tot), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
    `;

    const resumenResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryResumen);

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

    const honorariosResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryHonorarios);

    // ---- QUERY 3: Acumulado anual (actual vs anterior) ----
    const queryAcumulado = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(mp.Mp_Tot), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        COUNT(DISTINCT me.Me_id) AS totalAtenciones,
        COUNT(mp.Mp_id) AS totalPracticas,
        ISNULL(SUM(mp.Mp_Tot), 0) AS totalFacturado,
        COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
      FROM MovEnca me
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
    `;

    const acumuladoResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryAcumulado);

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

    const honorariosAcumResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryHonorariosAcum);

    // ---- QUERY 5: Desglose por Obra Social (mes actual y anterior) ----
    const queryPorOS = `
      SELECT 
        'ACTUAL' AS periodo,
        os.os_id AS osId,
        os.os_nombre AS osNombre,
        os.os_sigla AS osSigla,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(mp.Mp_id) AS practicas,
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
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
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY os.os_id, os.os_nombre, os.os_sigla

      ORDER BY facturado DESC, atenciones DESC
    `;

    const porOSResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryPorOS);

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

    const honorariosPorOSResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryHonorariosPorOS);

    // ---- QUERY 7: Desglose por Prestador ----
    const queryPorPrestador = `
      SELECT 
        'ACTUAL' AS periodo,
        pre.pre_id AS preId,
        pre.pre_nombre AS preNombre,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(DISTINCT mp.Mp_id) AS practicas,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
      GROUP BY pre.pre_id, pre.pre_nombre

      UNION ALL

      SELECT 
        'ANTERIOR' AS periodo,
        pre.pre_id AS preId,
        pre.pre_nombre AS preNombre,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(DISTINCT mp.Mp_id) AS practicas,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY pre.pre_id, pre.pre_nombre

      ORDER BY honorarios DESC, atenciones DESC
    `;

    const porPrestadorResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryPorPrestador);

    // ---- QUERY 8: Top 20 Prácticas ----
    const queryPorPractica = `
      SELECT TOP 20
        'ACTUAL' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC, cantidad DESC
    `;

    const porPracticaActualResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .query(queryPorPractica);

    const queryPorPracticaAnt = `
      SELECT TOP 20
        'ANTERIOR' AS periodo,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC, cantidad DESC
    `;

    const porPracticaAnteriorResult = await pool.request()
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryPorPracticaAnt);

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

    const honorariosPorPracticaResult = await pool.request()
      .input('fechaIniActual', sql.Date, fechaIniMesActual)
      .input('fechaFinActual', sql.Date, fechaFinMesActual)
      .input('fechaIniAnterior', sql.Date, fechaIniMesAnterior)
      .input('fechaFinAnterior', sql.Date, fechaFinMesAnterior)
      .query(queryHonorariosPorPractica);

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
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
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
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY os.os_id, os.os_nombre, os.os_sigla

      ORDER BY facturado DESC, atenciones DESC
    `;

    const porOSAcumResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryPorOSAcum);

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

    const honorariosPorOSAcumResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryHonorariosPorOSAcum);

    // ---- QUERY 12: Prestadores Acumulado ----
    const queryPorPrestadorAcum = `
      SELECT 
        'ACUM_ACTUAL' AS periodo,
        pre.pre_id AS preId,
        pre.pre_nombre AS preNombre,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(DISTINCT mp.Mp_id) AS practicas,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
      GROUP BY pre.pre_id, pre.pre_nombre

      UNION ALL

      SELECT 
        'ACUM_ANTERIOR' AS periodo,
        pre.pre_id AS preId,
        pre.pre_nombre AS preNombre,
        COUNT(DISTINCT me.Me_id) AS atenciones,
        COUNT(DISTINCT mp.Mp_id) AS practicas,
        ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
      FROM MovPre mpr
      INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY pre.pre_id, pre.pre_nombre

      ORDER BY honorarios DESC, atenciones DESC
    `;

    const porPrestadorAcumResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryPorPrestadorAcum);

    // ---- QUERY 13: Top 20 Prácticas Acumulado Actual ----
    const queryPorPracticaAcumActual = `
      SELECT TOP 20
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC, cantidad DESC
    `;

    const porPracticaAcumActualResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .query(queryPorPracticaAcumActual);

    // ---- QUERY 14: Top 20 Prácticas Acumulado Anterior ----
    const queryPorPracticaAcumAnterior = `
      SELECT TOP 20
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad,
        ISNULL(SUM(mp.Mp_Tot), 0) AS facturado
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
      GROUP BY n.nom_id, n.nom_cod, n.nom_nom
      ORDER BY facturado DESC, cantidad DESC
    `;

    const porPracticaAcumAnteriorResult = await pool.request()
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryPorPracticaAcumAnterior);

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

    const honorariosPorPracticaAcumResult = await pool.request()
      .input('fechaIniAcumActual', sql.Date, fechaIniAcumActual)
      .input('fechaFinAcumActual', sql.Date, fechaFinAcumActual)
      .input('fechaIniAcumAnterior', sql.Date, fechaIniAcumAnterior)
      .input('fechaFinAcumAnterior', sql.Date, fechaFinAcumAnterior)
      .query(queryHonorariosPorPracticaAcum);

    // ============================================================
    // QUERIES 16-18: EVOLUCIÓN 12 MESES (cantidades, sin importes)
    // ============================================================
    // Calcula la fecha de inicio de la ventana de 12 meses.
    // Si el informe es Abril 2026 → ventana de Mayo 2025 a Abril 2026.
    let mesIni12M = mesNum - 11;
    let anioIni12M = anioNum;
    while (mesIni12M < 1) { mesIni12M += 12; anioIni12M -= 1; }
    const fechaIni12M = `${anioIni12M}-${String(mesIni12M).padStart(2, '0')}-01`;
    const fechaFin12M = fechaFinMesActual;

    // ---- QUERY 16: Atenciones por OS y mes (últimos 12 meses) ----
    const queryEvolOS = `
      SELECT 
        YEAR(me.Me_Fecha) AS anio,
        MONTH(me.Me_Fecha) AS mes,
        os.os_id AS osId,
        os.os_sigla AS osSigla,
        os.os_nombre AS osNombre,
        COUNT(DISTINCT me.Me_id) AS cantidad
      FROM MovEnca me
      INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
      WHERE me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M
      GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), os.os_id, os.os_sigla, os.os_nombre
    `;

    const evolOSResult = await pool.request()
      .input('fechaIni12M', sql.Date, fechaIni12M)
      .input('fechaFin12M', sql.Date, fechaFin12M)
      .query(queryEvolOS);

    // ---- QUERY 17: Atenciones por Prestador y mes (últimos 12 meses) ----
    const queryEvolPrestador = `
      SELECT 
        YEAR(me.Me_Fecha) AS anio,
        MONTH(me.Me_Fecha) AS mes,
        pre.pre_id AS preId,
        pre.pre_nombre AS preNombre,
        COUNT(DISTINCT me.Me_id) AS cantidad
      FROM MovPre mpr
      INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
      INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M
      GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), pre.pre_id, pre.pre_nombre
    `;

    const evolPrestadorResult = await pool.request()
      .input('fechaIni12M', sql.Date, fechaIni12M)
      .input('fechaFin12M', sql.Date, fechaFin12M)
      .query(queryEvolPrestador);

    // ---- QUERY 18: Cantidad de prácticas por mes (últimos 12 meses) ----
    const queryEvolPractica = `
      SELECT 
        YEAR(me.Me_Fecha) AS anio,
        MONTH(me.Me_Fecha) AS mes,
        n.nom_id AS nomId,
        n.nom_cod AS nomCod,
        n.nom_nom AS nomNombre,
        COUNT(mp.Mp_id) AS cantidad
      FROM MovPrac mp
      INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
      WHERE me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M
      GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), n.nom_id, n.nom_cod, n.nom_nom
    `;

    const evolPracticaResult = await pool.request()
      .input('fechaIni12M', sql.Date, fechaIni12M)
      .input('fechaFin12M', sql.Date, fechaFin12M)
      .query(queryEvolPractica);

    // ============================================================
    // PROCESAMIENTO Y ARMADO DE RESPUESTA
    // ============================================================

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

    // --- Por OS (acumulado) ✅ NUEVO ---
    const osAcumActual = porOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const osAcumAnterior = porOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');
    const honOsAcumActual = honorariosPorOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const honOsAcumAnterior = honorariosPorOSAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');

    const totalFacturadoOSAcumAct = osAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
    const totalFacturadoOSAcumAnt = osAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

    // --- Por Prestador (mensual) ---
    const preActual = porPrestadorResult.recordset.filter(r => r.periodo === 'ACTUAL');
    const preAnterior = porPrestadorResult.recordset.filter(r => r.periodo === 'ANTERIOR');

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

    // --- Por Prestador (acumulado) ✅ NUEVO ---
    const preAcumActual = porPrestadorAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const preAcumAnterior = porPrestadorAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');

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

    // --- Por Práctica (acumulado) ✅ NUEVO ---
    const pracAcumActual = porPracticaAcumActualResult.recordset;
    const pracAcumAnterior = porPracticaAcumAnteriorResult.recordset;
    const honPracAcumActual = honorariosPorPracticaAcumResult.recordset.filter(r => r.periodo === 'ACUM_ACTUAL');
    const honPracAcumAnterior = honorariosPorPracticaAcumResult.recordset.filter(r => r.periodo === 'ACUM_ANTERIOR');

    const totalFactPracAcumAct = pracAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
    const totalFactPracAcumAnt = pracAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

    // ============================================================
    // PROCESAMIENTO EVOLUCIÓN 12 MESES
    // ============================================================
    // Construye los 12 meses de la ventana (cronológico)
    const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                         'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const meses12M = [];
    {
      let m = mesIni12M;
      let a = anioIni12M;
      for (let i = 0; i < 12; i++) {
        meses12M.push({
          anio: a,
          mes: m,
          label: `${MESES_LABEL[m - 1]} ${String(a).slice(-2)}`,
        });
        m++;
        if (m > 12) { m = 1; a++; }
      }
    }
    // Mapa "anio-mes" → índice 0..11 (acceso O(1) en el agrupado)
    const indiceMes = {};
    meses12M.forEach((mm, i) => { indiceMes[`${mm.anio}-${mm.mes}`] = i; });

    /**
     * Agrupa filas por una clave de entidad y construye series de 12 valores.
     * @param {Array} rows           filas crudas {anio, mes, cantidad, ...campos}
     * @param {Function} keyFn       (row) => string clave única de entidad
     * @param {Function} nombreFn    (row) => nombre legible
     * @param {number|null} topN     limita al top N por total (null = todos)
     * @returns {Array} [{nombre, total, serie: number[12]}]
     */
    const construirSeries12M = (rows, keyFn, nombreFn, topN) => {
      const map = new Map();
      rows.forEach(r => {
        const key = keyFn(r);
        if (!key) return;
        const idx = indiceMes[`${r.anio}-${r.mes}`];
        if (idx === undefined) return;

        let entry = map.get(key);
        if (!entry) {
          entry = { nombre: nombreFn(r), total: 0, serie: new Array(12).fill(0) };
          map.set(key, entry);
        }
        const cant = parseInt(r.cantidad || 0);
        entry.serie[idx] += cant;
        entry.total += cant;
      });
      const arr = Array.from(map.values())
        .filter(e => e.total > 0)
        .sort((a, b) => b.total - a.total);
      return topN ? arr.slice(0, topN) : arr;
    };

    const evolucion12Meses = {
      meses: meses12M,
      // Top 10 OS por cantidad total de los 12 meses
      obrasSociales: construirSeries12M(
        evolOSResult.recordset,
        (r) => r.osId,
        (r) => (r.osSigla?.trim() || r.osNombre?.trim() || 'S/D'),
        10
      ),
      // TODOS los prestadores (sin tope, el frontend ordena por total)
      prestadores: construirSeries12M(
        evolPrestadorResult.recordset,
        (r) => r.preId,
        (r) => (r.preNombre?.trim() || 'S/D'),
        null
      ),
      // Top 10 prácticas por cantidad total de los 12 meses
      practicas: construirSeries12M(
        evolPracticaResult.recordset,
        (r) => `${r.nomId}__${(r.nomCod || '').trim()}`,
        (r) => (r.nomNombre?.trim() || 'S/D'),
        10
      ),
    };

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
        acumActual: buildOSData(osAcumActual, honOsAcumActual, totalFacturadoOSAcumAct),       // ✅ NUEVO
        acumAnterior: buildOSData(osAcumAnterior, honOsAcumAnterior, totalFacturadoOSAcumAnt), // ✅ NUEVO
      },

      porPrestador: {
        mesActual: buildPrestadorData(preActual),
        mesAnterior: buildPrestadorData(preAnterior),
        acumActual: buildPrestadorData(preAcumActual),     // ✅ NUEVO
        acumAnterior: buildPrestadorData(preAcumAnterior),  // ✅ NUEVO
      },

      porPractica: {
        mesActual: buildPracticaData(pracActual, honPracActual, totalFactPrac),
        mesAnterior: buildPracticaData(pracAnterior, honPracAnterior, totalFactPracAnt),
        acumActual: buildPracticaData(pracAcumActual, honPracAcumActual, totalFactPracAcumAct),       // ✅ NUEVO
        acumAnterior: buildPracticaData(pracAcumAnterior, honPracAcumAnterior, totalFactPracAcumAnt), // ✅ NUEVO
      },

      // ✅ NUEVO: Evolución mensual últimos 12 meses (cantidades, sin importes)
      evolucion12Meses,
    };

    res.json(response);

  } catch (error) {
    console.error('❌ [INFORMES] Error generando informe de gestión:', error);
    res.status(500).json({
      error: 'Error al generar el informe de gestión',
      detalle: error.message,
    });
  }
  // ⚠️ NO cerrar pool - es el pool global compartido por todos los endpoints
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
