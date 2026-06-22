// ============================================
// GESTIÓN DE ACCESOS - Usuarios y Roles
// Sistema Integral de Gestión - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/GestionAccesosPage.tsx
// ============================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  Plus,
  Search,
  Edit2,
  Trash2,
  Key,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Save,
  Check,
  ToggleLeft,
  ToggleRight,
  Home,
  DollarSign,
  Package,
  TrendingUp,
  BarChart3,
  FileText,
  Lock,
  Activity,
} from 'lucide-react';
import { supabase } from '@shared/lib/supabase';
import { useRoles } from '../hooks/useRoles';
import { ModuloSistema, PERMISOS_DEFAULT } from '@shared/types/auth.types';

// ============================================
// TIPOS
// ============================================

type TabActiva = 'usuarios' | 'roles';

interface Usuario {
  id: string;
  username: string;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
  rol_id: string | null;
  activo: boolean;
  ultimo_acceso: string | null;
  created_at: string;
}

interface UsuarioConRol extends Usuario {
  rol_nombre: string | null;
  es_admin: boolean;
}

// ============================================
// CONFIGURACIÓN DE MÓDULOS PARA UI
// ============================================

const MODULOS_CONFIG: Record<ModuloSistema, { nombre: string; descripcion: string; icono: React.ElementType; color: string }> = {
  dashboard: { 
    nombre: 'Dashboard', 
    descripcion: 'Panel principal con estadísticas',
    icono: Home,
    color: 'blue'
  },
  prestaciones: { 
    nombre: 'Prestaciones', 
    descripcion: 'Gestión y prestaciones realizadas',
    icono: DollarSign,
    color: 'green'
  },
  insumos: { 
    nombre: 'Insumos', 
    descripcion: 'Insumos, pools y recetas de costos',
    icono: Package,
    color: 'purple'
  },
  analisis: { 
    nombre: 'Análisis', 
    descripcion: 'Por OS, prestador, evolución',
    icono: TrendingUp,
    color: 'orange'
  },
  analisis_marginal: { 
    nombre: 'A. Marginal', 
    descripcion: 'Rentabilidad y márgenes',
    icono: BarChart3,
    color: 'pink'
  },
  tesoreria: {
    nombre: 'Tesorería',
    descripcion: 'Caja, bancos y movimientos',
    icono: DollarSign,
    color: 'yellow'
  },
  liquidaciones: {
    nombre: 'Liquidaciones',
    descripcion: 'Derivaciones y honorarios',
    icono: FileText,
    color: 'teal'
  },
  presupuestador: {
    nombre: 'Presupuestador',
    descripcion: 'Generación y búsqueda de presupuestos',
    icono: FileText,
    color: 'cyan'
  },
  informes: { 
    nombre: 'Informes', 
    descripcion: 'Informes de gestión mensual',
    icono: FileText,
    color: 'indigo'
  },
  seguimiento_pacientes: { 
    nombre: 'Seguim. Pac.', 
    descripcion: 'Seguimiento de pacientes clínicos',
    icono: Activity,
    color: 'teal'
  },
  usuarios: { 
    nombre: 'Usuarios', 
    descripcion: 'Gestión de usuarios del sistema',
    icono: Users,
    color: 'cyan'
  },
  roles: {
    nombre: 'Roles',
    descripcion: 'Configuración de roles',
    icono: Shield,
    color: 'red'
  },
  sueldos: {
    nombre: 'Sueldos',
    descripcion: 'Acceso al módulo de carga de sueldos',
    icono: DollarSign,
    color: 'green'
  },
  'sueldos:reportes': {
    nombre: 'Sueldos - Reportes',
    descripcion: 'Reportes auditoría de sueldos (sólo Auditor)',
    icono: BarChart3,
    color: 'amber'
  },
};

