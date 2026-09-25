// ============================================================
// Los honorarios de los prestadores van a variable / honorarios
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-honorarios-medicos.cjs           -> DRY-RUN
//   node scripts/clasificar-honorarios-medicos.cjs --write    -> aplica
//
// Criterio de Paulo, 25/09/2026. Parece un criterio simple y no lo es:
// "lo que le pagamos a un médico" NO es lo mismo que "honorarios médicos".
//
// POR QUÉ ESTE SCRIPT VA POR COMPROBANTE Y NO POR PROVEEDOR
// ---------------------------------------------------------
// Por la cuenta de los cuatro prestadores pasan tres cosas distintas:
//
//   1. HONORARIOS — la factura mensual. Es lo único que va a variable.
//   2. ALQUILER — Mercado factura además el inmueble, con su propia
//      numeración correlativa. En septiembre-2026 el alquiler es la FC 686
//      ($3.763.719) y los honorarios la FC 687 ($15.965.028): dos facturas
//      consecutivas, del mismo día, del mismo proveedor, y una va a FIJOS y
//      la otra a VARIABLES. Clasificar por proveedor manda el alquiler a
//      variable y el mes queda sin costo fijo de alquiler — ya pasó el
//      18/08/2026 con julio y agosto, y lo tuvo que arreglar la corrección
//      del 10/09.
//   3. GASTOS QUE NO SON DEL MÉDICO — guardias de las administrativas
//      (Carolina Martinez, Agostina Quiroga, Claudia Giuliani, Gisela
//      Cornuz), cumpleaños, viandas, quirófano, un pago al tenis club.
//      Salen por la cuenta del prestador pero no son su honorario.
//
// Por eso la lista de abajo es explícita, comprobante por comprobante, con su
// importe verificado. Son pocos y mueven $49 M: vale la pena escribirlos.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'honorarios-medicos-2026-09-25';

// Cada entrada lleva el importe esperado: si GECLISA cambió el comprobante
// entre que se relevó y se corre esto, el script aborta en vez de marcar otra
// cosa.
const HONORARIOS = [
  // Facturas mensuales de los cuatro prestadores, 14/09/2026.
  { fuente: 'MovProv', id: 13723, monto: 15965028, quien: 'MERCADO JORGE IGNACIO', desc: 'FC 687' },
  { fuente: 'MovProv', id: 13719, monto: 14417295, quien: 'MAHIA PABLO', desc: 'FC 239' },
  { fuente: 'MovProv', id: 13721, monto: 9506853, quien: 'MUSA CARLOS ALBERTO', desc: 'FC 271' },
  { fuente: 'MovProv', id: 13725, monto: 7221723, quien: 'ROCA LEANDRO', desc: 'FC 840' },
  // Anticipo de honorarios, 04/12/2025. La descripción lo dice.
  { fuente: 'MovValoresEnca', id: 134501, monto: 2000000, quien: 'ANTICIPO DR. MERCADO', desc: 'Anticipo dr Honotarios Dr Mercado' },
];

