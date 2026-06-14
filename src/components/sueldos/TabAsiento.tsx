// ===========================================================================
// COMPONENT: TabAsiento - MODULO CARGA DE SUELDOS (Fase 4)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Pestaña Asiento del MesDetallePage. Muestra la PROPUESTA DE ASIENTO de
// devengamiento (borrador para contabilidad):
//   - Selector de criterio de bruto + botón Generar/Regenerar + Borrar + Excel
//   - Cabecera con metadata del cálculo (Rem.1, neto, bruto, ajuste, cuadre)
//   - Tabla Debe/Haber por sección (recibo / facturado)
//   - Advertencias del generador (línea de ajuste, Día Sanidad, etc.)
//
// La etiqueta "Propuesta de Asiento (borrador para contabilidad)" es obligatoria
// en toda la UI (decisión cerrada en CLAUDE.md).
// ===========================================================================

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  AsientoCompleto,
  AsientoGenerarResult,
  AsientoSueldosLinea,
  ResultadoOperacion,
  SeccionAsiento,
  TipoCriterioBruto,
} from '../../types/sueldos';
import { CRITERIOS_BRUTO, LABEL_CRITERIO_BRUTO } from '../../types/sueldos';
import { exportarAsientoExcel } from '../../utils/sueldos/exportarAsiento';

// ---------------------------------------------------------------------------
// FORMAT HELPERS
// ---------------------------------------------------------------------------

const NF_MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

const money = (n: number | null | undefined) => NF_MONEDA.format(Number(n) || 0);

