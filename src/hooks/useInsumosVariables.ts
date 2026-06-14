// ============================================
// HOOK: useInsumosVariables - CON DATOS DE EJEMPLO
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import type { InsumoVariable, InsumoSegmento, NuevoInsumoVariable, ResultadoImportacionExcel } from '../types';

// ============================================
// DATOS DE EJEMPLO PARA INSUMOS VARIABLES
// ============================================

const datosEjemplo: NuevoInsumoVariable[] = [
  // IG En Consultorio
  { codigo: 'IGC001', descripcion: 'ANESTESICO TOPICO BENOXINATO 0.4%', segmento: 'IG En Consultorio', precio_unitario: 150.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 2.0 },
  { codigo: 'IGC002', descripcion: 'MIDRIÁTICO TROPICAMIDA 1%', segmento: 'IG En Consultorio', precio_unitario: 280.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 1.0 },
  { codigo: 'IGC003', descripcion: 'FLUORESCEÍNA SÓDICA 2%', segmento: 'IG En Consultorio', precio_unitario: 120.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 0.5 },
  
  // IG En Quirófano
  { codigo: 'IGQ001', descripcion: 'LIDOCAÍNA 2% CON EPINEFRINA', segmento: 'IG En Quirófano', precio_unitario: 350.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 5.0 },
  { codigo: 'IGQ002', descripcion: 'MARCAÍNA 0.75%', segmento: 'IG En Quirófano', precio_unitario: 450.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 3.0 },
  
  // Implantes
  { codigo: 'IMP001', descripcion: 'LENTE INTRAOCULAR MONOFOCAL', segmento: 'Implante', precio_unitario: 8500.00, unidad: 'Unidad', consumo: 'Por Practica', cantidad: 1.0 },
  { codigo: 'IMP002', descripcion: 'LENTE INTRAOCULAR TÓRICO', segmento: 'Implante', precio_unitario: 12000.00, unidad: 'Unidad', consumo: 'Por Practica', cantidad: 1.0 },
  
  // Re Esterilizables
  { codigo: 'REST001', descripcion: 'PINZAS DE MICROCIRUGÍA', segmento: 'Re Esterilizables', precio_unitario: 2500.00, unidad: 'Unidad', consumo: 'Re Esterilizable', cantidad: 1.0 },
  { codigo: 'REST002', descripcion: 'TIJERAS DE CAPSULOTOMÍA', segmento: 'Re Esterilizables', precio_unitario: 3200.00, unidad: 'Unidad', consumo: 'Re Esterilizable', cantidad: 1.0 },
  
  // Medicamentos
  { codigo: 'MED001', descripcion: 'ANTIBIÓTICO MOXIFLOXACINO', segmento: 'Medicamentos', precio_unitario: 480.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 1.0 },
  { codigo: 'MED002', descripcion: 'ANTIINFLAMATORIO DEXAMETASONA', segmento: 'Medicamentos', precio_unitario: 320.00, unidad: 'ML', consumo: 'Por Practica', cantidad: 1.0 },
  
  // Descartables
  { codigo: 'DESC001', descripcion: 'GUANTES QUIRÚRGICOS ESTÉRILES', segmento: 'Descartables', precio_unitario: 45.00, unidad: 'Par', consumo: 'Por Practica', cantidad: 2.0 },
  { codigo: 'DESC002', descripcion: 'CAMPOS QUIRÚRGICOS OFTÁLMICOS', segmento: 'Descartables', precio_unitario: 180.00, unidad: 'Unidad', consumo: 'Por Practica', cantidad: 1.0 },
  
  // Kit De Faco
  { codigo: 'FACO001', descripcion: 'PUNTA DE FACOEMULSIFICACIÓN', segmento: 'Kit De Faco', precio_unitario: 2800.00, unidad: 'Unidad', consumo: 'Por Practica', cantidad: 1.0 },
  { codigo: 'FACO002', descripcion: 'CUCHILLA DE QUERATOMO', segmento: 'Kit De Faco', precio_unitario: 450.00, unidad: 'Unidad', consumo: 'Por Practica', cantidad: 1.0 },
];

// ============================================
// INTERFACES
// ============================================

interface UseInsumosVariablesReturn {
  // Estado principal
  insumos: InsumoVariable[];
  filteredInsumos: InsumoVariable[];
  loading: boolean;
  error: string | null;
  
  // Filtros
  searchTerm: string;
  selectedSegmento: InsumoSegmento | '';
  setSearchTerm: (term: string) => void;
  setSelectedSegmento: (segmento: InsumoSegmento | '') => void;
  
  // Operaciones CRUD
  createInsumo: (data: NuevoInsumoVariable) => Promise<void>;
  updateInsumo: (id: string, data: Partial<InsumoVariable>) => Promise<void>;
  deleteInsumo: (id: string) => Promise<void>;
  
  // Funciones especiales
  importFromExcel: (data: any[], segmento?: InsumoSegmento) => Promise<ResultadoImportacionExcel>;
  getInsumosBySegmento: (segmento: InsumoSegmento) => InsumoVariable[];
  refetch: () => Promise<void>;
  cargarDatosEjemplo: () => Promise<void>;
  
