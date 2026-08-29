// ============================================================
// CUADRATURA DEL DETALLE — Evolución Temporal
// ============================================================
//
// Verifica, mes a mes, que la suma de las filas de detalle dé el total de la
// fila padre. Si no da, NO se oculta la diferencia: se devuelve una fila
// "Sin detalle / diferencia" que la pantalla muestra en ámbar.
//
// Un descuadre silencioso es peor que uno visible: quien lee la pantalla
// asumiría que el detalle explica el total, y tomaría decisiones sobre una
// composición incompleta.
//
// Causas típicas: el detalle y el total imputan a meses distintos, comprobantes
// anulados incluidos de un lado, prorrateos sin comprobante asociado, o
// truncado por tope de filas (ese caso se informa aparte, no como error).
// ============================================================

import type { FilaEvolucion, Mes } from '../types/evolucionTemporal';

/** Tolerancia en pesos. Por debajo se considera redondeo. */
export const TOLERANCIA = 0.01;

export interface DesvioMes {
  mes: Mes;
  esperado: number;
  sumado: number;
  diferencia: number;
}

export interface ResultadoCuadratura {
  /** Fila a agregar al final del detalle, o null si cuadra todo. */
  filaDiferencia: FilaEvolucion | null;
  /** Meses que no cuadran, para log y para el panel de advertencias. */
  desvios: DesvioMes[];
}

/**
 * @param filas       detalle ya armado (sin la fila de diferencia)
 * @param totalPadre  importes por mes de la fila que se expandió
 * @param meses       meses visibles
 * @param label       nombre de la agrupación, para el mensaje
 * @param truncado    si el detalle se recortó por tope: la diferencia es
 *                    esperable y se rotula distinto
 */
export function cuadrarDetalle(
  filas: FilaEvolucion[],
  totalPadre: Record<Mes, number>,
  meses: Mes[],
  label: string,
  truncado = false,
): ResultadoCuadratura {
  const diferencias: Record<Mes, number> = {} as Record<Mes, number>;
  const desvios: DesvioMes[] = [];

  meses.forEach((m) => {
    const sumado = filas.reduce((s, f) => s + (f.valores[m] || 0), 0);
    const esperado = totalPadre[m] || 0;
    const dif = esperado - sumado;
    diferencias[m] = Math.abs(dif) > TOLERANCIA ? dif : 0;
    if (Math.abs(dif) > TOLERANCIA) {
      desvios.push({ mes: m, esperado, sumado, diferencia: dif });
    }
  });

  if (desvios.length === 0) return { filaDiferencia: null, desvios };

  const total = meses.reduce((s, m) => s + (diferencias[m] || 0), 0);

  return {
    desvios,
    filaDiferencia: {
      id: `diferencia.${label}`,
      tipo: 'diferencia',
      nivel: 3,
      label: truncado
        ? `Resto no listado (${desvios.length} ${desvios.length === 1 ? 'mes' : 'meses'})`
        : `Sin detalle / diferencia (${desvios.length} ${desvios.length === 1 ? 'mes' : 'meses'})`,
      expandible: false,
      valores: diferencias,
      total,
      promedioMensual: 0,
      metadata: {
        esEstimado: true,
        tituloCompleto: truncado
          ? `Importe de los elementos que no se muestran por el tope de filas, en ${label}.`
          : `La suma del detalle no coincide con el total de ${label}. Revisar imputación de fechas o elementos sin comprobante asociado.`,
      },
    },
  };
}
