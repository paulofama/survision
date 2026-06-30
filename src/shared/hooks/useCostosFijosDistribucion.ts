// ============================================
// HOOK: useCostosFijosDistribucion
// Distribución de Costos Fijos para Análisis Marginal
// Instituto Dr. Mercado - v3.0
// ============================================
// v3.0 (multi-período + integración Sueldos):
//   - Trabaja sobre un RANGO de meses (un mes o varios). SUMA REAL del período
//     (Opción 1), no promedio móvil de 3 meses.
//   - Sueldos = COSTO LABORAL del módulo (bruto + cargas) vía costoLaboral.ts
//     cuando el mes tiene dato; si no, fallback a la erogación clasificada
//     "Sueldos y Cargas" de ese mes (Decisión C, switch por mes).
//   - Para los meses cubiertos por el módulo, se EXCLUYE la categoría de
//     erogación "Sueldos y Cargas" (evita el doble conteo).
//   - Se ELIMINA por completo el uso de sueldos_registros (corrige el doble
//     conteo que existía: erogaciones "Sueldos y Cargas" + "Remuneraciones").
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { cargarCostoLaboralRango, claveMes } from '@shared/services/costoLaboral';
import { RangoPeriodo, mesesDelRango, rangoMesUnico } from '@modules/analisis-marginal/utils/periodo';

// ============================================
// TIPOS
// ============================================

export interface CostoFijoCategoria {
  categoria_nombre: string;
  categoria_color: string;
  total: number;           // total del PERÍODO (suma real, Opción 1)
  promedioMensual: number; // total / N meses
  porcentaje: number;
}

export interface ResumenCostosFijos {
  // Compat (lo leen Dashboard/Modal): ahora representa el TOTAL del período.
  totalPromedio: number;
  // Nombres claros (multi-período):
  totalPeriodo: number;
  promedioMensual: number;
  mesesUsados: number;     // cantidad de meses del rango
  periodos: string[];
  porCategoria: CostoFijoCategoria[];
  sinDatos: boolean;
  // Desglose de fuentes (totales del período):
  promedioErogaciones: number; // (compat) total de erogaciones NO sueldos
  promedioSueldos: number;     // (compat) total de la línea Sueldos y Cargas
}

export interface DistribucionItem {
  facturado: number;
  costoFijoAsignado: number;
  resultadoNeto: number;
  resultadoNetoPct: number;
}

// ============================================
// SEMÁFORO
// ============================================

export type SemaforoColor = 'verde' | 'amarillo' | 'rojo';

export const getSemaforoColor = (pct: number): SemaforoColor => {
  if (pct > 20) return 'verde';
  if (pct >= 0) return 'amarillo';
  return 'rojo';
};

export const semaforoClasses: Record<SemaforoColor, string> = {
  verde:    'bg-green-100 text-green-700 border-green-200',
  amarillo: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  rojo:     'bg-red-100 text-red-700 border-red-200',
};

export const semaforoDot: Record<SemaforoColor, string> = {
  verde:    'bg-green-500',
  amarillo: 'bg-yellow-500',
  rojo:     'bg-red-500',
};

// ============================================
// CONSTANTES
// ============================================

const NOMBRE_SUELDOS = 'Sueldos y Cargas';
const COLOR_SUELDOS = '#0891B2'; // cyan-600

const RESUMEN_VACIO: ResumenCostosFijos = {
  totalPromedio: 0,
  totalPeriodo: 0,
  promedioMensual: 0,
  mesesUsados: 0,
  periodos: [],
  porCategoria: [],
  sinDatos: true,
  promedioErogaciones: 0,
  promedioSueldos: 0,
};

// ============================================
// CÁLCULO (función pura compartida)
// ============================================
// Fuente ÚNICA del cálculo de costos fijos del período. La usan el hook (abajo)
// y el modal del Informe (para el período actual y el período anterior), así no
// divergen. Suma real mes a mes; switch sueldos por mes (módulo vs erogación).

