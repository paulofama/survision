-- ============================================================
-- Migración 69 — documentos del sobre que no se imprimen
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La clínica pidió dejar de imprimir (01/10/2026):
--
--   1. Indicaciones para cirugía de cataratas
--   2. Cronograma de tratamiento quirúrgico
--   3. Instructivo de colocación de gotas
--   4. Consentimiento informado
--
-- SON CUATRO PEDIDOS PERO TRES DOCUMENTOS
-- ----------------------------------------
-- El "Instructivo de colocación de gotas" NO es un documento propio: es la
-- página 2 de `docCronograma`. Comparten builder desde que se partieron en dos
-- hojas, así que sacar el cronograma se lleva el instructivo. No hay forma de
-- quitar uno y dejar el otro sin partir el documento en dos.
--
-- EL CONSENTIMIENTO NO ENTRA EN ESTA LISTA, Y ES A PROPÓSITO
-- -----------------------------------------------------------
-- Se omite por una vía distinta: mientras el texto legal vigente sea el
-- placeholder (`presupuestos_textos_legales.es_placeholder`), el documento no
-- se imprime. El día que se cargue el texto real vuelve SOLO, firmable, sin
-- que nadie tenga que acordarse de prenderlo de nuevo.
--
-- Hoy el sobre imprime una hoja con el membrete del instituto, el nombre del
-- paciente y la leyenda "ESTA HOJA NO SE FIRMA" (migración 51). Esa hoja
-- desaparece.
--
-- Si algún día hay que suprimirlo incluso CON texto real, se lo agrega a esta
-- misma lista y gana la lista.
--
-- POR QUÉ EN DATOS Y NO EN CÓDIGO
-- --------------------------------
-- Para que Administración pueda volver a prender cualquiera sin un deploy,
-- igual que `recetas_suprimir` del convenio OSEP. Es la regla que ya sigue el
-- módulo: lo que Administración puede querer cambiar vive en datos.
--
-- Se conservan los builders y las plantillas de los tres: esto no borra nada.
-- ============================================================

BEGIN;

INSERT INTO public.presupuestos_config (clave, valor)
VALUES ('documentos_desactivados', 'indicaciones,cronograma')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_valor text;
  v_filas integer;
BEGIN
  SELECT valor INTO v_valor FROM public.presupuestos_config
   WHERE clave = 'documentos_desactivados';
  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'ABORTA: no quedó la fila de documentos desactivados';
  END IF;
  IF v_valor NOT LIKE '%indicaciones%' OR v_valor NOT LIKE '%cronograma%' THEN
    RAISE EXCEPTION 'ABORTA: la lista quedó incompleta: "%"', v_valor;
  END IF;

  -- El consentimiento NO va acá: se omite por `es_placeholder`. Si aparece en
  -- la lista es que alguien lo agregó sin leer el encabezado, y entonces NO
  -- volvería solo cuando se cargue el texto real.
  IF v_valor LIKE '%consentimiento%' THEN
    RAISE EXCEPTION
      'ABORTA: el consentimiento está en la lista; se omite por es_placeholder para que vuelva solo';
  END IF;

  -- La tabla es clave-valor: una sola fila por clave.
  SELECT count(*) INTO v_filas FROM public.presupuestos_config
   WHERE clave = 'documentos_desactivados';
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'ABORTA: hay % filas para la misma clave', v_filas;
  END IF;

  RAISE NOTICE 'Documentos desactivados: %. El consentimiento se omite por es_placeholder.', v_valor;
END $$;
