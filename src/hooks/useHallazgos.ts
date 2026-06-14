// ===========================================================================
// HOOK: useHallazgos - MODULO CARGA DE SUELDOS (Fase 5)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// CRUD de hallazgos de auditoria (tabla hallazgos_sueldos). Escribe directo a
// Supabase (patron del modulo). El acceso esta gated a nivel app por el permiso
// PERMISO_REPORTES_SUELDOS (solo Auditor) en las pantallas que lo usan.
//
// Uso:
//   const { hallazgos, loading, error, refetch, crear, actualizar, eliminar }
//     = useHallazgos({ liquidacionId });        // hallazgos de un mes
//   const { hallazgos } = useHallazgos({ anio: 2025 });  // todos los del año
//   const { hallazgos } = useHallazgos();                // todos
//
// No se setea updated_at en INSERT/UPDATE (triggers lo manejan).
// ===========================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  HallazgoSueldos,
  HallazgoSueldosNuevo,
  HallazgoSueldosActualizacion,
  ResultadoOperacion,
} from '../types/sueldos';

interface UseHallazgosFiltro {
  liquidacionId?: string;
  anio?: number;
}

interface UseHallazgosReturn {
  hallazgos: HallazgoSueldos[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  crear: (datos: HallazgoSueldosNuevo) => Promise<ResultadoOperacion<HallazgoSueldos>>;
  actualizar: (
    id: string,
    cambios: HallazgoSueldosActualizacion
  ) => Promise<ResultadoOperacion<HallazgoSueldos>>;
  eliminar: (id: string) => Promise<ResultadoOperacion<void>>;
}

export function useHallazgos(filtro: UseHallazgosFiltro = {}): UseHallazgosReturn {
  const { liquidacionId, anio } = filtro;
  const [hallazgos, setHallazgos] = useState<HallazgoSueldos[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('hallazgos_sueldos')
        .select('*')
        .order('criticidad', { ascending: true })
        .order('created_at', { ascending: false });

      if (liquidacionId) query = query.eq('liquidacion_id', liquidacionId);
      else if (anio !== undefined) query = query.eq('anio', anio);

      const { data, error: err } = await query;
      if (err) throw new Error(err.message);
      setHallazgos((data as HallazgoSueldos[]) ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando hallazgos';
      setError(msg);
      console.error('[useHallazgos] Error:', e);
    } finally {
      setLoading(false);
    }
  }, [liquidacionId, anio]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const refetch = useCallback(async () => {
    await cargar();
  }, [cargar]);

  const crear = useCallback(
    async (datos: HallazgoSueldosNuevo): Promise<ResultadoOperacion<HallazgoSueldos>> => {
      try {
        const { data, error: err } = await supabase
          .from('hallazgos_sueldos')
          .insert(datos)
          .select()
          .single();
        if (err) return { ok: false, error: err.message, codigo: err.code };
        await cargar();
        return { ok: true, data: data as HallazgoSueldos };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Error creando hallazgo' };
      }
    },
    [cargar]
  );

  const actualizar = useCallback(
    async (
      id: string,
      cambios: HallazgoSueldosActualizacion
    ): Promise<ResultadoOperacion<HallazgoSueldos>> => {
      try {
        const payload = { ...cambios };
        delete (payload as Record<string, unknown>).updated_at;
        // Coherencia: si pasa a RESUELTO y no trae resuelto_at, sellar ahora
        if (payload.estado === 'RESUELTO' && !payload.resuelto_at) {
          payload.resuelto_at = new Date().toISOString();
        }
        const { data, error: err } = await supabase
          .from('hallazgos_sueldos')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (err) return { ok: false, error: err.message, codigo: err.code };
        await cargar();
        return { ok: true, data: data as HallazgoSueldos };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Error actualizando hallazgo' };
      }
    },
    [cargar]
  );

  const eliminar = useCallback(
    async (id: string): Promise<ResultadoOperacion<void>> => {
      try {
        const { error: err } = await supabase.from('hallazgos_sueldos').delete().eq('id', id);
        if (err) return { ok: false, error: err.message, codigo: err.code };
        await cargar();
        return { ok: true, data: undefined };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Error eliminando hallazgo' };
      }
    },
    [cargar]
  );

  return { hallazgos, loading, error, refetch, crear, actualizar, eliminar };
}

export default useHallazgos;
