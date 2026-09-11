// ============================================================
// Receta de costos de una práctica — carga compartida
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Qué consume una práctica: los pools que la alcanzan y los insumos directos
// con su cantidad y su precio. Es la MISMA lectura para los dos consumidores:
//
//   · el panel expandible de Prestaciones Realizadas (`useCostoPrestacion`), y
//   · la hoja de receta que va en el Sobre Quirúrgico.
//
// Vive acá y no dentro del hook porque el sobre se arma fuera de React y no
// puede usar hooks. Dos implementaciones de la misma consulta terminarían
// mostrando costos distintos para la misma práctica en la pantalla y en el
// papel, que es exactamente lo que no puede pasar con un documento que se firma.
//
// POR QUÉ EL COSTO ES "ESTÁNDAR" Y NO "LO QUE COSTÓ ESTA CIRUGÍA"
// ---------------------------------------------------------------
// La receta es por PRÁCTICA, no por atención: la facoemulsificación vale lo
// mismo en la que se facturó a $283.000 que en la de $6.513.000. Es lo que el
// modelo dice que consume esa práctica, no lo que costó ese acto puntual.
// ============================================================

import { supabase } from '../lib/supabase';
import { crearIndiceRecetas } from '../utils/buscadorRecetas';
import { traerTodo } from '../lib/traerTodo';

/** Un pool que alcanza a la práctica, con lo que le imputa. */
export interface PoolDeLaPractica {
  nombre: string;
  costo: number;
}

/** Un insumo directo de la receta. */
export interface InsumoDeLaPractica {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  costo: number;
}

export interface CostoPrestacion {
  /** Nombre de la receta que matcheó (puede diferir del nombre facturado). */
  nombreReceta: string;
  codigoReceta: string;
  pools: PoolDeLaPractica[];
  insumos: InsumoDeLaPractica[];
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  /** facturado / costo estándar. La calcula el consumidor que tenga el facturado. */
  ratio: number | null;
  /** Id de la receta, para linkear a la pantalla de edición. */
  recetaId: string | null;
}

/** Columnas de pool de la vista, con el nombre que se le muestra al usuario. */
const COLUMNAS_POOL: Array<[string, string]> = [
  ['costo_pool_consultorio', 'Consultorio'],
  ['costo_pool_quirofano', 'Quirófano'],
  ['costo_pool_parabulbar', 'Parabulbar'],
  ['costo_pool_rfg', 'RFG'],
  ['costo_pool_reesterilizables', 'Reesterilizables'],
  ['costo_pool_lavado', 'Lavado'],
  ['costo_pool_faco', 'Faco'],
  ['costo_pool_implante', 'Implante'],
  ['costo_pool_medicamentos', 'Medicamentos'],
  ['costo_pool_descartables', 'Descartables'],
];

/**
 * Trae el desglose del costo estándar de una práctica.
 *
 * @param codigo `practica_codigo` (manda el código; el nombre es respaldo)
 * @param nombre nombre de la práctica
 * @returns null si la práctica NO tiene receta cargada, que no es un error
 */
export async function cargarCostoPrestacion(
  codigo: string | null | undefined,
  nombre: string | null | undefined,
): Promise<CostoPrestacion | null> {
  // 1. Encontrar la receta. Mismo criterio que el resto del módulo: manda el
  //    código, el nombre es respaldo. Ver `buscadorRecetas`.
  const [vista, alias] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    traerTodo<any>((d) => supabase
      .from('v_recetas_costos_por_pool')
      .select('*')
      .range(d, d + 999)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    traerTodo<any>((d) => supabase
      .from('prestaciones_nombre_mapping')
      .select('nombre_geclisa, nombre_receta')
      .range(d, d + 999)),
  ]);

  const receta = crearIndiceRecetas(vista, alias).buscar(codigo, nombre);
  if (!receta) return null;

  // 2. Insumos directos de esa receta, con precio y cantidad.
  const { data: det, error: errDet } = await supabase
    .from('receta_insumos_directos')
    .select('cantidad_por_practica, insumos_variables ( codigo, descripcion, precio_unitario )')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('receta_id', (receta as any).receta_id)
    .eq('activo', true);
  if (errDet) throw new Error(errDet.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insumos: InsumoDeLaPractica[] = (det || []).map((d: any) => {
    const cantidad = Number(d.cantidad_por_practica) || 0;
    const precioUnitario = Number(d.insumos_variables?.precio_unitario) || 0;
    return {
      codigo: String(d.insumos_variables?.codigo ?? ''),
      descripcion: String(d.insumos_variables?.descripcion ?? 'Sin descripción'),
      cantidad,
      precioUnitario,
      costo: cantidad * precioUnitario,
    };
  }).sort((a, b) => b.costo - a.costo);

  // 3. Pools: la vista ya trae una columna por pool.
  const pools: PoolDeLaPractica[] = COLUMNAS_POOL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map(([col, nombrePool]) => ({ nombre: nombrePool, costo: Number((receta as any)[col]) || 0 }))
    .filter((p) => p.costo > 0)
    .sort((a, b) => b.costo - a.costo);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = receta as any;
  const costoPools = Number(r.costo_total_pools) || 0;

  // EL DESGLOSE TIENE QUE SUMAR EL TOTAL
  // ------------------------------------
  // `costo_total_pools` suma TODOS los pools de la receta, pero las columnas
  // por pool salen de un ILIKE por nombre, y ese ILIKE NO IGNORA ACENTOS: el
  // pool "Insumos Generales en Quirófano" no matchea el patrón '%quirofano%',
  // así que su costo entra en el total y en ninguna columna.
  //
  // Medido el 10/09/2026: pasa en 54 de 103 recetas, $104.288,49 acumulados.
  // En la faco con LIO monofocal son $1.931,27 sobre $4.741,89 de pools.
  //
  // El arreglo de fondo es la vista (los patrones deberían contemplar el
  // acento), y no cambia ningún costo total: sólo reparte mejor el detalle.
  // Hasta que se aplique, el residuo se muestra como una línea propia en vez
  // de desaparecer: un desglose que no suma el total vuelve sospechoso todo el
  // documento, y acá encima se firma.
  const sumaDetalle = pools.reduce((s, p) => s + p.costo, 0);
  const residuo = costoPools - sumaDetalle;
  if (residuo > 0.01) pools.push({ nombre: 'Otros pools', costo: residuo });
  const costoInsumos = Number(r.costo_insumos_directos) || 0;

  return {
    nombreReceta: String(r.nombre_practica ?? ''),
    codigoReceta: String(r.codigo_practica ?? ''),
    pools,
    insumos,
    costoPools,
    costoInsumos,
    costoTotal: costoPools + costoInsumos,
    ratio: null,
    recetaId: r.receta_id ?? null,
  };
}

export default cargarCostoPrestacion;
