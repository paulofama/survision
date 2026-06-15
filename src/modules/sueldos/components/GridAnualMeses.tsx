// ===========================================================================
// COMPONENT: GridAnualMeses - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Grilla de 12 celdas (3 columnas x 4 filas) con el estado de cada mes del
// anio. Selector de anio integrado.
//
// Props:
//   - anio: anio actualmente seleccionado
//   - onAnioChange: callback para cambiar anio (cargado por el padre)
//   - liquidaciones: array de liquidaciones del anio (puede ser parcial)
//   - mesActual: opcional, resalta el mes corriente
// ===========================================================================

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CardEstadoMes } from './CardEstadoMes';
import type { LiquidacionMes } from '../types/sueldos';

interface Props {
  anio: number;
  onAnioChange: (anio: number) => void;
  liquidaciones: LiquidacionMes[];
  /** 1-12, opcional: resalta el mes corriente con un anillo. */
  mesActual?: number;
  /** Limites de navegacion del selector. */
  anioMin?: number;
  anioMax?: number;
}

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const GridAnualMeses: React.FC<Props> = ({
  anio,
  onAnioChange,
  liquidaciones,
  mesActual,
  anioMin = 2024,
  anioMax = 2030,
}) => {
  const porMes = new Map(liquidaciones.map((l) => [l.mes, l]));

  const handlePrev = () => {
    if (anio > anioMin) onAnioChange(anio - 1);
  };
  const handleNext = () => {
    if (anio < anioMax) onAnioChange(anio + 1);
  };

  return (
    <div className="space-y-4">
      {/* Selector de anio */}
      <div className="flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={handlePrev}
          disabled={anio <= anioMin}
          className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Año anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-2xl font-bold text-gray-900 min-w-[80px] text-center">
          {anio}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={anio >= anioMax}
          className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Año siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Grilla 3 x 4 (responsive: 1 col en mobile, 2 en md, 3 en lg, 4 en xl) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {MESES.map((mes) => (
          <CardEstadoMes
            key={mes}
            anio={anio}
            mes={mes}
            liquidacion={porMes.get(mes) ?? null}
            destacado={mes === mesActual}
          />
        ))}
      </div>
    </div>
  );
};

export default GridAnualMeses;
export { GridAnualMeses };
