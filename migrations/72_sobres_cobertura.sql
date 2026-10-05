-- ============================================================
-- Migración 72 — el registro de emisiones guarda la vía de autorización
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- `presupuestos_sobres` (migración 46) ya es el registro de todo documento
-- emitido: qué documentos, en qué modo, quién y cuándo. Ahora también registra
-- el Pedido de cirugía que se emite ANTES de aceptar, y para ése hay un dato
-- que no vive en ninguna otra parte: la vía de autorización con la que salió.
--
-- POR QUÉ NO ALCANZA CON `documentos`
-- ------------------------------------
-- Un pedido previo a la aceptación no tiene aceptación de la cual deducir el
-- convenio: la vía la elige quien emite, en el momento de emitir. Si no se
-- guarda acá, se pierde. Y es justo el dato que hay que poder reconstruir: un
-- pedido que salió como OSEP y una aceptación que después se registró por
-- Círculo Médico son dos papeles que dicen cosas distintas sobre el mismo
-- presupuesto.
--
-- No se mete dentro del array `documentos`: ese array es la lista de claves de
-- documento, y mezclarle otra cosa rompe el único significado que tiene.
--
-- DOS COLUMNAS, NO UNA
-- ---------------------
-- `cobertura` es la etiqueta tal como salió IMPRESA —es lo que hay que poder
-- comparar contra el papel— y `convenio_id` es la referencia al catálogo, para
-- poder cruzar contra la aceptación sin comparar textos. Las dos quedan en
-- null cuando el documento no es un pedido previo, que es el caso de las 12
-- filas que ya existen.
--
-- Arquitectura no destructiva: agrega columnas, no altera ni borra nada. La
-- tabla ya tiene RLS habilitada con su policy para `authenticated`
-- (`pol_sobres_all`), así que no hace falta tocar seguridad: una columna nueva
-- queda cubierta por la policy de la tabla.
-- ============================================================

BEGIN;

ALTER TABLE public.presupuestos_sobres
  ADD COLUMN IF NOT EXISTS cobertura text;

ALTER TABLE public.presupuestos_sobres
  ADD COLUMN IF NOT EXISTS convenio_id uuid;

-- La FK se agrega aparte y de forma idempotente: si la columna ya existía de
-- una corrida anterior, el constraint también.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.presupuestos_sobres'::regclass
       AND conname = 'presupuestos_sobres_convenio_id_fkey'
  ) THEN
    ALTER TABLE public.presupuestos_sobres
      ADD CONSTRAINT presupuestos_sobres_convenio_id_fkey
      FOREIGN KEY (convenio_id) REFERENCES public.presupuestos_convenios(id);
  END IF;
END $$;

COMMENT ON COLUMN public.presupuestos_sobres.cobertura IS
  'Vía de autorización con la que se emitió, tal como salió impresa. Sólo la '
  'carga el Pedido de cirugía previo a la aceptación, donde la elige quien '
  'emite: "Particular", el nombre del convenio, o la obra social de la ficha '
  'cuando la vía quedó sin definir. Null en todo documento emitido desde el '
  'Sobre Quirúrgico, que toma la cobertura de la aceptación.';

COMMENT ON COLUMN public.presupuestos_sobres.convenio_id IS
  'Convenio elegido al emitir el pedido previo, para cruzar contra el de la '
  'aceptación sin comparar textos. Null cuando la vía quedó sin definir.';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_cobertura integer;
  v_convenio integer;
  v_fk integer;
  v_filas integer;
  v_huerfanas integer;
BEGIN
  SELECT count(*) INTO v_cobertura FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'presupuestos_sobres'
     AND column_name = 'cobertura';
  SELECT count(*) INTO v_convenio FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'presupuestos_sobres'
     AND column_name = 'convenio_id';

  IF v_cobertura <> 1 OR v_convenio <> 1 THEN
    RAISE EXCEPTION 'ABORTA: faltan columnas (cobertura=%, convenio_id=%)', v_cobertura, v_convenio;
  END IF;

  SELECT count(*) INTO v_fk FROM pg_constraint
   WHERE conrelid = 'public.presupuestos_sobres'::regclass
     AND conname = 'presupuestos_sobres_convenio_id_fkey';
  IF v_fk <> 1 THEN
    RAISE EXCEPTION 'ABORTA: la FK a presupuestos_convenios no quedó';
  END IF;

  -- Las emisiones que ya estaban registradas no se tocan.
  SELECT count(*) INTO v_filas FROM public.presupuestos_sobres;
  SELECT count(*) INTO v_huerfanas FROM public.presupuestos_sobres
   WHERE convenio_id IS NOT NULL
     AND convenio_id NOT IN (SELECT id FROM public.presupuestos_convenios);
  IF v_huerfanas > 0 THEN
    RAISE EXCEPTION 'ABORTA: % fila(s) con convenio_id inexistente', v_huerfanas;
  END IF;

  RAISE NOTICE 'Registro de emisiones ampliado. % emisión(es) previas intactas.', v_filas;
END $$;
