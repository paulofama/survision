// ============================================
// HOOK: usePrestadoresSync
// Sincronización automática GECLISA → Supabase
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// CORREGIDO: Usa apiConfig.ts para URL dinámica
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/apiConfig'; // ← IMPORTAR DESDE apiConfig

// ============================================
// TIPOS
// ============================================

export interface PrestadorGeclisa {
  geclisa_pre_id: number;
  nombre: string;
  matricula_provincial: number | null;
  cuit: string | null;
  email?: string | null;
  total_practicas?: number;
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

export interface SyncResult {
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  errores: number;
  detalles: string[];
}

// ============================================
// CONFIGURACIÓN
// ============================================

// ✅ REMOVIDO: const API_BASE_URL = 'http://localhost:3001/api';
// ✅ AHORA USA: import { API_BASE_URL } from '../lib/apiConfig';

// Prestadores que son socios (definir aquí o cargar de config)
const SOCIOS_NOMBRES = [
  'MERCADO JORGE',
  'JORGE MERCADO',
  'MAHIA PABLO',
  'PABLO MAHIA',
  'MUSA CARLOS',
  'CARLOS MUSA'
];

// ============================================
// HOOK PRINCIPAL
// ============================================

export function usePrestadoresSync() {
  // Estados
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [prestadoresGeclisa, setPrestadoresGeclisa] = useState<PrestadorGeclisa[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Ref para evitar sincronizaciones duplicadas
  const syncInProgress = useRef(false);

  // ============================================
  // CARGAR PRESTADORES DE GECLISA
  // ============================================

  const fetchPrestadoresGeclisa = useCallback(async (): Promise<PrestadorGeclisa[]> => {
    try {
      console.log('👨‍⚕️ Cargando prestadores de GECLISA...');
      console.log(`   URL: ${API_BASE_URL}/prestadores-geclisa/activos`);
      
      // Usar endpoint de activos (solo los que tienen prácticas)
      const response = await fetch(`${API_BASE_URL}/prestadores-geclisa/activos`);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Error al obtener prestadores');
      }
      
      console.log(`✅ ${data.data.length} prestadores activos cargados de GECLISA`);
      return data.data;
      
    } catch (err) {
      console.error('❌ Error cargando prestadores de GECLISA:', err);
      throw err;
    }
  }, []);

  // ============================================
  // CARGAR PRESTADORES DE SUPABASE
  // ============================================

  const fetchPrestadoresSupabase = useCallback(async (): Promise<Prestador[]> => {
    try {
      console.log('🗄️ Cargando prestadores de Supabase...');
      
      const { data, error } = await supabase
        .from('prestadores')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      
      if (error) {
        throw new Error(error.message);
      }
      
      console.log(`✅ ${data?.length || 0} prestadores cargados de Supabase`);
      return data || [];
      
    } catch (err) {
      console.error('❌ Error cargando prestadores de Supabase:', err);
      throw err;
    }
  }, []);

  // ============================================
  // DETECTAR SI ES SOCIO
  // ============================================

  const esSocio = useCallback((nombre: string): boolean => {
    const nombreUpper = nombre.toUpperCase().trim();
    return SOCIOS_NOMBRES.some(socio => 
      nombreUpper.includes(socio) || socio.includes(nombreUpper)
    );
  }, []);

  // ============================================
  // SINCRONIZACIÓN AUTOMÁTICA
  // ============================================

  const sincronizar = useCallback(async (): Promise<SyncResult> => {
    if (syncInProgress.current) {
      console.log('⏳ Sincronización ya en progreso...');
      return { nuevos: 0, actualizados: 0, sinCambios: 0, errores: 0, detalles: ['En progreso'] };
    }

    syncInProgress.current = true;
    setSyncing(true);
    setError(null);

    const result: SyncResult = {
      nuevos: 0,
      actualizados: 0,
      sinCambios: 0,
      errores: 0,
      detalles: []
    };

    try {
      console.log('🔄 Iniciando sincronización de prestadores...');

      // 1. Cargar datos de ambas fuentes
      const [geclisaData, supabaseData] = await Promise.all([
        fetchPrestadoresGeclisa(),
        fetchPrestadoresSupabase()
      ]);

      setPrestadoresGeclisa(geclisaData);

      // 2. Crear mapa de prestadores existentes
      const supabaseByPreId = new Map<number, Prestador>();
      supabaseData.forEach(p => {
        if (p.geclisa_pre_id) {
          supabaseByPreId.set(p.geclisa_pre_id, p);
        }
      });

      // 3. Procesar cada prestador de GECLISA
      const inserciones: Partial<Prestador>[] = [];
      const actualizaciones: { id: string; data: Partial<Prestador> }[] = [];

      for (const prestadorG of geclisaData) {
        try {
          const existente = supabaseByPreId.get(prestadorG.geclisa_pre_id);
          const socio = esSocio(prestadorG.nombre);

          if (existente) {
            // Verificar si necesita actualización
            const necesitaActualizacion = 
              existente.nombre !== prestadorG.nombre ||
              existente.matricula_provincial !== prestadorG.matricula_provincial ||
              existente.cuit !== prestadorG.cuit;

            if (necesitaActualizacion) {
              actualizaciones.push({
                id: existente.id,
                data: {
                  nombre: prestadorG.nombre,
                  matricula_provincial: prestadorG.matricula_provincial,
                  cuit: prestadorG.cuit,
                  updated_at: new Date().toISOString()
                }
              });
              result.detalles.push(`📝 Actualizado: ${prestadorG.nombre}`);
            } else {
              result.sinCambios++;
            }
          } else {
            // Crear nuevo
            inserciones.push({
              geclisa_pre_id: prestadorG.geclisa_pre_id,
              nombre: prestadorG.nombre,
              matricula_provincial: prestadorG.matricula_provincial,
              cuit: prestadorG.cuit,
              es_socio: socio,
              activo: true
            });
            result.detalles.push(`➕ Nuevo: ${prestadorG.nombre}${socio ? ' (SOCIO)' : ''}`);
          }
        } catch (err) {
          console.error(`Error procesando prestador ${prestadorG.nombre}:`, err);
          result.errores++;
        }
      }

      // 4. Ejecutar inserciones
      if (inserciones.length > 0) {
        console.log(`📥 Insertando ${inserciones.length} nuevos prestadores...`);
        
        const { error: insertError } = await supabase
          .from('prestadores')
          .insert(inserciones);
        
        if (insertError) {
          console.error('Error en inserción:', insertError);
          result.errores += inserciones.length;
          result.detalles.push(`❌ Error al insertar: ${insertError.message}`);
        } else {
          result.nuevos = inserciones.length;
        }
      }

      // 5. Ejecutar actualizaciones
      for (const { id, data } of actualizaciones) {
        const { error: updateError } = await supabase
          .from('prestadores')
          .update(data)
          .eq('id', id);
        
        if (updateError) {
          result.errores++;
        } else {
          result.actualizados++;
        }
      }

      // 6. Recargar datos
      const prestadoresActualizados = await fetchPrestadoresSupabase();
      setPrestadores(prestadoresActualizados);

      // 7. Guardar timestamp
      const syncTime = new Date().toISOString();
      setLastSync(syncTime);
      localStorage.setItem('lastPrestadoresSync', syncTime);

      console.log('✅ Sincronización completada:', result);
      setSyncResult(result);

      return result;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error en sincronización:', errorMsg);
      setError(errorMsg);
      return result;
    } finally {
      setSyncing(false);
      syncInProgress.current = false;
    }
  }, [fetchPrestadoresGeclisa, fetchPrestadoresSupabase, esSocio]);

  // ============================================
  // CARGAR DATOS INICIAL
  // ============================================

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabaseData = await fetchPrestadoresSupabase();
      setPrestadores(supabaseData);

      const lastSyncStored = localStorage.getItem('lastPrestadoresSync');
      if (lastSyncStored) {
        setLastSync(lastSyncStored);
      }

      // Sincronizar automáticamente
      await sincronizar();

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [fetchPrestadoresSupabase, sincronizar]);

