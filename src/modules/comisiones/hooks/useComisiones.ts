// ============================================================
// Comisiones — acceso a datos
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Todo lo que leen las pantallas sale de acá. Nada de esto calcula plata: los
// importes ya vienen decididos del libro `comisiones_movimientos`, que escribe
// el job con la service key. La UI muestra y agrupa, no resuelve.
//
// LA RLS HACE EL TRABAJO PESADO. `comisiones_movimientos` y
// `comisiones_liquidaciones` sólo devuelven las filas propias, salvo que seas
// admin (migración 56). Estas consultas no filtran por beneficiario: si una
// comisionista abre su panel, la base ya le mandó únicamente lo suyo. Esconder
// componentes en el front no protege nada — un token y un curl alcanzan.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import supabase from '@shared/lib/supabase';
import {
  estadoRegimen,
  fechaVigenciaRegimen,
  parametrosVigentes,
} from '@modules/comisiones/core/parametros.mjs';
import type { FilaParametro } from '@modules/comisiones/core/parametros.mjs';
import type { ParametrosComision, RolComision, TipoMovimiento } from '@modules/comisiones/core/calculo.mjs';

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export interface MovimientoComision {
  id: string;
  presupuesto_id: string;
  beneficiario: string;
  rol: RolComision;
  tipo: TipoMovimiento;
  evento_origen: string;
  evidencia: Record<string, unknown> | null;
  base_comisionable: number;
  tasa_aplicada: number;
  pct_reparto: number;
  importe: number;
  fecha_devengo: string;
  motivo: string | null;
  liquidacion_id: string | null;
  created_at: string;
  created_by: string | null;
  /** Se completa por separado: la tabla de movimientos no conoce al paciente. */
  presupuesto?: { numero_presupuesto: string; paciente_apellido: string; paciente_nombre: string } | null;
}

export type EstadoLiquidacion = 'DEVENGADA' | 'APROBADA' | 'PAGADA';

export interface Liquidacion {
  id: string;
  beneficiario: string;
  anio: number;
  mes: number;
  estado: EstadoLiquidacion;
  total: number;
  aprobada_at: string | null;
  aprobada_por: string | null;
  pagada_at: string | null;
  pagada_por: string | null;
  created_at: string;
  created_by: string | null;
}

/** Una persona dentro de un período, con lo suyo sumado. */
export interface FilaPersona {
  beneficiario: string;
  nombre: string;
  movimientos: MovimientoComision[];
  devengado: number;
  liquidacion: Liquidacion | null;
  /** Movimientos del período que todavía no entraron en ninguna liquidación. */
  sinLiquidar: number;
}

