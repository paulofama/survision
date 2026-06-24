// ============================================================
// MIDDLEWARE: requireAuth(modulo) — autenticación + permiso de módulo
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Middleware reutilizable para proteger rutas del backend. Como el backend
// usa la service_role key (bypassa RLS), DEBE verificar acá la identidad y el
// permiso del que llama; si no, exponer el backend a internet permitiría
// saltear todo el RLS.
//
// USO:
//   const { requireAuth } = require('./middleware/auth');
//   app.use('/api/tesoreria', requireAuth('tesoreria'), tesoreriaRoutes);
//   app.use('/api/algo',      requireAuth(),            algoRoutes); // solo login
//
//   - requireAuth()          -> exige sesión válida (cualquier usuario logueado).
//   - requireAuth('modulo')  -> además exige app_tiene_permiso('modulo')=true.
//                               Los admins (rol es_admin) pasan siempre.
//
// Respuestas: 401 sin token / token inválido, 403 sin permiso, 500 error interno.
// Deja el usuario validado en req.authUser y el módulo exigido en req.authModulo.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function extraerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
}

/**
 * Crea un middleware que valida el JWT y, si se indica `modulo`, el permiso.
 * @param {string} [modulo] - clave de módulo (ej. 'sueldos', 'tesoreria'); omitir = solo login.
 */
function requireAuth(modulo) {
  return async function (req, res, next) {
    try {
      const token = extraerToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Falta el token de autenticación' });
      }

      // Cliente con el JWT del usuario: valida el token y, en el RPC, resuelve
      // auth.uid() a ese usuario (misma identidad que aplica el RLS).
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData || !userData.user) {
        return res.status(401).json({ error: 'Sesión inválida o expirada' });
      }

      if (modulo) {
        const { data: permitido, error: permErr } = await userClient.rpc('app_tiene_permiso', {
          p_modulo: modulo,
        });
        if (permErr) {
          console.error(`requireAuth(${modulo}): error verificando permiso:`, permErr.message);
          return res.status(500).json({ error: 'No se pudo verificar el permiso' });
        }
        if (permitido !== true) {
          return res.status(403).json({ error: `No tenés permiso para el módulo ${modulo}` });
        }
      }

      req.authUser = userData.user;
      req.authModulo = modulo || null;
      next();
    } catch (e) {
      console.error('requireAuth: error inesperado:', e.message);
      return res.status(500).json({ error: 'Error de autenticación' });
    }
  };
}

// Alias de compatibilidad para las rutas de Sueldos ya protegidas.
const requireSueldos = requireAuth('sueldos');

module.exports = { requireAuth, requireSueldos };
