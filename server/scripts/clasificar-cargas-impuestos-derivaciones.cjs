// ============================================================
// Cuatro conceptos con criterio: VEP, FATSA, tesorería y derivaciones
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-cargas-impuestos-derivaciones.cjs          -> DRY-RUN
//   node scripts/clasificar-cargas-impuestos-derivaciones.cjs --write   -> aplica
//
// Los cuatro conceptos de erogaciones donde el criterio ya está decidido, y
// que juntos son la mayor parte de lo que falta clasificar en 2025.
//
// EL VEP SE DECIDE POR LO QUE DICE, NO POR LO QUE SALE
// ----------------------------------------------------
// Hay dos formas de clasificar estos pagos a ARCA y las dos están en el
// sistema. La buena es por descripción, y es la que Paulo venía usando a
// mano:
//
//   "VEP ARCA 931"          -> Sueldos y Cargas   (20 casos previos)
//   "VEP SANIDAD CONVENIO"  -> Sueldos y Cargas
//   "VEP ARCA GANANCIAS"    -> Impuestos y Tasas  (6 casos, todos $700.861)
//   "VEP ATM / ING. BRUTOS" -> Impuestos y Tasas
//   "VEP ARCA" a secas      -> Impuestos y Tasas  (5 casos manuales de Paulo,
//                                                  uno de $1.818.057)
//
// La mala es por importe: los VEP grandes suelen ser el 931 y los chicos
// otros impuestos, pero eso es una correlación, no una regla. Un mes con
// menos nómina o un plan de pago la rompe, y el error no se ve — el número
// queda creíble y en el lugar equivocado.
//
// LO QUE ESTE SCRIPT ADEMÁS CORRIGE
// ----------------------------------
// $16.440.081 de VEP y FATSA que el auto-clasificador dejó en
// `variable/honorarios`, incluidos TRES F931 por $8.794.325. Un F931 es
// costo laboral fijo: en variable no suma a los costos fijos, infla el
// resultado operativo del mes, y encima ensucia el panel de conciliación de
// honorarios, que lee por subcategoría.
//
// LO QUE NO TOCA, Y POR QUÉ
// --------------------------
// Los 45 movimientos "Tesoreria" que están en `variable/honorarios` por
// $116.266.099. Parecen el mismo caso que los 6 que sí se clasifican acá,
// pero NO lo son: esos 45 tienen nombre de médico (Mercado, Mahía, Roca,
// Musa) y son honorarios pagados por tesorería. Los 6 de acá son
// movimientos internos de caja —"RINDICION CAJA QUIROFANO", "TESOREERIA
// 17/09"— sin contraparte. La diferencia es el proveedor, no la descripción.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'cargas-impuestos-2026-09-25';

const CAT_IMPUESTOS = '1c29d173-6b81-48a4-8a00-bd5a713609e9';
const CAT_SUELDOS = 'ff6f48c6-0e03-43d1-9448-bd91a6a34901';

/**
 * A qué categoría va un pago a ARCA/ATM/sindicato, según lo que dice el
 * comprobante. El ORDEN IMPORTA: "VEP ARCA 931" contiene las dos cosas y
 * tiene que ganar el 931.
 */
function destinoTributario(desc) {
  const d = (desc || '').toUpperCase();
  if (d.includes('931')) return { cat: CAT_SUELDOS, por: 'F.931: aportes y contribuciones' };
  if (d.includes('SANIDAD') || d.includes('FATSA')) return { cat: CAT_SUELDOS, por: 'sindicato: costo laboral' };
  if (d.includes('GANANCIA')) return { cat: CAT_IMPUESTOS, por: 'ganancias' };
  if (d.includes('ATM') || d.includes('INGRESOS BRUTOS') || d.includes(' IB')) return { cat: CAT_IMPUESTOS, por: 'ingresos brutos' };
  if (d.includes('IVA')) return { cat: CAT_IMPUESTOS, por: 'IVA' };
  if (d.includes('RUBRICA') || d.includes('LIBRO SUELDO')) return { cat: CAT_IMPUESTOS, por: 'tasa de rúbrica del libro de sueldos' };
  if (d.includes('VEP') || d.includes('ARCA')) return { cat: CAT_IMPUESTOS, por: 'VEP sin identificar: va a Impuestos, como los 5 que clasificó Paulo a mano' };
  return null;
}

