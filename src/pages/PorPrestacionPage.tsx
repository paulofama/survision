// ============================================
// POR PRESTACION PAGE
// Análisis Marginal - Sistema Integral de Gestión
// Instituto Dr. Mercado
// Vista detallada de rentabilidad por prestación
// ============================================
// RUTA DESTINO: src/pages/analisis-marginal/PorPrestacionPage.tsx
// ============================================
// CORRECCIÓN: Ahora incluye costo_insumos_directos de las recetas
// ============================================

import React, { useMemo, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileBarChart,
  Info,
} from 'lucide-react';
import { MarginalLayout, useMarginalContext } from '../../components/analisis-marginal/MarginalLayout';

// ============================================
// TIPOS
// ============================================

interface PrestacionAgrupada {
  nombre: string;
  codigo: string;
  segmento: 'Consultas' | 'Estudios' | 'Cirugias';
  cantidad: number;
  facturado: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;  // ✅ NUEVO: Costo de insumos directos
  costoTotal: number;
  margen: number;
  margenPct: number;
}

type SortField = 'nombre' | 'cantidad' | 'facturado' | 'honorarios' | 'costoPools' | 'costoInsumos' | 'costoTotal' | 'margen' | 'margenPct';
type SortDirection = 'asc' | 'desc';

// ============================================
// HELPERS
// ============================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('es-AR').format(num);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Detectar segmento de prestación
const detectarSegmento = (nombrePrestacion: string): 'Consultas' | 'Estudios' | 'Cirugias' => {
  const nombre = nombrePrestacion.toUpperCase();
  
  if (nombre.includes('CONSULTA') || nombre.includes('CONTROL') || 
      nombre.includes('PRIMERA VEZ') || nombre.includes('VISITA') ||
      nombre.includes('URGENCIA') || nombre.includes('GUARDIA') ||
      nombre.includes('RECETA') || nombre.includes('VER ESTUDIO')) {
    return 'Consultas';
  }
  
  if (nombre.includes('CIRUGIA') || nombre.includes('QUIRURGIC') ||
      nombre.includes('FACO') || nombre.includes('VITRECTOMIA') ||
      nombre.includes('TRABECULECTOMIA') || nombre.includes('IMPLANTE') ||
      nombre.includes('EXTRACCION') || nombre.includes('TRASPLANTE') ||
      nombre.includes('INYECCION') || nombre.includes('LASER') ||
      nombre.includes('PTERIGION') || nombre.includes('CHALAZION') ||
      nombre.includes('NEEDLING') || nombre.includes('CROSS LINKING')) {
    return 'Cirugias';
  }
  
  return 'Estudios';
};

