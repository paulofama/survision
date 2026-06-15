// ============================================
// HOOK PRESTACIONES REALIZADAS
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface PrestacionRealizada {
  id: string;
  codigo: string;
  nombre_prestacion: string;
  mes: string;
  año: number;
  mes_numero: number;
  cantidad: number;
  coseguro_promedio: number;
  cobertura_promedio: number;
  total_promedio: number;
  total_facturado: number;
  fecha_importacion: string;
  archivo_origen?: string;
  registros_procesados?: number;
  created_at: string;
  updated_at: string;
}

export interface EstadisticasMes {
  total_prestaciones: number;
  total_cantidad: number;
  total_facturado: number;
  promedio_por_prestacion: number;
}

export interface ResumenImportacion {
  mes: string;
  total_prestaciones: number;
  total_cantidad: number;
  total_facturado: number;
  fecha_ultima_importacion: string;
}

export interface DatosPrestacionImportada {
  codigo?: string;
  nombre_csv: string;
  nombre_bd?: string;
  mes: string;
  cantidad: number;
  coseguro_promedio: number;
  cobertura_promedio: number;
  total_promedio: number;
  total_facturado: number;
  similitud?: number;
  mapeado: boolean;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const usePrestacionesRealizadas = () => {
  // Estados principales
  const [prestacionesRealizadas, setPrestacionesRealizadas] = useState<PrestacionRealizada[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Estados de filtros
  const [mesSeleccionado, setMesSeleccionado] = useState<string>('');
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([]);
  
  // Estados de estadísticas
  const [estadisticasMes, setEstadisticasMes] = useState<EstadisticasMes | null>(null);
  const [resumenImportaciones, setResumenImportaciones] = useState<ResumenImportacion[]>([]);

  // ============================================
  // FUNCIONES DE CARGA DE DATOS
  // ============================================

  /**
   * Cargar todas las prestaciones realizadas
   */
  const cargarPrestacionesRealizadas = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: supabaseError } = await supabase
        .from('prestaciones_realizadas')
        .select('*')
        .order('mes', { ascending: false })
        .order('cantidad', { ascending: false });
      
      if (supabaseError) {
        throw new Error(`Error cargando prestaciones realizadas: ${supabaseError.message}`);
      }
      
      setPrestacionesRealizadas(data || []);
      
      // Extraer meses únicos
      const meses = [...new Set((data || []).map(p => p.mes))].sort().reverse();
      setMesesDisponibles(meses);
      
      // Establecer mes por defecto
      if (meses.length > 0 && !mesSeleccionado) {
        setMesSeleccionado(meses[0]);
      }
      
    } catch (err) {
      console.error('Error cargando prestaciones realizadas:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [mesSeleccionado]);

  /**
   * Cargar estadísticas de un mes específico
   */
  const cargarEstadisticasMes = useCallback(async (mes: string) => {
    if (!mes) return;
    
    try {
      const { data, error: supabaseError } = await supabase
        .rpc('get_estadisticas_prestaciones_mes', { mes_param: mes });
      
      if (supabaseError) {
        throw new Error(`Error cargando estadísticas: ${supabaseError.message}`);
      }
      
      if (data && data.length > 0) {
        setEstadisticasMes(data[0]);
      } else {
        setEstadisticasMes({
          total_prestaciones: 0,
          total_cantidad: 0,
          total_facturado: 0,
          promedio_por_prestacion: 0
        });
      }
      
    } catch (err) {
      console.error('Error cargando estadísticas del mes:', err);
    }
  }, []);

  /**
   * Cargar resumen de todas las importaciones
   */
  const cargarResumenImportaciones = useCallback(async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .rpc('get_resumen_importaciones');
      
      if (supabaseError) {
        throw new Error(`Error cargando resumen: ${supabaseError.message}`);
      }
      
      setResumenImportaciones(data || []);
      
    } catch (err) {
      console.error('Error cargando resumen de importaciones:', err);
    }
  }, []);

  // ============================================
  // FUNCIONES DE IMPORTACIÓN
  // ============================================

  /**
   * Limpiar datos de un mes específico
   */
  const limpiarMes = useCallback(async (mes: string): Promise<number> => {
    try {
      const { data, error: supabaseError } = await supabase
        .rpc('limpiar_prestaciones_mes', { mes_param: mes });
      
      if (supabaseError) {
        throw new Error(`Error limpiando mes: ${supabaseError.message}`);
      }
      
      return data || 0;
      
    } catch (err) {
      console.error('Error limpiando mes:', err);
      throw err;
    }
  }, []);

