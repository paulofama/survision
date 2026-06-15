// ===========================================================================
// COMPONENT: TabHallazgos - MODULO CARGA DE SUELDOS (Fase 5)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Pestaña Hallazgos del MesDetallePage. Tabla de hallazgos de auditoria del mes
// con criticidad / norma / estado, alta y edicion via modal. Seccion exclusiva
// del rol Auditor (gated por el permiso sueldos:reportes — se controla en
// MesDetallePage y se pasa `esAuditor`).
// ===========================================================================

import React, { useState } from 'react';
import {
  AlertCircle, AlertTriangle, CheckCircle2, Flag, Loader2, Lock, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import type {
  CriticidadHallazgo,
  EstadoHallazgo,
  HallazgoSueldos,
  HallazgoSueldosNuevo,
  HallazgoSueldosActualizacion,
  ResultadoOperacion,
} from '../types/sueldos';
import {
  CRITICIDADES_HALLAZGO, ESTADOS_HALLAZGO,
  LABEL_CRITICIDAD_HALLAZGO, LABEL_ESTADO_HALLAZGO,
} from '../types/sueldos';

// ---------------------------------------------------------------------------
// COLORES (paleta del proyecto)
// ---------------------------------------------------------------------------

const COLOR_CRITICIDAD: Record<CriticidadHallazgo, string> = {
  CRITICA: 'bg-red-100 text-red-800 border-red-300',
  ALTA: 'bg-red-50 text-red-700 border-red-200',
  MEDIA: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  BAJA: 'bg-blue-50 text-blue-700 border-blue-200',
  INFORMATIVA: 'bg-gray-50 text-gray-600 border-gray-200',
};

const COLOR_ESTADO: Record<EstadoHallazgo, string> = {
  ABIERTO: 'bg-red-50 text-red-700 border-red-200',
  EN_REVISION: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  RESUELTO: 'bg-green-50 text-green-700 border-green-200',
  NO_APLICA: 'bg-gray-50 text-gray-600 border-gray-200',
};

const MAX_TITULO = 160;

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: modal alta/edicion (module scope)
// ---------------------------------------------------------------------------

interface FormState {
  codigo: string;
  titulo: string;
  descripcion: string;
  criticidad: CriticidadHallazgo;
  norma: string;
  estado: EstadoHallazgo;
  recomendacion: string;
}

const FORM_VACIO: FormState = {
  codigo: '', titulo: '', descripcion: '', criticidad: 'MEDIA', norma: '', estado: 'ABIERTO', recomendacion: '',
};

interface HallazgoModalProps {
  abierto: boolean;
  editando: HallazgoSueldos | null;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}

const HallazgoModal: React.FC<HallazgoModalProps> = ({ abierto, editando, onClose, onSubmit }) => {
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!abierto) return;
    if (editando) {
      setForm({
        codigo: editando.codigo ?? '',
        titulo: editando.titulo ?? '',
        descripcion: editando.descripcion ?? '',
        criticidad: editando.criticidad,
        norma: editando.norma ?? '',
        estado: editando.estado,
        recomendacion: editando.recomendacion ?? '',
      });
    } else {
      setForm(FORM_VACIO);
    }
    setSaving(false);
  }, [abierto, editando]);

  if (!abierto) return null;

  const habilitado = form.titulo.trim().length > 0;
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!habilitado || saving) return;
    setSaving(true);
    try { await onSubmit(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg"><Flag className="h-5 w-5 text-red-700" /></div>
            <h2 className="text-lg font-semibold text-gray-900">{editando ? 'Editar hallazgo' : 'Nuevo hallazgo'}</h2>
          </div>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 disabled:opacity-50" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Código</label>
              <input type="text" value={form.codigo} onChange={(e) => set('codigo', e.target.value)} disabled={saving}
                placeholder="H-01" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Criticidad</label>
              <select value={form.criticidad} onChange={(e) => set('criticidad', e.target.value)} disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CRITICIDADES_HALLAZGO.map((c) => <option key={c} value={c}>{LABEL_CRITICIDAD_HALLAZGO[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Estado</label>
              <select value={form.estado} onChange={(e) => set('estado', e.target.value)} disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ESTADOS_HALLAZGO.map((s) => <option key={s} value={s}>{LABEL_ESTADO_HALLAZGO[s]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Título <span className="text-red-500">*</span></label>
            <input type="text" value={form.titulo} onChange={(e) => set('titulo', e.target.value.slice(0, MAX_TITULO))} disabled={saving} autoFocus
              placeholder="Ej: Alícuota efectiva de cargas sociales por debajo del mes anterior"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={3} disabled={saving}
              placeholder="Detalle del hallazgo, evidencia, impacto."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Norma / referencia</label>
            <input type="text" value={form.norma} onChange={(e) => set('norma', e.target.value)} disabled={saving}
              placeholder="LCT art. 132, Res. AFIP ..., CCT Sanidad ..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Recomendación</label>
            <textarea value={form.recomendacion} onChange={(e) => set('recomendacion', e.target.value)} rows={2} disabled={saving}
              placeholder="Acción sugerida."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={handleSubmit} disabled={!habilitado || saving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? 'Guardar' : 'Crear hallazgo'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PROPS DEL COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

export interface TabHallazgosProps {
  hallazgos: HallazgoSueldos[];
  loading: boolean;
  error: string | null;
  crear: (datos: HallazgoSueldosNuevo) => Promise<ResultadoOperacion<HallazgoSueldos>>;
  actualizar: (id: string, cambios: HallazgoSueldosActualizacion) => Promise<ResultadoOperacion<HallazgoSueldos>>;
  eliminar: (id: string) => Promise<ResultadoOperacion<void>>;
  /** Contexto del mes para nuevos hallazgos. */
  liquidacionId: string;
  anio: number;
  mes: number;
  /** Nombre del usuario para el snapshot. */
  nombreUsuario?: string;
  /** Solo el rol Auditor ve/edita esta sección. */
  esAuditor: boolean;
}

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

const TabHallazgos: React.FC<TabHallazgosProps> = ({
  hallazgos, loading, error, crear, actualizar, eliminar,
  liquidacionId, anio, mes, nombreUsuario, esAuditor,
}) => {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<HallazgoSueldos | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null);

  // Gate de acceso
  if (!esAuditor) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
        <Lock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">
          Sección exclusiva del rol <span className="font-semibold">Auditor</span> (permiso <code>sueldos:reportes</code>).
        </p>
      </div>
    );
  }

  const abrirNuevo = () => { setEditando(null); setModalAbierto(true); };
  const abrirEditar = (h: HallazgoSueldos) => { setEditando(h); setModalAbierto(true); };

  const handleSubmit = async (form: FormState) => {
    setAccionMsg(null);
    const base = {
      codigo: form.codigo.trim() || null,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      criticidad: form.criticidad,
      norma: form.norma.trim() || null,
      estado: form.estado,
      recomendacion: form.recomendacion.trim() || null,
    };
    const res = editando
      ? await actualizar(editando.id, base)
      : await crear({ ...base, liquidacion_id: liquidacionId, anio, mes, origen: 'manual', creado_por_nombre: nombreUsuario || null });
    if (res.ok) {
      setModalAbierto(false);
      setEditando(null);
      setAccionMsg({ ok: true, texto: editando ? 'Hallazgo actualizado' : 'Hallazgo creado' });
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  const handleEliminar = async (id: string) => {
    setAccionMsg(null);
    const res = await eliminar(id);
    setConfirmEliminar(null);
    setAccionMsg(res.ok ? { ok: true, texto: 'Hallazgo eliminado' } : { ok: false, texto: res.error });
  };

  if (loading && hallazgos.length === 0) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-red-50 text-red-700 rounded-lg"><Flag className="h-5 w-5" /></div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Hallazgos de auditoría</h3>
            <p className="text-xs text-gray-500">Observaciones del mes con criticidad, norma y estado. Solo el rol Auditor.</p>
          </div>
        </div>
        <button type="button" onClick={abrirNuevo} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
          <Plus className="h-4 w-4" /> Nuevo hallazgo
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" /><p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {accionMsg && (
        <div className={`p-3 rounded-lg border flex items-center gap-3 ${accionMsg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {accionMsg.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}<p className="text-sm">{accionMsg.texto}</p>
        </div>
      )}

      {hallazgos.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <Flag className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay hallazgos cargados para este mes.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase w-16">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Hallazgo</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Criticidad</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Norma</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Estado</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-20">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {hallazgos.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3 py-2 text-sm font-mono text-gray-600">{h.codigo || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{h.titulo}</div>
                      {h.descripcion && <div className="text-[11px] text-gray-500 line-clamp-2">{h.descripcion}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${COLOR_CRITICIDAD[h.criticidad]}`}>{LABEL_CRITICIDAD_HALLAZGO[h.criticidad]}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-[12rem]">{h.norma || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-md border ${COLOR_ESTADO[h.estado]}`}>{LABEL_ESTADO_HALLAZGO[h.estado]}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => abrirEditar(h)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Editar"><Pencil className="h-4 w-4" /></button>
                        {confirmEliminar === h.id ? (
                          <button type="button" onClick={() => handleEliminar(h.id)} className="px-2 py-1 text-[11px] font-medium text-white bg-red-600 rounded hover:bg-red-700">Confirmar</button>
                        ) : (
                          <button type="button" onClick={() => setConfirmEliminar(h.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex items-center gap-3">
            <AlertTriangle className="h-3.5 w-3.5 text-gray-400" />
            {hallazgos.length} hallazgo(s) · {hallazgos.filter((h) => h.estado === 'ABIERTO').length} abierto(s)
          </div>
        </div>
      )}

      <HallazgoModal abierto={modalAbierto} editando={editando} onClose={() => { setModalAbierto(false); setEditando(null); }} onSubmit={handleSubmit} />
    </div>
  );
};

export default TabHallazgos;
export { TabHallazgos };
