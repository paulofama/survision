// ============================================
// SIDEBAR - Navegación Principal con Auth
// Sistema de Costos - Instituto Dr. Mercado
// v4.6 - Seguimiento Pacientes agregado
// ============================================
// RUTA DESTINO: src/components/layout/Sidebar.tsx
// ============================================

import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Home,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Stethoscope,
  Calculator,
  Users,
  Layers,
  ClipboardList,
  LogOut,
  User,
  Shield,
  WifiOff,
  TrendingUp,
  Building2,
  UserCheck,
  Clock,
  PieChart,
  Activity,
  LayoutDashboard,
  Wallet,
  BarChart3,
  Lock,
  FileBarChart,
  // Nuevos iconos para Tesorería
  Landmark,
  CreditCard,
  History,
  Banknote,
  // Derivaciones
  FileText,
  // Seguimiento Pacientes
  HeartPulse,
  // Presupuestador
  Receipt,
  FilePlus,
  Search,
  // Sueldos
  Coins
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface SubItem {
  path: string;
  label: string;
  icon?: React.ElementType;
  requierePermiso?: string;
}

interface NavItem {
  path: string;
  icon: React.ElementType;
  label: string;
  badge?: string;
  adminOnly?: boolean;
  restricted?: boolean;
  requierePermiso?: string;
  subItems?: SubItem[];
}

// ============================================
// CONFIGURACIÓN DE NAVEGACIÓN
// ============================================

