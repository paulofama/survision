// ============================================
// MARGINAL LAYOUT - Layout Compartido
// Análisis Marginal - Sistema de Costos
// Instituto Dr. Mercado
// ============================================

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Calculator,
  LayoutDashboard,
  Activity,
  UserCheck,
  Building2,
  PieChart,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
} from 'lucide-react';
import { useMovimientosPrestaciones } from '../../hooks/useMovimientosPrestaciones';
import { useHonorariosConfig } from '../../hooks/useHonorariosConfig';
import { supabase } from '../../lib/supabase';

// ============================================
// TIPOS
// ============================================

interface RecetaConPools {
  codigo_practica: string;
  nombre_practica: string;
  categoria: string;
  cantidad_mensual_estimada: number;
  costo_pool_consultorio: number;
  costo_pool_quirofano: number;
  costo_pool_parabulbar: number;
  costo_pool_rfg: number;
  costo_pool_reesterilizables: number;
  costo_pool_lavado: number;
  costo_pool_faco: number;
  costo_pool_implante: number;
  costo_pool_medicamentos: number;
  costo_pool_descartables: number;
  costo_total_pools: number;
  costo_insumos_directos: number;
  costo_total_unitario: number;
}

interface MarginalContextType {
  // Datos
  prestaciones: any[];
  recetasConPools: RecetaConPools[];
  configHonorarios: any[];
  prestadoresHonorarios: any[];
  
  // Filtros globales
  filtros: {
    anio: string;
    mes: string;
    obraSocialId: string;
    prestadorId: string;
    segmento: string;
  };
  opcionesFiltros: any;
  
  // Estado
  loading: boolean;
  loadingRecetas: boolean;
  error: string | null;
  isConnected: boolean;
  
  // Acciones
  aplicarFiltros: (nuevos: Partial<MarginalContextType['filtros']>) => void;
  limpiarFiltros: () => void;
  refetch: () => Promise<void>;
}

// ============================================
// CONTEXT
// ============================================

const MarginalContext = createContext<MarginalContextType | null>(null);

export const useMarginalContext = () => {
  const context = useContext(MarginalContext);
  if (!context) {
    throw new Error('useMarginalContext debe usarse dentro de MarginalLayout');
  }
  return context;
};

// ============================================
// NAVEGACIÓN INTERNA
// ============================================

