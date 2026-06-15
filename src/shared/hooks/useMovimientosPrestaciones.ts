// ============================================
// HOOK: useMovimientosPrestaciones
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÓN 3.3 - FIX: Limit aumentado a 5000
// ============================================
// CAMBIO v3.3: El limit de 500 truncaba datos en meses con más
// de 500 atenciones, causando facturación incompleta en Análisis Marginal.
// CAMBIO v3.2: Los filtros se inicializan con año/mes actual
// para que la primera carga traiga solo datos del período.
// ============================================
// RUTA: src/hooks/useMovimientosPrestaciones.ts
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE_URL } from '../lib/apiConfig';

// ============================================
// INTERFACES
// ============================================

export interface PrestacionRealizada {
  id: number;
  atencion_id: number;
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
  os_id: number;
  os_nombre: string;
  os_sigla: string;
  codigo_prestacion: string;
  prestacion: string;
  grupo_id: number;
  prestador_id: number | null;
  prestador: string;
  derivador_id: number | null;
  derivador: string;
  atendio: string;
  anio: number;
  mes_numero: number;
}

// ★★★ v3.0: Totales calculados en servidor ★★★
export interface TotalesPeriodo {
  atenciones: number;
  practicas: number;
  coseguro: number;
  cobertura: number;
  ingresos: number;
}