export async function calcularCostosFijosPeriodo(rango: RangoPeriodo): Promise<ResumenCostosFijos> {
  const meses = mesesDelRango(rango);
  const N = meses.length;
  if (N === 0) return { ...RESUMEN_VACIO };

  // Filtro OR de los meses del rango.
  const filtros = meses
    .map(p => `and(anio.eq.${p.anio},mes.eq.${p.mes})`)
    .join(',');

  // Erogaciones clasificadas como fijo en el rango.
  const { data: dataErog, error: errErog } = await supabase
    .from('erogaciones_clasificacion')
    .select(`anio, mes, monto, categoria_costo_fijo_id, categorias_costo_fijo ( nombre, color )`)
    .eq('tipo_costo', 'fijo')
    .or(filtros);
  if (errErog) throw errErog;

  // Costo laboral del módulo (bruto + cargas) por mes disponible.
  const costoLab = await cargarCostoLaboralRango(rango.anioDesde, rango.mesDesde, rango.anioHasta, rango.mesHasta);

  // Agregar por categoría (período total).
  const porCatMap = new Map<string, { nombre: string; color: string; total: number }>();

  (dataErog || []).forEach((r: any) => {
    const nombre = (r.categorias_costo_fijo as any)?.nombre || 'Sin categoría';
    const color = (r.categorias_costo_fijo as any)?.color || '#6B7280';
    const monto = Number(r.monto) || 0;
    // Switch por mes: si el módulo cubre este mes, NO contamos la erogación
    // "Sueldos y Cargas" (la reemplaza el costo laboral del módulo, abajo).
    if (nombre === NOMBRE_SUELDOS && costoLab.has(claveMes(r.anio, r.mes))) return;
    const prev = porCatMap.get(nombre);
    if (prev) prev.total += monto;
    else porCatMap.set(nombre, { nombre, color, total: monto });
  });

  meses.forEach(p => {
    const c = costoLab.get(claveMes(p.anio, p.mes));
    if (!c) return;
    const prev = porCatMap.get(NOMBRE_SUELDOS);
    if (prev) prev.total += c.costoLaboral;
    else porCatMap.set(NOMBRE_SUELDOS, { nombre: NOMBRE_SUELDOS, color: COLOR_SUELDOS, total: c.costoLaboral });
  });

  const categorias = Array.from(porCatMap.values());
  const totalPeriodo = categorias.reduce((s, c) => s + c.total, 0);

  if (totalPeriodo === 0) return { ...RESUMEN_VACIO, mesesUsados: N };

  const totalSueldos = porCatMap.get(NOMBRE_SUELDOS)?.total ?? 0;
  const totalOtros = totalPeriodo - totalSueldos;

  const porCategoria: CostoFijoCategoria[] = categorias
    .map(c => ({
      categoria_nombre: c.nombre,
      categoria_color: c.color,
      total: c.total,
      promedioMensual: N > 0 ? c.total / N : 0,
      porcentaje: totalPeriodo > 0 ? (c.total / totalPeriodo) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalPromedio: totalPeriodo,
    totalPeriodo,
    promedioMensual: N > 0 ? totalPeriodo / N : 0,
    mesesUsados: N,
    periodos: meses.map(p => `${p.anio}-${String(p.mes).padStart(2, '0')}`),
    porCategoria,
    sinDatos: false,
    promedioErogaciones: totalOtros,
    promedioSueldos: totalSueldos,
  };
}

// ============================================
// HOOK PRINCIPAL
// ============================================
// Acepta un RangoPeriodo (multi-mes) o, por retrocompat, (anio, mes).

const useCostosFijosDistribucion = (rangoOAnio: RangoPeriodo | number, mesArg?: number) => {
  const rango: RangoPeriodo = typeof rangoOAnio === 'number'
    ? rangoMesUnico(rangoOAnio, mesArg ?? 1)
    : rangoOAnio;
  const { anioDesde, mesDesde, anioHasta, mesHasta } = rango;

  const [resumen, setResumen] = useState<ResumenCostosFijos>(RESUMEN_VACIO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARGAR COSTOS FIJOS + SUELDOS (suma real del período)
  // ============================================

  const cargarCostosFijos = useCallback(async () => {
    if (!anioDesde || !mesDesde) return;

    setLoading(true);
    setError(null);

    try {
      const r = await calcularCostosFijosPeriodo({ preset: 'personalizado', anioDesde, mesDesde, anioHasta, mesHasta });
      setResumen(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar costos fijos';
      console.error('❌ useCostosFijosDistribucion:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [anioDesde, mesDesde, anioHasta, mesHasta]);

  useEffect(() => {
    cargarCostosFijos();
  }, [cargarCostosFijos]);

  // ============================================
  // CALCULAR DISTRIBUCIÓN
  // ============================================

  const calcularAsignacion = useCallback((
    facturadoItem: number,
    facturadoTotal: number
  ): number => {
    if (facturadoTotal <= 0 || resumen.totalPeriodo <= 0) return 0;
    return resumen.totalPeriodo * (facturadoItem / facturadoTotal);
  }, [resumen.totalPeriodo]);

  // ============================================
  // TEXTO DEL TOOLTIP
  // ============================================

  const getTooltipTexto = useCallback((
    facturadoItem: number,
    facturadoTotal: number,
    costoAsignado: number
  ): string => {
    if (resumen.sinDatos) {
      return 'Sin costos fijos clasificados en el período';
    }
    const ratio = facturadoTotal > 0 ? (facturadoItem / facturadoTotal) * 100 : 0;
    const mesesTexto = resumen.mesesUsados === 1 ? '1 mes' : `${resumen.mesesUsados} meses`;
    const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n);
    return [
      `CF del período (${mesesTexto}): ${fmt(resumen.totalPeriodo)}`,
      `  Otras erogaciones: ${fmt(resumen.promedioErogaciones)}`,
      `  Sueldos y Cargas: ${fmt(resumen.promedioSueldos)}`,
      `Ratio facturado: ${ratio.toFixed(2)}%`,
      `Asignado: ${fmt(costoAsignado)}`,
    ].join('\n');
  }, [resumen]);

  return {
    resumen,
    loading,
    error,
    calcularAsignacion,
    getTooltipTexto,
    getSemaforoColor,
    semaforoClasses,
    semaforoDot,
  };
};

export default useCostosFijosDistribucion;
