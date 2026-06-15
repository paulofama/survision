// ============================================
// POR PRESTADOR PAGE - v1.0
// Análisis Marginal - Sistema de Costos
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/analisis-marginal/PorPrestadorPage.tsx
// ============================================
// Rentabilidad por prestador (cirujano/médico)
// Flujo: Facturado → Variables → Margen Contrib → C.Fijos → Res.Op
// ============================================

import React, { useMemo, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserCheck,
  Loader2,
  FileBarChart,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Star,
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

interface PrestadorAgrupado {
  nombre: string;
  esSocio: boolean;
  cantidad: number;
  facturado: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  margenContrib: number;
  margenContribPct: number;
  ticketPromedio: number;
  // Desglose por segmento
  consultas: number;
  estudios: number;
  cirugias: number;
  // CF y resultado
  costoFijoAsignado: number;
  resultadoNeto: number;
  resultadoNetoPct: number;
}

type SortField = 'nombre' | 'cantidad' | 'facturado' | 'honorarios' | 'margenContrib' | 'margenContribPct' | 'ticketPromedio' | 'resultadoNeto' | 'resultadoNetoPct';
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
// BADGE SEMÁFORO
// ============================================

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

const PorPrestadorContent: React.FC = () => {
  const {
    prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, filtros, loading
  } = useMarginalContext();

  const anioActual = filtros?.anio || new Date().getFullYear();
  const mesActual  = filtros?.mes  || (new Date().getMonth() + 1);

  const { resumen: resumenCF, loading: loadingCF, calcularAsignacion } = useCostosFijosDistribucion(anioActual, mesActual);

  // Mapeo de nombres GECLISA → Receta
  const { agregarAliases } = useNombreMapping();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('facturado');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ============================================
  // PROCESAMIENTO DE DATOS
  // ============================================

  const prestadoresBase = useMemo(() => {
    if (prestaciones.length === 0) return [];

    const recetasMap = new Map(recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r]));
    agregarAliases(recetasMap);
    const prestadoresInfoMap = new Map(prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p]));

    const agrupado = new Map<string, {
      nombre: string; esSocio: boolean;
      cantidad: number; facturado: number; honorarios: number;
      costoPools: number; costoInsumos: number;
      consultas: number; estudios: number; cirugias: number;
    }>();

    prestaciones.forEach(prest => {
      const prestadorNombre = prest.prestador || 'SIN PRESTADOR';
      const facturado = prest.total || 0;
      const segmento = detectarSegmento(prest.prestacion);

      // Receta fuzzy
      const claveNombre = normalizarNombre(prest.prestacion);
      const receta = recetasMap.get(claveNombre) ?? null;
      const costoPools = Number(receta?.costo_total_pools) || 0;
      const costoInsumos = Number(receta?.costo_insumos_directos) || 0;

      // Honorarios
      const prestadorInfo = prestadoresInfoMap.get(prestadorNombre.toUpperCase());
      const esSocio = prestadorInfo?.es_socio || false;
      let honorario = 0;
      const configSeg = configHonorarios.find(c => c.segmento === segmento);
      if (configSeg) {
        const pct = esSocio ? configSeg.porcentaje_socio : configSeg.porcentaje_no_socio;
        honorario = facturado * (pct / 100);
      }

      const existing = agrupado.get(prestadorNombre);
      if (existing) {
        existing.cantidad++;
        existing.facturado += facturado;
        existing.honorarios += honorario;
        existing.costoPools += costoPools;
        existing.costoInsumos += costoInsumos;
        if (segmento === 'Consultas') existing.consultas++;
        if (segmento === 'Estudios') existing.estudios++;
        if (segmento === 'Cirugias') existing.cirugias++;
      } else {
        agrupado.set(prestadorNombre, {
          nombre: prestadorNombre, esSocio,
          cantidad: 1, facturado, honorarios: honorario,
          costoPools, costoInsumos,
          consultas: segmento === 'Consultas' ? 1 : 0,
          estudios: segmento === 'Estudios' ? 1 : 0,
          cirugias: segmento === 'Cirugias' ? 1 : 0,
        });
      }
    });

    return Array.from(agrupado.values()).map(item => {
      const costoTotal = item.honorarios + item.costoPools + item.costoInsumos;
      const margenContrib = item.facturado - costoTotal;
      const margenContribPct = item.facturado > 0 ? (margenContrib / item.facturado) * 100 : 0;
      const ticketPromedio = item.cantidad > 0 ? item.facturado / item.cantidad : 0;
      return { ...item, costoTotal, margenContrib, margenContribPct, ticketPromedio };
    });
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases]);

  // Total facturado para distribución CF
  const totalFacturadoGlobal = useMemo(
    () => prestadoresBase.reduce((s, p) => s + p.facturado, 0),
    [prestadoresBase]
  );

  // Agregar CF y Resultado Operativo
  const prestadoresAgrupados = useMemo((): PrestadorAgrupado[] => {
    return prestadoresBase.map(p => {
      const costoFijoAsignado = calcularAsignacion(p.facturado, totalFacturadoGlobal);
      const resultadoNeto = p.margenContrib - costoFijoAsignado;
      const resultadoNetoPct = p.facturado > 0 ? (resultadoNeto / p.facturado) * 100 : 0;
      return { ...p, costoFijoAsignado, resultadoNeto, resultadoNetoPct };
    });
  }, [prestadoresBase, calcularAsignacion, totalFacturadoGlobal]);

  // ============================================
  // FILTRADO Y ORDENAMIENTO
  // ============================================

  const prestadoresFiltrados = useMemo(() => {
    let resultado = prestadoresAgrupados;
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
        case 'honorarios': cmp = a.honorarios - b.honorarios; break;
        case 'margenContrib': cmp = a.margenContrib - b.margenContrib; break;
        case 'margenContribPct': cmp = a.margenContribPct - b.margenContribPct; break;
        case 'ticketPromedio': cmp = a.ticketPromedio - b.ticketPromedio; break;
        case 'resultadoNeto': cmp = a.resultadoNeto - b.resultadoNeto; break;
        case 'resultadoNetoPct': cmp = a.resultadoNetoPct - b.resultadoNetoPct; break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [prestadoresAgrupados, searchTerm, sortField, sortDirection]);

  // ============================================
  // TOTALES
  // ============================================

  const totales = useMemo(() => {
    const t = prestadoresFiltrados.reduce((acc, p) => ({
      cantidad: acc.cantidad + p.cantidad,
      facturado: acc.facturado + p.facturado,
      honorarios: acc.honorarios + p.honorarios,
      costoPools: acc.costoPools + p.costoPools,
      costoInsumos: acc.costoInsumos + p.costoInsumos,
      margenContrib: acc.margenContrib + p.margenContrib,
      costoFijoAsignado: acc.costoFijoAsignado + p.costoFijoAsignado,
      resultadoNeto: acc.resultadoNeto + p.resultadoNeto,
    }), { cantidad: 0, facturado: 0, honorarios: 0, costoPools: 0, costoInsumos: 0, margenContrib: 0, costoFijoAsignado: 0, resultadoNeto: 0 });

    return {
      ...t,
      margenContribPct: t.facturado > 0 ? (t.margenContrib / t.facturado) * 100 : 0,
      resultadoNetoPct: t.facturado > 0 ? (t.resultadoNeto / t.facturado) * 100 : 0,
    };
  }, [prestadoresFiltrados]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const toggleRow = (nombre: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(nombre) ? next.delete(nombre) : next.add(nombre);
      return next;
    });
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

  // ============================================
  // RENDER
  // ============================================

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

      {/* Barras Resultado */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-4 text-white flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm">Margen de Contribución</p>
            <p className="text-3xl font-bold">{formatPercent(totales.margenContribPct)}</p>
            <p className="text-blue-200 text-xs mt-1">Facturado − Honorarios − Pools − Insumos</p>
          </div>
          <div className="text-right text-blue-100 text-sm"><p>{formatCurrency(totales.margenContrib)}</p></div>
        </div>
        <div className={`rounded-xl p-4 text-white flex items-center justify-between ${
          totales.resultadoNetoPct > 20 ? 'bg-gradient-to-r from-green-600 to-green-800' :
          totales.resultadoNetoPct >= 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-700' :
          'bg-gradient-to-r from-red-600 to-red-800'
        }`}>
          <div>
            <p className="text-white/80 text-sm">Resultado Operativo</p>
            <p className="text-3xl font-bold">{formatPercent(totales.resultadoNetoPct)}</p>
            <p className="text-white/60 text-xs mt-1">Margen Contrib. − C.Fijos</p>
          </div>
          <div className="text-right text-white/80 text-sm">
            <p>{formatCurrency(totales.resultadoNeto)}</p>
            {!resumenCF.sinDatos && <p className="text-xs mt-1 text-white/60">CF: {formatCurrency(totales.costoFijoAsignado)}</p>}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Buscar prestador..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
        </div>
        <span className="text-sm text-gray-500">{prestadoresFiltrados.length} prestadores</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-2 py-3" />
                <ThSort field="nombre" align="left">Prestador</ThSort>
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
              {prestadoresFiltrados.length === 0 ? (
                <tr><td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                  <UserCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" /><p>No se encontraron prestadores</p>
                </td></tr>
              ) : (
                prestadoresFiltrados.map(prest => {
                  const isExpanded = expandedRows.has(prest.nombre);
                  return (
                    <React.Fragment key={prest.nombre}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-3">
                          <button onClick={() => toggleRow(prest.nombre)} className="p-1 hover:bg-gray-100 rounded">
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div>
                              <p className="font-medium">{prest.nombre}</p>
                              {prest.esSocio && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                                  <Star className="w-2.5 h-2.5" /> Socio
                                </span>
                              )}
                            </div>
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

                      {/* Fila expandida */}
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td />
                          <td colSpan={11} className="px-6 py-3">
                            <div className="flex flex-wrap gap-6 text-xs text-gray-600">
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Mix de Prácticas</span>
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Consultas: {prest.consultas}</span>
                                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">Estudios: {prest.estudios}</span>
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Cirugías: {prest.cirugias}</span>
                                </div>
                                <span className="mt-1">Ticket promedio: <strong>{formatCurrency(prest.ticketPromedio)}</strong></span>
                              </div>
                              <div className="border-l border-gray-300 pl-4 flex flex-col gap-1">
                                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Costos Variables</span>
                                <span>Honorarios: <strong className="text-purple-600">{formatCurrency(prest.honorarios)}</strong></span>
                                <span>Pools: <strong className="text-yellow-600">{formatCurrency(prest.costoPools)}</strong></span>
                                <span>Insumos: <strong className="text-orange-600">{formatCurrency(prest.costoInsumos)}</strong></span>
                                <span className="border-t pt-1 mt-1">Total: <strong>{formatCurrency(prest.costoTotal)}</strong></span>
                              </div>
                              <div className="border-l border-gray-300 pl-4 flex flex-col gap-1">
                                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Resultado</span>
                                <span>Margen: <strong className="text-blue-600">{formatCurrency(prest.margenContrib)}</strong> ({formatPercent(prest.margenContribPct)})</span>
                                <span>− C.Fijos: <strong className="text-teal-700">{formatCurrency(prest.costoFijoAsignado)}</strong></span>
                                <span className="border-t pt-1 mt-1 font-semibold">
                                  Res. Operativo: <strong className={prest.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}>{formatCurrency(prest.resultadoNeto)}</strong>
                                  {' '}<SemaforoBadge pct={prest.resultadoNetoPct} />
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {/* Footer */}
            {prestadoresFiltrados.length > 0 && (
              <tfoot className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <tr>
                  <td className="px-2 py-3" />
                  <td className="px-2 py-3 text-sm text-gray-700">TOTALES</td>
                  <td className="px-2 py-3 text-sm text-right text-gray-900">{formatNumber(totales.cantidad)}</td>
                  <td className="px-2 py-3 text-sm text-right text-blue-700">{formatCurrency(totales.facturado)}</td>
                  <td className="px-2 py-3 text-sm text-right text-purple-700 bg-purple-50/30">{formatCurrency(totales.honorarios)}</td>
                  <td className="px-2 py-3 text-sm text-right text-yellow-700 bg-yellow-50/30">{formatCurrency(totales.costoPools)}</td>
                  <td className="px-2 py-3 text-sm text-right text-orange-700 bg-orange-50/30">{formatCurrency(totales.costoInsumos)}</td>
                  <td className={`px-2 py-3 text-sm text-right font-bold ${totales.margenContrib >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(totales.margenContrib)}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      totales.margenContribPct >= 50 ? 'bg-green-100 text-green-700' :
                      totales.margenContribPct >= 30 ? 'bg-blue-100 text-blue-700' :
                      totales.margenContribPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{formatPercent(totales.margenContribPct)}</span>
                  </td>
                  <td className="px-2 py-3 text-sm text-right text-teal-700 bg-teal-50/30">{formatCurrency(totales.costoFijoAsignado)}</td>
                  <td className={`px-2 py-3 text-sm text-right font-bold ${totales.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatCurrency(totales.resultadoNeto)}
                  </td>
                  <td className="px-2 py-3 text-right"><SemaforoBadge pct={totales.resultadoNetoPct} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

const PorPrestadorPage: React.FC = () => (
  <MarginalLayout title="Análisis por Prestador" subtitle="Rentabilidad y productividad por profesional médico">
    <PorPrestadorContent />
  </MarginalLayout>
);

export default PorPrestadorPage;
