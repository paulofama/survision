// ============================================
// TESORERÍA - SALDO HISTÓRICO
// Sistema de Costos - Instituto Dr. Mercado
// v1.0.0
// ============================================
// RUTA DESTINO: src/pages/SaldoHistoricoPage.tsx
// ============================================

import React, { useState, useCallback } from 'react';
import {
  Wallet,
  Calendar,
  Search,
  Clock,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  History,
  RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTesoreriaCaja, SaldoHistorico } from '../hooks/useTesoreriaCaja';

const SaldoHistoricoPage: React.FC = () => {
  const {
    loading,
    error,
    fetchSaldoHistorico,
    formatCurrency,
    formatNumber
  } = useTesoreriaCaja();

  const [fechaConsulta, setFechaConsulta] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [resultado, setResultado] = useState<SaldoHistorico | null>(null);
  const [historialConsultas, setHistorialConsultas] = useState<Array<{
    fecha: string;
    saldo: number;
    consultadoEn: Date;
  }>>([]);

  const handleConsultar = useCallback(async () => {
    const data = await fetchSaldoHistorico(fechaConsulta);
    if (data) {
      setResultado(data);
      // Agregar al historial
      setHistorialConsultas(prev => {
        const nuevo = {
          fecha: fechaConsulta,
          saldo: data.saldo,
          consultadoEn: new Date()
        };
        // Evitar duplicados y mantener máximo 10
        const filtrado = prev.filter(h => h.fecha !== fechaConsulta);
        return [nuevo, ...filtrado].slice(0, 10);
      });
    }
  }, [fechaConsulta, fetchSaldoHistorico]);

  // Presets de fechas rápidas
  const setPreset = (dias: number) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dias);
    setFechaConsulta(fecha.toISOString().split('T')[0]);
  };

  const setFinMesAnterior = () => {
    const fecha = new Date();
    fecha.setDate(0); // Último día del mes anterior
    setFechaConsulta(fecha.toISOString().split('T')[0]);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/tesoreria" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div className="p-2 bg-emerald-100 rounded-lg">
          <History className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saldo Histórico</h1>
          <p className="text-sm text-gray-500">Consultar saldo de caja a una fecha específica</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel de consulta */}
        <div className="lg:col-span-2 space-y-6">
          {/* Formulario de consulta */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-gray-400" />
              <h3 className="font-semibold text-gray-900">Seleccionar Fecha</h3>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="date"
                  value={fechaConsulta}
                  onChange={(e) => setFechaConsulta(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg"
                />
              </div>
              <button
                onClick={handleConsultar}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
                Consultar Saldo
              </button>
            </div>

            {/* Presets rápidos */}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => setPreset(0)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={() => setPreset(1)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Ayer
              </button>
              <button
                onClick={() => setPreset(7)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Hace 7 días
              </button>
              <button
                onClick={setFinMesAnterior}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Fin mes anterior
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Saldo destacado */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-8 text-white">
                <p className="text-emerald-100 mb-2">
                  Saldo al {new Date(resultado.fecha).toLocaleDateString('es-AR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
                <p className="text-5xl font-bold">
                  {formatCurrency(resultado.saldo)}
                </p>
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-3 divide-x divide-gray-200">
                <div className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2 text-green-600 mb-2">
                    <ArrowUpRight className="h-5 w-5" />
                    <span className="text-sm font-medium">Total Ingresos</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(resultado.total_ingresos)}
                  </p>
                </div>
                <div className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2 text-red-600 mb-2">
                    <ArrowDownRight className="h-5 w-5" />
                    <span className="text-sm font-medium">Total Egresos</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(resultado.total_egresos)}
                  </p>
                </div>
                <div className="p-6 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-600 mb-2">
                    <Wallet className="h-5 w-5" />
                    <span className="text-sm font-medium">Movimientos</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatNumber(resultado.total_movimientos)}
                  </p>
                </div>
              </div>

              {/* Link a movimientos */}
              <div className="p-4 bg-gray-50 border-t border-gray-200">
                <Link
                  to={`/tesoreria/caja/movimientos?fechaHasta=${resultado.fecha}`}
                  className="flex items-center justify-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Ver movimientos hasta esta fecha
                  <ChevronLeft className="h-4 w-4 rotate-180" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Panel lateral - Historial */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-gray-400" />
              <h3 className="font-semibold text-gray-900">Consultas Recientes</h3>
            </div>

            {historialConsultas.length > 0 ? (
              <div className="space-y-3">
                {historialConsultas.map((consulta, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setFechaConsulta(consulta.fecha);
                      handleConsultar();
                    }}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">
                        {new Date(consulta.fecha).toLocaleDateString('es-AR')}
                      </span>
                      <span className={`font-semibold ${
                        consulta.saldo >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(consulta.saldo)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Consultado: {consulta.consultadoEn.toLocaleTimeString('es-AR')}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No hay consultas recientes</p>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
            <h4 className="font-medium text-emerald-800 mb-2">💡 Tip</h4>
            <p className="text-sm text-emerald-700">
              El saldo histórico calcula todos los movimientos desde el inicio hasta la fecha seleccionada, 
              permitiéndote verificar el saldo de caja en cualquier momento del pasado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaldoHistoricoPage;
