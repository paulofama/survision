-- ============================================================
-- Migración 59 — más diagnósticos PROPUESTOS (cargados apagados)
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Segunda tanda, con el MISMO criterio angosto que fijó la 52: se propone
-- sólo la práctica cuyo procedimiento tiene UNA indicación, deducible de qué
-- ES el procedimiento y no de qué tiene el paciente. Un sondaje de vía
-- lagrimal se hace por una obstrucción de la vía lagrimal y por nada más; un
-- Avastin puede ser por tres cosas distintas.
--
-- TODAS ENTRAN CON `activo = false`, o sea que NO SE IMPRIMEN. El pedido
-- sigue saliendo con el renglón en blanco hasta que alguien las lea en
-- `/presupuestos/diagnosticos` y las active. La propuesta ahorra tipeo, no
-- reemplaza la revisión: un blanco se nota y se llena, un diagnóstico
-- equivocado se firma y se presenta a la obra social.
--
-- `nota_interna` deja escrito de dónde sale cada uno y qué duda tiene, para
-- que quien revise no tenga que adivinar qué estaba pensando el que propuso.
--
-- LO QUE SIGUE SIN PROPONERSE, Y POR QUÉ
-- ---------------------------------------
-- 1. LAS INTRAVÍTREAS — 197 presupuestos, el 44% de lo que falta:
--      030601 antiangiogénicos (189) · 030609 sin fármaco (4)
--      030602 Eylia (2) · 030610 sin fármaco (2)
--    El diagnóstico depende del paciente: DMAE húmeda, edema macular
--    diabético u oclusión venosa. Necesitan elegir al imprimir, y esta tabla
--    tiene `codigo_practica` como clave primaria: una práctica no puede
--    tener hoy más de un diagnóstico. Es un cambio de modelo, no una fila.
--
-- 2. LOS ESTUDIOS, que no son cirugías — ecografías, RFG, biometrías,
--    topografía, paquimetría, Schirmer (~55 presupuestos). No generan pedido
--    de cirugía, así que no necesitan diagnóstico quirúrgico.
--
-- 3. "otro" (33 presupuestos) — es el código comodín del presupuestador para
--    escribir la prestación a mano. No es una práctica y no puede tener un
--    diagnóstico fijo.
--
-- 4. Las de la lista de la 52, que siguen igual: fotocoagulación láser,
--    cross linking, Kenacort, pan fotocoagulación, Yag iridectomía.
-- ============================================================

BEGIN;

INSERT INTO public.presupuestos_diagnosticos
  (codigo_practica, diagnostico, solicitud, lleva_lio, activo, nota_interna)