  // Estadísticas
  estadisticas: {
    total: number;
    porSegmento: Record<string, number>;
    costoTotal: number;
    costoPromedio: number;
  };
}

// ============================================
// CONFIGURACIÓN DE CACHE
// ============================================

const CACHE_KEY = 'insumos-variables-data-v2';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

interface CacheData {
  data: InsumoVariable[];
  timestamp: number;
}

const getCachedData = (): InsumoVariable[] | null => {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CacheData = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION;
    
    if (isExpired) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
};

const setCachedData = (data: InsumoVariable[]): void => {
  try {
    const cacheData: CacheData = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Error caching insumos data:', error);
  }
};

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useInsumosVariables = (): UseInsumosVariablesReturn => {
  // Estados principales
  const [insumos, setInsumos] = useState<InsumoVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSegmento, setSelectedSegmento] = useState<InsumoSegmento | ''>('');

  // ============================================
  // FUNCIONES DE CARGA DE DATOS
  // ============================================

  /**
   * Cargar insumos desde la base de datos
   */
  const loadData = useCallback(async (force: boolean = false) => {
    // Intentar cargar desde cache primero
    if (!force) {
      const cached = getCachedData();
      if (cached) {
        setInsumos(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: supabaseError } = await supabase
        .from('insumos_variables')
        .select('*')
        .eq('activo', true)
        .order('codigo', { ascending: true });

      if (supabaseError) {
        throw new Error(handleSupabaseError(supabaseError));
      }

      const insumosData = data || [];
      setInsumos(insumosData);
      setCachedData(insumosData);
      
      console.log(`📦 Insumos cargados: ${insumosData.length}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando insumos';
      setError(errorMessage);
      console.error('Error loading insumos:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cargar datos de ejemplo si la tabla está vacía
   */
  const cargarDatosEjemplo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔄 Cargando datos de ejemplo...');

      // Verificar si ya hay datos
      const { count } = await supabase
        .from('insumos_variables')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true);

      if (count && count > 0) {
        console.log('ℹ️ Ya existen insumos en la base de datos');
        await loadData(true);
        return;
      }

      // Insertar datos de ejemplo
      const datosParaInsertar = datosEjemplo.map(item => ({
        codigo: item.codigo.toUpperCase(),
        descripcion: item.descripcion.toUpperCase(),
        segmento: item.segmento,
        precio_unitario: item.precio_unitario,
        unidad: item.unidad,
        consumo: item.consumo,
        cantidad: item.cantidad,
        activo: true,
      }));

      const { error: insertError } = await supabase
        .from('insumos_variables')
        .insert(datosParaInsertar);

      if (insertError) {
        throw new Error(handleSupabaseError(insertError));
      }

      console.log(`✅ Se insertaron ${datosEjemplo.length} insumos de ejemplo`);
      
      // Recargar datos después de insertar
      await loadData(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando datos de ejemplo';
      setError(errorMessage);
      console.error('Error loading example data:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  // ============================================
  // OPERACIONES CRUD
  // ============================================

  /**
   * Crear nuevo insumo
   */
  const createInsumo = useCallback(async (data: NuevoInsumoVariable) => {
    try {
      setLoading(true);
      setError(null);

      const { data: newInsumo, error: supabaseError } = await supabase
        .from('insumos_variables')
        .insert([{
          codigo: data.codigo.toUpperCase(),
          descripcion: data.descripcion.toUpperCase(),
          segmento: data.segmento,
          precio_unitario: data.precio_unitario,
          unidad: data.unidad,
          consumo: data.consumo,
          cantidad: data.cantidad,
          activo: true,
        }])
        .select()
        .single();

      if (supabaseError) {
        throw new Error(handleSupabaseError(supabaseError));
      }

      // Recargar datos para reflejar cambios
      await loadData(true);
      
      console.log('✅ Insumo creado:', newInsumo);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error creando insumo';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  /**
   * Actualizar insumo existente
   */
  const updateInsumo = useCallback(async (id: string, data: Partial<InsumoVariable>) => {
    try {
      setLoading(true);
      setError(null);

      const updateData: any = { ...data };
      
      // Convertir a uppercase si están presentes
      if (updateData.codigo) updateData.codigo = updateData.codigo.toUpperCase();
      if (updateData.descripcion) updateData.descripcion = updateData.descripcion.toUpperCase();

      const { data: updatedInsumo, error: supabaseError } = await supabase
        .from('insumos_variables')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (supabaseError) {
        throw new Error(handleSupabaseError(supabaseError));
      }

      // Recargar datos para reflejar cambios
      await loadData(true);
      
      console.log('✅ Insumo actualizado:', updatedInsumo);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error actualizando insumo';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  /**
   * Eliminar insumo (soft delete)
   */
  const deleteInsumo = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      const { error: supabaseError } = await supabase
        .from('insumos_variables')
        .update({ activo: false })
        .eq('id', id);

      if (supabaseError) {
        throw new Error(handleSupabaseError(supabaseError));
      }

      // Recargar datos para reflejar cambios
      await loadData(true);
      
      console.log('✅ Insumo eliminado (soft delete)');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error eliminando insumo';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  // ============================================
  // IMPORTACIÓN DESDE EXCEL
  // ============================================

  /**
   * Importar insumos desde datos Excel
   */
  const importFromExcel = useCallback(async (
    data: any[], 
    segmento?: InsumoSegmento
  ): Promise<ResultadoImportacionExcel> => {
    try {
      setLoading(true);
      setError(null);

      const resultado: ResultadoImportacionExcel = {
        exitosos: 0,
        duplicados: 0,
        errores: 0,
        detallesErrores: [],
        datosImportados: [],
        resumenPorSegmento: {},
      };

      for (const item of data) {
        try {
          // Validar datos requeridos
          if (!item.codigo || !item.descripcion || !item.precio_unitario) {
            resultado.errores++;
            resultado.detallesErrores.push(`Fila: datos incompletos - ${JSON.stringify(item)}`);
            continue;
          }

          // Verificar si ya existe
          const { data: existente } = await supabase
            .from('insumos_variables')
            .select('id')
            .eq('codigo', item.codigo.toString().toUpperCase())
            .single();

          if (existente) {
            resultado.duplicados++;
            continue;
          }

          // Crear nuevo insumo
          const nuevoInsumo = {
            codigo: item.codigo.toString().toUpperCase(),
            descripcion: item.descripcion.toString().toUpperCase(),
            segmento: segmento || item.segmento,
            precio_unitario: parseFloat(item.precio_unitario),
            unidad: item.unidad || 'Unidad',
            consumo: item.consumo || 'Por Practica',
            cantidad: parseFloat(item.cantidad || 1),
            activo: true,
          };

          const { error: insertError } = await supabase
            .from('insumos_variables')
            .insert([nuevoInsumo]);

          if (insertError) {
            resultado.errores++;
            resultado.detallesErrores.push(`${item.codigo}: ${insertError.message}`);
          } else {
            resultado.exitosos++;
            resultado.datosImportados.push(nuevoInsumo);
          }
        } catch (itemError) {
          resultado.errores++;
          resultado.detallesErrores.push(`${item.codigo}: ${itemError}`);
        }
      }

      // Recargar datos después de la importación
      await loadData(true);

      console.log('📊 Importación completada:', resultado);
      return resultado;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error en importación';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  // ============================================
  // FILTROS Y BÚSQUEDA
  // ============================================

  /**
   * Insumos filtrados según criterios de búsqueda
   */
  const filteredInsumos = useMemo(() => {
    return insumos.filter((insumo) => {
      // Filtro por término de búsqueda
      const matchesSearch = !searchTerm || 
        insumo.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        insumo.descripcion.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtro por segmento
      const matchesSegmento = !selectedSegmento || insumo.segmento === selectedSegmento;

      return matchesSearch && matchesSegmento;
    });
  }, [insumos, searchTerm, selectedSegmento]);

  // ============================================
  // FUNCIONES UTILITARIAS
  // ============================================

  /**
   * Obtener insumos por segmento específico
   */
  const getInsumosBySegmento = useCallback((segmento: InsumoSegmento) => {
    return insumos.filter(insumo => insumo.segmento === segmento);
  }, [insumos]);

  /**
   * Refetch manual de datos
   */
  const refetch = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  // ============================================
  // ESTADÍSTICAS CALCULADAS
  // ============================================

  const estadisticas = useMemo(() => {
    const insumosMostrados = filteredInsumos;
    
    // Contar por segmento
    const porSegmento = insumosMostrados.reduce((acc, insumo) => {
      acc[insumo.segmento] = (acc[insumo.segmento] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calcular costos
    const costoTotal = insumosMostrados.reduce((sum, insumo) => 
      sum + (insumo.precio_unitario * insumo.cantidad), 0
    );

    return {
      total: insumosMostrados.length,
      porSegmento,
      costoTotal,
      costoPromedio: insumosMostrados.length > 0 ? costoTotal / insumosMostrados.length : 0,
    };
  }, [filteredInsumos]);

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar datos al montar el componente
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Suscripción real-time a cambios
  useEffect(() => {
    const channel = supabase
      .channel('insumos-variables-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'insumos_variables'
        },
        () => {
          console.log('🔄 Cambios detectados en insumos, recargando...');
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // ============================================
  // RETORNO DEL HOOK
  // ============================================

  return {
    // Estado principal
    insumos,
    filteredInsumos,
    loading,
    error,
    
    // Filtros
    searchTerm,
    selectedSegmento,
    setSearchTerm,
    setSelectedSegmento,
    
    // Operaciones CRUD
    createInsumo,
    updateInsumo,
    deleteInsumo,
    
    // Funciones especiales
    importFromExcel,
    getInsumosBySegmento,
    refetch,
    cargarDatosEjemplo,
    
    // Estadísticas
    estadisticas,
  };
};