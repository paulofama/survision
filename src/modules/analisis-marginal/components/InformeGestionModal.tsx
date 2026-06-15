// ============================================
// INFORME DE GESTIÓN — MODAL + BOTÓN
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/components/analisis-marginal/InformeGestionModal.tsx
// ============================================
// Componente que se importa en DashboardMarginalPage.
// Carga datos de 2 meses y genera el PDF.
// ============================================

import React, { useState, useCallback } from 'react';
import { FileText, Loader2, X, Download, Calendar } from 'lucide-react';
import { useMarginalContext } from './MarginalLayout';
import { supabase } from '@/lib/supabase';
import { generarInformeGestionPDF, DatosInforme, DatosMes } from '../utils/generarInformeGestion';
import useCostosFijosDistribucion from '@/hooks/useCostosFijosDistribucion';
import useNombreMapping from '@/hooks/useNombreMapping';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const normalizarNombre = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

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
  costosFijosDetalle: { nombre: string; color: string; total: number; porcentaje: number }[],
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
  const { prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, filtros } = useMarginalContext();
  const { agregarAliases } = useNombreMapping();

  const [anio, setAnio] = useState(filtros?.anio || new Date().getFullYear());
  const [mes, setMes] = useState(filtros?.mes || new Date().getMonth() + 1);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');

  const { resumen: resumenCF } = useCostosFijosDistribucion(anio, mes);

  const generar = useCallback(async () => {
    setGenerando(true);
    setError('');

    try {
      // Procesar mes actual con datos del contexto
      const datosActual = procesarDatosMes(
        prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios,
        agregarAliases, resumenCF.totalPromedio, resumenCF.porCategoria
      );

      // Intentar cargar mes anterior (API call)
      let datosAnterior: DatosMes | null = null;
      try {
        const mesAnt = mes === 1 ? 12 : mes - 1;
        const anioAnt = mes === 1 ? anio - 1 : anio;

        const resp = await fetch(`http://localhost:3001/api/movimientos?anio=${anioAnt}&mes=${mesAnt}&limit=5000`);
        if (resp.ok) {
          const { data: prestAnt } = await resp.json();
          if (prestAnt && prestAnt.length > 0) {
            // CF for previous month
            const periodosCF = [];
            let a2 = anioAnt, m2 = mesAnt;
            for (let i = 0; i < 3; i++) { m2--; if (m2 < 1) { m2 = 12; a2--; } periodosCF.push({ anio: a2, mes: m2 }); }
            const filtrosCF = periodosCF.map(p => `and(anio.eq.${p.anio},mes.eq.${p.mes})`).join(',');

            const { data: erogAnt } = await supabase.from('erogaciones_clasificacion').select('anio, mes, monto').eq('tipo_costo', 'fijo').or(filtrosCF);
            const { data: sueldosAnt } = await supabase.from('sueldos_registros').select('anio, mes, monto').or(filtrosCF);

            const totalErogAnt = (erogAnt || []).reduce((s: number, r: any) => s + (Number(r.monto) || 0), 0);
            const totalSueldosAnt = (sueldosAnt || []).reduce((s: number, r: any) => s + (Number(r.monto) || 0), 0);
            const mesesConDatos = new Set([...(erogAnt || []).map((r: any) => `${r.anio}-${r.mes}`), ...(sueldosAnt || []).map((r: any) => `${r.anio}-${r.mes}`)]).size;
            const cfAnt = mesesConDatos > 0 ? (totalErogAnt + totalSueldosAnt) / mesesConDatos : 0;

            datosAnterior = procesarDatosMes(
              prestAnt, recetasConPools, configHonorarios, prestadoresHonorarios,
              agregarAliases, cfAnt, []
            );
          }
        }
      } catch (e) {
        console.warn('No se pudo cargar mes anterior:', e);
      }

      const datosInforme: DatosInforme = {
        anio, mes,
        actual: datosActual,
        anterior: datosAnterior,
      };

      generarInformeGestionPDF(datosInforme);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando informe');
    } finally {
      setGenerando(false);
    }
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, agregarAliases, resumenCF, anio, mes, onClose]);

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
          Genera un informe PDF profesional con análisis de rentabilidad, comparativo mensual y recomendaciones.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              {[2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-3 mb-6">
          <div className="flex items-center gap-2 text-blue-700 text-xs">
            <Calendar className="w-4 h-4" />
            <span>El informe incluirá comparación con {MESES[(mes - 2 + 12) % 12]} {mes === 1 ? anio - 1 : anio}</span>
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
