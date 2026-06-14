// ===========================================================================
// HOOK: useLiquidacionesAnio - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Lectura LIGERA de las 12 liquidaciones de un anio. Solo metadata de
// `liquidaciones_mes` (sin bloques ni lineas) para alimentar la grilla
// anual del Dashboard.
//
// API:
//   const {
//     liquidaciones,           // LiquidacionMes[] (max 12, una por mes existente)
//     porMes,                  // (mes 1-12) => LiquidacionMes | undefined
//     loading, error, refetch,
//     estadisticas,            // { iniciados, vacios, completos, cerrados, ... }
//   } = useLiquidacionesAnio(2026);
//
// Cache module-level por anio con TTL corto (60s).
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { EstadoLiquidacion, LiquidacionMes } from '../types/sueldos';

// ---------------------------------------------------------------------------
// CACHE
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: LiquidacionMes[];
  fetchedAt: number;
}

const cache = new Map<number, CacheEntry>();
const inflight = new Map<number, Promise<LiquidacionMes[]>>();

const CACHE_TTL_MS = 60 * 1000;

function isCacheValid(anio: number): boolean {
  const entry = cache.get(anio);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export function invalidarCacheLiquidacionesAnio(anio?: number): void {
  if (anio === undefined) cache.clear();
  else cache.delete(anio);
}

async function fetchLiquidacionesAnio(anio: number, force = false): Promise<LiquidacionMes[]> {
  if (!force && isCacheValid(anio)) return cache.get(anio)!.data;
  const existing = inflight.get(anio);
  if (existing) return existing;

  const promise = (async () => {
    const { data, error } = await supabase
      .from('liquidaciones_mes')
      .select('*')
      .eq('anio', anio)
      .order('mes', { ascending: true });

    if (error) throw new Error(error.message || 'Error cargando liquidaciones del anio');

    const rows = (data || []) as LiquidacionMes[];
    cache.set(anio, { data: rows, fetchedAt: Date.now() });
    return rows;
  })();

  inflight.set(anio, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(anio);
  }
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

export interface EstadisticasAnio {
  /** Meses con fila en liquidaciones_mes (cualquier estado). */
  iniciados: number;
  /** Estados especificos. */
  vacios: number;
  enCarga: number;
  conMinutaCompleta: number;
  conciliados: number;
  conAsiento: number;
  cerrados: number;
  /** 12 - iniciados (cuantos meses no tienen fila siquiera). */
  sinIniciar: number;
}

interface UseLiquidacionesAnioReturn {
  liquidaciones: LiquidacionMes[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  /** Devuelve la liquidacion del mes (1-12) o undefined si no existe. */
  porMes: (mes: number) => LiquidacionMes | undefined;

  estadisticas: EstadisticasAnio;
}

export function useLiquidacionesAnio(anio: number): UseLiquidacionesAnioReturn {
  const initial = cache.get(anio);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionMes[]>(
    initial?.data ?? []
  );
  const [loading, setLoading] = useState<boolean>(!isCacheValid(anio));
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchLiquidacionesAnio(anio, force);
      setLiquidaciones(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      console.error(`[useLiquidacionesAnio ${anio}] Error:`, err);
    } finally {
      setLoading(false);
    }
  }, [anio]);

  useEffect(() => {
    if (isCacheValid(anio) && cache.get(anio)) {
      setLiquidaciones(cache.get(anio)!.data);
      setLoading(false);
      return;
    }
    cargar(false);
  }, [anio, cargar]);

  const refetch = useCallback(async () => {
    invalidarCacheLiquidacionesAnio(anio);
    await cargar(true);
  }, [anio, cargar]);

  // ----- Derivados ---------------------------------------------------------

  const porMes = useCallback(
    (mes: number) => liquidaciones.find((l) => l.mes === mes),
    [liquidaciones]
  );

  const estadisticas = useMemo<EstadisticasAnio>(() => {
    const cuenta = (estado: EstadoLiquidacion) =>
      liquidaciones.filter((l) => l.estado === estado).length;
    return {
      iniciados: liquidaciones.length,
      vacios: cuenta('VACIO'),
      enCarga: cuenta('MINUTA_EN_CARGA'),
      conMinutaCompleta: cuenta('MINUTA_COMPLETA'),
      conciliados: cuenta('CONCILIADO'),
      conAsiento: cuenta('ASIENTO_GENERADO'),
      cerrados: cuenta('CERRADO'),
      sinIniciar: 12 - liquidaciones.length,
    };
  }, [liquidaciones]);

  return {
    liquidaciones,
    loading,
    error,
    refetch,
    porMes,
    estadisticas,
  };
}

export default useLiquidacionesAnio;
