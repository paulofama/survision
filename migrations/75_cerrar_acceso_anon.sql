-- ============================================================
-- Migración 75 — cerrar el acceso anónimo de 8 tablas
-- Sistema de Gestión Integral · Survisión S.A.
-- ============================================================
--
-- EL AGUJERO
-- ----------
-- La anon key está hardcodeada en `src/shared/lib/supabase.ts` y viaja en el
-- bundle público de Netlify: es pública por diseño. Ocho tablas tenían sus
-- policies declaradas SIN `TO authenticated`, y sin esa cláusula Postgres las
-- asigna a `PUBLIC`, que incluye el rol `anon`.
--
-- Medido el 13/10/2026 con el rol `anon` y SIN ningún JWT —exactamente lo que
-- puede hacer cualquiera con esa clave—, y las escrituras probadas de verdad
-- con UPDATE y DELETE reales dentro de BEGIN … ROLLBACK, porque un UPDATE
-- bloqueado por RLS no tira error: afecta 0 filas, y contar filas afectadas es
-- la única prueba válida.
--
--   erogaciones_clasificacion          5.377 filas · lee, modifica y BORRA
--   sueldos_registros                    414 filas · lee, modifica y borra
--   pool_items                           130 filas · lee, modifica y borra
--   proveedores_clasificacion_default     28 filas · lee, modifica y borra
--   categorias_costo_fijo                 14 filas · lee, modifica y borra
--   pools_insumos                         10 filas · lee, modifica y borra
--   sueldos_categorias                     6 filas · lee, modifica y borra
--   prestacion_insumos                     0 filas · lee, modifica y borra
--
-- `DELETE FROM erogaciones_clasificacion` como `anon` devolvió 5.377 filas
-- borrables. Son los costos fijos de la clínica con proveedor e importe, y los
-- registros de sueldos.
--
-- Y `anon` tenía además el GRANT de TRUNCATE sobre las ocho.
--
-- QUÉ HACE ESTA MIGRACIÓN, Y QUÉ NO
-- ----------------------------------
-- Recrea cada policy IDÉNTICA pero `TO authenticated`, y le revoca a `anon`
-- los GRANT sobre esas tablas. Las expresiones `USING` y `WITH CHECK` quedan
-- exactamente como estaban.
--
-- O sea: **no cambia nada para ningún usuario logueado.** Lo único que se va
-- es el acceso anónimo. Que estas tablas estén abiertas a cualquier logueado
-- —en vez de pedir un permiso— es una decisión aparte, que se toma sabiendo
-- qué pantalla de qué módulo lee cada una; mezclarla acá arriesgaría romper
-- pantallas mientras se cierra un agujero, y son dos problemas distintos.
--
-- Los nombres de las policies se conservan: quien lea `pg_policies` después
-- tiene que poder seguir el hilo.
--
-- El backend escribe con la SERVICE_ROLE key, que bypassa RLS, así que los
-- extractores y el daemon no se enteran.
-- ============================================================

BEGIN;

-- ── categorias_costo_fijo ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Categorías editables por autenticados" ON public.categorias_costo_fijo;
CREATE POLICY "Categorías editables por autenticados" ON public.categorias_costo_fijo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Categorías visibles para todos" ON public.categorias_costo_fijo;
CREATE POLICY "Categorías visibles para todos" ON public.categorias_costo_fijo
  FOR SELECT TO authenticated USING (true);

-- ── erogaciones_clasificacion ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo en erogaciones_clasificacion" ON public.erogaciones_clasificacion;
CREATE POLICY "Permitir todo en erogaciones_clasificacion" ON public.erogaciones_clasificacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── pool_items ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lectura pública pool_items" ON public.pool_items;
CREATE POLICY "Lectura pública pool_items" ON public.pool_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Inserción pool_items" ON public.pool_items;
CREATE POLICY "Inserción pool_items" ON public.pool_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Actualización pool_items" ON public.pool_items;
CREATE POLICY "Actualización pool_items" ON public.pool_items
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Eliminación pool_items" ON public.pool_items;
CREATE POLICY "Eliminación pool_items" ON public.pool_items
  FOR DELETE TO authenticated USING (true);

