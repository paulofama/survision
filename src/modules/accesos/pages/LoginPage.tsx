// ============================================
// LOGIN PAGE - Email + Contraseña (Supabase Auth)
// Sistema Integral de Gestión - Instituto Dr. Mercado
// ============================================
//
// Login por EMAIL + contraseña contra Supabase Auth (ver AuthContext).
// Se eliminó el selector de usuarios (que listaba toda usuarios_sistema sin
// estar logueado): ahora cada uno ingresa su email.
//   - Contadoras: <usuario>@survision.local
//   - Paulo: su email real
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@shared/context/AuthContext';
import {
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  Loader2,
  DollarSign,
  WifiOff,
  Wifi,
  Mail,
} from 'lucide-react';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading, error: authError, isOnline } = useAuth();

  // Estados del formulario
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Ruta de origen para redirigir después del login
  const from = (location.state as any)?.from?.pathname || '/';

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
    if (localError) setLocalError(null);
  }, [email, password]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Ingresá tu email');
      return;
    }
    if (!password) {
      setLocalError('Ingresá tu contraseña');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email, password });
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setLocalError(result.error || 'No se pudo iniciar sesión');
      }
    } catch (error) {
      console.error('Error en login:', error);
      setLocalError('Error inesperado al iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  // Cargando la autenticación inicial (restaurando sesión)
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
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tuusuario@survision.local"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={isSubmitting}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresá tu contraseña"
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
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Botón de login */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`
                w-full py-3 px-4 rounded-lg font-semibold text-white
                flex items-center justify-center gap-2
                transition-all duration-200
                ${isSubmitting
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
                <strong>Sin conexión:</strong> no se puede iniciar sesión hasta recuperar internet.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-blue-200 text-sm">Sistema Integral de Gestión v1.0.0</p>
          <p className="text-blue-300/60 text-xs mt-1">P. Famá | Desarrollo</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
