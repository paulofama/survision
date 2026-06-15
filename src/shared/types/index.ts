// ============================================
// TIPOS TYPESCRIPT - SEGMENTOS HOMOGÉNEOS
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

// ============================================
// TIPOS BASE DE SUPABASE
// ============================================

export interface DatabaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// SEGMENTOS HOMOGÉNEOS (TITLE CASE)
// ============================================

export type InsumoSegmento = 
  | 'Insumos Generales En Consultorio'
  | 'Insumos Generales En Quirófano'
  | 'Kit Parabulbar'
  | 'Kit Para RFG'
  | 'Implantes Quirúrgicos'
  | 'Re Esterilizable Catarata'
  | 'Re Esterilizable Retina'
  | 'Re Esterilizable + Lavado'
  | 'Kit Sedación';

// ============================================
// INSUMOS VARIABLES
// ============================================

export interface InsumoVariable extends DatabaseEntity {
  codigo: string;
  descripcion: string;
  segmento: InsumoSegmento;
  precio_unitario: number;
  unidad: string;
  consumo: string;
  cantidad: number;
  activo: boolean;
}

export interface NuevoInsumoVariable {
  codigo: string;
  descripcion: string;
  segmento: InsumoSegmento;
  precio_unitario: number;
  unidad: string;
  consumo: string;
  cantidad: number;
  activo?: boolean;
}

// ============================================
// CONFIGURACIÓN HOMOGÉNEA DE SEGMENTOS
// ============================================

export const SEGMENTOS_CONFIG = {
  'Insumos Generales En Consultorio': {
    color: 'bg-blue-100 text-blue-800',
    prefijo: 'IGC',
    descripcion: 'Insumos para uso en consultorios',
    orden: 1,
  },
  'Insumos Generales En Quirófano': {
    color: 'bg-green-100 text-green-800',
    prefijo: 'IGQ',
    descripcion: 'Insumos para uso en quirófano',
    orden: 2,
  },
  'Kit Parabulbar': {
    color: 'bg-purple-100 text-purple-800',
    prefijo: 'KPB',
    descripcion: 'Kit para anestesia parabulbar',
    orden: 3,
  },
  'Kit Para RFG': {
    color: 'bg-indigo-100 text-indigo-800',
    prefijo: 'RFG',
    descripcion: 'Kit para retinofluoresceíngrafía',
    orden: 4,
  },
  'Implantes Quirúrgicos': {
    color: 'bg-pink-100 text-pink-800',
    prefijo: 'IMP',
    descripcion: 'Implantes para cirugías oftálmicas',
    orden: 5,
  },
  'Re Esterilizable Catarata': {
    color: 'bg-yellow-100 text-yellow-800',
    prefijo: 'REC',
    descripcion: 'Instrumental resterilizable para catarata',
    orden: 6,
  },
  'Re Esterilizable Retina': {
    color: 'bg-orange-100 text-orange-800',
    prefijo: 'RER',
    descripcion: 'Instrumental resterilizable para retina',
    orden: 7,
  },
  'Re Esterilizable + Lavado': {
    color: 'bg-red-100 text-red-800',
    prefijo: 'REL',
    descripcion: 'Instrumental resterilizable con lavado especial',
    orden: 8,
  },
  'Kit Sedación': {
    color: 'bg-gray-100 text-gray-800',
    prefijo: 'SED',
    descripcion: 'Kit para sedación en procedimientos',
    orden: 9,
  },
} as const;

// ============================================
// COLORES POR SEGMENTO (HELPER)
// ============================================

export const segmentoColors: Record<InsumoSegmento, string> = {
  'Insumos Generales En Consultorio': 'bg-blue-100 text-blue-800',
  'Insumos Generales En Quirófano': 'bg-green-100 text-green-800',
  'Kit Parabulbar': 'bg-purple-100 text-purple-800',
  'Kit Para RFG': 'bg-indigo-100 text-indigo-800',
  'Implantes Quirúrgicos': 'bg-pink-100 text-pink-800',
  'Re Esterilizable Catarata': 'bg-yellow-100 text-yellow-800',
  'Re Esterilizable Retina': 'bg-orange-100 text-orange-800',
  'Re Esterilizable + Lavado': 'bg-red-100 text-red-800',
  'Kit Sedación': 'bg-gray-100 text-gray-800',
};

// ============================================
// ARRAY DE SEGMENTOS ORDENADOS
// ============================================

export const SEGMENTOS_ORDENADOS: InsumoSegmento[] = [
  'Insumos Generales En Consultorio',
  'Insumos Generales En Quirófano',
  'Kit Parabulbar',
  'Kit Para RFG',
  'Implantes Quirúrgicos',
  'Re Esterilizable Catarata',
  'Re Esterilizable Retina',
  'Re Esterilizable + Lavado',
  'Kit Sedación',
];

// ============================================
// TIPOS PARA PRESTACIONES (MANTENER)
// ============================================

export interface Agrupacion extends DatabaseEntity {
  nombre: string;
  descripcion?: string;
  color: string;
  orden: number;
  activa: boolean;
}

export interface Prestacion extends DatabaseEntity {
  codigo: string;
  practica: string;
  agrupacion_id?: string;
  precio: number;
  activa: boolean;
  observaciones?: string;
  
  agrupacion_nombre?: string;
  agrupacion_color?: string;
}

export interface PrestacionConAgrupacion extends Prestacion {
  agrupacion?: Agrupacion;
}

export interface NuevaPrestacion {
  codigo: string;
  practica: string;
  agrupacion_id?: string;
  precio?: number;
  observaciones?: string;
  activa?: boolean;
}

// ============================================
// TIPOS DE ESTADO Y UI
// ============================================

