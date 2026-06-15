// ============================================
// COMPONENTE: Indicador de Tipo de Cambio
// Sistema de Costos - Instituto Dr. Mercado
// Componente reutilizable para mostrar el TC
// ============================================

import React from 'react';
import { TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import { useTipoCambio } from '../../context/TipoCambioContext';

// ============================================
// TIPOS
// ============================================

interface TipoCambioIndicatorProps {
  /** Variante de tamaño */
  size?: 'sm' | 'md' | 'lg';
  /** Mostrar fuente y fecha */
  showDetails?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

// ============================================
// COMPONENTE
// ============================================

export const TipoCambioIndicator: React.FC<TipoCambioIndicatorProps> = ({
  size = 'md',
  showDetails = true,
  className = ''
}) => {
  const { tipoCambio, loading, error, refresh } = useTipoCambio();

  // ============================================
  // HELPERS
  // ============================================

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // ============================================
  // ESTILOS POR TAMAÑO
  // ============================================

  const sizeStyles = {
    sm: {
      container: 'px-2 py-1',
      icon: 'h-3 w-3',
      label: 'text-xs',
      value: 'text-sm font-bold',
      details: 'text-xs',
      button: 'p-0.5'
    },
    md: {
      container: 'px-3 py-2',
      icon: 'h-4 w-4',
      label: 'text-xs',
      value: 'text-sm font-bold',
      details: 'text-xs',
      button: 'p-1'
    },
    lg: {
      container: 'px-4 py-3',
      icon: 'h-5 w-5',
      label: 'text-sm',
      value: 'text-lg font-bold',
      details: 'text-sm',
      button: 'p-1.5'
    }
  };

  const styles = sizeStyles[size];

  // ============================================
  // RENDER ERROR
  // ============================================

  if (error && !tipoCambio) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg ${styles.container} flex items-center space-x-2 ${className}`}>
        <AlertCircle className={`${styles.icon} text-red-500`} />
        <span className={`${styles.label} text-red-600`}>TC no disponible</span>
        <button
          onClick={refresh}
          disabled={loading}
          className={`${styles.button} hover:bg-red-100 rounded transition-colors`}
          title="Reintentar"
        >
          <RefreshCw className={`${styles.icon} text-red-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className={`bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg ${styles.container} flex items-center space-x-2 ${className}`}>
      <TrendingUp className={`${styles.icon} text-green-600`} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className={`${styles.label} text-gray-500`}>TC BCRA:</span>
          {loading && !tipoCambio ? (
            <div className={`${styles.icon} border-2 border-green-500 border-t-transparent rounded-full animate-spin`} />
          ) : tipoCambio ? (
            <span className={`${styles.value} text-green-700`}>
              $ {tipoCambio.compra.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          ) : (
            <span className={`${styles.label} text-gray-400`}>N/D</span>
          )}
        </div>
        
        {showDetails && tipoCambio && (
          <div className={`${styles.details} text-gray-400 truncate`}>
            {formatDate(tipoCambio.fecha)} • {tipoCambio.fuente}
          </div>
        )}
      </div>
      
      <button
        onClick={refresh}
        disabled={loading}
        className={`${styles.button} hover:bg-green-100 rounded transition-colors disabled:opacity-50`}
        title="Actualizar tipo de cambio"
      >
        <RefreshCw className={`${styles.icon} text-green-600 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};

// ============================================
// COMPONENTE COMPACTO (solo valor)
// ============================================

export const TipoCambioCompact: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { tipoCambio, loading } = useTipoCambio();

  if (loading && !tipoCambio) {
    return <span className={`text-gray-400 ${className}`}>...</span>;
  }

  if (!tipoCambio) {
    return <span className={`text-gray-400 ${className}`}>N/D</span>;
  }

  return (
    <span className={`font-mono text-green-600 ${className}`}>
      ${tipoCambio.compra.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
    </span>
  );
};

// ============================================
// EXPORT DEFAULT
// ============================================

export default TipoCambioIndicator;
