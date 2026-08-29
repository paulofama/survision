-- ============================================================================
-- MIGRACIÓN 41 — Normaliza presupuestos.administrativa al username del sistema
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================================
--
-- QUÉ RESUELVE
-- ------------
-- El selector de administrativa del presupuestador se armaba con una lista fija
-- escrita en el código (`ADMINISTRATIVAS` en Presupuestador.tsx). Esa lista es
-- una copia a mano de `usuarios_sistema` y se desincronizó: 4 de los 14 usuarios
-- activos no coincidían con ninguna entrada.
--
-- El autocompletado del usuario logueado buscaba por username o por nombre
-- normalizado contra esa lista; si no encontraba, caía a un fallback que
-- guardaba el username crudo. Resultado: la misma persona podía quedar guardada
-- con dos valores distintos y aparecer partida en dos en cualquier reporte.
--
-- El caso concreto es Nancy: la lista decía "nancy_narambuena" y el usuario del
-- sistema es "nancy_narambue" (una letra de diferencia). Hay 6 presupuestos con
-- el valor viejo; si cargaba uno nuevo, quedaba con el otro.
--
-- Desde 2026-08-20 el selector se arma con `usuarios_sistema` y el valor
-- guardado es el `username`. Esta migración alinea los datos existentes.
--
-- ALCANCE
-- -------
-- 987 presupuestos. 10 de los 12 valores en uso YA coinciden con un username
-- válido y no se tocan. Solo cambian los 6 de Nancy.
--
-- El único registro con valor 'admin' (del 10/02/2026) se deja como está: no
-- existe un usuario 'admin' en el sistema y no corresponde atribuirle el
-- presupuesto a una persona por adivinanza. El frontend lo sigue mostrando
-- como "Admin" vía la tabla de compatibilidad ADMINISTRATIVAS_LEGACY.
--
-- SEGURIDAD
-- ---------
-- Idempotente: si se corre dos veces, la segunda no encuentra filas que cambiar.
-- Atómica: BEGIN/COMMIT con verificación previa y posterior.
-- Reversible: bloque de rollback comentado al final.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Verificación previa: el usuario destino tiene que existir y estar activo
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema
    WHERE username = 'nancy_narambue' AND COALESCE(activo, true)
  ) THEN
    RAISE EXCEPTION 'FALLO 41: no existe el usuario activo nancy_narambue. Revisar usuarios_sistema antes de migrar.';
  END IF;

  RAISE NOTICE 'OK 41 (previa): usuario destino verificado. A migrar: % presupuesto(s).',
    (SELECT count(*) FROM public.presupuestos WHERE administrativa = 'nancy_narambuena');
END $$;

-- ---------------------------------------------------------------------------
-- 2. Normalización
-- ---------------------------------------------------------------------------
UPDATE public.presupuestos
SET administrativa = 'nancy_narambue'
WHERE administrativa = 'nancy_narambuena';

-- `desarrollado_por` se completa con el mismo valor al guardar (ver
-- Presupuestador.tsx), así que se normaliza igual para no dejarlos divergentes.
UPDATE public.presupuestos
SET desarrollado_por = 'nancy_narambue'
WHERE desarrollado_por = 'nancy_narambuena';

-- ---------------------------------------------------------------------------
-- 3. Verificación posterior
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  quedan     integer;
  huerfanos  integer;
  detalle    text;
BEGIN
  SELECT count(*) INTO quedan
  FROM public.presupuestos WHERE administrativa = 'nancy_narambuena';

  IF quedan > 0 THEN
    RAISE EXCEPTION 'FALLO 41: quedaron % presupuestos con el valor viejo.', quedan;
  END IF;

  -- Valores que no corresponden a ningún usuario del sistema. Se espera 1
  -- ('admin'); si aparecen más, conviene revisarlos antes de confiar en los
  -- reportes por administrativa.
  SELECT count(*), string_agg(DISTINCT p.administrativa, ', ')
    INTO huerfanos, detalle
  FROM public.presupuestos p
  WHERE COALESCE(p.administrativa, '') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_sistema u WHERE u.username = p.administrativa
    );

  RAISE NOTICE 'OK 41: normalización aplicada.';
  IF huerfanos > 0 THEN
    RAISE NOTICE 'NOTA 41: % presupuesto(s) con administrativa sin usuario en el sistema (%). Esperado: 1 con ''admin''.',
      huerfanos, detalle;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- UPDATE public.presupuestos SET administrativa = 'nancy_narambuena'
--  WHERE administrativa = 'nancy_narambue';
-- UPDATE public.presupuestos SET desarrollado_por = 'nancy_narambuena'
--  WHERE desarrollado_por = 'nancy_narambue';
-- COMMIT;
