// ============================================
// ANÁLISIS DE TURNOS - Dashboard Analítico
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Users,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  Activity,
  BarChart3,
  PieChart,
  CalendarDays,
  UserCheck,
  CalendarX,
  CalendarClock,
} from 'lucide-react';

// ============================================
// TIPOS
// ============================================

interface ResumenTurnos {
  totalMes: number;
  pendientesFuturos: number;
  atendidos: number;
  ausentes: number;
  turnosHoy: number;
  pendientesHoy: number;
  tasaAusentismo: number;
  tasaOcupacion: number;
}

interface TurnoDia {
  fecha: string;
  diaSemana: string;
  total: number;
  pendientes: number;
  atendidos: number;
  confirmados: number;
}

interface TurnoPrestador {
  prestador: string;
  total: number;
  pendientes: number;
  atendidos: number;
  tasaAusentismo: number;
}

interface TurnoServicio {
  servicio: string;
  total: number;
  pendientes: number;
  atendidos: number;
}

interface TurnoDetalle {
  id: number;
  fecha: string;
  hora: string;
  paciente: string;
  practica: string;
  prestador: string;
  servicio: string;
  obraSocial: string;
  confirmado: boolean;
  esWeb: boolean;
  estado: 'PENDIENTE' | 'ATENDIDO' | 'AUSENTE';
}

