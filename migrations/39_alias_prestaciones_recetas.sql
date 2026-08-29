-- ============================================================================
-- MIGRACIÓN 39 — Alias de prestaciones facturadas ↔ recetas de costos
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================================
--
-- QUÉ RESUELVE
-- ------------
-- El Análisis Marginal calcula el costo variable de cada prestación buscando su
-- receta por nombre normalizado (minúsculas, sin acentos, sin puntuación). Si el
-- nombre que factura GECLISA no coincide exacto con el de la receta, la práctica
-- queda SIN receta y se computa con pools = 0 e insumos = 0: su margen de
-- contribución sale inflado y el informe de gestión lo muestra como si fuera
-- rentabilidad real.
--
-- La tabla `prestaciones_nombre_mapping` existe para eso — el hook
-- `useNombreMapping.agregarAliases()` la aplica sobre el mapa de recetas antes de
-- resolver cada prestación — pero solo tenía 20 alias cargados.
--
-- Auditoría del 18/08/2026 sobre la facturación de enero–junio 2026:
--   facturado del período .................. $656.547.960 (9.203 prestaciones)
--   sin receta que respalde su costo ....... $310.418.999 = 47,3%
--
-- El caso más grave era Exoftalmología: 5.179 prestaciones y $183.905.500, el 28%
-- de la facturación del semestre, computando insumos en cero. La receta SÍ estaba
-- cargada, pero se llama "EXO OFTALMOLOGÍA" (normaliza a `exooftalmologia`) contra
-- el "Exoftalmologia" de GECLISA (`exoftalmologia`): difieren en una sola letra.
--
-- QUÉ HACE
-- --------
-- Carga 13 alias verificados uno por uno. Solo los casos donde la receta candidata
-- es inequívoca por nombre. NO incluye:
--   - Los que requieren criterio clínico (bloque B del informe de alias). El más
--     pesado es "Inyeccion Intravitrea de anti angiogenicos": según se elija
--     AVASTIN ($52.445) o EYLIA ($1.412.416) el costo del semestre va de $4,2 M a
--     $114,4 M. Esa decisión no se toma en una migración.
--   - Los que no tienen receta equivalente y hay que crearla (bloque C):
--     Topografía Corneal, Sondaje Lagrimal, Toma de Presión, SLT, etc.
--
-- IMPACTO ESPERADO
-- ----------------
-- Costo de pools + insumos que hoy se computa como cero y pasa a contarse:
-- ~$17.678.329 en el semestre ene–jun 2026. Para dimensionar: el informe computa
-- hoy $37.664.354 de pools + insumos en todo ese período, así que esto lo
-- aumenta cerca de un 50%.
--
-- ⚠️ El margen de contribución del Análisis Marginal VA A BAJAR después de aplicar
-- esto. No es una regresión: es que hasta ahora estaba sobreestimado.
--
-- SEGURIDAD Y REVERSIÓN
-- ---------------------
-- Idempotente: `WHERE NOT EXISTS` en vez de `ON CONFLICT`, porque la tabla es del
-- sistema viejo (se creó fuera de migrations/) y no se puede asumir que tenga una
-- restricción única sobre `nombre_geclisa`.
-- Atómica: BEGIN/COMMIT con verificación previa y posterior; si algo no cuadra,
-- lanza excepción y no se aplica nada.
-- Reversible: al final de este archivo hay un bloque de rollback comentado.
-- No toca recetas, insumos, pools ni ninguna prestación facturada: solo agrega
-- filas de traducción de nombres.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Pares a cargar
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_alias_39 (
  nombre_geclisa text NOT NULL,
  nombre_receta  text NOT NULL,
  nota           text
) ON COMMIT DROP;

