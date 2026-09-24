// ============================================================
// ¿Los candados de comisiones hacen lo que dicen?
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/probar-candados-comisiones.cjs
//
// Prueba las policies (migraciones 56 y 57) y los triggers del libro con
// escrituras de VERDAD, impersonando a un admin y a un no-admin reales, todo
// adentro de una transacción que termina en ROLLBACK. No queda ni una fila.
//
// Por qué no alcanza con mirar `pg_policies`: una policy puede existir y no
// hacer lo que uno cree. Y un movimiento de comisión de mentira metido en el
// libro para probar NO SE PODRÍA BORRAR después — para eso es append-only.
//
// OJO CON CÓMO SE MIDE "BLOQUEADO". Un INSERT que la RLS rechaza tira error;
// un UPDATE o un DELETE que la RLS rechaza **no tira nada: afecta cero filas**.
// Un test que sólo espera excepciones da falsos negativos justo en los dos
// casos que más importan (aprobar y borrar una liquidación). Pasó acá mismo la
// primera vez que se corrió.
//
// Sale con código 1 si algún control falla.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en server/.env');
  process.exit(1);
}

const resultados = [];
const ok = (t) => resultados.push(['OK  ', t]);
const mal = (t, e) => resultados.push(['MAL ', `${t} — ${e}`]);

let c;

/** Corre una sentencia como `authenticated` con el JWT de un usuario. */
async function comoUsuario(authUserId, sql, params) {
  await c.query('SAVEPOINT sp');
  try {
    await c.query('SET LOCAL ROLE authenticated');
    await c.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: authUserId, role: 'authenticated' })]);
    const r = await c.query(sql, params);
    await c.query('RESET ROLE');
    return { filas: r.rowCount, datos: r.rows, error: null };
  } catch (e) {
    // Primero deshacer, DESPUÉS resetear: en una transacción abortada
    // cualquier comando falla y taparía el error real.
    await c.query('ROLLBACK TO SAVEPOINT sp');
    await c.query('RESET ROLE');
    return { filas: 0, datos: [], error: e.message };
  }
}

/** Bloqueado = o tiró error, o no tocó ninguna fila. Las dos cosas valen. */
async function debeBloquear(titulo, authUserId, sql, params) {
  const r = await comoUsuario(authUserId, sql, params);
  if (r.error) ok(`${titulo} → error (${r.error.slice(0, 55)})`);
  else if (r.filas === 0) ok(`${titulo} → 0 filas (la RLS no lo deja ver para escribir)`);
  else mal(titulo, `tocó ${r.filas} fila(s) y no debía`);
  return r;
}

async function debeAndar(titulo, authUserId, sql, params) {
  const r = await comoUsuario(authUserId, sql, params);
  if (r.error) mal(titulo, r.error);
  else if (r.filas === 0) mal(titulo, 'no tocó ninguna fila');
  else ok(titulo);
  return r;
}

/** Igual pero como superusuario: lo que hace la service key del backend. */
async function comoJob(titulo, esperado, sql, params) {
  await c.query('SAVEPOINT spj');
  try {
    const r = await c.query(sql, params);
    if (esperado === 'anda') { await c.query('RELEASE SAVEPOINT spj'); ok(titulo); return r; }
    await c.query('ROLLBACK TO SAVEPOINT spj');
    mal(titulo, `pasó (${r.rowCount} filas) y no debía`);
    return r;
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT spj');
    if (esperado === 'falla') ok(`${titulo} → rechazado (${String(e.message).slice(0, 55)})`);
    else mal(titulo, e.message);
    return null;
  }
}

