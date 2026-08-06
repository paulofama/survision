-- ===========================================================================
-- 31_banco_conciliacion.sql
-- Sistema de Gestión Integral - Survisión S.A.
-- Subsección "Bancos" dentro de Tesorería: ingesta del extracto Santander,
-- snapshot de valores de GECLISA y conciliación banco <-> GECLISA.
--
-- Convenciones (iguales al resto): RLS por app_tiene_permiso('tesoreria'),
-- SELECT para authenticated; el daemon on-prem escribe con service_role
-- (bypassa RLS). Las tablas que la UI escribe (importaciones/movimientos/
-- conciliaciones + estados) tienen además policies de INSERT/UPDATE/DELETE
-- para authenticated con el mismo permiso. Idempotente.
-- ===========================================================================

BEGIN;

-- set_updated_at() ya existe (migración 02); se referencia en los triggers.

-- ===========================================================================
-- 1. banco_cuentas — cuentas bancarias (modelo multi-cuenta; se precarga 1)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.banco_cuentas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco        text NOT NULL,
  nro_cuenta   text NOT NULL,
  cbu          text,
  alias        text,
  moneda       text NOT NULL DEFAULT 'ARS',
  titular      text,
  cuit_titular text,
  activa       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT banco_cuentas_nro_uk UNIQUE (nro_cuenta)
);

-- ===========================================================================
-- 2. banco_importaciones — auditoría de cada archivo de extracto procesado
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.banco_importaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id         uuid REFERENCES public.banco_cuentas(id) ON DELETE SET NULL,
  periodo_desde     date,
  periodo_hasta     date,
  saldo_inicial     numeric(18,2),
  saldo_final       numeric(18,2),
  total_creditos    numeric(18,2) NOT NULL DEFAULT 0,
  total_debitos     numeric(18,2) NOT NULL DEFAULT 0,
  cant_movimientos  integer NOT NULL DEFAULT 0,
  cant_nuevos       integer NOT NULL DEFAULT 0,
  cant_duplicados   integer NOT NULL DEFAULT 0,
  estado            text NOT NULL DEFAULT 'ok',   -- ok | rechazada | omitida
  motivo            text,
  detalle_impositivo jsonb,                        -- ley 25.413, SIRCREB, etc.
  origen            text NOT NULL DEFAULT 'manual',-- manual | daemon
  usuario           text,
  archivo_nombre    text,
  archivo_hash      text,                          -- para detectar "no cambió"
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banco_imp_cuenta_fecha ON public.banco_importaciones (cuenta_id, periodo_hasta DESC);

-- ===========================================================================
-- 3. banco_movimientos — movimientos del extracto (idempotentes por hash_dedup)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.banco_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash_dedup          text NOT NULL,
  cuenta_id           uuid NOT NULL REFERENCES public.banco_cuentas(id) ON DELETE CASCADE,
  fecha               date NOT NULL,
  anio                integer NOT NULL,
  mes                 integer NOT NULL,
  posicion_dia        integer NOT NULL DEFAULT 0,  -- orden dentro del día
  nro_comprobante     text,
  concepto            text,                         -- 1ª línea de la descripción
  descripcion         text,                         -- descripción completa (crudo)
  contraparte_nombre  text,
  contraparte_cuit    text,
  importe             numeric(18,2) NOT NULL,       -- CON SIGNO (delta de saldo)
  saldo_resultante    numeric(18,2),
  categoria           text,                         -- de banco_reglas
  estado_conciliacion text NOT NULL DEFAULT 'pendiente',
    -- pendiente | conciliado_auto | conciliado_manual | solo_banco | ignorado
  importacion_id      uuid REFERENCES public.banco_importaciones(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT banco_movimientos_hash_uk UNIQUE (hash_dedup)
);
CREATE INDEX IF NOT EXISTS idx_banco_mov_cuenta_fecha ON public.banco_movimientos (cuenta_id, fecha);
CREATE INDEX IF NOT EXISTS idx_banco_mov_estado ON public.banco_movimientos (estado_conciliacion);
CREATE INDEX IF NOT EXISTS idx_banco_mov_anio_mes ON public.banco_movimientos (anio, mes);
CREATE INDEX IF NOT EXISTS idx_banco_mov_cuit ON public.banco_movimientos (contraparte_cuit);

