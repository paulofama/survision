// ============================================
// HOOK: useMovimientosPrestaciones
// Sistema Integral de Gestión - Instituto Dr. Mercado
// ============================================
// v4.0 (2026-06): lee del espejo Supabase `movimientos_geclisa` (sync GECLISA)
// en vez de /api/movimientos/*. Trae las filas del período UNA vez y deriva
// listado + stats (totales, por OS/prestador/prestación/grupo) en el cliente con
// shared/utils/movimientosAgg.ts. Así funciona desde afuera de la clínica.
// La interfaz pública del hook NO cambió (las páginas consumidoras siguen igual).
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  type MovGecRow,
  mapearListado,
  calcularStats,
} from '../utils/movimientosAgg';

// ============================================
// INTERFACES
// ============================================

export interface PrestacionRealizada {
  id: number;
  atencion_id: number;
  fecha: string;
  hora: number;
  paciente: string;
  coseguro: number;
  cobertura: number;
  total: number;
  edad: number;
  diagnostico: string;
  estado: string;
  usuario_alta: string;
  os_id: number;
  os_nombre: string;
  os_sigla: string;
  codigo_prestacion: string;
  prestacion: string;
  grupo_id: number;
  prestador_id: number | null;
  prestador: string;
  derivador_id: number | null;
  derivador: string;
  atendio: string;
  anio: number;
  mes_numero: number;
}

export interface TotalesPeriodo {
  atenciones: number;
  practicas: number;
  coseguro: number;
  cobertura: number;
  ingresos: number;
}

