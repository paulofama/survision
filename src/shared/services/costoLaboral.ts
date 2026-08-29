// ============================================================
// SERVICIO: Costo laboral del período (puente al módulo de Sueldos)
// Sistema de Gestión Integral - Survisión S.A.
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
//
// ⚠️ El fallback es SILENCIOSO por diseño: si la RPC falla (sin permiso, RPC
// ausente, red), `cargarCostoLaboralRango` devuelve un Map vacío y el análisis
// sigue con las erogaciones, que valen ~la mitad del costo laboral real. Eso
// evita que el módulo se rompa, pero no debe pasar inadvertido en un informe
// que se imprime y se manda. Para eso está `cargarCostoLaboralRangoDetallado`,
// que además del Map devuelve el error: lo usa la validación de integridad del
// período (ver `analisis-marginal/utils/integridadPeriodo.ts`).
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

/** Resultado con diagnóstico: distingue "no hay meses" de "la RPC falló". */
export interface CostoLaboralRango {
  meses: Map<string, CostoLaboralMes>;
  /** Mensaje de error de la RPC, o null si respondió bien (aunque sea vacía). */
  error: string | null;
}

/** Clave estable de un mes en el Map. */
export const claveMes = (anio: number, mes: number): string => `${anio}-${mes}`;

interface FilaCostoLaboral {
  anio: number;
  mes: number;
  bruto: number;
  cargas: number;
  hc_empleados?: number;
  costo_laboral: number;
}

/**
 * Costo laboral (bruto + cargas) por mes disponible dentro del rango, con el
 * error de la RPC si lo hubo. Un Map vacío con `error: null` significa que la
 * consulta anduvo y realmente no hay meses cargados; con `error` != null
 * significa que no se pudo saber y NO hay que confiar en el fallback.
 */
export async function cargarCostoLaboralRangoDetallado(
  anioDesde: number,
  mesDesde: number,
  anioHasta: number,
  mesHasta: number,
): Promise<CostoLaboralRango> {
  const meses = new Map<string, CostoLaboralMes>();
  try {
    const { data, error } = await supabase.rpc('app_costo_laboral_meses', {
      p_anio_desde: anioDesde,
      p_mes_desde: mesDesde,
      p_anio_hasta: anioHasta,
      p_mes_hasta: mesHasta,
    });
    if (error) {
      console.warn('costoLaboral: RPC app_costo_laboral_meses falló:', error.message);
      return { meses, error: error.message };
    }
    ((data || []) as FilaCostoLaboral[]).forEach((r) => {
      meses.set(claveMes(r.anio, r.mes), {
        anio: r.anio,
        mes: r.mes,
        bruto: Number(r.bruto || 0),
        cargas: Number(r.cargas || 0),
        hcEmpleados: Number(r.hc_empleados || 0),
        costoLaboral: Number(r.costo_laboral || 0),
      });
    });
    return { meses, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error inesperado consultando costo laboral';
    console.error('costoLaboral: error inesperado:', err);
    return { meses, error: msg };
  }
}

/**
 * Costo laboral por mes disponible dentro del rango.
 * Ante error devuelve Map vacío → el llamador cae al fallback de erogaciones,
 * sin romper el análisis. Si necesitás saber si hubo error (para avisarle al
 * usuario), usá `cargarCostoLaboralRangoDetallado`.
 */
export async function cargarCostoLaboralRango(
  anioDesde: number,
  mesDesde: number,
  anioHasta: number,
  mesHasta: number,
): Promise<Map<string, CostoLaboralMes>> {
  const { meses } = await cargarCostoLaboralRangoDetallado(anioDesde, mesDesde, anioHasta, mesHasta);
  return meses;
}
