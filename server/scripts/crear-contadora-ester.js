// ============================================================
// CREAR CONTADORA "Ester Vela" — rol + usuario + Auth
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/crear-contadora-ester.js            -> DRY-RUN
//   node scripts/crear-contadora-ester.js --write     -> crea de verdad
//
// QUÉ HACE (idempotente):
//   1. Crea (o reutiliza) el rol 'Contadora Sueldos' y le setea permisos:
//      dashboard=true, sueldos=true, resto=false (sin sueldos:reportes).
//   2. Crea (o reutiliza) la fila de usuarios_sistema para Ester.
//   3. Crea (o reutiliza) su usuario en Supabase Auth (email_confirm=true).
//   4. Linkea usuarios_sistema.auth_user_id.
//
// REQUISITOS (server/.env): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

// ------------------------------------------------------------
// DATOS DE LA CONTADORA  ← COMPLETAR EMAIL Y PASSWORD
// ------------------------------------------------------------
const ESTER = {
  username: 'ester_vela',
  nombre_completo: 'Ester Vela',
  email: 'ester_vela@institutodrmercado.com.ar',
  password: '', // completar al ejecutar (NO commitear contraseñas reales)
};

const ROL_NOMBRE = 'Contadora Sueldos';
// Permisos del rol: solo lo necesario para operar Sueldos.
const ROL_PERMISOS = {
  dashboard: true,
  prestaciones: false, insumos: false, analisis: false, analisis_marginal: false,
  tesoreria: false, liquidaciones: false, presupuestador: false, informes: false,
  seguimiento_pacientes: false, usuarios: false, roles: false,
  sueldos: true,             // todo lo operativo del módulo
  'sueldos:reportes': false, // reportes = solo Auditor (Paulo)
};

// ------------------------------------------------------------
const WRITE = process.argv.includes('--write');
const log = console.log;

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('ERROR: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en server/.env'); process.exit(1); }
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function buscarAuthUserPorEmail(email) {
  const emailLc = email.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('listUsers: ' + error.message);
    const found = (data.users || []).find((u) => (u.email || '').toLowerCase() === emailLc);
    if (found) return found;
    if (!data.users || data.users.length < 200) return null;
    page += 1;
  }
}

(async () => {
  log('='.repeat(70));
  log(`CREAR CONTADORA "${ESTER.nombre_completo}" — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  log('='.repeat(70));

  if (!ESTER.password || ESTER.password.length < 6) {
    log(`\n⚠️  Falta la contraseña inicial (>= 6 chars) en ESTER.password. Completala y volvé a correr.`);
    if (WRITE) process.exit(1);
  }

  // 1. Rol -----------------------------------------------------------------
  let { data: rol } = await admin.from('roles').select('id, nombre').eq('nombre', ROL_NOMBRE).maybeSingle();
  if (rol) {
    log(`\n1) Rol '${ROL_NOMBRE}': ya existe (id ${rol.id.slice(0, 8)}).`);
  } else if (!WRITE) {
    log(`\n1) Rol '${ROL_NOMBRE}': se CREARÍA (es_admin=false, activo=true).`);
  } else {
    const { data: nuevo, error } = await admin.from('roles')
      .insert({ nombre: ROL_NOMBRE, descripcion: 'Contadora externa de Sueldos (acceso operativo, sin reportes)', es_admin: false, activo: true })
      .select().single();
    if (error) { log(`   ERROR creando rol: ${error.message}`); process.exit(1); }
    rol = nuevo;
    log(`\n1) Rol '${ROL_NOMBRE}': creado (id ${rol.id.slice(0, 8)}).`);
  }

  // 2. Permisos del rol -----------------------------------------------------
  const permisosRows = Object.entries(ROL_PERMISOS).map(([modulo, puede_ver]) => ({ modulo, puede_ver }));
  if (!WRITE) {
    log(`2) Permisos del rol: se UPSERTEARÍAN ${permisosRows.length} módulos (sueldos=true, dashboard=true, resto=false).`);
  } else if (rol) {
    for (const r of permisosRows) {
      // upsert manual: existe?
      const { data: ex } = await admin.from('permisos_rol').select('id').eq('rol_id', rol.id).eq('modulo', r.modulo).maybeSingle();
      if (ex) {
        await admin.from('permisos_rol').update({ puede_ver: r.puede_ver }).eq('id', ex.id);
      } else {
        await admin.from('permisos_rol').insert({ rol_id: rol.id, modulo: r.modulo, puede_ver: r.puede_ver });
      }
    }
    log(`2) Permisos del rol: ${permisosRows.length} módulos seteados (sueldos=true).`);
  }

  // 3. Fila usuarios_sistema ------------------------------------------------
  let { data: fila } = await admin.from('usuarios_sistema').select('id, username, auth_user_id').eq('username', ESTER.username).maybeSingle();
  if (fila) {
    log(`3) usuarios_sistema '${ESTER.username}': ya existe (id ${fila.id.slice(0, 8)}).`);
  } else if (!WRITE) {
    log(`3) usuarios_sistema '${ESTER.username}': se CREARÍA (rol '${ROL_NOMBRE}', activo).`);
  } else {
    const { data: nueva, error } = await admin.from('usuarios_sistema')
      .insert({ username: ESTER.username, nombre_completo: ESTER.nombre_completo, password_hash: ESTER.password, email: ESTER.email, rol_id: rol.id, activo: true })
      .select().single();
    if (error) { log(`   ERROR creando usuarios_sistema: ${error.message}`); process.exit(1); }
    fila = nueva;
    log(`3) usuarios_sistema '${ESTER.username}': creada (id ${fila.id.slice(0, 8)}).`);
  }

  // 4. Usuario de Auth + vínculo -------------------------------------------
  if (!WRITE) {
    log(`4) Auth + vínculo: se CREARÍA usuario Auth <${ESTER.email}> y se linkearía auth_user_id.`);
    log('\nDRY-RUN. Para ejecutar: node scripts/crear-contadora-ester.js --write');
    process.exit(0);
  }

  let authUser = await buscarAuthUserPorEmail(ESTER.email);
  if (authUser) {
    log(`4) Auth: ya existe (uid ${authUser.id.slice(0, 8)}).`);
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({ email: ESTER.email, password: ESTER.password, email_confirm: true });
    if (error) { log(`   ERROR creando Auth user: ${error.message}`); process.exit(1); }
    authUser = created.user;
    log(`4) Auth: creado (uid ${authUser.id.slice(0, 8)}).`);
  }

  const { error: eLink } = await admin.from('usuarios_sistema').update({ auth_user_id: authUser.id, email: ESTER.email }).eq('id', fila.id);
  if (eLink) { log(`   ERROR linkeando: ${eLink.message}`); process.exit(1); }

  log('\n' + '='.repeat(70));
  log(`Listo. Ester Vela creada y lista para loguear:`);
  log(`   email: ${ESTER.email}`);
  log(`   rol:   ${ROL_NOMBRE} (sueldos=true)`);
  process.exit(0);
})().catch((e) => { console.error('ERROR fatal:', e.message); process.exit(1); });
