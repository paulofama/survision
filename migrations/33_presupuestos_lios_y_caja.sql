-- ============================================================
-- MIGRACIÓN 33: Catálogo real de LIOs + datos del ingreso de caja
-- Sistema de Gestión Integral - Survisión S.A.
-- ============================================================
-- Origen: testeo funcional de Administración (10/08/2026) sobre el circuito
-- "Aceptar presupuesto → Circuito de cirugía → Sobre Quirúrgico → Ingreso de caja".
--
-- PROBLEMA A — El selector "LIO" del modal de aceptación sólo ofrecía "Básico".
--   Causa: la migración 25 sembró UNA sola fila en presupuestos_lios ('Básico')
--   y nunca se cargaron las demás. Además el presupuesto NO guarda un campo LIO
--   propio: el LIO está implícito en la PRESTACIÓN elegida (códigos 0305xx del
--   catálogo `prestaciones`). Resultado: todas las aceptaciones quedaron con
--   LIO='Básico' aunque el presupuesto fuera Vivity, Tórico, PanOptix, etc.,
--   y el error se propagaba al circuito, al sobre y al ingreso de caja.
--
--   Solución: se agrega `codigo_practica` a presupuestos_lios (mapeo
--   prestación → LIO) y se siembra el catálogo real. El frontend preselecciona
--   el LIO del presupuesto matcheando por código (fallback: por nombre).
--
-- PROBLEMA B — El "Ingreso de caja" armaba el depósito en garantía solo por
--   deducción (valor total + IVA), sin que el operador pudiera definir un monto
--   fijo o un porcentaje (Particular) ni un monto único (obra social).
--
--   Solución: columnas nuevas en presupuestos_aceptacion para persistir lo que
--   el operador carga, de modo que el comprobante sea reproducible y auditable.
--   (El DESCUENTO autorizado NO se agrega acá: ya se persiste correctamente en
--   presupuestos.datos_completos->precios->descuento; lo que fallaba era que el
--   comprobante no lo mostraba ni lo aplicaba. Se corrige en el frontend.)
--
-- DECISIONES CERRADAS con P. Famá (10/08/2026):
--   - Se aplican A y B juntas.
--   - Se hace BACKFILL de las aceptaciones existentes que apuntan a 'Básico'
--     por descarte (era la única opción disponible al cargarlas).
--
-- Idempotente (IF NOT EXISTS / ON CONFLICT / DO UPDATE). Atómica.
-- ============================================================

BEGIN;

-- ============================================================
-- A. CATÁLOGO REAL DE LIOs (mapeado a la prestación del presupuesto)
-- ============================================================

ALTER TABLE public.presupuestos_lios
  ADD COLUMN IF NOT EXISTS codigo_practica text;

COMMENT ON COLUMN public.presupuestos_lios.codigo_practica IS
  'Código de `prestaciones` que implica este LIO. Lo usa el modal de aceptación '
  'para preseleccionar el LIO del presupuesto. NULL = no se autoselecciona.';

-- Un código de prestación no puede implicar dos LIOs distintos.
DROP INDEX IF EXISTS ux_lios_codigo_practica;
CREATE UNIQUE INDEX ux_lios_codigo_practica
  ON public.presupuestos_lios (codigo_practica)
  WHERE codigo_practica IS NOT NULL;

-- Seed del catálogo real. Los códigos salen de `prestaciones` (grupo 0305xx):
--   030501 Facoemulsificacion mas Implante de Lio Basico
--   030502 Facoemulsificacion mas Implantes de Lio Monofocal
--   030503 Facoemulsificacion mas Implante de Lio Torico monofocal
--   030504 Facoemulsificacion mas Implante de Lio Mutifocal Panoptic
--   030505 Facoemulsificacion mas Implante de Lio Rango Extendido Vivity
--   030511 Facoemulsificacion con lente Rigido + Implante de Lente Rigido
--   030514 Facoemulsificacion mas Implante de Lio PanOptix Pro
--   030508 Implante Segundario de Lio Suturado a Esclera o Iris (excl. vitrectomía)
--   (030509, la variante que incluye vitrectomía, cae en el mismo LIO por
--    coincidencia de nombre en el frontend — un código por fila.)
INSERT INTO public.presupuestos_lios (nombre, descripcion, codigo_practica, orden) VALUES
  ('Básico',                  'LIO básico',                                    '030501', 1),
  ('Monofocal',               'LIO monofocal',                                 '030502', 2),
  ('Tórico monofocal',        'LIO tórico monofocal (corrige astigmatismo)',   '030503', 3),
  ('Multifocal Panoptic',     'LIO multifocal PanOptix',                       '030504', 4),
  ('Rango Extendido Vivity',  'LIO de rango de visión extendido (Vivity)',     '030505', 5),
  ('Multifocal PanOptix Pro', 'LIO multifocal PanOptix Pro',                   '030514', 6),
  ('Lente rígido',            'Lente intraocular rígido',                      '030511', 7),
  ('Implante secundario',     'Implante secundario de LIO suturado a esclera o iris', '030508', 8)
ON CONFLICT (nombre) DO UPDATE
  SET codigo_practica = EXCLUDED.codigo_practica,
      descripcion     = COALESCE(public.presupuestos_lios.descripcion, EXCLUDED.descripcion),
      orden           = EXCLUDED.orden,
      activo          = true;

