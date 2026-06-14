// ============================================================
// PÁGINA: INFORMES DE GESTIÓN
// Panel principal para selección y descarga de informes
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  FileBarChart,
  TrendingUp,
  Activity,
  Receipt,
  Download,
  Calendar,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Info,
  BarChart3,
} from 'lucide-react';
import { useInformeGestion } from '../hooks/useInformeGestion';
import { generarPDFInformeGestion } from '../utils/pdfGeneratorInformeGestion';
import {
  INFORMES_DISPONIBLES,
  MESES_NOMBRE,
  type TipoInforme,
} from '../types/informes';

// ---- Mapa de íconos ----
const ICON_MAP: Record<string, React.ElementType> = {
  FileBarChart,
  TrendingUp,
  Activity,
  Receipt,
};

// ---- Componente principal ----
const InformesPage: React.FC = () => {
  // Estado de selección
  const [mesSeleccionado, setMesSeleccionado] = useState<number>(
    new Date().getMonth() // Mes anterior por defecto (0-indexed, así que getMonth() da el anterior)
  );
  const [anioSeleccionado, setAnioSeleccionado] = useState<number>(
    mesSeleccionado === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()
  );
  const [informeSeleccionado, setInformeSeleccionado] = useState<string>('gestion-mensual');

  // Hook de datos
  const { estado, datos, error, progreso, cargarInforme, limpiar } = useInformeGestion();

  // Años disponibles
  const aniosDisponibles = useMemo(() => {
    const actual = new Date().getFullYear();
    return [actual - 2, actual - 1, actual];
  }, []);

  // Meses disponibles (no permitir futuro)
  const mesesDisponibles = useMemo(() => {
    const ahora = new Date();
    const mesActual = ahora.getMonth() + 1;
    const anioActual = ahora.getFullYear();

    return Object.entries(MESES_NOMBRE)
      .map(([num, nombre]) => ({
        valor: parseInt(num),
        nombre,
        deshabilitado:
          anioSeleccionado === anioActual && parseInt(num) > mesActual,
      }))
      .filter((m) => !m.deshabilitado);
  }, [anioSeleccionado]);

  // Handlers
  const handleGenerarInforme = async () => {
    if (informeSeleccionado === 'gestion-mensual') {
      await cargarInforme(mesSeleccionado, anioSeleccionado);
    }
  };

  const handleDescargarPDF = () => {
    if (datos) {
      generarPDFInformeGestion(datos);
    }
  };

  const handleCambioAnio = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nuevoAnio = parseInt(e.target.value);
    setAnioSeleccionado(nuevoAnio);
    limpiar();

    // Ajustar mes si es necesario
    const ahora = new Date();
    if (nuevoAnio === ahora.getFullYear() && mesSeleccionado > ahora.getMonth() + 1) {
      setMesSeleccionado(ahora.getMonth() + 1);
    }
  };

  const handleCambioMes = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMesSeleccionado(parseInt(e.target.value));
    limpiar();
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <BarChart3 className="w-6 h-6 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Informes de Gestión</h1>
            <p className="text-sm text-gray-500">
              Generación y descarga de informes directivos
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================================ */}
        {/* COLUMNA IZQUIERDA: Selector de informes */}
        {/* ============================================ */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Informes Disponibles
          </h2>

          {INFORMES_DISPONIBLES.map((informe) => (
            <InformeCard
              key={informe.id}
              informe={informe}
              seleccionado={informeSeleccionado === informe.id}
              onClick={() => {
                if (informe.disponible) {
                  setInformeSeleccionado(informe.id);
                  limpiar();
                }
              }}
            />
          ))}
        </div>

        {/* ============================================ */}
        {/* COLUMNA DERECHA: Panel de configuración */}
        {/* ============================================ */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tarjeta de configuración */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header tarjeta */}
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-4">
              <h3 className="text-white font-semibold text-lg">
                {INFORMES_DISPONIBLES.find((i) => i.id === informeSeleccionado)?.nombre}
              </h3>
              <p className="text-blue-200 text-sm mt-1">
                {INFORMES_DISPONIBLES.find((i) => i.id === informeSeleccionado)?.descripcion}
              </p>
            </div>

            {/* Selectores de período */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Seleccionar período
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Selector de mes */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Mes
                  </label>
                  <div className="relative">
                    <select
                      value={mesSeleccionado}
                      onChange={handleCambioMes}
                      className="w-full appearance-none bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                    >
                      {mesesDisponibles.map((m) => (
                        <option key={m.valor} value={m.valor}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Selector de año */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Año
                  </label>
                  <div className="relative">
                    <select
                      value={anioSeleccionado}
                      onChange={handleCambioAnio}
                      className="w-full appearance-none bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                    >
                      {aniosDisponibles.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Info del informe */}
              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Este informe incluye:</p>
                    <ul className="space-y-0.5 text-blue-700">
                      <li>
                        • Comparativa{' '}
                        <strong>
                          {MESES_NOMBRE[mesSeleccionado]} {anioSeleccionado}
                        </strong>{' '}
                        vs mes anterior
                      </li>
                      <li>
                        • Acumulado{' '}
                        <strong>
                          Ene-{MESES_NOMBRE[mesSeleccionado]?.substring(0, 3)} {anioSeleccionado}
                        </strong>{' '}
                        vs mismo período {anioSeleccionado - 1}
                      </li>
                      <li>• Desglose por Obra Social, Prestador y Práctica</li>
                      <li>• KPIs principales con indicadores de variación</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Barra de progreso */}
              {estado === 'cargando' && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Consultando GECLISA...</span>
                    <span className="text-sm font-medium text-blue-600">{progreso}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Mensaje de error */}
              {estado === 'error' && error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Error al generar informe</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Mensaje de éxito */}
              {estado === 'listo' && datos && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">
                        Datos cargados correctamente
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-green-700">
                        <span>
                          Atenciones:{' '}
                          <strong>
                            {datos.resumenMensual.actual.totalAtenciones.toLocaleString('es-AR')}
                          </strong>
                        </span>
                        <span>
                          Prácticas:{' '}
                          <strong>
                            {datos.resumenMensual.actual.totalPracticas.toLocaleString('es-AR')}
                          </strong>
                        </span>
                        <span>
                          Facturado:{' '}
                          <strong>
                            {new Intl.NumberFormat('es-AR', {
                              style: 'currency',
                              currency: 'ARS',
                              maximumFractionDigits: 0,
                            }).format(datos.resumenMensual.actual.totalFacturado)}
                          </strong>
                        </span>
                        <span>
                          OS registradas:{' '}
                          <strong>{datos.porObraSocial.mesActual.length}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex gap-3">
                {estado !== 'listo' ? (
                  <button
                    onClick={handleGenerarInforme}
                    disabled={estado === 'cargando'}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                  >
                    {estado === 'cargando' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5" />
                        Generar Informe
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleDescargarPDF}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      Descargar PDF
                    </button>
                    <button
                      onClick={() => {
                        limpiar();
                      }}
                      className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      <Clock className="w-4 h-4" />
                      Otro período
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Preview rápido de datos (si están listos) */}
          {estado === 'listo' && datos && <PreviewRapido datos={datos} />}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

// ---- Tarjeta de informe ----
const InformeCard: React.FC<{
  informe: TipoInforme;
  seleccionado: boolean;
  onClick: () => void;
}> = ({ informe, seleccionado, onClick }) => {
  const Icon = ICON_MAP[informe.icono] || FileText;

  return (
    <button
      onClick={onClick}
      disabled={!informe.disponible}
      className={`
        w-full text-left p-4 rounded-xl border-2 transition-all
        ${
          seleccionado
            ? 'border-blue-500 bg-blue-50 shadow-sm'
            : informe.disponible
            ? 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
            : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg flex-shrink-0 ${
            seleccionado
              ? 'bg-blue-600 text-white'
              : informe.disponible
              ? 'bg-gray-100 text-gray-600'
              : 'bg-gray-100 text-gray-400'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium text-sm ${
                seleccionado ? 'text-blue-900' : 'text-gray-900'
              }`}
            >
              {informe.nombre}
            </span>
            {informe.proximamente && (
              <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                Próximamente
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{informe.descripcion}</p>
        </div>
      </div>
    </button>
  );
};

// ---- Preview rápido ----
const PreviewRapido: React.FC<{ datos: any }> = ({ datos }) => {
  const fmtMoneda = (n: number) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(n);

  const varPct = datos.resumenMensual.variacionPct;

  const kpis = [
    {
      label: 'Atenciones',
      valor: datos.resumenMensual.actual.totalAtenciones.toLocaleString('es-AR'),
      variacion: varPct.totalAtenciones,
    },
    {
      label: 'Facturado',
      valor: fmtMoneda(datos.resumenMensual.actual.totalFacturado),
      variacion: varPct.totalFacturado,
    },
    {
      label: 'Margen Bruto',
      valor: fmtMoneda(datos.resumenMensual.actual.margenBruto),
      variacion: varPct.margenBruto,
    },
    {
      label: 'Ticket Promedio',
      valor: fmtMoneda(datos.resumenMensual.actual.ticketPromedio),
      variacion: varPct.ticketPromedio,
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Vista previa - KPIs del período
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
            <p className="text-lg font-bold text-gray-900">{kpi.valor}</p>
            <p
              className={`text-xs font-semibold mt-1 ${
                kpi.variacion >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {kpi.variacion >= 0 ? '▲' : '▼'}{' '}
              {kpi.variacion >= 0 ? '+' : ''}
              {kpi.variacion.toFixed(1)}% vs mes ant.
            </p>
          </div>
        ))}
      </div>

      {/* Top 5 OS */}
      <div className="mt-6">
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">
          Top 5 Obras Sociales
        </h4>
        <div className="space-y-2">
          {datos.porObraSocial.mesActual.slice(0, 5).map((os: any, i: number) => (
            <div key={os.osId} className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-400 w-4">{i + 1}</span>
              <span className="text-sm text-gray-700 flex-1 truncate">
                {os.osSigla || os.osNombre}
              </span>
              <span className="text-sm font-medium text-gray-900">
                {fmtMoneda(os.facturado)}
              </span>
              <div className="w-16">
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{ width: `${os.participacionPct}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-500 w-10 text-right">
                {os.participacionPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InformesPage;
