// ============================================
// CLIENTE API ANÁLISIS
// Sistema de Costos - Instituto Dr. Mercado
// Comunicación con endpoints de análisis
// ============================================

import { supabase } from './supabase';

const API_BASE_URL = '/api';

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
 * Obtener estadísticas/KPIs — desde el espejo Supabase (movimientos_geclisa).
 */
export const fetchStats = async (): Promise<StatsData> => {
  const hoy = new Date();
  const anioAct = hoy.getFullYear();
  const mesAct = hoy.getMonth() + 1;
  const mesAnt = mesAct === 1 ? 12 : mesAct - 1;
  const anioMesAnt = mesAct === 1 ? anioAct - 1 : anioAct;
  const hoyStr = hoy.toISOString().split('T')[0];

  const sumRows = (rows: any[] | null) =>
    (rows || []).reduce(
      (a, r) => ({
        practicas: a.practicas + 1,
        ingreso: a.ingreso + (Number(r.total) || 0),
        coseguro: a.coseguro + (Number(r.coseguro) || 0),
        cobertura: a.cobertura + (Number(r.cobertura) || 0),
      }),
      { practicas: 0, ingreso: 0, coseguro: 0, cobertura: 0 },
    );

  const [hoyRes, mesActRes, mesAntRes, totalRes] = await Promise.all([
    supabase.from('movimientos_geclisa').select('total,coseguro,cobertura').eq('es_principal', true).eq('fecha', hoyStr),
    supabase.from('movimientos_geclisa').select('total,coseguro,cobertura').eq('es_principal', true).eq('anio', anioAct).eq('mes', mesAct),
    supabase.from('movimientos_geclisa').select('total,coseguro,cobertura').eq('es_principal', true).eq('anio', anioMesAnt).eq('mes', mesAnt),
    supabase.from('movimientos_geclisa').select('*', { count: 'exact', head: true }).eq('es_principal', true),
  ]);

  const hoyD = sumRows(hoyRes.data as any[]);
  const mesActualD = sumRows(mesActRes.data as any[]);
  const mesAnteriorD = sumRows(mesAntRes.data as any[]);
  const variacionPct = mesAnteriorD.ingreso > 0 ? ((mesActualD.ingreso - mesAnteriorD.ingreso) / mesAnteriorD.ingreso) * 100 : 0;

  return {
    hoy: { practicas: hoyD.practicas, ingreso: hoyD.ingreso, coseguro: hoyD.coseguro, cobertura: hoyD.cobertura },
    mesActual: { practicas: mesActualD.practicas, ingreso: mesActualD.ingreso, coseguro: mesActualD.coseguro, cobertura: mesActualD.cobertura },
    mesAnterior: { practicas: mesAnteriorD.practicas, ingreso: mesAnteriorD.ingreso },
    total: { practicas: totalRes.count || 0, ingreso: 0 },
    variacion: { porcentaje: Math.round(variacionPct * 10) / 10, tendencia: variacionPct >= 0 ? 'up' : 'down' },
  };
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
 * Obtener evolución mensual — desde el espejo Supabase (movimientos_geclisa).
 * Agrupa por (anio, mes) las atenciones (es_principal) de los últimos N meses.
 */
export const fetchEvolucionMensual = async (meses: number = 12): Promise<EvolucionMensual[]> => {
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const desdeStr = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-01`;

  // Traer es_principal del rango (paginado) y agrupar en cliente.
  const filas: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('movimientos_geclisa')
      .select('anio, mes, total, coseguro, cobertura')
      .eq('es_principal', true)
      .gte('fecha', desdeStr)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  const map = new Map<string, { practicas: number; ingreso: number; coseguro: number; cobertura: number }>();
  for (const r of filas) {
    const k = `${r.anio}-${r.mes}`;
    const e = map.get(k) || { practicas: 0, ingreso: 0, coseguro: 0, cobertura: 0 };
    e.practicas += 1;
    e.ingreso += Number(r.total) || 0;
    e.coseguro += Number(r.coseguro) || 0;
    e.cobertura += Number(r.cobertura) || 0;
    map.set(k, e);
  }

  // Lista ordenada de los N meses (incluye meses sin datos en 0).
  const out: EvolucionMensual[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const anio = d.getFullYear();
    const mes = d.getMonth() + 1;
    const e = map.get(`${anio}-${mes}`) || { practicas: 0, ingreso: 0, coseguro: 0, cobertura: 0 };
    out.push({ periodo: `${anio}-${String(mes).padStart(2, '0')}`, anio, mes, mesNombre: `${MESES_CORTO[mes - 1]} ${anio}`, ...e });
  }
  return out;
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
