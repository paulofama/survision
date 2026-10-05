// ============================================================
// Conciliación agenda vs facturación
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/conciliar-agenda-facturacion.cjs --mes 2026-09
//   node scripts/conciliar-agenda-facturacion.cjs --mes 2026-09 --detalle
//
// QUÉ RESPONDE
// ------------
// El informe Análisis › Por Prestación mostraba 1 práctica del código 030514
// en septiembre cuando la agenda tenía 5 turnos de ese código. La pregunta era
// si el informe sub-registraba.
//
// NO sub-registra. El informe es fiel a lo FACTURADO; la agenda refleja lo
// AGENDADO, y las dos cosas difieren en ~1,5 % de los turnos atendidos. Este
// script muestra exactamente dónde, para que Administración lo corrija en
// GECLISA. No reescribe ningún número.
//
// LAS TRES CAUSAS, MEDIDAS
// -------------------------
//   1. CÓDIGO DISTINTO DEL AGENDADO. El turno dice 030514 (PanOptix) y el
//      movimiento se cargó como 030501 (monofocal). La práctica está contada,
//      pero en la fila de otro código. 9 casos en sep-2026, 16 en ago-2026.
//   2. MOVIMIENTO EN OTRO MES. `MovEnca.Me_Fecha` no coincide con la fecha del
//      turno, y el extractor filtra por esa fecha: la práctica cae en el
//      período anterior. 2 casos en sep-2026.
//   3. SIN PRÁCTICA CARGADA. Hay atención (MovEnca) pero ninguna MovPrac, así
//      que la práctica no existe para ningún informe. 7 casos en sep-2026,
//      todos sin importe (consultas y controles).
//
// POR QUÉ `tur_FechaAtendido` Y NO `turt_id`
// -------------------------------------------
// `turt_id` es el TIPO de turno, no el estado. Usarlo como "atendido" da 24
// turnos en septiembre cuando en realidad hubo 1.234: el denominador queda 50
// veces más chico y cualquier porcentaje sale sin sentido.
//
// ⚠️ LA AGENDA ES UNA VENTANA MÓVIL
// ----------------------------------
// `Turnos` guarda ~4.500 filas y se purga: al 05/10/2026 ya casi no quedan
// turnos de junio. Esta conciliación sólo se puede correr sobre los meses que
// todavía están. Si se quiere conservar el hallazgo hay que persistirlo —es
// una decisión aparte, no la hace este script.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const sql = require('mssql');

const args = process.argv.slice(2);
const DETALLE = args.includes('--detalle');
const iMes = args.indexOf('--mes');
const MES = iMes >= 0 ? args[iMes + 1] : null;

if (!MES || !/^\d{4}-\d{2}$/.test(MES)) {
  console.error('USO: node scripts/conciliar-agenda-facturacion.cjs --mes 2026-09 [--detalle]');
  process.exit(1);
}

const [ANIO, MESN] = MES.split('-').map(Number);
const desde = `${MES}-01`;
const hasta = MESN === 12 ? `${ANIO + 1}-01-01` : `${ANIO}-${String(MESN + 1).padStart(2, '0')}-01`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

/**
 * Los importes salen de MovEnca (`Me_Cose` + `Me_ValorPrac`), que es el grano
 * de la ATENCIÓN. Los de MovPrac (`Mp_Tot`, `Mp_CoseTotal`) están en cero en
 * esta base: usarlos daría $0 en todo el informe.
 */
