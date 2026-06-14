// ============================================
// HOOK: usePools - ACTUALIZADO CON PRORRATEO
// Gestión de Pools de Insumos
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { 
  Pool, 
  NuevoPool, 
  PoolItem, 
  PoolItemConInsumo, 
  PoolConItems,
  NuevoPoolItem,
  EstadisticasPools,
  UsePoolsReturn 
} from '../types/pools';
import type { InsumoVariable } from '../types';

// ============================================
// TIPO AUXILIAR PARA RECETA_POOLS
// ============================================

interface RecetaPoolData {
  pool_id: string;
  receta: {
    cantidad_mensual_estimada: number;
    activo: boolean;
  } | null;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const usePools = (): UsePoolsReturn => {
  // Estado
  const [pools, setPools] = useState<PoolConItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Ref para debounce de guardado
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  // ============================================
  // CARGA DE DATOS - CON PRORRATEO
  // ============================================

  const loadPools = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Cargar pools
      const { data: poolsData, error: poolsError } = await supabase
        .from('pools_insumos')
        .select('*')
        .eq('activo', true)
        .order('nombre');

      if (poolsError) throw poolsError;

      // 2. Cargar items de pools con insumos
      const { data: itemsData, error: itemsError } = await supabase
        .from('pool_items')
        .select(`
          *,
          insumo:insumos_variables(*)
        `);

      if (itemsError) throw itemsError;

      // 3. Cargar relaciones receta_pools para calcular prácticas por pool
      // Esto nos dice cuántas prácticas mensuales usan cada pool
      let recetasPoolsData: RecetaPoolData[] = [];
      try {
        const { data: rpData, error: rpError } = await supabase
          .from('receta_pools')
          .select(`
            pool_id,
            receta:practicas_recetas(cantidad_mensual_estimada, activo)
          `)
          .eq('activo', true);

        if (!rpError && rpData) {
          recetasPoolsData = rpData as RecetaPoolData[];
        }
      } catch (rpErr) {
        // Si la tabla no existe o hay error, continuamos sin prorrateo
        console.warn('⚠️ No se pudo cargar receta_pools, prorrateo no disponible');
      }

      // 4. Calcular total de prácticas por pool
      const practicasPorPool = new Map<string, number>();
      
      recetasPoolsData.forEach((rp) => {
        if (rp.receta && rp.receta.activo) {
          const actual = practicasPorPool.get(rp.pool_id) || 0;
          practicasPorPool.set(rp.pool_id, actual + (rp.receta.cantidad_mensual_estimada || 0));
        }
      });

      // 5. Combinar datos con cálculo de prorrateo
      const poolsConItems: PoolConItems[] = (poolsData || []).map(pool => {
        // Filtrar items de este pool
        const items = (itemsData || [])
          .filter(item => item.pool_id === pool.id)
          .map(item => ({
            ...item,
            insumo: item.insumo,
            costo_calculado: item.insumo 
              ? item.insumo.precio_unitario * item.cantidad * item.factor_ajuste 
              : 0
          }));

        // Calcular costo total del pool
        const costoTotal = items.reduce((sum, item) => sum + (item.costo_calculado || 0), 0);

        // Obtener total de prácticas que usan este pool
        const totalPracticasMes = practicasPorPool.get(pool.id) || 0;

        // Calcular costo por práctica (prorrateo)
        const costoPorPractica = totalPracticasMes > 0 
          ? costoTotal / totalPracticasMes 
          : 0;

        return {
          ...pool,
          items,
          costo_total: costoTotal,
          cantidad_items: items.length,
          total_practicas_mes: totalPracticasMes,
          costo_por_practica: Math.round(costoPorPractica * 100) / 100
        };
      });

      setPools(poolsConItems);
      console.log('✅ Pools cargados con prorrateo:', poolsConItems.length);

      // Log de debug para verificar prorrateo
      poolsConItems.forEach(p => {
        if (p.total_practicas_mes > 0) {
          console.log(`   📊 ${p.nombre}: ${p.total_practicas_mes} prácticas/mes → $${p.costo_por_practica.toLocaleString()}/práctica`);
        }
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando pools';
      setError(errorMessage);
      console.error('❌ Error cargando pools:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar al montar
  useEffect(() => {
    loadPools();
  }, [loadPools]);

  // Limpiar timeouts al desmontar
  useEffect(() => {
    return () => {
      Object.values(saveTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  // ============================================
  // CRUD POOLS
  // ============================================

  const createPool = useCallback(async (data: NuevoPool): Promise<Pool> => {
    try {
      setLoading(true);
      setError(null);

      const { data: newPool, error } = await supabase
        .from('pools_insumos')
        .insert([{ ...data, activo: true }])
        .select()
        .single();

      if (error) throw error;

      await loadPools();
      console.log('✅ Pool creado:', newPool.nombre);
      return newPool;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error creando pool';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadPools]);

  const updatePool = useCallback(async (id: string, data: Partial<Pool>): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('pools_insumos')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await loadPools();
      console.log('✅ Pool actualizado');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error actualizando pool';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadPools]);

  const deletePool = useCallback(async (id: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Soft delete
      const { error } = await supabase
        .from('pools_insumos')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await loadPools();
      console.log('✅ Pool eliminado');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error eliminando pool';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadPools]);

  // ============================================
  // GESTIÓN DE ITEMS
  // ============================================

  const addItemToPool = useCallback(async (
    poolId: string, 
    insumoId: string, 
    cantidad: number = 1, 
    factor: number = 1
  ): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('pool_items')
        .insert([{
          pool_id: poolId,
          insumo_id: insumoId,
          cantidad,
          factor_ajuste: factor
        }]);

      if (error) throw error;

      await loadPools();
      console.log('✅ Item agregado al pool');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error agregando item';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadPools]);

  const removeItemFromPool = useCallback(async (poolId: string, insumoId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('pool_items')
        .delete()
        .eq('pool_id', poolId)
        .eq('insumo_id', insumoId);

      if (error) throw error;

      await loadPools();
      console.log('✅ Item removido del pool');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error removiendo item';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadPools]);

  /**
   * ACTUALIZAR ITEM - OPTIMIZADO
   * Actualiza el estado local inmediatamente y hace debounce del guardado en BD
   */
  const updatePoolItem = useCallback(async (
    poolId: string, 
    insumoId: string, 
    cantidad: number, 
    factor: number
  ): Promise<void> => {
    // 1. ACTUALIZAR ESTADO LOCAL INMEDIATAMENTE (sin loading)
    setPools(prevPools => {
      return prevPools.map(pool => {
        if (pool.id !== poolId) return pool;
        
        const updatedItems = pool.items.map(item => {
          if (item.insumo_id !== insumoId) return item;
          
          const nuevoCosto = item.insumo 
            ? item.insumo.precio_unitario * cantidad * factor 
            : 0;
          
          return {
            ...item,
            cantidad,
            factor_ajuste: factor,
            costo_calculado: nuevoCosto
          };
        });

        const nuevoCostoTotal = updatedItems.reduce(
          (sum, item) => sum + (item.costo_calculado || 0), 
          0
        );

        // Recalcular costo por práctica con el nuevo costo total
        const nuevoCostoPorPractica = pool.total_practicas_mes > 0
          ? nuevoCostoTotal / pool.total_practicas_mes
          : 0;

        return {
          ...pool,
          items: updatedItems,
          costo_total: nuevoCostoTotal,
          costo_por_practica: Math.round(nuevoCostoPorPractica * 100) / 100
        };
      });
    });

    // 2. DEBOUNCE DEL GUARDADO EN BD (500ms)
    const timeoutKey = `${poolId}-${insumoId}`;
    
    // Cancelar timeout anterior si existe
    if (saveTimeoutRef.current[timeoutKey]) {
      clearTimeout(saveTimeoutRef.current[timeoutKey]);
    }

    // Crear nuevo timeout
    saveTimeoutRef.current[timeoutKey] = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('pool_items')
          .update({ 
            cantidad, 
            factor_ajuste: factor,
            updated_at: new Date().toISOString()
          })
          .eq('pool_id', poolId)
          .eq('insumo_id', insumoId);

        if (error) {
          console.error('❌ Error guardando en BD:', error);
          setError('Error guardando cambios');
        } else {
          console.log('✅ Item guardado en BD');
        }
      } catch (err) {
        console.error('❌ Error guardando:', err);
      }
      
      // Limpiar referencia
      delete saveTimeoutRef.current[timeoutKey];
    }, 500);

  }, []);

  // ============================================
  // UTILIDADES
  // ============================================

  const getPoolById = useCallback((id: string): PoolConItems | undefined => {
    return pools.find(pool => pool.id === id);
  }, [pools]);

  const getPoolItems = useCallback((poolId: string): PoolItemConInsumo[] => {
    const pool = pools.find(p => p.id === poolId);
    return pool?.items || [];
  }, [pools]);

  const calcularCostoPool = useCallback((poolId: string): number => {
    const pool = pools.find(p => p.id === poolId);
    return pool?.costo_total || 0;
  }, [pools]);

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const estadisticas = useMemo((): EstadisticasPools => {
    const poolsActivos = pools.filter(p => p.activo);
    const totalItems = pools.reduce((sum, p) => sum + p.cantidad_items, 0);
    const costoTotal = pools.reduce((sum, p) => sum + p.costo_total, 0);

    // Pool con mayor costo
    const poolMayorCosto = pools.reduce((max, p) => 
      p.costo_total > (max?.costo_total || 0) ? p : max, pools[0]);

    // Pool con más items
    const poolMasItems = pools.reduce((max, p) => 
      p.cantidad_items > (max?.cantidad_items || 0) ? p : max, pools[0]);

    return {
      total_pools: pools.length,
      pools_activos: poolsActivos.length,
      total_items: totalItems,
      costo_total_pools: costoTotal,
      pool_mayor_costo: poolMayorCosto?.nombre || '-',
      pool_mas_items: poolMasItems?.nombre || '-'
    };
  }, [pools]);

  // ============================================
  // RETURN
  // ============================================

  return {
    pools,
    loading,
    error,
    
    createPool,
    updatePool,
    deletePool,
    
    addItemToPool,
    removeItemFromPool,
    updatePoolItem,
    
    getPoolById,
    getPoolItems,
    calcularCostoPool,
    
    refetch: loadPools,
    estadisticas
  };
};

export default usePools;
