// ===========================================================================
// COMPONENT: ReabrirMesModal - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Modal para reabrir un mes que esta CERRADO. Requiere justificacion
// obligatoria (minimo 10 caracteres) que queda registrada en la tabla
// liquidaciones_mes (columna reapertura_justificacion) y en el log de
// auditoria como accion REAPERTURA_MES.
// ===========================================================================

import React, { useEffect, useState } from 'react';
import { Unlock, X, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  /** Periodo legible (ej: "Mayo 2026"). */
  periodo: string;
  /** Nombre del usuario actual (snapshot que se guarda en BD). Opcional. */
  reabiertoPorNombreSugerido?: string | null;
  onClose: () => void;
  onConfirm: (justificacion: string, reabiertoPorNombre: string | undefined) => Promise<void>;
}

const MIN_JUSTIFICACION = 10;
const MAX_JUSTIFICACION = 500;

const ReabrirMesModal: React.FC<Props> = ({
  open,
  periodo,
  reabiertoPorNombreSugerido,
  onClose,
  onConfirm,
}) => {
  const [justificacion, setJustificacion] = useState('');
  const [nombre, setNombre] = useState(reabiertoPorNombreSugerido || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setJustificacion('');
      setNombre(reabiertoPorNombreSugerido || '');
      setSaving(false);
    }
  }, [open, reabiertoPorNombreSugerido]);

  if (!open) return null;

  const just = justificacion.trim();
  const habilitado = just.length >= MIN_JUSTIFICACION;
  const restantes = MAX_JUSTIFICACION - just.length;

  const handleConfirmar = async () => {
    if (!habilitado || saving) return;
    setSaving(true);
    try {
      await onConfirm(just, nombre.trim() || undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reabrir-titulo"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Unlock className="h-5 w-5 text-yellow-700" />
            </div>
            <h2 id="reabrir-titulo" className="text-lg font-semibold text-gray-900">
              Reabrir mes
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
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              Vas a reabrir el período{' '}
              <span className="font-semibold">{periodo}</span>. La justificación
              queda guardada en la base de datos y en el log de auditoría — más
              tarde se puede consultar quién reabrió, cuándo y por qué.
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Justificación <span className="text-red-500">*</span>
            </label>
            <textarea
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value.slice(0, MAX_JUSTIFICACION))}
              rows={4}
              autoFocus
              disabled={saving}
              placeholder="Describí el motivo de la reapertura (ej: detección de error en montos, ajuste por F.931 corregido, etc.)"
              className={`
                w-full px-3 py-2 border rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-yellow-500
                resize-none
                ${habilitado ? 'border-gray-300' : just.length === 0 ? 'border-gray-300' : 'border-yellow-400'}
              `}
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={just.length >= MIN_JUSTIFICACION ? 'text-green-700' : 'text-gray-500'}>
                {just.length < MIN_JUSTIFICACION
                  ? `Faltan ${MIN_JUSTIFICACION - just.length} caracteres (mínimo ${MIN_JUSTIFICACION})`
                  : 'Justificación válida'}
              </span>
              <span className="text-gray-400">{restantes} restantes</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reabierto por (opcional)
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
            className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Unlock className="h-4 w-4" />
            Reabrir mes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReabrirMesModal;
export { ReabrirMesModal };
