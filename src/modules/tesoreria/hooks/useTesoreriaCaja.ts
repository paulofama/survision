// ============================================
// HOOK: useTesoreriaCaja
// Sistema de Costos - Instituto Dr. Mercado
// v1.0.0
// ============================================
// RUTA DESTINO: src/hooks/useTesoreriaCaja.ts
// ============================================

import { useState, useCallback } from 'react';
import { getApiBaseUrl } from '@shared/lib/apiConfig';

// ============================================
// INTERFACES
// ============================================

export interface MovimientoCaja {
  id: number;
  fecha: string;
  tipo_comprobante: string;
  tipo_nombre: string;
  letra: string;
  sucursal: number;
  numero: number;
  nombre: string;
  observaciones: string;
  importe: number;
  signo: number;
  ingreso: number;
  egreso: number;
  usuario: string;
  fecha_alta: string;
}

export interface TotalesCaja {
  registros: number;
  ingresos: number;
  egresos: number;
  diferencia: number;
}

export interface SaldoHistorico {
  fecha: string;
  saldo: number;
  total_ingresos: number;
  total_egresos: number;
  total_movimientos: number;
}

export interface TipoComprobante {
  id: number;
  sigla: string;
  nombre: string;
  signo: number;
  cantidad: number;
}

export interface DashboardCaja {
  saldoActual: number;
  hoy: {
    movimientos: number;
    ingresos: number;
    egresos: number;
  };
  mes: {
    movimientos: number;
    ingresos: number;
    egresos: number;
  };
  ultimosMovimientos: Array<{
    id: number;
    fecha: string;
    tipo: string;
    nombre: string;
    ingreso: number;
    egreso: number;
  }>;
  evolucion7Dias: Array<{
    fecha: string;
    ingresos: number;
    egresos: number;
  }>;
}

export interface FiltrosMovimientos {
  fechaDesde: string;
  fechaHasta: string;
  tipoComprobante: string;
  busqueda: string;
  limite: number;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useTesoreriaCaja = () => {
  const API_BASE = getApiBaseUrl();

  // Estados
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [totales, setTotales] = useState<TotalesCaja | null>(null);
  const [saldoHistorico, setSaldoHistorico] = useState<SaldoHistorico | null>(null);
  const [tiposComprobante, setTiposComprobante] = useState<TipoComprobante[]>([]);
  const [dashboard, setDashboard] = useState<DashboardCaja | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  // Filtros por defecto (últimos 30 días)
  const [filtros, setFiltros] = useState<FiltrosMovimientos>(() => {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    
    return {
      fechaDesde: hace30Dias.toISOString().split('T')[0],
      fechaHasta: hoy.toISOString().split('T')[0],
      tipoComprobante: '',
      busqueda: '',
      limite: 1000
    };
  });

  // ============================================
  // FETCHERS
  // ============================================

  const fetchSaldoHistorico = useCallback(async (fecha: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/tesoreria/caja/saldo-historico?fecha=${fecha}`);
      if (!response.ok) throw new Error('Error al obtener saldo histórico');
      const data = await response.json();
      if (data.success) {
        setSaldoHistorico(data.data);
        setIsConnected(true);
        return data.data;
      }
    } catch (err) {
      console.error('Error obteniendo saldo histórico:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  const fetchMovimientos = useCallback(async (customFiltros?: Partial<FiltrosMovimientos>) => {
    try {
      setLoading(true);
      setError(null);
      
      const filtrosActuales = { ...filtros, ...customFiltros };
      
      const params = new URLSearchParams();
      if (filtrosActuales.fechaDesde) params.append('fechaDesde', filtrosActuales.fechaDesde);
      if (filtrosActuales.fechaHasta) params.append('fechaHasta', filtrosActuales.fechaHasta);
      if (filtrosActuales.tipoComprobante) params.append('tipoComprobante', filtrosActuales.tipoComprobante);
      if (filtrosActuales.busqueda) params.append('busqueda', filtrosActuales.busqueda);
      params.append('limite', String(filtrosActuales.limite));
      
      const response = await fetch(`${API_BASE}/tesoreria/caja/movimientos?${params}`);
      if (!response.ok) throw new Error('Error al obtener movimientos');
      
      const data = await response.json();
      if (data.success) {
        setMovimientos(data.data);
        setTotales(data.totales);
        setIsConnected(true);
      }
    } catch (err) {
      console.error('Error obteniendo movimientos:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, filtros]);

  const fetchTiposComprobante = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/tesoreria/caja/tipos-comprobante`);
      if (!response.ok) throw new Error('Error al obtener tipos de comprobante');
      const data = await response.json();
      if (data.success) {
        setTiposComprobante(data.data);
      }
    } catch (err) {
      console.error('Error obteniendo tipos de comprobante:', err);
    }
  }, [API_BASE]);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/tesoreria/caja/dashboard`);
      if (!response.ok) throw new Error('Error al obtener dashboard');
      const data = await response.json();
      if (data.success) {
        setDashboard(data.data);
        setIsConnected(true);
      }
    } catch (err) {
      console.error('Error obteniendo dashboard:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  // ============================================
  // ACCIONES
  // ============================================

  const aplicarFiltros = useCallback((nuevosFiltros: Partial<FiltrosMovimientos>) => {
    setFiltros(prev => ({ ...prev, ...nuevosFiltros }));
  }, []);

  const limpiarFiltros = useCallback(() => {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    
    setFiltros({
      fechaDesde: hace30Dias.toISOString().split('T')[0],
      fechaHasta: hoy.toISOString().split('T')[0],
      tipoComprobante: '',
      busqueda: '',
      limite: 1000
    });
  }, []);

  // ============================================
  // UTILIDADES DE FORMATEO
  // ============================================

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(value);
  }, []);

  const formatNumber = useCallback((value: number) => {
    return new Intl.NumberFormat('es-AR').format(value);
  }, []);

  const formatComprobante = useCallback((mov: MovimientoCaja) => {
    const tipo = mov.tipo_comprobante || '??';
    const letra = mov.letra || '';
    const suc = String(mov.sucursal || 0).padStart(4, '0');
    const num = String(mov.numero || 0).padStart(8, '0');
    return `${tipo} ${letra}-${suc}-${num}`;
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    movimientos,
    totales,
    saldoHistorico,
    tiposComprobante,
    dashboard,
    loading,
    error,
    isConnected,
    filtros,
    
    // Fetchers
    fetchSaldoHistorico,
    fetchMovimientos,
    fetchTiposComprobante,
    fetchDashboard,
    
    // Acciones
    aplicarFiltros,
    limpiarFiltros,
    setFiltros,
    
    // Formateo
    formatCurrency,
    formatNumber,
    formatComprobante
  };
};

export default useTesoreriaCaja;
