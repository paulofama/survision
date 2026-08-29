// ============================================================
// HOOK: useCostoPrestacion — qué consume una prestación
// ============================================================
//
// Trae, bajo demanda, el desglose del costo estándar de UNA práctica: los
// pools que la alcanzan y los insumos directos con su cantidad y precio.
// Lo consume el panel expandible de Prestaciones Realizadas.
//
// POR QUÉ "ESTÁNDAR" Y NO "LO QUE COSTÓ ESTA CIRUGÍA"
// ---------------------------------------------------
// La receta es por PRÁCTICA, no por atención. La facoemulsificación vale
// $212.340 tanto en la que se facturó a $283.000 (arancel OSEP) como en la de
// $6.513.000. No es lo que costó ese acto: es lo que el modelo dice que
// consume esa práctica. La UI tiene que decirlo así o alguien va a leer el
// número como el costo real del caso.
//
// LA SEÑAL DE DESPROPORCIÓN
// -------------------------
// Justamente porque el costo es fijo por práctica, cuando lo facturado se va
// muy por encima suele significar que se usó un insumo más caro que el de la
// receta. El caso testigo son las cataratas: las 47 de 2026 están cargadas con
// el código de LIO Básico (insumo "CT LUCIA", $126.000) y van de $283.000 a
// $6.513.000. Una de $6,5 M no lleva ese lente — lleva un PanOptix o un Vivity,
// que cuestan diez veces más y tienen su propio código en GECLISA.
//
// `ratio` expone eso sin interpretarlo: es facturado / costo estándar. La
// pantalla decide a partir de qué valor lo marca.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { crearIndiceRecetas, claveCodigo } from '@shared/utils/buscadorRecetas';
import { traerTodo } from '@shared/lib/traerTodo';

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
  /** facturado / costo estándar. null si no hay costo o no hay facturado. */
  ratio: number | null;
  /** Id de la receta, para linkear a la pantalla de edición. */
  recetaId: string | null;
}

export interface ResultadoCostoPrestacion {
  costo: CostoPrestacion | null;
  loading: boolean;
  error: string | null;
  /** True cuando la práctica no tiene receta cargada: no es un error. */
  sinReceta: boolean;
}

const VACIO: ResultadoCostoPrestacion = { costo: null, loading: false, error: null, sinReceta: false };

/** Cache a nivel módulo, por código+nombre. La receta no cambia entre filas. */
const cache = new Map<string, CostoPrestacion | 'sin-receta'>();

/** La invalida la pantalla de recetas cuando se edita una. */
export const invalidarCacheCostoPrestacion = (): void => { cache.clear(); };

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
 * @param codigo    `practica_codigo` de la prestación facturada
 * @param nombre    nombre de la práctica (respaldo si el código no cruza)
 * @param facturado importe de la atención, para calcular el ratio
 * @param activo    false = no consulta nada (la fila está colapsada)
 */
export function useCostoPrestacion(
  codigo: string | null | undefined,
  nombre: string | null | undefined,
  facturado: number,
  activo: boolean,
): ResultadoCostoPrestacion {
  const [estado, setEstado] = useState<ResultadoCostoPrestacion>(VACIO);
  const pedidoRef = useRef(0);

  useEffect(() => {
    if (!activo) { setEstado(VACIO); return; }

    const clave = `${claveCodigo(codigo)}|${nombre ?? ''}`;
    const enCache = cache.get(clave);
    if (enCache) {
      setEstado(enCache === 'sin-receta'
        ? { ...VACIO, sinReceta: true }
        : { costo: { ...enCache, ratio: facturado > 0 && enCache.costoTotal > 0 ? facturado / enCache.costoTotal : null }, loading: false, error: null, sinReceta: false });
      return;
    }

    const id = ++pedidoRef.current;
    setEstado({ ...VACIO, loading: true });

    (async () => {
      try {
        // 1. Encontrar la receta. Mismo criterio que el resto del módulo:
        //    manda el código, el nombre es respaldo. Ver `buscadorRecetas`.
        const [vista, alias] = await Promise.all([
          traerTodo<any>((d) => supabase
            .from('v_recetas_costos_por_pool')
            .select('*')
            .range(d, d + 999)),
          traerTodo<any>((d) => supabase
            .from('prestaciones_nombre_mapping')
            .select('nombre_geclisa, nombre_receta')
            .range(d, d + 999)),
        ]);

        const receta = crearIndiceRecetas(vista, alias).buscar(codigo, nombre);
        if (!receta) {
          cache.set(clave, 'sin-receta');
          if (id === pedidoRef.current) setEstado({ ...VACIO, sinReceta: true });
          return;
        }

        // 2. Insumos directos de esa receta, con precio y cantidad.
        const { data: det, error: errDet } = await supabase
          .from('receta_insumos_directos')
          .select('cantidad_por_practica, insumos_variables ( codigo, descripcion, precio_unitario )')
          .eq('receta_id', (receta as any).receta_id)
          .eq('activo', true);
        if (errDet) throw new Error(errDet.message);

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
          .map(([col, nombrePool]) => ({ nombre: nombrePool, costo: Number((receta as any)[col]) || 0 }))
          .filter((p) => p.costo > 0)
          .sort((a, b) => b.costo - a.costo);

        const costoPools = Number((receta as any).costo_total_pools) || 0;
        const costoInsumos = Number((receta as any).costo_insumos_directos) || 0;
        const costoTotal = costoPools + costoInsumos;

        const armado: CostoPrestacion = {
          nombreReceta: String((receta as any).nombre_practica ?? ''),
          codigoReceta: String((receta as any).codigo_practica ?? ''),
          pools,
          insumos,
          costoPools,
          costoInsumos,
          costoTotal,
          ratio: null,
          recetaId: (receta as any).receta_id ?? null,
        };
        cache.set(clave, armado);

        if (id === pedidoRef.current) {
          setEstado({
            costo: { ...armado, ratio: facturado > 0 && costoTotal > 0 ? facturado / costoTotal : null },
            loading: false,
            error: null,
            sinReceta: false,
          });
        }
      } catch (e) {
        if (id === pedidoRef.current) {
          setEstado({ ...VACIO, loading: false, error: e instanceof Error ? e.message : 'No se pudo cargar el costo' });
        }
      }
    })();
  }, [activo, codigo, nombre, facturado]);

  return estado;
}

export default useCostoPrestacion;
