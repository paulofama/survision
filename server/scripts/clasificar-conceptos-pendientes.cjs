// ============================================================
// Los conceptos que el auto-clasificador no puede resolver solo
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-conceptos-pendientes.cjs           -> DRY-RUN
//   node scripts/clasificar-conceptos-pendientes.cjs --write    -> aplica
//
// POR QUÉ QUEDARON AFUERA
// ------------------------
// El auto-clasificador aprende por proveedor. Estos once conceptos no tienen
// proveedor útil —la mitad son filas de caja donde el campo trae el nombre
// del PACIENTE, no de un proveedor— o lo tienen con histórico ambiguo. Van a
// mano, cada uno con el precedente que lo respalda.
//
// LOS DOS QUE MÁS IMPORTAN
// -------------------------
//   · VEP ARCA 931 ($2,85 M) es la declaración de cargas sociales, no un
//     impuesto cualquiera. Va a Sueldos y Cargas, como los 12 anteriores
//     ($35,2 M). El VEP de ATM, que es la Administración Tributaria de
//     Mendoza, sí va a Impuestos y Tasas: son dos cosas distintas que
//     empiezan igual, y confundirlas ya pasó una vez.
//
//   · MONITOREOS son honorarios de un médico, no un servicio contratado. El
//     histórico lo dice con todas las letras: "MONITOREOS DR. TERCERO". Van a
//     variable/honorarios.
//
// DOS INCONSISTENCIAS QUE ESTO DESTAPA Y **NO** TOCA
// ---------------------------------------------------
// Al buscar los precedentes aparecieron comprobantes YA clasificados que no
// coinciden con el criterio que se aplica acá. Este script no los toca —
// reclasificar lo ya decidido es otra decisión, y es de Paulo:
//
//   · MONITOREOS: 6 en `fijo / Servicios` ($1,72 M) y 3 en `variable` sin
//     subcategoría ($1,84 M), todos del mismo Dr. Tercero que acá va a
//     honorarios.
//   · N.C. Cancelatoria: 13 en `variable` sin subcategoría ($377.000), cuando
//     una nota de crédito al paciente es una devolución de cobranza y el
//     criterio de Paulo es que las devoluciones no son gasto.
//
// El script los CUENTA y los informa al final, para que la decisión se tome
// mirando el número.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'conceptos-pendientes-2026-09-30';

const CAT = {
  SUELDOS: 'ff6f48c6-0e03-43d1-9448-bd91a6a34901',
  IMPUESTOS: '1c29d173-6b81-48a4-8a00-bd5a713609e9',
  SERVICIOS: 'c8ac8a09-95bb-4c86-951d-d524e3444de1',
  MARKETING: 'eabc0312-10ad-4b52-a1b5-38941f08ada1',
};

/** Un patrón que mira los dos campos: en caja el concepto vive en
 *  `proveedor_nombre`, en MovProv en `descripcion`. Mirar uno solo devuelve
 *  cero y parece que no hay nada. */
const enCualquiera = (p) =>
  `(g.descripcion ILIKE '${p}' OR g.proveedor_nombre ILIKE '${p}')`;

