// ============================================
// PÁGINA DE DIAGNÓSTICO - TURNOS GECLISA
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Database, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Calendar,
  Users,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Server,
  FileText
} from 'lucide-react';

interface DiagnosticoData {
  success: boolean;
  diagnostico?: {
    timestamp: string;
    servidor: string;
    baseDatos: string;
    tabla: string;
    secciones: {
      tablasEncontradas?: Array<{ TABLE_NAME: string; TABLE_TYPE: string }>;
      estructura?: Array<{ columna: string; tipoDato: string; longitud: number | null; nullable: string }>;
      estadisticasGenerales?: {
        totalTurnos: number;
        fechaMasAntigua: string;
        fechaMasReciente: string;
        aniosConDatos: number;
      };
      distribucionEstado?: Array<{ estado: string; cantidad: number; porcentaje: number }>;
      turnosPorAnio?: Array<{ anio: number; totalTurnos: number; pendientes: number; atendidos: number }>;
      mesActual?: {
        totalTurnosMes: number;
        todosPendientes: number;
        todosAtendidos: number;
        pendientesFuturos: number;
        pendientesPasados: number;
        turnosHoy: number;
      };
      queryActualSistema?: { query: string; resultado: number };
      analisisConfirmado?: Array<{ confirmado: boolean | null; cantidad: number; pendientes: number; atendidos: number }>;
      turnosHoy?: { fecha: string; cantidad: number; detalle: Array<any> };
      proximos7Dias?: Array<{ fecha: string; diaSemana: string; totalTurnos: number; pendientes: number }>;
      columnasEstadoAdicionales?: Array<{ columna: string; tipo: string }>;
      pendientesPorPrestador?: Array<{ prestador: string; turnosPendientes: number }>;
      pendientesPorServicio?: Array<{ servicio: string; turnosPendientes: number }>;
      ultimosTurnosRegistrados?: Array<any>;
      integridadDatos?: Array<{ verificacion: string; cantidad: number }>;
      resumenEjecutivo?: Array<{ metrica: string; valor: string }>;
      opcionesQueryTarjeta?: {
        opcionA: { descripcion: string; valor: number };
        opcionB: { descripcion: string; valor: number };
        opcionC: { descripcion: string; valor: number };
      };
    };
  };
  error?: string;
  message?: string;
}

