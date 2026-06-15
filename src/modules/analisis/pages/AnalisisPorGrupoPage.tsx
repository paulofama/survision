// ============================================
// ANÃLISIS POR GRUPO DE PRÃCTICAS
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÃ“N 3.0 - TOTALES DESDE SERVIDOR
// ============================================
// CAMBIO v3.0: Los KPIs ahora usan `totalesPeriodo` y
// `statsPorGrupo` del servidor, NO calculan sobre
// datos paginados del frontend.
// ============================================
// RUTA: src/pages/analisis/AnalisisPorGrupoPage.tsx
// ============================================

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  Calendar,
  FolderTree,
  TrendingUp,
  DollarSign,
  Users,
  AlertCircle,
  Filter,
  X,
  Wifi,
  WifiOff,
  ChevronDown,
  Hash,
  Activity,
  Layers
} from 'lucide-react';
import { useMovimientosPrestaciones } from '@/hooks/useMovimientosPrestaciones';
import { FiltroSelect, StatCard } from '@/components/ui';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const AnalisisPorGrupoPage: React.FC = () => {
  const {
    prestaciones,
    totalesPeriodo,        // â˜… v3.0: Totales del servidor
    statsPorGrupo,         // â˜… v3.0: Datos agrupados del servidor
    opcionesFiltros,
    filtros,
    aplicarFiltros,
    limpiarFiltros,
    loading,
    loadingStats,
    loadingFiltros,
    error,
    isConnected,
    refetch
  } = useMovimientosPrestaciones();

  const [busquedaLocal, setBusquedaLocal] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  // Filtros por defecto al cargar
  useEffect(() => {
    const fechaActual = new Date();
    const anioActual = fechaActual.getFullYear().toString();
    const mesActual = (fechaActual.getMonth() + 1).toString();
    
    if (!filtros.anio && !filtros.mes) {
      aplicarFiltros({ anio: anioActual, mes: mesActual });
    }
  }, []);

  // ============================================
  // FILTRAR DATOS POR BÃšSQUEDA LOCAL
  // ============================================

  const datosFiltrados = useMemo(() => {
    if (!statsPorGrupo || statsPorGrupo.length === 0) return [];
    
    if (!busquedaLocal.trim()) return statsPorGrupo;
    
    const termino = busquedaLocal.toLowerCase();
    return statsPorGrupo.filter(g =>
      g.grupo_nombre?.toLowerCase().includes(termino)
    );
  }, [statsPorGrupo, busquedaLocal]);

  // Top 10 para grÃ¡fico
  const top10 = datosFiltrados.slice(0, 10);

  // ============================================
  // HELPERS
  // ============================================

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
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

  const getBarColor = (index: number): string => {
    const colors = [
      'bg-amber-500', 'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-rose-500',
      'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'
    ];
    return colors[index % colors.length];
  };

  const periodoTexto = filtros.anio && filtros.mes 
    ? `${getNombreMes(filtros.mes)} ${filtros.anio}`
    : filtros.anio 
      ? `AÃ±o ${filtros.anio}`
      : 'Todos los perÃ­odos';

  // Exportar a CSV
  const exportarCSV = () => {
    if (datosFiltrados.length === 0) return;
    const headers = ['#', 'Grupo', 'Tipos', 'Cantidad', '%', 'Promedio', 'Coseguro', 'Cobertura', 'Total'];
    const rows = datosFiltrados.map((item, idx) => [
      idx + 1, 
      `"${item.grupo_nombre}"`, 
      item.tipos_prestacion,
      item.cantidad,
      item.porcentaje, 
      item.promedio?.toFixed(0) || 0, 
      item.coseguro, 
      item.cobertura, 
      item.total_ingresos
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analisis-grupos-${filtros.anio || 'todos'}-${filtros.mes || 'todos'}.csv`;
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
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-lg shadow-amber-500/20">
              <Layers className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">AnÃ¡lisis por Grupo de PrÃ¡cticas</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Desglose de ingresos por categorÃ­a de prestaciones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicador de conexiÃ³n */}
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
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
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
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg transition-colors shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${(loading || loadingStats) ? 'animate-spin' : ''}`} />
              Actualizar
            </button>

            <button
              onClick={exportarCSV}
              disabled={datosFiltrados.length === 0}
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
              {/* AÃ±o */}
              <div className="w-32">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">AÃ±o</label>
                <select
                  value={filtros.anio}
                  onChange={(e) => aplicarFiltros({ anio: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  disabled={loadingFiltros}
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.prestadores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {/* BÃºsqueda local */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={busquedaLocal}
                    onChange={(e) => setBusquedaLocal(e.target.value)}
                    placeholder="Filtrar por nombre del grupo..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Limpiar */}
              <button
                onClick={() => {
                  limpiarFiltros();
                  setBusquedaLocal('');
                }}
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
        
        {/* ==================== STATS CARDS ==================== */}
        {/* â˜…â˜…â˜… v3.0: Usando totalesPeriodo del servidor â˜…â˜…â˜… */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Grupos"
            value={statsPorGrupo.length}
            subtitle={periodoTexto}
            icon={<Layers className="h-5 w-5" />}
            variant="amber"
          />
          <StatCard
            title="Total PrÃ¡cticas"
            value={formatNumber(totalesPeriodo.practicas)}
            subtitle="Realizadas"
            icon={<Hash className="h-5 w-5" />}
            variant="violet"
          />
          <StatCard
            title="Coseguro"
            value={formatCurrency(totalesPeriodo.coseguro)}
            subtitle="Copago pacientes"
            icon={<Users className="h-5 w-5" />}
            variant="cyan"
          />
          <StatCard
            title="Cobertura"
            value={formatCurrency(totalesPeriodo.cobertura)}
            subtitle="Facturado a OS"
            icon={<DollarSign className="h-5 w-5" />}
            variant="blue"
          />
          <StatCard
            title="Total Ingresos"
            value={formatCurrency(totalesPeriodo.ingresos)}
            subtitle="Coseguro + Cobertura"
            icon={<TrendingUp className="h-5 w-5" />}
            variant="emerald"
          />
        </div>

        {/* ==================== GRÃFICO TOP 10 ==================== */}
        {top10.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-500" />
              Top 10 Grupos por Ingresos
            </h3>
            <div className="space-y-3">
              {top10.map((item, idx) => (
                <div key={item.grupo_id || item.grupo_nombre} className="flex items-center gap-3">
                  <span className="w-6 text-sm font-bold text-slate-400 text-right">#{idx + 1}</span>
                  <span className="w-64 text-sm font-medium text-slate-700 truncate" title={item.grupo_nombre}>
                    {item.grupo_nombre}
                  </span>
                  <span className="w-16 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded text-center">
                    {item.tipos_prestacion} tipos
                  </span>
                  <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full ${getBarColor(idx)} transition-all duration-700 ease-out`}
                      style={{ width: `${Math.max(parseFloat(item.porcentaje), 2)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end pr-3 text-xs font-medium text-slate-600">
                      {item.porcentaje}%
                    </span>
                  </div>
                  <span className="w-32 text-sm font-semibold text-emerald-600 text-right">
                    {formatCurrency(item.total_ingresos)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== TABLA DETALLE ==================== */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Detalle por Grupo</h3>
            <span className="text-sm text-slate-500">
              {datosFiltrados.length} grupos Â· {formatNumber(totalesPeriodo.practicas)} prÃ¡cticas
            </span>
          </div>
          
          {(loading || loadingStats) ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
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
          ) : datosFiltrados.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Layers className="h-12 w-12" />
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Grupo</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Tipos</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Cantidad</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Promedio</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Coseguro</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Cobertura</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">% Part.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {datosFiltrados.map((item, idx) => (
                      <tr key={item.grupo_id || item.grupo_nombre} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.grupo_nombre}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{item.tipos_prestacion}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium">{formatNumber(item.cantidad)}</td>
                        <td className="px-4 py-3 text-sm text-amber-600 text-right font-medium">{formatCurrency(item.promedio || 0)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{formatCurrency(item.coseguro)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 text-right">{formatCurrency(item.cobertura)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{formatCurrency(item.total_ingresos)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all"
                                style={{ width: `${Math.min(parseFloat(item.porcentaje), 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 w-14 text-right">
                              {item.porcentaje}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
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
                      <td className="px-4 py-3 text-sm text-slate-500 text-right">100%</td>
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
            {statsPorGrupo.length} grupos Â· {formatNumber(totalesPeriodo.practicas)} prÃ¡cticas Â· {formatCurrency(totalesPeriodo.ingresos)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AnalisisPorGrupoPage;
