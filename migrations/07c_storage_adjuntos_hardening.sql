-- ============================================================
-- MIGRACIÓN 07c — Endurecer el bucket de adjuntos de Sueldos
-- Sistema Integral de Gestión - Survisión S.A.
-- ============================================================
--
-- Cierra el último acceso permisivo: el bucket 'sueldos-adjuntos' (F.931 PDFs)
-- tenía policies que permitían a `anon` listar/leer/escribir objetos. Las
-- reemplaza por una sola policy para `authenticated` gateada por el permiso
-- 'sueldos' (app_tiene_permiso, de 07a). El bucket ya es privado (public=false).
--
-- Resultado:
--   - anon: CERO acceso al bucket (no lista, no baja, no sube).
--   - authenticated con permiso 'sueldos' (Ester + admins): acceso completo.
--   - el backend usa service_role (bypassa RLS) para subir/firmar si hace falta.
--
-- Policies que reemplaza (bucket-específicas, ver diagnóstico):
--   pol_sueldos_adjuntos_anon          (anon, ALL, bucket_id='sueldos-adjuntos')
--   pol_sueldos_adjuntos_authenticated (authenticated, ALL, USING(true) de bucket)
--
-- Idempotente (DROP IF EXISTS). Atómica.
-- ============================================================

BEGIN;

-- Quitar la policy permisiva de anon (cierra el leak de listado/lectura).
DROP POLICY IF EXISTS pol_sueldos_adjuntos_anon ON storage.objects;

-- Reemplazar la de authenticated por una gateada por el permiso 'sueldos'.
DROP POLICY IF EXISTS pol_sueldos_adjuntos_authenticated ON storage.objects;

CREATE POLICY pol_sueldos_adjuntos_authenticated ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sueldos-adjuntos' AND public.app_tiene_permiso('sueldos'))
  WITH CHECK (bucket_id = 'sueldos-adjuntos' AND public.app_tiene_permiso('sueldos'));

-- Verificación: no debe quedar ninguna policy para anon sobre este bucket.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND 'anon' = ANY(roles)
    AND coalesce(qual, '') LIKE '%sueldos-adjuntos%';
  IF n > 0 THEN
    RAISE EXCEPTION 'FALLO: quedó % policy anon sobre sueldos-adjuntos', n;
  END IF;
  RAISE NOTICE 'OK 07c: bucket sueldos-adjuntos sin acceso anon; authenticated gateado por permiso sueldos.';
END $$;

COMMIT;
