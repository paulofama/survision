// ============================================
// HOOK: useInsumosSync
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

export interface ElementoGeclisa {
  geclisa_ele_id: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  tipo_elemento: number;
  stock_actual: number;
  stock_minimo: number;
  punto_reposicion: number;
  precio_unitario: number;
  precio_fecha_desde: string | null;
  precio_ultima_modificacion: string | null;
}

export interface InsumoVariable {
  id: string;
  codigo: string;
  descripcion: string;
  segmento: string;
  precio_unitario: number;
  unidad: string;
  consumo: string;
  cantidad: number;
  activo: boolean;
  geclisa_ele_id: number | null;
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

export interface SyncStats {
  totalGeclisa: number;
  totalSupabase: number;
  sincronizados: number;
  pendientes: number;
  ultimaSync: string | null;
}

// ============================================
// CONFIGURACIÓN
// ============================================

// ✅ REMOVIDO: const API_BASE_URL = 'http://localhost:3001/api';
// ✅ AHORA USA: import { API_BASE_URL } from '../lib/apiConfig';

const TIPO_ELEMENTO_INSUMOS = 125; // Te_id para insumos médicos

// Segmento por defecto para nuevos insumos
const SEGMENTO_DEFAULT = 'Descartables';

// ============================================
// HOOK PRINCIPAL
// ============================================

export function useInsumosSync() {
  // Estados
  const [insumos, setInsumos] = useState<InsumoVariable[]>([]);
  const [elementosGeclisa, setElementosGeclisa] = useState<ElementoGeclisa[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);

  // Ref para evitar sincronizaciones duplicadas
  const syncInProgress = useRef(false);

  // ============================================
  // CARGAR ELEMENTOS DE GECLISA
  // ============================================

  const fetchElementosGeclisa = useCallback(async (): Promise<ElementoGeclisa[]> => {
    try {
      console.log('📦 Cargando elementos de GECLISA...');
      console.log(`   URL: ${API_BASE_URL}/elementos-geclisa`);
      
      const response = await fetch(
        `${API_BASE_URL}/elementos-geclisa?tipoElemento=${TIPO_ELEMENTO_INSUMOS}`
      );
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Error al obtener elementos');
      }
      
      console.log(`✅ ${data.data.length} elementos cargados de GECLISA`);
      return data.data;
      
    } catch (err) {
      console.error('❌ Error cargando elementos de GECLISA:', err);
      throw err;
    }
  }, []);

  // ============================================
  // CARGAR INSUMOS DE SUPABASE
  // ============================================

  const fetchInsumosSupabase = useCallback(async (): Promise<InsumoVariable[]> => {
    try {
      console.log('🗄️ Cargando insumos de Supabase...');
      
      const { data, error } = await supabase
        .from('insumos_variables')
        .select('*')
        .eq('activo', true)
        .order('codigo');
      
      if (error) {
        throw new Error(error.message);
      }
      
      console.log(`✅ ${data?.length || 0} insumos cargados de Supabase`);
      return data || [];
      
    } catch (err) {
      console.error('❌ Error cargando insumos de Supabase:', err);
      throw err;
    }
  }, []);

  // ============================================
  // SINCRONIZACIÓN AUTOMÁTICA
  // ============================================

