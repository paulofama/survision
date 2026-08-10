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
// QUÉ MIRAR:
//   Bloque 1 y 2 -> CRÍTICO. Cualquier fila acá es exposición pública.
//   Bloque 3     -> revisar. Cualquier usuario logueado puede escribir.
//   Bloque 4     -> informativo. Deny total: si una pantalla se ve vacía, mirá acá.
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
    titulo: '2. POLICIES QUE ALCANZAN AL ROL anon',
    critico: true,
    sql: `
      SELECT p.tablename AS tabla, p.policyname, p.cmd,
             COALESCE(s.n_live_tup, 0) AS filas
        FROM pg_policies p
        LEFT JOIN pg_stat_user_tables s ON s.relname = p.tablename AND s.schemaname = 'public'
       WHERE p.schemaname = 'public' AND 'anon' = ANY(p.roles)
       ORDER BY filas DESC, p.tablename`,
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

  await client.end();

  console.log(`\n${'='.repeat(72)}`);
  if (criticos > 0) {
    console.log(`❌ ${criticos} hallazgo(s) CRÍTICO(s): hay datos accesibles con la anon key pública.`);
    process.exit(1);
  }
  console.log('✅ Sin exposición anónima: ninguna tabla accesible con la anon key del bundle.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
