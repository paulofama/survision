-- ============================================================
-- MIGRACION 07a — Vínculo con Supabase Auth + función de permisos
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
--
-- PARTE NO DESTRUCTIVA del endurecimiento de seguridad para exponer
-- el módulo Sueldos a contadoras externas (ver runbook de deploy remoto).
--
-- Qué hace:
--   1. Agrega usuarios_sistema.auth_user_id (FK a auth.users) para linkear
--      cada usuario de la app con su usuario de Supabase Auth.
--   2. Crea la función app_tiene_permiso(modulo) que, dado el usuario
--      autenticado (auth.uid()), responde si su rol tiene ese permiso.
--      La usará el RLS endurecido de la migración 07b.
--
-- SEGURA DE APLICAR EN CUALQUIER MOMENTO: no toca policies ni rompe el
-- login actual (que sigue usando usuarios_sistema.password_hash). La
-- columna nueva queda NULL hasta que se creen y linkeen los usuarios Auth.
--
-- Idempotente (IF NOT EXISTS / OR REPLACE). Atómica (BEGIN/COMMIT).
--
-- DESPUÉS de aplicar esta migración:
--   - Crear los usuarios en Supabase Auth (emails sintéticos nombre@survision.local).
--   - Linkear: UPDATE usuarios_sistema SET auth_user_id = '<uid>' WHERE username = '...';
--   - Recién entonces migrar el login del frontend a signInWithPassword.
--   - El RLS endurecido (drop anon + USING app_tiene_permiso) va en 07b,
--     SOLO cuando el frontend ya autentique con Supabase y el backend use service_role.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Vínculo usuarios_sistema -> auth.users
-- ------------------------------------------------------------
ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.usuarios_sistema.auth_user_id IS
  'Usuario de Supabase Auth vinculado. NULL = todavía no migrado a Auth. Lo usa app_tiene_permiso() para el RLS.';

-- Un usuario de Auth no puede estar vinculado a dos filas de usuarios_sistema.
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_sistema_auth_user_id
  ON public.usuarios_sistema(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Función de permisos por módulo (la consume el RLS de 07b)
-- ------------------------------------------------------------
-- SECURITY DEFINER: corre con privilegios del owner para poder leer
-- usuarios_sistema/roles/permisos_rol aunque el caller (authenticated)
-- no tenga SELECT directo sobre ellas. search_path fijado por seguridad.
--
-- Devuelve TRUE si el usuario autenticado:
--   - está activo y su rol está activo, Y
--   - su rol es_admin = true  O  tiene permiso puede_ver para el módulo.
CREATE OR REPLACE FUNCTION public.app_tiene_permiso(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuarios_sistema u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid()
      AND u.activo = true
      AND r.activo = true
      AND (
        r.es_admin = true
        OR EXISTS (
          SELECT 1
          FROM permisos_rol pr
          WHERE pr.rol_id = r.id
            AND pr.modulo = p_modulo
            AND pr.puede_ver = true
        )
      )
  );
$$;

COMMENT ON FUNCTION public.app_tiene_permiso(text) IS
  'TRUE si el usuario autenticado (auth.uid()) tiene el permiso de módulo indicado, vía usuarios_sistema.auth_user_id -> roles/permisos_rol. Usada por las policies RLS endurecidas (migración 07b).';

-- Permitir que el rol authenticated invoque la función (anon NO).
REVOKE ALL ON FUNCTION public.app_tiene_permiso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_tiene_permiso(text) TO authenticated;

-- ------------------------------------------------------------
-- 3. Verificación
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios_sistema'
      AND column_name = 'auth_user_id'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se creó usuarios_sistema.auth_user_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_tiene_permiso'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se creó la función app_tiene_permiso';
  END IF;

  RAISE NOTICE 'OK 07a: columna auth_user_id + función app_tiene_permiso creadas.';
END $$;

COMMIT;
