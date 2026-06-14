// ============================================================
// HOOK: useCajaCalculation
// Replica exacta de calculateCajaByDifference() del HTML
// CÃ¡lculo de IVA por diferencia con auto-correcciÃ³n
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import type { CajaCalculated, CajaIvaEstado, CajaSuggestion } from './types';

const INITIAL_CAJA: CajaCalculated = {
  exento: 0,
  neto105: 0,
  iva105: 0,
  neto21: 0,
  iva21: 0,
  total: 0,
  estado: 'Exento',
};

const INITIAL_SUGGESTION: CajaSuggestion = {
  show: false,
  message: '',
  suggestedExento: 0,
  suggestedNeto: 0,
  originalExento: 0,
  originalNeto: 0,
};

// Tolerancia: 0.5 puntos porcentuales sobre N
const TOLERANCE_PP = 0.005;

export function useCajaCalculation() {
  const [cajaValues, setCajaValues] = useState<CajaCalculated>(INITIAL_CAJA);
  const [suggestion, setSuggestion] = useState<CajaSuggestion>(INITIAL_SUGGESTION);
  const [cajaError, setCajaError] = useState<string | null>(null);

  /**
   * Calcula IVA por diferencia exactamente como el HTML original.
   * 
   * Inputs:
   *   E = Exento (honorarios exentos facturados por caja)
   *   N = Neto gravado total (neto que fue facturado con IVA)
   *   T = Total cobrado por caja
   * 
   * CÃ¡lculo:
   *   I = T - E - N  (IVA total por diferencia)
   * 
   * DetecciÃ³n automÃ¡tica de alÃ­cuota:
   *   - Si I â‰ˆ 0.105Â·N â†’ todo 10.5%
   *   - Si I â‰ˆ 0.21Â·N  â†’ todo 21%
   *   - Si entre ambos  â†’ Mixto (resolver sistema)
   *   - Si I < 0.105Â·N  â†’ Error + sugerencia de correcciÃ³n
   *   - Si I > 0.21Â·N   â†’ Error inconsistente
   */
  const calculate = useCallback(
    (exentoInput: number, netoInput: number, totalInput: number): CajaCalculated => {
      const E = exentoInput || 0;
      const N = netoInput || 0;
      const T = totalInput || 0;

      // Ocultar sugerencias previas
      setSuggestion(INITIAL_SUGGESTION);
      setCajaError(null);

      // Sin datos â†’ todo cero
      if (T === 0 && E === 0 && N === 0) {
        const result = { ...INITIAL_CAJA };
        setCajaValues(result);
        return result;
      }

      // Solo exento (sin gravado)
      if (N === 0) {
        const result: CajaCalculated = {
          exento: E,
          neto105: 0,
          iva105: 0,
          neto21: 0,
          iva21: 0,
          total: E,
          estado: 'Exento',
        };
        setCajaValues(result);
        return result;
      }

      // IVA por diferencia
      const I = T - E - N;

      // Umbrales con tolerancia
      const iva105Expected = N * 0.105;
      const iva21Expected = N * 0.21;
      const tolerance = N * TOLERANCE_PP;

      let estado: CajaIvaEstado;
      let neto105 = 0;
      let iva105 = 0;
      let neto21 = 0;
      let iva21 = 0;

      if (I < 0) {
        // IVA negativo â†’ error
        setCajaError(
          `El IVA resultante es negativo ($${I.toFixed(2)}). ` +
            `Verifique que el Total sea mayor que Exento + Neto.`
        );
        estado = 'Error';
      } else if (I < iva105Expected - tolerance) {
        // I < 10.5% â†’ probablemente hay exentos incluidos en N
        const excessInNeto = N - I / 0.105;
        const suggestedExento = E + excessInNeto;
        const suggestedNeto = N - excessInNeto;

        setSuggestion({
          show: true,
          message:
            `El IVA calculado ($${I.toFixed(2)}) es menor al mÃ­nimo esperado ` +
            `($${iva105Expected.toFixed(2)} al 10,5%). Posiblemente $${excessInNeto.toFixed(2)} ` +
            `del neto son en realidad honorarios exentos.`,
          suggestedExento: Math.round(suggestedExento * 100) / 100,
          suggestedNeto: Math.round(suggestedNeto * 100) / 100,
          originalExento: E,
          originalNeto: N,
        });

        // Calcular con lo que hay (forzar 10.5%)
        neto105 = I / 0.105;
        iva105 = I;
        estado = 'Error';
      } else if (Math.abs(I - iva105Expected) <= tolerance) {
        // Todo 10.5%
        neto105 = N;
        iva105 = N * 0.105;
        estado = '10,5%';
      } else if (Math.abs(I - iva21Expected) <= tolerance) {
        // Todo 21%
        neto21 = N;
        iva21 = N * 0.21;
        estado = '21%';
      } else if (I > iva105Expected + tolerance && I < iva21Expected - tolerance) {
        // Mixto: resolver sistema de ecuaciones
        // N105 + N21 = N
        // 0.105Â·N105 + 0.21Â·N21 = I
        // â†’ N21 = (I - 0.105Â·N) / (0.21 - 0.105)
        // â†’ N105 = N - N21
        neto21 = (I - 0.105 * N) / (0.21 - 0.105);
        neto105 = N - neto21;

        // ValidaciÃ³n de signos
        if (neto21 < 0 || neto105 < 0) {
          setCajaError('No se puede descomponer el IVA en alÃ­cuotas vÃ¡lidas.');
          estado = 'Error';
        } else {
          iva21 = neto21 * 0.21;
          iva105 = neto105 * 0.105;
          estado = 'Mixto';
        }
      } else if (I > iva21Expected + tolerance) {
        // I > 21% â†’ datos inconsistentes
        setCajaError(
          `El IVA calculado ($${I.toFixed(2)}) supera el mÃ¡ximo posible ` +
            `($${iva21Expected.toFixed(2)} al 21%). Verifique los montos.`
        );
        neto21 = N;
        iva21 = N * 0.21;
        estado = 'Error';
      } else {
        // Fallback 21%
        neto21 = N;
        iva21 = N * 0.21;
        estado = '21%';
      }

      const calculatedTotal = E + neto105 + iva105 + neto21 + iva21;

      const result: CajaCalculated = {
        exento: E,
        neto105: Math.round(neto105 * 100) / 100,
        iva105: Math.round(iva105 * 100) / 100,
        neto21: Math.round(neto21 * 100) / 100,
        iva21: Math.round(iva21 * 100) / 100,
        total: Math.round(calculatedTotal * 100) / 100,
        estado,
      };

      setCajaValues(result);
      return result;
    },
    []
  );

  /** Aplicar sugerencia de auto-correcciÃ³n */
  const applySuggestion = useCallback(() => {
    setSuggestion(INITIAL_SUGGESTION);
    // El componente padre usarÃ¡ suggestedExento/suggestedNeto
    // para actualizar los inputs del formulario
  }, []);

  /** Ignorar sugerencia */
  const dismissSuggestion = useCallback(() => {
    setSuggestion(INITIAL_SUGGESTION);
  }, []);

  /** Reset */
  const reset = useCallback(() => {
    setCajaValues(INITIAL_CAJA);
    setSuggestion(INITIAL_SUGGESTION);
    setCajaError(null);
  }, []);

  /** Badge de estado con color */
  const estadoBadge = useMemo(() => {
    const map: Record<CajaIvaEstado, { bg: string; text: string; label: string }> = {
      Exento: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Exento' },
      '10,5%': { bg: 'bg-green-100', text: 'text-green-800', label: '10,5%' },
      '21%': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '21%' },
      Mixto: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Mixto (10,5% + 21%)' },
      Error: { bg: 'bg-red-100', text: 'text-red-800', label: 'Error en datos' },
    };
    return map[cajaValues.estado];
  }, [cajaValues.estado]);

  return {
    cajaValues,
    suggestion,
    cajaError,
    estadoBadge,
    calculate,
    applySuggestion,
    dismissSuggestion,
    reset,
  };
}

