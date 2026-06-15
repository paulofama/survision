// ============================================
// CLIENTE API ANÁLISIS
// Sistema de Costos - Instituto Dr. Mercado
// Comunicación con endpoints de análisis
// ============================================

const API_BASE_URL = '/api';

// ============================================
// TIPOS
// ============================================

export interface Movimiento {
  id: number;
  fecha: string;
  hora: number;
  paciente: string;
  coseguro: number;
  cobertura: number;
  total: number;
  edad: number;
  diagnostico: string;
  estado: string;
  usuario_alta: string;
  obra_social: {
    nombre: string;
    sigla: string;
  };
  practica: {
    codigo: string;
    nombre: string;
  };
  prestador: {
    id: number | null;
    nombre: string;
  };
}

export interface StatsData {
  hoy: {
    practicas: number;
    ingreso: number;
    coseguro: number;
    cobertura: number;
  };
  mesActual: {
    practicas: number;
    ingreso: number;
    coseguro: number;
    cobertura: number;
  };
  mesAnterior: {
    practicas: number;
    ingreso: number;
  };
  total: {
    practicas: number;
    ingreso: number;
  };
  variacion: {
    porcentaje: number;
    tendencia: 'up' | 'down';
  };
}

export interface AnalisisObraSocial {
  sigla: string;
  nombre: string;
  cantidad: number;
  porcentaje: string;
  ingreso_total: number;
  coseguro_total: number;
  cobertura_total: number;
  ingreso_promedio: number;
}

export interface AnalisisPrestador {
  prestador: string;
  cantidad: number;
  porcentaje: string;
  ingreso_total: number;
  coseguro_total: number;
  cobertura_total: number;
  ingreso_promedio: number;
}

export interface EvolucionMensual {
  periodo: string;
  anio: number;
  mes: number;
  mesNombre: string;
  practicas: number;
  ingreso: number;
  coseguro: number;
  cobertura: number;
}

export interface ObraSocial {
  id: number;
  sigla: string;
  nombre: string;
}

export interface Prestador {
  id: number;
  nombre: string;
  matricula: string;
  especialidad: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  total?: number;
  totalGeneral?: number;
  fuente?: string;
  timestamp: string;
  error?: string;
  message?: string;
}

// ============================================
// FUNCIONES DE MOVIMIENTOS
// ============================================

/**
 * Obtener lista de movimientos/atenciones
 */
export const fetchMovimientos = async (params?: {
  fechaDesde?: string;
  fechaHasta?: string;
  osId?: number;
  prestador?: string;
  limit?: number;
}): Promise<Movimiento[]> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.fechaDesde) queryParams.append('fechaDesde', params.fechaDesde);
    if (params?.fechaHasta) queryParams.append('fechaHasta', params.fechaHasta);
    if (params?.osId) queryParams.append('osId', params.osId.toString());
    if (params?.prestador) queryParams.append('prestador', params.prestador);
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const url = `${API_BASE_URL}/movimientos${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<Movimiento[]> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo movimientos');
    }

    return result.data;
  } catch (error) {
    console.error('❌ Error en fetchMovimientos:', error);
    throw error;
  }
};

/**
 * Obtener estadísticas/KPIs
 */
export const fetchStats = async (): Promise<StatsData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/movimientos/stats`);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<StatsData> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo estadísticas');
    }

    return result.data;
  } catch (error) {
    console.error('❌ Error en fetchStats:', error);
    throw error;
  }
};

/**
 * Obtener análisis por obra social
 */
export const fetchAnalisisPorObraSocial = async (params?: {
  fechaDesde?: string;
  fechaHasta?: string;
}): Promise<{ data: AnalisisObraSocial[]; totalGeneral: number }> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.fechaDesde) queryParams.append('fechaDesde', params.fechaDesde);
    if (params?.fechaHasta) queryParams.append('fechaHasta', params.fechaHasta);

    const url = `${API_BASE_URL}/movimientos/por-obra-social${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<AnalisisObraSocial[]> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo análisis por OS');
    }

    return {
      data: result.data,
      totalGeneral: result.totalGeneral || 0
    };
  } catch (error) {
    console.error('❌ Error en fetchAnalisisPorObraSocial:', error);
    throw error;
  }
};

/**
 * Obtener análisis por prestador
 */
export const fetchAnalisisPorPrestador = async (params?: {
  fechaDesde?: string;
  fechaHasta?: string;
}): Promise<{ data: AnalisisPrestador[]; totalGeneral: number }> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.fechaDesde) queryParams.append('fechaDesde', params.fechaDesde);
    if (params?.fechaHasta) queryParams.append('fechaHasta', params.fechaHasta);

    const url = `${API_BASE_URL}/movimientos/por-prestador${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<AnalisisPrestador[]> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo análisis por prestador');
    }

    return {
      data: result.data,
      totalGeneral: result.totalGeneral || 0
    };
  } catch (error) {
    console.error('❌ Error en fetchAnalisisPorPrestador:', error);
    throw error;
  }
};

/**
 * Obtener evolución mensual
 */
export const fetchEvolucionMensual = async (meses: number = 12): Promise<EvolucionMensual[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/movimientos/evolucion-mensual?meses=${meses}`);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<EvolucionMensual[]> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo evolución mensual');
    }

    return result.data;
  } catch (error) {
    console.error('❌ Error en fetchEvolucionMensual:', error);
    throw error;
  }
};

// ============================================
// FUNCIONES DE CATÁLOGOS
// ============================================

/**
 * Obtener lista de obras sociales
 */
export const fetchObrasSociales = async (): Promise<ObraSocial[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/obras-sociales`);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<ObraSocial[]> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo obras sociales');
    }

    return result.data;
  } catch (error) {
    console.error('❌ Error en fetchObrasSociales:', error);
    throw error;
  }
};

/**
 * Obtener lista de prestadores
 */
export const fetchPrestadores = async (): Promise<Prestador[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/prestadores`);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result: ApiResponse<Prestador[]> = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error obteniendo prestadores');
    }

    return result.data;
  } catch (error) {
    console.error('❌ Error en fetchPrestadores:', error);
    throw error;
  }
};

// ============================================
// EXPORTACIÓN
// ============================================

export default {
  fetchMovimientos,
  fetchStats,
  fetchAnalisisPorObraSocial,
  fetchAnalisisPorPrestador,
  fetchEvolucionMensual,
  fetchObrasSociales,
  fetchPrestadores
};