// Los 6 movimientos internos de tesorería, por id y no por patrón: el patrón
// se llevaría puestos los 45 que son honorarios de médicos.
const TESORERIA_INTERNA = [
  { f: 'MovValoresEnca', id: 125770, m: 2083750, d: 'RINDICION CAJA QUIROFANO' },
  { f: 'MovValoresEnca', id: 127721, m: 1157700, d: 'CAJA CIRGIA 28/05/2025' },
  { f: 'MovValoresEnca', id: 131261, m: 706500, d: 'TESOREERIA 17/09' },
  { f: 'MovValoresEnca', id: 129250, m: 541000, d: 'TEOSRERIA 15/07' },
  { f: 'MovValoresEnca', id: 125525, m: 539000, d: 'TESARERIA' },
  { f: 'MovValoresEnca', id: 126775, m: 312000, d: 'TESAORERIA' },
];

const TRIBUTARIO = `(g.descripcion ILIKE '%VEP%' OR g.descripcion ILIKE '%ARCA%'
                  OR g.descripcion ILIKE '%931%' OR g.descripcion ILIKE '%FATSA%')`;
const DERIVACIONES = `(g.descripcion ILIKE '%deriv%' OR g.proveedor_nombre ILIKE '%deriv%')`;
// El mes en curso queda afuera: todavía se está cargando.
const CERRADOS = `NOT (g.anio = 2026 AND g.mes = 9)`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Cargas, impuestos y derivaciones — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  // ---- 1. Tributarios: sin clasificar + mal clasificados ----
  const trib = await c.query(`
    SELECT g.fuente, g.id_geclisa, g.anio, g.mes, trim(COALESCE(g.descripcion, '')) AS desc, g.monto,
           cl.id AS cl_id, cl.tipo_costo, cl.subcategoria_variable AS sub
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE ${TRIBUTARIO} AND ${CERRADOS}
       AND (cl.id IS NULL OR cl.categoria_costo_fijo_id IS NULL)
     ORDER BY g.monto DESC`);

  const plan = [];
  const sinRegla = [];
  for (const x of trib.rows) {
    const d = destinoTributario(x.desc);
    if (!d) { sinRegla.push(x); continue; }
    plan.push({ ...x, ...d, accion: x.cl_id ? 'corregir' : 'nueva' });
  }

  const porCat = new Map();
  for (const p of plan) {
    const k = p.cat === CAT_SUELDOS ? 'Sueldos y Cargas' : 'Impuestos y Tasas';
    if (!porCat.has(k)) porCat.set(k, []);
    porCat.get(k).push(p);
  }
  for (const [cat, items] of porCat) {
    const t = items.reduce((s, p) => s + Number(p.monto), 0);
    console.log(`fijo / ${cat} — ${items.length} comprobantes · ${ars(t)}`);
    for (const p of items) {
      console.log(`   ${p.anio}-${String(p.mes).padStart(2)} ${ars(p.monto).padStart(14)}  ${p.accion === 'corregir' ? 'CORRIGE' : 'nueva  '}`
        + ` ${String(p.desc).slice(0, 30).padEnd(30)} ${p.por}`);
    }
    console.log('');
  }
  if (sinRegla.length) {
    console.log(`  ${sinRegla.length} tributarios SIN regla (se dejan como están):`);
    for (const x of sinRegla) console.log(`     ${ars(x.monto).padStart(14)}  ${x.desc}`);
  }

  // ---- 2. Tesorería interna ----
  console.log(`\nno es gasto — ${TESORERIA_INTERNA.length} movimientos internos de tesorería`);
  let problemas = 0;
  for (const t of TESORERIA_INTERNA) {
    const { rows } = await c.query(
      `SELECT monto, proveedor_nombre FROM erogaciones_geclisa WHERE fuente = $1 AND id_geclisa = $2`, [t.f, t.id]);
    if (rows.length === 0 || Math.round(Number(rows[0].monto)) !== t.m) {
      console.log(`   MONTO  [${t.f}/${t.id}] ${t.d}`); problemas++; continue;
    }
    console.log(`   ${ars(t.m).padStart(14)}  ${t.d}`);
  }

  // ---- 3. Derivaciones ----
  const deriv = await c.query(`
    SELECT count(*)::int n, COALESCE(sum(g.monto), 0) AS total
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE cl.id IS NULL AND ${DERIVACIONES} AND ${CERRADOS}`);
  console.log(`\nvariable / honorarios — ${deriv.rows[0].n} derivaciones · ${ars(deriv.rows[0].total)}`);

  const total = plan.reduce((s, p) => s + Number(p.monto), 0)
    + TESORERIA_INTERNA.reduce((s, t) => s + t.m, 0) + Number(deriv.rows[0].total);
  console.log(`\n  TOTAL a mover: ${ars(total)}`);

  if (problemas) { console.error(`\nABORTA: ${problemas} importe(s) no coinciden.`); process.exitCode = 1; await c.end(); return; }
  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar)'); await c.end(); return; }

  // ---- Aplicar ----
  await c.query('BEGIN');
  try {
    let nuevas = 0, corregidas = 0;

    for (const p of plan) {
      if (p.cl_id) {
        await c.query(`
          UPDATE erogaciones_clasificacion
             SET tipo_costo = 'fijo', es_costo_fijo = true, subcategoria_variable = NULL,
                 categoria_costo_fijo_id = $2, clasificado_por = $3, clasificado_at = now(), auto_clasificado = false
           WHERE id = $1`, [p.cl_id, p.cat, MARCA]);
        corregidas++;
      } else {
        const r = await c.query(`
          INSERT INTO erogaciones_clasificacion
            (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
             categoria, es_costo_fijo, tipo_costo, categoria_costo_fijo_id, clasificado_por, clasificado_at, auto_clasificado)
          SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
                 COALESCE(g.categoria_sugerida, 'Gastos Proveedores'), true, 'fijo', $3, $4, now(), false
            FROM erogaciones_geclisa g WHERE g.fuente = $1 AND g.id_geclisa = $2
          ON CONFLICT (fuente, id_geclisa) DO NOTHING RETURNING id`, [p.fuente, p.id_geclisa, p.cat, MARCA]);
        nuevas += r.rowCount;
      }
    }

    for (const t of TESORERIA_INTERNA) {
      const r = await c.query(`
        INSERT INTO erogaciones_clasificacion
          (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
           categoria, es_costo_fijo, tipo_costo, clasificado_por, clasificado_at, auto_clasificado)
        SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
               COALESCE(g.categoria_sugerida, 'Egresos de Caja'), false, 'no_es_gasto', $3, now(), false
          FROM erogaciones_geclisa g WHERE g.fuente = $1 AND g.id_geclisa = $2
        ON CONFLICT (fuente, id_geclisa) DO NOTHING RETURNING id`, [t.f, t.id, MARCA]);
      nuevas += r.rowCount;
    }

    const rd = await c.query(`
      INSERT INTO erogaciones_clasificacion
        (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
         categoria, es_costo_fijo, tipo_costo, subcategoria_variable, clasificado_por, clasificado_at, auto_clasificado)
      SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
             COALESCE(g.categoria_sugerida, 'Honorarios Profesionales'), false, 'variable', 'honorarios', $1, now(), false
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE cl.id IS NULL AND ${DERIVACIONES} AND ${CERRADOS}
      ON CONFLICT (fuente, id_geclisa) DO NOTHING RETURNING id`, [MARCA]);
    nuevas += rd.rowCount;

    // Verificar antes de confirmar: ningún F931 puede haber quedado en variable.
    const { rows: [mal] } = await c.query(`
      SELECT count(*)::int n, COALESCE(sum(monto), 0) AS total
        FROM erogaciones_clasificacion
       WHERE descripcion ILIKE '%931%' AND tipo_costo <> 'fijo'`);
    if (mal.n > 0) throw new Error(`ABORTA: quedan ${mal.n} F931 fuera de costos fijos (${ars(mal.total)})`);

    // Y los 45 de tesorería con médico tienen que seguir intactos.
    const { rows: [tes] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion
       WHERE descripcion ILIKE 'Tesoreria%' AND tipo_costo = 'variable'`);
    if (tes.n !== 45) throw new Error(`ABORTA: los movimientos de tesorería con médico cambiaron (45 -> ${tes.n})`);

    await c.query('COMMIT');
    console.log(`\nNuevas: ${nuevas} · Corregidas: ${corregidas}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    return;
  }

  const post = await c.query(`
    SELECT g.anio, g.mes, sum(g.monto) AS monto_total,
           COALESCE(sum(g.monto) FILTER (WHERE cl.id IS NULL), 0) AS monto_sin
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE g.anio = 2025 GROUP BY g.anio, g.mes ORDER BY g.mes`);
  console.log('\n2025, lo que queda sin clasificar por mes:');
  for (const x of post.rows) {
    const pct = Number(x.monto_sin) / Number(x.monto_total) * 100;
    console.log(`  ${String(x.mes).padStart(2)}: ${ars(x.monto_sin).padStart(15)} (${pct.toFixed(1)}%)${pct >= 5 ? '  <-- sigue arriba del 5%' : ''}`);
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
