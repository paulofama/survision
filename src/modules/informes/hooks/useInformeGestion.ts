// ============================================================
// HOOK - useInformeGestion
// Fetch y gestión de datos para Informe de Gestión Mensual
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================

import { useState, useCallback } from 'react';
import type {
  DatosInformeGestion,
  EstadoInforme,
  PeriodoInforme,
  crearPeriodo,
  crearFiltros,
} from '@/types/informes';

// ---- Configuración ----
const API_BASE = 'http://localhost:3001/api/informes';

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
    setProgreso(10);

    try {
      setProgreso(30);

      const response = await fetch(
        `${API_BASE}/gestion-mensual?mes=${mes}&anio=${anio}`
      );

      setProgreso(70);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `Error ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      setProgreso(90);

      setDatos(data);
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
