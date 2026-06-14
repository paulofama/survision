// ============================================================
// COMPONENT: LiqHonorariosForm
// Formulario de liquidaciÃ³n con cÃ¡lculo IVA en tiempo real
// 5 secciones: Datos, Ingreso Caja, Fact. Caja, Fact. OS, Totales
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useCajaCalculation, calcularOS, calcularTotales } from './useCajaCalculation';
import type { LiqPrestador, LiqHonorarioConPrestador, CajaCalculated } from './types';

// â”€â”€â”€ FMT helper (necesario antes de los componentes) â”€â”€â”€â”€â”€â”€â”€
const NUM = (v: string | number): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
};
const FMT = (v: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(v);

// â”€â”€â”€ NumInput FUERA del componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CRÃTICO: definirlo dentro causaba pÃ©rdida de foco en cada
// keystroke porque React re-creaba el componente en cada render.
interface NumInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
}
const NumInput: React.FC<NumInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  prefix = '$',
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          {prefix}
        </span>
      )}
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '0.00'}
        className={`w-full border border-gray-300 rounded-lg py-2 ${
          prefix ? 'pl-7' : 'pl-3'
        } pr-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
      />
    </div>
  </div>
);

// â”€â”€â”€ CalcValue FUERA del componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface CalcValueProps { label: string; value: number; bold?: boolean; }
const CalcValue: React.FC<CalcValueProps> = ({ label, value, bold }) => (
  <div>
    <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
    <p className={`text-sm py-2 px-3 bg-gray-50 rounded-lg border border-gray-200 ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
      {FMT(value)}
    </p>
  </div>
);

interface Props {
  prestadores: LiqPrestador[];
  editingLiq?: LiqHonorarioConPrestador;
  onSave: (params: any) => Promise<{ success: boolean; message: string }>;
  onSaved: (message: string) => void;
  onCancelEdit: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function LiqHonorariosForm({
  prestadores,
  editingLiq,
  onSave,
  onSaved,
  onCancelEdit,
  showToast,
}: Props) {
  // â”€â”€â”€ Form State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [fecha, setFecha] = useState('');
  const [prestadorId, setPrestadorId] = useState('');
  const [ingresoPorCaja, setIngresoPorCaja] = useState('');

  // Caja inputs
  const [cajaExentoInput, setCajaExentoInput] = useState('');
  const [cajaNetoInput, setCajaNetoInput] = useState('');
  const [cajaTotalInput, setCajaTotalInput] = useState('');

  // OS inputs
  const [osExentos, setOsExentos] = useState('');
  const [osGravados21, setOsGravados21] = useState('');
  const [osGravados105, setOsGravados105] = useState('');

  // RetenciÃ³n
  const [retencionGastos, setRetencionGastos] = useState('');

  const [saving, setSaving] = useState(false);

  // â”€â”€â”€ Caja calculation hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const {
    cajaValues,
    suggestion,
    cajaError,
    estadoBadge,
    calculate: calculateCaja,
    applySuggestion,
    dismissSuggestion,
    reset: resetCaja,
  } = useCajaCalculation();