interface DatosAnalisis {
  resumen: ResumenTurnos;
  proximos7Dias: TurnoDia[];
  porPrestador: TurnoPrestador[];
  porServicio: TurnoServicio[];
  turnosHoy: TurnoDetalle[];
  turnosPendientes: TurnoDetalle[];
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const AnalisisTurnosPage: React.FC = () => {
  const [datos, setDatos] = useState<DatosAnalisis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  
  // Filtros
  const [vistaDetalle, setVistaDetalle] = useState<'hoy' | 'pendientes' | 'semana'>('hoy');
  const [seccionExpandida, setSeccionExpandida] = useState<string | null>('resumen');

  // ============================================
  // CARGAR DATOS
  // ============================================

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/turnos/analisis');
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setDatos(data);
      setUltimaActualizacion(new Date());
    } catch (err) {
      console.error('Error cargando análisis de turnos:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ============================================
  // HELPERS
  // ============================================

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-AR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit'
    });
  };

  const formatHora = (hora: string) => {
    return hora || '--:--';
  };

  const toggleSeccion = (seccion: string) => {
    setSeccionExpandida(seccionExpandida === seccion ? null : seccion);
  };

  // ============================================
  // COMPONENTE: Tarjeta de Estadística
  // ============================================

  const TarjetaEstadistica: React.FC<{
    titulo: string;
    valor: number | string;
    subtitulo?: string;
    icono: React.ElementType;
    color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
    tendencia?: number;
  }> = ({ titulo, valor, subtitulo, icono: Icon, color, tendencia }) => {
    const colores = {
      blue: 'bg-blue-50 border-blue-200 text-blue-700',
      green: 'bg-green-50 border-green-200 text-green-700',
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      red: 'bg-red-50 border-red-200 text-red-700',
      purple: 'bg-purple-50 border-purple-200 text-purple-700',
      gray: 'bg-gray-50 border-gray-200 text-gray-700',
    };

    const iconColors = {
      blue: 'text-blue-500',
      green: 'text-green-500',
      yellow: 'text-yellow-500',
      red: 'text-red-500',
      purple: 'text-purple-500',
      gray: 'text-gray-500',
    };

    return (
      <div className={`rounded-xl border-2 p-4 ${colores[color]}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">{titulo}</p>
            <p className="text-3xl font-bold mt-1">{valor}</p>
            {subtitulo && (
              <p className="text-xs mt-1 opacity-70">{subtitulo}</p>
            )}
          </div>
          <div className={`p-2 rounded-lg bg-white/50`}>
            <Icon className={`h-6 w-6 ${iconColors[color]}`} />
          </div>
        </div>
        {tendencia !== undefined && (
          <div className={`mt-2 flex items-center text-xs ${tendencia >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {tendencia >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1 transform rotate-180" />}
            {Math.abs(tendencia)}% vs mes anterior
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // COMPONENTE: Sección Colapsable
  // ============================================

  const SeccionColapsable: React.FC<{
    id: string;
    titulo: string;
    icono: React.ElementType;
    children: React.ReactNode;
    badge?: string | number;
  }> = ({ id, titulo, icono: Icon, children, badge }) => {
    const expandida = seccionExpandida === id;

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => toggleSeccion(id)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-blue-600" />
            <span className="font-semibold text-gray-800">{titulo}</span>
            {badge !== undefined && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                {badge}
              </span>
            )}
          </div>
          {expandida ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        
        {expandida && (
          <div className="px-6 pb-6 border-t border-gray-100">
            {children}
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // RENDER: Loading
  // ============================================

  if (loading && !datos) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Cargando análisis de turnos...</p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Error
  // ============================================

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h3 className="mt-4 text-lg font-semibold text-red-800">Error al cargar datos</h3>
          <p className="mt-2 text-red-600">{error}</p>
          <button
            onClick={cargarDatos}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!datos) return null;

  // ============================================
  // RENDER: Principal
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <Calendar className="h-7 w-7 text-blue-600" />
            Análisis de Turnos
          </h1>
          <p className="text-gray-500 mt-1">
            Dashboard analítico de agenda y turnos médicos
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {ultimaActualizacion && (
            <span className="text-sm text-gray-500">
              Actualizado: {ultimaActualizacion.toLocaleTimeString('es-AR')}
            </span>
          )}
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <TarjetaEstadistica
          titulo="Turnos Hoy"
          valor={datos.resumen.turnosHoy}
          subtitulo={`${datos.resumen.pendientesHoy} pendientes`}
          icono={CalendarDays}
          color="blue"
        />
        <TarjetaEstadistica
          titulo="Pendientes Mes"
          valor={datos.resumen.pendientesFuturos}
          subtitulo="Desde hoy hasta fin de mes"
          icono={CalendarClock}
          color="yellow"
        />
        <TarjetaEstadistica
          titulo="Atendidos Mes"
          valor={datos.resumen.atendidos}
          subtitulo={`de ${datos.resumen.totalMes} total`}
          icono={UserCheck}
          color="green"
        />
        <TarjetaEstadistica
          titulo="Ausentes Mes"
          valor={datos.resumen.ausentes}
          subtitulo="No se presentaron"
          icono={CalendarX}
          color="red"
        />
        <TarjetaEstadistica
          titulo="Tasa Ocupación"
          valor={`${datos.resumen.tasaOcupacion.toFixed(1)}%`}
          subtitulo="Turnos atendidos"
          icono={Activity}
          color="purple"
        />
        <TarjetaEstadistica
          titulo="Ausentismo"
          valor={`${datos.resumen.tasaAusentismo.toFixed(1)}%`}
          subtitulo="No se presentaron"
          icono={AlertCircle}
          color={datos.resumen.tasaAusentismo > 15 ? 'red' : 'gray'}
        />
      </div>

      {/* Próximos 7 Días */}
      <SeccionColapsable
        id="semana"
        titulo="Próximos 7 Días"
        icono={CalendarDays}
        badge={datos.proximos7Dias.reduce((sum, d) => sum + d.pendientes, 0)}
      >
        <div className="mt-4 overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[600px]">
            {datos.proximos7Dias.map((dia, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border text-center ${
                  index === 0 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <p className="text-xs font-medium text-gray-500 uppercase">
                  {dia.diaSemana}
                </p>
                <p className="text-sm font-semibold text-gray-700 mt-1">
                  {formatFecha(dia.fecha)}
                </p>
                <div className="mt-3 space-y-1">
                  <p className="text-2xl font-bold text-gray-800">{dia.total}</p>
                  <p className="text-xs text-gray-500">turnos</p>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-yellow-600">Pend:</span>
                    <span className="font-medium">{dia.pendientes}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">Conf:</span>
                    <span className="font-medium">{dia.confirmados}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SeccionColapsable>

      {/* Por Prestador */}
      <SeccionColapsable
        id="prestadores"
        titulo="Turnos por Prestador"
        icono={Users}
        badge={datos.porPrestador.length}
      >
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-600">Prestador</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600">Total</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600">Pendientes</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600">Atendidos</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600">Ausentismo</th>
              </tr>
            </thead>
            <tbody>
              {datos.porPrestador.slice(0, 10).map((prestador, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium text-gray-800">{prestador.prestador}</td>
                  <td className="py-2 px-3 text-center">{prestador.total}</td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                      {prestador.pendientes}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                      {prestador.atendidos}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      prestador.tasaAusentismo > 20 
                        ? 'bg-red-100 text-red-700'
                        : prestador.tasaAusentismo > 10
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      {prestador.tasaAusentismo.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionColapsable>

      {/* Turnos de Hoy - Detalle */}
      <SeccionColapsable
        id="hoy"
        titulo="Turnos de Hoy"
        icono={Clock}
        badge={datos.turnosHoy.length}
      >
        <div className="mt-4">
          {datos.turnosHoy.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CalendarX className="h-12 w-12 mx-auto opacity-50" />
              <p className="mt-2">No hay turnos programados para hoy</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Hora</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Paciente</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Práctica</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Prestador</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">O. Social</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.turnosHoy.map((turno, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-gray-800">{turno.hora}</td>
                      <td className="py-2 px-3 font-medium text-gray-800">{turno.paciente}</td>
                      <td className="py-2 px-3 text-gray-600">{turno.practica}</td>
                      <td className="py-2 px-3 text-gray-600">{turno.prestador}</td>
                      <td className="py-2 px-3 text-gray-600">{turno.obraSocial}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          turno.estado === 'ATENDIDO'
                            ? 'bg-green-100 text-green-700'
                            : turno.estado === 'PENDIENTE'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {turno.estado === 'ATENDIDO' && <CheckCircle className="h-3 w-3" />}
                          {turno.estado === 'PENDIENTE' && <Clock className="h-3 w-3" />}
                          {turno.estado === 'AUSENTE' && <XCircle className="h-3 w-3" />}
                          {turno.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SeccionColapsable>

      {/* Por Servicio */}
      <SeccionColapsable
        id="servicios"
        titulo="Turnos por Servicio"
        icono={BarChart3}
        badge={datos.porServicio.length}
      >
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {datos.porServicio.map((servicio, index) => (
            <div
              key={index}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <p className="text-sm font-medium text-gray-800 truncate" title={servicio.servicio}>
                {servicio.servicio}
              </p>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-800">{servicio.total}</p>
                  <p className="text-xs text-gray-500">turnos</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-yellow-600">{servicio.pendientes} pend.</p>
                  <p className="text-green-600">{servicio.atendidos} atend.</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SeccionColapsable>

      {/* Footer Info */}
      <div className="text-center text-sm text-gray-400 py-4">
        <p>Datos obtenidos de GECLISA (192.168.1.73)</p>
        <p className="mt-1">Me_id = 0 → Pendiente | Me_id &gt; 0 → Atendido</p>
      </div>
    </div>
  );
};

export default AnalisisTurnosPage;