const MODULOS_ORDENADOS: ModuloSistema[] = [
  'dashboard',
  'prestaciones',
  'insumos',
  'analisis',
  'analisis_marginal',
  'tesoreria',
  'liquidaciones',
  'presupuestador',
  'informes',
  'seguimiento_pacientes',
  'usuarios',
  'roles',
  'sueldos',
  'sueldos:reportes',
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const GestionAccesosPage: React.FC = () => {
  const [tabActiva, setTabActiva] = useState<TabActiva>('usuarios');
  
  // Mensajes globales
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setTimeout(() => setErrorMessage(''), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Accesos</h1>
            <p className="text-gray-500">Administra usuarios y permisos del sistema</p>
          </div>
        </div>
      </div>

      {/* Mensajes globales */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setTabActiva('usuarios')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                tabActiva === 'usuarios'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="h-5 w-5" />
              Usuarios
            </button>
            <button
              onClick={() => setTabActiva('roles')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                tabActiva === 'roles'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Shield className="h-5 w-5" />
              Configuración de Roles
            </button>
          </nav>
        </div>

        {/* Contenido de Tab */}
        <div className="p-6">
          {tabActiva === 'usuarios' ? (
            <TabUsuarios showSuccess={showSuccess} showError={showError} />
          ) : (
            <TabRoles showSuccess={showSuccess} showError={showError} />
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// TAB USUARIOS
// ============================================

interface TabProps {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const TabUsuarios: React.FC<TabProps> = ({ showSuccess, showError }) => {
  const [usuarios, setUsuarios] = useState<UsuarioConRol[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRol, setFilterRol] = useState<string>('');
  const [filterActivo, setFilterActivo] = useState<string>('todos');

  // Estados de modales
  const [showModal, setShowModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioConRol | null>(null);
  const [deletingUser, setDeletingUser] = useState<UsuarioConRol | null>(null);

  // Estados de formulario
  const [formData, setFormData] = useState({
    username: '',
    nombre_completo: '',
    password: '',
    telefono: '',
    email: '',
    rol_id: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hook de roles
  const { roles, loading: loadingRoles } = useRoles();

  // ============================================
  // CARGAR USUARIOS
  // ============================================

  const cargarUsuarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
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
          created_at,
          roles:rol_id (
            nombre,
            es_admin
          )
        `)
        .order('nombre_completo');

      if (error) throw error;

      const usuariosConRol: UsuarioConRol[] = (data || []).map((u: any) => ({
        id: u.id,
        username: u.username,
        nombre_completo: u.nombre_completo,
        telefono: u.telefono,
        email: u.email,
        rol_id: u.rol_id,
        activo: u.activo,
        ultimo_acceso: u.ultimo_acceso,
        created_at: u.created_at,
        rol_nombre: u.roles?.nombre || null,
        es_admin: u.roles?.es_admin || false,
      }));

      setUsuarios(usuariosConRol);
    } catch (err) {
      console.error('Error cargando usuarios:', err);
      showError('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  // ============================================
  // FILTROS
  // ============================================

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      const matchSearch =
        u.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

      const matchRol = filterRol === '' || u.rol_id === filterRol;

      const matchActivo =
        filterActivo === 'todos' ||
        (filterActivo === 'activos' && u.activo) ||
        (filterActivo === 'inactivos' && !u.activo);

      return matchSearch && matchRol && matchActivo;
    });
  }, [usuarios, searchTerm, filterRol, filterActivo]);

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  const estadisticas = useMemo(() => ({
    total: usuarios.length,
    activos: usuarios.filter((u) => u.activo).length,
    inactivos: usuarios.filter((u) => !u.activo).length,
  }), [usuarios]);

  // ============================================
  // FUNCIONES AUXILIARES
  // ============================================

  const resetForm = () => {
    setFormData({
      username: '',
      nombre_completo: '',
      password: '',
      telefono: '',
      email: '',
      rol_id: '',
    });
    setShowPassword(false);
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleOpenCreate = () => {
    resetForm();
    setEditingUser(null);
    setShowModal(true);
  };

  const handleOpenEdit = (user: UsuarioConRol) => {
    setFormData({
      username: user.username,
      nombre_completo: user.nombre_completo,
      password: '',
      telefono: user.telefono || '',
      email: user.email || '',
      rol_id: user.rol_id || '',
    });
    setEditingUser(user);
    setShowModal(true);
  };

  const handleOpenPassword = (user: UsuarioConRol) => {
    setEditingUser(user);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingUser) {
        // Actualizar
        const { error } = await supabase
          .from('usuarios_sistema')
          .update({
            nombre_completo: formData.nombre_completo,
            telefono: formData.telefono || null,
            email: formData.email || null,
            rol_id: formData.rol_id || null,
          })
          .eq('id', editingUser.id);

        if (error) throw error;
        showSuccess('Usuario actualizado correctamente');
      } else {
        // Crear
        const { error } = await supabase
          .from('usuarios_sistema')
          .insert({
            username: formData.username.toLowerCase().trim(),
            nombre_completo: formData.nombre_completo,
            password_hash: formData.password, // Se hashea en el backend
            telefono: formData.telefono || null,
            email: formData.email || null,
            rol_id: formData.rol_id || null,
            activo: true,
          });

        if (error) throw error;
        showSuccess('Usuario creado correctamente');
      }

      handleCloseModal();
      await cargarUsuarios();
    } catch (err: any) {
      console.error('Error guardando usuario:', err);
      showError(err.message || 'Error al guardar usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!editingUser || !newPassword) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('usuarios_sistema')
        .update({ password_hash: newPassword })
        .eq('id', editingUser.id);

      if (error) throw error;

      showSuccess('Contraseña actualizada correctamente');
      setShowPasswordModal(false);
      setEditingUser(null);
      setNewPassword('');
    } catch (err: any) {
      showError(err.message || 'Error al cambiar contraseña');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (user: UsuarioConRol) => {
    try {
      const { error } = await supabase
        .from('usuarios_sistema')
        .update({ activo: !user.activo })
        .eq('id', user.id);

      if (error) throw error;
      await cargarUsuarios();
    } catch (err: any) {
      showError(err.message || 'Error al cambiar estado');
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('usuarios_sistema')
        .delete()
        .eq('id', deletingUser.id);

      if (error) throw error;

      showSuccess('Usuario eliminado correctamente');
      setDeletingUser(null);
      await cargarUsuarios();
    } catch (err: any) {
      showError(err.message || 'Error al eliminar usuario');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading || loadingRoles) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Usuarios</p>
            <p className="text-2xl font-bold text-gray-900">{estadisticas.total}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-lg">
            <UserCheck className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Activos</p>
            <p className="text-2xl font-bold text-green-600">{estadisticas.activos}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 bg-gray-200 rounded-lg">
            <UserX className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Inactivos</p>
            <p className="text-2xl font-bold text-gray-500">{estadisticas.inactivos}</p>
          </div>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1 w-full md:w-auto">
          {/* Búsqueda */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, usuario o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Filtro por rol */}
          <select
            value={filterRol}
            onChange={(e) => setFilterRol(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Todos los roles</option>
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.nombre}
              </option>
            ))}
          </select>

          {/* Filtro activo/inactivo */}
          <select
            value={filterActivo}
            onChange={(e) => setFilterActivo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Nuevo Usuario
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contacto
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Último Acceso
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {usuariosFiltrados.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <p className="font-medium text-gray-900">{user.nombre_completo}</p>
                    <p className="text-sm text-gray-500">@{user.username}</p>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.es_admin
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {user.es_admin && <Shield className="h-3 w-3" />}
                    {user.rol_nombre || 'Sin rol'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm">
                    {user.email && <p className="text-gray-900">{user.email}</p>}
                    {user.telefono && <p className="text-gray-500">{user.telefono}</p>}
                    {!user.email && !user.telefono && <p className="text-gray-400">-</p>}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <button
                    onClick={() => handleToggleActivo(user)}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      user.activo
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {user.activo ? (
                      <>
                        <UserCheck className="h-3 w-3" />
                        Activo
                      </>
                    ) : (
                      <>
                        <UserX className="h-3 w-3" />
                        Inactivo
                      </>
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(user.ultimo_acceso)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(user)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenPassword(user)}
                      className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                      title="Cambiar contraseña"
                    >
                      <Key className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeletingUser(user)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {usuariosFiltrados.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No se encontraron usuarios
          </div>
        )}
      </div>

      {/* Modal Crear/Editar Usuario */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Username (solo en creación) */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuario *
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="nombre_usuario"
                    required
                  />
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, nombre_completo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Juan Pérez"
                  required
                />
              </div>

              {/* Password (solo en creación) */}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Rol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol *
                </label>
                <select
                  value={formData.rol_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, rol_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Seleccionar rol...</option>
                  {roles.filter(r => r.activo).map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teléfono */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData((prev) => ({ ...prev, telefono: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="2604 123456"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="usuario@ejemplo.com"
                />
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingUser ? 'Guardar' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cambiar Contraseña */}
      {showPasswordModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Cambiar Contraseña
            </h3>
            <p className="text-gray-600 mb-4">
              Usuario: <strong>{editingUser.username}</strong>
            </p>
            <div className="relative mb-6">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                placeholder="Nueva contraseña"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setEditingUser(null);
                  setNewPassword('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangePassword}
                disabled={saving || !newPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Cambiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                ¿Eliminar usuario?
              </h3>
              <p className="text-gray-600 mb-6">
                ¿Estás seguro de eliminar a <strong>{deletingUser.nombre_completo}</strong>?
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// TAB ROLES - Con checkboxes en columnas
// ============================================

const TabRoles: React.FC<TabProps> = ({ showSuccess, showError }) => {
  const { roles, loading, crearRol, actualizarRol, eliminarRol, toggleActivo, refetch } = useRoles();

  const [showModal, setShowModal] = useState(false);
  const [editingRol, setEditingRol] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
  });
  const [saving, setSaving] = useState(false);
  const [savingPermiso, setSavingPermiso] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ============================================
  // HANDLERS
  // ============================================

  const handleNuevo = () => {
    setEditingRol(null);
    setFormData({
      nombre: '',
      descripcion: '',
    });
    setShowModal(true);
  };

  const handleEditar = (rolId: string) => {
    const rol = roles.find((r) => r.id === rolId);
    if (!rol) return;

    if (rol.es_admin) {
      showError('No se puede editar el rol Administrador');
      return;
    }

    setEditingRol(rolId);
    setFormData({
      nombre: rol.nombre,
      descripcion: rol.descripcion || '',
    });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.nombre.trim()) {
      showError('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      if (editingRol) {
        const rol = roles.find((r) => r.id === editingRol);
        await actualizarRol(editingRol, {
          nombre: formData.nombre,
          descripcion: formData.descripcion,
          permisos: rol?.permisos || PERMISOS_DEFAULT,
        });
        showSuccess('Rol actualizado correctamente');
      } else {
        await crearRol({
          nombre: formData.nombre,
          descripcion: formData.descripcion,
          permisos: { ...PERMISOS_DEFAULT },
        });
        showSuccess('Rol creado correctamente');
      }
      setShowModal(false);
      await refetch();
    } catch (err: any) {
      showError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (rolId: string) => {
    const rol = roles.find((r) => r.id === rolId);
    if (!rol) return;

    if (rol.es_admin) {
      showError('No se puede eliminar el rol Administrador');
      return;
    }

    try {
      await eliminarRol(rolId);
      showSuccess('Rol eliminado correctamente');
      setDeleteConfirm(null);
      await refetch();
    } catch (err: any) {
      showError(err.message || 'Error al eliminar');
    }
  };

  const handleToggleActivo = async (rolId: string) => {
    const rol = roles.find((r) => r.id === rolId);
    if (!rol) return;

    if (rol.es_admin) {
      showError('No se puede desactivar el rol Administrador');
      return;
    }

    try {
      await toggleActivo(rolId, !rol.activo);
      await refetch();
    } catch (err: any) {
      showError(err.message || 'Error al cambiar estado');
    }
  };

  // Handler para cambiar permiso directamente en la tabla
  const handleTogglePermiso = async (rolId: string, modulo: ModuloSistema) => {
    const rol = roles.find((r) => r.id === rolId);
    if (!rol || rol.es_admin) return;

    const permisoKey = `${rolId}-${modulo}`;
    setSavingPermiso(permisoKey);

    try {
      const nuevosPermisos = {
        ...rol.permisos,
        [modulo]: !rol.permisos[modulo],
      };

      await actualizarRol(rolId, {
        nombre: rol.nombre,
        descripcion: rol.descripcion || '',
        permisos: nuevosPermisos,
      });
      
      await refetch();
    } catch (err: any) {
      showError(err.message || 'Error al cambiar permiso');
    } finally {
      setSavingPermiso(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Roles del Sistema</h3>
          <p className="text-sm text-gray-500">Haz clic en los checkboxes para habilitar o deshabilitar accesos</p>
        </div>
        <button
          onClick={handleNuevo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Nuevo Rol
        </button>
      </div>

      {/* Tabla de Roles con Permisos */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-48 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                Rol
              </th>
              {/* Columnas de módulos - ancho fijo para alineación */}
              {MODULOS_ORDENADOS.map((modulo) => {
                const config = MODULOS_CONFIG[modulo];
                const Icon = config.icono;
                return (
                  <th 
                    key={modulo} 
                    className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    title={config.descripcion}
                  >
                    <div className="flex flex-col items-center justify-center gap-1 mx-auto">
                      <Icon className="h-4 w-4 text-gray-400" />
                      <span className="text-[10px] leading-tight whitespace-nowrap">{config.nombre}</span>
                    </div>
                  </th>
                );
              })}
              <th className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="w-24 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {roles.map((rol) => (
              <tr key={rol.id} className={`hover:bg-gray-50 ${!rol.activo ? 'opacity-50' : ''}`}>
                {/* Nombre del Rol */}
                <td className="w-48 px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-100">
                  <div className="flex items-center gap-2">
                    {rol.es_admin && <Shield className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{rol.nombre}</p>
                      {rol.descripcion && (
                        <p className="text-xs text-gray-500 truncate">{rol.descripcion}</p>
                      )}
                    </div>
                  </div>
                </td>
                
                {/* Checkboxes de Permisos - centrados */}
                {MODULOS_ORDENADOS.map((modulo) => {
                  const tienePermiso = rol.es_admin ? true : rol.permisos[modulo];
                  const permisoKey = `${rol.id}-${modulo}`;
                  const isLoading = savingPermiso === permisoKey;
                  
                  return (
                    <td key={modulo} className="w-20 px-2 py-3">
                      <div className="flex items-center justify-center">
                        {isLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        ) : (
                          <button
                            onClick={() => handleTogglePermiso(rol.id, modulo)}
                            disabled={rol.es_admin || !rol.activo}
                            className={`
                              w-6 h-6 rounded border-2 flex items-center justify-center transition-all
                              ${rol.es_admin || !rol.activo ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
                              ${tienePermiso 
                                ? 'bg-green-500 border-green-500 text-white' 
                                : 'bg-white border-gray-300 hover:border-gray-400'
                              }
                            `}
                            title={rol.es_admin ? 'Administrador tiene todos los permisos' : tienePermiso ? 'Quitar acceso' : 'Dar acceso'}
                          >
                            {tienePermiso && <Check className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })} 
                
                {/* Estado */}
                <td className="w-20 px-2 py-3">
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => handleToggleActivo(rol.id)}
                      disabled={rol.es_admin}
                      className={`${rol.es_admin ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title={rol.es_admin ? 'No se puede modificar' : rol.activo ? 'Desactivar rol' : 'Activar rol'}
                    >
                      {rol.activo ? (
                        <ToggleRight className="h-6 w-6 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-gray-400" />
                      )}
                    </button>
                  </div>
                </td>
                
                {/* Acciones */}
                <td className="w-24 px-2 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => handleEditar(rol.id)}
                      disabled={rol.es_admin}
                      className={`p-1.5 rounded-lg transition-colors ${
                        rol.es_admin ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'
                      }`}
                      title={rol.es_admin ? 'No se puede editar' : 'Editar nombre'}
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {deleteConfirm === rol.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEliminar(rol.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Confirmar eliminación"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(rol.id)}
                        disabled={rol.es_admin}
                        className={`p-1.5 rounded-lg transition-colors ${
                          rol.es_admin ? 'text-gray-300 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'
                        }`}
                        title={rol.es_admin ? 'No se puede eliminar' : 'Eliminar rol'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 bg-green-500 border-green-500 flex items-center justify-center">
            <Check className="h-3 w-3 text-white" />
          </div>
          <span className="text-gray-600">Tiene acceso</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border-2 border-gray-300 bg-white"></div>
          <span className="text-gray-600">Sin acceso</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-purple-600" />
          <span className="text-gray-600">Rol Administrador (no editable)</span>
        </div>
      </div>

      {/* Modal Crear/Editar Rol - Solo nombre y descripción */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingRol ? 'Editar Rol' : 'Nuevo Rol'}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Rol <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Supervisor"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Descripción del rol..."
                />
              </div>

              {/* Nota informativa */}
              {!editingRol && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    💡 Los permisos se configuran directamente en la tabla usando los checkboxes de cada módulo.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={saving || !formData.nombre.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionAccesosPage;
