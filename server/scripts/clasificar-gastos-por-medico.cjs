// ============================================================
// Los "Gastos Dr. <nombre>" de caja
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-gastos-por-medico.cjs           -> DRY-RUN
//   node scripts/clasificar-gastos-por-medico.cjs --write    -> aplica
//
// 209 comprobantes por $4.828.044. Son gastos que salen de caja cargados a
// la cuenta de cada prestador: Mercado 53, Roca 103, Mahía 41, Musa 12.
//
// Criterio de Paulo, 25/09/2026: son gastos del instituto, van a COSTO FIJO.
//
// TRES SE SACAN APARTE, PORQUE CHOCAN CON CRITERIOS QUE ÉL YA DIO
// ----------------------------------------------------------------
// El criterio se dio sobre el grupo, antes de ver el detalle. Adentro hay
// tres comprobantes que si se marcan como costo fijo contradicen decisiones
// anteriores del propio Paulo:
//
//   · REINTEGRO PTE MUNITA IVANA ($30.000) y REINTEGRO PTE GARCIA FRANCO
//     ($25.000). Son devoluciones a pacientes, y eso NO es gasto — criterio
//     del 24/09. Van a `no_es_gasto`.
//   · LIO VIVITY PAC. MERCADO GUSTAVO ($1.922.319). Es una lente
//     intraocular para un paciente con nombre y apellido: es un insumo del
//     acto quirúrgico y acompaña al volumen. Va a `variable / insumos`.
//     Es además el comprobante más grande del grupo — el 40% del total.
//
// Lo demás sí va a fijo. Dentro de fijo se separa en dos:
//   · GUARDIAS Y HORAS de las administrativas (Gisela Cornuz, Romina
//     Villar, Claudia, Carolina, Agostina, Celeste) cargadas a la cuenta del
//     médico: 76 comprobantes, $1.969.265. Son costo de personal, van a
//     `Sueldos y Cargas` — categoría que el informe excluye en los meses
//     donde el módulo de Sueldos tiene datos propios, así que no duplica.
//   · EL RESTO (comida, tenis, viandas, adelantos, aceite de oliva) a
//     `Otros`.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'gastos-por-medico-2026-09-25';

const CAT_OTROS = 'f7a7458c-32f4-4106-beda-e0537b7e902a';
const CAT_SUELDOS = 'ff6f48c6-0e03-43d1-9448-bd91a6a34901';

const REGLAS = [
  // Las excepciones van primero.
  { re: /REINTEGR|DEVOLUC|\bPTE\b|PACIENTE/i, tipo: 'no_es_gasto', etiqueta: 'no es gasto',
    por: 'devolución a un paciente (criterio del 24/09)' },
  { re: /\bLIO\b|LENTE|VIVITY|INSUMO|FARMACIA|MEDICAM/i, tipo: 'variable', sub: 'insumos',
    etiqueta: 'variable / insumos', por: 'insumo del acto quirúrgico' },

  // Y después el grueso, que sí es fijo.
  { re: /GUARDIA|GUARIDA|HORA|QUIROFANO|CLINICA DEL VALLE|INST VALLE/i, tipo: 'fijo', cat: CAT_SUELDOS,
    etiqueta: 'fijo / Sueldos y Cargas', por: 'guardias y horas del personal' },
];

const POR_DEFECTO = { tipo: 'fijo', cat: CAT_OTROS, etiqueta: 'fijo / Otros', por: 'gasto del instituto (Paulo, 25/09)' };

const FILTRO = `g.descripcion ILIKE 'Gastos Dr%'
            AND ((g.anio > 2024) OR (g.anio = 2024 AND g.mes >= 10))
            AND NOT (g.anio = 2026 AND g.mes = 9)`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`"Gastos Dr. <nombre>" — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  const { rows } = await c.query(`
    SELECT g.fuente, g.id_geclisa, g.fecha::date::text AS fecha, trim(g.descripcion) AS desc,
           COALESCE(g.proveedor_nombre, '') AS quien, g.monto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE cl.id IS NULL AND ${FILTRO}
     ORDER BY g.monto DESC`);

  const plan = rows.map((x) => {
    const r = REGLAS.find((rg) => rg.re.test(x.quien));
    return { ...x, ...(r || POR_DEFECTO) };
  });

  const grupos = new Map();
  for (const p of plan) {
    if (!grupos.has(p.etiqueta)) grupos.set(p.etiqueta, []);
    grupos.get(p.etiqueta).push(p);
  }

  for (const [etiqueta, items] of [...grupos].sort((a, b) =>
    b[1].reduce((s, p) => s + Number(p.monto), 0) - a[1].reduce((s, p) => s + Number(p.monto), 0))) {
    const t = items.reduce((s, p) => s + Number(p.monto), 0);
    console.log(`${etiqueta} — ${items.length} comprobante(s) · ${ars(t)}`);
    const mostrar = process.argv.includes('--todo') ? items : items.slice(0, 6);
    for (const p of mostrar) {
      console.log(`   ${p.fecha} ${ars(p.monto).padStart(12)}  ${String(p.desc).slice(0, 18).padEnd(18)} ${String(p.quien).slice(0, 34)}`);
    }
    if (mostrar.length < items.length) console.log(`   … y ${items.length - mostrar.length} más`);
    console.log('');
  }

  console.log(`  TOTAL ${plan.length} comprobantes · ${ars(plan.reduce((s, p) => s + Number(p.monto), 0))}`);

  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar, --todo para el detalle)'); await c.end(); return; }

  await c.query('BEGIN');
  try {
    let n = 0;
    for (const p of plan) {
      const r = await c.query(`
        INSERT INTO erogaciones_clasificacion
          (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
           categoria, es_costo_fijo, tipo_costo, subcategoria_variable, categoria_costo_fijo_id,
           clasificado_por, clasificado_at, auto_clasificado)
        SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
               COALESCE(g.categoria_sugerida, 'Egresos de Caja'), $3, $4, $5, $6, $7, now(), false
          FROM erogaciones_geclisa g WHERE g.fuente = $1 AND g.id_geclisa = $2
        ON CONFLICT (fuente, id_geclisa) DO NOTHING RETURNING id`,
        [p.fuente, p.id_geclisa, p.tipo === 'fijo', p.tipo, p.tipo === 'variable' ? p.sub : null,
          p.tipo === 'fijo' ? p.cat : null, MARCA]);
      n += r.rowCount;
    }

    const { rows: [chk] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE cl.id IS NULL AND ${FILTRO}`);
    if (chk.n > 0) throw new Error(`ABORTA: quedaron ${chk.n} sin clasificar`);

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
