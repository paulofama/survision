// ============================================================
// SERVICIO: Extractor de la comparativa inteligente GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Porta el endpoint GET /api/movimientos/comparativa-inteligente a
// generarComparativa(), y lo guarda como snapshot SINGLETON en la tabla
// Supabase `dashboards_snapshot` (modulo='analisis', clave fija anio=0/mes=0).
//
// Es DINÁMICO: depende del día de hoy (acumulado mes en curso hasta hoy,
// proyección al cierre, promedio 3M parcial). Por eso el daemon lo refresca en
// cada corrida (2x/día) y NO se guarda por (mes,anio) sino como una sola foto.
// El payload lleva adentro el período real (periodo.mesActual, diaActual, etc.).
//
// La ruta /api/movimientos/comparativa-inteligente usa generarComparativa()
// -> una sola fuente de verdad (sin drift entre LAN y snapshot).
//
// Solo agregados monetarios (sin PII). RLS: app_tiene_permiso('analisis').
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

const QUERY_PERIODO = `
  SELECT
    COUNT(*) as practicas,
    ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
    ISNULL(SUM(Me_Cose), 0) as coseguro,
    ISNULL(SUM(Me_ValorPrac), 0) as cobertura
  FROM MovEnca
  WHERE Me_Area = 'A' AND YEAR(Me_Fecha) = @anio AND MONTH(Me_Fecha) = @mes AND DAY(Me_Fecha) <= @dia
`;
const QUERY_MES_COMPLETO = `
  SELECT
    COUNT(*) as practicas,
    ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
    ISNULL(SUM(Me_Cose), 0) as coseguro,
    ISNULL(SUM(Me_ValorPrac), 0) as cobertura
  FROM MovEnca
  WHERE Me_Area = 'A' AND YEAR(Me_Fecha) = @anio AND MONTH(Me_Fecha) = @mes
`;
const QUERY_PROMEDIO_3M = `
  SELECT
    COUNT(*) as practicas,
    ISNULL(SUM(Me_Cose), 0) + ISNULL(SUM(Me_ValorPrac), 0) as ingresos,
    ISNULL(SUM(Me_Cose), 0) as coseguro,
    ISNULL(SUM(Me_ValorPrac), 0) as cobertura
  FROM MovEnca
  WHERE Me_Area = 'A' AND (
    (YEAR(Me_Fecha) = @anio1 AND MONTH(Me_Fecha) = @mes1 AND DAY(Me_Fecha) <= @dia)
    OR (YEAR(Me_Fecha) = @anio2 AND MONTH(Me_Fecha) = @mes2 AND DAY(Me_Fecha) <= @dia)
    OR (YEAR(Me_Fecha) = @anio3 AND MONTH(Me_Fecha) = @mes3 AND DAY(Me_Fecha) <= @dia)
  )
`;

