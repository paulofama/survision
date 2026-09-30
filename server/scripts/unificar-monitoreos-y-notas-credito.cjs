// ============================================================
// Unificar monitoreos y notas de crédito
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/unificar-monitoreos-y-notas-credito.cjs           -> DRY-RUN
//   node scripts/unificar-monitoreos-y-notas-credito.cjs --write    -> aplica
//
// Autorizado por Paulo el 30/09/2026 después de ver los dos números.
//
// ESTO REESCRIBE CLASIFICACIONES YA HECHAS
// -----------------------------------------
// A diferencia de los scripts que sólo completan lo que falta, éste corrige
// filas que ya tenían destino. Los dos grupos salieron de buscar precedentes
// para la cola de conceptos pendientes: el mismo concepto estaba repartido en
// dos o tres destinos según por qué vía había entrado.
//
// 1. MONITOREOS → variable / honorarios (9 filas, $3.563.500)
// ------------------------------------------------------------
// Los nueve dicen "DR. TERCERO" — son honorarios de un médico, no un servicio
// contratado, y no hay ningún monitoreo de alarma en el lote (se revisó uno
// por uno antes de escribir). Estaban repartidos así:
//
//   · 6 en `fijo / Servicios` ($1.723.500) — entraron por caja, con
//     "Pago Proveedores" en la descripción, y el clasificador de pagos de caja
//     los leyó como un servicio más.
//   · 3 en `variable` sin subcategoría ($1.840.000) — entraron por regla y
//     nadie les puso la subcategoría.
//
// Mover 6 comprobantes de fijo a variable CAMBIA EL MARGEN: salen de la base
// de costos fijos y pasan a descontarse por atención. Es el punto del
// ejercicio, no un efecto lateral.
//
// 2. N.C. CANCELATORIA → no es gasto (15 filas, $462.000)
// --------------------------------------------------------
// Las quince tienen nombre de PACIENTE en el proveedor y "N.C. Cancelatoria:
// FAC 0004-…" en la descripción: son notas de crédito que anulan una factura
// al paciente. Eso es una devolución de cobranza, y el criterio de Paulo es
// que las devoluciones no son gasto — el mismo que ya se aplicó a las
// devoluciones de cirugía y a las de cobranza.
//
// Estaban 13 en `variable` sin subcategoría y 2 en `variable / honorarios`,
// que es lo peor de los dos mundos: una devolución contada como honorario
// médico infla el costo variable por atención.
//
// POR QUÉ LOS PATRONES ALCANZAN ACÁ
// ----------------------------------
// "MONITOREO" y "Cancelatoria" son palabras que en esta base significan una
// sola cosa: se verificaron las 24 filas una por una contra el listado. Aun
// así el script exige que los conteos y los importes den exacto antes de
// tocar nada, y si no dan, aborta sin escribir.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'unificar-monitoreos-nc-2026-09-30';

/** En caja el concepto vive en `proveedor_nombre`, en MovProv en
 *  `descripcion`: hay que mirar los dos o el resultado da cero. */
const enCualquiera = (p) =>
  `(cl.descripcion ILIKE '${p}' OR cl.proveedor_nombre ILIKE '${p}')`;

