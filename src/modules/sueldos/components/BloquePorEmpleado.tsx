// ===========================================================================
// COMPONENT: BloquePorEmpleado - MODULO CARGA DE SUELDOS (Fase 2.5)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Bloque de minuta con lineas POR EMPLEADO. Reutilizable para los 3 tipos:
//   - pago_sueldos          (origen: recibo,   contra Banco)
//   - horas_complementarias (origen: facturado, contra Caja)
//   - dia_sanidad           (origen: recibo,   contra Caja, ocasional)
//
// Render: empleados activos agrupados por area, una fila por empleado con su
// monto neto. Auto-save por fila (INSERT si no existe, UPDATE si cambia,
// DELETE si se vacia). Guarda snapshot de area + cuenta contable al crear.
//
// Anti-patron evitado: FilaEmpleado esta en module scope (no dentro del body
// del padre) para no romper el focus de los inputs en cada render.
// ===========================================================================

import React, { useEffect, useState } from 'react';
import {
  Banknote,
  Clock,
  Heart,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
  UserX,
} from 'lucide-react';
import type {
  AreaEmpleado,
  EmpleadoListado,
  LiquidacionBloqueCompleto,
  LiquidacionLineaEmpleado,
  LiquidacionLineaEmpleadoActualizacion,
  LiquidacionLineaEmpleadoNueva,
  OrigenLinea,
  ResultadoOperacion,
} from '../types/sueldos';
import { AREAS_EMPLEADO } from '../types/sueldos';
import { COLORES_AREA } from '../utils/constantes';

// ---------------------------------------------------------------------------
// TIPOS LOCALES
// ---------------------------------------------------------------------------

type TipoBloquePorEmpleado = 'pago_sueldos' | 'horas_complementarias' | 'dia_sanidad';

interface ConfigBloque {
  titulo: string;
  sub: string;
  icon: React.ReactNode;
  origen: OrigenLinea;
  /** Clases del icono del header (fondo + texto). */
  accent: string;
}

const CONFIG: Record<TipoBloquePorEmpleado, ConfigBloque> = {
  pago_sueldos: {
    titulo: 'Pago de Sueldos',
    sub: 'Neto por empleado (origen: recibo), contra Banco Santander Río',
    icon: <Banknote className="h-5 w-5" />,
    origen: 'recibo',
    accent: 'bg-emerald-50 text-emerald-700',
  },
  horas_complementarias: {
    titulo: 'Horas Complementarias',
    sub: 'Por empleado (origen: facturado), contra Caja',
    icon: <Clock className="h-5 w-5" />,
    origen: 'facturado',
    accent: 'bg-sky-50 text-sky-700',
  },
  dia_sanidad: {
    titulo: 'Día de la Sanidad',
    sub: 'Por empleado (origen: recibo), contra Caja — bloque ocasional',
    icon: <Heart className="h-5 w-5" />,
    origen: 'recibo',
    accent: 'bg-pink-50 text-pink-700',
  },
};

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
  // Formato es-AR: punto = miles, coma = decimal.
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
// SUBCOMPONENTE: fila editable por empleado (module scope)
// ---------------------------------------------------------------------------

interface FilaEmpleadoProps {
  empleado: EmpleadoListado;
  linea?: LiquidacionLineaEmpleado;
  disabled?: boolean;
  onCrear: (monto: number) => Promise<ResultadoOperacion<unknown>>;
  onActualizar: (id: string, monto: number) => Promise<ResultadoOperacion<unknown>>;
  onEliminar: (id: string) => Promise<ResultadoOperacion<void>>;
}

const FilaEmpleado: React.FC<FilaEmpleadoProps> = ({
  empleado, linea, disabled, onCrear, onActualizar, onEliminar,
}) => {
  const valorBD = linea ? Number(linea.monto_neto_cargado) : 0;
  const [valor, setValor] = useState<string>(montoAInput(linea?.monto_neto_cargado));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);

  useEffect(() => {
    setValor(montoAInput(linea?.monto_neto_cargado));
  }, [linea?.id, linea?.monto_neto_cargado]);

  const hayCambios = (() => {
    const n = parsearMonto(valor);
    if (n === null) return !!linea; // vaciar una linea existente es un cambio
    return Math.abs(n - valorBD) > 0.001;
  })();

  const esBaja = empleado.estado === 'inactivo';

  const handleGuardar = async () => {
    setErrorMsg(null);
    const monto = parsearMonto(valor);
    if (monto !== null && monto < 0) {
      setErrorMsg('No puede ser negativo');
      return;
    }
    setSaving(true);
    let res: ResultadoOperacion<unknown>;
    if (monto === null || monto === 0) {
      if (!linea) { setSaving(false); return; }
      res = await onEliminar(linea.id);
    } else if (linea) {
      res = await onActualizar(linea.id, monto);
    } else {
      res = await onCrear(monto);
    }
    setSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error);
    } else {
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 1200);
    }
  };

  return (
    <tr className={linea ? '' : 'bg-gray-50/30'}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-900">
            {empleado.apellido} {empleado.nombre}
          </span>
          {esBaja && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded">
              <UserX className="h-3 w-3" />
              Baja
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">
        {linea?.cuenta_contable_snapshot ?? empleado.cuenta_contable}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => { if (hayCambios) handleGuardar(); }}
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
        {linea ? NF_MONEDA.format(Number(linea.monto_neto_cargado)) : '—'}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {hayCambios && !saving && (
            <button
              type="button"
              onClick={handleGuardar}
              disabled={disabled}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              title="Guardar"
            >
              <Save className="h-3.5 w-3.5" />
            </button>
          )}
          {linea && !saving && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`¿Quitar el monto de ${empleado.apellido} ${empleado.nombre}?`)) return;
                setSaving(true);
                const res = await onEliminar(linea.id);
                setSaving(false);
                if (!res.ok) setErrorMsg(res.error);
              }}
              disabled={disabled}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              title="Quitar línea"
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
  tipo: TipoBloquePorEmpleado;
  empleados: EmpleadoListado[];
  loadingEmpleados?: boolean;
  disabled?: boolean;
  onAgregarLinea: (linea: LiquidacionLineaEmpleadoNueva) => Promise<ResultadoOperacion<unknown>>;
  onActualizarLinea: (id: string, cambios: LiquidacionLineaEmpleadoActualizacion) => Promise<ResultadoOperacion<unknown>>;
  onEliminarLinea: (id: string) => Promise<ResultadoOperacion<void>>;
  onActualizarBloque: (bloqueId: string, cambios: { total_declarado?: number | null; completo?: boolean; observaciones?: string | null }) => Promise<ResultadoOperacion<unknown>>;
  /** Solo para dia_sanidad: permite quitar el bloque ocasional entero. */
  onEliminarBloque?: () => Promise<ResultadoOperacion<void>>;
}