(async () => {
  c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: usuarios } = await c.query(`
    SELECT u.username, u.auth_user_id, COALESCE(r.es_admin, false) AS es_admin
      FROM usuarios_sistema u LEFT JOIN roles r ON r.id = u.rol_id
     WHERE u.auth_user_id IS NOT NULL AND u.activo
     ORDER BY es_admin DESC`);
  const admin = usuarios.find((u) => u.es_admin);
  const comun = usuarios.find((u) => !u.es_admin);
  if (!admin || !comun) {
    console.error('Hacen falta un usuario admin y uno no-admin, los dos con auth_user_id.');
    process.exit(1);
  }
  console.log(`Admin: ${admin.username} · No admin: ${comun.username}\n`);

  await c.query('BEGIN');
  try {
    const { rows: [pres] } = await c.query('SELECT id FROM presupuestos LIMIT 1');
    if (!pres) throw new Error('No hay presupuestos para colgar el movimiento de prueba');

    // ---- 1. Liquidaciones: sólo la Dirección ----
    await debeBloquear('Un no-admin crea una liquidación', comun.auth_user_id,
      "INSERT INTO comisiones_liquidaciones (beneficiario, anio, mes, total) VALUES ('probando', 2099, 1, 100)");

    const creada = await debeAndar('La Dirección crea una liquidación', admin.auth_user_id,
      "INSERT INTO comisiones_liquidaciones (beneficiario, anio, mes, total) VALUES ('probando', 2099, 1, 100) RETURNING id");
    const liqId = creada?.datos?.[0]?.id;

    if (liqId) {
      await debeBloquear('Un no-admin aprueba la liquidación', comun.auth_user_id,
        "UPDATE comisiones_liquidaciones SET estado='APROBADA' WHERE id=$1", [liqId]);
      await debeAndar('La Dirección la aprueba', admin.auth_user_id,
        "UPDATE comisiones_liquidaciones SET estado='APROBADA' WHERE id=$1", [liqId]);
      await debeBloquear('La Dirección borra una liquidación', admin.auth_user_id,
        'DELETE FROM comisiones_liquidaciones WHERE id=$1', [liqId]);
    }

    // ---- 2. El libro: nadie lo emite desde la API, ni un admin ----
    const INSERT_MOV = `INSERT INTO comisiones_movimientos
        (presupuesto_id, beneficiario, rol, tipo, evento_origen, base_comisionable, tasa_aplicada, pct_reparto, importe, fecha_devengo)
      VALUES ($1,'probando','ENTREGADOR','DEVENGO','test:1',1000,3,100,30,'2099-01-01')`;

    await debeBloquear('Un admin emite un movimiento a mano', admin.auth_user_id, INSERT_MOV, [pres.id]);
    const emitido = await comoJob('El job (service key) sí emite', 'anda', `${INSERT_MOV} RETURNING id`, [pres.id]);
    const movId = emitido?.rows?.[0]?.id;

    if (movId) {
      // ---- 3. Append-only: ni el dueño de la base pisa un importe ----
      await comoJob('Pisar un importe, incluso como superusuario', 'falla',
        'UPDATE comisiones_movimientos SET importe = 999999 WHERE id=$1', [movId]);
      await comoJob('Borrar un movimiento, incluso como superusuario', 'falla',
        'DELETE FROM comisiones_movimientos WHERE id=$1', [movId]);

      // ---- 4. Lo único que puede cambiar: liquidacion_id ----
      if (liqId) {
        await comoJob('Sumar un movimiento a una liquidación APROBADA', 'falla',
          'UPDATE comisiones_movimientos SET liquidacion_id=$1 WHERE id=$2', [liqId, movId]);

        await c.query("UPDATE comisiones_liquidaciones SET estado='DEVENGADA' WHERE id=$1", [liqId]);
        await comoJob('Sumarlo mientras está DEVENGADA', 'anda',
          'UPDATE comisiones_movimientos SET liquidacion_id=$1 WHERE id=$2', [liqId, movId]);

        // El caso que hace útil al panel, y que es justo lo que abrió la 57.
        await c.query('UPDATE comisiones_movimientos SET liquidacion_id=NULL WHERE id=$1', [movId]);
        await debeAndar('La Dirección estampa liquidacion_id desde la pantalla', admin.auth_user_id,
          'UPDATE comisiones_movimientos SET liquidacion_id=$1 WHERE id=$2', [liqId, movId]);
        await c.query('UPDATE comisiones_movimientos SET liquidacion_id=NULL WHERE id=$1', [movId]);
        await debeBloquear('Un no-admin estampa liquidacion_id', comun.auth_user_id,
          'UPDATE comisiones_movimientos SET liquidacion_id=$1 WHERE id=$2', [liqId, movId]);
      }

      // ---- 5. Nadie ve lo del otro ----
      const ajeno = await comoUsuario(comun.auth_user_id,
        "SELECT count(*)::int n FROM comisiones_movimientos WHERE beneficiario='probando'");
      if (ajeno.datos[0]?.n === 0) ok('Un no-admin NO ve el movimiento de otra persona');
      else mal('Un no-admin no debería ver lo ajeno', `ve ${ajeno.datos[0]?.n}`);

      const propio = await comoUsuario(admin.auth_user_id,
        "SELECT count(*)::int n FROM comisiones_movimientos WHERE beneficiario='probando'");
      if (propio.datos[0]?.n === 1) ok('La Dirección sí lo ve');
      else mal('La Dirección debería verlo', `ve ${propio.datos[0]?.n}`);
    }
  } finally {
    await c.query('ROLLBACK');
  }

  console.log(resultados.map(([m, t]) => `${m} ${t}`).join('\n'));
  const fallas = resultados.filter(([m]) => m.trim() === 'MAL').length;
  console.log(`\n${resultados.length - fallas}/${resultados.length} controles pasaron.`);

  // Después del rollback no tiene que haber quedado nada de la prueba.
  const { rows: [q] } = await c.query(
    "SELECT (SELECT count(*) FROM comisiones_movimientos WHERE beneficiario='probando')::int m,"
    + " (SELECT count(*) FROM comisiones_liquidaciones WHERE beneficiario='probando')::int l");
  if (q.m || q.l) {
    console.error(`\nQUEDARON RASTROS: ${q.m} movimientos, ${q.l} liquidaciones de prueba.`);
    process.exitCode = 1;
  } else {
    console.log('Sin rastros: la transacción se deshizo entera.');
  }

  await c.end();
  if (fallas) process.exitCode = 1;
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
