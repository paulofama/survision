-- ============================================================
-- MIGRACIÓN 19: espejo de turnos futuros GECLISA -> Supabase + permiso 'turnos'
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
-- Crea la tabla espejo que alimenta la sección operativa "Turnos" (agenda de
-- turnos futuros + recordatorios por WhatsApp). La refresca el daemon on-prem
-- (sync-all.cjs) con full refresh (~280 filas): solo turnos VIGENTES, es decir
-- tur_fecha >= hoy AND (Me_id = 0 OR Me_id IS NULL). No existe flag de anulado
-- en GECLISA (los anulados se borran), así que todo lo espejado es un turno vivo.
--
-- El teléfono ya viene NORMALIZADO desde el extractor (telefono_norm =
-- "549XXXXXXXXXX" listo para wa.me, o NULL si el celular es inválido) -> el
-- frontend no hace lógica de teléfono.
--
-- PERMISO: módulo nuevo 'turnos'. El RLS usa app_tiene_permiso('turnos'); para
-- que devuelva true a los no-admin, 'turnos' debe existir como permiso en
-- permisos_rol (esta migración lo asigna a Administracion y Recepcion, que son
-- los roles de las secretarias) y como MODULOS_SISTEMA en el frontend (se agrega
-- en auth.types.ts en el mismo commit). Los admin pasan por es_admin.
--
-- Idempotente. Atómica (BEGIN/COMMIT). PK turno_id.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tabla espejo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.turnos_futuros (
  turno_id       integer PRIMARY KEY,
  fecha          date    NOT NULL,
  hora           text,                       -- "HH:MM" derivada de Hs_Ini
  hs_ini         smallint,                   -- crudo, para ordenar dentro del día
  paciente       text,                       -- "APELLIDO, Nombre"
  telefono_norm  text,                       -- "549XXXXXXXXXX" listo p/ wa.me, o NULL si inválido
  prestador      text,
  serv_id        integer,
  servicio       text,
  obra_social    text,
  confirmado     boolean NOT NULL DEFAULT false,
  synced_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turnos_futuros_fecha ON public.turnos_futuros (fecha);

COMMENT ON TABLE public.turnos_futuros IS
  'Espejo de turnos VIGENTES (tur_fecha>=hoy y no atendidos) para la sección operativa Turnos (agenda + recordatorios WhatsApp). Lo refresca el daemon on-prem (full refresh). telefono_norm ya viene listo para wa.me.';

-- ------------------------------------------------------------
-- 2. RLS: solo authenticated con permiso 'turnos'
-- ------------------------------------------------------------
ALTER TABLE public.turnos_futuros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_turnos_futuros_select ON public.turnos_futuros;
CREATE POLICY pol_turnos_futuros_select ON public.turnos_futuros
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('turnos'));

-- ------------------------------------------------------------
-- 3. Permiso 'turnos' para los roles de secretarías (Administracion, Recepcion)
--    Idempotente vía WHERE NOT EXISTS (sin depender del nombre de la constraint).
-- ------------------------------------------------------------
INSERT INTO public.permisos_rol (id, rol_id, modulo, puede_ver)
SELECT gen_random_uuid(), r.id, 'turnos', true
FROM public.roles r
WHERE r.nombre IN ('Administracion', 'Recepcion')
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos_rol pr
    WHERE pr.rol_id = r.id AND pr.modulo = 'turnos'
  );

-- ------------------------------------------------------------
-- 4. Verificación
-- ------------------------------------------------------------
DO $$
DECLARE
  n_perms integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'turnos_futuros'
  ) THEN
    RAISE EXCEPTION 'FALLO: no se creó la tabla turnos_futuros';
  END IF;

  SELECT COUNT(*) INTO n_perms FROM public.permisos_rol WHERE modulo = 'turnos' AND puede_ver = true;
  RAISE NOTICE 'OK 19: turnos_futuros creada + RLS. Permiso turnos en % rol(es).', n_perms;
END $$;

COMMIT;
