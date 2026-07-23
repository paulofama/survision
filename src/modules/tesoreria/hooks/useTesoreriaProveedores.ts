// ============================================
// HOOK: useTesoreriaProveedores
// Pagos a proveedores (OP / PV) — egresos desde MovProv (GECLISA).
// Sección aparte de la caja (no se mezcla con el saldo de caja).
// ============================================

import { useState, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';

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
  /** true si se alcanzó el tope de filas y los totales son parciales */
  truncado: boolean;
}

// Supabase corta en 1.000 filas por request: se pagina hasta este tope para que
// los totales no queden silenciosamente incompletos.
const PAGINA = 1000;
const TOPE_FILAS = 10000;

export interface FiltrosProveedores {
  fechaDesde: string;
  fechaHasta: string;
  tipo: '' | 'OP' | 'PV';
  busqueda: string;
  limite: number;
}

export const useTesoreriaProveedores = () => {
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
      limite: TOPE_FILAS,
    };
  });

  const fetchMovimientos = useCallback(async (customFiltros?: Partial<FiltrosProveedores>) => {
    try {
      setLoading(true);
      setError(null);
      const f = { ...filtros, ...customFiltros };

      // Lee del espejo Supabase (tesoreria_proveedores). OP=4, PV=13.
      // Pagina: Supabase corta en 1.000 filas y los totales quedarían parciales.
      const tope = Math.min(f.limite || TOPE_FILAS, TOPE_FILAS);
      const filas: Record<string, unknown>[] = [];
      let desde = 0;
      let truncado = false;

      for (;;) {
        let q = supabase
          .from('tesoreria_proveedores')
          .select('id, fecha, tcomp_id, tipo_comprobante, tipo_nombre, letra, sucursal, numero, proveedor, cuit, observaciones, importe, usuario, fecha_alta')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .range(desde, desde + PAGINA - 1);
        if (f.fechaDesde) q = q.gte('fecha', f.fechaDesde);
        if (f.fechaHasta) q = q.lte('fecha', f.fechaHasta);
        if (f.tipo === 'OP') q = q.eq('tcomp_id', 4);
        else if (f.tipo === 'PV') q = q.eq('tcomp_id', 13);
        if (f.busqueda) q = q.or(`proveedor.ilike.%${f.busqueda}%,observaciones.ilike.%${f.busqueda}%`);

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const lote = data || [];
        filas.push(...lote);

        if (lote.length < PAGINA) break;
        desde += PAGINA;
        if (filas.length >= tope) { truncado = true; break; }
      }

      const movs: MovimientoProveedor[] = filas.map((r) => ({
        id: Number(r.id), fecha: String(r.fecha),
        tipo_comprobante: String(r.tipo_comprobante || ''), tipo_nombre: String(r.tipo_nombre || ''),
        letra: String(r.letra || ''), sucursal: Number(r.sucursal) || 0, numero: Number(r.numero) || 0,
        proveedor: String(r.proveedor || ''), cuit: String(r.cuit || ''),
        observaciones: String(r.observaciones || ''), importe: Number(r.importe) || 0,
        usuario: String(r.usuario || ''), fecha_alta: String(r.fecha_alta || ''),
      }));
      setMovimientos(movs);
      // Totales sobre el set filtrado (OP = tcomp 4, PV = tcomp 13)
      setTotales({
        registros: movs.length,
        total_op: filas.filter((r) => Number(r.tcomp_id) === 4).reduce((s, r) => s + (Number(r.importe) || 0), 0),
        total_pv: filas.filter((r) => Number(r.tcomp_id) === 13).reduce((s, r) => s + (Number(r.importe) || 0), 0),
        total_egresos: movs.reduce((s, m) => s + m.importe, 0),
        truncado,
      });
      setIsConnected(true);
    } catch (err) {
      console.error('Error obteniendo pagos a proveedores:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

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
      limite: TOPE_FILAS,
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