// ============================================================
// FUNCIONES PURAS: CÃ¡lculos de totales
// ============================================================

/** Calcular totales de OS */
export function calcularOS(
  exentos: number,
  gravados21: number,
  gravados105: number
) {
  const iva21 = gravados21 * 0.21;
  const iva105 = gravados105 * 0.105;
  return {
    osExentos: exentos,
    osGravados21: gravados21,
    osGravados105: gravados105,
    osIva21: Math.round(iva21 * 100) / 100,
    osIva105: Math.round(iva105 * 100) / 100,
    osIvaTotal: Math.round((iva21 + iva105) * 100) / 100,
    osTotal: Math.round((exentos + gravados21 + iva21 + gravados105 + iva105) * 100) / 100,
  };
}

/** Calcular totales consolidados */
export function calcularTotales(
  ingresoPorCaja: number,
  caja: CajaCalculated,
  os: ReturnType<typeof calcularOS>,
  retencionGastos: number
) {
  const totalExentos = caja.exento + os.osExentos;
  const totalGravados21 = caja.neto21 + os.osGravados21;
  const totalGravados105 = caja.neto105 + os.osGravados105;
  const totalIva = (caja.iva105 + caja.iva21) + (os.osIva21 + os.osIva105);
  const totalLiquidado = ingresoPorCaja + caja.total + os.osTotal;
  const totalAbonar = totalLiquidado - retencionGastos;

  return {
    totalExentos: Math.round(totalExentos * 100) / 100,
    totalGravados21: Math.round(totalGravados21 * 100) / 100,
    totalGravados105: Math.round(totalGravados105 * 100) / 100,
    totalIva: Math.round(totalIva * 100) / 100,
    totalLiquidado: Math.round(totalLiquidado * 100) / 100,
    totalAbonar: Math.round(totalAbonar * 100) / 100,
  };
}

/** Calcular detalle para facturar (reporte) */
export function calcularFacturacionDetails(liq: {
  cajaExentos: number;
  osExentos: number;
  cajaGravados21: number;
  osGravados21: number;
  cajaGravados105: number;
  osGravados105: number;
}) {
  const lineaExenta = liq.cajaExentos + liq.osExentos;
  const totalGravados21 = liq.cajaGravados21 + liq.osGravados21;
  const totalIva21 = totalGravados21 * 0.21;
  const totalConIva21 = totalGravados21 * 1.21;
  const totalGravados105 = liq.cajaGravados105 + liq.osGravados105;
  const totalIva105 = totalGravados105 * 0.105;
  const totalConIva105 = totalGravados105 * 1.105;
  const totalFacturable =
    lineaExenta + totalGravados21 + totalIva21 + totalGravados105 + totalIva105;

  return {
    lineaExenta: Math.round(lineaExenta * 100) / 100,
    totalGravados21: Math.round(totalGravados21 * 100) / 100,
    totalIva21: Math.round(totalIva21 * 100) / 100,
    totalConIva21: Math.round(totalConIva21 * 100) / 100,
    totalGravados105: Math.round(totalGravados105 * 100) / 100,
    totalIva105: Math.round(totalIva105 * 100) / 100,
    totalConIva105: Math.round(totalConIva105 * 100) / 100,
    totalFacturable: Math.round(totalFacturable * 100) / 100,
    ivaTotal: Math.round((totalIva21 + totalIva105) * 100) / 100,
  };
}
