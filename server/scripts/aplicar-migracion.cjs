// ============================================================
// APLICAR MIGRACIÓN SQL (DDL) a Supabase vía conexión Postgres directa
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/aplicar-migracion.cjs ../migrations/09_pacientes_geclisa.sql
//
// Requiere DATABASE_URL en server/.env (connection string de Postgres de
// Supabase — Project Settings > Database > Connection string > URI).
// Ejecuta el archivo .sql completo (respeta su BEGIN/COMMIT). Para DDL que la
// service_role key no puede correr vía la API REST.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const archivo = process.argv[2];
if (!archivo) {
  console.error('USO: node scripts/aplicar-migracion.cjs <ruta-al-archivo.sql>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en server/.env');
  process.exit(1);
}

const rutaSql = path.resolve(__dirname, archivo);
if (!fs.existsSync(rutaSql)) {
  console.error('No existe el archivo: ' + rutaSql);
  process.exit(1);
}

(async () => {
  const sql = fs.readFileSync(rutaSql, 'utf8');
  console.log(`Aplicando ${path.basename(rutaSql)} ...`);

  // user/host/puerto/db del DATABASE_URL (parser estándar, anda con o sin password);
  // la password de la variable SEPARADA SUPABASE_DB_PASSWORD (robusto ante chars especiales).
  // Normalizar: quedarnos desde 'postgresql://' (tolera prefijos basura como
  // 'postgresql:postgresql://...' por copy-paste).
  let dbUrl = process.env.DATABASE_URL;
  const idx = dbUrl.indexOf('postgresql://');
  if (idx > 0) dbUrl = dbUrl.slice(idx);
  else if (idx < 0) {
    const idx2 = dbUrl.indexOf('postgres://');
    if (idx2 >= 0) dbUrl = dbUrl.slice(idx2);
  }

  let u;
  try { u = new URL(dbUrl); }
  catch (e) { console.error('DATABASE_URL inválida:', e.message); process.exit(1); }

  const password = process.env.SUPABASE_DB_PASSWORD || decodeURIComponent(u.password || '');
  if (!password) {
    console.error('Falta la password: definí SUPABASE_DB_PASSWORD en server/.env (o incluila en DATABASE_URL).');
    process.exit(1);
  }
  const client = new Client({
    user: decodeURIComponent(u.username),
    password,
    host: u.hostname,
    port: parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  console.log(`Conectando como ${decodeURIComponent(u.username)} @ ${u.hostname}:${u.port}/${u.pathname.replace(/^\//, '')} (password desde ${process.env.SUPABASE_DB_PASSWORD ? 'SUPABASE_DB_PASSWORD' : 'DATABASE_URL'})`);

  try {
    await client.connect();
    const res = await client.query(sql);
    // Mostrar NOTICEs (RAISE NOTICE) si los hubo
    console.log('Ejecutado OK.');
    if (Array.isArray(res)) {
      console.log(`(${res.length} statements)`);
    }
  } catch (e) {
    console.error('ERROR aplicando la migración:', e.message);
    if (e.message && /ENETUNREACH|ETIMEDOUT|getaddrinfo/.test(e.message)) {
      console.error('\nPista: si es la "Direct connection" (puerto 5432) y tu red no tiene IPv6,');
      console.error('usá el connection string del "Session pooler" (puerto 6543) en DATABASE_URL.');
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
  process.exit(0);
})();
