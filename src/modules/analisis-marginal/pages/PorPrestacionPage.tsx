// ============================================
// POR PRESTACION PAGE - v3.0
// Análisis Marginal - Sistema Integral de Gestión
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/analisis-marginal/PorPrestacionPage.tsx
// ============================================
// v3.2: Tabla reestructurada con flujo de análisis marginal correcto
//       Variables → Margen Contrib → C.Fijos → Resultado Operativo
//       + Indicador visual de prestaciones sin receta de costos
// ============================================

import React, { useMemo, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  ChevronDown,
  ChevronUp,
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

interface PrestacionAgrupada {
  nombre: string;
  codigo: string;
  segmento: 'Consultas' | 'Estudios' | 'Cirugias';
  cantidad: number;
  facturado: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  margenContrib: number;
  margenContribPct: number;
  tieneReceta: boolean;
  // Costos fijos (calculados después)
  costoFijoAsignado: number;
  resultadoNeto: number;
  resultadoNetoPct: number;
}

type SortField =
  | 'nombre' | 'cantidad' | 'facturado'
  | 'honorarios' | 'costoPools' | 'costoInsumos' | 'costoTotal'
  | 'margenContrib' | 'margenContribPct'
  | 'costoFijoAsignado' | 'resultadoNeto' | 'resultadoNetoPct';

type SortDirection = 'asc' | 'desc';

// ============================================
// HELPERS
// ============================================

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const formatNumber = (num: number): string =>
  new Intl.NumberFormat('es-AR').format(num);

const formatPercent = (value: number): string =>
  `${value.toFixed(1)}%`;

const detectarSegmento = (nombre: string): 'Consultas' | 'Estudios' | 'Cirugias' => {
  const n = nombre.toUpperCase();
  if (n.includes('CONSULTA') || n.includes('CONTROL') || n.includes('PRIMERA VEZ') ||
      n.includes('VISITA') || n.includes('URGENCIA') || n.includes('GUARDIA') ||
      n.includes('RECETA') || n.includes('VER ESTUDIO')) return 'Consultas';
  if (n.includes('CIRUGIA') || n.includes('QUIRURGIC') || n.includes('FACO') ||
      n.includes('VITRECTOMIA') || n.includes('TRABECULECTOMIA') || n.includes('IMPLANTE') ||
      n.includes('EXTRACCION') || n.includes('TRASPLANTE') || n.includes('INYECCION') ||
      n.includes('LASER') || n.includes('PTERIGION') || n.includes('CHALAZION') ||
      n.includes('NEEDLING') || n.includes('CROSS LINKING')) return 'Cirugias';
  return 'Estudios';
};

const extraerCodigo = (nombre: string): string => {
  const match = nombre.match(/\((\d{5,6})\)/);
  return match ? match[1].padStart(6, '0') : '';
};

// Normaliza un nombre para matching fuzzy:
// "EXO OFTALMOLOGÍA" → "exoftalmologia"
// "Exoftalmologia"   → "exoftalmologia"  ✓ coinciden
const normalizarNombre = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9]/g, '');      // quitar espacios y especiales

// ============================================
// COMPONENTE TOOLTIP DE COSTOS FIJOS
// ============================================

const TooltipCF: React.FC<{ texto: string; sinDatos: boolean }> = ({ texto, sinDatos }) => {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="ml-1 text-gray-400 hover:text-gray-600"
        type="button"
      >
        {sinDatos
          ? <AlertTriangle className="w-3 h-3 text-yellow-500" />
          : <Info className="w-3 h-3" />
        }
      </button>
      {visible && (
        <span className="absolute bottom-5 left-0 z-50 min-w-max max-w-xs bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed whitespace-pre-line">
          {texto}
        </span>
      )}
    </span>
  );
};

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

