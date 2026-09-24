-- ============================================================
-- Migración 57 — Liquidar comisiones desde la pantalla
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La 56 dejó el libro de movimientos cerrado a la UI a propósito: los emite el
-- job con la service key y nadie más. Eso sigue igual. Lo que falta es el acto
-- humano que viene después —cerrar el mes, aprobar, marcar pagado— y ese no lo
-- puede hacer un daemon, porque es una decisión de la Dirección.
--
-- POR QUÉ NO ALCANZA CON EL BACKEND
-- ---------------------------------
-- El front corre en Netlify y desde el 30/08 lee Supabase directo: el proxy
-- `/api` se dio de baja. Una acción que sólo pudiera hacerse con la service
-- key sería una acción que la Dirección no puede hacer desde donde trabaja.
--
-- QUÉ SE ABRE, EXACTAMENTE
-- ------------------------
--   * `comisiones_liquidaciones`: escritura completa, SÓLO admin.
--   * `comisiones_movimientos`: UPDATE sólo admin — y el trigger de la 56 ya
--     hace que lo único que pueda cambiar sea `liquidacion_id`. Importes,
--     beneficiario, rol y fechas siguen siendo imposibles de tocar para todos,
--     service key incluida.
--
-- Y se agrega el candado que faltaba: una liquidación APROBADA o PAGADA no
-- admite movimientos nuevos. Un devengo que llega tarde cae en el período
-- siguiente, que es lo que dice el comentario de la tabla en la 56 y hasta
-- ahora no estaba garantizado por nada.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Un mes cerrado no se re-abre por la ventana
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_comisiones_liquidacion_cerrada()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado text;
BEGIN
  -- Sólo interesa cuando se está METIENDO un movimiento en una liquidación.
  IF NEW.liquidacion_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.liquidacion_id IS NOT DISTINCT FROM OLD.liquidacion_id THEN
    RETURN NEW;
  END IF;

  SELECT estado INTO v_estado FROM public.comisiones_liquidaciones WHERE id = NEW.liquidacion_id;
  IF v_estado IN ('APROBADA', 'PAGADA') THEN
    RAISE EXCEPTION 'La liquidación ya está % : un movimiento que llega tarde va al período siguiente', v_estado;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_comisiones_liquidacion_cerrada() IS
  'Impide sumar movimientos a una liquidación ya aprobada o pagada. Sin esto, '
  'un devengo tardío cambiaría un total que alguien ya firmó.';

DROP TRIGGER IF EXISTS trg_comisiones_liquidacion_cerrada ON public.comisiones_movimientos;
CREATE TRIGGER trg_comisiones_liquidacion_cerrada
  BEFORE INSERT OR UPDATE ON public.comisiones_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_comisiones_liquidacion_cerrada();

-- ------------------------------------------------------------
-- 2. Las policies del acto humano
-- ------------------------------------------------------------
-- Liquidaciones: la Dirección las crea, las aprueba y las marca pagadas.
-- El SELECT (propio o admin) ya lo definió la 56 y no se toca.
DROP POLICY IF EXISTS pol_com_liq_insert ON public.comisiones_liquidaciones;
CREATE POLICY pol_com_liq_insert ON public.comisiones_liquidaciones
  FOR INSERT TO authenticated
  WITH CHECK (public.app_es_admin());

DROP POLICY IF EXISTS pol_com_liq_update ON public.comisiones_liquidaciones;
CREATE POLICY pol_com_liq_update ON public.comisiones_liquidaciones
  FOR UPDATE TO authenticated
  USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());

-- Deliberadamente SIN policy de DELETE: una liquidación emitida no se borra.
-- Si se cerró mal, se desarma sacándole los movimientos y queda en cero, con
-- su rastro.

-- Movimientos: UPDATE sólo admin, y el trigger append-only de la 56 limita el
-- cambio a `liquidacion_id`. No se agrega INSERT ni DELETE: emitir sigue
-- siendo exclusivo del job.
DROP POLICY IF EXISTS pol_com_mov_update ON public.comisiones_movimientos;
CREATE POLICY pol_com_mov_update ON public.comisiones_movimientos
  FOR UPDATE TO authenticated
  USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());

COMMIT;

-- ============================================================
-- Verificación — aborta si quedó algo abierto de más
-- ============================================================
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = 'public.comisiones_movimientos'::regclass
     AND tgname IN ('trg_comisiones_append_only', 'trg_comisiones_liquidacion_cerrada');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'ABORTA: faltan candados en comisiones_movimientos (hay %, deberían ser 2)', v_n;
  END IF;

  -- Nadie puede emitir ni borrar un movimiento desde la API pública.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'comisiones_movimientos' AND cmd IN ('INSERT', 'DELETE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTA: apareció una policy de INSERT/DELETE sobre el libro de movimientos';
  END IF;

  -- Y anon sigue sin ver nada de comisiones.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename LIKE 'comisiones%' AND 'anon' = ANY(roles);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'ABORTA: hay % policy(s) de comisiones que alcanzan a anon', v_n;
  END IF;

  RAISE NOTICE 'Comisiones: liquidación habilitada para admin; el libro sigue siendo sólo del job.';
END $$;