const subNavItems = [
  { path: '/analisis-marginal', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/analisis-marginal/por-prestacion', label: 'Por Prestación', icon: Activity },
  { path: '/analisis-marginal/por-prestador', label: 'Por Prestador', icon: UserCheck },
  { path: '/analisis-marginal/por-obra-social', label: 'Por Obra Social', icon: Building2 },
  { path: '/analisis-marginal/por-grupo', label: 'Por Grupo', icon: PieChart },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

interface MarginalLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export const MarginalLayout: React.FC<MarginalLayoutProps> = ({ 
  children, 
  title, 
  subtitle 
}) => {
  const location = useLocation();
  
  // Hook de datos de GECLISA
  const {
    prestaciones,
    opcionesFiltros,
    filtros: filtrosBase,
    aplicarFiltros: aplicarFiltrosBase,
    limpiarFiltros: limpiarFiltrosBase,
    loading,
    error,
    isConnected,
    refetch
  } = useMovimientosPrestaciones();

  // Hook de honorarios
  const {
    configuraciones: configHonorarios,
    prestadores: prestadoresHonorarios,
    loading: loadingHonorarios
  } = useHonorariosConfig();

  // Estados locales
  const [recetasConPools, setRecetasConPools] = useState<RecetaConPools[]>([]);
  const [loadingRecetas, setLoadingRecetas] = useState(true);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const [filtroSegmento, setFiltroSegmento] = useState('');

  // ============================================
  // CARGAR RECETAS CON POOLS
  // ============================================

  useEffect(() => {
    const cargarRecetasConPools = async () => {
      try {
        setLoadingRecetas(true);
        
        const { data, error: fetchError } = await supabase
          .from('v_recetas_costos_por_pool')
          .select('*');

        if (fetchError) {
          console.warn('Vista v_recetas_costos_por_pool no disponible:', fetchError.message);
          setRecetasConPools([]);
          return;
        }

        setRecetasConPools(data || []);
        console.log(`✅ ${data?.length || 0} recetas con pools cargadas`);

      } catch (err) {
        console.error('Error cargando recetas:', err);
        setRecetasConPools([]);
      } finally {
        setLoadingRecetas(false);
      }
    };

    cargarRecetasConPools();
  }, []);

  // ============================================
  // FILTROS COMBINADOS
  // ============================================

  const filtros = useMemo(() => ({
    ...filtrosBase,
    segmento: filtroSegmento
  }), [filtrosBase, filtroSegmento]);

  const aplicarFiltros = useCallback((nuevos: Partial<typeof filtros>) => {
    if ('segmento' in nuevos) {
      setFiltroSegmento(nuevos.segmento || '');
    }
    
    const { segmento, ...rest } = nuevos;
    if (Object.keys(rest).length > 0) {
      aplicarFiltrosBase(rest);
    }
  }, [aplicarFiltrosBase]);

  const limpiarFiltros = useCallback(() => {
    setFiltroSegmento('');
    limpiarFiltrosBase();
  }, [limpiarFiltrosBase]);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const contextValue = useMemo((): MarginalContextType => ({
    prestaciones,
    recetasConPools,
    configHonorarios,
    prestadoresHonorarios,
    filtros,
    opcionesFiltros,
    loading: loading || loadingHonorarios,
    loadingRecetas,
    error,
    isConnected,
    aplicarFiltros,
    limpiarFiltros,
    refetch
  }), [
    prestaciones,
    recetasConPools,
    configHonorarios,
    prestadoresHonorarios,
    filtros,
    opcionesFiltros,
    loading,
    loadingHonorarios,
    loadingRecetas,
    error,
    isConnected,
    aplicarFiltros,
    limpiarFiltros,
    refetch
  ]);

  const isLoading = loading || loadingHonorarios || loadingRecetas;

  // ============================================
  // RENDER
  // ============================================

  return (
    <MarginalContext.Provider value={contextValue}>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-full mx-auto">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calculator className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
                <p className="text-sm text-gray-500">
                  {subtitle || 'Análisis de rentabilidad y márgenes de contribución'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Estado de conexión */}
              <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
              
              {/* Toggle filtros */}
              <button
                onClick={() => setMostrarFiltros(!mostrarFiltros)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <Filter className="h-4 w-4" />
                Filtros
                {mostrarFiltros ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              
              {/* Refrescar */}
              <button
                onClick={refetch}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Navegación Secundaria */}
          <div className="bg-white rounded-xl shadow-sm border mb-6">
            <div className="flex overflow-x-auto">
              {subNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact 
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`
                      flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap
                      ${isActive
                        ? 'border-blue-600 text-blue-600 bg-blue-50'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>

          {/* Filtros Globales */}
          {mostrarFiltros && (
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
              <div className="grid grid-cols-6 gap-4">
                {/* Año */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                  <select
                    value={filtros.anio}
                    onChange={(e) => aplicarFiltros({ anio: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    {opcionesFiltros.anios?.map((anio: number) => (
                      <option key={anio} value={anio}>{anio}</option>
                    ))}
                  </select>
                </div>

                {/* Mes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
                  <select
                    value={filtros.mes}
                    onChange={(e) => aplicarFiltros({ mes: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    {opcionesFiltros.meses?.map((mes: { value: number; label: string }) => (
                      <option key={mes.value} value={mes.value}>{mes.label}</option>
                    ))}
                  </select>
                </div>

                {/* Obra Social */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Obra Social</label>
                  <select
                    value={filtros.obraSocialId}
                    onChange={(e) => aplicarFiltros({ obraSocialId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todas</option>
                    {opcionesFiltros.obrasSociales?.map((os: { id: number; sigla: string; nombre: string }) => (
                      <option key={os.id} value={os.id}>{os.sigla} - {os.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Prestador */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prestador</label>
                  <select
                    value={filtros.prestadorId}
                    onChange={(e) => aplicarFiltros({ prestadorId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    {opcionesFiltros.prestadores?.map((pre: { id: number; nombre: string }) => (
                      <option key={pre.id} value={pre.id}>{pre.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Segmento */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
                  <select
                    value={filtros.segmento}
                    onChange={(e) => aplicarFiltros({ segmento: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Todos</option>
                    <option value="Consultas">Consultas</option>
                    <option value="Estudios">Estudios</option>
                    <option value="Cirugias">Cirugías</option>
                  </select>
                </div>

                {/* Limpiar */}
                <div className="flex items-end">
                  <button
                    onClick={limpiarFiltros}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    <X className="h-4 w-4" />
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Loading Global */}
          {isLoading && prestaciones.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Cargando datos...</span>
            </div>
          )}

          {/* Contenido */}
          {(!isLoading || prestaciones.length > 0) && children}

          {/* Footer */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg border flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span className="text-green-600">● Verde = Margen ≥50%</span>
              <span className="text-blue-600">● Azul = Margen 30-50%</span>
              <span className="text-yellow-600">● Amarillo = Margen 0-30%</span>
              <span className="text-red-600">● Rojo = Margen negativo</span>
            </div>
            <span>P. Famá | Desarrollo</span>
          </div>
        </div>
      </div>
    </MarginalContext.Provider>
  );
};

export default MarginalLayout;
