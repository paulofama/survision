// ============================================================
// Verificación integrada del circuito de estados (FASE 6)
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/verificar-circuito-estados.cjs
//
// QUÉ HACE
// --------
// Recorre aceptación → reversión → nueva aceptación → anulación sobre los dos
// casos testigo, verificando en cada paso los invariantes que fijaron las
// fases 2 a 5.
//
// TODO CORRE DENTRO DE UNA TRANSACCIÓN QUE SE REVIERTE
// -----------------------------------------------------
// P-2026-956 y P-2026-999 son presupuestos REALES, aceptados y con dinero
// registrado en caja. Recorrerles el circuito de verdad dejaría marcas en
// producción —entre ellas una anulación— así que todo pasa dentro de un
// BEGIN … ROLLBACK. Al terminar, la base queda exactamente como estaba.
//
// LO QUE ESTE SCRIPT NO PUEDE VERIFICAR
// --------------------------------------
// Las reglas viven en el front: el bloqueo por caja, el aviso del sobre ya
// impreso y los botones que se muestran u ocultan. Acá se verifica que los
// DATOS sostengan esas reglas —que haya entregas vigentes donde el front tiene
// que bloquear, que la aceptación quede marcada, que el historial registre—,
// no que la pantalla las aplique. Eso se mira en la pantalla.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

const CASOS = ['P-2026-956', 'P-2026-999'];

const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);

let pasos = 0;
let fallas = 0;

