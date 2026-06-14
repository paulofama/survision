// ============================================
// TESORERÍA - DASHBOARD
// Sistema de Costos - Instituto Dr. Mercado
// v1.0.0
// ============================================
// RUTA DESTINO: src/pages/TesoreriaDashboardPage.tsx
// ============================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Clock,
  ArrowRight,
  DollarSign,
  CreditCard,
  PiggyBank,
  Activity,
  BarChart3,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTesoreriaCaja } from '../hooks/useTesoreriaCaja';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const TesoreriaDashboardPage: React.FC = () => {
  const {
    dashboard,
    loading,
    error,
    isConnected,
    fetchDashboard,
    formatCurrency,
    formatNumber
  } = useTesoreriaCaja();

  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Cargar datos al montar
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Actualizar timestamp
  useEffect(() => {
    if (dashboard) {
      setLastUpdate(new Date());
    }
  }, [dashboard]);

  const handleRefresh = useCallback(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ============================================
  // COMPONENTES AUXILIARES
  // ============================================

  const StatCard = ({ 
    title, 
    value, 
    subtitle,
    icon: Icon, 
    color
  }: { 
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ElementType;
    color: string;
  }) => (
    <div className={`${color} rounded-xl p-6 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-white/80 font-medium">{title}</span>
        <Icon className="h-6 w-6 text-white/60" />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{value}</span>
      </div>
      {subtitle && (
        <p className="text-white/70 text-sm mt-2">{subtitle}</p>
      )}
    </div>
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Wallet className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tesorería</h1>
            <p className="text-sm text-gray-500">Dashboard de caja y bancos</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Indicador de conexión */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4" />
                <span>Conectado</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4" />
                <span>Sin conexión</span>
              </>
            )}
          </div>

          {/* Botón actualizar */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !dashboard && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
            <span className="text-gray-500">Cargando datos...</span>
          </div>
        </div>
      )}

      {/* Contenido principal */}
      {dashboard && (
        <>
          {/* Saldo actual - Destacado */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-8 mb-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-lg mb-2">Saldo Actual de Caja</p>
                <p className="text-5xl font-bold text-white">
                  {formatCurrency(dashboard.saldoActual)}
                </p>
                <p className="text-emerald-200 mt-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Actualizado: {lastUpdate.toLocaleString('es-AR')}
                </p>
              </div>
              <div className="hidden md:block">
                <PiggyBank className="h-32 w-32 text-emerald-300/30" />
              </div>
            </div>
          </div>

          {/* Métricas del día y mes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Ingresos Hoy"
              value={formatCurrency(dashboard.hoy.ingresos)}
              subtitle={`${formatNumber(dashboard.hoy.movimientos)} movimientos`}
              icon={ArrowUpRight}
              color="bg-gradient-to-br from-green-500 to-green-600"
            />
            <StatCard
              title="Egresos Hoy"
              value={formatCurrency(dashboard.hoy.egresos)}
              subtitle="Pagos y salidas"
              icon={ArrowDownRight}
              color="bg-gradient-to-br from-red-500 to-red-600"
            />
            <StatCard
              title="Ingresos del Mes"
              value={formatCurrency(dashboard.mes.ingresos)}
              subtitle={`${formatNumber(dashboard.mes.movimientos)} movimientos`}
              icon={TrendingUp}
              color="bg-gradient-to-br from-blue-500 to-blue-600"
            />
            <StatCard
              title="Egresos del Mes"
              value={formatCurrency(dashboard.mes.egresos)}
              subtitle="Acumulado mensual"
              icon={TrendingDown}
              color="bg-gradient-to-br from-orange-500 to-orange-600"
            />
          </div>

          {/* Gráfico y últimos movimientos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Evolución 7 días */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-900">Evolución Últimos 7 Días</h3>
                </div>
              </div>
              
              {dashboard.evolucion7Dias.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.evolucion7Dias.map((dia, index) => {
                    const neto = dia.ingresos - dia.egresos;
                    const maxValue = Math.max(
                      ...dashboard.evolucion7Dias.map(d => Math.max(d.ingresos, d.egresos))
                    );
                    
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 w-20">
                          {new Date(dia.fecha).toLocaleDateString('es-AR', { 
                            weekday: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                        <div className="flex-1 flex gap-1 h-6">
                          <div 
                            className="bg-green-400 rounded-l"
                            style={{ width: `${maxValue > 0 ? (dia.ingresos / maxValue) * 50 : 0}%` }}
                            title={`Ingresos: ${formatCurrency(dia.ingresos)}`}
                          />
                          <div 
                            className="bg-red-400 rounded-r"
                            style={{ width: `${maxValue > 0 ? (dia.egresos / maxValue) * 50 : 0}%` }}
                            title={`Egresos: ${formatCurrency(dia.egresos)}`}
                          />
                        </div>
                        <span className={`text-sm font-medium w-24 text-right ${
                          neto >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {neto >= 0 ? '+' : ''}{formatCurrency(neto)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  No hay datos para mostrar
                </div>
              )}
              
              <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-400 rounded" />
                  <span className="text-sm text-gray-500">Ingresos</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-400 rounded" />
                  <span className="text-sm text-gray-500">Egresos</span>
                </div>
              </div>
            </div>

            {/* Últimos movimientos */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-900">Últimos Movimientos</h3>
                </div>
                <Link 
                  to="/tesoreria/caja/movimientos"
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
                >
                  Ver todos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              
              <div className="space-y-3">
                {dashboard.ultimosMovimientos.map((mov) => (
                  <div 
                    key={mov.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        mov.ingreso > 0 ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {mov.ingreso > 0 ? (
                          <ArrowUpRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {mov.nombre || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {mov.tipo} • {new Date(mov.fecha).toLocaleDateString('es-AR')}
                        </p>
                      </div>
                    </div>
                    <span className={`font-semibold ${
                      mov.ingreso > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {mov.ingreso > 0 ? '+' : '-'}{formatCurrency(mov.ingreso || mov.egreso)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Accesos rápidos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link 
              to="/tesoreria/caja/movimientos"
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
            >
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-gray-700">Movimientos</span>
            </Link>
            <Link 
              to="/tesoreria/caja/saldo-historico"
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
            >
              <Calendar className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-gray-700">Saldo Histórico</span>
            </Link>
            <div className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 opacity-50 cursor-not-allowed">
              <DollarSign className="h-5 w-5 text-gray-400" />
              <span className="font-medium text-gray-400">Bancos</span>
              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Próx.</span>
            </div>
            <div className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 opacity-50 cursor-not-allowed">
              <BarChart3 className="h-5 w-5 text-gray-400" />
              <span className="font-medium text-gray-400">Reportes</span>
              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Próx.</span>
            </div>
          </div>

          {/* Timestamp */}
          <div className="text-center text-xs text-gray-400 mt-6">
            Última actualización: {lastUpdate.toLocaleString('es-AR')}
          </div>
        </>
      )}
    </div>
  );
};

export default TesoreriaDashboardPage;
