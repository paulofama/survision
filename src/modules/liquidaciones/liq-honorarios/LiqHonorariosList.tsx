// ============================================================
// COMPONENT: LiqHonorariosList
// Tabla + WhatsApp: imagen canvas + teléfono + apertura automática
// ============================================================

import { useState, useRef, useCallback } from 'react';
import {
  Plus, Edit2, Eye, Trash2, FileText, TrendingUp,
  MessageCircle, X, Copy, Check, Loader2, Phone, Send,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { LiqHonorarioConPrestador } from './types';

// ─── Props ────────────────────────────────────────────────
interface Props {
  liquidaciones: LiqHonorarioConPrestador[];
  loading: boolean;
  stats: { count: number; totalLiquidado: number; totalAbonar: number };
  onEdit: (id: string) => void;
  onViewReport: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

// ─── Formateo ─────────────────────────────────────────────
const FMT = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 2,
  }).format(n);

const FMT_PLAIN = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(n);

// ─── Normalizar teléfono para wa.me ───────────────────────
function normalizarTel(raw: string): string {
  let tel = raw.replace(/\D/g, '');
  if (tel.startsWith('0')) tel = '54' + tel.substring(1);
  if (!tel.startsWith('54') && tel.length <= 10) tel = '54' + tel;
  tel = tel.replace(/^(549?)(\d{2,4})(15)(\d{6,8})$/, '$19$2$4');
  return tel;
}

// ─── Estado del modal ─────────────────────────────────────
interface ModalState {
  open: boolean;
  liq: LiqHonorarioConPrestador | null;
  telefono: string;
  imagenUrl: string | null;
  copiada: boolean;
  loadingImg: boolean;
  sending: boolean;
  error: string | null;
}
const CLOSED: ModalState = {
  open: false, liq: null, telefono: '', imagenUrl: null,
  copiada: false, loadingImg: false, sending: false, error: null,
};

// ─── Colores ──────────────────────────────────────────────
const NAVY  = '#1a3558';
const NAVY2 = '#0f2240';
const BORDER = '#e2e8f0';

// ─── Canvas: rounded rect helper ──────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Generar imagen con Canvas ────────────────────────────
function generarImagen(canvas: HTMLCanvasElement, liq: LiqHonorarioConPrestador): string {
  const W = 780;
  const hasRet = liq.retencion_gastos > 0;
  const H = hasRet ? 556 : 506;
  const PAD = 36;

  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 0, 0, W, H, 16);
  ctx.fill();

  // Header degradado
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, NAVY2);
  grad.addColorStop(1, NAVY);
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, 108, 16);
  ctx.fill();
  ctx.fillRect(0, 92, W, 16); // bordes inferiores cuadrados

  // Título institución
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('INSTITUTO DR. MERCADO', PAD, 46);

  ctx.font = '15px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('Survisión S.A.', PAD, 70);

  // Etiqueta derecha
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, W - PAD - 210, 20, 210, 36, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('LIQUIDACIÓN DE HONORARIOS', W - PAD, 43);

  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.font = '11px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.fillText(hoy, W - PAD, 63);

  // ── Prestador + Período ──
  const fechaLiq = new Date(liq.fecha + 'T12:00:00');
  const periodo  = fechaLiq.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const periodoC = periodo.charAt(0).toUpperCase() + periodo.slice(1);

  let y = 140;

  ctx.textAlign = 'left';
  ctx.font = '11px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('PRESTADOR', PAD, y);

  ctx.textAlign = 'right';
  ctx.fillText('PERÍODO', W - PAD, y);

  y += 22;
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = NAVY;
  ctx.fillText(liq.prestador_nombre, PAD, y);

  ctx.textAlign = 'right';
  ctx.font = 'bold 22px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = NAVY;
  ctx.fillText(periodoC, W - PAD, y);

  // Separador
  y += 24;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ── Montos ──
  y += 30;

  const drawRow = (label: string, valor: string, isRed = false, isBig = false) => {
    ctx.textAlign = 'left';
    ctx.font = `${isBig ? 'bold ' : ''}${isBig ? 15 : 14}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = isBig ? NAVY : '#475569';
    ctx.fillText(label, PAD, y);

    ctx.textAlign = 'right';
    ctx.font = `${isBig ? 'bold ' : ''}${isBig ? 15 : 14}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = isRed ? '#dc2626' : (isBig ? NAVY : '#334155');
    ctx.fillText(valor, W - PAD, y);
    y += 30;
  };

  drawRow('Total Bruto Liquidado', `$ ${FMT_PLAIN(liq.total_liquidado)}`, false, true);

  if (hasRet) {
    y += 4;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 14;
    drawRow('(−) Retención por Gastos', `$ ${FMT_PLAIN(liq.retencion_gastos)}`, true);
  }

  // ── Card total ──
  y += 10;
  const CARD_H = 78;
  ctx.fillStyle = NAVY;
  roundRect(ctx, PAD, y, W - PAD * 2, CARD_H, 12);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, PAD, y, (W - PAD * 2) * 0.45, CARD_H, 12);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.font = 'bold 13px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('TOTAL A ABONAR AL PRESTADOR', PAD + 22, y + 28);

  ctx.textAlign = 'right';
  ctx.font = 'bold 30px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`$ ${FMT_PLAIN(liq.total_abonar)}`, W - PAD - 22, y + 56);

  // ── Footer ──
  const footY = H - 26;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, footY - 14); ctx.lineTo(W - PAD, footY - 14);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '11px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Instituto Dr. Mercado · Survisión S.A. · Documento generado electrónicamente', W / 2, footY);

  return canvas.toDataURL('image/png');
}

