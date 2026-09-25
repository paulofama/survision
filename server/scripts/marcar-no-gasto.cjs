// ============================================================
// Salidas de caja que NO son gasto
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/marcar-no-gasto.cjs                  -> DRY-RUN
//   node scripts/marcar-no-gasto.cjs --write           -> aplica
//   node scripts/marcar-no-gasto.cjs --detalle         -> comprobante por comprobante
//   node scripts/marcar-no-gasto.cjs --regla=deposito  -> una sola familia
//
// No todo lo que sale de la caja es un costo. Hay dos cosas que salen y no lo
// son: lo que se le devuelve a un paciente (nunca fue nuestro) y la plata que
// se lleva al banco (sigue siendo nuestra, cambió de bolsillo). Ambas venían
// contándose como gasto e inflaban el costo del período.
//
// CADA FAMILIA ES UNA REGLA CON NOMBRE Y CON MARCA PROPIA
// --------------------------------------------------------
// La marca (`clasificado_por`) queda en cada fila, así que si mañana una
// familia resulta mal clasificada se la puede identificar y revertir sin
// tocar las otras. Y cada regla se cuenta aparte en la salida: un total
// agregado esconde que una regla se llevó puesto algo que no debía.
//
// ANTES DE AGREGAR UNA REGLA, MIRAR QUÉ AGARRA EN LA TABLA ENTERA.
// No lo que uno tiene en la cabeza: TODAS las descripciones que el patrón
// alcanza. Dos ejemplos de por qué:
//   · Un ILIKE '%devoluc%' suelto se lleva las devoluciones de material y de
//     insumos, que pueden ser créditos que RECIBIMOS y no salidas.
//   · Un ILIKE '%dep%sito%' suelto se lleva las señas de pacientes.
//
// Y OJO CON LA TABLA DE ORIGEN. En `MovValoresEnca` la descripción es el tipo
// de movimiento ("Depósito Bancario", "Tesoreria", "Anticipo Dr...",
// "Devolución Cobranza") — verificado. Pero en la tabla de caja de GECLISA el
// campo análogo es el MEDIO DE PAGO, y confundirlos nos costó marcar 1.009
// comprobantes por $154,9 M como "no es gasto" cuando sí lo eran. Verificarlo
// cada vez, no recordarlo.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const DETALLE = process.argv.includes('--detalle');
const SOLO = (process.argv.find((a) => a.startsWith('--regla=')) || '').split('=')[1] || null;

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
    clave: 'cirugia',
    nombre: 'Devolución de cirugía',
    marca: 'regla-devolucion-paciente',
    sql: `(g.descripcion ILIKE '%devoluc%' AND g.descripcion ILIKE '%cirug%')`,
  },
  {
    clave: 'reintegro',
    nombre: 'Reintegro al paciente',
    marca: 'regla-devolucion-paciente',
    // Verificado sobre la tabla entera: los 20 comprobantes con esta palabra
    // son todos devoluciones a un paciente. No hay reintegros de gastos a
    // empleados ni de obra social.
    sql: `g.descripcion ILIKE '%reintegr%'`,
  },
  {
    clave: 'cobranza',
    nombre: 'Devolución de cobranza',
    marca: 'regla-devolucion-paciente',
    // Plata cobrada a un paciente que después se le devolvió. La familia más
    // grande: 488 comprobantes. El `tipo_comprobante` lo respalda — 358 son
    // Nota de Crédito, 125 Reintegro. Criterio de Paulo, 25/09/2026.
    sql: `g.descripcion ILIKE 'Devoluci%n Cobranza%'`,
  },
  {
    clave: 'sena',
    nombre: 'Devolución de una seña',
    marca: 'regla-devolucion-paciente',
    // La seña que el paciente dejó para un estudio y se le devolvió. El
    // patrón arranca con "Devolución" a propósito: sin eso agarra los 976
    // "Depósito Bancario", que son otra cosa.
    sql: `g.descripcion ILIKE 'Devoluci%n Dep%sito%'`,
  },
  {
    clave: 'deposito',
    nombre: 'Depósito bancario',
    marca: 'regla-deposito-bancario',
    // Plata de la caja que se lleva al banco. No sale de la empresa: cambia
    // de bolsillo. Criterio de Paulo, 25/09/2026.
    //
    // Los 976 son `Egreso de Caja / Egresos de Caja`, sin excepción. El
    // patrón arranca con "Depósito" para no tocar las señas del paciente
    // ("Devolución Depósito...") ni los mandados al banco de $1.000, cuya
    // descripción es "Gastos Varios" y sí son un gasto.
    sql: `g.descripcion ILIKE 'Dep%sito Bancario%'`,
  },
];

