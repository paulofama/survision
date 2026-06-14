// ===========================================================================
// COMPONENT: TabConciliacion - MODULO CARGA DE SUELDOS (Fase 3)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Pestaña Conciliación del MesDetallePage. Muestra las diferencias entre
// minuta y F.931 con:
//   - Header con resumen (X auto-justificadas / Y residuales / Z manuales)
//   - Botón "Recalcular" (POST /api/conciliacion/.../recalcular)
//   - Tabla de diferencias con badges por tipo + modal de justificación manual
// ===========================================================================

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Scale,
  Send,
  X,
} from 'lucide-react';
import type {
  ConciliacionDiferencia,
  ResumenConciliacion,
  TipoDiferencia,
} from '../../types/sueldos';

// ---------------------------------------------------------------------------
// FORMAT HELPERS
// ---------------------------------------------------------------------------

const NF_MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

const LABEL_TIPO: Record<TipoDiferencia, { texto: string; color: string }> = {
  AUTO_SINDICATO_NO_F931: {
    texto: 'Sindicato (no en F.931)',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  AUTO_RETENCION_SUSS_DESDOBLADA: {
    texto: 'Retención SUSS desdoblada',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  AUTO_REDONDEO: {
    texto: 'Redondeo',
    color: 'bg-gray-50 text-gray-700 border-gray-200',
  },
  MATERIAL_RESIDUAL: {
    texto: 'Material — revisar',
    color: 'bg-red-50 text-red-700 border-red-200',
  },
  JUSTIFICADA_MANUAL: {
    texto: 'Justificada manualmente',
    color: 'bg-green-50 text-green-700 border-green-200',
  },
};

const LABEL_BLOQUE: Record<string, string> = {
  pago_sueldos: 'Pago de Sueldos',
  horas_complementarias: 'Horas Complementarias',
  dia_sanidad: 'Día de la Sanidad',
  seguridad_social: 'Seguridad Social',
  sindicato: 'Sindicato',
};

const LABEL_CONCEPTO: Record<string, string> = {
  APORTE_SS: 'Aporte SS (301)',
  CONTRIB_SS: 'Contribución SS (351)',
  APORTE_OS: 'Aporte OS (302)',
  CONTRIB_OS: 'Contribución OS (352)',
  ART: 'ART',
  SCVO: 'SCVO',
  SINDICATO: 'Cuota sindical',
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: modal de justificación manual (module scope)
// ---------------------------------------------------------------------------

interface JustificarModalProps {
  diferencia: ConciliacionDiferencia | null;
  onClose: () => void;
  onConfirm: (justificacion: string, nombreUsuario: string | undefined) => Promise<void>;
}

const MIN_JUSTIF = 5;
const MAX_JUSTIF = 500;

const JustificarModal: React.FC<JustificarModalProps> = ({ diferencia, onClose, onConfirm }) => {
  const [justificacion, setJustificacion] = useState('');
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (diferencia) {
      setJustificacion('');
      setNombre('');
      setSaving(false);
    }
  }, [diferencia]);

  if (!diferencia) return null;

  const just = justificacion.trim();
  const habilitado = just.length >= MIN_JUSTIF;

  const handleConfirmar = async () => {
    if (!habilitado || saving) return;
    setSaving(true);
    try {
      await onConfirm(just, nombre.trim() || undefined);
    } finally {
      setSaving(false);
    }
  };

  const bloqueLabel = LABEL_BLOQUE[diferencia.bloque_tipo] ?? diferencia.bloque_tipo;
  const conceptoLabel = diferencia.concepto_codigo
    ? LABEL_CONCEPTO[diferencia.concepto_codigo as string] ?? String(diferencia.concepto_codigo)
    : '(agregado del bloque)';

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-green-700" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Justificar diferencia</h2>
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

        <div className="p-5 space-y-4">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Bloque:</span>
              <span className="font-medium text-gray-900">{bloqueLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Concepto:</span>
              <span className="font-medium text-gray-900">{conceptoLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Minuta:</span>
              <span className="font-mono">{NF_MONEDA.format(Number(diferencia.monto_minuta))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">F.931:</span>
              <span className="font-mono">{NF_MONEDA.format(Number(diferencia.monto_f931))}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-1 mt-1">
              <span className="text-gray-700 font-semibold">Diferencia:</span>
              <span className="font-mono font-bold text-red-700">
                {NF_MONEDA.format(Number(diferencia.diferencia))}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Justificación <span className="text-red-500">*</span>
            </label>
            <textarea
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value.slice(0, MAX_JUSTIF))}
              rows={4}
              autoFocus
              disabled={saving}
              placeholder="Explicá la diferencia (ej: corresponde a aportes con tope, retención SUSS aplicada al período anterior, etc.)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className={just.length >= MIN_JUSTIF ? 'text-green-700' : 'text-gray-500'}>
                {just.length < MIN_JUSTIF
                  ? `Faltan ${MIN_JUSTIF - just.length} caracteres (mínimo ${MIN_JUSTIF})`
                  : 'Justificación válida'}
              </span>
              <span className="text-gray-400">{MAX_JUSTIF - just.length} restantes</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Justificada por (opcional)
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={saving}
              placeholder="Tu nombre"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Snapshot al log de auditoría.
            </p>
          </div>
        </div>

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
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" />
            Justificar
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: header con resumen + botones (module scope)
// ---------------------------------------------------------------------------

interface HeaderProps {
  resumen: ResumenConciliacion | null;
  onRecalcular: () => Promise<void>;
  recalculando: boolean;
  disabled?: boolean;
}

const HeaderResumen: React.FC<HeaderProps> = ({ resumen, onRecalcular, recalculando, disabled }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
      <div>
        <div className="text-xs text-gray-500 uppercase">Total diferencias</div>
        <div className="text-2xl font-bold text-gray-900">{resumen?.total_diferencias ?? 0}</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Auto-justificadas</div>
        <div className="text-2xl font-bold text-gray-700">{resumen?.auto_justificadas ?? 0}</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Residuales pendientes</div>
        <div className={`text-2xl font-bold ${(resumen?.residuales_pendientes ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>
          {resumen?.residuales_pendientes ?? 0}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Manuales</div>
        <div className="text-2xl font-bold text-green-700">{resumen?.justificadas_manualmente ?? 0}</div>
      </div>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onRecalcular}
          disabled={recalculando || disabled}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {recalculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recalcular
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PROPS DEL COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

export interface TabConciliacionProps {
  diferencias: ConciliacionDiferencia[];
  resumen: ResumenConciliacion | null;
  loading: boolean;
  error: string | null;
  recalcular: () => Promise<{ ok: true; data: { diferencias: ConciliacionDiferencia[]; resumen: ResumenConciliacion } } | { ok: false; error: string }>;
  justificarManual: (
    id: string,
    justificacion: string,
    nombreUsuario?: string
  ) => Promise<{ ok: true; data: ConciliacionDiferencia } | { ok: false; error: string }>;
  /** Mes cerrado → bloquear edicion. */
  disabled?: boolean;
  /** Si no hay F.931 confirmado, mostrar mensaje informativo. */
  tieneF931Confirmado: boolean;
}

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

const TabConciliacion: React.FC<TabConciliacionProps> = ({
  diferencias, resumen, loading, error,
  recalcular, justificarManual, disabled, tieneF931Confirmado,
}) => {
  const [recalculando, setRecalculando] = useState(false);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [justifTarget, setJustifTarget] = useState<ConciliacionDiferencia | null>(null);

  const handleRecalcular = async () => {
    setRecalculando(true);
    setAccionMsg(null);
    const res = await recalcular();
    setRecalculando(false);
    if (res.ok) {
      setAccionMsg({
        ok: true,
        texto: `Conciliación recalculada. ${res.data.resumen.total_diferencias} diferencias.`,
      });
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  const handleJustificar = async (justif: string, nombre: string | undefined) => {
    if (!justifTarget) return;
    setAccionMsg(null);
    const res = await justificarManual(justifTarget.id, justif, nombre);
    if (res.ok) {
      setAccionMsg({ ok: true, texto: 'Diferencia justificada' });
      setJustifTarget(null);
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  // ---- Render -------------------------------------------------------------

  if (loading && diferencias.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con icono */}
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-cyan-50 text-cyan-700 rounded-lg">
          <Scale className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">Conciliación Minuta vs F.931</h3>
          <p className="text-xs text-gray-500">
            Compara los conceptos de la minuta contra los campos del F.931.
            Las diferencias se clasifican y las residuales requieren justificación.
          </p>
        </div>
      </div>

      {/* Sin F.931 confirmado → mensaje */}
      {!tieneF931Confirmado && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <span className="font-semibold">Para conciliar necesitás un F.931 confirmado.</span>{' '}
            Subí y confirmá el F.931 desde la pestaña anterior, después volvé acá y hacé click en "Recalcular".
          </div>
        </div>
      )}

      {/* Resumen + botón recalcular */}
      <HeaderResumen
        resumen={resumen}
        onRecalcular={handleRecalcular}
        recalculando={recalculando}
        disabled={disabled || !tieneF931Confirmado}
      />

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
          {accionMsg.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <p className="text-sm">{accionMsg.texto}</p>
        </div>
      )}

      {/* Tabla de diferencias */}
      {diferencias.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <Scale className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {tieneF931Confirmado
              ? 'Aún no se calcularon diferencias. Hacé click en "Recalcular" para generar la conciliación.'
              : 'Aún no hay diferencias para mostrar.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Bloque / Concepto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Minuta</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">F.931</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Diferencia</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Justificación</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-20">Acción</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {diferencias.map((d) => {
                  const tipoCfg = LABEL_TIPO[d.tipo_diferencia] ?? { texto: d.tipo_diferencia, color: 'bg-gray-50 text-gray-700 border-gray-200' };
                  const conceptoLabel = d.concepto_codigo
                    ? LABEL_CONCEPTO[d.concepto_codigo as string] ?? String(d.concepto_codigo)
                    : '—';
                  const dif = Number(d.diferencia);
                  const esResidual = d.tipo_diferencia === 'MATERIAL_RESIDUAL' && !d.justificada;
                  return (
                    <tr key={d.id} className={esResidual ? 'bg-red-50/30' : ''}>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-gray-900">{conceptoLabel}</div>
                        <div className="text-[11px] text-gray-500">{LABEL_BLOQUE[d.bloque_tipo] ?? d.bloque_tipo}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-700 whitespace-nowrap">
                        {NF_MONEDA.format(Number(d.monto_minuta))}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-700 whitespace-nowrap">
                        {NF_MONEDA.format(Number(d.monto_f931))}
                      </td>
                      <td className={`px-3 py-2 text-right text-sm font-mono font-semibold whitespace-nowrap ${
                        Math.abs(dif) < 1 ? 'text-gray-400' : dif > 0 ? 'text-blue-700' : 'text-red-700'
                      }`}>
                        {dif >= 0 ? '+' : ''}{NF_MONEDA.format(dif)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border ${tipoCfg.color}`}>
                          {tipoCfg.texto}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-xs">
                        {d.justificacion ? (
                          <span title={d.justificacion}>
                            {d.justificacion.length > 60 ? d.justificacion.substring(0, 57) + '...' : d.justificacion}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">(sin justificación)</span>
                        )}
                        {d.justificada_por_nombre && (
                          <div className="text-[10px] text-gray-400 mt-0.5">por {d.justificada_por_nombre}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {esResidual && !disabled && (
                          <button
                            type="button"
                            onClick={() => setJustifTarget(d)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 border border-green-200 rounded hover:bg-green-50 ml-auto"
                            title="Justificar manualmente"
                          >
                            <ClipboardCheck className="h-3 w-3" />
                            Justificar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer con totales */}
          {resumen && (
            <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
              <span>
                Suma absoluta de diferencias:{' '}
                <span className="font-mono font-semibold">
                  {NF_MONEDA.format(resumen.monto_total_diferencias_absoluto)}
                </span>
              </span>
              {resumen.conciliado_completo ? (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Conciliación completa
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-yellow-700">
                  <AlertTriangle className="h-3 w-3" /> Hay residuales pendientes
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal justificación */}
      <JustificarModal
        diferencia={justifTarget}
        onClose={() => setJustifTarget(null)}
        onConfirm={handleJustificar}
      />
    </div>
  );
};

export default TabConciliacion;
export { TabConciliacion };
