// ============================================
// LOGIN PAGE - Con Selector de Usuario
// Sistema Integral de Gestión - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  Eye, 
  EyeOff, 
  LogIn, 
  AlertCircle, 
  Loader2,
  DollarSign,
  WifiOff,
  Wifi,
  User,
  ChevronDown
} from 'lucide-react';

// ============================================
// INTERFACES
// ============================================

interface UsuarioLista {
  id: string;
  username: string;
  nombre_completo: string;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading, error: authError, isOnline } = useAuth();

  // Estados del formulario
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Obtener la ruta de origen para redirigir después del login
  const from = (location.state as any)?.from?.pathname || '/';

  // ============================================
  // CARGAR USUARIOS
  // ============================================

  useEffect(() => {
    const cargarUsuarios = async () => {
      try {
        setLoadingUsuarios(true);
        
        const { data, error } = await supabase
          .from('usuarios_sistema')
          .select('id, username, nombre_completo')
          .eq('activo', true)
          .order('nombre_completo');

        if (error) throw error;

        setUsuarios(data || []);
      } catch (err) {
        console.error('Error cargando usuarios:', err);
        setLocalError('Error al cargar la lista de usuarios');
      } finally {
        setLoadingUsuarios(false);
      }
    };

    cargarUsuarios();
  }, []);

  // ============================================
  // EFECTOS
  // ============================================

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, from]);

  // Limpiar error local cuando cambian los inputs
  useEffect(() => {
    if (localError) {
      setLocalError(null);
    }
  }, [selectedUserId, password]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Validaciones básicas
    if (!selectedUserId) {
      setLocalError('Selecciona tu usuario');
      return;
    }

    if (!password) {
      setLocalError('Ingresa tu contraseña');
      return;
    }

    // Obtener el username del usuario seleccionado
    const usuarioSeleccionado = usuarios.find(u => u.id === selectedUserId);
    if (!usuarioSeleccionado) {
      setLocalError('Usuario no válido');
      return;
    }

    setIsSubmitting(true);

    try {
      const success = await login({ 
        username: usuarioSeleccionado.username, 
        password 
      });
      
      if (success) {
        navigate(from, { replace: true });
      }
    } catch (error) {
      console.error('Error en login:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  // Si está cargando la autenticación inicial
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" />
          <p className="text-blue-200">Cargando...</p>
        </div>
      </div>
    );
  }

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex items-center justify-center p-4">
      {/* Indicador de conexión */}
      <div className={`fixed top-4 right-4 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium ${
        isOnline 
          ? 'bg-green-100 text-green-800' 
          : 'bg-yellow-100 text-yellow-800'
      }`}>
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            <span>Conectado</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Sin conexión</span>
          </>
        )}
      </div>

      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <DollarSign className="h-10 w-10 text-blue-300" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Sistema Integral de Gestión</h1>
          <p className="text-blue-200">Instituto Dr. Mercado</p>
        </div>

        {/* Card del formulario */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
            Iniciar Sesión
          </h2>

          {/* Mensaje de error */}
          {displayError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{displayError}</p>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Selector de Usuario */}
            <div>
              <label 
                htmlFor="usuario" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Usuario
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <User className="h-5 w-5" />
                </div>
                <select
                  id="usuario"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none bg-white cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={isSubmitting || loadingUsuarios}
                >
                  <option value="">
                    {loadingUsuarios ? 'Cargando usuarios...' : 'Selecciona tu usuario'}
                  </option>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nombre_completo}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  {loadingUsuarios ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </div>
              {usuarios.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} disponible{usuarios.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={isSubmitting}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Botón de login */}
            <button
              type="submit"
              disabled={isSubmitting || loadingUsuarios}
              className={`
                w-full py-3 px-4 rounded-lg font-semibold text-white
                flex items-center justify-center gap-2
                transition-all duration-200
                ${isSubmitting || loadingUsuarios
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-[0.98]'
                }
              `}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  <span>Ingresar</span>
                </>
              )}
            </button>
          </form>

          {/* Nota sobre modo offline */}
          {!isOnline && (
            <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 text-sm text-center">
                <strong>Modo sin conexión:</strong> Solo puedes iniciar sesión si ya lo hiciste antes en este dispositivo.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-blue-200 text-sm">
            Sistema Integral de Gestión v1.0.0
          </p>
          <p className="text-blue-300/60 text-xs mt-1">
            P. Famá | Desarrollo
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
