-- ============================================================
-- Migración 49 — segunda tanda de diagnósticos: lo que el NOMBRE de la
--                práctica dice literalmente
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- La migración 48 sembró 10 códigos (facos, pterigión, chalazión) y dejó el
-- resto en blanco a propósito. Al barrer el catálogo completo de las 136
-- prácticas 03xxxx aparecieron OTRAS cuyo nombre nombra la patología, entre
-- ellas dos pterigiones que la 48 se salteó (030410 y 030411): el criterio
-- estaba bien, la búsqueda había sido incompleta.
--
-- EL CRITERIO NO CAMBIA: sólo se carga el diagnóstico cuando la palabra de la
-- patología ESTÁ EN EL NOMBRE de la práctica. No se deduce ninguno.
--
-- Qué quedó afuera a pesar de matchear el barrido, y por qué:
--
--   * 030807 / 030810 / 030814  Dacriocistorrinostomía
--     "Dacrio" es el nombre del PROCEDIMIENTO, no del diagnóstico. El
--     diagnóstico sería la obstrucción de la vía lagrimal, y eso hay que
--     escribirlo, no inferirlo.
--
--   * 030325  Distiquiasis o Triquiasis
--     El nombre nombra DOS patologías distintas. Elegir cuál es la del
--     paciente es del médico.
--
-- Y sigue afuera todo lo de la 48: intravítreas (¿DMAE? ¿edema macular?
-- ¿oclusión venosa?), cross linking, Yag, blefaroplastias, punctum plugs.
-- Son 189 presupuestos sólo en Avastin: es el volumen más grande y es
-- justamente el que más criterio médico necesita.
--
-- Mientras no estén cargadas, esas prácticas imprimen el renglón EN BLANCO
-- con el aviso para completar a mano. Eso es lo correcto, no una deuda.
-- ============================================================

BEGIN;

INSERT INTO public.presupuestos_diagnosticos (codigo_practica, diagnostico, solicitud, lleva_lio) VALUES
  -- Pterigión: los dos que faltaban. Los otros dos los cargó la migración 48.
  ('030410', 'Pterigión {ojo}', 'Cirugía de pterigión con injerto de membrana amniótica.', false),
  ('030411', 'Pterigión {ojo}', 'Cirugía de pterigión doble.', false),

  -- Glaucoma: SÓLO la práctica que lo dice. La trabeculectomía (030202), el
  -- SLT (030201) y el needling (030204) también son de glaucoma, pero su
  -- nombre no lo afirma y acá no se deduce.
  ('030203', 'Glaucoma {ojo}', 'Cirugía de glaucoma con implante de válvula Express.', false),

  -- Vitrectomías: el nombre de cada una trae su indicación.
  ('030603', 'Agujero macular {ojo}',            'Vitrectomía por agujero macular.', false),
  ('030604', 'Membrana epimacular {ojo}',        'Vitrectomía por membrana epimacular.', false),
  ('030605', 'Hemovítreo {ojo}',                 'Vitrectomía por hemovítreo.', false),
  ('030606', 'Desprendimiento de retina {ojo}',  'Vitrectomía por desprendimiento de retina, con implante.', false),
  ('030614', 'Desprendimiento de retina {ojo}',  'Vitrectomía por desprendimiento de retina, sin implante.', false),
  ('030615', 'Endoftalmitis {ojo}',              'Vitrectomía posterior compleja por endoftalmitis.', false),

  -- Párpados.
  ('030309', 'Ptosis palpebral {ojo}',    'Corrección de ptosis palpebral por conjuntivomullerectomía.', false),
  ('030321', 'Ptosis palpebral {ojo}',    'Corrección de ptosis palpebral por reinserción de aponeurosis, bilateral.', false),
  ('030322', 'Lagoftalmos paralítico {ojo}', 'Corrección de lagoftalmos paralítico con implante de pesa de oro.', false),

  -- Trauma y cuerpos extraños: el nombre ES el diagnóstico.
  ('030901', 'Herida perforante ocular {ojo}',
             'Reparación de herida perforante con lesión de córnea, esclera, iris y/o cristalino.', false),
  ('030902', 'Herida perforante ocular con cuerpo extraño intraocular {ojo}',
             'Reparación de herida perforante con extracción de cuerpo extraño intraocular.', false),
  ('030908', 'Cuerpo extraño intracorneal {ojo}',    'Extracción de cuerpo extraño intracorneal.', false),
  ('031002', 'Cuerpo extraño subconjuntival {ojo}',  'Extracción de cuerpo extraño subconjuntival.', false)
ON CONFLICT (codigo_practica) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_total int;
  v_ptery int;
  v_vacio int;
BEGIN
  SELECT count(*) INTO v_total FROM public.presupuestos_diagnosticos;
  SELECT count(*) INTO v_ptery FROM public.presupuestos_diagnosticos WHERE diagnostico ILIKE 'Pterigi%';
  SELECT count(*) INTO v_vacio FROM public.presupuestos_diagnosticos
   WHERE length(btrim(diagnostico)) = 0 OR length(btrim(solicitud)) = 0;

  IF v_total < 26 THEN RAISE EXCEPTION 'ABORTA: quedaron % diagnósticos, se esperaban 26', v_total; END IF;
  IF v_ptery <> 4 THEN RAISE EXCEPTION 'ABORTA: los pterigiones son %, deberían ser 4 (030408/09/10/11)', v_ptery; END IF;
  IF v_vacio > 0 THEN RAISE EXCEPTION 'ABORTA: % fila(s) con diagnóstico o solicitud vacíos', v_vacio; END IF;

  RAISE NOTICE 'diagnósticos cargados: % (de 136 prácticas 03xxxx del catálogo)', v_total;
  RAISE NOTICE 'El resto sigue imprimiendo el renglón EN BLANCO, a propósito.';
END $$;