const GRUPOS = [
  {
    nombre: 'VEP ARCA 931 → fijo / Sueldos y Cargas',
    sql: enCualquiera('%VEP ARCA 931%'),
    n: 1, monto: 2850353,
    tipo: 'fijo', cat: CAT.SUELDOS, sub: null,
    por: 'el F931 es la declaración de cargas sociales · precedente 12x $35,2 M',
  },
  {
    nombre: 'ARCA VEP ATM → fijo / Impuestos y Tasas',
    sql: enCualquiera('%ARCA VEP ATM%'),
    n: 1, monto: 765315,
    tipo: 'fijo', cat: CAT.IMPUESTOS, sub: null,
    por: 'ATM es la Administración Tributaria de Mendoza · precedente 29x $23,2 M',
  },
  {
    nombre: 'Día de la Sanidad → fijo / Sueldos y Cargas',
    sql: enCualquiera('%DIA DE LA SANIDAD%'),
    n: 2, monto: 1132770,
    tipo: 'fijo', cat: CAT.SUELDOS, sub: null,
    por: '"Día de la Sanidad" es un concepto del propio módulo de Sueldos',
  },
  {
    nombre: 'N.C. Cancelatoria → no es gasto',
    sql: enCualquiera('%Cancelatoria%'),
    n: 30, monto: 2865783,
    tipo: 'no_es_gasto', cat: null, sub: null,
    por: 'nota de crédito al paciente: revierte facturación, es devolución de cobranza',
  },
  {
    nombre: 'Atención Ambulatoria → no es gasto',
    sql: enCualquiera('%Atenci_n Ambulatoria%'),
    n: 8, monto: 2777800,
    tipo: 'no_es_gasto', cat: null, sub: null,
    por: 'precedente 17x unánime ($1,23 M)',
  },
  {
    nombre: 'Monitoreos → variable / honorarios',
    sql: enCualquiera('%MONITOREO%'),
    n: 7, monto: 2403900,
    tipo: 'variable', cat: null, sub: 'honorarios',
    por: 'el histórico los nombra: "MONITOREOS DR. TERCERO" · son honorarios médicos',
  },
  {
    nombre: 'Derivaciones → variable / honorarios',
    sql: enCualquiera('%DERIVACIONES%'),
    n: 5, monto: 1261578,
    tipo: 'variable', cat: null, sub: 'honorarios',
    por: 'precedente 53x $13,1 M',
  },
  {
    nombre: 'Honorarios Ignacia Oliva → variable / honorarios',
    sql: enCualquiera('%IGNACIA OLIVA%'),
    n: 3, monto: 963750,
    tipo: 'variable', cat: null, sub: 'honorarios',
    por: 'precedente 27x $7,07 M',
  },
  {
    nombre: 'Publicidad LV4 → fijo / Marketing y Publicidad',
    sql: enCualquiera('%PUBLICIDAD%'),
    n: 4, monto: 960000,
    tipo: 'fijo', cat: CAT.MARKETING, sub: null,
    por: 'precedente 7x $1,45 M',
  },
  {
    nombre: 'Locación caja de seguridad → fijo / Servicios',
    sql: enCualquiera('%CAJA SEGURIDAD%'),
    n: 6, monto: 651473,
    tipo: 'fijo', cat: CAT.SERVICIOS, sub: null,
    por: 'alquiler de caja de seguridad bancaria: es un servicio del banco',
  },
  {
    nombre: 'Devolución de pago de cirugía → no es gasto',
    sql: enCualquiera('%DEVOLUCION PAGO CIRUGIA%'),
    n: 1, monto: 537000,
    tipo: 'no_es_gasto', cat: null, sub: null,
    por: 'criterio de Paulo · precedente 48x $79,35 M',
  },
];

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

