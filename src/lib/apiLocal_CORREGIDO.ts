// =====================================================
// API LOCAL - CONEXIÓN CON BACKEND EXPRESS
// Sistema de Costos - Instituto Dr. Mercado
// =====================================================
// Maneja la comunicación con el servidor Express local
// que conecta con SQL Server (GECLISA)
// =====================================================

import { API_BASE_URL, checkApiConnection } from './apiConfig';

// Re-exportar para compatibilidad
export { API_BASE_URL, checkApiConnection };

// =====================================================
// TIPOS
// =====================================================

export interface PrestacionLocal {
  id: string;
  codigo: string;
  practica: string;
  agrupacion_id: string;
  agrupacion_nombre: string;
  agrupacion_color?: string;
  segmento: string;
  precio: number;
  moneda: string;
  activa: boolean;
  observaciones?: string;
  orden?: number;
  cantidad_maxima?: number;
  modulo?: string;
  tipo_cirugia?: number;
  dias_internacion?: number;
  duracion_dias?: number;
  created_at: string;
  updated_at: string;
  fuente: string;
}

export interface PrestadorActivo {
  geclisa_pre_id: number;
  nombre: string;
  matricula_provincial: number | null;
  cuit: string | null;
  total_practicas: number;
}

export interface ElementoGeclisa {
  geclisa_ele_id: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  tipo_elemento: number;
  stock_actual: number;
  stock_minimo: number;
  punto_reposicion: number;
  precio_unitario: number;
  precio_fecha_desde?: string;
  precio_ultima_modificacion?: string;
}

export interface Erogacion {
  fuente: string;
  id_geclisa: number;
  fecha: string;
  proveedor_nombre: string;
  descripcion: string;
  monto: number;
  categoria_sugerida: string;
  tipo_comprobante: string;
  numero_comprobante: string;
}

export interface PrestacionRealizada {
  id: number;
  fecha: string;
  paciente: string;
  obra_social: string;
  prestador: string;
  practica_codigo: string;
  practica_nombre: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  area: string;
}

// =====================================================
// HELPER: Fetch con manejo de errores
// =====================================================

async function fetchWithErrorHandling<T>(url: string): Promise<T> {
  console.log(`🌐 Fetching: ${url}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error fetching ${url}:`, response.status, errorText);
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error);
    throw error;
  }
}

// =====================================================
// PRESTACIONES (NOMENCLADOR)
// =====================================================

/**
 * Cargar prestaciones desde el servidor local
 * IMPORTANTE: El endpoint correcto es /api/nomenclador (no /api/prestaciones)
 */
export async function fetchPrestacionesLocal(): Promise<PrestacionLocal[]> {
  console.log('📋 Cargando prestaciones desde servidor local...');
  console.log('   URL Base:', API_BASE_URL);
  
  try {
    // ⚠️ CORRECCIÓN: Usar /nomenclador en lugar de /prestaciones
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: PrestacionLocal[];
      total: number;
      conPrecio?: number;
      fuente: string;
    }>(`${API_BASE_URL}/nomenclador`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} prestaciones cargadas (${response.conPrecio || 0} con precio)`);
      return response.data;
    }
    
    console.warn('⚠️ Respuesta sin datos:', response);
    return [];
  } catch (error) {
    console.error('❌ Error cargando prestaciones:', error);
    throw error;
  }
}

/**
 * Buscar prestación por código
 */
export async function fetchPrestacionByCodigo(codigo: string): Promise<PrestacionLocal | null> {
  console.log(`🔍 Buscando prestación: ${codigo}`);
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: PrestacionLocal;
    }>(`${API_BASE_URL}/nomenclador/${encodeURIComponent(codigo)}`);
    
    if (response.success && response.data) {
      return response.data;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error buscando prestación ${codigo}:`, error);
    return null;
  }
}

/**
 * Buscar prestaciones por término
 */
