// ===========================================================================
// MÓDULO: Liquidaciones (honorarios + derivaciones) — API pública
// ===========================================================================
// Nota: useHonorariosConfig es un hook COMPARTIDO (lo usan también analisis y
// analisis-marginal), vive en @/hooks, no se re-exporta acá.
export { default as HonorariosPage } from './pages/HonorariosPage';
export { default as DerivacionesLiquidacionPage } from './pages/DerivacionesLiquidacionPage';
export * from './liq-honorarios';
