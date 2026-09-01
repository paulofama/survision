-- ============================================================
-- 44 · Entregas de caja + leyenda de resultado visual por LIO
-- ============================================================
-- Sistema de Gestión Integral · Survisión S.A.
--
-- Origen: segundo testeo funcional de Administración (31/08/2026) sobre el
-- presupuesto P-2026-813, más el comprobante en papel que hoy usa la clínica.
-- Correcciones FASE 3, puntos 5.2, 7.4 y 7.5.
--
-- ------------------------------------------------------------
-- 1) POR QUÉ HACE FALTA UNA TABLA DE ENTREGAS
-- ------------------------------------------------------------
-- El comprobante de "Ingreso de caja" imprime hoy el TOTAL del presupuesto
-- como si fuera lo abonado. No lo es: el paciente entrega una parte y queda un
-- saldo. Administración lo lleva a mano en el papel (ENTREGA / RESTA PAGAR).
--
-- El dato de caja vive hoy en `presupuestos_aceptacion` como UN solo importe
-- (`caja_monto_unico` para obra social, `deposito_valor` para particular), y el
-- panel lo guarda con UPSERT sobre esa misma fila. Es decir: una segunda
-- entrega PISA la primera y el saldo se pierde. No hay historial posible.
--
-- Esta tabla registra cada entrega por separado, de modo que:
--   RESTA PAGAR = valor total de la práctica - SUMA(entregas del presupuesto)
--
-- Los campos de `presupuestos_aceptacion` NO se tocan ni se migran acá: siguen
-- siendo los parámetros que el operador carga en el modal (modalidad y valor
-- del depósito). La entrega efectiva es otra cosa y ahora tiene su lugar.
--
-- ------------------------------------------------------------
-- 2) POR QUÉ `requiere_factura` SE GUARDA Y NO SE CALCULA
-- ------------------------------------------------------------
-- Regla de facturación relevada por Administración: si el presupuesto NO tiene
-- descuento, corresponde emitir factura el día de la cirugía y el comprobante
-- lleva la leyenda "C/IVA". Si tiene descuento, no corresponde factura (el
-- descuento se dio a cambio) y la leyenda es "S/IVA". El IVA nunca se
-- desglosa: la leyenda es lo único que se imprime.
--
-- Se persiste en vez de derivarse en cada lectura porque es la foto del
-- momento en que se recibió el dinero: si mañana alguien edita el descuento del
-- presupuesto, el comprobante YA IMPRESO y entregado al paciente no cambia. La
-- leyenda impresa y el flag guardado tienen que coincidir siempre.
--
-- Ivana lo usa para saber si emite factura; Flavio, para cerrar el ingreso el
-- día de la cirugía.
--
-- ------------------------------------------------------------
-- 3) `practica_codigo`: preparado, todavía sin uso
-- ------------------------------------------------------------
-- Administración pidió que un presupuesto con más de una práctica quirúrgica
-- emita un ingreso de caja POR PRÁCTICA (se liquidan por separado y entran con
-- códigos distintos). Hoy eso no se puede: `presupuestos.prestacion_codigo` es
-- singular — en P-2026-813 la inyección de Avastin está cargada como INSUMO
-- ($106.973,11), no como segunda práctica, así que no hay una segunda práctica
-- sobre la cual emitir nada.
--
-- La columna queda NULL mientras el presupuesto sea de una sola práctica. Se
-- agrega ahora para no necesitar otra migración cuando el presupuestador
-- soporte múltiples prácticas.
--
-- ------------------------------------------------------------
-- 4) LEYENDA DE RESULTADO VISUAL DEL LIO (regla clínica)
-- ------------------------------------------------------------
-- La frase "La pte. continúa usando anteojos de lejos y cerca" se imprime
-- ÚNICAMENTE cuando el LIO es Básico. En los otros lentes NO va ninguna frase.
--
-- No es una omisión: en los lentes no básicos el objetivo refractivo lo ELIGE
-- EL PACIENTE y cambia caso por caso — hay pacientes que piden quedar con buena
-- visión de cerca y mala de lejos por su oficio, y el resultado también cambia
-- si hubo cirugía refractiva previa. Una frase fija sería clínicamente
-- incorrecta. En el Básico no cambia nunca, y la leyenda protege a la clínica
-- del reclamo posterior.
--
-- Va como columna del catálogo y no como constante en el código para que
-- Administración pueda agregarle una frase a otro lente sin tocar el render.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 4.1 · Leyenda de resultado visual en el catálogo de LIO
-- ------------------------------------------------------------
ALTER TABLE public.presupuestos_lios
  ADD COLUMN IF NOT EXISTS leyenda_resultado text;

