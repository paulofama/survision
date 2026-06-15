// ============================================
// TIPOS PARA POOLS DE INSUMOS
// Sistema de Costos - Instituto Dr. Mercado
// ACTUALIZADO: Con campos de prorrateo
// ============================================

import { DatabaseEntity, InsumoVariable } from './index';

// ============================================
// POOL DE INSUMOS
// ============================================

export interface Pool extends DatabaseEntity {
  nombre: string;
  descripcion?: string;
  tipo_consumo: 'Anual' | 'Mensual' | 'Trimestral' | 'Semestral';
  activo: boolean;
}

export interface NuevoPool {
  nombre: string;
  descripcion?: string;
  tipo_consumo: 'Anual' | 'Mensual' | 'Trimestral' | 'Semestral';
  activo?: boolean;
}

// ============================================
// ITEMS DE POOL (Relación Pool <-> Insumo)
// ============================================

export interface PoolItem extends DatabaseEntity {
  pool_id: string;
  insumo_id: string;
  cantidad: number;
  factor_ajuste: number;
}

export interface PoolItemConInsumo extends PoolItem {
  insumo?: InsumoVariable;
  costo_calculado?: number;
}

export interface NuevoPoolItem {
  pool_id: string;
  insumo_id: string;
  cantidad?: number;
  factor_ajuste?: number;
}

// ============================================
// POOL CON ITEMS Y ESTADÍSTICAS
// ACTUALIZADO: Incluye campos de prorrateo
// ============================================

export interface PoolConItems extends Pool {
  items: PoolItemConInsumo[];
  costo_total: number;
  cantidad_items: number;
  // NUEVOS CAMPOS PARA PRORRATEO
  total_practicas_mes: number;    // Suma de cantidad_mensual_estimada de todas las recetas que usan este pool
  costo_por_practica: number;     // costo_total / total_practicas_mes
}

// ============================================
// ASIGNACIÓN DE PRESTACIONES
// ============================================

export interface PrestacionInsumo extends DatabaseEntity {
  prestacion_id: string;
  insumo_id?: string;      // Para asignación directa
  pool_id?: string;        // Para asignación por pool
  tipo_asignacion: 'directo' | 'pool';
  cantidad_uso: number;
  factor_ajuste: number;
  es_opcional: boolean;
  observaciones?: string;
}

export interface PrestacionInsumoCompleto extends PrestacionInsumo {
  insumo?: InsumoVariable;
  pool?: Pool;
  costo_calculado?: number;
}

export interface NuevaPrestacionInsumo {
  prestacion_id: string;
  insumo_id?: string;
  pool_id?: string;
  tipo_asignacion: 'directo' | 'pool';
  cantidad_uso?: number;
  factor_ajuste?: number;
  es_opcional?: boolean;
  observaciones?: string;
}

// ============================================
// ESTADÍSTICAS DE POOLS
// ============================================

export interface EstadisticasPools {
  total_pools: number;
  pools_activos: number;
  total_items: number;
  costo_total_pools: number;
  pool_mayor_costo: string;
  pool_mas_items: string;
}

// ============================================
// RETURN TYPE DEL HOOK
// ============================================

export interface UsePoolsReturn {
  // Estado
  pools: PoolConItems[];
  loading: boolean;
  error: string | null;
  
  // CRUD Pools
  createPool: (data: NuevoPool) => Promise<Pool>;
  updatePool: (id: string, data: Partial<Pool>) => Promise<void>;
  deletePool: (id: string) => Promise<void>;
  
  // Gestión de Items
  addItemToPool: (poolId: string, insumoId: string, cantidad?: number, factor?: number) => Promise<void>;
  removeItemFromPool: (poolId: string, insumoId: string) => Promise<void>;
  updatePoolItem: (poolId: string, insumoId: string, cantidad: number, factor: number) => Promise<void>;
  
  // Utilidades
  getPoolById: (id: string) => PoolConItems | undefined;
  getPoolItems: (poolId: string) => PoolItemConInsumo[];
  calcularCostoPool: (poolId: string) => number;
  
  // Refetch
  refetch: () => Promise<void>;
  
  // Estadísticas
  estadisticas: EstadisticasPools;
}

// ============================================
// COLORES PARA POOLS
// ============================================

export const POOL_COLORS: Record<string, string> = {
  'Insumos Generales en Consultorio': 'bg-blue-100 text-blue-800 border-blue-300',
  'Insumos Generales en Quirófano': 'bg-green-100 text-green-800 border-green-300',
  'Kit Parabulbar': 'bg-purple-100 text-purple-800 border-purple-300',
  'Kit Para RFG': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'Re Esterilizable Catarata': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Re Esterilizable Retina': 'bg-orange-100 text-orange-800 border-orange-300',
  'Re Esterilizable + Lavado': 'bg-red-100 text-red-800 border-red-300',
  'Kit Sedación': 'bg-gray-100 text-gray-800 border-gray-300',
};

export const getPoolColor = (poolName: string): string => {
  return POOL_COLORS[poolName] || 'bg-slate-100 text-slate-800 border-slate-300';
};
