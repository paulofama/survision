-- ============================================================
-- Migración 58 — El tipo de proveedor de GECLISA, en el espejo
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La tabla `Proveedores` de GECLISA clasifica a cada proveedor desde que se
-- lo da de alta, para las retenciones, y nadie lo estaba usando:
--
--   TipoProv: 1 Prestaciones de servicios · 3 Insumos
--             4 Insumos médicos · 5 Prestaciones de servicios médicos
--   ConcGan:  1 Bienes · 2 Profesionales liberales · 3 No gravada
--             4 Locación de servicios/obra · 5 Alquileres
--
-- POR QUÉ ES CONFIABLE: coincide con lo que se venía clasificando a mano.
-- Alcon figura como "insumos médicos" y sus 160 comprobantes están en
-- variable/insumos; Casado como "insumos" y sus 64 en Insumos de Oficina;
-- Excimer Laser como "servicios médicos" y sus 2 en variable/honorarios. No
-- es una fuente nueva sin probar: es la misma decisión, tomada antes y por
-- otra persona.
--
-- POR QUÉ HAY QUE ESPEJARLO
-- --------------------------
-- El auto-clasificador vive en el navegador (`useErogaciones`), y desde que
-- se dio de baja el proxy `/api` el front lee SÓLO Supabase: no puede
-- preguntarle nada a GECLISA. Si el dato no está en el espejo, no existe
-- para la pantalla.
--
-- Las dos columnas quedan NULL en `MovValoresEnca` y `LiqComp`, que no tienen
-- proveedor de la tabla Proveedores. Eso es correcto y el clasificador lo
-- tiene que tratar como "no sé", no como un tipo.
-- ============================================================

BEGIN;

ALTER TABLE public.erogaciones_geclisa
  ADD COLUMN IF NOT EXISTS tipo_proveedor_id smallint,
  ADD COLUMN IF NOT EXISTS concepto_ganancias_id smallint;

COMMENT ON COLUMN public.erogaciones_geclisa.tipo_proveedor_id IS
  'GECLISA Proveedores.tipoProv_id: 1 prestaciones de servicios, 3 insumos, '
  '4 insumos médicos, 5 prestaciones de servicios médicos, 0 s/d. NULL en '
  'caja y liquidaciones, que no tienen proveedor de esa tabla.';

COMMENT ON COLUMN public.erogaciones_geclisa.concepto_ganancias_id IS
  'GECLISA Proveedores.concGan_id: 1 bienes, 2 profesionales liberales, '
  '3 no gravada, 4 locación de servicios u obra, 5 alquileres. Desempata el '
  'tipo 1, que mezcla un flete con un estudio jurídico.';

-- El clasificador filtra por estas dos al sugerir.
CREATE INDEX IF NOT EXISTS ix_erogaciones_tipo_proveedor
  ON public.erogaciones_geclisa (tipo_proveedor_id)
  WHERE tipo_proveedor_id IS NOT NULL;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_name = 'erogaciones_geclisa'
     AND column_name IN ('tipo_proveedor_id', 'concepto_ganancias_id');
  IF v_cols <> 2 THEN
    RAISE EXCEPTION 'ABORTA: faltan columnas en erogaciones_geclisa (hay %, deberían ser 2)', v_cols;
  END IF;

  RAISE NOTICE 'Tipo de proveedor agregado al espejo. Quedan en NULL hasta la próxima sincronización.';
END $$;
