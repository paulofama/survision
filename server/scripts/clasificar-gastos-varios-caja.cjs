// ============================================================
// Los "Gastos Varios" de caja
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-gastos-varios-caja.cjs           -> DRY-RUN
//   node scripts/clasificar-gastos-varios-caja.cjs --write    -> aplica
//
// 221 comprobantes por $7.338.870 en meses cerrados y comparables. Es la caja
// chica del día a día: mandados, desayunos, frutas, arreglos, horas extras.
//
// LAS REGLAS TIENEN QUE TOLERAR LOS ERRORES DE TIPEO
// ---------------------------------------------------
// Estos conceptos se escriben a mano, uno por uno, y están llenos de
// variantes: MANDADO / MADADO / MANDAADO / MANDADO MARCE / MANDAADO MARCELO;
// ENCOMIENDA / ENCOMINEDA / ENCAMIENDA; ALMUERZO / ALMUERO; CERRAJERIA /
// CERRAGERIA. Una regla que sólo acepte la forma correcta deja la mitad
// afuera, y lo que queda afuera no se ve: simplemente no se clasifica.
//
// EL ORDEN IMPORTA, Y ACÁ MÁS QUE NUNCA
// --------------------------------------
// "1 MANDADO MARCELO RETIRAR TONER" es un mandado, no un gasto de sistemas.
// "1 MANDADO MARCELO ALMUERZO" es un mandado, no un almuerzo. "ENCAMIENDA
// AVASTIN" es un flete, y da lo mismo porque las dos reglas terminan en
// insumos, pero conviene que el motivo quede bien escrito. Gana la primera
// regla que engancha, así que las más específicas van arriba.
//
// DOS COSAS QUE PARECEN LO MISMO Y NO LO SON
// -------------------------------------------
// "CAJA DE SEGURIDAD" (con sus typos) es la caja del banco: un abono
// mensual de $102.000, va a Servicios. "CAJA FUERTE" y "CERRADURA CAJA
// FUERTE" son el mueble del instituto: van a Mantenimiento.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'gastos-varios-caja-2026-09-25';

const CAT = {
  HONORARIOS: '2a79ffa8-f9c8-4ad7-a8d5-2ba15e702232',
  IMPUESTOS: '1c29d173-6b81-48a4-8a00-bd5a713609e9',
  LIMPIEZA: '54fff4c2-cdec-4fb1-88ea-c8f861170b72',
  MANTENIMIENTO: 'b916822f-bd46-41b2-a789-3d7ccd3efbda',
  OTROS: 'f7a7458c-32f4-4106-beda-e0537b7e902a',
  SEGUROS: 'c42a88e5-1e6c-4958-bd14-2bf825aa59c2',
  SERVICIOS: 'c8ac8a09-95bb-4c86-951d-d524e3444de1',
  SISTEMAS: '7f56d148-b60c-47ef-9889-3a12baaf5335',
  SUELDOS: 'ff6f48c6-0e03-43d1-9448-bd91a6a34901',
};

const fijo = (cat, nombre) => ({ tipo: 'fijo', cat, etiqueta: `fijo / ${nombre}` });
const variable = (sub) => ({ tipo: 'variable', sub, etiqueta: `variable / ${sub || 'sin subcategoría'}` });

