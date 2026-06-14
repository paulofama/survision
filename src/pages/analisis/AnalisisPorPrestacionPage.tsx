// ============================================
// PÁGINA: ANÁLISIS POR PRESTACIÓN
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÓN 3.0 - TOTALES DESDE SERVIDOR
// ============================================
// CAMBIO v3.0: KPIs desde totalesPeriodo del servidor,
// 4 filtros dinámicos, tfoot, indicador conexión, footer.
// ============================================
// RUTA: src/pages/analisis/AnalisisPorPrestacionPage.tsx
// ============================================

import React, { useMemo, useState, useEffect } from 'react';
import {
  Stethoscope,
  Search,
  Download,
  TrendingUp,
  BarChart3,
  DollarSign,
  Hash,
  ArrowUpDown,
  RefreshCw,
  Filter,
  X,
  Wifi,
  WifiOff,
  ChevronDown,
  AlertCircle
} from 'lucide-react';
import { useMovimientosPrestaciones } from '../../hooks/useMovimientosPrestaciones';
import ComparativaInteligente from '../../components/ComparativaInteligente';

const AnalisisPorPrestacionPage: React.FC = () => {
  const {
    statsPorPrestacion,
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
  const prestacionesFiltradas = useMemo(() => {
    let filtered = [...statsPorPrestacion];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.prestacion?.toLowerCase().includes(term) ||
        p.codigo?.toLowerCase().includes(term)
      );
    }
    filtered.sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return filtered;
  }, [statsPorPrestacion, searchTerm, sortField, sortOrder]);

  // Conteo local: cantidad de tipos distintos (NO viene del servidor)
  const tiposPrestacion = statsPorPrestacion.length;

  // ============================================
  // HELPERS
  // ============================================

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency', currency: 'ARS',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('es-AR').format(value);
  };

  const getNombreMes = (mes: string): string => {
    const meses: Record<string, string> = {
      '1': 'Enero', '2': 'Febrero', '3': 'Marzo', '4': 'Abril',
      '5': 'Mayo', '6': 'Junio', '7': 'Julio', '8': 'Agosto',
      '9': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };
    return meses[mes] || '';
  };

  const periodoTexto = filtros.anio && filtros.mes
    ? `${getNombreMes(filtros.mes)} ${filtros.anio}`
    : filtros.anio ? `Año ${filtros.anio}` : 'Todos los períodos';

  const handleSort = (field: 'cantidad' | 'total_ingresos') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const exportToCSV = () => {
    if (prestacionesFiltradas.length === 0) return;
    const headers = ['#', 'Código', 'Prestación', 'Cantidad', '%', 'Ingresos', 'Coseguro', 'Cobertura', 'Promedio'];
    const rows = prestacionesFiltradas.map((p, idx) => [
      idx + 1, p.codigo, `"${p.prestacion}"`, p.cantidad, p.porcentaje,
      p.total_ingresos, p.coseguro, p.cobertura, p.promedio?.toFixed(0) || 0
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analisis-prestaciones-${filtros.anio || 'todos'}-${filtros.mes || 'todos'}.csv`;
    link.click();
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ==================== HEADER ==================== */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg shadow-green-500/20">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Análisis por Prestación</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Detalle de prácticas realizadas · {periodoTexto}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador de conexión */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            <button
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                mostrarFiltros
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filtros
              <ChevronDown className={`h-4 w-4 transition-transform ${mostrarFiltros ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={refetch}
              disabled={loading || loadingStats}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg transition-colors shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${(loading || loadingStats) ? 'animate-spin' : ''}`} />
              Actualizar
            </button>

            <button
              onClick={exportToCSV}
              disabled={prestacionesFiltradas.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white rounded-lg transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
          </div>
        </div>

        {/* ==================== FILTROS ==================== */}
        {mostrarFiltros && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex flex-wrap items-end gap-4">
              {/* Año */}
              <div className="w-32">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Año</label>
                <select
                  value={filtros.anio}
                  onChange={(e) => aplicarFiltros({ anio: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loadingFiltros}
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.anios.map(anio => (
                    <option key={anio} value={anio}>{anio}</option>
                  ))}
                </select>
              </div>

              {/* Mes */}
              <div className="w-36">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Mes</label>
                <select
                  value={filtros.mes}
                  onChange={(e) => aplicarFiltros({ mes: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loadingFiltros}
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.meses.map(mes => (
                    <option key={mes.value} value={mes.value}>{mes.label}</option>
                  ))}
                </select>
              </div>

              {/* Obra Social */}
              <div className="w-56">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Obra Social</label>
                <select
                  value={filtros.obraSocialId}
                  onChange={(e) => aplicarFiltros({ obraSocialId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loadingFiltros}
                >
                  <option value="">Todas</option>
                  {opcionesFiltros.obrasSociales.map(os => (
                    <option key={os.id} value={os.id}>{os.sigla} - {os.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Prestador */}
              <div className="w-56">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Prestador</label>
                <select
                  value={filtros.prestadorId}
                  onChange={(e) => aplicarFiltros({ prestadorId: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={loadingFiltros}
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.prestadores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Búsqueda local */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar por código o nombre..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Limpiar */}
              <button
                onClick={() => { limpiarFiltros(); setSearchTerm(''); }}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== CONTENIDO ==================== */}
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Comparativa Inteligente */}
        <ComparativaInteligente titulo="Comparativa del Período" compacto={true} mostrarProgreso={true} />

        {/* ==================== STAT CARDS ==================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Prácticas</span>
              <Hash className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(totalesPeriodo.practicas)}</p>
            <p className="text-xs text-slate-400 mt-1">Realizadas</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Tipos de Prestación</span>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(tiposPrestacion)}</p>
            <p className="text-xs text-slate-400 mt-1">Distintas</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Ingresos Totales</span>
              <DollarSign className="h-4 w-4 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalesPeriodo.ingresos)}</p>
            <p className="text-xs text-slate-400 mt-1">Coseguro + Cobertura</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Promedio/Práctica</span>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(totalesPeriodo.practicas > 0 ? totalesPeriodo.ingresos / totalesPeriodo.practicas : 0)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Ingreso por práctica</p>
          </div>
        </div>

        {/* ==================== TABLA ==================== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Detalle por Prestación</h3>
            <span className="text-sm text-slate-500">
              {prestacionesFiltradas.length} tipos · {formatNumber(totalesPeriodo.practicas)} prácticas
            </span>
          </div>

          {(loading || loadingStats) ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Cargando datos...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-red-500">
                <AlertCircle className="h-10 w-10" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          ) : prestacionesFiltradas.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Stethoscope className="h-12 w-12" />
                <span className="text-sm">No hay datos para mostrar</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Código</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Prestación</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 w-24" onClick={() => handleSort('cantidad')}>
                        <div className="flex items-center justify-end space-x-1"><span>Cantidad</span><ArrowUpDown className="h-3 w-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">%</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 w-32" onClick={() => handleSort('total_ingresos')}>
                        <div className="flex items-center justify-end space-x-1"><span>Ingresos</span><ArrowUpDown className="h-3 w-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Coseguro</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Cobertura</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {prestacionesFiltradas.map((prestacion, index) => (
                      <tr key={prestacion.codigo || index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-slate-400 font-medium">{index + 1}</td>
                        <td className="px-4 py-3"><span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">{prestacion.codigo}</span></td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{prestacion.prestacion}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatNumber(prestacion.cantidad)}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-500">{prestacion.porcentaje}%</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{formatCurrency(prestacion.total_ingresos)}</td>
                        <td className="px-4 py-3 text-right text-sm text-orange-600">{formatCurrency(prestacion.coseguro)}</td>
                        <td className="px-4 py-3 text-right text-sm text-cyan-600">{formatCurrency(prestacion.cobertura)}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(prestacion.promedio || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 sticky bottom-0 border-t-2 border-slate-300">
                    <tr className="font-bold">
                      <td colSpan={3} className="px-4 py-3 text-sm text-slate-700">TOTALES</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatNumber(totalesPeriodo.practicas)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-right">100%</td>
                      <td className="px-4 py-3 text-sm text-emerald-700 text-right">{formatCurrency(totalesPeriodo.ingresos)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatCurrency(totalesPeriodo.coseguro)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatCurrency(totalesPeriodo.cobertura)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">
                        {formatCurrency(totalesPeriodo.practicas > 0 ? totalesPeriodo.ingresos / totalesPeriodo.practicas : 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== FOOTER ==================== */}
      <div className="px-6 py-3 bg-white border-t border-slate-200">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Fuente: SQL Server Local - GECLISA
          </span>
          <span className="font-medium">
            {tiposPrestacion} tipos · {formatNumber(totalesPeriodo.practicas)} prácticas · {formatCurrency(totalesPeriodo.ingresos)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AnalisisPorPrestacionPage;
