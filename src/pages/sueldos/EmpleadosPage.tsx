// ===========================================================================
// PAGE: EmpleadosPage - MODULO CARGA DE SUELDOS
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Listado del maestro de empleados con:
//  - Barra de filtros: busqueda (apellido/nombre/CUIL/doc), area, estado
//  - Tarjetas de estadisticas (total, activos, bajas, altas y bajas del anio)
//  - Tabla con badge de area, indicador de "alta/baja reciente" y antiguedad
//  - Acciones por fila: editar (navega al form) y dar de baja / reactivar
//  - Modal pequeno para confirmar baja con fecha de egreso
//
// Rutas asociadas (definidas en App.tsx):
//   /sueldos/empleados            -> esta pagina
//   /sueldos/empleados/nuevo      -> EmpleadoFormPage
//   /sueldos/empleados/:id        -> EmpleadoFormPage (edicion)
// ===========================================================================

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  Edit2,
  UserMinus,
  UserCheck,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Calendar,
  TrendingUp,
  TrendingDown,
  Briefcase,
} from 'lucide-react';
import { useEmpleados } from '../../hooks/useEmpleados';
import {
  AREAS_EMPLEADO,
  type AreaEmpleado,
  type EmpleadoListado,
  type EstadoEmpleado,
  type FiltrosEmpleados,
} from '../../types/sueldos';
import {
  badgeAreaClassName,
  LABEL_ESTADO_EMPLEADO,
} from '../../utils/sueldos/constantes';

// ---------------------------------------------------------------------------
// HELPERS DE FORMATO (module scope para evitar re-creacion)
// ---------------------------------------------------------------------------

const NF_INT = new Intl.NumberFormat('es-AR');

function formatearFecha(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatearAntiguedad(meses: number): string {
  if (meses <= 0) return 'Menos de 1 mes';
  const anios = Math.floor(meses / 12);
  const m = meses % 12;
  if (anios === 0) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  if (m === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  return `${anios} ${anios === 1 ? 'año' : 'años'} ${m} ${m === 1 ? 'mes' : 'meses'}`;
}

function fechaHoyIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// SUBCOMPONENTES (module scope: evita unmount/remount en cada render del padre)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
}

const TONES: Record<StatCardProps['tone'], { bg: string; text: string; iconBg: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-100' },
  green: { bg: 'bg-green-50', text: 'text-green-700', iconBg: 'bg-green-100' },
  red: { bg: 'bg-red-50', text: 'text-red-700', iconBg: 'bg-red-100' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', iconBg: 'bg-yellow-100' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-700', iconBg: 'bg-gray-100' },
};

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, tone }) => {
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

interface BajaModalProps {
  empleado: EmpleadoListado | null;
  onClose: () => void;
  onConfirm: (id: string, fechaEgreso: string) => Promise<void>;
  saving: boolean;
}

const BajaModal: React.FC<BajaModalProps> = ({ empleado, onClose, onConfirm, saving }) => {
  const [fecha, setFecha] = useState<string>(fechaHoyIso());

  useEffect(() => {
    if (empleado) setFecha(fechaHoyIso());
  }, [empleado]);

  if (!empleado) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <UserMinus className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Dar de baja</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700">
            ¿Confirmás dar de baja a{' '}
            <span className="font-semibold">
              {empleado.apellido}, {empleado.nombre}
            </span>
            ?
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de egreso
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving}
            />
            <p className="text-xs text-gray-500 mt-1">
              El empleado se mantendrá en el sistema (soft delete). Podés reactivarlo más tarde.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(empleado.id, fecha)}
            disabled={saving || !fecha}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar baja
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PAGINA
// ---------------------------------------------------------------------------

const EmpleadosPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    empleados,
    loading,
    error,
    refetch,
    filtrar,
    darDeBaja,
    reactivar,
    estadisticas,
  } = useEmpleados();

  const [busqueda, setBusqueda] = useState('');
  const [area, setArea] = useState<AreaEmpleado | 'TODAS'>('TODAS');
  const [estado, setEstado] = useState<EstadoEmpleado | 'TODOS'>('activo');

  const [bajaTarget, setBajaTarget] = useState<EmpleadoListado | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtros = useMemo<FiltrosEmpleados>(
    () => ({ busqueda, area, estado }),
    [busqueda, area, estado]
  );

  const listado = useMemo(() => filtrar(filtros), [filtrar, filtros]);

  // ---- Mensajes flash autoexpirantes ---------------------------------------

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 6000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  // ---- Handlers ------------------------------------------------------------

  const handleNuevo = () => navigate('/sueldos/empleados/nuevo');
  const handleEditar = (id: string) => navigate(`/sueldos/empleados/${id}`);

  const handleConfirmBaja = async (id: string, fechaEgreso: string) => {
    setSaving(true);
    const res = await darDeBaja(id, fechaEgreso);
    setSaving(false);
    if (res.ok) {
      setSuccessMsg('Empleado dado de baja correctamente');
      setBajaTarget(null);
    } else {
      setErrorMsg(res.error);
    }
  };

  const handleReactivar = async (e: EmpleadoListado) => {
    const confirma = window.confirm(
      `¿Reactivar a ${e.apellido}, ${e.nombre}? Su estado pasará a "Activo" y se borrará la fecha de egreso.`
    );
    if (!confirma) return;
    const res = await reactivar(e.id);
    if (res.ok) {
      setSuccessMsg('Empleado reactivado correctamente');
    } else {
      setErrorMsg(res.error);
    }
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
            <p className="text-gray-500">Maestro de personal de Survisión S.A.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Refrescar listado"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
          <button
            onClick={handleNuevo}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </button>
        </div>
      </div>

      {/* Mensajes globales */}
      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{successMsg}</p>
        </div>
      )}
      {(errorMsg || error) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{errorMsg ?? error}</p>
        </div>
      )}

      {/* Estadisticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total"
          value={estadisticas.total}
          icon={<Users className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Activos"
          value={estadisticas.activos}
          icon={<UserCheck className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Bajas"
          value={estadisticas.bajas}
          icon={<UserMinus className="h-5 w-5" />}
          tone="gray"
        />
        <StatCard
          label="Altas año"
          value={estadisticas.altas_anio_actual}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Bajas año"
          value={estadisticas.bajas_anio_actual}
          icon={<TrendingDown className="h-5 w-5" />}
          tone="red"
        />
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por apellido, nombre, CUIL o documento..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as AreaEmpleado | 'TODAS')}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="TODAS">Todas las áreas</option>
            {AREAS_EMPLEADO.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoEmpleado | 'TODOS')}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="TODOS">Todos</option>
            <option value="activo">Solo activos</option>
            <option value="inactivo">Solo bajas</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading && empleados.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : listado.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {empleados.length === 0
                ? 'Todavía no hay empleados cargados.'
                : 'No hay empleados que coincidan con los filtros.'}
            </p>
            {empleados.length === 0 && (
              <button
                onClick={handleNuevo}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Crear el primero
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Empleado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    CUIL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Área
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Ingreso
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Antigüedad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {listado.map((e) => (
                  <tr
                    key={e.id}
                    className={`hover:bg-gray-50 ${
                      e.estado === 'inactivo' ? 'bg-gray-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-medium ${
                            e.estado === 'inactivo'
                              ? 'text-gray-500 line-through decoration-gray-400'
                              : 'text-gray-900'
                          }`}
                        >
                          {e.apellido}, {e.nombre}
                        </span>
                        {e.es_alta_reciente && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800 border border-green-200 rounded-md">
                            <TrendingUp className="h-3 w-3" />
                            Alta reciente
                          </span>
                        )}
                        {e.es_baja_reciente && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 border border-red-200 rounded-md">
                            <TrendingDown className="h-3 w-3" />
                            Baja reciente
                          </span>
                        )}
                      </div>
                      {e.categoria && (
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {e.categoria}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                      {e.cuil}
                    </td>
                    <td className="px-4 py-3">
                      <span className={badgeAreaClassName(e.area)}>{e.area}</span>
                      <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                        {e.cuenta_contable}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        {formatearFecha(e.fecha_ingreso)}
                      </div>
                      {e.fecha_egreso && (
                        <div className="text-xs text-red-600 mt-0.5">
                          Egreso: {formatearFecha(e.fecha_egreso)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatearAntiguedad(e.meses_antiguedad)}
                    </td>
                    <td className="px-4 py-3">
                      {e.estado === 'activo' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-md">
                          <UserCheck className="h-3 w-3" />
                          {LABEL_ESTADO_EMPLEADO.activo}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-md">
                          <UserMinus className="h-3 w-3" />
                          {LABEL_ESTADO_EMPLEADO.inactivo}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEditar(e.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {e.estado === 'activo' ? (
                          <button
                            onClick={() => setBajaTarget(e)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Dar de baja"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivar(e)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                            title="Reactivar"
                          >
                            <UserCheck className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer con cuenta */}
        {listado.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
            Mostrando <span className="font-semibold">{listado.length}</span> de{' '}
            <span className="font-semibold">{empleados.length}</span> empleados
          </div>
        )}
      </div>

      {/* Modal baja */}
      <BajaModal
        empleado={bajaTarget}
        onClose={() => setBajaTarget(null)}
        onConfirm={handleConfirmBaja}
        saving={saving}
      />
    </div>
  );
};

export default EmpleadosPage;
