// ============================================
// NUEVA CONFIGURACIÓN DE SUPABASE
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { createClient } from '@supabase/supabase-js';

// Nueva configuración de Supabase
const supabaseUrl = 'https://eawtvwuayahbldzjzeer.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhd3R2d3VheWFoYmxkemp6ZWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODc1OTksImV4cCI6MjA3OTU2MzU5OX0.Fo3kChA3Ozv3XGW19DimlZ_8uH-v6LWd2SvTXZfkIaE';

// Crear cliente de Supabase con configuración optimizada
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,      // Mantener sesiones activas
    autoRefreshToken: true,    // Renovación automática de tokens
    detectSessionInUrl: false, // No detectar sesiones en URL
  },
  realtime: {
    params: {
      eventsPerSecond: 10,     // Limitar eventos real-time
    },
  },
  db: {
    schema: 'public',          // Esquema por defecto
  },
  global: {
    headers: {
      'X-Client-Info': 'sistema-costos-mercado/1.0.0',
    },
  },
});

// ============================================
// FUNCIONES HELPER PARA LA BASE DE DATOS
// ============================================

/**
 * Verificar conexión con Supabase
 */
export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('agrupaciones')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Error de conexión con Supabase:', error);
      return false;
    }
    
    console.log('✅ Conexión con Supabase exitosa');
    return true;
  } catch (error) {
    console.error('Error al probar conexión:', error);
    return false;
  }
};

/**
 * Manejo centralizado de errores de Supabase
 */
export const handleSupabaseError = (error: any): string => {
  if (!error) return 'Error desconocido';
  
  // Errores específicos de PostgreSQL
  switch (error.code) {
    case 'PGRST116':
      return 'No se encontraron registros';
    case 'PGRST301':
      return 'Error de permisos. Verificar configuración RLS';
    case 'PGRST202':
      return 'Error de consulta. Verificar sintaxis SQL';
    case '23505':
      return 'Ya existe un registro con estos datos';
    case '23503':
      return 'Error de integridad referencial';
    default:
      return error.message || 'Error en la base de datos';
  }
};

/**
 * Obtener estadísticas generales del sistema
 */
export const getSystemStats = async () => {
  try {
    // Contar agrupaciones activas
    const { count: totalAgrupaciones, error: errorAgrupaciones } = await supabase
      .from('agrupaciones')
      .select('*', { count: 'exact', head: true })
      .eq('activa', true);

    if (errorAgrupaciones) throw errorAgrupaciones;

    // Contar prestaciones activas
    const { count: totalPrestaciones, error: errorPrestaciones } = await supabase
      .from('prestaciones')
      .select('*', { count: 'exact', head: true })
      .eq('activa', true);

    if (errorPrestaciones) throw errorPrestaciones;

    // Contar insumos activos
    const { count: totalInsumos, error: errorInsumos } = await supabase
      .from('insumos_variables')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true);

    if (errorInsumos) throw errorInsumos;

    return {
      agrupaciones: totalAgrupaciones || 0,
      prestaciones: totalPrestaciones || 0,
      insumos: totalInsumos || 0,
      sistema: 'Operativo',
    };
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return {
      agrupaciones: 0,
      prestaciones: 0,
      insumos: 0,
      sistema: 'Error',
    };
  }
};

/**
 * Verificar si las tablas existen y tienen datos
 */
export const verifyDatabaseSetup = async () => {
  try {
    console.log('🔍 Verificando configuración de base de datos...');
    
    // Verificar tabla agrupaciones
    const { data: agrupaciones, error: errorAgrupaciones } = await supabase
      .from('agrupaciones')
      .select('id, nombre')
      .limit(1);
    
    if (errorAgrupaciones) {
      console.error('❌ Error en tabla agrupaciones:', errorAgrupaciones);
      return false;
    }

    // Verificar tabla prestaciones
    const { data: prestaciones, error: errorPrestaciones } = await supabase
      .from('prestaciones')
      .select('id, codigo, practica')
      .limit(1);
    
    if (errorPrestaciones) {
      console.error('❌ Error en tabla prestaciones:', errorPrestaciones);
      return false;
    }

    console.log('✅ Tablas verificadas correctamente');
    console.log(`📊 Agrupaciones encontradas: ${agrupaciones?.length || 0}`);
    console.log(`📋 Prestaciones encontradas: ${prestaciones?.length || 0}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error en verificación de BD:', error);
    return false;
  }
};

// ============================================
// TIPOS TYPESCRIPT ACTUALIZADOS
// ============================================

export interface Agrupacion {
  id: string;
  nombre: string;
  descripcion?: string;
  color: string;
  orden: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prestacion {
  id: string;
  codigo: string;
  practica: string;
  agrupacion_id?: string;
  precio: number;
  activa: boolean;
  observaciones?: string;
  created_at: string;
  updated_at: string;
  
  // Datos relacionados de la vista
  agrupacion_nombre?: string;
  agrupacion_color?: string;
}

export interface PrestacionConAgrupacion extends Prestacion {
  agrupacion?: Agrupacion;
}

// ============================================
// CONFIGURACIÓN DE VARIABLES DE ENTORNO
// ============================================

export const ENV_CONFIG = {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnonKey,
  APP_TITLE: 'Sistema de Costos - Instituto Dr. Mercado',
  APP_VERSION: '1.0.0',
  DEV_MODE: true,
  ENABLE_LOGGER: true,
} as const;

// Verificar configuración al importar
if (typeof window !== 'undefined') {
  console.log('🔧 Configuración Supabase cargada:', {
    url: ENV_CONFIG.SUPABASE_URL,
    hasKey: !!ENV_CONFIG.SUPABASE_ANON_KEY,
    version: ENV_CONFIG.APP_VERSION,
  });
}

export default supabase;