// ============================================
// PAGE: SeguimientoPacientesPage
// Informe Mensual de Seguimiento Clínico
// Instituto Dr. Mercado
// ============================================

import { useState, useMemo } from 'react';
import {
  Activity,
  Users,
  Stethoscope,
  Eye,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Calendar,
  RefreshCw,
  Shield,
  UserCheck,
  Clock,
  Syringe,
  BarChart3,
  PieChart,
  Filter,
} from 'lucide-react';
import { useSeguimientoPacientes } from '../hooks/useSeguimientoPacientes';
import type {
  Alerta,
  PacienteQuirurgico,
  Hiperfrecuentador,
} from '../hooks/useSeguimientoPacientes';

// ============================================
// HELPERS
// ============================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function cleanName(raw: string): string {
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .join(', ');
}

function classBadge(clasificacion: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    QUIRURGICO: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Quirúrgico' },
    INTRAVITREA_CRONICA: { bg: 'bg-violet-100', text: 'text-violet-800', label: 'Intravítrea' },
    NO_QUIRURGICO: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'No Quirúrgico' },
    CON_ESTUDIO: { bg: 'bg-cyan-100', text: 'text-cyan-800', label: 'Con Estudio' },
    SOLO_CONSULTA: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Solo Consulta' },
  };
  const c = map[clasificacion] || map.SOLO_CONSULTA;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

// --- KPI Card ---
function KpiCard({
  icon: Icon,
  label,
  value,
  prev,
  variacion,
  color,
}: {
  icon: any;
  label: string;
  value: number;
  prev: number;
  variacion: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    emerald: 'from-emerald-500 to-emerald-600',
    violet: 'from-violet-500 to-violet-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
    cyan: 'from-cyan-500 to-cyan-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${colorMap[color] || colorMap.blue}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {variacion !== 0 && (
          <div
            className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
              variacion > 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {variacion > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {Math.abs(variacion).toFixed(1)}%
          </div>
        )}
        {variacion === 0 && (
          <div className="flex items-center gap-0.5 text-xs text-gray-400 px-1.5 py-0.5">
            <Minus className="w-3 h-3" />
            0%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('es-AR')}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Mes anterior: {prev.toLocaleString('es-AR')}
        </p>
      </div>
    </div>
  );
}

// --- Semáforo dot ---
function SemaforoDot({ color, size = 'md' }: { color: 'rojo' | 'amarillo' | 'verde'; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'w-2.5 h-2.5', md: 'w-3.5 h-3.5', lg: 'w-5 h-5' };
  const colorMap = {
    rojo: 'bg-red-500 shadow-red-300',
    amarillo: 'bg-amber-400 shadow-amber-200',
    verde: 'bg-emerald-500 shadow-emerald-300',
  };
  return (
    <span
      className={`inline-block rounded-full ${sizeMap[size]} ${colorMap[color]} shadow-sm`}
      title={color.charAt(0).toUpperCase() + color.slice(1)}
    />
  );
}