  // ============================================
  // EFECTO: CARGA INICIAL
  // ============================================

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ============================================
  // OPERACIONES CRUD
  // ============================================

  const actualizarPrestador = useCallback(async (
    id: string, 
    datos: Partial<Prestador>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('prestadores')
        .update({
          ...datos,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      const prestadoresActualizados = await fetchPrestadoresSupabase();
      setPrestadores(prestadoresActualizados);

      return true;
    } catch (err) {
      console.error('Error actualizando prestador:', err);
      setError(err instanceof Error ? err.message : 'Error al actualizar');
      return false;
    }
  }, [fetchPrestadoresSupabase]);

  const toggleSocio = useCallback(async (id: string, esSocio: boolean): Promise<boolean> => {
    return actualizarPrestador(id, { es_socio: esSocio });
  }, [actualizarPrestador]);

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const stats = {
    total: prestadores.length,
    socios: prestadores.filter(p => p.es_socio).length,
    noSocios: prestadores.filter(p => !p.es_socio).length
  };

  // ============================================
  // RETURN
  // ============================================

  return {
    // Datos
    prestadores,
    prestadoresGeclisa,
    stats,
    lastSync,
    syncResult,

    // Estados
    loading,
    syncing,
    error,

    // Acciones
    sincronizar,
    cargarDatos,
    actualizarPrestador,
    toggleSocio,

    // Helpers
    clearError: () => setError(null),
    clearSyncResult: () => setSyncResult(null)
  };
}

export default usePrestadoresSync;
