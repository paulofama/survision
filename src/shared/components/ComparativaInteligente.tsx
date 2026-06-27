// ============================================
// COMPONENTE: COMPARATIVA INTELIGENTE
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// Ubicación: src/components/ComparativaInteligente.tsx
// ============================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarDays,
  BarChart2,
  Target,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ComparativaData {
  success: boolean;
  periodo: {
    diaActual: number;
    diasEnMes: number;
    diasRestantes: number;
    porcentajeMesTranscurrido: string;
    mesActual: { numero: number; nombre: string; anio: number };
    mesAnterior: { numero: number; nombre: string; anio: number };
  };
  actual: {
    practicas: number;
    ingresos: number;
    coseguro: number;
    cobertura: number;
    promedioDiario: { practicas: number; ingresos: number };
  };
  mesAnteriorMismoPeriodo: {
    practicas: number;
    ingresos: number;
    variacionPracticas: number;
    variacionIngresos: number;
    diferenciaPracticas: number;
    diferenciaIngresos: number;
  };
  mesAnteriorCompleto: {
    practicas: number;
    ingresos: number;
  };
  proyeccion: {
    practicas: number;
    ingresos: number;
    variacionVsMesAnterior: number;
    variacionIngresosVsMesAnterior: number;
  };
  promedioTrimestral: {
    practicas: number;
    ingresos: number;
    variacionPracticas: number;
    variacionIngresos: number;
    mesesIncluidos: Array<{ mes: number; anio: number; nombre: string }>;
  };
  resumen: {
    saludGeneral: 'excelente' | 'bueno' | 'estable' | 'atención';
  };
}

interface ComparativaInteligenteProps {
  titulo?: string;
  compacto?: boolean;
  mostrarProgreso?: boolean;
}

