// ============================================================
// Las facturas sueltas, usando el tipo de proveedor de GECLISA
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-facturas-por-tipo-proveedor.cjs           -> DRY-RUN
//   node scripts/clasificar-facturas-por-tipo-proveedor.cjs --write    -> aplica
//
// 95 comprobantes por $8.846.358 cuya descripción es sólo el número de
// factura ("FC 1234"). El concepto no está escrito en ninguna parte.
//
// EL HALLAZGO: GECLISA YA CLASIFICA A SUS PROVEEDORES
// ----------------------------------------------------
// La tabla `Proveedores` tiene dos campos que nadie estaba mirando:
//
//   TipoProv: 1 Prestaciones de servicios · 3 Insumos
//             4 Insumos médicos · 5 Prestaciones de servicios médicos
//   ConcGan:  1 Bienes · 2 Profesionales liberales · 3 No gravada
//             4 Locación de servicios/obra · 5 Alquileres
//
// Los carga la administración al dar de alta al proveedor, para las
// retenciones. Es una clasificación mantenida por el ERP, mucho mejor que
// adivinar por el nombre — y se puede contrastar: Alcon es "Insumos
// médicos" y sus 160 comprobantes anteriores están en variable/insumos;
// Casado es "Insumos" y sus 64 están en Insumos de Oficina; Excimer Laser
// es "Servicios médicos" y sus 2 están en variable/honorarios. El campo
// coincide con lo que se venía haciendo a mano.
//
// EL ORDEN DE DECISIÓN
// ---------------------
//   1. Excepciones por nombre, para los casos donde el tipo de proveedor
//      no alcanza (los fletes figuran como "prestación de servicios", pero
//      acá van con los insumos que transportan).
//   2. PRECEDENTE del propio sistema, si el proveedor tiene al menos 3
//      comprobantes ya clasificados y el 70% coincide. Un precedente fuerte
//      le gana al tipo: Sammito Dino figura como "prestación de servicios"
//      pero sus 4 comprobantes están en Marketing, y es lo correcto.
//   3. TIPO DE PROVEEDOR de GECLISA.
//   4. `fijo / Otros` si no hay ninguna de las tres.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');
const db = require('../config/database');

const WRITE = process.argv.includes('--write');
const MARCA = 'facturas-tipo-proveedor-2026-09-25';

const CAT = {
  HONORARIOS: '2a79ffa8-f9c8-4ad7-a8d5-2ba15e702232',
  IMPUESTOS: '1c29d173-6b81-48a4-8a00-bd5a713609e9',
  INSUMOS_OFICINA: '4a0189b5-dc4d-475b-8315-3db327be6211',
  MANTENIMIENTO: 'b916822f-bd46-41b2-a789-3d7ccd3efbda',
  MARKETING: 'eabc0312-10ad-4b52-a1b5-38941f08ada1',
  OTROS: 'f7a7458c-32f4-4106-beda-e0537b7e902a',
  SERVICIOS: 'c8ac8a09-95bb-4c86-951d-d524e3444de1',
};

const fijo = (cat, nombre) => ({ tipo: 'fijo', cat, etiqueta: `fijo / ${nombre}` });
const variable = (sub) => ({ tipo: 'variable', sub, etiqueta: `variable / ${sub}` });

/** 1. Excepciones por nombre: van antes que todo. */
const EXCEPCIONES = [
  // Los fletes figuran en GECLISA como "prestación de servicios", pero en
  // este sistema acompañan a los insumos que transportan. Es el criterio que
  // ya se aplicó a las encomiendas de Andreani.
  { re: /ANDREANI|ANDESMAR|VIA CARGO|VIA BARILOCHE|EXPRESO|ISELIN|BUSPACK/i, ...variable('insumos'),
    por: 'flete: acompaña al insumo que transporta' },
  { re: /MUNIC/i, ...fijo(CAT.IMPUESTOS, 'Impuestos y Tasas'), por: 'tasa municipal' },
  // Identificado en los gastos de caja: es la verdulería del office.
  { re: /DIAZ ISAAC/i, ...fijo(CAT.OTROS, 'Otros'), por: 'verdulería del office' },
  // Alquiler de bienes muebles. NO va a la categoría Alquiler: ésa es el
  // testigo del alquiler mensual del inmueble y mezclarla la vuelve inútil
  // para detectar un mes sin alquiler.
  { re: /CUEVAS CARLOS/i, ...fijo(CAT.SERVICIOS, 'Servicios'), por: 'alquiler de bienes muebles' },
];

