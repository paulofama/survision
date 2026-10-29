-- ============================================================
-- 78 · "Lleva lente" como dato de la prestación + LIO Mininuc
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- PROBLEMA
--   El modal de aceptación exigía elegir un LIO para TODA práctica. En un
--   entropión (P-2026-1084) o una ptosis (P-2026-1076/1077) no hay lente, y el
--   operador quedaba obligado a inventar uno: P-2026-733, fotocoagulación
--   láser, quedó aceptado con LIO "Básico" por eso.
--   Además la Mininuc (030510) no tenía fila en `presupuestos_lios`, así que
--   no se deducía y había que elegirla a mano... sin que figurara en la lista.
--
-- QUÉ HACE
--   1. `prestaciones.lleva_lio` (boolean NOT NULL, default false): si la
--      práctica lleva lente es un DATO DE LA PRESTACIÓN, no una búsqueda por
--      texto. Se carga en true para los 10 códigos que hoy lo implican: los
--      marcados en `presupuestos_diagnosticos.lleva_lio` y los que tienen un
--      LIO en `presupuestos_lios.codigo_practica` (suma la 030508, Implante
--      secundario, que tenía LIO pero no estaba marcada en Diagnósticos).
--   2. Función `prestacion_set_lleva_lio(codigo, valor)`: la usa la pantalla de
--      Diagnósticos. Escribir `prestaciones` pide el permiso 'prestaciones' y
--      esa pantalla es de 'presupuestador:config'; la función acepta cualquiera
--      de los dos y nada más. Actualiza también la columna vieja
--      `presupuestos_diagnosticos.lleva_lio` para que no diverjan.
--   3. LIO "Mininuc" (030510) en el catálogo: se deduce solo desde la
--      prestación, igual que los demás.
--   4. P-2026-733: saca el LIO "Básico" que se le cargó por obligación (la
--      aceptación ya estaba revertida desde el 04/10) y deja su ítem "LIO
--      definido" como no aplica. Queda constancia en `presupuestos_historial`.
--   5. Cualquier otro ítem "LIO definido" de una práctica sin lente pasa a
--      "no aplica" (hoy sólo el de la 733; la consulta lo cubre en general).
--
-- QUÉ SE GUARDA CUANDO NO HAY LENTE
--   `presupuestos_aceptacion.lio_id` = NULL. Ya era nullable, no la usa
--   ningún filtro ni informe (sólo el Presupuestador y los PDF del sobre), y
--   desde ahora NULL quiere decir "la práctica no lleva lente".
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS, UPDATEs con condición, INSERT ...
-- ON CONFLICT, CREATE OR REPLACE, y el historial de la 733 se inserta sólo si
-- no existe.
-- RLS: no cambia. `prestaciones` sigue con sus políticas (lectura para
-- authenticated, escritura con 'prestaciones'); la función es SECURITY DEFINER
-- con el chequeo de permiso adentro y sin acceso para anon.
-- REVERSIÓN: 78_prestaciones_lleva_lio_mininuc_revert.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. El dato en la prestación
-- ------------------------------------------------------------
ALTER TABLE public.prestaciones
  ADD COLUMN IF NOT EXISTS lleva_lio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.prestaciones.lleva_lio IS
  'La práctica implanta un lente intraocular. Si es false, la aceptación no pide LIO '
  '(presupuestos_aceptacion.lio_id queda NULL) y los PDF no imprimen el renglón. Migración 78.';

UPDATE public.prestaciones p
   SET lleva_lio = true
 WHERE p.lleva_lio = false
   AND (
     p.codigo IN (SELECT codigo_practica FROM public.presupuestos_diagnosticos WHERE lleva_lio)
     OR p.codigo IN (SELECT codigo_practica FROM public.presupuestos_lios WHERE codigo_practica IS NOT NULL)
   );

COMMENT ON COLUMN public.presupuestos_diagnosticos.lleva_lio IS
  'OBSOLETA desde la migración 78: la fuente es prestaciones.lleva_lio. Se mantiene '
  'sincronizada por prestacion_set_lleva_lio() para no romper lecturas viejas.';

-- ------------------------------------------------------------
-- 2. Escritura desde la pantalla de Diagnósticos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prestacion_set_lleva_lio(p_codigo text, p_valor boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.app_tiene_permiso('presupuestador:config')
          OR public.app_tiene_permiso('prestaciones')) THEN
    RAISE EXCEPTION 'Sin permiso para cambiar si la práctica lleva lente'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.prestaciones
     SET lleva_lio = p_valor
   WHERE codigo = trim(p_codigo);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la prestación %', p_codigo;
  END IF;

  -- La columna vieja queda espejada (ver COMMENT arriba).
  UPDATE public.presupuestos_diagnosticos
     SET lleva_lio = p_valor
   WHERE codigo_practica = trim(p_codigo);