if (EXCEPCIONES.length) {
  REGLAS.push({
    clave: 'manual',
    nombre: 'Casos agregados a mano',
    marca: 'regla-devolucion-paciente',
    sql: `(${EXCEPCIONES.map((e) => `(g.fuente = '${e.fuente}' AND g.id_geclisa = ${e.id})`).join(' OR ')})`,
  });
}

const ACTIVAS = SOLO ? REGLAS.filter((r) => r.clave === SOLO) : REGLAS;
if (ACTIVAS.length === 0) {
  console.error(`No existe la regla "${SOLO}". Hay: ${REGLAS.map((r) => r.clave).join(', ')}`);
  process.exit(1);
}
const FILTRO = `(${ACTIVAS.map((r) => r.sql).join(' OR ')})`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Salidas que no son gasto — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}`
    + `${SOLO ? ` · sólo la regla "${SOLO}"` : ''}\n`);

  console.log('Por regla:');
  for (const regla of ACTIVAS) {
    const { rows: [x] } = await c.query(`
      SELECT count(*)::int n, COALESCE(sum(g.monto), 0) AS total,
             count(*) FILTER (WHERE cl.tipo_costo IN ('variable','fijo'))::int como_gasto,
             COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo IN ('variable','fijo')), 0) AS monto_gasto,
             count(*) FILTER (WHERE cl.id IS NULL)::int sin_clasificar,
             count(*) FILTER (WHERE cl.tipo_costo = 'no_es_gasto')::int ya_ok
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${regla.sql}`);
    console.log(`  ${regla.nombre.padEnd(26)} ${String(x.n).padStart(5)} ${ars(x.total).padStart(16)}`
      + `   hoy gasto:${String(x.como_gasto).padStart(4)} (${ars(x.monto_gasto)})  sin:${x.sin_clasificar}  ok:${x.ya_ok}`);
  }

  const { rows: [t] } = await c.query(`
    SELECT count(*)::int n, COALESCE(sum(g.monto), 0) AS total,
           COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo IN ('variable','fijo')), 0) AS como_gasto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE ${FILTRO}`);
  console.log(`\n  TOTAL ${t.n} comprobantes · ${ars(t.total)}`);
  console.log(`  De eso, hoy se cuenta como gasto: ${ars(t.como_gasto)}`);

  // Lo que queda afuera, impreso siempre, para que se vea que está afuera
  // a propósito y no por olvido.
  const afuera = await c.query(`
    SELECT trim(g.descripcion) AS desc, count(*)::int n, sum(g.monto) AS total
      FROM erogaciones_geclisa g
     WHERE (g.descripcion ILIKE '%devoluc%' OR g.descripcion ILIKE '%reintegr%' OR g.descripcion ILIKE '%dep%sito%')
       AND NOT (${REGLAS.map((r) => r.sql).join(' OR ')})
     GROUP BY 1 ORDER BY total DESC`);
  if (afuera.rows.length) {
    console.log('\n  Queda AFUERA (sin criterio todavía):');
    for (const x of afuera.rows) console.log(`    ${String(x.n).padStart(4)} ${ars(x.total).padStart(14)}  ${x.desc}`);
  }

  if (DETALLE) {
    const d = await c.query(`
      SELECT g.fecha::date::text AS fecha, g.fuente, g.id_geclisa, trim(g.descripcion) AS desc, g.monto,
             COALESCE(cl.tipo_costo, 'sin clasificar') AS estado
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${FILTRO} ORDER BY g.monto DESC LIMIT 400`);
    console.log('\nDetalle (hasta 400):');
    for (const x of d.rows) {
      console.log(`  ${x.fecha}  ${ars(x.monto).padStart(14)}  ${x.estado.padEnd(15)} [${x.fuente}/${x.id_geclisa}]  ${x.desc}`);
    }
  }

  if (!WRITE) {
    console.log('\n(dry-run: agregá --write para aplicar)');
    await c.end();
    return;
  }

  // ---- Aplicar, regla por regla, todo en una transacción ----
  await c.query('BEGIN');
  try {
    let corregidas = 0;
    let nuevas = 0;
    for (const regla of ACTIVAS) {
      // `updated_at` no se toca a mano: lo maneja el trigger.
      const upd = await c.query(`
        UPDATE erogaciones_clasificacion cl
           SET tipo_costo = 'no_es_gasto', subcategoria_variable = NULL,
               es_costo_fijo = false, categoria_costo_fijo_id = NULL,
               clasificado_por = $1, clasificado_at = now(), auto_clasificado = true
          FROM erogaciones_geclisa g
         WHERE cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
           AND ${regla.sql} AND cl.tipo_costo IS DISTINCT FROM 'no_es_gasto'
         RETURNING cl.id`, [regla.marca]);

      const ins = await c.query(`
        INSERT INTO erogaciones_clasificacion
          (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
           categoria, es_costo_fijo, tipo_costo, clasificado_por, clasificado_at, auto_clasificado)
        SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
               COALESCE(g.categoria_sugerida, 'Egresos de Caja'), false, 'no_es_gasto', $1, now(), true
          FROM erogaciones_geclisa g
          LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
         WHERE ${regla.sql} AND cl.id IS NULL
        ON CONFLICT (fuente, id_geclisa) DO NOTHING
        RETURNING id`, [regla.marca]);

      corregidas += upd.rowCount;
      nuevas += ins.rowCount;
      console.log(`  ${regla.nombre.padEnd(26)} corregidas ${String(upd.rowCount).padStart(4)} · nuevas ${String(ins.rowCount).padStart(4)}`);
    }

    // Verificar antes de confirmar.
    const { rows: [chk] } = await c.query(`
      SELECT count(*) FILTER (WHERE cl.tipo_costo IS DISTINCT FROM 'no_es_gasto')::int mal, count(*)::int total
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE ${FILTRO}`);
    if (chk.mal > 0) throw new Error(`ABORTA: quedaron ${chk.mal} de ${chk.total} sin marcar`);

    for (const marca of [...new Set(ACTIVAS.map((r) => r.marca))]) {
      const reglasDeLaMarca = REGLAS.filter((r) => r.marca === marca).map((r) => r.sql).join(' OR ');
      const { rows: [otras] } = await c.query(`
        SELECT count(*)::int n FROM erogaciones_clasificacion cl
         WHERE cl.clasificado_por = $1
           AND NOT EXISTS (SELECT 1 FROM erogaciones_geclisa g
                            WHERE g.fuente = cl.fuente AND g.id_geclisa = cl.id_geclisa
                              AND (${reglasDeLaMarca}))`, [marca]);
      if (otras.n > 0) throw new Error(`ABORTA: la marca ${marca} tocó ${otras.n} filas fuera de sus reglas`);
    }

    await c.query('COMMIT');
    console.log(`\nTotal — corregidas: ${corregidas} · nuevas: ${nuevas}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    return;
  }

  const post = await c.query(`
    SELECT g.anio, count(*)::int total, count(cl.id)::int clasif,
           sum(g.monto) AS monto_total,
           COALESCE(sum(g.monto) FILTER (WHERE cl.id IS NULL), 0) AS monto_sin,
           COALESCE(sum(g.monto) FILTER (WHERE cl.tipo_costo IN ('variable','fijo')), 0) AS gasto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     GROUP BY g.anio ORDER BY g.anio`);
  console.log('\nPor año, después del cambio:');
  for (const r of post.rows) {
    const pct = ((1 - r.monto_sin / r.monto_total) * 100).toFixed(1);
    console.log(`  ${r.anio}: gasto ${ars(r.gasto)} · clasificado ${pct}% por plata · falta ${ars(r.monto_sin)}`);
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