export interface StatsPorObraSocial {
  os_id: number;
  sigla: string;
  nombre: string;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface StatsPorPrestador {
  prestador_id: number;
  prestador: string;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface StatsPorPrestacion {
  codigo: string;
  prestacion: string;
  grupo_id: number;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface StatsPorGrupo {
  grupo_id: number;
  grupo_nombre: string;
  tipos_prestacion: number;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface FiltrosPrestaciones {
  anio: string;
  mes: string;
  dia: string;
  obraSocialId: string;
  prestadorId: string;
  grupoPracticas: string;
  agenteFacturadorId: string;
  busqueda: string;
  prestacion: string;
  paciente: string;
  derivadorId: string;
}

// Estadísticas generales (para PrestacionesRealizadasPage)
export interface Estadisticas {
  practicas_hoy: number;
  ingreso_hoy: number;
  practicas_mes_actual: number;
  ingreso_mes_actual: number;
  practicas_mes_anterior: number;
  ingreso_mes_anterior: number;
  total_historico: number;
  turnos_pendientes: number;
}

export interface OpcionesFiltros {
  anios: number[];
  meses: { value: number; label: string }[];
  dias: { value: number; label: string }[];
  obrasSociales: { id: number; sigla: string; nombre: string }[];
  prestadores: { id: number; nombre: string }[];
  grupos: { id: number; nombre: string }[];
  gruposPracticas: { id: number; nombre: string }[];
  agentesFacturadores: { id: number; nombre: string }[];
  derivadores: { id: number; nombre: string }[];
}

// ============================================
// ★★★ v3.2 FIX: VALORES INICIALES ★★★
// ============================================

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1; // getMonth() es 0-indexed

const FILTROS_INICIALES: FiltrosPrestaciones = {
  anio: CURRENT_YEAR.toString(),
  mes: CURRENT_MONTH.toString(),
  dia: '',
  obraSocialId: '',
  prestadorId: '',
  grupoPracticas: '',
  agenteFacturadorId: '',
  busqueda: '',
  prestacion: '',
  paciente: '',
  derivadorId: ''
};

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useMovimientosPrestaciones = () => {
  // Estado de datos (paginados - para tabla)
  const [prestaciones, setPrestaciones] = useState<PrestacionRealizada[]>([]);
  
  // ★★★ v3.0: Totales del servidor ★★★
  const [totalesPeriodo, setTotalesPeriodo] = useState<TotalesPeriodo>({
    atenciones: 0,
    practicas: 0,
    coseguro: 0,
    cobertura: 0,
    ingresos: 0
  });
  
  // ★★★ v3.0: Stats agrupados del servidor ★★★
  const [statsPorObraSocial, setStatsPorObraSocial] = useState<StatsPorObraSocial[]>([]);
  const [statsPorPrestador, setStatsPorPrestador] = useState<StatsPorPrestador[]>([]);
  const [statsPorPrestacion, setStatsPorPrestacion] = useState<StatsPorPrestacion[]>([]);
  const [statsPorGrupo, setStatsPorGrupo] = useState<StatsPorGrupo[]>([]);
  
  // Estadísticas generales (compatibilidad con PrestacionesRealizadasPage)
  const [estadisticas, setEstadisticas] = useState<Estadisticas>({
    practicas_hoy: 0,
    ingreso_hoy: 0,
    practicas_mes_actual: 0,
    ingreso_mes_actual: 0,
    practicas_mes_anterior: 0,
    ingreso_mes_anterior: 0,
    total_historico: 0,
    turnos_pendientes: 0
  });
  
  // ★★★ v3.2 FIX: Estado de filtros con valores iniciales ★★★
  const [filtros, setFiltros] = useState<FiltrosPrestaciones>(FILTROS_INICIALES);
  
  // Opciones para dropdowns
  const [opcionesFiltros, setOpcionesFiltros] = useState<OpcionesFiltros>({
    anios: [],
    meses: [],
    dias: [],
    obrasSociales: [],
    prestadores: [],
    grupos: [],
    gruposPracticas: [],
    agentesFacturadores: [],
    derivadores: []
  });
  
  // Estados de carga
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingFiltros, setLoadingFiltros] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // ============================================
  // CARGAR OPCIONES DE FILTROS
  // ============================================

  const cargarOpcionesFiltros = useCallback(async () => {
    try {
      setLoadingFiltros(true);
      
      const response = await fetch(`${API_BASE_URL}/movimientos/filtros`);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        // Mapear datos del servidor con valores por defecto para propiedades faltantes
        setOpcionesFiltros({
          anios: result.data.anios || [],
          meses: result.data.meses || [],
          dias: result.data.dias || [],
          obrasSociales: result.data.obrasSociales || [],
          prestadores: result.data.prestadores || [],
          grupos: result.data.grupos || result.data.gruposPracticas || [],
          gruposPracticas: result.data.gruposPracticas || result.data.grupos || [],
          agentesFacturadores: result.data.agentesFacturadores || [],
          derivadores: result.data.derivadores || []
        });
        setIsConnected(true);
      }
    } catch (err) {
      console.error('Error cargando filtros:', err);
      setIsConnected(false);
    } finally {
      setLoadingFiltros(false);
    }
  }, []);

  // ============================================
  // CARGAR ESTADÍSTICAS GENERALES
  // (Compatibilidad con PrestacionesRealizadasPage)
  // ============================================

  const cargarEstadisticas = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/movimientos/stats`);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        setEstadisticas({
          practicas_hoy: result.data.hoy?.practicas || 0,
          ingreso_hoy: result.data.hoy?.ingreso || 0,
          practicas_mes_actual: result.data.mesActual?.practicas || 0,
          ingreso_mes_actual: result.data.mesActual?.ingreso || 0,
          practicas_mes_anterior: result.data.mesAnterior?.practicas || 0,
          ingreso_mes_anterior: result.data.mesAnterior?.ingreso || 0,
          total_historico: result.data.total?.practicas || 0,
          turnos_pendientes: 0
        });
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    }
  }, []);

  // ============================================
  // CARGAR PRESTACIONES (PAGINADAS - PARA TABLA)
  // ============================================

  const cargarPrestaciones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      
      if (filtros.anio) params.append('anio', filtros.anio);
      if (filtros.mes) params.append('mes', filtros.mes);
      if (filtros.dia) params.append('dia', filtros.dia);
      if (filtros.obraSocialId) params.append('osId', filtros.obraSocialId);
      if (filtros.prestadorId) params.append('prestador', filtros.prestadorId);
      if (filtros.grupoPracticas) params.append('grupoPracticas', filtros.grupoPracticas);
      if (filtros.prestacion) params.append('prestacion', filtros.prestacion);
      if (filtros.paciente) params.append('paciente', filtros.paciente);
      if (filtros.derivadorId) params.append('derivadorId', filtros.derivadorId);
      params.append('limit', '5000');
      
      const url = `${API_BASE_URL}/movimientos?${params.toString()}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setPrestaciones(result.data || []);
        setIsConnected(true);
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error de conexión';
      setError(mensaje);
      setIsConnected(false);
      setPrestaciones([]);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  // ============================================
  // ★★★ v3.0: CARGAR STATS-PERIODO ★★★
  // Totales calculados en SQL Server
  // ============================================

  const cargarStatsPeriodo = useCallback(async () => {
    try {
      setLoadingStats(true);
      
      const params = new URLSearchParams();
      
      // ★★★ v3.2: Siempre enviar año y mes (ahora tienen valores iniciales) ★★★
      if (filtros.anio) params.append('anio', filtros.anio);
      if (filtros.mes) params.append('mes', filtros.mes);
      if (filtros.obraSocialId) params.append('obraSocialId', filtros.obraSocialId);
      if (filtros.prestadorId) params.append('prestadorId', filtros.prestadorId);
      if (filtros.grupoPracticas) params.append('grupoPracticas', filtros.grupoPracticas);
      
      const url = `${API_BASE_URL}/movimientos/stats-periodo?${params.toString()}`;
      console.log('📊 Cargando stats-periodo:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        // Totales generales
        setTotalesPeriodo(result.data.totales || {
          atenciones: 0,
          practicas: 0,
          coseguro: 0,
          cobertura: 0,
          ingresos: 0
        });
        
        // Stats agrupados
        setStatsPorObraSocial(result.data.porObraSocial || []);
        setStatsPorPrestador(result.data.porPrestador || []);
        setStatsPorPrestacion(result.data.porPrestacion || []);
        setStatsPorGrupo(result.data.porGrupo || []);
        
        console.log(`✅ Stats-periodo cargados: ${result.data.totales?.practicas} prácticas, $${result.data.totales?.ingresos}`);
      }
    } catch (err) {
      console.error('Error cargando stats-periodo:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [filtros]);

  // ============================================
  // APLICAR FILTROS
  // ============================================

  const aplicarFiltros = useCallback((nuevosFiltros: Partial<FiltrosPrestaciones>) => {
    setFiltros(prev => ({
      ...prev,
      ...nuevosFiltros
    }));
  }, []);

  // ★★★ v3.2: Limpiar filtros vuelve al mes actual, no vacío ★★★
  const limpiarFiltros = useCallback(() => {
    setFiltros(FILTROS_INICIALES);
  }, []);

  // ============================================
  // REFETCH COMPLETO
  // ============================================

  const refetch = useCallback(async () => {
    await Promise.all([
      cargarPrestaciones(),
      cargarStatsPeriodo(),
      cargarEstadisticas()
    ]);
  }, [cargarPrestaciones, cargarStatsPeriodo, cargarEstadisticas]);

  // ============================================
  // EFFECTS
  // ============================================

  // Cargar filtros y estadísticas al montar
  useEffect(() => {
    cargarOpcionesFiltros();
    cargarEstadisticas();
  }, [cargarOpcionesFiltros, cargarEstadisticas]);

  // Cargar datos cuando cambian filtros
  useEffect(() => {
    cargarPrestaciones();
    cargarStatsPeriodo();
  }, [filtros.anio, filtros.mes, filtros.dia, filtros.obraSocialId, filtros.prestadorId, filtros.grupoPracticas, filtros.prestacion, filtros.paciente, filtros.derivadorId]);

  // ============================================
  // DATOS FILTRADOS POR BÚSQUEDA LOCAL
  // ============================================

  const prestacionesFiltradas = useMemo(() => {
    if (!filtros.busqueda.trim()) return prestaciones;
    
    const termino = filtros.busqueda.toLowerCase();
    return prestaciones.filter(p =>
      p.paciente?.toLowerCase().includes(termino) ||
      p.prestacion?.toLowerCase().includes(termino) ||
      p.os_nombre?.toLowerCase().includes(termino) ||
      p.prestador?.toLowerCase().includes(termino) ||
      p.codigo_prestacion?.toLowerCase().includes(termino)
    );
  }, [prestaciones, filtros.busqueda]);

  // ============================================
  // ⚠️ DEPRECADO: Totales calculados en frontend
  // Usar `totalesPeriodo` en su lugar
  // ============================================

  const totalesLocal = useMemo(() => {
    console.warn('⚠️ totalesLocal está deprecado. Usar totalesPeriodo del servidor.');
    return prestacionesFiltradas.reduce((acc, p) => ({
      cantidad: acc.cantidad + 1,
      coseguro: acc.coseguro + (p.coseguro || 0),
      cobertura: acc.cobertura + (p.cobertura || 0),
      total: acc.total + (p.total || 0)
    }), { cantidad: 0, coseguro: 0, cobertura: 0, total: 0 });
  }, [prestacionesFiltradas]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Datos paginados (para tabla)
    prestaciones: prestacionesFiltradas,
    totalRegistros: prestaciones.length,
    
    // ★★★ v3.0: Totales del servidor (USAR PARA KPIs) ★★★
    totalesPeriodo,
    statsPorObraSocial,
    statsPorPrestador,
    statsPorPrestacion,
    statsPorGrupo,
    
    // Estadísticas generales (compatibilidad con PrestacionesRealizadasPage)
    estadisticas,
    
    // Filtros
    filtros,
    opcionesFiltros,
    aplicarFiltros,
    limpiarFiltros,
    
    // Estados
    loading,
    loadingStats,
    loadingFiltros,
    error,
    isConnected,
    
    // Acciones
    refetch,
    
    // ⚠️ DEPRECADO: No usar para KPIs
    totalesLocal
  };
};

export default useMovimientosPrestaciones;
