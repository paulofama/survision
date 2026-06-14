// ============================================
// USE ROLES - Hook para gestión de roles
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/hooks/useRoles.ts
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Rol,
  RolConPermisos,
  NuevoRolForm,
  EditarRolForm,
  ModuloSistema,
  PERMISOS_DEFAULT,
  PERMISOS_ADMIN,
  STORAGE_KEYS,
} from '../types/auth.types';

// ============================================
// INTERFACES
// ============================================

interface UseRolesReturn {
  roles: RolConPermisos[];
  loading: boolean;
  error: string | null;
  crearRol: (data: NuevoRolForm) => Promise<void>;
  actualizarRol: (id: string, data: EditarRolForm) => Promise<void>;
  eliminarRol: (id: string) => Promise<void>;
  toggleActivo: (id: string, activo: boolean) => Promise<void>;
  refetch: () => Promise<void>;
  estadisticas: {
    total: number;
    activos: number;
    inactivos: number;
  };
}

const MODULOS: ModuloSistema[] = [
  'dashboard', 'prestaciones', 'insumos', 'analisis', 'analisis_marginal',
  'tesoreria', 'liquidaciones', 'presupuestador',
  'informes', 'seguimiento_pacientes', 'usuarios', 'roles',
  // Permiso granular del módulo Sueldos (sólo Auditor lo activa)
  'sueldos:reportes',
];

// ============================================
// HOOK
// ============================================

export const useRoles = (): UseRolesReturn => {
  const [roles, setRoles] = useState<RolConPermisos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARGAR ROLES
  // ============================================

  const cargarRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('nombre');

      if (rolesError) throw rolesError;

      // Cargar permisos
      const { data: permisosData, error: permisosError } = await supabase
        .from('permisos_rol')
        .select('*');

      if (permisosError) throw permisosError;

      // Combinar roles con permisos
      const rolesConPermisos: RolConPermisos[] = (rolesData || []).map((rol) => {
        const permisosRol = (permisosData || []).filter((p) => p.rol_id === rol.id);
        
        const permisos = rol.es_admin 
          ? { ...PERMISOS_ADMIN }
          : { ...PERMISOS_DEFAULT };

        if (!rol.es_admin) {
          permisosRol.forEach((p) => {
            const modulo = p.modulo as ModuloSistema;
            if (modulo in permisos) {
              permisos[modulo] = p.puede_ver;
            }
          });
        }

        return { ...rol, permisos };
      });

      setRoles(rolesConPermisos);
      // Invalidar cache de roles para que el sidebar se refresque en próximo login
      localStorage.removeItem(STORAGE_KEYS.ROLES_CACHE);
    } catch (err: any) {
      console.error('Error cargando roles:', err);
      setError(err.message || 'Error al cargar roles');
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // CREAR ROL
  // ============================================

  const crearRol = async (data: NuevoRolForm): Promise<void> => {
    try {
      // Insertar rol
      const { data: nuevoRol, error: rolError } = await supabase
        .from('roles')
        .insert([
          {
            nombre: data.nombre.trim(),
            descripcion: data.descripcion?.trim() || null,
            es_admin: false,
            activo: true,
          },
        ])
        .select()
        .single();

      if (rolError) throw rolError;

      // Insertar permisos
      const permisosInsert = MODULOS.map((modulo) => ({
        rol_id: nuevoRol.id,
        modulo,
        puede_ver: data.permisos[modulo] || false,
      }));

      const { error: permisosError } = await supabase
        .from('permisos_rol')
        .insert(permisosInsert);

      if (permisosError) throw permisosError;

      // Recargar datos frescos
      await cargarRoles();
    } catch (err: any) {
      console.error('Error creando rol:', err);
      throw new Error(err.message || 'Error al crear rol');
    }
  };

  // ============================================
  // ACTUALIZAR ROL
  // ============================================

  const actualizarRol = async (id: string, data: EditarRolForm): Promise<void> => {
    try {
      // Verificar que no sea admin
      const rol = roles.find((r) => r.id === id);
      if (rol?.es_admin) {
        throw new Error('No se puede modificar el rol Administrador');
      }

      // Actualizar rol
      const { error: rolError } = await supabase
        .from('roles')
        .update({
          nombre: data.nombre.trim(),
          descripcion: data.descripcion?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (rolError) throw rolError;

      // Eliminar permisos anteriores
      const { error: deleteError } = await supabase
        .from('permisos_rol')
        .delete()
        .eq('rol_id', id);

      if (deleteError) throw deleteError;

      // Insertar nuevos permisos
      const permisosInsert = MODULOS.map((modulo) => ({
        rol_id: id,
        modulo,
        puede_ver: data.permisos[modulo] || false,
      }));

      const { error: permisosError } = await supabase
        .from('permisos_rol')
        .insert(permisosInsert);

      if (permisosError) throw permisosError;

      // Recargar datos frescos
      await cargarRoles();
    } catch (err: any) {
      console.error('Error actualizando rol:', err);
      throw new Error(err.message || 'Error al actualizar rol');
    }
  };

  // ============================================
  // ELIMINAR ROL
  // ============================================

  const eliminarRol = async (id: string): Promise<void> => {
    try {
      // Verificar que no sea admin
      const rol = roles.find((r) => r.id === id);
      if (rol?.es_admin) {
        throw new Error('No se puede eliminar el rol Administrador');
      }

      // Verificar que no tenga usuarios asignados
      const { data: usuarios, error: checkError } = await supabase
        .from('usuarios_sistema')
        .select('id')
        .eq('rol_id', id)
        .eq('activo', true)
        .limit(1);

      if (checkError) throw checkError;

      if (usuarios && usuarios.length > 0) {
        throw new Error('No se puede eliminar un rol con usuarios asignados');
      }

      // Eliminar permisos
      const { error: permisosError } = await supabase
        .from('permisos_rol')
        .delete()
        .eq('rol_id', id);

      if (permisosError) throw permisosError;

      // Eliminar rol
      const { error: rolError } = await supabase
        .from('roles')
        .delete()
        .eq('id', id);

      if (rolError) throw rolError;

      // Recargar datos frescos
      await cargarRoles();
    } catch (err: any) {
      console.error('Error eliminando rol:', err);
      throw new Error(err.message || 'Error al eliminar rol');
    }
  };

  // ============================================
  // TOGGLE ACTIVO
  // ============================================

  const toggleActivo = async (id: string, activo: boolean): Promise<void> => {
    try {
      const rol = roles.find((r) => r.id === id);
      if (rol?.es_admin) {
        throw new Error('No se puede desactivar el rol Administrador');
      }

      const { error } = await supabase
        .from('roles')
        .update({ activo, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Recargar datos frescos
      await cargarRoles();
    } catch (err: any) {
      console.error('Error cambiando estado:', err);
      throw new Error(err.message || 'Error al cambiar estado');
    }
  };

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const estadisticas = {
    total: roles.length,
    activos: roles.filter((r) => r.activo).length,
    inactivos: roles.filter((r) => !r.activo).length,
  };

  // ============================================
  // EFECTOS
  // ============================================

  useEffect(() => {
    cargarRoles();
  }, [cargarRoles]);

  // ============================================
  // RETURN
  // ============================================

  return {
    roles,
    loading,
    error,
    crearRol,
    actualizarRol,
    eliminarRol,
    toggleActivo,
    refetch: () => cargarRoles(),
    estadisticas,
  };
};

export default useRoles;
