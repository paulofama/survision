// ============================================
// TIPOS: Recetas de Costos por Práctica
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÓN: CANTIDAD MENSUAL
// ============================================

// ============================================
// CATEGORÍAS Y SUBCATEGORÍAS
// ============================================

export type CategoriaPractica = 'Cirugias' | 'Estudios' | 'Consultas';

export const CATEGORIAS_PRACTICAS: CategoriaPractica[] = [
  'Cirugias',
  'Estudios',
  'Consultas'
];

export interface SubcategoriaPractica {
  id: string;
  categoria: CategoriaPractica;
  nombre: string;
  descripcion?: string;
  orden: number;
  activo: boolean;
}

export const SUBCATEGORIAS_DEFAULT: Record<CategoriaPractica, string[]> = {
  'Cirugias': [
    'Catarata',
    'Retina/Vítreo',
    'Glaucoma',
    'Párpados/Órbita',
    'Córnea',
    'Refractiva',
    'Estrabismo',
    'Vías Lagrimales',
    'General'
  ],
  'Estudios': [
    'Diagnóstico Imágenes',
    'Campo Visual',
    'Electrofisiología',
    'Ecografía',
    'Angiografía/RFG',
    'Biometría',
    'General'
  ],
  'Consultas': [
    'Primera Vez',
    'Control',
    'Urgencia',
    'Prequirúrgico',
    'General'
  ]
};

// ============================================
// RECETA DE PRÁCTICA
// ============================================

export interface PracticaReceta {
  id: string;
  codigo_practica: string;
  nombre_practica: string;
  categoria: CategoriaPractica;
  subcategoria: string | null;
  cantidad_mensual_estimada: number;  // CAMBIADO: anual → mensual
  observaciones: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PracticaRecetaConCostos extends PracticaReceta {
  // Costos calculados
  costo_pools: number;
  costo_insumos_directos: number;
  costo_total: number;
  
  // Contadores
  cantidad_pools: number;
  cantidad_insumos_directos: number;
}

export interface NuevaPracticaReceta {
  codigo_practica: string;
  nombre_practica: string;
  categoria: CategoriaPractica;
  subcategoria?: string | null;
  cantidad_mensual_estimada: number;  // CAMBIADO: anual → mensual
  observaciones?: string | null;
}

// ============================================
// POOL ASIGNADO A RECETA
// ============================================

export interface RecetaPool {
  id: string;
  receta_id: string;
  pool_id: string;
  porcentaje_asignacion: number;
  observaciones: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecetaPoolConDetalle extends RecetaPool {
  // Datos del pool
  pool_nombre: string;
  pool_descripcion?: string;
  costo_total_pool: number;
  cantidad_items_pool: number;
  
  // Costo calculado para esta receta
  costo_por_practica: number;
  
  // Datos del prorrateo (para mostrar explicación)
  total_practicas_pool?: number;    // Total de prácticas MENSUALES que usan este pool
  costo_unitario_pool?: number;     // Costo del pool / total prácticas mensual
}

export interface NuevaRecetaPool {
  receta_id: string;
  pool_id: string;
  porcentaje_asignacion?: number;
  observaciones?: string | null;
}

// ============================================
// INSUMO DIRECTO EN RECETA
// ============================================

export interface RecetaInsumoDirecto {
  id: string;
  receta_id: string;
  insumo_id: string;
  cantidad_por_practica: number;
  observaciones: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecetaInsumoDirectoConDetalle extends RecetaInsumoDirecto {
  // Datos del insumo
  insumo_codigo: string;
  insumo_nombre: string;
  insumo_descripcion?: string;
  insumo_segmento: string;
  precio_unitario: number;
  insumo_unidad: string;
  
  // Costo calculado
  costo_total: number;
}

export interface NuevaRecetaInsumoDirecto {
  receta_id: string;
  insumo_id: string;
  cantidad_por_practica: number;
  observaciones?: string | null;
}

// ============================================
// RECETA COMPLETA (Con todos los detalles)
// ============================================

export interface RecetaCompleta extends PracticaReceta {
  // Pools asignados
  pools: RecetaPoolConDetalle[];
  
  // Insumos directos
  insumos_directos: RecetaInsumoDirectoConDetalle[];
  
  // Totales calculados
  totales: {
    costo_pools: number;
    costo_insumos_directos: number;
    costo_total_por_practica: number;
  };
}

// ============================================
// CÁLCULO DE COSTOS (Para Análisis Marginal)
// ============================================

export interface CostoRecetaCalculado {
  codigo_practica: string;
  nombre_practica: string;
  categoria: CategoriaPractica;
  subcategoria: string | null;
  cantidad_mensual_estimada: number;  // CAMBIADO: anual → mensual
  
  // Costos por unidad
  costo_pools_unitario: number;
  costo_insumos_unitario: number;
  costo_total_unitario: number;
  
  // Detalles para tooltip/expandible
  detalle_pools: {
    pool_nombre: string;
    costo_total: number;
    porcentaje: number;
    costo_unitario: number;
  }[];
  
  detalle_insumos: {
    insumo_descripcion: string;
    precio_unitario: number;
    cantidad: number;
    costo_unitario: number;
  }[];
}

// ============================================
// PARA ANÁLISIS MARGINAL
// ============================================

export interface CostoPrestacionAnalisis {
  // Identificación
  codigo_practica: string;
  nombre_practica: string;
  categoria: CategoriaPractica;
  
