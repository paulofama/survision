// ============================================
// HOOK: useHonorariosConfig
// GestiÃ³n de configuraciÃ³n de honorarios
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

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
        .order('codigo_desde', { ascending: true });

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
      // No setear error aquÃ­ para no bloquear si solo falla prestadores
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
      console.error('Error creando configuraciÃ³n:', err);
      setError('Error al crear configuraciÃ³n');
      return false;
    }
  }, [cargarConfiguraciones]);

  const actualizarConfiguracion = useCallback(async (
    id: string, 
    datos: Partial<NuevoHonorarioConfig>
  ): Promise<boolean> => {
    try {
      const { error: supabaseError } = await supabase
        .from('honorarios_config')
        .update({
          ...datos,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (supabaseError) throw supabaseError;
      
      await cargarConfiguraciones();
      return true;
    } catch (err) {
      console.error('Error actualizando configuraciÃ³n:', err);
      setError('Error al actualizar configuraciÃ³n');
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
      console.error('Error eliminando configuraciÃ³n:', err);
      setError('Error al eliminar configuraciÃ³n');
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
  // FUNCIONES DE CÃLCULO
  // ============================================

  const obtenerSegmentoPorCodigo = useCallback((codigo: string): HonorarioConfig | null => {
    // Normalizar cÃ³digo a 6 dÃ­gitos
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
  // ESTADÃSTICAS
  // ============================================

  const estadisticas = useMemo(() => {
    const totalPrestadores = prestadores.length;
    const socios = prestadores.filter(p => p.es_socio).length;
    const noSocios = totalPrestadores - socios;
    const totalSegmentos = configuraciones.length;

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
    
    // CÃ¡lculos
    obtenerSegmentoPorCodigo,
    calcularHonorario,
    simularHonorario,
    
    // Refresh
    refetch: cargarTodo
  };
};

export default useHonorariosConfig;
