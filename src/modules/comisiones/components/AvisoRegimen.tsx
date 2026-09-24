// ============================================================
// Comisiones — el cartel de "todavía no está encendido"
// ============================================================
// El régimen nace inerte a propósito, y una pantalla vacía sin explicación
// parece un sistema roto. Este cartel dice exactamente qué falta y quién lo
// tiene que hacer, así nadie sale a buscar un bug que no existe.
// ============================================================

import React from 'react';
import { Link } from 'react-router-dom';
import { PauseCircle, Settings } from 'lucide-react';

interface Props {
  motivo: string | null;
  desde: string | null;
  /** La Dirección puede ir a arreglarlo; el resto sólo necesita entenderlo. */
  esAdmin?: boolean;
}

const AvisoRegimen: React.FC<Props> = ({ motivo, desde, esAdmin = false }) => (
  <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-5">
    <div className="flex items-start gap-3">
      <PauseCircle className="h-5 w-5 text-yellow-700 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <h3 className="font-semibold text-yellow-900">El régimen de comisiones todavía no está en marcha</h3>
        <p className="text-sm text-yellow-800 mt-1">{motivo || 'Falta configurarlo.'}</p>
        {desde && (
          <p className="text-sm text-yellow-800 mt-1">
            Vigente para presupuestos entregados desde el <strong>{desde}</strong>.
          </p>
        )}
        <p className="text-xs text-yellow-700 mt-3">
          Mientras falte algo, el sistema no devenga nada y no acumula deuda con nadie. No es un error.
        </p>
        {esAdmin && (
          <Link
            to="/comisiones/parametros"
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-yellow-900 hover:text-yellow-700"
          >
            <Settings className="h-4 w-4" />
            Ir a parametrización
          </Link>
        )}
      </div>
    </div>
  </div>
);

export default AvisoRegimen;
