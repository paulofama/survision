// ============================================
// COMING SOON PAGE
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Construction, ArrowLeft, Clock } from 'lucide-react';

const ComingSoonPage: React.FC = () => {
  const location = useLocation();
  
  // Obtener nombre de la página desde la ruta
  const getPageName = (): string => {
    const path = location.pathname.slice(1); // Remover la barra inicial
    if (!path) return 'Esta sección';
    return path
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md px-6">
        {/* Icono */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-yellow-100">
            <Construction className="h-12 w-12 text-yellow-600" />
          </div>
        </div>

        {/* Título */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Próximamente
        </h1>

        {/* Descripción */}
        <p className="text-gray-600 mb-6">
          <span className="font-semibold text-gray-800">{getPageName()}</span> está en desarrollo.
          Estamos trabajando para traerte nuevas funcionalidades.
        </p>

        {/* Badge de tiempo */}
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-50 text-blue-700 mb-8">
          <Clock className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">En desarrollo activo</span>
        </div>

        {/* Botón de regreso */}
        <div>
          <Link
            to="/"
            className="inline-flex items-center px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Dashboard
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-8 text-sm text-gray-400">
          Sistema de Costos - Instituto Dr. Mercado
        </p>
      </div>
    </div>
  );
};

export default ComingSoonPage;
