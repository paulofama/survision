// ===========================================================================
// HOOK: useConciliacion - MODULO CARGA DE SUELDOS (Fase 3)
// ===========================================================================
// v2 (2026): corre el engine de conciliación EN EL BROWSER y persiste en
// Supabase (antes: endpoints /api/conciliacion/*). Así funciona desde internet
// sin backend on-prem. Las tablas tienen RLS con policy ALL para authenticated.
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';
import { conciliar } from '../services/conciliacionEngine';
import { cargarLiquidacionCompleta, cargarF931Confirmado } from '../services/cargarSupabase';
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
// HELPERS de datos (Supabase)
// ---------------------------------------------------------------------------

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function calcularResumen(
  difs: ConciliacionDiferencia[],
  liquidacionId: string | null,
  tieneF931: boolean,
): ResumenConciliacion {
  return {
    liquidacion_id: liquidacionId,
    tiene_f931_confirmado: tieneF931,
    total_diferencias: difs.length,
    auto_justificadas: difs.filter((d) => d.tipo_diferencia.startsWith('AUTO_')).length,
    residuales_pendientes: difs.filter((d) => d.tipo_diferencia === 'MATERIAL_RESIDUAL' && !d.justificada).length,
    justificadas_manualmente: difs.filter((d) => d.tipo_diferencia === 'JUSTIFICADA_MANUAL').length,
    monto_total_diferencias_absoluto: difs.reduce((s, d) => s + Math.abs(num(d.monto_minuta) - num(d.monto_f931)), 0),
    conciliado_completo: difs.length > 0 && difs.every((d) => d.justificada),
  } as ResumenConciliacion;
}

async function leerDiferencias(liquidacionId: string): Promise<ConciliacionDiferencia[]> {
  const { data, error } = await supabase
    .from('conciliacion_diferencias').select('*').eq('liquidacion_id', liquidacionId)
    .order('bloque_tipo').order('concepto_codigo');
  if (error) throw new Error(error.message);
  return (data || []) as ConciliacionDiferencia[];
}

async function fetchConciliacion(anio: number, mes: number, force = false): Promise<CacheEntry> {
  const key = cacheKey(anio, mes);
  if (!force && isCacheValid(key)) return cache.get(key)!;
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<CacheEntry> => {
    const { data: liq, error } = await supabase
      .from('liquidaciones_mes').select('id').eq('anio', anio).eq('mes', mes).maybeSingle();
    if (error) throw new Error(error.message);
    if (!liq) {
      const entry: CacheEntry = { diferencias: [], resumen: null, fetchedAt: Date.now() };
      cache.set(key, entry);
      return entry;
    }
    const [difs, f931] = await Promise.all([leerDiferencias(liq.id), cargarF931Confirmado(anio, mes)]);
    const entry: CacheEntry = {
      diferencias: difs,
      resumen: calcularResumen(difs, liq.id, !!f931),
      fetchedAt: Date.now(),
    };
    cache.set(key, entry);
    return entry;
  })();

  inflight.set(key, promise);
  try { return await promise; } finally { inflight.delete(key); }
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
  justificarManual: (id: string, justificacion: string, nombreUsuario?: string) => Promise<ResultadoOperacion<ConciliacionDiferencia>>;
  diferenciasPorBloque: Map<TipoBloque, ConciliacionDiferencia[]>;
  pendientes: ConciliacionDiferencia[];
}

export function useConciliacion(anio: number, mes: number): UseConciliacionReturn {
  const key = cacheKey(anio, mes);
  const initial = cache.get(key);

  const [diferencias, setDiferencias] = useState<ConciliacionDiferencia[]>(initial?.diferencias ?? []);
  const [resumen, setResumen] = useState<ResumenConciliacion | null>(initial?.resumen ?? null);
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
      setError(err instanceof Error ? err.message : 'Error desconocido');
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

  // ---- Recalcular: corre el engine y persiste preservando JUSTIFICADA_MANUAL ----
  const recalcular = useCallback(async (): Promise<
    ResultadoOperacion<{ diferencias: ConciliacionDiferencia[]; resumen: ResumenConciliacion }>
  > => {
    try {
      const liq = await cargarLiquidacionCompleta(anio, mes);
      if (!liq) return { ok: false, error: `No hay liquidación para ${mes}/${anio}.` };
      const f931 = await cargarF931Confirmado(anio, mes);
      if (!f931) return { ok: false, error: 'No hay un F.931 confirmado para este mes. Cargá y confirmá el F.931 primero.' };

      const { diferencias: nuevas } = conciliar(liq as any, f931);

      // Diferencias existentes -> preservar las JUSTIFICADA_MANUAL
      const existentes = await leerDiferencias(liq.id);
      const claveExistente = new Map<string, ConciliacionDiferencia>();
      for (const d of existentes) claveExistente.set(`${d.bloque_tipo}::${d.concepto_codigo ?? ''}`, d);

      const idsBorrar = existentes.filter((d) => d.tipo_diferencia !== 'JUSTIFICADA_MANUAL').map((d) => d.id);
      if (idsBorrar.length > 0) {
        const { error } = await supabase.from('conciliacion_diferencias').delete().in('id', idsBorrar);
        if (error) throw new Error(error.message);
      }

      const aInsertar = nuevas
        .filter((d) => {
          const prev = claveExistente.get(`${d.bloque_tipo}::${d.concepto_codigo ?? ''}`);
          return !(prev && prev.tipo_diferencia === 'JUSTIFICADA_MANUAL');
        })
        .map((d) => ({
          liquidacion_id: liq.id,
          bloque_tipo: d.bloque_tipo,
          concepto_codigo: d.concepto_codigo,
          monto_minuta: d.monto_minuta,
          monto_f931: d.monto_f931,
          tipo_diferencia: d.tipo_diferencia,
          justificada: d.justificada,
          justificacion: d.justificacion,
          // 'diferencia' es GENERATED en la BD -> no se envía
        }));
      if (aInsertar.length > 0) {
        const { error } = await supabase.from('conciliacion_diferencias').insert(aInsertar);
        if (error) throw new Error(error.message);
      }

      const finales = await leerDiferencias(liq.id);
      const res = calcularResumen(finales, liq.id, true);
      cache.set(cacheKey(anio, mes), { diferencias: finales, resumen: res, fetchedAt: Date.now() });
      setDiferencias(finales);
      setResumen(res);
      return { ok: true, data: { diferencias: finales, resumen: res } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'No se pudo recalcular' };
    }
  }, [anio, mes]);

  // ---- Justificar manualmente (UPDATE directo) ----
  const justificarManual = useCallback(
    async (id: string, justificacion: string, nombreUsuario?: string): Promise<ResultadoOperacion<ConciliacionDiferencia>> => {
      try {
        if (!justificacion || justificacion.trim().length < 5) {
          return { ok: false, error: 'La justificación debe tener al menos 5 caracteres.' };
        }
        const { data, error } = await supabase
          .from('conciliacion_diferencias')
          .update({
            tipo_diferencia: 'JUSTIFICADA_MANUAL',
            justificada: true,
            justificacion: justificacion.trim(),
            justificada_at: new Date().toISOString(),
            justificada_por_nombre: nombreUsuario || null,
          })
          .eq('id', id).select().single();
        if (error) throw new Error(error.message);
        await refetch();
        return { ok: true, data: data as ConciliacionDiferencia };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'No se pudo justificar' };
      }
    },
    [refetch],
  );

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
    [diferencias],
  );

  return { diferencias, resumen, loading, error, refetch, recalcular, justificarManual, diferenciasPorBloque, pendientes };
}

export default useConciliacion;
