// ============================================
// AUTH CONTEXT - Autenticación y Permisos
// Sistema de Gestión Integral - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/shared/context/AuthContext.tsx
// ============================================
//
// Login vía SUPABASE AUTH (signInWithPassword). La sesión (JWT) la maneja
// Supabase; el perfil de la app (rol + permisos) se carga desde
// usuarios_sistema vinculando por auth_user_id = auth.uid().
//
// El gating por módulo (tienePermiso) sigue igual para la UI, pero ahora
// el acceso real a las tablas lo enforcea RLS server-side (ver migración 07b
// + función app_tiene_permiso). Ya no hay contraseñas en texto plano ni
// sesión custom en localStorage.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  UsuarioPublico,
  LoginCredentials,
  ModuloSistema,
  PERMISOS_DEFAULT,
  PERMISOS_ADMIN,
  STORAGE_KEYS,
} from '../types/auth.types';
import { AuthContext, type AuthContextType } from './auth-context';

// ============================================
// INTERFACES
// ============================================

/** El rol tal como lo trae el embed `roles:rol_id (id, nombre, es_admin)`. */
type RolEmbebido = { id: number; nombre: string; es_admin: boolean | null };

// El tipo del contexto, el objeto y el hook `useAuth` viven en
// `auth-context.ts`. Este archivo se queda sólo con el Provider: ver el
// encabezado de ese archivo para el porqué.

// ============================================
// HELPERS
// ============================================

/** Traduce un error de Supabase Auth a un mensaje claro en español. */
function mapAuthError(error: { message?: string } | null): string {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Usuario o contraseña incorrectos';
  if (m.includes('email not confirmed')) return 'El usuario todavía no está confirmado';
  if (m.includes('too many requests') || m.includes('rate limit')) return 'Demasiados intentos, esperá un momento';
  if (m.includes('network') || m.includes('fetch')) return 'Error de conexión';
  return error?.message || 'No se pudo iniciar sesión';
}