// ═══════════════════════════════════════════════════════════
export function LiqHonorariosList({
  liquidaciones, loading, stats, onEdit, onViewReport, onDelete, onNew,
}: Props) {
  const [modal, setModal] = useState<ModalState>(CLOSED);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Abrir modal ─────────────────────────────────────────
  const handleOpenWhatsApp = useCallback(async (liq: LiqHonorarioConPrestador) => {
    setModal({ ...CLOSED, open: true, liq, loadingImg: true });

    // Buscar teléfono guardado
    const { data } = await supabase
      .from('liq_honorarios_prestadores')
      .select('telefono')
      .eq('id', liq.prestador_id)
      .single();

    const tel = data?.telefono || '';

    // Generar imagen
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = generarImagen(canvas, liq);
      setModal(prev => ({ ...prev, imagenUrl: url, loadingImg: false, telefono: tel }));
    }, 80);
  }, []);

  // ─── Copiar imagen ────────────────────────────────────────
  const handleCopiar = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Sin blob')), 'image/png');
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setModal(prev => ({ ...prev, copiada: true }));
      setTimeout(() => setModal(prev => ({ ...prev, copiada: false })), 3000);
    } catch {
      alert('No se pudo copiar. Clic derecho → Copiar imagen.');
    }
  }, []);

  // ─── Abrir WhatsApp ───────────────────────────────────────
  const handleAbrirWhatsApp = useCallback(async () => {
    if (!modal.liq || !modal.telefono.trim()) return;
    setModal(prev => ({ ...prev, sending: true, error: null }));

    try {
      // Guardar teléfono
      await supabase
        .from('liq_honorarios_prestadores')
        .update({ telefono: modal.telefono.trim() })
        .eq('id', modal.liq!.prestador_id);

      const tel = normalizarTel(modal.telefono.trim());
      window.open(`https://wa.me/${tel}`, '_blank');
      setModal(CLOSED);
    } catch (err: any) {
      setModal(prev => ({ ...prev, sending: false, error: 'Error al guardar el teléfono' }));
    }
  }, [modal]);

  // ─── Loading / Empty ──────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500">Cargando liquidaciones...</p>
      </div>
    );
  }

  if (liquidaciones.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-blue-900 mb-2">No hay liquidaciones guardadas</h3>
        <p className="text-gray-500 mb-6">Cree una nueva liquidación en la pestaña "Nueva Liquidación"</p>
        <button onClick={onNew}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 text-sm font-medium">
          <Plus className="w-4 h-4" /> Nueva Liquidación
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  return (
    <>
      {/* Canvas oculto */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="space-y-4">
        {/* ── Tabla ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Prestador</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Ingreso Caja</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Total Liquidado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Total a Abonar</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Estado</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {liquidaciones.map((liq) => {
                  const fechaCreacion = new Date(liq.created_at).toLocaleDateString('es-AR');
                  const fechaMod = liq.updated_at !== liq.created_at
                    ? new Date(liq.updated_at).toLocaleDateString('es-AR') : null;
                  const wasModified = fechaMod && fechaMod !== fechaCreacion;

                  return (
                    <tr key={liq.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {new Date(liq.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                        </div>
                        <div className="text-xs text-gray-400">{liq.id.substring(0, 8).toUpperCase()}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-blue-800">{liq.prestador_nombre}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{FMT(liq.ingreso_por_caja)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{FMT(liq.total_liquidado)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{FMT(liq.total_abonar)}</td>
                      <td className="px-4 py-3 text-center">
                        {wasModified ? (
                          <span className="inline-flex flex-col items-center text-xs text-amber-600">
                            ✏️ Modificada
                            <span className="text-[10px] text-gray-400">{fechaMod}</span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-center text-xs text-green-600">
                            ✅ Original
                            <span className="text-[10px] text-gray-400">{fechaCreacion}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <button onClick={() => onEdit(liq.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors w-24 justify-center">
                            <Edit2 className="w-3 h-3" /> Editar
                          </button>
                          <button onClick={() => onViewReport(liq.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 transition-colors w-24 justify-center">
                            <Eye className="w-3 h-3" /> Ver
                          </button>
                          <button onClick={() => handleOpenWhatsApp(liq)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-200 transition-colors w-24 justify-center">
                            <MessageCircle className="w-3 h-3" /> Enviar
                          </button>
                          <button onClick={() => onDelete(liq.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition-colors w-24 justify-center">
                            <Trash2 className="w-3 h-3" /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Estadísticas ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h4 className="text-blue-900 font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" /> Estadísticas
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-blue-600 font-medium">Total de Liquidaciones</p>
              <p className="text-xl font-bold text-blue-900">{stats.count}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">Total Liquidado</p>
              <p className="text-xl font-bold text-green-700">{FMT(stats.totalLiquidado)}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">Total a Abonar</p>
              <p className="text-xl font-bold text-green-800">{FMT(stats.totalAbonar)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          MODAL WHATSAPP
      ═══════════════════════════════════════════════════════ */}
      {modal.open && modal.liq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModal(CLOSED)} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#25D366] px-5 py-4 flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-full">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Enviar Liquidación</p>
                <p className="text-green-100 text-xs">{modal.liq.prestador_nombre}</p>
              </div>
              {/* Botón copiar imagen */}
              <button
                onClick={handleCopiar}
                disabled={!modal.imagenUrl || modal.loadingImg}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${modal.copiada
                    ? 'bg-white text-green-700'
                    : 'bg-white/20 hover:bg-white/30 text-white disabled:opacity-40'}`}
              >
                {modal.copiada
                  ? <><Check className="w-3.5 h-3.5" /> ¡Copiada!</>
                  : <><Copy className="w-3.5 h-3.5" /> Copiar imagen</>}
              </button>
              <button onClick={() => setModal(CLOSED)} className="ml-1 text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vista previa imagen */}
            <div className="px-4 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-2">✓ Vista previa de la imagen</p>
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center"
                   style={{ minHeight: '200px' }}>
                {modal.loadingImg ? (
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                ) : modal.imagenUrl ? (
                  <img src={modal.imagenUrl} alt="Vista previa" className="w-full rounded-xl" />
                ) : null}
              </div>
            </div>

            {/* Teléfono + Abrir WhatsApp */}
            <div className="px-4 pt-4 pb-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-4 h-4" /> Teléfono del prestador
                </label>
                <input
                  type="tel"
                  value={modal.telefono}
                  onChange={e => setModal(prev => ({ ...prev, telefono: e.target.value }))}
                  placeholder="Ej: 2604 123456"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  onKeyDown={e => e.key === 'Enter' && handleAbrirWhatsApp()}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">El número se guardará para futuros envíos.</p>
              </div>

              {modal.error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {modal.error}
                </p>
              )}

              {/* Instrucciones */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasos para enviar</p>
                <div className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="w-4 h-4 bg-[#25D366] text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                  Hacé clic en <strong>"Copiar imagen"</strong> (arriba a la derecha)
                </div>
                <div className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="w-4 h-4 bg-[#25D366] text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                  Ingresá el teléfono y hacé clic en <strong>"Abrir WhatsApp"</strong>
                </div>
                <div className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="w-4 h-4 bg-[#25D366] text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                  En WhatsApp, presioná <strong>Ctrl+V</strong> para pegar la imagen
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModal(CLOSED)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                  Cerrar
                </button>
                <button
                  onClick={handleAbrirWhatsApp}
                  disabled={!modal.telefono.trim() || modal.sending}
                  className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20ba58] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
                >
                  {modal.sending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Abriendo...</>
                    : <><Send className="w-4 h-4" /> Abrir WhatsApp</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
