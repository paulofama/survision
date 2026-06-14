// ===========================================================================
// HOOK: useAsiento - MODULO CARGA DE SUELDOS (Fase 4)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Wrapper de los endpoints de asiento:
//   - GET    /api/asientos/:anio/:mes
//   - POST   /api/asientos/:anio/:mes/generar
//   - DELETE /api/asientos/:anio/:mes
//
// API:
//   const {
//     asiento,                       // AsientoCompleto | null
//     warnings,                      // string[] (de la ultima generacion)
//     loading, error, refetch,
//
//     generar,                       // (criterio?, nombreUsuario?) => ResultadoOperacion<AsientoGenerarResult>
//     borrar,                        // () => ResultadoOperacion<void>
//
//     // Derivados
//     lineasRecibo, lineasFacturado, // AsientoSueldosLinea[]
//     cuadra,                        // boolean (|total_debe - total_haber| < 0.01)
//   } = useAsiento(2025, 12);
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
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

interface CacheEntry {
  asiento: AsientoCompleto | null;
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

export function invalidarCacheAsiento(anio?: number, mes?: number): void {
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

async function fetchAsiento(anio: number, mes: number, force = false): Promise<CacheEntry> {
  const key = cacheKey(anio, mes);

  if (!force && isCacheValid(key)) return cache.get(key)!;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<CacheEntry> => {
    const url = `/api/asientos/${anio}/${mes}`;
    const res = await fetchJson<AsientoCompleto>(url);

    if (!res.ok) {
      // 404 = no hay asiento (o no hay liquidacion) => null, no es error fatal
      if (res.status === 404) {
        const entry: CacheEntry = { asiento: null, fetchedAt: Date.now() };
        cache.set(key, entry);
        return entry;
      }
      throw new Error(res.error || 'Error cargando asiento');
    }

    const entry: CacheEntry = {
      asiento: res.body ?? null,
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

interface UseAsientoReturn {
  asiento: AsientoCompleto | null;
  warnings: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  generar: (
    criterio?: TipoCriterioBruto,
    nombreUsuario?: string
  ) => Promise<ResultadoOperacion<AsientoGenerarResult>>;
  borrar: () => Promise<ResultadoOperacion<void>>;

  // Derivados
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
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
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

  // ---- Generar ------------------------------------------------------------

  const generar = useCallback(
    async (
      criterio: TipoCriterioBruto = 'RECONCILIABLE',
      nombreUsuario?: string
    ): Promise<ResultadoOperacion<AsientoGenerarResult>> => {
      const url = `/api/asientos/${anio}/${mes}/generar`;
      const res = await fetchJson<AsientoGenerarResult>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          criterio,
          generado_por_nombre: nombreUsuario || null,
        }),
      });

      if (!res.ok || !res.body) {
        return { ok: false, error: res.error || 'No se pudo generar el asiento' };
      }

      const nuevo: AsientoCompleto = { cabecera: res.body.cabecera, lineas: res.body.lineas };
      cache.set(cacheKey(anio, mes), { asiento: nuevo, fetchedAt: Date.now() });
      setAsiento(nuevo);
      setWarnings(res.body.warnings ?? []);

      return { ok: true, data: res.body };
    },
    [anio, mes]
  );

  // ---- Borrar -------------------------------------------------------------

  const borrar = useCallback(async (): Promise<ResultadoOperacion<void>> => {
    const url = `/api/asientos/${anio}/${mes}`;
    const res = await fetchJson<{ ok: boolean }>(url, { method: 'DELETE' });

    if (!res.ok) {
      return { ok: false, error: res.error || 'No se pudo borrar el asiento' };
    }

    cache.set(cacheKey(anio, mes), { asiento: null, fetchedAt: Date.now() });
    setAsiento(null);
    setWarnings([]);

    return { ok: true, data: undefined };
  }, [anio, mes]);

  // ---- Derivados ----------------------------------------------------------

  const lineasRecibo = useMemo<AsientoSueldosLinea[]>(
    () => (asiento?.lineas ?? []).filter((l) => l.seccion === 'recibo'),
    [asiento]
  );

  const lineasFacturado = useMemo<AsientoSueldosLinea[]>(
    () => (asiento?.lineas ?? []).filter((l) => l.seccion === 'facturado'),
    [asiento]
  );

  const cuadra = useMemo<boolean>(() => {
    if (!asiento) return false;
    return Math.abs(Number(asiento.cabecera.total_debe) - Number(asiento.cabecera.total_haber)) < 0.01;
  }, [asiento]);

  return {
    asiento,
    warnings,
    loading,
    error,
    refetch,
    generar,
    borrar,
    lineasRecibo,
    lineasFacturado,
    cuadra,
  };
}

export default useAsiento;