DROP TRIGGER IF EXISTS trg_banco_movimientos_updated_at ON public.banco_movimientos;
CREATE TRIGGER trg_banco_movimientos_updated_at
  BEFORE UPDATE ON public.banco_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 4. geclisa_valores — snapshot de cobranzas/pagos bancarios de GECLISA
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.geclisa_valores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_origen           text NOT NULL,                -- PK natural GECLISA (ej. MOVVAL-<id>)
  tipo                text NOT NULL DEFAULT 'cobranza', -- cobranza | pago
  fecha               date,
  anio                integer,
  mes                 integer,
  comprobante         text,
  comprobante_sigla   text,
  tercero_nombre      text,
  tercero_cuit        text,
  medio_id            integer,
  medio_nombre        text,
  banco_geclisa       text,
  importe             numeric(18,2) NOT NULL DEFAULT 0, -- CON SIGNO
  anulado             boolean NOT NULL DEFAULT false,
  estado_conciliacion text NOT NULL DEFAULT 'pendiente',
    -- pendiente | conciliado_auto | conciliado_manual | ignorado
  raw                 jsonb,
  fecha_extraccion    timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geclisa_valores_origen_uk UNIQUE (id_origen)
);
CREATE INDEX IF NOT EXISTS idx_gv_fecha ON public.geclisa_valores (fecha);
CREATE INDEX IF NOT EXISTS idx_gv_estado ON public.geclisa_valores (estado_conciliacion);
CREATE INDEX IF NOT EXISTS idx_gv_anio_mes ON public.geclisa_valores (anio, mes);
CREATE INDEX IF NOT EXISTS idx_gv_importe ON public.geclisa_valores (importe);

DROP TRIGGER IF EXISTS trg_geclisa_valores_updated_at ON public.geclisa_valores;
CREATE TRIGGER trg_geclisa_valores_updated_at
  BEFORE UPDATE ON public.geclisa_valores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 5. conciliaciones + tablas puente (N:M, soporta 1:1, 1:N, N:1, N:M)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.conciliaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              text NOT NULL DEFAULT 'manual', -- automatica | manual
  usuario           text,
  observacion       text,
  diferencia        numeric(18,2) NOT NULL DEFAULT 0, -- arancel/retención registrada
  motivo_diferencia text,
  total_banco       numeric(18,2) NOT NULL DEFAULT 0,
  total_geclisa     numeric(18,2) NOT NULL DEFAULT 0,
  anulada           boolean NOT NULL DEFAULT false,
  anulada_por       text,
  anulada_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_conciliaciones_updated_at ON public.conciliaciones;
CREATE TRIGGER trg_conciliaciones_updated_at
  BEFORE UPDATE ON public.conciliaciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.conciliacion_banco (
  conciliacion_id  uuid NOT NULL REFERENCES public.conciliaciones(id) ON DELETE CASCADE,
  banco_movimiento_id uuid NOT NULL REFERENCES public.banco_movimientos(id) ON DELETE CASCADE,
  PRIMARY KEY (conciliacion_id, banco_movimiento_id)
);
CREATE INDEX IF NOT EXISTS idx_concil_banco_mov ON public.conciliacion_banco (banco_movimiento_id);

CREATE TABLE IF NOT EXISTS public.conciliacion_geclisa (
  conciliacion_id  uuid NOT NULL REFERENCES public.conciliaciones(id) ON DELETE CASCADE,
  geclisa_valor_id uuid NOT NULL REFERENCES public.geclisa_valores(id) ON DELETE CASCADE,
  PRIMARY KEY (conciliacion_id, geclisa_valor_id)
);
CREATE INDEX IF NOT EXISTS idx_concil_geclisa_val ON public.conciliacion_geclisa (geclisa_valor_id);

