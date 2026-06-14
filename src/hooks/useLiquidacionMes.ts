// ===========================================================================
// HOOK: useLiquidacionMes - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Hook por mes (recibe anio, mes). Carga la LiquidacionMes con sus bloques
// y lineas anidadas; expone CRUD sobre cada nivel, calculos de cuadre, y
// transiciones del flujo de estado (incluyendo cierre y reapertura).
//
// API resumida:
//   const {
//     liquidacion,                  // LiquidacionMesCompleta | null
//     loading, error, refetch,
//
//     // Iniciacion del mes
//     existeEnBD,                   // true si ya hay fila en liquidaciones_mes
//     inicializarMes,               // crea fila + 4 bloques estables
//
//     // CRUD bloque
//     agregarBloqueDiaSanidad,
//     actualizarBloque,
//     eliminarBloqueDiaSanidad,
//     marcarBloqueCompleto,
//
//     // CRUD lineas por empleado
//     agregarLineaEmpleado,
//     actualizarLineaEmpleado,
//     eliminarLineaEmpleado,
//
//     // CRUD lineas por concepto
//     agregarLineaConcepto,
//     actualizarLineaConcepto,
//     eliminarLineaConcepto,
//
//     // Calculos derivados
//     resumen,                      // ResumenLiquidacionMes
//     bloquePorTipo,                // (tipo) => LiquidacionBloqueCompleto | undefined
//
//     // Flujo de estado
//     puedeAvanzar,
//     avanzarEstado,
//     puedeCerrar,
//     cerrarMes,                    // (confirmacion: 'CONFIRMAR', cerradoPorNombre?) => ResultadoOperacion
//     reabrirMes,                   // (justificacion, reabiertoPorNombre?) => ResultadoOperacion
//   } = useLiquidacionMes(2026, 5);
//
// Nota: no setea `updated_at` en INSERT/UPDATE (triggers de la migracion lo hacen).
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type {
  EstadoLiquidacion,
  LiquidacionBloque,
  LiquidacionBloqueCompleto,
  LiquidacionLineaConcepto,
  LiquidacionLineaConceptoActualizacion,
  LiquidacionLineaConceptoNueva,
  LiquidacionLineaEmpleado,
  LiquidacionLineaEmpleadoActualizacion,
  LiquidacionLineaEmpleadoNueva,
  LiquidacionMes,
  LiquidacionMesCompleta,
  MedioPago,
  ResumenBloque,
  ResumenLiquidacionMes,
  ResultadoOperacion,
  TipoBloque,
  TransicionEstado,
} from '../types/sueldos';
import {
  CUENTAS_ACTIVOS,
  UMBRAL_REDONDEO_ABS,
} from '../utils/sueldos/constantes';

// ---------------------------------------------------------------------------
// CACHE MODULE-LEVEL
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: LiquidacionMesCompleta | null;
  existeEnBD: boolean;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ data: LiquidacionMesCompleta | null; existeEnBD: boolean }>>();

/** TTL de la cache: 90 segundos. Se invalida en cada CUD del mes. */
const CACHE_TTL_MS = 90 * 1000;

