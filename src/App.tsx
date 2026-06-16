// ============================================
// APP.TSX - ROUTER PRINCIPAL CON AUTENTICACIÓN
// Sistema de Costos - Instituto Dr. Mercado
// v4.1 - Con Evolución Temporal del Análisis Marginal
// ============================================
// RUTA DESTINO: src/App.tsx
// ============================================

import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from '@shared/components/layout/Layout';

// Context Providers
import { TipoCambioProvider } from '@shared/context/TipoCambioContext';
import { AuthProvider } from '@shared/context/AuthContext';

// Componentes de autenticación
import ProtectedRoute from '@shared/components/auth/ProtectedRoute';
import LoginPage from '@modules/accesos/pages/LoginPage';

// Páginas principales
import PrestacionesPage from '@modules/prestaciones/pages/PrestacionesPage';
import InsumosVariablesPage from '@modules/insumos/pages/InsumosVariablesPage';

// Prestaciones Realizadas (también usado como Dashboard temporal)
import PrestacionesRealizadasPage from '@modules/prestaciones/pages/PrestacionesRealizadasPage';

// Páginas de Costos
import PoolsConfigPage from '@modules/insumos/pages/PoolsConfigPage';
import HonorariosPage from '@modules/liquidaciones/pages/HonorariosPage';
import RecetasCostosPage from '@modules/insumos/pages/RecetasCostosPage';
import CostosFijosPage from '@modules/insumos/pages/CostosFijosPage';

// ============================================
// PRESUPUESTADOR
// ============================================
import Presupuestador from '@modules/presupuestador/pages/Presupuestador';
import BusquedaPresupuestosPage from '@modules/presupuestador/pages/BusquedaPresupuestosPage';

// ============================================
// ANÁLISIS MARGINAL - MULTIPÁGINA
// ============================================
import DashboardMarginalPage from '@modules/analisis-marginal/pages/DashboardMarginalPage';
import PorPrestacionPageMarginal from '@modules/analisis-marginal/pages/PorPrestacionPage';
import PorPrestadorPageMarginal from '@modules/analisis-marginal/pages/PorPrestadorPage';
import PorObraSocialPageMarginal from '@modules/analisis-marginal/pages/PorObraSocialPage';
import PorGrupoPageMarginal from '@modules/analisis-marginal/pages/PorGrupoPage';
import EvolucionTemporalPageMarginal from '@modules/analisis-marginal/pages/EvolucionTemporalPage';

// ============================================
// ANÁLISIS - PÁGINAS IMPLEMENTADAS
// ============================================
import DashboardAnalisisPage from '@modules/analisis/pages/DashboardAnalisisPage';
import {
  AnalisisPorObraSocialPage,
  AnalisisPorPrestadorPage,
  AnalisisPorPrestacionPage,
  AnalisisPorGrupoPage
} from '@modules/analisis';
import EvolucionTemporalPage from '@modules/analisis/pages/EvolucionTemporalPage';
import AnalisisTurnosPage from '@modules/turnos/pages/AnalisisTurnosPage';

// Páginas de Administración - UNIFICADA
import GestionAccesosPage from '@modules/accesos/pages/GestionAccesosPage';

// Páginas Coming Soon
import ComingSoonPage from '@shared/components/ComingSoonPage';

// ============================================
// TESORERÍA - LAZY LOADING (Safe Import)
// ============================================
const TesoreriaDashboardPage = lazy(() =>
  import('@modules/tesoreria/pages/TesoreriaDashboardPage').catch(() => ({
    default: () => <ComingSoonPage title="Tesorería - Dashboard" />
  }))
);

const CajaMovimientosPage = lazy(() =>
  import('@modules/tesoreria/pages/CajaMovimientosPage').catch(() => ({
    default: () => <ComingSoonPage title="Movimientos de Caja" />
  }))
);

const SaldoHistoricoPage = lazy(() =>
  import('@modules/tesoreria/pages/SaldoHistoricoPage').catch(() => ({
    default: () => <ComingSoonPage title="Saldo Histórico" />
  }))
);
const PagosProveedoresPage = lazy(() =>
  import('@modules/tesoreria/pages/PagosProveedoresPage').catch(() => ({
    default: () => <ComingSoonPage title="Pagos a Proveedores" />
  }))
);

// ============================================
// DERIVACIONES - LAZY LOADING
// ============================================
const DerivacionesLiquidacionPage = lazy(() => 
  import('@modules/liquidaciones/pages/DerivacionesLiquidacionPage').catch(() => ({
    default: () => <ComingSoonPage title="Liquidación Derivaciones" />
  }))
);

