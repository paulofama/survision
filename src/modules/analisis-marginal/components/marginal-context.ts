// ============================================
// Contexto de Análisis Marginal — objeto, tipo y hook
// Sistema de Gestión Integral · Survisión S.A.
// ============================================
//
// Separado de `MarginalLayout.tsx` por el mismo motivo que `auth-context.ts`:
// un .tsx que exporta un componente Y otra cosa rompe el Fast Refresh de Vite.
// El .tsx se queda sólo con el layout.
//
// Los tipos de los datos son los que ya devuelven los hooks que los proveen
// (`useMovimientosPrestaciones` y `useHonorariosConfig`): declararlos acá es lo
// que hace que el contexto no pierda el tipo camino a las pantallas.
// ============================================

import { createContext, useContext } from 'react';
import type { OpcionesFiltros, PrestacionRealizada } from '@shared/hooks/useMovimientosPrestaciones';
import type { HonorarioConfig, Prestador } from '@shared/hooks/useHonorariosConfig';
import type { RangoPeriodo } from '../utils/periodo';

/** Una receta con el costo ya prorrateado por pool. */
export interface RecetaConPools {
  codigo_practica: string;
  nombre_practica: string;
  categoria: string;
  cantidad_mensual_estimada: number;
  costo_pool_consultorio: number;
  costo_pool_quirofano: number;
  costo_pool_parabulbar: number;
  costo_pool_rfg: number;
  costo_pool_reesterilizables: number;
  costo_pool_lavado: number;
  costo_pool_faco: number;
  costo_pool_implante: number;
  costo_pool_medicamentos: number;
  costo_pool_descartables: number;
  costo_total_pools: number;
  costo_insumos_directos: number;
  costo_total_unitario: number;
}

export interface MarginalContextType {
  // Datos
  prestaciones: PrestacionRealizada[];
  recetasConPools: RecetaConPools[];
  configHonorarios: HonorarioConfig[];
  prestadoresHonorarios: Prestador[];

  // Período (rango canónico: un mes o varios). Fuente de verdad del período.
  rango: RangoPeriodo;
  setRango: (r: RangoPeriodo) => void;

  // Filtros globales (OS / prestador / segmento; anio/mes quedan por retrocompat,
  // sincronizados desde `rango`).
  filtros: {
    anio: string;
    mes: string;
    obraSocialId: string;
    prestadorId: string;
    segmento: string;
  };
  opcionesFiltros: OpcionesFiltros;

  // Estado
  loading: boolean;
  loadingRecetas: boolean;
  error: string | null;
  isConnected: boolean;

  // Acciones
  aplicarFiltros: (nuevos: Partial<MarginalContextType['filtros']>) => void;
  limpiarFiltros: () => void;
  refetch: () => Promise<void>;
}

export const MarginalContext = createContext<MarginalContextType | null>(null);

export const useMarginalContext = () => {
  const context = useContext(MarginalContext);
  if (!context) {
    throw new Error('useMarginalContext debe usarse dentro de MarginalLayout');
  }
  return context;
};
