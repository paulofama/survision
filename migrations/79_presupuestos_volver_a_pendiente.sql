-- ============================================================
-- Migración 79 — "Volver a pendiente" y "Anular" en una sola operación
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- LO QUE SE ENCONTRÓ ANTES DE ESCRIBIR ESTO (diagnóstico 2026-10-29)
-- -------------------------------------------------------------------
-- La migración 70 ya permitía revertir y anular, pero lo hacía la pantalla con
-- TRES escrituras sueltas (presupuesto, aceptación, historial):
--
--   · No era atómico: si fallaba la segunda, el presupuesto quedaba pendiente
--     con la aceptación vigente, que es justo la huérfana que la 70 vino a
--     limpiar.
--   · Al volver a pendiente se perdía QUIÉN y CUÁNDO había registrado el
--     resultado original (`fecha_resultado`, `resultado_por` a NULL), y el
--     historial no lo guardaba.
--   · Aceptar, rechazar, "sin respuesta" y el cierre masivo de vencidos no
--     escribían historial: de 48 resultados registrados, el historial tenía 3
--     filas, las tres de la migración 70.
--   · Los bloqueos vivían sólo en la pantalla: "practicado no se revierte"
--     era un botón gris. Cualquier PATCH directo lo salteaba.
--   · La policy del historial era FOR ALL: una tabla que dice "nunca se borra
--     ni se edita" se podía editar y borrar.
--
-- QUÉ AGREGA
-- ----------
--   1. Dos columnas en el historial para guardar el resultado original:
--      cuándo se había registrado y quién.
--   2. Un trigger que escribe el historial de CADA cambio de resultado, venga
--      de donde venga (aceptar, rechazar, sin respuesta, masivo, revertir,
--      anular, el sync). Una fila por presupuesto, en la misma transacción.
--   3. Un trigger guardián: un usuario no puede llevar un resultado a
--      pendiente ni a ANULADO con una escritura directa; tiene que pasar por
--      la función, que es la que controla los bloqueos.
--   4. `presupuesto_chequear_cambio()`: qué bloquea y qué advierte, para que
--      la pantalla lo muestre ANTES de pedir el motivo.
--   5. `presupuesto_cambiar_resultado()`: valida, cambia el resultado y baja
--      la aceptación en una sola transacción.
--   6. El historial queda SELECT + INSERT: ya no se edita ni se borra.
--
-- REGLAS (decididas con Paulo, 2026-10-29)
-- ----------------------------------------
--   Bloquean:  entrega de caja vigente · cirugía practicada (para volver a
--              pendiente) · práctica vinculada a lo facturado en GECLISA
--              (match confirmado) · comisión devengada o liquidada.
--   Advierte:  documentos ya emitidos (sobre o pedido). Seguir en ese caso
--              pide `presupuestador:config`.
--   Permisos:  volver a pendiente y anular, `presupuestador`. Anular un
--              practicado, `presupuestador:config` (como antes).
--
-- LO QUE NO HACE
-- --------------
--   · No toca ningún presupuesto: no hay UPDATE de datos en esta migración.
--   · No toca el dinero ni las comisiones: si bloquean, se resuelven en su
--     propio circuito.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. El resultado original queda en el historial
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_historial
  ADD COLUMN IF NOT EXISTS resultado_fecha_anterior timestamptz,
  ADD COLUMN IF NOT EXISTS resultado_por_anterior text;

COMMENT ON COLUMN public.presupuestos_historial.resultado_fecha_anterior IS
  'Sólo en cambios de resultado: cuándo se había registrado el resultado que '
  'se reemplaza. Volver a pendiente pone `fecha_resultado` en NULL; acá queda.';
COMMENT ON COLUMN public.presupuestos_historial.resultado_por_anterior IS
  'Sólo en cambios de resultado: quién había registrado el resultado que se '
  'reemplaza.';

-- ------------------------------------------------------------
-- 2. Historial de cada cambio de resultado
-- ------------------------------------------------------------
-- El motivo y las observaciones salen de la fila, salvo cuando el cambio lo
-- hace `presupuesto_cambiar_resultado()`: ahí el presupuesto queda SIN motivo
-- (volver a pendiente limpia todo) y la función los pasa por variables de la
-- transacción.
CREATE OR REPLACE FUNCTION public.tg_presupuestos_historial_resultado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_motivo text := NULLIF(current_setting('app.cambio_motivo_id', true), '');
  v_obs    text := NULLIF(current_setting('app.cambio_observaciones', true), '');
