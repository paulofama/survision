// ===========================================================================
// MÓDULO: Análisis (costos) — API pública
// ===========================================================================
// Nota: hooks (useMovimientosPrestaciones, useEvolucionMensual, usePrestaciones)
// son COMPARTIDOS y viven en @/.
//
// La Evolución Temporal de este módulo se dio de baja el 30/08/2026 junto con el
// proxy /api que nunca funcionó; la vigente es la del Análisis Marginal
// (/analisis-marginal/evolucion). Su página y lib/apiAnalisis se borraron el
// 16/09/2026: no estaban ruteadas ni las importaba nadie.
export { default as DashboardAnalisisPage } from './pages/DashboardAnalisisPage';
export { default as AnalisisPorObraSocialPage } from './pages/AnalisisPorObraSocialPage';
export { default as AnalisisPorPrestadorPage } from './pages/AnalisisPorPrestadorPage';
export { default as AnalisisPorPrestacionPage } from './pages/AnalisisPorPrestacionPage';
export { default as AnalisisPorGrupoPage } from './pages/AnalisisPorGrupoPage';