-- ── pools_insumos ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lectura pública pools" ON public.pools_insumos;
CREATE POLICY "Lectura pública pools" ON public.pools_insumos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Inserción pools" ON public.pools_insumos;
CREATE POLICY "Inserción pools" ON public.pools_insumos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Actualización pools" ON public.pools_insumos;
CREATE POLICY "Actualización pools" ON public.pools_insumos
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Eliminación pools" ON public.pools_insumos;
CREATE POLICY "Eliminación pools" ON public.pools_insumos
  FOR DELETE TO authenticated USING (true);

-- ── prestacion_insumos ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir lectura pública" ON public.prestacion_insumos;
CREATE POLICY "Permitir lectura pública" ON public.prestacion_insumos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir inserción autenticada" ON public.prestacion_insumos;
CREATE POLICY "Permitir inserción autenticada" ON public.prestacion_insumos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualización autenticada" ON public.prestacion_insumos;
CREATE POLICY "Permitir actualización autenticada" ON public.prestacion_insumos
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Permitir eliminación autenticada" ON public.prestacion_insumos;
CREATE POLICY "Permitir eliminación autenticada" ON public.prestacion_insumos
  FOR DELETE TO authenticated USING (true);

-- ── proveedores_clasificacion_default ──────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo en proveedores_clasificacion_default" ON public.proveedores_clasificacion_default;
CREATE POLICY "Permitir todo en proveedores_clasificacion_default" ON public.proveedores_clasificacion_default
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── sueldos_categorias ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS sueldos_categorias_all ON public.sueldos_categorias;
CREATE POLICY sueldos_categorias_all ON public.sueldos_categorias
  FOR ALL TO authenticated USING (true);

-- ── sueldos_registros ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS sueldos_registros_all ON public.sueldos_registros;
CREATE POLICY sueldos_registros_all ON public.sueldos_registros
  FOR ALL TO authenticated USING (true);

-- ── Y además, los GRANT ────────────────────────────────────────────────────
-- Sin policy permisiva, `anon` ya no lee nada. Igual se le revocan los GRANT:
-- dos capas, y así una policy mal declarada en el futuro no vuelve a abrir la
-- tabla por sí sola. Incluía TRUNCATE.
REVOKE ALL ON TABLE
  public.categorias_costo_fijo,
  public.erogaciones_clasificacion,
  public.pool_items,
  public.pools_insumos,
  public.prestacion_insumos,
  public.proveedores_clasificacion_default,
  public.sueldos_categorias,
  public.sueldos_registros
FROM anon;

COMMIT;

-- ============================================================
-- Verificación
-- ============================================================
DO $$
DECLARE
  v_publicas integer;
  v_grants integer;
  v_policies integer;
  v_tablas text[] := ARRAY[
    'categorias_costo_fijo', 'erogaciones_clasificacion', 'pool_items',
    'pools_insumos', 'prestacion_insumos', 'proveedores_clasificacion_default',
    'sueldos_categorias', 'sueldos_registros'];
BEGIN
  -- Ninguna policy de estas tablas puede seguir alcanzando a PUBLIC.
  SELECT count(*) INTO v_publicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(v_tablas)
     AND ('public' = ANY(roles) OR 'anon' = ANY(roles));
  IF v_publicas > 0 THEN
    RAISE EXCEPTION 'ABORTA: quedan % policy(s) alcanzando al anónimo', v_publicas;
  END IF;

  -- Ni un GRANT.
  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = ANY(v_tablas);
  IF v_grants > 0 THEN
    RAISE EXCEPTION 'ABORTA: a anon le quedan % GRANT(s)', v_grants;
  END IF;

  -- Y lo que había tiene que seguir estando: 18 policies, ahora authenticated.
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public' AND tablename = ANY(v_tablas)
     AND 'authenticated' = ANY(roles);
  IF v_policies <> 18 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 18 policies para authenticated, hay %', v_policies;
  END IF;

  RAISE NOTICE 'Acceso anónimo cerrado en % tablas. % policies intactas para authenticated.',
    array_length(v_tablas, 1), v_policies;
END $$;
