// ============================================================
// Los "Pago Proveedores" de caja
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-pago-proveedores-caja.cjs           -> DRY-RUN
//   node scripts/clasificar-pago-proveedores-caja.cjs --write    -> aplica
//
// 132 comprobantes por $15.892.970 en meses cerrados y comparables.
//
// POR QUÉ NO SIRVE EL AUTO-CLASIFICADOR ACÁ
// ------------------------------------------
// En estos movimientos la DESCRIPCIÓN es siempre la misma —"Pago
// Proveedores", que es el tipo de movimiento— y el proveedor real está en
// `proveedor_nombre`, escrito a mano y distinto cada vez: "MONITOREOS
// NOV/DICIEMBRE", "MONITOR. TERCERO", "MONIT. DR. TERCERO", "MONOT. TERCERO
// ENERO/FEBRER" y "RESTO MONITOREOS DR. TECERO" son el mismo proveedor. El
// histórico por nombre exacto encontró precedente para 28 de 132.
//
// Entonces las reglas son por CONCEPTO, en orden, y la primera que engancha
// gana. El orden importa: "ANDESMAR (FARMACIA COLON)" tiene que caer en
// fletes y no en farmacia.
//
// LO QUE NO SE SABE VA A `fijo / Otros`, A PROPÓSITO
// ---------------------------------------------------
// Hay una veintena de proveedores que no sé qué venden —CUEVAS CARLOS
// FERNANDO, ATOMO BALLOFET, GARCIA DUEÑA, BIDCOM, FENIX, GUIAR—. Contarlos
// como costo baja el margen; dejarlos sin clasificar lo sube. Entre
// equivocarse para un lado o para el otro, se elige el que no infla el
// resultado. El script los lista aparte para que se puedan corregir desde la
// pantalla.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'pago-proveedores-caja-2026-09-25';

const CAT = {
  IMPUESTOS: '1c29d173-6b81-48a4-8a00-bd5a713609e9',
  LIMPIEZA: '54fff4c2-cdec-4fb1-88ea-c8f861170b72',
  MANTENIMIENTO: 'b916822f-bd46-41b2-a789-3d7ccd3efbda',
  OTROS: 'f7a7458c-32f4-4106-beda-e0537b7e902a',
  SEGUROS: 'c42a88e5-1e6c-4958-bd14-2bf825aa59c2',
  SERVICIOS: 'c8ac8a09-95bb-4c86-951d-d524e3444de1',
  SUELDOS: 'ff6f48c6-0e03-43d1-9448-bd91a6a34901',
};

const fijo = (cat, nombre) => ({ tipo: 'fijo', cat, etiqueta: `fijo / ${nombre}` });
const variable = (sub) => ({ tipo: 'variable', sub, etiqueta: `variable / ${sub}` });
const noEsGasto = () => ({ tipo: 'no_es_gasto', etiqueta: 'no es gasto' });

