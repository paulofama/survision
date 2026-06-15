// ============================================
// POR GRUPO PAGE - v2.0
// Análisis Marginal - Sistema de Costos
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/analisis-marginal/PorGrupoPage.tsx
// ============================================
// v2.0: Flujo correcto de análisis marginal
//       + costoInsumos + matching fuzzy + CF distribución
// ============================================

import React, { useMemo, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  PieChart,
  Stethoscope,
  Microscope,
  Scissors,
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { MarginalLayout, useMarginalContext } from '../components/MarginalLayout';
import useCostosFijosDistribucion, {
  getSemaforoColor,
  semaforoClasses,
  semaforoDot,
} from '@shared/hooks/useCostosFijosDistribucion';
import useNombreMapping from '@shared/hooks/useNombreMapping';

// ============================================
// TIPOS
// ============================================

type Segmento = 'Consultas' | 'Estudios' | 'Cirugias';

interface PrestacionPorGrupo {
  nombre: string;
  codigo: string;
  cantidad: number;
  facturado: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  margenContrib: number;
  margenContribPct: number;
  tieneReceta: boolean;
  // CF
  costoFijoAsignado: number;
  resultadoNeto: number;
  resultadoNetoPct: number;
}

interface GrupoStats {
  segmento: Segmento;
  cantidad: number;
  prestacionesUnicas: number;
  facturado: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  margenContrib: number;
  margenContribPct: number;
  participacion: number;
  // CF
  costoFijoAsignado: number;
  resultadoNeto: number;
  resultadoNetoPct: number;
}

type SortField = 'nombre' | 'cantidad' | 'facturado' | 'margenContrib' | 'margenContribPct' | 'resultadoNeto' | 'resultadoNetoPct';
type SortDirection = 'asc' | 'desc';

// ============================================
// HELPERS
// ============================================

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatNumber = (num: number): string =>
  new Intl.NumberFormat('es-AR').format(num);

const formatPercent = (value: number): string =>
  `${value.toFixed(1)}%`;

const detectarSegmento = (nombrePrestacion: string): Segmento => {
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

const getSegmentoIcon = (seg: Segmento) => {
  switch (seg) { case 'Consultas': return Stethoscope; case 'Estudios': return Microscope; case 'Cirugias': return Scissors; }
};

const getSegmentoColor = (seg: Segmento) => {
  switch (seg) {
    case 'Consultas': return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700' };
    case 'Estudios':  return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700' };
    case 'Cirugias':  return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-600', badge: 'bg-green-100 text-green-700' };
  }
};

const SemaforoBadge: React.FC<{ pct: number }> = ({ pct }) => {
  const color = getSemaforoColor(pct);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${semaforoClasses[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${semaforoDot[color]}`} />
      {formatPercent(pct)}
    </span>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PorGrupoContent: React.FC = () => {
  const {
    prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, filtros, loading
  } = useMarginalContext();

  const anioActual = Number(filtros?.anio) || new Date().getFullYear();
  const mesActual  = Number(filtros?.mes)  || (new Date().getMonth() + 1);

  const { resumen: resumenCF, loading: loadingCF, calcularAsignacion } = useCostosFijosDistribucion(anioActual, mesActual);

  const { agregarAliases } = useNombreMapping();

  const [segmentoSeleccionado, setSegmentoSeleccionado] = useState<Segmento | 'todos'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('facturado');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // ============================================
  // PROCESAMIENTO DE DATOS
  // ============================================

  const { gruposStats, prestacionesPorGrupo, totalFacturadoGlobal } = useMemo(() => {
    if (prestaciones.length === 0) return { gruposStats: [] as GrupoStats[], prestacionesPorGrupo: new Map<Segmento, PrestacionPorGrupo[]>(), totalFacturadoGlobal: 0 };

    const recetasMap = new Map(recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r]));
    agregarAliases(recetasMap);
    const prestadoresMap = new Map(prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p]));

    const acumulado = new Map<Segmento, {
      cantidad: number; facturado: number; honorarios: number; costoPools: number; costoInsumos: number;
      prestaciones: Map<string, PrestacionPorGrupo>;
    }>();

    (['Consultas', 'Estudios', 'Cirugias'] as Segmento[]).forEach(seg => {
      acumulado.set(seg, { cantidad: 0, facturado: 0, honorarios: 0, costoPools: 0, costoInsumos: 0, prestaciones: new Map() });
    });

    prestaciones.forEach(prest => {
      const segmento = detectarSegmento(prest.prestacion);
      const facturado = prest.total || 0;

      const claveNombre = normalizarNombre(prest.prestacion);
      const receta = recetasMap.get(claveNombre) ?? null;
      const costoPools = Number(receta?.costo_total_pools) || 0;
      const costoInsumos = Number(receta?.costo_insumos_directos) || 0;

      let honorario = 0;
      if (prest.prestador) {
        const prestadorInfo = prestadoresMap.get(prest.prestador.toUpperCase());
        const esSocio = prestadorInfo?.es_socio || false;
        const configSeg = configHonorarios.find(c => c.segmento === segmento);
        if (configSeg) {
          const pct = esSocio ? configSeg.porcentaje_socio : configSeg.porcentaje_no_socio;
          honorario = facturado * (pct / 100);
        }
      }

      const segData = acumulado.get(segmento)!;
      segData.cantidad++;
      segData.facturado += facturado;
      segData.honorarios += honorario;
      segData.costoPools += costoPools;
      segData.costoInsumos += costoInsumos;

      const nombre = prest.prestacion;
      const existing = segData.prestaciones.get(nombre);
      if (existing) {
        existing.cantidad++;
        existing.facturado += facturado;
        existing.honorarios += honorario;
        existing.costoPools += costoPools;
        existing.costoInsumos += costoInsumos;
      } else {
        segData.prestaciones.set(nombre, {
          nombre, codigo: '', cantidad: 1, facturado,
          honorarios: honorario, costoPools, costoInsumos,
          costoTotal: 0, margenContrib: 0, margenContribPct: 0,
          tieneReceta: receta !== null,
          costoFijoAsignado: 0, resultadoNeto: 0, resultadoNetoPct: 0,
        });
      }
    });

    let totalFact = 0;
    acumulado.forEach(d => { totalFact += d.facturado; });

    const gruposStats: GrupoStats[] = [];
    const prestacionesPorGrupo = new Map<Segmento, PrestacionPorGrupo[]>();

    acumulado.forEach((data, segmento) => {
      const costoTotal = data.honorarios + data.costoPools + data.costoInsumos;
      const margenContrib = data.facturado - costoTotal;
      const margenContribPct = data.facturado > 0 ? (margenContrib / data.facturado) * 100 : 0;

      gruposStats.push({
        segmento, cantidad: data.cantidad, prestacionesUnicas: data.prestaciones.size,
        facturado: data.facturado, honorarios: data.honorarios,
        costoPools: data.costoPools, costoInsumos: data.costoInsumos, costoTotal,
        margenContrib, margenContribPct,
        participacion: totalFact > 0 ? (data.facturado / totalFact) * 100 : 0,
        costoFijoAsignado: 0, resultadoNeto: 0, resultadoNetoPct: 0,
      });

      const prests: PrestacionPorGrupo[] = [];
      data.prestaciones.forEach(p => {
        p.costoTotal = p.honorarios + p.costoPools + p.costoInsumos;
        p.margenContrib = p.facturado - p.costoTotal;
        p.margenContribPct = p.facturado > 0 ? (p.margenContrib / p.facturado) * 100 : 0;
        prests.push(p);
      });
      prestacionesPorGrupo.set(segmento, prests);
    });

    return { gruposStats, prestacionesPorGrupo, totalFacturadoGlobal: totalFact };
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases]);

  // Agregar CF a grupos y prestaciones
  const gruposConCF = useMemo((): GrupoStats[] => {
    return gruposStats.map(g => {
      const cf = calcularAsignacion(g.facturado, totalFacturadoGlobal);
      return { ...g, costoFijoAsignado: cf, resultadoNeto: g.margenContrib - cf, resultadoNetoPct: g.facturado > 0 ? ((g.margenContrib - cf) / g.facturado) * 100 : 0 };
    });
  }, [gruposStats, calcularAsignacion, totalFacturadoGlobal]);

  // ============================================
  // PRESTACIONES FILTRADAS CON CF
  // ============================================

  const prestacionesFiltradas = useMemo(() => {
    let resultado: PrestacionPorGrupo[] = [];
    if (segmentoSeleccionado === 'todos') {
      prestacionesPorGrupo.forEach(prests => { resultado = resultado.concat(prests); });
    } else {
      resultado = prestacionesPorGrupo.get(segmentoSeleccionado) || [];
    }

    // Agregar CF
    resultado = resultado.map(p => {
      const cf = calcularAsignacion(p.facturado, totalFacturadoGlobal);
      return { ...p, costoFijoAsignado: cf, resultadoNeto: p.margenContrib - cf, resultadoNetoPct: p.facturado > 0 ? ((p.margenContrib - cf) / p.facturado) * 100 : 0 };
    });

    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      resultado = resultado.filter(p => p.nombre.toLowerCase().includes(t));
    }

    return [...resultado].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'nombre': cmp = a.nombre.localeCompare(b.nombre); break;
        case 'cantidad': cmp = a.cantidad - b.cantidad; break;
        case 'facturado': cmp = a.facturado - b.facturado; break;
        case 'margenContrib': cmp = a.margenContrib - b.margenContrib; break;
        case 'margenContribPct': cmp = a.margenContribPct - b.margenContribPct; break;
        case 'resultadoNeto': cmp = a.resultadoNeto - b.resultadoNeto; break;
        case 'resultadoNetoPct': cmp = a.resultadoNetoPct - b.resultadoNetoPct; break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [prestacionesPorGrupo, segmentoSeleccionado, searchTerm, sortField, sortDirection, calcularAsignacion, totalFacturadoGlobal]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-blue-600" /> : <ArrowDown className="h-3 w-3 text-blue-600" />;
  };

  const ThSort: React.FC<{ field: SortField; children: React.ReactNode; align?: string }> = ({ field, children, align = 'right' }) => (
    <th className={`px-2 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap`} onClick={() => handleSort(field)}>
      <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'} gap-1`}>{children} <SortIcon field={field} /></div>
    </th>
  );

  if (loading && prestaciones.length === 0) {
    return (<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><span className="ml-3 text-gray-600">Cargando datos...</span></div>);
  }

  return (
    <div className="space-y-4">

      {/* Banner CF */}
      {!resumenCF.sinDatos && !loadingCF && (
        <div className="flex items-center gap-4 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 text-blue-500" />
          <span>C.Fijos distribuidos por facturado relativo. Promedio <strong>{formatCurrency(resumenCF.totalPromedio)}/mes</strong> ({resumenCF.mesesUsados} meses disponibles).</span>
        </div>
      )}

      {/* Cards por Segmento */}
      <div className="grid grid-cols-3 gap-4">
        {gruposConCF.map(grupo => {
          const Icon = getSegmentoIcon(grupo.segmento);
          const colors = getSegmentoColor(grupo.segmento);
          const isSelected = segmentoSeleccionado === grupo.segmento;

          return (
            <button
              key={grupo.segmento}
              onClick={() => setSegmentoSeleccionado(segmentoSeleccionado === grupo.segmento ? 'todos' : grupo.segmento)}
              className={`${colors.bg} ${colors.border} border-2 rounded-xl p-4 text-left transition-all hover:shadow-md ${isSelected ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${colors.icon}`} />
                  <h3 className={`font-semibold ${colors.text}`}>{grupo.segmento}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                  {formatPercent(grupo.participacion)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Prestaciones</p>
                  <p className="font-bold text-gray-900">{formatNumber(grupo.cantidad)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Facturado</p>
                  <p className="font-bold text-gray-900">{formatCurrency(grupo.facturado)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">M. Contribución</p>
                  <p className={`font-bold ${grupo.margenContrib >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(grupo.margenContribPct)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Res. Operativo</p>
                  <SemaforoBadge pct={grupo.resultadoNetoPct} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Indicador de selección */}
      {segmentoSeleccionado !== 'todos' && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Activity className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700">Mostrando: <strong>{segmentoSeleccionado}</strong></span>
          <button onClick={() => setSegmentoSeleccionado('todos')} className="ml-auto text-sm text-blue-600 hover:text-blue-800 underline">Ver todos</button>
        </div>
      )}

      {/* Controles */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Buscar prestación..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
        </div>
        <span className="text-sm text-gray-500">{formatNumber(prestacionesFiltradas.length)} prestaciones</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <ThSort field="nombre" align="left">Prestación</ThSort>
                <ThSort field="cantidad">Cant.</ThSort>
                <ThSort field="facturado">Facturado</ThSort>
                <th className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase bg-purple-50/50 whitespace-nowrap">Honor.</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-yellow-600 uppercase bg-yellow-50/50 whitespace-nowrap">Pools</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-orange-600 uppercase bg-orange-50/50 whitespace-nowrap">Insumos</th>
                <ThSort field="margenContrib">M. Contrib.</ThSort>
                <ThSort field="margenContribPct">M.C.%</ThSort>
                <th className="px-2 py-3 text-right text-xs font-medium text-teal-600 uppercase bg-teal-50/50 whitespace-nowrap">C.Fijos</th>
                <ThSort field="resultadoNeto">Res. Op.</ThSort>
                <ThSort field="resultadoNetoPct">R.O.%</ThSort>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {prestacionesFiltradas.length === 0 ? (
                <tr><td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                  <PieChart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>No se encontraron prestaciones</p>
                </td></tr>
              ) : (
                prestacionesFiltradas.map((prest, idx) => (
                  <tr key={`${prest.nombre}-${idx}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-2 py-3 text-sm text-gray-900 max-w-[240px]">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate" title={prest.nombre}>{prest.nombre}</p>
                        {!prest.tieneReceta && <span title="Sin receta" className="inline-flex flex-shrink-0"><AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /></span>}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-sm text-right text-gray-900">{formatNumber(prest.cantidad)}</td>
                    <td className="px-2 py-3 text-sm text-right font-medium text-blue-600">{formatCurrency(prest.facturado)}</td>
                    <td className="px-2 py-3 text-sm text-right text-purple-600 bg-purple-50/20">{formatCurrency(prest.honorarios)}</td>
                    <td className="px-2 py-3 text-sm text-right text-yellow-600 bg-yellow-50/20">{formatCurrency(prest.costoPools)}</td>
                    <td className="px-2 py-3 text-sm text-right text-orange-600 bg-orange-50/20">{formatCurrency(prest.costoInsumos)}</td>
                    <td className={`px-2 py-3 text-sm text-right font-semibold ${prest.margenContrib >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(prest.margenContrib)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        prest.margenContribPct >= 50 ? 'bg-green-100 text-green-700' :
                        prest.margenContribPct >= 30 ? 'bg-blue-100 text-blue-700' :
                        prest.margenContribPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{formatPercent(prest.margenContribPct)}</span>
                    </td>
                    <td className="px-2 py-3 text-sm text-right text-teal-700 bg-teal-50/20">{formatCurrency(prest.costoFijoAsignado)}</td>
                    <td className={`px-2 py-3 text-sm text-right font-semibold ${prest.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {formatCurrency(prest.resultadoNeto)}
                    </td>
                    <td className="px-2 py-3 text-right"><SemaforoBadge pct={prest.resultadoNetoPct} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PorGrupoPage: React.FC = () => (
  <MarginalLayout title="Análisis por Grupo de Prácticas" subtitle="Rentabilidad comparativa por tipo: Consultas, Estudios y Cirugías">
    <PorGrupoContent />
  </MarginalLayout>
);

export default PorGrupoPage;
