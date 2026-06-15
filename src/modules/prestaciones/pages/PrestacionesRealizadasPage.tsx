// ============================================
// PÁGINA: Prestaciones Realizadas
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÓN 3.0 - Diseño Moderno
// ============================================

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  Calendar,
  Building2,
  UserCheck,
  Users,
  Activity,
  Clock,
  ChevronDown,
  X,
  FileSpreadsheet,
  AlertCircle,
  TrendingUp,
  Wifi,
  WifiOff,
  LayoutList
} from 'lucide-react';
import { useMovimientosPrestaciones } from '@shared/hooks/useMovimientosPrestaciones';
import { FiltroSelect, StatCard } from '@shared/components/ui';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PrestacionesRealizadasPage: React.FC = () => {
  // Hook de datos
  const {
    prestaciones,
    estadisticas,
    opcionesFiltros,
    filtros,
    aplicarFiltros,
    limpiarFiltros,
    loading,
    loadingFiltros,
    error,
    isConnected,
    refetch
  } = useMovimientosPrestaciones();

  // Estados locales
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [busquedaLocal, setBusquedaLocal] = useState('');

  // Inicializar filtros con año y mes actual al cargar
  useEffect(() => {
    const fechaActual = new Date();
    const anioActual = fechaActual.getFullYear().toString();
    const mesActual = (fechaActual.getMonth() + 1).toString();
    
    // Solo aplicar si los filtros están vacíos (primera carga)
    if (!filtros.anio && !filtros.mes) {
      aplicarFiltros({ anio: anioActual, mes: mesActual });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado local por búsqueda de texto
  const prestacionesFiltradas = useMemo(() => {
    if (!busquedaLocal.trim()) return prestaciones;
    
    const termino = busquedaLocal.toLowerCase();
    return prestaciones.filter(p => 
      p.apellido_nombre?.toLowerCase().includes(termino) ||
      p.prestador?.toLowerCase().includes(termino) ||
      p.os_nombre?.toLowerCase().includes(termino) ||
      p.os_sigla?.toLowerCase().includes(termino) ||
      p.prestacion?.toLowerCase().includes(termino) ||
      p.codigo_prestacion?.toLowerCase().includes(termino) ||
      String(p.id).includes(termino)
    );
  }, [prestaciones, busquedaLocal]);

  // Formatear fecha
  const formatFecha = (fecha: string) => {
    if (!fecha) return '';
    const fechaStr = fecha.split('T')[0];
    const [anio, mes, dia] = fechaStr.split('-');
    return `${dia}/${mes}/${anio}`;
  };

  // Nombres de meses
  const getNombreMesActual = () => {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[new Date().getMonth()];
  };

  const getNombreMesAnterior = () => {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesAnterior = new Date().getMonth() - 1;
    return meses[mesAnterior < 0 ? 11 : mesAnterior];
  };

  const getFechaHoy = () => {
    const hoy = new Date();
    return `${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth() + 1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;
  };

  // Exportar a CSV
  const exportarCSV = () => {
    if (prestacionesFiltradas.length === 0) return;

    const headers = [
      'Práctica', 'Fecha', 'Hora', 'Paciente', 'Prestador', 'Derivador',
      'O.S. Nombre', 'Prestación', 'Coseguro', 'Cobertura', 'Total', 'Atendió'
    ];

    const rows = prestacionesFiltradas.map(p => [
      p.id,
      formatFecha(p.fecha),
      p.hora,
      p.apellido_nombre,
      p.prestador,
      p.derivador,
      p.os_nombre,
      p.prestacion,
      p.coseguro,
      p.cobertura,
      p.total,
      p.atendio
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${c || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prestaciones_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Verificar si hay filtros activos
  const hayFiltrosActivos = Object.values(filtros).some(v => v !== '');

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header Moderno */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
              <LayoutList className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                Prestaciones Realizadas
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Dashboard de atenciones en tiempo real
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Indicador de conexión */}
            <div className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold
              transition-all duration-300 shadow-sm
              ${isConnected 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
              }
            `}>
              {isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            {/* Botón refrescar */}
            <button
              onClick={refetch}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 
                         text-white rounded-xl hover:from-blue-600 hover:to-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 text-sm font-semibold shadow-lg shadow-blue-500/25
                         hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>

            {/* Botón exportar */}
            <button
              onClick={exportarCSV}
              disabled={prestacionesFiltradas.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 
                         text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 text-sm font-semibold shadow-lg shadow-emerald-500/25
                         hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas KPIs */}
      <div className="px-6 py-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Prácticas del Día"
            value={estadisticas?.practicas_hoy || 0}
            subtitle={getFechaHoy()}
            icon={<Activity className="h-5 w-5" />}
            variant="blue"
          />
          
          <StatCard
            title="Mes Anterior"
            value={estadisticas?.practicas_mes_anterior || 0}
            subtitle={getNombreMesAnterior()}
            icon={<Calendar className="h-5 w-5" />}
            variant="slate"
          />
          
          <StatCard
            title="Mes Actual"
            value={estadisticas?.practicas_mes_actual || 0}
            subtitle={getNombreMesActual()}
            icon={<TrendingUp className="h-5 w-5" />}
            variant="emerald"
          />
          
          <StatCard
            title="Turnos Pendientes"
            value={estadisticas?.turnos_pendientes || 0}
            subtitle="Sin atender"
            icon={<Clock className="h-5 w-5" />}
            variant="amber"
          />
          
          <StatCard
            title="En Tabla"
            value={prestacionesFiltradas.length}
            subtitle="Registros filtrados"
            icon={<FileSpreadsheet className="h-5 w-5" />}
            variant="violet"
          />
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="mx-6 mb-4">
        <div className="bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200 rounded-2xl shadow-sm">
          <div className="px-5 py-3.5 flex items-center justify-between">
            <button
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className="flex items-center gap-3 text-slate-700 font-semibold group"
            >
              <div className="p-2 bg-slate-200/70 rounded-lg group-hover:bg-slate-300 transition-colors">
                <Filter className="h-4 w-4" />
              </div>
              <span>Filtros Avanzados</span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${mostrarFiltros ? 'rotate-180' : ''}`} />
              {hayFiltrosActivos && (
                <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full font-bold">
                  Activos
                </span>
              )}
            </button>
            
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm transition-colors
                           px-3 py-1.5 hover:bg-slate-200 rounded-lg"
              >
                <X className="h-4 w-4" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Panel de filtros expandible */}
      <div className={`
        overflow-hidden transition-all duration-300 ease-in-out
        ${mostrarFiltros ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="mx-6 mb-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <FiltroSelect
              label="Año"
              value={filtros.anio}
              onChange={(v) => {
                if (!v) {
                  aplicarFiltros({ anio: v, dia: '' });
                } else {
                  aplicarFiltros({ anio: v });
                }
              }}
              options={opcionesFiltros.anios.map(a => ({ value: a, label: String(a) }))}
              icon={<Calendar className="h-3 w-3" />}
              disabled={loadingFiltros}
            />
            
            <FiltroSelect
              label="Mes"
              value={filtros.mes}
              onChange={(v) => {
                if (!v) {
                  aplicarFiltros({ mes: v, dia: '' });
                } else {
                  aplicarFiltros({ mes: v });
                }
              }}
              options={opcionesFiltros.meses.map(m => ({ value: m.value, label: m.label }))}
              icon={<Calendar className="h-3 w-3" />}
              disabled={loadingFiltros}
            />

            <div className="relative">
              <FiltroSelect
                label="Día"
                value={filtros.dia}
                onChange={(v) => aplicarFiltros({ dia: v })}
                options={(opcionesFiltros.dias || []).map(d => ({ value: d.value, label: d.label }))}
                placeholder="Todos"
                icon={<Calendar className="h-3 w-3" />}
                disabled={loadingFiltros || !filtros.anio || !filtros.mes}
              />
              {(!filtros.anio || !filtros.mes) && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">⚠️ Requiere año y mes</p>
              )}
            </div>
            
            <FiltroSelect
              label="Prestador"
              value={filtros.prestadorId}
              onChange={(v) => aplicarFiltros({ prestadorId: v })}
              options={opcionesFiltros.prestadores.map(p => ({ value: p.id, label: p.nombre }))}
              icon={<UserCheck className="h-3 w-3" />}
              disabled={loadingFiltros}
            />
            
            <FiltroSelect
              label="Obra Social"
              value={filtros.obraSocialId}
              onChange={(v) => aplicarFiltros({ obraSocialId: v })}
              options={opcionesFiltros.obrasSociales.map(os => ({ 
                value: os.id, 
                label: `${os.sigla} - ${os.nombre}`.substring(0, 40) 
              }))}
              icon={<Building2 className="h-3 w-3" />}
              disabled={loadingFiltros}
            />
            
            <FiltroSelect
              label="Agente Facturador"
              value={filtros.agenteFacturadorId}
              onChange={(v) => aplicarFiltros({ agenteFacturadorId: v })}
              options={opcionesFiltros.agentesFacturadores.map(af => ({ value: af.id, label: af.nombre }))}
              icon={<Building2 className="h-3 w-3" />}
              disabled={loadingFiltros}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
            <FiltroSelect
              label="Grupo de Prácticas"
              value={filtros.grupoPracticas}
              onChange={(v) => aplicarFiltros({ grupoPracticas: v })}
              options={opcionesFiltros.gruposPracticas.map(g => ({ value: g.id, label: g.nombre }))}
              icon={<FileSpreadsheet className="h-3 w-3" />}
              disabled={loadingFiltros}
            />

            <div className="flex flex-col">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Activity className="h-3 w-3" />
                Prestación
              </label>
              <input
                type="text"
                value={filtros.prestacion}
                onChange={(e) => aplicarFiltros({ prestacion: e.target.value })}
                placeholder="Buscar prestación..."
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm
                           focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                           transition-all duration-200 hover:border-slate-300 shadow-sm"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                Paciente
              </label>
              <input
                type="text"
                value={filtros.paciente}
                onChange={(e) => aplicarFiltros({ paciente: e.target.value })}
                placeholder="Buscar paciente..."
                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm
                           focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                           transition-all duration-200 hover:border-slate-300 shadow-sm"
              />
            </div>

            <FiltroSelect
              label="Derivador"
              value={filtros.derivadorId}
              onChange={(v) => aplicarFiltros({ derivadorId: v })}
              options={opcionesFiltros.derivadores.map(d => ({ value: d.id, label: d.nombre }))}
              icon={<UserCheck className="h-3 w-3" />}
              disabled={loadingFiltros}
            />
          </div>
        </div>
      </div>

      {/* Búsqueda rápida local */}
      <div className="mx-6 mb-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={busquedaLocal}
                onChange={(e) => setBusquedaLocal(e.target.value)}
                placeholder="Buscar por paciente, prestador, obra social, prestación, código, ID..."
                className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm
                           focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
                           transition-all duration-200 bg-slate-50 hover:bg-white"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 font-medium">
                {prestacionesFiltradas.length} de {prestaciones.length} registros
              </span>
              {prestaciones.length === 500 && (
                <span className="flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full font-semibold">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Límite alcanzado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje de error */}
      {error && (
        <div className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-xl">
            <AlertCircle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-800">Error al cargar datos</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}



      {/* Tabla de datos */}
      <div className="mx-6 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Contenedor con altura fija y scroll */}
          <div className="max-h-[680px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider w-16">ID</th>
                  <th className="px-2 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider w-20">Fecha</th>
                  <th className="px-2 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wider w-12">Hora</th>
                  <th className="px-2 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Paciente</th>
                  <th className="px-2 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider w-28">Prestador</th>
                  <th className="px-2 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wider w-16">Deriv.</th>
                  <th className="px-2 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wider w-28">O. Social</th>
                  <th className="px-2 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider">Prestación</th>
                  <th className="px-2 py-3 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider w-24">Coseguro</th>
                  <th className="px-2 py-3 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider w-24">Cobertura</th>
                  <th className="px-2 py-3 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider w-28">Total</th>
                  <th className="px-2 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wider w-20">Atendió</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                        <p className="text-slate-500 font-medium">Cargando prestaciones...</p>
                      </div>
                    </td>
                  </tr>
                ) : prestacionesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-slate-100 rounded-2xl">
                          <FileSpreadsheet className="h-10 w-10 text-slate-400" />
                        </div>
                        <p className="font-semibold text-slate-700">No se encontraron prestaciones</p>
                        <p className="text-sm text-slate-500">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  prestacionesFiltradas.map((p, idx) => (
                    <tr 
                      key={`${p.id}-${idx}`}
                      className="hover:bg-blue-50/50 transition-colors"
                    >
                      <td className="px-2 py-2 text-slate-400 font-mono text-xs">{p.id}</td>
                      <td className="px-2 py-2 text-slate-700 whitespace-nowrap text-xs">{formatFecha(p.fecha)}</td>
                      <td className="px-2 py-2 text-slate-500 whitespace-nowrap text-xs text-center">{p.hora}</td>
                      <td className="px-2 py-2 text-slate-900 font-medium text-xs">{p.apellido_nombre}</td>
                      <td className="px-2 py-2 text-slate-600 text-xs truncate max-w-[112px]" title={p.prestador}>{p.prestador}</td>
                      <td className="px-2 py-2 text-slate-400 text-xs text-center">{p.derivador || '—'}</td>
                      <td className="px-2 py-2 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 truncate max-w-[100px]" title={p.os_nombre}>
                          {p.os_nombre}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-700 text-xs">{p.prestacion}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs text-slate-600">
                        {p.coseguro > 0 ? `$ ${p.coseguro.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs text-slate-600">
                        {p.cobertura > 0 ? `$ ${p.cobertura.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-xs font-semibold text-slate-900">
                        $ {p.total > 0 ? p.total.toLocaleString('es-AR') : '0'}
                      </td>
                      <td className="px-2 py-2 text-slate-500 text-xs truncate max-w-[80px]" title={p.atendio}>{p.atendio}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-white/80 backdrop-blur-sm border-t border-slate-200/60">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Fuente: SQL Server Local - GECLISA
          </span>
          <span className="font-medium">
            Total: {prestacionesFiltradas.length.toLocaleString('es-AR')} registros
          </span>
        </div>
      </div>
    </div>
  );
};

export default PrestacionesRealizadasPage;
