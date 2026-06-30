// ============================================
// INFORME DE GESTIÓN — MODAL + BOTÓN
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/components/analisis-marginal/InformeGestionModal.tsx
// ============================================
// Se importa en DashboardMarginalPage. Arma el snapshot del informe para el
// PERÍODO activo (del contexto) y el período inmediato anterior de igual
// longitud (comparativo), y genera el PDF. Patrón datosGuardados: construye un
// objeto inmutable y lo pasa por valor al generador.
// ============================================

import React, { useState, useCallback } from 'react';
import { FileText, Loader2, X, Download, Calendar } from 'lucide-react';
import { useMarginalContext } from './MarginalLayout';
import { supabase } from '@shared/lib/supabase';
import { mapearListado, type MovGecRow } from '@shared/utils/movimientosAgg';
import type { FiltrosPrestaciones } from '@shared/hooks/useMovimientosPrestaciones';
import { generarInformeGestionPDF, DatosInforme, DatosMes } from '../utils/generarInformeGestion';
import useCostosFijosDistribucion, { calcularCostosFijosPeriodo } from '@shared/hooks/useCostosFijosDistribucion';
import useNombreMapping from '@shared/hooks/useNombreMapping';
import { RangoPeriodo, rangoAnterior, mesesDelRango, formatearPeriodo } from '../utils/periodo';

const normalizarNombre = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

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

