// ============================================
// EVOLUCION TEMPORAL PAGE — v1.0
// Análisis Marginal - Sistema de Costos
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/analisis-marginal/EvolucionTemporalPage.tsx
// ============================================
// Tabla matricial mensual del estado de resultados:
//   Facturación → Costos Variables → Margen → Costos Fijos →
//   No Identificados → Resultado Operativo
//
// Estructura: filas expandibles (Nivel 0/1/2) × columnas mensuales
//             + columna TOTAL y Promedio Mensual
//
// Alcance v1: desde enero 2026 en adelante (ARS nominal).
// ============================================

import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  Calendar,
  Percent,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { MarginalLayout, useMarginalContext } from '../components/MarginalLayout';
import useEvolucionMensual from '@/hooks/useEvolucionMensual';
import {
  labelMesCorto,
  type FilaEvolucion,
  type Mes,
  type AdvertenciaMensual,
} from '@/types/evolucionTemporal';
import {
  getSemaforoColor,
  semaforoClasses,
  semaforoDot,
} from '@/hooks/useCostosFijosDistribucion';

// ============================================
// HELPERS DE FORMATEO
// ============================================

const formatCurrency = (amount: number): string => {
  if (!isFinite(amount) || amount === 0) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

// ============================================
// CONFIGURACIÓN VISUAL POR TIPO DE FILA (Nivel 0)
// ============================================

const estilosNivel0: Record<string, {
  bg: string; border: string; text: string; iconColor: string;
}> = {
  facturacion:            { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-900',    iconColor: 'text-blue-600' },
  costos_variables:       { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-900',  iconColor: 'text-orange-600' },
  margen_contribucion:    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', iconColor: 'text-emerald-700' },
  costos_fijos:           { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-900',  iconColor: 'text-violet-600' },
  costos_no_identificados:{ bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-900',   iconColor: 'text-amber-600' },
  resultado_operativo:    { bg: 'bg-green-100',  border: 'border-green-300',   text: 'text-green-900',   iconColor: 'text-green-700' },
};

// ============================================
// BANNER DE ADVERTENCIAS
// ============================================

const BannerAdvertencias: React.FC<{ advertencias: AdvertenciaMensual[] }> = ({ advertencias }) => {
  const [expandido, setExpandido] = useState(false);

  if (advertencias.length === 0) return null;

  const errores = advertencias.filter(a => a.severidad === 'error');
  const warnings = advertencias.filter(a => a.severidad === 'warning');
  const infos = advertencias.filter(a => a.severidad === 'info');

  const severidadMayor = errores.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info';

  const bgMap = { error: 'bg-red-50 border-red-200', warning: 'bg-amber-50 border-amber-200', info: 'bg-blue-50 border-blue-200' };
  const iconMap = { error: <XCircle className="w-5 h-5 text-red-600" />, warning: <AlertTriangle className="w-5 h-5 text-amber-600" />, info: <Info className="w-5 h-5 text-blue-600" /> };
  const textMap = { error: 'text-red-900', warning: 'text-amber-900', info: 'text-blue-900' };

  return (
    <div className={`border rounded-lg ${bgMap[severidadMayor]} mb-4`}>
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center justify-between p-3 hover:bg-black/5 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          {iconMap[severidadMayor]}
          <span className={`font-medium ${textMap[severidadMayor]}`}>
            {advertencias.length} {advertencias.length === 1 ? 'advertencia' : 'advertencias'}
            {errores.length > 0 && ` · ${errores.length} error(es)`}
            {warnings.length > 0 && ` · ${warnings.length} warning(s)`}
            {infos.length > 0 && ` · ${infos.length} informativa(s)`}
          </span>
        </div>
        {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {expandido && (
        <div className="px-3 pb-3 space-y-1">
          {advertencias.map((a, i) => (
            <div key={i} className={`text-sm ${textMap[a.severidad]} flex items-start gap-2`}>
              <span className="opacity-60 mt-0.5">•</span>
              <span>{a.mensaje}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// CELDA DE VALOR (con estilos por tipo de fila y mes en curso)
// ============================================

interface CeldaValorProps {
  valor: number;
  tipo: FilaEvolucion['tipo'];
  nivel: 0 | 1 | 2;
  esMesEnCurso: boolean;
  mostrarPct?: boolean;
  facturacionMes?: number;
  esSubtotal?: boolean;
  esResultado?: boolean;
}

const CeldaValor: React.FC<CeldaValorProps> = ({
  valor, tipo, nivel, esMesEnCurso, mostrarPct, facturacionMes, esSubtotal, esResultado,
}) => {
  const bgCurso = esMesEnCurso
    ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_8px)]'
    : '';

  // Texto en negrita para subtotales / totales / Nivel 0
  const negrita = nivel === 0 || esSubtotal ? 'font-semibold' : '';

  // Color del texto
  let colorTexto = 'text-gray-900';
  if (esResultado) {
    colorTexto = valor > 0 ? 'text-green-700' : valor < 0 ? 'text-red-700' : 'text-gray-500';
  } else if (tipo === 'margen_contribucion' && valor < 0) {
    colorTexto = 'text-red-700';
  } else if (tipo === 'costos_no_identificados' && valor > 0) {
    colorTexto = 'text-amber-700';
  }

  const pct = mostrarPct && facturacionMes && facturacionMes > 0
    ? (valor / facturacionMes) * 100 : null;

  return (
    <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${bgCurso} ${negrita} ${colorTexto}`}>
      <div>{formatCurrency(valor)}</div>
      {pct !== null && (
        <div className="text-[10px] text-gray-400 font-normal">
          {formatPercent(pct)}
        </div>
      )}
    </td>
  );
};

// ============================================
// FILA DE LA TABLA (recursiva)
// ============================================

interface FilaRowProps {
  fila: FilaEvolucion;
  meses: Mes[];
  mesEnCurso: Mes | null;
  expandidas: Set<string>;
  toggleExpandida: (id: string) => void;
  mostrarPct: boolean;
  facturacionPorMes: Record<Mes, number>;
  coberturaReceta: Record<Mes, number>;
}

const FilaRow: React.FC<FilaRowProps> = ({
  fila, meses, mesEnCurso, expandidas, toggleExpandida,
  mostrarPct, facturacionPorMes, coberturaReceta,
}) => {
  const estaExpandida = expandidas.has(fila.id);
  const esNivel0 = fila.nivel === 0;
  const estilo = esNivel0 ? estilosNivel0[fila.tipo] : null;

  const paddingLeft = fila.nivel === 0 ? 'pl-4' : fila.nivel === 1 ? 'pl-8' : 'pl-14';

  const bgFila = esNivel0
    ? `${estilo?.bg} ${estilo?.text} border-t ${estilo?.border}`
    : fila.nivel === 1
      ? 'bg-gray-50 hover:bg-gray-100 border-t border-gray-100'
      : 'bg-white hover:bg-gray-50 border-t border-gray-100';

  const esResultado = fila.tipo === 'resultado_operativo';
  const esMargen = fila.tipo === 'margen_contribucion';
  const esSubtotal = fila.metadata?.esSubtotal;

  // Para el resultado operativo, computar semáforo por mes
  const semaforoPorMes: Record<Mes, { color: 'verde' | 'amarillo' | 'rojo'; pct: number }> = {};
  if (esResultado) {
    meses.forEach(m => {
      const fact = facturacionPorMes[m] || 0;
      const pct = fact > 0 ? (fila.valores[m] / fact) * 100 : 0;
      semaforoPorMes[m] = { color: getSemaforoColor(pct), pct };
    });
  }

  return (
    <>
      <tr className={bgFila}>
        {/* Columna de concepto (sticky) */}
        <td className={`py-2 pr-3 ${paddingLeft} sticky left-0 z-10 ${esNivel0 ? estilo?.bg : (fila.nivel === 1 ? 'bg-gray-50' : 'bg-white')} border-r border-gray-200`}>
          <div className="flex items-center gap-2 min-w-0">
            {fila.expandible ? (
              <button
                onClick={() => toggleExpandida(fila.id)}
                className={`shrink-0 p-0.5 rounded hover:bg-black/10 ${esNivel0 ? estilo?.iconColor : 'text-gray-500'}`}
                aria-label={estaExpandida ? 'Colapsar' : 'Expandir'}
              >
                {estaExpandida ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <span
              className={`truncate ${esNivel0 ? 'font-bold text-sm uppercase tracking-wide' : ''} ${esSubtotal && !esNivel0 ? 'font-semibold' : ''} ${fila.nivel === 2 ? 'text-sm text-gray-700' : 'text-sm'}`}
              title={fila.label}
            >
              {fila.label}
            </span>
            {fila.metadata?.sinReceta && fila.nivel === 2 && (
              <span title="Sin receta de costos cargada">
                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              </span>
            )}
            {fila.metadata?.sinClasificar && (
              <span title="Hay erogaciones sin clasificar">
                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              </span>
            )}
          </div>
        </td>

        {/* Columnas mensuales */}
        {meses.map(m => (
          <CeldaValor
            key={m}
            valor={fila.valores[m] || 0}
            tipo={fila.tipo}
            nivel={fila.nivel}
            esMesEnCurso={m === mesEnCurso}
            mostrarPct={mostrarPct && fila.tipo !== 'facturacion' && fila.nivel === 0}
            facturacionMes={facturacionPorMes[m]}
            esSubtotal={esSubtotal}
            esResultado={esResultado}
          />
        ))}

        {/* Columna TOTAL */}
        <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap border-l border-gray-200 ${esNivel0 || esSubtotal ? 'font-semibold' : ''} ${esResultado && fila.total !== 0 ? (fila.total > 0 ? 'text-green-700' : 'text-red-700') : ''}`}>
          {formatCurrency(fila.total)}
        </td>

        {/* Columna PROMEDIO */}
        <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-500 text-sm ${esNivel0 || esSubtotal ? 'font-semibold' : ''}`}>
          {formatCurrency(fila.promedioMensual)}
        </td>
      </tr>

      {/* Fila indicativa de semáforo para Resultado Operativo */}
      {esResultado && (
        <tr className="bg-green-50 border-t border-green-200">
          <td className="py-1.5 pl-4 pr-3 sticky left-0 z-10 bg-green-50 border-r border-gray-200 text-xs text-gray-600 italic">
            % sobre facturación
          </td>
          {meses.map(m => {
            const s = semaforoPorMes[m];
            if (!s || !isFinite(s.pct)) {
              return <td key={m} className="px-3 py-1.5 text-right text-xs text-gray-400">—</td>;
            }
            return (
              <td key={m} className="px-3 py-1.5 text-right">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${semaforoClasses[s.color]}`}>
                  <span className={`w-1 h-1 rounded-full ${semaforoDot[s.color]}`} />
                  {formatPercent(s.pct)}
                </span>
              </td>
            );
          })}
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5" />
        </tr>
      )}

      {/* Fila indicativa de % margen contrib */}
      {esMargen && (
        <tr className="bg-emerald-50/60 border-t border-emerald-100">
          <td className="py-1.5 pl-4 pr-3 sticky left-0 z-10 bg-emerald-50/60 border-r border-gray-200 text-xs text-gray-600 italic">
            % sobre facturación
          </td>
          {meses.map(m => {
            const fact = facturacionPorMes[m] || 0;
            if (fact === 0) {
              return <td key={m} className="px-3 py-1.5 text-right text-xs text-gray-400">—</td>;
            }
            const pct = (fila.valores[m] / fact) * 100;
            return (
              <td key={m} className="px-3 py-1.5 text-right text-xs font-medium text-emerald-800">
                {formatPercent(pct)}
              </td>
            );
          })}
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5" />
        </tr>
      )}

      {/* Hijos (recursivo) */}
      {estaExpandida && fila.hijos?.map(hijo => (
        <FilaRow
          key={hijo.id}
          fila={hijo}
          meses={meses}
          mesEnCurso={mesEnCurso}
          expandidas={expandidas}
          toggleExpandida={toggleExpandida}
          mostrarPct={mostrarPct}
          facturacionPorMes={facturacionPorMes}
          coberturaReceta={coberturaReceta}
        />
      ))}
    </>
  );
};

// ============================================
// COMPONENTE PRINCIPAL (CONTENT)
// ============================================

const EvolucionTemporalContent: React.FC = () => {
  const { filtros } = useMarginalContext();

  // Rango de visualización: desde enero 2026 hasta el mes seleccionado en el layout
  const hoy = new Date();
  const anioHasta = filtros?.anio || hoy.getFullYear();
  const mesHasta = filtros?.mes || (hoy.getMonth() + 1);

  const { data, loading, error, refetch } = useEvolucionMensual({
    anioDesde: 2026,
    mesDesde: 1,
    anioHasta,
    mesHasta,
  });

  // Estado UI
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set([
    // Arranca con los 6 bloques Nivel 0 todos colapsados
  ]));
  const [mostrarPct, setMostrarPct] = useState(false);

  const toggleExpandida = (id: string) => {
    setExpandidas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const expandirTodo = () => {
    const ids = new Set<string>();
    const walk = (fila: FilaEvolucion) => {
      if (fila.expandible) ids.add(fila.id);
      fila.hijos?.forEach(walk);
    };
    data.filas.forEach(walk);
    setExpandidas(ids);
  };

  const colapsarTodo = () => setExpandidas(new Set());

  // Facturación por mes (para calcular % sobre facturación en las celdas)
  const facturacionPorMes = useMemo(() => {
    const filaFact = data.filas.find(f => f.tipo === 'facturacion');
    return filaFact?.valores || {};
  }, [data.filas]);

  // Loading inicial
  if (loading && data.filas.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-gray-500">Construyendo evolución mensual...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <XCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
        <p className="text-red-900 font-medium">Error al cargar la evolución temporal</p>
        <p className="text-red-700 text-sm mt-1">{error}</p>
        <button
          onClick={refetch}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const sinDatos = data.meses.length === 0;

  return (
    <div className="space-y-4">
      {/* Barra de controles */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>Período: <strong>Enero 2026</strong> → <strong>{labelMesCorto(`${anioHasta}-${String(mesHasta).padStart(2, '0')}`)}</strong></span>
            {data.mesEnCurso && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                {labelMesCorto(data.mesEnCurso)}: mes en curso
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMostrarPct(v => !v)}
              className={`px-3 py-1.5 text-sm border rounded-lg flex items-center gap-1.5 ${mostrarPct ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}
            >
              <Percent className="w-3.5 h-3.5" />
              % s/ facturación
            </button>
            <button
              onClick={expandirTodo}
              className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 flex items-center gap-1.5"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Expandir todo
            </button>
            <button
              onClick={colapsarTodo}
              className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 flex items-center gap-1.5"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Colapsar todo
            </button>
          </div>
        </div>
      </div>

      {/* Advertencias */}
      <BannerAdvertencias advertencias={data.advertencias} />

      {/* Tabla matricial */}
      {sinDatos ? (
        <div className="bg-white rounded-xl border p-10 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No hay meses en el rango seleccionado</p>
          <p className="text-sm text-gray-500 mt-1">Seleccioná un mes válido en el filtro superior</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 sticky left-0 z-20 bg-gray-100 border-r border-gray-300 min-w-[280px]">
                    Concepto
                  </th>
                  {data.meses.map(m => {
                    const esEnCurso = m === data.mesEnCurso;
                    return (
                      <th
                        key={m}
                        className={`px-3 py-3 text-right font-semibold text-gray-700 min-w-[110px] ${esEnCurso ? 'bg-blue-50' : ''}`}
                        title={esEnCurso ? 'Mes en curso (incompleto)' : ''}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {labelMesCorto(m)}
                          {esEnCurso && <span className="text-[10px] text-blue-600">*</span>}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 border-l border-gray-300 min-w-[120px]">
                    TOTAL
                  </th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-500 min-w-[120px]">
                    Prom. mensual
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map(fila => (
                  <FilaRow
                    key={fila.id}
                    fila={fila}
                    meses={data.meses}
                    mesEnCurso={data.mesEnCurso}
                    expandidas={expandidas}
                    toggleExpandida={toggleExpandida}
                    mostrarPct={mostrarPct}
                    facturacionPorMes={facturacionPorMes}
                    coberturaReceta={data.coberturaReceta}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leyenda al pie */}
      <div className="bg-gray-50 border rounded-lg p-3 text-xs text-gray-600 space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,0.1)_3px,rgba(0,0,0,0.1)_4px)] border rounded" />
          <span>Columna rayada = mes en curso (incompleto, excluido del promedio).</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-500" />
          <span>Icono en detalle = prestación sin receta / erogación sin clasificar.</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3 h-3 text-green-600" />
          <TrendingDown className="w-3 h-3 text-red-600" />
          <span>Resultado operativo positivo (verde) / negativo (rojo). Semáforo según % sobre facturación.</span>
        </div>
        {data.ultimaActualizacion && (
          <div className="pt-1 text-gray-400">
            Última actualización: {new Date(data.ultimaActualizacion).toLocaleString('es-AR')}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// PÁGINA WRAPPER
// ============================================

const EvolucionTemporalPage: React.FC = () => {
  return (
    <MarginalLayout
      title="Evolución Temporal"
      subtitle="Estado de resultados comparativo mensual — desde enero 2026"
    >
      <EvolucionTemporalContent />
    </MarginalLayout>
  );
};

export default EvolucionTemporalPage;