  // â”€â”€â”€ Initialize form for editing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (editingLiq) {
      setFecha(editingLiq.fecha);
      setPrestadorId(editingLiq.prestador_id);
      setIngresoPorCaja(editingLiq.ingreso_por_caja ? String(editingLiq.ingreso_por_caja) : '');
      setCajaExentoInput(editingLiq.caja_exento_input ? String(editingLiq.caja_exento_input) : '');
      setCajaNetoInput(editingLiq.caja_neto_input ? String(editingLiq.caja_neto_input) : '');
      setCajaTotalInput(editingLiq.caja_total_input ? String(editingLiq.caja_total_input) : '');
      setOsExentos(editingLiq.os_exentos ? String(editingLiq.os_exentos) : '');
      setOsGravados21(editingLiq.os_gravados_21 ? String(editingLiq.os_gravados_21) : '');
      setOsGravados105(editingLiq.os_gravados_105 ? String(editingLiq.os_gravados_105) : '');
      setRetencionGastos(editingLiq.retencion_gastos ? String(editingLiq.retencion_gastos) : '');
    } else {
      clearForm();
    }
  }, [editingLiq]);

  // â”€â”€â”€ Recalculate Caja on input change â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    calculateCaja(NUM(cajaExentoInput), NUM(cajaNetoInput), NUM(cajaTotalInput));
  }, [cajaExentoInput, cajaNetoInput, cajaTotalInput, calculateCaja]);

  // â”€â”€â”€ OS calculations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const osCalc = useMemo(
    () => calcularOS(NUM(osExentos), NUM(osGravados21), NUM(osGravados105)),
    [osExentos, osGravados21, osGravados105]
  );

  // â”€â”€â”€ Totales consolidados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totales = useMemo(
    () =>
      calcularTotales(NUM(ingresoPorCaja), cajaValues, osCalc, NUM(retencionGastos)),
    [ingresoPorCaja, cajaValues, osCalc, retencionGastos]
  );

  // â”€â”€â”€ Apply suggestion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleApplySuggestion = useCallback(() => {
    setCajaExentoInput(String(suggestion.suggestedExento));
    setCajaNetoInput(String(suggestion.suggestedNeto));
    applySuggestion();
    showToast('Valores corregidos automÃ¡ticamente', 'success');
  }, [suggestion, applySuggestion, showToast]);

  // â”€â”€â”€ Clear form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const clearForm = useCallback(() => {
    setFecha(new Date().toISOString().split('T')[0]);
    setPrestadorId('');
    setIngresoPorCaja('');
    setCajaExentoInput('');
    setCajaNetoInput('');
    setCajaTotalInput('');
    setOsExentos('');
    setOsGravados21('');
    setOsGravados105('');
    setRetencionGastos('');
    resetCaja();
  }, [resetCaja]);

  // â”€â”€â”€ Guardar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleGuardar = useCallback(async () => {
    // ValidaciÃ³n
    if (!fecha) {
      showToast('La fecha es obligatoria', 'error');
      return;
    }
    if (!prestadorId) {
      showToast('Seleccione un prestador', 'error');
      return;
    }
    if (totales.totalLiquidado === 0) {
      showToast('La liquidaciÃ³n no puede tener total $0', 'error');
      return;
    }

    setSaving(true);
    const result = await onSave({
      id: editingLiq?.id,
      fecha,
      prestadorId,
      ingresoPorCaja: NUM(ingresoPorCaja),
      cajaExentoInput: NUM(cajaExentoInput),
      cajaNetoInput: NUM(cajaNetoInput),
      cajaTotalInput: NUM(cajaTotalInput),
      cajaValues,
      osExentos: NUM(osExentos),
      osGravados21: NUM(osGravados21),
      osGravados105: NUM(osGravados105),
      retencionGastos: NUM(retencionGastos),
    });
    setSaving(false);

    if (result.success) {
      clearForm();
      onSaved(result.message);
    } else {
      showToast(result.message, 'error');
    }
  }, [
    fecha, prestadorId, ingresoPorCaja, cajaExentoInput, cajaNetoInput,
    cajaTotalInput, cajaValues, osExentos, osGravados21, osGravados105,
    retencionGastos, totales, editingLiq, onSave, onSaved, clearForm, showToast,
  ]);

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isEditing = !!editingLiq;

  return (
    <div className="space-y-4">
      {/* Banner de ediciÃ³n */}
      {isEditing && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              Editando liquidaciÃ³n de {editingLiq.prestador_nombre} â€” {new Date(editingLiq.fecha).toLocaleDateString('es-AR')}
            </span>
          </div>
          <button
            onClick={onCancelEdit}
            className="text-sm text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Cancelar
          </button>
        </div>
      )}

      {/* â”€â”€ SecciÃ³n 1: Datos Generales â”€â”€ */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-white px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-blue-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
              1
            </span>
            Datos Generales
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prestador *</label>
            <select
              value={prestadorId}
              onChange={(e) => setPrestadorId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Seleccione el prestador</option>
              {prestadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* â”€â”€ SecciÃ³n 2: Ingreso por Caja â”€â”€ */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-green-50 to-white px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-green-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">
              2
            </span>
            Ingreso por Caja
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 ml-8">
            Ingresos directos en efectivo, no facturados
          </p>
        </div>
        <div className="p-5">
          <NumInput
            label="Monto ingresado por caja"
            value={ingresoPorCaja}
            onChange={setIngresoPorCaja}
            placeholder="0.00"
          />
        </div>
      </section>

      {/* â”€â”€ SecciÃ³n 3: FacturaciÃ³n por Caja (IVA por diferencia) â”€â”€ */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-white px-5 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-purple-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">
                3
              </span>
              FacturaciÃ³n por Caja
            </h3>
            {/* Badge de estado IVA */}
            {estadoBadge && (
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${estadoBadge.bg} ${estadoBadge.text}`}
              >
                {estadoBadge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 ml-8">
            IVA calculado automÃ¡ticamente por diferencia
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NumInput
              label="Honorarios Exentos (E)"
              value={cajaExentoInput}
              onChange={setCajaExentoInput}
            />
            <NumInput
              label="Neto Gravado Total (N)"
              value={cajaNetoInput}
              onChange={setCajaNetoInput}
            />
            <NumInput
              label="Total Cobrado por Caja (T)"
              value={cajaTotalInput}
              onChange={setCajaTotalInput}
            />
          </div>

          {/* Error */}
          {cajaError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{cajaError}</p>
            </div>
          )}

          {/* Sugerencia de auto-correcciÃ³n */}
          {suggestion.show && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">{suggestion.message}</p>
              </div>
              <div className="text-sm text-amber-700 mb-3 ml-6">
                <p>
                  Sugerencia: Mover <strong>{FMT(suggestion.suggestedExento - suggestion.originalExento)}</strong> de
                  Neto a Exento.
                </p>
                <p className="mt-1">
                  Exento: {FMT(suggestion.originalExento)} â†’ <strong>{FMT(suggestion.suggestedExento)}</strong>
                  {' | '}
                  Neto: {FMT(suggestion.originalNeto)} â†’ <strong>{FMT(suggestion.suggestedNeto)}</strong>
                </p>
              </div>
              <div className="flex gap-2 ml-6">
                <button
                  type="button"
                  onClick={handleApplySuggestion}
                  className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
                >
                  âœ“ Aplicar
                </button>
                <button
                  type="button"
                  onClick={dismissSuggestion}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )}

          {/* Valores calculados */}
          {(NUM(cajaNetoInput) > 0 || NUM(cajaExentoInput) > 0) && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                Desglose calculado
              </p>
              <CalcValue label="Exento" value={cajaValues.exento} />
              {cajaValues.neto105 > 0 && (
                <>
                  <CalcValue label="Neto 10,5%" value={cajaValues.neto105} />
                  <CalcValue label="IVA 10,5%" value={cajaValues.iva105} />
                </>
              )}
              {cajaValues.neto21 > 0 && (
                <>
                  <CalcValue label="Neto 21%" value={cajaValues.neto21} />
                  <CalcValue label="IVA 21%" value={cajaValues.iva21} />
                </>
              )}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <CalcValue label="Total FacturaciÃ³n Caja" value={cajaValues.total} bold />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* â”€â”€ SecciÃ³n 4: FacturaciÃ³n por Obras Sociales â”€â”€ */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-orange-50 to-white px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-orange-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-orange-600 text-white text-xs flex items-center justify-center font-bold">
              4
            </span>
            FacturaciÃ³n por Obras Sociales
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NumInput label="Exentos" value={osExentos} onChange={setOsExentos} />
            <NumInput label="Gravados 21%" value={osGravados21} onChange={setOsGravados21} />
            <NumInput label="Gravados 10,5%" value={osGravados105} onChange={setOsGravados105} />
          </div>

          {/* Calculados */}
          {osCalc.osTotal > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Desglose</p>
              <CalcValue label="Exentos" value={osCalc.osExentos} />
              {osCalc.osGravados21 > 0 && (
                <>
                  <CalcValue label="Gravado 21%" value={osCalc.osGravados21} />
                  <CalcValue label="IVA 21%" value={osCalc.osIva21} />
                </>
              )}
              {osCalc.osGravados105 > 0 && (
                <>
                  <CalcValue label="Gravado 10,5%" value={osCalc.osGravados105} />
                  <CalcValue label="IVA 10,5%" value={osCalc.osIva105} />
                </>
              )}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <CalcValue label="Total Obras Sociales" value={osCalc.osTotal} bold />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* â”€â”€ SecciÃ³n 5: Retenciones y Total â”€â”€ */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-red-50 to-white px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-red-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center font-bold">
              5
            </span>
            Retenciones y Total
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <NumInput
            label="RetenciÃ³n por Gastos"
            value={retencionGastos}
            onChange={setRetencionGastos}
          />

          {/* Resumen final */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-5 space-y-2">
            <CalcValue label="Ingreso por Caja" value={NUM(ingresoPorCaja)} />
            <CalcValue label="FacturaciÃ³n por Caja" value={cajaValues.total} />
            <CalcValue label="FacturaciÃ³n por OS" value={osCalc.osTotal} />
            <div className="border-t border-blue-200 pt-2 mt-2">
              <CalcValue label="TOTAL LIQUIDADO" value={totales.totalLiquidado} bold />
            </div>
            <CalcValue label="(-) RetenciÃ³n por Gastos" value={NUM(retencionGastos)} />
            <div className="bg-blue-600 text-white rounded-lg p-3 flex justify-between items-center mt-2">
              <span className="font-semibold">TOTAL A ABONAR</span>
              <span className="text-xl font-bold">{FMT(totales.totalAbonar)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* â”€â”€ Botones â”€â”€ */}
      <div className="flex gap-3 justify-end pb-8">
        {isEditing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="px-5 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <X className="w-4 h-4" /> Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={handleGuardar}
          disabled={saving}
          className={`px-6 py-2.5 rounded-lg text-white flex items-center gap-2 text-sm font-medium transition-colors ${
            isEditing
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
          } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Save className="w-4 h-4" />
          {saving
            ? 'Guardando...'
            : isEditing
            ? 'Actualizar LiquidaciÃ³n'
            : 'Guardar LiquidaciÃ³n'}
        </button>
      </div>
    </div>
  );
}
