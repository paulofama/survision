// ============================================================
// Resultado comercial del presupuesto (circuito post-aceptación) — helpers puros
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Eje COMERCIAL del presupuesto (ACEPTADO / RECHAZADO / SIN_RESPUESTA), separado
// del `estado` operativo (borrador/entregado/practicado/cancelado).
//
// Reglas de negocio:
//   - EMITIDO = estado 'entregado' o 'practicado' (borrador/cancelado quedan fuera).
//   - El resultado se registra sobre los 'entregado' (en trámite).
//   - 'practicado' = ya se operó => ACEPTADO implícito; NUNCA "sin respuesta".
//   - SIN RESPUESTA (vencido) = 'entregado' + sin resultado + más de N días desde
//     la emisión (N configurable, presupuestos_config.plazo_sin_respuesta_dias).
// ============================================================

export type ResultadoComercial = 'ACEPTADO' | 'RECHAZADO' | 'SIN_RESPUESTA';

export interface MotivoResultado {
  id: string;
  tipo: 'ACEPTADO' | 'RECHAZADO';
  nombre: string;
  exige_observacion: boolean;
  activo: boolean;
  orden: number;
}

export const RESULTADO_META: Record<ResultadoComercial, { label: string; bg: string; text: string; dot: string }> = {
  ACEPTADO:      { label: 'Aceptado',      bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  RECHAZADO:     { label: 'Rechazado',     bg: 'bg-red-100',   text: 'text-red-600',   dot: 'bg-red-400'   },
  SIN_RESPUESTA: { label: 'Sin respuesta', bg: 'bg-gray-200',  text: 'text-gray-600',  dot: 'bg-gray-400'  },
};

/** Estados operativos que cuentan como "emitido" (entran al circuito comercial). */
export function esEmitido(estado: string): boolean {
  return estado === 'entregado' || estado === 'practicado';
}

/** Días transcurridos desde una fecha ISO hasta hoy. */
export function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Vencido = 'entregado' + sin resultado + más de `plazoDias` desde la emisión.
 * ('practicado' nunca está vencido: ya derivó en cirugía.)
 */
export function estaVencido(
  estado: string,
  resultado: string | null | undefined,
  fechaCreacion: string,
  plazoDias: number,
): boolean {
  return estado === 'entregado' && !resultado && diasDesde(fechaCreacion) > plazoDias;
}

/** ISO del corte para filtrar/marcar vencidos (hoy - plazoDias). */
export function cutoffVencidos(plazoDias: number): string {
  return new Date(Date.now() - plazoDias * 86_400_000).toISOString();
}