const BloquePorEmpleado: React.FC<Props> = ({
  bloque, tipo, empleados, loadingEmpleados, disabled,
  onAgregarLinea, onActualizarLinea, onEliminarLinea, onActualizarBloque, onEliminarBloque,
}) => {
  const cfg = CONFIG[tipo];

  // Indexar lineas por empleado.
  const lineaPorEmp = new Map(bloque.lineas_empleado.map((l) => [l.empleado_id, l]));
  const idsConLinea = new Set(bloque.lineas_empleado.map((l) => l.empleado_id));

  // Filas visibles: empleados activos + cualquiera (inactivo) que tenga linea cargada.
  const visibles = empleados.filter((e) => e.estado === 'activo' || idsConLinea.has(e.id));

  // Agrupar por area.
  const porArea = new Map<AreaEmpleado, EmpleadoListado[]>();
  for (const e of visibles) {
    const arr = porArea.get(e.area);
    if (arr) arr.push(e);
    else porArea.set(e.area, [e]);
  }
  const areasOrdenadas = AREAS_EMPLEADO.filter((a) => porArea.has(a));

  const totalCalculado = bloque.lineas_empleado.reduce(
    (s, l) => s + Number(l.monto_neto_cargado || 0), 0
  );

  const subtotalArea = (area: AreaEmpleado): number =>
    (porArea.get(area) ?? []).reduce((s, e) => {
      const l = lineaPorEmp.get(e.id);
      return s + (l ? Number(l.monto_neto_cargado) : 0);
    }, 0);

  // ----- Total declarado (cuadre) -----
  const [totalDecl, setTotalDecl] = useState<string>(montoAInput(bloque.total_declarado));
  const [savingTotal, setSavingTotal] = useState(false);
  const [savingCompleto, setSavingCompleto] = useState(false);
  const [eliminandoBloque, setEliminandoBloque] = useState(false);
  const [errorBloque, setErrorBloque] = useState<string | null>(null);

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

  const handleEliminarBloque = async () => {
    if (!onEliminarBloque) return;
    if (!window.confirm('¿Quitar el bloque Día de la Sanidad y todas sus líneas?')) return;
    setEliminandoBloque(true);
    setErrorBloque(null);
    const res = await onEliminarBloque();
    setEliminandoBloque(false);
    if (!res.ok) setErrorBloque(res.error);
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${cfg.accent}`}>{cfg.icon}</div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{cfg.titulo}</h3>
            <p className="text-xs text-gray-500">{cfg.sub}</p>
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
          {onEliminarBloque && (
            <button
              type="button"
              onClick={handleEliminarBloque}
              disabled={disabled || eliminandoBloque}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
            >
              {eliminandoBloque ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Quitar bloque
            </button>
          )}
        </div>
      </div>

      {errorBloque && (
        <div className="px-5 py-2 bg-red-50 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {errorBloque}
        </div>
      )}

      {/* Cuerpo */}
      {loadingEmpleados ? (
        <div className="p-8 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visibles.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">
          No hay empleados activos. Cargá el maestro en{' '}
          <a href="/sueldos/empleados" className="text-blue-600 hover:underline font-medium">
            Empleados
          </a>.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Empleado</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Monto neto</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Guardado</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {areasOrdenadas.map((area) => {
                const color = COLORES_AREA[area];
                return (
                  <React.Fragment key={area}>
                    <tr className={color.bg}>
                      <td colSpan={3} className={`px-3 py-1.5 text-xs font-semibold uppercase ${color.text}`}>
                        Área {area}
                      </td>
                      <td colSpan={2} className={`px-3 py-1.5 text-right text-xs font-mono font-semibold ${color.text}`}>
                        {NF_MONEDA.format(subtotalArea(area))}
                      </td>
                    </tr>
                    {porArea.get(area)!.map((emp) => (
                      <FilaEmpleado
                        key={emp.id}
                        empleado={emp}
                        linea={lineaPorEmp.get(emp.id)}
                        disabled={disabled}
                        onCrear={(monto) => onAgregarLinea({
                          bloque_id: bloque.id,
                          empleado_id: emp.id,
                          monto_neto_cargado: monto,
                          origen: cfg.origen,
                          area_snapshot: emp.area,
                          cuenta_contable_snapshot: emp.cuenta_contable,
                        })}
                        onActualizar={(id, monto) => onActualizarLinea(id, { monto_neto_cargado: monto })}
                        onEliminar={onEliminarLinea}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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

export default BloquePorEmpleado;
export { BloquePorEmpleado };
