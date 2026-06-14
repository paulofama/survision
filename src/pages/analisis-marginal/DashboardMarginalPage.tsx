// ============================================
// DASHBOARD MARGINAL PAGE
// Análisis Marginal - Sistema de Costos
// Instituto Dr. Mercado
// Vista principal con KPIs y resumen general
// ============================================

import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  FileBarChart,
  Building2,
  Activity,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { MarginalLayout, useMarginalContext } from '../../components/analisis-marginal/MarginalLayout';
import useCostosFijosDistribucion, { getSemaforoColor, semaforoClasses, semaforoDot } from '../../hooks/useCostosFijosDistribucion';
import useNombreMapping from '../../hooks/useNombreMapping';
import InformeGestionModal from '../../components/analisis-marginal/InformeGestionModal';

// ============================================
// TIPOS
// ============================================

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
}

interface TopItemProps {
  rank: number;
  name: string;
  value: number;
  percentage: number;
  type: 'positive' | 'negative' | 'neutral';
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('es-AR').format(num);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Detectar segmento de prestación
const detectarSegmento = (nombrePrestacion: string): 'Consultas' | 'Estudios' | 'Cirugias' => {
  const nombre = nombrePrestacion.toUpperCase();
  if (nombre.includes('CONSULTA') || nombre.includes('CONTROL') || nombre.includes('PRIMERA VEZ') ||
      nombre.includes('VISITA') || nombre.includes('URGENCIA') || nombre.includes('GUARDIA') ||
      nombre.includes('RECETA') || nombre.includes('VER ESTUDIO')) return 'Consultas';
  if (nombre.includes('CIRUGIA') || nombre.includes('QUIRURGIC') || nombre.includes('FACO') ||
      nombre.includes('VITRECTOMIA') || nombre.includes('TRABECULECTOMIA') || nombre.includes('IMPLANTE') ||
      nombre.includes('EXTRACCION') || nombre.includes('TRASPLANTE') || nombre.includes('INYECCION') ||
      nombre.includes('LASER') || nombre.includes('PTERIGION') || nombre.includes('CHALAZION') ||
      nombre.includes('NEEDLING') || nombre.includes('CROSS LINKING')) return 'Cirugias';
  return 'Estudios';
};

const normalizarNombre = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

// ============================================
// COMPONENTES
// ============================================

const KPICard: React.FC<KPICardProps> = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  color 
}) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  };

  const iconBgClasses = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    yellow: 'bg-yellow-100',
    red: 'bg-red-100',
    purple: 'bg-purple-100',
    indigo: 'bg-indigo-100',
  };

  return (
    <div className={`bg-white rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${iconBgClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm ${
            trend.isPositive ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend.isPositive ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownRight className="h-4 w-4" />
            )}
            {formatPercent(trend.value)}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

const TopItem: React.FC<TopItemProps> = ({ rank, name, value, percentage, type }) => {
  const bgColor = type === 'positive' ? 'bg-green-100' : type === 'negative' ? 'bg-red-100' : 'bg-gray-100';
  const textColor = type === 'positive' ? 'text-green-700' : type === 'negative' ? 'text-red-700' : 'text-gray-700';
  
  return (
    <div className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${bgColor} ${textColor}`}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-500">{formatCurrency(value)}</p>
      </div>
      <span className={`text-sm font-medium ${textColor}`}>
        {formatPercent(percentage)}
      </span>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const DashboardMarginalContent: React.FC = () => {
  const { 
    prestaciones, 
    recetasConPools, 
    configHonorarios,
    prestadoresHonorarios,
    filtros,
    loading 
  } = useMarginalContext();

  const anioActual = filtros?.anio || new Date().getFullYear();
  const mesActual  = filtros?.mes  || (new Date().getMonth() + 1);

  const { resumen: resumenCF } = useCostosFijosDistribucion(anioActual, mesActual);
  const { agregarAliases } = useNombreMapping();

  const [mostrarInforme, setMostrarInforme] = useState(false);

  // ============================================
  // CÁLCULOS PRINCIPALES
  // ============================================

  const analytics = useMemo(() => {
    if (prestaciones.length === 0) {
      return {
        totalFacturado: 0,
        totalHonorarios: 0,
        totalCostos: 0,
        margenBruto: 0,
        margenPorcentaje: 0,
        cantidadPrestaciones: 0,
        ticketPromedio: 0,
        prestadoresActivos: 0,
        obrasSocialesActivas: 0,
        porSegmento: {
          Consultas: { cantidad: 0, facturado: 0, margen: 0 },
          Estudios: { cantidad: 0, facturado: 0, margen: 0 },
          Cirugias: { cantidad: 0, facturado: 0, margen: 0 },
        },
        topPrestaciones: [],
        topPrestadores: [],
        topObrasSociales: [],
      };
    }

    // Crear mapa de recetas por nombre normalizado (matching fuzzy, igual que las demás páginas)
    const recetasMap = new Map(
      recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r])
    );
    agregarAliases(recetasMap);

    // Crear mapa de prestadores para verificar si es socio
    const prestadoresMap = new Map(
      prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p])
    );

    // Acumuladores
    let totalFacturado = 0;
    let totalHonorarios = 0;
    let totalCostos = 0;
    let totalPools = 0;
    let totalInsumos = 0;
    const prestadoresSet = new Set<string>();
    const obrasSocialesSet = new Set<string>();

    const porSegmento = {
      Consultas: { cantidad: 0, facturado: 0, costos: 0 },
      Estudios: { cantidad: 0, facturado: 0, costos: 0 },
      Cirugias: { cantidad: 0, facturado: 0, costos: 0 },
    };

    const prestacionesAgregadas = new Map<string, {
      nombre: string;
      cantidad: number;
      facturado: number;
      costos: number;
    }>();

    const prestadoresAgregados = new Map<string, {
      nombre: string;
      cantidad: number;
      facturado: number;
      honorarios: number;
    }>();

    const obrasSocialesAgregadas = new Map<string, {
      nombre: string;
      sigla: string;
      cantidad: number;
      facturado: number;
      costos: number;
    }>();

    // Procesar cada prestación
    prestaciones.forEach(prest => {
      const facturado = prest.total || 0;
      const segmento = detectarSegmento(prest.prestacion);
      
      // Buscar receta de costos por nombre normalizado (igual que las demás páginas)
      const claveNombre = normalizarNombre(prest.prestacion);
      const receta = recetasMap.get(claveNombre) ?? null;
      const costoPools = Number(receta?.costo_total_pools) || 0;
      const costoInsumos = Number(receta?.costo_insumos_directos) || 0;
      const costoReceta = costoPools + costoInsumos;
      
      // Calcular honorarios
      let honorario = 0;
      if (prest.prestador) {
        const prestadorInfo = prestadoresMap.get(prest.prestador.toUpperCase());
        const esSocio = prestadorInfo?.es_socio || false;
        
        // Buscar configuración de honorarios por segmento
        const configSegmento = configHonorarios.find(c => c.segmento === segmento);
        if (configSegmento) {
          const porcentaje = esSocio 
            ? configSegmento.porcentaje_socio 
            : configSegmento.porcentaje_no_socio;
          honorario = facturado * (porcentaje / 100);
        }
      }

      // Acumular totales
      totalFacturado += facturado;
      totalHonorarios += honorario;
      totalPools += costoPools;
      totalInsumos += costoInsumos;
      totalCostos += honorario + costoReceta;

      // Por segmento
      porSegmento[segmento].cantidad++;
      porSegmento[segmento].facturado += facturado;
      porSegmento[segmento].costos += honorario + costoReceta;

      // Prestadores y OS únicos
      if (prest.prestador) prestadoresSet.add(prest.prestador);
      if (prest.os_sigla) obrasSocialesSet.add(prest.os_sigla);

      // Agregar por prestación
      const keyPrest = prest.prestacion;
      const existPrest = prestacionesAgregadas.get(keyPrest);
      if (existPrest) {
        existPrest.cantidad++;
        existPrest.facturado += facturado;
        existPrest.costos += honorario + costoReceta;
      } else {
        prestacionesAgregadas.set(keyPrest, {
          nombre: keyPrest,
          cantidad: 1,
          facturado,
          costos: honorario + costoReceta,
        });
      }

      // Agregar por prestador
      if (prest.prestador) {
        const keyPre = prest.prestador;
        const existPre = prestadoresAgregados.get(keyPre);
        if (existPre) {
          existPre.cantidad++;
          existPre.facturado += facturado;
          existPre.honorarios += honorario;
        } else {
          prestadoresAgregados.set(keyPre, {
            nombre: keyPre,
            cantidad: 1,
            facturado,
            honorarios: honorario,
          });
        }
      }

      // Agregar por OS
      if (prest.os_sigla) {
        const keyOS = prest.os_sigla;
        const existOS = obrasSocialesAgregadas.get(keyOS);
        if (existOS) {
          existOS.cantidad++;
          existOS.facturado += facturado;
          existOS.costos += honorario + costoReceta;
        } else {
          obrasSocialesAgregadas.set(keyOS, {
            nombre: prest.os_nombre || keyOS,
            sigla: keyOS,
            cantidad: 1,
            facturado,
            costos: honorario + costoReceta,
          });
        }
      }
    });

    // Calcular márgenes
    const margenBruto = totalFacturado - totalCostos;
    const margenPorcentaje = totalFacturado > 0 ? (margenBruto / totalFacturado) * 100 : 0;

    // Top 5 prestaciones por margen
    const topPrestaciones = Array.from(prestacionesAgregadas.values())
      .map(p => ({
        ...p,
        margen: p.facturado - p.costos,
        margenPct: p.facturado > 0 ? ((p.facturado - p.costos) / p.facturado) * 100 : 0,
      }))
      .sort((a, b) => b.margen - a.margen)
      .slice(0, 5);

    // Top 5 prestadores por facturación
    const topPrestadores = Array.from(prestadoresAgregados.values())
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 5);

    // Top 5 obras sociales por facturación
    const topObrasSociales = Array.from(obrasSocialesAgregadas.values())
      .map(os => ({
        ...os,
        margen: os.facturado - os.costos,
        margenPct: os.facturado > 0 ? ((os.facturado - os.costos) / os.facturado) * 100 : 0,
      }))
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 5);

    return {
      totalFacturado,
      totalHonorarios,
      totalCostos,
      margenBruto,
      margenPorcentaje,
      cantidadPrestaciones: prestaciones.length,
      ticketPromedio: prestaciones.length > 0 ? totalFacturado / prestaciones.length : 0,
      prestadoresActivos: prestadoresSet.size,
      obrasSocialesActivas: obrasSocialesSet.size,
      porSegmento: {
        Consultas: { 
          ...porSegmento.Consultas, 
          margen: porSegmento.Consultas.facturado > 0 
            ? ((porSegmento.Consultas.facturado - porSegmento.Consultas.costos) / porSegmento.Consultas.facturado) * 100 
            : 0 
        },
        Estudios: { 
          ...porSegmento.Estudios, 
          margen: porSegmento.Estudios.facturado > 0 
            ? ((porSegmento.Estudios.facturado - porSegmento.Estudios.costos) / porSegmento.Estudios.facturado) * 100 
            : 0 
        },
        Cirugias: { 
          ...porSegmento.Cirugias, 
          margen: porSegmento.Cirugias.facturado > 0 
            ? ((porSegmento.Cirugias.facturado - porSegmento.Cirugias.costos) / porSegmento.Cirugias.facturado) * 100 
            : 0 
        },
      },
      topPrestaciones,
      topPrestadores,
      topObrasSociales,
    };
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases]);

  // ============================================
  // RENDER
  // ============================================

  if (loading && prestaciones.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Cargando datos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Botón Generar Informe */}
      <div className="flex justify-end">
        <button
          onClick={() => setMostrarInforme(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"
        >
          <FileText className="w-4 h-4" /> Generar Informe PDF
        </button>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-6 gap-4">
        <KPICard
          title="Total Facturado"
          value={formatCurrency(analytics.totalFacturado)}
          subtitle={`${formatNumber(analytics.cantidadPrestaciones)} prestaciones`}
          icon={DollarSign}
          color="blue"
        />
        <KPICard
          title="Total Honorarios"
          value={formatCurrency(analytics.totalHonorarios)}
          subtitle={`${formatPercent(analytics.totalFacturado > 0 ? (analytics.totalHonorarios / analytics.totalFacturado) * 100 : 0)} del facturado`}
          icon={Users}
          color="purple"
        />
        <KPICard
          title="Total Costos"
          value={formatCurrency(analytics.totalCostos)}
          subtitle="Honorarios + Insumos"
          icon={FileBarChart}
          color="yellow"
        />
        <KPICard
          title="Margen Contrib."
          value={formatCurrency(analytics.margenBruto)}
          icon={analytics.margenBruto >= 0 ? TrendingUp : TrendingDown}
          color={analytics.margenBruto >= 0 ? 'green' : 'red'}
        />
        <KPICard
          title="% Margen Contrib."
          value={formatPercent(analytics.margenPorcentaje)}
          subtitle="Facturado - Costos var."
          icon={Percent}
          color={analytics.margenPorcentaje >= 30 ? 'green' : analytics.margenPorcentaje >= 0 ? 'yellow' : 'red'}
        />
        {/* ── NUEVO: Resultado Operativo ── */}
        {(() => {
          const resultadoOperativo = analytics.margenBruto - resumenCF.totalPromedio;
          const resultadoPct = analytics.totalFacturado > 0
            ? (resultadoOperativo / analytics.totalFacturado) * 100
            : 0;
          const color = getSemaforoColor(resultadoPct);
          const colorMap: Record<string, 'green' | 'yellow' | 'red'> = {
            verde: 'green', amarillo: 'yellow', rojo: 'red'
          };
          return (
            <div className="bg-white rounded-xl border p-4 border-emerald-200 bg-emerald-50 relative">
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                {resumenCF.sinDatos && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600">
                    <AlertTriangle className="w-3 h-3" /> Sin CF
                  </span>
                )}
              </div>
              <div className="mt-3">
                <p className="text-sm text-gray-500">Resultado Operativo</p>
                <p className={`text-2xl font-bold mt-1 ${resultadoOperativo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatCurrency(resultadoOperativo)}
                </p>
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium border ${semaforoClasses[color]}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${semaforoDot[color]}`} />
                  {formatPercent(resultadoPct)}
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  {resumenCF.sinDatos
                    ? 'CF: clasificá erogaciones'
                    : `CF: ${formatCurrency(resumenCF.totalPromedio)}/mes`
                  }
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* KPIs Secundarios */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="Ticket Promedio"
          value={formatCurrency(analytics.ticketPromedio)}
          icon={Activity}
          color="indigo"
        />
        <KPICard
          title="Prestadores Activos"
          value={formatNumber(analytics.prestadoresActivos)}
          icon={Users}
          color="blue"
        />
        <KPICard
          title="Obras Sociales"
          value={formatNumber(analytics.obrasSocialesActivas)}
          icon={Building2}
          color="purple"
        />
        <KPICard
          title="Productividad"
          value={analytics.prestadoresActivos > 0 
            ? formatNumber(Math.round(analytics.cantidadPrestaciones / analytics.prestadoresActivos))
            : '0'
          }
          subtitle="Prestaciones/Prestador"
          icon={Activity}
          color="green"
        />
      </div>

      {/* Segmentos */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Rendimiento por Segmento</h3>
        <div className="grid grid-cols-3 gap-6">
          {Object.entries(analytics.porSegmento).map(([segmento, data]) => (
            <div key={segmento} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">{segmento}</h4>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  data.margen >= 50 ? 'bg-green-100 text-green-700' :
                  data.margen >= 30 ? 'bg-blue-100 text-blue-700' :
                  data.margen >= 0 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {formatPercent(data.margen)} margen
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cantidad:</span>
                  <span className="font-medium">{formatNumber(data.cantidad)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Facturado:</span>
                  <span className="font-medium">{formatCurrency(data.facturado)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-3 gap-6">
        {/* Top Prestaciones */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Prestaciones</h3>
          <div className="space-y-1">
            {analytics.topPrestaciones.length > 0 ? (
              analytics.topPrestaciones.map((item, idx) => (
                <TopItem
                  key={item.nombre}
                  rank={idx + 1}
                  name={item.nombre.length > 40 ? item.nombre.substring(0, 40) + '...' : item.nombre}
                  value={item.margen}
                  percentage={item.margenPct}
                  type={item.margenPct >= 50 ? 'positive' : item.margenPct >= 0 ? 'neutral' : 'negative'}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Sin datos disponibles</p>
            )}
          </div>
        </div>

        {/* Top Prestadores */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Prestadores</h3>
          <div className="space-y-1">
            {analytics.topPrestadores.length > 0 ? (
              analytics.topPrestadores.map((item, idx) => (
                <TopItem
                  key={item.nombre}
                  rank={idx + 1}
                  name={item.nombre}
                  value={item.facturado}
                  percentage={(item.facturado / analytics.totalFacturado) * 100}
                  type="neutral"
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Sin datos disponibles</p>
            )}
          </div>
        </div>

        {/* Top Obras Sociales */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Obras Sociales</h3>
          <div className="space-y-1">
            {analytics.topObrasSociales.length > 0 ? (
              analytics.topObrasSociales.map((item, idx) => (
                <TopItem
                  key={item.sigla}
                  rank={idx + 1}
                  name={item.sigla}
                  value={item.facturado}
                  percentage={item.margenPct}
                  type={item.margenPct >= 50 ? 'positive' : item.margenPct >= 0 ? 'neutral' : 'negative'}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">Sin datos disponibles</p>
            )}
          </div>
        </div>
      </div>

      {/* Modal Informe de Gestión */}
      <InformeGestionModal isOpen={mostrarInforme} onClose={() => setMostrarInforme(false)} />
    </div>
  );
};

// ============================================
// PÁGINA WRAPPER
// ============================================

const DashboardMarginalPage: React.FC = () => {
  return (
    <MarginalLayout 
      title="Dashboard Análisis Marginal"
      subtitle="Vista general de rentabilidad y márgenes de contribución"
    >
      <DashboardMarginalContent />
    </MarginalLayout>
  );
};

export default DashboardMarginalPage;
