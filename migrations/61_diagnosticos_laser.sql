-- ============================================================
-- Migración 61 — Láser, cross linking, Kenacort e iridotomía
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Las seis prácticas que la migración 52 dejó explícitamente sin proponer
-- porque tenían varias indicaciones posibles. Las indicaciones las dio la
-- Dirección el 27/09/2026, así que entran ACTIVAS: no son una propuesta a
-- revisar, son la respuesta de quien indica.
--
-- CADA UNA VA DONDE CORRESPONDE, Y NO ES LO MISMO
-- -----------------------------------------------
-- Dos prácticas terminaron teniendo UNA sola indicación. Ésas NO van a la
-- tabla de opciones: van a `presupuestos_diagnosticos` como diagnóstico
-- único, y el modal de aceptación no muestra ningún menú. Meter una opción
-- sola en la tabla de opciones obligaría a elegir entre una cosa, que es un
-- clic que no decide nada — y un clic que no decide nada se aprende a
-- apretar sin leer.
--
--   A OPCIONES (varias indicaciones, se elige al aceptar):
--     030003  Fotocoagulación láser diodo, 1 sesión ....... 28 presup.
--     030004  Pan fotocoagulación láser diodo .............  6
--     030611  Kenacort subtenoniano .......................  7
--
--   A DIAGNÓSTICO ÚNICO (una indicación, sin menú):
--     030403  Cross linking ...............................  9
--     030001  Yag láser - iridectomía .....................  6
--     030006  Iridotomía - iridoplastia ...................  4
--
-- Con esto quedan cubiertos 60 presupuestos más. Sumados a los 197 de la
-- intravítrea (migración 60), son 257 pedidos que dejan de imprimir el
-- renglón del diagnóstico en blanco.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Las de varias indicaciones
-- ------------------------------------------------------------
-- La fotocoagulación comparte las cuatro indicaciones entre la sesión suelta
-- y el tratamiento completo: lo que cambia es la extensión del tratamiento,
-- no por qué se hace.
INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by)
SELECT p.codigo, o.diagnostico, p.solicitud, false, o.orden, 'migracion_61'
  FROM (VALUES
    ('030003', 'Fotocoagulación con láser diodo.'),
    ('030004', 'Pan fotocoagulación con láser diodo, tratamiento completo.')
  ) AS p(codigo, solicitud)
  CROSS JOIN (VALUES
    ('Retinopatía diabética proliferativa {ojo}', 1::smallint),
    ('Retinopatía diabética no proliferativa severa {ojo}', 2::smallint),
    ('Oclusión venosa de retina {ojo}', 3::smallint),
    ('Desgarro o lesión predisponente de retina {ojo}', 4::smallint)
  ) AS o(diagnostico, orden)
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by)
VALUES
  ('030611', 'Edema macular {ojo}', 'Inyección subtenoniana de triamcinolona.', false, 1, 'migracion_61'),
  ('030611', 'Uveítis {ojo}',       'Inyección subtenoniana de triamcinolona.', false, 2, 'migracion_61')
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Las de una sola indicación
-- ------------------------------------------------------------
INSERT INTO public.presupuestos_diagnosticos
  (codigo_practica, diagnostico, solicitud, lleva_lio, activo, nota_interna)
VALUES
  ('030403', 'Queratocono progresivo {ojo}',
   'Cross linking corneal.', false, true,
   'Indicación dada por la Dirección el 27/09/2026. El cross linking frena la progresión del queratocono; se evaluó agregar la ectasia post-cirugía refractiva como segunda opción y se decidió dejar una sola.'),

  ('030001', 'Glaucoma de ángulo estrecho {ojo}',
   'Iridectomía con láser Yag.', false, true,
   'Indicación dada por la Dirección el 27/09/2026. La iridectomía se hace para abrir el ángulo; se evaluó distinguir el cierre angular agudo y se decidió una sola indicación.'),

  ('030006', 'Glaucoma de ángulo estrecho {ojo}',
   'Iridotomía o iridoplastia con láser.', false, true,
   'Indicación dada por la Dirección el 27/09/2026. Misma indicación que 030001; cambia la técnica, no el motivo.')
ON CONFLICT (codigo_practica) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_opciones integer;
  v_unicos integer;
  v_choque integer;
  v_huerfanas integer;
BEGIN
  SELECT count(*) INTO v_opciones FROM public.presupuestos_diagnostico_opciones
   WHERE created_by = 'migracion_61' AND activo;
  IF v_opciones <> 10 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 10 opciones nuevas (4+4+2), hay %', v_opciones;
  END IF;

  SELECT count(*) INTO v_unicos FROM public.presupuestos_diagnosticos
   WHERE codigo_practica IN ('030403', '030001', '030006') AND activo;
  IF v_unicos <> 3 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 3 diagnósticos únicos activos, hay %', v_unicos;
  END IF;

  -- Una práctica en los dos lados haría que el pedido tuviera que elegir en
  -- silencio cuál imprimir.
  SELECT count(*) INTO v_choque
    FROM public.presupuestos_diagnostico_opciones o
    JOIN public.presupuestos_diagnosticos d ON d.codigo_practica = o.codigo_practica
   WHERE o.activo AND d.activo;
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) tienen diagnóstico único Y opciones a la vez', v_choque;
  END IF;

  -- Ninguna práctica puede quedar con UNA sola opción: obliga a elegir entre
  -- una cosa y el clic deja de significar algo.
  SELECT count(*) INTO v_huerfanas FROM (
    SELECT codigo_practica FROM public.presupuestos_diagnostico_opciones
     WHERE activo GROUP BY codigo_practica HAVING count(*) < 2) q;
  IF v_huerfanas > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) quedaron con una sola opción', v_huerfanas;
  END IF;

  RAISE NOTICE 'Láser y compañía: 10 opciones nuevas y 3 diagnósticos únicos.';
END $$;