// ============================================
// LIQUIDACIÓN DE HONORARIOS - LAZY LOADING
// ============================================
const LiqHonorariosPage = lazy(() => 
  import('@modules/liquidaciones/liq-honorarios/LiqHonorariosPage').catch(() => ({
    default: () => <ComingSoonPage title="Liquidación de Honorarios" />
  }))
);

// ============================================
// INFORMES - LAZY LOADING
// ============================================
const InformesPage = lazy(() => 
  import('@modules/informes/pages/InformesPage').catch(() => ({
    default: () => <ComingSoonPage title="Informes de Gestión" />
  }))
);

const InformesEjecutivosPage = lazy(() => 
  import('@modules/informes/pages/InformesEjecutivosPage').catch(() => ({
    default: () => <ComingSoonPage title="Informes Ejecutivos" />
  }))
);

// ============================================
// SEGUIMIENTO DE PACIENTES - LAZY LOADING
// ============================================
const SeguimientoPacientesPage = lazy(() =>
  import('@modules/seguimiento/pages/SeguimientoPacientesPage').catch(() => ({
    default: () => <ComingSoonPage title="Seguimiento de Pacientes" />
  }))
);

// ============================================
// SUELDOS - MODULO NUEVO (Fase 1) - LAZY LOADING
// ============================================
const SueldosDashboardPage = lazy(() =>
  import('@modules/sueldos/pages/DashboardSueldosPage').catch(() => ({
    default: () => <ComingSoonPage />
  }))
);

const SueldosEmpleadosPage = lazy(() =>
  import('@modules/sueldos/pages/EmpleadosPage').catch(() => ({
    default: () => <ComingSoonPage />
  }))
);

const SueldosEmpleadoFormPage = lazy(() =>
  import('@modules/sueldos/pages/EmpleadoFormPage').catch(() => ({
    default: () => <ComingSoonPage />
  }))
);

const SueldosMesDetallePage = lazy(() =>
  import('@modules/sueldos/pages/MesDetallePage').catch(() => ({
    default: () => <ComingSoonPage />
  }))
);

const SueldosReportesPage = lazy(() =>
  import('@modules/sueldos/pages/ReportesSueldosPage').catch(() => ({
    default: () => <ComingSoonPage />
  }))
);

