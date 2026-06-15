// ============================================
// INSUMOS VARIABLES PAGE - CON GESTIÃ“N DE POOLS
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { 
  PackageIcon, 
  PlusIcon, 
  SearchIcon,
  EditIcon,
  TrashIcon,
  RefreshCwIcon,
  LayersIcon,
  TargetIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ============================================
// TIPOS
// ============================================

interface Pool {
  id: string;
  nombre: string;
}

interface InsumoConPool {
  id: string;
  codigo: string;
  descripcion: string;
  segmento: string;
  precio_unitario: number;
  unidad: string;
  consumo: string;
  cantidad: number;
  activo: boolean;
  // Pool asignado (puede ser null si es DIRECTO)
  pool_id: string | null;
  pool_nombre: string | null;
}

// ============================================
// COLORES POR POOL
// ============================================

const POOL_COLORS: Record<string, string> = {
  'Insumos Generales en Consultorio': 'bg-blue-100 text-blue-800 border-blue-300',
  'Insumos Generales en QuirÃ³fano': 'bg-green-100 text-green-800 border-green-300',
  'Kit Parabulbar': 'bg-purple-100 text-purple-800 border-purple-300',
  'Kit Para RFG': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'Kit SedaciÃ³n': 'bg-amber-100 text-amber-800 border-amber-300',
  'Re Esterilizable + Lavado': 'bg-rose-100 text-rose-800 border-rose-300',
  'Re Esterilizable Catarata': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Re Esterilizable Retina': 'bg-orange-100 text-orange-800 border-orange-300',
  'DIRECTO': 'bg-gray-100 text-gray-800 border-gray-300',
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const InsumosVariablesPage: React.FC = () => {
  // Estados
  const [insumos, setInsumos] = useState<InsumoConPool[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPool, setFilterPool] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ============================================
  // CARGAR DATOS
  // ============================================

  const loadPools = useCallback(async () => {
    const { data, error } = await supabase
      .from('pools_insumos')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error cargando pools:', error);
      return;
    }
    setPools(data || []);
  }, []);

  const loadInsumos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Cargar insumos con su pool asignado (LEFT JOIN)
      const { data: insumosData, error: insumosError } = await supabase
        .from('insumos_variables')
        .select('*')
        .eq('activo', true)
        .order('descripcion');

      if (insumosError) throw insumosError;

      // Cargar asignaciones de pools
      const { data: poolItemsData, error: poolItemsError } = await supabase
        .from('pool_items')
        .select(`
          insumo_id,
          pool_id,
          pools_insumos (
            id,
            nombre
          )
        `);

      if (poolItemsError) throw poolItemsError;

      // Crear mapa de insumo_id -> pool
      const poolMap = new Map<string, { pool_id: string; pool_nombre: string }>();
      poolItemsData?.forEach((item: any) => {
        if (item.pools_insumos) {
          poolMap.set(item.insumo_id, {
            pool_id: item.pool_id,
            pool_nombre: item.pools_insumos.nombre
          });
        }
      });

      // Combinar datos
      const insumosConPool: InsumoConPool[] = (insumosData || []).map(insumo => {
        const poolInfo = poolMap.get(insumo.id);
        return {
          ...insumo,
          pool_id: poolInfo?.pool_id || null,
          pool_nombre: poolInfo?.pool_nombre || null
        };
      });

      setInsumos(insumosConPool);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPools();
    loadInsumos();
  }, [loadPools, loadInsumos]);

  // ============================================
  // CAMBIAR POOL DE UN INSUMO
  // ============================================

  const handlePoolChange = async (insumoId: string, newPoolId: string | null) => {
    setUpdatingId(insumoId);
    
    try {
      // Primero eliminar asignaciÃ³n actual si existe
      const { error: deleteError } = await supabase
        .from('pool_items')
        .delete()
        .eq('insumo_id', insumoId);

      if (deleteError) throw deleteError;

      // Si se seleccionÃ³ un pool (no "DIRECTO"), crear nueva asignaciÃ³n
      if (newPoolId && newPoolId !== 'DIRECTO') {
        const { error: insertError } = await supabase
          .from('pool_items')
          .insert({
            pool_id: newPoolId,
            insumo_id: insumoId,
            cantidad: 1,
            factor_ajuste: 1.0
          });

        if (insertError) throw insertError;
      }

      // Actualizar estado local
      const poolInfo = pools.find(p => p.id === newPoolId);
      setInsumos(prev => prev.map(insumo => {
        if (insumo.id === insumoId) {
          return {
            ...insumo,
            pool_id: newPoolId === 'DIRECTO' ? null : newPoolId,
            pool_nombre: newPoolId === 'DIRECTO' ? null : (poolInfo?.nombre || null)
          };
        }
        return insumo;
      }));

      setSuccessMessage('Pool actualizado correctamente');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error actualizando pool');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setUpdatingId(null);
    }
  };

  // ============================================
  // FILTRADO
  // ============================================

  const filteredInsumos = insumos.filter(insumo => {
    const matchesSearch = 
      insumo.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insumo.descripcion.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPool = 
      filterPool === '' || 
      (filterPool === 'DIRECTO' && !insumo.pool_id) ||
      insumo.pool_id === filterPool;

    return matchesSearch && matchesPool;
  });

  // ============================================
  // ESTADÃSTICAS
  // ============================================

  const stats = {
    total: insumos.length,
    enPools: insumos.filter(i => i.pool_id).length,
    directos: insumos.filter(i => !i.pool_id).length,
    costoTotal: insumos.reduce((sum, i) => sum + (i.precio_unitario * i.cantidad), 0)
  };

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

  const getPoolColor = (poolNombre: string | null): string => {
    if (!poolNombre) return POOL_COLORS['DIRECTO'];
    return POOL_COLORS[poolNombre] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  // ============================================
  // RENDER
  // ============================================

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadInsumos}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Mensajes */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg shadow-lg z-50">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50">
          {errorMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <PackageIcon className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Insumos Variables</h1>
            <p className="text-gray-600">GestiÃ³n de insumos y asignaciÃ³n a pools</p>
          </div>
        </div>
        <button
          onClick={loadInsumos}
          className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCwIcon className="h-4 w-4" />
          <span>Actualizar</span>
        </button>
      </div>

      {/* EstadÃ­sticas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <PackageIcon className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm text-gray-500">Total Insumos</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <LayersIcon className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-gray-500">En Pools</p>
              <p className="text-2xl font-bold text-green-600">{stats.enPools}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <TargetIcon className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-sm text-gray-500">Directos</p>
              <p className="text-2xl font-bold text-amber-600">{stats.directos}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">ðŸ’°</span>
            <div>
              <p className="text-sm text-gray-500">Costo Total</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.costoTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 mb-4">
        <div className="flex items-center space-x-4">
          {/* BÃºsqueda */}
          <div className="flex-1">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por cÃ³digo o descripciÃ³n..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Filtro por Pool */}
          <div className="w-72">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              value={filterPool}
              onChange={(e) => setFilterPool(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="DIRECTO">ðŸŽ¯ Solo DIRECTOS</option>
              {pools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Contador */}
          <div className="text-sm text-gray-500">
            Mostrando {filteredInsumos.length} de {insumos.length}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Cargando insumos...</p>
          </div>
        ) : filteredInsumos.length === 0 ? (
          <div className="p-8 text-center">
            <PackageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay insumos</h3>
            <p className="text-gray-600">
              {searchTerm || filterPool 
                ? 'No se encontraron insumos con los filtros aplicados.'
                : 'No hay insumos registrados.'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    CÃ³digo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    DescripciÃ³n
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-64">
                    Pool Asignado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                    Precio Unit.
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    Cant.
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                    Costo Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInsumos.map((insumo) => (
                  <tr key={insumo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                      {insumo.codigo}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="truncate max-w-md" title={insumo.descripcion}>
                        {insumo.descripcion}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={insumo.pool_id || 'DIRECTO'}
                        onChange={(e) => handlePoolChange(insumo.id, e.target.value === 'DIRECTO' ? null : e.target.value)}
                        disabled={updatingId === insumo.id}
                        className={`
                          w-full px-3 py-1.5 text-sm rounded-lg border
                          ${getPoolColor(insumo.pool_nombre)}
                          ${updatingId === insumo.id ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                          focus:ring-2 focus:ring-green-500 focus:border-green-500
                        `}
                      >
                        <option value="DIRECTO">ðŸŽ¯ DIRECTO</option>
                        {pools.map((pool) => (
                          <option key={pool.id} value={pool.id}>
                            {pool.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(insumo.precio_unitario)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-900">
                      {insumo.cantidad}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(insumo.precio_unitario * insumo.cantidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Leyenda */}
      <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Leyenda:</h4>
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-800 border border-gray-300">
            ðŸŽ¯ DIRECTO = Se asigna a prestaciones especÃ­ficas
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-800 border border-green-300">
            En Pool = Se prorratea entre prestaciones del pool
          </span>
        </div>
      </div>
    </div>
  );
};

export default InsumosVariablesPage;