VALUES
  -- ---- Ojo seco y glándulas de Meibomio ----
  ('030806', 'Ojo seco {ojo}',
   'Colocación de tapones lagrimales (punctum plug) no perforados, bilateral.', false, false,
   'PROPUESTO, sin revisar. El punctum plug se coloca para retener lágrima: la indicación es ojo seco. Confirmar si se prefiere "Síndrome de ojo seco" o "Queratoconjuntivitis seca".'),

  ('030804', 'Ojo seco {ojo}',
   'Colocación de tapón lagrimal (punctum plug) no perforado.', false, false,
   'PROPUESTO, sin revisar. Igual que 030806 pero unilateral.'),

  ('030311', 'Disfunción de glándulas de Meibomio {ojo}',
   'Limpieza de glándulas de Meibomio, bilateral.', false, false,
   'PROPUESTO, sin revisar. El procedimiento nombra la glándula que trata.'),

  ('030326', 'Disfunción de glándulas de Meibomio {ojo}',
   'Terapia de luz pulsada intensa.', false, false,
   'PROPUESTO, sin revisar. La luz pulsada en oftalmología se usa para disfunción de Meibomio. Confirmar: también se indica para rosácea ocular.'),

  -- ---- Vía lagrimal ----
  ('030811', 'Obstrucción de la vía lagrimal {ojo}',
   'Sondaje de vía lagrimal con anestesia local.', false, false,
   'PROPUESTO, sin revisar. El sondaje se hace para desobstruir: la indicación es la obstrucción.'),

  ('030330', 'Obstrucción de la vía lagrimal {ojo}',
   'Sondaje de vía lagrimal y puntoplastia, bilateral.', false, false,
   'PROPUESTO, sin revisar. Igual que 030811, con puntoplastia.'),

  ('030801', 'Obstrucción de la vía lagrimal {ojo}',
   'Cateterización de punto lagrimal.', false, false,
   'PROPUESTO, sin revisar. Confirmar si conviene distinguirlo del sondaje: puede ser estenosis del punto y no obstrucción del conducto.'),

  -- ---- Glaucoma ----
  ('030202', 'Glaucoma {ojo}',
   'Trabeculectomía.', false, false,
   'PROPUESTO, sin revisar. La trabeculectomía es cirugía filtrante de glaucoma. Los otros códigos de glaucoma (030201, 030203) ya dicen "Glaucoma {ojo}".'),

  ('030204', 'Glaucoma {ojo}',
   'Needling de ampolla de filtración.', false, false,
   'PROPUESTO, sin revisar. El needling se hace sobre una ampolla de trabeculectomía previa que está fallando. Confirmar si se quiere decir eso en el diagnóstico.'),

  -- ---- Párpado y conjuntiva ----
  ('030304', 'Ectropión involucional {ojo}',
   'Corrección quirúrgica de ectropión.', false, false,
   'PROPUESTO, sin revisar. El nombre de la práctica ya dice involucional.'),

  ('031003', 'Lesión conjuntival a estudiar {ojo}',
   'Biopsia de conjuntiva.', false, false,
   'PROPUESTO, sin revisar. Una biopsia se pide para estudiar una lesión; el diagnóstico definitivo es el resultado. Confirmar la redacción.'),

  ('030328', 'Lesión conjuntival {ojo}',
   'Escisión simple de lesión conjuntival.', false, false,
   'PROPUESTO, sin revisar. El nombre de la práctica menciona nevus como ejemplo, pero la escisión sirve para cualquier lesión.'),

  -- ---- Segmento anterior ----
  ('030506', 'Catarata {ojo}',
   'Extracción de cristalino.', false, false,
   'PROPUESTO, sin revisar. OJO CON `lleva_lio`: quedó en NO porque el nombre no menciona implante, pero si en la práctica siempre se implanta lente hay que cambiarlo — el pedido no imprime el renglón del LIO cuando está en NO.'),

  ('030509', 'Afaquia {ojo}',
   'Implante secundario de lente intraocular, suturado o de fijación escleral.', true, false,
   'PROPUESTO, sin revisar. Un implante secundario se hace sobre un ojo sin lente. `lleva_lio` en SÍ: el pedido tiene que imprimir el renglón del LIO.'),

  ('030513', 'Endoftalmitis {ojo}',
   'Lavado de cámara anterior con toma de material para cultivo.', false, false,
   'PROPUESTO, sin revisar. El lavado con cultivo se hace ante sospecha de infección intraocular. Confirmar si se prefiere "Sospecha de endoftalmitis".'),

  -- ---- Retina ----
  ('030608', 'Aceite de silicona intraocular {ojo}',
   'Extracción de aceite de silicona posterior a vitrectomía.', false, false,
   'PROPUESTO, sin revisar. Es el segundo tiempo de una vitrectomía previa; el nombre de la práctica lo dice.')

ON CONFLICT (codigo_practica) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_nuevos integer;
  v_activos integer;
BEGIN
  SELECT count(*) INTO v_nuevos FROM public.presupuestos_diagnosticos
   WHERE nota_interna LIKE 'PROPUESTO%';

  -- NINGUNA propuesta puede haber quedado encendida: si se imprime sin que
  -- nadie la haya leído, el error sale firmado en un pedido a la obra social.
  SELECT count(*) INTO v_activos FROM public.presupuestos_diagnosticos
   WHERE nota_interna LIKE 'PROPUESTO%' AND activo;
  IF v_activos > 0 THEN
    RAISE EXCEPTION 'ABORTA: % diagnóstico(s) propuesto(s) quedaron ACTIVOS y se imprimirían sin revisar', v_activos;
  END IF;

  RAISE NOTICE 'Diagnósticos propuestos en total: % (todos apagados, a revisar en /presupuestos/diagnosticos).', v_nuevos;
END $$;