// --- Alert Card ---
function AlertCard({ alerta, defaultOpen = false }: { alerta: Alerta; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const iconMap = {
    critico: AlertTriangle,
    medio: AlertCircle,
    informativo: Info,
  };
  const bgMap = {
    critico: 'border-l-red-500 bg-red-50/60',
    medio: 'border-l-amber-400 bg-amber-50/60',
    informativo: 'border-l-emerald-400 bg-emerald-50/60',
  };
  const IconComp = iconMap[alerta.nivel];

  return (
    <div className={`border-l-4 rounded-r-lg ${bgMap[alerta.nivel]} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-black/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <SemaforoDot color={alerta.semaforo} size="lg" />
          <IconComp
            className={`w-5 h-5 ${
              alerta.nivel === 'critico'
                ? 'text-red-600'
                : alerta.nivel === 'medio'
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}
          />
          <div className="text-left">
            <p className="font-semibold text-sm text-gray-800">{alerta.titulo}</p>
            <p className="text-xs text-gray-500">{alerta.descripcion}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-white/80 text-gray-700 text-sm font-bold px-2.5 py-0.5 rounded-full shadow-sm">
            {alerta.cantidad}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {open && alerta.detalle.length > 0 && (
        <div className="px-3 pb-3 max-h-80 overflow-y-auto">
          <AlertDetailTable alerta={alerta} />
        </div>
      )}
    </div>
  );
}

// --- Alert Detail Tables ---
function AlertDetailTable({ alerta }: { alerta: Alerta }) {
  if (alerta.id === 'postqx-sin-control') {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-1 font-medium">Paciente</th>
            <th className="pb-1 font-medium">Edad</th>
            <th className="pb-1 font-medium">OS</th>
            <th className="pb-1 font-medium">Cirugía</th>
            <th className="pb-1 font-medium">Fecha</th>
            <th className="pb-1 font-medium">Cirujano</th>
          </tr>
        </thead>
        <tbody>
          {alerta.detalle.map((d: any, i: number) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-white/50">
              <td className="py-1.5 font-medium text-gray-800">{cleanName(d.paciente)}</td>
              <td className="py-1.5 text-gray-600">{d.edad}</td>
              <td className="py-1.5 text-gray-600">{d.obraSocial}</td>
              <td className="py-1.5 text-gray-600 max-w-[200px] truncate" title={d.cirugia}>
                {d.cirugia}
              </td>
              <td className="py-1.5 text-gray-600">{formatDate(d.fechaCirugia)}</td>
              <td className="py-1.5 text-gray-600">{d.prestadorCirugia}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (alerta.id === 'hiperfrecuentadores-no-qx') {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-1 font-medium">Paciente</th>
            <th className="pb-1 font-medium">Edad</th>
            <th className="pb-1 font-medium text-center">Visitas</th>
            <th className="pb-1 font-medium">OS</th>
            <th className="pb-1 font-medium">Prestadores</th>
          </tr>
        </thead>
        <tbody>
          {alerta.detalle.slice(0, 15).map((d: any, i: number) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-white/50">
              <td className="py-1.5 font-medium text-gray-800">{cleanName(d.paciente)}</td>
              <td className="py-1.5 text-gray-600">{d.edad}</td>
              <td className="py-1.5 text-center">
                <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                  {d.visitas}
                </span>
              </td>
              <td className="py-1.5 text-gray-600">{d.obrasSociales?.join(', ')}</td>
              <td className="py-1.5 text-gray-600">{d.prestadores?.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (alerta.id === 'reconsultas-tempranas') {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-1 font-medium">Paciente</th>
            <th className="pb-1 font-medium">Edad</th>
            <th className="pb-1 font-medium text-center">Días</th>
            <th className="pb-1 font-medium">Reconsulta</th>
            <th className="pb-1 font-medium">Práctica</th>
            <th className="pb-1 font-medium">Prestador</th>
          </tr>
        </thead>
        <tbody>
          {alerta.detalle.slice(0, 20).map((d: any, i: number) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-white/50">
              <td className="py-1.5 font-medium text-gray-800">{cleanName(d.paciente)}</td>
              <td className="py-1.5 text-gray-600">{d.edad}</td>
              <td className="py-1.5 text-center">
                <span
                  className={`px-1.5 py-0.5 rounded font-bold ${
                    d.diasEntre <= 2
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {d.diasEntre}d
                </span>
              </td>
              <td className="py-1.5 text-gray-600">{formatDate(d.fechaReconsulta)}</td>
              <td className="py-1.5 text-gray-600 max-w-[180px] truncate" title={d.practicaReconsulta}>
                {d.practicaReconsulta}
              </td>
              <td className="py-1.5 text-gray-600">{d.prestadorReconsulta}</td>
            </tr>
          ))}
          {alerta.detalle.length > 20 && (
            <tr>
              <td colSpan={6} className="py-2 text-center text-gray-400 italic">
                ... y {alerta.detalle.length - 20} reconsultas más
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  if (alerta.id === 'intravitreas-cronicas') {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-1 font-medium">Paciente</th>
            <th className="pb-1 font-medium">Edad</th>
            <th className="pb-1 font-medium">OS</th>
            <th className="pb-1 font-medium">Procedimiento</th>
            <th className="pb-1 font-medium">Última</th>
            <th className="pb-1 font-medium text-center">Iny. Año</th>
          </tr>
        </thead>
        <tbody>
          {alerta.detalle.map((d: any, i: number) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-white/50">
              <td className="py-1.5 font-medium text-gray-800">{cleanName(d.paciente)}</td>
              <td className="py-1.5 text-gray-600">{d.edad}</td>
              <td className="py-1.5 text-gray-600">{d.obraSocial}</td>
              <td className="py-1.5 text-gray-600 max-w-[200px] truncate" title={d.procedimiento}>
                {d.procedimiento}
              </td>
              <td className="py-1.5 text-gray-600">{formatDate(d.fecha)}</td>
              <td className="py-1.5 text-center">
                <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">
                  {d.inyeccionesEnAnio}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}

// --- Simple Bar Chart ---
function HBar({
  data,
  maxValue,
  color = 'bg-blue-500',
}: {
  data: { label: string; value: number; sub?: string }[];
  maxValue: number;
  color?: string;
}) {
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="group">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-gray-700 font-medium truncate max-w-[60%]" title={d.label}>
              {d.label}
            </span>
            <span className="text-gray-500 font-mono">
              {d.value.toLocaleString('es-AR')}
              {d.sub && <span className="text-gray-400 ml-1">{d.sub}</span>}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${color} transition-all duration-500`}
              style={{ width: `${Math.max((d.value / maxValue) * 100, 1)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Trend Mini-Chart ---
function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-gray-500 font-mono">{d.value}</span>
          <div className="w-full bg-gray-100 rounded-t flex-1 relative">
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-500"
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{d.label.split(' ')[0].slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// PANEL QUIRÚRGICO
// ============================================

function PanelQuirurgico({ datos }: { datos: PacienteQuirurgico[] }) {
  const [filtroSemaforo, setFiltroSemaforo] = useState<'todos' | 'rojo' | 'amarillo' | 'verde'>('todos');

  const filtrados = useMemo(() => {
    if (filtroSemaforo === 'todos') return datos;
    return datos.filter((p) => p.semaforo === filtroSemaforo);
  }, [datos, filtroSemaforo]);

  const conteos = useMemo(() => ({
    rojo: datos.filter((p) => p.semaforo === 'rojo').length,
    amarillo: datos.filter((p) => p.semaforo === 'amarillo').length,
    verde: datos.filter((p) => p.semaforo === 'verde').length,
  }), [datos]);

  return (
    <div>
      {/* Filtros semáforo */}
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-3.5 h-3.5 text-gray-400" />
        {(['todos', 'rojo', 'amarillo', 'verde'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltroSemaforo(f)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              filtroSemaforo === f
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f !== 'todos' && <SemaforoDot color={f} size="sm" />}
            {f === 'todos' ? `Todos (${datos.length})` : `${conteos[f]}`}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium w-8"></th>
              <th className="pb-2 font-medium">Paciente</th>
              <th className="pb-2 font-medium">Edad</th>
              <th className="pb-2 font-medium">OS</th>
              <th className="pb-2 font-medium">Cirugía</th>
              <th className="pb-2 font-medium">Fecha</th>
              <th className="pb-2 font-medium">Cirujano</th>
              <th className="pb-2 font-medium text-center">Controles</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p, i) => (
              <tr
                key={`${p.fichaId}-${p.fechaCirugia}-${i}`}
                className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                  p.semaforo === 'rojo' ? 'bg-red-50/30' : ''
                }`}
              >
                <td className="py-2 text-center">
                  <SemaforoDot color={p.semaforo} />
                </td>
                <td className="py-2 font-medium text-gray-800">{cleanName(p.paciente)}</td>
                <td className="py-2 text-gray-600">{p.edad} {p.sexo}</td>
                <td className="py-2 text-gray-600 max-w-[100px] truncate" title={p.obraSocial}>
                  {p.obraSocial}
                </td>
                <td className="py-2 text-gray-600 max-w-[200px] truncate" title={p.cirugia}>
                  {p.cirugia}
                </td>
                <td className="py-2 text-gray-600">{formatDate(p.fechaCirugia)}</td>
                <td className="py-2 text-gray-600">{p.prestadorCirugia}</td>
                <td className="py-2 text-center">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      p.controlesPost === 0
                        ? 'bg-red-100 text-red-700'
                        : p.controlesPost === 1
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {p.controlesPost}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// TABLA HIPERFRECUENTADORES
// ============================================

function TablaHiperfrecuentadores({ datos }: { datos: Hiperfrecuentador[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'alerta' | 'ok'>('todos');

  const filtrados = useMemo(() => {
    if (filtro === 'alerta') return datos.filter((h) => h.esAlerta);
    if (filtro === 'ok') return datos.filter((h) => !h.esAlerta);
    return datos;
  }, [datos, filtro]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-3.5 h-3.5 text-gray-400" />
        <button
          onClick={() => setFiltro('todos')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            filtro === 'todos' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todos ({datos.length})
        </button>
        <button
          onClick={() => setFiltro('alerta')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            filtro === 'alerta' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <AlertCircle className="w-3 h-3" /> Alerta ({datos.filter((h) => h.esAlerta).length})
        </button>
        <button
          onClick={() => setFiltro('ok')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            filtro === 'ok' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          <UserCheck className="w-3 h-3" /> Justificados ({datos.filter((h) => !h.esAlerta).length})
        </button>
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">Paciente</th>
              <th className="pb-2 font-medium">Edad</th>
              <th className="pb-2 font-medium text-center">Visitas</th>
              <th className="pb-2 font-medium">Tipo</th>
              <th className="pb-2 font-medium">Obras Sociales</th>
              <th className="pb-2 font-medium">Prestadores</th>
              <th className="pb-2 font-medium">Prácticas</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((h, i) => (
              <tr
                key={`${h.fichaId}-${i}`}
                className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                  h.esAlerta ? 'bg-amber-50/20' : ''
                }`}
              >
                <td className="py-1.5 font-medium text-gray-800">
                  <div className="flex items-center gap-1.5">
                    {h.esAlerta && <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                    {cleanName(h.paciente)}
                  </div>
                </td>
                <td className="py-1.5 text-gray-600">{h.edad} {h.sexo}</td>
                <td className="py-1.5 text-center">
                  <span className="bg-gray-800 text-white px-2 py-0.5 rounded-full font-bold">
                    {h.visitas}
                  </span>
                </td>
                <td className="py-1.5">{classBadge(h.clasificacion)}</td>
                <td className="py-1.5 text-gray-600 max-w-[120px] truncate" title={h.obrasSociales.join(', ')}>
                  {h.obrasSociales.join(', ')}
                </td>
                <td className="py-1.5 text-gray-600 max-w-[150px] truncate" title={h.prestadores.join(', ')}>
                  {h.prestadores.join(', ')}
                </td>
                <td className="py-1.5 text-gray-500 max-w-[200px] truncate" title={h.practicas.join(', ')}>
                  {h.practicas.join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function SeguimientoPacientesPage() {
  const {
    informe,
    mesesDisponibles,
    loading,
    error,
    mesSeleccionado,
    setMesSeleccionado,
    resumenSemaforo,
    refetch,
  } = useSeguimientoPacientes();

  // Sección colapsable state
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<string, boolean>>({
    alertas: true,
    quirurgico: true,
    distribucion: true,
    tendencia: true,
    hiperfrecuentadores: true,
  });

  const toggleSeccion = (id: string) =>
    setSeccionesAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));

  // --- LOADING ---
  if (loading && !informe) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Cargando informe...</p>
        </div>
      </div>
    );
  }

  // --- ERROR ---
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-800 font-semibold mb-1">Error al cargar el informe</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!informe) return null;

  const { kpis, alertas, panelQuirurgico, hiperfrecuentadores, distribucion, tendencia } = informe;

  // Section header component
  const SectionHeader = ({
    id,
    icon: Icon,
    title,
    subtitle,
    badge,
  }: {
    id: string;
    icon: any;
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
  }) => (
    <button
      onClick={() => toggleSeccion(id)}
      className="w-full flex items-center justify-between py-3 group"
    >
      <div className="flex items-center gap-2.5">
        <Icon className="w-5 h-5 text-blue-600" />
        <div className="text-left">
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {seccionesAbiertas[id] ? (
        <ChevronUp className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
      ) : (
        <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
      )}
    </button>
  );

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Seguimiento de Pacientes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Informe clínico mensual — Instituto Dr. Mercado
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de mes */}
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <select
              className="text-sm font-medium text-gray-700 bg-transparent outline-none cursor-pointer"
              value={mesSeleccionado ? `${mesSeleccionado.anio}-${mesSeleccionado.mes}` : ''}
              onChange={(e) => {
                const [a, m] = e.target.value.split('-').map(Number);
                setMesSeleccionado({ mes: m, anio: a });
              }}
            >
              {mesesDisponibles.map((m) => (
                <option key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`}>
                  {m.label} ({m.atenciones})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={refetch}
            disabled={loading}
            className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Recargar"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={Activity}
          label="Atenciones"
          value={kpis.actual.totalAtenciones}
          prev={kpis.anterior.totalAtenciones}
          variacion={kpis.variacionPct.totalAtenciones}
          color="blue"
        />
        <KpiCard
          icon={Users}
          label="Pacientes Únicos"
          value={kpis.actual.pacientesUnicos}
          prev={kpis.anterior.pacientesUnicos}
          variacion={kpis.variacionPct.pacientesUnicos}
          color="emerald"
        />
        <KpiCard
          icon={Stethoscope}
          label="Consultas"
          value={kpis.actual.totalConsultas}
          prev={kpis.anterior.totalConsultas}
          variacion={kpis.variacionPct.totalConsultas}
          color="cyan"
        />
        <KpiCard
          icon={Eye}
          label="Cirugías"
          value={kpis.actual.totalCirugias}
          prev={kpis.anterior.totalCirugias}
          variacion={kpis.variacionPct.totalCirugias}
          color="violet"
        />
        <KpiCard
          icon={FlaskConical}
          label="Estudios"
          value={kpis.actual.totalEstudios}
          prev={kpis.anterior.totalEstudios}
          variacion={kpis.variacionPct.totalEstudios}
          color="amber"
        />
        <KpiCard
          icon={UserCheck}
          label="Pac. Quirúrgicos"
          value={kpis.actual.pacientesQuirurgicos}
          prev={kpis.anterior.pacientesQuirurgicos}
          variacion={kpis.variacionPct.pacientesQuirurgicos}
          color="rose"
        />
      </div>

      {/* ===== ALERTAS ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-4">
          <SectionHeader
            id="alertas"
            icon={Shield}
            title="Alertas Clínicas"
            subtitle="Clasificación por nivel de prioridad"
            badge={
              <div className="flex items-center gap-1.5 ml-2">
                {resumenSemaforo.rojo > 0 && (
                  <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    <SemaforoDot color="rojo" size="sm" /> {resumenSemaforo.rojo}
                  </span>
                )}
                {resumenSemaforo.amarillo > 0 && (
                  <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    <SemaforoDot color="amarillo" size="sm" /> {resumenSemaforo.amarillo}
                  </span>
                )}
                <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  <SemaforoDot color="verde" size="sm" /> {resumenSemaforo.verde}
                </span>
              </div>
            }
          />
        </div>
        {seccionesAbiertas.alertas && (
          <div className="px-4 pb-4 space-y-2">
            {alertas.map((a) => (
              <AlertCard
                key={a.id}
                alerta={a}
                defaultOpen={a.nivel === 'critico'}
              />
            ))}
          </div>
        )}
      </div>

      {/* ===== PANEL QUIRÚRGICO ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-4">
          <SectionHeader
            id="quirurgico"
            icon={Eye}
            title="Panel Quirúrgico"
            subtitle={`${panelQuirurgico.length} cirugías en el mes`}
          />
        </div>
        {seccionesAbiertas.quirurgico && (
          <div className="px-4 pb-4">
            <PanelQuirurgico datos={panelQuirurgico} />
          </div>
        )}
      </div>

      {/* ===== DISTRIBUCIÓN + TENDENCIA (2 cols) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Distribución */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-4">
            <SectionHeader
              id="distribucion"
              icon={PieChart}
              title="Distribución"
              subtitle="Por obra social y prestador"
            />
          </div>
          {seccionesAbiertas.distribucion && (
            <div className="px-4 pb-4 space-y-5">
              {/* Top OS */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Top Obras Sociales
                </h3>
                <HBar
                  data={distribucion.porObraSocial.slice(0, 8).map((os) => ({
                    label: os.osSigla || os.osNombre,
                    value: os.atenciones,
                    sub: `(${os.participacionPct}%)`,
                  }))}
                  maxValue={distribucion.porObraSocial[0]?.atenciones || 1}
                  color="bg-blue-500"
                />
              </div>

              {/* Prestadores */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Prestadores
                </h3>
                <HBar
                  data={distribucion.porPrestador.map((p) => ({
                    label: p.preNombre,
                    value: p.atenciones,
                    sub: `(${p.participacionPct}%) — ${p.cirugias} cx`,
                  }))}
                  maxValue={distribucion.porPrestador[0]?.atenciones || 1}
                  color="bg-emerald-500"
                />
              </div>

              {/* Tipo paciente */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Tipo de Paciente
                </h3>
                <div className="flex gap-2">
                  {distribucion.porTipoPaciente.map((t) => (
                    <div
                      key={t.tipo}
                      className="flex-1 bg-gray-50 rounded-lg p-2.5 text-center"
                    >
                      <p className="text-lg font-bold text-gray-800">{t.cantidad}</p>
                      <p className="text-[10px] text-gray-500">
                        {t.tipo.replace(/_/g, ' ')} ({t.porcentaje}%)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tendencia */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-4">
            <SectionHeader
              id="tendencia"
              icon={BarChart3}
              title="Tendencia 6 Meses"
              subtitle="Evolución de actividad"
            />
          </div>
          {seccionesAbiertas.tendencia && (
            <div className="px-4 pb-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Atenciones Totales
                </h3>
                <TrendChart
                  data={tendencia.map((t) => ({ label: t.label, value: t.atenciones }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Consultas
                  </h3>
                  <TrendChart
                    data={tendencia.map((t) => ({ label: t.label, value: t.consultas }))}
                  />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Cirugías
                  </h3>
                  <TrendChart
                    data={tendencia.map((t) => ({ label: t.label, value: t.cirugias }))}
                  />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Estudios
                  </h3>
                  <TrendChart
                    data={tendencia.map((t) => ({ label: t.label, value: t.estudios }))}
                  />
                </div>
              </div>

              {/* Tabla resumen */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-1 font-medium">Mes</th>
                      <th className="pb-1 font-medium text-right">Atenciones</th>
                      <th className="pb-1 font-medium text-right">Pacientes</th>
                      <th className="pb-1 font-medium text-right">Cirugías</th>
                      <th className="pb-1 font-medium text-right">Estudios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tendencia.map((t) => (
                      <tr key={t.label} className="border-b border-gray-50">
                        <td className="py-1 font-medium text-gray-700">{t.label}</td>
                        <td className="py-1 text-right text-gray-600">{t.atenciones.toLocaleString('es-AR')}</td>
                        <td className="py-1 text-right text-gray-600">{t.pacientes.toLocaleString('es-AR')}</td>
                        <td className="py-1 text-right text-gray-600">{t.cirugias}</td>
                        <td className="py-1 text-right text-gray-600">{t.estudios}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== HIPERFRECUENTADORES ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-4">
          <SectionHeader
            id="hiperfrecuentadores"
            icon={Clock}
            title="Hiperfrecuentadores"
            subtitle={`${hiperfrecuentadores.total} pacientes con ${informe.umbrales.hiperfrecuentador}+ visitas`}
            badge={
              <div className="flex items-center gap-1.5 ml-2">
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {hiperfrecuentadores.noQuirurgicos.length} alertas
                </span>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {hiperfrecuentadores.quirurgicos.length} justificados
                </span>
              </div>
            }
          />
        </div>
        {seccionesAbiertas.hiperfrecuentadores && (
          <div className="px-4 pb-4">
            <TablaHiperfrecuentadores datos={hiperfrecuentadores.todos} />
          </div>
        )}
      </div>

      {/* ===== FOOTER ===== */}
      <div className="text-center text-xs text-gray-400 py-2">
        Informe generado: {new Date(informe.generadoEn).toLocaleString('es-AR')} —
        Umbrales: Hiperfrecuentador ≥{informe.umbrales.hiperfrecuentador} visitas |
        Reconsulta &lt;{informe.umbrales.reconsultaDias} días |
        Controles OK ≥{informe.umbrales.controlesOk}
      </div>
    </div>
  );
}