/** EL ORDEN IMPORTA: gana la primera que engancha. */
const REGLAS = [
  // --- Mandados primero: se los lleva todo lo que diga "mandado", aunque
  //     además mencione un almuerzo o un toner. El mandado es el gasto. ---
  { re: /MAND[AI]{0,2}DO|MADADO|MANDAADO|CADETERIA|ENV[IÍ]O\s+MARCELO|PAGO ENV[IÍ]O/i,
    ...variable(null), por: 'precedente: 178 mandados en variable sin subcategoría' },

  // --- Costo laboral: horas extras y horas complementarias del personal ---
  // Va a `Sueldos y Cargas`, que el informe excluye en los meses donde el
  // módulo de Sueldos tiene datos propios: no puede duplicar.
  { re: /HORAS?\b|H\.?\s?EX\b|A CUENTA H\.?C|REEMPLAZO/i, ...fijo(CAT.SUELDOS, 'Sueldos y Cargas'),
    por: 'horas extras o complementarias del personal' },

  // --- Decisiones de Paulo de hoy ---
  { re: /CAMARA/i, ...fijo(CAT.MANTENIMIENTO, 'Mantenimiento'), por: 'Paulo: cámaras de seguridad son mejora del local' },
  { re: /DERECHOS?\s+SLT|ARGOS/i, ...variable('honorarios'), por: 'Paulo: derecho de uso del equipo' },

  // --- La caja del banco NO es la caja fuerte ---
  { re: /CAJA DE SEGURIDA/i, ...fijo(CAT.SERVICIOS, 'Servicios'), por: 'locación de la caja de seguridad del banco' },
  { re: /CAJA FUERTE|CERRADURA|CERRAJ|CERRAGERIA/i, ...fijo(CAT.MANTENIMIENTO, 'Mantenimiento'), por: 'cerrajería del local' },

  // --- Fletes y encomiendas, con sus typos ---
  { re: /ANDREANI|VIA CARGO|ISELIN|ENCOM[IEN]+DA|ENCAMIENDA|FLETE|TRASLADO/i, ...variable('insumos'),
    por: 'flete o encomienda' },

  // --- Insumos médicos ---
  { re: /JERI[MN]GA|LENTE DE CONTACTO|FARMACIA|DESCARTABLES|AVASTIN/i, ...variable('insumos'), por: 'insumo médico' },

  // --- Limpieza y ambiente ---
  { re: /JABONERIA|PERFUMIN|DIFUSOR|AROMATIZADOR|ART[IÍ]?C?U?L?O?\s?LIMPIEZA|PA[NÑ]UELITOS|VENENO HORMIGAS/i,
    ...fijo(CAT.LIMPIEZA, 'Limpieza'), por: 'limpieza y ambiente' },

  // --- Mantenimiento del local ---
  { re: /ARREGLO|MANO DE OBRA|TANQUE|CERAMICAS|SANITARIOS|GASISTA|REPARACION|HIERROSAN|TORNILLOS|CARTELERIA|MONTURA|SELLADORA|PILAS|ARENA MACETA|ORGANIZADOR/i,
    ...fijo(CAT.MANTENIMIENTO, 'Mantenimiento'), por: 'mantenimiento del local' },

  // --- Servicios ---
  { re: /BIDON/i, ...fijo(CAT.SERVICIOS, 'Servicios'), por: 'agua en bidones' },
  { re: /MUNICIPALIDAD|TASA/i, ...fijo(CAT.IMPUESTOS, 'Impuestos y Tasas'), por: 'tasa municipal' },
  { re: /MAPFRE/i, ...fijo(CAT.SEGUROS, 'Seguros'), por: 'seguro' },
  { re: /DOMIN[CI]{0,2}ILIO|DOMINIO|\.COM\.AR|TONER/i, ...fijo(CAT.SISTEMAS, 'Sistemas e Informática'),
    por: 'dominio web / insumo de impresión' },
  { re: /ESTUDIO JURIDICO|NOTARIAL/i, ...fijo(CAT.HONORARIOS, 'Honorarios Profesionales'), por: 'honorario profesional' },

  // --- Comida y gastos sociales: el grupo más numeroso ---
  { re: /DESAYUNO|ALMUER|ALMUERO|CENA|CUMPLE|MAPLE|HUEVO|FRUTA|VERDULERIA|GALLETA|CARAMELO|VIANDA|DELIVERY|LA SABROSA|LA DELICIA|PLATOS|CUBIERTOS|VINO|BRINDIS/i,
    ...fijo(CAT.OTROS, 'Otros'), por: 'comida y gastos sociales' },
];

const POR_DEFECTO = { ...fijo(CAT.OTROS, 'Otros'), por: 'concepto no identificado' };

const FILTRO = `g.descripcion = 'Gastos Varios'
            AND ((g.anio > 2024) OR (g.anio = 2024 AND g.mes >= 10))
            AND NOT (g.anio = 2026 AND g.mes = 9)`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`"Gastos Varios" de caja — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  const { rows } = await c.query(`
    SELECT g.fuente, g.id_geclisa, g.fecha::date::text AS fecha,
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

  const orden = [...grupos].sort((a, b) =>
    b[1].reduce((s, p) => s + Number(p.monto), 0) - a[1].reduce((s, p) => s + Number(p.monto), 0));

  for (const [etiqueta, items] of orden) {
    const t = items.reduce((s, p) => s + Number(p.monto), 0);
    console.log(`${etiqueta} — ${items.length} comprobante(s) · ${ars(t)}`);
    // Sólo los cinco más grandes de cada grupo: son 221 y la lista completa
    // no se lee. El detalle entero sale con --todo.
    const mostrar = process.argv.includes('--todo') ? items : items.slice(0, 5);
    for (const p of mostrar) {
      console.log(`   ${p.fecha} ${ars(p.monto).padStart(12)}  ${String(p.quien).slice(0, 36).padEnd(36)} ${p.por}`);
    }
    if (mostrar.length < items.length) console.log(`   … y ${items.length - mostrar.length} más`);
    console.log('');
  }

  const sinIdentificar = plan.filter((p) => p.por === 'concepto no identificado');
  if (sinIdentificar.length) {
    console.log(`Los ${sinIdentificar.length} que NO enganchó ninguna regla (van a Otros):`);
    for (const p of sinIdentificar) console.log(`   ${ars(p.monto).padStart(12)}  ${p.quien}`);
    console.log('');
  }

  console.log(`  TOTAL ${plan.length} comprobantes · ${ars(plan.reduce((s, p) => s + Number(p.monto), 0))}`);

  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar, --todo para ver el detalle completo)'); await c.end(); return; }

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
