// ============================================
// DASHBOARD EJECUTIVO v3 - COMPARACIÓN INTELIGENTE
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// Visión 360° con comparativas justas por período
// ============================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  DollarSign,
  Calendar,
  Activity,
  RefreshCw,
  Building2,
  UserCheck,
  Clock,
  Stethoscope,
  Target,
  Award,
  ArrowRight,
  CalendarDays,
  TrendingUp as ProjectionIcon,
  BarChart2,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { useMovimientosPrestaciones } from '@/hooks/useMovimientosPrestaciones';
import { Link } from 'react-router-dom';

// ============================================
// TIPOS
// ============================================

interface ComparativaInteligente {
  success: boolean;
  generadoEn: string;
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
    diferenciaPracticas: number;
    diferenciaIngresos: number;
  };
  promedioTrimestral: {
    practicas: number;
    ingresos: number;
    variacionPracticas: number;
    variacionIngresos: number;
    mesesIncluidos: Array<{ mes: number; anio: number; nombre: string }>;
  };
  interanual: {
    practicas: number;
    ingresos: number;
    variacionPracticas: number;
    variacionIngresos: number;
  };
  resumen: {
    tendenciaMensual: 'up' | 'down' | 'stable';
    tendenciaProyeccion: 'up' | 'down' | 'stable';
    tendenciaTrimestral: 'up' | 'down' | 'stable';
    tendenciaInteranual: 'up' | 'down' | 'stable';
    saludGeneral: 'excelente' | 'bueno' | 'estable' | 'atención';
  };
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const DashboardAnalisisPage: React.FC = () => {
  const {
    statsPorObraSocial,
    statsPorPrestador,
    statsPorPrestacion,
    loading: loadingHook,
    isConnected,
    refetch
  } = useMovimientosPrestaciones();

  const [comparativa, setComparativa] = useState<ComparativaInteligente | null>(null);
  const [loadingComparativa, setLoadingComparativa] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // ============================================
  // CARGAR COMPARATIVA INTELIGENTE
  // ============================================

  const cargarComparativa = useCallback(async () => {
    setLoadingComparativa(true);
    try {
      const response = await fetch('http://localhost:3001/api/movimientos/comparativa-inteligente');
      const data = await response.json();
      
      if (data.success) {
        setComparativa(data);
        console.log('✅ Comparativa inteligente cargada:', data);
      } else {
        console.error('❌ Error en comparativa:', data.error);
      }
    } catch (error) {
      console.error('❌ Error cargando comparativa:', error);
    } finally {
      setLoadingComparativa(false);
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    cargarComparativa();
  }, [cargarComparativa]);

  const handleRefresh = () => {
    cargarComparativa();
    refetch();
  };

  // ============================================
  // FORMATTERS
  // ============================================

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$ ${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$ ${(value / 1000).toFixed(0)}K`;
    }
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('es-AR').format(value);
  };

  // ============================================
  // COMPONENTES AUXILIARES
  // ============================================

  const TendenciaIcon = ({ valor }: { valor: number }) => {
    if (valor > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (valor < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const SaludIcon = ({ salud }: { salud: string }) => {
    switch (salud) {
      case 'excelente':
        return <CheckCircle2 className="h-6 w-6 text-green-500" />;
      case 'bueno':
        return <Zap className="h-6 w-6 text-blue-500" />;
      case 'estable':
        return <Minus className="h-6 w-6 text-yellow-500" />;
      case 'atención':
        return <AlertTriangle className="h-6 w-6 text-red-500" />;
      default:
        return <Activity className="h-6 w-6 text-gray-400" />;
    }
  };

  const saludColor = (salud: string) => {
    switch (salud) {
      case 'excelente': return 'bg-green-50 border-green-200 text-green-800';
      case 'bueno': return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'estable': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'atención': return 'bg-red-50 border-red-200 text-red-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  // ============================================
  // RENDER - LOADING
  // ============================================

  const loading = loadingComparativa || loadingHook;

  if (loading && !comparativa) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Calculando métricas inteligentes...</p>
        </div>
      </div>
    );
  }

  // Top 5 de cada categoría
  const top5OS = statsPorObraSocial.slice(0, 5);
  const top5Prestadores = statsPorPrestador.slice(0, 5);
  const top5Prestaciones = statsPorPrestacion.slice(0, 5);

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="w-full min-h-screen bg-gray-50 p-6">
      {/* ==================== HEADER ==================== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
            <BarChart3 className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Ejecutivo</h1>
            <p className="text-gray-500 capitalize">
              {comparativa?.periodo.mesActual.nombre} {comparativa?.periodo.mesActual.anio} 
              <span className="text-blue-600 ml-2">
                (día {comparativa?.periodo.diaActual} de {comparativa?.periodo.diasEnMes})
              </span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Indicador de salud general */}
          {comparativa && (
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg border ${saludColor(comparativa.resumen.saludGeneral)}`}>
              <SaludIcon salud={comparativa.resumen.saludGeneral} />
              <span className="font-medium capitalize">{comparativa.resumen.saludGeneral}</span>
            </div>
          )}
          
          {/* Conexión */}
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
            isConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            <Activity className={`h-4 w-4 ${isConnected ? 'text-green-500' : 'text-red-500'}`} />
            <span className="text-sm font-medium hidden md:inline">
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          
          {/* Botón actualizar */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* ==================== PROGRESO DEL MES ==================== */}
      {comparativa && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Progreso del mes</span>
            <span className="text-sm text-gray-500">
              {comparativa.periodo.diasRestantes} días restantes
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${comparativa.periodo.porcentajeMesTranscurrido}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>1 de {comparativa.periodo.mesActual.nombre}</span>
            <span className="font-medium text-blue-600">{comparativa.periodo.porcentajeMesTranscurrido}% transcurrido</span>
            <span>{comparativa.periodo.diasEnMes} de {comparativa.periodo.mesActual.nombre}</span>
          </div>
        </div>
      )}

      {/* ==================== MÉTRICAS ACTUALES ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Prácticas Actual */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Prácticas</span>
            <Stethoscope className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatNumber(comparativa?.actual.practicas || 0)}</p>
          <p className="text-sm text-gray-500 mt-1">
            al día {comparativa?.periodo.diaActual}
          </p>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-600">
              ~{formatNumber(comparativa?.actual.promedioDiario.practicas || 0)}/día
            </span>
          </div>
        </div>

        {/* Ingresos Actual */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Ingresos</span>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(comparativa?.actual.ingresos || 0)}</p>
          <p className="text-sm text-gray-500 mt-1">facturación acumulada</p>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-600">
              ~{formatCurrency(comparativa?.actual.promedioDiario.ingresos || 0)}/día
            </span>
          </div>
        </div>

        {/* Coseguro */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Coseguro</span>
            <UserCheck className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(comparativa?.actual.coseguro || 0)}</p>
          <p className="text-sm text-gray-500 mt-1">copago pacientes</p>
        </div>

        {/* Cobertura */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-cyan-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Cobertura</span>
            <Building2 className="h-5 w-5 text-cyan-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(comparativa?.actual.cobertura || 0)}</p>
          <p className="text-sm text-gray-500 mt-1">facturado a OS</p>
        </div>
      </div>

      {/* ==================== COMPARACIÓN INTELIGENTE (3 INDICADORES) ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        
        {/* 1. VS MES ANTERIOR (mismo período) */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CalendarDays className="h-5 w-5 text-indigo-200" />
              <span className="text-indigo-100 text-sm font-medium">VS MES ANTERIOR</span>
            </div>
            <span className="text-xs bg-indigo-400/30 px-2 py-1 rounded">
              mismo período (1-{comparativa?.periodo.diaActual})
            </span>
          </div>
          
          <div className="space-y-4">
            {/* Prácticas */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-indigo-200 text-sm">Prácticas</span>
                <div className="flex items-center space-x-2">
                  <TendenciaIcon valor={comparativa?.mesAnteriorMismoPeriodo.variacionPracticas || 0} />
                  <span className={`font-bold ${
                    (comparativa?.mesAnteriorMismoPeriodo.variacionPracticas || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {(comparativa?.mesAnteriorMismoPeriodo.variacionPracticas || 0) > 0 ? '+' : ''}
                    {comparativa?.mesAnteriorMismoPeriodo.variacionPracticas?.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold">{formatNumber(comparativa?.actual.practicas || 0)}</span>
                <span className="text-indigo-300 text-sm">
                  vs {formatNumber(comparativa?.mesAnteriorMismoPeriodo.practicas || 0)} ({comparativa?.periodo.mesAnterior.nombre})
                </span>
              </div>
            </div>
            
            {/* Ingresos */}
            <div className="pt-3 border-t border-indigo-400/30">
              <div className="flex items-center justify-between">
                <span className="text-indigo-200 text-sm">Ingresos</span>
                <span className={`font-bold ${
                  (comparativa?.mesAnteriorMismoPeriodo.variacionIngresos || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                }`}>
                  {(comparativa?.mesAnteriorMismoPeriodo.variacionIngresos || 0) > 0 ? '+' : ''}
                  {comparativa?.mesAnteriorMismoPeriodo.variacionIngresos?.toFixed(1)}%
                </span>
              </div>
              <div className="text-sm text-indigo-200 mt-1">
                Diferencia: <span className={`font-medium ${
                  (comparativa?.mesAnteriorMismoPeriodo.diferenciaIngresos || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                }`}>
                  {(comparativa?.mesAnteriorMismoPeriodo.diferenciaIngresos || 0) >= 0 ? '+' : ''}
                  {formatCurrency(comparativa?.mesAnteriorMismoPeriodo.diferenciaIngresos || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. PROYECCIÓN AL CIERRE */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <ProjectionIcon className="h-5 w-5 text-emerald-200" />
              <span className="text-emerald-100 text-sm font-medium">PROYECCIÓN CIERRE</span>
            </div>
            <span className="text-xs bg-emerald-400/30 px-2 py-1 rounded">
              estimado al día {comparativa?.periodo.diasEnMes}
            </span>
          </div>
          
          <div className="space-y-4">
            {/* Prácticas Proyectadas */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-emerald-200 text-sm">Prácticas proyectadas</span>
                <div className="flex items-center space-x-2">
                  <TendenciaIcon valor={comparativa?.proyeccion.variacionVsMesAnterior || 0} />
                  <span className={`font-bold ${
                    (comparativa?.proyeccion.variacionVsMesAnterior || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {(comparativa?.proyeccion.variacionVsMesAnterior || 0) > 0 ? '+' : ''}
                    {comparativa?.proyeccion.variacionVsMesAnterior?.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold">{formatNumber(comparativa?.proyeccion.practicas || 0)}</span>
                <span className="text-emerald-300 text-sm">
                  vs {formatNumber(comparativa?.mesAnteriorCompleto.practicas || 0)} ({comparativa?.periodo.mesAnterior.nombre})
                </span>
              </div>
            </div>
            
            {/* Ingresos Proyectados */}
            <div className="pt-3 border-t border-emerald-400/30">
              <div className="flex items-center justify-between">
                <span className="text-emerald-200 text-sm">Ingresos proyectados</span>
                <span className={`font-bold ${
                  (comparativa?.proyeccion.variacionIngresosVsMesAnterior || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                }`}>
                  {(comparativa?.proyeccion.variacionIngresosVsMesAnterior || 0) > 0 ? '+' : ''}
                  {comparativa?.proyeccion.variacionIngresosVsMesAnterior?.toFixed(1)}%
                </span>
              </div>
              <p className="text-xl font-bold mt-1">{formatCurrency(comparativa?.proyeccion.ingresos || 0)}</p>
            </div>
          </div>
        </div>

        {/* 3. VS PROMEDIO TRIMESTRAL */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <BarChart2 className="h-5 w-5 text-purple-200" />
              <span className="text-purple-100 text-sm font-medium">VS PROMEDIO 3M</span>
            </div>
            <span className="text-xs bg-purple-400/30 px-2 py-1 rounded">
              {comparativa?.promedioTrimestral.mesesIncluidos?.map(m => m.nombre).join(', ')}
            </span>
          </div>
          
          <div className="space-y-4">
            {/* Prácticas vs Promedio */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-purple-200 text-sm">Prácticas</span>
                <div className="flex items-center space-x-2">
                  <TendenciaIcon valor={comparativa?.promedioTrimestral.variacionPracticas || 0} />
                  <span className={`font-bold ${
                    (comparativa?.promedioTrimestral.variacionPracticas || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                  }`}>
                    {(comparativa?.promedioTrimestral.variacionPracticas || 0) > 0 ? '+' : ''}
                    {comparativa?.promedioTrimestral.variacionPracticas?.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold">{formatNumber(comparativa?.actual.practicas || 0)}</span>
                <span className="text-purple-300 text-sm">
                  vs ~{formatNumber(comparativa?.promedioTrimestral.practicas || 0)} promedio
                </span>
              </div>
            </div>
            
            {/* Ingresos vs Promedio */}
            <div className="pt-3 border-t border-purple-400/30">
              <div className="flex items-center justify-between">
                <span className="text-purple-200 text-sm">Ingresos</span>
                <span className={`font-bold ${
                  (comparativa?.promedioTrimestral.variacionIngresos || 0) >= 0 ? 'text-green-300' : 'text-red-300'
                }`}>
                  {(comparativa?.promedioTrimestral.variacionIngresos || 0) > 0 ? '+' : ''}
                  {comparativa?.promedioTrimestral.variacionIngresos?.toFixed(1)}%
                </span>
              </div>
              <p className="text-sm text-purple-200 mt-1">
                Benchmark: {formatCurrency(comparativa?.promedioTrimestral.ingresos || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== COMPARACIÓN INTERANUAL (BONUS) ==================== */}
      {comparativa?.interanual && comparativa.interanual.practicas > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <span className="font-medium text-gray-700">
                vs {comparativa.periodo.mesActual.nombre} {comparativa.periodo.mesActual.anio - 1} (interanual)
              </span>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Prácticas:</span>
                <TendenciaIcon valor={comparativa.interanual.variacionPracticas} />
                <span className={`font-medium ${
                  comparativa.interanual.variacionPracticas >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {comparativa.interanual.variacionPracticas > 0 ? '+' : ''}
                  {comparativa.interanual.variacionPracticas.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Ingresos:</span>
                <TendenciaIcon valor={comparativa.interanual.variacionIngresos} />
                <span className={`font-medium ${
                  comparativa.interanual.variacionIngresos >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {comparativa.interanual.variacionIngresos > 0 ? '+' : ''}
                  {comparativa.interanual.variacionIngresos.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TOP RANKINGS ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        
        {/* Top 5 Obras Sociales */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Award className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900">Top Obras Sociales</h3>
            </div>
            <Link to="/analisis/por-obra-social" className="text-blue-600 hover:text-blue-700">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          
          <div className="space-y-3">
            {top5OS.map((os, index) => (
              <div key={os.os_id || index} className="flex items-center">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                  index === 0 ? 'bg-yellow-100 text-yellow-700' :
                  index === 1 ? 'bg-gray-100 text-gray-600' :
                  index === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-50 text-gray-500'
                }`}>
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-700 truncate">{os.sigla || 'S/D'}</span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(os.total_ingresos)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Prestaciones */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Stethoscope className="h-5 w-5 text-green-500" />
              <h3 className="font-semibold text-gray-900">Top Prestaciones</h3>
            </div>
            <Link to="/analisis/por-prestacion" className="text-blue-600 hover:text-blue-700">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          
          <div className="space-y-3">
            {top5Prestaciones.map((prest, index) => (
              <div key={prest.codigo || index} className="flex items-center">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                  index === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-500'
                }`}>
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-700 truncate" title={prest.prestacion}>
                  {prest.prestacion?.substring(0, 25)}...
                </span>
                <span className="text-sm text-gray-500">{formatNumber(prest.cantidad)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Prestadores */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-purple-500" />
              <h3 className="font-semibold text-gray-900">Top Profesionales</h3>
            </div>
            <Link to="/analisis/por-prestador" className="text-blue-600 hover:text-blue-700">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          
          <div className="space-y-3">
            {top5Prestadores.map((prest, index) => (
              <div key={prest.prestador_id || index} className="flex items-center">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                  index === 0 ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-500'
                }`}>
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                  {prest.prestador?.split(' ').slice(0, 2).join(' ')}
                </span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(prest.total_ingresos)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== FOOTER: ACCESOS RÁPIDOS ==================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link 
          to="/analisis/por-prestacion"
          className="flex items-center justify-center space-x-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-200 transition-colors"
        >
          <Stethoscope className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-700">Por Prestación</span>
        </Link>
        <Link 
          to="/analisis/por-obra-social"
          className="flex items-center justify-center space-x-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-200 transition-colors"
        >
          <Building2 className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-700">Por Obra Social</span>
        </Link>
        <Link 
          to="/analisis/por-prestador"
          className="flex items-center justify-center space-x-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-200 transition-colors"
        >
          <Users className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-700">Por Prestador</span>
        </Link>
        <Link 
          to="/analisis/evolucion"
          className="flex items-center justify-center space-x-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-200 transition-colors"
        >
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-700">Evolución</span>
        </Link>
      </div>

      {/* Timestamp */}
      <div className="text-center text-xs text-gray-400 mt-6">
        Última actualización: {lastUpdate.toLocaleString('es-AR')}
      </div>
    </div>
  );
};

export default DashboardAnalisisPage;