function cacheKey(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function isCacheValid(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/** Invalida la cache de un mes especifico (o de todos si no se pasa). */
export function invalidarCacheLiquidacion(anio?: number, mes?: number): void {
  if (anio === undefined || mes === undefined) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(anio, mes));
}

// ---------------------------------------------------------------------------
// CONSULTA: cargar mes con bloques y lineas
// ---------------------------------------------------------------------------

async function fetchLiquidacionMes(
  anio: number,
  mes: number,
  force = false
): Promise<{ data: LiquidacionMesCompleta | null; existeEnBD: boolean }> {
  const key = cacheKey(anio, mes);

  if (!force && isCacheValid(key)) {
    const c = cache.get(key)!;
    return { data: c.data, existeEnBD: c.existeEnBD };
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    // 1. Buscar la liquidacion del mes
    const { data: liqRow, error: liqError } = await supabase
      .from('liquidaciones_mes')
      .select('*')
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle();

    if (liqError) {
      throw new Error(liqError.message || 'Error cargando liquidacion del mes');
    }

    if (!liqRow) {
      cache.set(key, { data: null, existeEnBD: false, fetchedAt: Date.now() });
      return { data: null as LiquidacionMesCompleta | null, existeEnBD: false };
    }

    const liquidacionId = (liqRow as LiquidacionMes).id;

    // 2. Bloques del mes
    const { data: bloquesRows, error: blqError } = await supabase
      .from('liquidacion_bloques')
      .select('*')
      .eq('liquidacion_id', liquidacionId);

    if (blqError) {
      throw new Error(blqError.message || 'Error cargando bloques');
    }

    const bloques = (bloquesRows || []) as LiquidacionBloque[];
    const bloqueIds = bloques.map((b) => b.id);

    // 3. Lineas (paralelo)
    const [lineasEmpResult, lineasConcResult] = bloqueIds.length === 0
      ? [
          { data: [] as LiquidacionLineaEmpleado[], error: null },
          { data: [] as LiquidacionLineaConcepto[], error: null },
        ]
      : await Promise.all([
          supabase.from('liquidacion_lineas_empleado').select('*').in('bloque_id', bloqueIds),
          supabase.from('liquidacion_lineas_concepto').select('*').in('bloque_id', bloqueIds),
        ]);

    if (lineasEmpResult.error) {
      throw new Error(lineasEmpResult.error.message || 'Error cargando lineas por empleado');
    }
    if (lineasConcResult.error) {
      throw new Error(lineasConcResult.error.message || 'Error cargando lineas por concepto');
    }

    const lineasEmp = (lineasEmpResult.data || []) as LiquidacionLineaEmpleado[];
    const lineasConc = (lineasConcResult.data || []) as LiquidacionLineaConcepto[];

    // 4. Componer estructura anidada
    const bloquesCompletos: LiquidacionBloqueCompleto[] = bloques.map((b) => ({
      ...b,
      lineas_empleado: lineasEmp.filter((l) => l.bloque_id === b.id),
      lineas_concepto: lineasConc.filter((l) => l.bloque_id === b.id),
    }));

    const data: LiquidacionMesCompleta = {
      ...(liqRow as LiquidacionMes),
      bloques: bloquesCompletos,
    };

    cache.set(key, { data, existeEnBD: true, fetchedAt: Date.now() });
    return { data, existeEnBD: true };
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// HELPERS PUROS (exportados)
// ---------------------------------------------------------------------------

/**
 * Defaults de los 4 bloques estables creados al inicializar un mes.
 * (`dia_sanidad` es ocasional y se agrega manualmente.)
 */
export function bloquesInicialesDefault(liquidacionId: string): Array<{
  liquidacion_id: string;
  tipo: TipoBloque;
  medio_pago: MedioPago;
  cuenta_contracuenta: string;
  completo: boolean;
}> {
  return [
    {
      liquidacion_id: liquidacionId,
      tipo: 'pago_sueldos',
      medio_pago: 'banco_santander_rio',
      cuenta_contracuenta: CUENTAS_ACTIVOS.BANCO_SANTANDER_RIO,
      completo: false,
    },
    {
      liquidacion_id: liquidacionId,
      tipo: 'horas_complementarias',
      medio_pago: 'caja',
      cuenta_contracuenta: CUENTAS_ACTIVOS.CAJA,
      completo: false,
    },
    {
      liquidacion_id: liquidacionId,
      tipo: 'seguridad_social',
      medio_pago: 'banco_santander_rio',
      cuenta_contracuenta: CUENTAS_ACTIVOS.BANCO_SANTANDER_RIO,
      completo: false,
    },
    {
      liquidacion_id: liquidacionId,
      tipo: 'sindicato',
      medio_pago: 'banco_santander_rio',
      cuenta_contracuenta: CUENTAS_ACTIVOS.BANCO_SANTANDER_RIO,
      completo: false,
    },
  ];
}

/**
 * Calcula el resumen de un bloque a partir de sus lineas.
 */
export function calcularResumenBloque(bloque: LiquidacionBloqueCompleto): ResumenBloque {
  const usaLineasEmpleado = bloque.tipo === 'pago_sueldos'
    || bloque.tipo === 'horas_complementarias'
    || bloque.tipo === 'dia_sanidad';

  const totalCalculado = usaLineasEmpleado
    ? bloque.lineas_empleado.reduce((s, l) => s + Number(l.monto_neto_cargado || 0), 0)
    : bloque.lineas_concepto.reduce((s, l) => s + Number(l.monto || 0), 0);

  const totalDeclarado = bloque.total_declarado;
  const diferencia = totalDeclarado === null ? null : totalCalculado - Number(totalDeclarado);
  const cuadra = diferencia === null
    ? false
    : Math.abs(diferencia) < UMBRAL_REDONDEO_ABS;

  return {
    bloque_id: bloque.id,
    tipo: bloque.tipo,
    total_calculado: totalCalculado,
    total_declarado: totalDeclarado,
    diferencia,
    cuadra,
    cantidad_lineas: usaLineasEmpleado
      ? bloque.lineas_empleado.length
      : bloque.lineas_concepto.length,
    completo: bloque.completo,
  };
}

/**
 * Calcula el resumen agregado del mes completo.
 */
export function calcularResumenMes(liq: LiquidacionMesCompleta): ResumenLiquidacionMes {
  const bloquesResumen = liq.bloques.map(calcularResumenBloque);
  return {
    liquidacion_id: liq.id,
    anio: liq.anio,
    mes: liq.mes,
    estado: liq.estado,
    bloques: bloquesResumen,
    total_general_calculado: bloquesResumen.reduce((s, b) => s + b.total_calculado, 0),
    total_general_declarado: bloquesResumen.reduce(
      (s, b) => s + Number(b.total_declarado || 0),
      0
    ),
    cantidad_bloques_completos: bloquesResumen.filter((b) => b.completo).length,
    cantidad_bloques_totales: bloquesResumen.length,
  };
}

/**
 * Valida una transicion de estado segun el flujo definido.
 * Fase 2 cubre transiciones hasta MINUTA_COMPLETA + cierre/reapertura.
 * Las transiciones que dependen de F.931 y asiento se validan plenamente en Fase 3-4.
 */
export function puedeTransicionar(
  desde: EstadoLiquidacion,
  hacia: EstadoLiquidacion
): TransicionEstado {
  // Reapertura: requiere justificacion
  if (desde === 'CERRADO' && hacia !== 'CERRADO') {
    return {
      desde,
      hacia,
      permitida: true,
      requiere_justificacion: true,
      razon: 'Reapertura desde CERRADO requiere justificacion obligatoria.',
    };
  }

  // Cierre: solo desde ASIENTO_GENERADO (estricto) o desde CONCILIADO (permisivo)
  if (hacia === 'CERRADO') {
    const permitida = desde === 'ASIENTO_GENERADO' || desde === 'CONCILIADO';
    return {
      desde,
      hacia,
      permitida,
      requiere_justificacion: false,
      razon: permitida ? undefined : 'Solo se puede cerrar desde ASIENTO_GENERADO o CONCILIADO.',
    };
  }

  // Transiciones lineales (forward)
  const orden: EstadoLiquidacion[] = [
    'VACIO', 'MINUTA_EN_CARGA', 'MINUTA_COMPLETA',
    'F931_CARGADO', 'CONCILIADO', 'ASIENTO_GENERADO',
  ];
  const idxDesde = orden.indexOf(desde);
  const idxHacia = orden.indexOf(hacia);

  if (idxDesde < 0 || idxHacia < 0) {
    return { desde, hacia, permitida: false, requiere_justificacion: false, razon: 'Estado fuera de rango.' };
  }
  if (idxHacia === idxDesde + 1) {
    return { desde, hacia, permitida: true, requiere_justificacion: false };
  }
  if (idxHacia === idxDesde) {
    return { desde, hacia, permitida: true, requiere_justificacion: false, razon: 'Sin cambio.' };
  }

  return {
    desde, hacia,
    permitida: false,
    requiere_justificacion: false,
    razon: `Transicion no permitida (de ${desde} a ${hacia}).`,
  };
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

interface UseLiquidacionMesReturn {
  liquidacion: LiquidacionMesCompleta | null;
  existeEnBD: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  // Inicializacion
  inicializarMes: (observaciones?: string) => Promise<ResultadoOperacion<LiquidacionMesCompleta>>;

  // CRUD bloque
  agregarBloqueDiaSanidad: () => Promise<ResultadoOperacion<LiquidacionBloque>>;
  actualizarBloque: (
    bloqueId: string,
    cambios: Partial<Pick<LiquidacionBloque, 'medio_pago' | 'cuenta_contracuenta' | 'total_declarado' | 'completo' | 'observaciones'>>
  ) => Promise<ResultadoOperacion<LiquidacionBloque>>;
  eliminarBloqueDiaSanidad: () => Promise<ResultadoOperacion<void>>;
  marcarBloqueCompleto: (bloqueId: string, completo: boolean) => Promise<ResultadoOperacion<LiquidacionBloque>>;

  // CRUD lineas empleado
  agregarLineaEmpleado: (linea: LiquidacionLineaEmpleadoNueva) => Promise<ResultadoOperacion<LiquidacionLineaEmpleado>>;
  actualizarLineaEmpleado: (id: string, cambios: LiquidacionLineaEmpleadoActualizacion) => Promise<ResultadoOperacion<LiquidacionLineaEmpleado>>;
  eliminarLineaEmpleado: (id: string) => Promise<ResultadoOperacion<void>>;

  // CRUD lineas concepto
  agregarLineaConcepto: (linea: LiquidacionLineaConceptoNueva) => Promise<ResultadoOperacion<LiquidacionLineaConcepto>>;
  actualizarLineaConcepto: (id: string, cambios: LiquidacionLineaConceptoActualizacion) => Promise<ResultadoOperacion<LiquidacionLineaConcepto>>;
  eliminarLineaConcepto: (id: string) => Promise<ResultadoOperacion<void>>;

  // Derivados
  resumen: ResumenLiquidacionMes | null;
  bloquePorTipo: (tipo: TipoBloque) => LiquidacionBloqueCompleto | undefined;

  // Flujo de estado
  puedeAvanzar: boolean;
  avanzarEstado: () => Promise<ResultadoOperacion<LiquidacionMes>>;
  puedeCerrar: boolean;
  cerrarMes: (confirmacion: string, cerradoPorNombre?: string) => Promise<ResultadoOperacion<LiquidacionMes>>;
  reabrirMes: (justificacion: string, reabiertoPorNombre?: string) => Promise<ResultadoOperacion<LiquidacionMes>>;
}

export function useLiquidacionMes(
  anio: number,
  mes: number
): UseLiquidacionMesReturn {
  const key = cacheKey(anio, mes);
  const initial = cache.get(key);

  const [liquidacion, setLiquidacion] = useState<LiquidacionMesCompleta | null>(
    initial?.data ?? null
  );
  const [existeEnBD, setExisteEnBD] = useState<boolean>(initial?.existeEnBD ?? false);
  const [loading, setLoading] = useState<boolean>(!isCacheValid(key));
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const { data, existeEnBD: existe } = await fetchLiquidacionMes(anio, mes, force);
      setLiquidacion(data);
      setExisteEnBD(existe);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      console.error(`[useLiquidacionMes ${anio}-${mes}] Error:`, err);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    if (isCacheValid(key) && cache.get(key)?.data !== undefined) {
      const c = cache.get(key)!;
      setLiquidacion(c.data);
      setExisteEnBD(c.existeEnBD);
      setLoading(false);
      return;
    }
    cargar(false);
  }, [key, cargar]);

  const refetch = useCallback(async () => {
    invalidarCacheLiquidacion(anio, mes);
    await cargar(true);
  }, [anio, mes, cargar]);

  // ----- Inicializacion -----------------------------------------------------

  const inicializarMes = useCallback(async (
    observaciones?: string
  ): Promise<ResultadoOperacion<LiquidacionMesCompleta>> => {
    if (existeEnBD) {
      return { ok: false, error: 'El mes ya esta inicializado' };
    }

    try {
      // 1. Crear liquidaciones_mes
      const { data: liqRow, error: liqError } = await supabase
        .from('liquidaciones_mes')
        .insert({
          anio,
          mes,
          estado: 'VACIO',
          observaciones: observaciones?.trim() || null,
        })
        .select()
        .single();

      if (liqError) return { ok: false, error: liqError.message, codigo: liqError.code };

      const liquidacionId = (liqRow as LiquidacionMes).id;

      // 2. Crear los 4 bloques estables
      const bloquesPayload = bloquesInicialesDefault(liquidacionId);
      const { error: blqError } = await supabase
        .from('liquidacion_bloques')
        .insert(bloquesPayload);

      if (blqError) {
        // Cleanup: borrar la liquidacion para no dejar datos huerfanos
        await supabase.from('liquidaciones_mes').delete().eq('id', liquidacionId);
        return { ok: false, error: blqError.message, codigo: blqError.code };
      }

      await refetch();
      // El refetch carga el mes recien creado; devolvemos lo que quedo cacheado
      const ahora = cache.get(key);
      if (!ahora?.data) {
        return { ok: false, error: 'Mes creado pero no se pudo recargar' };
      }
      return { ok: true, data: ahora.data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      return { ok: false, error: msg };
    }
  }, [anio, mes, existeEnBD, key, refetch]);

  // ----- CRUD bloque --------------------------------------------------------

  const agregarBloqueDiaSanidad = useCallback(async (): Promise<ResultadoOperacion<LiquidacionBloque>> => {
    if (!liquidacion) return { ok: false, error: 'El mes no esta inicializado' };
    if (liquidacion.bloques.some((b) => b.tipo === 'dia_sanidad')) {
      return { ok: false, error: 'El bloque Dia de la Sanidad ya existe' };
    }

    const { data, error: err } = await supabase
      .from('liquidacion_bloques')
      .insert({
        liquidacion_id: liquidacion.id,
        tipo: 'dia_sanidad',
        medio_pago: 'caja',
        cuenta_contracuenta: CUENTAS_ACTIVOS.CAJA,
        completo: false,
      })
      .select()
      .single();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    await refetch();
    return { ok: true, data: data as LiquidacionBloque };
  }, [liquidacion, refetch]);

  const actualizarBloque = useCallback(async (
    bloqueId: string,
    cambios: Partial<Pick<LiquidacionBloque, 'medio_pago' | 'cuenta_contracuenta' | 'total_declarado' | 'completo' | 'observaciones'>>
  ): Promise<ResultadoOperacion<LiquidacionBloque>> => {
    const { data, error: err } = await supabase
      .from('liquidacion_bloques')
      .update(cambios)
      .eq('id', bloqueId)
      .select()
      .maybeSingle();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    if (!data) return { ok: false, error: 'Bloque no encontrado' };
    await refetch();
    return { ok: true, data: data as LiquidacionBloque };
  }, [refetch]);

  const eliminarBloqueDiaSanidad = useCallback(async (): Promise<ResultadoOperacion<void>> => {
    if (!liquidacion) return { ok: false, error: 'El mes no esta inicializado' };
    const bloque = liquidacion.bloques.find((b) => b.tipo === 'dia_sanidad');
    if (!bloque) return { ok: false, error: 'No existe bloque Dia de la Sanidad' };

    const { error: err } = await supabase
      .from('liquidacion_bloques')
      .delete()
      .eq('id', bloque.id);

    if (err) return { ok: false, error: err.message, codigo: err.code };
    await refetch();
    return { ok: true, data: undefined };
  }, [liquidacion, refetch]);

  const marcarBloqueCompleto = useCallback(async (
    bloqueId: string,
    completo: boolean
  ): Promise<ResultadoOperacion<LiquidacionBloque>> => {
    return actualizarBloque(bloqueId, { completo });
  }, [actualizarBloque]);

  // ----- CRUD lineas empleado ----------------------------------------------

  const agregarLineaEmpleado = useCallback(async (
    linea: LiquidacionLineaEmpleadoNueva
  ): Promise<ResultadoOperacion<LiquidacionLineaEmpleado>> => {
    const payload = {
      bloque_id: linea.bloque_id,
      empleado_id: linea.empleado_id,
      monto_neto_cargado: linea.monto_neto_cargado,
      origen: linea.origen ?? 'recibo',
      area_snapshot: linea.area_snapshot ?? null,
      cuenta_contable_snapshot: linea.cuenta_contable_snapshot ?? null,
      observaciones: linea.observaciones ?? null,
    };

    const { data, error: err } = await supabase
      .from('liquidacion_lineas_empleado')
      .insert(payload)
      .select()
      .single();

    if (err) {
      const status = err.code === '23505' ? 'EMPLEADO_DUPLICADO' : undefined;
      return { ok: false, error: err.message, codigo: status ?? err.code };
    }
    await refetch();
    return { ok: true, data: data as LiquidacionLineaEmpleado };
  }, [refetch]);

  const actualizarLineaEmpleado = useCallback(async (
    id: string,
    cambios: LiquidacionLineaEmpleadoActualizacion
  ): Promise<ResultadoOperacion<LiquidacionLineaEmpleado>> => {
    const { data, error: err } = await supabase
      .from('liquidacion_lineas_empleado')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    if (!data) return { ok: false, error: 'Linea no encontrada' };
    await refetch();
    return { ok: true, data: data as LiquidacionLineaEmpleado };
  }, [refetch]);

  const eliminarLineaEmpleado = useCallback(async (id: string): Promise<ResultadoOperacion<void>> => {
    const { error: err } = await supabase
      .from('liquidacion_lineas_empleado')
      .delete()
      .eq('id', id);
    if (err) return { ok: false, error: err.message, codigo: err.code };
    await refetch();
    return { ok: true, data: undefined };
  }, [refetch]);

  // ----- CRUD lineas concepto ----------------------------------------------

  const agregarLineaConcepto = useCallback(async (
    linea: LiquidacionLineaConceptoNueva
  ): Promise<ResultadoOperacion<LiquidacionLineaConcepto>> => {
    const payload = {
      bloque_id: linea.bloque_id,
      concepto_codigo: linea.concepto_codigo,
      concepto_nombre: linea.concepto_nombre,
      cuenta_contable: linea.cuenta_contable,
      monto: linea.monto,
      origen: linea.origen ?? 'recibo',
      observaciones: linea.observaciones ?? null,
    };

    const { data, error: err } = await supabase
      .from('liquidacion_lineas_concepto')
      .insert(payload)
      .select()
      .single();

    if (err) {
      const status = err.code === '23505' ? 'CONCEPTO_DUPLICADO' : undefined;
      return { ok: false, error: err.message, codigo: status ?? err.code };
    }
    await refetch();
    return { ok: true, data: data as LiquidacionLineaConcepto };
  }, [refetch]);

  const actualizarLineaConcepto = useCallback(async (
    id: string,
    cambios: LiquidacionLineaConceptoActualizacion
  ): Promise<ResultadoOperacion<LiquidacionLineaConcepto>> => {
    const { data, error: err } = await supabase
      .from('liquidacion_lineas_concepto')
      .update(cambios)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    if (!data) return { ok: false, error: 'Linea no encontrada' };
    await refetch();
    return { ok: true, data: data as LiquidacionLineaConcepto };
  }, [refetch]);

  const eliminarLineaConcepto = useCallback(async (id: string): Promise<ResultadoOperacion<void>> => {
    const { error: err } = await supabase
      .from('liquidacion_lineas_concepto')
      .delete()
      .eq('id', id);
    if (err) return { ok: false, error: err.message, codigo: err.code };
    await refetch();
    return { ok: true, data: undefined };
  }, [refetch]);

  // ----- Derivados ---------------------------------------------------------

  const resumen = useMemo<ResumenLiquidacionMes | null>(
    () => (liquidacion ? calcularResumenMes(liquidacion) : null),
    [liquidacion]
  );

  const bloquePorTipo = useCallback(
    (tipo: TipoBloque) => liquidacion?.bloques.find((b) => b.tipo === tipo),
    [liquidacion]
  );

  // ----- Flujo de estado ---------------------------------------------------

  /** Puede avanzar al siguiente estado lineal? (sin saltarse). */
  const puedeAvanzar = useMemo(() => {
    if (!liquidacion) return false;
    // VACIO -> MINUTA_EN_CARGA: al menos una linea en algun bloque
    if (liquidacion.estado === 'VACIO') {
      return liquidacion.bloques.some(
        (b) => b.lineas_empleado.length > 0 || b.lineas_concepto.length > 0
      );
    }
    // MINUTA_EN_CARGA -> MINUTA_COMPLETA: todos los bloques marcados completo
    if (liquidacion.estado === 'MINUTA_EN_CARGA') {
      return liquidacion.bloques.length > 0 && liquidacion.bloques.every((b) => b.completo);
    }
    // Resto: avance manual o por Fase 3-4
    return false;
  }, [liquidacion]);

  const avanzarEstado = useCallback(async (): Promise<ResultadoOperacion<LiquidacionMes>> => {
    if (!liquidacion) return { ok: false, error: 'Mes no inicializado' };
    if (!puedeAvanzar) return { ok: false, error: 'No se cumplen las condiciones para avanzar' };

    let proximo: EstadoLiquidacion | null = null;
    if (liquidacion.estado === 'VACIO') proximo = 'MINUTA_EN_CARGA';
    else if (liquidacion.estado === 'MINUTA_EN_CARGA') proximo = 'MINUTA_COMPLETA';

    if (!proximo) return { ok: false, error: 'Sin estado siguiente automatico' };

    const { data, error: err } = await supabase
      .from('liquidaciones_mes')
      .update({ estado: proximo })
      .eq('id', liquidacion.id)
      .select()
      .maybeSingle();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    if (!data) return { ok: false, error: 'Liquidacion no encontrada' };
    await refetch();
    return { ok: true, data: data as LiquidacionMes };
  }, [liquidacion, puedeAvanzar, refetch]);

  /** Puede cerrar? (solo desde ASIENTO_GENERADO o CONCILIADO). */
  const puedeCerrar = useMemo(() => {
    if (!liquidacion) return false;
    return liquidacion.estado === 'ASIENTO_GENERADO' || liquidacion.estado === 'CONCILIADO';
  }, [liquidacion]);

  const cerrarMes = useCallback(async (
    confirmacion: string,
    cerradoPorNombre?: string
  ): Promise<ResultadoOperacion<LiquidacionMes>> => {
    if (!liquidacion) return { ok: false, error: 'Mes no inicializado' };
    if (confirmacion !== 'CONFIRMAR') {
      return { ok: false, error: 'Para cerrar debes escribir "CONFIRMAR"' };
    }
    if (!puedeCerrar) {
      return {
        ok: false,
        error: 'Solo se puede cerrar desde ASIENTO_GENERADO o CONCILIADO',
      };
    }

    const { data, error: err } = await supabase
      .from('liquidaciones_mes')
      .update({
        estado: 'CERRADO',
        cerrado_at: new Date().toISOString(),
        cerrado_por_nombre: cerradoPorNombre || null,
      })
      .eq('id', liquidacion.id)
      .select()
      .maybeSingle();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    if (!data) return { ok: false, error: 'Liquidacion no encontrada' };
    await refetch();
    return { ok: true, data: data as LiquidacionMes };
  }, [liquidacion, puedeCerrar, refetch]);

  const reabrirMes = useCallback(async (
    justificacion: string,
    reabiertoPorNombre?: string
  ): Promise<ResultadoOperacion<LiquidacionMes>> => {
    if (!liquidacion) return { ok: false, error: 'Mes no inicializado' };
    if (liquidacion.estado !== 'CERRADO') {
      return { ok: false, error: 'Solo se puede reabrir un mes CERRADO' };
    }
    const just = justificacion?.trim() ?? '';
    if (just.length < 10) {
      return { ok: false, error: 'La justificacion debe tener al menos 10 caracteres' };
    }

    // Volvemos al ultimo estado pre-cierre razonable. Si tenia asiento generado,
    // ASIENTO_GENERADO; si no, MINUTA_COMPLETA (asumimos que tenia minuta cargada).
    const nuevoEstado: EstadoLiquidacion = 'ASIENTO_GENERADO';

    const { data, error: err } = await supabase
      .from('liquidaciones_mes')
      .update({
        estado: nuevoEstado,
        reabierto_at: new Date().toISOString(),
        reabierto_por_nombre: reabiertoPorNombre || null,
        reapertura_justificacion: just,
      })
      .eq('id', liquidacion.id)
      .select()
      .maybeSingle();

    if (err) return { ok: false, error: err.message, codigo: err.code };
    if (!data) return { ok: false, error: 'Liquidacion no encontrada' };
    await refetch();
    return { ok: true, data: data as LiquidacionMes };
  }, [liquidacion, refetch]);

  return {
    liquidacion,
    existeEnBD,
    loading,
    error,
    refetch,
    inicializarMes,
    agregarBloqueDiaSanidad,
    actualizarBloque,
    eliminarBloqueDiaSanidad,
    marcarBloqueCompleto,
    agregarLineaEmpleado,
    actualizarLineaEmpleado,
    eliminarLineaEmpleado,
    agregarLineaConcepto,
    actualizarLineaConcepto,
    eliminarLineaConcepto,
    resumen,
    bloquePorTipo,
    puedeAvanzar,
    avanzarEstado,
    puedeCerrar,
    cerrarMes,
    reabrirMes,
  };
}

export default useLiquidacionMes;