INSERT INTO tmp_alias_39 (nombre_geclisa, nombre_receta, nota) VALUES
  ('Exoftalmologia',
   'EXO OFTALMOLOGÍA',
   '5.179 prest · $183.905.500 en el semestre. Difieren en una letra (exoftalmologia / exooftalmologia).'),

  ('Implante Secundario de Lio Suturado o esclera o Iris',
   'IMPLANTE SECUNDARIO DE LIO SUTURADO A ESCLERA O IRIS (INCLUYE VITRECTOMÍA)',
   'Mismo procedimiento, la receta agrega "(INCLUYE VITRECTOMÍA)".'),

  ('Entropion Simple Involucional',
   'Entropion',
   'La receta usa el nombre corto.'),

  ('Limpieza de Glandulas de Meibomio',
   'LIMPIEZA DE GLÁNDULA DE MEIBOMIO (BILATERAL)',
   'Singular/plural y sufijo de lateralidad.'),

  ('Sutura de Conjuntiva UNILATERAL',
   'SUTURA DE CONJUNTIVA',
   'La receta no discrimina lateralidad.'),

  ('Yag Laser - Iridectomia',
   'YAG LASER - IRIDOTOMÍA',
   'Iridectomía/iridotomía por YAG: mismo acto. Las dos recetas YAG cuestan igual ($2.998).'),

  ('Control de Cirugia',
   'CONTROL DE CIRUGÍA (SIN CARGO)',
   '610 prestaciones en el semestre.'),

  ('Fondo de Ojos Prematuras',
   'FONDO DE OJOS',
   'Sin facturación en ene-jun 2026, sí en el histórico.'),

  ('Inyeccion Intravitrea sin Farmaco',
   'INYECCIÓN INTRAVÍTREA SIN FÁRMACO (EYLIA)',
   'Sin fármaco: la variante es indistinta para el costo.'),

  ('Inyeccion Intravitrea no Incluya farmaco',
   'INYECCIÓN INTRAVÍTREA SIN FÁRMACO (EYLIA)',
   'Segunda redacción del mismo concepto en GECLISA.'),

  ('Iridotomia - Iridoplastia',
   'YAG LASER - IRIDOTOMÍA',
   'Sin facturación en ene-jun 2026.'),

  ('Herida Perforante con lesion de Cornea, Esclera; Iris y/o Cirstalino',
   'HERIDA PERFORANTE CON LESIÓN DE CÓRNEA, ESCLERA, IRIS Y/O CRISTALINO',
   'GECLISA tiene el typo "Cirstalino" y usa ";" donde la receta usa ",".'),

  ('Extraccion Cuerpo Extraño',
   'EXTRACCIÓN DE CUERPO EXTRAÑO CORNEAL (EN CONSULTORIO)',
   'Nombre genérico en GECLISA. Se asume consultorio; si en la práctica se hace en guardia, cambiar por la receta (EN GUARDIA) — cuestan lo mismo ($2.998).');

-- ---------------------------------------------------------------------------
-- 2. Verificación PREVIA — que no se aplique nada si un supuesto falla
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  faltan_recetas   text;
  n_faltan         integer;
BEGIN
  -- 2.a Toda receta referenciada debe existir. Un alias que apunta a una receta
  --     inexistente no rompe nada visible: simplemente no resuelve y la práctica
  --     sigue computando cero. Es peor que no cargarlo, porque da la falsa
  --     sensación de estar resuelto.
  SELECT count(*), string_agg(t.nombre_receta, ' | ')
    INTO n_faltan, faltan_recetas
  FROM tmp_alias_39 t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.practicas_recetas r WHERE r.nombre_practica = t.nombre_receta
  );

  IF n_faltan > 0 THEN
    RAISE EXCEPTION 'FALLO 39: % receta(s) referenciada(s) no existen en practicas_recetas: %',
      n_faltan, faltan_recetas;
  END IF;

  RAISE NOTICE 'OK 39 (previa): las % recetas referenciadas existen.', (SELECT count(*) FROM tmp_alias_39);
END $$;

-- ---------------------------------------------------------------------------
-- 3. Carga idempotente
-- ---------------------------------------------------------------------------
INSERT INTO public.prestaciones_nombre_mapping (nombre_geclisa, nombre_receta)
SELECT t.nombre_geclisa, t.nombre_receta
FROM tmp_alias_39 t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.prestaciones_nombre_mapping m
  WHERE m.nombre_geclisa = t.nombre_geclisa
);

-- ---------------------------------------------------------------------------
-- 4. Verificación POSTERIOR
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_esperados integer;
  n_presentes integer;
  n_total     integer;
  n_huerfanos integer;