// Extraer código de nomenclador
const extraerCodigo = (nombre: string): string => {
  const match = nombre.match(/\((\d{5,6})\)/);
  return match ? match[1].padStart(6, '0') : '';
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PorPrestacionContent: React.FC = () => {
  const { 
    prestaciones, 
    recetasConPools, 
    configHonorarios,
    prestadoresHonorarios,
    filtros,
    loading 
  } = useMarginalContext();

  // Estados locales
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('facturado');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState({
    codigo: true,
    segmento: true,
    cantidad: true,
    facturado: true,
    honorarios: true,
    costoPools: true,
    costoInsumos: true,  // ✅ NUEVO
    costoTotal: true,
    margen: true,
    margenPct: true,
  });

  // ============================================
  // PROCESAMIENTO DE DATOS - CORREGIDO
  // ============================================

  const prestacionesAgrupadas = useMemo((): PrestacionAgrupada[] => {
    if (prestaciones.length === 0) return [];

    // Crear mapas para lookup
    const recetasMap = new Map(
      recetasConPools.map(r => [r.codigo_practica, r])
    );

    const prestadoresMap = new Map(
      prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p])
    );

    // Agrupar por nombre de prestación
    const agrupado = new Map<string, {
      nombre: string;
      codigo: string;
      segmento: 'Consultas' | 'Estudios' | 'Cirugias';
      cantidad: number;
      facturado: number;
      honorarios: number;
      costoPools: number;
      costoInsumos: number;  // ✅ NUEVO
    }>();

    prestaciones.forEach(prest => {
      const nombre = prest.prestacion;
      const facturado = prest.total || 0;
      const codigo = extraerCodigo(nombre);
      const segmento = detectarSegmento(nombre);

      // ✅ CORRECCIÓN: Buscar receta y obtener AMBOS costos
      const receta = codigo ? recetasMap.get(codigo) : null;
      const costoPools = Number(receta?.costo_total_pools) || 0;
      const costoInsumos = Number(receta?.costo_insumos_directos) || 0;

      // Calcular honorarios
      let honorario = 0;
      if (prest.prestador) {
        const prestadorInfo = prestadoresMap.get(prest.prestador.toUpperCase());
        const esSocio = prestadorInfo?.es_socio || false;
        
        const configSegmento = configHonorarios.find(c => c.segmento === segmento);
        if (configSegmento) {
          const porcentaje = esSocio 
            ? configSegmento.porcentaje_socio 
            : configSegmento.porcentaje_no_socio;
          honorario = facturado * (porcentaje / 100);
        }
      }

      // Agregar o actualizar
      const existing = agrupado.get(nombre);
      if (existing) {
        existing.cantidad++;
        existing.facturado += facturado;
        existing.honorarios += honorario;
        existing.costoPools += costoPools;
        existing.costoInsumos += costoInsumos;  // ✅ NUEVO
      } else {
        agrupado.set(nombre, {
          nombre,
          codigo,
          segmento,
          cantidad: 1,
          facturado,
          honorarios: honorario,
          costoPools,
          costoInsumos,  // ✅ NUEVO
        });
      }
    });

    // ✅ CORRECCIÓN: costoTotal ahora incluye pools + insumos + honorarios
    return Array.from(agrupado.values()).map(item => {
      const costoTotal = item.honorarios + item.costoPools + item.costoInsumos;
      const margen = item.facturado - costoTotal;
      const margenPct = item.facturado > 0 ? (margen / item.facturado) * 100 : 0;

      return {
        ...item,
        costoTotal,
        margen,
        margenPct,
      };
    });
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios]);

  // ============================================
  // FILTRADO Y ORDENAMIENTO
  // ============================================

  const prestacionesFiltradas = useMemo(() => {
    let resultado = prestacionesAgrupadas;

    // Filtro por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      resultado = resultado.filter(p => 
        p.nombre.toLowerCase().includes(term) ||
        p.codigo.includes(term)
      );
    }

    // Filtro por segmento (desde contexto)
    if (filtros.segmento) {
      resultado = resultado.filter(p => p.segmento === filtros.segmento);
    }

    // Ordenamiento
    resultado = [...resultado].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'nombre':
          comparison = a.nombre.localeCompare(b.nombre);
          break;
        case 'cantidad':
          comparison = a.cantidad - b.cantidad;
          break;
        case 'facturado':
          comparison = a.facturado - b.facturado;
          break;
        case 'honorarios':
          comparison = a.honorarios - b.honorarios;
          break;
        case 'costoPools':
          comparison = a.costoPools - b.costoPools;
          break;
        case 'costoInsumos':
          comparison = a.costoInsumos - b.costoInsumos;
          break;
        case 'costoTotal':
          comparison = a.costoTotal - b.costoTotal;
          break;
        case 'margen':
          comparison = a.margen - b.margen;
          break;
        case 'margenPct':
          comparison = a.margenPct - b.margenPct;
          break;
      }
      
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return resultado;
  }, [prestacionesAgrupadas, searchTerm, filtros.segmento, sortField, sortDirection]);

  // ============================================
  // TOTALES
  // ============================================

  const totales = useMemo(() => {
    return prestacionesFiltradas.reduce((acc, p) => ({
      cantidad: acc.cantidad + p.cantidad,
      facturado: acc.facturado + p.facturado,
      honorarios: acc.honorarios + p.honorarios,
      costoPools: acc.costoPools + p.costoPools,
      costoInsumos: acc.costoInsumos + p.costoInsumos,
      costoTotal: acc.costoTotal + p.costoTotal,
      margen: acc.margen + p.margen,
    }), {
      cantidad: 0,
      facturado: 0,
      honorarios: 0,
      costoPools: 0,
      costoInsumos: 0,
      costoTotal: 0,
      margen: 0,
    });
  }, [prestacionesFiltradas]);

  const margenPctTotal = totales.facturado > 0 
    ? (totales.margen / totales.facturado) * 100 
    : 0;

  // ============================================
  // HANDLERS
  // ============================================

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const toggleRow = (nombre: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(nombre)) {
        next.delete(nombre);
      } else {
        next.add(nombre);
      }
      return next;
    });
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 text-blue-600" />
      : <ArrowDown className="h-3 w-3 text-blue-600" />;
  };

  // ============================================
  // LOADING
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Cargando prestaciones...</span>
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-4">
      {/* Banner Informativo */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Análisis de rentabilidad:</span> Este reporte incluye únicamente las 
            <span className="font-semibold"> {prestacionesAgrupadas.length} prestaciones </span> 
            que tienen recetas de costos configuradas.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Para ver el total de ingresos de GECLISA, consulte <span className="font-medium">Análisis → Evolución Temporal</span>.
          </p>
        </div>
      </div>

      {/* KPIs Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Prestaciones Únicas</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(prestacionesFiltradas.length)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Cantidad</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(totales.cantidad)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Facturado</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totales.facturado)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Honorarios</p>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totales.honorarios)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Costos Pools</p>
          <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totales.costoPools)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">C. Insumos</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totales.costoInsumos)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Margen Bruto</p>
          <p className={`text-2xl font-bold ${totales.margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totales.margen)}
          </p>
        </div>
      </div>

      {/* Porcentaje de Margen Global */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg p-4 text-white flex items-center justify-between">
        <div>
          <p className="text-blue-100 text-sm">% Margen Global</p>
          <p className="text-3xl font-bold">{formatPercent(margenPctTotal)}</p>
        </div>
        <div className="text-right text-blue-100 text-sm">
          <p>Costo Total: {formatCurrency(totales.costoTotal)}</p>
          <p className="text-xs mt-1">(Honorarios + Pools + Insumos)</p>
        </div>
      </div>

      {/* Búsqueda y controles */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {formatNumber(prestacionesFiltradas.length)} de {formatNumber(prestacionesAgrupadas.length)} prestaciones
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prestación
                </th>
                {visibleColumns.codigo && (
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                )}
                {visibleColumns.segmento && (
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Segmento
                  </th>
                )}
                {visibleColumns.cantidad && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('cantidad')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Cant. <SortIcon field="cantidad" />
                    </div>
                  </th>
                )}
                {visibleColumns.facturado && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('facturado')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Facturado <SortIcon field="facturado" />
                    </div>
                  </th>
                )}
                {visibleColumns.honorarios && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('honorarios')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Honorarios <SortIcon field="honorarios" />
                    </div>
                  </th>
                )}
                {visibleColumns.costoPools && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('costoPools')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Pools <SortIcon field="costoPools" />
                    </div>
                  </th>
                )}
                {visibleColumns.costoInsumos && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('costoInsumos')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      C. Insumos <SortIcon field="costoInsumos" />
                    </div>
                  </th>
                )}
                {visibleColumns.costoTotal && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('costoTotal')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Costo Total <SortIcon field="costoTotal" />
                    </div>
                  </th>
                )}
                {visibleColumns.margen && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('margen')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Margen <SortIcon field="margen" />
                    </div>
                  </th>
                )}
                {visibleColumns.margenPct && (
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('margenPct')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      % <SortIcon field="margenPct" />
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {prestacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                    <FileBarChart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No se encontraron prestaciones</p>
                    <p className="text-sm">Ajuste los filtros para ver resultados</p>
                  </td>
                </tr>
              ) : (
                prestacionesFiltradas.map((prest) => (
                  <tr 
                    key={prest.nombre}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleRow(prest.nombre)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {expandedRows.has(prest.nombre) 
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />
                        }
                      </button>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 max-w-md">
                      <p className="truncate" title={prest.nombre}>{prest.nombre}</p>
                    </td>
                    {visibleColumns.codigo && (
                      <td className="px-3 py-3 text-sm text-center text-gray-500">
                        {prest.codigo || '-'}
                      </td>
                    )}
                    {visibleColumns.segmento && (
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          prest.segmento === 'Consultas' ? 'bg-blue-100 text-blue-700' :
                          prest.segmento === 'Estudios' ? 'bg-purple-100 text-purple-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {prest.segmento}
                        </span>
                      </td>
                    )}
                    {visibleColumns.cantidad && (
                      <td className="px-3 py-3 text-sm text-right text-gray-900">
                        {formatNumber(prest.cantidad)}
                      </td>
                    )}
                    {visibleColumns.facturado && (
                      <td className="px-3 py-3 text-sm text-right font-medium text-blue-600">
                        {formatCurrency(prest.facturado)}
                      </td>
                    )}
                    {visibleColumns.honorarios && (
                      <td className="px-3 py-3 text-sm text-right text-purple-600">
                        {formatCurrency(prest.honorarios)}
                      </td>
                    )}
                    {visibleColumns.costoPools && (
                      <td className="px-3 py-3 text-sm text-right text-yellow-600">
                        {formatCurrency(prest.costoPools)}
                      </td>
                    )}
                    {visibleColumns.costoInsumos && (
                      <td className="px-3 py-3 text-sm text-right text-orange-600">
                        {formatCurrency(prest.costoInsumos)}
                      </td>
                    )}
                    {visibleColumns.costoTotal && (
                      <td className="px-3 py-3 text-sm text-right text-gray-900 font-medium">
                        {formatCurrency(prest.costoTotal)}
                      </td>
                    )}
                    {visibleColumns.margen && (
                      <td className={`px-3 py-3 text-sm text-right font-medium ${
                        prest.margen >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(prest.margen)}
                      </td>
                    )}
                    {visibleColumns.margenPct && (
                      <td className="px-3 py-3 text-right">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          prest.margenPct >= 50 ? 'bg-green-100 text-green-700' :
                          prest.margenPct >= 30 ? 'bg-blue-100 text-blue-700' :
                          prest.margenPct >= 0 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {formatPercent(prest.margenPct)}
                        </span>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {/* Footer con totales */}
            {prestacionesFiltradas.length > 0 && (
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-sm text-gray-900">TOTALES</td>
                  {visibleColumns.codigo && <td className="px-3 py-3"></td>}
                  {visibleColumns.segmento && <td className="px-3 py-3"></td>}
                  {visibleColumns.cantidad && (
                    <td className="px-3 py-3 text-sm text-right text-gray-900">
                      {formatNumber(totales.cantidad)}
                    </td>
                  )}
                  {visibleColumns.facturado && (
                    <td className="px-3 py-3 text-sm text-right text-blue-600">
                      {formatCurrency(totales.facturado)}
                    </td>
                  )}
                  {visibleColumns.honorarios && (
                    <td className="px-3 py-3 text-sm text-right text-purple-600">
                      {formatCurrency(totales.honorarios)}
                    </td>
                  )}
                  {visibleColumns.costoPools && (
                    <td className="px-3 py-3 text-sm text-right text-yellow-600">
                      {formatCurrency(totales.costoPools)}
                    </td>
                  )}
                  {visibleColumns.costoInsumos && (
                    <td className="px-3 py-3 text-sm text-right text-orange-600">
                      {formatCurrency(totales.costoInsumos)}
                    </td>
                  )}
                  {visibleColumns.costoTotal && (
                    <td className="px-3 py-3 text-sm text-right text-gray-900">
                      {formatCurrency(totales.costoTotal)}
                    </td>
                  )}
                  {visibleColumns.margen && (
                    <td className={`px-3 py-3 text-sm text-right ${totales.margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(totales.margen)}
                    </td>
                  )}
                  {visibleColumns.margenPct && (
                    <td className="px-3 py-3 text-right">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        margenPctTotal >= 50 ? 'bg-green-100 text-green-700' :
                        margenPctTotal >= 30 ? 'bg-blue-100 text-blue-700' :
                        margenPctTotal >= 0 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {formatPercent(margenPctTotal)}
                      </span>
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PÁGINA WRAPPER
// ============================================

const PorPrestacionPage: React.FC = () => {
  return (
    <MarginalLayout 
      title="Análisis por Prestación"
      subtitle="Rentabilidad detallada de cada procedimiento médico"
    >
      <PorPrestacionContent />
    </MarginalLayout>
  );
};

export default PorPrestacionPage;
