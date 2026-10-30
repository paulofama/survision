// ============================================================
// AUDITORÍA DE EXPOSICIÓN RLS
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/auditar-rls.cjs
//
// POR QUÉ EXISTE: la anon key está hardcodeada en `src/shared/lib/supabase.ts`
// y viaja en el bundle del frontend — es pública por diseño. Con el sistema
// publicado en internet, TODA tabla sin RLS (o con una policy que alcance al
// rol `anon`) es de lectura y escritura pública.
//
// El endurecimiento de la migración 07b cubrió sólo las tablas que existían en
// junio-2026. Cada módulo nuevo puede volver a abrir el agujero: correr esto
// después de crear tablas. Hallazgos históricos: migración 35 (tablas fiscales)
// y 36 (14 tablas que nunca tuvieron RLS habilitada).
//
// ⚠️ ESTE SCRIPT TUVO UN PUNTO CIEGO HASTA EL 13/10/2026
// ------------------------------------------------------
// El bloque 2 buscaba sólo `'anon' = ANY(roles)`. Una policy declarada SIN
// `TO authenticated` NO queda asignada a `anon`: queda asignada a `PUBLIC`,
// que incluye a `anon` pero en el catálogo figura como `{public}`. Mismo
// efecto, distinta fila en `pg_policies`.
//
// Resultado: 18 policies sobre 8 tablas —5.377 comprobantes de erogaciones y
// 414 registros de sueldos, legibles Y BORRABLES con la anon key pública— no
// aparecían en ningún bloque, y el script cerraba diciendo "sin exposición
// anónima". Se cerraron con la migración 75 y ahora el bloque 2 los detecta.
//
// La lección para el próximo chequeo que se escriba acá: un filtro por nombre
// de rol no prueba ausencia de acceso. Lo único que la prueba es leer la tabla
// con el rol `anon` y contar filas.
//
// ⚠️ Y OTRO PUNTO CIEGO HASTA EL 30/10/2026: LAS VISTAS
// ------------------------------------------------------
// Los bloques 1 a 4 miran sólo tablas (relkind 'r'). Una vista corre con los
// permisos de su dueño y NO aplica la RLS de las tablas de abajo; Supabase le
// da GRANT a anon a todo lo que se crea en public. Resultado: 12 vistas —los
// sueldos por empleado, las liquidaciones de honorarios, los permisos de
// usuarios— legibles con la anon key, y este script diciendo "sin exposición".
// Se cerraron con la migración 82. El bloque 5 lee cada vista con el rol anon
// y cuenta filas, que es la única prueba que vale.
//
// QUÉ MIRAR:
//   Bloque 1 y 2 -> CRÍTICO. Cualquier fila acá es exposición pública.
//   Bloque 2b    -> revisar. Policies de PUBLIC que hoy no exponen porque
//                   `anon` no tiene GRANT; se abren solas si alguien lo repone.
//   Bloque 3     -> revisar. Cualquier usuario logueado puede escribir.
//   Bloque 4     -> informativo. Deny total: si una pantalla se ve vacía, mirá acá.
//   Bloque 5     -> CRÍTICO. Vistas que anon puede leer, leídas como anon.
//   Bloque 6     -> revisar. Funciones SECURITY DEFINER que anon puede
//                   ejecutar: cada una tiene que rechazarlo adentro.
//
// Antes de sacarle el acceso `anon` a una tabla, verificá quién escribe:
//   - Backend: `server/config/supabase.js` usa SERVICE_ROLE y bypassa RLS. OK.
//     OJO con rutas que arman su propio cliente con la ANON key (pasó con
//     prestadores.js y elementos-geclisa.js).
//   - Frontend: manda el JWT de la sesión si usa `@shared/lib/supabase`.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en server/.env');
  process.exit(1);
}