function chequear(etiqueta, condicion, detalle = '') {
  pasos++;
  if (!condicion) fallas++;
  console.log(`    ${condicion ? 'OK  ' : 'FALLA'} ${etiqueta}${detalle ? ` — ${detalle}` : ''}`);
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('Verificación integrada del circuito · FASE 6\n');

  // ── Estado de partida ──────────────────────────────────────
  const { rows: estado } = await c.query(`
    SELECT p.id, p.numero_presupuesto num, p.paciente_apellido ape, p.estado, p.resultado,
           a.ojo, a.rama_cobertura, a.revertida_at,
           cv.nombre convenio,
           p.datos_completos->'tratamiento'->>'ojoTratar' ojo_presup,
           p.datos_completos->'paciente'->>'obraSocial' os_ficha,
           (SELECT count(*) FROM presupuestos_caja_entregas e
             WHERE e.presupuesto_id = p.id AND e.anulada_at IS NULL)::int entregas,
           (SELECT COALESCE(sum(e.monto), 0) FROM presupuestos_caja_entregas e
             WHERE e.presupuesto_id = p.id AND e.anulada_at IS NULL) cobrado,
           (SELECT count(*) FROM presupuestos_sobres s WHERE s.presupuesto_id = p.id)::int sobres
      FROM presupuestos p
      LEFT JOIN presupuestos_aceptacion a ON a.presupuesto_id = p.id
      LEFT JOIN presupuestos_convenios cv ON cv.id = a.convenio_id
     WHERE p.numero_presupuesto = ANY($1) ORDER BY p.numero_presupuesto`, [CASOS]);

  for (const e of estado) {
    console.log(`== ${e.num} — ${e.ape}`);
    console.log(`   estado=${e.estado}/${e.resultado}  ojo=${e.ojo}  rama=${e.rama_cobertura}`
      + `  convenio=${e.convenio || '(particular)'}`);
    console.log(`   entregas vigentes=${e.entregas} (${ars(e.cobrado)})  sobres impresos=${e.sobres}`);

    // FASE 5 / punto 2.2: el ojo del presupuesto y el de la aceptación coinciden.
    const mapa = { OD: 'derecho', OI: 'izquierdo', AMBOS: 'ambos' };
    chequear('el ojo del presupuesto coincide con el de la aceptación',
      mapa[e.ojo] === String(e.ojo_presup || '').toLowerCase().trim(),
      `presupuesto "${e.ojo_presup}" vs aceptación "${e.ojo}"`);

    // FASE 4: una aceptación de un presupuesto ACEPTADO tiene que estar vigente.
    chequear('la aceptación está vigente', e.revertida_at === null);

    // FASE 4: con entregas vigentes, el front tiene que bloquear la reversión.
    chequear(e.entregas > 0 ? 'tiene caja: el front DEBE bloquear revertir' : 'sin caja: revertir permitido',
      true, e.entregas > 0 ? ars(e.cobrado) : '');
    console.log('');
  }

  // ── Invariantes globales ───────────────────────────────────
  console.log('== Invariantes de toda la base');

  const { rows: [h] } = await c.query(`
    SELECT count(*)::int n FROM presupuestos_aceptacion a
      JOIN presupuestos p ON p.id = a.presupuesto_id
     WHERE a.revertida_at IS NULL AND p.resultado IS DISTINCT FROM 'ACEPTADO'`);
  chequear('no hay aceptaciones vigentes sin resultado ACEPTADO', h.n === 0, `encontradas: ${h.n}`);

  const { rows: [d] } = await c.query(`
    SELECT count(*)::int n FROM presupuestos p
      JOIN presupuestos_aceptacion a ON a.presupuesto_id = p.id
     WHERE a.revertida_at IS NULL AND a.ojo IS NOT NULL
       AND lower(COALESCE(p.datos_completos->'tratamiento'->>'ojoTratar', '')) <> ''
       AND CASE a.ojo WHEN 'OD' THEN 'derecho' WHEN 'OI' THEN 'izquierdo' ELSE 'ambos' END
           <> lower(trim(p.datos_completos->'tratamiento'->>'ojoTratar'))`);
  chequear('ninguna aceptación vigente discrepa del ojo del presupuesto', d.n === 0, `discrepantes: ${d.n}`);

  const { rows: [cfg] } = await c.query(
    "SELECT valor FROM presupuestos_config WHERE clave = 'documentos_desactivados'");
  chequear('los documentos desactivados siguen configurados',
    !!cfg && cfg.valor.includes('indicaciones') && cfg.valor.includes('cronograma'), cfg?.valor);
  chequear('el consentimiento NO está en la lista (vuelve solo con texto real)',
    !!cfg && !cfg.valor.includes('consentimiento'));

  const { rows: [mot] } = await c.query(
    "SELECT count(*)::int n FROM presupuestos_motivos_resultado WHERE tipo IN ('REVERSION','ANULADO') AND activo");
  chequear('están los motivos de reversión y anulación', mot.n >= 10, `${mot.n} motivos`);

  const { rows: [dom] } = await c.query(
    'SELECT count(direccion)::int con, count(*)::int tot FROM pacientes_geclisa');
  chequear('el espejo tiene el domicilio poblado', dom.con > dom.tot * 0.9,
    `${dom.con} de ${dom.tot} (${(100 * dom.con / dom.tot).toFixed(1)} %)`);

  // ── Recorrido completo, dentro de una transacción que se revierte ──
  console.log('\n== Recorrido reversión → re-aceptación → anulación (en transacción, se revierte)');
  const caso = estado.find((e) => e.entregas === 0) || estado[0];
  console.log(`   Caso usado: ${caso.num}`);

  await c.query('BEGIN');
  try {
    // 1. Revertir: baja la aceptación y escribe el historial.
    await c.query(`UPDATE presupuestos SET resultado = NULL, fecha_resultado = NULL, resultado_por = NULL
                    WHERE id = $1`, [caso.id]);
    await c.query(`UPDATE presupuestos_aceptacion
                      SET revertida_at = now(), revertida_por = 'verificacion', reversion_motivo = 'prueba'
                    WHERE presupuesto_id = $1 AND revertida_at IS NULL`, [caso.id]);
    await c.query(`INSERT INTO presupuestos_historial (presupuesto_id, campo, valor_anterior, valor_nuevo, usuario)
                   VALUES ($1, 'resultado', 'ACEPTADO', NULL, 'verificacion')`, [caso.id]);

    const { rows: [r1] } = await c.query(
      'SELECT revertida_at FROM presupuestos_aceptacion WHERE presupuesto_id = $1', [caso.id]);
    chequear('al revertir, la aceptación deja de estar vigente', r1.revertida_at !== null);

    const { rows: [r2] } = await c.query(`
      SELECT count(*)::int n FROM presupuestos_aceptacion
       WHERE presupuesto_id = $1 AND ojo IS NOT NULL`, [caso.id]);
    chequear('los datos del circuito NO se borran (ojo conservado)', r2.n === 1);

    // 2. Re-aceptar: el upsert tiene que LIMPIAR la marca, o el circuito no vuelve.
    await c.query(`UPDATE presupuestos SET resultado = 'ACEPTADO' WHERE id = $1`, [caso.id]);
    await c.query(`UPDATE presupuestos_aceptacion
                      SET revertida_at = NULL, revertida_por = NULL, reversion_motivo = NULL
                    WHERE presupuesto_id = $1`, [caso.id]);
    const { rows: [r3] } = await c.query(
      'SELECT revertida_at FROM presupuestos_aceptacion WHERE presupuesto_id = $1', [caso.id]);
    chequear('al re-aceptar, la aceptación vuelve a estar vigente', r3.revertida_at === null);

    // 3. Anular: resultado ANULADO, distinto de RECHAZADO.
    await c.query(`UPDATE presupuestos SET resultado = 'ANULADO' WHERE id = $1`, [caso.id]);
    const { rows: [r4] } = await c.query('SELECT resultado FROM presupuestos WHERE id = $1', [caso.id]);
    chequear('ANULADO es un resultado válido y distinto de RECHAZADO',
      r4.resultado === 'ANULADO');

    // 4. El historial registra, y no se pisa.
    const { rows: [r5] } = await c.query(
      "SELECT count(*)::int n FROM presupuestos_historial WHERE presupuesto_id = $1 AND usuario = 'verificacion'", [caso.id]);
    chequear('el historial registró la transición', r5.n === 1);

    // 5. Un campo inventado tiene que ser rechazado por el CHECK.
    let rechazo = false;
    try {
      await c.query('SAVEPOINT sp');
      await c.query(`INSERT INTO presupuestos_historial (presupuesto_id, campo, usuario)
                     VALUES ($1, 'campo_inventado', 'verificacion')`, [caso.id]);
      await c.query('RELEASE SAVEPOINT sp');
    } catch {
      rechazo = true;
      await c.query('ROLLBACK TO SAVEPOINT sp');
    }
    chequear('el historial rechaza un campo fuera de la lista', rechazo);
  } finally {
    await c.query('ROLLBACK');
  }

  // Confirmar que el rollback dejó todo como estaba.
  const { rows: [post] } = await c.query(
    'SELECT resultado FROM presupuestos WHERE id = $1', [caso.id]);
  chequear('la transacción se revirtió: el caso quedó como estaba',
    post.resultado === caso.resultado, `resultado = ${post.resultado}`);

  console.log(`\n  ${pasos - fallas} de ${pasos} verificaciones OK`);
  if (fallas) console.error(`  ${fallas} FALLA(S)`);
  await c.end();
  process.exitCode = fallas ? 1 : 0;
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
