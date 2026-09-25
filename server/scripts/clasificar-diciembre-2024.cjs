// ============================================================
// Las 46 erogaciones que faltaban de diciembre-2024
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-diciembre-2024.cjs           -> DRY-RUN
//   node scripts/clasificar-diciembre-2024.cjs --write    -> aplica
//
// Diciembre-2024 tenía 46 de 164 comprobantes sin clasificar por $3.704.686,
// el 8% del gasto del mes: por encima del umbral del 5%, así que el mes venía
// con el aviso de costos incompletos y no se podía comparar.
//
// CÓMO SE DECIDIÓ CADA UNO
// ------------------------
// No por proveedor. En `MovValoresEnca` el "proveedor" es texto libre escrito
// a mano —"4 GUARDIA CELESTE G.", "REGALO MARIANELA", "2 MAPLES DE HUEVOS"—
// así que el auto-clasificador por histórico no engancha: de los 46 encontró
// precedente para UNO.
//
// Entonces va comprobante por comprobante, y cada uno con su fundamento:
//
//   · PRECEDENTE UNÁNIME del propio sistema (Movistar 48 casos → Servicios,
//     Agua Mendocina 13 → Servicios, Emergencia S.R 23 → Seguros, mandados
//     178 → variable sin subcategoría).
//   · DECISIÓN DE PAULO del 25/09/2026 para los cuatro conceptos donde el
//     sistema se contradecía solo. Están marcados abajo.
//   · CONCEPTO, cuando no hay precedente pero el comprobante lo dice (una tasa
//     municipal es Impuestos y Tasas).
//   · `fijo / Otros` para los proveedores que no sé qué venden. Es la
//     dirección conservadora: contarlo como costo baja el margen, dejarlo sin
//     clasificar lo sube. Están listados aparte para que Paulo los corrija
//     desde la pantalla si sabe qué son.
//
// Cada entrada lleva el importe esperado: si el comprobante cambió en GECLISA
// entre que se relevó y se corre esto, aborta en vez de marcar otra cosa.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const WRITE = process.argv.includes('--write');
const MARCA = 'dic-2024-revision-manual';

const CAT = {
  DERIVACIONES: '123c2e3c-e549-4201-ad43-461cdefa0aaf',
  DILIGENCIAS: '59cdd762-a4fc-40d5-ab39-82f8c944fa3a',
  IMPUESTOS: '1c29d173-6b81-48a4-8a00-bd5a713609e9',
  MANTENIMIENTO: 'b916822f-bd46-41b2-a789-3d7ccd3efbda',
  OTROS: 'f7a7458c-32f4-4106-beda-e0537b7e902a',
  SEGUROS: 'c42a88e5-1e6c-4958-bd14-2bf825aa59c2',
  SERVICIOS: 'c8ac8a09-95bb-4c86-951d-d524e3444de1',
  SUELDOS: 'ff6f48c6-0e03-43d1-9448-bd91a6a34901',
};

/** fijo(categoría) y variable(subcategoría), para que la lista se lea. */
const fijo = (cat) => ({ tipo: 'fijo', cat });
const variable = (sub = null) => ({ tipo: 'variable', sub });