/** Calcula la comparativa inteligente (mismo payload que el endpoint). */
async function generarComparativa() {
  const hoy = new Date();
  const diaActual = hoy.getDate();
  const mesActual = hoy.getMonth() + 1;
  const anioActual = hoy.getFullYear();
  const diasEnMes = new Date(anioActual, mesActual, 0).getDate();

  const mesActualData = (await executeQuery(QUERY_PERIODO, { anio: anioActual, mes: mesActual, dia: diaActual })).recordset[0];

  const mesAnterior = mesActual === 1 ? 12 : mesActual - 1;
  const anioMesAnterior = mesActual === 1 ? anioActual - 1 : anioActual;
  const mesAnteriorPeriodoData = (await executeQuery(QUERY_PERIODO, { anio: anioMesAnterior, mes: mesAnterior, dia: diaActual })).recordset[0];
  const mesAnteriorCompletoData = (await executeQuery(QUERY_MES_COMPLETO, { anio: anioMesAnterior, mes: mesAnterior })).recordset[0];

  const meses3Anteriores = [];
  for (let i = 1; i <= 3; i++) {
    let m = mesActual - i;
    let a = anioActual;
    if (m <= 0) { m += 12; a -= 1; }
    meses3Anteriores.push({ mes: m, anio: a });
  }
  const promedio3MData = (await executeQuery(QUERY_PROMEDIO_3M, {
    anio1: meses3Anteriores[0].anio, mes1: meses3Anteriores[0].mes,
    anio2: meses3Anteriores[1].anio, mes2: meses3Anteriores[1].mes,
    anio3: meses3Anteriores[2].anio, mes3: meses3Anteriores[2].mes,
    dia: diaActual,
  })).recordset[0];
  const promedio3M = {
    practicas: Math.round(promedio3MData.practicas / 3),
    ingresos: promedio3MData.ingresos / 3,
    coseguro: promedio3MData.coseguro / 3,
    cobertura: promedio3MData.cobertura / 3,
  };

  const anioAnteriorData = (await executeQuery(QUERY_PERIODO, { anio: anioActual - 1, mes: mesActual, dia: diaActual })).recordset[0];

  const factorProyeccion = diasEnMes / diaActual;
  const proyeccionCierre = {
    practicas: Math.round(mesActualData.practicas * factorProyeccion),
    ingresos: mesActualData.ingresos * factorProyeccion,
    coseguro: mesActualData.coseguro * factorProyeccion,
    cobertura: mesActualData.cobertura * factorProyeccion,
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
    vsAnioAnteriorIngresos: calcVariacion(mesActualData.ingresos, anioAnteriorData.ingresos),
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

  return {
    success: true,
    generadoEn: new Date().toISOString(),
    periodo: {
      diaActual, diasEnMes,
      diasRestantes: diasEnMes - diaActual,
      porcentajeMesTranscurrido: ((diaActual / diasEnMes) * 100).toFixed(1),
      mesActual: { numero: mesActual, nombre: nombreMes, anio: anioActual },
      mesAnterior: { numero: mesAnterior, nombre: nombreMesAnterior, anio: anioMesAnterior },
    },
    actual: {
      practicas: mesActualData.practicas,
      ingresos: parseFloat(mesActualData.ingresos),
      coseguro: parseFloat(mesActualData.coseguro),
      cobertura: parseFloat(mesActualData.cobertura),
      promedioDiario: {
        practicas: Math.round(mesActualData.practicas / diaActual),
        ingresos: mesActualData.ingresos / diaActual,
      },
    },
    mesAnteriorMismoPeriodo: {
      practicas: mesAnteriorPeriodoData.practicas,
      ingresos: parseFloat(mesAnteriorPeriodoData.ingresos),
      coseguro: parseFloat(mesAnteriorPeriodoData.coseguro),
      cobertura: parseFloat(mesAnteriorPeriodoData.cobertura),
      variacionPracticas: parseFloat(variaciones.vsMesAnteriorPracticas.toFixed(1)),
      variacionIngresos: parseFloat(variaciones.vsMesAnteriorIngresos.toFixed(1)),
      diferenciaPracticas: mesActualData.practicas - mesAnteriorPeriodoData.practicas,
      diferenciaIngresos: parseFloat(mesActualData.ingresos) - parseFloat(mesAnteriorPeriodoData.ingresos),
    },
    mesAnteriorCompleto: {
      practicas: mesAnteriorCompletoData.practicas,
      ingresos: parseFloat(mesAnteriorCompletoData.ingresos),
      coseguro: parseFloat(mesAnteriorCompletoData.coseguro),
      cobertura: parseFloat(mesAnteriorCompletoData.cobertura),
    },
    proyeccion: {
      practicas: proyeccionCierre.practicas,
      ingresos: parseFloat(proyeccionCierre.ingresos.toFixed(2)),
      coseguro: parseFloat(proyeccionCierre.coseguro.toFixed(2)),
      cobertura: parseFloat(proyeccionCierre.cobertura.toFixed(2)),
      variacionVsMesAnterior: parseFloat(variaciones.proyeccionVsMesAnterior.toFixed(1)),
      variacionIngresosVsMesAnterior: parseFloat(variaciones.proyeccionIngresosVsMesAnterior.toFixed(1)),
      diferenciaPracticas: proyeccionCierre.practicas - mesAnteriorCompletoData.practicas,
      diferenciaIngresos: parseFloat((proyeccionCierre.ingresos - parseFloat(mesAnteriorCompletoData.ingresos)).toFixed(2)),
    },
    promedioTrimestral: {
      practicas: promedio3M.practicas,
      ingresos: parseFloat(promedio3M.ingresos.toFixed(2)),
      coseguro: parseFloat(promedio3M.coseguro.toFixed(2)),
      cobertura: parseFloat(promedio3M.cobertura.toFixed(2)),
      variacionPracticas: parseFloat(variaciones.vsPromedio3MPracticas.toFixed(1)),
      variacionIngresos: parseFloat(variaciones.vsPromedio3MIngresos.toFixed(1)),
      mesesIncluidos: meses3Anteriores.map((m) => ({
        mes: m.mes, anio: m.anio,
        nombre: new Date(m.anio, m.mes - 1, 1).toLocaleDateString('es-AR', { month: 'short' }),
      })),
    },
    interanual: {
      practicas: anioAnteriorData.practicas,
      ingresos: parseFloat(anioAnteriorData.ingresos),
      coseguro: parseFloat(anioAnteriorData.coseguro),
      cobertura: parseFloat(anioAnteriorData.cobertura),
      variacionPracticas: parseFloat(variaciones.vsAnioAnteriorPracticas.toFixed(1)),
      variacionIngresos: parseFloat(variaciones.vsAnioAnteriorIngresos.toFixed(1)),
      diferenciaPracticas: mesActualData.practicas - anioAnteriorData.practicas,
      diferenciaIngresos: parseFloat(mesActualData.ingresos) - parseFloat(anioAnteriorData.ingresos),
    },
    resumen: {
      tendenciaMensual: variaciones.vsMesAnteriorPracticas > 0 ? 'up' : variaciones.vsMesAnteriorPracticas < 0 ? 'down' : 'stable',
      tendenciaProyeccion: variaciones.proyeccionVsMesAnterior > 0 ? 'up' : variaciones.proyeccionVsMesAnterior < 0 ? 'down' : 'stable',
      tendenciaTrimestral: variaciones.vsPromedio3MPracticas > 0 ? 'up' : variaciones.vsPromedio3MPracticas < 0 ? 'down' : 'stable',
      tendenciaInteranual: variaciones.vsAnioAnteriorPracticas > 0 ? 'up' : variaciones.vsAnioAnteriorPracticas < 0 ? 'down' : 'stable',
      saludGeneral: calcularSalud(),
    },
    fuente: 'Supabase (sync GECLISA)',
    timestamp: new Date().toISOString(),
  };
}

/** Calcula la comparativa y la guarda como snapshot singleton (modulo='analisis', 0/0). */
async function sincronizarComparativa({ write = false } = {}) {
  const payload = await generarComparativa();
  if (!write) return { total: 1, escrito: false, resumen: payload };

  const resumen = {
    practicas: payload.actual.practicas,
    ingresos: payload.actual.ingresos,
    salud: payload.resumen.saludGeneral,
  };
  const { error } = await supabase
    .from('dashboards_snapshot')
    .upsert({ modulo: 'analisis', anio: 0, mes: 0, payload, resumen, synced_at: new Date().toISOString() }, { onConflict: 'modulo,anio,mes' });
  if (error) throw new Error('upsert comparativa: ' + error.message);

  return { total: 1, insertados: 1, escrito: true, resumen: payload };
}

module.exports = { generarComparativa, sincronizarComparativa };