export async function searchPrestaciones(termino: string): Promise<PrestacionLocal[]> {
  console.log(`🔍 Buscando prestaciones: "${termino}"`);
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: PrestacionLocal[];
      total: number;
    }>(`${API_BASE_URL}/nomenclador/search/${encodeURIComponent(termino)}`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} resultados para "${termino}"`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error(`❌ Error buscando prestaciones:`, error);
    return [];
  }
}

/**
 * Actualizar precio de una prestación
 */
export async function updatePrecioPrestacion(
  codigo: string, 
  precio: number, 
  moneda: 'USD' | 'ARS' = 'USD'
): Promise<boolean> {
  console.log(`💰 Actualizando precio: ${codigo} = ${moneda} ${precio}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/nomenclador/precio/${encodeURIComponent(codigo)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ precio, moneda }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error actualizando precio:`, response.status, errorText);
      return false;
    }
    
    const data = await response.json();
    console.log(`✅ Precio actualizado:`, data);
    return data.success;
  } catch (error) {
    console.error(`❌ Error actualizando precio:`, error);
    return false;
  }
}

// =====================================================
// EROGACIONES (COSTOS FIJOS)
// =====================================================

/**
 * Cargar erogaciones de un período específico
 */
export async function fetchErogaciones(anio: number, mes: number): Promise<Erogacion[]> {
  console.log(`💰 Cargando erogaciones ${mes}/${anio}...`);
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: Erogacion[];
      total_registros: number;
    }>(`${API_BASE_URL}/erogaciones/${anio}/${mes}`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} erogaciones cargadas`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando erogaciones:', error);
    throw error;
  }
}

/**
 * Cargar resumen anual de erogaciones
 */
export async function fetchResumenErogaciones(anio: number): Promise<any[]> {
  console.log(`📊 Cargando resumen erogaciones ${anio}...`);
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: any[];
      totales: any;
    }>(`${API_BASE_URL}/erogaciones/resumen/${anio}`);
    
    if (response.success && response.data) {
      console.log(`✅ Resumen ${anio} cargado`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando resumen erogaciones:', error);
    throw error;
  }
}

// =====================================================
// PRESTADORES
// =====================================================

/**
 * Cargar prestadores activos (con prácticas en últimos 2 años)
 */
export async function fetchPrestadoresActivos(): Promise<PrestadorActivo[]> {
  console.log('👨‍⚕️ Cargando prestadores activos...');
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: PrestadorActivo[];
      total: number;
    }>(`${API_BASE_URL}/prestadores-geclisa/activos`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} prestadores activos cargados`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando prestadores:', error);
    throw error;
  }
}

/**
 * Cargar todos los prestadores
 */
export async function fetchTodosPrestadores(): Promise<PrestadorActivo[]> {
  console.log('👨‍⚕️ Cargando todos los prestadores...');
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: PrestadorActivo[];
      total: number;
    }>(`${API_BASE_URL}/prestadores-geclisa`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} prestadores cargados`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando prestadores:', error);
    throw error;
  }
}

// =====================================================
// ELEMENTOS (INSUMOS)
// =====================================================

/**
 * Cargar elementos/insumos de GECLISA
 */
export async function fetchElementosGeclisa(tipoElemento: number = 125): Promise<ElementoGeclisa[]> {
  console.log(`📦 Cargando elementos tipo ${tipoElemento}...`);
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: ElementoGeclisa[];
      total: number;
    }>(`${API_BASE_URL}/elementos-geclisa?tipoElemento=${tipoElemento}`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} elementos cargados`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando elementos:', error);
    throw error;
  }
}

/**
 * Estadísticas de elementos
 */
export async function fetchElementosStats(tipoElemento: number = 125): Promise<any> {
  console.log(`📊 Cargando estadísticas de elementos...`);
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: any;
    }>(`${API_BASE_URL}/elementos-geclisa/stats?tipoElemento=${tipoElemento}`);
    
    if (response.success && response.data) {
      return response.data;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error cargando estadísticas:', error);
    return null;
  }
}

// =====================================================
// PRESTACIONES REALIZADAS (Dashboard Power BI)
// =====================================================

export interface FiltrosPrestaciones {
  fechaDesde?: string;
  fechaHasta?: string;
  obraSocial?: string;
  prestador?: string;
  segmento?: string;
  limit?: number;
  offset?: number;
}

/**
 * Cargar prestaciones realizadas con filtros
 */
export async function fetchPrestacionesRealizadas(
  filtros: FiltrosPrestaciones = {}
): Promise<PrestacionRealizada[]> {
  console.log('📊 Cargando prestaciones realizadas...');
  
  try {
    const params = new URLSearchParams();
    
    if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
    if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
    if (filtros.obraSocial) params.append('obraSocial', filtros.obraSocial);
    if (filtros.prestador) params.append('prestador', filtros.prestador);
    if (filtros.segmento) params.append('segmento', filtros.segmento);
    if (filtros.limit) params.append('limit', filtros.limit.toString());
    if (filtros.offset) params.append('offset', filtros.offset.toString());
    
    const queryString = params.toString();
    const url = `${API_BASE_URL}/prestaciones-realizadas${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: PrestacionRealizada[];
      total: number;
    }>(url);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} prestaciones realizadas cargadas`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando prestaciones realizadas:', error);
    throw error;
  }
}

/**
 * Estadísticas de prestaciones realizadas
 */
export async function fetchPrestacionesRealizadasStats(
  filtros: FiltrosPrestaciones = {}
): Promise<any> {
  console.log('📊 Cargando estadísticas de prestaciones...');
  
  try {
    const params = new URLSearchParams();
    
    if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
    if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
    if (filtros.obraSocial) params.append('obraSocial', filtros.obraSocial);
    if (filtros.prestador) params.append('prestador', filtros.prestador);
    
    const queryString = params.toString();
    const url = `${API_BASE_URL}/prestaciones-realizadas/stats${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: any;
    }>(url);
    
    if (response.success && response.data) {
      return response.data;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error cargando estadísticas:', error);
    return null;
  }
}