const PLAN = [
  // ---- Decisiones de Paulo, 25/09/2026 ----
  { f: 'MovProv', id: 7336, m: 1438595, d: 'VEP ARCA CONSOLIDADO', ...fijo(CAT.IMPUESTOS), por: 'Paulo: un VEP consolidado junta varios impuestos y no se puede separar la parte de seguridad social' },
  { f: 'MovValoresEnca', id: 121554, m: 394060, d: 'DERECHO USO LASER OFTALMOS', ...variable('honorarios'), por: 'Paulo: se paga por uso, acompaña al volumen de prácticas' },
  { f: 'MovValoresEnca', id: 121553, m: 100000, d: 'TECNICOS OFTALMOS. GARABET', ...variable('honorarios'), por: 'Paulo: ídem derecho de uso' },
  { f: 'MovValoresEnca', id: 120209, m: 356000, d: 'MONITOR TERCERO OCTUBRE', ...fijo(CAT.SERVICIOS), por: 'Paulo: es un abono de alarma, no un honorario (corrige el precedente)' },
  { f: 'MovValoresEnca', id: 120212, m: 49400, d: 'MONITOREO TERCERO SEPTIEMBRE', ...fijo(CAT.SERVICIOS), por: 'Paulo: ídem monitoreo' },
  { f: 'MovValoresEnca', id: 118956, m: 158000, d: 'DERIVACIONES DR. LOPEZ', ...variable('honorarios'), por: 'Paulo: se paga por paciente derivado' },
  { f: 'MovValoresEnca', id: 120196, m: 95000, d: 'DRIV. DR. LOPEZ', ...variable('honorarios'), por: 'Paulo: ídem derivaciones' },

  // ---- Precedente unánime del sistema ----
  { f: 'MovValoresEnca', id: 120417, m: 58280, d: 'MOVISTAR', ...fijo(CAT.SERVICIOS), por: 'precedente: 48 casos de telefonía en Servicios' },
  { f: 'MovValoresEnca', id: 121495, m: 48980, d: 'AGUA MENDOCINA', ...fijo(CAT.SERVICIOS), por: 'precedente: 13 casos en Servicios' },
  { f: 'MovValoresEnca', id: 120167, m: 11200, d: 'EMERGENCIA S.R', ...fijo(CAT.SEGUROS), por: 'precedente: 23 casos en Seguros' },
  { f: 'MovValoresEnca', id: 120202, m: 12000, d: '6 MANDADOS MARCELO', ...variable(), por: 'precedente: 178 mandados en variable sin subcategoría' },
  { f: 'MovValoresEnca', id: 120332, m: 2000, d: '1 MANDADO', ...variable(), por: 'precedente: ídem mandados' },
  // Las dos notas de crédito cancelatorias van con el precedente dominante
  // (11 casos en variable). OJO: de Kergorlay tiene 2 filas anteriores como
  // `no_es_gasto`, así que el concepto merece un criterio explícito — son
  // $17.000 y no cambia nada, pero la próxima vez conviene decidirlo.
  { f: 'MovValoresEnca', id: 121457, m: 10000, d: 'N.C. Cancelatoria SAMPER', ...variable(), por: 'precedente: 11 N.C. cancelatorias en variable' },
  { f: 'MovValoresEnca', id: 121515, m: 7000, d: 'N.C. Cancelatoria DE KERGORLAY', ...variable(), por: 'precedente: ídem N.C.' },

  // ---- Por el concepto que dice el comprobante ----
  { f: 'MovProv', id: 7259, m: 104545, d: 'FATSA', ...fijo(CAT.SUELDOS), por: 'FATSA es el sindicato: costo laboral' },
  { f: 'MovProv', id: 7254, m: 94379, d: 'FATSA', ...fijo(CAT.SUELDOS), por: 'ídem sindicato' },
  { f: 'MovProv', id: 7307, m: 19032, d: 'TASA COMERCIO E INDUSTRIA', ...fijo(CAT.IMPUESTOS), por: 'tasa municipal' },
  { f: 'MovValoresEnca', id: 120316, m: 19000, d: 'MUNICIPALIDAD', ...fijo(CAT.IMPUESTOS), por: 'pago a la municipalidad' },
  { f: 'MovProv', id: 7246, m: 5000, d: 'IVA 10-2024 F731', ...fijo(CAT.IMPUESTOS), por: 'declaración de IVA' },
  { f: 'MovValoresEnca', id: 120160, m: 20000, d: 'TRAMITE OBRAS SOCIALES', ...fijo(CAT.DILIGENCIAS), por: 'trámite: es una diligencia' },
  { f: 'MovValoresEnca', id: 121535, m: 15600, d: 'SOPORTE P/LAMPARA', ...fijo(CAT.MANTENIMIENTO), por: 'repuesto del local' },
  { f: 'MovValoresEnca', id: 120267, m: 1650, d: 'ELECTRONICA RAMON', ...fijo(CAT.MANTENIMIENTO), por: 'reparación' },
  { f: 'MovProv', id: 7304, m: 17970, d: 'ANDREANI ENCOMIENDA', ...variable('insumos'), por: 'precedente: 7 encomiendas en variable/insumos' },
  { f: 'MovProv', id: 7292, m: 16500, d: 'ANDREANI ENCOMIENDA', ...variable('insumos'), por: 'precedente: ídem encomiendas' },
  { f: 'MovValoresEnca', id: 121556, m: 10370, d: 'LENTE DE CONTACTO', ...variable('insumos'), por: 'es un insumo médico' },
  { f: 'MovValoresEnca', id: 121472, m: 4500, d: 'DESCARTABLES', ...variable('insumos'), por: 'insumo descartable' },
  { f: 'MovProv', id: 7296, m: 110945, d: 'CEREALES EL DIAMANTE — INSUMOS VARIOS', ...variable('insumos'), por: 'el comprobante dice INSUMOS VARIOS' },
  { f: 'MovProv', id: 7298, m: 84545, d: 'CEREALES EL DIAMANTE — INSUMOS VARIOS', ...variable('insumos'), por: 'ídem insumos varios' },

  // ---- Personal: guardias y urgencias de las administrativas ----
  { f: 'MovValoresEnca', id: 118919, m: 10000, d: '4 GUARDIA CELESTE G.', ...fijo(CAT.SUELDOS), por: 'guardia de una administrativa: costo de personal' },
  { f: 'MovValoresEnca', id: 121499, m: 7500, d: '3 URGENCIAS GISELA', ...fijo(CAT.SUELDOS), por: 'ídem personal' },
  { f: 'MovValoresEnca', id: 120336, m: 7100, d: 'GUARDIAS GISELA', ...fijo(CAT.SUELDOS), por: 'ídem personal' },

  // ---- Gastos sociales: comida, regalos, cumpleaños ----
  { f: 'MovValoresEnca', id: 121534, m: 19000, d: 'ALMUERZO 18/12/2024', ...fijo(CAT.OTROS), por: 'gasto social' },
  { f: 'MovValoresEnca', id: 121572, m: 10000, d: 'ALMUERZO CELESTE', ...fijo(CAT.OTROS), por: 'gasto social' },
  { f: 'MovValoresEnca', id: 121617, m: 11000, d: 'DESAYUNO', ...fijo(CAT.OTROS), por: 'gasto social' },
  { f: 'MovValoresEnca', id: 119071, m: 10600, d: '2 MAPLES DE HUEVOS', ...fijo(CAT.OTROS), por: 'gasto social' },
  { f: 'MovValoresEnca', id: 120216, m: 6000, d: 'COMPRA DE SIDRA', ...fijo(CAT.OTROS), por: 'gasto social de fin de año' },
  { f: 'MovValoresEnca', id: 119063, m: 8000, d: 'REGALO MARIANELA', ...fijo(CAT.OTROS), por: 'gasto social' },
  { f: 'MovValoresEnca', id: 120424, m: 18000, d: 'TENIS', ...fijo(CAT.OTROS), por: 'gasto social' },
  { f: 'MovProv', id: 7294, m: 63790, d: 'MORENO LUCIO — CARAMELOS GALLETAS', ...fijo(CAT.OTROS), por: 'proveeduría del office' },

  // ---- Proveedores que no sé qué venden: a Otros, que es la dirección
  //      conservadora. Corregir desde la pantalla si se sabe qué son. ----
  { f: 'MovValoresEnca', id: 120421, m: 78300, d: 'EL SALTO', ...fijo(CAT.OTROS), por: 'proveedor no identificado' },
  { f: 'MovValoresEnca', id: 119130, m: 40200, d: 'EL SALTA', ...fijo(CAT.OTROS), por: 'proveedor no identificado' },
  { f: 'MovValoresEnca', id: 120197, m: 63790, d: 'DISTRIB. SAN ISIDRO', ...fijo(CAT.OTROS), por: 'distribuidora no identificada' },
  { f: 'MovProv', id: 7329, m: 44856, d: 'JM DISTRIBUCIONES FC 28368', ...fijo(CAT.OTROS), por: 'distribuidora no identificada' },
  { f: 'MovProv', id: 7331, m: 4500, d: 'JM DISTRIBUCIONES FC 28407', ...fijo(CAT.OTROS), por: 'distribuidora no identificada' },
  { f: 'MovProv', id: 7266, m: 14700, d: 'romero ariel FC 138', ...fijo(CAT.OTROS), por: 'proveedor no identificado' },
  { f: 'MovValoresEnca', id: 120297, m: 22800, d: 'PERMISO ARGOS', ...fijo(CAT.OTROS), por: 'concepto no identificado' },
];

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en server/.env');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log(`Diciembre-2024: clasificar lo que faltaba — ${WRITE ? 'ESCRITURA' : 'DRY-RUN'}\n`);

  // ---- Que el plan cubra exactamente lo que falta, ni más ni menos ----
  const { rows: pendientes } = await c.query(`
    SELECT g.fuente, g.id_geclisa, g.monto
      FROM erogaciones_geclisa g
      LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
     WHERE g.anio = 2024 AND g.mes = 12 AND cl.id IS NULL`);
  const clavePend = new Set(pendientes.map((p) => `${p.fuente}/${p.id_geclisa}`));
  const clavePlan = new Set(PLAN.map((p) => `${p.f}/${p.id}`));

  const sobran = [...clavePlan].filter((k) => !clavePend.has(k));
  const faltan = [...clavePend].filter((k) => !clavePlan.has(k));
  if (sobran.length) console.log(`  AVISO: ${sobran.length} del plan ya no están pendientes: ${sobran.join(', ')}`);
  if (faltan.length) console.log(`  AVISO: ${faltan.length} pendientes que el plan NO cubre: ${faltan.join(', ')}`);

  // ---- Verificar importes ----
  let problemas = 0;
  const porDestino = new Map();
  for (const p of PLAN) {
    const { rows } = await c.query(
      `SELECT monto, proveedor_nombre FROM erogaciones_geclisa WHERE fuente = $1 AND id_geclisa = $2`, [p.f, p.id]);
    if (rows.length === 0) { console.log(`  FALTA  [${p.f}/${p.id}] ${p.d}`); problemas++; continue; }
    if (Math.round(Number(rows[0].monto)) !== p.m) {
      console.log(`  MONTO  [${p.f}/${p.id}] ${p.d}: la base dice ${ars(rows[0].monto)}, el plan ${ars(p.m)}`);
      problemas++;
    }
    const destino = p.tipo === 'fijo' ? `fijo / ${Object.keys(CAT).find((k) => CAT[k] === p.cat)}` : `variable / ${p.sub || 'sin subcategoría'}`;
    if (!porDestino.has(destino)) porDestino.set(destino, { n: 0, total: 0, items: [] });
    const g = porDestino.get(destino);
    g.n++; g.total += p.m; g.items.push(p);
  }

  console.log('\nA dónde va cada peso:');
  for (const [destino, g] of [...porDestino].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`\n  ${destino}  —  ${g.n} comprobante(s) · ${ars(g.total)}`);
    for (const p of g.items.sort((a, b) => b.m - a.m)) {
      console.log(`     ${ars(p.m).padStart(13)}  ${p.d.padEnd(38)} ${p.por}`);
    }
  }
  console.log(`\n  TOTAL ${PLAN.length} comprobantes · ${ars(PLAN.reduce((s, p) => s + p.m, 0))}`);

  if (problemas) {
    console.error(`\nABORTA: ${problemas} comprobante(s) no coinciden con lo relevado.`);
    process.exitCode = 1;
    await c.end();
    return;
  }
  if (!WRITE) {
    console.log('\n(dry-run: agregá --write para aplicar)');
    await c.end();
    return;
  }

  // ---- Aplicar ----
  await c.query('BEGIN');
  try {
    let n = 0;
    for (const p of PLAN) {
      const r = await c.query(`
        INSERT INTO erogaciones_clasificacion
          (fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto,
           categoria, es_costo_fijo, tipo_costo, subcategoria_variable, categoria_costo_fijo_id,
           clasificado_por, clasificado_at, auto_clasificado)
        SELECT g.fuente, g.id_geclisa, g.anio, g.mes, g.fecha, g.descripcion, g.proveedor_nombre, g.monto,
               COALESCE(g.categoria_sugerida, 'Egresos de Caja'), $3, $4, $5, $6, $7, now(), false
          FROM erogaciones_geclisa g
         WHERE g.fuente = $1 AND g.id_geclisa = $2
        ON CONFLICT (fuente, id_geclisa) DO NOTHING
        RETURNING id`,
        [p.f, p.id, p.tipo === 'fijo', p.tipo, p.tipo === 'variable' ? p.sub : null,
          p.tipo === 'fijo' ? p.cat : null, MARCA]);
      n += r.rowCount;
    }

    const { rows: [chk] } = await c.query(`
      SELECT count(*)::int sin_clasificar, COALESCE(sum(g.monto), 0) AS monto
        FROM erogaciones_geclisa g
        LEFT JOIN erogaciones_clasificacion cl ON cl.fuente = g.fuente AND cl.id_geclisa = g.id_geclisa
       WHERE g.anio = 2024 AND g.mes = 12 AND cl.id IS NULL`);
    if (chk.sin_clasificar > 0) {
      throw new Error(`ABORTA: quedan ${chk.sin_clasificar} sin clasificar por ${ars(chk.monto)}`);
    }

    await c.query('COMMIT');
    console.log(`\nClasificadas: ${n}. Diciembre-2024 queda en 0 sin clasificar.`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\nSin cambios —', e.message);
    process.exitCode = 1;
    await c.end();
    return;
  }

  const { rows: [m] } = await c.query(`
    SELECT COALESCE(sum(monto) FILTER (WHERE tipo_costo = 'fijo'), 0) AS fijo,
           COALESCE(sum(monto) FILTER (WHERE tipo_costo = 'variable'), 0) AS variable,
           COALESCE(sum(monto) FILTER (WHERE tipo_costo = 'no_es_gasto'), 0) AS no_gasto
      FROM erogaciones_clasificacion WHERE anio = 2024 AND mes = 12`);
  console.log(`\nDiciembre-2024: fijo ${ars(m.fijo)} · variable ${ars(m.variable)} · no es gasto ${ars(m.no_gasto)}`);

  await c.end();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
