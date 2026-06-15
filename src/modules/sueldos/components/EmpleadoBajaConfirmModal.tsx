// ===========================================================================
// COMPONENT: EmpleadoBajaConfirmModal - MODULO CARGA DE SUELDOS
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Modal de confirmacion generico, mostrado cuando una contadora intenta
// cargar un monto a un empleado que esta dado de baja.
//
// Uso previsto (Fase 2): los componentes de bloques de minuta
// (BloquePagoSueldos, BloqueHorasComplementarias, etc.) detectan cuando el
// empleado seleccionado tiene estado='inactivo' y muestran este modal antes
// de aceptar el monto. Si la contadora confirma, se permite la carga; si
// cancela, se descarta el cambio.
//
// El modal NO realiza la accion: solo dispara onConfirm() o onClose().
// La logica de aplicar/descartar el monto vive en el componente padre.
// ===========================================================================

import React from 'react';
import { AlertTriangle, UserMinus, X } from 'lucide-react';
import type { Empleado, EmpleadoListado } from '../types/sueldos';

interface Props {
  /** Empleado dado de baja sobre el que se intenta cargar el monto. `null` cierra el modal. */
  empleado: Empleado | EmpleadoListado | null;
  /** Texto opcional describiendo la accion (ej: "cargar $50.000 como pago de sueldo"). */
  motivo?: string;
  onClose: () => void;
  onConfirm: () => void;
  /** Texto del boton confirmador. Default: "Cargar de todos modos". */
  confirmLabel?: string;
}

function formatearFecha(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

const EmpleadoBajaConfirmModal: React.FC<Props> = ({
  empleado,
  motivo,
  onClose,
  onConfirm,
  confirmLabel = 'Cargar de todos modos',
}) => {
  if (!empleado) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="empleado-baja-titulo"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-700" />
            </div>
            <h2
              id="empleado-baja-titulo"
              className="text-lg font-semibold text-gray-900"
            >
              Empleado dado de baja
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="p-1.5 bg-gray-200 rounded-md">
              <UserMinus className="h-4 w-4 text-gray-700" />
            </div>
            <div className="text-sm">
              <div className="font-semibold text-gray-900">
                {empleado.apellido}, {empleado.nombre}
              </div>
              <div className="text-gray-600">
                <span className="font-mono">{empleado.cuil}</span> · {empleado.area}
              </div>
              <div className="text-xs text-red-600 mt-1">
                Baja registrada el{' '}
                <span className="font-semibold">
                  {formatearFecha(empleado.fecha_egreso)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-700">
            Este empleado figura como dado de baja. ¿Confirmás que querés{' '}
            {motivo ? (
              <>
                <span className="font-semibold">{motivo}</span>
              </>
            ) : (
              'cargar este movimiento'
            )}{' '}
            de todos modos?
          </p>

          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
            Si fue un error, podés cancelar y reactivar al empleado desde el
            listado para mantener la trazabilidad limpia.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmpleadoBajaConfirmModal;
export { EmpleadoBajaConfirmModal };
