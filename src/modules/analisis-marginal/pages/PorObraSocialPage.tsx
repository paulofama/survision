// ============================================
// POR OBRA SOCIAL PAGE - v2.0
// Análisis Marginal - Sistema de Costos
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/analisis-marginal/PorObraSocialPage.tsx
// ============================================
// v2.0: Flujo correcto de análisis marginal
//       Variables → Margen Contrib → C.Fijos → Resultado Operativo
//       + costoInsumos + matching fuzzy + CF distribución
// ============================================

import React, { useMemo, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Users,
  FileBarChart,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { MarginalLayout, useMarginalContext } from '../components/MarginalLayout';
import useCostosFijosDistribucion, {
  getSemaforoColor,
  semaforoClasses,
  semaforoDot,
} from '@/hooks/useCostosFijosDistribucion';
import useNombreMapping from '@/hooks/useNombreMapping';

// ============================================
// TIPOS
// ============================================

interface ObraSocialAgrupada {
  sigla: string;
  nombre: string;
  esParticular: boolean;
  cantidad: number;
  pacientesUnicos: number;
  facturado: number;
  coseguro: number;
  cobertura: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  margenContrib: number;
  margenContribPct: number;
  ticketPromedio: number;
  // CF y resultado
  costoFijoAsignado: number;
  resultadoNeto: number;
  resultadoNetoPct: number;
  // Desglose por segmento
  consultas: number;
  estudios: number;
  cirugias: number;
}

type SortField = 'sigla' | 'cantidad' | 'facturado' | 'margenContrib' | 'margenContribPct' | 'ticketPromedio' | 'pacientesUnicos' | 'resultadoNeto' | 'resultadoNetoPct';
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

const PorObraSocialContent: React.FC = () => {
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

  const {
    resumen: resumenCF,
    loading: loadingCF,
    calcularAsignacion,
  } = useCostosFijosDistribucion(anioActual, mesActual);

  const { agregarAliases } = useNombreMapping();

  // Estados locales
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('facturado');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'os' | 'particular'>('todos');

  // ============================================
  // PROCESAMIENTO DE DATOS
  // ============================================

  const obrasSocialesBase = useMemo(() => {
    if (prestaciones.length === 0) return [];

    // Matching fuzzy por nombre (igual que PorPrestacionPage)
    const recetasMap = new Map(
      recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r])
    );
    agregarAliases(recetasMap);
    const prestadoresMap = new Map(prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p]));

    const agrupado = new Map<string, {
      sigla: string; nombre: string; esParticular: boolean;
      cantidad: number; pacientes: Set<string>;
      facturado: number; coseguro: number; cobertura: number;
      honorarios: number; costoPools: number; costoInsumos: number;
      consultas: number; estudios: number; cirugias: number;
    }>();

    prestaciones.forEach(prest => {
      const sigla = prest.os_sigla || 'SIN OS';
      const nombre = prest.os_nombre || 'Sin Obra Social';
      const esParticular = prest.particular === 'Particular' || sigla === 'PARTICULAR';
      const facturado = prest.total || 0;
      const coseguro = prest.coseguro || 0;
      const cobertura = prest.cobertura || 0;
      const segmento = detectarSegmento(prest.prestacion);

      // Matching fuzzy de receta
      const claveNombre = normalizarNombre(prest.prestacion);
      const receta = recetasMap.get(claveNombre) ?? null;
      const costoPools = Number(receta?.costo_total_pools) || 0;
      const costoInsumos = Number(receta?.costo_insumos_directos) || 0;

      // Honorarios
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

      const existing = agrupado.get(sigla);
      if (existing) {
        existing.cantidad++;
        existing.pacientes.add(prest.apellido_nombre || '');
        existing.facturado += facturado;
        existing.coseguro += coseguro;
        existing.cobertura += cobertura;
        existing.honorarios += honorario;
        existing.costoPools += costoPools;
        existing.costoInsumos += costoInsumos;
        if (segmento === 'Consultas') existing.consultas++;
        if (segmento === 'Estudios') existing.estudios++;
        if (segmento === 'Cirugias') existing.cirugias++;
      } else {
        const pacientes = new Set<string>();
        pacientes.add(prest.apellido_nombre || '');
        agrupado.set(sigla, {
          sigla, nombre, esParticular,
          cantidad: 1, pacientes, facturado, coseguro, cobertura,
          honorarios: honorario, costoPools, costoInsumos,
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
      return {
        sigla: item.sigla, nombre: item.nombre, esParticular: item.esParticular,
        cantidad: item.cantidad, pacientesUnicos: item.pacientes.size,
        facturado: item.facturado, coseguro: item.coseguro, cobertura: item.cobertura,
        honorarios: item.honorarios, costoPools: item.costoPools, costoInsumos: item.costoInsumos,
        costoTotal, margenContrib, margenContribPct, ticketPromedio,
        consultas: item.consultas, estudios: item.estudios, cirugias: item.cirugias,
      };
    });
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases]);

  // Total facturado para distribución CF
  const totalFacturadoGlobal = useMemo(
    () => obrasSocialesBase.reduce((s, os) => s + os.facturado, 0),
    [obrasSocialesBase]
  );

  // Agregar CF y Resultado Operativo
  const obrasSocialesAgrupadas = useMemo((): ObraSocialAgrupada[] => {
    return obrasSocialesBase.map(os => {
      const costoFijoAsignado = calcularAsignacion(os.facturado, totalFacturadoGlobal);
      const resultadoNeto = os.margenContrib - costoFijoAsignado;
      const resultadoNetoPct = os.facturado > 0 ? (resultadoNeto / os.facturado) * 100 : 0;
      return { ...os, costoFijoAsignado, resultadoNeto, resultadoNetoPct };
    });
  }, [obrasSocialesBase, calcularAsignacion, totalFacturadoGlobal]);

  // ============================================
  // FILTRADO Y ORDENAMIENTO
  // ============================================

  const obrasSocialesFiltradas = useMemo(() => {
    let resultado = obrasSocialesAgrupadas;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      resultado = resultado.filter(os => os.sigla.toLowerCase().includes(t) || os.nombre.toLowerCase().includes(t));
    }
    if (filtroTipo === 'os') resultado = resultado.filter(os => !os.esParticular);
    else if (filtroTipo === 'particular') resultado = resultado.filter(os => os.esParticular);

    return [...resultado].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'sigla': cmp = a.sigla.localeCompare(b.sigla); break;
        case 'cantidad': cmp = a.cantidad - b.cantidad; break;
        case 'facturado': cmp = a.facturado - b.facturado; break;
        case 'margenContrib': cmp = a.margenContrib - b.margenContrib; break;
        case 'margenContribPct': cmp = a.margenContribPct - b.margenContribPct; break;
        case 'ticketPromedio': cmp = a.ticketPromedio - b.ticketPromedio; break;
        case 'pacientesUnicos': cmp = a.pacientesUnicos - b.pacientesUnicos; break;
        case 'resultadoNeto': cmp = a.resultadoNeto - b.resultadoNeto; break;
        case 'resultadoNetoPct': cmp = a.resultadoNetoPct - b.resultadoNetoPct; break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [obrasSocialesAgrupadas, searchTerm, filtroTipo, sortField, sortDirection]);

  // ============================================
  // TOTALES
  // ============================================

  const totales = useMemo(() => {
    const t = obrasSocialesFiltradas.reduce((acc, os) => ({
      cantidad: acc.cantidad + os.cantidad,
      facturado: acc.facturado + os.facturado,
      honorarios: acc.honorarios + os.honorarios,
      costoPools: acc.costoPools + os.costoPools,
      costoInsumos: acc.costoInsumos + os.costoInsumos,
      margenContrib: acc.margenContrib + os.margenContrib,
      costoFijoAsignado: acc.costoFijoAsignado + os.costoFijoAsignado,
      resultadoNeto: acc.resultadoNeto + os.resultadoNeto,
      pacientes: acc.pacientes + os.pacientesUnicos,
    }), { cantidad: 0, facturado: 0, honorarios: 0, costoPools: 0, costoInsumos: 0, margenContrib: 0, costoFijoAsignado: 0, resultadoNeto: 0, pacientes: 0 });

    return {
      ...t,
      margenContribPct: t.facturado > 0 ? (t.margenContrib / t.facturado) * 100 : 0,
      resultadoNetoPct: t.facturado > 0 ? (t.resultadoNeto / t.facturado) * 100 : 0,
      totalFinanciadores: obrasSocialesFiltradas.length,
      obrasSociales: obrasSocialesFiltradas.filter(os => !os.esParticular),
      particulares: obrasSocialesFiltradas.filter(os => os.esParticular),
    };
  }, [obrasSocialesFiltradas]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 text-blue-600" />
      : <ArrowDown className="h-3 w-3 text-blue-600" />;
  };

  const ThSort: React.FC<{ field: SortField; children: React.ReactNode; align?: string }> = ({ field, children, align = 'right' }) => (
    <th
      className={`px-2 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'} gap-1`}>
        {children} <SortIcon field={field} />
      </div>
    </th>
  );

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
    <div className="space-y-4">

      {/* ── BANNER CF ────────────────────────────── */}
      {!resumenCF.sinDatos && !loadingCF && (
        <div className="flex items-center gap-4 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 text-blue-500" />
          <span>
            C.Fijos distribuidos por facturado relativo.
            Promedio <strong>{formatCurrency(resumenCF.totalPromedio)}/mes</strong>{' '}
            ({resumenCF.mesesUsados === 1 ? '1 mes' : `${resumenCF.mesesUsados} meses`} disponibles).
          </span>
        </div>
      )}

      {/* ── COMPARATIVA OS vs PARTICULARES ─────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">Obras Sociales</h3>
            <span className="ml-auto text-sm text-blue-600">{totales.obrasSociales.length} financiadores</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-blue-600">Prestaciones</p>
              <p className="text-lg font-bold text-blue-900">{formatNumber(totales.obrasSociales.reduce((s, o) => s + o.cantidad, 0))}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600">Facturado</p>
              <p className="text-lg font-bold text-blue-900">{formatCurrency(totales.obrasSociales.reduce((s, o) => s + o.facturado, 0))}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600">Pacientes</p>
              <p className="text-lg font-bold text-blue-900">{formatNumber(totales.obrasSociales.reduce((s, o) => s + o.pacientesUnicos, 0))}</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Particulares</h3>
            <span className="ml-auto text-sm text-green-600">{totales.particulares.length} tipos</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-green-600">Prestaciones</p>
              <p className="text-lg font-bold text-green-900">{formatNumber(totales.particulares.reduce((s, o) => s + o.cantidad, 0))}</p>
            </div>
            <div>
              <p className="text-xs text-green-600">Facturado</p>
              <p className="text-lg font-bold text-green-900">{formatCurrency(totales.particulares.reduce((s, o) => s + o.facturado, 0))}</p>
            </div>
            <div>
              <p className="text-xs text-green-600">Pacientes</p>
              <p className="text-lg font-bold text-green-900">{formatNumber(totales.particulares.reduce((s, o) => s + o.pacientesUnicos, 0))}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs + BARRAS RESULTADO ────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-4 text-white flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm">Margen de Contribución</p>
            <p className="text-3xl font-bold">{formatPercent(totales.margenContribPct)}</p>
            <p className="text-blue-200 text-xs mt-1">Facturado − Honorarios − Pools − Insumos</p>
          </div>
          <div className="text-right text-blue-100 text-sm">
            <p>{formatCurrency(totales.margenContrib)}</p>
          </div>
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

      {/* ── CONTROLES ────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar obra social..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="os">Solo Obras Sociales</option>
            <option value="particular">Solo Particulares</option>
          </select>
          <span className="text-sm text-gray-500">{obrasSocialesFiltradas.length} financiadores</span>
        </div>
      </div>

      {/* ── TABLA ────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Identificación */}
                <ThSort field="sigla" align="left">Obra Social</ThSort>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <ThSort field="cantidad">Cant.</ThSort>
                <ThSort field="pacientesUnicos">Pac.</ThSort>

                {/* Ingresos */}
                <ThSort field="facturado">Facturado</ThSort>

                {/* Variables */}
                <th className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase bg-purple-50/50 whitespace-nowrap">Honor.</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-yellow-600 uppercase bg-yellow-50/50 whitespace-nowrap">Pools</th>
                <th className="px-2 py-3 text-right text-xs font-medium text-orange-600 uppercase bg-orange-50/50 whitespace-nowrap">Insumos</th>

                {/* Margen */}
                <ThSort field="margenContrib">M. Contrib.</ThSort>
                <ThSort field="margenContribPct">M.C.%</ThSort>

                {/* CF */}
                <th className="px-2 py-3 text-right text-xs font-medium text-teal-600 uppercase bg-teal-50/50 whitespace-nowrap">C.Fijos</th>

                {/* Resultado */}
                <ThSort field="resultadoNeto">Res. Op.</ThSort>
                <ThSort field="resultadoNetoPct">R.O.%</ThSort>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {obrasSocialesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                    <Building2 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No se encontraron obras sociales</p>
                  </td>
                </tr>
              ) : (
                obrasSocialesFiltradas.map(os => (
                  <tr key={os.sigla} className="hover:bg-gray-50 transition-colors">
                    {/* OS */}
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        {os.esParticular
                          ? <Users className="h-4 w-4 text-green-500 flex-shrink-0" />
                          : <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        }
                        <div>
                          <p className="text-sm font-medium text-gray-900">{os.sigla}</p>
                          <p className="text-[10px] text-gray-400 truncate max-w-[160px]" title={os.nombre}>{os.nombre}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                        os.esParticular ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {os.esParticular ? 'Part.' : 'OS'}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-sm text-right text-gray-900">{formatNumber(os.cantidad)}</td>
                    <td className="px-2 py-3 text-sm text-right text-gray-500">{formatNumber(os.pacientesUnicos)}</td>

                    {/* Facturado */}
                    <td className="px-2 py-3 text-sm text-right font-medium text-blue-600">{formatCurrency(os.facturado)}</td>

                    {/* Variables */}
                    <td className="px-2 py-3 text-sm text-right text-purple-600 bg-purple-50/20">{formatCurrency(os.honorarios)}</td>
                    <td className="px-2 py-3 text-sm text-right text-yellow-600 bg-yellow-50/20">{formatCurrency(os.costoPools)}</td>
                    <td className="px-2 py-3 text-sm text-right text-orange-600 bg-orange-50/20">{formatCurrency(os.costoInsumos)}</td>

                    {/* Margen */}
                    <td className={`px-2 py-3 text-sm text-right font-semibold ${os.margenContrib >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(os.margenContrib)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        os.margenContribPct >= 50 ? 'bg-green-100 text-green-700' :
                        os.margenContribPct >= 30 ? 'bg-blue-100 text-blue-700' :
                        os.margenContribPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {formatPercent(os.margenContribPct)}
                      </span>
                    </td>

                    {/* CF */}
                    <td className="px-2 py-3 text-sm text-right text-teal-700 bg-teal-50/20">{formatCurrency(os.costoFijoAsignado)}</td>

                    {/* Resultado */}
                    <td className={`px-2 py-3 text-sm text-right font-semibold ${os.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {formatCurrency(os.resultadoNeto)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <SemaforoBadge pct={os.resultadoNetoPct} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Footer */}
            {obrasSocialesFiltradas.length > 0 && (
              <tfoot className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <tr>
                  <td className="px-2 py-3 text-sm text-gray-700">TOTALES</td>
                  <td className="px-2 py-3 text-center text-sm text-gray-500">—</td>
                  <td className="px-2 py-3 text-sm text-right text-gray-900">{formatNumber(totales.cantidad)}</td>
                  <td className="px-2 py-3 text-sm text-right text-gray-500">{formatNumber(totales.pacientes)}</td>
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
                    }`}>
                      {formatPercent(totales.margenContribPct)}
                    </span>
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

// ============================================
// PÁGINA WRAPPER
// ============================================

const PorObraSocialPage: React.FC = () => (
  <MarginalLayout
    title="Análisis por Obra Social"
    subtitle="Rentabilidad y volumen por financiador de salud"
  >
    <PorObraSocialContent />
  </MarginalLayout>
);

export default PorObraSocialPage;