-- ------------------------------------------------------------
-- A.2 BACKFILL de aceptaciones existentes
-- ------------------------------------------------------------
-- Todas las filas de presupuestos_aceptacion cargadas hasta hoy apuntan a
-- 'Básico' porque era la ÚNICA opción del selector. Se re-apuntan al LIO que
-- realmente corresponde según la prestación del presupuesto.
-- Guarda: sólo toca filas que hoy apuntan a 'Básico' Y cuya prestación mapea a
-- OTRO LIO. Una elección deliberada de 'Básico' sobre la prestación 030501
-- (o sobre una prestación sin mapeo) queda intacta.
UPDATE public.presupuestos_aceptacion a
   SET lio_id = l_correcto.id
  FROM public.presupuestos p
  JOIN public.presupuestos_lios l_correcto
    ON l_correcto.codigo_practica = p.prestacion_codigo
 WHERE a.presupuesto_id = p.id
   AND a.lio_id IS NOT NULL
   AND a.lio_id <> l_correcto.id
   AND a.lio_id = (SELECT id FROM public.presupuestos_lios WHERE nombre = 'Básico');

-- ============================================================
-- B. INGRESO DE CAJA — parámetros que carga el operador
-- ============================================================
-- Particular: depósito en garantía por MONTO fijo o por PORCENTAJE.
--   deposito_modalidad = 'MONTO'      -> deposito_valor es pesos
--   deposito_modalidad = 'PORCENTAJE' -> deposito_valor es % (base: valor total
--                                        de la cirugía, IVA incluido)
-- Obra social (directa o Círculo Médico): monto único, sin desglose de IVA.
ALTER TABLE public.presupuestos_aceptacion
  ADD COLUMN IF NOT EXISTS deposito_modalidad   text,
  ADD COLUMN IF NOT EXISTS deposito_valor       numeric(14,2),
  ADD COLUMN IF NOT EXISTS caja_monto_unico     numeric(14,2),
  ADD COLUMN IF NOT EXISTS caja_registrado_por  text,
  ADD COLUMN IF NOT EXISTS caja_registrado_en   timestamptz;

ALTER TABLE public.presupuestos_aceptacion
  DROP CONSTRAINT IF EXISTS chk_aceptacion_deposito_modalidad;
ALTER TABLE public.presupuestos_aceptacion
  ADD CONSTRAINT chk_aceptacion_deposito_modalidad
  CHECK (deposito_modalidad IS NULL OR deposito_modalidad IN ('MONTO','PORCENTAJE'));

-- Un porcentaje fuera de 0-100 es siempre un error de carga.
ALTER TABLE public.presupuestos_aceptacion
  DROP CONSTRAINT IF EXISTS chk_aceptacion_deposito_valor;
ALTER TABLE public.presupuestos_aceptacion
  ADD CONSTRAINT chk_aceptacion_deposito_valor
  CHECK (
    deposito_valor IS NULL
    OR deposito_valor >= 0
    AND (deposito_modalidad <> 'PORCENTAJE' OR deposito_valor <= 100)
  );

COMMENT ON COLUMN public.presupuestos_aceptacion.deposito_modalidad IS
  'Particular: cómo se determinó el depósito en garantía (MONTO fijo o PORCENTAJE).';
COMMENT ON COLUMN public.presupuestos_aceptacion.deposito_valor IS
  'Particular: el valor cargado por el operador ($ si MONTO, % si PORCENTAJE). Sin default: se define caso por caso.';
COMMENT ON COLUMN public.presupuestos_aceptacion.caja_monto_unico IS
  'Obra social (directa o Círculo Médico): monto único del ingreso de caja, sin desglose de IVA.';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
DO $$
DECLARE
  n_lios      integer;
  n_sin_cod   integer;
  faltan      text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='presupuestos_lios' AND column_name='codigo_practica') THEN
    faltan := faltan||' presupuestos_lios.codigo_practica';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='presupuestos_aceptacion' AND column_name='deposito_modalidad') THEN
    faltan := faltan||' presupuestos_aceptacion.deposito_modalidad';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='presupuestos_aceptacion' AND column_name='caja_monto_unico') THEN
    faltan := faltan||' presupuestos_aceptacion.caja_monto_unico';
  END IF;
  IF faltan <> '' THEN RAISE EXCEPTION 'FALLO 33: faltan ->%', faltan; END IF;

  SELECT count(*) INTO n_lios FROM public.presupuestos_lios WHERE activo;
  IF n_lios < 8 THEN
    RAISE EXCEPTION 'FALLO 33: se esperaban >= 8 LIOs activos, hay %', n_lios;
  END IF;

  SELECT count(*) INTO n_sin_cod
    FROM public.presupuestos_aceptacion a
    JOIN public.presupuestos p ON p.id = a.presupuesto_id
    JOIN public.presupuestos_lios l ON l.codigo_practica = p.prestacion_codigo
   WHERE a.lio_id <> l.id
     AND a.lio_id = (SELECT id FROM public.presupuestos_lios WHERE nombre = 'Básico');
  IF n_sin_cod > 0 THEN
    RAISE EXCEPTION 'FALLO 33: quedaron % aceptaciones con LIO Básico que debían corregirse', n_sin_cod;
  END IF;

  RAISE NOTICE 'OK 33: % LIOs activos con mapeo de prestación + columnas de caja + backfill de aceptaciones.', n_lios;
END $$;

COMMIT;