/** 3. El tipo de proveedor de GECLISA. */
function porTipoProveedor(tipoProv, concGan) {
  switch (tipoProv) {
    case 4: return { ...variable('insumos'), por: 'GECLISA: insumos médicos' };
    case 5: return { ...variable('honorarios'), por: 'GECLISA: prestación de servicios médicos' };
    case 3: return { ...fijo(CAT.INSUMOS_OFICINA, 'Insumos de Oficina'), por: 'GECLISA: insumos' };
    case 1:
      return concGan === 2
        ? { ...fijo(CAT.HONORARIOS, 'Honorarios Profesionales'), por: 'GECLISA: servicios de un profesional liberal' }
        : { ...fijo(CAT.SERVICIOS, 'Servicios'), por: 'GECLISA: prestación de servicios' };
    default: return null;
  }
}

const POR_DEFECTO = { ...fijo(CAT.OTROS, 'Otros'), por: 'sin tipo de proveedor ni precedente' };

/** Cómo se lee una clasificación ya existente, para poder compararla. */
const etiquetaDe = (r) => r.tipo_costo === 'fijo'
  ? `fijo / ${r.cat || 'Otros'}`
  : `${r.tipo_costo}${r.sub ? ' / ' + r.sub : ''}`;

const FILTRO = `g.descripcion ~* '^FC '
            AND ((g.anio > 2024) OR (g.anio = 2024 AND g.mes >= 10))
            AND NOT (g.anio = 2026 AND g.mes = 9)`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Facturas sueltas — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  const { rows } = await c.query(`
    SELECT g.fuente, g.id_geclisa, g.fecha::date::text AS fecha, trim(g.descripcion) AS desc,
           COALESCE(g.proveedor_nombre, '') AS quien, g.monto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE cl.id IS NULL AND ${FILTRO}
     ORDER BY g.monto DESC`);

  // El tipo de proveedor, de GECLISA.
  const prov = (await db.executeQuery(
    'SELECT LTRIM(RTRIM(Prov_Nombre)) AS nombre, tipoProv_id, concGan_id FROM Proveedores')).recordset;
  const tipos = new Map(prov.map((p) => [p.nombre.toUpperCase(), p]));

  // El precedente, del propio sistema.
  const hist = await c.query(`
    SELECT cl.proveedor_nombre AS quien, cl.tipo_costo, cl.subcategoria_variable AS sub,
           cat.nombre AS cat, count(*)::int n
      FROM erogaciones_clasificacion cl
      LEFT JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
     WHERE cl.proveedor_nombre IS NOT NULL
     GROUP BY 1, 2, 3, 4`);
  const porProveedor = new Map();
  for (const h of hist.rows) {
    const k = h.quien.trim().toUpperCase();
    if (!porProveedor.has(k)) porProveedor.set(k, []);
    porProveedor.get(k).push(h);
  }

  /** Precedente fuerte: 3+ comprobantes y 70% de acuerdo. */
  function precedenteFuerte(quien) {
    const h = porProveedor.get(quien.trim().toUpperCase());
    if (!h) return null;
    const total = h.reduce((s, x) => s + x.n, 0);
    if (total < 3) return null;
    const top = h.slice().sort((a, b) => b.n - a.n)[0];
    if (top.n / total < 0.7) return null;
    // Un precedente sin categoría ni subcategoría NO es un precedente: es el
    // default del auto-clasificador viejo, que marcaba 'variable' a secas.
    // Droguería BD tiene 24 así, y GECLISA dice que es insumos médicos — el
    // tipo de proveedor es mejor dato que 24 repeticiones de un default.
    if (top.tipo_costo === 'fijo' && !top.cat) return null;
    if (top.tipo_costo === 'variable' && !top.sub) return null;
    const catId = top.cat ? Object.entries(CAT).find(([, v]) => v)?.[1] : null;
    return {
      tipo: top.tipo_costo,
      sub: top.sub,
      catNombre: top.cat,
      etiqueta: etiquetaDe(top),
      por: `precedente: ${top.n} de ${total} comprobantes de este proveedor`,
      catId,
    };
  }

  // Para poder escribir un precedente hay que traducir el NOMBRE de la
  // categoría a su id. Se arma desde la base y no a mano, así una categoría
  // nueva no rompe el script.
  const cats = await c.query('SELECT id, nombre FROM categorias_costo_fijo');
  const idDeCat = new Map(cats.rows.map((x) => [x.nombre, x.id]));

  const plan = rows.map((x) => {
    const exc = EXCEPCIONES.find((e) => e.re.test(x.quien));
    if (exc) return { ...x, ...exc };

    const prec = precedenteFuerte(x.quien);
    if (prec) {
      return { ...x, tipo: prec.tipo, sub: prec.sub,
        cat: prec.catNombre ? idDeCat.get(prec.catNombre) : null,
        etiqueta: prec.etiqueta, por: prec.por };
    }

    const p = tipos.get(x.quien.trim().toUpperCase());
    const porTipo = p ? porTipoProveedor(p.tipoProv_id, p.concGan_id) : null;
    return { ...x, ...(porTipo || POR_DEFECTO) };
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
      console.log(`   ${p.fecha} ${ars(p.monto).padStart(13)}  ${String(p.quien).slice(0, 28).padEnd(28)} ${p.por}`);
    }
    if (mostrar.length < items.length) console.log(`   … y ${items.length - mostrar.length} más`);
    console.log('');
  }

  const sinNada = plan.filter((p) => p.por === POR_DEFECTO.por);
  if (sinNada.length) {
    console.log(`Sin tipo de proveedor NI precedente (${sinNada.length}):`);
    for (const p of sinNada) console.log(`   ${ars(p.monto).padStart(13)}  ${p.quien}`);
    console.log('');
  }

  console.log(`  TOTAL ${plan.length} comprobantes · ${ars(plan.reduce((s, p) => s + Number(p.monto), 0))}`);

  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar, --todo para el detalle)'); await c.end(); process.exit(0); }

  // El testigo del alquiler, medido ANTES. Se compara después contra este
  // número y no contra uno escrito a mano: una constante en el código se
  // desactualiza y el candado pasa a fallar por sí mismo en vez de por los
  // datos — pasó en la primera corrida de este script.
  const { rows: [alqAntes] } = await c.query(`
    SELECT count(DISTINCT (cl.anio, cl.mes))::int meses FROM erogaciones_clasificacion cl
      JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
     WHERE cat.nombre ILIKE '%alquiler%'`);

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
               COALESCE(g.categoria_sugerida, 'Gastos Proveedores'), $3, $4, $5, $6, $7, now(), false
          FROM erogaciones_geclisa g WHERE g.fuente = $1 AND g.id_geclisa = $2
        ON CONFLICT (fuente, id_geclisa) DO NOTHING RETURNING id`,
        [p.fuente, p.id_geclisa, p.tipo === 'fijo', p.tipo, p.tipo === 'variable' ? (p.sub || null) : null,
          p.tipo === 'fijo' ? (p.cat || CAT.OTROS) : null, MARCA]);
      n += r.rowCount;
    }

    const { rows: [chk] } = await c.query(`
      SELECT count(*)::int n FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE cl.id IS NULL AND ${FILTRO}`);
    if (chk.n > 0) throw new Error(`ABORTA: quedaron ${chk.n} sin clasificar`);

    // Y el alquiler no se puede haber tocado: es el testigo del control
    // mensual, y una factura suelta que caiga ahí lo vuelve inútil.
    const { rows: [alq] } = await c.query(`
      SELECT count(DISTINCT (cl.anio, cl.mes))::int meses FROM erogaciones_clasificacion cl
        JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
       WHERE cat.nombre ILIKE '%alquiler%'`);
    if (alq.meses !== alqAntes.meses) {
      throw new Error(`ABORTA: los meses con alquiler cambiaron (${alqAntes.meses} -> ${alq.meses})`);
    }

    await c.query('COMMIT');
    console.log(`\nClasificadas: ${n}`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    process.exit(1);
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
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
