-- ============================================================
-- Migración 62 — Respuestas de Administración a las dudas de diagnóstico
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Las 7 dudas que quedaron de las migraciones 52 y 59 se le pasaron a
-- Marianela Murgo el 29/09/2026. Contestó 3 y derivó 4 al Dr. Mercado, que
-- estaba en consultorio.
--
-- SE ACTIVAN LAS DOS QUE ESTABAN CONFIRMADAS
-- -------------------------------------------
--   030002  Yag capsulotomía ..... 93 presupuestos
--   030510  Mininuc .............. 36 presupuestos
--
-- Son 129 pedidos que dejan de imprimir el renglón del diagnóstico en
-- blanco: más que todo lo que se cargó en las migraciones 59 y 61 juntas.
--
-- LO QUE NO SE ACTIVA, Y POR QUÉ
-- -------------------------------
-- Las otras 5 quedan APAGADAS esperando al Dr. Mercado. Dos de ellas tienen
-- una respuesta parcial de Administración y se anota en la nota para que no
-- se pierda, pero anotar no es confirmar: el diagnóstico se firma y se
-- presenta a la obra social, así que con "es lo que yo pongo, pero
-- preguntale a Mercado" no alcanza para encenderlo.
--
-- UN DATO QUE VINO DE REGALO Y HABÍA QUE VERIFICAR
-- ------------------------------------------------
-- Administración avisó que el Yag láser se usa para dos cosas distintas
-- —iridectomía y capsulotomía— y que llevan diagnósticos diferentes.
-- Verificado: están separados y correctos desde antes.
--   030001 Yag iridectomía ... Glaucoma de ángulo estrecho
--   030002 Yag capsulotomía ... Opacidad de cápsula posterior
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Yag capsulotomía — confirmado
-- ------------------------------------------------------------
UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       nota_interna = 'Confirmado por Administración (M. Murgo) el 29/09/2026: '
                   || '"opacidad de cápsula posterior". Avisó además que el Yag se usa para dos cosas '
                   || 'con diagnósticos distintos — la iridectomía es el código 030001 y está aparte.'
 WHERE codigo_practica = '030002';

-- ------------------------------------------------------------
-- 2. Mininuc — confirmado, y SÍ lleva lente
-- ------------------------------------------------------------
-- La duda era doble: si era cirugía de catarata y si llevaba lente
-- intraocular. Las dos confirmadas. La solicitud pasa a decir "con
-- complejidad", que es como lo nombra Administración.
UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       lleva_lio = true,
       solicitud = 'Cirugía de catarata con complejidad.',
       nota_interna = 'Confirmado por Administración (M. Murgo) el 29/09/2026: '
                   || '"la mininuc sí lleva lente intraocular, diagnóstico cirugía de catarata con complejidad".'
 WHERE codigo_practica = '030510';

-- ------------------------------------------------------------
-- 3. Las que esperan al Dr. Mercado
-- ------------------------------------------------------------
-- Extracción de cristalino: el `lleva_lio = false` quedó confirmado, que era
-- la parte que podía imprimir un renglón de lente que no corresponde. Falta
-- la redacción del diagnóstico.
UPDATE public.presupuestos_diagnosticos
   SET nota_interna = 'PENDIENTE DR. MERCADO. Administración confirmó el 29/09/2026 que NO lleva lente '
                   || 'intraocular (ya está en NO). Sobre el diagnóstico dijo "el dx es cirugía de '
                   || 'extracción de cristalino", que nombra el procedimiento y no la condición del '
                   || 'paciente: falta definir si el renglón dice "Catarata" o algo más preciso.'
 WHERE codigo_practica = '030506';

-- Needling: Administración usa "hipertensión ocular", pero pidió confirmarlo.
UPDATE public.presupuestos_diagnosticos
   SET nota_interna = 'PENDIENTE DR. MERCADO. Administración (M. Murgo, 29/09/2026) dijo: "aquí '
                   || 'hipertensión ocular, es lo que yo pongo, pero deberíamos preguntarle a Mercado". '
                   || 'Si se confirma, el diagnóstico pasa de "Glaucoma" a "Hipertensión ocular".'
 WHERE codigo_practica = '030204';

UPDATE public.presupuestos_diagnosticos
   SET nota_interna = 'PENDIENTE DR. MERCADO. Se preguntó si la luz pulsada se indica sólo por '
                   || 'disfunción de glándulas de Meibomio o también por rosácea ocular. '
                   || 'Administración lo derivó (29/09/2026). Si son dos, va a la tabla de opciones.'
 WHERE codigo_practica = '030326';

UPDATE public.presupuestos_diagnosticos
   SET nota_interna = 'PENDIENTE DR. MERCADO. Se preguntó si el sondaje (030811) y la cateterización '
                   || 'de punto (030801) llevan el mismo diagnóstico o si el punto va como "estenosis '
                   || 'del punto lagrimal". Administración lo derivó (29/09/2026).'
 WHERE codigo_practica IN ('030811', '030801');

UPDATE public.presupuestos_diagnosticos
   SET nota_interna = 'PENDIENTE DR. MERCADO. Se preguntó si "Lesión conjuntival a estudiar" es como '
                   || 'lo dicen ellos. Administración lo derivó expresamente (29/09/2026).'
 WHERE codigo_practica = '031003';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_activos integer;
  v_lio boolean;
  v_pendientes integer;
  v_yag integer;
BEGIN
  SELECT count(*) INTO v_activos FROM public.presupuestos_diagnosticos
   WHERE codigo_practica IN ('030002', '030510') AND activo;
  IF v_activos <> 2 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 2 diagnósticos activados, hay %', v_activos;
  END IF;

  -- El renglón del LIO es lo que más podía salir mal: si Mininuc queda en NO,
  -- 36 pedidos imprimen sin la lente que sí lleva.
  SELECT lleva_lio INTO v_lio FROM public.presupuestos_diagnosticos WHERE codigo_practica = '030510';
  IF NOT v_lio THEN
    RAISE EXCEPTION 'ABORTA: Mininuc quedó sin lente intraocular y Administración confirmó que lleva';
  END IF;

  -- Ninguna de las que esperan al médico puede haberse encendido.
  SELECT count(*) INTO v_pendientes FROM public.presupuestos_diagnosticos
   WHERE nota_interna LIKE 'PENDIENTE DR. MERCADO%' AND activo;
  IF v_pendientes > 0 THEN
    RAISE EXCEPTION 'ABORTA: % diagnóstico(s) pendientes del médico quedaron ACTIVOS', v_pendientes;
  END IF;

  -- Los dos usos del Yag tienen que seguir separados.
  SELECT count(*) INTO v_yag FROM public.presupuestos_diagnosticos
   WHERE (codigo_practica = '030001' AND diagnostico ILIKE '%ángulo estrecho%')
      OR (codigo_practica = '030002' AND diagnostico ILIKE '%cápsula posterior%');
  IF v_yag <> 2 THEN
    RAISE EXCEPTION 'ABORTA: los dos usos del Yag no están separados como corresponde';
  END IF;

  RAISE NOTICE 'Yag capsulotomía y Mininuc activados (129 presupuestos). 6 esperan al Dr. Mercado.';
END $$;
