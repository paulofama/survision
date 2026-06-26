// ============================================
// HOOK: usePrestaciones - SERVIDOR LOCAL
// Sistema de Costos - Instituto Dr. Mercado
// Fuente: SQL Server Local (GECLISA)
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// ============================================
// INTERFACES Y TIPOS
// ============================================

export interface PrestacionConAgrupacion {
  id: string;
  codigo: string;
  practica: string;
  agrupacion_id?: string;
  agrupacion_nombre?: string;
  agrupacion_color?: string;
  precio: number;
  moneda?: 'USD' | 'ARS';
  activa: boolean;
  observaciones?: string;
  created_at: string;
  updated_at: string;
}

export interface Agrupacion {
  id: string;
  nombre: string;
  descripcion?: string;
  color: string;
  orden: number;
  activa: boolean;
}

interface UsePrestacionesReturn {
  // Estado principal
  prestaciones: PrestacionConAgrupacion[];
  agrupaciones: Agrupacion[];
  filteredPrestaciones: PrestacionConAgrupacion[];
  loading: boolean;
  error: string | null;
  
  // Filtros
  searchTerm: string;
  selectedAgrupacion: string;
  setSearchTerm: (term: string) => void;
  setSelectedAgrupacion: (agrupacion: string) => void;
  
  // Operaciones CRUD (deshabilitadas para servidor local - solo lectura)
  createPrestacion: (data: any) => Promise<void>;
  updatePrestacion: (id: string, data: any) => Promise<void>;
  deletePrestacion: (id: string) => Promise<void>;
  
  // Funciones especiales
  getPrestacionesByAgrupacion: (agrupacionId: string) => PrestacionConAgrupacion[];
  refetch: () => Promise<void>;
  
  // Estado de conexión
  isConnected: boolean;
  fuenteDatos: string;
  
  // Estadísticas
  estadisticas: {
    total: number;
    porAgrupacion: Record<string, number>;
    precioMinimo: number;
    precioMaximo: number;
    precioPromedio: number;
  };
}

// ============================================
// CONFIGURACIÓN DE CACHE
// ============================================

const CACHE_KEY = 'prestaciones-local-v1';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

interface CacheData<T> {
  data: T;
  timestamp: number;
}