export interface StatsPorObraSocial {
  os_id: number;
  sigla: string;
  nombre: string;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface StatsPorPrestador {
  prestador_id: number;
  prestador: string;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface StatsPorPrestacion {
  codigo: string;
  prestacion: string;
  grupo_id: number;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface StatsPorGrupo {
  grupo_id: number;
  grupo_nombre: string;
  tipos_prestacion: number;
  cantidad: number;
  coseguro: number;
  cobertura: number;
  total_ingresos: number;
  porcentaje: string;
  promedio: number;
}

export interface FiltrosPrestaciones {
  anio: string;
  mes: string;
  dia: string;
  obraSocialId: string;
  prestadorId: string;
  grupoPracticas: string;
  agenteFacturadorId: string;
  busqueda: string;
  prestacion: string;
  paciente: string;
  derivadorId: string;
}

export interface Estadisticas {
  practicas_hoy: number;
  ingreso_hoy: number;
  practicas_mes_actual: number;
  ingreso_mes_actual: number;
  practicas_mes_anterior: number;
  ingreso_mes_anterior: number;
  total_historico: number;
  turnos_pendientes: number;
}

export interface OpcionesFiltros {
  anios: number[];
  meses: { value: number; label: string }[];
  dias: { value: number; label: string }[];
  obrasSociales: { id: number; sigla: string; nombre: string }[];
  prestadores: { id: number; nombre: string }[];
  grupos: { id: number; nombre: string }[];
  gruposPracticas: { id: number; nombre: string }[];
  agentesFacturadores: { id: number; nombre: string }[];
  derivadores: { id: number; nombre: string }[];
}

// ============================================
// VALORES INICIALES
// ============================================

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const FILTROS_INICIALES: FiltrosPrestaciones = {
  anio: CURRENT_YEAR.toString(),
  mes: CURRENT_MONTH.toString(),
  dia: '',
  obraSocialId: '',
  prestadorId: '',
  grupoPracticas: '',
  agenteFacturadorId: '',
  busqueda: '',
  prestacion: '',
  paciente: '',
  derivadorId: '',
};

const MESES_LABEL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ANIO_MIN = 2024; // el espejo arranca en 2024-01

const COLS =
  'atencion_id,mp_id,pre_id,fecha,anio,mes,dia,hora,paciente,edad,diagnostico,estado,usuario_alta,os_id,os_sigla,os_nombre,practica_codigo,practica_nombre,grupo_id,grupo_nombre,prestador_nombre,derivador_id,derivador,coseguro,cobertura,total,cant_prestadores,es_principal';

// Trae TODAS las filas de un período (paginado de a 1000) aplicando solo
// anio/mes/dia en la query; los demás filtros se resuelven en el cliente.
async function fetchFilasPeriodo(f: FiltrosPrestaciones): Promise<MovGecRow[]> {
  const filas: MovGecRow[] = [];
  let from = 0;
  for (;;) {
    let q = supabase.from('movimientos_geclisa').select(COLS);
    if (f.anio) q = q.eq('anio', parseInt(f.anio, 10));
    if (f.mes) q = q.eq('mes', parseInt(f.mes, 10));
    if (f.dia) q = q.eq('dia', parseInt(f.dia, 10));
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data as unknown as MovGecRow[]) || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return filas;
}

function sumPrincipales(rows: MovGecRow[]) {
  let ingreso = 0;
  let practicas = 0;
  for (const r of rows) {
    if (!r.es_principal) continue;
    practicas += 1;
    ingreso += Number(r.total) || 0;
  }
  return { practicas, ingreso };
}

// ============================================
// HOOK PRINCIPAL
// ============================================

export const useMovimientosPrestaciones = () => {
  const [filasPeriodo, setFilasPeriodo] = useState<MovGecRow[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas>({
    practicas_hoy: 0, ingreso_hoy: 0, practicas_mes_actual: 0, ingreso_mes_actual: 0,
    practicas_mes_anterior: 0, ingreso_mes_anterior: 0, total_historico: 0, turnos_pendientes: 0,
  });

  const [filtros, setFiltros] = useState<FiltrosPrestaciones>(FILTROS_INICIALES);

  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // ------------------------------------------------------------
  // Cargar filas del período (depende solo de anio/mes/dia)
  // ------------------------------------------------------------
  const cargarPeriodo = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingStats(true);
      setError(null);
      const filas = await fetchFilasPeriodo(filtros);
      setFilasPeriodo(filas);
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
      setIsConnected(false);
      setFilasPeriodo([]);
    } finally {
      setLoading(false);
      setLoadingStats(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.anio, filtros.mes, filtros.dia]);

  // ------------------------------------------------------------
  // Estadísticas generales (hoy / mes actual / mes anterior / total)
  // ------------------------------------------------------------
  const cargarEstadisticas = useCallback(async () => {
    try {
      const hoy = new Date();
      const anioAct = hoy.getFullYear();
      const mesAct = hoy.getMonth() + 1;
      const mesAnt = mesAct === 1 ? 12 : mesAct - 1;
      const anioMesAnt = mesAct === 1 ? anioAct - 1 : anioAct;
      const hoyStr = hoy.toISOString().split('T')[0];

      const [mesActualRows, mesAnteriorRows, hoyRows, totalRes] = await Promise.all([
        supabase.from('movimientos_geclisa').select('total,es_principal').eq('anio', anioAct).eq('mes', mesAct).eq('es_principal', true),
        supabase.from('movimientos_geclisa').select('total,es_principal').eq('anio', anioMesAnt).eq('mes', mesAnt).eq('es_principal', true),
        supabase.from('movimientos_geclisa').select('total,es_principal').eq('fecha', hoyStr).eq('es_principal', true),
        supabase.from('movimientos_geclisa').select('*', { count: 'exact', head: true }).eq('es_principal', true),
      ]);

      const sum = (rows: { total: number }[] | null) => (rows || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
      setEstadisticas({
        practicas_hoy: hoyRows.data?.length || 0,
        ingreso_hoy: sum(hoyRows.data as { total: number }[]),
        practicas_mes_actual: mesActualRows.data?.length || 0,
        ingreso_mes_actual: sum(mesActualRows.data as { total: number }[]),
        practicas_mes_anterior: mesAnteriorRows.data?.length || 0,
        ingreso_mes_anterior: sum(mesAnteriorRows.data as { total: number }[]),
        total_historico: totalRes.count || 0,
        turnos_pendientes: 0,
      });
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    }
  }, []);

  // ------------------------------------------------------------
  // Derivaciones en cliente (memoizadas)
  // ------------------------------------------------------------
  const stats = useMemo(() => calcularStats(filasPeriodo, filtros), [filasPeriodo, filtros]);

  const prestacionesBase = useMemo(() => mapearListado(filasPeriodo, filtros), [filasPeriodo, filtros]);

  const prestacionesFiltradas = useMemo(() => {
    if (!filtros.busqueda.trim()) return prestacionesBase;
    const t = filtros.busqueda.toLowerCase();
    return prestacionesBase.filter((p) =>
      p.paciente?.toLowerCase().includes(t) ||
      p.prestacion?.toLowerCase().includes(t) ||
      p.os_nombre?.toLowerCase().includes(t) ||
      p.prestador?.toLowerCase().includes(t) ||
      p.codigo_prestacion?.toLowerCase().includes(t),
    );
  }, [prestacionesBase, filtros.busqueda]);

  // Opciones de filtros derivadas de las filas del período (OS/prestador/grupo/
  // derivador que existen en lo que se está viendo) + años/meses/días genéricos.
  const opcionesFiltros = useMemo<OpcionesFiltros>(() => {
    const osMap = new Map<number, { id: number; sigla: string; nombre: string }>();
    const preMap = new Map<number, { id: number; nombre: string }>();
    const grupoMap = new Map<number, { id: number; nombre: string }>();
    const derMap = new Map<number, { id: number; nombre: string }>();
    for (const r of filasPeriodo) {
      if (r.os_id != null && !osMap.has(r.os_id)) osMap.set(r.os_id, { id: r.os_id, sigla: r.os_sigla || 'S/D', nombre: r.os_nombre || 'Sin OS' });
      if (r.pre_id && !preMap.has(r.pre_id)) preMap.set(r.pre_id, { id: r.pre_id, nombre: r.prestador_nombre || 'Sin prestador' });
      if (r.grupo_id != null && !grupoMap.has(r.grupo_id)) grupoMap.set(r.grupo_id, { id: r.grupo_id, nombre: r.grupo_nombre || 'Sin servicio' });
      if (r.derivador_id != null && !derMap.has(r.derivador_id)) derMap.set(r.derivador_id, { id: r.derivador_id, nombre: r.derivador || 'Sin derivador' });
    }
    const anios: number[] = [];
    for (let a = CURRENT_YEAR; a >= ANIO_MIN; a--) anios.push(a);
    const cmp = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre);
    const grupos = [...grupoMap.values()].sort(cmp);
    return {
      anios,
      meses: MESES_LABEL.map((label, i) => ({ value: i + 1, label })),
      dias: Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
      obrasSociales: [...osMap.values()].sort(cmp),
      prestadores: [...preMap.values()].sort(cmp),
      grupos,
      gruposPracticas: grupos,
      agentesFacturadores: [],
      derivadores: [...derMap.values()].sort(cmp),
    };
  }, [filasPeriodo]);

  // ------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------
  const aplicarFiltros = useCallback((nuevos: Partial<FiltrosPrestaciones>) => {
    setFiltros((prev) => ({ ...prev, ...nuevos }));
  }, []);

  const limpiarFiltros = useCallback(() => setFiltros(FILTROS_INICIALES), []);

  const refetch = useCallback(async () => {
    await Promise.all([cargarPeriodo(), cargarEstadisticas()]);
  }, [cargarPeriodo, cargarEstadisticas]);

  // ------------------------------------------------------------
  // Effects
  // ------------------------------------------------------------
  useEffect(() => { cargarEstadisticas(); }, [cargarEstadisticas]);
  useEffect(() => { cargarPeriodo(); }, [cargarPeriodo]);

  // ------------------------------------------------------------
  // Return (interfaz idéntica a v3)
  // ------------------------------------------------------------
  return {
    prestaciones: prestacionesFiltradas,
    totalRegistros: prestacionesBase.length,

    totalesPeriodo: stats.totales,
    statsPorObraSocial: stats.porObraSocial,
    statsPorPrestador: stats.porPrestador,
    statsPorPrestacion: stats.porPrestacion,
    statsPorGrupo: stats.porGrupo,

    estadisticas,

    filtros,
    opcionesFiltros,
    aplicarFiltros,
    limpiarFiltros,

    loading,
    loadingStats,
    loadingFiltros: false,
    error,
    isConnected,

    refetch,

    // compat: antes existía; ya no se usa para KPIs
    totalesLocal: stats.totales,
  };
};

export default useMovimientosPrestaciones;
