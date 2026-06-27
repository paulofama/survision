// ============================================================
// SERVICIO: Extractor del seguimiento mensual de pacientes GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Porta la lógica del endpoint GET /api/seguimiento-pacientes/informe-mensual
// (10 queries + procesamiento) a generarInformeMensual(mes, anio), y la guarda
// como snapshot por (anio, mes) en la tabla Supabase `dashboards_snapshot`
// (modulo='seguimiento'). Así el dashboard (frontend remoto) lee el snapshot sin
// pegarle a GECLISA en vivo.
//
// El payload de un mes es ESTABLE una vez cerrado el mes (las queries filtran por
// YEAR/MONTH, no por GETDATE salvo el cálculo de edad). El daemon recalcula solo
// el mes actual + el anterior (lo que todavía puede cambiar); la carga histórica
// (todos los meses) se hace una vez con el CLI.
//
// La ruta /api/seguimiento-pacientes usa generarInformeMensual()/mesesConDatos()
// -> una sola fuente de verdad (sin drift entre LAN y snapshot).
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

const UMBRAL_HIPERFRECUENTADOR = 3;
const UMBRAL_RECONSULTA_DIAS = 7;
const UMBRAL_CONTROLES_OK = 2;

function getMesNombre(mes) {
  const n = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre' };
  return n[mes] || '';
}
function getMesNombreCorto(mes) {
  const n = { 1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' };
  return n[mes] || '';
}

// ------------------------------------------------------------
// Genera el informe mensual completo (mismo payload que el endpoint).
// ------------------------------------------------------------
async function generarInformeMensual(mesNum, anioNum) {
  const mesAnt = mesNum === 1 ? 12 : mesNum - 1;
  const anioAnt = mesNum === 1 ? anioNum - 1 : anioNum;

  // QUERY 1: KPIs mes actual y anterior
  const queryKPIs = `
    SELECT 'ACTUAL' AS periodo,
      COUNT(DISTINCT me.Me_id) AS totalAtenciones,
      COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN 1 ELSE 0 END) AS totalCirugias,
      COUNT(DISTINCT CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN me.Ficha_id END) AS pacientesQuirurgicos,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '01' THEN 1 ELSE 0 END) AS totalConsultas,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '02' THEN 1 ELSE 0 END) AS totalEstudios
    FROM MovEnca me INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE YEAR(me.Me_Fecha) = @anioActual AND MONTH(me.Me_Fecha) = @mesActual
    UNION ALL
    SELECT 'ANTERIOR' AS periodo,
      COUNT(DISTINCT me.Me_id) AS totalAtenciones,
      COUNT(DISTINCT me.Ficha_id) AS pacientesUnicos,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN 1 ELSE 0 END) AS totalCirugias,
      COUNT(DISTINCT CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN me.Ficha_id END) AS pacientesQuirurgicos,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '01' THEN 1 ELSE 0 END) AS totalConsultas,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '02' THEN 1 ELSE 0 END) AS totalEstudios
    FROM MovEnca me INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE YEAR(me.Me_Fecha) = @anioAnterior AND MONTH(me.Me_Fecha) = @mesAnterior
  `;
  const kpisResult = await executeQuery(queryKPIs, { anioActual: anioNum, mesActual: mesNum, anioAnterior: anioAnt, mesAnterior: mesAnt });

  // QUERY 2: Postquirúrgicos sin control
  const queryPostQxSinControl = `
    SELECT f.Ficha_id AS fichaId, f.fic_ape + ', ' + f.fic_nombre AS paciente,
      DATEDIFF(YEAR, f.fic_fechanac, GETDATE()) AS edad, f.fic_sexo AS sexo,
      os.os_nombre AS obraSocial, me_cir.Me_Fecha AS fechaCirugia,
      n_cir.nom_nom AS cirugia, n_cir.nom_cod AS codigoCirugia, pre.pre_nombre AS prestadorCirugia,
      (SELECT COUNT(*) FROM MovEnca me2 WHERE me2.Ficha_id = f.Ficha_id AND me2.Me_Fecha > me_cir.Me_Fecha
        AND YEAR(me2.Me_Fecha) = @anio AND MONTH(me2.Me_Fecha) = @mes) AS controlesPost
    FROM MovEnca me_cir
    INNER JOIN MovPrac mp_cir ON me_cir.Me_id = mp_cir.Me_id
    INNER JOIN Nomenclador n_cir ON mp_cir.nom_id = n_cir.nom_id AND mp_cir.nom_cod = n_cir.nom_cod
    INNER JOIN Ficha f ON me_cir.Ficha_id = f.Ficha_id
    LEFT JOIN ObrasSociales os ON me_cir.Os_id = os.os_id
    LEFT JOIN MovPre mpr ON mp_cir.Mp_id = mpr.Mp_id
    LEFT JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
    WHERE YEAR(me_cir.Me_Fecha) = @anio AND MONTH(me_cir.Me_Fecha) = @mes AND LEFT(mp_cir.nom_cod, 2) = '03'
    ORDER BY me_cir.Me_Fecha
  `;
  const postQxResult = await executeQuery(queryPostQxSinControl, { anio: anioNum, mes: mesNum });

  // QUERY 3: Frecuencia de visitas (hiperfrecuentadores)
  const queryFrecuencia = `
    SELECT f.Ficha_id AS fichaId, f.fic_ape + ', ' + f.fic_nombre AS paciente,
      DATEDIFF(YEAR, f.fic_fechanac, GETDATE()) AS edad, f.fic_sexo AS sexo,
      sub.visitas, sub.practicasTotal, sub.tieneCirugia, sub.tieneEstudio, sub.tieneIntravitrea
    FROM (
      SELECT me.Ficha_id, COUNT(DISTINCT me.Me_id) AS visitas, COUNT(mp.Mp_id) AS practicasTotal,
        MAX(CASE WHEN LEFT(mp.nom_cod, 2) = '03' AND mp.nom_cod NOT IN ('030601','030602','030609') THEN 1 ELSE 0 END) AS tieneCirugia,
        MAX(CASE WHEN LEFT(mp.nom_cod, 2) = '02' THEN 1 ELSE 0 END) AS tieneEstudio,
        MAX(CASE WHEN mp.nom_cod IN ('030601','030602','030609') THEN 1 ELSE 0 END) AS tieneIntravitrea
      FROM MovEnca me INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes
      GROUP BY me.Ficha_id
      HAVING COUNT(DISTINCT me.Me_id) >= @umbral
    ) sub
    INNER JOIN Ficha f ON sub.Ficha_id = f.Ficha_id
    ORDER BY sub.visitas DESC, sub.practicasTotal DESC
  `;
  const frecuenciaResult = await executeQuery(queryFrecuencia, { anio: anioNum, mes: mesNum, umbral: UMBRAL_HIPERFRECUENTADOR });

  // QUERY 4: OS y prestadores de hiperfrecuentadores
  const queryHiperDetalle = `
    SELECT me.Ficha_id AS fichaId, os.os_nombre AS obraSocial, pre.pre_nombre AS prestador,
      n.nom_nom AS practica, n.nom_cod AS codigoPractica, me.Me_Fecha AS fecha, s.Serv_Nombre AS servicio
    FROM MovEnca me
    INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
    INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    INNER JOIN Ficha f ON me.Ficha_id = f.Ficha_id
    LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
    LEFT JOIN MovPre mpr ON mp.Mp_id = mpr.Mp_id
    LEFT JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
    LEFT JOIN Servicios s ON mp.Serv_id = s.Serv_Id
    WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes
      AND me.Ficha_id IN (
        SELECT me2.Ficha_id FROM MovEnca me2
        WHERE YEAR(me2.Me_Fecha) = @anio AND MONTH(me2.Me_Fecha) = @mes
        GROUP BY me2.Ficha_id HAVING COUNT(DISTINCT me2.Me_id) >= @umbral)
    ORDER BY me.Ficha_id, me.Me_Fecha, mp.Mp_id
  `;
  const hiperDetalleResult = await executeQuery(queryHiperDetalle, { anio: anioNum, mes: mesNum, umbral: UMBRAL_HIPERFRECUENTADOR });

  // QUERY 5: Reconsultas tempranas
  const queryReconsultas = `
    ;WITH VisitasOrdenadas AS (
      SELECT me.Ficha_id, me.Me_id, me.Me_Fecha,
        LAG(me.Me_Fecha) OVER (PARTITION BY me.Ficha_id ORDER BY me.Me_Fecha) AS visitaAnterior
      FROM MovEnca me WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes
    )
    SELECT f.Ficha_id AS fichaId, f.fic_ape + ', ' + f.fic_nombre AS paciente,
      DATEDIFF(YEAR, f.fic_fechanac, GETDATE()) AS edad, os.os_nombre AS obraSocial,
      vo.visitaAnterior AS fechaPrimeraVisita, vo.Me_Fecha AS fechaReconsulta,
      DATEDIFF(DAY, vo.visitaAnterior, vo.Me_Fecha) AS diasEntre,
      pre.pre_nombre AS prestadorReconsulta, n.nom_nom AS practicaReconsulta
    FROM VisitasOrdenadas vo
    INNER JOIN Ficha f ON vo.Ficha_id = f.Ficha_id
    LEFT JOIN ObrasSociales os ON (SELECT TOP 1 me2.Os_id FROM MovEnca me2 WHERE me2.Me_id = vo.Me_id) = os.os_id
    LEFT JOIN MovPrac mp ON vo.Me_id = mp.Me_id
    LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    LEFT JOIN MovPre mpr ON mp.Mp_id = mpr.Mp_id
    LEFT JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
    WHERE vo.visitaAnterior IS NOT NULL AND DATEDIFF(DAY, vo.visitaAnterior, vo.Me_Fecha) BETWEEN 1 AND @umbralDias
    ORDER BY vo.Me_Fecha
  `;
  const reconsultasResult = await executeQuery(queryReconsultas, { anio: anioNum, mes: mesNum, umbralDias: UMBRAL_RECONSULTA_DIAS });

  // QUERY 6: Intravítreas
  const queryIntravitreas = `
    SELECT f.Ficha_id AS fichaId, f.fic_ape + ', ' + f.fic_nombre AS paciente,
      DATEDIFF(YEAR, f.fic_fechanac, GETDATE()) AS edad, os.os_nombre AS obraSocial,
      n.nom_nom AS procedimiento, me.Me_Fecha AS fecha, pre.pre_nombre AS prestador,
      (SELECT COUNT(DISTINCT me3.Me_id) FROM MovEnca me3 INNER JOIN MovPrac mp3 ON me3.Me_id = mp3.Me_id
        WHERE me3.Ficha_id = f.Ficha_id AND mp3.nom_cod IN ('030601','030602','030609') AND YEAR(me3.Me_Fecha) = @anio) AS inyeccionesEnAnio
    FROM MovEnca me
    INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
    INNER JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    INNER JOIN Ficha f ON me.Ficha_id = f.Ficha_id
    LEFT JOIN ObrasSociales os ON me.Os_id = os.os_id
    LEFT JOIN MovPre mpr ON mp.Mp_id = mpr.Mp_id
    LEFT JOIN Prestadores pre ON mpr.Pre_id = pre.pre_id
    WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes AND mp.nom_cod IN ('030601','030602','030609')
    ORDER BY f.fic_ape, me.Me_Fecha
  `;
  const intravitreaResult = await executeQuery(queryIntravitreas, { anio: anioNum, mes: mesNum });

  // QUERY 7: Distribución por Obra Social
  const queryDistribucionOS = `
    SELECT os.os_id AS osId, os.os_nombre AS osNombre, os.os_sigla AS osSigla,
      COUNT(DISTINCT me.Me_id) AS atenciones, COUNT(DISTINCT me.Ficha_id) AS pacientes,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN 1 ELSE 0 END) AS cirugias
    FROM MovEnca me INNER JOIN ObrasSociales os ON me.Os_id = os.os_id
    INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes
    GROUP BY os.os_id, os.os_nombre, os.os_sigla ORDER BY atenciones DESC
  `;
  const distribucionOSResult = await executeQuery(queryDistribucionOS, { anio: anioNum, mes: mesNum });

  // QUERY 8: Distribución por Prestador
  const queryDistribucionPrestador = `
    ;WITH EncPre AS (
      SELECT DISTINCT mpr.Pre_id, me.Me_id
      FROM MovPre mpr INNER JOIN MovPrac mp ON mpr.Mp_id = mp.Mp_id INNER JOIN MovEnca me ON mp.Me_id = me.Me_id
      WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes
    )
    SELECT pre.pre_id AS preId, pre.pre_nombre AS preNombre, COUNT(ep.Me_id) AS atenciones,
      (SELECT COUNT(DISTINCT mp2.Mp_id) FROM MovPre mpr2
        INNER JOIN MovPrac mp2 ON mpr2.Mp_id = mp2.Mp_id INNER JOIN MovEnca me2 ON mp2.Me_id = me2.Me_id
        WHERE mpr2.Pre_id = pre.pre_id AND YEAR(me2.Me_Fecha) = @anio AND MONTH(me2.Me_Fecha) = @mes AND LEFT(mp2.nom_cod, 2) = '03') AS cirugias
    FROM EncPre ep INNER JOIN Prestadores pre ON ep.Pre_id = pre.pre_id
    GROUP BY pre.pre_id, pre.pre_nombre ORDER BY atenciones DESC
  `;
  const distribucionPrestadorResult = await executeQuery(queryDistribucionPrestador, { anio: anioNum, mes: mesNum });

  // QUERY 9: Tendencia 6 meses
  const queryTendencia = `
    SELECT YEAR(me.Me_Fecha) AS anio, MONTH(me.Me_Fecha) AS mes,
      COUNT(DISTINCT me.Me_id) AS atenciones, COUNT(DISTINCT me.Ficha_id) AS pacientes,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '01' THEN 1 ELSE 0 END) AS consultas,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '02' THEN 1 ELSE 0 END) AS estudios,
      SUM(CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN 1 ELSE 0 END) AS cirugias,
      COUNT(DISTINCT CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN me.Ficha_id END) AS pacientesQx
    FROM MovEnca me INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
    WHERE (YEAR(me.Me_Fecha) * 100 + MONTH(me.Me_Fecha)) BETWEEN (@anioDesde * 100 + @mesDesde) AND (@anioHasta * 100 + @mesHasta)
    GROUP BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha) ORDER BY YEAR(me.Me_Fecha), MONTH(me.Me_Fecha)
  `;
  let mesDesde = mesNum - 5;
  let anioDesde = anioNum;
  if (mesDesde < 1) { mesDesde += 12; anioDesde -= 1; }
  const tendenciaResult = await executeQuery(queryTendencia, { anioDesde, mesDesde, anioHasta: anioNum, mesHasta: mesNum });

  // QUERY 10: Distribución tipo de paciente
  const queryTipoPaciente = `
    SELECT tipo_paciente AS tipoPaciente, COUNT(*) AS cantidad,
      CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,1)) AS porcentaje
    FROM (
      SELECT me.Ficha_id,
        CASE WHEN MAX(CASE WHEN LEFT(mp.nom_cod, 2) = '03' THEN 1 ELSE 0 END) = 1 THEN 'QUIRURGICO'
             WHEN MAX(CASE WHEN LEFT(mp.nom_cod, 2) = '02' THEN 1 ELSE 0 END) = 1 THEN 'CON_ESTUDIO'
             ELSE 'SOLO_CONSULTA' END AS tipo_paciente
      FROM MovEnca me INNER JOIN MovPrac mp ON me.Me_id = mp.Me_id
      WHERE YEAR(me.Me_Fecha) = @anio AND MONTH(me.Me_Fecha) = @mes
      GROUP BY me.Ficha_id
    ) sub GROUP BY tipo_paciente ORDER BY cantidad DESC
  `;
  const tipoPacienteResult = await executeQuery(queryTipoPaciente, { anio: anioNum, mes: mesNum });

  // ---------- PROCESAMIENTO ----------
  const findPeriodo = (rows, periodo) => rows.find((r) => r.periodo === periodo) || {};
  const kpiActual = findPeriodo(kpisResult.recordset, 'ACTUAL');
  const kpiAnterior = findPeriodo(kpisResult.recordset, 'ANTERIOR');

  const calcVariacion = (actual, anterior) => {
    if (!anterior || anterior === 0) return actual > 0 ? 100 : 0;
    return parseFloat((((actual - anterior) / Math.abs(anterior)) * 100).toFixed(1));
  };

  const kpis = {
    actual: {
      totalAtenciones: parseInt(kpiActual.totalAtenciones || 0),
      pacientesUnicos: parseInt(kpiActual.pacientesUnicos || 0),
      totalCirugias: parseInt(kpiActual.totalCirugias || 0),
      pacientesQuirurgicos: parseInt(kpiActual.pacientesQuirurgicos || 0),
      totalConsultas: parseInt(kpiActual.totalConsultas || 0),
      totalEstudios: parseInt(kpiActual.totalEstudios || 0),
    },
    anterior: {
      totalAtenciones: parseInt(kpiAnterior.totalAtenciones || 0),
      pacientesUnicos: parseInt(kpiAnterior.pacientesUnicos || 0),
      totalCirugias: parseInt(kpiAnterior.totalCirugias || 0),
      pacientesQuirurgicos: parseInt(kpiAnterior.pacientesQuirurgicos || 0),
      totalConsultas: parseInt(kpiAnterior.totalConsultas || 0),
      totalEstudios: parseInt(kpiAnterior.totalEstudios || 0),
    },
    variacionPct: {},
  };
  for (const key of Object.keys(kpis.actual)) {
    kpis.variacionPct[key] = calcVariacion(kpis.actual[key], kpis.anterior[key]);
  }

  const panelQuirurgico = postQxResult.recordset.map((row) => {
    const controles = parseInt(row.controlesPost || 0);
    let semaforo = 'rojo';
    if (controles >= UMBRAL_CONTROLES_OK) semaforo = 'verde';
    else if (controles >= 1) semaforo = 'amarillo';
    return {
      fichaId: row.fichaId, paciente: row.paciente?.trim(), edad: row.edad, sexo: row.sexo,
      obraSocial: row.obraSocial?.trim(), fechaCirugia: row.fechaCirugia, cirugia: row.cirugia?.trim(),
      codigoCirugia: row.codigoCirugia?.trim(), prestadorCirugia: row.prestadorCirugia?.trim(),
      controlesPost: controles, semaforo,
    };
  });

  const panelQxDedup = [];
  const fichasVistas = new Set();
  for (const row of panelQuirurgico) {
    const key = `${row.fichaId}-${row.fechaCirugia}`;
    if (!fichasVistas.has(key)) { fichasVistas.add(key); panelQxDedup.push(row); }
  }

  const sinControl = panelQxDedup.filter((p) => p.semaforo === 'rojo');

  const hiperfrecuentadores = frecuenciaResult.recordset.map((row) => {
    const detalles = hiperDetalleResult.recordset.filter((d) => d.fichaId === row.fichaId);
    const obrasSociales = [...new Set(detalles.map((d) => d.obraSocial?.trim()).filter(Boolean))];
    const prestadores = [...new Set(detalles.map((d) => d.prestador?.trim()).filter(Boolean))];
    const servicios = [...new Set(detalles.map((d) => d.servicio?.trim()).filter(Boolean))];
    const practicas = [...new Set(detalles.map((d) => d.practica?.trim()).filter(Boolean))];
    let clasificacion = 'NO_QUIRURGICO';
    if (row.tieneCirugia) clasificacion = 'QUIRURGICO';
    else if (row.tieneIntravitrea) clasificacion = 'INTRAVITREA_CRONICA';
    else if (row.tieneEstudio) clasificacion = 'CON_ESTUDIO';
    return {
      fichaId: row.fichaId, paciente: row.paciente?.trim(), edad: row.edad, sexo: row.sexo,
      visitas: parseInt(row.visitas || 0), practicasTotal: parseInt(row.practicasTotal || 0),
      clasificacion, obrasSociales, prestadores, servicios, practicas,
      esAlerta: clasificacion === 'NO_QUIRURGICO' || clasificacion === 'CON_ESTUDIO',
    };
  });
  const hiperNoQx = hiperfrecuentadores.filter((h) => h.esAlerta);
  const hiperQx = hiperfrecuentadores.filter((h) => !h.esAlerta);

  const reconsultasMap = new Map();
  for (const row of reconsultasResult.recordset) {
    const key = `${row.fichaId}-${row.fechaReconsulta}`;
    if (!reconsultasMap.has(key)) {
      reconsultasMap.set(key, {
        fichaId: row.fichaId, paciente: row.paciente?.trim(), edad: row.edad, obraSocial: row.obraSocial?.trim(),
        fechaPrimeraVisita: row.fechaPrimeraVisita, fechaReconsulta: row.fechaReconsulta, diasEntre: row.diasEntre,
        prestadorReconsulta: row.prestadorReconsulta?.trim(), practicaReconsulta: row.practicaReconsulta?.trim(),
      });
    }
  }
  const reconsultas = Array.from(reconsultasMap.values());

  const intravitreas = intravitreaResult.recordset.map((row) => ({
    fichaId: row.fichaId, paciente: row.paciente?.trim(), edad: row.edad, obraSocial: row.obraSocial?.trim(),
    procedimiento: row.procedimiento?.trim(), fecha: row.fecha, prestador: row.prestador?.trim(),
    inyeccionesEnAnio: parseInt(row.inyeccionesEnAnio || 0),
  }));
  const intravitreasPacientes = [];
  const intravitreasFichas = new Set();
  for (const row of intravitreas) {
    if (!intravitreasFichas.has(row.fichaId)) { intravitreasFichas.add(row.fichaId); intravitreasPacientes.push(row); }
  }

  const distribucionOS = distribucionOSResult.recordset.map((row) => ({
    osId: row.osId, osNombre: row.osNombre?.trim(), osSigla: row.osSigla?.trim(),
    atenciones: parseInt(row.atenciones || 0), pacientes: parseInt(row.pacientes || 0), cirugias: parseInt(row.cirugias || 0),
  }));
  const totalAtenciones = distribucionOS.reduce((s, r) => s + r.atenciones, 0);
  distribucionOS.forEach((os) => {
    os.participacionPct = totalAtenciones > 0 ? parseFloat(((os.atenciones / totalAtenciones) * 100).toFixed(1)) : 0;
  });

  const distribucionPrestador = distribucionPrestadorResult.recordset.map((row) => ({
    preId: row.preId, preNombre: row.preNombre?.trim(), atenciones: parseInt(row.atenciones || 0), cirugias: parseInt(row.cirugias || 0),
  }));
  const totalAtenPre = distribucionPrestador.reduce((s, r) => s + r.atenciones, 0);
  distribucionPrestador.forEach((pre) => {
    pre.participacionPct = totalAtenPre > 0 ? parseFloat(((pre.atenciones / totalAtenPre) * 100).toFixed(1)) : 0;
  });

  const tendencia = tendenciaResult.recordset.map((row) => ({
    anio: row.anio, mes: row.mes, label: `${getMesNombreCorto(row.mes)} ${row.anio}`,
    atenciones: parseInt(row.atenciones || 0), pacientes: parseInt(row.pacientes || 0),
    consultas: parseInt(row.consultas || 0), estudios: parseInt(row.estudios || 0),
    cirugias: parseInt(row.cirugias || 0), pacientesQx: parseInt(row.pacientesQx || 0),
  }));

  const tipoPaciente = tipoPacienteResult.recordset.map((row) => ({
    tipo: row.tipoPaciente, cantidad: parseInt(row.cantidad || 0), porcentaje: parseFloat(row.porcentaje || 0),
  }));

  const alertas = [
    { id: 'postqx-sin-control', nivel: 'critico', semaforo: 'rojo', titulo: 'Postquirúrgicos sin control',
      descripcion: `${sinControl.length} paciente(s) operados sin control de seguimiento en el mes`, cantidad: sinControl.length, detalle: sinControl },
    { id: 'hiperfrecuentadores-no-qx', nivel: 'medio', semaforo: 'amarillo', titulo: 'Hiperfrecuentadores no quirúrgicos',
      descripcion: `${hiperNoQx.length} paciente(s) con ${UMBRAL_HIPERFRECUENTADOR}+ visitas sin cirugía asociada`, cantidad: hiperNoQx.length, detalle: hiperNoQx },
    { id: 'reconsultas-tempranas', nivel: 'medio', semaforo: 'amarillo', titulo: `Reconsultas tempranas (<${UMBRAL_RECONSULTA_DIAS} días)`,
      descripcion: `${reconsultas.length} reconsulta(s) dentro de ${UMBRAL_RECONSULTA_DIAS} días`, cantidad: reconsultas.length, detalle: reconsultas },
    { id: 'intravitreas-cronicas', nivel: 'informativo', semaforo: 'verde', titulo: 'Pacientes con intravítreas (tto. crónico)',
      descripcion: `${intravitreasPacientes.length} paciente(s) en tratamiento con inyecciones intravítreas`, cantidad: intravitreasPacientes.length, detalle: intravitreasPacientes },
  ];

  return {
    generadoEn: new Date().toISOString(),
    periodo: { mes: mesNum, anio: anioNum, label: `${getMesNombre(mesNum)} ${anioNum}`, mesAnteriorLabel: `${getMesNombre(mesAnt)} ${anioAnt}` },
    umbrales: { hiperfrecuentador: UMBRAL_HIPERFRECUENTADOR, reconsultaDias: UMBRAL_RECONSULTA_DIAS, controlesOk: UMBRAL_CONTROLES_OK },
    kpis, alertas, panelQuirurgico: panelQxDedup,
    hiperfrecuentadores: { todos: hiperfrecuentadores, noQuirurgicos: hiperNoQx, quirurgicos: hiperQx, total: hiperfrecuentadores.length },
    distribucion: { porObraSocial: distribucionOS, porPrestador: distribucionPrestador, porTipoPaciente: tipoPaciente },
    tendencia,
  };
}

// ------------------------------------------------------------
// Meses con datos (mismo criterio que el endpoint /meses-disponibles).
// ------------------------------------------------------------
async function mesesConDatos() {
  const query = `
    SELECT DISTINCT YEAR(Me_Fecha) AS anio, MONTH(Me_Fecha) AS mes, COUNT(*) AS atenciones
    FROM MovEnca WHERE Me_Fecha >= '2023-01-01'
    GROUP BY YEAR(Me_Fecha), MONTH(Me_Fecha) HAVING COUNT(*) > 10
    ORDER BY anio DESC, mes DESC
  `;
  const r = await executeQuery(query, {});
  return (r.recordset || []).map((row) => ({
    anio: row.anio, mes: row.mes, label: `${getMesNombre(row.mes)} ${row.anio}`, atenciones: row.atenciones,
  }));
}

// ------------------------------------------------------------
// Sincroniza snapshots a Supabase (dashboards_snapshot, modulo='seguimiento').
//   soloRecientes=true  -> recalcula mes actual + anterior (para el daemon)
//   soloRecientes=false -> recalcula TODOS los meses con datos (carga histórica)
// ------------------------------------------------------------
async function sincronizarSeguimiento({ write = false, soloRecientes = true } = {}) {
  let objetivos;
  if (soloRecientes) {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + 1;
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anioAnt = mes === 1 ? anio - 1 : anio;
    objetivos = [{ anio, mes }, { anio: anioAnt, mes: mesAnt }];
  } else {
    objetivos = (await mesesConDatos()).map((m) => ({ anio: m.anio, mes: m.mes }));
  }

  if (!write) return { total: objetivos.length, escrito: false };

  let insertados = 0;
  for (const { anio, mes } of objetivos) {
    const payload = await generarInformeMensual(mes, anio);
    const resumen = { atenciones: payload.kpis.actual.totalAtenciones };
    const { error } = await supabase
      .from('dashboards_snapshot')
      .upsert({ modulo: 'seguimiento', anio, mes, payload, resumen, synced_at: new Date().toISOString() }, { onConflict: 'modulo,anio,mes' });
    if (error) throw new Error(`upsert ${anio}-${mes}: ${error.message}`);
    insertados++;
  }
  return { total: objetivos.length, insertados, escrito: true };
}

module.exports = { generarInformeMensual, mesesConDatos, sincronizarSeguimiento };
