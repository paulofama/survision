// ============================================
// HOOK: useRecetasCostos
// Gestión de Recetas de Costos por Práctica
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type {
  CategoriaPractica,
  PracticaReceta,
  PracticaRecetaConCostos,
  NuevaPracticaReceta,
  RecetaCompleta,
  RecetaPoolConDetalle,
  RecetaInsumoDirectoConDetalle,
  NuevaRecetaPool,
  NuevaRecetaInsumoDirecto,
  SubcategoriaPractica,
  CostoRecetaCalculado,
  EstadisticasRecetas,
  UseRecetasCostosReturn
} from '../types/recetas';
import { calcularCostoInsumoDirecto } from '../types/recetas';

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useRecetasCostos = (): UseRecetasCostosReturn => {
  // ============================================
  // ESTADOS
  // ============================================
  
  const [recetas, setRecetas] = useState<PracticaRecetaConCostos[]>([]);
  const [recetaSeleccionada, setRecetaSeleccionada] = useState<RecetaCompleta | null>(null);
  const [subcategorias, setSubcategorias] = useState<SubcategoriaPractica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaPractica | ''>('');
  const [filtroSubcategoria, setFiltroSubcategoria] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // ============================================
  // CARGA DE DATOS
  // ============================================

  /**
   * Cargar todas las recetas con costos
   */
  const cargarRecetas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Intentar cargar desde la vista con costos pre-calculados (prorrateo correcto)
      let recetasConCostos: PracticaRecetaConCostos[] = [];
      
      try {
        const { data: vistaData, error: vistaError } = await supabase
          .from('v_recetas_costos_completos')
          .select('*')
          .order('codigo_practica');

        if (!vistaError && vistaData) {
          // La vista existe y tiene datos - usar prorrateo correcto
          recetasConCostos = vistaData.map(r => ({
            id: r.receta_id,
            codigo_practica: r.codigo_practica,
            nombre_practica: r.nombre_practica,
            categoria: r.categoria,
            subcategoria: r.subcategoria,
            cantidad_mensual_estimada: r.cantidad_mensual_estimada,
            observaciones: r.observaciones,
            activo: r.activo,
            created_at: r.created_at,
            updated_at: r.updated_at,
            costo_pools: Number(r.costo_pools_unitario) || 0,
            costo_insumos_directos: Number(r.costo_insumos_unitario) || 0,
            costo_total: Number(r.costo_total_unitario) || 0,
            cantidad_pools: r.cantidad_pools || 0,
            cantidad_insumos_directos: r.cantidad_insumos || 0
          }));
          
          console.log(`✅ ${recetasConCostos.length} recetas cargadas con prorrateo correcto`);
        } else {
          throw new Error('Vista no disponible');
        }
      } catch (vistaErr) {
        // Fallback: cargar de forma tradicional si la vista no existe
        console.warn('⚠️ Vista v_recetas_costos_completos no disponible, usando método alternativo');
        
        const { data: recetasData, error: recetasError } = await supabase
          .from('practicas_recetas')
          .select('*')
          .eq('activo', true)
          .order('codigo_practica');

        if (recetasError) throw recetasError;

        // Para cada receta, calcular costos (método legacy)
        recetasConCostos = await Promise.all(
          (recetasData || []).map(async (receta) => {
            // Contar pools
            const { count: cantPools } = await supabase
              .from('receta_pools')
              .select('*', { count: 'exact', head: true })
              .eq('receta_id', receta.id)
              .eq('activo', true);

            // Contar insumos directos
            const { count: cantInsumos } = await supabase
              .from('receta_insumos_directos')
              .select('*', { count: 'exact', head: true })
              .eq('receta_id', receta.id)
              .eq('activo', true);

            // Calcular costos usando la función RPC
            let costosPools = 0;
            let costosInsumos = 0;

            try {
              const { data: costosData } = await supabase
                .rpc('rpc_obtener_costo_receta', { p_receta_id: receta.id });

              if (costosData && costosData.length > 0) {
                costosPools = Number(costosData[0].costo_pools) || 0;
                costosInsumos = Number(costosData[0].costo_insumos) || 0;
              }
            } catch (e) {
              console.warn('Función RPC no disponible');
            }

            return {
              ...receta,
              costo_pools: costosPools,
              costo_insumos_directos: costosInsumos,
              costo_total: costosPools + costosInsumos,
              cantidad_pools: cantPools || 0,
              cantidad_insumos_directos: cantInsumos || 0
            };
          })
        );
        
        console.log(`✅ ${recetasConCostos.length} recetas cargadas (método legacy)`);
      }

      setRecetas(recetasConCostos);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error cargando recetas';
      setError(errorMsg);
      console.error('❌ Error cargando recetas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cargar subcategorías
   */
  const cargarSubcategorias = useCallback(async () => {
    try {
      const { data, error: subError } = await supabase
        .from('subcategorias_practicas')
        .select('*')
        .eq('activo', true)
        .order('orden');

      if (subError) throw subError;
      setSubcategorias(data || []);

    } catch (err) {
      console.error('Error cargando subcategorías:', err);
    }
  }, []);

  /**
   * Cargar una receta completa con todos sus detalles
   * NOTA: Usa prorrateo correcto - divide el pool entre TODAS las prácticas que lo usan
   */
  const cargarRecetaCompleta = useCallback(async (id: string): Promise<RecetaCompleta> => {
    try {
      setLoading(true);

      // 1. Cargar receta base
      const { data: recetaData, error: recetaError } = await supabase
        .from('practicas_recetas')
        .select('*')
        .eq('id', id)
        .single();

      if (recetaError) throw recetaError;

      // 2. Cargar pools con detalles
      const { data: poolsData, error: poolsError } = await supabase
        .from('receta_pools')
        .select(`
          *,
          pool:pools_insumos(
            id,
            nombre,
            descripcion
          )
        `)
        .eq('receta_id', id)
        .eq('activo', true);

      if (poolsError) throw poolsError;

      // Calcular costos de cada pool CON PRORRATEO CORRECTO
      const poolsConDetalle: RecetaPoolConDetalle[] = await Promise.all(
        (poolsData || []).map(async (rp) => {
          // Obtener costo total del pool (suma de todos sus items)
          // NOTA: pool_items no tiene columna 'activo', solo filtramos por pool_id
          const { data: itemsPool } = await supabase
            .from('pool_items')
            .select(`
              cantidad,
              factor_ajuste,
              insumo:insumos_variables(precio_unitario, activo)
            `)
            .eq('pool_id', rp.pool_id);

          // Solo contar insumos que estén activos
          const costoTotalPool = (itemsPool || []).reduce((sum, item) => {
            // Filtrar solo insumos activos (la relación es to-one; Supabase la tipa como array)
            const insumo = item.insumo as unknown as { precio_unitario: number; activo: boolean } | null;
            if (!insumo?.activo) return sum;
            const precio = insumo?.precio_unitario || 0;
            return sum + (precio * item.cantidad * item.factor_ajuste);
          }, 0);

          // PRORRATEO CORRECTO: Obtener total de prácticas que usan ESTE pool
          let totalPracticasPool = recetaData.cantidad_mensual_estimada; // fallback
          
          try {
            // Intentar usar la función SQL de prorrateo
            const { data: totalData } = await supabase
              .rpc('fn_total_practicas_pool', { p_pool_id: rp.pool_id });
            
            if (totalData && totalData > 0) {
              totalPracticasPool = totalData;
            }
          } catch (rpcErr) {
            // Fallback: calcular manualmente sumando todas las recetas que usan este pool
            const { data: recetasPool } = await supabase
              .from('receta_pools')
              .select(`
                receta:practicas_recetas(cantidad_mensual_estimada, activo)
              `)
              .eq('pool_id', rp.pool_id)
              .eq('activo', true);

            if (recetasPool && recetasPool.length > 0) {
              totalPracticasPool = recetasPool.reduce((sum, rp) => {
                const receta = rp.receta as any;
                if (receta && receta.activo) {
                  return sum + (receta.cantidad_mensual_estimada || 0);
                }
                return sum;
              }, 0);
            }
          }

          // Calcular costo unitario con prorrateo correcto
          const costoUnitarioPool = totalPracticasPool > 0 
            ? costoTotalPool / totalPracticasPool 
            : 0;
          
          // Aplicar porcentaje de asignación
          const costoPorPractica = costoUnitarioPool * (rp.porcentaje_asignacion / 100);

          return {
            ...rp,
            pool_nombre: rp.pool?.nombre || 'Sin nombre',
            pool_descripcion: rp.pool?.descripcion,
            costo_total_pool: Math.round(costoTotalPool * 100) / 100,
            cantidad_items_pool: itemsPool?.length || 0,
            costo_por_practica: Math.round(costoPorPractica * 100) / 100,
            // Datos adicionales para mostrar el prorrateo
            total_practicas_pool: totalPracticasPool,
            costo_unitario_pool: Math.round(costoUnitarioPool * 100) / 100
          };
        })
      );

      // 3. Cargar insumos directos con detalles
      const { data: insumosData, error: insumosError } = await supabase
        .from('receta_insumos_directos')
        .select(`
          *,
          insumo:insumos_variables(
            id,
            codigo,
            descripcion,
            segmento,
            precio_unitario,
            unidad
          )
        `)
        .eq('receta_id', id)
        .eq('activo', true);

      if (insumosError) throw insumosError;

      const insumosConDetalle: RecetaInsumoDirectoConDetalle[] = (insumosData || []).map(rid => ({
        ...rid,
        insumo_codigo: rid.insumo?.codigo || '',
        insumo_descripcion: rid.insumo?.descripcion || '',
        insumo_segmento: rid.insumo?.segmento || '',
        insumo_precio_unitario: rid.insumo?.precio_unitario || 0,
        insumo_unidad: rid.insumo?.unidad || 'Unidad',
        costo_por_practica: calcularCostoInsumoDirecto(
          rid.insumo?.precio_unitario || 0,
          rid.cantidad_por_practica
        )
      }));

      // 4. Calcular totales
      const totalPools = poolsConDetalle.reduce((sum, p) => sum + p.costo_por_practica, 0);
      const totalInsumos = insumosConDetalle.reduce((sum, i) => sum + i.costo_por_practica, 0);

      const recetaCompleta: RecetaCompleta = {
        ...recetaData,
        pools: poolsConDetalle,
        insumos_directos: insumosConDetalle,
        totales: {
          costo_pools: Math.round(totalPools * 100) / 100,
          costo_insumos_directos: Math.round(totalInsumos * 100) / 100,
          costo_total_por_practica: Math.round((totalPools + totalInsumos) * 100) / 100
        }
      };

      setRecetaSeleccionada(recetaCompleta);
      return recetaCompleta;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error cargando receta';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // CRUD RECETAS
  // ============================================

  /**
   * Crear nueva receta
   */
  const crearReceta = useCallback(async (data: NuevaPracticaReceta): Promise<PracticaReceta> => {
    try {
      setLoading(true);
      setError(null);

      const { data: nuevaReceta, error: createError } = await supabase
        .from('practicas_recetas')
        .insert([{
          ...data,
          activo: true
        }])
        .select()
        .single();

      if (createError) throw createError;

      await cargarRecetas();
      console.log('✅ Receta creada:', nuevaReceta.nombre_practica);
      return nuevaReceta;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error creando receta';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas]);

  /**
   * Actualizar receta existente
   */
  const actualizarReceta = useCallback(async (
    id: string, 
    data: Partial<NuevaPracticaReceta>
  ): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('practicas_recetas')
        .update(data)
        .eq('id', id);

      if (updateError) throw updateError;

      await cargarRecetas();
      console.log('✅ Receta actualizada');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error actualizando receta';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas]);

  /**
   * Eliminar receta (soft delete)
   */
  const eliminarReceta = useCallback(async (id: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const { error: deleteError } = await supabase
        .from('practicas_recetas')
        .update({ activo: false })
        .eq('id', id);

      if (deleteError) throw deleteError;

      await cargarRecetas();
      console.log('✅ Receta eliminada');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error eliminando receta';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas]);

  // ============================================
  // GESTIÓN DE POOLS
  // ============================================

  /**
   * Agregar pool a receta
   */
  const agregarPoolAReceta = useCallback(async (data: NuevaRecetaPool): Promise<void> => {
    try {
      setLoading(true);

      const { error: insertError } = await supabase
        .from('receta_pools')
        .insert([{
          ...data,
          porcentaje_asignacion: data.porcentaje_asignacion || 100,
          activo: true
        }]);

      if (insertError) throw insertError;

      // Recargar la receta completa si hay una seleccionada
      if (recetaSeleccionada && recetaSeleccionada.id === data.receta_id) {
        await cargarRecetaCompleta(data.receta_id);
      }
      await cargarRecetas();

      console.log('✅ Pool agregado a receta');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error agregando pool';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas, cargarRecetaCompleta, recetaSeleccionada]);

  /**
   * Actualizar porcentaje de pool en receta
   */
  const actualizarPoolDeReceta = useCallback(async (
    id: string, 
    porcentaje: number
  ): Promise<void> => {
    try {
      const { error: updateError } = await supabase
        .from('receta_pools')
        .update({ porcentaje_asignacion: porcentaje })
        .eq('id', id);

      if (updateError) throw updateError;

      if (recetaSeleccionada) {
        await cargarRecetaCompleta(recetaSeleccionada.id);
      }
      await cargarRecetas();

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error actualizando pool';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [cargarRecetas, cargarRecetaCompleta, recetaSeleccionada]);

  /**
   * Eliminar pool de receta
   */
  const eliminarPoolDeReceta = useCallback(async (id: string): Promise<void> => {
    try {
      setLoading(true);

      const { error: deleteError } = await supabase
        .from('receta_pools')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      if (recetaSeleccionada) {
        await cargarRecetaCompleta(recetaSeleccionada.id);
      }
      await cargarRecetas();

      console.log('✅ Pool eliminado de receta');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error eliminando pool';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas, cargarRecetaCompleta, recetaSeleccionada]);

  // ============================================
  // GESTIÓN DE INSUMOS DIRECTOS
  // ============================================

  /**
   * Agregar insumo directo a receta
   */
  const agregarInsumoAReceta = useCallback(async (data: NuevaRecetaInsumoDirecto): Promise<void> => {
    try {
      setLoading(true);

      const { error: insertError } = await supabase
        .from('receta_insumos_directos')
        .insert([{
          ...data,
          activo: true
        }]);

      if (insertError) throw insertError;

      if (recetaSeleccionada && recetaSeleccionada.id === data.receta_id) {
        await cargarRecetaCompleta(data.receta_id);
      }
      await cargarRecetas();

      console.log('✅ Insumo agregado a receta');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error agregando insumo';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas, cargarRecetaCompleta, recetaSeleccionada]);

  /**
   * Actualizar cantidad de insumo en receta
   */
  const actualizarInsumoDeReceta = useCallback(async (
    id: string, 
    cantidad: number
  ): Promise<void> => {
    try {
      const { error: updateError } = await supabase
        .from('receta_insumos_directos')
        .update({ cantidad_por_practica: cantidad })
        .eq('id', id);

      if (updateError) throw updateError;

      if (recetaSeleccionada) {
        await cargarRecetaCompleta(recetaSeleccionada.id);
      }
      await cargarRecetas();

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error actualizando insumo';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [cargarRecetas, cargarRecetaCompleta, recetaSeleccionada]);

  /**
   * Eliminar insumo de receta
   */
  const eliminarInsumoDeReceta = useCallback(async (id: string): Promise<void> => {
    try {
      setLoading(true);

      const { error: deleteError } = await supabase
        .from('receta_insumos_directos')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      if (recetaSeleccionada) {
        await cargarRecetaCompleta(recetaSeleccionada.id);
      }
      await cargarRecetas();

      console.log('✅ Insumo eliminado de receta');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error eliminando insumo';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [cargarRecetas, cargarRecetaCompleta, recetaSeleccionada]);

  // ============================================
  // FUNCIONES DE CÁLCULO
  // ============================================

  /**
   * Obtener costo de una práctica por código
   */
  const obtenerCostoPorCodigo = useCallback((codigo: string): CostoRecetaCalculado | null => {
    const receta = recetas.find(r => r.codigo_practica === codigo);
    
    if (!receta) return null;

    return {
      codigo_practica: receta.codigo_practica,
      nombre_practica: receta.nombre_practica,
      categoria: receta.categoria,
      subcategoria: receta.subcategoria,
      cantidad_mensual_estimada: receta.cantidad_mensual_estimada,
      costo_pools_unitario: receta.costo_pools,
      costo_insumos_unitario: receta.costo_insumos_directos,
      costo_total_unitario: receta.costo_total,
      detalle_pools: [], // Se cargaría con cargarRecetaCompleta si se necesita
      detalle_insumos: []
    };
  }, [recetas]);

  /**
   * Obtener costos para múltiples códigos
   */
  const obtenerCostosPorCodigos = useCallback((codigos: string[]): Map<string, CostoRecetaCalculado> => {
    const resultado = new Map<string, CostoRecetaCalculado>();
    
    codigos.forEach(codigo => {
      const costo = obtenerCostoPorCodigo(codigo);
      if (costo) {
        resultado.set(codigo, costo);
      }
    });

    return resultado;
  }, [obtenerCostoPorCodigo]);

  // ============================================
  // DATOS FILTRADOS
  // ============================================

  const recetasFiltradas = useMemo(() => {
    return recetas.filter(receta => {
      // Filtro por categoría
      if (filtroCategoria && receta.categoria !== filtroCategoria) {
        return false;
      }

      // Filtro por subcategoría
      if (filtroSubcategoria && receta.subcategoria !== filtroSubcategoria) {
        return false;
      }

      // Filtro por búsqueda
      if (searchTerm) {
        const termLower = searchTerm.toLowerCase();
        return (
          receta.codigo_practica.toLowerCase().includes(termLower) ||
          receta.nombre_practica.toLowerCase().includes(termLower)
        );
      }

      return true;
    });
  }, [recetas, filtroCategoria, filtroSubcategoria, searchTerm]);

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const estadisticas = useMemo((): EstadisticasRecetas => {
    const recetasPorCategoria: Record<CategoriaPractica, number> = {
      'Cirugias': 0,
      'Estudios': 0,
      'Consultas': 0
    };

    let totalCostoCirugias = 0;
    let countCirugias = 0;
    let totalCostoEstudios = 0;
    let countEstudios = 0;
    let totalCostoConsultas = 0;
    let countConsultas = 0;

    recetas.forEach(r => {
      recetasPorCategoria[r.categoria]++;

      if (r.categoria === 'Cirugias') {
        totalCostoCirugias += r.costo_total;
        countCirugias++;
      } else if (r.categoria === 'Estudios') {
        totalCostoEstudios += r.costo_total;
        countEstudios++;
      } else {
        totalCostoConsultas += r.costo_total;
        countConsultas++;
      }
    });

    return {
      total_recetas: recetas.length,
      recetas_por_categoria: recetasPorCategoria,
      recetas_con_pools: recetas.filter(r => r.cantidad_pools > 0).length,
      recetas_con_insumos: recetas.filter(r => r.cantidad_insumos_directos > 0).length,
      costo_promedio_cirugia: countCirugias > 0 ? totalCostoCirugias / countCirugias : 0,
      costo_promedio_estudio: countEstudios > 0 ? totalCostoEstudios / countEstudios : 0,
      costo_promedio_consulta: countConsultas > 0 ? totalCostoConsultas / countConsultas : 0,
      practicas_sin_receta: 0 // Se calcularía comparando con GECLISA
    };
  }, [recetas]);

  // ============================================
  // EFECTOS
  // ============================================

  useEffect(() => {
    cargarRecetas();
    cargarSubcategorias();
  }, [cargarRecetas, cargarSubcategorias]);

  // Suscripción a cambios en tiempo real
  useEffect(() => {
    const channel = supabase
      .channel('recetas-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'practicas_recetas' },
        () => cargarRecetas()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'receta_pools' },
        () => cargarRecetas()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'receta_insumos_directos' },
        () => cargarRecetas()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cargarRecetas]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    recetas: recetasFiltradas,
    recetaSeleccionada,
    subcategorias,
    loading,
    error,

    // Filtros
    filtroCategoria,
    filtroSubcategoria,
    searchTerm,
    setFiltroCategoria,
    setFiltroSubcategoria,
    setSearchTerm,

    // CRUD Recetas
    crearReceta,
    actualizarReceta,
    eliminarReceta,
    cargarRecetaCompleta,

    // Pools
    agregarPoolAReceta,
    actualizarPoolDeReceta,
    eliminarPoolDeReceta,

    // Insumos directos
    agregarInsumoAReceta,
    actualizarInsumoDeReceta,
    eliminarInsumoDeReceta,

    // Cálculos
    obtenerCostoPorCodigo,
    obtenerCostosPorCodigos,

    // Utilidades
    refetch: cargarRecetas,
    estadisticas
  };
};

export default useRecetasCostos;
