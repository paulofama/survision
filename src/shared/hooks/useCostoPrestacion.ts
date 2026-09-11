// ============================================================
// HOOK: useCostoPrestacion — qué consume una prestación
// ============================================================
//
// Envoltorio de React sobre `services/costoPrestacion`: cachea por práctica y
// maneja el ciclo de vida del pedido. La CONSULTA vive en el servicio, porque
// el Sobre Quirúrgico imprime la misma receta y se arma fuera de React: si cada
// uno tuviera su propia lectura, la pantalla y el papel podrían mostrar costos
// distintos para la misma práctica.
//
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
import { claveCodigo } from '@shared/utils/buscadorRecetas';
import { cargarCostoPrestacion, type CostoPrestacion } from '@shared/services/costoPrestacion';

export type {
  CostoPrestacion, PoolDeLaPractica, InsumoDeLaPractica,
} from '@shared/services/costoPrestacion';

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

const conRatio = (c: CostoPrestacion, facturado: number): CostoPrestacion => ({
  ...c,
  ratio: facturado > 0 && c.costoTotal > 0 ? facturado / c.costoTotal : null,
});

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
        : { costo: conRatio(enCache, facturado), loading: false, error: null, sinReceta: false });
      return;
    }

    const id = ++pedidoRef.current;
    setEstado({ ...VACIO, loading: true });

    (async () => {
      try {
        const armado = await cargarCostoPrestacion(codigo, nombre);
        cache.set(clave, armado ?? 'sin-receta');
        if (id !== pedidoRef.current) return;
        setEstado(armado
          ? { costo: conRatio(armado, facturado), loading: false, error: null, sinReceta: false }
          : { ...VACIO, sinReceta: true });
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