  /**
   * Importar datos procesados de CSV
   */
  const importarDatosCSV = useCallback(async (
    datos: DatosPrestacionImportada[], 
    mes: string,
    archivoOrigen: string
  ): Promise<{ exitosos: number; errores: string[] }> => {
    try {
      // Primero limpiar el mes
      await limpiarMes(mes);
      
      // Preparar datos para inserción
      const registrosParaInsertar = datos
        .filter(d => d.mapeado) // Solo los que se mapearon correctamente
        .map(dato => ({
          codigo: dato.codigo || 'SIN_CODIGO',
          nombre_prestacion: dato.nombre_csv.toUpperCase(),
          mes: mes,
          año: parseInt(mes.split('-')[0]),
          mes_numero: parseInt(mes.split('-')[1]),
          cantidad: dato.cantidad,
          coseguro_promedio: Math.round(dato.coseguro_promedio * 100) / 100,
          cobertura_promedio: Math.round(dato.cobertura_promedio * 100) / 100,
          total_promedio: Math.round(dato.total_promedio * 100) / 100,
          total_facturado: Math.round(dato.total_facturado * 100) / 100,
          archivo_origen: archivoOrigen,
          registros_procesados: datos.length
        }));
      
      if (registrosParaInsertar.length === 0) {
        throw new Error('No hay datos válidos para importar');
      }
      
      // Insertar en lotes para mejor performance
      const batchSize = 100;
      const errores: string[] = [];
      let exitosos = 0;
      
      for (let i = 0; i < registrosParaInsertar.length; i += batchSize) {
        const batch = registrosParaInsertar.slice(i, i + batchSize);
        
        const { data, error: supabaseError } = await supabase
          .from('prestaciones_realizadas')
          .insert(batch)
          .select('id');
        
        if (supabaseError) {
          errores.push(`Lote ${Math.floor(i/batchSize) + 1}: ${supabaseError.message}`);
        } else {
          exitosos += data?.length || 0;
        }
      }
      
      // Recargar datos después de la importación
      await cargarPrestacionesRealizadas();
      await cargarEstadisticasMes(mes);
      await cargarResumenImportaciones();
      
      return { exitosos, errores };
      
    } catch (err) {
      console.error('Error importando datos CSV:', err);
      throw err;
    }
  }, [cargarPrestacionesRealizadas, cargarEstadisticasMes, cargarResumenImportaciones, limpiarMes]);

  // ============================================
  // FUNCIONES DE UTILIDAD
  // ============================================

  /**
   * Obtener prestación realizada por código y mes
   */
  const obtenerPrestacionPorCodigo = useCallback((codigo: string, mes?: string): PrestacionRealizada | null => {
    const mesABuscar = mes || mesSeleccionado;
    return prestacionesRealizadas.find(p => p.codigo === codigo && p.mes === mesABuscar) || null;
  }, [prestacionesRealizadas, mesSeleccionado]);

  /**
   * Obtener datos agregados por códigos
   */
  const obtenerDatosPorCodigos = useCallback((codigos: string[], mes?: string) => {
    const mesABuscar = mes || mesSeleccionado;
    const resultado = new Map<string, PrestacionRealizada>();
    
    prestacionesRealizadas
      .filter(p => p.mes === mesABuscar && codigos.includes(p.codigo))
      .forEach(p => {
        resultado.set(p.codigo, p);
      });
    
    return resultado;
  }, [prestacionesRealizadas, mesSeleccionado]);

  /**
   * Calcular totales filtrados
   */
  const calcularTotales = useCallback((mes?: string) => {
    const mesABuscar = mes || mesSeleccionado;
    const datosFiltrados = prestacionesRealizadas.filter(p => p.mes === mesABuscar);
    
    return {
      totalPrestaciones: datosFiltrados.length,
      totalCantidad: datosFiltrados.reduce((sum, p) => sum + p.cantidad, 0),
      totalFacturado: datosFiltrados.reduce((sum, p) => sum + p.total_facturado, 0),
      promedioFacturacion: datosFiltrados.length > 0 
        ? datosFiltrados.reduce((sum, p) => sum + p.total_promedio, 0) / datosFiltrados.length 
        : 0
    };
  }, [prestacionesRealizadas, mesSeleccionado]);

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar datos iniciales
  useEffect(() => {
    cargarPrestacionesRealizadas();
    cargarResumenImportaciones();
  }, [cargarPrestacionesRealizadas, cargarResumenImportaciones]);

  // Cargar estadísticas cuando cambia el mes
  useEffect(() => {
    if (mesSeleccionado) {
      cargarEstadisticasMes(mesSeleccionado);
    }
  }, [mesSeleccionado, cargarEstadisticasMes]);

  // ============================================
  // RETURN DEL HOOK
  // ============================================

  return {
    // Estados principales
    prestacionesRealizadas,
    loading,
    error,
    
    // Filtros
    mesSeleccionado,
    setMesSeleccionado,
    mesesDisponibles,
    
    // Estadísticas
    estadisticasMes,
    resumenImportaciones,
    
    // Funciones de carga
    cargarPrestacionesRealizadas,
    cargarEstadisticasMes,
    cargarResumenImportaciones,
    
    // Funciones de importación
    importarDatosCSV,
    limpiarMes,
    
    // Funciones de utilidad
    obtenerPrestacionPorCodigo,
    obtenerDatosPorCodigos,
    calcularTotales,
    
    // Funciones de recarga
    refetch: cargarPrestacionesRealizadas
  };
};

export default usePrestacionesRealizadas;