-- ============================================================
-- Migración 76 — comisión del Círculo Médico como costo variable
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL PROBLEMA
-- -----------
-- Las obras sociales que se facturan por el Círculo Médico San Rafael le
-- dejan una comisión. El Círculo la cobra aparte, con una factura C (sin IVA)
-- cuyo monto depende de lo que pagaron las obras sociales y no de lo que
-- facturamos.
--
-- Esas facturas se clasifican como variables, así que el informe las excluye.
-- Hasta ahora ni la fórmula de honorarios ni las recetas calculaban la
-- comisión: el margen de esas prácticas salía sin ella.
--
-- CÓMO SE DEVENGA
-- ---------------
-- Se calcula un porcentaje sobre la COBERTURA de cada práctica de una obra
-- social del Círculo (lo que paga la obra social, sin el coseguro). Va en el
-- mes en que se hace la práctica, no en el mes en que llega la factura del
-- Círculo.
--
-- El Círculo termina pagando prácticamente todo lo presentado, con 3–4 meses
-- de atraso, así que aplicarlo sobre lo que paga la obra social o sobre la
-- cobertura facturada da casi el mismo monto. Lo único que cambia es el mes en
-- que cae.
--
-- EL 7,2 %
-- --------
-- Es una medición, no el convenio. Al 23/10/2026, en 12 meses:
--   facturas C del Círculo .......... ≈ $13 M
--   liquidaciones del Círculo ....... ≈ $186 M   (las FA A que le emite Survision)
--   cociente ........................ 7,0–7,6 %
-- Cuando Administración confirme el porcentaje del convenio ("gastos
-- administrativos" en la liquidación del Círculo), se carga como una versión
-- nueva con su vigencia_desde, igual que honorarios_config (migración 54).
--
-- QUÉ OBRAS SOCIALES
-- ------------------
-- Las que en GECLISA tienen ObrasSociales.AgeFact_id = 59 (agente de
-- facturación Círculo Médico). Las presentaciones (PreFac) llevan el mismo
-- agente. OSEP, OSDE, PAMI, CALMA, Hospital Español y Particular van directo.
-- Si se da de alta una obra social nueva por el Círculo, hay que agregarla
-- acá.
--
-- Para no contarla dos veces, las facturas del Círculo siguen clasificadas
-- como variables (fuera del informe).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.comision_intermediario (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intermediario   text NOT NULL,                 -- 'circulo_medico'
  nombre          text NOT NULL,
  porcentaje      numeric(6,3) NOT NULL CHECK (porcentaje >= 0 AND porcentaje < 100),
  vigencia_desde  date NOT NULL,
  observaciones   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comision_intermediario_version_uk UNIQUE (intermediario, vigencia_desde)
);

COMMENT ON TABLE public.comision_intermediario IS
  'Porcentaje que retiene un intermediario de facturación (el Círculo Médico) '
  'sobre la cobertura de las prácticas de sus obras sociales. Para un mes dado '
  'rige la fila con la vigencia_desde más alta que no sea posterior al mes.';

CREATE TABLE IF NOT EXISTS public.comision_intermediario_os (
  os_id          integer PRIMARY KEY,           -- ObrasSociales.os_id de GECLISA
  intermediario  text NOT NULL,
  os_sigla       text,
  os_nombre      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comision_intermediario_os IS
  'Obras sociales que se facturan a través de un intermediario. Origen: '
  'GECLISA ObrasSociales.AgeFact_id = 59 (Círculo Médico) al 23/10/2026.';

ALTER TABLE public.comision_intermediario    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comision_intermediario_os ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comision_intermediario, public.comision_intermediario_os FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comision_intermediario, public.comision_intermediario_os TO authenticated;

-- Las leen los informes (cualquiera logueado); las cambia sólo Dirección.
DROP POLICY IF EXISTS pol_com_int_select ON public.comision_intermediario;
CREATE POLICY pol_com_int_select ON public.comision_intermediario
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pol_com_int_write ON public.comision_intermediario;
CREATE POLICY pol_com_int_write ON public.comision_intermediario
  FOR ALL TO authenticated
  USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());

DROP POLICY IF EXISTS pol_com_int_os_select ON public.comision_intermediario_os;
CREATE POLICY pol_com_int_os_select ON public.comision_intermediario_os
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pol_com_int_os_write ON public.comision_intermediario_os;
CREATE POLICY pol_com_int_os_write ON public.comision_intermediario_os
  FOR ALL TO authenticated
  USING (public.app_es_admin()) WITH CHECK (public.app_es_admin());

INSERT INTO public.comision_intermediario (intermediario, nombre, porcentaje, vigencia_desde, observaciones)
VALUES ('circulo_medico', 'Círculo Médico San Rafael', 7.2, DATE '2000-01-01',
        'Medido: facturas C del Círculo / liquidaciones del Círculo, 12 meses al 23/10/2026. Provisorio hasta confirmar el % del convenio.')
ON CONFLICT (intermediario, vigencia_desde) DO NOTHING;

INSERT INTO public.comision_intermediario_os (os_id, os_sigla, os_nombre, intermediario)
SELECT v.os_id, v.sigla, v.nombre, 'circulo_medico' FROM (VALUES
  (8067, 'OSAPM', 'OSAPM'),
  (8068, 'AGUA Y ENERGIA', 'AGUA Y ENERGIA'),
  (8069, 'CAJA FORENSE', 'Caja Forense'),
  (8071, 'MEDICAR', 'MEDICAR'),
  (8072, 'OSUOMRA (BASA)', 'OSUOMRA (BASA)'),
  (8073, 'ASSIST CARD', 'ASSIST CARD'),
  (8074, 'DASUTEN', 'DASUTEN'),
  (8075, 'DIBA', 'DIBA'),
  (8077, 'APSOT', 'APSOT'),
  (8078, 'SANCOR 800', 'SANCOR PLAN 800'),
  (8079, 'GALENO', 'GALENO'),
  (8080, 'GALENO ART', 'Galeno ART'),
  (8081, 'GENDARMERIA NAC', 'CMSR'),
  (8084, 'JERARQUICOS', 'JERARQUICOS SALUD'),
  (8088, 'MEDIFE', 'MEDIFE'),
  (8090, 'OPDEA', 'OPDEA'),
  (8091, 'OSCA', 'OSCA'),
  (8095, 'OSMEDICA', 'CMSR'),
  (8096, 'OSPECON', 'OPECON'),
  (8097, 'OSPEGAP', 'OSPEGAP'),
  (8098, 'OSPELSYM', 'OSPELSYM'),
  (8099, 'OSPIA', 'OSPIA'),
  (8100, 'OSPLAD', 'OSPLAD'),
  (8101, 'OSPRERA', 'OSPRERA'),
  (8102, 'OSPTV', 'OSPTV'),
  (8103, 'NO', 'NO'),
  (8104, 'OSSEG', 'OSSEG'),
  (8105, 'OSTEL-OSSACRA', 'ENSALUD'),
  (8108, 'OSPJN', 'OSPJN (PODER JUDICIAL)'),
  (8109, 'PREVECION', 'PREVENCION'),
  (8111, 'SANCOR', 'SANCOR'),
  (8116, 'PREVENCION', 'PREVENCION ON DEMAN'),
  (8119, 'OSUTHGRA', 'OSUTHGRA'),
  (8121, '.', '.'),
  (8122, 'FEDERADA', 'FEDERADA'),
  (8125, 'BOREAL', 'BOREAL'),
  (8126, 'BRAMED', 'BRAMED'),
  (8127, 'DAMSU', 'DAMSU'),
  (8128, 'OSTEL', 'OSTEL'),
  (8129, 'MEDICUS', 'MEDICUS'),
  (8130, 'OSPE', 'OSPE'),
  (8131, 'OSPACA', 'CIRCULO MEDICO'),
  (8132, 'OSMATA', 'OSMATA'),
  (8133, 'OSJERA', 'OSJERA'),
  (8134, 'LUZ Y FUERZA', 'OSFATLYF'),
  (8135, 'OSDIPP', 'OSDIPP'),
  (8136, 'OSDEPYM', 'OSDEPYM'),
  (8137, 'OSAM', 'CMSR'),
  (8138, 'OMINT', 'OMINT'),
  (8139, 'OSPF', 'OSPF'),
  (8140, 'OSDOP', 'OSDOP'),
  (8141, 'POLICIA FEDERAL', 'POLICIA FEDERAL'),
  (8142, 'SAN PEDRO', 'SAN PEDRO'),
  (8143, 'IOSFA', 'IOSFA'),
  (8145, 'SWISS MEDICAL', 'SWISS MEDICAL'),
  (8147, '.', '.'),
  (8148, 'OSPCRA', 'OSPCRA'),
  (8149, 'OSALARA', 'HEMISFERIO'),
  (8150, 'UNIMED', 'UNIMED'),
  (8151, 'OSSSB', 'OSSSB'),
  (8154, 'UP', 'UNION PERSONAL ACCORD'),
  (8155, 'NOBIS', 'NOBIS'),
  (8156, 'OSM', 'OSM (20 DE OCTUBRE)'),
  (8157, 'AVALIAN', 'AVALIAN'),
  (8158, 'UP', 'UNION PERSONAL CLASICO'),
  (8160, 'AMPF', 'PROTECCION FAMILIAR')
) AS v(os_id, sigla, nombre)
ON CONFLICT (os_id) DO NOTHING;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE v_pct int; v_os int;
BEGIN
  SELECT count(*) INTO v_pct FROM public.comision_intermediario WHERE intermediario = 'circulo_medico';
  SELECT count(*) INTO v_os  FROM public.comision_intermediario_os WHERE intermediario = 'circulo_medico';
  IF v_pct < 1 THEN RAISE EXCEPTION 'ABORTA: falta el porcentaje del Círculo'; END IF;
  IF v_os <> 66 THEN RAISE EXCEPTION 'ABORTA: se esperaban 66 obras sociales del Círculo, hay %', v_os; END IF;
  -- Las directas no pueden estar: duplicaría costo en OSEP/OSDE/PAMI/Particular.
  IF EXISTS (SELECT 1 FROM public.comision_intermediario_os WHERE os_id IN (8094, 8092, 8106, 8066, 8070, 8082)) THEN
    RAISE EXCEPTION 'ABORTA: una obra social directa quedó como del Círculo';
  END IF;
  RAISE NOTICE 'OK: Círculo Médico con % obras sociales', v_os;
END $$;