// ============================================
// COMPONENTE DE CARGA
// ============================================
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-gray-500">Cargando...</span>
    </div>
  </div>
);

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const App: React.FC = () => {
  return (
    <AuthProvider>
      <TipoCambioProvider>
        <Routes>
          {/* Ruta de Login - Sin Layout */}
          <Route path="/login" element={<LoginPage />} />
          
          {/* ============================================ */}
          {/* INFORMES EJECUTIVOS - SIN LAYOUT */}
          {/* Pantalla completa con su propio sistema de auth */}
          {/* ============================================ */}
          <Route path="/informes/ejecutivo" element={
            <Suspense fallback={<LoadingFallback />}>
              <InformesEjecutivosPage />
            </Suspense>
          } />
          
          {/* Rutas Protegidas - Con Layout */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Suspense fallback={<LoadingFallback />}>
                    <Routes>
                      {/* Principal */}
                      <Route path="/" element={<PrestacionesRealizadasPage />} />
                      <Route path="/prestaciones" element={<PrestacionesPage />} />
                      <Route path="/insumos-variables" element={<InsumosVariablesPage />} />
                      
                      {/* Prestaciones Realizadas */}
                      <Route path="/prestaciones-realizadas" element={<PrestacionesRealizadasPage />} />
                      
                      {/* Costos */}
                      <Route path="/pools" element={<PoolsConfigPage />} />
                      <Route path="/honorarios" element={<HonorariosPage />} />
                      <Route path="/recetas-costos" element={<RecetasCostosPage />} />
                      <Route path="/costos-fijos" element={<CostosFijosPage />} />

                      {/* ============================================ */}
                      {/* SUELDOS - MODULO NUEVO (Fase 1 + Fase 2)     */}
                      {/* ============================================ */}
                      <Route path="/sueldos" element={<SueldosDashboardPage />} />
                      <Route path="/sueldos/empleados" element={<SueldosEmpleadosPage />} />
                      <Route path="/sueldos/empleados/nuevo" element={<SueldosEmpleadoFormPage />} />
                      <Route path="/sueldos/empleados/:id" element={<SueldosEmpleadoFormPage />} />
                      <Route path="/sueldos/mes/:anio/:mes" element={<SueldosMesDetallePage />} />
                      <Route path="/sueldos/reportes" element={<SueldosReportesPage />} />

                      {/* ============================================ */}
                      {/* ANÁLISIS MARGINAL - RUTAS MULTIPÁGINA */}
                      {/* ============================================ */}
                      <Route path="/analisis-marginal" element={<DashboardMarginalPage />} />
                      <Route path="/analisis-marginal/por-prestacion" element={<PorPrestacionPageMarginal />} />
                      <Route path="/analisis-marginal/por-prestador" element={<PorPrestadorPageMarginal />} />
                      <Route path="/analisis-marginal/por-obra-social" element={<PorObraSocialPageMarginal />} />
                      <Route path="/analisis-marginal/por-grupo" element={<PorGrupoPageMarginal />} />
                      <Route path="/analisis-marginal/evolucion" element={<EvolucionTemporalPageMarginal />} />
                      
                      {/* ============================================ */}
                      {/* ANÁLISIS - PÁGINAS IMPLEMENTADAS */}
                      {/* ============================================ */}
                      <Route path="/analisis" element={<DashboardAnalisisPage />} />
                      <Route path="/analisis/por-prestacion" element={<AnalisisPorPrestacionPage />} />
                      <Route path="/analisis/por-prestador" element={<AnalisisPorPrestadorPage />} />
                      <Route path="/analisis/por-obra-social" element={<AnalisisPorObraSocialPage />} />
                      <Route path="/analisis/por-grupo" element={<AnalisisPorGrupoPage />} />
                      <Route path="/analisis/evolucion" element={<EvolucionTemporalPage />} />
                      
                      {/* Rutas legacy (por compatibilidad) */}
                      <Route path="/analisis/obra-social" element={<AnalisisPorObraSocialPage />} />
                      <Route path="/analisis/prestador" element={<AnalisisPorPrestadorPage />} />
                      <Route path="/analisis/turnos" element={<AnalisisTurnosPage />} />
                      
                      {/* ============================================ */}
                      {/* TESORERÍA - LAZY LOADED */}
                      {/* ============================================ */}
                      <Route path="/tesoreria" element={<TesoreriaDashboardPage />} />
                      <Route path="/tesoreria/caja/movimientos" element={<CajaMovimientosPage />} />
                      <Route path="/tesoreria/caja/saldo-historico" element={<SaldoHistoricoPage />} />
                      <Route path="/tesoreria/proveedores" element={<PagosProveedoresPage />} />
                      <Route path="/tesoreria/bancos" element={<ComingSoonPage title="Bancos" />} />
                      
                      {/* ============================================ */}
                      {/* DERIVACIONES */}
                      {/* ============================================ */}
                      <Route path="/derivaciones/liquidacion" element={<DerivacionesLiquidacionPage />} />
                      
                      {/* ============================================ */}
                      {/* LIQUIDACIÓN DE HONORARIOS */}
                      {/* ============================================ */}
                      <Route path="/liquidaciones/honorarios" element={<LiqHonorariosPage />} />
                      
                      {/* ============================================ */}
                      {/* INFORMES DE GESTIÓN */}
                      {/* ============================================ */}
                      <Route path="/informes" element={
                        <ProtectedRoute modulo="informes">
                          <InformesPage />
                        </ProtectedRoute>
                      } />
                      
                      {/* ============================================ */}
                      {/* SEGUIMIENTO DE PACIENTES */}
                      {/* ============================================ */}
                      <Route path="/seguimiento-pacientes" element={
                        <ProtectedRoute modulo="informes">
                          <SeguimientoPacientesPage />
                        </ProtectedRoute>
                      } />
                      
                      {/* ============================================ */}
                      {/* PRESUPUESTADOR */}
                      {/* ============================================ */}
                      <Route path="/presupuestos" element={<Presupuestador />} />
                      <Route path="/presupuestos/busqueda" element={<BusquedaPresupuestosPage />} />
                      
                      {/* ============================================ */}
                      {/* ADMINISTRACIÓN - Gestión de Accesos Unificada */}
                      {/* ============================================ */}
                      <Route 
                        path="/gestion-accesos" 
                        element={
                          <ProtectedRoute requiereAdmin>
                            <GestionAccesosPage />
                          </ProtectedRoute>
                        } 
                      />
                      
                      {/* Coming Soon */}
                      <Route path="/turnos" element={<ComingSoonPage title="Gestión de Turnos" />} />
                      <Route path="/configuracion" element={<ComingSoonPage title="Configuración" />} />
                      
                      {/* Fallback */}
                      <Route path="*" element={<PrestacionesRealizadasPage />} />
                    </Routes>
                  </Suspense>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </TipoCambioProvider>
    </AuthProvider>
  );
};

export default App;
