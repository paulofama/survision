// ============================================
// PROTECTED ROUTE - Rutas Protegidas
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/components/auth/ProtectedRoute.tsx
// ============================================

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ModuloSistema, MODULOS_SISTEMA } from '../../types/auth.types';
import { Loader2, ShieldAlert, WifiOff, Lock } from 'lucide-react';

// ============================================
// INTERFACES
// ============================================

interface ProtectedRouteProps {
  children: React.ReactNode;
  modulo?: ModuloSistema;
  requiereAdmin?: boolean;
}

// ============================================
// COMPONENTES DE PANTALLA
// ============================================

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
      <p className="text-gray-600 font-medium">Verificando acceso...</p>
    </div>
  </div>
);

const AdminRequiredScreen: React.FC = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="h-8 w-8 text-red-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
      <p className="text-gray-600 mb-6">Esta sección requiere permisos de administrador.</p>
      <button
        onClick={() => window.history.back()}
        className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
      >
        Volver
      </button>
    </div>
  </div>
);

interface ModuleAccessDeniedProps {
  moduloNombre?: string;
}

const ModuleAccessDeniedScreen: React.FC<ModuleAccessDeniedProps> = ({ moduloNombre }) => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
      <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock className="h-8 w-8 text-yellow-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Sin Acceso</h2>
      <p className="text-gray-600 mb-6">
        No tienes permisos para acceder a{' '}
        <span className="font-semibold">{moduloNombre || 'este módulo'}</span>.
        <br />
        <span className="text-sm text-gray-500 mt-2 block">
          Contacta al administrador si necesitas acceso.
        </span>
      </p>
      <button
        onClick={() => window.history.back()}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Volver
      </button>
    </div>
  </div>
);

const OfflineIndicator: React.FC = () => (
  <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
    <WifiOff className="h-4 w-4" />
    <span className="text-sm font-medium">Modo sin conexión</span>
  </div>
);

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  modulo,
  requiereAdmin = false,
}) => {
  const { usuario, isAuthenticated, isLoading, esAdmin, puedeAcceder, isOnline } = useAuth();
  const location = useLocation();

  // Loading
  if (isLoading) {
    return <LoadingScreen />;
  }

  // No autenticado
  if (!isAuthenticated || !usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Requiere admin
  if (requiereAdmin && !esAdmin()) {
    return <AdminRequiredScreen />;
  }

  // Verificar permiso por módulo
  if (modulo && !puedeAcceder(modulo)) {
    const moduloInfo = MODULOS_SISTEMA[modulo];
    return <ModuleAccessDeniedScreen moduloNombre={moduloInfo?.nombre} />;
  }

  // OK - mostrar contenido
  return (
    <>
      {children}
      {!isOnline && <OfflineIndicator />}
    </>
  );
};

export default ProtectedRoute;