-- ===========================================================================
-- 6. banco_reglas — categorización y auto-matching (editables)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.banco_reglas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden            integer NOT NULL DEFAULT 100, -- menor = mayor prioridad
  nombre           text NOT NULL,
  patron           text NOT NULL,   -- substring lower-normalizado sobre la descripción
  signo            text,            -- credito | debito | NULL (cualquiera)
  categoria        text NOT NULL,
  marca_solo_banco boolean NOT NULL DEFAULT false,
  activa           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banco_reglas_orden ON public.banco_reglas (orden) WHERE activa;
DROP TRIGGER IF EXISTS trg_banco_reglas_updated_at ON public.banco_reglas;
CREATE TRIGGER trg_banco_reglas_updated_at
  BEFORE UPDATE ON public.banco_reglas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 7. RLS
-- ===========================================================================
ALTER TABLE public.banco_cuentas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_importaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geclisa_valores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliaciones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliacion_banco   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliacion_geclisa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_reglas         ENABLE ROW LEVEL SECURITY;

-- Helper de legibilidad: todas gatean por app_tiene_permiso('tesoreria').
-- SELECT en todas; escritura en las que toca la UI.

-- banco_cuentas: solo lectura desde la app (se precarga por migración)
DROP POLICY IF EXISTS pol_banco_cuentas_sel ON public.banco_cuentas;
CREATE POLICY pol_banco_cuentas_sel ON public.banco_cuentas
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));

-- banco_importaciones: SELECT + INSERT (la subida manual registra la corrida)
DROP POLICY IF EXISTS pol_banco_imp_sel ON public.banco_importaciones;
CREATE POLICY pol_banco_imp_sel ON public.banco_importaciones
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_banco_imp_ins ON public.banco_importaciones;
CREATE POLICY pol_banco_imp_ins ON public.banco_importaciones
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria'));

-- banco_movimientos: SELECT + INSERT (subida manual) + UPDATE (estado)
DROP POLICY IF EXISTS pol_banco_mov_sel ON public.banco_movimientos;
CREATE POLICY pol_banco_mov_sel ON public.banco_movimientos
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_banco_mov_ins ON public.banco_movimientos;
CREATE POLICY pol_banco_mov_ins ON public.banco_movimientos
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_banco_mov_upd ON public.banco_movimientos;
CREATE POLICY pol_banco_mov_upd ON public.banco_movimientos
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria'))
  WITH CHECK (public.app_tiene_permiso('tesoreria'));

-- geclisa_valores: SELECT + UPDATE (estado). El INSERT lo hace el daemon (service_role).
DROP POLICY IF EXISTS pol_gv_sel ON public.geclisa_valores;
CREATE POLICY pol_gv_sel ON public.geclisa_valores
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_gv_upd ON public.geclisa_valores;
CREATE POLICY pol_gv_upd ON public.geclisa_valores
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria'))
  WITH CHECK (public.app_tiene_permiso('tesoreria'));

-- conciliaciones: SELECT + INSERT + UPDATE + DELETE (conciliar/desconciliar/anular)
DROP POLICY IF EXISTS pol_concil_sel ON public.conciliaciones;
CREATE POLICY pol_concil_sel ON public.conciliaciones
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_ins ON public.conciliaciones;
CREATE POLICY pol_concil_ins ON public.conciliaciones
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_upd ON public.conciliaciones;
CREATE POLICY pol_concil_upd ON public.conciliaciones
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria'))
  WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_del ON public.conciliaciones;
CREATE POLICY pol_concil_del ON public.conciliaciones
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria'));