const CONSULTAS = [
  {
    titulo: '1. TABLAS SIN RLS HABILITADA (expuestas según los GRANT de anon)',
    critico: true,
    sql: `
      SELECT c.relname AS tabla,
             has_table_privilege('anon', c.oid, 'SELECT') AS anon_lee,
             has_table_privilege('anon', c.oid, 'INSERT') AS anon_escribe,
             COALESCE(s.n_live_tup, 0) AS filas
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
       ORDER BY anon_lee DESC, filas DESC`,
  },
  {
    titulo: '2. POLICIES QUE ALCANZAN AL ROL anon (incluidas las de PUBLIC)',
    critico: true,
    // ⚠️ EL PUNTO CIEGO QUE TUVO ESTE SCRIPT HASTA EL 13/10/2026
    // --------------------------------------------------------
    // Antes acá decía sólo `'anon' = ANY(p.roles)`. Pero una policy declarada
    // SIN `TO authenticated` no queda asignada a `anon`: queda asignada a
    // `PUBLIC`, que en pg_policies aparece como `{public}` y que INCLUYE a
    // `anon`. Son indistinguibles en efecto y distintas en el catálogo.
    //
    // Con ese filtro, 18 policies sobre 8 tablas —entre ellas los 5.377
    // comprobantes de erogaciones y los 414 registros de sueldos, todos
    // legibles Y BORRABLES con la anon key pública— no entraban en ninguno de
    // los cuatro chequeos, y el script cerraba con "sin exposición anónima".
    // Se cerraron en la migración 75.
    //
    // Se cruza contra el GRANT porque sin SELECT la policy no alcanza: así una
    // tabla sin grant no genera un hallazgo crítico que no existe.
    // El privilegio se pregunta por OID y no armando 'public.'||nombre: el
    // planner puede evaluar `has_table_privilege` antes del filtro de esquema,
    // y entonces un nombre de otro esquema hace fallar la consulta entera.
    sql: `
      SELECT c.relname AS tabla, pol.polname AS policyname, pol.polcmd AS cmd,
             CASE WHEN 'anon' = ANY (
                    SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) AS r)
                  THEN 'anon' ELSE 'PUBLIC' END AS alcanza_a,
             has_table_privilege('anon', c.oid, 'SELECT') AS anon_lee,
             has_table_privilege('anon', c.oid, 'INSERT') AS anon_escribe,
             COALESCE(s.n_live_tup, 0) AS filas
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public'
         AND (pol.polroles = '{0}'::oid[]  -- {0} es PUBLIC
              OR 'anon' = ANY (SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) AS r))
         AND has_table_privilege('anon', c.oid, 'SELECT')
       ORDER BY filas DESC, c.relname`,
  },
  {
    titulo: '2b. POLICIES DE PUBLIC SIN GRANT DE anon (no exponen hoy, pero son frágiles)',
    critico: false,
    // No son crítico: sin GRANT, `anon` no entra. Pero la policy está mal
    // declarada, y alcanza con que alguien le devuelva el GRANT —o con que
    // Supabase lo reponga en un `GRANT ... ON ALL TABLES`— para que se abran
    // sin que nadie toque la policy.
    sql: `
      SELECT c.relname AS tabla, pol.polname AS policyname, pol.polcmd AS cmd,
             COALESCE(s.n_live_tup, 0) AS filas
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public'
         AND (pol.polroles = '{0}'::oid[]
              OR 'anon' = ANY (SELECT pg_get_userbyid(r) FROM unnest(pol.polroles) AS r))
         AND NOT has_table_privilege('anon', c.oid, 'SELECT')
       ORDER BY filas DESC, c.relname`,
  },
  {
    titulo: '3. ESCRITURA ABIERTA A CUALQUIER LOGUEADO (sin app_tiene_permiso)',
    critico: false,
    // Para INSERT el chequeo real es with_check (qual siempre es NULL); para el
    // resto es qual. Mirar la expresión que corresponde evita falsos positivos.
    sql: `
      SELECT p.tablename AS tabla, p.policyname, p.cmd,
             COALESCE(s.n_live_tup, 0) AS filas
        FROM pg_policies p
        LEFT JOIN pg_stat_user_tables s ON s.relname = p.tablename AND s.schemaname = 'public'
       WHERE p.schemaname = 'public'
         AND 'authenticated' = ANY(p.roles)
         AND p.cmd <> 'SELECT'
         AND btrim(COALESCE(
               CASE WHEN p.cmd = 'INSERT' THEN p.with_check::text ELSE p.qual::text END,
               'true')) = 'true'
       ORDER BY filas DESC, p.tablename`,
  },
  {
    titulo: '4. RLS HABILITADA Y SIN NINGUNA POLICY (deny total)',
    critico: false,
    sql: `
      SELECT c.relname AS tabla, COALESCE(s.n_live_tup, 0) AS filas
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
         AND NOT EXISTS (
           SELECT 1 FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname)
       ORDER BY filas DESC`,
  },
];

