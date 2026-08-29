// ============================================================
// BUSCADOR DE RECETAS — cruce prestación facturada ↔ receta de costo
// ============================================================
//
// MANDA EL CÓDIGO DE PRÁCTICA, NO EL NOMBRE
// -----------------------------------------
// Cada prestación facturada en GECLISA trae `practica_codigo`, y cada receta
// de `practicas_recetas` tiene `codigo_practica`. Son el mismo código. Cruzar
// por ahí es exacto; cruzar por nombre es una heurística que falla.
//
// POR QUÉ FALLA EL NOMBRE (medido el 27/08/2026)
// ----------------------------------------------
// El extractor del espejo corta el nombre en el primer paréntesis
// (`movimientosExtractor.js:59`), y ahí se pierde justo la variante que define
// el costo:
//
//   Nomenclador GECLISA                          espejo              receta
//   "Vitrectomia ... (Con Implante)"   030606  → "Vitrectomia ..."   $682.152
//   "Vitrectomia ... (Sin Implante)"   030614  → "Vitrectomia ..."   $392.852
//   "Cirugia de Pterigion (Con Injerto)" 030409 → "Cirugia de Pter…"
//   "Cirugia de Pterigion (Doble Monocular)" 030411 → idem
//   "Excimer PRK Bilateral (Dr Mercado)" 030102 → "Excimer PRK Bil…"
//   "Excimer PRK Bilateral (Dr Roca)"    030104 → idem
//
// Dos códigos con costos distintos colapsan en un solo nombre, así que el
// cruce por nombre no puede distinguirlos: elige el primero que encuentra y
// puede asignar la variante equivocada. Le pasó a la vitrectomía.
//
// CUÁNTO CAMBIA (sobre $870.745.862 facturados en 2026)
// -----------------------------------------------------
//   por nombre + alias:   82,6% de cobertura
//   por código:           97,5%   → $14.201.006 de costo que antes no se veía
//
// Y resuelve dos definiciones que parecían trabadas: lo facturado va con
// código 030601 = ANTIANGIOGÉNICOS (AVASTIN); del 030602 (EYLIA) no se facturó
// nada. Igual la vitrectomía: 030606 con implante, 030614 sin implante.
//
// EL NOMBRE SIGUE COMO RESPALDO
// -----------------------------
// Para prestaciones sin código utilizable (los nomencladores 30xxxx y 46xxxx
// de 2024) y para las recetas cargadas sin código. Ahí siguen valiendo los
// alias de `prestaciones_nombre_mapping`, que además resuelven diferencias de
// separación de palabras que la normalización no cubre ("EXO OFTALMOLOGÍA" vs
// "Exoftalmologia").
// ============================================================

import { normalizarNombre } from './nombresPrestaciones';

/** Lo mínimo que necesita una receta para ser indexada. */
export interface RecetaIndexable {
  codigo_practica?: string | null;
  nombre_practica?: string | null;
}

/** Fila de `prestaciones_nombre_mapping`. */
export interface AliasNombre {
  nombre_geclisa?: string | null;
  nombre_receta?: string | null;
}

export interface IndiceRecetas<T> {
  /** Receta de una prestación. El código manda; el nombre es respaldo. */
  buscar(codigo: string | null | undefined, nombre: string | null | undefined): T | null;
  /** ¿Esta prestación tiene receta? */
  tiene(codigo: string | null | undefined, nombre: string | null | undefined): boolean;
  /** Cuántas recetas quedaron indexadas por código. */
  readonly cantidadPorCodigo: number;
}

/**
 * Normaliza un código de práctica a 6 dígitos.
 * Conviven códigos de 5 y 6: los de 5 son el mismo sin el cero inicial
 * (`10102` = `010102`). Sin rellenar, no cruzarían.
 */
export const claveCodigo = (codigo: string | null | undefined): string => {
  const c = String(codigo ?? '').trim();
  return c ? c.padStart(6, '0') : '';
};

/**
 * Arma el índice de recetas para cruzar contra lo facturado.
 *
 * @param recetas filas de `v_recetas_costos_por_pool` (trae `codigo_practica`)
 * @param alias   filas de `prestaciones_nombre_mapping`, para el respaldo por nombre
 */
export function crearIndiceRecetas<T extends RecetaIndexable>(
  recetas: T[],
  alias: AliasNombre[] = [],
): IndiceRecetas<T> {
  const porCodigo = new Map<string, T>();
  const porNombre = new Map<string, T>();

  for (const r of recetas) {
    const cod = claveCodigo(r.codigo_practica);
    // La primera gana: si hubiera dos recetas con el mismo código, quedarse
    // con una es arbitrario, pero pisar sería peor (el orden de la vista no
    // significa nada).
    if (cod && !porCodigo.has(cod)) porCodigo.set(cod, r);

    const nom = normalizarNombre(r.nombre_practica);
    if (nom && !porNombre.has(nom)) porNombre.set(nom, r);
  }

  // Los alias solo alimentan el respaldo por nombre.
  for (const a of alias) {
    const destino = porNombre.get(normalizarNombre(a.nombre_receta));
    const origen = normalizarNombre(a.nombre_geclisa);
    if (destino && origen && !porNombre.has(origen)) porNombre.set(origen, destino);
  }

  const buscar = (codigo: string | null | undefined, nombre: string | null | undefined): T | null => {
    const porCod = porCodigo.get(claveCodigo(codigo));
    if (porCod) return porCod;
    return porNombre.get(normalizarNombre(nombre)) ?? null;
  };

  return {
    buscar,
    tiene: (codigo, nombre) => buscar(codigo, nombre) !== null,
    cantidadPorCodigo: porCodigo.size,
  };
}