-- puentes: SELECT + INSERT + DELETE
DROP POLICY IF EXISTS pol_concil_banco_sel ON public.conciliacion_banco;
CREATE POLICY pol_concil_banco_sel ON public.conciliacion_banco
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_banco_ins ON public.conciliacion_banco;
CREATE POLICY pol_concil_banco_ins ON public.conciliacion_banco
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_banco_del ON public.conciliacion_banco;
CREATE POLICY pol_concil_banco_del ON public.conciliacion_banco
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria'));

DROP POLICY IF EXISTS pol_concil_gv_sel ON public.conciliacion_geclisa;
CREATE POLICY pol_concil_gv_sel ON public.conciliacion_geclisa
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_gv_ins ON public.conciliacion_geclisa;
CREATE POLICY pol_concil_gv_ins ON public.conciliacion_geclisa
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_concil_gv_del ON public.conciliacion_geclisa;
CREATE POLICY pol_concil_gv_del ON public.conciliacion_geclisa
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria'));

-- banco_reglas: SELECT + INSERT + UPDATE + DELETE (editables desde la UI)
DROP POLICY IF EXISTS pol_banco_reglas_sel ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_sel ON public.banco_reglas
  FOR SELECT TO authenticated USING (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_banco_reglas_ins ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_ins ON public.banco_reglas
  FOR INSERT TO authenticated WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_banco_reglas_upd ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_upd ON public.banco_reglas
  FOR UPDATE TO authenticated USING (public.app_tiene_permiso('tesoreria'))
  WITH CHECK (public.app_tiene_permiso('tesoreria'));
DROP POLICY IF EXISTS pol_banco_reglas_del ON public.banco_reglas;
CREATE POLICY pol_banco_reglas_del ON public.banco_reglas
  FOR DELETE TO authenticated USING (public.app_tiene_permiso('tesoreria'));

-- ===========================================================================
-- 8. SEED — cuenta Santander + reglas de categorización (punto 4 del prompt)
-- ===========================================================================
INSERT INTO public.banco_cuentas (banco, nro_cuenta, cbu, moneda, titular, cuit_titular, activa)
SELECT 'Banco Santander', '262-001981/7', '0720262120000000198172', 'ARS', 'SURVISION S.A.', '30-70967266-1', true
WHERE NOT EXISTS (SELECT 1 FROM public.banco_cuentas WHERE nro_cuenta = '262-001981/7');

-- Reglas: primer match por 'orden' asc gana. patron = substring lower-normalizado.
INSERT INTO public.banco_reglas (orden, nombre, patron, signo, categoria, marca_solo_banco)
SELECT * FROM (VALUES
  -- ---- CRÉDITOS ----
  (10,  'Getnet (posnet/tarjetas)',        'getnet',                       'credito', 'getnet',                false),
  (20,  'First Data / Fiserv',             'pago comercios first data',    'credito', 'first_data',            false),
  (21,  'First Data',                      'first data',                   'credito', 'first_data',            false),
  (30,  'Círculo Médico',                  'circulo medico',               'credito', 'circulo_medico',        false),
  (40,  'OSEP',                            'osep',                         'credito', 'osep',                  false),
  (50,  'OSDE',                            'osde',                         'credito', 'osde',                  false),
  (60,  'DEBIN/CREDIN',                    'debin',                        NULL,      'debin',                 false),
  (61,  'CREDIN',                          'credin',                       'credito', 'debin',                 false),
  (70,  'Transferencia recibida',          'transferencia recibida',       'credito', 'transferencia_recibida',false),
  (71,  'Transf recibida (var)',           'transf recibida',              'credito', 'transferencia_recibida',false),
  (72,  'Transf minorista recibida',       'transf minorista recibida',    'credito', 'transferencia_recibida',false),
  (73,  'Pago a proveedores recibido',     'pago a proveedores recibido',  'credito', 'transferencia_recibida',false),
  (74,  'Crédito transf online banking',   'credito transf online banking','credito', 'transferencia_recibida',false),
  -- ---- DÉBITOS ----
  (110, 'Transferencia realizada',         'transferencia realizada',      'debito',  'transferencia_realizada',false),
  (111, 'Débito transferencia',            'debito transf',                'debito',  'transferencia_realizada',false),
  (112, 'Transferencia inmediata',         'transferencia inmediata',      'debito',  'transferencia_realizada',false),
  (120, 'Pago de haberes',                 'pago de haberes',              'debito',  'haberes',               false),
  (130, 'Pago de honorarios',              'pago de honorarios',           'debito',  'honorarios',            false),
  (140, 'AFIP/ARCA',                       'afip',                         'debito',  'afip',                  false),
  (141, 'ARCA',                            'arca',                         'debito',  'afip',                  false),
  (150, 'Impuesto Ley 25.413',             'ley 25.413',                   NULL,      'impuesto_ley_25413',    true),
  (151, 'Impuesto Ley 25413',              'ley 25413',                    NULL,      'impuesto_ley_25413',    true),
  (152, 'Impuesto ley (débito/crédito)',   'impuesto ley',                 NULL,      'impuesto_ley_25413',    true),
  (160, 'SIRCREB',                         'sircreb',                      NULL,      'sircreb',               true),
  (170, 'Comisión bancaria',               'comision',                     'debito',  'comision_bancaria',     true),
  (171, 'IVA comisiones',                  'iva',                          'debito',  'iva',                   true),
  (180, 'Débito automático',               'debito automatico',            'debito',  'debito_automatico',     false),
  (190, 'Seguro',                          'seguro',                       'debito',  'seguro',                false),
  (200, 'Suscripción FCI',                 'suscripcion fondos',           'debito',  'fci',                   true),
  (201, 'Rescate FCI',                     'rescate',                      NULL,      'fci',                   true),
  (210, 'Pago de servicios',               'pago de servicios',            'debito',  'pago_servicios',        false),
  (220, 'Interbanking',                    'interbanking',                 'debito',  'interbanking',          false)
) AS v(orden, nombre, patron, signo, categoria, marca_solo_banco)
WHERE NOT EXISTS (SELECT 1 FROM public.banco_reglas b WHERE b.patron = v.patron AND b.categoria = v.categoria);

-- ===========================================================================
-- 9. Verificación (aborta si falta algo)
-- ===========================================================================
DO $$
DECLARE
  n_tablas int;
  n_pol int;
  n_cuenta int;
  n_reglas int;
BEGIN
  SELECT count(*) INTO n_tablas FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN
   ('banco_cuentas','banco_importaciones','banco_movimientos','geclisa_valores',
    'conciliaciones','conciliacion_banco','conciliacion_geclisa','banco_reglas');
  IF n_tablas <> 8 THEN RAISE EXCEPTION 'Faltan tablas (esperadas 8, hay %)', n_tablas; END IF;

  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname='public' AND tablename LIKE 'banco_%' OR (schemaname='public' AND tablename IN ('geclisa_valores','conciliaciones','conciliacion_banco','conciliacion_geclisa'));
  IF n_pol < 8 THEN RAISE EXCEPTION 'Faltan policies RLS (hay %)', n_pol; END IF;

  SELECT count(*) INTO n_cuenta FROM public.banco_cuentas WHERE nro_cuenta='262-001981/7';
  IF n_cuenta <> 1 THEN RAISE EXCEPTION 'La cuenta Santander no quedó precargada'; END IF;

  SELECT count(*) INTO n_reglas FROM public.banco_reglas;
  IF n_reglas < 25 THEN RAISE EXCEPTION 'Faltan reglas seed (hay %)', n_reglas; END IF;

  RAISE NOTICE 'Migración 31 OK: % tablas, % reglas, cuenta Santander precargada', n_tablas, n_reglas;
END $$;

COMMIT;
