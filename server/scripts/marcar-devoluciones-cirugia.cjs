// ============================================================
// Las devoluciones de cirugía NO son gasto
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/marcar-devoluciones-cirugia.cjs           -> DRY-RUN
//   node scripts/marcar-devoluciones-cirugia.cjs --write    -> aplica
//
// Cuando un paciente paga una cirugía y después se le devuelve la plata, esa
// salida no es un costo del instituto: es plata que nunca fue nuestra. El
// auto-clasificador las venía marcando `variable / honorarios` porque salen
// por MovProv como cualquier pago a proveedor, y eso infla los honorarios
// variables del período. Criterio de Paulo, 24/09/2026.
//
// EL FILTRO PIDE LAS DOS PALABRAS, Y ESO NO ES CASUALIDAD
// -------------------------------------------------------
// "devolución" sola agarra "Devolución Cobranza" — 488 comprobantes por
// $46,2 M que son otra cosa y sobre los que NO hay criterio todavía. También
// agarraría devoluciones de material, de insumos y de un escribano. Por eso
// exige además "cirug".
//
// Y se mira `descripcion` de `erogaciones_geclisa`, que acá es el concepto
// escrito a mano. OJO: en `MovValoresEnca` (caja) la descripción es el MEDIO
// DE PAGO, no el concepto — confundir las dos cosas nos costó marcar 1.009
// comprobantes por $154,9 M como "no es gasto" cuando sí lo eran. Esta tabla
// es MovProv y acá la descripción sí es el concepto, pero conviene tenerlo
// presente antes de copiar este patrón a otra tabla.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'regla-devolucion-cirugia';

// Casos que no dicen "cirugía" pero son lo mismo, agregados a mano y de a uno
// por decisión expresa. Van por (fuente, id_geclisa) y no por patrón: un
// patrón que atrape "DEVOLUCION TRANSFERENCIA" se llevaría puesto cualquier
// movimiento entre cuentas, y acá el que se equivoca borra plata de un informe.
const EXCEPCIONES = [
  // Devolución de una transferencia a un paciente. Paulo, 24/09/2026.
  { fuente: 'MovProv', id: 13368 }, // DEVOLUCION TRANSFERENCIA- PCTE. GARRO PEDRO · $120.000 · 23/07/2026
];

const listaExcepciones = EXCEPCIONES.length
  ? ` OR (${EXCEPCIONES.map((e) => `(g.fuente = '${e.fuente}' AND g.id_geclisa = ${e.id})`).join(' OR ')})`
  : '';

// Sobre la descripción de GECLISA, que es la fuente.
const FILTRO = `((g.descripcion ILIKE '%devoluc%' AND g.descripcion ILIKE '%cirug%')${listaExcepciones})`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Devoluciones de cirugía → no_es_gasto — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  // ---- Qué se va a tocar ----
  const alcance = await c.query(`
    SELECT trim(g.descripcion) AS desc, g.anio,
           count(*)::int n, sum(g.monto) AS total,
           count(*) FILTER (WHERE cl.id IS NULL)::int a_insertar,
           count(*) FILTER (WHERE cl.id IS NOT NULL AND cl.tipo_costo IS DISTINCT FROM 'no_es_gasto')::int a_corregir,
           count(*) FILTER (WHERE cl.tipo_costo = 'no_es_gasto')::int ya_ok
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE ${FILTRO}
     GROUP BY 1, 2 ORDER BY total DESC`);

  if (alcance.rows.length === 0) {
    console.log('No hay devoluciones de cirugía. Nada que hacer.');
    await c.end();
    return;
  }

  console.log('Comprobantes alcanzados:');
  for (const r of alcance.rows) {
    console.log(`  ${String(r.desc).slice(0, 34).padEnd(34)} ${r.anio} ${String(r.n).padStart(4)} `
      + `${ars(r.total).padStart(16)}  nuevas:${r.a_insertar} a corregir:${r.a_corregir} ya ok:${r.ya_ok}`);
  }

  const { rows: [t] } = await c.query(`
    SELECT count(*)::int n, sum(g.monto) AS total,
           COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo IN ('variable','fijo')), 0) AS contado_como_gasto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE ${FILTRO}`);
  console.log(`\n  TOTAL ${t.n} comprobantes · ${ars(t.total)}`);
  console.log(`  De eso, hoy se cuenta como gasto: ${ars(t.contado_como_gasto)}`);

  // ---- Control de que no nos llevamos puesto nada más ----
  const { rows: [afuera] } = await c.query(`
    SELECT count(*)::int n, COALESCE(sum(g.monto), 0) AS total
      FROM erogaciones_geclisa g
     WHERE g.descripcion ILIKE '%devoluc%' AND NOT ${FILTRO}`);
  console.log(`  Quedan AFUERA (otras devoluciones, sin criterio): ${afuera.n} · ${ars(afuera.total)}`);

  if (!WRITE) {
    console.log('\n(dry-run: agregá --write para aplicar)');
    await c.end();
    return;
  }

  // ---- Aplicar ----
  await c.query('BEGIN');
  try {
    // 1) Corregir las que ya están clasificadas de otra forma.
    //    `updated_at` no se toca a mano: lo maneja el trigger.
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

    // 2) Insertar las que no estaban clasificadas.
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

    // 3) Verificar ANTES de confirmar: si algo quedó sin marcar, no se commitea.
    const { rows: [chk] } = await c.query(`
      SELECT count(*) FILTER (WHERE cl.tipo_costo IS DISTINCT FROM 'no_es_gasto')::int mal,
             count(*)::int total
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${FILTRO}`);
    if (chk.mal > 0) throw new Error(`ABORTA: quedaron ${chk.mal} de ${chk.total} devoluciones sin marcar`);

    // Y que no se haya tocado nada fuera del alcance.
    const { rows: [otras] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion
       WHERE clasificado_por = $1
         AND id_geclisa NOT IN (SELECT g.id_geclisa FROM erogaciones_geclisa g WHERE ${FILTRO})`, [MARCA]);
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

  // ---- Qué cambió en los números del año ----
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