const SIN_CLASIFICAR = `FROM erogaciones_geclisa g
  LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
 WHERE cl.id IS NULL`;

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Conceptos pendientes — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  let problemas = 0;
  for (const g of GRUPOS) {
    const { rows: [r] } = await c.query(
      `SELECT count(*)::int n, COALESCE(sum(g.monto), 0) tot ${SIN_CLASIFICAR} AND ${g.sql}`);
    const ok = r.n === g.n && Math.round(Number(r.tot)) === g.monto;
    if (!ok) problemas++;
    console.log(`${ok ? ' ' : '✗'} ${g.nombre}`);
    console.log(`    ${String(r.n).padStart(3)} comp · ${ars(r.tot)}${ok ? '' : `   ESPERABA ${g.n} comp · ${ars(g.monto)}`}`);
    console.log(`    ${g.por}\n`);
  }

  // Los patrones tienen que ser disjuntos: si dos agarran la misma fila, el
  // segundo INSERT no hace nada y la fila queda con el destino del primero
  // sin que nadie se entere.
  const union = GRUPOS.map((g) => g.sql).join(' OR ');
  const { rows: [u] } = await c.query(
    `SELECT count(*)::int n, COALESCE(sum(g.monto), 0) tot ${SIN_CLASIFICAR} AND (${union})`);
  const sumaN = GRUPOS.reduce((s, g) => s + g.n, 0);
  const sumaM = GRUPOS.reduce((s, g) => s + g.monto, 0);
  console.log(`  TOTAL ${u.n} comprobantes · ${ars(u.tot)}`);
  if (u.n !== sumaN) {
    console.log(`  ABORTA: los grupos suman ${sumaN} pero la unión da ${u.n} — hay solapamiento.`);
    problemas++;
  }
  if (Math.round(Number(u.tot)) !== sumaM) {
    console.log(`  ABORTA: la unión suma ${ars(u.tot)} y los grupos ${ars(sumaM)}.`);
    problemas++;
  }

  if (problemas) {
    console.error(`\nABORTA: ${problemas} grupo(s) no coinciden con lo relevado. Volvé a mirar antes de escribir.`);
    process.exitCode = 1; await c.end(); return;
  }
  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar)'); await c.end(); return; }

  await c.query('BEGIN');
  try {
    let n = 0;
    for (const g of GRUPOS) {
      const r = await c.query(`
        INSERT INTO erogaciones_clasificacion
          (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
           categoria, es_costo_fijo, tipo_costo, subcategoria_variable, categoria_costo_fijo_id,
           clasificado_por, clasificado_at, auto_clasificado)
        SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
               COALESCE(g.categoria_sugerida, 'Egresos de Caja'), $1, $2, $3, $4, $5, now(), false
          ${SIN_CLASIFICAR} AND ${g.sql}
        ON CONFLICT (fuente, id_geclisa) DO NOTHING`,
        [g.tipo === 'fijo', g.tipo, g.sub, g.cat, MARCA]);
      if (r.rowCount !== g.n) throw new Error(`${g.nombre}: escribió ${r.rowCount}, esperaba ${g.n}`);
      n += r.rowCount;
    }
    if (n !== sumaN) throw new Error(`escribió ${n} de ${sumaN}`);

    // No puede haber quedado ninguno de estos conceptos sin clasificar.
    const { rows: [q] } = await c.query(
      `SELECT count(*)::int n ${SIN_CLASIFICAR} AND (${union})`);
    if (q.n > 0) throw new Error(`quedaron ${q.n} comprobantes de estos conceptos sin clasificar`);

    await c.query('COMMIT');
    console.log(`\nClasificadas: ${n}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1; await c.end(); return;
  }

  // ---------------------------------------------------------
  // Lo que este script NO tocó, pero conviene mirar.
  // ---------------------------------------------------------
  console.log('\nInconsistencias en lo YA clasificado (este script no las toca):');
  const inc = await c.query(`
    SELECT 'MONITOREOS fuera de honorarios' etiqueta, count(*)::int n, COALESCE(sum(cl.monto), 0) tot
      FROM erogaciones_clasificacion cl
     WHERE (cl.descripcion ILIKE '%MONITOREO%' OR cl.proveedor_nombre ILIKE '%MONITOREO%')
       AND cl.clasificado_por IS DISTINCT FROM $1
       AND (cl.tipo_costo IS DISTINCT FROM 'variable' OR cl.subcategoria_variable IS DISTINCT FROM 'honorarios')
    UNION ALL
    SELECT 'N.C. Cancelatoria contadas como gasto', count(*)::int, COALESCE(sum(cl.monto), 0)
      FROM erogaciones_clasificacion cl
     WHERE (cl.descripcion ILIKE '%Cancelatoria%' OR cl.proveedor_nombre ILIKE '%Cancelatoria%')
       AND cl.clasificado_por IS DISTINCT FROM $1
       AND cl.tipo_costo IS DISTINCT FROM 'no_es_gasto'`, [MARCA]);
  for (const x of inc.rows) console.log(`  ${String(x.etiqueta).padEnd(40)} ${String(x.n).padStart(3)} comp · ${ars(x.tot)}`);

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
