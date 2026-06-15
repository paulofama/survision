// ===========================================================================
// COMPONENT: BloqueSeguridadSocial - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Bloque de la minuta con 6 conceptos canonicos de cargas sociales:
//   APORTE_SS, CONTRIB_SS, APORTE_OS, CONTRIB_OS, ART, SCVO
//
// Cada concepto se carga con su monto y la cuenta contable correspondiente
// (los pasivos 2.1.2.02.0X que se cancelan al pagar al organismo).
//
// Render: tabla con 6 filas siempre visibles. Si la fila ya existe en BD,
// se muestra su monto; al editar y blur se hace UPDATE. Si no existe, al
// guardar un monto > 0 se hace INSERT. Auto-save por fila.
// ===========================================================================

import React, { useEffect, useState } from 'react';
import { Loader2, Shield, CheckCircle2, AlertCircle, Save, Trash2 } from 'lucide-react';
import type {
  ConceptoCodigo,
  LiquidacionBloqueCompleto,
  LiquidacionLineaConceptoActualizacion,
  LiquidacionLineaConceptoNueva,
  ResultadoOperacion,
} from '../types/sueldos';
import { CUENTAS_PASIVOS_SUELDOS } from '../utils/constantes';

// ---------------------------------------------------------------------------
// TEMPLATE DE CONCEPTOS (orden fijo, ID estable)
// ---------------------------------------------------------------------------

interface ConceptoTemplate {
  codigo: ConceptoCodigo;
  nombre: string;
  cuenta: string;
  hint: string;
}

const CONCEPTOS_SS_TEMPLATE: readonly ConceptoTemplate[] = [
  { codigo: 'APORTE_SS',  nombre: 'Aporte SS (301)',          cuenta: CUENTAS_PASIVOS_SUELDOS.SS_A_PAGAR,    hint: 'Retención al empleado' },
  { codigo: 'CONTRIB_SS', nombre: 'Contribución SS (351)',    cuenta: CUENTAS_PASIVOS_SUELDOS.SS_A_PAGAR,    hint: 'Costo del empleador' },
  { codigo: 'APORTE_OS',  nombre: 'Aporte OS (302)',          cuenta: CUENTAS_PASIVOS_SUELDOS.OS_A_PAGAR,    hint: 'Retención al empleado' },
  { codigo: 'CONTRIB_OS', nombre: 'Contribución OS (352)',    cuenta: CUENTAS_PASIVOS_SUELDOS.OS_A_PAGAR,    hint: 'Costo del empleador' },
  { codigo: 'ART',        nombre: 'ART',                       cuenta: CUENTAS_PASIVOS_SUELDOS.ART_A_PAGAR,   hint: 'Cobertura riesgos del trabajo' },
  { codigo: 'SCVO',       nombre: 'SCVO (Seguro Vida Oblig.)', cuenta: CUENTAS_PASIVOS_SUELDOS.SCVO_A_PAGAR,  hint: 'Seguro de vida obligatorio' },
] as const;

// ---------------------------------------------------------------------------
// HELPERS DE FORMATO
// ---------------------------------------------------------------------------

const NF_MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

function parsearMonto(raw: string): number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  // Permitir tanto coma como punto como separador decimal
  const limpio = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

// Serializa el monto guardado (number) al string editable del input.
// CRITICO: usa coma decimal y SIN separador de miles, porque parsearMonto
// trata el punto como separador de miles. Si serializaramos con String(n)
// (que produce punto decimal, ej. "1680562.3"), el round-trip lo re-leeria
// como "16805623" e inflaria el valor x10/x100. Ver bug de conciliacion 12/2025.
function montoAInput(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '';
  return String(n).replace('.', ',');
}

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: fila editable (module scope)
// ---------------------------------------------------------------------------

interface FilaConceptoProps {
  template: ConceptoTemplate;
  lineaExistente?: { id: string; monto: number; observaciones: string | null };
  disabled?: boolean;
  onCrear: (monto: number) => Promise<ResultadoOperacion<unknown>>;
  onActualizar: (id: string, monto: number) => Promise<ResultadoOperacion<unknown>>;
  onEliminar: (id: string) => Promise<ResultadoOperacion<void>>;
}