const QUERY = `
  WITH atendidos AS (
    SELECT t.turno_id, t.tur_fecha, LTRIM(RTRIM(t.nom_cod)) AS cod_turno, t.Me_id,
           LTRIM(RTRIM(t.tfic_ape)) + ', ' + LTRIM(RTRIM(t.tfic_nombre)) AS paciente,
           t.pre_id
      FROM Turnos t
     WHERE t.tur_fecha >= @desde AND t.tur_fecha < @hasta
       AND t.tur_FechaAtendido IS NOT NULL
  )
  SELECT a.turno_id,
         CONVERT(varchar(10), a.tur_fecha, 120) AS fecha_turno,
         a.paciente,
         a.cod_turno,
         LTRIM(RTRIM(ISNULL(mp.nom_cod, ''))) AS cod_facturado,
         ISNULL(n.nom_nom, '') AS practica,
         ISNULL(os.os_sigla, 'PART') AS os,
         ISNULL(pre.pre_nombre, '') AS prestador,
         CONVERT(varchar(10), m.Me_Fecha, 120) AS fecha_mov,
         ISNULL(m.Me_Cose, 0) + ISNULL(m.Me_ValorPrac, 0) AS monto,
         CASE
           WHEN a.Me_id IS NULL THEN 'sin_atencion'
           WHEN mp.Mp_id IS NULL THEN 'sin_practica'
           WHEN DATEDIFF(month, m.Me_Fecha, a.tur_fecha) <> 0 THEN 'otro_mes'
           WHEN LTRIM(RTRIM(mp.nom_cod)) <> a.cod_turno THEN 'codigo_distinto'
           ELSE 'ok'
         END AS causa
    FROM atendidos a
    LEFT JOIN MovEnca m ON m.Me_id = a.Me_id
    LEFT JOIN MovPrac mp ON mp.Me_id = m.Me_id
    LEFT JOIN Nomenclador n ON mp.nom_id = n.nom_id AND mp.nom_cod = n.nom_cod
    LEFT JOIN ObrasSociales os ON m.Os_id = os.os_id
    LEFT JOIN Prestadores pre ON a.pre_id = pre.pre_id`;

const ETIQUETA = {
  sin_atencion: 'SIN ATENCIÓN (el turno no tiene MovEnca)',
  sin_practica: 'SIN PRÁCTICA CARGADA (hay atención, no hay MovPrac)',
  otro_mes: 'MOVIMIENTO EN OTRO MES (cae en otro período)',
  codigo_distinto: 'CÓDIGO FACTURADO ≠ CÓDIGO AGENDADO',
};

/** En qué orden se muestran: primero lo que más plata mueve. */
const ORDEN = ['codigo_distinto', 'otro_mes', 'sin_practica', 'sin_atencion'];

(async () => {
  const cfg = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 1433,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 10000,
    requestTimeout: 120000,
  };
  const pool = await sql.connect(cfg);
  const r = await pool.request()
    .input('desde', sql.Date, desde)
    .input('hasta', sql.Date, hasta)
    .query(QUERY);

  const filas = r.recordset || [];
  const total = filas.length;
  const problemas = filas.filter((f) => f.causa !== 'ok');

  console.log(`Conciliación agenda vs facturación · ${MES}\n`);

  if (total === 0) {
    console.log('  No hay turnos atendidos en ese mes dentro de la ventana de `Turnos`.');
    console.log('  La tabla se purga: los meses viejos ya no se pueden conciliar.');
    await pool.close();
    return;
  }

  console.log(`  Turnos atendidos: ${total}`);
  console.log(`  Con discrepancia: ${problemas.length}  (${(100 * problemas.length / total).toFixed(1)} %)\n`);

  let granTotal = 0;
  for (const causa of ORDEN) {
    const g = problemas.filter((f) => f.causa === causa);
    if (!g.length) continue;
    const plata = g.reduce((s, f) => s + (Number(f.monto) || 0), 0);
    granTotal += plata;
    console.log(`${ETIQUETA[causa]} — ${g.length} turno(s) · ${ars(plata)}`);

    const aMostrar = DETALLE ? g : g.slice(0, 5);
    for (const f of aMostrar) {
      const detalle = causa === 'codigo_distinto'
        ? `agenda ${f.cod_turno} -> facturado ${f.cod_facturado}`
        : causa === 'otro_mes'
          ? `turno ${f.fecha_turno}, movimiento ${f.fecha_mov}`
          : `agenda ${f.cod_turno}`;
      console.log(`  ${f.fecha_turno} ${String(f.paciente).slice(0, 26).padEnd(26)} ${String(f.os).padEnd(9)}`
        + `${ars(f.monto).padStart(13)}  ${detalle}`);
    }
    if (!DETALLE && g.length > 5) console.log(`  … y ${g.length - 5} más (agregá --detalle)`);
    console.log('');
  }

  console.log(`  PLATA INVOLUCRADA: ${ars(granTotal)}`);
  console.log('');
  console.log('  Ojo: no es plata perdida. Está contada, pero en la fila de otro');
  console.log('  código o en otro mes. La corrección se hace en GECLISA: este');
  console.log('  script no reescribe nada.');

  await pool.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
