// ============================================================
// SERVICIO: Costo laboral del período (puente al módulo de Sueldos)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Fuente ÚNICA del costo laboral para el Análisis Marginal (lo usan tanto
// useCostosFijosDistribucion como useEvolucionMensual, para no divergir).
//
// Lee el agregado mensual (bruto + cargas patronales) vía la RPC
// `app_costo_laboral_meses` (SECURITY DEFINER, gateada por permiso
// 'analisis_marginal'; migración 21). NO lee asientos_sueldos/f931 directo
// porque su RLS exige permiso 'sueldos' y no corresponde exponer el detalle por
// empleado a usuarios de análisis.
//
// Devuelve un Map por mes con los meses DISPONIBLES (con asiento + F.931
// confirmado). Los meses que no aparecen → el llamador hace fallback a la
// erogación clasificada "Sueldos y Cargas" (Decisión C, switch por mes).
// ============================================================

import { supabase } from '@shared/lib/supabase';

export interface CostoLaboralMes {
  anio: number;
  mes: number;
  bruto: number;          // sueldos brutos (asientos_sueldos.bruto_total)
  cargas: number;         // cargas patronales (contrib_ss_351 + contrib_os_352 + art + scvo)
  hcEmpleados: number;    // HC de empleados de recibo (sin los facturado-only, que ya están en Honorarios)
  costoLaboral: number;   // bruto + cargas = costo real para la clínica (NO incluye hcEmpleados)
}

/** Clave estable de un mes en el Map. */
export const claveMes = (anio: number, mes: number): string => `${anio}-${mes}`;

/**
 * Costo laboral (bruto + cargas) por mes disponible dentro del rango.
 * Ante error (sin permiso, RPC ausente, etc.) devuelve Map vacío → el llamador
 * cae al fallback de erogaciones, sin romper el análisis.
 */
export async function cargarCostoLaboralRango(
  anioDesde: number,
  mesDesde: number,
  anioHasta: number,
  mesHasta: number,
): Promise<Map<string, CostoLaboralMes>> {
  const mapa = new Map<string, CostoLaboralMes>();
  try {
    const { data, error } = await supabase.rpc('app_costo_laboral_meses', {
      p_anio_desde: anioDesde,
      p_mes_desde: mesDesde,
      p_anio_hasta: anioHasta,
      p_mes_hasta: mesHasta,
    });
    if (error) {
      console.warn('costoLaboral: RPC app_costo_laboral_meses falló:', error.message);
      return mapa;
    }
    (data || []).forEach((r: { anio: number; mes: number; bruto: number; cargas: number; hc_empleados?: number; costo_laboral: number }) => {
      mapa.set(claveMes(r.anio, r.mes), {
        anio: r.anio,
        mes: r.mes,
        bruto: Number(r.bruto || 0),
        cargas: Number(r.cargas || 0),
        hcEmpleados: Number(r.hc_empleados || 0),
        costoLaboral: Number(r.costo_laboral || 0),
      });
    });
  } catch (err) {
    console.error('costoLaboral: error inesperado:', err);
  }
  return mapa;
}
