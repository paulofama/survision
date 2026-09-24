// ============================================
// HOOK: useHonorariosConfig
// Gestión de configuración de honorarios
// Sistema de Gestión Integral - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';

// ============================================
// TIPOS
// ============================================

export interface HonorarioConfig {
  id: string;
  segmento: 'Consultas' | 'Estudios' | 'Cirugias';
  codigo_desde: string;
  codigo_hasta: string;
  porcentaje_socio: number;
  porcentaje_no_socio: number;
  /** Desde cuándo rige esta versión (migración 54). */
  vigencia_desde: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prestador {
  id: string;
  geclisa_pre_id: number | null;
  nombre: string;
  matricula_provincial: number | null;
  cuit: string | null;
  es_socio: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface NuevoHonorarioConfig {
  segmento: 'Consultas' | 'Estudios' | 'Cirugias';
  codigo_desde: string;
  codigo_hasta: string;
  porcentaje_socio: number;
  porcentaje_no_socio: number;
}

export interface NuevoPrestador {
  nombre: string;
  geclisa_pre_id?: number;
  matricula_provincial?: number;
  cuit?: string;
  es_socio: boolean;
}

export interface SimulacionHonorario {
  monto: number;
  prestadorId: string;
  codigoPractica: string;
}

export interface ResultadoSimulacion {
  monto: number;
  segmento: string;
  prestador: string;
  esSocio: boolean;
  porcentaje: number;
  honorarioCalculado: number;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useHonorariosConfig = () => {
  // Estados
  const [configuraciones, setConfiguraciones] = useState<HonorarioConfig[]>([]);
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // ============================================
  // CARGAR DATOS
  // ============================================

  const cargarConfiguraciones = useCallback(async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('honorarios_config')
        .select('*')
        .eq('activo', true)
        .order('codigo_desde', { ascending: true })
        .order('vigencia_desde', { ascending: false });

      if (supabaseError) throw supabaseError;
      
      setConfiguraciones(data || []);
      setIsConnected(true);
    } catch (err) {
      console.error('Error cargando configuraciones:', err);
      setError('Error al cargar configuraciones de honorarios');
      setIsConnected(false);
    }
  }, []);

  const cargarPrestadores = useCallback(async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('prestadores')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (supabaseError) throw supabaseError;
      
      setPrestadores(data || []);
    } catch (err) {
      console.error('Error cargando prestadores:', err);
      // No setear error aquí para no bloquear si solo falla prestadores
    }
  }, []);

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    await Promise.all([
      cargarConfiguraciones(),
      cargarPrestadores()
    ]);
    
    setLoading(false);
  }, [cargarConfiguraciones, cargarPrestadores]);

  // Cargar al montar
  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // ============================================
  // CRUD CONFIGURACIONES
  // ============================================

  const crearConfiguracion = useCallback(async (datos: NuevoHonorarioConfig): Promise<boolean> => {
    try {
      const { error: supabaseError } = await supabase
        .from('honorarios_config')
        .insert([{
          ...datos,
          activo: true
        }]);

      if (supabaseError) throw supabaseError;
      
      await cargarConfiguraciones();
      return true;
    } catch (err) {
      console.error('Error creando configuración:', err);
      setError('Error al crear configuración');
      return false;
    }
  }, [cargarConfiguraciones]);

  /**
   * CAMBIAR UN PORCENTAJE CREA UNA VERSIÓN, NO PISA LA FILA.
   *
   * Antes esto era un UPDATE y el valor anterior se perdía: sólo se movía
   * `updated_at`. Como el módulo aplica el porcentaje vigente a CUALQUIER mes,
   * un cambio reescribía todo el histórico y el comparativo entre años pasaba
   * a medir lo que habría pasado con las reglas de hoy. Cada punto del
   * porcentaje de consultas mueve $3,2 M en 2025 (ver migración 54).
   *
   * La versión nueva arranca el PRIMER DÍA DEL MES EN CURSO: el mes es la
   * unidad con la que se informa, así que un cambio hecho hoy rige para este
   * mes completo y los anteriores conservan la versión vieja.
   *
   * Lo que no sea un porcentaje (códigos, activo) se actualiza en el lugar: no
   * cambia lo que se calculó en el pasado.
   */
  const actualizarConfiguracion = useCallback(async (
    id: string,
    datos: Partial<NuevoHonorarioConfig>
  ): Promise<boolean> => {
    try {
      const { data: actual, error: errLeer } = await supabase
        .from('honorarios_config')
        .select('*')
        .eq('id', id)
        .single();
      if (errLeer) throw errLeer;

      const cambiaPorcentaje =
        (datos.porcentaje_socio !== undefined
          && Number(datos.porcentaje_socio) !== Number(actual.porcentaje_socio))
        || (datos.porcentaje_no_socio !== undefined
          && Number(datos.porcentaje_no_socio) !== Number(actual.porcentaje_no_socio));

      if (!cambiaPorcentaje) {
        const { error } = await supabase
          .from('honorarios_config')
          .update({ ...datos, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        await cargarConfiguraciones();
        return true;
      }

      const hoy = new Date();
      const vigenciaDesde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;

      // Si ya hay una versión que arranca este mes se corrige ESA, no se
      // inserta otra: el índice único (segmento, vigencia_desde) no admite dos,
      // y cambiar el porcentaje dos veces en el mismo mes es corregirse.
      const { data: mismoMes } = await supabase
        .from('honorarios_config')
        .select('id')
        .eq('segmento', actual.segmento)
        .eq('vigencia_desde', vigenciaDesde)
        .maybeSingle();

      if (mismoMes?.id) {
        const { error } = await supabase
          .from('honorarios_config')
          .update({ ...datos, activo: true, updated_at: new Date().toISOString() })
          .eq('id', mismoMes.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('honorarios_config').insert([{
          segmento: actual.segmento,
          codigo_desde: datos.codigo_desde ?? actual.codigo_desde,
          codigo_hasta: datos.codigo_hasta ?? actual.codigo_hasta,
          porcentaje_socio: datos.porcentaje_socio ?? actual.porcentaje_socio,
          porcentaje_no_socio: datos.porcentaje_no_socio ?? actual.porcentaje_no_socio,
          vigencia_desde: vigenciaDesde,
          activo: true,
        }]);
        if (error) throw error;
      }

      await cargarConfiguraciones();
      return true;
    } catch (err) {
      console.error('Error actualizando configuración:', err);
      setError('Error al actualizar configuración');
      return false;
    }
  }, [cargarConfiguraciones]);

  const eliminarConfiguracion = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Soft delete
      const { error: supabaseError } = await supabase
        .from('honorarios_config')
        .update({ 
          activo: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (supabaseError) throw supabaseError;
      
      await cargarConfiguraciones();
      return true;
    } catch (err) {
      console.error('Error eliminando configuración:', err);
      setError('Error al eliminar configuración');
      return false;
    }
  }, [cargarConfiguraciones]);

  // ============================================
  // CRUD PRESTADORES
  // ============================================

  const crearPrestador = useCallback(async (datos: NuevoPrestador): Promise<boolean> => {
    try {
      const { error: supabaseError } = await supabase
        .from('prestadores')
        .insert([{
          ...datos,
          activo: true
        }]);

      if (supabaseError) throw supabaseError;
      
      await cargarPrestadores();
      return true;
    } catch (err) {
      console.error('Error creando prestador:', err);
      setError('Error al crear prestador');
      return false;
    }
  }, [cargarPrestadores]);

  const actualizarPrestador = useCallback(async (
    id: string, 
    datos: Partial<NuevoPrestador>
  ): Promise<boolean> => {
    try {
      const { error: supabaseError } = await supabase
        .from('prestadores')
        .update({
          ...datos,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (supabaseError) throw supabaseError;
      
      await cargarPrestadores();
      return true;
    } catch (err) {
      console.error('Error actualizando prestador:', err);
      setError('Error al actualizar prestador');
      return false;
    }
  }, [cargarPrestadores]);

  const toggleSocioPrestador = useCallback(async (id: string): Promise<boolean> => {
    const prestador = prestadores.find(p => p.id === id);
    if (!prestador) return false;

    return actualizarPrestador(id, { es_socio: !prestador.es_socio });
  }, [prestadores, actualizarPrestador]);

  const eliminarPrestador = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Soft delete
      const { error: supabaseError } = await supabase
        .from('prestadores')
        .update({ 
          activo: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (supabaseError) throw supabaseError;
      
      await cargarPrestadores();
      return true;
    } catch (err) {
      console.error('Error eliminando prestador:', err);
      setError('Error al eliminar prestador');
      return false;
    }
  }, [cargarPrestadores]);

  // ============================================
  // FUNCIONES DE CÁLCULO
  // ============================================

  const obtenerSegmentoPorCodigo = useCallback((codigo: string): HonorarioConfig | null => {
    // Normalizar código a 6 dígitos
    const codigoNormalizado = codigo.padStart(6, '0').substring(0, 6);
    
    return configuraciones.find(config => 
      codigoNormalizado >= config.codigo_desde && 
      codigoNormalizado <= config.codigo_hasta
    ) || null;
  }, [configuraciones]);

  const calcularHonorario = useCallback((
    monto: number,
    codigoPractica: string,
    esSocio: boolean
  ): { honorario: number; porcentaje: number; segmento: string } | null => {
    const config = obtenerSegmentoPorCodigo(codigoPractica);
    
    if (!config) {
      return null;
    }

    const porcentaje = esSocio ? config.porcentaje_socio : config.porcentaje_no_socio;
    const honorario = monto * (porcentaje / 100);

    return {
      honorario,
      porcentaje,
      segmento: config.segmento
    };
  }, [obtenerSegmentoPorCodigo]);

  const simularHonorario = useCallback((simulacion: SimulacionHonorario): ResultadoSimulacion | null => {
    const prestador = prestadores.find(p => p.id === simulacion.prestadorId);
    
    if (!prestador) {
      return null;
    }

    const resultado = calcularHonorario(
      simulacion.monto,
      simulacion.codigoPractica,
      prestador.es_socio
    );

    if (!resultado) {
      return null;
    }

    return {
      monto: simulacion.monto,
      segmento: resultado.segmento,
      prestador: prestador.nombre,
      esSocio: prestador.es_socio,
      porcentaje: resultado.porcentaje,
      honorarioCalculado: resultado.honorario
    };
  }, [prestadores, calcularHonorario]);

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const estadisticas = useMemo(() => {
    const totalPrestadores = prestadores.length;
    const socios = prestadores.filter(p => p.es_socio).length;
    const noSocios = totalPrestadores - socios;
    // Segmentos DISTINTOS, no filas: desde la migración 54 un segmento puede
    // tener varias versiones y contar filas mostraría '4' con tres segmentos.
    const totalSegmentos = new Set(configuraciones.map(c => c.segmento)).size;

    return {
      totalPrestadores,
      socios,
      noSocios,
      totalSegmentos,
      promedioSocio: configuraciones.length > 0
        ? configuraciones.reduce((sum, c) => sum + c.porcentaje_socio, 0) / configuraciones.length
        : 0,
      promedioNoSocio: configuraciones.length > 0
        ? configuraciones.reduce((sum, c) => sum + c.porcentaje_no_socio, 0) / configuraciones.length
        : 0
    };
  }, [prestadores, configuraciones]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Datos
    configuraciones,
    prestadores,
    estadisticas,
    
    // Estado
    loading,
    error,
    isConnected,
    
    // CRUD Configuraciones
    crearConfiguracion,
    actualizarConfiguracion,
    eliminarConfiguracion,
    
    // CRUD Prestadores
    crearPrestador,
    actualizarPrestador,
    toggleSocioPrestador,
    eliminarPrestador,
    
    // Cálculos
    obtenerSegmentoPorCodigo,
    calcularHonorario,
    simularHonorario,
    
    // Refresh
    refetch: cargarTodo
  };
};

export default useHonorariosConfig;
