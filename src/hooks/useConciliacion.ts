// ===========================================================================
// HOOK: useConciliacion - MODULO CARGA DE SUELDOS (Fase 3)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Wrapper de los endpoints de conciliacion:
//   - GET   /api/conciliacion/:anio/:mes
//   - POST  /api/conciliacion/:anio/:mes/recalcular
//   - PATCH /api/conciliacion/diferencia/:id/justificar
//
// API:
//   const {
//     diferencias,                  // ConciliacionDiferencia[]
//     resumen,                      // ResumenConciliacion | null
//     loading, error, refetch,
//
//     recalcular,                   // () => Promise<ResultadoOperacion<...>>
//     justificarManual,             // (id, justif, nombreUsuario?) => ResultadoOperacion<ConciliacionDiferencia>
//
//     // Derivados
//     diferenciasPorBloque,         // Map<TipoBloque, ConciliacionDiferencia[]>
//     pendientes,                   // ConciliacionDiferencia[] (MATERIAL_RESIDUAL sin justificar)
//   } = useConciliacion(2026, 5);
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  ConciliacionDiferencia,
  ResultadoOperacion,
  ResumenConciliacion,
  TipoBloque,
} from '../types/sueldos';

// ---------------------------------------------------------------------------
// CACHE MODULE-LEVEL
// ---------------------------------------------------------------------------

