// ===========================================================================
// COMPONENT: CardEstadoMes - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Celda del calendario anual: muestra un mes (Enero 2026, Mayo 2026, etc.)
// con su estado actual del flujo de carga.
//
// Si no existe fila en `liquidaciones_mes` se considera "sin iniciar" y se
// renderiza con estilo apagado. Click navega al MesDetallePage de ese mes.
// ===========================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarPlus,
  CalendarCheck,
  Lock,
  ChevronRight,
  CircleDot,
} from 'lucide-react';
import type { EstadoLiquidacion, LiquidacionMes } from '../../types/sueldos';
import {
  COLOR_ESTADO_MES,
  LABEL_ESTADO_MES,
  MESES_LABEL,
} from '../../utils/sueldos/constantes';

interface Props {
  anio: number;
  /** 1-12 */
  mes: number;
  /** Liquidacion del mes si ya existe en BD. Si es null/undefined => sin iniciar. */
  liquidacion?: LiquidacionMes | null;
  /** Mostrar destacado (ej. mes actual). */
  destacado?: boolean;
}

// ---------------------------------------------------------------------------
// HELPERS (module scope)
// ---------------------------------------------------------------------------

function mesLabel(mes: number): string {
  if (mes < 1 || mes > 12) return '';
  return MESES_LABEL[mes - 1];
}

function iconoPorEstado(estado: EstadoLiquidacion | 'SIN_INICIAR'): React.ReactNode {
  if (estado === 'SIN_INICIAR') return <CalendarPlus className="h-4 w-4" />;
  if (estado === 'CERRADO') return <Lock className="h-4 w-4" />;
  if (estado === 'ASIENTO_GENERADO') return <CalendarCheck className="h-4 w-4" />;
  return <CircleDot className="h-4 w-4" />;
}

// ---------------------------------------------------------------------------
// COMPONENTE
// ---------------------------------------------------------------------------

const CardEstadoMes: React.FC<Props> = ({ anio, mes, liquidacion, destacado }) => {
  const navigate = useNavigate();
  const existe = !!liquidacion;
  const estado: EstadoLiquidacion | 'SIN_INICIAR' = liquidacion?.estado ?? 'SIN_INICIAR';

  // Colores: si esta iniciado usa el mapeo del estado; si no, gris apagado
  const colores = existe
    ? COLOR_ESTADO_MES[liquidacion!.estado]
    : {
        bg: 'bg-white',
        text: 'text-gray-500',
        border: 'border-dashed border-gray-300',
        hex: '#9ca3af',
      };

  const handleClick = () => navigate(`/sueldos/mes/${anio}/${mes}`);

  const label = existe ? LABEL_ESTADO_MES[liquidacion!.estado] : 'Sin iniciar';

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        text-left
        ${colores.bg} ${colores.border} border rounded-xl
        p-4
        transition-all duration-150
        hover:shadow-md hover:-translate-y-0.5
        focus:outline-none focus:ring-2 focus:ring-blue-500
        ${destacado ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
      `}
      aria-label={`${mesLabel(mes)} ${anio} - ${label}`}
    >
      {/* Cabecera: mes + año */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            {anio}
          </div>
          <div className="text-lg font-bold text-gray-900">
            {mesLabel(mes)}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>

      {/* Badge de estado */}
      <div
        className={`
          inline-flex items-center gap-1.5
          px-2 py-1
          rounded-md text-xs font-medium
          ${colores.bg} ${colores.text}
          ${existe ? 'border ' + colores.border : ''}
        `}
        style={existe ? undefined : { color: colores.hex }}
      >
        {iconoPorEstado(estado)}
        {label}
      </div>

      {/* Sub-info */}
      {existe && liquidacion?.cerrado_at && (
        <div className="mt-2 text-[10px] text-gray-500">
          Cerrado el{' '}
          {new Date(liquidacion.cerrado_at).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </div>
      )}
      {existe && liquidacion?.reabierto_at && (
        <div className="mt-1 text-[10px] text-yellow-700">
          Reabierto el{' '}
          {new Date(liquidacion.reabierto_at).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </div>
      )}
    </button>
  );
};

export default CardEstadoMes;
export { CardEstadoMes };
