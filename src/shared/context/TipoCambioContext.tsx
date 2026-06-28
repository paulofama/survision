// ============================================
// CONTEXT: Tipo de Cambio BCRA
// Sistema de Costos - Instituto Dr. Mercado
// Centraliza el tipo de cambio para toda la app
// ============================================

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

// ============================================
// TIPOS
// ============================================

export interface TipoCambio {
  compra: number;
  venta: number;
  fecha: string;
  fuente: string;
}

interface TipoCambioContextType {
  tipoCambio: TipoCambio | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
  // Helpers para conversión
  convertirARS: (usd: number) => number;
  convertirUSD: (ars: number) => number;
  formatearARS: (monto: number) => string;
  formatearUSD: (monto: number) => string;
}

// ============================================
// CONTEXT
// ============================================

const TipoCambioContext = createContext<TipoCambioContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface TipoCambioProviderProps {
  children: ReactNode;
}

export const TipoCambioProvider: React.FC<TipoCambioProviderProps> = ({ children }) => {
  const [tipoCambio, setTipoCambio] = useState<TipoCambio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { isAuthenticated } = useAuth();

  // ============================================
  // FETCH TIPO DE CAMBIO
  // ============================================

  const fetchTipoCambio = useCallback(async (forzar = false) => {
    // Evitar múltiples llamadas simultáneas
    if (loading) return;

    // Si es refresh manual, limpiar cache para no usar valor viejo
    if (forzar) sessionStorage.removeItem('tipoCambio');

    setLoading(true);
    setError(null);

    try {
      console.log('💱 [TipoCambioContext] Obteniendo tipo de cambio...');

      // Lee el TC de Supabase (lo refresca el daemon on-prem 2 veces/día desde
      // DolarAPI/BCRA). Así funciona desde afuera de la clínica.
      const { data, error: sbErr } = await supabase
        .from('tipo_cambio')
        .select('compra, venta, fecha, fuente')
        .eq('id', 1)
        .maybeSingle();

      if (sbErr) throw new Error(sbErr.message);
      if (data) {
        const tc: TipoCambio = { compra: Number(data.compra), venta: Number(data.venta), fecha: data.fecha || '', fuente: data.fuente || '' };
        setTipoCambio(tc);
        setLastUpdate(new Date());
        sessionStorage.setItem('tipoCambio', JSON.stringify({ data: tc, timestamp: new Date().toISOString() }));
        console.log('✅ [TipoCambioContext] TC cargado:', tc.compra);
      } else {
        throw new Error('Tipo de cambio no disponible todavía (sync pendiente)');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ [TipoCambioContext] Error:', errorMsg);
      setError(errorMsg);
      
      // Intentar usar cache si hay error
      const cached = sessionStorage.getItem('tipoCambio');
      if (cached) {
        try {
          const { data } = JSON.parse(cached);
          setTipoCambio(data);
          console.log('📦 [TipoCambioContext] Usando cache');
        } catch {
          // Cache corrupto, ignorar
        }
      }
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // ============================================
  // CARGAR AL INICIAR
  // ============================================

  useEffect(() => {
    // Primero intentar cargar desde sessionStorage
    const cached = sessionStorage.getItem('tipoCambio');
    
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(timestamp).getTime();
        const ONE_HOUR = 60 * 60 * 1000;

        // Si el cache tiene menos de 1 hora, usarlo
        if (cacheAge < ONE_HOUR) {
          setTipoCambio(data);
          setLastUpdate(new Date(timestamp));
          console.log('📦 [TipoCambioContext] Cargado desde cache');
          return;
        }
      } catch {
        // Cache corrupto, continuar con fetch
      }
    }

    // El endpoint /api/nomenclador/tipocambio exige sesión (requireAuth).
    // Solo lo pedimos cuando el usuario está autenticado; el efecto se vuelve
    // a ejecutar al cambiar isAuthenticated (post-login).
    if (isAuthenticated) {
      fetchTipoCambio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ============================================
  // HELPERS DE CONVERSIÓN
  // ============================================

  const convertirARS = useCallback((usd: number): number => {
    if (!tipoCambio || !usd) return 0;
    return usd * tipoCambio.venta;
  }, [tipoCambio]);

  const convertirUSD = useCallback((ars: number): number => {
    if (!tipoCambio || !ars || tipoCambio.venta === 0) return 0;
    return ars / tipoCambio.venta;
  }, [tipoCambio]);

  const formatearARS = useCallback((monto: number): string => {
    return '$ ' + new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto);
  }, []);

  const formatearUSD = useCallback((monto: number): string => {
    return 'US$ ' + new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(monto);
  }, []);

  // ============================================
  // VALOR DEL CONTEXT
  // ============================================

  const value: TipoCambioContextType = {
    tipoCambio,
    loading,
    error,
    lastUpdate,
    refresh: () => fetchTipoCambio(true),
    convertirARS,
    convertirUSD,
    formatearARS,
    formatearUSD
  };

  return (
    <TipoCambioContext.Provider value={value}>
      {children}
    </TipoCambioContext.Provider>
  );
};

// ============================================
// HOOK PARA CONSUMIR EL CONTEXT
// ============================================

export const useTipoCambio = (): TipoCambioContextType => {
  const context = useContext(TipoCambioContext);
  
  if (context === undefined) {
    throw new Error('useTipoCambio debe usarse dentro de un TipoCambioProvider');
  }
  
  return context;
};

// ============================================
// EXPORT DEFAULT
// ============================================

export default TipoCambioProvider;
