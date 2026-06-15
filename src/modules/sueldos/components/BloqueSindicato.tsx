// ===========================================================================
// COMPONENT: BloqueSindicato - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Bloque de la minuta con 1 concepto canonico: cuota sindical (UTHGRA u
// otros sindicatos segun el empleado). Va contra cuenta 2.1.2.03 SINDICATO
// A PAGAR.
//
// Render: una sola fila editable, layout mas compacto que BloqueSeguridadSocial.
// ===========================================================================

import React, { useEffect, useState } from 'react';
import {
  Loader2,
  Users,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  ConceptoCodigo,
  LiquidacionBloqueCompleto,
  LiquidacionLineaConceptoActualizacion,
  LiquidacionLineaConceptoNueva,
  ResultadoOperacion,
} from '../types/sueldos';
import { CUENTAS_PASIVOS_SUELDOS } from '../utils/constantes';

// ---------------------------------------------------------------------------
// TEMPLATE (1 concepto)
// ---------------------------------------------------------------------------

const CODIGO_SINDICATO: ConceptoCodigo = 'SINDICATO';
const NOMBRE_SINDICATO = 'Cuota sindical';
const CUENTA_SINDICATO = CUENTAS_PASIVOS_SUELDOS.SINDICATO_A_PAGAR;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const NF_MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

function parsearMonto(raw: string): number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const limpio = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

// Serializa el monto guardado (number) al string editable del input.
// CRITICO: coma decimal y SIN separador de miles. String(n) produce punto
// decimal y parsearMonto lo trataria como separador de miles, inflando el
// valor en el round-trip. Ver bug de conciliacion 12/2025.
function montoAInput(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '';
  return String(n).replace('.', ',');
}

// ---------------------------------------------------------------------------
// COMPONENTE
// ---------------------------------------------------------------------------

interface Props {
  bloque: LiquidacionBloqueCompleto;
  disabled?: boolean;
  onAgregarLinea: (linea: LiquidacionLineaConceptoNueva) => Promise<ResultadoOperacion<unknown>>;
  onActualizarLinea: (id: string, cambios: LiquidacionLineaConceptoActualizacion) => Promise<ResultadoOperacion<unknown>>;
  onEliminarLinea: (id: string) => Promise<ResultadoOperacion<void>>;
  onActualizarBloque: (bloqueId: string, cambios: { completo?: boolean }) => Promise<ResultadoOperacion<unknown>>;
}

const BloqueSindicato: React.FC<Props> = ({
  bloque, disabled, onAgregarLinea, onActualizarLinea, onEliminarLinea, onActualizarBloque,
}) => {
  const lineaExistente = bloque.lineas_concepto.find((l) => l.concepto_codigo === CODIGO_SINDICATO);
  const valorBD = lineaExistente ? Number(lineaExistente.monto) : 0;

  const [valor, setValor] = useState<string>(montoAInput(lineaExistente?.monto));
  const [saving, setSaving] = useState(false);
  const [savingCompleto, setSavingCompleto] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);

  useEffect(() => {
    setValor(montoAInput(lineaExistente?.monto));
  }, [lineaExistente?.id, lineaExistente?.monto]);

  const hayCambios = (() => {
    const n = parsearMonto(valor);
    if (n === null) return false;
    return Math.abs(n - valorBD) > 0.001;
  })();

  const handleGuardar = async () => {
    setErrorMsg(null);
    const monto = parsearMonto(valor);
    if (monto === null) {
      setErrorMsg('Monto invalido');
      return;
    }
    if (monto < 0) {
      setErrorMsg('Monto no puede ser negativo');
      return;
    }

    setSaving(true);
    const res = lineaExistente
      ? await onActualizarLinea(lineaExistente.id, { monto })
      : await onAgregarLinea({
          bloque_id: bloque.id,
          concepto_codigo: CODIGO_SINDICATO,
          concepto_nombre: NOMBRE_SINDICATO,
          cuenta_contable: CUENTA_SINDICATO,
          monto,
          origen: 'recibo',
        });
    setSaving(false);

    if (!res.ok) {
      setErrorMsg(res.error);
    } else {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 1200);
    }
  };

  const handleEliminar = async () => {
    if (!lineaExistente) return;
    if (!window.confirm('¿Eliminar la línea de cuota sindical?')) return;
    setErrorMsg(null);
    setSaving(true);
    const res = await onEliminarLinea(lineaExistente.id);
    setSaving(false);
    if (!res.ok) setErrorMsg(res.error);
  };

  const handleToggleCompleto = async () => {
    setSavingCompleto(true);
    await onActualizarBloque(bloque.id, { completo: !bloque.completo });
    setSavingCompleto(false);
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Sindicato</h3>
            <p className="text-xs text-gray-500">Cuota sindical (contra Banco Santander Río)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={bloque.completo}
              onChange={handleToggleCompleto}
              disabled={disabled || savingCompleto}
              className="h-4 w-4"
            />
            <span>Bloque completo</span>
            {savingCompleto && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </label>
        </div>
      </div>

      {/* Body — una sola fila */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-1">
          <div className="text-xs text-gray-500 uppercase">Concepto</div>
          <div className="text-sm font-medium text-gray-900 mt-1">{NOMBRE_SINDICATO}</div>
        </div>
        <div className="md:col-span-1">
          <div className="text-xs text-gray-500 uppercase">Cuenta</div>
          <div className="text-sm font-mono text-gray-700 mt-1">{CUENTA_SINDICATO}</div>
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs text-gray-500 uppercase mb-1">Monto</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => {
                if (hayCambios) handleGuardar();
              }}
              disabled={disabled || saving}
              placeholder="0,00"
              className={`
                w-full px-2 py-1.5 text-right text-sm font-mono
                border rounded focus:outline-none focus:ring-2 focus:ring-blue-400
                disabled:bg-gray-100 disabled:text-gray-500
                ${errorMsg ? 'border-red-400' : okFlash ? 'border-green-400' : 'border-gray-300'}
              `}
            />
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            {okFlash && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          </div>
          {errorMsg && (
            <div className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errorMsg}
            </div>
          )}
          {lineaExistente && !hayCambios && (
            <div className="text-[11px] text-gray-500 mt-1 font-mono">
              Guardado: {NF_MONEDA.format(lineaExistente.monto)}
            </div>
          )}
        </div>
        <div className="md:col-span-1 flex items-center justify-end gap-1">
          {hayCambios && !saving && (
            <button
              type="button"
              onClick={handleGuardar}
              disabled={disabled}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              title="Guardar cambios"
            >
              <Save className="h-4 w-4" />
            </button>
          )}
          {lineaExistente && !saving && (
            <button
              type="button"
              onClick={handleEliminar}
              disabled={disabled}
              className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              title="Eliminar línea"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default BloqueSindicato;
export { BloqueSindicato };