(async () => {
  let dbUrl = process.env.DATABASE_URL;
  const idx = dbUrl.indexOf('postgresql://');
  if (idx > 0) dbUrl = dbUrl.slice(idx);
  const u = new URL(dbUrl);
  const client = new Client({
    user: decodeURIComponent(u.username),
    password: process.env.SUPABASE_DB_PASSWORD || decodeURIComponent(u.password || ''),
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  let criticos = 0;

  for (const c of CONSULTAS) {
    const { rows } = await client.query(c.sql);
    if (c.critico) criticos += rows.length;
    console.log(`\n${'='.repeat(72)}\n${c.titulo}  (${rows.length})\n${'='.repeat(72)}`);
    if (!rows.length) console.log('  (ninguna)');
    else console.table(rows);
  }

  // 5. Vistas: se leen con el rol anon, en una transacción que se descarta.
  //    Una vista con GRANT a anon es crítica aunque hoy devuelva 0 filas: la
  //    vacía de hoy es la llena de mañana.
  const { rows: vistas } = await client.query(`
    SELECT c.relname AS vista
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
       AND has_table_privilege('anon', c.oid, 'SELECT')
     ORDER BY c.relname`);
  const expuestas = [];
  for (const { vista } of vistas) {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      const r = await client.query(`SELECT count(*)::int AS n FROM public."${vista}"`);
      expuestas.push({ vista, filas_leidas_como_anon: r.rows[0].n });
    } catch (e) {
      expuestas.push({ vista, filas_leidas_como_anon: 'error: ' + e.message });
    } finally {
      await client.query('ROLLBACK');
    }
  }
  criticos += expuestas.length;
  console.log(`\n${'='.repeat(72)}\n5. VISTAS LEGIBLES CON LA ANON KEY (leídas como anon)  (${expuestas.length})\n${'='.repeat(72)}`);
  if (!expuestas.length) console.log('  (ninguna)');
  else console.table(expuestas);

  // 6. Funciones SECURITY DEFINER ejecutables por anon: no son crítico por sí
  //    mismas (pueden rechazar adentro), pero cada una tiene que hacerlo.
  const { rows: funcs } = await client.query(`
    SELECT p.oid::regprocedure::text AS funcion
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
     ORDER BY 1`);
  console.log(`\n${'='.repeat(72)}\n6. FUNCIONES SECURITY DEFINER EJECUTABLES POR anon (revisar que validen permiso)  (${funcs.length})\n${'='.repeat(72)}`);
  if (!funcs.length) console.log('  (ninguna)');
  else console.table(funcs);

  await client.end();

  console.log(`\n${'='.repeat(72)}`);
  if (criticos > 0) {
    console.log(`❌ ${criticos} hallazgo(s) CRÍTICO(s): hay datos accesibles con la anon key pública.`);
    process.exit(1);
  }
  console.log('✅ Sin exposición anónima: ninguna tabla ni vista accesible con la anon key del bundle.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
