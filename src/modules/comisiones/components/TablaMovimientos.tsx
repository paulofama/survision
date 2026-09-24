// ============================================================
// Comisiones — el detalle de los movimientos
// ============================================================
// Una comisión sin su origen es un número que nadie puede discutir. Cada fila
// dice de qué presupuesto salió, con qué rol se cobró, sobre qué base y con
// qué tasa; y si fue por recupero, qué llamada lo justificó.
// ============================================================

import React from 'react';
import { ArrowDownLeft, PhoneCall, Users, UserCheck } from 'lucide-react';
import { fmtARS, fmtPct, type MovimientoComision } from '../hooks/useComisiones';

const ROL_ESTILO: Record<string, { label: string; clase: string; Icono: React.ElementType }> = {
  ENTREGADOR: { label: 'Entregó', clase: 'bg-blue-50 text-blue-700 border-blue-200', Icono: UserCheck },
  PARTICIPANTE: { label: 'Participó', clase: 'bg-gray-50 text-gray-700 border-gray-200', Icono: Users },
  RECUPERADOR: { label: 'Recuperó', clase: 'bg-green-50 text-green-700 border-green-200', Icono: PhoneCall },
};

/** La evidencia del recupero, en castellano. */
const explicarEvidencia = (e: Record<string, unknown> | null): string | null => {
  if (!e) return null;
  if (typeof e.revierte_movimiento === 'string') return 'Revierte un devengo anterior';
  if (typeof e.contacto_efectivo === 'string') {
    const d = typeof e.dias_desde_entrega === 'number' ? e.dias_desde_entrega : null;
    const h = typeof e.dias_hasta_practica === 'number' ? e.dias_hasta_practica : null;
    const partes = [`Contacto efectivo el ${e.contacto_efectivo}`];
    if (d !== null) partes.push(`${d} días después de la entrega`);
    if (h !== null) partes.push(`se operó ${h} días más tarde`);
    return partes.join(' · ');
  }
  return null;
};

interface Props {
  movimientos: MovimientoComision[];
  /** En el panel de la Dirección importa quién cobra; en el propio, no. */
  mostrarBeneficiario?: boolean;
  nombres?: Record<string, string>;
}

const TablaMovimientos: React.FC<Props> = ({ movimientos, mostrarBeneficiario = false, nombres = {} }) => {
  if (movimientos.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">Sin movimientos en este período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-3 font-medium">Fecha</th>
            {mostrarBeneficiario && <th className="py-2 pr-3 font-medium">Cobra</th>}
            <th className="py-2 pr-3 font-medium">Presupuesto</th>
            <th className="py-2 pr-3 font-medium">Rol</th>
            <th className="py-2 pr-3 font-medium text-right">Base</th>
            <th className="py-2 pr-3 font-medium text-right">Tasa</th>
            <th className="py-2 pr-3 font-medium text-right">Parte</th>
            <th className="py-2 pl-3 font-medium text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => {
            const rol = ROL_ESTILO[m.rol] ?? { label: m.rol, clase: 'bg-gray-50 text-gray-700 border-gray-200', Icono: Users };
            const evidencia = explicarEvidencia(m.evidencia);
            const esReverso = m.tipo !== 'DEVENGO';
            return (
              <tr key={m.id} className={`border-b border-gray-100 align-top ${esReverso ? 'bg-red-50/40' : ''}`}>
                <td className="py-2.5 pr-3 whitespace-nowrap text-gray-600">{m.fecha_devengo}</td>
                {mostrarBeneficiario && (
                  <td className="py-2.5 pr-3 text-gray-900">{nombres[m.beneficiario] || m.beneficiario}</td>
                )}
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-gray-900">{m.presupuesto?.numero_presupuesto || '—'}</div>
                  {m.presupuesto && (
                    <div className="text-xs text-gray-500">
                      {m.presupuesto.paciente_apellido}, {m.presupuesto.paciente_nombre}
                    </div>
                  )}
                  {evidencia && <div className="text-xs text-green-700 mt-0.5">{evidencia}</div>}
                  {m.motivo && <div className="text-xs text-red-700 mt-0.5">{m.motivo}</div>}
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs ${rol.clase}`}>
                    <rol.Icono className="h-3 w-3" />
                    {rol.label}
                  </span>
                  {esReverso && (
                    <span className="inline-flex items-center gap-1 ml-1 border border-red-200 bg-red-50 text-red-700 rounded-full px-2 py-0.5 text-xs">
                      <ArrowDownLeft className="h-3 w-3" />
                      {m.tipo === 'REVERSO' ? 'Reverso' : 'Ajuste'}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right text-gray-600 whitespace-nowrap">{fmtARS(m.base_comisionable)}</td>
                <td className="py-2.5 pr-3 text-right text-gray-600 whitespace-nowrap">{fmtPct(m.tasa_aplicada)}</td>
                <td className="py-2.5 pr-3 text-right text-gray-600 whitespace-nowrap">{fmtPct(m.pct_reparto)}</td>
                <td className={`py-2.5 pl-3 text-right font-semibold whitespace-nowrap ${m.importe < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {fmtARS(m.importe)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TablaMovimientos;
