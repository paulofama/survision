// ============================================
// CLIENTE SUPABASE - Backend API
// Sistema Integral de Gestion - Survision S.A.
// ============================================
//
// Cliente singleton del proyecto Supabase usado por el modulo Sueldos
// (tablas plan_cuentas, empleados, log_auditoria_sueldos) y futuros modulos
// que necesiten acceso server-side a Supabase.
//
// Configuracion: lee SUPABASE_URL y SUPABASE_ANON_KEY de las variables de
// entorno (definidas en server/.env). Usa el cliente compartido en todos
// los routers para mantener una sola conexion HTTP/2 reutilizable.
//
// IMPORTANTE: con la anon key se respeta RLS. Para operaciones que
// necesiten bypass de RLS (importacion masiva, triggers de auditoria),
// se debera anadir SUPABASE_SERVICE_ROLE_KEY mas adelante.
// ============================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_ANON_KEY');
  console.error('Asegurate de que server/.env tenga ambas definidas.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,    // backend stateless
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'X-Client-Info': 'sistema-costos-api/1.0.0',
    },
  },
});

/**
 * Mapea un error de Supabase a un mensaje en espanol mas claro.
 * @param {any} error
 * @returns {string}
 */
function mensajeError(error) {
  if (!error) return 'Error desconocido';
  switch (error.code) {
    case 'PGRST116': return 'Registro no encontrado';
    case 'PGRST301': return 'Permisos insuficientes (RLS)';
    case '23505':    return 'Ya existe un registro con esos datos (clave unica duplicada)';
    case '23503':    return 'Violacion de integridad referencial';
    case '23502':    return 'Falta un campo obligatorio';
    default:         return error.message || 'Error en Supabase';
  }
}

module.exports = {
  supabase,
  mensajeError,
};
