-- ============================================================
-- 80 · Verificar contra GECLISA los presupuestos marcados practicados a mano
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- PROBLEMA
--   De 732 presupuestos en estado 'practicado', 532 se marcaron con el botón
--   "Marcar como practicado" y nunca se cruzaron con lo facturado: el motor de
--   match (matchPracticasService.js) sólo mira los 'entregado', así que lo que
--   alguien marcaba a mano quedaba fuera del cruce para siempre, ni confirmado
--   ni descartado.
--   El informe de presupuestos cuenta como CONVERTIDO sólo lo confirmado
--   contra GECLISA (decisión de Paulo). Sin esta verificación el ranking
--   contaría 200 operaciones de 732 y castigaría a quien marcó a mano, sobre
--   todo sep-2025 a jun-2026, cuando el cruce todavía no existía.
--
-- DIAGNÓSTICO (solo lectura, 30/10/2026) sobre los 532:
--   280 una sola práctica que coincide (DNI + código o alias + fecha ≥ presup.)
--    39 varias prácticas el mismo día (ambos ojos / renglones del mismo acto)
--   121 varias prácticas, una en la fecha que se marcó a mano (series 030601)
--    25 varias prácticas, ninguna en la fecha marcada
--    55 el paciente tiene prácticas pero de otro código
--    10 mismo código, pero ANTES del presupuesto
--     2 paciente sin movimientos en GECLISA
--
-- QUÉ HACE (sólo inserta en presupuestos_practica_match; NO toca presupuestos)
--   1. CONFIRMADO, con la misma regla del motor más la fecha marcada:
--        - una sola práctica                     -> confianza 'unica'
--        - varias, todas el mismo día            -> la de atencion_id menor
--        - varias, una en la fecha marcada a mano -> esa
--      (las dos últimas con confianza 'ambigua'). Hoy: 439.
--      No se confirma solo si el presupuesto tiene resultado RECHAZADO,
--      SIN_RESPUESTA o ANULADO (sería contradictorio: P-2026-804), ni si ya
--      tenía filas de match: igual que el motor.
--   2. SUGERIDO, todo lo demás que tenga candidatos (hoy 26 presupuestos): va
--      a la pantalla de revisión de matches que ya existe.
--   3. Los que no tienen candidato (hoy 67) quedan como están: practicados
--      sin respaldo en GECLISA. El informe los muestra aparte.
--
--   La fecha de la cirugía para el informe es la de GECLISA, guardada en
--   `presupuestos_practica_match.fecha_practica`. La de presupuestos no se
--   pisa: en 207 de 233 coincide y la diferencia queda a la vista.
--
-- MARCA: revisado_por = 'verificacion_practicados' en todas las filas que
--   inserta (en las sugeridas, revisado_at queda NULL: nadie las revisó
--   todavía; la pantalla de revisión pisa revisado_por al decidir).
--
-- DE AHORA EN MÁS el motor también cruza los practicados a mano (mismo
--   commit), así esto no se vuelve a acumular.
--
-- IDEMPOTENTE: sólo considera presupuestos sin match confirmado y sin filas,
--   e inserta con ON CONFLICT (presupuesto_id, atencion_id) DO NOTHING.
-- ATÓMICA: una transacción. RLS: la tabla ya tiene su política (migración
--   28); no se crean objetos nuevos.
-- REVERSIÓN: 80_verificar_practicados_a_mano_revert.sql
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS _v80_cand;
CREATE TEMP TABLE _v80_cand ON COMMIT DROP AS
WITH pres AS (
  SELECT p.id, p.fecha_creacion::date AS fc, p.fecha_practica AS fp,
         trim(coalesce(p.prestacion_codigo, '')) AS cod,
         regexp_replace(regexp_replace(coalesce(p.paciente_documento, ''), '\D', '', 'g'), '^0+', '') AS dn,
         coalesce(p.resultado IN ('RECHAZADO', 'SIN_RESPUESTA', 'ANULADO'), false) AS bloquea
  FROM public.presupuestos p
  WHERE p.estado = 'practicado'
    AND NOT EXISTS (SELECT 1 FROM public.presupuestos_practica_match x
                    WHERE x.presupuesto_id = p.id)
),
equiv AS (
  SELECT id, cod AS c FROM pres
  UNION
  SELECT p.id, trim(a.codigo_realizado)
  FROM pres p
  JOIN public.presupuestos_match_codigos a
    ON a.activo AND trim(a.codigo_presupuesto) = p.cod
),
mov AS (
  SELECT m.atencion_id, trim(m.practica_codigo) AS c, m.fecha,
         m.practica_nombre, m.prestador_nombre,
         regexp_replace(regexp_replace(coalesce(m.paciente_documento, ''), '\D', '', 'g'), '^0+', '') AS dn
  FROM public.movimientos_geclisa m
  WHERE trim(m.practica_codigo) IN (SELECT c FROM equiv)
),
cand AS (
  -- Una fila por atención; si la atención trae varios renglones, la fecha menor
  -- (igual que el motor).
  SELECT DISTINCT ON (p.id, m.atencion_id)
         p.id AS presupuesto_id, p.fp, p.bloquea,
         m.atencion_id, m.c AS codigo_realizado, m.practica_nombre,
         m.prestador_nombre, m.fecha
  FROM pres p
  JOIN equiv e ON e.id = p.id
  JOIN mov m ON m.c = e.c AND m.dn = p.dn AND m.fecha >= p.fc
  WHERE p.dn <> ''
  ORDER BY p.id, m.atencion_id, m.fecha
),
resumen AS (
  SELECT presupuesto_id,
         count(*) AS n,
         count(DISTINCT fecha) AS nd,
         count(*) FILTER (WHERE fecha = fp) AS nfp
  FROM cand
  GROUP BY presupuesto_id
),
elegido AS (
  -- La atención que respalda la marca manual. Ante empate, atencion_id menor.
  SELECT DISTINCT ON (c.presupuesto_id) c.presupuesto_id, c.atencion_id
  FROM cand c
  JOIN resumen r USING (presupuesto_id)
  WHERE NOT c.bloquea
    AND (r.n = 1 OR r.nd = 1 OR (r.nfp >= 1 AND c.fecha = c.fp))
  ORDER BY c.presupuesto_id, c.atencion_id
)
SELECT c.*, r.n,
       (e.atencion_id IS NOT NULL) AS es_elegido,
       (c.presupuesto_id IN (SELECT presupuesto_id FROM elegido)) AS presupuesto_resuelto
