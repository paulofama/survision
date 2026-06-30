// ============================================================
// HOOK: useTurnosFuturos — lee la agenda de turnos futuros (espejo Supabase)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Lee la tabla turnos_futuros (espejo que refresca el daemon on-prem desde
// GECLISA, 2 veces/día). Solo turnos VIGENTES (tur_fecha>=hoy y no atendidos).
// Pagina defensivamente con .range() por si superara las 1000 filas (hoy ~245).
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';

export interface TurnoFuturo {
  turno_id: number;
  fecha: string;          // "YYYY-MM-DD"
  hora: string;           // "HH:MM"
  hs_ini: number | null;
  paciente: string;       // "APELLIDO, Nombre"
  telefono_norm: string | null; // "549XXXXXXXXXX" listo para wa.me, o null
  prestador: string;
  serv_id: number | null;
  servicio: string;
  obra_social: string;
  confirmado: boolean;
  synced_at: string;
}

interface UseTurnosFuturosResult {
  turnos: TurnoFuturo[];
  loading: boolean;
  error: string | null;
  ultimaActualizacion: Date | null;
  refetch: () => void;
}

const PAGE_SIZE = 1000;

export function useTurnosFuturos(): UseTurnosFuturosResult {
  const [turnos, setTurnos] = useState<TurnoFuturo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const acumulado: TurnoFuturo[] = [];
      let from = 0;
      // Paginación defensiva (PostgREST corta en 1000 por request).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error: sbErr } = await supabase
          .from('turnos_futuros')
          .select('*')
          .order('fecha', { ascending: true })
          .order('hs_ini', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (sbErr) throw new Error(sbErr.message);
        const lote = (data || []) as TurnoFuturo[];
        acumulado.push(...lote);
        if (lote.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      setTurnos(acumulado);
      const sync = acumulado[0]?.synced_at;
      setUltimaActualizacion(sync ? new Date(sync) : null);
    } catch (err) {
      console.error('Error cargando turnos futuros:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Auto-refresh: re-lee cada 30 s para reflejar turnos recién cargados sin que
  // el usuario apriete "Actualizar". Solo con la pestaña visible (no gasta de
  // fondo) y dispara una recarga al volver a la pestaña. El daemon sincroniza
  // GECLISA->Supabase cada 1 min; combinado, un turno nuevo aparece solo en ~1 min.
  useEffect(() => {
    const POLL_MS = 30_000;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        cargar();
      }
    };
    const intervalo = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cargar]);

  return { turnos, loading, error, ultimaActualizacion, refetch: cargar };
}
