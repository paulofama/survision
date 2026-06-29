// ===========================================================================
// HOOK: useAsiento - MODULO CARGA DE SUELDOS (Fase 4)
// ===========================================================================
// v2 (2026): genera el asiento EN EL BROWSER y persiste en Supabase (antes:
// endpoints /api/asientos/*). Así funciona desde internet sin backend on-prem.
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';
import { generarAsiento, SinNetosError } from '../services/asientoGenerator';
import { cargarLiquidacionCompleta, cargarF931Confirmado, cargarEmpleadosMap } from '../services/cargarSupabase';
import type {
  AsientoCompleto,
  AsientoGenerarResult,
  AsientoSueldosLinea,
  ResultadoOperacion,
  TipoCriterioBruto,
} from '../types/sueldos';

// ---------------------------------------------------------------------------
// CACHE MODULE-LEVEL
// ---------------------------------------------------------------------------

interface CacheEntry { asiento: AsientoCompleto | null; fetchedAt: number }
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();
const CACHE_TTL_MS = 60 * 1000;

function cacheKey(anio: number, mes: number): string { return `${anio}-${String(mes).padStart(2, '0')}`; }
function isCacheValid(key: string): boolean {
  const entry = cache.get(key);
  return entry ? Date.now() - entry.fetchedAt < CACHE_TTL_MS : false;
}
export function invalidarCacheAsiento(anio?: number, mes?: number): void {
  if (anio === undefined || mes === undefined) cache.clear();
  else cache.delete(cacheKey(anio, mes));
}

// ---------------------------------------------------------------------------
// LECTURA DE SUPABASE
// ---------------------------------------------------------------------------

async function leerAsientoPersistido(liquidacionId: string): Promise<AsientoCompleto | null> {
  const { data: cab, error: e1 } = await supabase
    .from('asientos_sueldos').select('*').eq('liquidacion_id', liquidacionId)
    .order('generado_at', { ascending: false }).limit(1).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!cab) return null;
  const { data: lineas, error: e2 } = await supabase
    .from('asiento_sueldos_lineas').select('*').eq('asiento_id', cab.id).order('orden');
  if (e2) throw new Error(e2.message);
  return { cabecera: cab as any, lineas: (lineas || []) as AsientoSueldosLinea[] };
}

async function fetchAsiento(anio: number, mes: number, force = false): Promise<CacheEntry> {
  const key = cacheKey(anio, mes);
  if (!force && isCacheValid(key)) return cache.get(key)!;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<CacheEntry> => {
    const { data: liq, error } = await supabase
      .from('liquidaciones_mes').select('id').eq('anio', anio).eq('mes', mes).maybeSingle();
    if (error) throw new Error(error.message);
    const asiento = liq ? await leerAsientoPersistido(liq.id) : null;
    const entry: CacheEntry = { asiento, fetchedAt: Date.now() };
    cache.set(key, entry);
    return entry;
  })();

  inflight.set(key, promise);
  try { return await promise; } finally { inflight.delete(key); }
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

interface UseAsientoReturn {
  asiento: AsientoCompleto | null;
  warnings: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  generar: (criterio?: TipoCriterioBruto, nombreUsuario?: string) => Promise<ResultadoOperacion<AsientoGenerarResult>>;
  borrar: () => Promise<ResultadoOperacion<void>>;
  lineasRecibo: AsientoSueldosLinea[];
  lineasFacturado: AsientoSueldosLinea[];
  cuadra: boolean;
}

