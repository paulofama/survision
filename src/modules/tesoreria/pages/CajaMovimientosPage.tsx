// ============================================
// TESORERÍA - MOVIMIENTOS DE CAJA
// Sistema de Costos - Instituto Dr. Mercado
// v1.0.0
// ============================================
// RUTA DESTINO: src/pages/CajaMovimientosPage.tsx
// ============================================

import React, { useEffect, useState, useMemo } from 'react';
import {
  Wallet,
  Search,
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTesoreriaCaja } from '../hooks/useTesoreriaCaja';

const CajaMovimientosPage: React.FC = () => {
  const {
    movimientos,
    totales,
    tiposComprobante,
    loading,
    error,
    filtros,
    fetchMovimientos,
    fetchTiposComprobante,
    aplicarFiltros,
    limpiarFiltros,
    formatCurrency,
    formatNumber,
    formatComprobante
  } = useTesoreriaCaja();

  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 50;

  // Cargar datos al montar
  useEffect(() => {
    fetchTiposComprobante();
    fetchMovimientos();
  }, []);

  // Recargar cuando cambian filtros
  useEffect(() => {
    fetchMovimientos();
    setPaginaActual(1);
  }, [filtros.fechaDesde, filtros.fechaHasta, filtros.tipoComprobante]);

  // Calcular saldo acumulado
  const movimientosConSaldo = useMemo(() => {
    let saldoAcumulado = 0;
    return [...movimientos].reverse().map(mov => {
      saldoAcumulado += mov.ingreso - mov.egreso;
      return { ...mov, saldoAcumulado };
    }).reverse();
  }, [movimientos]);

  // Paginación
  const totalPaginas = Math.ceil(movimientosConSaldo.length / itemsPorPagina);
  const movimientosPaginados = movimientosConSaldo.slice(
    (paginaActual - 1) * itemsPorPagina,
    paginaActual * itemsPorPagina
  );

  // Filtro de búsqueda local
  const movimientosFiltrados = useMemo(() => {
    if (!filtros.busqueda) return movimientosPaginados;
    const busqueda = filtros.busqueda.toLowerCase();
    return movimientosPaginados.filter(mov => 
      mov.nombre?.toLowerCase().includes(busqueda) ||
      mov.observaciones?.toLowerCase().includes(busqueda) ||
      String(mov.numero).includes(busqueda)
    );
  }, [movimientosPaginados, filtros.busqueda]);

  // Exportar a CSV
  const exportarCSV = () => {
    const headers = ['Fecha', 'Comprobante', 'Nombre', 'Observaciones', 'Ingreso', 'Egreso', 'Saldo'];
    const rows = movimientosConSaldo.map(mov => [
      new Date(mov.fecha).toLocaleDateString('es-AR'),
      formatComprobante(mov),
      mov.nombre || '',
      mov.observaciones || '',
      mov.ingreso || 0,
      mov.egreso || 0,
      mov.saldoAcumulado
    ]);
    
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_caja_${filtros.fechaDesde}_${filtros.fechaHasta}.csv`;
    a.click();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/tesoreria" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Wallet className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Movimientos de Caja</h1>
            <p className="text-sm text-gray-500">Mayor de caja con saldo acumulado</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar
          </button>
          <button
            onClick={() => fetchMovimientos()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <span className="font-medium text-gray-700">Filtros</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={filtros.fechaDesde}
              onChange={(e) => aplicarFiltros({ fechaDesde: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={filtros.fechaHasta}
              onChange={(e) => aplicarFiltros({ fechaHasta: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tipo Comprobante</label>
            <select
              value={filtros.tipoComprobante}
              onChange={(e) => aplicarFiltros({ tipoComprobante: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Todos</option>
              {tiposComprobante.map(tipo => (
                <option key={tipo.id} value={tipo.sigla}>
                  {tipo.sigla} - {tipo.nombre} ({tipo.cantidad})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Nombre, observación..."
                value={filtros.busqueda}
                onChange={(e) => aplicarFiltros({ busqueda: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={limpiarFiltros}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="h-4 w-4" />
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Totales */}
      {totales && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Registros</p>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(totales.registros)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Total Ingresos</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totales.ingresos)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Total Egresos</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totales.egresos)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Diferencia</p>
            <p className={`text-2xl font-bold ${totales.diferencia >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totales.diferencia)}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Comprobante</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Observaciones</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Ingreso</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Egreso</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movimientosFiltrados.map((mov, idx) => (
                    <tr key={mov.id || idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(mov.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                        {formatComprobante(mov)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                        {mov.nombre || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                        {mov.observaciones || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {mov.ingreso > 0 && (
                          <span className="text-green-600 font-medium flex items-center justify-end gap-1">
                            <ArrowUpRight className="h-3 w-3" />
                            {formatCurrency(mov.ingreso)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {mov.egreso > 0 && (
                          <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                            <ArrowDownRight className="h-3 w-3" />
                            {formatCurrency(mov.egreso)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        <span className={mov.saldoAcumulado >= 0 ? 'text-gray-900' : 'text-red-600'}>
                          {formatCurrency(mov.saldoAcumulado)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Mostrando {((paginaActual - 1) * itemsPorPagina) + 1} a {Math.min(paginaActual * itemsPorPagina, movimientosConSaldo.length)} de {movimientosConSaldo.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                    disabled={paginaActual === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="px-3 py-1 bg-gray-100 rounded-lg text-sm">
                    {paginaActual} / {totalPaginas}
                  </span>
                  <button
                    onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                    disabled={paginaActual === totalPaginas}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CajaMovimientosPage;