BEGIN
  INSERT INTO public.presupuestos_historial
    (presupuesto_id, campo, valor_anterior, valor_nuevo, motivo_id, observaciones,
     usuario, resultado_fecha_anterior, resultado_por_anterior)
  VALUES
    (NEW.id, 'resultado', OLD.resultado, NEW.resultado,
     COALESCE(v_motivo::uuid, NEW.resultado_motivo_id),
     COALESCE(v_obs, NEW.resultado_observaciones),
     -- Sin usuario de la app es el sync o un script del servidor.
     COALESCE(public.app_username(), NEW.resultado_por, 'sistema'),
     OLD.fecha_resultado, OLD.resultado_por);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_presupuestos_historial_resultado ON public.presupuestos;
CREATE TRIGGER trg_presupuestos_historial_resultado
  AFTER UPDATE OF resultado ON public.presupuestos
  FOR EACH ROW
  WHEN (OLD.resultado IS DISTINCT FROM NEW.resultado)
  EXECUTE FUNCTION public.tg_presupuestos_historial_resultado();

-- ------------------------------------------------------------
-- 3. Guardián: pendiente y ANULADO sólo por la función
-- ------------------------------------------------------------
-- Aplica a los usuarios de la app (`auth.uid()` presente). El servidor con la
-- service key y las migraciones no pasan por acá.
CREATE OR REPLACE FUNCTION public.tg_presupuestos_guardia_resultado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND COALESCE(current_setting('app.cambio_por_funcion', true), '') <> 'si'
     AND (
       (OLD.resultado IS NOT NULL AND NEW.resultado IS NULL)
       OR (NEW.resultado = 'ANULADO' AND OLD.resultado IS DISTINCT FROM 'ANULADO')
     )
  THEN
    RAISE EXCEPTION 'Para volver a pendiente o anular un presupuesto usá la acción de la pantalla, que controla caja, cirugía y comisiones.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_presupuestos_guardia_resultado ON public.presupuestos;
CREATE TRIGGER trg_presupuestos_guardia_resultado
  BEFORE UPDATE OF resultado ON public.presupuestos
  FOR EACH ROW
  WHEN (OLD.resultado IS DISTINCT FROM NEW.resultado)
  EXECUTE FUNCTION public.tg_presupuestos_guardia_resultado();

REVOKE ALL ON FUNCTION public.tg_presupuestos_historial_resultado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_presupuestos_guardia_resultado() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Qué bloquea y qué advierte
-- ------------------------------------------------------------
-- Devuelve:
--   { numero, resultado, estado,
--     bloqueos: [{clave, mensaje}],          -- si hay alguno, no se puede
--     documentos: {cantidad, ultimo},        -- emitidos; advierten
--     puede_con_documentos: bool }           -- tiene presupuestador:config
CREATE OR REPLACE FUNCTION public.presupuesto_chequear_cambio(
  p_presupuesto_id uuid,
  p_accion text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p            record;
  v_config     boolean := public.app_tiene_permiso('presupuestador:config');
  v_bloqueos   jsonb := '[]'::jsonb;
  v_caja_n     integer;
  v_caja_monto numeric;
  v_match      record;
  v_com_neto   numeric;
  v_com_liq    integer;
  v_doc_n      integer;
  v_doc_ult    timestamptz;
BEGIN
  IF NOT public.app_tiene_permiso('presupuestador') THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar el resultado de un presupuesto.';
  END IF;
  IF p_accion NOT IN ('revertir', 'anular') THEN
    RAISE EXCEPTION 'Acción desconocida: %', p_accion;
  END IF;

  SELECT id, numero_presupuesto, resultado, estado, fecha_practica
    INTO p
    FROM public.presupuestos
   WHERE id = p_presupuesto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el presupuesto.';
  END IF;

  -- Estado de partida.
  IF p_accion = 'revertir' AND p.resultado IS NULL THEN
    v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'pendiente',
      'mensaje', 'Ya está pendiente: no hay resultado para revertir.');
  END IF;
  IF p_accion = 'anular' AND p.resultado = 'ANULADO' THEN
    v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'anulado',
      'mensaje', 'Ya está anulado.');
  END IF;

  -- Cirugía practicada.
  IF p.estado = 'practicado' THEN
    IF p_accion = 'revertir' THEN
      v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'practicado',
        'mensaje', 'La cirugía ya se realizó'
          || COALESCE(' el ' || to_char(p.fecha_practica, 'DD/MM/YYYY'), '')
          || ': el resultado no se revierte.');
    ELSIF NOT v_config THEN
      v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'practicado',
        'mensaje', 'La cirugía ya se realizó: anularlo lo puede hacer Administración o Contabilidad.');
    END IF;
  END IF;

  -- Entregas de caja vigentes.
  SELECT count(*), COALESCE(sum(monto), 0)
    INTO v_caja_n, v_caja_monto
    FROM public.presupuestos_caja_entregas
   WHERE presupuesto_id = p.id AND anulada_at IS NULL;
  IF v_caja_n > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'caja',
      'mensaje', 'Tiene ' || v_caja_n || ' entrega(s) de caja vigente(s) por $ '
        -- Formato argentino sin depender del lc_numeric del servidor.
        || translate(to_char(v_caja_monto, 'FM999,999,999,990.00'), ',.', '.,')
        || '. Anulalas primero desde el Circuito.',
      'cantidad', v_caja_n, 'monto', v_caja_monto);
  END IF;

  -- Vinculado a lo facturado en GECLISA. Para anular no se mira: anular un
  -- practicado (que siempre tiene vínculo) ya pide presupuestador:config.
  IF p_accion = 'revertir' THEN
    SELECT fecha_practica, practica_nombre
      INTO v_match
      FROM public.presupuestos_practica_match
     WHERE presupuesto_id = p.id AND estado = 'confirmado'
     ORDER BY fecha_practica DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'match',
        'mensaje', 'Ya está vinculado a la práctica facturada en GECLISA'
          || COALESCE(' del ' || to_char(v_match.fecha_practica, 'DD/MM/YYYY'), '')
          || '.');
    END IF;
  END IF;

  -- Comisión devengada (saldo distinto de cero) o en una liquidación aprobada
  -- o pagada.
  SELECT COALESCE(sum(m.importe), 0),
         count(*) FILTER (WHERE l.estado IN ('APROBADA', 'PAGADA'))
    INTO v_com_neto, v_com_liq
    FROM public.comisiones_movimientos m
    LEFT JOIN public.comisiones_liquidaciones l ON l.id = m.liquidacion_id
   WHERE m.presupuesto_id = p.id;
  IF v_com_neto <> 0 OR v_com_liq > 0 THEN
    v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'comision',
      'mensaje', CASE WHEN v_com_liq > 0
        THEN 'Tiene comisión en una liquidación aprobada o pagada: hace falta un ajuste antes.'
        ELSE 'Tiene comisión devengada: hace falta un ajuste antes.' END);
  END IF;

  -- Documentos emitidos: advierten. Seguir pide presupuestador:config.
  SELECT count(*), max(generado_en)
    INTO v_doc_n, v_doc_ult
    FROM public.presupuestos_sobres
   WHERE presupuesto_id = p.id;
  IF v_doc_n > 0 AND NOT v_config THEN
    v_bloqueos := v_bloqueos || jsonb_build_object('clave', 'documentos',
      'mensaje', 'Ya se emitieron ' || v_doc_n || ' documento(s): lo puede hacer Administración o Contabilidad, que se ocupa de recuperar los papeles.');
  END IF;

  RETURN jsonb_build_object(
    'numero', p.numero_presupuesto,
    'resultado', p.resultado,
    'estado', p.estado,
    'bloqueos', v_bloqueos,
    'documentos', jsonb_build_object('cantidad', v_doc_n, 'ultimo', v_doc_ult),
    'puede_con_documentos', v_config
  );