  const sincronizar = useCallback(async (): Promise<SyncResult> => {
    // Evitar sincronizaciones duplicadas
    if (syncInProgress.current) {
      console.log('⏳ Sincronización ya en progreso, omitiendo...');
      return { nuevos: 0, actualizados: 0, sinCambios: 0, errores: 0, detalles: ['Sincronización en progreso'] };
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
      console.log('🔄 Iniciando sincronización GECLISA → Supabase...');

      // 1. Cargar datos de ambas fuentes
      const [geclisaData, supabaseData] = await Promise.all([
        fetchElementosGeclisa(),
        fetchInsumosSupabase()
      ]);

      setElementosGeclisa(geclisaData);

      // 2. Crear mapa de insumos existentes por geclisa_ele_id y codigo
      const supabaseByEleId = new Map<number, InsumoVariable>();
      const supabaseByCodigo = new Map<string, InsumoVariable>();
      
      supabaseData.forEach(insumo => {
        if (insumo.geclisa_ele_id) {
          supabaseByEleId.set(insumo.geclisa_ele_id, insumo);
        }
        supabaseByCodigo.set(insumo.codigo.toUpperCase(), insumo);
      });

      // 3. Procesar cada elemento de GECLISA
      const inserciones: Partial<InsumoVariable>[] = [];
      const actualizaciones: { id: string; data: Partial<InsumoVariable> }[] = [];

      for (const elemento of geclisaData) {
        try {
          // Buscar si existe en Supabase (por geclisa_ele_id o por código)
          let insumoExistente = supabaseByEleId.get(elemento.geclisa_ele_id);
          
          if (!insumoExistente) {
            // Buscar por código como fallback
            insumoExistente = supabaseByCodigo.get(elemento.codigo.toUpperCase());
          }

          if (insumoExistente) {
            // El insumo ya existe - verificar si necesita actualización
            // Solo actualizamos si:
            // 1. No tiene geclisa_ele_id vinculado
            // 2. El precio cambió en GECLISA
            
            const necesitaActualizacion = 
              !insumoExistente.geclisa_ele_id || // Vincular si no está vinculado
              (elemento.precio_unitario > 0 && 
               Math.abs(insumoExistente.precio_unitario - elemento.precio_unitario) > 0.01);

            if (necesitaActualizacion) {
              actualizaciones.push({
                id: insumoExistente.id,
                data: {
                  geclisa_ele_id: elemento.geclisa_ele_id,
                  // Solo actualizar precio si GECLISA tiene precio > 0
                  ...(elemento.precio_unitario > 0 && {
                    precio_unitario: elemento.precio_unitario
                  }),
                  // Actualizar descripción y unidad desde GECLISA
                  descripcion: elemento.descripcion.toUpperCase(),
                  unidad: elemento.unidad || 'Unidad',
                  updated_at: new Date().toISOString()
                }
              });
              result.detalles.push(`📝 Actualizado: ${elemento.codigo} - ${elemento.descripcion}`);
            } else {
              result.sinCambios++;
            }
          } else {
            // El insumo NO existe en Supabase - crear nuevo
            inserciones.push({
              codigo: elemento.codigo.toUpperCase(),
              descripcion: elemento.descripcion.toUpperCase(),
              segmento: SEGMENTO_DEFAULT, // El usuario lo asignará después
              precio_unitario: elemento.precio_unitario || 0,
              unidad: elemento.unidad || 'Unidad',
              consumo: 'Por Practica', // Valor por defecto
              cantidad: 1, // Valor por defecto
              activo: true,
              geclisa_ele_id: elemento.geclisa_ele_id
            });
            result.detalles.push(`➕ Nuevo: ${elemento.codigo} - ${elemento.descripcion}`);
          }
        } catch (elemError) {
          console.error(`Error procesando elemento ${elemento.codigo}:`, elemError);
          result.errores++;
          result.detalles.push(`❌ Error: ${elemento.codigo}`);
        }
      }

      // 4. Ejecutar inserciones en batch
      if (inserciones.length > 0) {
        console.log(`📥 Insertando ${inserciones.length} nuevos insumos...`);
        
        const { error: insertError } = await supabase
          .from('insumos_variables')
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
      if (actualizaciones.length > 0) {
        console.log(`📝 Actualizando ${actualizaciones.length} insumos...`);
        
        for (const { id, data } of actualizaciones) {
          const { error: updateError } = await supabase
            .from('insumos_variables')
            .update(data)
            .eq('id', id);
          
          if (updateError) {
            console.error(`Error actualizando ${id}:`, updateError);
            result.errores++;
          } else {
            result.actualizados++;
          }
        }
      }

      // 6. Recargar datos de Supabase
      const insumosActualizados = await fetchInsumosSupabase();
      setInsumos(insumosActualizados);

      // 7. Guardar timestamp de última sincronización
      const syncTime = new Date().toISOString();
      setLastSync(syncTime);
      localStorage.setItem('lastInsumosSync', syncTime);

      // 8. Calcular estadísticas
      const newStats: SyncStats = {
        totalGeclisa: geclisaData.length,
        totalSupabase: insumosActualizados.length,
        sincronizados: insumosActualizados.filter(i => i.geclisa_ele_id !== null).length,
        pendientes: geclisaData.length - insumosActualizados.filter(i => i.geclisa_ele_id !== null).length,
        ultimaSync: syncTime
      };
      setStats(newStats);

      console.log('✅ Sincronización completada:', result);
      setSyncResult(result);

      return result;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error en sincronización:', errorMsg);
      setError(errorMsg);
      result.errores++;
      result.detalles.push(`❌ Error general: ${errorMsg}`);
      return result;
    } finally {
      setSyncing(false);
      syncInProgress.current = false;
    }
  }, [fetchElementosGeclisa, fetchInsumosSupabase]);

  // ============================================
  // CARGAR DATOS INICIAL
  // ============================================

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Cargar insumos de Supabase primero
      const supabaseData = await fetchInsumosSupabase();
      setInsumos(supabaseData);

      // Cargar última sincronización
      const lastSyncStored = localStorage.getItem('lastInsumosSync');
      if (lastSyncStored) {
        setLastSync(lastSyncStored);
      }

      // NOTA: el sync GECLISA→Supabase ahora lo hace el daemon on-prem
      // (server/services/insumosExtractor.js, 2 veces/día). El hook solo LEE de
      // Supabase para funcionar desde afuera de la clínica. La función
      // `sincronizar()` sigue disponible como acción manual (solo anda en LAN).

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [fetchInsumosSupabase]);

  // ============================================
  // EFECTO: SINCRONIZACIÓN AUTOMÁTICA AL MONTAR
  // ============================================

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ============================================
  // OPERACIONES CRUD (Solo en Supabase)
  // ============================================

  const actualizarInsumo = useCallback(async (
    id: string, 
    datos: Partial<InsumoVariable>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('insumos_variables')
        .update({
          ...datos,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      // Recargar datos
      const insumosActualizados = await fetchInsumosSupabase();
      setInsumos(insumosActualizados);

      return true;
    } catch (err) {
      console.error('Error actualizando insumo:', err);
      setError(err instanceof Error ? err.message : 'Error al actualizar');
      return false;
    }
  }, [fetchInsumosSupabase]);

  const eliminarInsumo = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Soft delete
      const { error } = await supabase
        .from('insumos_variables')
        .update({ 
          activo: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      // Recargar datos
      const insumosActualizados = await fetchInsumosSupabase();
      setInsumos(insumosActualizados);

      return true;
    } catch (err) {
      console.error('Error eliminando insumo:', err);
      setError(err instanceof Error ? err.message : 'Error al eliminar');
      return false;
    }
  }, [fetchInsumosSupabase]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Datos
    insumos,
    elementosGeclisa,
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
    actualizarInsumo,
    eliminarInsumo,

    // Helpers
    clearError: () => setError(null),
    clearSyncResult: () => setSyncResult(null)
  };
}

export default useInsumosSync;
