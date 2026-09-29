-- ============================================================
-- Migración 63 — Las cinco que esperaban al médico, resueltas por criterio
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Decisión de Paulo, 29/09/2026: activarlas con el criterio propuesto en vez
-- de seguir esperando al Dr. Mercado. La consulta al médico SIGUE ABIERTA —
-- si corrige alguna se cambia en la pantalla y los pedidos siguientes salen
-- con la corrección. Lo que no se deshace es un pedido ya firmado y
-- presentado, y eso hoy no está pasando porque salen en blanco.
--
-- TRES SON TÉCNICAS Y FIRMES
-- ---------------------------
--   030326  Luz pulsada .......... se indica por disfunción de glándulas de
--           Meibomio Y por rosácea ocular, que además suelen ir juntas: la
--           rosácea es causa frecuente de la disfunción. Pasa a DOS OPCIONES.
--   030801  Cateterización de punto ... trata el punto cerrado, no el
--           conducto. Cambia a "Estenosis del punto lagrimal".
--   031003  Biopsia de conjuntiva ..... "Lesión conjuntival a estudiar" queda
--           como está: una biopsia se pide porque NO se sabe qué es.
--
-- DOS SON DE CRITERIO LOCAL
-- --------------------------
--   030204  Needling ... técnicamente el paciente TIENE glaucoma, porque
--           tiene una trabeculectomía previa. Pero Administración escribe
--           "hipertensión ocular" y es lo que viene pasando en las obras
--           sociales. Entre tener razón y que autoricen la práctica, gana lo
--           segundo. 1 presupuesto.
--   030506  Extracción de cristalino ... "Catarata" es la indicación en la
--           enorme mayoría, aunque no la única (subluxación, recambio
--           refractivo). 3 presupuestos.
--
-- QUEDA AFUERA A PROPÓSITO
-- -------------------------
--   030330  Sondaje + puntoplastia bilateral. Lleva el mismo diagnóstico que
--           030811 y se activaría por la misma decisión, pero no estaba en
--           las cinco preguntas. Se deja apagado para no ampliar el alcance
--           por mi cuenta; es 1 presupuesto y se activa desde la pantalla.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Luz pulsada: dos indicaciones
-- ------------------------------------------------------------
-- La fila de diagnóstico único se deja APAGADA y el diagnóstico pasa a la
-- tabla de opciones. Una práctica NO puede tener las dos cosas activas: el
-- pedido tendría que elegir en silencio cuál imprimir, y las migraciones 60
-- y 61 abortan si eso pasa.
UPDATE public.presupuestos_diagnosticos
   SET activo = false,
       nota_interna = 'Reemplazada por las opciones de `presupuestos_diagnostico_opciones` '
                   || '(migración 63): la luz pulsada se indica por dos cosas y se elige al aceptar.'
 WHERE codigo_practica = '030326';

INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by, nota_interna)
VALUES
  ('030326', 'Disfunción de glándulas de Meibomio {ojo}',
   'Terapia de luz pulsada intensa.', false, 1, 'migracion_63',
   'Criterio técnico aplicado por decisión de Paulo el 29/09/2026. Pendiente de confirmar con el Dr. Mercado.'),
  ('030326', 'Rosácea ocular {ojo}',
   'Terapia de luz pulsada intensa.', false, 2, 'migracion_63',
   'Criterio técnico aplicado por decisión de Paulo el 29/09/2026. Pendiente de confirmar con el Dr. Mercado.')
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Vía lagrimal: el punto NO es el conducto
-- ------------------------------------------------------------
UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       nota_interna = 'Activado por decisión de Paulo el 29/09/2026. El sondaje desobstruye el '
                   || 'conducto. Pendiente de confirmar con el Dr. Mercado.'
 WHERE codigo_practica = '030811';

UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       diagnostico = 'Estenosis del punto lagrimal {ojo}',
       nota_interna = 'Activado por decisión de Paulo el 29/09/2026. Se separó del sondaje (030811): '
                   || 'la cateterización trata el PUNTO cerrado, no el conducto, así que no puede '
                   || 'llevar el mismo diagnóstico. Pendiente de confirmar con el Dr. Mercado.'
 WHERE codigo_practica = '030801';