// Facturación (listado por atención) de un rango de meses, desde el espejo.
async function cargarFacturacionRango(r: RangoPeriodo): Promise<ReturnType<typeof mapearListado>> {
  const meses = mesesDelRango(r);
  const orMeses = meses.map(p => `and(anio.eq.${p.anio},mes.eq.${p.mes})`).join(',');
  const filas: MovGecRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('movimientos_geclisa')
      .select('*')
      .or(orMeses)
      .eq('es_principal', true)
      .range(from, from + 999);
    if (error) break;
    filas.push(...((data as unknown as MovGecRow[]) || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  const fVacio = { anio: '', mes: '', dia: '', obraSocialId: '', prestadorId: '', grupoPracticas: '', agenteFacturadorId: '', busqueda: '', prestacion: '', paciente: '', derivadorId: '' } as FiltrosPrestaciones;
  return mapearListado(filas, fVacio);
}

// ============================================
// PROCESADOR DE DATOS (reutiliza lógica del Dashboard)
// ============================================

function procesarDatosMes(
  prestaciones: any[],
  recetasConPools: any[],
  configHonorarios: any[],
  prestadoresHonorarios: any[],
  agregarAliases: (map: Map<string, any>) => void,
  costosFijos: number,
  costosFijosDetalle: { nombre?: string; categoria_nombre?: string; color?: string; categoria_color?: string; total: number; promedioMensual?: number; porcentaje: number }[],
): DatosMes {
  const recetasMap = new Map(recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r]));
  agregarAliases(recetasMap);
  const prestadoresMap = new Map(prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p]));

  let totalFacturado = 0, totalHonorarios = 0, totalPools = 0, totalInsumos = 0;
  const segmentos = {
    Consultas: { cantidad: 0, facturado: 0, costos: 0 },
    Estudios: { cantidad: 0, facturado: 0, costos: 0 },
    Cirugias: { cantidad: 0, facturado: 0, costos: 0 },
  };
  const prestMap = new Map<string, any>();
  const preMap = new Map<string, any>();
  const osMap = new Map<string, any>();

  prestaciones.forEach(prest => {
    const facturado = prest.total || 0;
    const segmento = detectarSegmento(prest.prestacion);
    const receta = recetasMap.get(normalizarNombre(prest.prestacion)) ?? null;
    const pools = Number(receta?.costo_total_pools) || 0;
    const insumos = Number(receta?.costo_insumos_directos) || 0;

    let honorario = 0;
    if (prest.prestador) {
      const info = prestadoresMap.get(prest.prestador.toUpperCase());
      const esSocio = info?.es_socio || false;
      const cfg = configHonorarios.find((c: any) => c.segmento === segmento);
      if (cfg) honorario = facturado * ((esSocio ? cfg.porcentaje_socio : cfg.porcentaje_no_socio) / 100);
    }

    totalFacturado += facturado;
    totalHonorarios += honorario;
    totalPools += pools;
    totalInsumos += insumos;

    segmentos[segmento].cantidad++;
    segmentos[segmento].facturado += facturado;
    segmentos[segmento].costos += honorario + pools + insumos;

    // Prestaciones
    const ep = prestMap.get(prest.prestacion);
    if (ep) { ep.cantidad++; ep.facturado += facturado; ep.honorarios += honorario; ep.pools += pools; ep.insumos += insumos; }
    else { prestMap.set(prest.prestacion, { nombre: prest.prestacion, segmento, cantidad: 1, facturado, honorarios: honorario, pools, insumos }); }

    // Prestadores
    if (prest.prestador) {
      const ePre = preMap.get(prest.prestador);
      const info = prestadoresMap.get(prest.prestador.toUpperCase());
      if (ePre) { ePre.cantidad++; ePre.facturado += facturado; ePre.honorarios += honorario; ePre.pools += pools; ePre.insumos += insumos; }
      else { preMap.set(prest.prestador, { nombre: prest.prestador, esSocio: info?.es_socio || false, cantidad: 1, facturado, honorarios: honorario, pools, insumos }); }
    }

    // OS
    if (prest.os_sigla) {
      const eOS = osMap.get(prest.os_sigla);
      if (eOS) { eOS.cantidad++; eOS.facturado += facturado; eOS.costos += honorario + pools + insumos; }
      else { osMap.set(prest.os_sigla, { sigla: prest.os_sigla, nombre: prest.os_nombre || prest.os_sigla, cantidad: 1, facturado, costos: honorario + pools + insumos }); }
    }
  });

  const costoTotal = totalHonorarios + totalPools + totalInsumos;
  const mc = totalFacturado - costoTotal;
  const mcPct = totalFacturado > 0 ? (mc / totalFacturado) * 100 : 0;
  const ro = mc - costosFijos;
  const roPct = totalFacturado > 0 ? (ro / totalFacturado) * 100 : 0;

  const topPrestaciones = Array.from(prestMap.values())
    .map(p => ({ ...p, mc: p.facturado - p.honorarios - p.pools - p.insumos, mcPct: p.facturado > 0 ? ((p.facturado - p.honorarios - p.pools - p.insumos) / p.facturado) * 100 : 0 }))
    .sort((a, b) => b.facturado - a.facturado);

  const prestadores = Array.from(preMap.values())
    .map(p => {
      const pMC = p.facturado - p.honorarios - p.pools - p.insumos;
      const cfAsig = costosFijos > 0 && totalFacturado > 0 ? costosFijos * (p.facturado / totalFacturado) : 0;
      return { ...p, mc: pMC, mcPct: p.facturado > 0 ? (pMC / p.facturado) * 100 : 0, ro: pMC - cfAsig, roPct: p.facturado > 0 ? ((pMC - cfAsig) / p.facturado) * 100 : 0 };
    })
    .sort((a, b) => b.facturado - a.facturado);

  const topOS = Array.from(osMap.values())
    .map(os => ({ ...os, mc: os.facturado - os.costos, mcPct: os.facturado > 0 ? ((os.facturado - os.costos) / os.facturado) * 100 : 0 }))
    .sort((a, b) => b.facturado - a.facturado);

  return {
    facturado: totalFacturado, honorarios: totalHonorarios,
    costoPools: totalPools, costoInsumos: totalInsumos, costoTotal,
    margenContrib: mc, margenContribPct: mcPct,
    costosFijos, resultadoOp: ro, resultadoOpPct: roPct,
    cantidad: prestaciones.length,
    ticketPromedio: prestaciones.length > 0 ? totalFacturado / prestaciones.length : 0,
    prestadoresActivos: new Set(prestaciones.filter(p => p.prestador).map(p => p.prestador)).size,
    obrasSocialesActivas: new Set(prestaciones.filter(p => p.os_sigla).map(p => p.os_sigla)).size,
    segmentos: {
      Consultas: { ...segmentos.Consultas, margenPct: segmentos.Consultas.facturado > 0 ? ((segmentos.Consultas.facturado - segmentos.Consultas.costos) / segmentos.Consultas.facturado) * 100 : 0 },
      Estudios: { ...segmentos.Estudios, margenPct: segmentos.Estudios.facturado > 0 ? ((segmentos.Estudios.facturado - segmentos.Estudios.costos) / segmentos.Estudios.facturado) * 100 : 0 },
      Cirugias: { ...segmentos.Cirugias, margenPct: segmentos.Cirugias.facturado > 0 ? ((segmentos.Cirugias.facturado - segmentos.Cirugias.costos) / segmentos.Cirugias.facturado) * 100 : 0 },
    },
    topPrestaciones, prestadores, topObrasSociales: topOS, costosFijosDetalle,
  };
}