/** EL ORDEN IMPORTA: gana la primera que engancha. */
const REGLAS = [
  // --- Decisiones de Paulo, 25/09/2026 ---
  { re: /REINTEGRO\s+DR\.?\s*MERCADO/i, ...noEsGasto(), por: 'Paulo: devolución de plata adelantada, no un costo' },
  { re: /SED\s+CAMARAS/i, ...fijo(CAT.MANTENIMIENTO, 'Mantenimiento'), por: 'Paulo: mejora del local' },
  { re: /TRASLADO\s+EQUIPOS/i, ...variable('insumos'), por: 'Paulo: va con los fletes' },

  // --- Criterios que Paulo ya había dado en este mismo trabajo ---
  // Todas las formas de escribir "monitoreo del Dr. Tercero", incluidos los
  // errores de tipeo. Ya decidió que un abono de alarma es un servicio.
  { re: /MONIT|MONOT/i, ...fijo(CAT.SERVICIOS, 'Servicios'), por: 'Paulo: abono de alarma' },
  { re: /OFTALMOS|EXCIMER|GARABET|DERECHO.*LASER|DERECHOS.*(ARGOS|SLT)|ARGOS.*PRK/i, ...variable('honorarios'),
    por: 'Paulo: derecho de uso del equipo y técnicos' },

  // --- Costo laboral ---
  // Va a `Sueldos y Cargas`, que el informe EXCLUYE en los meses donde el
  // módulo de Sueldos tiene datos propios: no puede duplicar.
  { re: /SUELDO|RODRIGUEZ ROSITA|NANCY NARAMBUENA/i, ...fijo(CAT.SUELDOS, 'Sueldos y Cargas'), por: 'pago de sueldo' },

  // --- Servicios y abonos recurrentes ---
  { re: /MOVISTAR|TELEFON|CELULAR|AGUAS? MENDOCINAS?|CAJA DE SEGURIDAD|DSI EN LINEA/i,
    ...fijo(CAT.SERVICIOS, 'Servicios'), por: 'abono recurrente' },
  { re: /MUNICIPALIDAD/i, ...fijo(CAT.IMPUESTOS, 'Impuestos y Tasas'), por: 'tasa municipal' },
  { re: /EMERGENCIA|ESRM/i, ...fijo(CAT.SEGUROS, 'Seguros'), por: 'precedente: 23 casos en Seguros' },

  // --- Fletes y encomiendas: antes que farmacia, por "ANDESMAR (FARMACIA COLON)" ---
  { re: /ANDREANI|ANDESMAR|EXPRESO MALARG|BUSPACK|VIA CARGO|ISELIN|FULL TRACK|CEPAK/i,
    ...variable('insumos'), por: 'precedente: 7 encomiendas en variable/insumos' },

  // --- Insumos ---
  { re: /FARMACIA|DESCARTABLES/i, ...variable('insumos'), por: 'insumo médico' },

  // --- Local ---
  { re: /JABONERIA/i, ...fijo(CAT.LIMPIEZA, 'Limpieza'), por: 'artículos de limpieza' },
  { re: /ELECTRONICA RAMON|FERRETERIA|SANTA MARIA|MATAFUEGO/i, ...fijo(CAT.MANTENIMIENTO, 'Mantenimiento'),
    por: 'mantenimiento del local' },
];

/** Lo que no engancha con ninguna regla. */
const POR_DEFECTO = { ...fijo(CAT.OTROS, 'Otros'), por: 'proveedor no identificado' };

const FILTRO = `g.descripcion = 'Pago Proveedores'
            AND ((g.anio > 2024) OR (g.anio = 2024 AND g.mes >= 10))
            AND NOT (g.anio = 2026 AND g.mes = 9)`;

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`"Pago Proveedores" de caja — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  const { rows } = await c.query(`
    SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha::date::text AS fecha,
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
    for (const p of items) {
      console.log(`   ${p.fecha} ${ars(p.monto).padStart(13)}  ${String(p.quien).slice(0, 34).padEnd(34)} ${p.por}`);
    }
    console.log('');
  }

  console.log(`  TOTAL ${plan.length} comprobantes · ${ars(plan.reduce((s, p) => s + Number(p.monto), 0))}`);

  if (!WRITE) { console.log('\n(dry-run: agregá --write para aplicar)'); await c.end(); return; }

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
    SELECT g.anio, g.mes, sum(g.monto) AS total, COALESCE(sum(g.monto) FILTER (WHERE cl.id IS NULL), 0) AS sin
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE g.anio IN (2024, 2025) AND ((g.anio > 2024) OR g.mes >= 10)
     GROUP BY g.anio, g.mes ORDER BY g.anio, g.mes`);
  console.log('\nMeses comparables, lo que queda sin clasificar:');
  for (const x of post.rows) {
    const pct = Number(x.sin) / Number(x.total) * 100;
    console.log(`  ${x.anio}-${String(x.mes).padStart(2)}: ${ars(x.sin).padStart(14)} (${pct.toFixed(1)}%)${pct >= 5 ? '  <-- arriba del 5%' : ''}`);
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