export function useAsiento(anio: number, mes: number): UseAsientoReturn {
  const key = cacheKey(anio, mes);
  const initial = cache.get(key);

  const [asiento, setAsiento] = useState<AsientoCompleto | null>(initial?.asiento ?? null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(!isCacheValid(key));
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const entry = await fetchAsiento(anio, mes, force);
      setAsiento(entry.asiento);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      console.error(`[useAsiento ${anio}-${mes}] Error:`, err);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    if (isCacheValid(key) && cache.get(key)) {
      setAsiento(cache.get(key)!.asiento);
      setLoading(false);
      return;
    }
    cargar(false);
  }, [key, cargar]);

  const refetch = useCallback(async () => {
    invalidarCacheAsiento(anio, mes);
    await cargar(true);
  }, [anio, mes, cargar]);

  // ---- Generar: corre el motor en el browser y persiste en Supabase ----
  const generar = useCallback(
    async (criterio: TipoCriterioBruto = 'RECONCILIABLE', nombreUsuario?: string): Promise<ResultadoOperacion<AsientoGenerarResult>> => {
      try {
        const liq = await cargarLiquidacionCompleta(anio, mes);
        if (!liq) return { ok: false, error: `No hay liquidación para ${mes}/${anio}.` };
        if (liq.estado === 'CERRADO') return { ok: false, error: 'El mes está CERRADO. Reabrilo para regenerar el asiento.' };
        const f931 = await cargarF931Confirmado(anio, mes);
        if (!f931) return { ok: false, error: 'No hay un F.931 confirmado para este mes. Cargá y confirmá el F.931 primero.' };
        const empleadosMap = await cargarEmpleadosMap();

        let calc;
        try {
          calc = generarAsiento(liq as any, f931, empleadosMap, { criterio: criterio as any });
        } catch (e) {
          if (e instanceof SinNetosError) return { ok: false, error: e.message, codigo: 'SIN_NETOS' };
          throw e;
        }

        // Reemplazar asiento existente (borra cascade lineas) e insertar de nuevo
        const { error: delErr } = await supabase.from('asientos_sueldos').delete().eq('liquidacion_id', liq.id);
        if (delErr) throw new Error(delErr.message);

        const { data: cabRow, error: cabErr } = await supabase
          .from('asientos_sueldos')
          .insert({ ...calc.cabecera, generado_at: new Date().toISOString(), generado_por_nombre: nombreUsuario || null })
          .select().single();
        if (cabErr) throw new Error(cabErr.message);

        const lineasInsert = calc.lineas.map((l) => ({
          asiento_id: cabRow.id, orden: l.orden, seccion: l.seccion, cuenta_codigo: l.cuenta_codigo,
          cuenta_nombre: l.cuenta_nombre, detalle: l.detalle, debe: l.debe, haber: l.haber,
          es_ajuste: l.es_ajuste, es_estimado: l.es_estimado, empleado_id: l.empleado_id, area: l.area,
        }));
        if (lineasInsert.length > 0) {
          const { error: linErr } = await supabase.from('asiento_sueldos_lineas').insert(lineasInsert);
          if (linErr) throw new Error(linErr.message);
        }

        // bruto_estimado por empleado
        await Promise.all(
          calc.repartos.filter((r) => r.linea_id).map((r) =>
            supabase.from('liquidacion_lineas_empleado').update({ bruto_estimado: r.bruto }).eq('id', r.linea_id as string),
          ),
        );

        // Avanzar estado CONCILIADO -> ASIENTO_GENERADO
        if (liq.estado !== 'ASIENTO_GENERADO' && liq.estado !== 'CERRADO') {
          await supabase.from('liquidaciones_mes').update({ estado: 'ASIENTO_GENERADO' }).eq('id', liq.id);
        }

        const persistido = await leerAsientoPersistido(liq.id);
        cache.set(cacheKey(anio, mes), { asiento: persistido, fetchedAt: Date.now() });
        setAsiento(persistido);
        setWarnings(calc.warnings);

        return { ok: true, data: { cabecera: persistido!.cabecera, lineas: persistido!.lineas, warnings: calc.warnings } as AsientoGenerarResult };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'No se pudo generar el asiento' };
      }
    },
    [anio, mes],
  );

  // ---- Borrar: elimina el asiento y retrocede el estado ----
  const borrar = useCallback(async (): Promise<ResultadoOperacion<void>> => {
    try {
      const { data: liq, error } = await supabase
        .from('liquidaciones_mes').select('id, estado').eq('anio', anio).eq('mes', mes).maybeSingle();
      if (error) throw new Error(error.message);
      if (!liq) return { ok: false, error: 'No hay liquidación para este mes.' };
      if (liq.estado === 'CERRADO') return { ok: false, error: 'El mes está CERRADO. Reabrilo primero.' };

      const { error: delErr } = await supabase.from('asientos_sueldos').delete().eq('liquidacion_id', liq.id);
      if (delErr) throw new Error(delErr.message);

      if (liq.estado === 'ASIENTO_GENERADO') {
        await supabase.from('liquidaciones_mes').update({ estado: 'CONCILIADO' }).eq('id', liq.id);
      }

      cache.set(cacheKey(anio, mes), { asiento: null, fetchedAt: Date.now() });
      setAsiento(null);
      setWarnings([]);
      return { ok: true, data: undefined };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'No se pudo borrar el asiento' };
    }
  }, [anio, mes]);

  // ---- Derivados ----
  const lineasRecibo = useMemo<AsientoSueldosLinea[]>(() => (asiento?.lineas ?? []).filter((l) => l.seccion === 'recibo'), [asiento]);
  const lineasFacturado = useMemo<AsientoSueldosLinea[]>(() => (asiento?.lineas ?? []).filter((l) => l.seccion === 'facturado'), [asiento]);
  const cuadra = useMemo<boolean>(() => {
    if (!asiento) return false;
    return Math.abs(Number(asiento.cabecera.total_debe) - Number(asiento.cabecera.total_haber)) < 0.01;
  }, [asiento]);

  return { asiento, warnings, loading, error, refetch, generar, borrar, lineasRecibo, lineasFacturado, cuadra };
}

export default useAsiento;
