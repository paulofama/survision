-- ===========================================================================
-- 32_bancos_rls_permiso_granular.sql
-- Sistema de Gestión Integral - Survisión S.A.
-- Repunta el RLS de las tablas de Bancos del permiso 'tesoreria' al permiso
-- granular 'tesoreria:bancos'. Así, destildar "Bancos" en Roles del Sistema
-- BLOQUEA también el acceso a los datos (no solo esconde el menú).
--
-- SIN LOCKOUT: previamente se sembró permisos_rol 'tesoreria:bancos'=true para
-- todos los roles que ya tenían 'tesoreria' (Tesorería, Contabilidad, Admin).
-- Los admins pasan por app_es_admin(). El daemon escribe con service_role.
-- Idempotente.
-- ===========================================================================

BEGIN;

-- banco_cuentas
DROP POLICY IF EXISTS pol_banco_cuentas_sel ON public.banco_cuentas;
CREATE POLICY pol_banco_cuentas_sel ON public.banco_cuentas
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));

-- banco_importaciones
DROP POLICY IF EXISTS pol_banco_imp_sel ON public.banco_importaciones;
CREATE POLICY pol_banco_imp_sel ON public.banco_importaciones
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_banco_imp_ins ON public.banco_importaciones;
CREATE POLICY pol_banco_imp_ins ON public.banco_importaciones
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));

-- banco_movimientos
DROP POLICY IF EXISTS pol_banco_mov_sel ON public.banco_movimientos;
CREATE POLICY pol_banco_mov_sel ON public.banco_movimientos
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_banco_mov_ins ON public.banco_movimientos;
CREATE POLICY pol_banco_mov_ins ON public.banco_movimientos
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_banco_mov_upd ON public.banco_movimientos;
CREATE POLICY pol_banco_mov_upd ON public.banco_movimientos
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'))
  WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));

-- geclisa_valores
DROP POLICY IF EXISTS pol_gv_sel ON public.geclisa_valores;
CREATE POLICY pol_gv_sel ON public.geclisa_valores
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_gv_upd ON public.geclisa_valores;
CREATE POLICY pol_gv_upd ON public.geclisa_valores
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'))
  WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));

-- conciliaciones
DROP POLICY IF EXISTS pol_concil_sel ON public.conciliaciones;
CREATE POLICY pol_concil_sel ON public.conciliaciones
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_ins ON public.conciliaciones;
CREATE POLICY pol_concil_ins ON public.conciliaciones
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_upd ON public.conciliaciones;
CREATE POLICY pol_concil_upd ON public.conciliaciones
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'))
  WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_del ON public.conciliaciones;
CREATE POLICY pol_concil_del ON public.conciliaciones
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));

-- conciliacion_banco
DROP POLICY IF EXISTS pol_concil_banco_sel ON public.conciliacion_banco;
CREATE POLICY pol_concil_banco_sel ON public.conciliacion_banco
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_banco_ins ON public.conciliacion_banco;
CREATE POLICY pol_concil_banco_ins ON public.conciliacion_banco
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_banco_del ON public.conciliacion_banco;
CREATE POLICY pol_concil_banco_del ON public.conciliacion_banco
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));

-- conciliacion_geclisa
DROP POLICY IF EXISTS pol_concil_gv_sel ON public.conciliacion_geclisa;
CREATE POLICY pol_concil_gv_sel ON public.conciliacion_geclisa
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_gv_ins ON public.conciliacion_geclisa;
CREATE POLICY pol_concil_gv_ins ON public.conciliacion_geclisa
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_concil_gv_del ON public.conciliacion_geclisa;
CREATE POLICY pol_concil_gv_del ON public.conciliacion_geclisa
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));

-- banco_reglas
DROP POLICY IF EXISTS pol_banco_reglas_sel ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_sel ON public.banco_reglas
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_banco_reglas_ins ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_ins ON public.banco_reglas
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_banco_reglas_upd ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_upd ON public.banco_reglas
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'))
  WITH CHECK (public.app_tiene_permiso('tesoreria:bancos'));
DROP POLICY IF EXISTS pol_banco_reglas_del ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_del ON public.banco_reglas
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria:bancos'));

-- Verificación: ninguna policy de bancos debe seguir gateada por 'tesoreria' pelado
DO $$
DECLARE n_viejo int;
BEGIN
  SELECT count(*) INTO n_viejo FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('banco_cuentas','banco_importaciones','banco_movimientos','geclisa_valores',
                       'conciliaciones','conciliacion_banco','conciliacion_geclisa','banco_reglas')
     AND (qual LIKE '%''tesoreria''%' OR with_check LIKE '%''tesoreria''%');
  IF n_viejo > 0 THEN RAISE EXCEPTION 'Quedan % policies de bancos con el permiso viejo tesoreria', n_viejo; END IF;
  RAISE NOTICE 'RLS de bancos repuntado a tesoreria:bancos OK';
END $$;

COMMIT;
