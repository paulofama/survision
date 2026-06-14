// ===========================================================================
// COMPONENT: TabMinuta - MODULO CARGA DE SUELDOS (Fase 2 / 2.5)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Pestaña principal del MesDetallePage: orquesta los 4-5 bloques de minuta.
//
// Bloques renderizados:
//   - pago_sueldos          -> BloquePorEmpleado (origen recibo)
//   - horas_complementarias -> BloquePorEmpleado (origen facturado)
//   - dia_sanidad           -> BloquePorEmpleado (ocasional, con quitar-bloque)
//   - seguridad_social      -> BloqueSeguridadSocial (6 conceptos)
//   - sindicato             -> BloqueSindicato (1 concepto)
//
// Tambien muestra:
//   - Resumen agregado (total general + completos / totales)
//   - Boton "Avanzar estado" cuando el hook lo permite
//   - Boton "Agregar Dia Sanidad" (bloque ocasional)
// ===========================================================================

import React, { useState } from 'react';
import {
  PlusCircle,
  ChevronRight,
  Loader2,
  Calculator,
  CheckCircle2,
} from 'lucide-react';
import type {
  EmpleadoListado,
  EstadoLiquidacion,
  LiquidacionBloqueCompleto,
  LiquidacionLineaConceptoActualizacion,
  LiquidacionLineaConceptoNueva,
  LiquidacionLineaEmpleadoActualizacion,
  LiquidacionLineaEmpleadoNueva,
  ResultadoOperacion,
  ResumenLiquidacionMes,
  TipoBloque,
} from '../../types/sueldos';
import { BloqueSeguridadSocial } from './BloqueSeguridadSocial';
import { BloqueSindicato } from './BloqueSindicato';
import { BloquePorEmpleado } from './BloquePorEmpleado';

// ---------------------------------------------------------------------------
// HELPERS DE FORMATO
// ---------------------------------------------------------------------------

const NF_MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

// ---------------------------------------------------------------------------
// HEADER: RESUMEN DEL MES
// ---------------------------------------------------------------------------

interface HeaderResumenProps {
  resumen: ResumenLiquidacionMes;
  puedeAvanzar: boolean;
  estado: EstadoLiquidacion;
  onAvanzar: () => Promise<void>;
  onAgregarDiaSanidad?: () => Promise<void>;
  diaSanidadExiste: boolean;
  disabled?: boolean;
}

