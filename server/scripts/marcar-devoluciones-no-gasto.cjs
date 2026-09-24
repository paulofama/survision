// ============================================================
// Lo que se le devuelve al paciente NO es gasto
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/marcar-devoluciones-no-gasto.cjs            -> DRY-RUN
//   node scripts/marcar-devoluciones-no-gasto.cjs --write     -> aplica
//   node scripts/marcar-devoluciones-no-gasto.cjs --detalle   -> lista comprobante por comprobante
//
// Cuando un paciente paga algo y después se le devuelve la plata, esa salida
// no es un costo del instituto: es plata que nunca fue nuestra. Salen por
// MovProv como cualquier pago a proveedor, así que el auto-clasificador las
// venía marcando `variable / honorarios` e inflaba el costo del período.
// Criterio de Paulo, 24/09/2026.
//
// CADA REGLA ES UN PATRÓN CON NOMBRE, Y ESO ES A PROPÓSITO
// --------------------------------------------------------
// Un solo ILIKE '%devoluc%' se lleva puestos los 488 "Devolución Cobranza"
// ($46,2 M, sin criterio todavía), las devoluciones de material y de insumos
// —que pueden ser créditos que RECIBIMOS, no salidas— y un pago a un
// escribano. Por eso cada familia se escribe aparte, se cuenta aparte y se
// puede sacar aparte.
//
// Antes de agregar una regla nueva, correr el diagnóstico: mirar TODAS las
// descripciones que el patrón agarraría en la tabla entera, no sólo las que
// uno está pensando. La familia "reintegro" se pudo cerrar entera porque se
// verificó que los 20 comprobantes con esa palabra son, todos, del paciente.
//
// Y OJO CON LA TABLA DE ORIGEN: en `MovValoresEnca` la descripción es el
// MEDIO DE PAGO, no el concepto. Confundir eso nos costó marcar 1.009
// comprobantes por $154,9 M como "no es gasto" cuando sí lo eran. Las reglas
// de acá se apoyan en conceptos escritos a mano ("REINTEGRO GONZALEZ
// GLADYS"), que no se parecen a un medio de pago, pero conviene mirarlo cada
// vez que se agregue una.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const DETALLE = process.argv.includes('--detalle');
const MARCA = 'regla-devolucion-paciente';

// Casos sueltos que no entran en ningún patrón, agregados de a uno por
// decisión expresa. Van por (fuente, id_geclisa): un patrón que atrape
// "DEVOLUCION TRANSFERENCIA" se llevaría puesto cualquier movimiento entre
// cuentas, y acá el que se equivoca borra plata de un informe.
const EXCEPCIONES = [
  // Transferencia devuelta a un paciente. Paulo, 24/09/2026.
  { fuente: 'MovProv', id: 13368 }, // DEVOLUCION TRANSFERENCIA- PCTE. GARRO PEDRO · $120.000 · 23/07/2026
];

const REGLAS = [
  {
    nombre: 'Devolución de cirugía',
    sql: `(g.descripcion ILIKE '%devoluc%' AND g.descripcion ILIKE '%cirug%')`,
  },
  {
    nombre: 'Reintegro al paciente',
    // Verificado sobre la tabla entera: los 20 comprobantes con esta palabra
    // son todos devoluciones a un paciente. No hay reintegros de gastos a
    // empleados ni de obra social.
    sql: `g.descripcion ILIKE '%reintegr%'`,
  },
  {
    nombre: 'Devolución de un depósito',
    // La seña que el paciente dejó para un estudio y se le devolvió. El
    // patrón arranca con "Devolución" a propósito: sin eso agarra los 975
    // "Depósito Bancario" ($93,3 M), que son transferencias nuestras.
    sql: `g.descripcion ILIKE 'Devoluci%n Dep%sito%'`,
  },
];

if (EXCEPCIONES.length) {
  REGLAS.push({
    nombre: 'Casos agregados a mano',
    sql: `(${EXCEPCIONES.map((e) => `(g.fuente = '${e.fuente}' AND g.id_geclisa = ${e.id})`).join(' OR ')})`,
  });
}