const navItems: NavItem[] = [
  // ============================================
  // DASHBOARD
  // ============================================
  {
    path: '/',
    icon: Home,
    label: 'Dashboard'
    // Sin requierePermiso: dashboard siempre visible
  },

  // ============================================
  // PRESTACIONES
  // ============================================
  {
    path: '/prestaciones',
    icon: Stethoscope,
    label: 'Prestaciones',
    requierePermiso: 'prestaciones',
    subItems: [
      { path: '/prestaciones', label: 'Configuración', icon: Stethoscope },
      { path: '/prestaciones-realizadas', label: 'Realizadas', icon: FileBarChart }
    ]
  },

  // ============================================
  // INSUMOS Y COSTOS
  // ============================================
  {
    path: '/insumos-variables',
    icon: Package,
    label: 'Insumos y Costos',
    requierePermiso: 'insumos',
    subItems: [
      { path: '/insumos-variables', label: 'Insumos Variables', icon: Package },
      { path: '/pools', label: 'Pools de Insumos', icon: Layers },
      { path: '/recetas-costos', label: 'Recetas y Costos', icon: ClipboardList },
      { path: '/costos-fijos', label: 'Costos Fijos', icon: Wallet }
    ]
  },

  // ============================================
  // ANÁLISIS
  // ============================================
  {
    path: '/analisis',
    icon: BarChart3,
    label: 'Análisis',
    requierePermiso: 'analisis',
    subItems: [
      { path: '/analisis', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/analisis/por-prestacion', label: 'Por Prestación', icon: Activity },
      { path: '/analisis/por-prestador', label: 'Por Prestador', icon: UserCheck },
      { path: '/analisis/por-obra-social', label: 'Por Obra Social', icon: Building2 },
      { path: '/analisis/por-grupo', label: 'Por Grupo', icon: PieChart },
      { path: '/analisis/evolucion', label: 'Evolución Temporal', icon: Clock }
    ]
  },

  // ============================================
  // ANÁLISIS MARGINAL (Acceso Restringido)
  // ============================================
  {
    path: '/analisis-marginal',
    icon: Calculator,
    label: 'Análisis Marginal',
    requierePermiso: 'analisis_marginal',
    subItems: [
      { path: '/analisis-marginal', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/analisis-marginal/por-prestacion', label: 'Por Prestación', icon: Activity },
      { path: '/analisis-marginal/por-prestador', label: 'Por Prestador', icon: UserCheck },
      { path: '/analisis-marginal/por-obra-social', label: 'Por Obra Social', icon: Building2 },
      { path: '/analisis-marginal/por-grupo', label: 'Por Grupo', icon: PieChart },
      { path: '/analisis-marginal/evolucion', label: 'Evolución Temporal', icon: Clock }
    ]
  },

  // ============================================
  // TESORERÍA
  // ============================================
  {
    path: '/tesoreria',
    icon: Landmark,
    label: 'Tesorería',
    requierePermiso: 'tesoreria',
    subItems: [
      { path: '/tesoreria', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/tesoreria/caja/movimientos', label: 'Movimientos Caja', icon: CreditCard },
      { path: '/tesoreria/caja/saldo-historico', label: 'Saldo Histórico', icon: History },
      { path: '/tesoreria/proveedores', label: 'Pagos a Proveedores', icon: Receipt },
      { path: '/tesoreria/bancos', label: 'Bancos', icon: Banknote }
    ]
  },

  // ============================================
  // FISCAL (IVA Ventas / Compras / Dashboard)
  // Sin requierePermiso: lo usa Paulo (Auditor/Contador).
  // ============================================
  {
    path: '/fiscal',
    icon: FileBarChart,
    label: 'Fiscal',
    subItems: [
      { path: '/fiscal', label: 'Dashboard IVA', icon: LayoutDashboard },
      { path: '/fiscal/ventas', label: 'IVA Ventas', icon: FileText },
      { path: '/fiscal/compras', label: 'IVA Compras', icon: Receipt }
    ]
  },

  // ============================================
  // SUELDOS (Modulo nuevo - Fase 1 + Fase 2)
  // Reportes se agrega en Fase 5 (gated por sueldos:reportes).
  // ============================================
  {
    path: '/sueldos',
    icon: Coins,
    label: 'Sueldos',
    // Sin requierePermiso a nivel item: contadoras y Paulo usan Sueldos.
    // El sub-item Reportes se gatea con 'sueldos:reportes' (solo Auditor).
    subItems: [
      { path: '/sueldos', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/sueldos/empleados', label: 'Empleados', icon: Users },
      { path: '/sueldos/reportes', label: 'Reportes', icon: FileBarChart, requierePermiso: 'sueldos:reportes' }
    ]
  },

  // ============================================
  // LIQUIDACIONES
  // ============================================
  {
    path: '/derivaciones/liquidacion',
    icon: FileText,
    label: 'Liquidaciones',
    requierePermiso: 'liquidaciones',
    subItems: [
      { path: '/derivaciones/liquidacion', label: 'Derivaciones', icon: FileText },
      { path: '/liquidaciones/honorarios', label: 'Honorarios', icon: FileText },
      { path: '/honorarios', label: 'Config. Honorarios', icon: Calculator }
    ]
  },

  // ============================================
  // INFORMES DE GESTIÓN
  // ============================================
  {
    path: '/informes',
    icon: FileBarChart,
    label: 'Informes',
    requierePermiso: 'informes'
  },

  // ============================================
  // SEGUIMIENTO DE PACIENTES
  // ============================================
  {
    path: '/seguimiento-pacientes',
    icon: HeartPulse,
    label: 'Seguimiento Pac.',
    requierePermiso: 'seguimiento_pacientes'
  },

  // ============================================
  // PRESUPUESTADOR
  // ============================================
  {
    path: '/presupuestos',
    icon: Receipt,
    label: 'Presupuestador',
    requierePermiso: 'presupuestador',
    subItems: [
      { path: '/presupuestos', label: 'Nuevo', icon: FilePlus },
      { path: '/presupuestos/busqueda', label: 'Búsqueda', icon: Search },
      { path: '/presupuestos/analisis', label: 'Análisis', icon: TrendingUp }
    ]
  },

  // ============================================
  // ADMINISTRACIÓN (Solo Admin)
  // ============================================
  {
    path: '/gestion-accesos',
    icon: Lock,
    label: 'Gestión de Accesos',
    adminOnly: true
  }
];

// ============================================
// CATEGORÍAS PARA SEPARADORES
// ============================================

const getCategoryForItem = (item: NavItem): string | null => {
  switch (item.path) {
    case '/tesoreria':
      return 'FINANZAS';
    case '/fiscal':
      return 'FINANZAS';
    case '/gestion-accesos':
      return 'ADMINISTRACIÓN';
    default:
      return null;
  }
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, logout, esAdmin, isOnline, tienePermiso } = useAuth();
  
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Estado para submenús expandidos
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const currentPath = location.pathname;
    const expanded: string[] = [];
    navItems.forEach(item => {
      if (item.subItems?.some(sub => sub.path === currentPath || currentPath.startsWith(sub.path))) {
        expanded.push(item.path);
      }
    });
    return expanded;
  });

  // Persistir estado
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Auto-collapse en móvil
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Expandir menú cuando cambia la ruta
  useEffect(() => {
    const currentPath = location.pathname;
    navItems.forEach(item => {
      if (item.subItems?.some(sub => currentPath === sub.path || currentPath.startsWith(sub.path + '/'))) {
        if (!expandedMenus.includes(item.path)) {
          setExpandedMenus(prev => [...prev, item.path]);
        }
      }
    });
  }, [location.pathname]);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const toggleSubmenu = (path: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => {
        setExpandedMenus(prev => 
          prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
      }, 200);
    } else {
      setExpandedMenus(prev => 
        prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      );
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Filtrar items según permisos
  const filteredNavItems = navItems.filter(item => {
    // Items solo para admin
    if (item.adminOnly && !esAdmin()) return false;
    // Items que requieren permiso de módulo específico
    if (item.requierePermiso && !tienePermiso(item.requierePermiso as any)) return false;
    return true;
  });

  // Determinar si un item está activo
  const isItemActive = (item: NavItem): boolean => {
    if (item.subItems) {
      return item.subItems.some(sub => 
        location.pathname === sub.path || 
        location.pathname.startsWith(sub.path + '/')
      );
    }
    return location.pathname === item.path;
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <aside className={`
      bg-gradient-to-b from-blue-900 to-blue-800
      text-white
      h-screen
      flex flex-col
      transition-all duration-300 ease-in-out
      ${isCollapsed ? 'w-16' : 'w-64'}
      shadow-xl
      fixed left-0 top-0
      z-40
    `}>
      {/* Logo y Toggle */}
      <div className="p-4 flex items-center justify-between border-b border-blue-700/50">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
              <Stethoscope className="h-6 w-6 text-blue-200" />
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">Instituto</h2>
              <p className="text-xs text-blue-300">Dr. Mercado</p>
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Usuario */}
      {usuario && (
        <div className="p-3 border-b border-blue-700/50">
          {!isCollapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                {esAdmin() ? (
                  <Shield className="h-5 w-5 text-blue-200" />
                ) : (
                  <User className="h-5 w-5 text-blue-200" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{usuario.nombre_completo}</p>
                <p className="text-xs text-blue-300 truncate">
                  {usuario.rol_nombre || 'Usuario'}
                </p>
              </div>
              {!isOnline && (
                <span title="Sin conexión" className="inline-flex"><WifiOff className="h-4 w-4 text-yellow-400" /></span>
              )}
            </div>
          ) : (
            <div className="relative group">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                {esAdmin() ? (
                  <Shield className="h-4 w-4 text-blue-200" />
                ) : (
                  <User className="h-4 w-4 text-blue-200" />
                )}
              </div>
              {!isOnline && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full" />
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(item);
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedMenus.includes(item.path);
            const category = getCategoryForItem(item);

            return (
              <React.Fragment key={item.path}>
                {/* Separador de categoría */}
                {category && !isCollapsed && (
                  <li className="pt-4 pb-1">
                    <p className="text-xs text-blue-400 uppercase tracking-wider px-3 font-medium flex items-center gap-2">
                      {item.restricted && <Lock className="h-3 w-3" />}
                      {category}
                    </p>
                  </li>
                )}
                
                <li>
                  {/* Item principal */}
                  {hasSubItems ? (
                    <button
                      onClick={() => toggleSubmenu(item.path)}
                      className={`
                        w-full flex items-center gap-3
                        px-3 py-2.5
                        rounded-lg
                        transition-all duration-200
                        group
                        relative
                        ${isActive
                          ? 'bg-white/20 text-white'
                          : 'text-blue-100 hover:bg-white/10 hover:text-white'
                        }
                      `}
                    >
                      <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                      
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 font-medium text-left">{item.label}</span>
                          {item.restricted && <Lock className="h-3 w-3 text-yellow-400" />}
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </>
                      )}

                      {/* Indicador activo */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                      )}

                      {/* Tooltip para modo colapsado */}
                      {isCollapsed && (
                        <div className="
                          absolute left-full ml-2
                          px-3 py-2
                          bg-gray-900 text-white
                          text-sm font-medium
                          rounded-lg
                          whitespace-nowrap
                          opacity-0 invisible
                          group-hover:opacity-100 group-hover:visible
                          transition-all duration-200
                          z-50
                          shadow-xl
                        ">
                          {item.label}
                          {item.restricted && <Lock className="h-3 w-3 ml-2 inline text-yellow-400" />}
                        </div>
                      )}
                    </button>
                  ) : (
                    <NavLink
                      to={item.path}
                      className={({ isActive: navActive }) => `
                        flex items-center gap-3
                        px-3 py-2.5
                        rounded-lg
                        transition-all duration-200
                        group
                        relative
                        ${navActive || isActive
                          ? 'bg-white/20 text-white shadow-lg'
                          : 'text-blue-100 hover:bg-white/10 hover:text-white'
                        }
                      `}
                    >
                      <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                      
                      {!isCollapsed && (
                        <span className="flex-1 font-medium">{item.label}</span>
                      )}

                      {/* Indicador activo */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
                      )}

                      {/* Tooltip para modo colapsado */}
                      {isCollapsed && (
                        <div className="
                          absolute left-full ml-2
                          px-3 py-2
                          bg-gray-900 text-white
                          text-sm font-medium
                          rounded-lg
                          whitespace-nowrap
                          opacity-0 invisible
                          group-hover:opacity-100 group-hover:visible
                          transition-all duration-200
                          z-50
                          shadow-xl
                        ">
                          {item.label}
                        </div>
                      )}
                    </NavLink>
                  )}

                  {/* Sub-items */}
                  {hasSubItems && isExpanded && !isCollapsed && (
                    <ul className="mt-1 ml-4 space-y-1">
                      {item.subItems!
                        .filter(subItem => !subItem.requierePermiso || tienePermiso(subItem.requierePermiso as any))
                        .map(subItem => {
                        const SubIcon = subItem.icon;
                        const isSubActive = location.pathname === subItem.path;

                        return (
                          <li key={subItem.path}>
                            <NavLink
                              to={subItem.path}
                              className={`
                                flex items-center gap-2
                                px-3 py-2
                                rounded-lg
                                text-sm
                                transition-all duration-200
                                ${isSubActive
                                  ? 'bg-white/15 text-white font-medium'
                                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
                                }
                              `}
                            >
                              {SubIcon && <SubIcon className="h-4 w-4" />}
                              {subItem.label}
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </nav>

      {/* Footer con Logout */}
      <div className="border-t border-blue-700/50">
        {/* Botón de Logout */}
        <button
          onClick={handleLogout}
          className={`
            w-full flex items-center gap-3
            px-4 py-3
            text-blue-200 hover:text-white hover:bg-white/10
            transition-colors
            ${isCollapsed ? 'justify-center' : ''}
          `}
        >
          <LogOut className="h-5 w-5" />
          {!isCollapsed && <span className="font-medium">Cerrar Sesión</span>}
        </button>

        {/* Info del sistema */}
        <div className={`
          p-4 pt-0
          ${isCollapsed ? 'text-center' : ''}
        `}>
          {!isCollapsed ? (
            <div className="text-xs text-blue-300">
              <p className="font-medium">Sistema de Costos</p>
              <p className="text-blue-400 mt-1">v1.0.0</p>
              <p className="text-blue-400/70 mt-2 text-right">P. Famá | Desarrollo</p>
            </div>
          ) : (
            <div className="text-xs text-blue-400">
              v1.0
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
