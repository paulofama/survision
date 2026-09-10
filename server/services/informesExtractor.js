// ============================================================
// SERVICIO: Extractor del informe de gestión mensual GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
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
//
// ============================================================
// QUÉ INFORMA ESTE INFORME (y qué NO) — revisión del 10/09/2026
// ============================================================
// Es un informe de VOLUMEN Y FACTURACIÓN: atenciones, pacientes, prácticas,
// obras sociales, prestadores. La RENTABILIDAD no es asunto suyo y ya no la
// calcula: la responde el Análisis Marginal, que es el único módulo con modelo
// de costos.
//
// Traía honorarios y margen bruto de SUM(MovPre.MPre_Tot), que en esta base está
// en CERO — el instituto no carga los honorarios en GECLISA, los calcula por
// fórmula sobre honorarios_config. El informe reportaba entonces honorarios $0 y
// "margen bruto 100,0%" para meses en los que el Análisis Marginal calculaba
// $40,3 M de honorarios (40,0% de la facturación) y un margen de contribución
// del 54,2%. Dos informes del mismo mes, uno diciendo que el margen era el doble
// del otro. Se quitaron las seis consultas de honorarios y los campos derivados.
//
// LA PLATA SE SUMA A GRANO ATENCIÓN
// ---------------------------------
// El importe vive en MovEnca (Me_Cose + Me_ValorPrac). Sumarlo sobre un JOIN a
// MovPrac lo repite una vez por práctica: eso hacían el resumen, el acumulado y
// el desglose por OS. Hoy hay 43 atenciones con más de una práctica desde 2024
// (ninguna en 2026), así que el desvío existe y es histórico. Los conteos de
// prácticas sí necesitan el join; los importes no, así que van separados.
//
// El desglose por prestador PRORRATEA, como `movimientosAgg.porPrestador`: una
// atención con dos prestadores aporta la mitad a cada uno. Sin eso la columna
// sumaba $133,0 M contra $100,7 M facturados en julio (1,32x), porque el importe
// completo se contaba para cada prestador que participó.
//
// Me_Area = 'A' en todas las consultas: es el universo del espejo
// `movimientos_geclisa`, y por lo tanto el del Análisis Marginal. Medido sobre
// 2024-2026, hoy NO cambia ningún número (todo MovEnca del rango es 'A'); está
// puesto para que las dos definiciones no puedan separarse en el futuro.
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// Universo de atenciones: el mismo que espeja movimientosExtractor.js.
const AREA = `me.Me_Area = 'A'`;

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

  // ------------------------------------------------------------
  // Resumen de un rango: importes a grano ATENCIÓN, prácticas por separado.
  // El SELECT de prácticas es un escalar sobre MovPrac para no arrastrar el
  // JOIN a la suma de dinero (ver el encabezado del archivo).
  // ------------------------------------------------------------
  const sqlResumen = (etiqueta, pIni, pFin) => `
    SELECT '${etiqueta}' AS periodo,
      COUNT(*) AS totalAtenciones,
      ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS totalFacturado,
      COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos,
      ISNULL((
        SELECT COUNT(*) FROM MovPrac mp2
        INNER JOIN MovEnca me2 ON mp2.Me_id = me2.Me_id
        WHERE me2.Me_Area = 'A' AND me2.Me_Fecha BETWEEN ${pIni} AND ${pFin}
      ), 0) AS totalPracticas
    FROM MovEnca me
    WHERE ${AREA} AND me.Me_Fecha BETWEEN ${pIni} AND ${pFin}
  `;

  // QUERY 1: Resumen mensual (actual y anterior)
  const queryResumen = `
    ${sqlResumen('ACTUAL', '@fechaIniActual', '@fechaFinActual')}
    UNION ALL
    ${sqlResumen('ANTERIOR', '@fechaIniAnterior', '@fechaFinAnterior')}
  `;
  const resumenResult = await executeQuery(queryResumen, { fechaIniActual: fechaIniMesActual, fechaFinActual: fechaFinMesActual, fechaIniAnterior: fechaIniMesAnterior, fechaFinAnterior: fechaFinMesAnterior });

  // QUERY 2: Acumulado anual
  const queryAcumulado = `
    ${sqlResumen('ACUM_ACTUAL', '@fechaIniAcumActual', '@fechaFinAcumActual')}
    UNION ALL
    ${sqlResumen('ACUM_ANTERIOR', '@fechaIniAcumAnterior', '@fechaFinAcumAnterior')}
  `;
  const acumuladoResult = await executeQuery(queryAcumulado, { fechaIniAcumActual, fechaFinAcumActual, fechaIniAcumAnterior, fechaFinAcumAnterior });

  // ------------------------------------------------------------
  // Por Obra Social. La CTE acota el universo a las atenciones del rango, y el
  // importe se suma sobre ELLA (una fila por atención). La cantidad de prácticas
  // se cuenta aparte, contra MovPrac, que es donde vive el grano de práctica.
  // ------------------------------------------------------------
  const sqlPorOS = (etiqueta) => `
    ;WITH Enc AS (
      SELECT me.Me_id, me.Os_id, ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0) AS facturado
      FROM MovEnca me
      WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIni AND @fechaFin
    )
    SELECT '${etiqueta}' AS periodo, os.os_id AS osId, os.os_nombre AS osNombre, os.os_sigla AS osSigla,
      COUNT(*) AS atenciones,
      (SELECT COUNT(*) FROM MovPrac mp INNER JOIN Enc e2 ON e2.Me_id = mp.Me_id WHERE e2.Os_id = os.os_id) AS practicas,
      ISNULL(SUM(e.facturado), 0) AS facturado
    FROM Enc e INNER JOIN ObrasSociales os ON e.Os_id = os.os_id
    GROUP BY os.os_id, os.os_nombre, os.os_sigla
    ORDER BY facturado DESC
  `;
  const porOSResult = {
    recordset: [
      ...(await executeQuery(sqlPorOS('ACTUAL'), { fechaIni: fechaIniMesActual, fechaFin: fechaFinMesActual })).recordset,
      ...(await executeQuery(sqlPorOS('ANTERIOR'), { fechaIni: fechaIniMesAnterior, fechaFin: fechaFinMesAnterior })).recordset,
    ],
  };

  // ------------------------------------------------------------
  // Por Prestador — PRORRATEADO, igual que `movimientosAgg.porPrestador`.
  //
  // Una atención con dos cirujanos aporta la MITAD a cada uno. La versión
  // anterior le daba el importe completo a los dos: la columna sumaba 1,32x la
  // facturación del mes y ningún porcentaje cerraba contra el total.
  //
  // `atenciones` sigue contando participaciones (si dos prestadores intervienen
  // en una atención, cuenta para los dos), que es lo que corresponde a un
  // desglose por prestador y lo mismo que muestra Análisis -> Por Prestador.
  // Por eso esa columna sí puede sumar más que el total de atenciones del mes.
  // ------------------------------------------------------------
  const queryPrestador = `
    ;WITH EncPre AS (
      SELECT DISTINCT mpr.Pre_id, me.Me_id, ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0) AS facturado
      FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIni AND @fechaFin
    ),
    CantPre AS (
      SELECT Me_id, COUNT(*) AS prestadores FROM EncPre GROUP BY Me_id
    )
    SELECT ep.Pre_id AS preId, pre.pre_nombre AS preNombre,
      COUNT(ep.Me_id) AS atenciones,
      ISNULL(SUM(ep.facturado * 1.0 / c.prestadores), 0) AS facturado
    FROM EncPre ep
      INNER JOIN CantPre c ON c.Me_id = ep.Me_id
      INNER JOIN Prestadores pre ON ep.Pre_id = pre.pre_id
    GROUP BY ep.Pre_id, pre.pre_nombre ORDER BY facturado DESC
  `;
  const prestadorActualResult = await executeQuery(queryPrestador, { fechaIni: fechaIniMesActual, fechaFin: fechaFinMesActual });
  const prestadorAnteriorResult = await executeQuery(queryPrestador, { fechaIni: fechaIniMesAnterior, fechaFin: fechaFinMesAnterior });

  // ------------------------------------------------------------
  // Top 20 prácticas. Acá el grano ES la práctica, así que el importe de la
  // atención se atribuye a cada práctica que contiene — igual que
  // `movimientosAgg.porPrestacion`, que es la vista con la que tiene que
  // coincidir. Por eso este ranking puede sumar más que la facturación del mes.
  // ------------------------------------------------------------
  const sqlPorPractica = (etiqueta) => `
    SELECT TOP 20 '${etiqueta}' AS periodo, n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIni AND @fechaFin
    GROUP BY n.nom_id, n.nom_cod, n.nom_nom ORDER BY facturado DESC
  `;
  const porPracticaActualResult = await executeQuery(sqlPorPractica('ACTUAL'), { fechaIni: fechaIniMesActual, fechaFin: fechaFinMesActual });
  const porPracticaAnteriorResult = await executeQuery(sqlPorPractica('ANTERIOR'), { fechaIni: fechaIniMesAnterior, fechaFin: fechaFinMesAnterior });

  // Por OS (acumulado) — mismo criterio que el mensual.
  const porOSAcumResult = {
    recordset: [
      ...(await executeQuery(sqlPorOS('ACUM_ACTUAL'), { fechaIni: fechaIniAcumActual, fechaFin: fechaFinAcumActual })).recordset,
      ...(await executeQuery(sqlPorOS('ACUM_ANTERIOR'), { fechaIni: fechaIniAcumAnterior, fechaFin: fechaFinAcumAnterior })).recordset,
    ],
  };

  // Prestadores (acumulado) — reutiliza queryPrestador
  const prestadorAcumActualResult = await executeQuery(queryPrestador, { fechaIni: fechaIniAcumActual, fechaFin: fechaFinAcumActual });
  const prestadorAcumAnteriorResult = await executeQuery(queryPrestador, { fechaIni: fechaIniAcumAnterior, fechaFin: fechaFinAcumAnterior });

  // Top 20 prácticas acumulado (actual / anterior)
  const porPracticaAcumActualResult = await executeQuery(sqlPorPractica('ACUM_ACTUAL'), { fechaIni: fechaIniAcumActual, fechaFin: fechaFinAcumActual });
  const porPracticaAcumAnteriorResult = await executeQuery(sqlPorPractica('ACUM_ANTERIOR'), { fechaIni: fechaIniAcumAnterior, fechaFin: fechaFinAcumAnterior });

  // Evolución 12 meses
  let mesIni12M = mesNum - 11;
  let anioIni12M = anioNum;
  while (mesIni12M < 1) { mesIni12M += 12; anioIni12M -= 1; }
  const fechaIni12M = `${anioIni12M}-${String(mesIni12M).padStart(2, '0')}-01`;
  const fechaFin12M = fechaFinMesActual;

  const queryEvolOS = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes, os.os_id AS osId, os.os_sigla AS osSigla, os.os_nombre AS osNombre, COUNT(DISTINCT me.Me_id) AS cantidad
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), os.os_id, os.os_sigla, os.os_nombre
  `;
  const evolOSResult = await executeQuery(queryEvolOS, { fechaIni12M, fechaFin12M });
  const queryEvolPrestador = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes, pre.pre_id AS preId, pre.pre_nombre AS preNombre, COUNT(DISTINCT me.Me_id) AS cantidad
    FROM MovPre mpr INNER JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
    WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), pre.pre_id, pre.pre_nombre
  `;
  const evolPrestadorResult = await executeQuery(queryEvolPrestador, { fechaIni12M, fechaFin12M });
  const queryEvolPractica = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes, n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre, COUNT(mp.Mp_id) AS cantidad
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIni12M AND @fechaFin12M GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha), n.nom_id, n.nom_cod, n.nom_nom
  `;
  const evolPracticaResult = await executeQuery(queryEvolPractica, { fechaIni12M, fechaFin12M });

  // Cruce OS x prácticas (mes actual)
  const queryCruceOSPracticas = `
    SELECT n.nom_id AS nomId, n.nom_cod AS nomCod, n.nom_nom AS nomNombre, os.os_id AS osId, os.os_sigla AS osSigla, os.os_nombre AS osNombre,
      COUNT(mp.Mp_id) AS cantidad, ISNULL(SUM(ISNULL(me.Me_Cose, 0) + ISNULL(me.Me_ValorPrac, 0)), 0) AS facturado
    FROM MovPrac mp INNER JOIN MovEnca me ON mp.Me_id = me.Me_id INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
    WHERE ${AREA} AND me.Me_Fecha BETWEEN @fechaIniMesActual AND @fechaFinMesActual GROUP BY n.nom_id, n.nom_cod, n.nom_nom, os.os_id, os.os_sigla, os.os_nombre
  `;
  const cruceOSPracticasResult = await executeQuery(queryCruceOSPracticas, { fechaIniMesActual, fechaFinMesActual });

  // ---------- PROCESAMIENTO ----------
  const findByPeriodo = (rows, periodo) => rows.find((r) => r.periodo === periodo) || {};

  const resActual = findByPeriodo(resumenResult.recordset, 'ACTUAL');
  const resAnterior = findByPeriodo(resumenResult.recordset, 'ANTERIOR');

  const buildMetricas = (res) => {
    const totalFacturado = parseFloat(res.totalFacturado || 0);
    const totalAtenciones = parseInt(res.totalAtenciones || 0);
    const totalPracticas = parseInt(res.totalPracticas || 0);
    return {
      totalAtenciones, totalPracticas, totalFacturado,
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

  const metricasActual = buildMetricas(resActual);
  const metricasAnterior = buildMetricas(resAnterior);

  const acumActual = findByPeriodo(acumuladoResult.recordset, 'ACUM_ACTUAL');
  const acumAnterior = findByPeriodo(acumuladoResult.recordset, 'ACUM_ANTERIOR');
  const metricasAcumActual = buildMetricas(acumActual);
  const metricasAcumAnterior = buildMetricas(acumAnterior);

  const osActual = porOSResult.recordset.filter((r) => r.periodo === 'ACTUAL');
  const osAnterior = porOSResult.recordset.filter((r) => r.periodo === 'ANTERIOR');
  const totalFacturadoOS = osActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFacturadoOSAnt = osAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  const buildOSData = (osRows, totalFact) =>
    osRows.map((os) => {
      const facturado = parseFloat(os.facturado || 0);
      return {
        osId: os.osId, osNombre: os.osNombre?.trim() || '', osSigla: os.osSigla?.trim() || '',
        atenciones: parseInt(os.atenciones || 0), practicas: parseInt(os.practicas || 0),
        facturado,
        participacionPct: totalFact > 0 ? (facturado / totalFact) * 100 : 0,
      };
    }).sort((a, b) => b.facturado - a.facturado);

  const osAcumActual = porOSAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ACTUAL');
  const osAcumAnterior = porOSAcumResult.recordset.filter((r) => r.periodo === 'ACUM_ANTERIOR');
  const totalFacturadoOSAcumAct = osAcumActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFacturadoOSAcumAnt = osAcumAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  const buildPrestadorData = (rows) =>
    rows.map((pre) => ({
      preId: pre.preId, preNombre: pre.preNombre?.trim() || '',
      atenciones: parseInt(pre.atenciones || 0),
      practicas: parseInt(pre.practicas || 0),
      facturado: parseFloat(pre.facturado || 0),
    })).sort((a, b) => b.facturado - a.facturado);

  const pracActual = porPracticaActualResult.recordset;
  const pracAnterior = porPracticaAnteriorResult.recordset;
  const totalFactPrac = pracActual.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);
  const totalFactPracAnt = pracAnterior.reduce((s, r) => s + parseFloat(r.facturado || 0), 0);

  const buildPracticaData = (pracRows, totalFact) =>
    pracRows.map((prac) => {
      const facturado = parseFloat(prac.facturado || 0);
      const cantidad = parseInt(prac.cantidad || 0);
      return {
        nomId: prac.nomId, nomCod: prac.nomCod?.trim() || '', nomNombre: prac.nomNombre?.trim() || '',
        cantidad, facturado,
        participacionPct: totalFact > 0 ? (facturado / totalFact) * 100 : 0,
        ticketPromedio: cantidad > 0 ? facturado / cantidad : 0,
      };
    });

  const pracAcumActual = porPracticaAcumActualResult.recordset;
  const pracAcumAnterior = porPracticaAcumAnteriorResult.recordset;
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
      mesActual: buildOSData(osActual, totalFacturadoOS),
      mesAnterior: buildOSData(osAnterior, totalFacturadoOSAnt),
      acumActual: buildOSData(osAcumActual, totalFacturadoOSAcumAct),
      acumAnterior: buildOSData(osAcumAnterior, totalFacturadoOSAcumAnt),
    },
    porPrestador: {
      mesActual: buildPrestadorData(prestadorActualResult.recordset),
      mesAnterior: buildPrestadorData(prestadorAnteriorResult.recordset),
      acumActual: buildPrestadorData(prestadorAcumActualResult.recordset),
      acumAnterior: buildPrestadorData(prestadorAcumAnteriorResult.recordset),
    },
    porPractica: {
      mesActual: buildPracticaData(pracActual, totalFactPrac),
      mesAnterior: buildPracticaData(pracAnterior, totalFactPracAnt),
      acumActual: buildPracticaData(pracAcumActual, totalFactPracAcumAct),
      acumAnterior: buildPracticaData(pracAcumAnterior, totalFactPracAcumAnt),
    },
    evolucion12Meses,
    cruceOSxPracticas,
  };
}

// ------------------------------------------------------------
// Sincroniza snapshots a Supabase (dashboards_snapshot, modulo='informes').
//   anioEnCurso=true    -> todos los meses del año en curso (daemon): cubre
//                          ediciones tardías de meses ya cerrados.
//   soloRecientes=true  -> mes actual + anterior
//   soloRecientes=false -> rango que ofrecen los selectores: desde enero de
//                          (año actual - 2) hasta el mes actual (carga histórica)
// ------------------------------------------------------------
async function sincronizarInformes({ write = false, soloRecientes = true, anioEnCurso = false } = {}) {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  let objetivos;
  if (anioEnCurso) {
    objetivos = [];
    for (let m = 1; m <= mesActual; m++) objetivos.push({ anio: anioActual, mes: m });
  } else if (soloRecientes) {
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
