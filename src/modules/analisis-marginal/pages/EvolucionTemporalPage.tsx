// ============================================
// EVOLUCION TEMPORAL PAGE — v1.0
// Análisis Marginal - Sistema de Gestión Integral
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
  ChevronsDown,
  Scale,
  Loader2,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  Calendar,
  Percent,
  XCircle,
  ExternalLink,
  FileDown,
} from 'lucide-react';
import { MarginalLayout, useMarginalContext } from '../components/MarginalLayout';
import useEvolucionMensual from '@shared/hooks/useEvolucionMensual';
import { useEvolucionDetalle, invalidarCacheDetalle, TOPE_FILAS_DETALLE } from '@shared/hooks/useEvolucionDetalle';
import { useConciliacionCostos } from '@shared/hooks/useConciliacionCostos';
import { generarEvolucionPDF } from '../utils/generarEvolucionPDF';
import {
  labelMesCorto,
  type FilaEvolucion,
  type Mes,
  type AdvertenciaMensual,
} from '@shared/types/evolucionTemporal';
import {
  getSemaforoColor,
  semaforoClasses,
  semaforoDot,
} from '@shared/hooks/useCostosFijosDistribucion';

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
// PERSISTENCIA DEL ESTADO DE EXPANSIÓN
// ============================================
// Se guarda qué filas quedaron abiertas para no tener que reabrirlas en cada
// visita. Los ids son estables (salen del nombre normalizado, no del índice),
// así que sobreviven a un cambio de datos.

const CLAVE_EXPANSION = 'evolucion-temporal:expandidas';

const leerExpansionGuardada = (): Set<string> => {
  try {
    const raw = localStorage.getItem(CLAVE_EXPANSION);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    // localStorage puede fallar (modo privado, cuota). No es motivo para
    // romper la pantalla: se arranca con todo colapsado.
    return new Set();
  }
};

const guardarExpansion = (ids: Set<string>): void => {
  try {
    localStorage.setItem(CLAVE_EXPANSION, JSON.stringify([...ids]));
  } catch {
    /* sin persistencia, la pantalla sigue funcionando igual */
  }
};

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
  nivel: 0 | 1 | 2 | 3 | 4;
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

// ============================================
// DETALLE LAZY (último nivel)
// ============================================
// A module scope: definirlo dentro de FilaRow lo remontaría en cada render y
// dispararía la consulta de nuevo (anti-patrón documentado en CLAUDE.md).

interface DetalleLazyProps {
  fila: FilaEvolucion;
  meses: Mes[];
  mesEnCurso: Mes | null;
  mostrarPct: boolean;
  facturacionPorMes: Record<Mes, number>;
  expandidas: Set<string>;
  toggleExpandida: (id: string) => void;
}

const DetalleLazy: React.FC<DetalleLazyProps> = ({ fila, meses, mesEnCurso, mostrarPct, facturacionPorMes, expandidas, toggleExpandida }) => {
  const lazy = fila.detalleLazy!;
  const params = useMemo(() => ({
    bloque: lazy.bloque,
    clave: lazy.clave,
    label: lazy.label,
    meses,
    nivel: (fila.nivel + 1) as 1 | 2 | 3 | 4,
    totalPadre: fila.valores,
  }), [lazy.bloque, lazy.clave, lazy.label, meses, fila.nivel, fila.valores]);

  const { filas, loading, error, totalElementos, truncado } = useEvolucionDetalle(params);
  const colSpan = meses.length + 3;
  const padding = fila.nivel === 0 ? 'pl-8' : fila.nivel === 1 ? 'pl-14' : fila.nivel === 2 ? 'pl-20' : 'pl-28';

  if (loading) {
    return (
      <>
        {[0, 1, 2].map(i => (
          <tr key={`sk-${i}`} className="bg-gray-50/60 border-t border-gray-100">
            <td className={`py-2 pr-3 ${padding} sticky left-0 z-10 bg-gray-50/60 border-r border-gray-200`}>
              <div className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: `${70 - i * 12}%` }} />
            </td>
            <td colSpan={colSpan - 1} />
          </tr>
        ))}
      </>
    );
  }

  if (error) {
    return (
      <tr className="bg-red-50 border-t border-red-100">
        <td colSpan={colSpan} className={`py-2 pr-3 ${padding} text-xs text-red-700`}>
          <div className="flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span>No se pudo cargar el detalle de {lazy.label}: {error}</span>
          </div>
        </td>
      </tr>
    );
  }

  let grupoPrevio: string | undefined;

  return (
    <>
      {filas.map(f => {
        const cambioGrupo = f.metadata?.grupo !== undefined && f.metadata.grupo !== grupoPrevio;
        if (f.metadata?.grupo !== undefined) grupoPrevio = f.metadata.grupo;
        return (
          <FilaDetalleRow
            key={f.id}
            fila={f}
            meses={meses}
            mesEnCurso={mesEnCurso}
            mostrarPct={mostrarPct}
            facturacionPorMes={facturacionPorMes}
            separador={cambioGrupo}
            padding={padding}
            expandidas={expandidas}
            toggleExpandida={toggleExpandida}
          />
        );
      })}
      {truncado && (
        <tr className="bg-amber-50 border-t border-amber-200">
          <td colSpan={colSpan} className={`py-1.5 pr-3 ${padding} text-xs text-amber-800`}>
            Se muestran los {TOPE_FILAS_DETALLE} de mayor importe, de {totalElementos.toLocaleString('es-AR')} en total.
            El resto está sumado en la fila de diferencia.
          </td>
        </tr>
      )}
    </>
  );
};

