-- ============================================================
-- MIGRACIÓN 35: Permiso propio del módulo Fiscal + cierre de la RLS
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- El módulo Fiscal (libro IVA Ventas/Compras) era el único sin permiso propio:
-- lo veía cualquier usuario logueado. Se le crea el permiso `fiscal` y se lo
-- siembra en los roles que hoy lo usan, para que nadie pierda acceso.
--
-- ⚠️ HALLAZGO DE SEGURIDAD (el motivo de fondo de esta migración):
--    Las 4 tablas `fiscal_iva_*` quedaron con las policies permisivas de la
--    migración 07 y el endurecimiento de la 07b NO las alcanzó:
--
--      pol_fiscal_iva_*_anon  ->  FOR ALL TO anon           USING (true)
--      pol_fiscal_iva_*_auth  ->  FOR ALL TO authenticated  USING (true)
--
--    La anon key viaja en el bundle del frontend (es pública por diseño), así
--    que con el sistema publicado en Netlify **cualquiera con esa clave podía
--    leer Y ESCRIBIR el libro IVA completo** — CUIT e importes de todos los
--    comprobantes de venta y compra, con permiso de DELETE incluido.
--
--    Acá se reemplazan por una única policy de SELECT para `authenticated` con
--    `app_tiene_permiso('fiscal')`. El rol `anon` queda afuera por completo.
--
-- Por qué SÓLO SELECT: el frontend nunca escribe en estas tablas (verificado:
-- `useFiscalIva` sólo hace .select()). Las escrituras son del backend, que usa
-- la SERVICE_ROLE key y bypassa RLS — no necesita policy. Si algún día la UI
-- tuviera que escribir, hay que agregar la policy explícitamente.
--
-- DECISIÓN DE ALCANCE (P. Famá, 2026-08-10): el permiso se siembra en
-- Contabilidad, Tesorería, Administracion y Contadora Sueldos (+ Administrador),
-- o sea todos los roles activos. Preserva quién ve qué hoy; el valor inmediato
-- es cerrar el acceso anon y dejar el interruptor para restringir después.
--
-- Idempotente (ON CONFLICT / DROP POLICY IF EXISTS). Atómica.
-- ============================================================

BEGIN;

-- ============================================================
-- A. SIEMBRA DEL PERMISO EN LOS ROLES
-- ============================================================
-- `permisos_rol` es (rol_id, modulo, puede_ver). Se siembra por NOMBRE de rol
-- para no depender de UUIDs. Los roles admin pasan igual por el bypass de
-- `app_tiene_permiso`, pero se siembra igual para que el checkbox aparezca
-- tildado en Roles del Sistema.
INSERT INTO public.permisos_rol (rol_id, modulo, puede_ver)
SELECT r.id, 'fiscal', true
  FROM public.roles r
 WHERE r.nombre IN ('Administrador', 'Contabilidad', 'Tesorería', 'Administracion', 'Contadora Sueldos')
ON CONFLICT (rol_id, modulo) DO UPDATE SET puede_ver = true;

-- ============================================================
-- B. RLS DE LAS TABLAS FISCALES
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fiscal_iva_ventas','fiscal_iva_compras','fiscal_iva_alicuotas','fiscal_iva_periodos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- Fuera las permisivas de la migración 07 (incluida la de `anon`).
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_anon ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_auth ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%s_select ON public.%I;', t, t);

    -- Lectura sólo para usuarios con el permiso `fiscal`.
    EXECUTE format(
      'CREATE POLICY pol_%s_select ON public.%I FOR SELECT TO authenticated '
      'USING (public.app_tiene_permiso(''fiscal''));', t, t);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  n_roles  integer;
  n_anon   integer;
  n_select integer;
  n_write  integer;
BEGIN
  SELECT count(*) INTO n_roles
    FROM public.permisos_rol p JOIN public.roles r ON r.id = p.rol_id
   WHERE p.modulo = 'fiscal' AND p.puede_ver;
  IF n_roles < 5 THEN
    RAISE EXCEPTION 'FALLO 35: se esperaban >= 5 roles con permiso fiscal, hay %', n_roles;
  END IF;

  -- Ninguna policy puede quedar para el rol anon.
  SELECT count(*) INTO n_anon
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename LIKE 'fiscal_iva_%'
     AND 'anon' = ANY(roles);
  IF n_anon > 0 THEN
    RAISE EXCEPTION 'FALLO 35: quedaron % policies con acceso anon en las tablas fiscales', n_anon;
  END IF;

  -- Una policy de SELECT por tabla (4) y ninguna de escritura.
  SELECT count(*) INTO n_select
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'fiscal_iva_%' AND cmd = 'SELECT';
  IF n_select <> 4 THEN
    RAISE EXCEPTION 'FALLO 35: se esperaban 4 policies de SELECT, hay %', n_select;
  END IF;

  SELECT count(*) INTO n_write
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'fiscal_iva_%' AND cmd <> 'SELECT';
  IF n_write > 0 THEN
    RAISE EXCEPTION 'FALLO 35: quedaron % policies de escritura (el backend usa service_role, no las necesita)', n_write;
  END IF;

  RAISE NOTICE 'OK 35: permiso fiscal en % roles; RLS de las 4 tablas fiscales cerrada a SELECT con permiso (anon afuera).', n_roles;
END $$;

COMMIT;
