-- ============================================================
-- Migración 68 — domicilio del paciente en el espejo
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- PARA QUÉ
-- --------
-- La hoja de Ley de Trazabilidad imprime Dirección, Provincia, Localidad y CP
-- en blanco. El dato existe en GECLISA (`Ficha.fic_calle`, `fic_nro`,
-- `loc_id`) pero nunca se espejó, así que el front no lo tiene.
--
-- Son tres columnas NUEVAS en una tabla que ya existe: no se altera ni se
-- borra nada. El espejo se repuebla entero en cada sync (DELETE + INSERT), así
-- que las columnas quedan en NULL hasta la primera corrida del extractor y eso
-- no rompe nada: el documento ya sabe imprimir en blanco.
--
-- EL CÓDIGO POSTAL NO SE ESPEJA, Y NO ES UN OLVIDO
-- -------------------------------------------------
-- `Ficha.fic_cpostal` lo tienen 13 de 59.099 pacientes (0,02 %).
-- `Localidades.cod_postal` parecía la salida —está cargado en las 30
-- localidades— pero **vale "0" en todas**: es un placeholder, no un CP.
--
-- Agregar una columna que va a venir vacía o en cero sería peor que no
-- tenerla: el documento imprimiría "0" y parecería un dato. El renglón del CP
-- se sigue completando a mano.
--
-- LA PROVINCIA SALE DE LA LOCALIDAD
-- ----------------------------------
-- No hay provincia en la ficha: se resuelve `loc_id` -> `Localidades.prov_id`
-- -> `Provincias.prov_nombre`. Cobertura medida el 02/10/2026:
--
--     localidad   59.144 / 59.144   (100 %, aunque 1.702 dicen "S/D")
--     provincia   57.274 / 59.144   (96,8 %)
--     calle       58.204 / 59.099   (98,5 %)
--
-- OJO CON LOS PACIENTES CARGADOS A MANO
-- --------------------------------------
-- Esto sólo alcanza a los pacientes que vienen de GECLISA. Los que se dan de
-- alta desde el Presupuestador viven en `pacientes` y no tienen domicilio:
-- los dos casos testigo (Bravo y Murgo) son de ésos, así que en ellos la hoja
-- va a seguir saliendo en blanco. Capturar el domicilio en el alta es una
-- decisión aparte.
--
-- La RLS no se toca: la tabla ya tiene `pol_pacientes_geclisa_presupuestador`
-- (ALL para `authenticated` con permiso `presupuestador`, nada para `anon`), y
-- agregar columnas no cambia la política.
-- ============================================================

BEGIN;

ALTER TABLE public.pacientes_geclisa
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS localidad text,
  ADD COLUMN IF NOT EXISTS provincia text;

COMMENT ON COLUMN public.pacientes_geclisa.direccion IS
  'Calle y número de Ficha.fic_calle + fic_nro. NULL si GECLISA no lo tiene.';
COMMENT ON COLUMN public.pacientes_geclisa.localidad IS
  'Localidades.loc_nombre vía Ficha.loc_id. Puede decir "S/D" (1.702 casos).';
COMMENT ON COLUMN public.pacientes_geclisa.provincia IS
  'Provincias.prov_nombre vía Localidades.prov_id. NULL en el 3,2 % sin provincia.';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_cols integer;
  v_rls boolean;
  v_pol integer;
  v_anon integer;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pacientes_geclisa'
     AND column_name IN ('direccion', 'localidad', 'provincia');
  IF v_cols <> 3 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban las 3 columnas de domicilio, hay %', v_cols;
  END IF;

  -- El CP no se agrega a propósito: ver el encabezado.
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pacientes_geclisa'
     AND column_name IN ('codigo_postal', 'cp');
  IF FOUND THEN
    RAISE EXCEPTION 'ABORTA: apareció una columna de código postal, que esta migración decidió NO crear';
  END IF;

  -- La RLS tiene que haber quedado intacta.
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'pacientes_geclisa';
  IF v_rls IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORTA: la tabla quedó sin RLS';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies WHERE tablename = 'pacientes_geclisa';
  IF v_pol < 1 THEN
    RAISE EXCEPTION 'ABORTA: la tabla quedó sin políticas';
  END IF;

  SELECT count(*) INTO v_anon FROM pg_policies
   WHERE tablename = 'pacientes_geclisa' AND roles::text LIKE '%anon%';
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'ABORTA: % política(s) alcanzan al rol anon, que es público', v_anon;
  END IF;

  RAISE NOTICE 'Columnas de domicilio agregadas. RLS intacta, sin acceso anon.';
END $$;