// Quedan deliberadamente AFUERA, y conviene dejar dicho por qué:
//   · GUARDIA <nombre> / QUIROFANO <nombre> — le pagan a una administrativa
//     por la cuenta del médico. Es costo de personal, no honorario.
//   · CUMPLEAÑOS / DESAYUNO / VIANDA / TENIS CLUB — gastos sociales.
//   · PAGO DERIVACIONES MAHIA — derivaciones, otro circuito.
//   · ANTICIPPO ($60.000, Roca, 02/09/2026) — podría ser un anticipo de
//     honorarios, pero la descripción no alcanza para afirmarlo. Sin criterio.

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Honorarios de prestadores → variable / honorarios — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  // ---- Verificar uno por uno contra la base ----
  let problemas = 0;
  let total = 0;
  for (const h of HONORARIOS) {
    const { rows } = await c.query(`
      SELECT g.fecha::date::text AS fecha, g.proveedor_nombre, trim(g.descripcion) AS desc, g.monto,
             COALESCE(cl.tipo_costo, 'sin clasificar') AS estado, cl.subcategoria_variable AS sub
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE g.fuente = $1 AND g.id_geclisa = $2`, [h.fuente, h.id]);

    if (rows.length === 0) { console.log(`  FALTA  [${h.fuente}/${h.id}] no existe en GECLISA`); problemas++; continue; }
    const r = rows[0];
    const coincide = Math.round(Number(r.monto)) === h.monto;
    total += Number(r.monto);
    console.log(`  ${coincide ? 'ok   ' : 'MONTO'} ${r.fecha}  ${ars(r.monto).padStart(15)}  `
      + `${String(r.proveedor_nombre).slice(0, 24).padEnd(24)} ${String(r.desc).slice(0, 34).padEnd(34)} ${r.estado}${r.sub ? '/' + r.sub : ''}`);
    if (!coincide) { console.log(`         esperaba ${ars(h.monto)} — el comprobante cambió`); problemas++; }
  }
  console.log(`\n  ${HONORARIOS.length} comprobantes · ${ars(total)}`);

  if (problemas) {
    console.error(`\nABORTA: ${problemas} comprobante(s) no coinciden con lo relevado. Revisar antes de escribir.`);
    process.exitCode = 1;
    await c.end();
    return;
  }

  // ---- Control: que el alquiler siga siendo alquiler ----
  const { rows: [alq] } = await c.query(`
    SELECT count(*)::int meses, COALESCE(sum(cl.monto), 0) AS total
      FROM erogaciones_clasificacion cl
      JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
     WHERE cat.nombre ILIKE '%alquiler%' AND cl.anio = 2026`);
  console.log(`  Alquiler 2026 antes: ${alq.meses} comprobantes · ${ars(alq.total)}`);

  if (!WRITE) {
    console.log('\n(dry-run: agregá --write para aplicar)');
    await c.end();
    return;
  }

  await c.query('BEGIN');
  try {
    const pares = HONORARIOS.map((h) => `('${h.fuente}', ${h.id})`).join(', ');

    // `updated_at` no se toca a mano: lo maneja el trigger.
    const upd = await c.query(`
      UPDATE erogaciones_clasificacion
         SET tipo_costo = 'variable', subcategoria_variable = 'honorarios',
             es_costo_fijo = false, categoria_costo_fijo_id = NULL,
             clasificado_por = $1, clasificado_at = now(), auto_clasificado = false
       WHERE (fuente, id_geclisa) IN (${pares})
         AND (tipo_costo IS DISTINCT FROM 'variable' OR subcategoria_variable IS DISTINCT FROM 'honorarios')
       RETURNING id`, [MARCA]);

    const ins = await c.query(`
      INSERT INTO erogaciones_clasificacion
        (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
         categoria, es_costo_fijo, tipo_costo, subcategoria_variable, clasificado_por, clasificado_at, auto_clasificado)
      SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
             COALESCE(g.categoria_sugerida, 'Honorarios Profesionales'), false, 'variable', 'honorarios', $1, now(), false
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE (g.fuente, g.id_geclisa) IN (${pares}) AND cl.id IS NULL
      ON CONFLICT (fuente, id_geclisa) DO NOTHING
      RETURNING id`, [MARCA]);

    // Verificar antes de confirmar: los cinco tienen que estar bien.
    const { rows: [chk] } = await c.query(`
      SELECT count(*) FILTER (WHERE cl.tipo_costo = 'variable' AND cl.subcategoria_variable = 'honorarios')::int ok,
             count(*)::int total
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE (g.fuente, g.id_geclisa) IN (${pares})`);
    if (chk.ok !== HONORARIOS.length) {
      throw new Error(`ABORTA: quedaron ${chk.ok} de ${chk.total} como honorarios`);
    }

    // Y el alquiler no se puede haber movido.
    const { rows: [alq2] } = await c.query(`
      SELECT count(*)::int meses, COALESCE(sum(cl.monto), 0) AS total
        FROM erogaciones_clasificacion cl
        JOIN categorias_costo_fijo cat ON cat.id = cl.categoria_costo_fijo_id
       WHERE cat.nombre ILIKE '%alquiler%' AND cl.anio = 2026`);
    if (alq2.meses !== alq.meses || Number(alq2.total) !== Number(alq.total)) {
      throw new Error(`ABORTA: el alquiler de 2026 cambió (${alq.meses}→${alq2.meses} comprobantes)`);
    }

    await c.query('COMMIT');
    console.log(`\nCorregidas: ${upd.rowCount} · Nuevas: ${ins.rowCount}`);
    console.log(`Alquiler 2026 después: ${alq2.meses} comprobantes · ${ars(alq2.total)} (sin cambios)`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
  }

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
