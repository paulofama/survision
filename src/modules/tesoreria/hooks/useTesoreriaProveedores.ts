// ============================================
// HOOK: useTesoreriaProveedores
// Pagos a proveedores (OP / PV) — egresos desde MovProv (GECLISA).
// Sección aparte de la caja (no se mezcla con el saldo de caja).
// ============================================

import { useState, useCallback } from 'react';
import { getApiBaseUrl } from '@shared/lib/apiConfig';

export interface MovimientoProveedor {
  id: number;
  fecha: string;
  tipo_comprobante: string; // OP | PV
  tipo_nombre: string;
  letra: string;
  sucursal: number;
  numero: number;
  proveedor: string;
  cuit: string;
  observaciones: string;
  importe: number; // egreso (positivo)
  usuario: string;
  fecha_alta: string;
}

export interface TotalesProveedores {
  registros: number;
  total_op: number;
  total_pv: number;
  total_egresos: number;
}

export interface FiltrosProveedores {
  fechaDesde: string;
  fechaHasta: string;
  tipo: '' | 'OP' | 'PV';
  busqueda: string;
  limite: number;
}

export const useTesoreriaProveedores = () => {
  const API_BASE = getApiBaseUrl();

  const [movimientos, setMovimientos] = useState<MovimientoProveedor[]>([]);
  const [totales, setTotales] = useState<TotalesProveedores | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  const [filtros, setFiltros] = useState<FiltrosProveedores>(() => {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    return {
      fechaDesde: hace30Dias.toISOString().split('T')[0],
      fechaHasta: hoy.toISOString().split('T')[0],
      tipo: '',
      busqueda: '',
      limite: 1000,
    };
  });

  const fetchMovimientos = useCallback(async (customFiltros?: Partial<FiltrosProveedores>) => {
    try {
      setLoading(true);
      setError(null);
      const f = { ...filtros, ...customFiltros };
      const params = new URLSearchParams();
      if (f.fechaDesde) params.append('fechaDesde', f.fechaDesde);
      if (f.fechaHasta) params.append('fechaHasta', f.fechaHasta);
      if (f.tipo) params.append('tipo', f.tipo);
      if (f.busqueda) params.append('busqueda', f.busqueda);
      params.append('limite', String(f.limite));

      const response = await fetch(`${API_BASE}/tesoreria/proveedores/movimientos?${params}`);
      if (!response.ok) throw new Error('Error al obtener pagos a proveedores');
      const data = await response.json();
      if (data.success) {
        setMovimientos(data.data);
        setTotales(data.totales);
        setIsConnected(true);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err) {
      console.error('Error obteniendo pagos a proveedores:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, filtros]);

  const aplicarFiltros = useCallback((nuevos: Partial<FiltrosProveedores>) => {
    setFiltros(prev => ({ ...prev, ...nuevos }));
  }, []);

  const limpiarFiltros = useCallback(() => {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    setFiltros({
      fechaDesde: hace30Dias.toISOString().split('T')[0],
      fechaHasta: hoy.toISOString().split('T')[0],
      tipo: '',
      busqueda: '',
      limite: 1000,
    });
  }, []);

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(value || 0);
  }, []);

  const formatNumber = useCallback((value: number) => {
    return new Intl.NumberFormat('es-AR').format(value || 0);
  }, []);

  const formatComprobante = useCallback((mov: MovimientoProveedor) => {
    const tipo = mov.tipo_comprobante || '??';
    const letra = mov.letra || '';
    const suc = String(mov.sucursal || 0).padStart(4, '0');
    const num = String(mov.numero || 0).padStart(8, '0');
    return `${tipo} ${letra}-${suc}-${num}`;
  }, []);

  return {
    movimientos,
    totales,
    loading,
    error,
    isConnected,
    filtros,
    fetchMovimientos,
    aplicarFiltros,
    limpiarFiltros,
    setFiltros,
    formatCurrency,
    formatNumber,
    formatComprobante,
  };
};

export default useTesoreriaProveedores;