// ============================================
// PROVIDER
// ============================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioPublico | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // ============================================
  // CARGAR PERMISOS DEL ROL
  // ============================================

  const cargarPermisosUsuario = useCallback(
    async (rolId: string): Promise<Record<ModuloSistema, boolean>> => {
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
        (data || []).forEach((permiso) => {
          const modulo = permiso.modulo as ModuloSistema;
          if (modulo in permisos) {
            permisos[modulo] = permiso.puede_ver;
          }
        });
        return permisos;
      } catch (err) {
        console.error('Error en cargarPermisosUsuario:', err);
        return { ...PERMISOS_DEFAULT };
      }
    },
    []
  );

  // ============================================
  // CONSTRUIR EL USUARIO PÚBLICO DESDE EL auth.uid()
  // ============================================
  // Carga la fila de usuarios_sistema vinculada al usuario autenticado
  // (por auth_user_id), su rol y permisos. Devuelve un error tipado si no
  // hay perfil activo (p.ej. usuario de Auth sin fila o dado de baja).

  const construirUsuarioPublico = useCallback(
    async (authUid: string): Promise<{ usuario?: UsuarioPublico; error?: string }> => {
      const { data: filas, error } = await supabase
        .from('usuarios_sistema')
        .select(`
          id,
          username,
          nombre_completo,
          telefono,
          email,
          rol_id,
          activo,
          ultimo_acceso,
          roles:rol_id (
            id,
            nombre,
            es_admin
          )
        `)
        .eq('auth_user_id', authUid)
        .eq('activo', true)
        .limit(1);

      if (error) {
        console.error('Error cargando perfil:', error);
        return { error: 'Error cargando el perfil del usuario' };
      }
      if (!filas || filas.length === 0) {
        return { error: 'Tu usuario no tiene un perfil activo en el sistema' };
      }

      const u = filas[0];
      // El embed `roles:rol_id (...)` del select de arriba. PostgREST lo
      // devuelve como objeto en una relación a-uno, pero según cómo infiera el
      // cliente puede llegar envuelto en un array: si se lee mal, `es_admin`
      // queda `undefined`, el admin pierde sus permisos y nadie ve un error.
      const rolData = (Array.isArray(u.roles) ? u.roles[0] : u.roles) as RolEmbebido | null;
      const esAdmin = rolData?.es_admin || false;

      const permisos: Record<ModuloSistema, boolean> = esAdmin
        ? { ...PERMISOS_ADMIN }
        : u.rol_id
          ? await cargarPermisosUsuario(u.rol_id)
          : { ...PERMISOS_DEFAULT };

      const usuarioPublico: UsuarioPublico = {
        id: u.id,
        username: u.username,
        nombre_completo: u.nombre_completo,
        telefono: u.telefono,
        email: u.email,
        rol_id: u.rol_id,
        rol_nombre: rolData?.nombre || null,
        es_admin: esAdmin,
        permisos,
        activo: u.activo,
        ultimo_acceso: u.ultimo_acceso,
      };
      return { usuario: usuarioPublico };
    },
    [cargarPermisosUsuario]
  );

  // ============================================
  // LOGIN (Supabase Auth)
  // ============================================

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email.toLowerCase().trim(),
          password: credentials.password,
        });

        if (error || !data.user) {
          return { success: false, error: mapAuthError(error) };
        }

        // Cargar el perfil de la app vinculado a este usuario de Auth
        const { usuario: perfil, error: perfilError } = await construirUsuarioPublico(data.user.id);
        if (!perfil) {
          // Hay credenciales válidas pero no hay perfil activo: cerrar la sesión.
          await supabase.auth.signOut();
          return { success: false, error: perfilError || 'No se pudo cargar el perfil' };
        }

        setUsuario(perfil);

        // Actualizar último acceso (best-effort, no bloquea el login)
        supabase
          .from('usuarios_sistema')
          .update({ ultimo_acceso: new Date().toISOString() })
          .eq('id', perfil.id)
          .then(() => {}, () => {});

        return { success: true };
      } catch (err) {
        console.error('Error en login:', err);
        return { success: false, error: 'Error inesperado al iniciar sesión' };
      } finally {
        setIsLoading(false);
      }
    },
    [construirUsuarioPublico]
  );

  // ============================================
  // LOGOUT
  // ============================================

  const logout = useCallback(async () => {
    // 1. Limpiar el estado local PRIMERO y de forma síncrona: la UI reacciona
    //    (isAuthenticated=false) aunque la red falle o cuelgue.
    setUsuario(null);

    // 2. Borrar a mano el token de Supabase del storage. Es la GARANTÍA de que
    //    la sesión NO se restaure al refrescar aunque signOut() cuelgue (bug
    //    conocido del lock interno de supabase-js con scope global).
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      console.error('Error limpiando el token de sesión:', err);
    }

    // 3. Limpieza de claves legacy de la sesión custom anterior.
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.USUARIOS_CACHE);
    localStorage.removeItem(STORAGE_KEYS.ROLES_CACHE);

    // 4. Best-effort: cerrar en Supabase con scope 'local' (sin round-trip de
    //    red que pueda colgar). Si falla, ya limpiamos todo arriba.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('Error en signOut:', err);
    }
  }, []);

  // ============================================
  // VERIFICAR PERMISOS
  // ============================================

  const tienePermiso = useCallback(
    (modulo: ModuloSistema): boolean => {
      if (!usuario) return false;
      if (usuario.es_admin) return true;
      return usuario.permisos[modulo] === true;
    },
    [usuario]
  );

  const puedeAcceder = useCallback(
    (modulo: ModuloSistema): boolean => tienePermiso(modulo),
    [tienePermiso]
  );

  const esAdmin = useCallback((): boolean => usuario?.es_admin === true, [usuario]);

  // ============================================
  // REFRESCAR PERMISOS
  // ============================================

  const refreshPermisos = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { usuario: perfil } = await construirUsuarioPublico(data.session.user.id);
    if (perfil) setUsuario(perfil);
  }, [construirUsuarioPublico]);

  // ============================================
  // RESTAURAR SESIÓN + ESCUCHAR CAMBIOS DE AUTH
  // ============================================

  useEffect(() => {
    let activo = true;

    // 1. Al montar: si hay sesión de Supabase, reconstruir el perfil.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (activo && data.session) {
          const { usuario: perfil } = await construirUsuarioPublico(data.session.user.id);
          if (activo && perfil) setUsuario(perfil);
        }
      } catch (err) {
        console.error('Error restaurando sesión:', err);
      } finally {
        if (activo) setIsLoading(false);
      }
    })();

    // 2. Escuchar cierres de sesión (otra pestaña, expiración sin refresh).
    //    El login positivo lo maneja login(); acá solo limpiamos en SIGNED_OUT
    //    para evitar carreras. setTimeout(0) evita el deadlock conocido de
    //    llamar a Supabase dentro del callback de onAuthStateChange.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setTimeout(() => {
          if (activo) setUsuario(null);
        }, 0);
      }
    });

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [construirUsuarioPublico]);

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
