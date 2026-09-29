// ============================================================
// Horas, aguinaldo y sueldos — y por qué no van todos al mismo lado
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-horas-y-aguinaldo.cjs           -> DRY-RUN
//   node scripts/clasificar-horas-y-aguinaldo.cjs --write    -> aplica
//
// Criterio de Paulo, 29/09/2026: las horas extras y el aguinaldo van a
// Sueldos y Cargas.
//
// EL PROBLEMA: "HORAS" QUIERE DECIR DOS COSAS
// --------------------------------------------
// Hay 47 comprobantes sin clasificar que hablan de horas, sueldos o
// aguinaldo, y no son todos lo mismo. La tentación es agarrarlos por la
// palabra "horas" y mandarlos juntos a Sueldos y Cargas: sería un error de
// $1,2 M, porque la mitad son las guardias que el 27/09 se unificaron a
// `variable / honorarios`. Por eso van por (fuente, id_geclisa), uno por
// uno, con el importe verificado contra la base.
//
// LA LÍNEA DIVISORIA NO ES QUIÉN COBRA, ES QUIÉN PAGA
// ----------------------------------------------------
// Cornuz, Villar, Giulini y Martínez están las cuatro en el plantel del
// módulo de Sueldos (Medición, Cajera, Recepción). Así que "¿es empleada?"
// no separa nada: son todas empleadas. Lo que separa es a qué cuenta se
// carga el pago, y así quedó clasificado el histórico:
//
//   · "Gastos Varios" / "Pago Proveedores" — lo paga el instituto.
//     8 comprobantes ya están en `fijo / Sueldos y Cargas` (25/09).
//   · "Gastos Dr. Roca" / quirófano / Clínica del Valle — se le carga al
//     médico. 34 comprobantes ya están en `variable / honorarios` (27/09).
//
// Las mismas personas, en las dos listas. Es la misma empleada cobrando dos
// cosas distintas: su sueldo lo paga el instituto, sus horas de quirófano
// las paga Roca.
//
// LA LIMPIEZA NO VA A SUELDOS, Y NO ES UN DETALLE
// ------------------------------------------------
// "HORAS LIMPIEZA-IVANA OROSCO" es lo más parecido a una hora extra de todo
// el lote, pero Orosco NO está en el plantel — las de limpieza del módulo
// son Gimenez y Sepúlveda. Es una limpiadora externa por hora.
//
// Y acá clasificar mal no infla el informe: lo vacía. El informe saltea la
// erogación "Sueldos y Cargas" en los meses que cubre el módulo de Sueldos
// (useEvolucionMensual.ts, ~línea 346) porque el módulo ya trae el costo
// laboral. Noviembre 2025 es uno de esos meses. Si a Orosco la mando a
// Sueldos y Cargas, el informe la saltea esperando encontrarla en el
// módulo — donde no está, porque no es empleada. Los $21.000 desaparecen.
// Van a `fijo / Limpieza`, que es donde el histórico manda la limpieza.
//
// POR QUÉ EL RESTO SÍ PUEDE IR A SUELDOS Y CARGAS
// ------------------------------------------------
// Ese mismo salteo es lo que hace que el criterio de Paulo no duplique. El
// módulo cubre 2024-09 a 2026-01 y trae "Horas complementarias" TODOS los
// meses, así que las horas extras de ese tramo ya están contadas ahí y la
// erogación se saltea. De 2026-02 en adelante el módulo no tiene datos, y
// ahí la erogación es el único registro que queda: el aguinaldo de $3,68 M
// de septiembre 2026 entra al informe por esta vía o no entra por ninguna.
//
// Y DOS QUE NO SON NI UNA COSA NI LA OTRA
// ----------------------------------------
//   · "LIBRO SUELDO DIGITAL" es la tasa de rúbrica → Impuestos y Tasas.
//   · "MANDADO BCO RIO SUELDOS" es un mandado al banco → variable, igual que
//     los otros 178 mandados.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'horas-aguinaldo-2026-09-29';

