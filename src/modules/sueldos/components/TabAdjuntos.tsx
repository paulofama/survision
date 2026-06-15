// ===========================================================================
// COMPONENT: TabAdjuntos - MODULO CARGA DE SUELDOS (Fase 3)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Lista los archivos PDF que la contadora subio al bucket sueldos-adjuntos
// para esta liquidacion. Por cada uno: descargar (URL firmada de 5 min) o
// eliminar (borra fila + archivo de Storage).
// ===========================================================================

import React, { useState } from 'react';
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type { F931Adjunto, ResultadoOperacion, TipoAdjunto } from '../types/sueldos';

// ---------------------------------------------------------------------------
// HELPERS DE FORMATO
// ---------------------------------------------------------------------------

function formatearBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '-';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ETIQUETA_TIPO: Record<TipoAdjunto, { label: string; color: string }> = {
  F931_OFICIAL: { label: 'F.931 oficial', color: 'bg-green-50 text-green-700 border-green-200' },
  VEP_ERROR:    { label: 'VEP (error)',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  OTRO:         { label: 'Otro',          color: 'bg-gray-50 text-gray-700 border-gray-200' },
};

// ---------------------------------------------------------------------------
// PROPS
// ---------------------------------------------------------------------------

export interface TabAdjuntosProps {
  adjuntos: F931Adjunto[];
  loading: boolean;
  error: string | null;
  obtenerUrlDescarga: (bucketPath: string, ttlSeg?: number) => Promise<string | null>;
  eliminarAdjunto: (id: string) => Promise<ResultadoOperacion<void>>;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: fila de adjunto (module scope)
// ---------------------------------------------------------------------------

interface FilaAdjuntoProps {
  adjunto: F931Adjunto;
  disabled?: boolean;
  onDescargar: (a: F931Adjunto) => Promise<void>;
  onEliminar: (a: F931Adjunto) => Promise<void>;
  busyId: string | null;
}

const FilaAdjunto: React.FC<FilaAdjuntoProps> = ({
  adjunto, disabled, onDescargar, onEliminar, busyId,
}) => {
  const tipoCfg = ETIQUETA_TIPO[adjunto.tipo_adjunto] ?? ETIQUETA_TIPO.OTRO;
  const esEsteBusy = busyId === adjunto.id;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <div>
            <div className="text-sm font-medium text-gray-900">
              {adjunto.nombre_original || '(sin nombre)'}
            </div>
            <div className="text-[11px] text-gray-500 font-mono">
              {adjunto.bucket_path}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border ${tipoCfg.color}`}>
          {adjunto.detectado_como_vep && <AlertTriangle className="h-3 w-3" />}
          {tipoCfg.label}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
        {formatearBytes(adjunto.tamano_bytes)}
      </td>
      <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
        {formatearFecha(adjunto.subido_at)}
        {adjunto.subido_por_nombre && (
          <div className="text-[11px] text-gray-500">por {adjunto.subido_por_nombre}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onDescargar(adjunto)}
            disabled={esEsteBusy}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
            title="Descargar"
          >
            {esEsteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={() => onEliminar(adjunto)}
              disabled={esEsteBusy}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              title="Eliminar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

const TabAdjuntos: React.FC<TabAdjuntosProps> = ({
  adjuntos, loading, error, obtenerUrlDescarga, eliminarAdjunto, disabled,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const handleDescargar = async (a: F931Adjunto) => {
    setBusyId(a.id);
    setAccionMsg(null);
    const url = await obtenerUrlDescarga(a.bucket_path, 300);
    setBusyId(null);
    if (!url) {
      setAccionMsg({ ok: false, texto: 'No se pudo generar la URL de descarga' });
      return;
    }
    // Abrir en nueva pestaña (Supabase devuelve URL temporal de 5 min)
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleEliminar = async (a: F931Adjunto) => {
    if (!window.confirm(`¿Eliminar el archivo "${a.nombre_original || a.bucket_path}"?\nEsta acción no se puede deshacer.`)) return;
    setBusyId(a.id);
    setAccionMsg(null);
    const res = await eliminarAdjunto(a.id);
    setBusyId(null);
    if (res.ok) {
      setAccionMsg({ ok: true, texto: 'Adjunto eliminado correctamente' });
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  // ---- Render -------------------------------------------------------------

  if (loading && adjuntos.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
          <Paperclip className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Adjuntos del mes</h3>
          <p className="text-xs text-gray-500">
            PDFs subidos al bucket <span className="font-mono">sueldos-adjuntos</span>. URL de descarga válida por 5 minutos.
          </p>
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {accionMsg && (
        <div className={`p-3 rounded-lg border flex items-center gap-3 ${
          accionMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {accionMsg.ok ? <FileText className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <p className="text-sm">{accionMsg.texto}</p>
        </div>
      )}

      {/* Listado */}
      {adjuntos.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <Paperclip className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Aún no hay adjuntos para este período. Subí el F.931 desde la pestaña anterior.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Archivo</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Tamaño</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Subido</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-24">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {adjuntos.map((a) => (
                  <FilaAdjunto
                    key={a.id}
                    adjunto={a}
                    disabled={disabled}
                    onDescargar={handleDescargar}
                    onEliminar={handleEliminar}
                    busyId={busyId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabAdjuntos;
export { TabAdjuntos };
