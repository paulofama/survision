-- ============================================================
-- MIGRACIÓN 07b — Endurecimiento de RLS (Sueldos + perfiles)
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
--
-- ⚠️  MIGRACIÓN DESTRUCTIVA DE POLICIES. Aplicar SOLO cuando:
--     - El frontend ya autentica con Supabase Auth (login swap hecho), Y
--     - El backend usa la SERVICE_ROLE key (config/supabase.js actualizado +
--       backend reiniciado), porque al sacar el acceso `anon` el backend con
--       anon key quedaría bloqueado.
--
-- Qué hace:
--   1. Reemplaza TODAS las policies permisivas (USING(true) + duplicadas para
--      anon) de las tablas del módulo Sueldos por policies que exigen el
--      permiso 'sueldos' del usuario autenticado (app_tiene_permiso, de 07a).
--      → sin login, o logueado sin permiso 'sueldos' = CERO acceso.
--   2. Endurece las tablas de identidad (usuarios_sistema/roles/permisos_rol):
--      cada usuario ve su propia fila; el ABM es solo para admins; anon afuera
--      (cierra el leak de listar usuarios sin login).
--
--   Admins (rol es_admin=true) pasan app_tiene_permiso(...) siempre (la función
--   corto-circuita por es_admin), así que conservan acceso total.
--   La service_role del backend bypassa RLS (no la afectan estas policies).
--
-- NO toca el bucket de storage 'sueldos-adjuntos' (va en un paso aparte, tras
-- inspeccionar sus policies actuales para no afectar otros buckets).
--
-- Idempotente: dropea todas las policies existentes de cada tabla antes de
-- recrear. Atómica (BEGIN/COMMIT).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Helper: ¿el usuario autenticado es admin?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_es_admin()
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
      AND r.es_admin = true
  );
$$;
REVOKE ALL ON FUNCTION public.app_es_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_es_admin() TO authenticated;

-- ------------------------------------------------------------
-- 1. Dropear TODAS las policies existentes de las tablas objetivo
-- ------------------------------------------------------------
DO $$
DECLARE
  r record;
  objetivo text[] := ARRAY[
    'liquidaciones_mes','liquidacion_bloques','liquidacion_lineas_empleado',
    'liquidacion_lineas_concepto','f931_declaraciones','f931_adjuntos',
    'conciliacion_diferencias','asientos_sueldos','asiento_sueldos_lineas',
    'hallazgos_sueldos','plan_cuentas','empleados','log_auditoria_sueldos',
    'usuarios_sistema','roles','permisos_rol'
  ];
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(objetivo)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Tablas de DATOS de Sueldos: acceso gateado por permiso 'sueldos'
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  datos text[] := ARRAY[
    'liquidaciones_mes','liquidacion_bloques','liquidacion_lineas_empleado',
    'liquidacion_lineas_concepto','f931_declaraciones','f931_adjuntos',
    'conciliacion_diferencias','asientos_sueldos','asiento_sueldos_lineas',
    'hallazgos_sueldos','plan_cuentas','empleados','log_auditoria_sueldos'
  ];
BEGIN
  FOREACH t IN ARRAY datos LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      || 'USING (public.app_tiene_permiso(''sueldos'')) '
      || 'WITH CHECK (public.app_tiene_permiso(''sueldos''))',
      'pol_' || t || '_sueldos', t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Tablas de IDENTIDAD: perfil propio + ABM solo admin (anon afuera)
-- ------------------------------------------------------------

-- usuarios_sistema: cada uno ve/edita su fila; insert/delete solo admin.
ALTER TABLE public.usuarios_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY pol_usuarios_sistema_select ON public.usuarios_sistema
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.app_es_admin());

CREATE POLICY pol_usuarios_sistema_update ON public.usuarios_sistema
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR public.app_es_admin())
  WITH CHECK (auth_user_id = auth.uid() OR public.app_es_admin());

CREATE POLICY pol_usuarios_sistema_insert ON public.usuarios_sistema
  FOR INSERT TO authenticated
  WITH CHECK (public.app_es_admin());

CREATE POLICY pol_usuarios_sistema_delete ON public.usuarios_sistema
  FOR DELETE TO authenticated
  USING (public.app_es_admin());

-- roles: lectura para cualquier autenticado (la UI arma menús/permisos);
-- escritura solo admin.
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY pol_roles_select ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY pol_roles_insert ON public.roles FOR INSERT TO authenticated WITH CHECK (public.app_es_admin());
CREATE POLICY pol_roles_update ON public.roles FOR UPDATE TO authenticated USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());
CREATE POLICY pol_roles_delete ON public.roles FOR DELETE TO authenticated USING (public.app_es_admin());

-- permisos_rol: lectura para cualquier autenticado; escritura solo admin.
ALTER TABLE public.permisos_rol ENABLE ROW LEVEL SECURITY;
CREATE POLICY pol_permisos_rol_select ON public.permisos_rol FOR SELECT TO authenticated USING (true);
CREATE POLICY pol_permisos_rol_insert ON public.permisos_rol FOR INSERT TO authenticated WITH CHECK (public.app_es_admin());
CREATE POLICY pol_permisos_rol_update ON public.permisos_rol FOR UPDATE TO authenticated USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());
CREATE POLICY pol_permisos_rol_delete ON public.permisos_rol FOR DELETE TO authenticated USING (public.app_es_admin());

-- ------------------------------------------------------------
-- 4. Verificación
-- ------------------------------------------------------------
DO $$
DECLARE
  n_anon int;
BEGIN
  -- No debe quedar NINGUNA policy para el rol anon en las tablas objetivo.
  SELECT count(*) INTO n_anon
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY(ARRAY[
      'liquidaciones_mes','liquidacion_bloques','liquidacion_lineas_empleado',
      'liquidacion_lineas_concepto','f931_declaraciones','f931_adjuntos',
      'conciliacion_diferencias','asientos_sueldos','asiento_sueldos_lineas',
      'hallazgos_sueldos','plan_cuentas','empleados','log_auditoria_sueldos',
      'usuarios_sistema','roles','permisos_rol'])
    AND 'anon' = ANY(roles);
  IF n_anon > 0 THEN
    RAISE EXCEPTION 'FALLO: quedaron % policies para anon en tablas objetivo', n_anon;
  END IF;
  RAISE NOTICE 'OK 07b: RLS endurecido. Sin policies anon en las 16 tablas objetivo.';
END $$;

COMMIT;
