-- ============================================================
-- Migración 74 — permiso propio para la conciliación agenda/facturación
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- POR QUÉ SE CAMBIA EL PERMISO QUE ACABA DE PONER LA 73
-- ------------------------------------------------------
-- La 73 gateó `conciliacion_agenda` con `informes`, el permiso de Análisis ›
-- Por Prestación. Probado contra la RLS real, impersonando usuarios:
--
--   paulofama        Administrador    ve 56 filas
--   marianela_murgo  Contabilidad     ve 56 filas
--   rosa_rodriguez   Administracion   ve  0 filas
--   ivana_parra      Tesorería        ve  0 filas
--
-- `app_tiene_permiso` exige `puede_ver = true`, y el rol Administracion tiene
-- `informes` en false. O sea: los 9 usuarios de Administración —que son
-- EXACTAMENTE quienes van a corregir los códigos en GECLISA— abrían la sección
-- y la veían vacía, sin ningún error. Es el bug de "sección vacía por RLS".
--
-- Las dos salidas posibles eran darle `informes` a Administración, que les
-- abriría todo Análisis (rentabilidad, márgenes, resultado por prestación), o
-- un permiso propio. Se eligió el permiso propio: es el único que les da la
-- lista de diferencias sin abrirles los márgenes.
--
-- A QUIÉN SE LE DA
-- -----------------
-- · Administracion — trabaja la lista: es quien corrige en GECLISA.
-- · Contabilidad   — YA veía la tabla a través de `informes`. Se le mantiene a
--                    propósito: cambiar el gate no tiene por qué quitarle a
--                    nadie un acceso que ya tenía.
-- · Administrador  — `es_admin`, no necesita fila.
--
-- Tesorería y Contadora Sueldos no la veían antes y siguen sin verla.
--
-- Idempotente: el permiso se inserta con ON CONFLICT y la policy se recrea.
-- No se borra la columna ni la tabla de la 73; sólo cambia quién puede leerla.
-- ============================================================

BEGIN;

-- ── La policy pasa a pedir el permiso propio ───────────────────────────────
DROP POLICY IF EXISTS pol_conciliacion_agenda ON public.conciliacion_agenda;
CREATE POLICY pol_conciliacion_agenda ON public.conciliacion_agenda
  FOR ALL TO authenticated
  USING (public.app_tiene_permiso('conciliacion'))
  WITH CHECK (public.app_tiene_permiso('conciliacion'));

-- ── Alta del permiso en los roles que lo necesitan ─────────────────────────
-- Se resuelve por NOMBRE de rol y no por id hardcodeado: los ids son de esta
-- base y la migración tiene que poder correr en otra.
INSERT INTO public.permisos_rol (rol_id, modulo, puede_ver)
SELECT r.id, 'conciliacion', true
  FROM public.roles r
 WHERE r.nombre IN ('Administracion', 'Contabilidad')
ON CONFLICT (rol_id, modulo) DO UPDATE SET puede_ver = true;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_def text;
  v_roles integer;
  v_admin integer;
  v_filas integer;
BEGIN
  SELECT qual INTO v_def FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'conciliacion_agenda'
     AND policyname = 'pol_conciliacion_agenda';

  IF v_def IS NULL OR v_def NOT LIKE '%conciliacion%' THEN
    RAISE EXCEPTION 'ABORTA: la policy no quedó pidiendo el permiso conciliacion: %', v_def;
  END IF;
  IF v_def LIKE '%informes%' THEN
    RAISE EXCEPTION 'ABORTA: la policy sigue pidiendo informes: %', v_def;
  END IF;

  -- Los dos roles que trabajan la lista tienen que poder verla.
  SELECT count(*) INTO v_roles
    FROM public.permisos_rol pr JOIN public.roles r ON r.id = pr.rol_id
   WHERE pr.modulo = 'conciliacion' AND pr.puede_ver
     AND r.nombre IN ('Administracion', 'Contabilidad');
  IF v_roles <> 2 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 2 roles con el permiso, hay %', v_roles;
  END IF;

  -- Y los admin, por `es_admin`, sin fila propia.
  SELECT count(*) INTO v_admin FROM public.roles WHERE es_admin AND activo;
  IF v_admin < 1 THEN
    RAISE EXCEPTION 'ABORTA: no hay ningún rol admin activo';
  END IF;

  -- Las filas espejadas no se tocan.
  SELECT count(*) INTO v_filas FROM public.conciliacion_agenda;
  RAISE NOTICE 'Permiso conciliacion asignado a % rol(es). % fila(s) intactas.', v_roles, v_filas;
END $$;
