// ===========================================================================
// COMPONENT: ConfirmarCierreMesModal - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Modal de doble confirmacion para cerrar un mes. Una vez cerrado, el mes
// queda bloqueado para edicion. Para volver a editarlo hay que usar la
// reapertura, que requiere justificacion obligatoria.
//
// Requiere que el usuario escriba textualmente "CONFIRMAR" para habilitar
// el boton de cierre.
// ===========================================================================

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock, X, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  open: boolean;
  /** Periodo legible (ej: "Mayo 2026"). */
  periodo: string;
  /** Nombre del usuario actual (snapshot que se guarda en BD). Opcional. */
  cerradoPorNombreSugerido?: string | null;
  onClose: () => void;
  /** Recibe (confirmacion='CONFIRMAR', cerradoPorNombre). */
  onConfirm: (confirmacion: string, cerradoPorNombre: string | undefined) => Promise<void>;
}

const FRASE_CONFIRMACION = 'CONFIRMAR';

const ConfirmarCierreMesModal: React.FC<Props> = ({
  open,
  periodo,
  cerradoPorNombreSugerido,
  onClose,
  onConfirm,
}) => {
  const [textoConfirm, setTextoConfirm] = useState('');
  const [nombre, setNombre] = useState(cerradoPorNombreSugerido || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTextoConfirm('');
      setNombre(cerradoPorNombreSugerido || '');
      setSaving(false);
    }
  }, [open, cerradoPorNombreSugerido]);

  if (!open) return null;

  const habilitado = textoConfirm.trim().toUpperCase() === FRASE_CONFIRMACION;

  const handleConfirmar = async () => {
    if (!habilitado || saving) return;
    setSaving(true);
    try {
      await onConfirm(FRASE_CONFIRMACION, nombre.trim() || undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cierre-titulo"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Lock className="h-5 w-5 text-red-700" />
            </div>
            <h2 id="cierre-titulo" className="text-lg font-semibold text-gray-900">
              Cerrar mes
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              Vas a cerrar el período{' '}
              <span className="font-semibold">{periodo}</span>. Una vez cerrado:
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-xs">
                <li>No se podrán editar bloques, líneas ni montos.</li>
                <li>Para volver a editar hay que reabrir el mes con justificación obligatoria.</li>
                <li>La reapertura queda registrada en el log de auditoría.</li>
              </ul>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Para confirmar, escribí{' '}
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{FRASE_CONFIRMACION}</span>
            </label>
            <input
              type="text"
              value={textoConfirm}
              onChange={(e) => setTextoConfirm(e.target.value)}
              autoFocus
              disabled={saving}
              placeholder={FRASE_CONFIRMACION}
              className={`
                w-full px-3 py-2 border rounded-lg font-mono
                focus:outline-none focus:ring-2 focus:ring-red-500
                ${habilitado ? 'border-green-400' : 'border-gray-300'}
              `}
            />
            {habilitado && (
              <p className="mt-1 text-xs text-green-700 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Confirmación correcta
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cerrado por (opcional)
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={saving}
              placeholder="Tu nombre"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Queda como snapshot en el log de auditoría.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!habilitado || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Lock className="h-4 w-4" />
            Cerrar mes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmarCierreMesModal;
export { ConfirmarCierreMesModal };
