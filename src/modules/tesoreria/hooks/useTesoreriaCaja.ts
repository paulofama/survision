// ============================================
// HOOK: useTesoreriaCaja
// Sistema Integral de Gestión - Instituto Dr. Mercado
// v2.0.0
// ============================================
// CAMBIO v2 (migración 30): se abandona el "saldo acumulado de caja".
//
// El dashboard sumaba TODOS los comprobantes de MovValoresEnca desde 2018 y
// mostraba $1.041M como saldo de caja. Estaba mal por tres motivos:
//   (a) el comprobante no dice el medio de pago -> transferencias y tarjetas
//       (que van al banco) se contaban como caja;
//   (b) los pagos a proveedores (OP/PV) salen de la caja y no se restaban;
//   (c) acumulaba desde 2018 sin arqueo ni saldo inicial.
//
// Ahora la métrica es el EFECTIVO NETO DEL MES: entra en efectivo − sale por
// egreso de caja − sale por OP/PV en efectivo. Lo calcula el RPC
// tes_caja_dashboard sobre las tablas tesoreria_valores / tesoreria_prov_valores.
// Validado contra GECLISA al peso (julio 2026, 4 de 4 métricas).
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
  /** true si se alcanzó el tope de filas y los totales son parciales */
  truncado: boolean;
}

export interface TipoComprobante {
  id: number;
  sigla: string;
  nombre: string;
  signo: number;
  cantidad: number;
}

/** Categorías de medio de pago que devuelve el extractor. */
export type CategoriaMedio =
  | 'efectivo'
  | 'transferencia'
  | 'tarjeta'
  | 'cheque'
  | 'cta_cte'
  | 'retencion'
  | 'otro';

export interface MedioPago {
  categoria: CategoriaMedio;
  total: number;
  n: number;
}

export interface DashboardTesoreria {
  periodo: { anio: number; mes: number; desde: string; hasta: string };
  /** La caja de verdad: sólo medios de pago en efectivo. */
  efectivo: {
    entra: number;
    saleCaja: number;
    saleProveedores: number;
    neto: number;
    movimientos: number;
  };
  /** Cómo cobró la clínica en el mes (efectivo, transferencia, tarjeta...). */
  ingresosPorMedio: MedioPago[];
  egresos: {
    caja: number;
    proveedores: number;
    proveedoresPorMedio: MedioPago[];
  };
  /** Totales de comprobantes del mes (no es caja: incluye banco y tarjeta). */
  comprobantes: { movimientos: number; ingresos: number; egresos: number };
  ultimosMovimientos: Array<{
    id: number;
    fecha: string;
    tipo: string;
    nombre: string;
    ingreso: number;
    egreso: number;
  }>;
  /** 14 días, con los días sin movimiento en cero. */
  evolucionEfectivo: Array<{ fecha: string; entra: number; sale: number }>;
  /** Frescura real del espejo: el daemon sincroniza 3 veces por día. */
  frescura: {
    sincronizado: string | null;
    ultimaFechaDato: string | null;
    hoy: string;
  };
}

export interface FlujoMes {
  anio: number;
  mes: number;
  entra: number;
  sale_caja: number;
  sale_prov: number;
  neto: number;
}

export interface FiltrosMovimientos {
  fechaDesde: string;
  fechaHasta: string;
  tipoComprobante: string;
  busqueda: string;
  limite: number;
}

