// ===========================================================================
// MÓDULO: Fiscal (IVA Ventas / Compras / Dashboard) — API pública
// ===========================================================================
// Datos extraídos de GECLISA y subidos a Supabase (ver migrations/07_fiscal_iva.sql
// y server/services/ivaExtractor.js). El módulo lee de Supabase directo; el backend
// (/api/fiscal) sincroniza GECLISA->Supabase. App.tsx hace lazy import de las páginas.
// ===========================================================================

export { useFiscalPeriodos, useFiscalLibro } from './hooks/useFiscalIva';

export { default as FiscalDashboardPage } from './pages/FiscalDashboardPage';
export { default as IvaVentasPage } from './pages/IvaVentasPage';
export { default as IvaComprasPage } from './pages/IvaComprasPage';