export interface Comisionable {
  username: string;
  nombre_completo: string | null;
  es_comisionable: boolean;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Primer y último día del mes, para filtrar por `fecha_devengo`. */
export function rangoMes(anio: number, mes: number): { desde: string; hasta: string } {
  const mm = String(mes).padStart(2, '0');
  const ultimo = new Date(anio, mes, 0).getDate();
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${ultimo}` };
}

export const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(n) || 0);

export const fmtPct = (n: number) =>
  `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n) || 0)} %`;

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * El día de hoy en Argentina. `new Date().toISOString()` da el día UTC, que
 * después de las 21 ya es mañana — el bug de fechas más repetido del proyecto.
 */
export const hoyLocal = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

// ------------------------------------------------------------
// Estado del régimen y parámetros
// ------------------------------------------------------------

export interface EstadoRegimen {
  activo: boolean;
  desde: string | null;
  motivo: string | null;
  parametros: ParametrosComision;
  filas: FilaParametro[];
  comisionables: Comisionable[];
  loading: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

export function useRegimenComisiones(): EstadoRegimen {
  const [filas, setFilas] = useState<FilaParametro[]>([]);
  const [comisionables, setComisionables] = useState<Comisionable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: par, error: e1 }, { data: usr, error: e2 }] = await Promise.all([
        supabase.from('comisiones_parametros').select('clave,valor,vigencia_desde,notas,created_by').order('clave'),
        supabase.from('usuarios_sistema').select('username,nombre_completo,es_comisionable').eq('activo', true).order('nombre_completo'),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setFilas((par || []) as FilaParametro[]);
      setComisionables((usr || []) as Comisionable[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer los parámetros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  const marcados = useMemo(() => comisionables.filter((c) => c.es_comisionable), [comisionables]);
  const estado = useMemo(() => estadoRegimen(filas, { comisionables: marcados.length }), [filas, marcados.length]);
  const parametros = useMemo(() => parametrosVigentes(filas, hoyLocal()), [filas]);

  return {
    activo: estado.activo,
    desde: estado.desde ?? fechaVigenciaRegimen(filas),
    motivo: estado.motivo ?? null,
    parametros,
    filas,
    comisionables,
    loading,
    error,
    recargar,
  };
}

// ------------------------------------------------------------
// Un período: los movimientos y las liquidaciones del mes
// ------------------------------------------------------------

export interface PeriodoComisiones {
  personas: FilaPersona[];
  movimientos: MovimientoComision[];
  total: number;
  loading: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

/**
 * Trae el mes completo. Lo que devuelve depende de quién pregunta, y de eso se
 * encarga la base: una comisionista recibe sólo sus filas.
 */
export function usePeriodoComisiones(anio: number, mes: number): PeriodoComisiones {
  const [movimientos, setMovimientos] = useState<MovimientoComision[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { desde, hasta } = rangoMes(anio, mes);
      const [{ data: movs, error: e1 }, { data: liqs, error: e2 }, { data: usr }] = await Promise.all([
        supabase.from('comisiones_movimientos')
          .select('*')
          .gte('fecha_devengo', desde).lte('fecha_devengo', hasta)
          .order('fecha_devengo', { ascending: true }).order('id', { ascending: true }),
        supabase.from('comisiones_liquidaciones').select('*').eq('anio', anio).eq('mes', mes),
        supabase.from('usuarios_sistema').select('username,nombre_completo'),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);

      const lista = (movs || []) as MovimientoComision[];

      // El presupuesto de cada movimiento, para poder decir de qué paciente
      // salió cada peso. Sin esto la pantalla es una lista de importes sin
      // origen, que es justo lo que no se puede defender en un reclamo.
      const ids = [...new Set(lista.map((m) => m.presupuesto_id))];
      if (ids.length) {
        const { data: pres } = await supabase.from('presupuestos')
          .select('id,numero_presupuesto,paciente_apellido,paciente_nombre').in('id', ids);
        const porId = new Map((pres || []).map((p) => [p.id, p]));
        for (const m of lista) m.presupuesto = porId.get(m.presupuesto_id) ?? null;
      }

      setMovimientos(lista);
      setLiquidaciones((liqs || []) as Liquidacion[]);
      setNombres(Object.fromEntries((usr || []).map((u) => [u.username, u.nombre_completo || u.username])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las comisiones');
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => { void recargar(); }, [recargar]);

  const personas = useMemo<FilaPersona[]>(() => {
    const porLiq = new Map(liquidaciones.map((l) => [l.beneficiario, l]));
    const agrupado = new Map<string, MovimientoComision[]>();
    for (const m of movimientos) {
      if (!agrupado.has(m.beneficiario)) agrupado.set(m.beneficiario, []);
      agrupado.get(m.beneficiario)!.push(m);
    }
    // Una persona con liquidación pero sin movimientos en el mes también
    // aparece: si el mes le dio cero, tiene que poder verlo.
    for (const l of liquidaciones) if (!agrupado.has(l.beneficiario)) agrupado.set(l.beneficiario, []);

    return [...agrupado.entries()]
      .map(([beneficiario, movs]) => ({
        beneficiario,
        nombre: nombres[beneficiario] || beneficiario,
        movimientos: movs,
        // Se SUMA, no se filtra por tipo: un reverso viene en negativo y tiene
        // que restar acá, que es el punto de que exista.
        devengado: redondear(movs.reduce((s, m) => s + Number(m.importe), 0)),
        sinLiquidar: redondear(movs.filter((m) => !m.liquidacion_id).reduce((s, m) => s + Number(m.importe), 0)),
        liquidacion: porLiq.get(beneficiario) ?? null,
      }))
      .sort((a, b) => b.devengado - a.devengado || a.nombre.localeCompare(b.nombre, 'es'));
  }, [movimientos, liquidaciones, nombres]);

  const total = useMemo(() => redondear(personas.reduce((s, p) => s + p.devengado, 0)), [personas]);

  return { personas, movimientos, total, loading, error, recargar };
}

const redondear = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ------------------------------------------------------------
// La ficha de una persona: su historia completa, no un mes
// ------------------------------------------------------------

export interface FichaPersona {
  movimientos: MovimientoComision[];
  liquidaciones: Liquidacion[];
  totalDevengado: number;
  totalPagado: number;
  pendiente: number;
  loading: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

export function useFichaComisionista(beneficiario: string | null): FichaPersona {
  const [movimientos, setMovimientos] = useState<MovimientoComision[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!beneficiario) { setMovimientos([]); setLiquidaciones([]); return; }
    setLoading(true);
    setError(null);
    try {
      const [{ data: movs, error: e1 }, { data: liqs, error: e2 }] = await Promise.all([
        supabase.from('comisiones_movimientos').select('*').eq('beneficiario', beneficiario)
          .order('fecha_devengo', { ascending: false }).order('id', { ascending: false }),
        supabase.from('comisiones_liquidaciones').select('*').eq('beneficiario', beneficiario)
          .order('anio', { ascending: false }).order('mes', { ascending: false }),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);

      const lista = (movs || []) as MovimientoComision[];
      const ids = [...new Set(lista.map((m) => m.presupuesto_id))];
      if (ids.length) {
        const { data: pres } = await supabase.from('presupuestos')
          .select('id,numero_presupuesto,paciente_apellido,paciente_nombre').in('id', ids);
        const porId = new Map((pres || []).map((p) => [p.id, p]));
        for (const m of lista) m.presupuesto = porId.get(m.presupuesto_id) ?? null;
      }
      setMovimientos(lista);
      setLiquidaciones((liqs || []) as Liquidacion[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la ficha');
    } finally {
      setLoading(false);
    }
  }, [beneficiario]);

  useEffect(() => { void recargar(); }, [recargar]);

  const totalDevengado = useMemo(() => redondear(movimientos.reduce((s, m) => s + Number(m.importe), 0)), [movimientos]);
  const totalPagado = useMemo(
    () => redondear(liquidaciones.filter((l) => l.estado === 'PAGADA').reduce((s, l) => s + Number(l.total), 0)),
    [liquidaciones],
  );

  return {
    movimientos, liquidaciones, totalDevengado, totalPagado,
    pendiente: redondear(totalDevengado - totalPagado),
    loading, error, recargar,
  };
}
