// ============================================
// DETALLE DE ATENCIONES
// Sistema de Costos - Instituto Dr. Mercado
// Tabla completa con filtros avanzados
// ACTUALIZADO: Incluye columna de Práctica
// ============================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import {
  fetchMovimientos,
  fetchObrasSociales,
  type Movimiento,
  type ObraSocial
} from '@shared/lib/apiAnalisis';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const DetalleAtencionesPage: React.FC = () => {
  // Estados de datos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [obrasSociales, setObrasSociales] = useState<ObraSocial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selectedOS, setSelectedOS] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // ============================================
  // FUNCIONES
  // ============================================

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [movData, osData] = await Promise.all([
        fetchMovimientos({ limit: 500 }),
        fetchObrasSociales()
      ]);

      setMovimientos(movData);
      setObrasSociales(osData);
      setCurrentPage(1);
      
      console.log(`✅ ${movData.length} atenciones cargadas`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando datos';
      setError(errorMessage);
      console.error('❌ Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadFilteredData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params: { fechaDesde?: string; fechaHasta?: string; osId?: number } = {};
      
      if (fechaDesde) params.fechaDesde = fechaDesde;
      if (fechaHasta) params.fechaHasta = fechaHasta;
      if (selectedOS) params.osId = parseInt(selectedOS);

      const movData = await fetchMovimientos({ ...params, limit: 500 });
      setMovimientos(movData);
      setCurrentPage(1);
      
      console.log(`✅ ${movData.length} atenciones filtradas`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando datos';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFechaDesde('');
    setFechaHasta('');
    setSelectedOS('');
    loadData();
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtrado local por búsqueda de texto (incluye práctica)
  const filteredMovimientos = useMemo(() => {
    if (!searchTerm) return movimientos;
    
    const term = searchTerm.toLowerCase();
    return movimientos.filter(mov => 
      mov.paciente.toLowerCase().includes(term) ||
      mov.obra_social.nombre.toLowerCase().includes(term) ||
      mov.obra_social.sigla.toLowerCase().includes(term) ||
      mov.diagnostico.toLowerCase().includes(term) ||
      mov.practica?.nombre?.toLowerCase().includes(term) ||
      mov.practica?.codigo?.toLowerCase().includes(term) ||
      mov.prestador?.nombre?.toLowerCase().includes(term)
    );
  }, [movimientos, searchTerm]);

  // Paginación
  const totalPages = Math.ceil(filteredMovimientos.length / itemsPerPage);
  const paginatedData = filteredMovimientos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Formatear moneda
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(value);
  };

  // Formatear fecha
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Totales
  const totales = useMemo(() => {
    return filteredMovimientos.reduce((acc, mov) => ({
      coseguro: acc.coseguro + (mov.coseguro || 0),
      cobertura: acc.cobertura + (mov.cobertura || 0),
      total: acc.total + (mov.total || 0)
    }), { coseguro: 0, cobertura: 0, total: 0 });
  }, [filteredMovimientos]);

  // ============================================
  // RENDER - ERROR
  // ============================================

  if (error) {
    return (
      <div className="w-full h-full p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-red-800 mb-2">Error cargando datos</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <FileText className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Detalle de Atenciones</h1>
            <p className="text-gray-600">Registro completo de movimientos</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border transition-colors ${
              showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Panel de Filtros */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Fecha Desde */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Desde
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Fecha Hasta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Hasta
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Obra Social */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Obra Social
              </label>
              <select
                value={selectedOS}
                onChange={(e) => setSelectedOS(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas</option>
                {obrasSociales.map((os) => (
                  <option key={os.id} value={os.id}>
                    {os.sigla} - {os.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Botones */}
            <div className="flex items-end space-x-2">
              <button
                onClick={loadFilteredData}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Aplicar
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de búsqueda y estadísticas */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por paciente, OS, práctica, prestador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="text-sm text-gray-600">
          Mostrando <span className="font-semibold">{filteredMovimientos.length}</span> registros
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paciente
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Práctica
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Obra Social
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prestador
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Coseguro
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cobertura
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No se encontraron registros
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((mov) => (
                      <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-3 text-sm text-gray-500">
                          {mov.id}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900">
                          {formatDate(mov.fecha)}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900 font-medium max-w-[200px] truncate" title={mov.paciente}>
                          {mov.paciente || '-'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900 max-w-[250px]">
                          <div className="truncate" title={mov.practica?.nombre || 'Sin práctica'}>
                            {mov.practica?.codigo && (
                              <span className="text-xs text-gray-500 mr-1">[{mov.practica.codigo}]</span>
                            )}
                            <span className="text-gray-800">{mov.practica?.nombre || 'Sin práctica'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {mov.obra_social.sigla || mov.obra_social.nombre || 'S/D'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900 max-w-[180px]">
                          <div className="truncate" title={mov.prestador?.nombre || 'Sin prestador'}>
                            {mov.prestador?.nombre || 'Sin prestador'}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-right text-gray-900">
                          {formatCurrency(mov.coseguro)}
                        </td>
                        <td className="px-3 py-3 text-sm text-right text-gray-900">
                          {formatCurrency(mov.cobertura)}
                        </td>
                        <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">
                          {formatCurrency(mov.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {/* Totales */}
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                      TOTALES:
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-bold text-orange-600">
                      {formatCurrency(totales.coseguro)}
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-bold text-cyan-600">
                      {formatCurrency(totales.cobertura)}
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-bold text-green-600">
                      {formatCurrency(totales.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
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

export default DetalleAtencionesPage;
