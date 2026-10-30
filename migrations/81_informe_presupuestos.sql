-- ============================================================
-- 81 · Informe de presupuestos: datos con permiso propio
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- QUÉ ES
--   El informe mensual de presupuestos de Informes: ranking de
--   presupuestadoras por monto convertido, cortes por cobertura, cirujano y
--   tiempo a la práctica, conversión por cohorte y cartera de aceptados.
--
-- PERMISO 'informes:presupuestos'
--   Propio, no 'informes': el rol Contabilidad tiene 'informes' y lo usa una
--   presupuestadora (vería su ranking y el de sus compañeras). No se asigna a
--   ningún rol: como app_tiene_permiso() da todo a los admin, hoy lo ve sólo
--   Paulo. Se le puede dar a otro rol desde Gestión de Accesos.
--   Los permisos son filas de `permisos_rol` (texto libre, sin catálogo en la
--   base): no hace falta crear nada para que exista.
--
-- POR QUÉ UNA FUNCIÓN Y NO LECTURAS DIRECTAS
--   Las tablas de presupuestos se leen con el permiso 'presupuestador'. Si el
--   informe leyera directo, a alguien con 'informes:presupuestos' y sin
--   'presupuestador' le saldría vacío y sin error (pasó con la conciliación,
--   migraciones 73/74). La función pide SOLO el permiso del informe y
--   devuelve lo justo: no expone `usuarios_sistema` (tiene password_hash)
--   ni el jsonb completo de los presupuestos.
--   Devuelve un único jsonb: PostgREST corta las respuestas de filas en 1000
--   y hay más de 1000 presupuestos.
--
-- DEFINICIONES (decididas con Paulo, 30/10/2026)
--   convertido   = match confirmado contra GECLISA (presupuestos_practica_match);
--                  su fecha es la de GECLISA. Ver migración 80.
--   monto        = neto que paga el paciente, sin IVA (datos_completos.precios.neto).
--   obra social  = el presupuesto descontó cobertura (precios.coberturaOS > 0).
--   fecha base   = entrega del presupuesto; si no se registró, su creación.
--   Las fechas se pasan a día de Mendoza (America/Argentina/Mendoza).
--
-- IDEMPOTENTE: CREATE OR REPLACE. ATÓMICA. Sin tablas nuevas (RLS sin cambios).
-- REVERSIÓN: 81_informe_presupuestos_revert.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.informe_presupuestos_datos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT public.app_tiene_permiso('informes:presupuestos') THEN
    RAISE EXCEPTION 'No tenés permiso para el informe de presupuestos.'
      USING ERRCODE = '42501';
  END IF;

  WITH conv AS (
    -- Un solo match confirmado por presupuesto (lo garantiza la verificación
    -- de la 80); por las dudas, el más temprano.
    SELECT DISTINCT ON (presupuesto_id) presupuesto_id, fecha_practica
    FROM public.presupuestos_practica_match
    WHERE estado = 'confirmado' AND fecha_practica IS NOT NULL
    ORDER BY presupuesto_id, fecha_practica
  ),
  pres AS (
    SELECT jsonb_build_object(
      'id', p.id,
      'numero', p.numero_presupuesto,
      'fecha_base', coalesce(p.fecha_entrega,
                             (p.fecha_creacion AT TIME ZONE 'America/Argentina/Mendoza')::date),
      'estado', p.estado,
      'resultado', p.resultado,
      'fecha_resultado', (p.fecha_resultado AT TIME ZONE 'America/Argentina/Mendoza')::date,
      'administrativa', p.administrativa,
      'cirujano', p.cirujano,
      'paciente', trim(concat_ws(', ', nullif(trim(p.paciente_apellido), ''),
                                       nullif(trim(p.paciente_nombre), ''))),
      'prestacion', p.prestacion_descripcion,
      'neto', CASE WHEN jsonb_typeof(p.datos_completos #> '{precios,neto}') = 'number'
                   THEN (p.datos_completos #>> '{precios,neto}')::numeric ELSE 0 END,
      'cobertura', CASE WHEN jsonb_typeof(p.datos_completos #> '{precios,coberturaOS}') = 'number'
                        THEN (p.datos_completos #>> '{precios,coberturaOS}')::numeric ELSE 0 END,
      'obra_social', nullif(trim(p.datos_completos #>> '{paciente,obraSocial}'), ''),
      'fecha_conversion', c.fecha_practica,
      'fecha_practica', p.fecha_practica
    ) AS fila
    FROM public.presupuestos p
    LEFT JOIN conv c ON c.presupuesto_id = p.id
    WHERE p.estado IN ('entregado', 'practicado', 'cancelado')
  ),
  usu AS (
    SELECT jsonb_build_object('username', u.username, 'nombre', u.nombre_completo) AS fila
    FROM public.usuarios_sistema u
    WHERE u.username IN (SELECT DISTINCT administrativa FROM public.presupuestos)
  )
  SELECT jsonb_build_object(
    'presupuestos', coalesce((SELECT jsonb_agg(fila) FROM pres), '[]'::jsonb),
    'usuarios',     coalesce((SELECT jsonb_agg(fila) FROM usu), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.informe_presupuestos_datos() IS
  'Datos del informe mensual de presupuestos (migración 81). Pide el permiso informes:presupuestos.';

REVOKE ALL ON FUNCTION public.informe_presupuestos_datos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.informe_presupuestos_datos() FROM anon;
GRANT EXECUTE ON FUNCTION public.informe_presupuestos_datos() TO authenticated;

-- Verificación
DO $$
BEGIN
  IF to_regprocedure('public.informe_presupuestos_datos()') IS NULL THEN
    RAISE EXCEPTION 'FALLO 81: no se creó informe_presupuestos_datos()';
  END IF;
  IF has_function_privilege('anon', 'public.informe_presupuestos_datos()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLO 81: anon puede ejecutar informe_presupuestos_datos()';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permisos_rol WHERE modulo = 'informes:presupuestos') THEN
    RAISE NOTICE 'OK 81 (aviso): ya hay roles con informes:presupuestos; no se tocaron.';
  END IF;
  RAISE NOTICE 'OK 81: informe_presupuestos_datos() creada, sólo para authenticated con permiso.';
END $$;

COMMIT;