const FilaConcepto: React.FC<FilaConceptoProps> = ({
  template, lineaExistente, disabled, onCrear, onActualizar, onEliminar,
}) => {
  const valorBD = lineaExistente?.monto ?? 0;
  const [valor, setValor] = useState<string>(
    montoAInput(lineaExistente?.monto)
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);

  // Sincronizar cuando cambia la prop desde el padre (refetch del hook)
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
      ? await onActualizar(lineaExistente.id, monto)
      : await onCrear(monto);
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
    if (!window.confirm(`¿Eliminar la línea de "${template.nombre}"?`)) return;
    setErrorMsg(null);
    setSaving(true);
    const res = await onEliminar(lineaExistente.id);
    setSaving(false);
    if (!res.ok) setErrorMsg(res.error);
  };

  return (
    <tr className={lineaExistente ? '' : 'bg-gray-50/40'}>
      <td className="px-3 py-2">
        <div className="text-sm font-medium text-gray-900">{template.nombre}</div>
        <div className="text-[11px] text-gray-500">{template.hint}</div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">
        {template.cuenta}
      </td>
      <td className="px-3 py-2">
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
              w-32 px-2 py-1 text-right text-sm font-mono
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
      </td>
      <td className="px-3 py-2 text-right text-sm text-gray-600 font-mono whitespace-nowrap">
        {lineaExistente ? NF_MONEDA.format(lineaExistente.monto) : '—'}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {hayCambios && !saving && (
            <button
              type="button"
              onClick={handleGuardar}
              disabled={disabled}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              title="Guardar cambios"
            >
              <Save className="h-3.5 w-3.5" />
            </button>
          )}
          {lineaExistente && !saving && (
            <button
              type="button"
              onClick={handleEliminar}
              disabled={disabled}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              title="Eliminar línea"
            >
              <Trash2 className="h-3.5 w-3.5" />
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

interface Props {
  bloque: LiquidacionBloqueCompleto;
  disabled?: boolean;
  onAgregarLinea: (linea: LiquidacionLineaConceptoNueva) => Promise<ResultadoOperacion<unknown>>;
  onActualizarLinea: (id: string, cambios: LiquidacionLineaConceptoActualizacion) => Promise<ResultadoOperacion<unknown>>;
  onEliminarLinea: (id: string) => Promise<ResultadoOperacion<void>>;
  onActualizarBloque: (bloqueId: string, cambios: { total_declarado?: number | null; completo?: boolean; observaciones?: string | null }) => Promise<ResultadoOperacion<unknown>>;
}

const BloqueSeguridadSocial: React.FC<Props> = ({
  bloque, disabled, onAgregarLinea, onActualizarLinea, onEliminarLinea, onActualizarBloque,
}) => {
  const lineasMap = new Map(bloque.lineas_concepto.map((l) => [l.concepto_codigo, l]));
  const totalCalculado = bloque.lineas_concepto.reduce((s, l) => s + Number(l.monto || 0), 0);
  const [totalDecl, setTotalDecl] = useState<string>(
    montoAInput(bloque.total_declarado)
  );
  const [savingTotal, setSavingTotal] = useState(false);
  const [savingCompleto, setSavingCompleto] = useState(false);

  useEffect(() => {
    setTotalDecl(montoAInput(bloque.total_declarado));
  }, [bloque.total_declarado]);

  const diferencia = bloque.total_declarado != null
    ? totalCalculado - Number(bloque.total_declarado)
    : null;
  const cuadra = diferencia !== null && Math.abs(diferencia) < 1;

  const handleSaveTotal = async () => {
    const n = parsearMonto(totalDecl);
    const nuevo = n !== null && n >= 0 ? n : null;
    if (nuevo === bloque.total_declarado) return;
    setSavingTotal(true);
    await onActualizarBloque(bloque.id, { total_declarado: nuevo });
    setSavingTotal(false);
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
          <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Seguridad Social</h3>
            <p className="text-xs text-gray-500">6 conceptos canónicos (contra Banco Santander Río)</p>
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

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Concepto</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Monto</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Guardado</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {CONCEPTOS_SS_TEMPLATE.map((tmpl) => {
              const linea = lineasMap.get(tmpl.codigo);
              return (
                <FilaConcepto
                  key={tmpl.codigo}
                  template={tmpl}
                  lineaExistente={linea ? { id: linea.id, monto: Number(linea.monto), observaciones: linea.observaciones } : undefined}
                  disabled={disabled}
                  onCrear={(monto) => onAgregarLinea({
                    bloque_id: bloque.id,
                    concepto_codigo: tmpl.codigo,
                    concepto_nombre: tmpl.nombre,
                    cuenta_contable: tmpl.cuenta,
                    monto,
                    origen: 'recibo',
                  })}
                  onActualizar={(id, monto) => onActualizarLinea(id, { monto })}
                  onEliminar={onEliminarLinea}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: totales y cuadre */}
      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500 uppercase">Total calculado</div>
          <div className="font-mono font-semibold text-gray-900">{NF_MONEDA.format(totalCalculado)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Total declarado</div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 text-xs">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={totalDecl}
              onChange={(e) => setTotalDecl(e.target.value)}
              onBlur={handleSaveTotal}
              disabled={disabled || savingTotal}
              placeholder="(opcional)"
              className="w-32 px-2 py-1 text-right text-sm font-mono border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
            />
            {savingTotal && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Diferencia</div>
          {diferencia === null ? (
            <div className="text-gray-400 text-sm italic">—</div>
          ) : (
            <div className={`font-mono font-semibold ${cuadra ? 'text-green-700' : 'text-red-700'}`}>
              {diferencia >= 0 ? '+' : ''}{NF_MONEDA.format(diferencia)}
              {cuadra && <CheckCircle2 className="inline h-4 w-4 ml-1" />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default BloqueSeguridadSocial;
export { BloqueSeguridadSocial };
