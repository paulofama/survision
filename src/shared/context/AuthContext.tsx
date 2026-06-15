// ============================================
// AUTH CONTEXT - Autenticación y Permisos
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/context/AuthContext.tsx
// ============================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  UsuarioPublico,
  LoginCredentials,
  ModuloSistema,
  PERMISOS_DEFAULT,
  PERMISOS_ADMIN,
  STORAGE_KEYS,
  SESSION_DURATION_MS,
} from '../types/auth.types';

// ============================================
// INTERFACES
// ============================================

interface AuthContextType {
  usuario: UsuarioPublico | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnline: boolean;
  error?: string | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  tienePermiso: (modulo: ModuloSistema) => boolean;
  puedeAcceder: (modulo: ModuloSistema) => boolean;
  esAdmin: () => boolean;
  refreshPermisos: () => Promise<void>;
}

interface StoredSession {
  usuario: UsuarioPublico;
  timestamp: number;
}

// ============================================
// CONTEXTO
// ============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // ============================================
  // CARGAR PERMISOS DEL USUARIO
  // ============================================
  
  const cargarPermisosUsuario = async (rolId: string): Promise<Record<ModuloSistema, boolean>> => {
    try {
      const { data, error } = await supabase
        .from('permisos_rol')
        .select('modulo, puede_ver')
        .eq('rol_id', rolId);

      if (error) {
        console.error('Error cargando permisos:', error);
        return { ...PERMISOS_DEFAULT };
      }

      const permisos = { ...PERMISOS_DEFAULT };
      
      if (data) {
        data.forEach((permiso) => {
          const modulo = permiso.modulo as ModuloSistema;
          if (modulo in permisos) {
            permisos[modulo] = permiso.puede_ver;
          }
        });
      }

      return permisos;
    } catch (err) {
      console.error('Error en cargarPermisosUsuario:', err);
      return { ...PERMISOS_DEFAULT };
    }
  };

  // ============================================
  // LOGIN
  // ============================================

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);

      // Buscar usuario con rol
      const { data: usuarios, error } = await supabase
        .from('usuarios_sistema')
        .select(`
          id,
          username,
          nombre_completo,
          password_hash,
          telefono,
          email,
          rol_id,
          activo,
          ultimo_acceso,
          created_at,
          updated_at,
          roles:rol_id (
            id,
            nombre,
            es_admin
          )
        `)
        .eq('username', credentials.username.toLowerCase().trim())
        .eq('activo', true)
        .limit(1);

      if (error) {
        console.error('Error en login:', error);
        return { success: false, error: 'Error de conexión' };
      }

      if (!usuarios || usuarios.length === 0) {
        return { success: false, error: 'Usuario no encontrado' };
      }

      const usuarioData = usuarios[0];

      // Verificar contraseña (simple para desarrollo)
      if (usuarioData.password_hash !== credentials.password) {
        return { success: false, error: 'Contraseña incorrecta' };
      }

      // Cargar permisos
      const rolData = usuarioData.roles as any;
      const esAdmin = rolData?.es_admin || false;
      
      let permisos: Record<ModuloSistema, boolean>;
      
      if (esAdmin) {
        permisos = { ...PERMISOS_ADMIN };
      } else if (usuarioData.rol_id) {
        permisos = await cargarPermisosUsuario(usuarioData.rol_id);
      } else {
        permisos = { ...PERMISOS_DEFAULT };
      }

      // Crear usuario público
      const usuarioPublico: UsuarioPublico = {
        id: usuarioData.id,
        username: usuarioData.username,
        nombre_completo: usuarioData.nombre_completo,
        telefono: usuarioData.telefono,
        email: usuarioData.email,
        rol_id: usuarioData.rol_id,
        rol_nombre: rolData?.nombre || null,
        es_admin: esAdmin,
        permisos,
        activo: usuarioData.activo,
        ultimo_acceso: usuarioData.ultimo_acceso,
      };

      // Guardar en estado y localStorage
      setUsuario(usuarioPublico);
      
      const session: StoredSession = {
        usuario: usuarioPublico,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));

      // Actualizar último acceso
      await supabase
        .from('usuarios_sistema')
        .update({ ultimo_acceso: new Date().toISOString() })
        .eq('id', usuarioData.id);

      return { success: true };
    } catch (err) {
      console.error('Error en login:', err);
      return { success: false, error: 'Error inesperado' };
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // LOGOUT
  // ============================================

  const logout = useCallback(() => {
    setUsuario(null);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.USUARIOS_CACHE);
    localStorage.removeItem(STORAGE_KEYS.ROLES_CACHE);
  }, []);

  // ============================================
  // VERIFICAR PERMISOS
  // ============================================

  const tienePermiso = useCallback((modulo: ModuloSistema): boolean => {
    if (!usuario) return false;
    if (usuario.es_admin) return true;
    return usuario.permisos[modulo] === true;
  }, [usuario]);

  const puedeAcceder = useCallback((modulo: ModuloSistema): boolean => {
    return tienePermiso(modulo);
  }, [tienePermiso]);

  const esAdmin = useCallback((): boolean => {
    return usuario?.es_admin === true;
  }, [usuario]);

  // ============================================
  // REFRESCAR PERMISOS
  // ============================================

  const refreshPermisos = useCallback(async () => {
    if (!usuario || !usuario.rol_id) return;

    try {
      const permisos = usuario.es_admin 
        ? { ...PERMISOS_ADMIN }
        : await cargarPermisosUsuario(usuario.rol_id);

      const usuarioActualizado = { ...usuario, permisos };
      setUsuario(usuarioActualizado);

      const session: StoredSession = {
        usuario: usuarioActualizado,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    } catch (err) {
      console.error('Error refrescando permisos:', err);
    }
  }, [usuario]);

  // ============================================
  // RESTAURAR SESIÓN
  // ============================================

  useEffect(() => {
    const restaurarSesion = async () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.SESSION);
        
        if (stored) {
          const session: StoredSession = JSON.parse(stored);
          
          // Verificar expiración
          if (Date.now() - session.timestamp < SESSION_DURATION_MS) {
            setUsuario(session.usuario);
            
            // Refrescar permisos en background si hay conexión
            if (navigator.onLine && session.usuario.rol_id) {
              const permisos = session.usuario.es_admin
                ? { ...PERMISOS_ADMIN }
                : await cargarPermisosUsuario(session.usuario.rol_id);
              
              const usuarioActualizado = { ...session.usuario, permisos };
              setUsuario(usuarioActualizado);
              
              const newSession: StoredSession = {
                usuario: usuarioActualizado,
                timestamp: Date.now(),
              };
              localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(newSession));
            }
          } else {
            // Sesión expirada
            logout();
          }
        }
      } catch (err) {
        console.error('Error restaurando sesión:', err);
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    restaurarSesion();
  }, [logout]);

  // ============================================
  // DETECTAR CONEXIÓN
  // ============================================

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ============================================
  // VALOR DEL CONTEXTO
  // ============================================

  const value: AuthContextType = {
    usuario,
    isAuthenticated: !!usuario,
    isLoading,
    isOnline,
    login,
    logout,
    tienePermiso,
    puedeAcceder,
    esAdmin,
    refreshPermisos,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================
// HOOK
// ============================================

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};

export default AuthContext;
