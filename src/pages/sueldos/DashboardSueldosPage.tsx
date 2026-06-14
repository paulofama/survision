// ===========================================================================
// PAGE: DashboardSueldosPage - MODULO CARGA DE SUELDOS (Fase 2)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Vista principal del modulo. Combina:
//  - Selector de anio + grilla anual con estado de cada mes (12 cards)
//  - KPIs del anio: meses iniciados / en carga / cerrados / sin iniciar
//  - Atajos: ir al mes actual, gestion de empleados, refrescar
//
// El click en cualquier mes navega a /sueldos/mes/:anio/:mes.
// Se accede como ruta raiz del modulo: /sueldos
// ===========================================================================

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins,
  Users,
  RefreshCw,
  Loader2,
  AlertCircle,
  Calendar,
  CheckCircle,
  PenLine,
  PauseCircle,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useLiquidacionesAnio } from '../../hooks/useLiquidacionesAnio';
import { GridAnualMeses } from '../../components/sueldos/GridAnualMeses';

// ---------------------------------------------------------------------------
// HELPERS DE FORMATO (module scope)
// ---------------------------------------------------------------------------

const NF_INT = new Intl.NumberFormat('es-AR');

// ---------------------------------------------------------------------------
// SUBCOMPONENTE: tarjeta KPI (module scope)
// ---------------------------------------------------------------------------

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
}

const TONES: Record<KpiCardProps['tone'], { bg: string; text: string; iconBg: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   iconBg: 'bg-blue-100'   },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  iconBg: 'bg-green-100'  },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', iconBg: 'bg-yellow-100' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    iconBg: 'bg-red-100'    },
  gray:   { bg: 'bg-gray-50',   text: 'text-gray-700',   iconBg: 'bg-gray-100'   },
};

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon, tone }) => {
  const t = TONES[tone];
  return (
    <div className={`${t.bg} rounded-xl border border-gray-200 p-4 flex items-center gap-3`}>
      <div className={`${t.iconBg} ${t.text} p-2 rounded-lg`}>{icon}</div>
      <div>
        <div className="text-xs text-gray-600 uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold ${t.text}`}>{NF_INT.format(value)}</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PAGINA
// ---------------------------------------------------------------------------

const DashboardSueldosPage: React.FC = () => {
  const navigate = useNavigate();
  const hoy = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState<number>(hoy.getFullYear());

  const { liquidaciones, loading, error, refetch, estadisticas } =
    useLiquidacionesAnio(anio);

  const esAnioActual = anio === hoy.getFullYear();
  const mesActual = esAnioActual ? hoy.getMonth() + 1 : undefined;

  const handleIrMesActual = () => {
    navigate(`/sueldos/mes/${hoy.getFullYear()}/${hoy.getMonth() + 1}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Coins className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sueldos</h1>
            <p className="text-gray-500">
              Carga de minuta mensual, conciliación con F.931 y propuesta de asiento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Refrescar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
          <button
            type="button"
            onClick={() => navigate('/sueldos/empleados')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Empleados
          </button>
          <button
            type="button"
            onClick={handleIrMesActual}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Calendar className="h-4 w-4" />
            Mes actual
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mensaje de error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* KPIs del año */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Iniciados"
          value={estadisticas.iniciados}
          icon={<Calendar className="h-5 w-5" />}
          tone="blue"
        />
        <KpiCard
          label="En carga"
          value={estadisticas.enCarga}
          icon={<PenLine className="h-5 w-5" />}
          tone="yellow"
        />
        <KpiCard
          label="Minuta completa"
          value={estadisticas.conMinutaCompleta}
          icon={<CheckCircle className="h-5 w-5" />}
          tone="green"
        />
        <KpiCard
          label="Cerrados"
          value={estadisticas.cerrados}
          icon={<Lock className="h-5 w-5" />}
          tone="gray"
        />
        <KpiCard
          label="Sin iniciar"
          value={estadisticas.sinIniciar}
          icon={<PauseCircle className="h-5 w-5" />}
          tone="red"
        />
      </div>

      {/* Grilla anual */}
      {loading && liquidaciones.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <GridAnualMeses
          anio={anio}
          onAnioChange={setAnio}
          liquidaciones={liquidaciones}
          mesActual={mesActual}
        />
      )}

      {/* Footer informativo */}
      <div className="text-xs text-gray-500 text-center pt-2">
        Click en un mes para abrir su pantalla de detalle (carga de minuta,
        F.931, conciliación y propuesta de asiento).
      </div>
    </div>
  );
};

export default DashboardSueldosPage;
