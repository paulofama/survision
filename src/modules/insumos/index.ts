// ===========================================================================
// MÓDULO: Insumos y Costos — API pública
// ===========================================================================
// Nota: por ahora se migraron las páginas. Los hooks (usePools,
// useInsumosVariables, useRecetasCostos, useErogaciones) y tipos (pools,
// recetas) quedan en la capa compartida @/ — varios son cross-dominio
// (useRecetasCostos lo usa también analisis). Encapsular más adelante si aplica.
export { default as InsumosVariablesPage } from './pages/InsumosVariablesPage';
export { default as PoolsConfigPage } from './pages/PoolsConfigPage';
export { default as RecetasCostosPage } from './pages/RecetasCostosPage';
export { default as CostosFijosPage } from './pages/CostosFijosPage';
