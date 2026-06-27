// ============================================================
// SERVICIO: Extractor del informe de gestión mensual GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Porta la lógica del endpoint GET /api/informes/gestion-mensual (19 queries +
// procesamiento) a generarInformeGestion(mes, anio), y la guarda como snapshot
// por (anio, mes) en la tabla Supabase `dashboards_snapshot` (modulo='informes').
// Así la página /informes (frontend remoto) lee el snapshot sin pegarle a GECLISA.
//
// El payload de un mes es estable una vez cerrado el mes; las comparativas
// "anterior"/"acumulado anterior"/"evolución 12M" son ventanas relativas pero se
// recalculan al regenerar cada snapshot. El daemon recalcula mes actual+anterior;
// el histórico (rango que ofrecen los selectores: 3 años) se carga una vez por CLI.
//
// La ruta /api/informes/gestion-mensual usa generarInformeGestion() -> una sola
// fuente de verdad (sin drift entre LAN y snapshot).
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// IDs de prestadores socios (igual que la ruta original; vacío por ahora).
const SOCIOS_IDS = [];

function getMesNombre(mes) {
  const n = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
  return n[mes] || '';
}

// ------------------------------------------------------------
// Genera el informe de gestión completo (mismo payload que el endpoint).
// ------------------------------------------------------------
async function generarInformeGestion(mesNum, anioNum) {
  // Rangos de fechas
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

  // QUERY 1: Resumen mensual (actual y anterior)
  const queryResumen = `
    SELECT 'ACTUAL' AS periodo, COUNT(DISTINCT me.Me_id) AS totalAtenciones, COUNT(mp.Mp_id) AS totalPracticas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado, COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
    FROM MovEnca me LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
    UNION ALL
    SELECT 'ANTERIOR' AS periodo, COUNT(DISTINCT me.Me_id) AS totalAtenciones, COUNT(mp.Mp_id) AS totalPracticas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado, COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
    FROM MovEnca me LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
  `;
  const resumenResult = await executeQuery(queryResumen, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual, fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 2: Honorarios mensual
  const queryHonorarios = `
    SELECT 'ACTUAL' AS periodo, ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual
    UNION ALL
    SELECT 'ANTERIOR' AS periodo, ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior
  `;
  const honorariosResult = await executeQuery(queryHonorarios, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual, fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 3: Acumulado anual
  const queryAcumulado = `
    SELECT 'ACUM_ACTUAL' AS periodo, COUNT(DISTINCT me.Me_id) AS totalAtenciones, COUNT(mp.Mp_id) AS totalPracticas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado, COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
    FROM MovEnca me LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
    UNION ALL
    SELECT 'ACUM_ANTERIOR' AS periodo, COUNT(DISTINCT me.Me_id) AS totalAtenciones, COUNT(mp.Mp_id) AS totalPracticas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado, COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos
    FROM MovEnca me LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
  `;
  const acumuladoResult = await executeQuery(queryAcumulado, { fechaIniAcumActual, fechaFinAcumActual, fechaIniAcumAnterior, fechaFinAcumAnterior });

  // QUERY 4: Honorarios acumulados
  const queryHonorariosAcum = `
    SELECT 'ACUM_ACTUAL' AS periodo, ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual
    UNION ALL
    SELECT 'ACUM_ANTERIOR' AS periodo, ISNULL(SUM(mpr.MPre_Tot), 0) AS totalHonorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior
  `;
  const honorariosAcumResult = await executeQuery(queryHonorariosAcum, { fechaIniAcumActual, fechaFinAcumActual, fechaIniAcumAnterior, fechaFinAcumAnterior });

  // QUERY 5: Por OS (mensual)
  const queryPorOS = `
    SELECT 'ACTUAL' AS periodo, os.os_id AS osId, os.os_nombre AS osNombre, os.os_sigla AS osSigla,
      COUNT(DISTINCT me.Me_id) AS atenciones, COUNT(mp.Mp_id) AS practicas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual GROUP BY os.os_id, os.os_nombre, os.os_sigla
    UNION ALL
    SELECT 'ANTERIOR' AS periodo, os.os_id AS osId, os.os_nombre AS osNombre, os.os_sigla AS osSigla,
      COUNT(DISTINCT me.Me_id) AS atenciones, COUNT(mp.Mp_id) AS practicas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior GROUP BY os.os_id, os.os_nombre, os.os_sigla
    ORDER BY facturado DESC
  `;
  const porOSResult = await executeQuery(queryPorOS, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual, fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 6: Honorarios por OS (mensual)
  const queryHonorariosPorOS = `
    SELECT 'ACTUAL' AS periodo, os.os_id AS osId, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual GROUP BY os.os_id
    UNION ALL
    SELECT 'ANTERIOR' AS periodo, os.os_id AS osId, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior GROUP BY os.os_id
  `;
  const honorariosPorOSResult = await executeQuery(queryHonorariosPorOS, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual, fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 7: Por Prestador (CTE reutilizable; facturado prorrateado por Me_id distinto)
  const queryPrestador = `
    ;WITH EncPre AS (
      SELECT DISTINCT mpr.Pre_id, me.Me_id, ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0) AS facturado
      FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE me.Me_Fecha BETWEEN @fechaIni AND @fechaFin
    )
    SELECT ep.Pre_id AS preId, pre.pre_nombre AS preNombre, COUNT(ep.Me_id) AS atenciones, ISNULL(SUM(ep.facturado), 0) AS honorarios
    FROM EncPre ep INNER JOIN Prestadores pre ON ep.Pre_id = pre.pre_id
    GROUP BY ep.Pre_id, pre.pre_nombre ORDER BY honorarios DESC
  `;
  const prestadorActualResult = await executeQuery(queryPrestador, { fechaIni: fechaIniMesActual, fechaFin: fechaFinMesActual });
  const prestadorAnteriorResult = await executeQuery(queryPrestador, { fechaIni: fechaIniMesAnterior, fechaFin: fechaFinMesAnterior });

  // QUERY 8: Top 20 prácticas (actual / anterior)
  const queryPorPractica = `
    SELECT TOP 20 'ACTUAL' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual GROUP BY n.nom_id, n.nom_cod, n.nom_nom ORDER BY facturado DESC
  `;
  const porPracticaActualResult = await executeQuery(queryPorPractica, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual });
  const queryPorPracticaAnt = `
    SELECT TOP 20 'ANTERIOR' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior GROUP BY n.nom_id, n.nom_cod, n.nom_nom ORDER BY facturado DESC
  `;
  const porPracticaAnteriorResult = await executeQuery(queryPorPracticaAnt, { fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 9: Honorarios por práctica (mensual)
  const queryHonorariosPorPractica = `
    SELECT 'ACTUAL' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniActual AND @fechaFinActual GROUP BY n.nom_id, n.nom_cod
    UNION ALL
    SELECT 'ANTERIOR' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniAnterior AND @fechaFinAnterior GROUP BY n.nom_id, n.nom_cod
  `;
  const honorariosPorPracticaResult = await executeQuery(queryHonorariosPorPractica, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual, fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 10: Por OS (acumulado)
  const queryPorOSAcum = `
    SELECT 'ACUM_ACTUAL' AS periodo, os.os_id AS osId, os.os_nombre AS osNombre, os.os_sigla AS osSigla,
      COUNT(DISTINCT me.Me_id) AS atenciones, COUNT(mp.Mp_id) AS practicas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual GROUP BY os.os_id, os.os_nombre, os.os_sigla
    UNION ALL
    SELECT 'ACUM_ANTERIOR' AS periodo, os.os_id AS osId, os.os_nombre AS osNombre, os.os_sigla AS osSigla,
      COUNT(DISTINCT me.Me_id) AS atenciones, COUNT(mp.Mp_id) AS practicas,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id LEFT JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior GROUP BY os.os_id, os.os_nombre, os.os_sigla
    ORDER BY facturado DESC
  `;
  const porOSAcumResult = await executeQuery(queryPorOSAcum, { fechaIniAcumActual, fechaFinAcumActual, fechaIniAcumAnterior, fechaFinAcumAnterior });

  // QUERY 11: Honorarios por OS (acumulado)
  const queryHonorariosPorOSAcum = `
    SELECT 'ACUM_ACTUAL' AS periodo, os.os_id AS osId, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual GROUP BY os.os_id
    UNION ALL
    SELECT 'ACUM_ANTERIOR' AS periodo, os.os_id AS osId, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior GROUP BY os.os_id
  `;
  const honorariosPorOSAcumResult = await executeQuery(queryHonorariosPorOSAcum, { fechaIniAcumActual, fechaFinAcumActual, fechaIniAcumAnterior, fechaFinAcumAnterior });

  // QUERY 12: Prestadores (acumulado) — reutiliza queryPrestador
  const prestadorAcumActualResult = await executeQuery(queryPrestador, { fechaIni: fechaIniAcumActual, fechaFin: fechaFinAcumActual });
  const prestadorAcumAnteriorResult = await executeQuery(queryPrestador, { fechaIni: fechaIniAcumAnterior, fechaFin: fechaFinAcumAnterior });

  // QUERY 13/14: Top 20 prácticas acumulado (actual / anterior)
  const queryPorPracticaAcumActual = `
    SELECT TOP 20 n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual GROUP BY n.nom_id, n.nom_cod, n.nom_nom ORDER BY facturado DESC
  `;
  const porPracticaAcumActualResult = await executeQuery(queryPorPracticaAcumActual, { fechaIniAcumActual, fechaFinAcumActual });
  const queryPorPracticaAcumAnterior = `
    SELECT TOP 20 n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior GROUP BY n.nom_id, n.nom_cod, n.nom_nom ORDER BY facturado DESC
  `;
  const porPracticaAcumAnteriorResult = await executeQuery(queryPorPracticaAcumAnterior, { fechaIniAcumAnterior, fechaFinAcumAnterior });

  // QUERY 15: Honorarios por práctica (acumulado)
  const queryHonorariosPorPracticaAcum = `
    SELECT 'ACUM_ACTUAL' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumActual AND @fechaFinAcumActual GROUP BY n.nom_id, n.nom_cod
    UNION ALL
    SELECT 'ACUM_ANTERIOR' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, ISNULL(SUM(mpr.MPre_Tot), 0) AS honorarios
    FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIniAcumAnterior AND @fechaFinAcumAnterior GROUP BY n.nom_id, n.nom_cod
  `;
  const honorariosPorPracticaAcumResult = await executeQuery(queryHonorariosPorPracticaAcum, { fechaIniAcumActual, fechaFinAcumActual, fechaIniAcumAnterior, fechaFinAcumAnterior });

  // QUERIES 16-18: Evolución 12 meses
  let mesIni12M = mesNum - 11;
  let anioIni12M = anioNum;
  while (mesIni12M < 1) { mesIni12M += 12; anioIni12M -= 1; }
  const fechaIni12M = `${anioIni12M}-${String(mesIni12M).padStart(2, '0')}-01`;
  const fechaFin12M = fechaFinMesActual;

  const queryEvolOS = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes, os.os_id AS osId, os.os_sigla AS osSigla, os.os_nombre AS osNombre, COUNT(DISTINCT me.Me_id) AS cantidad
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), os.os_id, os.os_sigla, os.os_nombre
  `;
  const evolOSResult = await executeQuery(queryEvolOS, { fechaIni12M, fechaFin12M });
  const queryEvolPrestador = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes, pre.pre_id AS preId, pre.pre_nombre AS preNombre, COUNT(DISTINCT me.Me_id) AS cantidad
    FROM MovPre mpr INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
    WHERE me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), pre.pre_id, pre.pre_nombre
  `;
  const evolPrestadorResult = await executeQuery(queryEvolPrestador, { fechaIni12M, fechaFin12M });
  const queryEvolPractica = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes, n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre, COUNT(mp.Mp_id) AS cantidad
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), n.nom_id, n.nom_cod, n.nom_nom
  `;
  const evolPracticaResult = await executeQuery(queryEvolPractica, { fechaIni12M, fechaFin12M });

  // QUERY 19: Cruce OS × prácticas (mes actual)
  const queryCruceOSPracticas = `
    SELECT n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre, os.os_id AS osId, os.os_sigla AS osSigla, os.os_nombre AS osNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE me.Me_Fecha BETWEEN @fechaIniMesActual AND @fechaFinMesActual GROUP BY n.nom_id, n.nom_cod, n.nom_nom, os.os_id, os.os_sigla, os.os_nombre
  `;
  const cruceOSPracticasResult = await executeQuery(queryCruceOSPracticas, { fechaIniMesActual, fechaFinMesActual });

  // ---------- PROCESAMIENTO ----------
  const findByPeriodo = (rows, periodo) => rows.find((r) => r.periodo === periodo) || {};

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
      totalAtenciones, totalPracticas, totalFacturado, totalHonorarios, margenBruto,
      margenBrutoPct: totalFacturado > 0 ? (margenBruto / totalFacturado) * 100 : 0,
      ticketPromedio: totalAtenciones > 0 ? totalFacturado / totalAtenciones : 0,
      pacientesUnicos: parseInt(res.pacientesUnicos || 0),
      practicasPorAtencion: totalAtenciones > 0 ? totalPracticas / totalAtenciones : 0,
    };
  };
  const calcVariacion = (actual, anterior) => {
    const r = {};
    for (const k of Object.keys(actual)) r[k] = actual[k] - anterior[k];
    return r;
  };
  const calcVariacionPct = (actual, anterior) => {
    const r = {};
    for (const k of Object.keys(actual)) r[k] = anterior[k] !== 0 ? ((actual[k] - anterior[k]) / Math.abs(anterior[k])) * 100 : (actual[k] > 0 ? 100 : 0);
    return r;
  };

  const metricasActual = buildMetricas(resActual, honActual);
  const metricasAnterior = buildMetricas(resAnterior, honAnterior);

  const acumActual = findByPeriodo(acumuladoResult.recordset, 'ACUM_ACTUAL');
  const acumAnterior = findByPeriodo(acumuladoResult.recordset, 'ACUM_ANTERIOR');
  const honAcumActual = findByPeriodo(honorariosAcumResult.recordset, 'ACUM_ACTUAL');
  const honAcumAnterior = findByPeriodo(honorariosAcumResult.recordset, 'ACUM_ANTERIOR');
  const metricasAcumActual = buildMetricas(acumActual, honAcumActual);
  const metricasAcumAnterior = buildMetricas(acumAnterior, honAcumAnterior);

  const osActual = porOSResult.recordset.filter((r) => r.periodo === 'ACTUAL');
  const osAnterior = porOSResult.recordset.filter((r) => r.periodo === 'ANTERIOR');
  const honOsActual = honorariosPorOSResult.recordset.filter((r) => r.periodo === 'ACTUAL');
  const honOsAnterior = honorariosPorOSResult.recordset.filter((r) => r.periodo === 'ANTERIOR');
  const totalFacturadoOS = osActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFacturadoOSAnt = osAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  const buildOSData = (osRows, honRows, totalFact) =>
    osRows.map((os) => {
      const facturado = parseFloat(os.facturado || 0);
      const hon = honRows.find((h) => h.osId === os.osId);
      const honorarios = parseFloat(hon?.honorarios || 0);
      const margen = facturado - honorarios;
      return {
        osId: os.osId, osNombre: os.osNombre?.trim() || '', osSigla: os.osSigla?.trim() || '',
        atenciones: parseInt(os.atenciones || 0), practicas: parseInt(os.practicas || 0),
        facturado, honorarios, margen, margenPct: facturado > 0 ? (margen / facturado) * 100 : 0,
        participacionPct: totalFact > 0 ? (facturado / totalFact) * 100 : 0,
      };
    }).sort((a, b) => b.facturado - a.facturado);

  const osAcumActual = porOSAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ACTUAL');
  const osAcumAnterior = porOSAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ANTERIOR');
  const honOsAcumActual = honorariosPorOSAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ACTUAL');
  const honOsAcumAnterior = honorariosPorOSAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ANTERIOR');
  const totalFacturadoOSAcumAct = osAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFacturadoOSAcumAnt = osAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  const buildPrestadorData = (rows) =>
    rows.map((pre) => ({
      preId: pre.preId, preNombre: pre.preNombre?.trim() || '', atenciones: parseInt(pre.atenciones || 0),
      practicas: parseInt(pre.practicas || 0), honorarios: parseFloat(pre.honorarios || 0),
      facturado: parseFloat(pre.honorarios || 0), facturadoAsociado: 0, productividad: 0,
      esSocio: SOCIOS_IDS.includes(pre.preId),
    })).sort((a, b) => b.honorarios - a.honorarios);

  const pracActual = porPracticaActualResult.recordset;
  const pracAnterior = porPracticaAnteriorResult.recordset;
  const honPracActual = honorariosPorPracticaResult.recordset.filter((r) => r.periodo === 'ACTUAL');
  const honPracAnterior = honorariosPorPracticaResult.recordset.filter((r) => r.periodo === 'ANTERIOR');
  const totalFactPrac = pracActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFactPracAnt = pracAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  const buildPracticaData = (pracRows, honRows, totalFact) =>
    pracRows.map((prac) => {
      const facturado = parseFloat(prac.facturado || 0);
      const cantidad = parseInt(prac.cantidad || 0);
      const hon = honRows.find((h) => h.nomId === prac.nomId && h.nomCod === prac.nomCod);
      const honorarios = parseFloat(hon?.honorarios || 0);
      const margen = facturado - honorarios;
      return {
        nomId: prac.nomId, nomCod: prac.nomCod?.trim() || '', nomNombre: prac.nomNombre?.trim() || '',
        cantidad, facturado, honorarios, margen, margenPct: facturado > 0 ? (margen / facturado) * 100 : 0,
        participacionPct: totalFact > 0 ? (facturado / totalFact) * 100 : 0,
        ticketPromedio: cantidad > 0 ? facturado / cantidad : 0,
      };
    });

  const pracAcumActual = porPracticaAcumActualResult.recordset;
  const pracAcumAnterior = porPracticaAcumAnteriorResult.recordset;
  const honPracAcumActual = honorariosPorPracticaAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ACTUAL');
  const honPracAcumAnterior = honorariosPorPracticaAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ANTERIOR');
  const totalFactPracAcumAct = pracAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFactPracAcumAnt = pracAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  // Evolución 12 meses
  const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const meses12M = [];
  {
    let m = mesIni12M; let a = anioIni12M;
    for (let i = 0; i < 12; i++) {
      meses12M.push({ anio: a, mes: m, label: `${MESES_LABEL[m - 1]} ${String(a).slice(-2)}` });
      m++; if (m > 12) { m = 1; a++; }
    }
  }
  const indiceMes = {};
  meses12M.forEach((mm, i) => { indiceMes[`${mm.anio}-${mm.mes}`] = i; });

  const construirSeries12M = (rows, keyFn, nombreFn, topN) => {
    const map = new Map();
    rows.forEach((r) => {
      const key = keyFn(r);
      if (!key) return;
      const idx = indiceMes[`${r.anio}-${r.mes}`];
      if (idx === undefined) return;
      let entry = map.get(key);
      if (!entry) { entry = { nombre: nombreFn(r), total: 0, serie: new Array(12).fill(0) }; map.set(key, entry); }
      const cant = parseInt(r.cantidad || 0);
      entry.serie[idx] += cant;
      entry.total += cant;
    });
    const arr = Array.from(map.values()).filter((e) => e.total > 0).sort((a, b) => b.total - a.total);
    return topN ? arr.slice(0, topN) : arr;
  };

  const evolucion12Meses = {
    meses: meses12M,
    obrasSociales: construirSeries12M(evolOSResult.recordset, (r) => r.osId, (r) => (r.osSigla?.trim() || r.osNombre?.trim() || 'S/D'), 10),
    prestadores: construirSeries12M(evolPrestadorResult.recordset, (r) => r.preId, (r) => (r.preNombre?.trim() || 'S/D'), null),
    practicas: construirSeries12M(evolPracticaResult.recordset, (r) => `${r.nomId}__${(r.nomCod || '').trim()}`, (r) => (r.nomNombre?.trim() || 'S/D'), 10),
  };

  // Cruce OS × prácticas
  const filasCruce = cruceOSPracticasResult.recordset;
  const osTotales = new Map();
  filasCruce.forEach((r) => {
    const osId = r.osId;
    if (osId === null || osId === undefined) return;
    let entry = osTotales.get(osId);
    if (!entry) { entry = { osId, osSigla: (r.osSigla || '').trim(), osNombre: (r.osNombre || '').trim(), totalFacturado: 0 }; osTotales.set(osId, entry); }
    entry.totalFacturado += parseFloat(r.facturado || 0);
  });
  const rankingOS = Array.from(osTotales.values()).sort((a, b) => b.totalFacturado - a.totalFacturado);
  const top10OS = rankingOS.slice(0, 10);
  const top10Set = new Set(top10OS.map((o) => o.osId));

  const practicasMap = new Map();
  filasCruce.forEach((r) => {
    const key = `${r.nomId}__${(r.nomCod || '').trim()}`;
    let prac = practicasMap.get(key);
    if (!prac) { prac = { nomId: r.nomId, nomCod: (r.nomCod || '').trim(), nomNombre: (r.nomNombre || '').trim(), totalCantidad: 0, totalFacturado: 0, celdas: {} }; practicasMap.set(key, prac); }
    const cant = parseInt(r.cantidad || 0);
    const fact = parseFloat(r.facturado || 0);
    prac.totalCantidad += cant;
    prac.totalFacturado += fact;
    const colKey = (r.osId !== null && r.osId !== undefined && top10Set.has(r.osId)) ? String(r.osId) : 'OTRAS';
    let celda = prac.celdas[colKey];
    if (!celda) { celda = { cantidad: 0, facturado: 0 }; prac.celdas[colKey] = celda; }
    celda.cantidad += cant;
    celda.facturado += fact;
  });

  const cruceOSxPracticas = {
    columnasOS: top10OS.map((o) => ({ osId: o.osId, sigla: o.osSigla || o.osNombre.substring(0, 10) || 'S/D', nombre: o.osNombre })),
    filasPracticas: Array.from(practicasMap.values()).filter((p) => p.totalCantidad > 0).sort((a, b) => b.totalFacturado - a.totalFacturado),
  };

  return {
    generadoEn: new Date().toISOString(),
    periodo: { mes: mesNum, anio: anioNum, label: `${getMesNombre(mesNum)} ${anioNum}`, periodoGeclisa: `${anioNum}${String(mesNum).padStart(2, '0')}` },
    resumenMensual: { actual: metricasActual, anterior: metricasAnterior, variacion: calcVariacion(metricasActual, metricasAnterior), variacionPct: calcVariacionPct(metricasActual, metricasAnterior) },
    resumenAcumulado: { actual: metricasAcumActual, anterior: metricasAcumAnterior, variacion: calcVariacion(metricasAcumActual, metricasAcumAnterior), variacionPct: calcVariacionPct(metricasAcumActual, metricasAcumAnterior) },
    porObraSocial: {
      mesActual: buildOSData(osActual, honOsActual, totalFacturadoOS),
      mesAnterior: buildOSData(osAnterior, honOsAnterior, totalFacturadoOSAnt),
      acumActual: buildOSData(osAcumActual, honOsAcumActual, totalFacturadoOSAcumAct),
      acumAnterior: buildOSData(osAcumAnterior, honOsAcumAnterior, totalFacturadoOSAcumAnt),
    },
    porPrestador: {
      mesActual: buildPrestadorData(prestadorActualResult.recordset),
      mesAnterior: buildPrestadorData(prestadorAnteriorResult.recordset),
      acumActual: buildPrestadorData(prestadorAcumActualResult.recordset),
      acumAnterior: buildPrestadorData(prestadorAcumAnteriorResult.recordset),
    },
    porPractica: {
      mesActual: buildPracticaData(pracActual, honPracActual, totalFactPrac),
      mesAnterior: buildPracticaData(pracAnterior, honPracAnterior, totalFactPracAnt),
      acumActual: buildPracticaData(pracAcumActual, honPracAcumActual, totalFactPracAcumAct),
      acumAnterior: buildPracticaData(pracAcumAnterior, honPracAcumAnterior, totalFactPracAcumAnt),
    },
    evolucion12Meses,
    cruceOSxPracticas,
  };
}

// ------------------------------------------------------------
// Sincroniza snapshots a Supabase (dashboards_snapshot, modulo='informes').
//   soloRecientes=true  -> mes actual + anterior (para el daemon)
//   soloRecientes=false -> rango que ofrecen los selectores: desde enero de
//                          (año actual - 2) hasta el mes actual (carga histórica)
// ------------------------------------------------------------
async function sincronizarInformes({ write = false, soloRecientes = true } = {}) {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  let objetivos;
  if (soloRecientes) {
    const mesAnt = mesActual === 1 ? 12 : mesActual - 1;
    const anioAnt = mesActual === 1 ? anioActual - 1 : anioActual;
    objetivos = [{ anio: anioActual, mes: mesActual }, { anio: anioAnt, mes: mesAnt }];
  } else {
    objetivos = [];
    for (let a = anioActual - 2; a <= anioActual; a++) {
      const mesHasta = a === anioActual ? mesActual : 12;
      for (let m = 1; m <= mesHasta; m++) objetivos.push({ anio: a, mes: m });
    }
  }

  if (!write) return { total: objetivos.length, escrito: false };

  let insertados = 0;
  for (const { anio, mes } of objetivos) {
    const payload = await generarInformeGestion(mes, anio);
    const resumen = {
      atenciones: payload.resumenMensual.actual.totalAtenciones,
      facturado: payload.resumenMensual.actual.totalFacturado,
    };
    const { error } = await supabase
      .from('dashboards_snapshot')
      .upsert({ modulo: 'informes', anio, mes, payload, resumen, synced_at: new Date().toISOString() }, { onConflict: 'modulo,anio,mes' });
    if (error) throw new Error(`upsert ${anio}-${mes}: ${error.message}`);
    insertados++;
  }
  return { total: objetivos.length, insertados, escrito: true };
}

module.exports = { generarInformeGestion, sincronizarInformes };
