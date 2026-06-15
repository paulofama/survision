// ===========================================================================
// HOOK: useEmpleados - MODULO CARGA DE SUELDOS
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// CRUD del maestro de empleados desde Supabase (tabla `empleados`).
// Incluye cache module-level, busqueda fuzzy, baja/reactivacion logica y
// derivados de UI (es_baja_reciente, es_alta_reciente, meses_antiguedad).
//
// Importante:
//  - NO se setea `updated_at` en INSERT/UPDATE: triggers de Supabase lo manejan
//    (segun convencion del proyecto, devuelve 400 si se intenta).
//  - "Dar de baja" es soft delete: estado='inactivo' + fecha_egreso=fecha dada.
//  - Cache se invalida automaticamente despues de cada operacion CUD.
//
// API:
//   const {
//     empleados,              // EmpleadoListado[] (con derivados)
//     empleadosRaw,           // Empleado[] crudos
//     loading, error, refetch,
//
//     // CRUD - retornan ResultadoOperacion<T>
//     crearEmpleado,
//     actualizarEmpleado,
//     darDeBaja,
//     reactivar,
//
//     // Lectura
//     buscarPorId,
//     buscarPorCuil,
//     filtrar,                // (FiltrosEmpleados) => EmpleadoListado[]
//     empleadosActivos,
//     empleadosPorArea,
//
//     estadisticas,
//   } = useEmpleados();
// ===========================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';
import type {
  AreaEmpleado,
  Empleado,
  EmpleadoActualizacion,
  EmpleadoListado,
  EmpleadoNuevo,
  FiltrosEmpleados,
  ResultadoOperacion,
} from '../types/sueldos';

