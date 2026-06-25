// ============================================
// TIPOS DE AUTENTICACIÓN Y PERMISOS
// Sistema Integral de Gestión - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/types/auth.types.ts
// ============================================

// ============================================
// MÓDULOS DEL SISTEMA (Agrupados)
// ============================================

export const MODULOS_SISTEMA = {
  dashboard: { nombre: 'Dashboard', descripcion: 'Panel principal' },
  prestaciones: { nombre: 'Prestaciones', descripcion: 'Gestión y prestaciones realizadas' },
  insumos: { nombre: 'Insumos y Costos', descripcion: 'Insumos, pools y recetas' },
  analisis: { nombre: 'Análisis', descripcion: 'Por OS, prestador, evolución' },
  analisis_marginal: { nombre: 'Análisis Marginal', descripcion: 'Rentabilidad y márgenes' },
  tesoreria: { nombre: 'Tesorería', descripcion: 'Caja, bancos y movimientos financieros' },
  liquidaciones: { nombre: 'Liquidaciones', descripcion: 'Derivaciones y honorarios' },
  presupuestador: { nombre: 'Presupuestador', descripcion: 'Generación y búsqueda de presupuestos' },
  informes: { nombre: 'Informes', descripcion: 'Informes de gestión mensual' },
  seguimiento_pacientes: { nombre: 'Seguimiento Pacientes', descripcion: 'Seguimiento clínico de pacientes' },
  usuarios: { nombre: 'Usuarios', descripcion: 'Gestión de usuarios del sistema' },
  roles: { nombre: 'Roles y Permisos', descripcion: 'Configuración de roles' },
  // Acceso a TODO el módulo Sueldos (restringido: se asigna solo al rol del Auditor).
  sueldos: { nombre: 'Sueldos', descripcion: 'Acceso al módulo de carga de sueldos' },
  // Permiso granular del módulo Sueldos: sólo Auditor (Paulo) lo tiene.
  // Gatea la sección Reportes (Fase 5) y los reportes mensuales en PDF.
  'sueldos:reportes': { nombre: 'Sueldos - Reportes', descripcion: 'Reportes auditoría de sueldos (sólo Auditor)' },
  // Sección Herramientas (recetario médico, etc.).
  herramientas: { nombre: 'Herramientas', descripcion: 'Herramientas varias (recetario médico, etc.)' },
} as const;

export type ModuloSistema = keyof typeof MODULOS_SISTEMA;

// ============================================
// ROLES
// ============================================

export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  es_admin: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermisoRol {
  id: string;
  rol_id: string;
  modulo: ModuloSistema;
  puede_ver: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolConPermisos extends Rol {
  permisos: Record<ModuloSistema, boolean>;
}

// ============================================
// USUARIOS
// ============================================

export interface UsuarioSistema {
  id: string;
  username: string;
  nombre_completo: string;
  password_hash: string;
  telefono: string | null;
  email: string | null;
  rol_id: string | null;
  activo: boolean;
  ultimo_acceso: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsuarioConRol extends Omit<UsuarioSistema, 'password_hash'> {
  rol: Rol | null;
  permisos: Record<ModuloSistema, boolean>;
}

// Usuario público (sin datos sensibles)
export interface UsuarioPublico {
  id: string;
  username: string;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
  rol_id: string | null;
  rol_nombre: string | null;
  es_admin: boolean;
  permisos: Record<ModuloSistema, boolean>;
  activo: boolean;
  ultimo_acceso: string | null;
}

// ============================================
// ESTADO DE AUTENTICACIÓN
// ============================================

export interface AuthState {
  usuario: UsuarioPublico | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOnline: boolean;
}

// ============================================
// FORMULARIOS
// ============================================

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface NuevoUsuarioForm {
  username: string;
  nombre_completo: string;
  password: string;
  telefono?: string;
  email?: string;
  rol_id: string;
}

export interface EditarUsuarioForm {
  nombre_completo: string;
  telefono?: string;
  email?: string;
  rol_id: string;
}

export interface NuevoRolForm {
  nombre: string;
  descripcion?: string;
  permisos: Record<ModuloSistema, boolean>;
}

export interface EditarRolForm {
  nombre: string;
  descripcion?: string;
  permisos: Record<ModuloSistema, boolean>;
}

// ============================================
// CONSTANTES
// ============================================

export const STORAGE_KEYS = {
  SESSION: 'sistema-costos-session',
  USUARIOS_CACHE: 'sistema-costos-usuarios-cache',
  ROLES_CACHE: 'sistema-costos-roles-cache',
} as const;

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

// Permisos por defecto para un usuario nuevo (dashboard siempre true, resto en false)
export const PERMISOS_DEFAULT: Record<ModuloSistema, boolean> = {
  dashboard: true,
  prestaciones: false,
  insumos: false,
  analisis: false,
  analisis_marginal: false,
  tesoreria: false,
  liquidaciones: false,
  presupuestador: false,
  informes: false,
  seguimiento_pacientes: false,
  usuarios: false,
  roles: false,
  sueldos: false,
  'sueldos:reportes': false,
  herramientas: false,
};

// Permisos para admin (todos en true)
export const PERMISOS_ADMIN: Record<ModuloSistema, boolean> = {
  dashboard: true,
  prestaciones: true,
  insumos: true,
  analisis: true,
  analisis_marginal: true,
  tesoreria: true,
  liquidaciones: true,
  presupuestador: true,
  informes: true,
  seguimiento_pacientes: true,
  usuarios: true,
  roles: true,
  sueldos: true,
  'sueldos:reportes': true,
  herramientas: true,
};