END;
$$;

REVOKE ALL ON FUNCTION public.prestacion_set_lleva_lio(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prestacion_set_lleva_lio(text, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 3. LIO Mininuc
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_lios (nombre, descripcion, codigo_practica, activo, orden)
VALUES ('Mininuc', 'Cirugía Mininuc (030510). Lente según receta: MA 60 AC.', '030510', true, 9)
ON CONFLICT (nombre) DO NOTHING;

-- ------------------------------------------------------------
-- 4. P-2026-733: el LIO que se cargó por obligación
-- ------------------------------------------------------------
-- El historial sólo acepta los campos que lista su CHECK (migración 71); se
-- suma 'lio_id' para poder dejar constancia de este cambio y de los futuros.
ALTER TABLE public.presupuestos_historial
  DROP CONSTRAINT IF EXISTS presupuestos_historial_campo_check;
ALTER TABLE public.presupuestos_historial
  ADD CONSTRAINT presupuestos_historial_campo_check CHECK (campo = ANY (ARRAY[
    'resultado', 'estado', 'rama_cobertura', 'convenio_id', 'ojo',
    'fecha_tentativa_cirugia', 'requiere_analisis_ecg', 'diagnostico_opcion_id',
    'lio_id'
  ]::text[]));

INSERT INTO public.presupuestos_historial
  (presupuesto_id, campo, valor_anterior, valor_nuevo, observaciones, usuario)
SELECT a.presupuesto_id, 'lio_id', l.nombre, NULL,
       'Fotocoagulación láser (030003): no lleva lente. El LIO se había cargado porque el campo era obligatorio.',
       'migracion_78'
  FROM public.presupuestos_aceptacion a
  JOIN public.presupuestos p ON p.id = a.presupuesto_id
  LEFT JOIN public.presupuestos_lios l ON l.id = a.lio_id
 WHERE p.numero_presupuesto = 'P-2026-733'
   AND a.lio_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.presupuestos_historial h
      WHERE h.presupuesto_id = a.presupuesto_id
        AND h.campo = 'lio_id'
        AND h.usuario = 'migracion_78'
   );

UPDATE public.presupuestos_aceptacion a
   SET lio_id = NULL
  FROM public.presupuestos p
 WHERE p.id = a.presupuesto_id
   AND p.numero_presupuesto = 'P-2026-733'
   AND a.lio_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. "LIO definido" no aplica donde no hay lente
-- ------------------------------------------------------------
UPDATE public.presupuestos_checklist ch
   SET no_aplica = true
  FROM public.presupuestos p
  JOIN public.prestaciones pr ON pr.codigo = p.prestacion_codigo
 WHERE p.id = ch.presupuesto_id
   AND ch.item_clave = 'lio_definido'
   AND pr.lleva_lio = false
   AND ch.no_aplica = false
   AND ch.completado = false;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
DO $$
DECLARE
  n_lente   int;
  n_mininuc int;
  n_733     int;
  n_mal     int;
BEGIN
  SELECT count(*) INTO n_lente FROM public.prestaciones WHERE lleva_lio;
  IF n_lente <> 10 THEN
    RAISE EXCEPTION 'Se esperaban 10 prestaciones con lente, hay %', n_lente;
  END IF;

  SELECT count(*) INTO n_mininuc
    FROM public.presupuestos_lios WHERE codigo_practica = '030510' AND activo;
  IF n_mininuc <> 1 THEN
    RAISE EXCEPTION 'Falta el LIO Mininuc (030510): hay %', n_mininuc;
  END IF;

  SELECT count(*) INTO n_733
    FROM public.presupuestos_aceptacion a
    JOIN public.presupuestos p ON p.id = a.presupuesto_id
   WHERE p.numero_presupuesto = 'P-2026-733' AND a.lio_id IS NOT NULL;
  IF n_733 <> 0 THEN
    RAISE EXCEPTION 'P-2026-733 sigue con LIO';
  END IF;

  -- Ninguna aceptación puede quedar con LIO en una práctica sin lente.
  SELECT count(*) INTO n_mal
    FROM public.presupuestos_aceptacion a
    JOIN public.presupuestos p ON p.id = a.presupuesto_id
    JOIN public.prestaciones pr ON pr.codigo = p.prestacion_codigo
   WHERE a.lio_id IS NOT NULL AND NOT pr.lleva_lio;
  IF n_mal <> 0 THEN
    RAISE EXCEPTION 'Quedan % aceptaciones con LIO en prácticas sin lente', n_mal;
  END IF;
END $$;

COMMIT;