// Supabase corta en 1.000 filas por request: se pagina hasta este tope para que
// los totales no queden silenciosamente incompletos.
const PAGINA = 1000;
const TOPE_FILAS = 10000;

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useTesoreriaCaja = () => {
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [totales, setTotales] = useState<TotalesCaja | null>(null);
  const [tiposComprobante, setTiposComprobante] = useState<TipoComprobante[]>([]);
  const [dashboard, setDashboard] = useState<DashboardTesoreria | null>(null);
  const [flujoMensual, setFlujoMensual] = useState<FlujoMes[]>([]);

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
      limite: TOPE_FILAS
    };
  });

  // ============================================
  // FETCHERS
  // ============================================

  /** Dashboard del mes. Sin argumentos = mes en curso (hora de Argentina). */
  const fetchDashboard = useCallback(async (anio?: number, mes?: number) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('tes_caja_dashboard', {
        p_anio: anio ?? null,
        p_mes: mes ?? null
      });
      if (error) throw new Error(error.message);
      setDashboard(data as DashboardTesoreria);
      setIsConnected(true);
    } catch (err) {
      console.error('Error obteniendo dashboard:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Serie mensual de flujo de efectivo (entra / sale caja / sale proveedores). */
  const fetchFlujoMensual = useCallback(async (desde?: string) => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('tes_efectivo_por_mes', {
        p_desde: desde ?? null
      });
      if (error) throw new Error(error.message);
      const filas: FlujoMes[] = (data || []).map((r: Record<string, unknown>) => ({
        anio: Number(r.anio) || 0,
        mes: Number(r.mes) || 0,
        entra: Number(r.entra) || 0,
        sale_caja: Number(r.sale_caja) || 0,
        sale_prov: Number(r.sale_prov) || 0,
        neto: Number(r.neto) || 0
      }));
      setFlujoMensual(filas);
      setIsConnected(true);
      return filas;
    } catch (err) {
      console.error('Error obteniendo flujo mensual:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setIsConnected(false);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /** Listado de movimientos con filtros. Pagina para que los totales sean completos. */
  const fetchMovimientos = useCallback(async (customFiltros?: Partial<FiltrosMovimientos>) => {
    try {
      setLoading(true);
      setError(null);
      const f = { ...filtros, ...customFiltros };
      const tope = Math.min(f.limite || TOPE_FILAS, TOPE_FILAS);

      const filas: Record<string, unknown>[] = [];
      let desde = 0;
      let truncado = false;

      for (;;) {
        let q = supabase
          .from('tesoreria_caja')
          .select('id, fecha, tipo_comprobante, tipo_nombre, letra, sucursal, numero, nombre, observaciones, importe, signo, usuario, fecha_alta')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .range(desde, desde + PAGINA - 1);
        if (f.fechaDesde) q = q.gte('fecha', f.fechaDesde);
        if (f.fechaHasta) q = q.lte('fecha', f.fechaHasta);
        if (f.tipoComprobante) q = q.eq('tipo_comprobante', f.tipoComprobante);
        if (f.busqueda) q = q.or(`nombre.ilike.%${f.busqueda}%,numero.eq.${/^\d+$/.test(f.busqueda) ? f.busqueda : 0}`);

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const lote = data || [];
        filas.push(...lote);

        if (lote.length < PAGINA) break;
        desde += PAGINA;
        if (filas.length >= tope) { truncado = true; break; }
      }

      const movs: MovimientoCaja[] = filas.map((r) => ({
        id: Number(r.id), fecha: String(r.fecha),
        tipo_comprobante: String(r.tipo_comprobante || ''), tipo_nombre: String(r.tipo_nombre || ''),
        letra: String(r.letra || ''), sucursal: Number(r.sucursal) || 0, numero: Number(r.numero) || 0,
        nombre: String(r.nombre || ''), observaciones: String(r.observaciones || ''),
        importe: Number(r.importe) || 0, signo: Number(r.signo) || 0,
        ingreso: Number(r.signo) > 0 ? Number(r.importe) : 0,
        egreso: Number(r.signo) < 0 ? Math.abs(Number(r.importe)) : 0,
        usuario: String(r.usuario || ''), fecha_alta: String(r.fecha_alta || ''),
      }));

      setMovimientos(movs);
      setTotales({
        registros: movs.length,
        ingresos: movs.reduce((s, m) => s + m.ingreso, 0),
        egresos: movs.reduce((s, m) => s + m.egreso, 0),
        diferencia: movs.reduce((s, m) => s + m.ingreso - m.egreso, 0),
        truncado,
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
      const tipos: TipoComprobante[] = (data || []).map((t: Record<string, unknown>, i: number) => ({
        id: i, sigla: String(t.sigla || ''), nombre: String(t.nombre || ''), signo: 0, cantidad: Number(t.cantidad) || 0,
      }));
      setTiposComprobante(tipos);
    } catch (err) {
      console.error('Error obteniendo tipos de comprobante:', err);
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
      limite: TOPE_FILAS
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

  /** "Datos al 22/07 17:00" — la hora del sync, no la del navegador. */
  const formatFrescura = useCallback((sincronizado: string | null) => {
    if (!sincronizado) return 'sin datos de sincronización';
    const d = new Date(sincronizado);
    if (isNaN(d.getTime())) return 'sin datos de sincronización';
    return `Datos al ${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs`;
  }, []);

  const nombreMes = useCallback((anio: number, mes: number) => {
    return new Date(anio, mes - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    movimientos,
    totales,
    tiposComprobante,
    dashboard,
    flujoMensual,
    loading,
    error,
    isConnected,
    filtros,

    // Fetchers
    fetchDashboard,
    fetchFlujoMensual,
    fetchMovimientos,
    fetchTiposComprobante,

    // Acciones
    aplicarFiltros,
    limpiarFiltros,
    setFiltros,

    // Formateo
    formatCurrency,
    formatNumber,
    formatComprobante,
    formatFrescura,
    nombreMes
  };
};

export default useTesoreriaCaja;