// ---------------------------------------------------------------------------
// CACHE MODULE-LEVEL
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: Empleado[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<Empleado[]> | null = null;

/** TTL de la cache: 5 minutos. Se invalida en cada CUD. */
const CACHE_TTL_MS = 5 * 60 * 1000;

function isCacheValid(): boolean {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

async function fetchEmpleados(force = false): Promise<Empleado[]> {
  if (!force && isCacheValid() && cache) {
    return cache.data;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase
      .from('empleados')
      .select('*')
      .order('apellido', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Error al cargar empleados');
    }

    const empleados = (data || []) as Empleado[];
    cache = { data: empleados, fetchedAt: Date.now() };
    return empleados;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Invalida la cache module-level. Util para tests o tras importaciones masivas. */
export function invalidarCacheEmpleados(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// HELPERS PUROS
// ---------------------------------------------------------------------------

function normalizar(s: string): string {
  // Quita acentos y diacriticos combinantes Unicode (U+0300 - U+036F).
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function soloDigitos(s: string): string {
  return s.replace(/\D+/g, '');
}

/**
 * Calcula meses completos transcurridos entre dos fechas ISO YYYY-MM-DD.
 * Si `hasta` es null/undefined se usa la fecha actual.
 */
function mesesEntre(desde: string, hasta: string | null): number {
  if (!desde) return 0;
  const d = new Date(desde + 'T00:00:00');
  const h = hasta ? new Date(hasta + 'T00:00:00') : new Date();
  if (isNaN(d.getTime()) || isNaN(h.getTime())) return 0;
  let meses =
    (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth());
  if (h.getDate() < d.getDate()) meses -= 1;
  return Math.max(0, meses);
}

function esDelAnioEnCurso(fechaIso: string | null): boolean {
  if (!fechaIso) return false;
  const f = new Date(fechaIso + 'T00:00:00');
  if (isNaN(f.getTime())) return false;
  return f.getFullYear() === new Date().getFullYear();
}

/**
 * Convierte un Empleado a EmpleadoListado calculando derivados de UI.
 */
export function aEmpleadoListado(e: Empleado): EmpleadoListado {
  return {
    ...e,
    es_baja_reciente: e.estado === 'inactivo' && esDelAnioEnCurso(e.fecha_egreso),
    es_alta_reciente: e.estado === 'activo' && esDelAnioEnCurso(e.fecha_ingreso),
    meses_antiguedad: mesesEntre(e.fecha_ingreso, e.fecha_egreso),
  };
}

/**
 * Aplica filtros sobre el listado de empleados.
 * Busqueda fuzzy: apellido, nombre, CUIL (con o sin guiones), num documento.
 */
export function aplicarFiltrosEmpleados(
  empleados: EmpleadoListado[],
  filtros: FiltrosEmpleados
): EmpleadoListado[] {
  const { busqueda, area, estado } = filtros;
  const q = busqueda?.trim() ?? '';
  const qNorm = normalizar(q);
  const qDigitos = soloDigitos(q);

  return empleados.filter((e) => {
    if (area !== 'TODAS' && e.area !== area) return false;
    if (estado !== 'TODOS' && e.estado !== estado) return false;

    if (qNorm) {
      const haystackTexto = normalizar(`${e.apellido} ${e.nombre}`);
      if (haystackTexto.includes(qNorm)) return true;

      if (qDigitos) {
        const cuilDigitos = soloDigitos(e.cuil ?? '');
        const docDigitos = soloDigitos(e.numero_documento ?? '');
        if (cuilDigitos.includes(qDigitos)) return true;
        if (docDigitos.includes(qDigitos)) return true;
      }

      return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

interface Estadisticas {
  total: number;
  activos: number;
  bajas: number;
  altas_anio_actual: number;
  bajas_anio_actual: number;
}

interface UseEmpleadosReturn {
  empleados: EmpleadoListado[];
  empleadosRaw: Empleado[];
  loading: boolean;
  error: string | null;

  refetch: () => Promise<void>;

  // CRUD
  crearEmpleado: (
    datos: EmpleadoNuevo
  ) => Promise<ResultadoOperacion<Empleado>>;
  actualizarEmpleado: (
    id: string,
    cambios: EmpleadoActualizacion
  ) => Promise<ResultadoOperacion<Empleado>>;
  darDeBaja: (
    id: string,
    fechaEgreso: string
  ) => Promise<ResultadoOperacion<Empleado>>;
  reactivar: (id: string) => Promise<ResultadoOperacion<Empleado>>;

  // Lectura
  buscarPorId: (id: string) => EmpleadoListado | undefined;
  buscarPorCuil: (cuil: string) => EmpleadoListado | undefined;
  filtrar: (filtros: FiltrosEmpleados) => EmpleadoListado[];
  empleadosActivos: EmpleadoListado[];
  empleadosPorArea: Record<AreaEmpleado, EmpleadoListado[]>;

  estadisticas: Estadisticas;
}

export function useEmpleados(): UseEmpleadosReturn {
  const [empleadosRaw, setEmpleadosRaw] = useState<Empleado[]>(
    cache?.data ?? []
  );
  const [loading, setLoading] = useState<boolean>(!isCacheValid());
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEmpleados(force);
      setEmpleadosRaw(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      console.error('[useEmpleados] Error cargando empleados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCacheValid() && empleadosRaw.length > 0) {
      setLoading(false);
      return;
    }
    cargar(false);
  }, [cargar, empleadosRaw.length]);

  const refetch = useCallback(async () => {
    invalidarCacheEmpleados();
    await cargar(true);
  }, [cargar]);

  // ----- Listado derivado --------------------------------------------------

  const empleados = useMemo<EmpleadoListado[]>(
    () => empleadosRaw.map(aEmpleadoListado),
    [empleadosRaw]
  );

  // ----- CRUD --------------------------------------------------------------

  /**
   * Verifica duplicado de CUIL antes de insertar/actualizar.
   * Retorna el id existente si lo encuentra, null si no.
   */
  const cuilEnUsoPor = useCallback(
    async (cuil: string, excluirId?: string): Promise<string | null> => {
      const { data, error: err } = await supabase
        .from('empleados')
        .select('id')
        .eq('cuil', cuil)
        .limit(1);
      if (err) throw new Error(err.message);
      const existente = data?.[0];
      if (!existente) return null;
      if (excluirId && existente.id === excluirId) return null;
      return existente.id;
    },
    []
  );

  const crearEmpleado = useCallback(
    async (datos: EmpleadoNuevo): Promise<ResultadoOperacion<Empleado>> => {
      try {
        if (!datos.cuil) {
          return { ok: false, error: 'El CUIL es obligatorio' };
        }

        const duplicado = await cuilEnUsoPor(datos.cuil);
        if (duplicado) {
          return {
            ok: false,
            error: `Ya existe un empleado con CUIL ${datos.cuil}`,
            codigo: 'CUIL_DUPLICADO',
          };
        }

        const payload = {
          apellido: datos.apellido,
          nombre: datos.nombre,
          cuil: datos.cuil,
          tipo_documento: datos.tipo_documento,
          numero_documento: datos.numero_documento,
          fecha_nacimiento: datos.fecha_nacimiento,
          sexo: datos.sexo,
          fecha_ingreso: datos.fecha_ingreso,
          fecha_egreso: datos.fecha_egreso ?? null,
          area: datos.area,
          cuenta_contable: datos.cuenta_contable,
          categoria: datos.categoria ?? null,
          convenio: datos.convenio ?? null,
          modalidad_contratacion: datos.modalidad_contratacion ?? null,
          domicilio: datos.domicilio ?? null,
          telefono: datos.telefono ?? null,
          email: datos.email ?? null,
          banco: datos.banco ?? null,
          cbu: datos.cbu ?? null,
          cuenta_sueldo_nro: datos.cuenta_sueldo_nro ?? null,
          obra_social: datos.obra_social ?? null,
          art_asignada: datos.art_asignada ?? null,
          condicion_ganancias: datos.condicion_ganancias ?? null,
          estado: datos.estado ?? 'activo',
        };

        const { data, error: err } = await supabase
          .from('empleados')
          .insert(payload)
          .select()
          .single();

        if (err) {
          return { ok: false, error: err.message, codigo: err.code };
        }

        await refetch();
        return { ok: true, data: data as Empleado };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido';
        return { ok: false, error: msg };
      }
    },
    [cuilEnUsoPor, refetch]
  );

  const actualizarEmpleado = useCallback(
    async (
      id: string,
      cambios: EmpleadoActualizacion
    ): Promise<ResultadoOperacion<Empleado>> => {
      try {
        if (cambios.cuil) {
          const duplicado = await cuilEnUsoPor(cambios.cuil, id);
          if (duplicado) {
            return {
              ok: false,
              error: `Ya existe otro empleado con CUIL ${cambios.cuil}`,
              codigo: 'CUIL_DUPLICADO',
            };
          }
        }

        // Filtrar campos que el cliente no debe enviar: id/created_at/updated_at
        // El tipo EmpleadoActualizacion ya los excluye, pero por defensa:
        const { ...payload } = cambios as Record<string, unknown>;
        delete payload.id;
        delete payload.created_at;
        delete payload.updated_at;

        const { data, error: err } = await supabase
          .from('empleados')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (err) {
          return { ok: false, error: err.message, codigo: err.code };
        }

        await refetch();
        return { ok: true, data: data as Empleado };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido';
        return { ok: false, error: msg };
      }
    },
    [cuilEnUsoPor, refetch]
  );

  const darDeBaja = useCallback(
    async (
      id: string,
      fechaEgreso: string
    ): Promise<ResultadoOperacion<Empleado>> => {
      if (!fechaEgreso) {
        return { ok: false, error: 'La fecha de egreso es obligatoria' };
      }
      return actualizarEmpleado(id, {
        estado: 'inactivo',
        fecha_egreso: fechaEgreso,
      });
    },
    [actualizarEmpleado]
  );

  const reactivar = useCallback(
    async (id: string): Promise<ResultadoOperacion<Empleado>> => {
      return actualizarEmpleado(id, {
        estado: 'activo',
        fecha_egreso: null,
      });
    },
    [actualizarEmpleado]
  );

  // ----- Selectores derivados ----------------------------------------------

  const buscarPorId = useCallback(
    (id: string) => empleados.find((e) => e.id === id),
    [empleados]
  );

  const buscarPorCuil = useCallback(
    (cuil: string) => {
      const digitos = soloDigitos(cuil);
      return empleados.find((e) => soloDigitos(e.cuil) === digitos);
    },
    [empleados]
  );

  const filtrar = useCallback(
    (filtros: FiltrosEmpleados) => aplicarFiltrosEmpleados(empleados, filtros),
    [empleados]
  );

  const empleadosActivos = useMemo(
    () => empleados.filter((e) => e.estado === 'activo'),
    [empleados]
  );

  const empleadosPorArea = useMemo<Record<AreaEmpleado, EmpleadoListado[]>>(() => {
    const base: Record<AreaEmpleado, EmpleadoListado[]> = {
      'Administración': [],
      'Cajera': [],
      'Limpieza': [],
      'Medición': [],
      'Recepción': [],
      'Telefonista': [],
      'Cirugías': [],
    };
    for (const e of empleados) {
      if (base[e.area]) base[e.area].push(e);
    }
    return base;
  }, [empleados]);

  const estadisticas = useMemo<Estadisticas>(() => {
    const anioActual = new Date().getFullYear();
    return {
      total: empleados.length,
      activos: empleados.filter((e) => e.estado === 'activo').length,
      bajas: empleados.filter((e) => e.estado === 'inactivo').length,
      altas_anio_actual: empleados.filter(
        (e) =>
          e.fecha_ingreso &&
          new Date(e.fecha_ingreso + 'T00:00:00').getFullYear() === anioActual
      ).length,
      bajas_anio_actual: empleados.filter(
        (e) =>
          e.fecha_egreso &&
          new Date(e.fecha_egreso + 'T00:00:00').getFullYear() === anioActual
      ).length,
    };
  }, [empleados]);

  return {
    empleados,
    empleadosRaw,
    loading,
    error,
    refetch,
    crearEmpleado,
    actualizarEmpleado,
    darDeBaja,
    reactivar,
    buscarPorId,
    buscarPorCuil,
    filtrar,
    empleadosActivos,
    empleadosPorArea,
    estadisticas,
  };
}

export default useEmpleados;