const ComparativaInteligente: React.FC<ComparativaInteligenteProps> = ({
  titulo = 'Comparativa del Período',
  compacto = false,
  mostrarProgreso = true
}) => {
  const [data, setData] = useState<ComparativaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(!compacto);

  const cargarComparativa = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Lee el snapshot de Supabase (lo refresca el daemon on-prem 2 veces/día).
      // Así funciona desde afuera de la clínica.
      const { data: row, error: sbErr } = await supabase
        .from('dashboards_snapshot')
        .select('payload')
        .eq('modulo', 'analisis')
        .eq('anio', 0)
        .eq('mes', 0)
        .maybeSingle();

      if (sbErr) throw new Error(sbErr.message);
      if (!row) {
        setError('Todavía no hay datos sincronizados. El sync corre 2 veces por día (12:00 y 17:00).');
        return;
      }
      setData(row.payload as ComparativaData);
    } catch (err) {
      setError('Error de conexión');
      console.error('Error cargando comparativa:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarComparativa();
  }, [cargarComparativa]);

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('es-AR').format(value);
  };

  const TendenciaIcon = ({ valor, size = 'h-4 w-4' }: { valor: number; size?: string }) => {
    if (valor > 0) return <TrendingUp className={`${size} text-green-500`} />;
    if (valor < 0) return <TrendingDown className={`${size} text-red-500`} />;
    return <Minus className={`${size} text-gray-400`} />;
  };

  const VariacionBadge = ({ valor }: { valor: number }) => {
    const isPositive = valor > 0;
    const isNegative = valor < 0;
    
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isPositive ? 'bg-green-100 text-green-800' :
        isNegative ? 'bg-red-100 text-red-800' :
        'bg-gray-100 text-gray-800'
      }`}>
        <TendenciaIcon valor={valor} size="h-3 w-3 mr-1" />
        {isPositive ? '+' : ''}{valor.toFixed(1)}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-center space-x-2 text-gray-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando comparativa...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 rounded-xl border border-red-200 p-4">
        <p className="text-sm text-red-600">{error || 'Sin datos disponibles'}</p>
        <button
          onClick={cargarComparativa}
          className="mt-2 text-xs text-red-700 hover:text-red-800 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // Modo compacto colapsado
  if (compacto && !expandido) {
    return (
      <div 
        className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
        onClick={() => setExpandido(true)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BarChart2 className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-gray-900">{titulo}</span>
            <span className="text-sm text-gray-500 capitalize">
              {data.periodo.mesActual.nombre} (día {data.periodo.diaActual})
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">vs mes ant:</span>
              <VariacionBadge valor={data.mesAnteriorMismoPeriodo.variacionPracticas} />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">vs prom 3M:</span>
              <VariacionBadge valor={data.promedioTrimestral.variacionPracticas} />
            </div>
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </div>
        </div>
      </div>
    );
  }

  // Modo expandido
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div 
        className={`bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-100 ${
          compacto ? 'cursor-pointer hover:from-blue-100 hover:to-indigo-100' : ''
        }`}
        onClick={() => compacto && setExpandido(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <BarChart2 className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-900">{titulo}</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-600 capitalize">
              {data.periodo.mesActual.nombre} {data.periodo.mesActual.anio}
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              Día {data.periodo.diaActual} de {data.periodo.diasEnMes}
            </span>
            {compacto && <ChevronUp className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
      </div>

      {/* Progreso del mes */}
      {mostrarProgreso && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Progreso del mes</span>
            <span>{data.periodo.porcentajeMesTranscurrido}% ({data.periodo.diasRestantes} días restantes)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${data.periodo.porcentajeMesTranscurrido}%` }}
            />
          </div>
        </div>
      )}

      {/* Contenido - 3 columnas */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        
        {/* VS MES ANTERIOR */}
        <div className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium text-gray-700">vs {data.periodo.mesAnterior.nombre}</span>
            <span className="text-xs text-gray-400">(mismo período)</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prácticas</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">{formatNumber(data.actual.practicas)}</span>
                <VariacionBadge valor={data.mesAnteriorMismoPeriodo.variacionPracticas} />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Ingresos</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">{formatCurrency(data.actual.ingresos)}</span>
                <VariacionBadge valor={data.mesAnteriorMismoPeriodo.variacionIngresos} />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Diferencia: {' '}
                <span className={data.mesAnteriorMismoPeriodo.diferenciaPracticas >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {data.mesAnteriorMismoPeriodo.diferenciaPracticas >= 0 ? '+' : ''}
                  {formatNumber(data.mesAnteriorMismoPeriodo.diferenciaPracticas)} prácticas
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PROYECCIÓN */}
        <div className="p-4 bg-gradient-to-b from-emerald-50/50 to-transparent">
          <div className="flex items-center space-x-2 mb-3">
            <Target className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-gray-700">Proyección cierre</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prácticas est.</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-emerald-700">{formatNumber(data.proyeccion.practicas)}</span>
                <VariacionBadge valor={data.proyeccion.variacionVsMesAnterior} />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Ingresos est.</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-emerald-700">{formatCurrency(data.proyeccion.ingresos)}</span>
                <VariacionBadge valor={data.proyeccion.variacionIngresosVsMesAnterior} />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                vs {data.periodo.mesAnterior.nombre} completo: {formatNumber(data.mesAnteriorCompleto.practicas)} prác.
              </div>
            </div>
          </div>
        </div>

        {/* VS PROMEDIO 3M */}
        <div className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <BarChart2 className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium text-gray-700">vs Promedio 3M</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Prácticas</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">{formatNumber(data.actual.practicas)}</span>
                <VariacionBadge valor={data.promedioTrimestral.variacionPracticas} />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Ingresos</span>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">{formatCurrency(data.actual.ingresos)}</span>
                <VariacionBadge valor={data.promedioTrimestral.variacionIngresos} />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Benchmark: ~{formatNumber(data.promedioTrimestral.practicas)} prác/mes
                <span className="text-gray-400 ml-1">
                  ({data.promedioTrimestral.mesesIncluidos?.map(m => m.nombre).join(', ') || 'N/A'})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Promedio diario: <strong className="text-gray-700">{formatNumber(data.actual.promedioDiario.practicas)} prácticas</strong> · {formatCurrency(data.actual.promedioDiario.ingresos)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              cargarComparativa();
            }}
            className="text-blue-600 hover:text-blue-700 flex items-center space-x-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComparativaInteligente;