/**
 * Obtener filtros disponibles
 */
export async function fetchFiltrosDisponibles(): Promise<{
  obrasSociales: string[];
  prestadores: string[];
  segmentos: string[];
}> {
  console.log('🔍 Cargando filtros disponibles...');
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: {
        obrasSociales: string[];
        prestadores: string[];
        segmentos: string[];
      };
    }>(`${API_BASE_URL}/prestaciones-realizadas/filtros`);
    
    if (response.success && response.data) {
      return response.data;
    }
    
    return { obrasSociales: [], prestadores: [], segmentos: [] };
  } catch (error) {
    console.error('❌ Error cargando filtros:', error);
    return { obrasSociales: [], prestadores: [], segmentos: [] };
  }
}

// =====================================================
// TURNOS
// =====================================================

/**
 * Cargar análisis de turnos
 */
export async function fetchTurnosAnalisis(): Promise<any> {
  console.log('📅 Cargando análisis de turnos...');
  
  try {
    const response = await fetchWithErrorHandling<any>(`${API_BASE_URL}/turnos/analisis`);
    return response;
  } catch (error) {
    console.error('❌ Error cargando turnos:', error);
    throw error;
  }
}

/**
 * Turnos de hoy
 */
export async function fetchTurnosHoy(): Promise<any[]> {
  console.log('📅 Cargando turnos de hoy...');
  
  try {
    const response = await fetchWithErrorHandling<any[]>(`${API_BASE_URL}/turnos/hoy`);
    return response || [];
  } catch (error) {
    console.error('❌ Error cargando turnos de hoy:', error);
    return [];
  }
}

// =====================================================
// OBRAS SOCIALES
// =====================================================

/**
 * Cargar obras sociales
 */
export async function fetchObrasSociales(): Promise<any[]> {
  console.log('🏥 Cargando obras sociales...');
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: any[];
      total: number;
    }>(`${API_BASE_URL}/obras-sociales`);
    
    if (response.success && response.data) {
      console.log(`✅ ${response.data.length} obras sociales cargadas`);
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error cargando obras sociales:', error);
    throw error;
  }
}

// =====================================================
// TIPO DE CAMBIO
// =====================================================

/**
 * Obtener tipo de cambio USD/ARS del BCRA
 */
export async function fetchTipoCambio(): Promise<{
  compra: number;
  venta: number;
  fecha: string;
} | null> {
  console.log('💱 Obteniendo tipo de cambio...');
  
  try {
    const response = await fetchWithErrorHandling<{
      success: boolean;
      data: {
        compra: number;
        venta: number;
        fecha: string;
      };
    }>(`${API_BASE_URL}/nomenclador/tipocambio`);
    
    if (response.success && response.data) {
      console.log(`✅ Tipo de cambio: ${response.data.compra}`);
      return response.data;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error obteniendo tipo de cambio:', error);
    return null;
  }
}

// =====================================================
// HEALTH CHECK
// =====================================================

/**
 * Verificar estado del servidor backend
 */
export async function healthCheck(): Promise<{
  status: string;
  version: string;
  network: {
    localIP: string;
    port: number;
  };
} | null> {
  console.log('❤️ Verificando estado del servidor...');
  
  try {
    const response = await fetchWithErrorHandling<{
      status: string;
      version: string;
      network: {
        localIP: string;
        port: number;
      };
    }>(`${API_BASE_URL}/health`);
    
    console.log(`✅ Servidor OK: v${response.version}`);
    return response;
  } catch (error) {
    console.error('❌ Servidor no disponible:', error);
    return null;
  }
}

/**
 * Alias para healthCheck - compatibilidad con hooks existentes
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const result = await healthCheck();
    return result !== null && result.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Obtener URL base del API (para debugging)
 */
export function getApiUrl(): string {
  return API_BASE_URL;
}
