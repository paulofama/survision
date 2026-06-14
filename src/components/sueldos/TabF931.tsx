// ===========================================================================
// COMPONENT: TabF931 - MODULO CARGA DE SUELDOS (Fase 3)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Pestaña F.931 del MesDetallePage. Flujo:
//   1. Si no hay declaracion: mostrar dropzone para subir el PDF.
//   2. Al subir: parsear via backend, mostrar preview con campos editables +
//      warnings (VEP detectado, CUIT/periodo no coincide).
//   3. Usuario revisa y "Guarda + Confirma" o "Guarda como pendiente".
//   4. Si hay declaracion persistida: muestra los campos editables (si esta
//      PARSEADO_PENDIENTE_REVISION) o read-only (REVISADO_CONFIRMADO).
//      Acciones: Confirmar, Descartar, Reemplazar.
// ===========================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  F931Declaracion,
  F931ParseResult,
  F931ParsedFields,
} from '../../types/sueldos';
import type { CrearDeclaracionInput } from '../../hooks/useF931';

// ---------------------------------------------------------------------------
// FORMAT HELPERS (module scope)
// ---------------------------------------------------------------------------

const NF_MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

const NF_PLAIN = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parsearMonto(raw: string): number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const limpio = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

function formatearMontoEdit(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return NF_PLAIN.format(Number(n));
}

function formatearEntero(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return String(n);
}

