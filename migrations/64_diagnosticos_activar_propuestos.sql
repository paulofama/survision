-- ============================================================
-- Migración 64 — Activar los diagnósticos propuestos que quedaban
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- Decisión de Paulo, 29/09/2026: activar los propuestos de las migraciones
-- 52 y 59 que nadie llegó a revisar, con el mismo criterio que las cinco de
-- la 63. Son 12 prácticas y 53 presupuestos que dejan de imprimir el renglón
-- del diagnóstico en blanco.
--
-- UNA NO SE ACTIVA, Y NO ES OLVIDO
-- ---------------------------------
-- 030326 (luz pulsada) figuraba entre las apagadas, pero está apagada a
-- propósito desde la migración 63: su diagnóstico pasó a
-- `presupuestos_diagnostico_opciones` porque se indica por dos cosas. Una
-- práctica con diagnóstico único Y opciones activas a la vez haría que el
-- pedido tuviera que elegir en silencio cuál imprimir — las migraciones 60,
-- 61 y 63 abortan si eso pasa, y ésta también.
--
-- QUÉ SIGNIFICA ACTIVARLAS
-- -------------------------
-- Que se imprimen. El diagnóstico propuesto sale en el pedido que se firma y
-- se presenta a la obra social, sin que un médico lo haya leído. Es una
-- decisión de la Dirección y queda escrita como tal en cada nota: lo
-- contrario —el renglón en blanco— también tiene costo, porque se completa a
-- mano 53 veces y ahí el error es igual de posible y no queda registrado en
-- ningún lado.
--
-- Todas siguen siendo corregibles desde `/presupuestos/diagnosticos` en
-- segundos, y la corrección afecta a los pedidos siguientes.
-- ============================================================

BEGIN;

UPDATE public.presupuestos_diagnosticos
   SET activo = true,
       nota_interna = 'Activado por decisión de Paulo el 29/09/2026 sin revisión médica previa. '
                   || 'La propuesta original decía: ' || COALESCE(nota_interna, '(sin nota)')
 WHERE activo = false
   -- La luz pulsada NO: su diagnóstico vive ahora en la tabla de opciones.
   AND codigo_practica <> '030326'
   -- Sólo las propuestas, no algo que alguien haya apagado a mano por otro motivo.
   AND nota_interna LIKE 'PROPUESTO%';

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_apagados integer;
  v_luz_activa boolean;
  v_choque integer;
  v_solas integer;
  v_lio_sec boolean;
  v_lio_cri boolean;
  v_cubiertos integer;
  v_total integer;
BEGIN
  -- No puede quedar ninguna propuesta apagada salvo la luz pulsada.
  SELECT count(*) INTO v_apagados FROM public.presupuestos_diagnosticos
   WHERE NOT activo AND codigo_practica <> '030326';
  IF v_apagados > 0 THEN
    RAISE EXCEPTION 'ABORTA: quedaron % diagnóstico(s) apagados que deberían haberse activado', v_apagados;
  END IF;

  SELECT activo INTO v_luz_activa FROM public.presupuestos_diagnosticos WHERE codigo_practica = '030326';
  IF v_luz_activa THEN
    RAISE EXCEPTION 'ABORTA: la luz pulsada se activó y su diagnóstico vive en la tabla de opciones';
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

  -- El renglón del LIO es lo que imprime de más o de menos: implante
  -- secundario SÍ lleva lente, extracción de cristalino NO.
  SELECT lleva_lio INTO v_lio_sec FROM public.presupuestos_diagnosticos WHERE codigo_practica = '030509';
  SELECT lleva_lio INTO v_lio_cri FROM public.presupuestos_diagnosticos WHERE codigo_practica = '030506';
  IF NOT v_lio_sec THEN
    RAISE EXCEPTION 'ABORTA: implante secundario de LIO quedó sin lente';
  END IF;
  IF v_lio_cri THEN
    RAISE EXCEPTION 'ABORTA: extracción de cristalino quedó con lente';
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

  RAISE NOTICE 'Diagnósticos: % de % presupuestos cubiertos (%%%).',
    v_cubiertos, v_total, round(v_cubiertos * 100.0 / NULLIF(v_total, 0), 1);
END $$;