const SECCION_LABEL: Record<SeccionAsiento, string> = {
  recibo: 'Recibo',
  facturado: 'Facturado (horas complementarias)',
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: tabla de una sección (module scope)
// ---------------------------------------------------------------------------

interface SeccionTablaProps {
  titulo: string;
  lineas: AsientoSueldosLinea[];
}

const SeccionTabla: React.FC<SeccionTablaProps> = ({ titulo, lineas }) => {
  if (lineas.length === 0) return null;

  const totalDebe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700">{titulo}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Detalle</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Debe</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Haber</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {lineas.map((l) => (
              <tr key={l.id} className={l.es_ajuste ? 'bg-yellow-50/60' : ''}>
                <td className="px-3 py-2 text-sm font-mono text-gray-700 whitespace-nowrap">
                  {l.cuenta_codigo ?? (
                    <span className="italic text-yellow-700">(a determinar)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-sm text-gray-700">
                  {l.cuenta_nombre && (
                    <span className="font-medium text-gray-900">{l.cuenta_nombre}</span>
                  )}
                  {l.detalle && (
                    <span className="block text-[11px] text-gray-500">
                      {l.detalle}
                      {l.es_estimado && (
                        <span className="ml-1 text-blue-600" title="Bruto estimado por reparto proporcional Rem.1">*</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-sm font-mono text-gray-800 whitespace-nowrap">
                  {Number(l.debe) > 0 ? money(l.debe) : ''}
                </td>
                <td className="px-3 py-2 text-right text-sm font-mono text-gray-800 whitespace-nowrap">
                  {Number(l.haber) > 0 ? money(l.haber) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td className="px-3 py-2 text-xs font-semibold text-gray-600 uppercase" colSpan={2}>
                Subtotal {titulo}
              </td>
              <td className="px-3 py-2 text-right text-sm font-mono font-bold text-gray-900 whitespace-nowrap">
                {money(totalDebe)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-mono font-bold text-gray-900 whitespace-nowrap">
                {money(totalHaber)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PROPS DEL COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

export interface TabAsientoProps {
  asiento: AsientoCompleto | null;
  lineasRecibo: AsientoSueldosLinea[];
  lineasFacturado: AsientoSueldosLinea[];
  warnings: string[];
  loading: boolean;
  error: string | null;
  cuadra: boolean;
  generar: (
    criterio?: TipoCriterioBruto,
    nombreUsuario?: string
  ) => Promise<ResultadoOperacion<AsientoGenerarResult>>;
  borrar: () => Promise<ResultadoOperacion<void>>;
  /** Mes cerrado → bloquear edición. */
  disabled?: boolean;
  /** Si no hay F.931 confirmado, mostrar mensaje informativo. */
  tieneF931Confirmado: boolean;
}

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

const TabAsiento: React.FC<TabAsientoProps> = ({
  asiento, lineasRecibo, lineasFacturado, warnings, loading, error,
  cuadra, generar, borrar, disabled, tieneF931Confirmado,
}) => {
  const [criterio, setCriterio] = useState<TipoCriterioBruto>('RECONCILIABLE');
  const [nombre, setNombre] = useState('');
  const [generando, setGenerando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [accionMsg, setAccionMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [warningsLocal, setWarningsLocal] = useState<string[]>(warnings);

  // Sincroniza el criterio mostrado con el del asiento persistido al cargar.
  React.useEffect(() => {
    if (asiento?.cabecera.criterio_bruto) {
      setCriterio(asiento.cabecera.criterio_bruto);
    }
  }, [asiento?.cabecera.criterio_bruto]);

  const handleGenerar = async () => {
    setGenerando(true);
    setAccionMsg(null);
    const res = await generar(criterio, nombre.trim() || undefined);
    setGenerando(false);
    if (res.ok) {
      setWarningsLocal(res.data.warnings ?? []);
      setAccionMsg({ ok: true, texto: res.data.mensaje ?? 'Asiento generado.' });
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  const handleBorrar = async () => {
    setBorrando(true);
    setAccionMsg(null);
    const res = await borrar();
    setBorrando(false);
    if (res.ok) {
      setWarningsLocal([]);
      setAccionMsg({ ok: true, texto: 'Asiento borrado.' });
    } else {
      setAccionMsg({ ok: false, texto: res.error });
    }
  };

  const handleExportar = () => {
    if (!asiento) return;
    exportarAsientoExcel(asiento.cabecera, asiento.lineas);
  };

  const cab = asiento?.cabecera ?? null;
  const warningsMostrar = warningsLocal.length ? warningsLocal : warnings;

  // ---- Render -------------------------------------------------------------

  if (loading && !asiento) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con icono + etiqueta de borrador */}
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-green-50 text-green-700 rounded-lg">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Propuesta de Asiento <span className="font-normal text-gray-500">(borrador para contabilidad)</span>
          </h3>
          <p className="text-xs text-gray-500">
            Devengamiento de sueldos. Bruto al Debe (estimado por reparto proporcional del Rem.1),
            cargas y netos al Haber. No reemplaza la contabilización oficial.
          </p>
        </div>
      </div>

      {/* Sin F.931 confirmado → mensaje */}
      {!tieneF931Confirmado && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <span className="font-semibold">Para generar el asiento necesitás un F.931 confirmado</span> y los
            netos por empleado cargados en el bloque Pago de Sueldos. Completá eso y volvé acá.
          </div>
        </div>
      )}

      {/* Controles: criterio + generar + borrar + excel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Criterio de bruto</label>
          <select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as TipoCriterioBruto)}
            disabled={disabled || generando}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          >
            {CRITERIOS_BRUTO.map((c) => (
              <option key={c} value={c}>{LABEL_CRITERIO_BRUTO[c]}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-600 uppercase mb-1">Generado por (opcional)</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={disabled || generando}
            placeholder="Tu nombre"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerar}
            disabled={disabled || generando || !tieneF931Confirmado}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {generando ? <Loader2 className="h-4 w-4 animate-spin" />
              : asiento ? <RotateCcw className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            {asiento ? 'Regenerar' : 'Generar'}
          </button>
          {asiento && (
            <>
              <button
                type="button"
                onClick={handleExportar}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                title="Exportar a Excel"
              >
                <Download className="h-4 w-4" />
                Excel
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={handleBorrar}
                  disabled={borrando}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  title="Borrar asiento"
                >
                  {borrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </>
          )}
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
          {accionMsg.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <p className="text-sm">{accionMsg.texto}</p>
        </div>
      )}

      {/* Advertencias del generador */}
      {warningsMostrar.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm font-semibold text-yellow-800 mb-1">
            <AlertTriangle className="h-4 w-4" /> Advertencias
          </div>
          <ul className="list-disc list-inside text-xs text-yellow-800 space-y-0.5">
            {warningsMostrar.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Sin asiento todavía */}
      {!asiento ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Todavía no se generó el asiento. Elegí el criterio y hacé click en "Generar".
          </p>
        </div>
      ) : (
        <>
          {/* Cabecera con métricas */}
          {cab && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-gray-500 uppercase">Total neto</div>
                <div className="text-lg font-bold text-gray-900 font-mono">{money(cab.total_neto)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Bruto total (Debe)</div>
                <div className="text-lg font-bold text-gray-900 font-mono">{money(cab.bruto_total)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Rem.1 F.931</div>
                <div className="text-lg font-bold text-gray-700 font-mono">{money(cab.rem_1_usado)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Ajuste</div>
                <div className={`text-lg font-bold font-mono ${Math.abs(Number(cab.monto_ajuste)) >= 0.01 ? 'text-yellow-700' : 'text-gray-400'}`}>
                  {money(cab.monto_ajuste)}
                </div>
              </div>
            </div>
          )}

          {/* Estado de cuadre */}
          {cab && (
            <div className={`rounded-xl border p-3 flex items-center justify-between ${
              cuadra ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-gray-600">Debe <span className="font-bold text-gray-900">{money(cab.total_debe)}</span></span>
                <span className="text-gray-600">Haber <span className="font-bold text-gray-900">{money(cab.total_haber)}</span></span>
              </div>
              {cuadra ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> El asiento cuadra
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4" /> El asiento NO cuadra
                </span>
              )}
            </div>
          )}

          {/* Tablas por sección */}
          <SeccionTabla titulo={SECCION_LABEL.recibo} lineas={lineasRecibo} />
          <SeccionTabla titulo={SECCION_LABEL.facturado} lineas={lineasFacturado} />

          <p className="text-[11px] text-gray-400">
            <span className="text-blue-600">*</span> Monto de bruto estimado por reparto proporcional del Rem.1 del F.931.
            Las horas complementarias (facturado) las reimputa el Auditor en el sistema contable real a 4.1.2.02.
          </p>
        </>
      )}
    </div>
  );
};

export default TabAsiento;
export { TabAsiento };