const CAT_SUELDOS = 'ff6f48c6-0e03-43d1-9448-bd91a6a34901';
const CAT_IMPUESTOS = '1c29d173-6b81-48a4-8a00-bd5a713609e9';
const CAT_LIMPIEZA = '54fff4c2-cdec-4fb1-88ea-c8f861170b72';

/** Lo paga el instituto: costo laboral. Es lo que pidió Paulo. */
const A_SUELDOS = [
  { f: 'MovProv', id: 13591, m: 3680000, d: 'AGUINALDO PERSONAL' },
  { f: 'MovProv', id: 9580, m: 2227688, d: 'HORAS EXTRAS SEPTIEMBRE' },
  { f: 'MovProv', id: 13662, m: 1284524, d: 'HORAS COMPLEMENTARIAS PERSONAL' },
  { f: 'MovValoresEnca', id: 104919, m: 780000, d: 'SUELDOS MAR/NAN/ROS (Gastos Dr. Mercado)' },
  { f: 'MovValoresEnca', id: 105001, m: 522100, d: 'PAGO HORAS EXTRAS ENERO' },
  { f: 'MovValoresEnca', id: 107494, m: 402000, d: 'PAGO HORAS EXTRAS' },
  { f: 'MovValoresEnca', id: 104916, m: 222300, d: 'SUELDOS MAR/NAN/ROS (Gastos Dr. Mercado)' },
  { f: 'MovValoresEnca', id: 111103, m: 15700, d: 'HORAS CLAUDIA GIULIANI (Gastos Varios)' },
  { f: 'MovValoresEnca', id: 106995, m: 14500, d: 'MARTINEZ CLAUDIA — 5 horas a $2.900' },
];

