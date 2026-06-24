// ============================================================
// PROVISIONAMIENTO de usuarios en Supabase Auth + vínculo
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/crear-usuarios-auth.js            -> DRY-RUN (muestra qué haría)
//   node scripts/crear-usuarios-auth.js --write     -> crea/vincula de verdad
//
// QUÉ HACE (paso 2 del runbook de deploy remoto):
//   Lee TODOS los usuarios de usuarios_sistema y, para cada uno:
//     1. Crea (o encuentra, si ya existe) su usuario en Supabase Auth con
//        email_confirm=true (emails sintéticos, no reciben correo).
//        - Email: usa usuarios_sistema.email si existe, si no <username>@survision.local
//        - Password inicial: usa usuarios_sistema.password_hash (la contraseña
//          actual en texto plano) -> el login les queda IGUAL que hoy.
//     2. Linkea el uid a usuarios_sistema.auth_user_id (+ email si estaba null).
//
//   NO hardcodea contraseñas en este archivo (las toma de la BD).
//   NO toca password_hash (el login viejo sigue andando hasta el swap del paso 3).
//
// REQUISITOS (en server/.env):
//   SUPABASE_URL=...                  (ya existe)
//   SUPABASE_SERVICE_ROLE_KEY=...     (la "secret" del panel; ya agregada)
//   ⚠️ La service_role key bypassa RLS y es secreta: solo en server/.env.
//
// Supabase Auth exige password >= 6 chars. Los que tengan menos se REPORTAN y
// se saltean: corregí su password_hash en usuarios_sistema (>=6) o ponelo en
// OVERRIDES y volvé a correr. (Hoy: 'romina_villar' tiene 5.)
//
// Idempotente: si el usuario Auth ya existe (mismo email) lo reutiliza; si la
// fila ya está linkeada al mismo uid, no hace nada.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

// ------------------------------------------------------------
// AJUSTES OPCIONALES
// ------------------------------------------------------------
// Password mínimo a setear cuando el de la BD es muy corto o querés forzar uno.
//   { '<username>': '<password nuevo>=6+ chars' }
const OVERRIDES = {
  // Para passwords < 6 chars o forzar uno: { '<username>': '<password>' }.
  // NO commitear contraseñas reales acá (completar solo al ejecutar localmente).
  // Ej.: 'romina_villar' tenía 'ojo25' (5 chars) y se le puso uno de >=6.
};
// Usernames a NO provisionar (si hubiera alguno que no debe loguear).
const EXCLUDE = new Set([
  // 'algun_username',
]);
const DOMINIO_SINTETICO = 'survision.local';
const MIN_PASSWORD = 6;

// ------------------------------------------------------------
const WRITE = process.argv.includes('--write');
const log = console.log;

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('ERROR: faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en server/.env');
  process.exit(1);
}

// Cliente admin (service_role: bypassa RLS y habilita auth.admin.*)
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Busca un usuario de Auth por email recorriendo las páginas (no hay getByEmail).
async function buscarAuthUserPorEmail(email) {
  const emailLc = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('listUsers: ' + error.message);
    const found = (data.users || []).find((u) => (u.email || '').toLowerCase() === emailLc);
    if (found) return found;
    if (!data.users || data.users.length < 200) return null; // última página
    page += 1;
  }
}

(async () => {
  log('='.repeat(70));
  log(`CREAR USUARIOS AUTH — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  log(`Supabase: ${url}`);
  log('='.repeat(70));

  // Cargar usuarios desde la BD (username, email, password_hash, activo)
  const { data: filas, error: eSel } = await admin
    .from('usuarios_sistema')
    .select('id, username, email, password_hash, activo, auth_user_id')
    .order('username');
  if (eSel) { console.error('ERROR leyendo usuarios_sistema:', eSel.message); process.exit(1); }

  let okCount = 0;
  const saltados = [];
  for (const f of filas || []) {
    if (EXCLUDE.has(f.username)) { log(`\n• ${f.username}  [EXCLUIDO]`); continue; }

    const email = (f.email && f.email.trim()) || `${f.username}@${DOMINIO_SINTETICO}`;
    const password = OVERRIDES[f.username] || f.password_hash || '';
    log(`\n• ${f.username}  <${email}>`);

    if (password.length < MIN_PASSWORD) {
      log(`   ⚠️  password de ${password.length} chars (< ${MIN_PASSWORD}) — salteo. Corregí password_hash o usá OVERRIDES.`);
      saltados.push(f.username);
      continue;
    }

    // Obtener o crear el usuario de Auth
    let authUser = await buscarAuthUserPorEmail(email);
    if (authUser) {
      log(`   Auth: ya existe (uid=${authUser.id}).`);
    } else if (!WRITE) {
      log(`   Auth: se CREARÍA con email_confirm=true.`);
    } else {
      const { data: created, error: eCreate } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (eCreate) { log(`   ERROR creando Auth user: ${eCreate.message} — salteo.`); saltados.push(f.username); continue; }
      authUser = created.user;
      log(`   Auth: creado (uid=${authUser.id}).`);
    }

    // Linkear usuarios_sistema.auth_user_id + email
    if (f.auth_user_id && authUser && f.auth_user_id === authUser.id) {
      log(`   Vínculo: ya estaba linkeado al mismo uid. OK.`);
      okCount++;
      continue;
    }
    if (!WRITE) { log(`   Vínculo: se ACTUALIZARÍA usuarios_sistema.auth_user_id (+ email).`); continue; }
    if (!authUser) continue;

    const { error: eLink } = await admin
      .from('usuarios_sistema')
      .update({ auth_user_id: authUser.id, email })
      .eq('id', f.id);
    if (eLink) { log(`   ERROR linkeando: ${eLink.message} — salteo.`); saltados.push(f.username); continue; }
    log(`   Vínculo: OK (auth_user_id seteado).`);
    okCount++;
  }

  log('\n' + '='.repeat(70));
  if (saltados.length) log(`SALTADOS (${saltados.length}): ${saltados.join(', ')}`);
  if (!WRITE) log('DRY-RUN. Para ejecutar: node scripts/crear-usuarios-auth.js --write');
  else log(`Listo. ${okCount}/${(filas || []).length} usuarios creados/vinculados.`);
  log('SIGUIENTE: swap del login del frontend a signInWithPassword (paso 3).');
  process.exit(0);
})().catch((e) => { console.error('ERROR fatal:', e.message); process.exit(1); });
