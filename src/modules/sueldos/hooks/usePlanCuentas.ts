// ===========================================================================
// HOOK: usePlanCuentas - MODULO CARGA DE SUELDOS
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Lectura del plan de cuentas completo desde Supabase (tabla `plan_cuentas`)
// con cache local module-level para evitar refetch en cada montaje.
//
// API:
//   const {
//     cuentas,                  // PlanCuenta[] - todas
//     loading, error,
//     refetch,                  // forzar recarga desde la BD
//     filtrar,                  // (filtros) => PlanCuenta[]
//     buscarPorCodigo,          // (cta_codigo) => PlanCuenta | undefined
//     cuentasImputables,        // solo imputable === true
//     cuentasGastosSueldos,     // 4.1.1.0X imputables (para select de empleados)
//     cuentasPasivosSueldos,    // 2.1.2.x imputables
//     porCapitulo,              // (capitulo) => PlanCuenta[]
//     porPrefijo,               // (prefijo) => PlanCuenta[]
//     arbol,                    // PlanCuentaTreeNode[] - jerarquia completa
//   } = usePlanCuentas();
//
// Nota: el plan de cuentas es practicamente estatico (134 cuentas, cambia
// muy rara vez). La cache module-level dura toda la sesion del navegador.
// Llamar a refetch() despues de modificaciones manuales en la BD.
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';
import type {
  CapituloCuenta,
  PlanCuenta,
  PlanCuentaTreeNode,
} from '../types/sueldos';

// ---------------------------------------------------------------------------
// FILTROS DE CONSULTA
// ---------------------------------------------------------------------------

export interface FiltrosPlanCuentas {
  /** Busqueda libre por codigo o nombre (case-insensitive). */
  busqueda?: string;
  /** Capitulo contable (ACTIVO, PASIVO, ...). */
  capitulo?: CapituloCuenta;
  /** Solo imputables (true), solo agrupadoras (false), o ambas (undefined). */
  imputable?: boolean;
  /** Solo activas (true) o todas (false). Por defecto true. */
  soloActivas?: boolean;
  /** Filtro por prefijo de codigo (ej: '4.1.1' devuelve todas las de sueldos). */
  prefijoCodigo?: string;
}

// ---------------------------------------------------------------------------
// CACHE MODULE-LEVEL
// ---------------------------------------------------------------------------

/**
 * Cache compartida entre todas las instancias del hook.
 * Se invalida con refetch() o cuando expira el TTL.
 */
