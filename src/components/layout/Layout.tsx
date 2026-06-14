// ============================================
// LAYOUT PRINCIPAL - VERSIÓN CORREGIDA
// Sistema de Costos - Instituto Dr. Mercado
// v4.2 - Compatible con Sidebar fixed
// ============================================
// RUTA DESTINO: src/components/layout/Layout.tsx
// ============================================

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  // Sincronizar con el estado del sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    // Verificar estado inicial
    const checkSidebarState = () => {
      const saved = localStorage.getItem('sidebar-collapsed');
      if (saved !== null) {
        setSidebarCollapsed(JSON.parse(saved));
      }
    };

    // Verificar cada 100ms por cambios (polling simple)
    const interval = setInterval(checkSidebarState, 100);

    // También escuchar el evento storage para cambios en otras pestañas
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sidebar-collapsed' && e.newValue !== null) {
        setSidebarCollapsed(JSON.parse(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar - Posición fija */}
      <Sidebar />

      {/* Contenido Principal - Con margin-left para compensar sidebar fixed */}
      <main
        className={`
          min-h-screen
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'ml-16' : 'ml-64'}
        `}
      >
        {/* Sin padding aquí - cada página maneja su propio padding */}
        {children}
      </main>
    </div>
  );
};

export default Layout;
