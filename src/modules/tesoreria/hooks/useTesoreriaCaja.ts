// ============================================
// HOOK: useTesoreriaCaja
// Sistema de Costos - Instituto Dr. Mercado
// v1.0.0
// ============================================
// RUTA DESTINO: src/hooks/useTesoreriaCaja.ts
// ============================================

import { useState, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';

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

  // Saldo a una fecha — RPC tes_caja_saldo (agrega server-side sobre el espejo)
  const fetchSaldoHistorico = useCallback(async (fecha: string) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('tes_caja_saldo', { p_fecha: fecha });
      if (error) throw new Error(error.message);
      const res: SaldoHistorico = {
        fecha,
        saldo: Number(data?.saldo) || 0,
        total_ingresos: Number(data?.total_ingresos) || 0,
        total_egresos: Number(data?.total_egresos) || 0,
        total_movimientos: Number(data?.total_movimientos) || 0,
      };
      setSaldoHistorico(res);
      setIsConnected(true);
      return res;
    } catch (err) {
      console.error('Error obteniendo saldo histórico:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Listado de movimientos con filtros — query directa al espejo (acotado por fecha)
  const fetchMovimientos = useCallback(async (customFiltros?: Partial<FiltrosMovimientos>) => {
    try {
      setLoading(true);
      setError(null);
      const f = { ...filtros, ...customFiltros };

      let q = supabase
        .from('tesoreria_caja')
        .select('id, fecha, tipo_comprobante, tipo_nombre, letra, sucursal, numero, nombre, observaciones, importe, signo, usuario, fecha_alta')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(f.limite || 1000);
      if (f.fechaDesde) q = q.gte('fecha', f.fechaDesde);
      if (f.fechaHasta) q = q.lte('fecha', f.fechaHasta);
      if (f.tipoComprobante) q = q.eq('tipo_comprobante', f.tipoComprobante);
      if (f.busqueda) q = q.or(`nombre.ilike.%${f.busqueda}%,numero.eq.${/^\d+$/.test(f.busqueda) ? f.busqueda : 0}`);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const movs: MovimientoCaja[] = (data || []).map((r: any) => ({
        id: r.id, fecha: r.fecha, tipo_comprobante: r.tipo_comprobante || '', tipo_nombre: r.tipo_nombre || '',
        letra: r.letra || '', sucursal: r.sucursal || 0, numero: r.numero || 0, nombre: r.nombre || '',
        observaciones: r.observaciones || '', importe: Number(r.importe) || 0, signo: Number(r.signo) || 0,
        ingreso: Number(r.signo) > 0 ? Number(r.importe) : 0,
        egreso: Number(r.signo) < 0 ? Math.abs(Number(r.importe)) : 0,
        usuario: r.usuario || '', fecha_alta: r.fecha_alta || '',
      }));
      setMovimientos(movs);
      setTotales({
        registros: movs.length,
        ingresos: movs.reduce((s, m) => s + m.ingreso, 0),
        egresos: movs.reduce((s, m) => s + m.egreso, 0),
        diferencia: movs.reduce((s, m) => s + m.ingreso - m.egreso, 0),
      });
      setIsConnected(true);
    } catch (err) {
      console.error('Error obteniendo movimientos:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  const fetchTiposComprobante = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('tes_caja_tipos');
      if (error) throw new Error(error.message);
      const tipos: TipoComprobante[] = (data || []).map((t: any, i: number) => ({
        id: i, sigla: t.sigla || '', nombre: t.nombre || '', signo: 0, cantidad: Number(t.cantidad) || 0,
      }));
      setTiposComprobante(tipos);
    } catch (err) {
      console.error('Error obteniendo tipos de comprobante:', err);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('tes_caja_dashboard');
      if (error) throw new Error(error.message);
      setDashboard(data as DashboardCaja);
      setIsConnected(true);
    } catch (err) {
      console.error('Error obteniendo dashboard:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

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