const HeaderResumen: React.FC<HeaderResumenProps> = ({
  resumen, puedeAvanzar, estado, onAvanzar, onAgregarDiaSanidad, diaSanidadExiste, disabled,
}) => {
  const [avanzando, setAvanzando] = useState(false);
  const [agregando, setAgregando] = useState(false);

  const handleAvanzar = async () => {
    setAvanzando(true);
    try { await onAvanzar(); } finally { setAvanzando(false); }
  };

  const handleAgregar = async () => {
    if (!onAgregarDiaSanidad) return;
    setAgregando(true);
    try { await onAgregarDiaSanidad(); } finally { setAgregando(false); }
  };

  const labelProximo = estado === 'VACIO' ? 'Marcar como "en carga"'
    : estado === 'MINUTA_EN_CARGA' ? 'Marcar minuta como completa'
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
      <div>
        <div className="text-xs text-gray-500 uppercase">Total calculado</div>
        <div className="text-lg font-bold text-gray-900 font-mono">
          {NF_MONEDA.format(resumen.total_general_calculado)}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Total declarado</div>
        <div className="text-lg font-bold text-gray-700 font-mono">
          {resumen.total_general_declarado > 0
            ? NF_MONEDA.format(resumen.total_general_declarado)
            : <span className="text-gray-400 italic font-normal text-sm">(sin declarar)</span>}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Bloques completos</div>
        <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
          {resumen.cantidad_bloques_completos} / {resumen.cantidad_bloques_totales}
          {resumen.cantidad_bloques_completos === resumen.cantidad_bloques_totales &&
            resumen.cantidad_bloques_totales > 0 && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {!diaSanidadExiste && onAgregarDiaSanidad && !disabled && (
          <button
            type="button"
            onClick={handleAgregar}
            disabled={agregando}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pink-700 bg-pink-50 border border-pink-200 rounded hover:bg-pink-100 disabled:opacity-50"
          >
            {agregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlusCircle className="h-3 w-3" />}
            Día Sanidad
          </button>
        )}
        {labelProximo && (
          <button
            type="button"
            onClick={handleAvanzar}
            disabled={!puedeAvanzar || avanzando || disabled}
            title={!puedeAvanzar ? 'Aún no se cumplen las condiciones' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {avanzando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            {labelProximo}
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ---------------------------------------------------------------------------

interface Props {
  /** Bloques del mes (en cualquier orden). */
  bloques: LiquidacionBloqueCompleto[];
  estado: EstadoLiquidacion;
  resumen: ResumenLiquidacionMes;
  puedeAvanzar: boolean;
  disabled?: boolean;
  /** Maestro de empleados (para los bloques por-empleado). */
  empleados: EmpleadoListado[];
  loadingEmpleados?: boolean;
  // Acciones de flujo / bloque
  onAvanzarEstado: () => Promise<void>;
  onAgregarBloqueDiaSanidad: () => Promise<void>;
  onEliminarBloqueDiaSanidad: () => Promise<ResultadoOperacion<void>>;
  onActualizarBloque: (bloqueId: string, cambios: { total_declarado?: number | null; completo?: boolean; observaciones?: string | null }) => Promise<ResultadoOperacion<unknown>>;
  // Lineas por concepto (seguridad_social, sindicato)
  onAgregarLineaConcepto: (linea: LiquidacionLineaConceptoNueva) => Promise<ResultadoOperacion<unknown>>;
  onActualizarLineaConcepto: (id: string, cambios: LiquidacionLineaConceptoActualizacion) => Promise<ResultadoOperacion<unknown>>;
  onEliminarLineaConcepto: (id: string) => Promise<ResultadoOperacion<void>>;
  // Lineas por empleado (pago_sueldos, horas_complementarias, dia_sanidad)
  onAgregarLineaEmpleado: (linea: LiquidacionLineaEmpleadoNueva) => Promise<ResultadoOperacion<unknown>>;
  onActualizarLineaEmpleado: (id: string, cambios: LiquidacionLineaEmpleadoActualizacion) => Promise<ResultadoOperacion<unknown>>;
  onEliminarLineaEmpleado: (id: string) => Promise<ResultadoOperacion<void>>;
}

const TabMinuta: React.FC<Props> = ({
  bloques, estado, resumen, puedeAvanzar, disabled, empleados, loadingEmpleados,
  onAvanzarEstado, onAgregarBloqueDiaSanidad, onEliminarBloqueDiaSanidad, onActualizarBloque,
  onAgregarLineaConcepto, onActualizarLineaConcepto, onEliminarLineaConcepto,
  onAgregarLineaEmpleado, onActualizarLineaEmpleado, onEliminarLineaEmpleado,
}) => {
  // Indexar por tipo para acceso rapido
  const porTipo = new Map<TipoBloque, LiquidacionBloqueCompleto>();
  bloques.forEach((b) => porTipo.set(b.tipo, b));

  const blqPagoSueldos = porTipo.get('pago_sueldos');
  const blqHC = porTipo.get('horas_complementarias');
  const blqDiaSanidad = porTipo.get('dia_sanidad');
  const blqSegSocial = porTipo.get('seguridad_social');
  const blqSindicato = porTipo.get('sindicato');

  return (
    <div className="space-y-4">
      {/* Header con resumen y acciones del flujo */}
      <HeaderResumen
        resumen={resumen}
        puedeAvanzar={puedeAvanzar}
        estado={estado}
        onAvanzar={onAvanzarEstado}
        onAgregarDiaSanidad={onAgregarBloqueDiaSanidad}
        diaSanidadExiste={!!blqDiaSanidad}
        disabled={disabled}
      />

      {disabled && (
        <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-700 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-gray-500" />
          El mes está cerrado. Para editar, reabrirlo desde el botón en el header.
        </div>
      )}

      {/* Bloque 1: Pago de Sueldos (por empleado) */}
      {blqPagoSueldos && (
        <BloquePorEmpleado
          tipo="pago_sueldos"
          bloque={blqPagoSueldos}
          empleados={empleados}
          loadingEmpleados={loadingEmpleados}
          disabled={disabled}
          onAgregarLinea={onAgregarLineaEmpleado}
          onActualizarLinea={onActualizarLineaEmpleado}
          onEliminarLinea={onEliminarLineaEmpleado}
          onActualizarBloque={onActualizarBloque}
        />
      )}

      {/* Bloque 2: Horas Complementarias (por empleado, origen facturado) */}
      {blqHC && (
        <BloquePorEmpleado
          tipo="horas_complementarias"
          bloque={blqHC}
          empleados={empleados}
          loadingEmpleados={loadingEmpleados}
          disabled={disabled}
          onAgregarLinea={onAgregarLineaEmpleado}
          onActualizarLinea={onActualizarLineaEmpleado}
          onEliminarLinea={onEliminarLineaEmpleado}
          onActualizarBloque={onActualizarBloque}
        />
      )}

      {/* Bloque 3 (ocasional): Día de la Sanidad */}
      {blqDiaSanidad && (
        <BloquePorEmpleado
          tipo="dia_sanidad"
          bloque={blqDiaSanidad}
          empleados={empleados}
          loadingEmpleados={loadingEmpleados}
          disabled={disabled}
          onAgregarLinea={onAgregarLineaEmpleado}
          onActualizarLinea={onActualizarLineaEmpleado}
          onEliminarLinea={onEliminarLineaEmpleado}
          onActualizarBloque={onActualizarBloque}
          onEliminarBloque={onEliminarBloqueDiaSanidad}
        />
      )}

      {/* Bloque 4: Seguridad Social (por concepto) */}
      {blqSegSocial && (
        <BloqueSeguridadSocial
          bloque={blqSegSocial}
          disabled={disabled}
          onAgregarLinea={onAgregarLineaConcepto}
          onActualizarLinea={onActualizarLineaConcepto}
          onEliminarLinea={onEliminarLineaConcepto}
          onActualizarBloque={onActualizarBloque}
        />
      )}

      {/* Bloque 5: Sindicato (por concepto) */}
      {blqSindicato && (
        <BloqueSindicato
          bloque={blqSindicato}
          disabled={disabled}
          onAgregarLinea={onAgregarLineaConcepto}
          onActualizarLinea={onActualizarLineaConcepto}
          onEliminarLinea={onEliminarLineaConcepto}
          onActualizarBloque={onActualizarBloque}
        />
      )}
    </div>
  );
};

export default TabMinuta;
export { TabMinuta };