/** Se le carga al médico: mismo criterio del 27/09. */
const A_HONORARIOS = [
  { f: 'MovProv', id: 9592, m: 183050, d: 'HORAS CLINICA DEL VALLE' },
  { f: 'MovProv', id: 8370, m: 178500, d: 'HORAS GISELA CORNUZ' },
  { f: 'MovProv', id: 8220, m: 152325, d: 'HORAS GISELA CORNUZ (CLINICA DEL VALLE)' },
  { f: 'MovProv', id: 9716, m: 141400, d: 'HORAS CLINICA DEL VALLE GISELA CORNUZ' },
  { f: 'MovProv', id: 9860, m: 126400, d: 'HORAS CLINICA DEL VALLE' },
  { f: 'MovProv', id: 8263, m: 56000, d: 'HORAS QUIROFANO ROMINA VILLAR' },
  { f: 'MovProv', id: 9735, m: 35000, d: 'HORAS ROMINA VILLAR' },
  { f: 'MovProv', id: 8355, m: 31500, d: 'HORAS QUIROFANO ROMINA VILLAR' },
  { f: 'MovProv', id: 9635, m: 31500, d: 'HORAS QUIROFANO ROMINA VILLAR' },
  { f: 'MovProv', id: 8420, m: 21000, d: 'HORAS QUIROFANO CAROLINA' },
  { f: 'MovProv', id: 9508, m: 17500, d: 'HORAS QUIROFANO ROMINA VILLAR' },
  { f: 'MovProv', id: 9541, m: 17500, d: 'HORAS QUIROFANO ROMINA' },
  { f: 'MovProv', id: 9819, m: 9100, d: 'HORAS QUIROFANO ROMINA VILLAR' },
  // Las de Claudia Giuliani cargadas a "Gastos Dr. Roca", una por semana.
  { f: 'MovValoresEnca', id: 113242, m: 17500, d: '5 HORAS CLAUDIA G.' },
  { f: 'MovValoresEnca', id: 112258, m: 16000, d: '5 HORAS CLAUDIA G.' },
  { f: 'MovValoresEnca', id: 108072, m: 16000, d: '5 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 112724, m: 16000, d: '5 HORAS CLAUDIA G' },
  { f: 'MovValoresEnca', id: 110702, m: 16000, d: '5 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 107425, m: 14500, d: 'HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 113535, m: 14000, d: '4 HORAS CLAUDIA G.' },
  { f: 'MovValoresEnca', id: 111217, m: 12800, d: 'HORAS CLAUDIA' },
  { f: 'MovValoresEnca', id: 112941, m: 12800, d: '4 HORAS CLAUDIA G.' },
  { f: 'MovValoresEnca', id: 110983, m: 12800, d: '4 HORAS CLAUDIA' },
  { f: 'MovValoresEnca', id: 114776, m: 10500, d: '3 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 111728, m: 9600, d: '3 HORAS- CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 110333, m: 9600, d: '3 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 112519, m: 9600, d: '3 HORAS DIAS 12, 13 Y 14' },
  { f: 'MovValoresEnca', id: 107212, m: 8700, d: '3 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 115028, m: 7000, d: '2 HORAS CLAUDIA G.' },
  { f: 'MovValoresEnca', id: 111405, m: 6400, d: '2 HORAS CLAUDIA' },
  { f: 'MovValoresEnca', id: 110398, m: 6400, d: '2 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 107650, m: 5800, d: '2 HORAS CLAUDIA GIULIANI' },
  { f: 'MovValoresEnca', id: 106410, m: 5200, d: '2 HORAS CLAUDIA G' },
  { f: 'MovValoresEnca', id: 106163, m: 5200, d: '2 HORAS CLAUDIA G.' },
];

/** Limpieza por hora, gente de afuera del plantel. */
const A_LIMPIEZA = [
  { f: 'MovProv', id: 13758, m: 53290, d: 'HORAS LIMPIEZA' },
  { f: 'MovProv', id: 9723, m: 21000, d: 'HORAS LIMPIEZA-IVANA OROSCO' },
];

/** Los dos que no son ni una cosa ni la otra. */
const A_IMPUESTOS = [{ f: 'MovProv', id: 9834, m: 3147, d: 'LIBRO SUELDO DIGITAL' }];
const A_MANDADO = [{ f: 'MovValoresEnca', id: 103006, m: 1000, d: 'MANDADO BCO RIO SUELDOS' }];

const GRUPOS = [
  { nombre: 'fijo / Sueldos y Cargas', items: A_SUELDOS, tipo: 'fijo', cat: CAT_SUELDOS, sub: null,
    por: 'Paulo 29/09: las horas extras y el aguinaldo son costo laboral' },
  { nombre: 'variable / honorarios', items: A_HONORARIOS, tipo: 'variable', cat: null, sub: 'honorarios',
    por: 'Paulo 27/09: las horas cargadas a la cuenta del médico van acá' },
  { nombre: 'fijo / Limpieza', items: A_LIMPIEZA, tipo: 'fijo', cat: CAT_LIMPIEZA, sub: null,
    por: 'limpiadora externa: no está en el plantel, en Sueldos se perdería' },
  { nombre: 'fijo / Impuestos y Tasas', items: A_IMPUESTOS, tipo: 'fijo', cat: CAT_IMPUESTOS, sub: null,
    por: 'tasa de rúbrica del libro de sueldos' },
  { nombre: 'variable / sin subcategoría', items: A_MANDADO, tipo: 'variable', cat: null, sub: null,
    por: 'precedente: los mandados van en variable sin subcategoría' },
];

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Horas, aguinaldo y sueldos — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  let problemas = 0;
  for (const g of GRUPOS) {
    const total = g.items.reduce((s, x) => s + x.m, 0);
    console.log(`${g.nombre} — ${g.items.length} comprobante(s) · ${ars(total)}`);
    console.log(`   ${g.por}`);
    for (const x of g.items.slice(0, 5)) console.log(`     ${ars(x.m).padStart(13)}  ${x.d}`);
    if (g.items.length > 5) console.log(`     … y ${g.items.length - 5} más`);
    console.log('');

    for (const x of g.items) {
      const { rows } = await c.query(
        'SELECT monto FROM erogaciones_geclisa WHERE fuente = $1 AND id_geclisa = $2', [x.f, x.id]);
      if (rows.length === 0) { console.log(`  FALTA [${x.f}/${x.id}] ${x.d}`); problemas++; continue; }
      if (Math.round(Number(rows[0].monto)) !== x.m) {
        console.log(`  MONTO [${x.f}/${x.id}] ${x.d}: la base dice ${ars(rows[0].monto)}, el plan ${ars(x.m)}`);
        problemas++;
      }
    }
  }

  const todos = GRUPOS.flatMap((g) => g.items);
  console.log(`  TOTAL ${todos.length} comprobantes · ${ars(todos.reduce((s, x) => s + x.m, 0))}`);

  // Que no se me escape ninguno: los que matchean el patrón tienen que estar
  // todos en el plan. Si aparece uno nuevo, lo miro antes de escribir.
  const { rows: [pend] } = await c.query(`
    SELECT count(*)::int n FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE cl.id IS NULL
       AND (g.descripcion ILIKE '%hora%' OR g.proveedor_nombre ILIKE '%hora%'
         OR g.descripcion ILIKE '%aguinaldo%' OR g.proveedor_nombre ILIKE '%aguinaldo%'
         OR g.descripcion ILIKE '%sueldo%' OR g.proveedor_nombre ILIKE '%sueldo%'
         OR g.descripcion ILIKE '%complementaria%' OR g.proveedor_nombre ILIKE '%complementaria%')`);
  if (pend.n !== todos.length) {
    console.log(`\n  OJO: sin clasificar que matchean el patrón hay ${pend.n}, y el plan cubre ${todos.length}.`);
    problemas++;
  }

  if (problemas) { console.error(`\nABORTA: ${problemas} no coinciden con lo relevado.`); process.exitCode = 1; await c.end(); return; }
  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar)'); await c.end(); return; }

  await c.query('BEGIN');
  try {
    let n = 0;
    for (const g of GRUPOS) {
      for (const x of g.items) {
        const r = await c.query(`
          INSERT INTO erogaciones_clasificacion
            (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
             categoria, es_costo_fijo, tipo_costo, subcategoria_variable, categoria_costo_fijo_id,
             clasificado_por, clasificado_at, auto_clasificado)
          SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
                 COALESCE(g.categoria_sugerida, 'Egresos de Caja'), $3, $4, $5, $6, $7, now(), false
            FROM erogaciones_geclisa g WHERE g.fuente = $1 AND g.id_geclisa = $2
          ON CONFLICT (fuente, id_geclisa) DO NOTHING RETURNING id`,
          [x.f, x.id, g.tipo === 'fijo', g.tipo, g.sub, g.cat, MARCA]);
        n += r.rowCount;
      }
    }
    if (n !== todos.length) throw new Error(`se insertaron ${n} de ${todos.length}`);

    // La unificación del 27/09 no puede haberse desarmado: las guardias y
    // horas de quirófano siguen todas en variable/honorarios.
    const { rows: [chk] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion cl
       WHERE (cl.descripcion ILIKE '%guardia%' OR cl.proveedor_nombre ILIKE '%guardia%')
         AND (cl.tipo_costo IS DISTINCT FROM 'variable' OR cl.subcategoria_variable IS DISTINCT FROM 'honorarios')
         AND COALESCE(cl.proveedor_nombre, '') NOT ILIKE '%CELULAR%'
         AND COALESCE(cl.descripcion, '') NOT ILIKE '%Dep%sito Bancario%'`);
    if (chk.n > 0) throw new Error(`ABORTA: ${chk.n} guardia(s) salieron de variable/honorarios`);

    await c.query('COMMIT');
    console.log(`\nClasificadas: ${n}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    return;
  }

  const post = await c.query(`
    SELECT g.anio, sum(g.monto) AS total, COALESCE(sum(g.monto) FILTER (WHERE cl.id IS NULL), 0) AS sin
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     GROUP BY g.anio ORDER BY g.anio`);
  console.log('\nCobertura por año:');
  for (const x of post.rows) {
    console.log(`  ${x.anio}: ${((1 - x.sin / x.total) * 100).toFixed(1)}% por plata · falta ${ars(x.sin)}`);
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
