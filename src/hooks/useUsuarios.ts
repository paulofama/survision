// ============================================
// HOOK: useUsuarios
// Sistema de Costos - Instituto Dr. Mercado
// CRUD de usuarios con soporte offline
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  UsuarioSistema,
  UsuarioPublico,
  NuevoUsuario,
  ActualizarUsuario,
  RolUsuario,
  USUARIOS_CACHE_KEY,
  usuarioAPublico,
} from '../types/auth.types';

// ============================================
// INTERFACES
// ============================================

interface UseUsuariosReturn {
  // Datos
  usuarios: UsuarioPublico[];
  usuariosFiltrados: UsuarioPublico[];
  
  // Estados
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  isOnline: boolean;
  
  // Filtros
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filtroRol: RolUsuario | '';
  setFiltroRol: (rol: RolUsuario | '') => void;
  filtroActivo: boolean | null;
  setFiltroActivo: (activo: boolean | null) => void;
  
  // Operaciones CRUD
  crearUsuario: (data: NuevoUsuario) => Promise<boolean>;
  actualizarUsuario: (id: string, data: ActualizarUsuario) => Promise<boolean>;
  eliminarUsuario: (id: string) => Promise<boolean>;
  cambiarPassword: (id: string, newPassword: string) => Promise<boolean>;
  toggleActivo: (id: string) => Promise<boolean>;
  
  // Utilidades
  refetch: () => Promise<void>;
  limpiarMensajes: () => void;
  getUsuarioById: (id: string) => UsuarioPublico | undefined;
  
  // Estadísticas
  estadisticas: {
    total: number;
    activos: number;
    inactivos: number;
    porRol: Record<RolUsuario, number>;
  };
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useUsuarios = (): UseUsuariosReturn => {
  // Estados principales
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroRol, setFiltroRol] = useState<RolUsuario | ''>('');
  const [filtroActivo, setFiltroActivo] = useState<boolean | null>(null);

  // ============================================
  // HELPERS: Cache Local
  // ============================================

  const guardarCache = (data: UsuarioSistema[]): void => {
    try {
      localStorage.setItem(USUARIOS_CACHE_KEY, JSON.stringify({
        usuarios: data,
        ultimaSync: new Date().toISOString(),
        version: 1,
      }));
    } catch (e) {
      console.warn('Error guardando cache de usuarios:', e);
    }
  };

  const obtenerCache = (): UsuarioSistema[] => {
    try {
      const data = localStorage.getItem(USUARIOS_CACHE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return parsed.usuarios || [];
    } catch {
      return [];
    }
  };

  // ============================================
  // FUNCIÓN: Cargar usuarios
  // ============================================

  const cargarUsuarios = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      if (navigator.onLine) {
        // Online: cargar desde Supabase
        const { data, error: supabaseError } = await supabase
          .from('usuarios_sistema')
          .select('*')
          .order('nombre_completo');

        if (supabaseError) throw supabaseError;

        if (data) {
          setUsuarios(data);
          guardarCache(data);
        }
      } else {
        // Offline: cargar desde cache
        const cached = obtenerCache();
        setUsuarios(cached);
        
        if (cached.length === 0) {
          setError('Sin conexión y sin datos en cache');
        }
      }
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      
      // Intentar usar cache como fallback
      const cached = obtenerCache();
      if (cached.length > 0) {
        setUsuarios(cached);
        setError('Usando datos en cache (sin conexión)');
      } else {
        setError(err instanceof Error ? err.message : 'Error cargando usuarios');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // FUNCIÓN: Crear usuario
  // ============================================

  const crearUsuario = async (data: NuevoUsuario): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!navigator.onLine) {
        throw new Error('Se requiere conexión a internet para crear usuarios');
      }

      // Verificar si el username ya existe
      const { data: existente } = await supabase
        .from('usuarios_sistema')
        .select('id')
        .eq('username', data.username.toLowerCase())
        .single();

      if (existente) {
        throw new Error('El nombre de usuario ya existe');
      }

      // Crear usuario
      const { error: insertError } = await supabase
        .from('usuarios_sistema')
        .insert([{
          username: data.username.toLowerCase(),
          nombre_completo: data.nombre_completo,
          password_hash: data.password, // En producción, hashear
          telefono: data.telefono || null,
          email: data.email || null,
          rol: data.rol,
          activo: true,
        }]);

      if (insertError) throw insertError;

      setSuccessMessage(`Usuario "${data.nombre_completo}" creado exitosamente`);
      await cargarUsuarios();
      
      setTimeout(() => setSuccessMessage(null), 3000);
      return true;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error creando usuario';
      setError(mensaje);
      setTimeout(() => setError(null), 5000);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FUNCIÓN: Actualizar usuario
  // ============================================

  const actualizarUsuario = async (id: string, data: ActualizarUsuario): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!navigator.onLine) {
        throw new Error('Se requiere conexión a internet para actualizar usuarios');
      }

