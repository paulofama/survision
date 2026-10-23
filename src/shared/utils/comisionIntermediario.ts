// ============================================
// Comisión del Círculo Médico (intermediario de facturación)
// Sistema de Gestión Integral · Survisión S.A.
// ============================================
//
// Las obras sociales que se facturan por el Círculo Médico le dejan un
// porcentaje de lo que pagan. El Círculo lo cobra aparte, con una factura C que
// se clasifica como variable y que por eso el informe excluye. Acá se devenga
// práctica por práctica: el porcentaje vigente por la COBERTURA (lo que paga la
// obra social, sin el coseguro), en el mes en que se hace la práctica.
//
// Datos: `comision_intermediario` (porcentaje con vigencia, igual que
// honorarios_config) y `comision_intermediario_os` (qué obras sociales van por
// el Círculo: AgeFact_id 59 en GECLISA). Ver migración 76.
// ============================================

import { supabase } from '@shared/lib/supabase';
import { traerTodo } from '@shared/lib/traerTodo';

export interface PorcentajeIntermediario {
  intermediario: string;
  porcentaje: number;
  vigencia_desde: string;
}

export interface ConfigComisionIntermediario {
  porcentajes: PorcentajeIntermediario[];
  /** os_id de GECLISA → intermediario por el que se factura. */
  osIntermediario: Map<number, string>;
}

export const CONFIG_COMISION_VACIA: ConfigComisionIntermediario = {
  porcentajes: [],
  osIntermediario: new Map(),
};

/**
 * Porcentaje que regía para el mes ('YYYY-MM'). Misma regla que
 * `configVigente` de honorarios: la versión con la vigencia más alta que no
 * empiece después del último día del mes. Sin versión vigente, 0.
 */
export function porcentajeIntermediarioVigente(
  porcentajes: PorcentajeIntermediario[],
  intermediario: string,
  mes: string,
): number {
  const finDeMes = `${mes}-31`;
  let elegida: PorcentajeIntermediario | null = null;
  for (const p of porcentajes) {
    if (p.intermediario !== intermediario) continue;
    const desde = String(p.vigencia_desde || '2000-01-01').slice(0, 10);
    if (desde > finDeMes) continue;
    if (!elegida || desde > String(elegida.vigencia_desde).slice(0, 10)) elegida = p;
  }
  return elegida ? Number(elegida.porcentaje) || 0 : 0;
}

/** Comisión de una práctica. Cero si su obra social no va por un intermediario. */
export function comisionIntermediario(
  cfg: ConfigComisionIntermediario,
  osId: number | null | undefined,
  cobertura: number | null | undefined,
  mes: string,
): number {
  if (osId == null) return 0;
  const intermediario = cfg.osIntermediario.get(Number(osId));
  if (!intermediario) return 0;
  const pct = porcentajeIntermediarioVigente(cfg.porcentajes, intermediario, mes);
  return ((Number(cobertura) || 0) * pct) / 100;
}

/**
 * Comisión de una prestación de las pantallas del Análisis Marginal. Usa el mes
 * de la propia prestación: un período de varios meses puede cruzar un cambio
 * de porcentaje.
 */
export function comisionDePrestacion(
  cfg: ConfigComisionIntermediario,
  prest: { os_id: number | null; cobertura: number | null; anio: number; mes_numero: number },
): number {
  const mes = `${prest.anio}-${String(prest.mes_numero).padStart(2, '0')}`;
  return comisionIntermediario(cfg, prest.os_id, prest.cobertura, mes);
}

export async function cargarConfigComisionIntermediario(): Promise<ConfigComisionIntermediario> {
  const [porcentajes, os] = await Promise.all([
    traerTodo<PorcentajeIntermediario>((d) => supabase
      .from('comision_intermediario')
      .select('intermediario, porcentaje, vigencia_desde')
      .order('id')
      .range(d, d + 999)),
    traerTodo<{ os_id: number; intermediario: string }>((d) => supabase
      .from('comision_intermediario_os')
      .select('os_id, intermediario')
      .order('os_id')
      .range(d, d + 999)),
  ]);
  return {
    porcentajes: porcentajes.map((p) => ({ ...p, porcentaje: Number(p.porcentaje) || 0 })),
    osIntermediario: new Map(os.map((o) => [Number(o.os_id), o.intermediario])),
  };
}