const FILTRO = `(${REGLAS.map((r) => r.sql).join(' OR ')})`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Devoluciones al paciente → no_es_gasto — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  // ---- Qué agarra cada regla, por separado ----
  console.log('Por regla:');
  for (const regla of REGLAS) {
    const { rows: [x] } = await c.query(`
      SELECT count(*)::int n, COALESCE(sum(g.monto), 0) AS total,
             count(*) FILTER (WHERE cl.tipo_costo IN ('variable','fijo'))::int como_gasto,
             count(*) FILTER (WHERE cl.id IS NULL)::int sin_clasificar,
             count(*) FILTER (WHERE cl.tipo_costo = 'no_es_gasto')::int ya_ok
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${regla.sql}`);
    console.log(`  ${regla.nombre.padEnd(28)} ${String(x.n).padStart(4)} ${ars(x.total).padStart(16)}`
      + `   hoy gasto:${x.como_gasto}  sin clasificar:${x.sin_clasificar}  ya ok:${x.ya_ok}`);
  }

  const { rows: [t] } = await c.query(`
    SELECT count(*)::int n, COALESCE(sum(g.monto), 0) AS total,
           COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo IN ('variable','fijo')), 0) AS como_gasto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE ${FILTRO}`);
  console.log(`\n  TOTAL ${t.n} comprobantes · ${ars(t.total)}`);
  console.log(`  De eso, hoy se cuenta como gasto: ${ars(t.como_gasto)}`);

  // ---- Lo que queda afuera, para que se vea que se dejó afuera ----
  const afuera = await c.query(`
    SELECT trim(g.descripcion) AS desc, count(*)::int n, sum(g.monto) AS total
      FROM erogaciones_geclisa g
     WHERE (g.descripcion ILIKE '%devoluc%' OR g.descripcion ILIKE '%reintegr%')
       AND NOT ${FILTRO}
     GROUP BY 1 ORDER BY total DESC`);
  console.log('\n  Queda AFUERA (sin criterio todavía):');
  for (const x of afuera.rows) {
    console.log(`    ${String(x.n).padStart(4)} ${ars(x.total).padStart(14)}  ${x.desc}`);
  }

  if (DETALLE) {
    const d = await c.query(`
      SELECT g.fecha::date::text AS fecha, g.fuente, g.id_geclisa, trim(g.descripcion) AS desc, g.monto,
             COALESCE(cl.tipo_costo, 'sin clasificar') AS estado
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${FILTRO} ORDER BY g.monto DESC`);
    console.log('\nDetalle:');
    for (const x of d.rows) {
      console.log(`  ${x.fecha}  ${ars(x.monto).padStart(14)}  ${x.estado.padEnd(15)} [${x.fuente}/${x.id_geclisa}]  ${x.desc}`);
    }
  }

  if (!WRITE) {
    console.log('\n(dry-run: agregá --write para aplicar)');
    await c.end();
    return;
  }

  // ---- Aplicar, en una transacción que verifica antes de confirmar ----
  await c.query('BEGIN');
  try {
    // `updated_at` no se toca a mano: lo maneja el trigger.
    const upd = await c.query(`
      UPDATE erogaciones_clasificacion cl
         SET tipo_costo = 'no_es_gasto',
             subcategoria_variable = NULL,
             es_costo_fijo = false,
             categoria_costo_fijo_id = NULL,
             clasificado_por = $1,
             clasificado_at = now(),
             auto_clasificado = true
        FROM erogaciones_geclisa g
       WHERE cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
         AND ${FILTRO}
         AND cl.tipo_costo IS DISTINCT FROM 'no_es_gasto'
       RETURNING cl.id`, [MARCA]);

    const ins = await c.query(`
      INSERT INTO erogaciones_clasificacion
        (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
         categoria, es_costo_fijo, tipo_costo, clasificado_por, clasificado_at, auto_clasificado)
      SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
             COALESCE(g.categoria_sugerida, 'Gastos Proveedores'), false, 'no_es_gasto', $1, now(), true
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${FILTRO} AND cl.id IS NULL
      ON CONFLICT (fuente, id_geclisa) DO NOTHING
      RETURNING id`, [MARCA]);

    const { rows: [chk] } = await c.query(`
      SELECT count(*) FILTER (WHERE cl.tipo_costo IS DISTINCT FROM 'no_es_gasto')::int mal,
             count(*)::int total
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${FILTRO}`);
    if (chk.mal > 0) throw new Error(`ABORTA: quedaron ${chk.mal} de ${chk.total} sin marcar`);

    const { rows: [otras] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion cl
       WHERE cl.clasificado_por = $1
         AND NOT EXISTS (SELECT 1 FROM erogaciones_geclisa g
                          WHERE g.fuente = cl.fuente AND g.id_geclisa = cl.id_geclisa AND ${FILTRO})`, [MARCA]);
    if (otras.n > 0) throw new Error(`ABORTA: la marca ${MARCA} tocó ${otras.n} filas fuera del alcance`);

    await c.query('COMMIT');
    console.log(`\nCorregidas: ${upd.rowCount} · Nuevas: ${ins.rowCount}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    return;
  }

  const post = await c.query(`
    SELECT g.anio,
           COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo IN ('variable','fijo')), 0) AS gasto,
           COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo = 'no_es_gasto'), 0) AS no_gasto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     GROUP BY g.anio ORDER BY g.anio`);
  console.log('\nErogaciones por año, después del cambio:');
  for (const r of post.rows) console.log(`  ${r.anio}: gasto ${ars(r.gasto)} · no es gasto ${ars(r.no_gasto)}`);

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
