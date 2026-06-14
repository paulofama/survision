// ===========================================================================
// MÓDULO: Tesorería — API pública
// ===========================================================================
// Punto de entrada del módulo. El resto del sistema importa SOLO desde acá
// (`@modules/tesoreria`), nunca de archivos internos. Para code-splitting,
// App.tsx hace lazy import directo de las páginas.
// ===========================================================================

export { useTesoreriaCaja } from './hooks/useTesoreriaCaja';
export type { SaldoHistorico } from './hooks/useTesoreriaCaja';

export { default as TesoreriaDashboardPage } from './pages/TesoreriaDashboardPage';
export { default as CajaMovimientosPage } from './pages/CajaMovimientosPage';
export { default as SaldoHistoricoPage } from './pages/SaldoHistoricoPage';