const GRUPOS = [
  {
    nombre: 'Monitoreos → variable / honorarios',
    // Lo que todavía NO está en variable/honorarios.
    donde: `${enCualquiera('%MONITOREO%')}
            AND (cl.tipo_costo IS DISTINCT FROM 'variable'
              OR cl.subcategoria_variable IS DISTINCT FROM 'honorarios')`,
    set: `SET tipo_costo = 'variable', es_costo_fijo = false,
              subcategoria_variable = 'honorarios', categoria_costo_fijo_id = NULL,
              clasificado_por = $1, clasificado_at = now(), auto_clasificado = false`,
    n: 9, monto: 3563500,
    por: 'los nueve dicen "DR. TERCERO": son honorarios médicos, no un servicio',
    // Después de escribir, no puede quedar ninguno afuera.
    queda: `${enCualquiera('%MONITOREO%')}
            AND (cl.tipo_costo IS DISTINCT FROM 'variable'
              OR cl.subcategoria_variable IS DISTINCT FROM 'honorarios')`,
  },
  {
    nombre: 'N.C. Cancelatoria → no es gasto',
    donde: `${enCualquiera('%Cancelatoria%')} AND cl.tipo_costo IS DISTINCT FROM 'no_es_gasto'`,
    set: `SET tipo_costo = 'no_es_gasto', es_costo_fijo = false,
              subcategoria_variable = NULL, categoria_costo_fijo_id = NULL,
              clasificado_por = $1, clasificado_at = now(), auto_clasificado = false`,
    n: 15, monto: 462000,
    por: 'nota de crédito al paciente: es devolución de cobranza, no gasto',
    queda: `${enCualquiera('%Cancelatoria%')} AND cl.tipo_costo IS DISTINCT FROM 'no_es_gasto'`,
  },
];

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Unificar monitoreos y notas de crédito — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  let problemas = 0;
  for (const g of GRUPOS) {
    const { rows: [r] } = await c.query(
      `SELECT count(*)::int n, COALESCE(sum(cl.monto), 0) tot
         FROM erogaciones_clasificacion cl WHERE ${g.donde}`);
    const ok = r.n === g.n && Math.round(Number(r.tot)) === g.monto;
    if (!ok) problemas++;
    console.log(`${ok ? ' ' : '✗'} ${g.nombre}`);
    console.log(`    ${String(r.n).padStart(3)} filas · ${ars(r.tot)}${ok ? '' : `   ESPERABA ${g.n} · ${ars(g.monto)}`}`);
    console.log(`    ${g.por}`);

    // De dónde vienen, que es lo que hace entender el efecto en el margen.
    const d = await c.query(`
      SELECT cl.tipo_costo tc, COALESCE(cl.subcategoria_variable, cf.nombre, '(sin subcategoría)') dest,
             count(*)::int n, sum(cl.monto) tot
        FROM erogaciones_clasificacion cl
        LEFT JOIN categorias_costo_fijo cf ON cf.id = cl.categoria_costo_fijo_id
       WHERE ${g.donde} GROUP BY 1, 2 ORDER BY tot DESC`);
    for (const x of d.rows) {
      console.log(`      desde ${String(x.tc + '/' + x.dest).padEnd(26)} ${String(x.n).padStart(3)} · ${ars(x.tot)}`);
    }
    console.log('');
  }

  if (problemas) {
    console.error(`ABORTA: ${problemas} grupo(s) no coinciden con lo relevado. Volvé a mirar antes de escribir.`);
    process.exitCode = 1; await c.end(); return;
  }
  if (!WRITE) { console.log('(dry-run: agregá --write para aplicar)'); await c.end(); return; }

  // Cuánto costo fijo se va a ir a variable, medido ANTES de tocar nada.
  const { rows: [antes] } = await c.query(`
    SELECT COALESCE(sum(cl.monto), 0) tot FROM erogaciones_clasificacion cl
     WHERE ${GRUPOS[0].donde} AND cl.tipo_costo = 'fijo'`);

  await c.query('BEGIN');
  try {
    let n = 0;
    for (const g of GRUPOS) {
      const r = await c.query(
        `UPDATE erogaciones_clasificacion cl ${g.set} WHERE ${g.donde} RETURNING cl.id`, [MARCA]);
      if (r.rowCount !== g.n) throw new Error(`${g.nombre}: movió ${r.rowCount}, esperaba ${g.n}`);
      n += r.rowCount;
    }

    // No puede quedar ninguno de los dos conceptos fuera de su destino.
    for (const g of GRUPOS) {
      const { rows: [q] } = await c.query(
        `SELECT count(*)::int n FROM erogaciones_clasificacion cl WHERE ${g.queda}`);
      if (q.n > 0) throw new Error(`${g.nombre}: quedaron ${q.n} sin mover`);
    }

    // Las unificaciones anteriores no pueden haberse desarmado.
    const { rows: [gu] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion cl
       WHERE (cl.descripcion ILIKE '%guardia%' OR cl.proveedor_nombre ILIKE '%guardia%')
         AND (cl.tipo_costo IS DISTINCT FROM 'variable' OR cl.subcategoria_variable IS DISTINCT FROM 'honorarios')
         AND COALESCE(cl.proveedor_nombre, '') NOT ILIKE '%CELULAR%'
         AND COALESCE(cl.descripcion, '') NOT ILIKE '%Dep%sito Bancario%'`);
    if (gu.n > 0) throw new Error(`${gu.n} guardia(s) salieron de variable/honorarios`);

    const { rows: [f9] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion
       WHERE (descripcion ILIKE '%931%' OR descripcion ILIKE '%FATSA%'
           OR proveedor_nombre ILIKE '%931%' OR proveedor_nombre ILIKE '%FATSA%')
         AND tipo_costo <> 'fijo'`);
    if (f9.n > 0) throw new Error(`${f9.n} F931/FATSA quedaron fuera de costos fijos`);

    await c.query('COMMIT');
    console.log(`Movidas: ${n}`);
    console.log(`Pasó de costo fijo a variable: ${ars(antes.tot)}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Sin cambios —', e.message);
    process.exitCode = 1; await c.end(); return;
  }

  const post = await c.query(`
    SELECT cl.tipo_costo tc, COALESCE(cl.subcategoria_variable, cf.nombre, '—') dest,
           count(*)::int n, sum(cl.monto) tot
      FROM erogaciones_clasificacion cl
      LEFT JOIN categorias_costo_fijo cf ON cf.id = cl.categoria_costo_fijo_id
     WHERE cl.clasificado_por = $1 GROUP BY 1, 2 ORDER BY tot DESC`, [MARCA]);
  console.log('\nCómo quedaron:');
  for (const x of post.rows) {
    console.log(`  ${String(x.tc + '/' + x.dest).padEnd(26)} ${String(x.n).padStart(3)} · ${ars(x.tot)}`);
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