function formatearFechaHora(iso: string | null | undefined): string {
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

// ---------------------------------------------------------------------------
// CAMPOS A MOSTRAR EN EL EDITOR (orden y labels)
// ---------------------------------------------------------------------------

interface CampoConfig {
  key: keyof F931ParsedFields;
  label: string;
  hint?: string;
  tipo: 'monto' | 'entero';
}

const CAMPOS_GENERAL: readonly CampoConfig[] = [
  { key: 'cantidad_trabajadores', label: 'Empleados en nómina', tipo: 'entero' },
] as const;

const CAMPOS_REMUNERACIONES: readonly CampoConfig[] = [
  { key: 'rem_1', label: 'Rem. 1 (base SS)', hint: 'Base para reparto del bruto en Fase 4', tipo: 'monto' },
  { key: 'rem_2', label: 'Rem. 2', tipo: 'monto' },
  { key: 'rem_3', label: 'Rem. 3', tipo: 'monto' },
  { key: 'rem_4', label: 'Rem. 4 (con no remunerativos)', tipo: 'monto' },
  { key: 'rem_5', label: 'Rem. 5', tipo: 'monto' },
] as const;

const CAMPOS_CONCEPTOS: readonly CampoConfig[] = [
  { key: 'aporte_ss_301', label: 'Aporte SS (301)', hint: 'Retención al empleado', tipo: 'monto' },
  { key: 'contrib_ss_351', label: 'Contribución SS (351)', hint: 'Costo del empleador', tipo: 'monto' },
  { key: 'aporte_os_302', label: 'Aporte OS (302)', hint: 'Retención al empleado', tipo: 'monto' },
  { key: 'contrib_os_352', label: 'Contribución OS (352)', hint: 'Costo del empleador', tipo: 'monto' },
  { key: 'art', label: 'ART (312)', tipo: 'monto' },
  { key: 'scvo', label: 'SCVO (028)', tipo: 'monto' },
] as const;

const CAMPOS_TOTALES: readonly CampoConfig[] = [
  { key: 'asignaciones_familiares', label: 'Asignaciones familiares pagadas', tipo: 'monto' },
  { key: 'total_a_depositar', label: 'Total a depositar', hint: 'Suma de los conceptos de sección VIII', tipo: 'monto' },
] as const;

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: input de monto/entero con parser AR (module scope)
// ---------------------------------------------------------------------------

interface CampoEditableProps {
  config: CampoConfig;
  valor: number | null;
  onChange: (nuevo: number | null) => void;
  disabled?: boolean;
}

const CampoEditable: React.FC<CampoEditableProps> = ({ config, valor, onChange, disabled }) => {
  const [texto, setTexto] = useState<string>(
    config.tipo === 'entero' ? formatearEntero(valor) : formatearMontoEdit(valor)
  );

  useEffect(() => {
    setTexto(config.tipo === 'entero' ? formatearEntero(valor) : formatearMontoEdit(valor));
  }, [valor, config.tipo]);

  const handleBlur = () => {
    if (config.tipo === 'entero') {
      const n = parseInt(texto.replace(/\D/g, ''), 10);
      onChange(Number.isFinite(n) ? n : null);
    } else {
      const n = parsearMonto(texto);
      onChange(n);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {config.label}
      </label>
      <div className="relative">
        {config.tipo === 'monto' && (
          <span className="absolute left-2 top-1.5 text-gray-400 text-sm">$</span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={config.tipo === 'monto' ? '0,00' : '0'}
          className={`
            w-full text-right text-sm font-mono
            ${config.tipo === 'monto' ? 'pl-6 pr-2' : 'px-2'}
            py-1.5 border border-gray-300 rounded
            focus:outline-none focus:ring-2 focus:ring-blue-400
            disabled:bg-gray-100 disabled:text-gray-500
          `}
        />
      </div>
      {config.hint && <p className="mt-0.5 text-[10px] text-gray-500">{config.hint}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: editor completo de F931ParsedFields (module scope)
// ---------------------------------------------------------------------------

interface EditorCamposProps {
  campos: F931ParsedFields;
  onChange: (campos: F931ParsedFields) => void;
  disabled?: boolean;
}

const EditorCampos: React.FC<EditorCamposProps> = ({ campos, onChange, disabled }) => {
  const updateField = (key: keyof F931ParsedFields, valor: number | null) => {
    onChange({ ...campos, [key]: valor });
  };

  const renderGrupo = (titulo: string, grupo: readonly CampoConfig[]) => (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
        {titulo}
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {grupo.map((cfg) => (
          <CampoEditable
            key={cfg.key}
            config={cfg}
            valor={campos[cfg.key] as number | null}
            onChange={(v) => updateField(cfg.key, v)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {renderGrupo('General', CAMPOS_GENERAL)}
      {renderGrupo('Remuneraciones', CAMPOS_REMUNERACIONES)}
      {renderGrupo('Conceptos (Sección VIII)', CAMPOS_CONCEPTOS)}
      {renderGrupo('Totales', CAMPOS_TOTALES)}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: dropzone (module scope)
// ---------------------------------------------------------------------------

interface DropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFile, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition
        ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/50'}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // reset para permitir subir el mismo archivo de nuevo
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <Upload className="h-10 w-10 text-blue-500 mx-auto mb-2" />
      <p className="text-sm font-medium text-gray-900">
        Arrastrá el F.931 acá o hacé click para seleccionar
      </p>
      <p className="text-xs text-gray-500 mt-1">PDF, máximo 10 MB</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: banner de warnings del parser (module scope)
// ---------------------------------------------------------------------------

const WarningsBanner: React.FC<{ warnings: string[]; parecioVep?: boolean }> = ({
  warnings, parecioVep,
}) => {
  if ((!warnings || warnings.length === 0) && !parecioVep) return null;
  return (
    <div className="space-y-2">
      {parecioVep && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <span className="font-semibold">El PDF parece un VEP, no el F.931.</span>{' '}
            Podés guardarlo igual como referencia (se marcará como VEP_ERROR),
            pero conviene reemplazarlo por el F.931 oficial cuando lo tengas.
          </div>
        </div>
      )}
      {warnings.map((w, i) => (
        <div
          key={i}
          className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3"
        >
          <AlertTriangle className="h-4 w-4 text-yellow-700 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">{w}</p>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PROPS DEL COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

export interface TabF931Props {
  anio: number;
  mes: number;
  liquidacionId: string | null;

  // Datos
  declaracion: F931Declaracion | null;
  loading: boolean;
  error: string | null;

  // Acciones del hook useF931
  parsearPdf: (file: File) => Promise<{ ok: true; data: F931ParseResult } | { ok: false; error: string; codigo?: string }>;
  crearDeclaracion: (
    datos: CrearDeclaracionInput,
    nombreUsuario?: string
  ) => Promise<{ ok: true; data: F931Declaracion } | { ok: false; error: string; codigo?: string }>;
  actualizarCampos: (
    id: string,
    cambios: Record<string, unknown>
  ) => Promise<{ ok: true; data: F931Declaracion } | { ok: false; error: string; codigo?: string }>;
  confirmar: (
    id: string,
    nombreUsuario?: string
  ) => Promise<{ ok: true; data: F931Declaracion } | { ok: false; error: string; codigo?: string }>;
  descartar: (id: string) => Promise<{ ok: true; data: F931Declaracion } | { ok: false; error: string; codigo?: string }>;
  refetch: () => Promise<void>;

  /** Mes cerrado → bloquear edicion. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// COMPONENTE
// ---------------------------------------------------------------------------

const TabF931: React.FC<TabF931Props> = ({
  anio, mes, liquidacionId, declaracion, loading, error,
  parsearPdf, crearDeclaracion, actualizarCampos, confirmar, descartar, refetch,
  disabled,
}) => {
  const [parseResult, setParseResult] = useState<F931ParseResult | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [camposEditables, setCamposEditables] = useState<F931ParsedFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [nombreUsuario, setNombreUsuario] = useState<string>('');

  // Al subir un PDF, parsear y prepoblar el editor
  const handleFile = async (file: File) => {
    setAccionMsg(null);
    setBusy(true);
    setPdfFile(file);
    const res = await parsearPdf(file);
    setBusy(false);
    if (!res.ok) {
      setAccionMsg({ ok: false, texto: res.error });
      setParseResult(null);
      setCamposEditables(null);
      return;
    }
    if (!res.data.ok) {
      setAccionMsg({ ok: false, texto: res.data.error.mensaje });
      setParseResult(null);
      setCamposEditables(null);
      return;
    }
    setParseResult(res.data);
    setCamposEditables(res.data.campos);
  };

  // Guardar (con o sin confirmar)
  const handleGuardar = async (confirmarAlGuardar: boolean) => {
    if (!parseResult || !parseResult.ok || !pdfFile || !camposEditables) return;
    setBusy(true);
    setAccionMsg(null);
    const res = await crearDeclaracion(
      {
        pdfFile,
        nombreOriginal: pdfFile.name,
        campos: camposEditables,
        parecioVep: parseResult.detectado_como_vep,
        rawText: parseResult.raw_text,
        confirmarAlGuardar,
        liquidacionId,
      },
      nombreUsuario || undefined
    );
    setBusy(false);
    if (res.ok) {
      setAccionMsg({
        ok: true,
        texto: confirmarAlGuardar
          ? 'F.931 guardado y confirmado correctamente'
          : 'F.931 guardado como pendiente de revisión',
      });
      setParseResult(null);
      setCamposEditables(null);
      setPdfFile(null);
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  // Edicion sobre declaracion ya persistida
  const handleGuardarCambios = async () => {
    if (!declaracion || !camposEditables) return;
    setBusy(true);
    setAccionMsg(null);
    const res = await actualizarCampos(declaracion.id, camposEditables as unknown as Record<string, unknown>);
    setBusy(false);
    setAccionMsg(
      res.ok
        ? { ok: true, texto: 'Cambios guardados' }
        : { ok: false, texto: res.error }
    );
  };

  const handleConfirmar = async () => {
    if (!declaracion) return;
    setBusy(true);
    setAccionMsg(null);
    const res = await confirmar(declaracion.id, nombreUsuario || undefined);
    setBusy(false);
    setAccionMsg(
      res.ok
        ? { ok: true, texto: 'F.931 confirmado. Ya podés conciliar.' }
        : { ok: false, texto: res.error }
    );
  };

  const handleDescartar = async () => {
    if (!declaracion) return;
    if (!window.confirm('¿Descartar esta declaración? Quedará marcada como DESCARTADO y podrás subir otro F.931.')) return;
    setBusy(true);
    setAccionMsg(null);
    const res = await descartar(declaracion.id);
    setBusy(false);
    setAccionMsg(
      res.ok
        ? { ok: true, texto: 'Declaración descartada' }
        : { ok: false, texto: res.error }
    );
  };

  const handleResetPreview = () => {
    setParseResult(null);
    setCamposEditables(null);
    setPdfFile(null);
    setAccionMsg(null);
  };

  // ---- Render -------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const hayDeclaracionActiva = declaracion && declaracion.estado !== 'DESCARTADO';
  const editable = hayDeclaracionActiva && declaracion.estado === 'PARSEADO_PENDIENTE_REVISION' && !disabled;
  const confirmada = hayDeclaracionActiva && declaracion.estado === 'REVISADO_CONFIRMADO';

  return (
    <div className="space-y-5">
      {/* Mensajes globales */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {accionMsg && (
        <div className={`p-3 rounded-lg border flex items-center gap-3 ${
          accionMsg.ok
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {accionMsg.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
          <p className="text-sm">{accionMsg.texto}</p>
        </div>
      )}

      {/* --- PASO A: sin declaracion + sin preview = mostrar dropzone --- */}
      {!hayDeclaracionActiva && !parseResult && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Subí el PDF del F.931 (Formulario AFIP - DJ Cargas Sociales) del período{' '}
            <span className="font-semibold">{String(mes).padStart(2, '0')}/{anio}</span>.
            El sistema lo va a parsear automáticamente y te mostrará los campos para revisar.
          </div>
          <Dropzone onFile={handleFile} disabled={busy || disabled} />
          {busy && (
            <div className="flex items-center justify-center py-4 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Parseando PDF...
            </div>
          )}
          {declaracion && declaracion.estado === 'DESCARTADO' && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              Última declaración: <span className="font-semibold">DESCARTADA</span> el{' '}
              {formatearFechaHora(declaracion.updated_at)}. Subí un nuevo F.931 para reemplazarla.
            </div>
          )}
        </div>
      )}

      {/* --- PASO B: hay parseResult (preview antes de guardar) --- */}
      {!hayDeclaracionActiva && parseResult && parseResult.ok && camposEditables && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="font-semibold">{pdfFile?.name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{pdfFile ? (pdfFile.size / 1024).toFixed(1) : '?'} KB</span>
            </div>
            <button
              type="button"
              onClick={handleResetPreview}
              disabled={busy}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          </div>

          <WarningsBanner warnings={parseResult.warnings} parecioVep={parseResult.detectado_como_vep} />

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <EditorCampos
              campos={camposEditables}
              onChange={setCamposEditables}
              disabled={busy}
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tu nombre (snapshot al guardar)
              </label>
              <input
                type="text"
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                disabled={busy}
                placeholder="Opcional"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleGuardar(false)}
                disabled={busy}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4" />
                Guardar como pendiente
              </button>
              <button
                type="button"
                onClick={() => handleGuardar(true)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle2 className="h-4 w-4" />
                Guardar y confirmar
              </button>
            </div>
          </div>

          {/* Raw text colapsable para debug */}
          <details className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
            <summary className="cursor-pointer text-gray-600 font-medium">
              Ver texto crudo extraído (debug)
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[10px] text-gray-700">
              {parseResult.raw_text || '(sin texto)'}
            </pre>
          </details>
        </div>
      )}

      {/* --- PASO C: declaracion activa (pendiente o confirmada) --- */}
      {hayDeclaracionActiva && (
        <DetalleDeclaracion
          declaracion={declaracion}
          editable={!!editable}
          confirmada={!!confirmada}
          disabled={!!disabled}
          busy={busy}
          camposEditables={camposEditables}
          setCamposEditables={setCamposEditables}
          nombreUsuario={nombreUsuario}
          setNombreUsuario={setNombreUsuario}
          onGuardarCambios={handleGuardarCambios}
          onConfirmar={handleConfirmar}
          onDescartar={handleDescartar}
          onRefetch={refetch}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: detalle de una declaracion ya persistida (module scope)
// ---------------------------------------------------------------------------

interface DetalleProps {
  declaracion: F931Declaracion;
  editable: boolean;
  confirmada: boolean;
  disabled: boolean;
  busy: boolean;
  camposEditables: F931ParsedFields | null;
  setCamposEditables: (c: F931ParsedFields | null) => void;
  nombreUsuario: string;
  setNombreUsuario: (s: string) => void;
  onGuardarCambios: () => Promise<void>;
  onConfirmar: () => Promise<void>;
  onDescartar: () => Promise<void>;
  onRefetch: () => Promise<void>;
}

const DetalleDeclaracion: React.FC<DetalleProps> = ({
  declaracion, editable, confirmada, disabled, busy,
  camposEditables, setCamposEditables, nombreUsuario, setNombreUsuario,
  onGuardarCambios, onConfirmar, onDescartar, onRefetch,
}) => {
  // Sincronizar camposEditables cuando cambia la declaracion
  useEffect(() => {
    setCamposEditables({
      cantidad_trabajadores: declaracion.cantidad_trabajadores,
      rem_total: declaracion.rem_total,
      rem_1: declaracion.rem_1,
      rem_2: declaracion.rem_2,
      rem_3: declaracion.rem_3,
      rem_4: declaracion.rem_4,
      rem_5: declaracion.rem_5,
      aporte_ss_301: declaracion.aporte_ss_301,
      aporte_os_302: declaracion.aporte_os_302,
      contrib_ss_351: declaracion.contrib_ss_351,
      contrib_os_352: declaracion.contrib_os_352,
      art: declaracion.art,
      scvo: declaracion.scvo,
      asignaciones_familiares: declaracion.asignaciones_familiares,
      total_a_depositar: declaracion.total_a_depositar,
      campos_extra: declaracion.campos_extra,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declaracion.id, declaracion.updated_at]);

  return (
    <div className="space-y-4">
      {/* Header con estado y metadata */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <div>
            <div className="text-sm font-semibold text-gray-900">
              F.931 — {String(declaracion.mes).padStart(2, '0')}/{declaracion.anio}
            </div>
            <div className="text-xs text-gray-500">
              CUIT {declaracion.cuit} ·{' '}
              {confirmada ? (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Confirmado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-yellow-700">
                  <AlertTriangle className="h-3 w-3" /> Pendiente de revisión
                </span>
              )}
              {declaracion.parecio_vep && (
                <span className="ml-2 inline-flex items-center gap-1 text-yellow-700">
                  · VEP detectado
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefetch}
            disabled={busy}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            title="Refrescar"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={onDescartar}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Descartar
            </button>
          )}
        </div>
      </div>

      {/* Editor de campos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        {camposEditables && (
          <EditorCampos
            campos={camposEditables}
            onChange={setCamposEditables}
            disabled={!editable || busy}
          />
        )}
      </div>

      {/* Acciones */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="md:col-span-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Tu nombre (snapshot)
          </label>
          <input
            type="text"
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            disabled={busy || (!editable && !confirmada)}
            placeholder="Opcional"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>
        <div className="md:col-span-2 flex items-center justify-end gap-2 flex-wrap">
          {editable && (
            <>
              <button
                type="button"
                onClick={onGuardarCambios}
                disabled={busy}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4" />
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={onConfirmar}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <CheckCircle2 className="h-4 w-4" />
                Confirmar F.931
              </button>
            </>
          )}
          {confirmada && (
            <div className="text-xs text-gray-500">
              Confirmado el {formatearFechaHora(declaracion.confirmado_at)}
              {declaracion.confirmado_por_nombre && ` por ${declaracion.confirmado_por_nombre}`}
            </div>
          )}
        </div>
      </div>

      {/* Resumen rápido del total */}
      {declaracion.total_a_depositar !== null && declaracion.total_a_depositar !== undefined && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-900">
          <span className="font-semibold">Total a depositar:</span>{' '}
          {NF_MONEDA.format(Number(declaracion.total_a_depositar))}
        </div>
      )}
    </div>
  );
};

export default TabF931;
export { TabF931 };
