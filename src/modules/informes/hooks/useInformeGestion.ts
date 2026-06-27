// ============================================================
// HOOK - useInformeGestion
// Fetch y gestión de datos para Informe de Gestión Mensual
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================

import { useState, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';
import type {
  DatosInformeGestion,
  EstadoInforme,
} from '@shared/types/informes';

interface UseInformeGestionReturn {
  estado: EstadoInforme;
  datos: DatosInformeGestion | null;
  error: string | null;
  progreso: number;
  cargarInforme: (mes: number, anio: number) => Promise<void>;
  limpiar: () => void;
}

export const useInformeGestion = (): UseInformeGestionReturn => {
  const [estado, setEstado] = useState<EstadoInforme>('idle');
  const [datos, setDatos] = useState<DatosInformeGestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);

  const cargarInforme = useCallback(async (mes: number, anio: number) => {
    setEstado('cargando');
    setError(null);
    setProgreso(30);

    try {
      // Lee el snapshot de Supabase (lo refresca el daemon on-prem 2 veces/día).
      // Así la página /informes funciona desde afuera de la clínica.
      const { data, error: sbErr } = await supabase
        .from('dashboards_snapshot')
        .select('payload')
        .eq('modulo', 'informes')
        .eq('anio', anio)
        .eq('mes', mes)
        .maybeSingle();

      setProgreso(80);

      if (sbErr) throw new Error(sbErr.message);
      if (!data) {
        throw new Error('Todavía no hay datos sincronizados para este período. El sync corre 2 veces por día (12:00 y 17:00).');
      }

      setDatos(data.payload as DatosInformeGestion);
      setEstado('listo');
      setProgreso(100);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      setError(mensaje);
      setEstado('error');
      setProgreso(0);
    }
  }, []);

  const limpiar = useCallback(() => {
    setEstado('idle');
    setDatos(null);
    setError(null);
    setProgreso(0);
  }, []);

  return {
    estado,
    datos,
    error,
    progreso,
    cargarInforme,
    limpiar,
  };
};