export type EstadoOperacion = 'idle' | 'loading' | 'success' | 'error';

export interface EstadisticasPrestaciones {
  total: number;
  porAgrupacion: Record<string, number>;
  precioMinimo: number;
  precioMaximo: number;
  precioPromedio: number;
}

export interface EstadisticasInsumos {
  total: number;
  porSegmento: Record<string, number>;
  costoTotal: number;
  costoPromedio: number;
}

export interface EstadisticasGenerales {
  agrupaciones: number;
  prestaciones: number;
  insumos: number;
  sistema: 'Operativo' | 'Error' | 'Mantenimiento';
}

// ============================================
// TIPOS PARA FORMULARIOS
// ============================================

export interface FormularioPrestacionData {
  codigo: string;
  practica: string;
  agrupacion_id: string;
  precio: string;
  observaciones?: string;
}

export interface FormularioInsumoData {
  codigo: string;
  descripcion: string;
  segmento: InsumoSegmento;
  precio_unitario: string;
  unidad: string;
  consumo: string;
  cantidad: string;
}

// ============================================
// TIPOS PARA FILTROS Y BÚSQUEDA
// ============================================

export interface FiltrosPrestaciones {
  searchTerm: string;
  selectedAgrupacion: string;
  precioMinimo?: number;
  precioMaximo?: number;
}

export interface FiltrosInsumos {
  searchTerm: string;
  selectedSegmento: InsumoSegmento | '';
  precioMinimo?: number;
  precioMaximo?: number;
}

// ============================================
// TIPOS PARA IMPORTACIÓN EXCEL
// ============================================

export interface ResultadoImportacionExcel {
  exitosos: number;
  duplicados: number;
  errores: number;
  detallesErrores: string[];
  datosImportados: any[];
  resumenPorSegmento: Record<string, {
    exitosos: number;
    duplicados: number;
    errores: number;
  }>;
}

// ============================================
// TIPOS PARA HOOKS
// ============================================

export interface UsePrestacionesReturn {
  prestaciones: PrestacionConAgrupacion[];
  agrupaciones: Agrupacion[];
  filteredPrestaciones: PrestacionConAgrupacion[];
  loading: boolean;
  error: string | null;
  
  searchTerm: string;
  selectedAgrupacion: string;
  setSearchTerm: (term: string) => void;
  setSelectedAgrupacion: (agrupacion: string) => void;
  
  createPrestacion: (data: NuevaPrestacion) => Promise<void>;
  updatePrestacion: (id: string, data: Partial<Prestacion>) => Promise<void>;
  deletePrestacion: (id: string) => Promise<void>;
  
  getPrestacionesByAgrupacion: (agrupacionId: string) => PrestacionConAgrupacion[];
  refetch: () => Promise<void>;
  
  estadisticas: EstadisticasPrestaciones;
}

export interface UseInsumosVariablesReturn {
  insumos: InsumoVariable[];
  filteredInsumos: InsumoVariable[];
  loading: boolean;
  error: string | null;
  
  searchTerm: string;
  selectedSegmento: InsumoSegmento | '';
  setSearchTerm: (term: string) => void;
  setSelectedSegmento: (segmento: InsumoSegmento | '') => void;
  
  createInsumo: (data: NuevoInsumoVariable) => Promise<void>;
  updateInsumo: (id: string, data: Partial<InsumoVariable>) => Promise<void>;
  deleteInsumo: (id: string) => Promise<void>;
  
  importFromExcel: (data: any[], segmento?: InsumoSegmento) => Promise<ResultadoImportacionExcel>;
  getInsumosBySegmento: (segmento: InsumoSegmento) => InsumoVariable[];
  refetch: () => Promise<void>;
  
  estadisticas: EstadisticasInsumos;
}

// ============================================
// CONSTANTES DEL SISTEMA
// ============================================

export const SISTEMA_CONFIG = {
  MAX_PRECIO_PRESTACION: 10000000,
  MIN_PRECIO_PRESTACION: 0,
  MAX_CANTIDAD_INSUMO: 10000,
  MIN_CANTIDAD_INSUMO: 0.01,
  MAX_CODIGO_LENGTH: 20,
  MAX_DESCRIPCION_LENGTH: 500,
  CACHE_DURATION: 5 * 60 * 1000,
} as const;

// ============================================
// FUNCIONES HELPER
// ============================================

/**
 * Obtener configuración de segmento
 */
export const getSegmentoConfig = (segmento: InsumoSegmento) => {
  return SEGMENTOS_CONFIG[segmento];
};

/**
 * Obtener color de segmento
 */
export const getSegmentoColor = (segmento: InsumoSegmento): string => {
  return segmentoColors[segmento];
};

/**
 * Obtener todos los segmentos ordenados
 */
export const getAllSegmentos = (): InsumoSegmento[] => {
  return SEGMENTOS_ORDENADOS;
};

/**
 * Formatear precio en pesos argentinos
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Formatear número con separadores
 */
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('es-AR').format(num);
};

/**
 * Validar si un string es un segmento válido
 */
export const isValidSegmento = (value: string): value is InsumoSegmento => {
  return SEGMENTOS_ORDENADOS.includes(value as InsumoSegmento);
};

// ============================================
// TIPOS DE EXPORTACIÓN
// ============================================

// Nota: los tipos (InsumoSegmento, InsumoVariable, etc.) NO pueden ir en un
// objeto runtime; se exportan como named type exports más arriba. Acá solo van
// los valores (consts).
export default {
  SEGMENTOS_CONFIG,
  segmentoColors,
  SEGMENTOS_ORDENADOS,
  SISTEMA_CONFIG,
};