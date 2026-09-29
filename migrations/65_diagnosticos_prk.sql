-- ============================================================
-- Migración 65 — Excimer láser PRK
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Cinco códigos que son la misma cirugía refractiva y se diferencian sólo
-- por el cirujano y por si es uno o los dos ojos:
--
--   030101  PRK unilateral (Dr. Mercado) .... 2 presupuestos
--   030102  PRK bilateral  (Dr. Mercado) .... 6
--   030103  PRK unilateral (Dr. Roca) ....... 7
--   030104  PRK bilateral  (Dr. Roca) ....... 7
--   030106  PRK bilateral  (Dr. Mahía) ...... 2
--
-- Las tres indicaciones las dio la Dirección el 29/09/2026: miopía,
-- astigmatismo e hipermetropía. Van a la tabla de OPCIONES porque cuál
-- corresponde depende del paciente, no de la práctica — igual que la
-- intravítrea. Se elige al aceptar el presupuesto.
--
-- El cirujano NO cambia el diagnóstico, así que los cinco códigos llevan las
-- mismas tres opciones. Lo único que cambia entre ellos es la solicitud:
-- unilateral o bilateral.
--
-- LO QUE NO ENTRA ACÁ
-- -------------------
-- Las dos ICL (030107 y 030113, 4 presupuestos) también son cirugía
-- refractiva, pero su nombre ya trae la indicación —"esférica miópica e
-- hipermetrópica", "tórico miópica"— y conviene decidirlas mirando eso, no
-- de arrastre con el PRK.
-- ============================================================

BEGIN;

INSERT INTO public.presupuestos_diagnostico_opciones
  (codigo_practica, diagnostico, solicitud, lleva_lio, orden, created_by, nota_interna)
SELECT p.codigo, o.diagnostico, p.solicitud, false, o.orden, 'migracion_65',
       'Indicaciones dadas por la Dirección el 29/09/2026.'
  FROM (VALUES
    ('030101', 'Excimer láser PRK, unilateral.'),
    ('030102', 'Excimer láser PRK, bilateral.'),
    ('030103', 'Excimer láser PRK, unilateral.'),
    ('030104', 'Excimer láser PRK, bilateral.'),
    ('030106', 'Excimer láser PRK, bilateral.')
  ) AS p(codigo, solicitud)
  CROSS JOIN (VALUES
    ('Miopía {ojo}', 1::smallint),
    ('Astigmatismo {ojo}', 2::smallint),
    ('Hipermetropía {ojo}', 3::smallint)
  ) AS o(diagnostico, orden)
ON CONFLICT (codigo_practica, diagnostico) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_opciones integer;
  v_practicas integer;
  v_choque integer;
  v_solas integer;
  v_cubiertos integer;
  v_total integer;
BEGIN
  SELECT count(*), count(DISTINCT codigo_practica) INTO v_opciones, v_practicas
    FROM public.presupuestos_diagnostico_opciones
   WHERE created_by = 'migracion_65' AND activo;
  IF v_opciones <> 15 OR v_practicas <> 5 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 15 opciones en 5 prácticas, hay % en %', v_opciones, v_practicas;
  END IF;

  SELECT count(*) INTO v_choque
    FROM public.presupuestos_diagnostico_opciones o
    JOIN public.presupuestos_diagnosticos d ON d.codigo_practica = o.codigo_practica
   WHERE o.activo AND d.activo;
  IF v_choque > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con diagnóstico único Y opciones activas', v_choque;
  END IF;

  SELECT count(*) INTO v_solas FROM (
    SELECT codigo_practica FROM public.presupuestos_diagnostico_opciones
     WHERE activo GROUP BY codigo_practica HAVING count(*) < 2) q;
  IF v_solas > 0 THEN
    RAISE EXCEPTION 'ABORTA: % práctica(s) con una sola opción', v_solas;
  END IF;

  SELECT count(*) FILTER (WHERE
           EXISTS (SELECT 1 FROM public.presupuestos_diagnosticos d
                    WHERE d.codigo_practica = p.prestacion_codigo AND d.activo)
        OR EXISTS (SELECT 1 FROM public.presupuestos_diagnostico_opciones o
                    WHERE o.codigo_practica = p.prestacion_codigo AND o.activo)),
         count(*)
    INTO v_cubiertos, v_total
    FROM public.presupuestos p
   WHERE p.prestacion_codigo IS NOT NULL AND p.prestacion_codigo <> '';

  RAISE NOTICE 'PRK cargado. Diagnósticos: % de % presupuestos (%%%).',
    v_cubiertos, v_total, round(v_cubiertos * 100.0 / NULLIF(v_total, 0), 1);
END $$;