interface FilaDetalleRowProps {
  fila: FilaEvolucion;
  meses: Mes[];
  mesEnCurso: Mes | null;
  mostrarPct: boolean;
  facturacionPorMes: Record<Mes, number>;
  separador: boolean;
  padding: string;
  expandidas: Set<string>;
  toggleExpandida: (id: string) => void;
}

const FilaDetalleRow: React.FC<FilaDetalleRowProps> = ({
  fila, meses, mesEnCurso, mostrarPct, facturacionPorMes, separador, padding,
  expandidas, toggleExpandida,
}) => {
  const esNota = fila.tipo === 'nota';
  const esDif = fila.tipo === 'diferencia';
  const bg = esDif ? 'bg-amber-50' : esNota ? 'bg-blue-50/50' : 'bg-gray-50/60 hover:bg-gray-100';
  const borde = separador ? 'border-t-2 border-gray-300' : 'border-t border-gray-100';
  // Una fila de detalle puede tener otro nivel debajo (obra social → atenciones).
  const puedeAbrir = !!fila.detalleLazy && !esNota && !esDif;
  const abierta = puedeAbrir && expandidas.has(fila.id);

  if (esNota) {
    return (
      <tr className={`${bg} border-t border-blue-100`}>
        <td colSpan={meses.length + 3} className={`py-2 pr-3 ${padding} text-xs text-blue-800`}>
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{fila.label}</span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
    <tr className={`${bg} ${borde}`}>
      <td className={`py-1.5 pr-3 ${padding} sticky left-0 z-10 ${esDif ? 'bg-amber-50' : 'bg-gray-50/60'} border-r border-gray-200`}>
        <div className="flex items-center gap-2 min-w-0">
          {puedeAbrir ? (
            <button
              onClick={() => toggleExpandida(fila.id)}
              className="w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400"
              aria-label={abierta ? `Colapsar ${fila.label}` : `Ver las atenciones de ${fila.label}`}
              aria-expanded={abierta}
            >
              {abierta ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <span
            className={`truncate text-xs ${esDif ? 'text-amber-800 font-medium' : 'text-gray-600'}`}
            title={fila.metadata?.tituloCompleto || fila.label}
          >
            {fila.label}
          </span>
          {esDif && (
            <span title={fila.metadata?.tituloCompleto}>
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
            </span>
          )}
        </div>
      </td>
      {meses.map(m => {
        const v = fila.valores[m] || 0;
        const enCurso = m === mesEnCurso;
        const fact = facturacionPorMes[m] || 0;
        return (
          <td
            key={m}
            className={`py-1.5 px-3 text-right text-xs tabular-nums ${
              enCurso ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_8px)]' : ''
            } ${esDif ? 'text-amber-800' : v < 0 ? 'text-red-600' : 'text-gray-600'}`}
          >
            {v === 0 ? <span className="text-gray-300">—</span>
              : mostrarPct && fact > 0 ? `${((v / fact) * 100).toFixed(1)}%`
                : formatCurrency(v)}
          </td>
        );
      })}
      <td className={`py-1.5 px-3 text-right text-xs tabular-nums font-medium ${esDif ? 'text-amber-800' : fila.total < 0 ? 'text-red-600' : 'text-gray-700'}`}>
        {formatCurrency(fila.total)}
      </td>
      {/* Promedio mensual: vacío a propósito — promediar un comprobante único no significa nada */}
      <td className="py-1.5 px-3 text-right text-xs text-gray-300">—</td>
    </tr>
    {abierta && (
      <DetalleLazy
        fila={fila}
        meses={meses}
        mesEnCurso={mesEnCurso}
        mostrarPct={mostrarPct}
        facturacionPorMes={facturacionPorMes}
        expandidas={expandidas}
        toggleExpandida={toggleExpandida}
      />
    )}
    </>
  );
};

const FilaRow: React.FC<FilaRowProps> = ({
  fila, meses, mesEnCurso, expandidas, toggleExpandida,
  mostrarPct, facturacionPorMes, coberturaReceta,
}) => {
  const estaExpandida = expandidas.has(fila.id);
  const esNivel0 = fila.nivel === 0;
  const estilo = esNivel0 ? estilosNivel0[fila.tipo] : null;

  const paddingLeft = fila.nivel === 0 ? 'pl-4' : fila.nivel === 1 ? 'pl-8' : fila.nivel === 2 ? 'pl-14' : 'pl-20';

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

      {/* Detalle atómico: se carga recién al expandir (lazy) */}
      {estaExpandida && fila.detalleLazy && (
        <DetalleLazy
          fila={fila}
          meses={meses}
          mesEnCurso={mesEnCurso}
          mostrarPct={mostrarPct}
          facturacionPorMes={facturacionPorMes}
          expandidas={expandidas}
          toggleExpandida={toggleExpandida}
        />
      )}
    </>
  );
};

// ============================================
// COMPONENTE PRINCIPAL (CONTENT)
// ============================================

const EvolucionTemporalContent: React.FC = () => {
  const { filtros } = useMarginalContext();

  // Rango de visualización: enero del año seleccionado hasta el mes seleccionado en el layout
  // (antes anioDesde estaba fijo en 2026 → con año < 2026 el rango quedaba invertido = vacío).
  const hoy = new Date();
  const anioHasta = Number(filtros?.anio) || hoy.getFullYear();

  // El detalle se cachea por (bloque, categoría, rango de meses). Si cambia el
  // período hay que tirarlo: si no, una categoría abierta seguiría mostrando el
  // detalle del período anterior, que es peor que no mostrar nada.
  useEffect(() => { invalidarCacheDetalle(); }, [anioHasta]);
  const mesHasta = Number(filtros?.mes) || (hoy.getMonth() + 1);

  const { data, loading, error, refetch } = useEvolucionMensual({
    anioDesde: anioHasta,
    mesDesde: 1,
    anioHasta,
    mesHasta,
  });

  // Estado UI. La expansión se persiste: es tedioso reabrir las mismas cinco
  // categorías cada vez que se entra a la pantalla.
  const [expandidas, setExpandidas] = useState<Set<string>>(() => leerExpansionGuardada());
  const [mostrarPct, setMostrarPct] = useState(false);

  useEffect(() => { guardarExpansion(expandidas); }, [expandidas]);

  const toggleExpandida = (id: string) => {
    setExpandidas(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  /**
   * Expandir todo llega SOLO hasta las filas que ya tienen sus hijos en memoria.
   * Las que abren detalle bajo demanda quedan afuera: incluirlas dispararía una
   * consulta por cada categoría de los cuatro bloques de una sola vez.
   */
  const expandirTodo = () => {
    const ids = new Set<string>();
    const walk = (fila: FilaEvolucion) => {
      if (fila.expandible && !fila.detalleLazy) ids.add(fila.id);
      fila.hijos?.forEach(walk);
    };
    data.filas.forEach(walk);
    setExpandidas(ids);
  };

  /**
   * Variante que además abre el detalle atómico. Puede disparar decenas de
   * consultas, así que estima el volumen y pide confirmación si es grande.
   */
  const expandirTodoConDetalle = () => {
    const ids = new Set<string>();
    let conDetalle = 0;
    const walk = (fila: FilaEvolucion) => {
      if (fila.expandible) {
        ids.add(fila.id);
        if (fila.detalleLazy) conDetalle++;
      }
      fila.hijos?.forEach(walk);
    };
    data.filas.forEach(walk);

    // Estimación grosera: el detalle promedio ronda las 20 filas por
    // agrupación. Alcanza para decidir si conviene avisar.
    const estimado = conDetalle * 20;
    if (estimado > 500) {
      const ok = window.confirm(
        `Vas a abrir el detalle de ${conDetalle} agrupaciones (unas ${estimado.toLocaleString('es-AR')} filas).\n\n` +
        'Puede tardar unos segundos y hacer la tabla difícil de leer. ¿Seguimos?',
      );
      if (!ok) return;
    }
    setExpandidas(ids);
  };

  const colapsarTodo = () => setExpandidas(new Set());

  // Facturación por mes (para calcular % sobre facturación en las celdas)
  const facturacionPorMes = useMemo(() => {
    const filaFact = data.filas.find(f => f.tipo === 'facturacion');
    return filaFact?.valores || {};
  }, [data.filas]);

  /** Exporta la grilla tal como se está viendo: mismos meses, modo y filas abiertas. */
  const exportarPDF = () => {
    generarEvolucionPDF({
      meses: data.meses,
      mesEnCurso: data.mesEnCurso,
      filas: data.filas,
      expandidas,
      mostrarPct,
      facturacionPorMes,
      ultimaActualizacion: data.ultimaActualizacion,
    });
  };

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
              onClick={expandirTodoConDetalle}
              title="Abre además el detalle de cada categoría: comprobantes, prestaciones y obras sociales. Puede tardar unos segundos."
              className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 flex items-center gap-1.5 text-gray-600"
            >
              <ChevronsDown className="w-3.5 h-3.5" />
              …con detalle
            </button>
            <button
              onClick={colapsarTodo}
              className="px-3 py-1.5 text-sm border rounded-lg bg-white hover:bg-gray-50 flex items-center gap-1.5"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Colapsar todo
            </button>
            <button
              onClick={exportarPDF}
              title="Exporta la grilla tal como se ve. El detalle por comprobante y por atención no se incluye."
              className="px-3 py-1.5 text-sm border rounded-lg bg-blue-600 text-white border-blue-600 hover:bg-blue-700 flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              Exportar PDF
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

      <PanelConciliacion meses={data.meses} mesEnCurso={data.mesEnCurso} />
    </div>
  );
};

// ============================================
// PANEL DE CONCILIACIÓN — costo estándar vs gasto real
// ============================================
// Va FUERA del estado de resultados a propósito. Las erogaciones variables
// (~$645 M en 2026) miden lo mismo que el costo estándar pero por otra vía:
// sumarlas duplicaría honorarios e insumos. Acá se comparan, que es lo que
// aporta información.

const PanelConciliacion: React.FC<{ meses: Mes[]; mesEnCurso: Mes | null }> = ({ meses, mesEnCurso }) => {
  const [abierto, setAbierto] = useState(false);
  const { lineas, fueraDeCosto, totalRealClasificado, loading, error } = useConciliacionCostos(meses, abierto);

  return (
    <div className="mt-6 border border-gray-200 rounded-lg bg-white">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors rounded-lg"
        aria-expanded={abierto}
      >
        <div className="flex items-center gap-3 text-left">
          <Scale className="w-5 h-5 text-gray-500 shrink-0" />
          <div>
            <div className="font-medium text-gray-900">Conciliación: costo estándar vs gasto real</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Compara lo que el modelo calcula contra lo que efectivamente se pagó. No forma parte del estado de resultados.
            </div>
          </div>
        </div>
        {abierto ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
      </button>

      {abierto && (
        <div className="px-4 pb-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculando…
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
          )}

          {!loading && !error && (
            <>
              <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                El análisis marginal usa <strong>costo estándar</strong>: los honorarios son un porcentaje del facturado
                y los insumos salen de las recetas. Las erogaciones clasificadas como variables registran el{' '}
                <strong>gasto real</strong>. Miden lo mismo por dos vías distintas, así que no se suman — se comparan.
                Un desvío grande indica que el estándar quedó desactualizado o que hay pagos fuera del criterio configurado.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left py-2 pr-3 font-medium">Concepto</th>
                      <th className="text-right py-2 px-3 font-medium">Costo estándar</th>
                      <th className="text-right py-2 px-3 font-medium">Gasto real</th>
                      <th className="text-right py-2 px-3 font-medium">Desvío</th>
                      <th className="text-right py-2 pl-3 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map(l => (
                      <tr key={l.concepto} className="border-b border-gray-100">
                        <td className="py-2 pr-3 text-gray-800">{l.concepto}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(l.totalEstandar)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatCurrency(l.totalReal)}</td>
                        <td className={`py-2 px-3 text-right tabular-nums font-medium ${l.desvio > 0 ? 'text-red-700' : l.desvio < 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                          {l.desvio > 0 ? '+' : ''}{formatCurrency(l.desvio)}
                        </td>
                        <td className={`py-2 pl-3 text-right tabular-nums ${Math.abs(l.desvioPct) > 20 ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
                          {l.totalEstandar > 0 ? `${l.desvioPct > 0 ? '+' : ''}${l.desvioPct.toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-xs font-medium text-gray-700">
                Erogaciones variables que no son costo de la actividad
              </div>
              <div className="mt-1 space-y-1.5">
                {fueraDeCosto.filter(f => f.total !== 0).map(f => (
                  <div key={f.concepto} className="flex items-start justify-between gap-4 text-xs border-b border-gray-100 pb-1.5">
                    <div>
                      <div className="text-gray-800">{f.concepto}</div>
                      <div className="text-gray-500">{f.detalle}</div>
                    </div>
                    <div className="tabular-nums text-gray-700 shrink-0">{formatCurrency(f.total)}</div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Total de erogaciones variables del período: {formatCurrency(totalRealClasificado)}.
                {mesEnCurso && ' Incluye el mes en curso, que está incompleto.'}
              </p>
            </>
          )}
        </div>
      )}
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