COMMENT ON COLUMN public.presupuestos_lios.leyenda_resultado IS
  'Frase de resultado visual que se imprime debajo del nombre del lente en el '
  'comprobante de caja. Vacía en todos los lentes salvo el Básico: en los demás '
  'el objetivo refractivo lo elige el paciente y cambia caso por caso.';

-- Sólo el Básico (030501) lleva leyenda. El resto queda explícitamente en NULL
-- para que no arrastre nada de una carga previa.
UPDATE public.presupuestos_lios
   SET leyenda_resultado = 'La pte. continúa usando anteojos de lejos y cerca'
 WHERE codigo_practica = '030501';

UPDATE public.presupuestos_lios
   SET leyenda_resultado = NULL
 WHERE codigo_practica IS DISTINCT FROM '030501'
   AND leyenda_resultado IS NOT NULL;

-- ------------------------------------------------------------
-- 4.2 · Entregas de caja
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presupuestos_caja_entregas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id    uuid NOT NULL
                      REFERENCES public.presupuestos(id) ON DELETE CASCADE,

  -- Fecha de la ENTREGA DEL DINERO, no la de la cirugía. Es la que se imprime
  -- en el comprobante.
  fecha             date NOT NULL DEFAULT CURRENT_DATE,

  monto             numeric(14,2) NOT NULL CHECK (monto > 0),

  -- Valor total de la práctica al momento de la entrega. Se congela con la
  -- entrega para que reimprimir un comprobante viejo dé el mismo saldo aunque
  -- después se haya reeditado el presupuesto.
  valor_total       numeric(14,2),

  -- Foto de la regla de facturación (ver bloque 2 del encabezado).
  --   true  -> se imprimió "C/IVA": corresponde factura el día de la cirugía
  --   false -> se imprimió "S/IVA": no corresponde (hubo descuento)
  requiere_factura  boolean NOT NULL DEFAULT true,

  -- NULL mientras el presupuesto sea de una sola práctica (ver bloque 3).
  practica_codigo   text,

  registrado_por    text,
  observaciones     text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.presupuestos_caja_entregas IS
  'Entregas parciales de dinero contra un presupuesto aceptado. El saldo del '
  'comprobante de caja es valor_total - SUMA(monto). Una fila por entrega: '
  'nunca se pisa la anterior.';

CREATE INDEX IF NOT EXISTS idx_caja_entregas_presupuesto
  ON public.presupuestos_caja_entregas (presupuesto_id, fecha);

-- `updated_at` lo maneja el trigger; el frontend NUNCA lo manda (devuelve 400).
DROP TRIGGER IF EXISTS trg_updated_at ON public.presupuestos_caja_entregas;
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON public.presupuestos_caja_entregas
  FOR EACH ROW EXECUTE FUNCTION public.tg_presupuestos_updated_at();

-- ------------------------------------------------------------
-- 4.3 · RLS
-- ------------------------------------------------------------
-- La anon key viaja en el bundle: una tabla sin RLS es de lectura y escritura
-- pública. Mismo patrón que `presupuestos_aceptacion`: sólo `authenticated`
-- con el permiso del módulo, y NADA para `anon`.
ALTER TABLE public.presupuestos_caja_entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_caja_entregas_all ON public.presupuestos_caja_entregas;
CREATE POLICY pol_caja_entregas_all
  ON public.presupuestos_caja_entregas
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
  v_leyenda text;
  v_otros   int;
  v_rls     boolean;
  v_pol     int;
BEGIN
  IF to_regclass('public.presupuestos_caja_entregas') IS NULL THEN
    RAISE EXCEPTION '44: no se creó presupuestos_caja_entregas';
  END IF;

  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.presupuestos_caja_entregas'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION '44: presupuestos_caja_entregas quedó SIN RLS (expuesta a anon)';
  END IF;

  SELECT count(*) INTO v_pol
    FROM pg_policies
   WHERE tablename = 'presupuestos_caja_entregas' AND 'anon' = ANY(roles);
  IF v_pol > 0 THEN
    RAISE EXCEPTION '44: hay % policy(s) que alcanzan al rol anon', v_pol;
  END IF;

  SELECT leyenda_resultado INTO v_leyenda
    FROM public.presupuestos_lios WHERE codigo_practica = '030501';
  IF v_leyenda IS NULL THEN
    RAISE EXCEPTION '44: el LIO Básico (030501) quedó sin leyenda de resultado';
  END IF;

  SELECT count(*) INTO v_otros
    FROM public.presupuestos_lios
   WHERE codigo_practica IS DISTINCT FROM '030501'
     AND leyenda_resultado IS NOT NULL;
  IF v_otros > 0 THEN
    RAISE EXCEPTION '44: % LIO no básicos tienen leyenda (sólo el Básico debe tenerla)', v_otros;
  END IF;

  RAISE NOTICE 'OK 44: presupuestos_caja_entregas creada con RLS + leyenda cargada sólo en el LIO Básico.';
END
$$;
