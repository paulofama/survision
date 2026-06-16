// ============================================
// TESORERÍA - PAGOS A PROVEEDORES (OP / PV)
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// Egresos a proveedores (Órdenes de Pago + Pagos Varios) desde MovProv (GECLISA).
// Sección aparte de la caja: NO se mezcla con el saldo de caja.
// ============================================

import React, { useEffect, useState, useMemo } from 'react';
import {
  Banknote, Search, Filter, Download, RefreshCw, ArrowDownRight,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTesoreriaProveedores } from '../hooks/useTesoreriaProveedores';

const PagosProveedoresPage: React.FC = () => {
  const {
    movimientos, totales, loading, error, filtros,
    fetchMovimientos, aplicarFiltros, limpiarFiltros,
    formatCurrency, formatNumber, formatComprobante,
  } = useTesoreriaProveedores();

  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 50;

  useEffect(() => { fetchMovimientos(); }, []);

  useEffect(() => {
    fetchMovimientos();
    setPaginaActual(1);
  }, [filtros.fechaDesde, filtros.fechaHasta, filtros.tipo]);

  // Búsqueda local sobre lo ya traído
  const movimientosFiltrados = useMemo(() => {
    if (!filtros.busqueda) return movimientos;
    const b = filtros.busqueda.toLowerCase();
    return movimientos.filter(m =>
      m.proveedor?.toLowerCase().includes(b) ||
      m.observaciones?.toLowerCase().includes(b) ||
      String(m.numero).includes(b)
    );
  }, [movimientos, filtros.busqueda]);

  const totalPaginas = Math.ceil(movimientosFiltrados.length / itemsPorPagina);
  const movimientosPaginados = movimientosFiltrados.slice(
    (paginaActual - 1) * itemsPorPagina,
    paginaActual * itemsPorPagina
  );

  const exportarCSV = () => {
    const headers = ['Fecha', 'Comprobante', 'Proveedor', 'CUIT', 'Observaciones', 'Egreso'];
    const rows = movimientosFiltrados.map(m => [
      new Date(m.fecha).toLocaleDateString('es-AR'),
      formatComprobante(m),
      m.proveedor || '',
      m.cuit || '',
      m.observaciones || '',
      m.importe || 0,
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos_proveedores_${filtros.fechaDesde}_${filtros.fechaHasta}.csv`;
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
          <div className="p-2 bg-rose-100 rounded-lg">
            <Banknote className="h-6 w-6 text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pagos a Proveedores</h1>
            <p className="text-sm text-gray-500">Órdenes de Pago (OP) y Pagos Varios (PV) — egresos desde banco, aparte de la caja</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => fetchMovimientos()} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
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
            <input type="date" value={filtros.fechaDesde}
              onChange={(e) => aplicarFiltros({ fechaDesde: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Hasta</label>
            <input type="date" value={filtros.fechaHasta}
              onChange={(e) => aplicarFiltros({ fechaHasta: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Tipo</label>
            <select value={filtros.tipo}
              onChange={(e) => aplicarFiltros({ tipo: e.target.value as '' | 'OP' | 'PV' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500">
              <option value="">Todos (OP + PV)</option>
              <option value="OP">OP - Órdenes de Pago</option>
              <option value="PV">PV - Pagos Varios</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Proveedor, observación, nº..."
                value={filtros.busqueda}
                onChange={(e) => aplicarFiltros({ busqueda: e.target.value })}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500" />
            </div>
          </div>
          <div className="flex items-end">
            <button onClick={limpiarFiltros}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
              <X className="h-4 w-4" /> Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Totales */}
      {totales && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Comprobantes</p>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(totales.registros)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Total OP (Órdenes de Pago)</p>
            <p className="text-2xl font-bold text-rose-600">{formatCurrency(totales.total_op)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Total PV (Pagos Varios)</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totales.total_pv)}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-500">Total Egresos</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totales.total_egresos)}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-rose-600 animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Comprobante</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Observaciones</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Egreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movimientosPaginados.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">No hay pagos en el período seleccionado</td></tr>
                  ) : movimientosPaginados.map((mov, idx) => (
                    <tr key={mov.id || idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {new Date(mov.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${mov.tipo_comprobante === 'OP' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                          {mov.tipo_comprobante}
                        </span>
                        {formatComprobante(mov)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={mov.proveedor}>
                        {mov.proveedor || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-md truncate" title={mov.observaciones}>
                        {mov.observaciones || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="text-red-600 font-medium flex items-center justify-end gap-1">
                          <ArrowDownRight className="h-3 w-3" />
                          {formatCurrency(mov.importe)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Mostrando {((paginaActual - 1) * itemsPorPagina) + 1} a {Math.min(paginaActual * itemsPorPagina, movimientosFiltrados.length)} de {movimientosFiltrados.length}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="px-3 py-1 bg-gray-100 rounded-lg text-sm">{paginaActual} / {totalPaginas}</span>
                  <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
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

export default PagosProveedoresPage;
