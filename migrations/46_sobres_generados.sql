-- ============================================================
-- Migración 46 — registro de qué se imprimió en cada sobre
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- POR QUÉ
-- -------
-- Hasta ahora el Sobre Quirúrgico salía siempre completo y no quedaba rastro de
-- qué se imprimió. Desde el 16/09/2026 el operador elige qué hojas entran —el
-- pedido de Administración fue poder dejar afuera lo que la obra social ya
-- tramita por su cuenta— y eso convierte al contenido del sobre en un dato:
-- si mañana falta el consentimiento de una cirugía, hay que poder saber si no
-- se imprimió o si se perdió.
--
-- UNA FILA POR GENERACIÓN, NUNCA UN UPSERT
-- ----------------------------------------
-- Mismo criterio que `presupuestos_caja_entregas` (migración 44): un sobre se
-- reimprime varias veces —se moja, se traspapela, se agrega una hoja— y cada
-- impresión es un hecho distinto. Si se pisara la fila anterior se perdería
-- justamente el historial que da sentido a la tabla.
--
-- Guarda las CLAVES de los documentos (`pedido`, `recetas`, `caja`, …), no sus
-- etiquetas: las etiquetas son texto de interfaz y cambian.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.presupuestos_sobres (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id  uuid NOT NULL
                    REFERENCES public.presupuestos(id) ON DELETE CASCADE,

  -- Claves de los documentos incluidos, en el orden en que salieron impresos.
  documentos      text[] NOT NULL CHECK (cardinality(documentos) > 0),

  -- 'sobre' = el sobre armado con la selección; 'documento' = una hoja suelta,
  -- reimpresa por su cuenta. Se distinguen para que una reimpresión puntual no
  -- se lea como que el sobre entero salió con una sola hoja.
  modo            text NOT NULL DEFAULT 'sobre'
                    CHECK (modo IN ('sobre', 'documento')),

  generado_por    text,
  generado_en     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.presupuestos_sobres IS
  'Qué documentos se imprimieron en cada generación del Sobre Quirúrgico. '
  'Una fila por generación: nunca se pisa la anterior.';

COMMENT ON COLUMN public.presupuestos_sobres.documentos IS
  'Claves de DOCS (pedido, indicaciones, cronograma, recetas, analisis, caja, '
  'receta_costos, trazabilidad, consentimiento), no las etiquetas de la UI.';

CREATE INDEX IF NOT EXISTS idx_sobres_presupuesto
  ON public.presupuestos_sobres (presupuesto_id, generado_en DESC);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- La anon key viaja en el bundle: una tabla sin RLS es de lectura y escritura
-- pública. Mismo patrón que `presupuestos_caja_entregas`: sólo `authenticated`
-- con el permiso del módulo, y NADA para `anon`.
ALTER TABLE public.presupuestos_sobres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_sobres_all ON public.presupuestos_sobres;
CREATE POLICY pol_sobres_all
  ON public.presupuestos_sobres
  FOR ALL
  TO authenticated
  USING      (public.app_tiene_permiso('presupuestador'))
  WITH CHECK (public.app_tiene_permiso('presupuestador'));

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_rls   boolean;
  v_pol   int;
  v_anon  int;
BEGIN
  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid = 'public.presupuestos_sobres'::regclass;

  SELECT count(*) INTO v_pol
  FROM pg_policies WHERE tablename = 'presupuestos_sobres';

  -- Ninguna policy puede alcanzar a `anon`: la clave es pública.
  SELECT count(*) INTO v_anon
  FROM pg_policies
  WHERE tablename = 'presupuestos_sobres'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles));

  IF NOT v_rls THEN
    RAISE EXCEPTION 'ABORTA: presupuestos_sobres quedó sin RLS';
  END IF;
  IF v_anon > 0 THEN
    RAISE EXCEPTION 'ABORTA: % policy(s) alcanzan a anon', v_anon;
  END IF;

  RAISE NOTICE 'presupuestos_sobres: RLS activa, % policy(s), 0 para anon', v_pol;
END $$;