END;
$$;

-- ------------------------------------------------------------
-- 5. Volver a pendiente o anular, todo junto
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.presupuesto_cambiar_resultado(
  p_presupuesto_id uuid,
  p_accion text,
  p_motivo_id uuid,
  p_observaciones text DEFAULT NULL,
  p_confirma_documentos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chequeo  jsonb;
  v_motivo   record;
  v_obs      text := NULLIF(btrim(COALESCE(p_observaciones, '')), '');
  v_usuario  text := public.app_username();
  v_anterior text;
  v_doc_n    integer;
  v_nota     text;
BEGIN
  -- El presupuesto queda tomado hasta el final: dos personas revirtiendo a la
  -- vez no pueden pisarse ni saltear el chequeo.
  PERFORM 1 FROM public.presupuestos WHERE id = p_presupuesto_id FOR UPDATE;

  -- Los mismos controles que vio la pantalla, otra vez y con la fila tomada.
  v_chequeo := public.presupuesto_chequear_cambio(p_presupuesto_id, p_accion);
  IF jsonb_array_length(v_chequeo->'bloqueos') > 0 THEN
    RAISE EXCEPTION '%', v_chequeo->'bloqueos'->0->>'mensaje';
  END IF;

  v_doc_n := (v_chequeo->'documentos'->>'cantidad')::integer;
  IF v_doc_n > 0 AND NOT p_confirma_documentos THEN
    RAISE EXCEPTION 'Ya se emitieron % documento(s): confirmá que lo sabés antes de seguir.', v_doc_n;
  END IF;

  -- El motivo es obligatorio y tiene que ser del tipo de la acción.
  SELECT id, nombre, exige_observacion
    INTO v_motivo
    FROM public.presupuestos_motivos_resultado
   WHERE id = p_motivo_id
     AND activo
     AND tipo = CASE p_accion WHEN 'revertir' THEN 'REVERSION' ELSE 'ANULADO' END;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Elegí un motivo válido.';
  END IF;
  IF v_motivo.exige_observacion AND length(COALESCE(v_obs, '')) < 3 THEN
    RAISE EXCEPTION 'El motivo "%" pide una observación.', v_motivo.nombre;
  END IF;

  v_anterior := v_chequeo->>'resultado';
  v_nota := concat_ws(' — ', v_obs,
    CASE WHEN v_doc_n > 0 THEN 'Con ' || v_doc_n || ' documento(s) ya emitido(s)' END);

  -- Lo que lee el trigger del historial y el guardián. `true` = sólo para
  -- esta transacción.
  PERFORM set_config('app.cambio_por_funcion', 'si', true);
  PERFORM set_config('app.cambio_motivo_id', v_motivo.id::text, true);
  PERFORM set_config('app.cambio_observaciones', COALESCE(v_nota, ''), true);

  IF p_accion = 'revertir' THEN
    UPDATE public.presupuestos
       SET resultado = NULL,
           resultado_motivo_id = NULL,
           resultado_observaciones = NULL,
           fecha_resultado = NULL,
           resultado_por = NULL
     WHERE id = p_presupuesto_id;
  ELSE
    UPDATE public.presupuestos
       SET resultado = 'ANULADO',
           resultado_motivo_id = v_motivo.id,
           resultado_observaciones = v_obs,
           fecha_resultado = now(),
           resultado_por = v_usuario
     WHERE id = p_presupuesto_id;
  END IF;

  -- La aceptación deja de estar vigente pero NO se borra: si el paciente
  -- vuelve, el modal se precarga con lo que ya se había definido.
  UPDATE public.presupuestos_aceptacion
     SET revertida_at = now(),
         revertida_por = v_usuario,
         reversion_motivo = CASE WHEN p_accion = 'anular' THEN 'Anulado: ' ELSE '' END
           || concat_ws(' — ', v_motivo.nombre, v_obs)
   WHERE presupuesto_id = p_presupuesto_id
     AND revertida_at IS NULL;

  PERFORM set_config('app.cambio_por_funcion', '', true);
  PERFORM set_config('app.cambio_motivo_id', '', true);
  PERFORM set_config('app.cambio_observaciones', '', true);

  RETURN jsonb_build_object(
    'numero', v_chequeo->>'numero',
    'resultado_anterior', v_anterior,
    'resultado_nuevo', CASE WHEN p_accion = 'anular' THEN 'ANULADO' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.presupuesto_chequear_cambio(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.presupuesto_cambiar_resultado(uuid, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presupuesto_chequear_cambio(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.presupuesto_cambiar_resultado(uuid, text, uuid, text, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 6. El historial no se edita ni se borra
-- ------------------------------------------------------------
-- Se lee y se agrega. El trigger escribe como SECURITY DEFINER; el modal de
-- aceptación sigue agregando las filas de edición del circuito.
DROP POLICY IF EXISTS pol_presupuestos_historial ON public.presupuestos_historial;
DROP POLICY IF EXISTS pol_presupuestos_historial_select ON public.presupuestos_historial;
DROP POLICY IF EXISTS pol_presupuestos_historial_insert ON public.presupuestos_historial;
CREATE POLICY pol_presupuestos_historial_select ON public.presupuestos_historial
  FOR SELECT TO authenticated
  USING (public.app_tiene_permiso('presupuestador'));
CREATE POLICY pol_presupuestos_historial_insert ON public.presupuestos_historial
  FOR INSERT TO authenticated
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_n integer;
BEGIN
  -- Los dos triggers, sobre presupuestos.
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.presupuestos'::regclass
     AND tgname IN ('trg_presupuestos_historial_resultado', 'trg_presupuestos_guardia_resultado')
     AND NOT tgisinternal;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 2 triggers en presupuestos y hay %', v_n;
  END IF;

  -- Las funciones públicas: SECURITY DEFINER y sin ejecución para anon.
  SELECT count(*) INTO v_n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('presupuesto_chequear_cambio', 'presupuesto_cambiar_resultado')
     AND prosecdef;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ABORTA: las funciones de cambio de resultado no quedaron SECURITY DEFINER (%)', v_n;
  END IF;
  IF has_function_privilege('anon', 'public.presupuesto_cambiar_resultado(uuid, text, uuid, text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.presupuesto_chequear_cambio(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORTA: anon puede ejecutar las funciones de cambio de resultado';
  END IF;

  -- Historial: sólo SELECT e INSERT, nada para anon.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'presupuestos_historial' AND cmd NOT IN ('SELECT', 'INSERT');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTA: el historial todavía tiene % policy(s) de edición o borrado', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'presupuestos_historial' AND roles::text LIKE '%anon%';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTA: el historial quedó al alcance de anon';
  END IF;

  RAISE NOTICE 'OK 79: triggers de historial y guardia, funciones de chequeo y cambio, historial append-only.';
END $$;
