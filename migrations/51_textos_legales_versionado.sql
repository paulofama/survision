-- ============================================================
-- Migración 51 — versionado de textos legales: marca de borrador y RPCs
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- `presupuestos_textos_legales` guarda el consentimiento informado y admite
-- versiones desde la migración 25, pero NUNCA se cargó el texto real: sigue
-- vigente el placeholder v1 del 21/07/2026, cuyo propio cuerpo dice "NO
-- utilizar para un consentimiento real".
--
-- Y el sobre lo imprime igual, en todos los casos. O sea que desde julio cada
-- sobre quirúrgico lleva una hoja con el membrete del instituto, el nombre y
-- DNI del paciente, el ojo, la fecha de cirugía... y DOS RENGLONES DE FIRMA
-- —paciente y testigo— debajo de un texto que dice que no sirve.
--
-- QUÉ HACE ESTA MIGRACIÓN
-- -----------------------
-- 1. `es_placeholder`: la versión sabe que no es texto definitivo. Deja de ser
--    algo que hay que deducir leyendo el cuerpo o la nota.
--    Mientras la vigente sea placeholder, el documento imprime el aviso PERO
--    NO EL BLOQUE DE FIRMAS: que nadie pueda firmar un texto que no rige.
--    Mismo criterio que el diagnóstico del pedido (migración 48): un documento
--    que avisa que le falta algo es seguro; uno que parece completo y no lo
--    está, no.
--
-- 2. Activar una versión son DOS escrituras (bajar la vigente, subir la nueva)
--    y hay un índice único parcial que admite una sola vigente por clave. Si
--    se hacen sueltas desde el navegador y la segunda falla, la clave queda
--    SIN vigente y el consentimiento cae al texto de respaldo. Las dos RPC de
--    abajo lo resuelven en una sola transacción.
--
-- Las RPC son SECURITY INVOKER a propósito: la RLS de la tabla sigue mandando
-- (lee 'presupuestador', escribe 'presupuestador:config'). Una función
-- SECURITY DEFINER acá sería una puerta para saltear ese permiso.
-- ============================================================

BEGIN;

ALTER TABLE public.presupuestos_textos_legales
  ADD COLUMN IF NOT EXISTS es_placeholder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.presupuestos_textos_legales.es_placeholder IS
  'true = texto de relleno, no rige. El documento lo imprime con aviso y SIN '
  'bloque de firmas, para que nadie firme un texto que no es el definitivo.';

-- La v1 que está vigente hoy es, por su propio cuerpo, un placeholder.
UPDATE public.presupuestos_textos_legales
   SET es_placeholder = true
 WHERE clave = 'consentimiento_catarata'
   AND version = 1
   AND notas ILIKE '%placeholder%';

-- ------------------------------------------------------------
-- Activar una versión (atómico)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_activar_texto_legal(
  p_clave   text,
  p_version integer
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existe int;
BEGIN
  SELECT count(*) INTO v_existe
    FROM public.presupuestos_textos_legales
   WHERE clave = p_clave AND version = p_version;

  IF v_existe = 0 THEN
    RAISE EXCEPTION 'No existe la versión % de "%"', p_version, p_clave;
  END IF;

  -- Primero se baja la vigente: el índice único parcial no admite dos.
  UPDATE public.presupuestos_textos_legales
     SET vigente = false
   WHERE clave = p_clave AND vigente;

  UPDATE public.presupuestos_textos_legales
     SET vigente = true
   WHERE clave = p_clave AND version = p_version;
END $$;

COMMENT ON FUNCTION public.app_activar_texto_legal(text, integer) IS
  'Deja vigente una versión y baja la anterior, en una sola transacción. '
  'Suelto son dos PATCH y si el segundo falla la clave queda sin vigente.';

-- ------------------------------------------------------------
-- Guardar una versión nueva (numera sola)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_guardar_texto_legal(
  p_clave          text,
  p_contenido      jsonb,
  p_notas          text    DEFAULT NULL,
  p_es_placeholder boolean DEFAULT false,
  p_activar        boolean DEFAULT false,
  p_creado_por     text    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  IF jsonb_typeof(p_contenido) <> 'array' OR jsonb_array_length(p_contenido) = 0 THEN
    RAISE EXCEPTION 'El contenido tiene que ser una lista de secciones y no puede estar vacía';
  END IF;

  -- NUNCA se edita una versión existente: el texto que firmó un paciente en
  -- agosto tiene que seguir siendo legible tal como estaba en agosto.
  SELECT coalesce(max(version), 0) + 1 INTO v_version
    FROM public.presupuestos_textos_legales
   WHERE clave = p_clave;

  INSERT INTO public.presupuestos_textos_legales
    (clave, version, contenido, vigente, notas, es_placeholder, created_by)
  VALUES
    (p_clave, v_version, p_contenido, false, p_notas, p_es_placeholder, p_creado_por);

  IF p_activar THEN
    PERFORM public.app_activar_texto_legal(p_clave, v_version);
  END IF;

  RETURN v_version;
END $$;

COMMENT ON FUNCTION public.app_guardar_texto_legal(text, jsonb, text, boolean, boolean, text) IS
  'Inserta una versión nueva (numerada sola) y opcionalmente la activa. '
  'Las versiones viejas no se editan: son el texto que firmó cada paciente.';

REVOKE ALL ON FUNCTION public.app_activar_texto_legal(text, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.app_guardar_texto_legal(text, jsonb, text, boolean, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.app_activar_texto_legal(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_guardar_texto_legal(text, jsonb, text, boolean, boolean, text) TO authenticated;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_col   int;
  v_place int;
  v_anon  int;
BEGIN
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='presupuestos_textos_legales' AND column_name='es_placeholder';
  SELECT count(*) INTO v_place FROM public.presupuestos_textos_legales
   WHERE clave='consentimiento_catarata' AND vigente AND es_placeholder;
  SELECT count(*) INTO v_anon FROM information_schema.role_routine_grants
   WHERE routine_schema='public'
     AND routine_name IN ('app_activar_texto_legal','app_guardar_texto_legal')
     AND grantee IN ('anon','public');

  IF v_col <> 1 THEN RAISE EXCEPTION 'ABORTA: no se creó es_placeholder'; END IF;
  IF v_anon > 0 THEN RAISE EXCEPTION 'ABORTA: % grant(s) de las RPC alcanzan a anon', v_anon; END IF;

  IF v_place = 1 THEN
    RAISE NOTICE 'El consentimiento vigente está marcado como PLACEHOLDER: imprime el aviso y NO el bloque de firmas.';
  ELSE
    RAISE NOTICE 'El consentimiento vigente NO es placeholder: imprime normal, con firmas.';
  END IF;
END $$;