interface CacheEntry {
  data: PlanCuenta[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<PlanCuenta[]> | null = null;

/** TTL de la cache en ms. 30 minutos. El plan de cuentas casi no cambia. */
const CACHE_TTL_MS = 30 * 60 * 1000;

function isCacheValid(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

async function fetchPlanCuentas(force = false): Promise<PlanCuenta[]> {
  if (!force && isCacheValid() && cache) {
    return cache.data;
  }

  // Si hay una request en vuelo, esperarla en lugar de duplicar.
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    const { data, error } = await supabase
      .from('plan_cuentas')
      .select('*')
      .order('cta_codigo', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Error al cargar plan de cuentas');
    }

    const cuentas = (data || []) as PlanCuenta[];
    cache = { data: cuentas, fetchedAt: Date.now() };
    return cuentas;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Invalida la cache module-level. Util para tests o tras importaciones.
 */
export function invalidarCachePlanCuentas(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// HELPERS PUROS - exportados para uso en validaciones / generadores de asiento
// ---------------------------------------------------------------------------

function normalizar(s: string): string {
  // Quita acentos y diacriticos combinantes Unicode (U+0300 - U+036F).
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '');
}

export function aplicarFiltros(
  cuentas: PlanCuenta[],
  filtros: FiltrosPlanCuentas
): PlanCuenta[] {
  const {
    busqueda,
    capitulo,
    imputable,
    soloActivas = true,
    prefijoCodigo,
  } = filtros;

  const busquedaNorm = busqueda ? normalizar(busqueda.trim()) : '';

  return cuentas.filter((c) => {
    if (soloActivas && !c.activo) return false;
    if (capitulo && c.cap_id !== capitulo) return false;
    if (imputable !== undefined && c.imputable !== imputable) return false;
    if (prefijoCodigo && !c.cta_codigo.startsWith(prefijoCodigo)) return false;
    if (busquedaNorm) {
      const haystack = `${c.cta_codigo} ${normalizar(c.cta_nombre)}`;
      if (!haystack.includes(busquedaNorm)) return false;
    }
    return true;
  });
}

/**
 * Construye el arbol jerarquico a partir del plan plano usando `cta_codigo_madre`.
 * Las raices son cuentas sin madre.
 */
export function construirArbol(cuentas: PlanCuenta[]): PlanCuentaTreeNode[] {
  const porCodigo = new Map<string, PlanCuentaTreeNode>();
  for (const c of cuentas) {
    porCodigo.set(c.cta_codigo, { ...c, hijas: [], nivel: 0 });
  }

  const raices: PlanCuentaTreeNode[] = [];
  for (const nodo of porCodigo.values()) {
    if (nodo.cta_codigo_madre && porCodigo.has(nodo.cta_codigo_madre)) {
      porCodigo.get(nodo.cta_codigo_madre)!.hijas.push(nodo);
    } else {
      raices.push(nodo);
    }
  }

  // Asignar nivel y ordenar hijas por codigo
  const asignarNivel = (nodo: PlanCuentaTreeNode, nivel: number): void => {
    nodo.nivel = nivel;
    nodo.hijas.sort((a, b) => a.cta_codigo.localeCompare(b.cta_codigo));
    nodo.hijas.forEach((h) => asignarNivel(h, nivel + 1));
  };

  raices.sort((a, b) => a.cta_codigo.localeCompare(b.cta_codigo));
  raices.forEach((r) => asignarNivel(r, 0));

  return raices;
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

interface UsePlanCuentasReturn {
  cuentas: PlanCuenta[];
  loading: boolean;
  error: string | null;

  refetch: () => Promise<void>;

  /** Filtro generico. */
  filtrar: (filtros: FiltrosPlanCuentas) => PlanCuenta[];
  /** Busqueda exacta por codigo de cuenta. */
  buscarPorCodigo: (cta_codigo: string) => PlanCuenta | undefined;
  /** Filtro por capitulo (ACTIVO, PASIVO, etc.). */
  porCapitulo: (capitulo: CapituloCuenta) => PlanCuenta[];
  /** Filtro por prefijo de codigo. */
  porPrefijo: (prefijo: string) => PlanCuenta[];

  /** Solo cuentas imputables activas. */
  cuentasImputables: PlanCuenta[];
  /** Cuentas 4.1.1.0X imputables - para asignar al empleado. */
  cuentasGastosSueldos: PlanCuenta[];
  /** Cuentas 2.1.2.x imputables - pasivos de sueldos. */
  cuentasPasivosSueldos: PlanCuenta[];

  /** Arbol jerarquico completo. */
  arbol: PlanCuentaTreeNode[];
}

export function usePlanCuentas(): UsePlanCuentasReturn {
  const [cuentas, setCuentas] = useState<PlanCuenta[]>(cache?.data ?? []);
  const [loading, setLoading] = useState<boolean>(!isCacheValid());
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPlanCuentas(force);
      setCuentas(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      console.error('[usePlanCuentas] Error cargando plan de cuentas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Si la cache es valida y ya tenemos datos en estado, evitar refetch.
    if (isCacheValid() && cuentas.length > 0) {
      setLoading(false);
      return;
    }
    cargar(false);
  }, [cargar, cuentas.length]);

  const refetch = useCallback(async () => {
    invalidarCachePlanCuentas();
    await cargar(true);
  }, [cargar]);

  // --- Selectores derivados (memoizados) -----------------------------------

  const filtrar = useCallback(
    (filtros: FiltrosPlanCuentas) => aplicarFiltros(cuentas, filtros),
    [cuentas]
  );

  const buscarPorCodigo = useCallback(
    (cta_codigo: string) => cuentas.find((c) => c.cta_codigo === cta_codigo),
    [cuentas]
  );

  const porCapitulo = useCallback(
    (capitulo: CapituloCuenta) =>
      cuentas.filter((c) => c.cap_id === capitulo && c.activo),
    [cuentas]
  );

  const porPrefijo = useCallback(
    (prefijo: string) =>
      cuentas.filter((c) => c.cta_codigo.startsWith(prefijo) && c.activo),
    [cuentas]
  );

  const cuentasImputables = useMemo(
    () => cuentas.filter((c) => c.imputable && c.activo),
    [cuentas]
  );

  const cuentasGastosSueldos = useMemo(
    () =>
      cuentas.filter(
        (c) => c.cta_codigo.startsWith('4.1.1.0') && c.imputable && c.activo
      ),
    [cuentas]
  );

  const cuentasPasivosSueldos = useMemo(
    () =>
      cuentas.filter(
        (c) => c.cta_codigo.startsWith('2.1.2') && c.imputable && c.activo
      ),
    [cuentas]
  );

  const arbol = useMemo(() => construirArbol(cuentas), [cuentas]);

  return {
    cuentas,
    loading,
    error,
    refetch,
    filtrar,
    buscarPorCodigo,
    porCapitulo,
    porPrefijo,
    cuentasImputables,
    cuentasGastosSueldos,
    cuentasPasivosSueldos,
    arbol,
  };
}

export default usePlanCuentas;
