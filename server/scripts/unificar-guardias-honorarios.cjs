// ============================================================
// Las guardias del personal, todas a variable / honorarios
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/unificar-guardias-honorarios.cjs           -> DRY-RUN
//   node scripts/unificar-guardias-honorarios.cjs --write    -> aplica
//
// EL PROBLEMA QUE RESUELVE
// -------------------------
// La misma plata, a la misma persona, por lo mismo, estaba en dos lados
// según por dónde entró el comprobante:
//
//   · Por CAJA ("Gastos Dr. Roca" + "GUARDIA GISELA CORNUZ"): 76 filas que
//     el 25/09 quedaron en `fijo / Sueldos y Cargas`.
//   · Por PROVEEDORES (proveedor "ROCA LEANDRO" + obs "GUARDIAS GISELA"):
//     45 filas en `variable / honorarios`, varias clasificadas a mano.
//
// Criterio de Paulo, 27/09/2026: todo a variable / honorarios.
//
// POR QUÉ MUEVE SÓLO LAS DE CAJA
// -------------------------------
// Las otras ya están donde tienen que estar. Y NO toca las horas extras que
// se pagan directo por caja —"PAGO HORAS EXTRAS CLAUDIA-CELESTE"—, que son
// otra cosa: personal propio cobrando horas, no una guardia cargada a la
// cuenta de un prestador. Ésas se quedan en Sueldos y Cargas.
//
// El alcance es por MARCA y no por patrón de texto: son exactamente las que
// escribió `clasificar-gastos-por-medico.cjs`, ni una más. Un patrón sobre
// "guardia" se llevaba puestos los mandados de vianda al quirófano.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA_ORIGEN = 'gastos-por-medico-2026-09-25';
const MARCA = 'guardias-a-honorarios-2026-09-27';
const CAT_SUELDOS = 'ff6f48c6-0e03-43d1-9448-bd91a6a34901';

const ALCANCE = `cl.clasificado_por = '${MARCA_ORIGEN}'
             AND cl.categoria_costo_fijo_id = '${CAT_SUELDOS}'`;

/**
 * La cola: guardias que quedaron en otras categorías por corridas viejas
 * (`unificacion-2026-08-19`, manuales, la revisión de diciembre).
 *
 * DOS SE DEJAN AFUERA Y NO ES UN OLVIDO. Dicen "guardia" pero no son un pago
 * de guardia:
 *   · "CELULAR GUARDIA" ($12.500) es el teléfono del turno, un servicio.
 *   · "GUARDIA MARIELA ALEJANDRA" con descripción "Depósito Bancario"
 *     ($5.500) es un depósito, y ya está marcado no_es_gasto.
 * Un patrón sobre la palabra suelta se los lleva a los dos.
 */