interface CacheEntry {
  diferencias: ConciliacionDiferencia[];
  resumen: ResumenConciliacion | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

const CACHE_TTL_MS = 60 * 1000;

function cacheKey(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function isCacheValid(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export function invalidarCacheConciliacion(anio?: number, mes?: number): void {
  if (anio === undefined || mes === undefined) cache.clear();
  else cache.delete(cacheKey(anio, mes));
}

// ---------------------------------------------------------------------------
// LLAMADAS HTTP
// ---------------------------------------------------------------------------

async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: T | null; error?: string }> {
  try {
    const resp = await fetch(url, init);
    let body: T | null = null;
    try {
      body = (await resp.json()) as T;
    } catch {
      // sin body o no JSON
    }
    if (!resp.ok) {
      const errorMsg =
        (body as { error?: string; detalle?: string } | null)?.error ||
        `Error HTTP ${resp.status}`;
      return { ok: false, status: resp.status, body, error: errorMsg };
    }
    return { ok: true, status: resp.status, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: e instanceof Error ? e.message : 'Error de red',
    };
  }
}

async function fetchConciliacion(
  anio: number,
  mes: number,
  force = false
): Promise<CacheEntry> {
  const key = cacheKey(anio, mes);

  if (!force && isCacheValid(key)) {
    return cache.get(key)!;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<CacheEntry> => {
    const url = `/api/conciliacion/${anio}/${mes}`;
    const res = await fetchJson<{
      diferencias: ConciliacionDiferencia[];
      resumen: ResumenConciliacion;
    }>(url);

    if (!res.ok) {
      // 404 = no hay liquidacion => devolvemos vacio (no es error fatal)
      if (res.status === 404) {
        const entry: CacheEntry = {
          diferencias: [],
          resumen: null,
          fetchedAt: Date.now(),
        };
        cache.set(key, entry);
        return entry;
      }
      throw new Error(res.error || 'Error cargando conciliacion');
    }

    const entry: CacheEntry = {
      diferencias: res.body?.diferencias ?? [],
      resumen: res.body?.resumen ?? null,
      fetchedAt: Date.now(),
    };
    cache.set(key, entry);
    return entry;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

interface UseConciliacionReturn {
  diferencias: ConciliacionDiferencia[];
  resumen: ResumenConciliacion | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  recalcular: () => Promise<ResultadoOperacion<{ diferencias: ConciliacionDiferencia[]; resumen: ResumenConciliacion }>>;
  justificarManual: (
    id: string,
    justificacion: string,
    nombreUsuario?: string
  ) => Promise<ResultadoOperacion<ConciliacionDiferencia>>;

  // Derivados
  diferenciasPorBloque: Map<TipoBloque, ConciliacionDiferencia[]>;
  pendientes: ConciliacionDiferencia[];
}

export function useConciliacion(anio: number, mes: number): UseConciliacionReturn {
  const key = cacheKey(anio, mes);
  const initial = cache.get(key);

  const [diferencias, setDiferencias] = useState<ConciliacionDiferencia[]>(
    initial?.diferencias ?? []
  );
  const [resumen, setResumen] = useState<ResumenConciliacion | null>(
    initial?.resumen ?? null
  );
  const [loading, setLoading] = useState<boolean>(!isCacheValid(key));
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const entry = await fetchConciliacion(anio, mes, force);
      setDiferencias(entry.diferencias);
      setResumen(entry.resumen);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      console.error(`[useConciliacion ${anio}-${mes}] Error:`, err);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    if (isCacheValid(key) && cache.get(key)) {
      const c = cache.get(key)!;
      setDiferencias(c.diferencias);
      setResumen(c.resumen);
      setLoading(false);
      return;
    }
    cargar(false);
  }, [key, cargar]);

  const refetch = useCallback(async () => {
    invalidarCacheConciliacion(anio, mes);
    await cargar(true);
  }, [anio, mes, cargar]);

  // ---- Recalcular ---------------------------------------------------------

  const recalcular = useCallback(async (): Promise<
    ResultadoOperacion<{ diferencias: ConciliacionDiferencia[]; resumen: ResumenConciliacion }>
  > => {
    const url = `/api/conciliacion/${anio}/${mes}/recalcular`;
    const res = await fetchJson<{
      diferencias: ConciliacionDiferencia[];
      resumen: ResumenConciliacion;
      mensaje?: string;
    }>(url, { method: 'POST' });

    if (!res.ok || !res.body) {
      return { ok: false, error: res.error || 'No se pudo recalcular' };
    }

    // Actualizar cache + estado
    cache.set(cacheKey(anio, mes), {
      diferencias: res.body.diferencias,
      resumen: res.body.resumen,
      fetchedAt: Date.now(),
    });
    setDiferencias(res.body.diferencias);
    setResumen(res.body.resumen);

    return { ok: true, data: res.body };
  }, [anio, mes]);

  // ---- Justificar manualmente ---------------------------------------------

  const justificarManual = useCallback(
    async (
      id: string,
      justificacion: string,
      nombreUsuario?: string
    ): Promise<ResultadoOperacion<ConciliacionDiferencia>> => {
      const url = `/api/conciliacion/diferencia/${id}/justificar`;
      const res = await fetchJson<{ diferencia: ConciliacionDiferencia }>(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justificacion,
          justificada_por_nombre: nombreUsuario || null,
        }),
      });

      if (!res.ok || !res.body) {
        return { ok: false, error: res.error || 'No se pudo justificar' };
      }
      await refetch();
      return { ok: true, data: res.body.diferencia };
    },
    [refetch]
  );

  // ---- Derivados ----------------------------------------------------------

  const diferenciasPorBloque = useMemo<Map<TipoBloque, ConciliacionDiferencia[]>>(() => {
    const m = new Map<TipoBloque, ConciliacionDiferencia[]>();
    for (const d of diferencias) {
      const arr = m.get(d.bloque_tipo) ?? [];
      arr.push(d);
      m.set(d.bloque_tipo, arr);
    }
    return m;
  }, [diferencias]);

  const pendientes = useMemo<ConciliacionDiferencia[]>(
    () => diferencias.filter((d) => d.tipo_diferencia === 'MATERIAL_RESIDUAL' && !d.justificada),
    [diferencias]
  );

  return {
    diferencias,
    resumen,
    loading,
    error,
    refetch,
    recalcular,
    justificarManual,
    diferenciasPorBloque,
    pendientes,
  };
}

export default useConciliacion;