FROM cand c
JOIN resumen r USING (presupuesto_id)
LEFT JOIN elegido e USING (presupuesto_id, atencion_id);

-- 1. Confirmados por regla.
INSERT INTO public.presupuestos_practica_match
  (presupuesto_id, atencion_id, codigo_realizado, practica_nombre, prestador_nombre,
   fecha_practica, estado, confianza, auto, revisado_por, revisado_at)
SELECT presupuesto_id, atencion_id, codigo_realizado, practica_nombre, prestador_nombre,
       fecha, 'confirmado', CASE WHEN n = 1 THEN 'unica' ELSE 'ambigua' END, true,
       'verificacion_practicados', now()
FROM _v80_cand
WHERE es_elegido
ON CONFLICT (presupuesto_id, atencion_id) DO NOTHING;

-- 2. Sugeridos: los presupuestos sin una atención elegida van a revisión.
INSERT INTO public.presupuestos_practica_match
  (presupuesto_id, atencion_id, codigo_realizado, practica_nombre, prestador_nombre,
   fecha_practica, estado, confianza, auto, revisado_por)
SELECT presupuesto_id, atencion_id, codigo_realizado, practica_nombre, prestador_nombre,
       fecha, 'sugerido', CASE WHEN n = 1 THEN 'unica' ELSE 'ambigua' END, false,
       'verificacion_practicados'
FROM _v80_cand
WHERE NOT presupuesto_resuelto
ON CONFLICT (presupuesto_id, atencion_id) DO NOTHING;

-- Verificación
DO $$
DECLARE
  v_conf int; v_sug int; v_dobles int; v_sin int;
BEGIN
  SELECT count(*) INTO v_conf FROM public.presupuestos_practica_match
   WHERE revisado_por = 'verificacion_practicados' AND estado = 'confirmado';
  SELECT count(DISTINCT presupuesto_id) INTO v_sug FROM public.presupuestos_practica_match
   WHERE revisado_por = 'verificacion_practicados' AND estado = 'sugerido';
  SELECT count(*) INTO v_dobles FROM (
    SELECT presupuesto_id FROM public.presupuestos_practica_match
     WHERE estado = 'confirmado' GROUP BY presupuesto_id HAVING count(*) > 1) d;
  SELECT count(*) INTO v_sin FROM public.presupuestos p
   WHERE p.estado = 'practicado'
     AND NOT EXISTS (SELECT 1 FROM public.presupuestos_practica_match x WHERE x.presupuesto_id = p.id);

  IF v_dobles > 0 THEN
    RAISE EXCEPTION 'FALLO 80: % presupuestos con más de un match confirmado', v_dobles;
  END IF;
  IF v_conf = 0 THEN
    RAISE EXCEPTION 'FALLO 80: no se confirmó ningún practicado a mano';
  END IF;
  RAISE NOTICE 'OK 80: % confirmados, % presupuestos a revisión, % practicados sin respaldo en GECLISA.',
    v_conf, v_sug, v_sin;
END $$;

COMMIT;