const DiagnosticoTurnosPage: React.FC = () => {
  const [diagnostico, setDiagnostico] = useState<DiagnosticoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<string, boolean>>({
    resumen: true,
    mesActual: true,
    opciones: true
  });

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const ejecutarDiagnostico = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/diagnostico/turnos`);
      const data = await response.json();
      
      if (data.success) {
        setDiagnostico(data);
      } else {
        setError(data.message || 'Error ejecutando diagnóstico');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ejecutarDiagnostico();
  }, []);

  const toggleSeccion = (seccion: string) => {
    setSeccionesAbiertas(prev => ({
      ...prev,
      [seccion]: !prev[seccion]
    }));
  };

  const SeccionColapsable: React.FC<{
    id: string;
    titulo: string;
    icono: React.ReactNode;
    children: React.ReactNode;
    color?: string;
  }> = ({ id, titulo, icono, children, color = 'blue' }) => (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
      <button
        onClick={() => toggleSeccion(id)}
        className={`w-full flex items-center justify-between p-4 bg-${color}-50 hover:bg-${color}-100 transition-colors`}
      >
        <div className="flex items-center gap-3">
          <span className={`text-${color}-600`}>{icono}</span>
          <span className="font-semibold text-gray-800">{titulo}</span>
        </div>
        {seccionesAbiertas[id] ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500" />
        )}
      </button>
      {seccionesAbiertas[id] && (
        <div className="p-4 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );

  if (loading && !diagnostico) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-12 h-12 text-blue-600 animate-spin" />
            <p className="text-gray-600">Ejecutando diagnóstico completo...</p>
          </div>
        </div>
      </div>
    );
  }

  const secciones = diagnostico?.diagnostico?.secciones;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Database className="w-8 h-8 text-blue-600" />
            Diagnóstico de Turnos - GECLISA
          </h1>
          <p className="text-gray-500 mt-1">
            Investigación exhaustiva de la tabla Turnos en SQL Server
          </p>
        </div>
        <button
          onClick={ejecutarDiagnostico}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Ejecutando...' : 'Actualizar'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-6 h-6 text-red-600" />
          <div>
            <p className="font-semibold text-red-800">Error en diagnóstico</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Conexión Info */}
      {diagnostico?.diagnostico && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div className="flex-1">
            <p className="font-semibold text-green-800">Conexión exitosa</p>
            <p className="text-green-600 text-sm">
              Servidor: {diagnostico.diagnostico.servidor} | 
              Base: {diagnostico.diagnostico.baseDatos} | 
              Ejecutado: {new Date(diagnostico.diagnostico.timestamp).toLocaleString('es-AR')}
            </p>
          </div>
        </div>
      )}

      {secciones && (
        <div className="space-y-4">

          {/* RESUMEN EJECUTIVO */}
          <SeccionColapsable id="resumen" titulo="📊 Resumen Ejecutivo" icono={<Activity className="w-5 h-5" />} color="blue">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {secciones.resumenEjecutivo?.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`p-4 rounded-lg ${
                    item.metrica.includes('PENDIENTES DESDE HOY') 
                      ? 'bg-orange-100 border-2 border-orange-400' 
                      : 'bg-gray-50'
                  }`}
                >
                  <p className="text-xs text-gray-500 uppercase">{item.metrica}</p>
                  <p className={`text-2xl font-bold ${
                    item.metrica.includes('PENDIENTES DESDE HOY') 
                      ? 'text-orange-600' 
                      : 'text-gray-800'
                  }`}>
                    {item.valor}
                  </p>
                </div>
              ))}
            </div>
          </SeccionColapsable>

          {/* MES ACTUAL */}
          <SeccionColapsable id="mesActual" titulo="📅 Mes Actual (Diciembre 2025)" icono={<Calendar className="w-5 h-5" />} color="teal">
            {secciones.mesActual && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-blue-600">Total Mes</p>
                  <p className="text-xl font-bold text-blue-800">{secciones.mesActual.totalTurnosMes}</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg text-center">
                  <p className="text-xs text-orange-600">Pendientes (Todos)</p>
                  <p className="text-xl font-bold text-orange-800">{secciones.mesActual.todosPendientes}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-green-600">Atendidos</p>
                  <p className="text-xl font-bold text-green-800">{secciones.mesActual.todosAtendidos}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center border-2 border-red-300">
                  <p className="text-xs text-red-600">Pend. Futuros</p>
                  <p className="text-xl font-bold text-red-800">{secciones.mesActual.pendientesFuturos}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <p className="text-xs text-gray-600">Pend. Pasados</p>
                  <p className="text-xl font-bold text-gray-800">{secciones.mesActual.pendientesPasados}</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-xs text-purple-600">Turnos Hoy</p>
                  <p className="text-xl font-bold text-purple-800">{secciones.mesActual.turnosHoy}</p>
                </div>
              </div>
            )}
          </SeccionColapsable>

          {/* OPCIONES DE QUERY PARA TARJETA */}
          <SeccionColapsable id="opciones" titulo="🎯 Opciones de Query para Tarjeta" icono={<FileText className="w-5 h-5" />} color="purple">
            {secciones.opcionesQueryTarjeta && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 border-2 border-green-400 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-800">Opción A (Recomendada)</span>
                  </div>
                  <p className="text-3xl font-bold text-green-700">{secciones.opcionesQueryTarjeta.opcionA.valor}</p>
                  <p className="text-sm text-green-600 mt-1">{secciones.opcionesQueryTarjeta.opcionA.descripcion}</p>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-800">Opción B</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">{secciones.opcionesQueryTarjeta.opcionB.valor}</p>
                  <p className="text-sm text-blue-600 mt-1">{secciones.opcionesQueryTarjeta.opcionB.descripcion}</p>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-gray-600" />
                    <span className="font-semibold text-gray-800">Opción C</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-700">{secciones.opcionesQueryTarjeta.opcionC.valor}</p>
                  <p className="text-sm text-gray-600 mt-1">{secciones.opcionesQueryTarjeta.opcionC.descripcion}</p>
                </div>
              </div>
            )}
          </SeccionColapsable>

          {/* QUERY ACTUAL DEL SISTEMA */}
          <SeccionColapsable id="queryActual" titulo="⚙️ Query Actual del Sistema" icono={<Server className="w-5 h-5" />} color="gray">
            {secciones.queryActualSistema && (
              <div className="bg-gray-800 text-green-400 p-4 rounded-lg font-mono text-sm">
                <p className="text-gray-400 mb-2">// Query en prestaciones-realizadas.js</p>
                <p>WHERE Me_id IS NULL</p>
                <p>  AND YEAR(tur_fecha) = YEAR(GETDATE())</p>
                <p>  AND MONTH(tur_fecha) = MONTH(GETDATE())</p>
                <p>  AND tur_fecha {'>'}= CAST(GETDATE() AS DATE)</p>
                <p className="mt-3 text-white">
                  Resultado actual: <span className="text-yellow-400 text-xl font-bold">{secciones.queryActualSistema.resultado}</span>
                </p>
              </div>
            )}
          </SeccionColapsable>

          {/* DISTRIBUCIÓN POR ESTADO */}
          <SeccionColapsable id="distribucion" titulo="📈 Distribución Atendidos vs Pendientes" icono={<Activity className="w-5 h-5" />} color="indigo">
            {secciones.distribucionEstado && (
              <div className="space-y-3">
                {secciones.distribucionEstado.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className={`w-32 text-sm font-medium ${
                      item.estado === 'PENDIENTE' ? 'text-orange-600' : 'text-green-600'
                    }`}>
                      {item.estado}
                    </div>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${item.estado === 'PENDIENTE' ? 'bg-orange-500' : 'bg-green-500'}`}
                          style={{ width: `${item.porcentaje}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-24 text-right text-sm">
                      <span className="font-bold">{item.cantidad.toLocaleString()}</span>
                      <span className="text-gray-500 ml-1">({item.porcentaje}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SeccionColapsable>

          {/* TURNOS POR AÑO */}
          <SeccionColapsable id="porAnio" titulo="📆 Turnos por Año (Últimos 5)" icono={<Calendar className="w-5 h-5" />} color="cyan">
            {secciones.turnosPorAnio && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left">Año</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Pendientes</th>
                      <th className="px-4 py-2 text-right">Atendidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secciones.turnosPorAnio.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 font-medium">{row.anio}</td>
                        <td className="px-4 py-2 text-right">{row.totalTurnos.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-orange-600">{row.pendientes.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-green-600">{row.atendidos.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SeccionColapsable>

          {/* PRÓXIMOS 7 DÍAS */}
          <SeccionColapsable id="proximos7" titulo="📅 Próximos 7 Días" icono={<Clock className="w-5 h-5" />} color="amber">
            {secciones.proximos7Dias && secciones.proximos7Dias.length > 0 ? (
              <div className="grid grid-cols-7 gap-2">
                {secciones.proximos7Dias.map((dia, idx) => (
                  <div key={idx} className="p-3 bg-amber-50 rounded-lg text-center">
                    <p className="text-xs text-amber-600">{dia.diaSemana}</p>
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(dia.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                    </p>
                    <p className="text-lg font-bold text-amber-800">{dia.totalTurnos}</p>
                    <p className="text-xs text-orange-600">
                      {dia.pendientes} pend.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No hay turnos programados para los próximos 7 días</p>
            )}
          </SeccionColapsable>

          {/* PENDIENTES POR PRESTADOR */}
          <SeccionColapsable id="porPrestador" titulo="👨‍⚕️ Pendientes por Prestador" icono={<Users className="w-5 h-5" />} color="pink">
            {secciones.pendientesPorPrestador && secciones.pendientesPorPrestador.length > 0 ? (
              <div className="space-y-2">
                {secciones.pendientesPorPrestador.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-1 text-sm">{item.prestador}</div>
                    <div className="w-24 h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-pink-500"
                        style={{ 
                          width: `${Math.min(100, (item.turnosPendientes / (secciones.pendientesPorPrestador[0]?.turnosPendientes || 1)) * 100)}%` 
                        }}
                      />
                    </div>
                    <div className="w-12 text-right text-sm font-bold text-pink-600">
                      {item.turnosPendientes}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No hay turnos pendientes por prestador</p>
            )}
          </SeccionColapsable>

          {/* ESTRUCTURA DE LA TABLA */}
          <SeccionColapsable id="estructura" titulo="🗂️ Estructura de la Tabla Turnos" icono={<Database className="w-5 h-5" />} color="slate">
            {secciones.estructura && (
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Columna</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-right">Longitud</th>
                      <th className="px-3 py-2 text-center">Nullable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secciones.estructura.map((col, idx) => (
                      <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                        col.columna === 'Me_id' ? 'bg-yellow-100' : ''
                      }`}>
                        <td className="px-3 py-1 font-mono">{col.columna}</td>
                        <td className="px-3 py-1 text-blue-600">{col.tipoDato}</td>
                        <td className="px-3 py-1 text-right">{col.longitud || '-'}</td>
                        <td className="px-3 py-1 text-center">{col.nullable}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SeccionColapsable>

          {/* INTEGRIDAD DE DATOS */}
          <SeccionColapsable id="integridad" titulo="✅ Integridad de Datos" icono={<CheckCircle className="w-5 h-5" />} color="emerald">
            {secciones.integridadDatos && (
              <div className="space-y-2">
                {secciones.integridadDatos.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className={`${
                      item.verificacion.includes('inválido') ? 'text-red-600' : 
                      item.verificacion.includes('válido') ? 'text-green-600' : 'text-orange-600'
                    }`}>
                      {item.verificacion}
                    </span>
                    <span className="font-bold">{item.cantidad.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </SeccionColapsable>

        </div>
      )}

      {/* Footer */}
      <div className="text-center text-gray-400 text-sm py-4">
        Diagnóstico de Turnos GECLISA v1.0 | Sistema de Costos - Instituto Dr. Mercado
      </div>
    </div>
  );
};

export default DiagnosticoTurnosPage;