BEGIN
  SELECT count(*) INTO n_esperados FROM tmp_alias_39;

  SELECT count(*) INTO n_presentes
  FROM tmp_alias_39 t
  JOIN public.prestaciones_nombre_mapping m
    ON m.nombre_geclisa = t.nombre_geclisa
   AND m.nombre_receta  = t.nombre_receta;

  IF n_presentes <> n_esperados THEN
    RAISE EXCEPTION 'FALLO 39: se esperaban % alias cargados y hay %. Puede existir un alias previo con el mismo nombre_geclisa apuntando a otra receta.',
      n_esperados, n_presentes;
  END IF;

  -- Ningún alias de la tabla debe apuntar a una receta inexistente (incluye los
  -- 20 que ya estaban): si aparece alguno, es un problema previo a esta migración
  -- y conviene saberlo, pero no la bloquea.
  SELECT count(*) INTO n_huerfanos
  FROM public.prestaciones_nombre_mapping m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.practicas_recetas r WHERE r.nombre_practica = m.nombre_receta
  );

  SELECT count(*) INTO n_total FROM public.prestaciones_nombre_mapping;

  RAISE NOTICE 'OK 39: % alias verificados. Total en la tabla: %.', n_presentes, n_total;
  IF n_huerfanos > 0 THEN
    RAISE WARNING 'ATENCIÓN 39: % alias de la tabla apuntan a recetas inexistentes (preexistentes, no los cargó esta migración).', n_huerfanos;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN MANUAL (correr después, opcional)
-- ============================================================================
-- Cuántas prestaciones facturadas quedan todavía sin receta:
--
--   WITH norm AS (
--     SELECT lower(regexp_replace(unaccent(m.practica_nombre), '[^a-zA-Z0-9]', '', 'g')) AS k,
--            count(*) AS prestaciones, sum(m.total) AS facturado
--     FROM movimientos_geclisa m
--     WHERE m.es_principal AND m.anio = 2026 AND m.mes BETWEEN 1 AND 6
--     GROUP BY 1
--   ), recetas AS (
--     SELECT lower(regexp_replace(unaccent(r.nombre_practica), '[^a-zA-Z0-9]', '', 'g')) AS k
--     FROM practicas_recetas r
--     UNION
--     SELECT lower(regexp_replace(unaccent(a.nombre_geclisa), '[^a-zA-Z0-9]', '', 'g'))
--     FROM prestaciones_nombre_mapping a
--   )
--   SELECT sum(n.facturado) AS facturado_sin_receta
--   FROM norm n LEFT JOIN recetas r USING (k)
--   WHERE r.k IS NULL;
--
-- Antes de esta migración: $310.418.999.  (requiere la extensión `unaccent`)
--
-- ============================================================================
-- ROLLBACK (si hace falta revertir)
-- ============================================================================
-- BEGIN;
-- DELETE FROM public.prestaciones_nombre_mapping
-- WHERE (nombre_geclisa, nombre_receta) IN (
--   ('Exoftalmologia', 'EXO OFTALMOLOGÍA'),
--   ('Implante Secundario de Lio Suturado o esclera o Iris', 'IMPLANTE SECUNDARIO DE LIO SUTURADO A ESCLERA O IRIS (INCLUYE VITRECTOMÍA)'),
--   ('Entropion Simple Involucional', 'Entropion'),
--   ('Limpieza de Glandulas de Meibomio', 'LIMPIEZA DE GLÁNDULA DE MEIBOMIO (BILATERAL)'),
--   ('Sutura de Conjuntiva UNILATERAL', 'SUTURA DE CONJUNTIVA'),
--   ('Yag Laser - Iridectomia', 'YAG LASER - IRIDOTOMÍA'),
--   ('Control de Cirugia', 'CONTROL DE CIRUGÍA (SIN CARGO)'),
--   ('Fondo de Ojos Prematuras', 'FONDO DE OJOS'),
--   ('Inyeccion Intravitrea sin Farmaco', 'INYECCIÓN INTRAVÍTREA SIN FÁRMACO (EYLIA)'),
--   ('Inyeccion Intravitrea no Incluya farmaco', 'INYECCIÓN INTRAVÍTREA SIN FÁRMACO (EYLIA)'),
--   ('Iridotomia - Iridoplastia', 'YAG LASER - IRIDOTOMÍA'),
--   ('Herida Perforante con lesion de Cornea, Esclera; Iris y/o Cirstalino', 'HERIDA PERFORANTE CON LESIÓN DE CÓRNEA, ESCLERA, IRIS Y/O CRISTALINO'),
--   ('Extraccion Cuerpo Extraño', 'EXTRACCIÓN DE CUERPO EXTRAÑO CORNEAL (EN CONSULTORIO)')
-- );
-- COMMIT;