  // Cantidades
  cantidad_realizada: number;
  cantidad_mensual_estimada: number;  // CAMBIADO: anual → mensual
  
  // Ingresos
  total_facturado: number;
  
  // Costos unitarios (de la receta)
  costo_pools_unitario: number;
  costo_insumos_unitario: number;
  
  // Costos totales (unitario × cantidad)
  costo_honorarios: number;
  costo_pools: number;
  costo_insumos_directos: number;
  costo_total: number;
  
  // Margen
  margen_contribucion: number;
  porcentaje_margen: number;
  
  // Flag para saber si tiene receta configurada
  tiene_receta: boolean;
}

// ============================================
// ESTADÍSTICAS
// ============================================

export interface EstadisticasRecetas {
  total_recetas: number;
  recetas_por_categoria: Record<CategoriaPractica, number>;
  recetas_con_pools: number;
  recetas_con_insumos: number;
  costo_promedio_cirugia: number;
  costo_promedio_estudio: number;
  costo_promedio_consulta: number;
  practicas_sin_receta: number;
}

// ============================================
// RETURN DEL HOOK
// ============================================

export interface UseRecetasCostosReturn {
  // Estado
  recetas: PracticaRecetaConCostos[];
  recetaSeleccionada: RecetaCompleta | null;
  subcategorias: SubcategoriaPractica[];
  loading: boolean;
  error: string | null;
  
  // Filtros
  filtroCategoria: CategoriaPractica | '';
  filtroSubcategoria: string;
  searchTerm: string;
  setFiltroCategoria: (cat: CategoriaPractica | '') => void;
  setFiltroSubcategoria: (sub: string) => void;
  setSearchTerm: (term: string) => void;
  
  // CRUD Recetas
  crearReceta: (data: NuevaPracticaReceta) => Promise<PracticaReceta>;
  actualizarReceta: (id: string, data: Partial<NuevaPracticaReceta>) => Promise<void>;
  eliminarReceta: (id: string) => Promise<void>;
  cargarRecetaCompleta: (id: string) => Promise<RecetaCompleta>;
  
  // Pools de receta
  agregarPoolAReceta: (data: NuevaRecetaPool) => Promise<void>;
  actualizarPoolDeReceta: (id: string, porcentaje: number) => Promise<void>;
  eliminarPoolDeReceta: (id: string) => Promise<void>;
  
  // Insumos directos de receta
  agregarInsumoAReceta: (data: NuevaRecetaInsumoDirecto) => Promise<void>;
  actualizarInsumoDeReceta: (id: string, cantidad: number) => Promise<void>;
  eliminarInsumoDeReceta: (id: string) => Promise<void>;
  
  // Cálculos
  obtenerCostoPorCodigo: (codigo: string) => CostoRecetaCalculado | null;
  obtenerCostosPorCodigos: (codigos: string[]) => Map<string, CostoRecetaCalculado>;
  
  // Utilidades
  refetch: () => Promise<void>;
  estadisticas: EstadisticasRecetas;
}

// ============================================
// COLORES POR CATEGORÍA
// ============================================

export const CATEGORIA_COLORS: Record<CategoriaPractica, string> = {
  'Cirugias': 'bg-red-100 text-red-800',
  'Estudios': 'bg-blue-100 text-blue-800',
  'Consultas': 'bg-green-100 text-green-800'
};

export const CATEGORIA_ICONS: Record<CategoriaPractica, string> = {
  'Cirugias': '🔪',
  'Estudios': '🔬',
  'Consultas': '👨‍⚕️'
};

// ============================================
// HELPERS
// ============================================

/**
 * Formatear categoría para mostrar
 */
export const formatCategoria = (cat: CategoriaPractica): string => {
  const labels: Record<CategoriaPractica, string> = {
    'Cirugias': 'Cirugías',
    'Estudios': 'Estudios',
    'Consultas': 'Consultas'
  };
  return labels[cat] || cat;
};

/**
 * Obtener color de categoría
 */
export const getCategoriaColor = (cat: CategoriaPractica): string => {
  return CATEGORIA_COLORS[cat] || 'bg-gray-100 text-gray-800';
};

/**
 * Calcular costo de pool con prorrateo correcto (MENSUAL)
 * 
 * El costo del pool se divide entre TODAS las prácticas MENSUALES que lo usan.
 * 
 * @param costoTotalPool - Costo total del pool (suma de todos los items)
 * @param totalPracticasMes - Total de prácticas MENSUALES (de todas las recetas que usan este pool)
 * @param porcentajeAsignacion - Porcentaje de asignación a esta receta (default 100%)
 * @returns Costo unitario para esta práctica
 */
export const calcularCostoPoolProrrateado = (
  costoTotalPool: number,
  totalPracticasMes: number,
  porcentajeAsignacion: number = 100
): number => {
  if (totalPracticasMes <= 0) return 0;
  const costoUnitario = costoTotalPool / totalPracticasMes;
  return costoUnitario * (porcentajeAsignacion / 100);
};

/**
 * Calcular costo de insumo directo por práctica
 */
export const calcularCostoInsumoDirecto = (
  precioUnitario: number,
  cantidadPorPractica: number
): number => {
  return precioUnitario * cantidadPorPractica;
};