// OJO CON EL NULL. La condición "todavía no está bien clasificada" se escribe
// con IS DISTINCT FROM y no con `NOT (tipo = 'variable' AND sub =
// 'honorarios')`: cuando `sub` es NULL, `sub = 'honorarios'` da NULL, el AND
// da NULL, el NOT da NULL, y el WHERE descarta la fila. Cuatro guardias que
// estaban en variable SIN subcategoría —justo las que había que arreglar— se
// quedaron afuera en la primera corrida sin que nada avisara.
const COLA = `(cl.descripcion ILIKE '%guardia%' OR cl.proveedor_nombre ILIKE '%guardia%'
            OR cl.descripcion ILIKE '%guarida%' OR cl.proveedor_nombre ILIKE '%guarida%')
          AND (cl.tipo_costo IS DISTINCT FROM 'variable'
            OR cl.subcategoria_variable IS DISTINCT FROM 'honorarios')
          AND COALESCE(cl.proveedor_nombre, '') NOT ILIKE '%CELULAR%'
          AND COALESCE(cl.descripcion, '') NOT ILIKE '%Dep%sito Bancario%'`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Guardias del personal → variable / honorarios — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  const { rows } = await c.query(`
    SELECT cl.anio, cl.mes, cl.fecha::date::text AS fecha, cl.proveedor_nombre AS quien,
           cl.descripcion AS desc, cl.monto
      FROM erogaciones_clasificacion cl
     WHERE ${ALCANCE} ORDER BY cl.monto DESC`);

  const total = rows.reduce((s, x) => s + Number(x.monto), 0);
  console.log(`A mover: ${rows.length} comprobantes · ${ars(total)}\n`);
  for (const x of rows.slice(0, 12)) {
    console.log(`  ${x.fecha} ${ars(x.monto).padStart(12)}  ${String(x.desc).slice(0, 20).padEnd(20)} ${String(x.quien || '').slice(0, 34)}`);
  }
  if (rows.length > 12) console.log(`  … y ${rows.length - 12} más`);

  const cola = await c.query(`
    SELECT cl.anio, cl.mes, cl.proveedor_nombre AS quien, cl.descripcion AS desc, cl.monto,
           cat.nombre AS cat, cl.clasificado_por
      FROM erogaciones_clasificacion cl
      LEFT JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
     WHERE ${COLA} ORDER BY cl.monto DESC`);
  const totalCola = cola.rows.reduce((s, x) => s + Number(x.monto), 0);
  console.log(`\nLa cola de corridas viejas: ${cola.rows.length} comprobantes · ${ars(totalCola)}`);
  for (const x of cola.rows.slice(0, 8)) {
    console.log(`  ${x.anio}-${String(x.mes).padStart(2, '0')} ${ars(x.monto).padStart(12)}  `
      + `${String(x.quien || '—').slice(0, 24).padEnd(24)} ${String(x.cat || '').padEnd(24)} ${x.clasificado_por}`);
  }
  if (cola.rows.length > 8) console.log(`  … y ${cola.rows.length - 8} más`);

  // Lo que NO se toca, para que se vea que se dejó afuera a propósito.
  const { rows: [fuera] } = await c.query(`
    SELECT count(*)::int n, COALESCE(sum(cl.monto), 0) AS total
      FROM erogaciones_clasificacion cl
     WHERE cl.categoria_costo_fijo_id = $1 AND cl.clasificado_por <> $2`, [CAT_SUELDOS, MARCA_ORIGEN]);
  console.log(`\nQueda en Sueldos y Cargas lo demás: ${fuera.n} comprobantes · ${ars(fuera.total)}`);
  console.log('  (horas extras pagadas directo por caja, F931, FATSA, sindicato)');

  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar)'); await c.end(); return; }

  await c.query('BEGIN');
  try {
    const aHonorarios = `SET tipo_costo = 'variable', es_costo_fijo = false,
                             subcategoria_variable = 'honorarios', categoria_costo_fijo_id = NULL,
                             clasificado_por = $1, clasificado_at = now(), auto_clasificado = false`;

    const r = await c.query(
      `UPDATE erogaciones_clasificacion cl ${aHonorarios} WHERE ${ALCANCE} RETURNING cl.id`, [MARCA]);
    const rc = await c.query(
      `UPDATE erogaciones_clasificacion cl ${aHonorarios} WHERE ${COLA} RETURNING cl.id`, [MARCA]);

    // Verificar: ningún F931 ni FATSA puede haberse movido de Sueldos y Cargas.
    const { rows: [chk] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_clasificacion
       WHERE (descripcion ILIKE '%931%' OR descripcion ILIKE '%FATSA%') AND tipo_costo <> 'fijo'`);
    if (chk.n > 0) throw new Error(`ABORTA: ${chk.n} F931/FATSA quedaron fuera de costos fijos`);

    await c.query('COMMIT');
    console.log(`\nMovidas: ${r.rowCount} de las de caja + ${rc.rowCount} de la cola = ${r.rowCount + rc.rowCount}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    return;
  }

  // El control mira los DOS campos: en caja el concepto va en
  // `proveedor_nombre` y en proveedores en `descripcion`. Mirar uno solo
  // devuelve cero y parece que no quedó nada, que fue lo que pasó la primera
  // vez que se corrió esto.
  const post = await c.query(`
    SELECT cl.tipo_costo, cl.subcategoria_variable AS sub, cat.nombre AS cat,
           count(*)::int n, sum(cl.monto) AS total
      FROM erogaciones_clasificacion cl
      LEFT JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
     WHERE cl.descripcion ILIKE '%guardia%' OR cl.proveedor_nombre ILIKE '%guardia%'
        OR cl.descripcion ILIKE '%guarida%' OR cl.proveedor_nombre ILIKE '%guarida%'
     GROUP BY 1, 2, 3 ORDER BY n DESC`);
  console.log('\nTodo lo que dice "guardia", dónde quedó:');
  for (const x of post.rows) {
    console.log(`  ${String(x.tipo_costo).padEnd(12)} ${String(x.sub || x.cat || '—').padEnd(24)} x${String(x.n).padStart(3)} · ${ars(x.total)}`);
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
