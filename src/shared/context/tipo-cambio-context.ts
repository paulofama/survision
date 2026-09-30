// ============================================
// Contexto de tipo de cambio — objeto, tipos y hook
// Sistema de Gestión Integral · Survisión S.A.
// ============================================
//
// Separado de `TipoCambioContext.tsx` por el mismo motivo que `auth-context.ts`:
// un .tsx que exporta un componente Y otra cosa rompe el Fast Refresh de Vite.
// El .tsx se queda sólo con el Provider.
// ============================================

import { createContext, useContext } from 'react';

export interface TipoCambio {
  compra: number;
  venta: number;
  fecha: string;
  fuente: string;
}

export interface TipoCambioContextType {
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

export const TipoCambioContext = createContext<TipoCambioContextType | undefined>(undefined);

export const useTipoCambio = (): TipoCambioContextType => {
  const context = useContext(TipoCambioContext);

  if (context === undefined) {
    throw new Error('useTipoCambio debe usarse dentro de un TipoCambioProvider');
  }

  return context;
};
