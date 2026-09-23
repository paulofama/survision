-- ============================================================
-- Migración 52 — diagnósticos PROPUESTOS (cargados apagados) + nota interna
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- POR QUÉ APAGADOS
-- ----------------
-- Las migraciones 48 y 49 sólo cargaron los diagnósticos que el nombre de la
-- práctica dice literalmente: 26 de 136. Quedaron 499 presupuestos que
-- imprimen el renglón en blanco, y el grueso está en prácticas cuya indicación
-- NO se puede deducir del nombre.
--
-- Antes de escribir nada se buscó el dato real en GECLISA. No está:
--
--   LibQuiEnca (libro quirúrgico) ....... 0 filas, no lo usan
--   MovEnca.Me_Diagnostico .............. 1 de 44.504 atenciones desde 2024
--   MoviEncaDiagnosticos ................ 4 filas
--   DiagnosticosResumen ................. 0 filas
--   RecetasEnca.Diagnostico ............. 18 filas en total
--
-- O sea que la indicación de cada práctica no existe en ningún lado del
-- sistema: no hay de dónde deducirla, hay que decidirla.
--
-- Esta migración carga cuatro diagnósticos PROPUESTOS, con `activo = false`.
-- Un diagnóstico apagado NO SE IMPRIME: `cargarDiagnosticoPractica` filtra por
-- activo, así que el pedido sigue saliendo con el renglón en blanco hasta que
-- alguien los lea en la pantalla y los active. La propuesta ahorra tipeo, no
-- reemplaza la revisión.
--
-- El criterio para proponer es más angosto que "me parece": sólo prácticas
-- cuyo procedimiento tiene UNA indicación, deducible de qué ES el
-- procedimiento, no de qué tiene el paciente. `nota_interna` deja escrito de
-- dónde sale cada uno y cuál es la duda, para que quien revise no tenga que
-- adivinar qué estaba pensando el que lo propuso.
--
-- LO QUE NO SE PROPONE, Y NO ES OLVIDO
-- ------------------------------------
--   030601  Avastin intravítreo ............. 189 presupuestos
--   030003  Fotocoagulación láser diodo ......  27
--   030403  Cross linking ....................   9
--   030611  Kenacort subtenoniano ............   7
--   030004  Pan fotocoagulación ..............   6
--   030001  Yag iridectomía ..................   6
--
-- Todas tienen VARIAS indicaciones posibles y la correcta depende del
-- paciente, no de la práctica: un Avastin puede ser por DMAE, edema macular
-- diabético u oclusión venosa. Una sola fila no alcanza para representarlas;
-- necesitan elegir al imprimir, entre opciones que defina el médico.
-- ============================================================

BEGIN;

ALTER TABLE public.presupuestos_diagnosticos
  ADD COLUMN IF NOT EXISTS nota_interna text;

COMMENT ON COLUMN public.presupuestos_diagnosticos.nota_interna IS
  'De dónde salió este diagnóstico y qué duda tiene. No se imprime: es para '
  'quien revisa. En las filas propuestas (activo=false) dice qué hay que '
  'confirmar antes de activarlas.';

INSERT INTO public.presupuestos_diagnosticos
  (codigo_practica, diagnostico, solicitud, lleva_lio, activo, nota_interna) VALUES

  -- 91 presupuestos. Una capsulotomía Yag abre la cápsula posterior que se
  -- opacificó después de una cirugía de catarata: es lo que ES el
  -- procedimiento, no una conjetura sobre el paciente.
  ('030002', 'Opacidad de cápsula posterior {ojo}',
             'Capsulotomía con láser Yag.', false, false,
   'PROPUESTO, sin revisar. La capsulotomía Yag trata la opacificación de la cápsula posterior (catarata secundaria) posterior a cirugía de catarata. Confirmar la redacción: algunos prefieren "Catarata secundaria".'),

  -- 36 presupuestos. "Mininuc" es una técnica de extracción de catarata por
  -- incisión pequeña manual.
  ('030510', 'Catarata {ojo}',
             'Cirugía de catarata por incisión pequeña manual.', true, false,
   'PROPUESTO, sin revisar. "Mininuc" figura así en el catálogo, sin decir catarata. Confirmar dos cosas: que es cirugía de catarata, y si lleva lente intraocular (quedó marcado que SÍ).'),

  -- 16 presupuestos. Acá el nombre de la práctica ya nombra la patología; se
  -- escapó del barrido de la migración 49 porque la lista de palabras no
  -- tenía "lesión de párpado".
  ('030301', 'Lesión de párpado {ojo}',
             'Escisión de lesión de párpado.', false, false,
   'PROPUESTO, sin revisar. Repite lo que dice el nombre de la práctica. Si la obra social pide la lesión específica (chalazión, nevus, quiste, papiloma), esto no alcanza y hay que elegir.'),

  -- 6 presupuestos. La trabeculoplastia es un procedimiento de glaucoma.
  ('030201', 'Glaucoma {ojo}',
             'Trabeculoplastia selectiva con láser (SLT).', false, false,
   'PROPUESTO, sin revisar. La SLT es un procedimiento de glaucoma. Duda real: también se indica en hipertensión ocular sin glaucoma, y ahí el diagnóstico sería otro.')

ON CONFLICT (codigo_practica) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_total    int;
  v_activos  int;
  v_propues  int;
  v_sin_nota int;
BEGIN
  SELECT count(*) INTO v_total   FROM public.presupuestos_diagnosticos;
  SELECT count(*) INTO v_activos FROM public.presupuestos_diagnosticos WHERE activo;
  SELECT count(*) INTO v_propues FROM public.presupuestos_diagnosticos WHERE NOT activo;
  SELECT count(*) INTO v_sin_nota FROM public.presupuestos_diagnosticos
   WHERE NOT activo AND (nota_interna IS NULL OR length(btrim(nota_interna)) = 0);

  IF v_activos <> 26 THEN
    RAISE EXCEPTION 'ABORTA: los activos pasaron de 26 a % — una propuesta se cargó encendida', v_activos;
  END IF;
  IF v_propues <> 4 THEN
    RAISE EXCEPTION 'ABORTA: quedaron % propuestas, se esperaban 4', v_propues;
  END IF;
  IF v_sin_nota > 0 THEN
    RAISE EXCEPTION 'ABORTA: % propuesta(s) sin explicar de dónde salen', v_sin_nota;
  END IF;

  RAISE NOTICE '% diagnósticos: % activos (se imprimen) + % propuestos (NO se imprimen).', v_total, v_activos, v_propues;
END $$;