const PorPrestacionContent: React.FC = () => {
  const {
    prestaciones,
    recetasConPools,
    configHonorarios,
    prestadoresHonorarios,
    filtros,
    loading,
  } = useMarginalContext();

  // Obtener período del contexto (fallback: mes/año actual)
  const anioActual = filtros?.anio || new Date().getFullYear();
  const mesActual  = filtros?.mes  || (new Date().getMonth() + 1);

  const {
    resumen: resumenCF,
    loading: loadingCF,
    calcularAsignacion,
    getTooltipTexto,
  } = useCostosFijosDistribucion(anioActual, mesActual);

  // Mapeo de nombres GECLISA → Receta
  const { agregarAliases } = useNombreMapping();

  // Estados locales
  const [searchTerm, setSearchTerm]         = useState('');
  const [sortField, setSortField]           = useState<SortField>('facturado');
  const [sortDirection, setSortDirection]   = useState<SortDirection>('desc');
  const [expandedRows, setExpandedRows]     = useState<Set<string>>(new Set());

  // ============================================
  // PROCESAMIENTO DE DATOS
  // ============================================

  const prestacionesBase = useMemo((): Omit<PrestacionAgrupada, 'costoFijoAsignado' | 'resultadoNeto' | 'resultadoNetoPct'>[] => {
    if (prestaciones.length === 0) return [];

    // Mapa de recetas por nombre normalizado (matching fuzzy)
    // Clave: "exoftalmologia", "guardiaFueraDeHorario", etc.
    const recetasMap = new Map(
      recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r])
    );
    agregarAliases(recetasMap); // Agregar aliases de prestaciones_nombre_mapping
    const prestadoresMap = new Map(prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p]));

    const agrupado = new Map<string, {
      nombre: string; codigo: string; segmento: 'Consultas' | 'Estudios' | 'Cirugias';
      cantidad: number; facturado: number; honorarios: number; costoPools: number; costoInsumos: number;
      tieneReceta: boolean;
    }>();

    prestaciones.forEach(prest => {
      const nombre   = prest.prestacion;
      const facturado = prest.total || 0;
      const codigo   = extraerCodigo(nombre);
      const segmento = detectarSegmento(nombre);

      const claveNombre = normalizarNombre(nombre);
      const receta      = recetasMap.get(claveNombre) ?? null;
      const costoPools  = Number(receta?.costo_total_pools) || 0;
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

      const existing = agrupado.get(nombre);
      if (existing) {
        existing.cantidad++;
        existing.facturado  += facturado;
        existing.honorarios += honorario;
        existing.costoPools += costoPools;
        existing.costoInsumos += costoInsumos;
      } else {
        agrupado.set(nombre, {
          nombre, codigo, segmento,
          cantidad: 1, facturado,
          honorarios: honorario, costoPools, costoInsumos,
          tieneReceta: receta !== null,
        });
      }
    });

    return Array.from(agrupado.values()).map(item => {
      const costoTotal     = item.honorarios + item.costoPools + item.costoInsumos;
      const margenContrib  = item.facturado - costoTotal;
      const margenContribPct = item.facturado > 0 ? (margenContrib / item.facturado) * 100 : 0;
      return { ...item, costoTotal, margenContrib, margenContribPct };
    });
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases]);

  // Total facturado para calcular ratios de distribución CF
  const totalFacturadoGlobal = useMemo(
    () => prestacionesBase.reduce((s, p) => s + p.facturado, 0),
    [prestacionesBase]
  );

  // Agregar columnas de costos fijos
  const prestacionesAgrupadas = useMemo((): PrestacionAgrupada[] => {
    return prestacionesBase.map(p => {
      const costoFijoAsignado = calcularAsignacion(p.facturado, totalFacturadoGlobal);
      const resultadoNeto     = p.margenContrib - costoFijoAsignado;
      const resultadoNetoPct  = p.facturado > 0 ? (resultadoNeto / p.facturado) * 100 : 0;
      return { ...p, costoFijoAsignado, resultadoNeto, resultadoNetoPct };
    });
  }, [prestacionesBase, calcularAsignacion, totalFacturadoGlobal]);

  // ============================================
  // FILTRADO Y ORDENAMIENTO
  // ============================================

  const prestacionesFiltradas = useMemo(() => {
    let r = prestacionesAgrupadas;

    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      r = r.filter(p => p.nombre.toLowerCase().includes(t) || p.codigo.includes(t));
    }
    if (filtros.segmento) {
      r = r.filter(p => p.segmento === filtros.segmento);
    }

    return [...r].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'nombre':          cmp = a.nombre.localeCompare(b.nombre); break;
        case 'cantidad':        cmp = a.cantidad - b.cantidad; break;
        case 'facturado':       cmp = a.facturado - b.facturado; break;
        case 'honorarios':      cmp = a.honorarios - b.honorarios; break;
        case 'costoPools':      cmp = a.costoPools - b.costoPools; break;
        case 'costoInsumos':    cmp = a.costoInsumos - b.costoInsumos; break;
        case 'costoTotal':      cmp = a.costoTotal - b.costoTotal; break;
        case 'margenContrib':   cmp = a.margenContrib - b.margenContrib; break;
        case 'margenContribPct':cmp = a.margenContribPct - b.margenContribPct; break;
        case 'costoFijoAsignado': cmp = a.costoFijoAsignado - b.costoFijoAsignado; break;
        case 'resultadoNeto':   cmp = a.resultadoNeto - b.resultadoNeto; break;
        case 'resultadoNetoPct':cmp = a.resultadoNetoPct - b.resultadoNetoPct; break;
      }
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  }, [prestacionesAgrupadas, searchTerm, filtros.segmento, sortField, sortDirection]);

  // ============================================
  // TOTALES
  // ============================================

  const totales = useMemo(() => {
    const t = prestacionesFiltradas.reduce((acc, p) => ({
      cantidad:           acc.cantidad + p.cantidad,
      facturado:          acc.facturado + p.facturado,
      honorarios:         acc.honorarios + p.honorarios,
      costoPools:         acc.costoPools + p.costoPools,
      costoInsumos:       acc.costoInsumos + p.costoInsumos,
      costoTotal:         acc.costoTotal + p.costoTotal,
      margenContrib:      acc.margenContrib + p.margenContrib,
      costoFijoAsignado:  acc.costoFijoAsignado + p.costoFijoAsignado,
      resultadoNeto:      acc.resultadoNeto + p.resultadoNeto,
    }), {
      cantidad: 0, facturado: 0, honorarios: 0, costoPools: 0,
      costoInsumos: 0, costoTotal: 0, margenContrib: 0,
      costoFijoAsignado: 0, resultadoNeto: 0,
    });

    const margenContribPct = t.facturado > 0 ? (t.margenContrib / t.facturado) * 100 : 0;
    const resultadoNetoPct = t.facturado > 0 ? (t.resultadoNeto / t.facturado) * 100 : 0;

    return { ...t, margenContribPct, resultadoNetoPct };
  }, [prestacionesFiltradas]);

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

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 text-blue-600" />
      : <ArrowDown className="h-3 w-3 text-blue-600" />;
  };

  const ThSortable: React.FC<{ field: SortField; children: React.ReactNode; align?: string }> = ({
    field, children, align = 'right'
  }) => (
    <th
      className={`px-3 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'} gap-1`}>
        {children} <SortIcon field={field} />
      </div>
    </th>
  );

  // ============================================
  // LOADING
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Cargando prestaciones...</span>
      </div>
    );
  }

  const colSpanTotal = 14;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-4">

      {/* ── BANNER COSTOS FIJOS ─────────────────────────────── */}
      {resumenCF.sinDatos && !loadingCF && (
        <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-yellow-500" />
          <span>
            No hay costos fijos clasificados en los últimos 3 meses.
            El análisis de Resultado Operativo mostrará <strong>$0</strong> en C.Fijos.
            Clasificá erogaciones en <strong>Costos Fijos</strong> para activar este análisis.
          </span>
        </div>
      )}

      {!resumenCF.sinDatos && !loadingCF && (
        <div className="flex items-center gap-4 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 text-blue-500" />
          <span>
            C.Fijos distribuidos por facturado relativo.
            Promedio <strong>{formatCurrency(resumenCF.totalPromedio)}/mes</strong>{' '}
            ({resumenCF.mesesUsados === 1 ? '1 mes' : `${resumenCF.mesesUsados} meses`} disponibles).
          </span>
          {resumenCF.porCategoria.length > 0 && (
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              {resumenCF.porCategoria.slice(0, 3).map(cat => (
                <span
                  key={cat.categoria_nombre}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: `${cat.categoria_color}20`, color: cat.categoria_color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.categoria_color }} />
                  {cat.categoria_nombre} ({formatPercent(cat.porcentaje)})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Prestaciones</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(prestacionesFiltradas.length)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Cantidad</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(totales.cantidad)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Facturado</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totales.facturado)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Honorarios</p>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totales.honorarios)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Costos Pools</p>
          <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totales.costoPools)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">C. Insumos</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totales.costoInsumos)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Margen Contrib.</p>
          <p className={`text-2xl font-bold ${totales.margenContrib >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totales.margenContrib)}
          </p>
        </div>
      </div>

      {/* ── BARRAS DE RESULTADO ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Margen de Contribución */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-4 text-white flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm">Margen de Contribución</p>
            <p className="text-3xl font-bold">{formatPercent(totales.margenContribPct)}</p>
            <p className="text-blue-200 text-xs mt-1">Facturado − Honorarios − Insumos</p>
          </div>
          <div className="text-right text-blue-100 text-sm">
            <p>{formatCurrency(totales.margenContrib)}</p>
          </div>
        </div>

        {/* Resultado Operativo */}
        <div className={`rounded-xl p-4 text-white flex items-center justify-between ${
          totales.resultadoNetoPct > 20
            ? 'bg-gradient-to-r from-green-600 to-green-800'
            : totales.resultadoNetoPct >= 0
            ? 'bg-gradient-to-r from-yellow-500 to-yellow-700'
            : 'bg-gradient-to-r from-red-600 to-red-800'
        }`}>
          <div>
            <p className="text-white/80 text-sm">Resultado Operativo</p>
            <p className="text-3xl font-bold">{formatPercent(totales.resultadoNetoPct)}</p>
            <p className="text-white/60 text-xs mt-1">Margen Contrib. − C.Fijos</p>
          </div>
          <div className="text-right text-white/80 text-sm">
            <p>{formatCurrency(totales.resultadoNeto)}</p>
            {!resumenCF.sinDatos && (
              <p className="text-xs mt-1 text-white/60">
                CF: {formatCurrency(totales.costoFijoAsignado)}
              </p>
            )}
            {resumenCF.sinDatos && (
              <p className="text-xs mt-1 text-yellow-200 flex items-center justify-end gap-1">
                <AlertTriangle className="w-3 h-3" /> Sin CF clasificados
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── BÚSQUEDA + CONTROLES ────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {formatNumber(prestacionesFiltradas.length)} de {formatNumber(prestacionesAgrupadas.length)}
          </span>
          {(() => {
            const sinReceta = prestacionesFiltradas.filter(p => !p.tieneReceta).length;
            return sinReceta > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200" title="Prestaciones sin receta de costos asignada — pools e insumos en $0">
                <AlertTriangle className="w-3 h-3" />
                {sinReceta} sin receta
              </span>
            ) : null;
          })()}
        </div>
      </div>

      {/* ── TABLA ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Expansor de fila */}
                <th className="w-8 px-2 py-3" />

                {/* ── IDENTIFICACIÓN ─── */}
                <ThSortable field="nombre" align="left">Prestación</ThSortable>
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Seg.</th>
                <ThSortable field="cantidad">Cant.</ThSortable>

                {/* ── INGRESOS ─── */}
                <ThSortable field="facturado">Facturado</ThSortable>

                {/* ── COSTOS VARIABLES ─── */}
                <th className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase bg-purple-50/50 whitespace-nowrap">
                  Honorarios
                </th>
                <th className="px-2 py-3 text-right text-xs font-medium text-yellow-600 uppercase bg-yellow-50/50 whitespace-nowrap">
                  Pools
                </th>
                <th className="px-2 py-3 text-right text-xs font-medium text-orange-600 uppercase bg-orange-50/50 whitespace-nowrap">
                  Insumos
                </th>

                {/* ── MARGEN DE CONTRIBUCIÓN ─── */}
                <ThSortable field="margenContrib">M. Contrib.</ThSortable>
                <ThSortable field="margenContribPct">M.C. %</ThSortable>

                {/* ── COSTOS FIJOS ─── */}
                <th className="px-2 py-3 text-right text-xs font-medium text-teal-600 uppercase bg-teal-50/50 whitespace-nowrap">
                  C. Fijos
                  <span className="normal-case font-normal ml-1 text-teal-400">(prom.)</span>
                </th>

                {/* ── RESULTADO OPERATIVO ─── */}
                <ThSortable field="resultadoNeto">Res. Operativo</ThSortable>
                <ThSortable field="resultadoNetoPct">R.O. %</ThSortable>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {prestacionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={colSpanTotal} className="px-6 py-12 text-center text-gray-500">
                    <FileBarChart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No se encontraron prestaciones</p>
                    <p className="text-sm">Ajustá los filtros para ver resultados</p>
                  </td>
                </tr>
              ) : (
                prestacionesFiltradas.map(prest => {
                  const tooltipCF = getTooltipTexto(
                    prest.facturado,
                    totalFacturadoGlobal,
                    prest.costoFijoAsignado
                  );
                  const isExpanded = expandedRows.has(prest.nombre);

                  return (
                    <React.Fragment key={prest.nombre}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        {/* Expansor */}
                        <td className="px-2 py-3">
                          <button onClick={() => toggleRow(prest.nombre)} className="p-1 hover:bg-gray-100 rounded">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-gray-400" />
                              : <ChevronDown className="h-4 w-4 text-gray-400" />
                            }
                          </button>
                        </td>

                        {/* Nombre */}
                        <td className="px-2 py-3 text-sm text-gray-900 max-w-[240px]">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate" title={prest.nombre}>{prest.nombre}</p>
                            {!prest.tieneReceta && (
                              <span title="Sin receta de costos — pools e insumos en $0" className="flex-shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Segmento */}
                        <td className="px-2 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${
                            prest.segmento === 'Consultas' ? 'bg-blue-100 text-blue-700' :
                            prest.segmento === 'Estudios'  ? 'bg-purple-100 text-purple-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {prest.segmento}
                          </span>
                        </td>

                        {/* Cantidad */}
                        <td className="px-2 py-3 text-sm text-right text-gray-900">
                          {formatNumber(prest.cantidad)}
                        </td>

                        {/* ── FACTURADO ─── */}
                        <td className="px-2 py-3 text-sm text-right font-medium text-blue-600">
                          {formatCurrency(prest.facturado)}
                        </td>

                        {/* ── COSTOS VARIABLES ─── */}
                        <td className="px-2 py-3 text-sm text-right text-purple-600 bg-purple-50/20">
                          {formatCurrency(prest.honorarios)}
                        </td>
                        <td className="px-2 py-3 text-sm text-right text-yellow-600 bg-yellow-50/20">
                          {formatCurrency(prest.costoPools)}
                        </td>
                        <td className="px-2 py-3 text-sm text-right text-orange-600 bg-orange-50/20">
                          {formatCurrency(prest.costoInsumos)}
                        </td>

                        {/* ── MARGEN CONTRIBUCIÓN ─── */}
                        <td className={`px-2 py-3 text-sm text-right font-semibold ${
                          prest.margenContrib >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(prest.margenContrib)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            prest.margenContribPct >= 50 ? 'bg-green-100 text-green-700' :
                            prest.margenContribPct >= 30 ? 'bg-blue-100 text-blue-700' :
                            prest.margenContribPct >= 0  ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {formatPercent(prest.margenContribPct)}
                          </span>
                        </td>

                        {/* ── COSTOS FIJOS ─── */}
                        <td className="px-2 py-3 text-sm text-right bg-teal-50/20">
                          <span className={`${resumenCF.sinDatos ? 'text-yellow-600' : 'text-teal-700'}`}>
                            {formatCurrency(prest.costoFijoAsignado)}
                          </span>
                          <TooltipCF texto={tooltipCF} sinDatos={resumenCF.sinDatos} />
                        </td>

                        {/* ── RESULTADO OPERATIVO ─── */}
                        <td className={`px-2 py-3 text-sm text-right font-semibold ${
                          prest.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}>
                          {formatCurrency(prest.resultadoNeto)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <SemaforoBadge pct={prest.resultadoNetoPct} />
                        </td>
                      </tr>

                      {/* ── FILA EXPANDIDA: detalle ── */}
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td />
                          <td colSpan={colSpanTotal - 1} className="px-6 py-3">
                            <div className="flex flex-wrap gap-4 text-xs text-gray-600">

                              {/* Desglose costos variables */}
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">
                                  Costos Variables
                                </span>
                                <span>Honorarios: <strong className="text-purple-600">{formatCurrency(prest.honorarios)}</strong></span>
                                <span>Pools: <strong className="text-yellow-600">{formatCurrency(prest.costoPools)}</strong></span>
                                <span>Insumos: <strong className="text-orange-600">{formatCurrency(prest.costoInsumos)}</strong></span>
                                <span className="border-t pt-1 mt-1">
                                  Total variable: <strong>{formatCurrency(prest.costoTotal)}</strong>
                                </span>
                              </div>

                              <div className="border-l border-gray-300 pl-4 flex flex-col gap-1">
                                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">
                                  Costos Fijos asignados
                                  {resumenCF.sinDatos && (
                                    <span className="text-yellow-600 ml-1 normal-case">· Sin datos</span>
                                  )}
                                </span>
                                {resumenCF.porCategoria.length > 0 ? (
                                  resumenCF.porCategoria.map(cat => {
                                    const asignadoCat = prest.costoFijoAsignado * (cat.porcentaje / 100);
                                    return (
                                      <span key={cat.categoria_nombre} className="flex items-center gap-1.5">
                                        <span
                                          className="w-2 h-2 rounded-full flex-shrink-0"
                                          style={{ background: cat.categoria_color }}
                                        />
                                        {cat.categoria_nombre}:
                                        <strong style={{ color: cat.categoria_color }}>
                                          {formatCurrency(asignadoCat)}
                                        </strong>
                                        <span className="text-gray-400">({formatPercent(cat.porcentaje)})</span>
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-gray-400 italic">
                                    Clasificá costos en la sección Costos Fijos
                                  </span>
                                )}
                                <span className="border-t pt-1 mt-1">
                                  Total CF: <strong className="text-teal-700">{formatCurrency(prest.costoFijoAsignado)}</strong>
                                </span>
                              </div>

                              <div className="border-l border-gray-300 pl-4 flex flex-col gap-1">
                                <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">
                                  Resultado
                                </span>
                                <span>
                                  Margen Contrib.: <strong className="text-blue-600">{formatCurrency(prest.margenContrib)}</strong>
                                  {' '}({formatPercent(prest.margenContribPct)})
                                </span>
                                <span>
                                  − C.Fijos: <strong className="text-teal-700">{formatCurrency(prest.costoFijoAsignado)}</strong>
                                </span>
                                <span className="border-t pt-1 mt-1 font-semibold">
                                  Res. Operativo:
                                  <strong className={`ml-1 ${prest.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(prest.resultadoNeto)}
                                  </strong>
                                  {' '}
                                  <SemaforoBadge pct={prest.resultadoNetoPct} />
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

            {/* ── FOOTER TOTALES ── */}
            {prestacionesFiltradas.length > 0 && (
              <tfoot className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                <tr>
                  <td className="px-2 py-3" />
                  <td className="px-2 py-3 text-sm text-gray-700">TOTALES</td>
                  <td className="px-2 py-3 text-center text-sm text-gray-500">—</td>
                  <td className="px-2 py-3 text-sm text-right text-gray-900">
                    {formatNumber(totales.cantidad)}
                  </td>

                  {/* Facturado */}
                  <td className="px-2 py-3 text-sm text-right text-blue-700">
                    {formatCurrency(totales.facturado)}
                  </td>

                  {/* Variables */}
                  <td className="px-2 py-3 text-sm text-right text-purple-700 bg-purple-50/30">
                    {formatCurrency(totales.honorarios)}
                  </td>
                  <td className="px-2 py-3 text-sm text-right text-yellow-700 bg-yellow-50/30">
                    {formatCurrency(totales.costoPools)}
                  </td>
                  <td className="px-2 py-3 text-sm text-right text-orange-700 bg-orange-50/30">
                    {formatCurrency(totales.costoInsumos)}
                  </td>

                  {/* Margen */}
                  <td className={`px-2 py-3 text-sm text-right font-bold ${
                    totales.margenContrib >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
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

                  {/* CF */}
                  <td className="px-2 py-3 text-sm text-right text-teal-700 bg-teal-50/30">
                    {formatCurrency(totales.costoFijoAsignado)}
                  </td>

                  {/* Resultado */}
                  <td className={`px-2 py-3 text-sm text-right font-bold ${
                    totales.resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {formatCurrency(totales.resultadoNeto)}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <SemaforoBadge pct={totales.resultadoNetoPct} />
                  </td>
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

const PorPrestacionPage: React.FC = () => (
  <MarginalLayout
    title="Análisis por Prestación"
    subtitle="Rentabilidad detallada de cada procedimiento médico"
  >
    <PorPrestacionContent />
  </MarginalLayout>
);

export default PorPrestacionPage;
