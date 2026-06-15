// ============================================
// PÁGINA: ANÁLISIS POR OBRA SOCIAL
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÓN 3.0 - TOTALES DESDE SERVIDOR
// ============================================
// CAMBIO v3.0: KPIs desde totalesPeriodo del servidor,
// 3 filtros dinámicos (Año+Mes+Prestador), tfoot,
// indicador conexión, footer.
// ============================================
// RUTA: src/pages/analisis/AnalisisPorObraSocialPage.tsx
// ============================================

import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2,
  Search,
  Download,
  TrendingUp,
  DollarSign,
  Users,
  ArrowUpDown,
  RefreshCw,
  Filter,
  X,
  Wifi,
  WifiOff,
  ChevronDown,
  AlertCircle
} from 'lucide-react';
import { useMovimientosPrestaciones } from '@/hooks/useMovimientosPrestaciones';
import ComparativaInteligente from '@/components/ComparativaInteligente';

const AnalisisPorObraSocialPage: React.FC = () => {
  const {
    statsPorObraSocial,
    totalesPeriodo,
    opcionesFiltros,
    loading,
    loadingStats,
    loadingFiltros,
    error,
    isConnected,
    filtros,
    aplicarFiltros,
    limpiarFiltros,
    refetch
  } = useMovimientosPrestaciones();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'cantidad' | 'total_ingresos'>('total_ingresos');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  // ★ v3.0: Filtros por defecto al cargar
  useEffect(() => {
    const fechaActual = new Date();
    const anioActual = fechaActual.getFullYear().toString();
    const mesActual = (fechaActual.getMonth() + 1).toString();
    if (!filtros.anio && !filtros.mes) {
      aplicarFiltros({ anio: anioActual, mes: mesActual });
    }
  }, []);

  // Filtrado local (búsqueda por texto)
  const obrasSocialesFiltradas = useMemo(() => {
    let filtered = [...statsPorObraSocial];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(os =>
        os.nombre?.toLowerCase().includes(term) ||
        os.sigla?.toLowerCase().includes(term)
      );
    }

    filtered.sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return filtered;
  }, [statsPorObraSocial, searchTerm, sortField, sortOrder]);

  // Stats locales: solo conteos que NO vienen del servidor
  const cantidadOS = obrasSocialesFiltradas.length;
  const top3 = useMemo(() => obrasSocialesFiltradas.slice(0, 3), [obrasSocialesFiltradas]);

  const formatCurrency = (value: number): string => {
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

  const handleSort = (field: 'cantidad' | 'total_ingresos') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const exportToCSV = () => {
    const headers = ['Sigla', 'Obra Social', 'Atenciones', '%', 'Ingresos', 'Coseguro', 'Cobertura', 'Promedio'];
    const rows = obrasSocialesFiltradas.map(os => [
      os.sigla,
      os.nombre,
      os.cantidad,
      os.porcentaje,
      os.total_ingresos,
      os.coseguro,
      os.cobertura,
      os.promedio?.toFixed(2)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisis-obras-sociales-${filtros.anio}-${filtros.mes}.csv`;
    a.click();
  };

  const medalColors = ['text-yellow-500', 'text-gray-400', 'text-orange-400'];
  const medalBgs = ['bg-yellow-50 border-yellow-200', 'bg-gray-50 border-gray-200', 'bg-orange-50 border-orange-200'];

  const hayFiltrosActivos = filtros.anio || filtros.mes || filtros.prestadorId;

  return (
    <div className="w-full min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 p-6">
        {/* ═══════════ HEADER ═══════════ */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Análisis por Obra Social</h1>
              <p className="text-gray-500">
                Distribución de ingresos por financiador · {filtros.anio || '—'}/{filtros.mes || '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* ★ v3.0: Indicador de conexión */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            <button
              onClick={() => refetch()}
              disabled={loading || loadingStats}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
              title="Actualizar datos"
            >
              <RefreshCw className={`h-4 w-4 ${(loading || loadingStats) ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mostrarFiltros ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros
              <ChevronDown className={`h-3 w-3 transition-transform ${mostrarFiltros ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          </div>
        </div>

        {/* ═══════════ FILTROS v3.0 (3 filtros: Año + Mes + Prestador) ═══════════ */}
        {mostrarFiltros && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              {/* Año */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-500 mb-1">Año</label>
                <select
                  value={filtros.anio || ''}
                  onChange={(e) => aplicarFiltros({ anio: e.target.value })}
                  disabled={loadingFiltros}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[100px]"
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.anios.map(anio => (
                    <option key={anio} value={anio}>{anio}</option>
                  ))}
                </select>
              </div>

              {/* Mes */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-500 mb-1">Mes</label>
                <select
                  value={filtros.mes || ''}
                  onChange={(e) => aplicarFiltros({ mes: e.target.value })}
                  disabled={loadingFiltros}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[140px]"
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.meses.map(mes => (
                    <option key={mes.value} value={mes.value}>{mes.label}</option>
                  ))}
                </select>
              </div>

              {/* Prestador (filtro útil: ver qué OS atiende cada prestador) */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-slate-500 mb-1">Prestador</label>
                <select
                  value={filtros.prestadorId || ''}
                  onChange={(e) => aplicarFiltros({ prestadorId: e.target.value })}
                  disabled={loadingFiltros}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                >
                  <option value="">Todos los prestadores</option>
                  {opcionesFiltros.prestadores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Limpiar filtros */}
              {hayFiltrosActivos && (
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-transparent mb-1">—</label>
                  <button
                    onClick={() => {
                      limpiarFiltros();
                      setSearchTerm('');
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Limpiar
                  </button>
                </div>
              )}

              {/* Indicador loading filtros */}
              {loadingFiltros && (
                <div className="flex items-center gap-2 text-blue-600 text-sm ml-2 self-end pb-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Cargando opciones...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comparativa Inteligente */}
        <div className="mb-6">
          <ComparativaInteligente
            titulo="Comparativa del Período"
            compacto={true}
            mostrarProgreso={true}
          />
        </div>

        {/* ═══════════ STAT CARDS v3.0 (desde totalesPeriodo) ═══════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Prácticas</span>
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {(loading || loadingStats) ? '...' : formatNumber(totalesPeriodo.practicas)}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-indigo-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Obras Sociales</span>
              <Building2 className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {(loading || loadingStats) ? '...' : formatNumber(cantidadOS)}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-emerald-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Ingresos Totales</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {(loading || loadingStats) ? '...' : formatCurrency(totalesPeriodo.ingresos)}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Promedio/Práctica</span>
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {(loading || loadingStats) ? '...' : formatCurrency(
                totalesPeriodo.practicas > 0 ? totalesPeriodo.ingresos / totalesPeriodo.practicas : 0
              )}
            </p>
          </div>
        </div>

        {/* ═══════════ TOP 3 PODIO ═══════════ */}
        {top3.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {top3.map((os, index) => (
              <div key={os.os_id || index} className={`rounded-xl border-2 p-4 ${medalBgs[index]}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-2xl font-bold ${medalColors[index]}`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                  </span>
                  <span className="text-xs bg-white/50 px-2 py-1 rounded">
                    {os.porcentaje}% del total
                  </span>
                </div>
                <h3 className="font-bold text-gray-900">{os.sigla || 'S/D'}</h3>
                <p className="text-sm text-gray-600 truncate">{os.nombre}</p>
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Atenciones:</span>
                    <span className="font-semibold">{formatNumber(os.cantidad)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Ingresos:</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(os.total_ingresos)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Búsqueda */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por sigla o nombre de obra social..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="text-sm text-gray-500">
              {formatNumber(obrasSocialesFiltradas.length)} resultados
            </div>
          </div>
        </div>

        {/* ═══════════ TABLA v3.0 con tfoot + sticky header ═══════════ */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {(loading || loadingStats) ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-sm text-slate-500">Cargando datos de obras sociales...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-500">
              <AlertCircle className="h-8 w-8" />
              <span className="text-sm">{error}</span>
              <button
                onClick={() => refetch()}
                className="mt-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm"
              >
                Reintentar
              </button>
            </div>
          ) : obrasSocialesFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Building2 className="h-12 w-12" />
              <span className="text-sm">No se encontraron obras sociales para los filtros seleccionados</span>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sigla</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Obra Social</th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('cantidad')}
                    >
                      <div className="flex items-center justify-end space-x-1">
                        <span>Atenciones</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Promedio</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Coseguro</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Cobertura</th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('total_ingresos')}
                    >
                      <div className="flex items-center justify-end space-x-1">
                        <span>Ingresos</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Distribución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {obrasSocialesFiltradas.map((os, index) => (
                    <tr key={os.os_id || index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {index < 3 ? (
                          <span className={`font-bold ${medalColors[index]}`}>
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </span>
                        ) : (
                          index + 1
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          {os.sigla || 'S/D'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{os.nombre}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatNumber(os.cantidad)}</td>
                      <td className="px-4 py-3 text-right text-sm text-amber-700">{formatCurrency(os.promedio || 0)}</td>
                      <td className="px-4 py-3 text-right text-sm text-orange-600">{formatCurrency(os.coseguro)}</td>
                      <td className="px-4 py-3 text-right text-sm text-cyan-600">{formatCurrency(os.cobertura)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-600">{formatCurrency(os.total_ingresos)}</td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(parseFloat(os.porcentaje || '0'), 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* ★ v3.0: tfoot con totales desde servidor */}
                <tfoot className="bg-slate-100 sticky bottom-0 border-t-2 border-slate-300">
                  <tr className="font-bold">
                    <td colSpan={3} className="px-4 py-3 text-sm text-slate-700">TOTALES</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatNumber(totalesPeriodo.practicas)}</td>
                    <td className="px-4 py-3 text-sm text-amber-700 text-right">
                      {formatCurrency(totalesPeriodo.practicas > 0 ? totalesPeriodo.ingresos / totalesPeriodo.practicas : 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatCurrency(totalesPeriodo.coseguro)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatCurrency(totalesPeriodo.cobertura)}</td>
                    <td className="px-4 py-3 text-sm text-emerald-700 text-right">{formatCurrency(totalesPeriodo.ingresos)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 text-center">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ FOOTER v3.0 ═══════════ */}
      <div className="px-6 py-3 bg-white border-t border-slate-200 mt-auto">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Fuente: SQL Server Local - GECLISA
          </span>
          <span className="font-medium">
            {formatNumber(cantidadOS)} obras sociales · {formatNumber(totalesPeriodo.practicas)} prácticas · {formatCurrency(totalesPeriodo.ingresos)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AnalisisPorObraSocialPage;
