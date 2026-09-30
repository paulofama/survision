// ============================================
// Contexto de autenticación — objeto, tipo y hook
// Sistema de Gestión Integral · Survisión S.A.
// ============================================
//
// POR QUÉ ESTO NO VIVE EN AuthContext.tsx
// ----------------------------------------
// Un archivo .tsx que exporta un componente Y otra cosa rompe el Fast Refresh
// de Vite: al guardar, en vez de recargar sólo el componente, recarga el módulo
// entero y se pierde el estado de la pantalla. Como `AuthProvider` envuelve
// toda la app, eso significaba desloguearse en cada guardado.
//
// Así que el archivo .tsx se queda SÓLO con el Provider, y todo lo que no es
// un componente —el tipo, el objeto de contexto y el hook— vive acá.
//
// El nombre es `auth-context.ts` y no `authContext.ts` a propósito: en Windows
// el sistema de archivos no distingue mayúsculas, y `authContext.ts` chocaría
// con `AuthContext.tsx` de maneras que git no muestra bien.
// ============================================

import { createContext, useContext } from 'react';
import type { UsuarioPublico, LoginCredentials, ModuloSistema } from '../types/auth.types';

export interface AuthContextType {
  usuario: UsuarioPublico | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnline: boolean;
  error?: string | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  tienePermiso: (modulo: ModuloSistema) => boolean;
  puedeAcceder: (modulo: ModuloSistema) => boolean;
  esAdmin: () => boolean;
  refreshPermisos: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};