      const { error: updateError } = await supabase
        .from('usuarios_sistema')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      setSuccessMessage('Usuario actualizado exitosamente');
      await cargarUsuarios();
      
      setTimeout(() => setSuccessMessage(null), 3000);
      return true;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error actualizando usuario';
      setError(mensaje);
      setTimeout(() => setError(null), 5000);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FUNCIÓN: Eliminar usuario (soft delete)
  // ============================================

  const eliminarUsuario = async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!navigator.onLine) {
        throw new Error('Se requiere conexión a internet para eliminar usuarios');
      }

      // Soft delete: marcar como inactivo
      const { error: deleteError } = await supabase
        .from('usuarios_sistema')
        .update({ 
          activo: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (deleteError) throw deleteError;

      setSuccessMessage('Usuario desactivado exitosamente');
      await cargarUsuarios();
      
      setTimeout(() => setSuccessMessage(null), 3000);
      return true;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error eliminando usuario';
      setError(mensaje);
      setTimeout(() => setError(null), 5000);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FUNCIÓN: Cambiar contraseña
  // ============================================

  const cambiarPassword = async (id: string, newPassword: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!navigator.onLine) {
        throw new Error('Se requiere conexión a internet para cambiar contraseñas');
      }

      if (newPassword.length < 4) {
        throw new Error('La contraseña debe tener al menos 4 caracteres');
      }

      const { error: updateError } = await supabase
        .from('usuarios_sistema')
        .update({ 
          password_hash: newPassword, // En producción, hashear
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      setSuccessMessage('Contraseña actualizada exitosamente');
      await cargarUsuarios();
      
      setTimeout(() => setSuccessMessage(null), 3000);
      return true;
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error cambiando contraseña';
      setError(mensaje);
      setTimeout(() => setError(null), 5000);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FUNCIÓN: Toggle activo/inactivo
  // ============================================

  const toggleActivo = async (id: string): Promise<boolean> => {
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return false;

    return actualizarUsuario(id, { activo: !usuario.activo });
  };

  // ============================================
  // FILTRADO DE USUARIOS
  // ============================================

  const usuariosFiltrados = useMemo((): UsuarioPublico[] => {
    return usuarios
      .filter(u => {
        // Filtro por búsqueda
        const matchSearch = searchTerm === '' || 
          u.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

        // Filtro por rol
        const matchRol = filtroRol === '' || u.rol === filtroRol;

        // Filtro por activo
        const matchActivo = filtroActivo === null || u.activo === filtroActivo;

        return matchSearch && matchRol && matchActivo;
      })
      .map(usuarioAPublico);
  }, [usuarios, searchTerm, filtroRol, filtroActivo]);

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const estadisticas = useMemo(() => {
    const total = usuarios.length;
    const activos = usuarios.filter(u => u.activo).length;
    const inactivos = total - activos;
    
    const porRol: Record<RolUsuario, number> = {
      admin: usuarios.filter(u => u.rol === 'admin').length,
      usuario: usuarios.filter(u => u.rol === 'usuario').length,
      lectura: usuarios.filter(u => u.rol === 'lectura').length,
    };

    return { total, activos, inactivos, porRol };
  }, [usuarios]);

  // ============================================
  // UTILIDADES
  // ============================================

  const limpiarMensajes = (): void => {
    setError(null);
    setSuccessMessage(null);
  };

  const getUsuarioById = (id: string): UsuarioPublico | undefined => {
    const usuario = usuarios.find(u => u.id === id);
    return usuario ? usuarioAPublico(usuario) : undefined;
  };

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar usuarios al montar
  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  // Escuchar cambios de conectividad
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      cargarUsuarios(); // Recargar cuando volvemos online
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cargarUsuarios]);

  // ============================================
  // RETORNO
  // ============================================

  return {
    // Datos
    usuarios: usuarios.map(usuarioAPublico),
    usuariosFiltrados,
    
    // Estados
    loading,
    error,
    successMessage,
    isOnline,
    
    // Filtros
    searchTerm,
    setSearchTerm,
    filtroRol,
    setFiltroRol,
    filtroActivo,
    setFiltroActivo,
    
    // Operaciones CRUD
    crearUsuario,
    actualizarUsuario,
    eliminarUsuario,
    cambiarPassword,
    toggleActivo,
    
    // Utilidades
    refetch: cargarUsuarios,
    limpiarMensajes,
    getUsuarioById,
    
    // Estadísticas
    estadisticas,
  };
};

export default useUsuarios;
