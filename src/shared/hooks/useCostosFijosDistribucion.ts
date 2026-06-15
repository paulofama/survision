// ============================================
// HOOK: useCostosFijosDistribucion
// Distribución de Costos Fijos para Análisis Marginal
// Instituto Dr. Mercado - v2.0
// ============================================
// RUTA DESTINO: src/hooks/useCostosFijosDistribucion.ts
// ============================================
// v2.0: Integra sueldos_registros como categoría separada
//       CF Total = Erogaciones Fijas + Sueldos y Cargas
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ============================================
// TIPOS
// ============================================

export interface CostoFijoCategoria {
  categoria_nombre: string;
  categoria_color: string;
  total: number;
  porcentaje: number;
}

export interface ResumenCostosFijos {
  totalPromedio: number;
  mesesUsados: number;
  periodos: string[];
  porCategoria: CostoFijoCategoria[];
  sinDatos: boolean;
  // Desglose de fuentes
  promedioErogaciones: number;
  promedioSueldos: number;
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
// HELPER: calcular 3 meses anteriores
// ============================================

const getUltimos3Meses = (anio: number, mes: number): { anio: number; mes: number }[] => {
  const periodos: { anio: number; mes: number }[] = [];
  let a = anio;
  let m = mes;

  for (let i = 0; i < 3; i++) {
    m--;
    if (m < 1) { m = 12; a--; }
    periodos.push({ anio: a, mes: m });
  }

  return periodos;
};

// ============================================
// HOOK PRINCIPAL
// ============================================

const useCostosFijosDistribucion = (anio: number, mes: number) => {
  const [resumen, setResumen] = useState<ResumenCostosFijos>({
    totalPromedio: 0,
    mesesUsados: 0,
    periodos: [],
    porCategoria: [],
    sinDatos: true,
    promedioErogaciones: 0,
    promedioSueldos: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // CARGAR COSTOS FIJOS + SUELDOS
  // ============================================

  const cargarCostosFijos = useCallback(async () => {
    if (!anio || !mes) return;

    setLoading(true);
    setError(null);

    try {
      const periodos = getUltimos3Meses(anio, mes);

      // Construir filtro OR para los 3 meses
      const filtros = periodos
        .map(p => `and(anio.eq.${p.anio},mes.eq.${p.mes})`)
        .join(',');

      // ── CONSULTA 1: Erogaciones clasificadas como fijo ──
      const { data: dataErog, error: errErog } = await supabase
        .from('erogaciones_clasificacion')
        .select(`anio, mes, monto, categoria_costo_fijo_id, categorias_costo_fijo ( nombre, color )`)
        .eq('tipo_costo', 'fijo')
        .or(filtros);

      if (errErog) throw errErog;

      // ── CONSULTA 2: Sueldos y cargas sociales ──
      const { data: dataSueldos, error: errSueldos } = await supabase
        .from('sueldos_registros')
        .select('anio, mes, monto')
        .or(filtros);

      if (errSueldos) throw errSueldos;

      const registrosErog = dataErog || [];
      const registrosSueldos = dataSueldos || [];

      // Si no hay datos de ninguna fuente
      if (registrosErog.length === 0 && registrosSueldos.length === 0) {
        setResumen({
          totalPromedio: 0, mesesUsados: 0, periodos: [],
          porCategoria: [], sinDatos: true,
          promedioErogaciones: 0, promedioSueldos: 0,
        });
        return;
      }

      // ── CALCULAR TOTALES POR PERÍODO (ambas fuentes) ──
      const totalPorPeriodo = new Map<string, { erog: number; sueldos: number }>();
      periodos.forEach(p => {
        const key = `${p.anio}-${String(p.mes).padStart(2, '0')}`;
        totalPorPeriodo.set(key, { erog: 0, sueldos: 0 });
      });

      registrosErog.forEach((r: any) => {
        const key = `${r.anio}-${String(r.mes).padStart(2, '0')}`;
        const entry = totalPorPeriodo.get(key);
        if (entry) entry.erog += (Number(r.monto) || 0);
      });

      registrosSueldos.forEach((r: any) => {
        const key = `${r.anio}-${String(r.mes).padStart(2, '0')}`;
        const entry = totalPorPeriodo.get(key);
        if (entry) entry.sueldos += (Number(r.monto) || 0);
      });

      // Períodos con datos (de cualquier fuente)
      const periodosConDatos = Array.from(totalPorPeriodo.entries())
        .filter(([, v]) => (v.erog + v.sueldos) > 0);

      const mesesUsados = periodosConDatos.length;
      if (mesesUsados === 0) {
        setResumen({
          totalPromedio: 0, mesesUsados: 0, periodos: [],
          porCategoria: [], sinDatos: true,
          promedioErogaciones: 0, promedioSueldos: 0,
        });
        return;
      }

      const totalErog = periodosConDatos.reduce((s, [, v]) => s + v.erog, 0);
      const totalSueldos = periodosConDatos.reduce((s, [, v]) => s + v.sueldos, 0);
      const promedioErog = totalErog / mesesUsados;
      const promedioSueldos = totalSueldos / mesesUsados;
      const totalPromedio = promedioErog + promedioSueldos;

      // ── DESGLOSE POR CATEGORÍA (erogaciones) ──
      const porCatMap = new Map<string, { nombre: string; color: string; total: number }>();

      registrosErog.forEach((r: any) => {
        const catNombre = (r.categorias_costo_fijo as any)?.nombre || 'Sin categoría';
        const catColor  = (r.categorias_costo_fijo as any)?.color  || '#6B7280';
        const monto = Number(r.monto) || 0;

        const prev = porCatMap.get(catNombre);
        if (prev) { prev.total += monto; }
        else { porCatMap.set(catNombre, { nombre: catNombre, color: catColor, total: monto }); }
      });

      // Agregar "Remuneraciones Personal" como categoría separada
      if (totalSueldos > 0) {
        porCatMap.set('Remuneraciones Personal', {
          nombre: 'Remuneraciones Personal',
          color: '#0891B2',  // cyan-600
          total: totalSueldos,
        });
      }

      const totalGlobal = totalErog + totalSueldos;

      const porCategoria: CostoFijoCategoria[] = Array.from(porCatMap.values())
        .map(c => ({
          categoria_nombre: c.nombre,
          categoria_color: c.color,
          total: totalGlobal > 0 ? (c.total / mesesUsados) : 0,
          porcentaje: totalGlobal > 0 ? (c.total / totalGlobal) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      setResumen({
        totalPromedio,
        mesesUsados,
        periodos: periodosConDatos.map(([k]) => k),
        porCategoria,
        sinDatos: totalPromedio === 0,
        promedioErogaciones: promedioErog,
        promedioSueldos: promedioSueldos,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar costos fijos';
      console.error('❌ useCostosFijosDistribucion:', err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

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
    if (facturadoTotal <= 0 || resumen.totalPromedio <= 0) return 0;
    return resumen.totalPromedio * (facturadoItem / facturadoTotal);
  }, [resumen.totalPromedio]);

  // ============================================
  // TEXTO DEL TOOLTIP
  // ============================================

  const getTooltipTexto = useCallback((
    facturadoItem: number,
    facturadoTotal: number,
    costoAsignado: number
  ): string => {
    if (resumen.sinDatos) {
      return 'Sin datos de costos fijos clasificados en los últimos 3 meses';
    }
    const ratio = facturadoTotal > 0 ? (facturadoItem / facturadoTotal) * 100 : 0;
    const mesesTexto = resumen.mesesUsados === 1 ? '1 mes' : `${resumen.mesesUsados} meses`;
    const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n);
    return [
      `CF total (prom. ${mesesTexto}): ${fmt(resumen.totalPromedio)}`,
      `  Erogaciones: ${fmt(resumen.promedioErogaciones)}`,
      `  Remuneraciones: ${fmt(resumen.promedioSueldos)}`,
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