// ============================================
// COMPONENTE MODAL
// ============================================

interface InformeGestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InformeGestionModal: React.FC<InformeGestionModalProps> = ({ isOpen, onClose }) => {
  const { prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, rango } = useMarginalContext();
  const { agregarAliases } = useNombreMapping();

  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');

  // CF del período actual (mismo cálculo que el Dashboard).
  const { resumen: resumenCF } = useCostosFijosDistribucion(rango);

  const rangoAnt = rangoAnterior(rango);

  const generar = useCallback(async () => {
    setGenerando(true);
    setError('');

    try {
      // Período actual: datos del contexto (ya abarca todo el rango).
      const datosActual = procesarDatosMes(
        prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios,
        agregarAliases, resumenCF.totalPeriodo, resumenCF.porCategoria,
      );

      // Período anterior de igual longitud (comparativo, Opción A).
      let datosAnterior: DatosMes | null = null;
      try {
        const prestAnt = await cargarFacturacionRango(rangoAnt);
        if (prestAnt.length > 0) {
          const cfAnt = await calcularCostosFijosPeriodo(rangoAnt);
          datosAnterior = procesarDatosMes(
            prestAnt, recetasConPools, configHonorarios, prestadoresHonorarios,
            agregarAliases, cfAnt.totalPeriodo, cfAnt.porCategoria,
          );
        }
      } catch (e) {
        console.warn('No se pudo cargar el período anterior:', e);
      }

      const datosInforme: DatosInforme = {
        // Compat: el generador todavía usa anio/mes para el título hasta que lea `rango`.
        anio: rango.anioHasta,
        mes: rango.mesHasta,
        actual: datosActual,
        anterior: datosAnterior,
      };
      // Período (rango) para el título dinámico del PDF (lo lee el archivo 9).
      (datosInforme as any).rango = rango;
      (datosInforme as any).rangoAnterior = rangoAnt;

      generarInformeGestionPDF(datosInforme);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando informe');
    } finally {
      setGenerando(false);
    }
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases, resumenCF, rango, rangoAnt, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Generar Informe de Gestión
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Informe PDF con análisis de rentabilidad, comparativo y recomendaciones, para el período seleccionado.
        </p>

        <div className="rounded-lg border border-gray-200 p-3 mb-4">
          <p className="text-xs text-gray-500">Período</p>
          <p className="text-base font-semibold text-gray-900">{formatearPeriodo(rango)}</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-3 mb-6">
          <div className="flex items-center gap-2 text-blue-700 text-xs">
            <Calendar className="w-4 h-4" />
            <span>Comparado con {formatearPeriodo(rangoAnt)}</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={generar} disabled={generando}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generando ? 'Generando...' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InformeGestionModal;