-- ------------------------------------------------------------
-- 3. Biopsia de conjuntiva: queda como está
-- ------------------------------------------------------------
UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       nota_interna = 'Activado por decisión de Paulo el 29/09/2026. Una biopsia se pide porque NO se '
                   || 'sabe qué es la lesión; el diagnóstico definitivo es el resultado. Pendiente de '
                   || 'confirmar con el Dr. Mercado.'
 WHERE codigo_practica = '031003';

-- ------------------------------------------------------------
-- 4. Needling: lo que escribe Administración
-- ------------------------------------------------------------
UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       diagnostico = 'Hipertensión ocular {ojo}',
       nota_interna = 'Activado por decisión de Paulo el 29/09/2026, con la redacción que usa '
                   || 'Administración (M. Murgo). Técnicamente el paciente TIENE glaucoma, porque el '
                   || 'needling se hace sobre una trabeculectomía previa; se eligió "hipertensión '
                   || 'ocular" porque es lo que viene autorizando la obra social. Pendiente de '
                   || 'confirmar con el Dr. Mercado.'
 WHERE codigo_practica = '030204';

-- ------------------------------------------------------------
-- 5. Extracción de cristalino
-- ------------------------------------------------------------
-- `lleva_lio` ya está en NO y confirmado por Administración: es lo que más
-- podía salir mal, porque imprimiría un renglón de lente que no corresponde.
UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       nota_interna = 'Activado por decisión de Paulo el 29/09/2026. "Catarata" es la indicación en la '
                   || 'enorme mayoría, aunque no la única (subluxación del cristalino, recambio '
                   || 'refractivo). NO lleva lente: confirmado por Administración el 29/09. '
                   || 'Pendiente de confirmar la redacción con el Dr. Mercado.'
 WHERE codigo_practica = '030506';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_activos integer;
  v_opciones integer;
  v_choque integer;
  v_lio boolean;
  v_solas integer;
BEGIN
  SELECT count(*) INTO v_activos FROM public.presupuestos_diagnosticos
   WHERE codigo_practica IN ('030811', '030801', '031003', '030204', '030506') AND activo;
  IF v_activos <> 5 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 5 diagnósticos activos, hay %', v_activos;
  END IF;

  SELECT count(*) INTO v_opciones FROM public.presupuestos_diagnostico_opciones
   WHERE codigo_practica = '030326' AND activo;
  IF v_opciones <> 2 THEN
    RAISE EXCEPTION 'ABORTA: la luz pulsada tiene % opciones activas, deberían ser 2', v_opciones;
  END IF;

  -- Ninguna práctica puede tener diagnóstico único Y opciones a la vez.
  SELECT count(*) INTO v_choque
    FROM public.presupuestos_diagnostico_opciones o
    JOIN public.presupuestos_diagnosticos d ON d.codigo_practica = o.codigo_practica
   WHERE o.activo AND d.activo;
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con diagnóstico único Y opciones', v_choque;
  END IF;

  -- Ninguna con una sola opción: sería obligar a elegir entre una cosa.
  SELECT count(*) INTO v_solas FROM (
    SELECT codigo_practica FROM public.presupuestos_diagnostico_opciones
     WHERE activo GROUP BY codigo_practica HAVING count(*) < 2) q;
  IF v_solas > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) quedaron con una sola opción', v_solas;
  END IF;

  -- Extracción de cristalino NO lleva lente: si se enciende con SÍ, el pedido
  -- imprime un renglón de lente que no corresponde.
  SELECT lleva_lio INTO v_lio FROM public.presupuestos_diagnosticos WHERE codigo_practica = '030506';
  IF v_lio THEN
    RAISE EXCEPTION 'ABORTA: extracción de cristalino quedó con lente y Administración confirmó que no lleva';
  END IF;

  RAISE NOTICE 'Cinco resueltas por criterio. La consulta al Dr. Mercado sigue abierta.';
END $$;