const getCachedData = <T>(key: string): T | null => {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    
    const parsed: CacheData<T> = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION;
    
    if (isExpired) {
      sessionStorage.removeItem(key);
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
};

const setCachedData = <T>(key: string, data: T): void => {
  try {
    const cacheData: CacheData<T> = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Error caching data:', error);
  }
};

// ============================================
// AGRUPACIONES PREDEFINIDAS (Solo lectura)
// ============================================

const AGRUPACIONES_DEFAULT: Agrupacion[] = [
  {
    id: '10',
    nombre: 'Cirugías',
    descripcion: 'Procedimientos quirúrgicos oftalmológicos',
    color: '#3B82F6',
    orden: 1,
    activa: true,
  }
];

// ============================================
// HOOK PRINCIPAL
// ============================================

export const usePrestaciones = (): UsePrestacionesReturn => {
  // Estados principales
  const [prestaciones, setPrestaciones] = useState<PrestacionConAgrupacion[]>([]);
  const [agrupaciones] = useState<Agrupacion[]>(AGRUPACIONES_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgrupacion, setSelectedAgrupacion] = useState('');

  // ============================================
  // FUNCIÓN DE CARGA DE DATOS
  // ============================================

  const loadData = useCallback(async (force: boolean = false) => {
    // Intentar cargar desde cache primero
    if (!force) {
      const cached = getCachedData<PrestacionConAgrupacion[]>(CACHE_KEY);
      if (cached) {
        setPrestaciones(cached);
        setIsConnected(true);
        setLoading(false);
        console.log('📦 Datos cargados desde cache');
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Lee directo de Supabase (tabla `prestaciones`), que el daemon on-prem
      // mantiene fresca desde GECLISA (nombres) + precios cargados a mano. Así
      // funciona desde afuera de la clínica, sin pegarle al backend local.
      const { data, error: sbErr } = await supabase
        .from('prestaciones')
        .select('id, codigo, practica, precio, moneda, activa, observaciones, created_at, updated_at')
        .order('codigo', { ascending: true });

      if (sbErr) throw new Error(sbErr.message);

      // Agrupación fija "Cirugías" (id '10'): preserva la UX actual y el filtro.
      const prestacionesFormateadas: PrestacionConAgrupacion[] = (data || []).map((item) => ({
        id: item.id,
        codigo: item.codigo,
        practica: item.practica || '',
        agrupacion_id: '10',
        agrupacion_nombre: 'Cirugías',
        agrupacion_color: '#3B82F6',
        precio: item.precio || 0,
        moneda: (item.moneda as 'USD' | 'ARS') || 'USD',
        activa: item.activa !== false,
        observaciones: item.observaciones || undefined,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));

      setPrestaciones(prestacionesFormateadas);
      setCachedData(CACHE_KEY, prestacionesFormateadas);
      setIsConnected(true);

      console.log(`✅ ${prestacionesFormateadas.length} prestaciones cargadas desde Supabase`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando prestaciones desde Supabase';
      setError(errorMessage);
      setIsConnected(false);
      console.error('❌ Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // OPERACIONES CRUD (Solo lectura - deshabilitadas)
  // ============================================

  const createPrestacion = useCallback(async (_data: any) => {
    console.warn('⚠️ Operación no permitida: El sistema está en modo solo lectura (servidor local)');
    throw new Error('Operación no permitida. Los datos provienen del servidor local y son de solo lectura.');
  }, []);

  const updatePrestacion = useCallback(async (_id: string, _data: any) => {
    console.warn('⚠️ Operación no permitida: El sistema está en modo solo lectura (servidor local)');
    throw new Error('Operación no permitida. Los datos provienen del servidor local y son de solo lectura.');
  }, []);

  const deletePrestacion = useCallback(async (_id: string) => {
    console.warn('⚠️ Operación no permitida: El sistema está en modo solo lectura (servidor local)');
    throw new Error('Operación no permitida. Los datos provienen del servidor local y son de solo lectura.');
  }, []);

  // ============================================
  // FILTROS Y BÚSQUEDA
  // ============================================

  const filteredPrestaciones = useMemo(() => {
    return prestaciones.filter((prestacion) => {
      // Filtro por término de búsqueda
      const matchesSearch = !searchTerm || 
        prestacion.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prestacion.practica.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtro por agrupación
      const matchesAgrupacion = !selectedAgrupacion || 
        prestacion.agrupacion_id === selectedAgrupacion;

      return matchesSearch && matchesAgrupacion;
    });
  }, [prestaciones, searchTerm, selectedAgrupacion]);

  // ============================================
  // FUNCIONES UTILITARIAS
  // ============================================

  const getPrestacionesByAgrupacion = useCallback((agrupacionId: string) => {
    return prestaciones.filter(p => p.agrupacion_id === agrupacionId);
  }, [prestaciones]);

  const refetch = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  // ============================================
  // ESTADÍSTICAS CALCULADAS
  // ============================================

  const estadisticas = useMemo(() => {
    const prestacionesMostradas = filteredPrestaciones;
    const precios = prestacionesMostradas.map(p => p.precio).filter(p => p > 0);
    
    // Contar por agrupación
    const porAgrupacion = prestacionesMostradas.reduce((acc, prestacion) => {
      const nombre = prestacion.agrupacion_nombre || 'Sin Agrupación';
      acc[nombre] = (acc[nombre] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: prestacionesMostradas.length,
      porAgrupacion,
      precioMinimo: precios.length > 0 ? Math.min(...precios) : 0,
      precioMaximo: precios.length > 0 ? Math.max(...precios) : 0,
      precioPromedio: precios.length > 0 ? precios.reduce((a, b) => a + b, 0) / precios.length : 0,
    };
  }, [filteredPrestaciones]);

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar datos al montar el componente
  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================
  // RETORNO DEL HOOK
  // ============================================

  return {
    // Estado principal
    prestaciones,
    agrupaciones,
    filteredPrestaciones,
    loading,
    error,
    
    // Filtros
    searchTerm,
    selectedAgrupacion,
    setSearchTerm,
    setSelectedAgrupacion,
    
    // Operaciones CRUD (solo lectura)
    createPrestacion,
    updatePrestacion,
    deletePrestacion,
    
    // Funciones especiales
    getPrestacionesByAgrupacion,
    refetch,
    
    // Estado de conexión
    isConnected,
    fuenteDatos: 'Supabase (sync GECLISA)',
    
    // Estadísticas
    estadisticas,
  };
};

export default usePrestaciones;
