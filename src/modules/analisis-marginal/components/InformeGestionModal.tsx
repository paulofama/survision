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

import React, { useState, useCallback, useEffect } from 'react';
import { FileText, Loader2, X, Download, Calendar, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useMarginalContext } from './MarginalLayout';
import { supabase } from '@shared/lib/supabase';
import { mapearListado, type MovGecRow } from '@shared/utils/movimientosAgg';
import type { FiltrosPrestaciones } from '@shared/hooks/useMovimientosPrestaciones';
import { generarInformeGestionPDF, DatosInforme, DatosMes, SerieMes } from '../utils/generarInformeGestion';
import useCostosFijosDistribucion, { calcularCostosFijosPeriodo } from '@shared/hooks/useCostosFijosDistribucion';
import useNombreMapping from '@shared/hooks/useNombreMapping';
import { RangoPeriodo, rangoAnterior, mesesDelRango, formatearPeriodo, rangoMesUnico, MESES_ABREV } from '../utils/periodo';
import { calcularHonorarioPrestacion } from '@shared/utils/honorariosPrestador';
import { verificarIntegridadPeriodo, type IntegridadPeriodo, type MesIntegridad } from '../utils/integridadPeriodo';
import { normalizarNombre, detectarSegmento } from '@shared/utils/nombresPrestaciones';
import { crearIndiceRecetas, type AliasNombre } from '@shared/utils/buscadorRecetas';

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
  mappings: AliasNombre[],
  costosFijos: number,
  costosFijosDetalle: { nombre?: string; categoria_nombre?: string; color?: string; categoria_color?: string; total: number; promedioMensual?: number; porcentaje: number }[],
): DatosMes {
  const indiceRecetas = crearIndiceRecetas(recetasConPools, mappings);
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
    const segmento = detectarSegmento(prest.prestacion, prest.codigo_prestacion);
    const receta = indiceRecetas.buscar(prest.codigo_prestacion, prest.prestacion);
    const pools = Number(receta?.costo_total_pools) || 0;
    const insumos = Number(receta?.costo_insumos_directos) || 0;

    let honorario = 0;
    if (prest.prestador) {
      const info = prestadoresMap.get(prest.prestador.toUpperCase());
      const esSocio = info?.es_socio || false;
      const cfg = configHonorarios.find((c: any) => c.segmento === segmento);
      honorario = calcularHonorarioPrestacion(facturado, prest.prestador, esSocio, cfg, prest.codigo_prestacion);
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
// PANEL DE INTEGRIDAD DEL PERÍODO
// ============================================
// A module scope a propósito: definirlo dentro del modal lo remontaría en cada
// render (anti-patrón documentado en CLAUDE.md).

const ListaMeses: React.FC<{ meses: MesIntegridad[] }> = ({ meses }) => (
  <ul className="mt-2 space-y-1">
    {meses.map((m) => (
      <li key={`${m.anio}-${m.mes}`} className="text-xs leading-relaxed">
        <span className="font-semibold">{m.etiqueta}</span>
        {' — falta '}
        {m.faltantes.join(' y ')}
        {m.prestaciones > 0 && (
          <span className="opacity-75">
            {' '}({m.prestaciones.toLocaleString('es-AR')} prestaciones facturadas)
          </span>
        )}
      </li>
    ))}
  </ul>
);

const PanelIntegridad: React.FC<{ verificando: boolean; integridad: IntegridadPeriodo | null }> = ({ verificando, integridad }) => {
  if (verificando) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 mb-4 text-xs text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Verificando que el período tenga todos los datos cargados...
      </div>
    );
  }
  if (!integridad) return null;

  if (integridad.errorVerificacion) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="w-4 h-4" />
          No se pudo verificar el período
        </div>
        <p className="mt-1 text-xs leading-relaxed">
          {integridad.errorVerificacion}. Al no poder confirmar que estén todos los costos
          cargados, el informe podría salir con parte de ellos afuera y sin ningún aviso.
          Volvé a intentar; si sigue igual, avisá antes de imprimir.
        </p>
      </div>
    );
  }

  if (integridad.nivel === 'bloqueante') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="w-4 h-4" />
          Faltan los costos de {integridad.bloqueantes.length === 1 ? 'un mes' : `${integridad.bloqueantes.length} meses`}
        </div>
        <p className="mt-1 text-xs leading-relaxed">
          Estos meses tienen facturación pero ningún costo cargado. El informe saldría con costos
          fijos en cero, resultado operativo inflado y punto de equilibrio en cero.
        </p>
        <ListaMeses meses={integridad.bloqueantes} />
        <p className="mt-2 text-xs leading-relaxed">
          Cargá los sueldos del mes (minuta + F.931 + asiento) y clasificá las erogaciones, o
          elegí un período que no incluya esos meses.
        </p>
      </div>
    );
  }

  if (integridad.nivel === 'advertencia') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-yellow-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="w-4 h-4" />
          Período con datos incompletos
        </div>
        <p className="mt-1 text-xs leading-relaxed">
          Se puede generar, pero los costos de estos meses están parciales. El PDF va a salir con
          una leyenda que lo aclara en la primera página.
        </p>
        <ListaMeses meses={integridad.advertencias} />
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 text-green-700 text-xs font-medium">
        <CheckCircle2 className="w-4 h-4" />
        Período completo: los {integridad.meses.length === 1 ? 'datos están' : `${integridad.meses.length} meses tienen`} facturación, sueldos y erogaciones cargados.
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE MODAL
// ============================================

interface InformeGestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InformeGestionModal: React.FC<InformeGestionModalProps> = ({ isOpen, onClose }) => {
  const { prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, rango } = useMarginalContext();
  const { mappings } = useNombreMapping();

  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [integridad, setIntegridad] = useState<IntegridadPeriodo | null>(null);
  const [verificando, setVerificando] = useState(false);

  // CF del período actual (mismo cálculo que el Dashboard).
  const { resumen: resumenCF } = useCostosFijosDistribucion(rango);

  const rangoAnt = rangoAnterior(rango);

  // Verifica el período cada vez que se abre el modal o cambia el rango.
  useEffect(() => {
    if (!isOpen) return;
    let vigente = true;
    setVerificando(true);
    setIntegridad(null);
    setError('');
    verificarIntegridadPeriodo(rango)
      .then((r) => { if (vigente) setIntegridad(r); })
      .catch((e: unknown) => {
        if (!vigente) return;
        setError(e instanceof Error ? e.message : 'No se pudo verificar el período');
      })
      .finally(() => { if (vigente) setVerificando(false); });
    return () => { vigente = false; };
  }, [isOpen, rango]);

  const bloqueado = verificando || !integridad || integridad.nivel === 'bloqueante';

  const generar = useCallback(async () => {
    // Cinturón y tiradores: el botón ya está deshabilitado, pero un informe con
    // costos en cero no debe poder salir por ningún camino.
    if (!integridad || integridad.nivel === 'bloqueante') {
      setError('El período tiene meses sin costos cargados. Revisá el detalle de arriba.');
      return;
    }
    setGenerando(true);
    setError('');

    try {
      // Período actual: datos del contexto (ya abarca todo el rango).
      const datosActual = procesarDatosMes(
        prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios,
        mappings, resumenCF.totalPeriodo, resumenCF.porCategoria,
      );

      // Período anterior de igual longitud (comparativo, Opción A).
      let datosAnterior: DatosMes | null = null;
      try {
        const prestAnt = await cargarFacturacionRango(rangoAnt);
        if (prestAnt.length > 0) {
          const cfAnt = await calcularCostosFijosPeriodo(rangoAnt);
          datosAnterior = procesarDatosMes(
            prestAnt, recetasConPools, configHonorarios, prestadoresHonorarios,
            mappings, cfAnt.totalPeriodo, cfAnt.porCategoria,
          );
        }
      } catch (e) {
        console.warn('No se pudo cargar el período anterior:', e);
      }

      // Serie mes a mes del período. Reusa procesarDatosMes (mismo cálculo que
      // el agregado) sobre las prestaciones de cada mes y sus costos fijos.
      // Solo se arma con 2+ meses: con uno solo la sección no aporta nada.
      const mesesRango = mesesDelRango(rango);
      let mensual: SerieMes[] | undefined;
      if (mesesRango.length >= 2) {
        const serie: SerieMes[] = [];
        for (const p of mesesRango) {
          const delMes = prestaciones.filter((x: any) => {
            const f = String(x.fecha || '');
            return Number(f.slice(0, 4)) === p.anio && Number(f.slice(5, 7)) === p.mes;
          });
          const cfMes = await calcularCostosFijosPeriodo(rangoMesUnico(p.anio, p.mes));
          const d = procesarDatosMes(
            delMes, recetasConPools, configHonorarios, prestadoresHonorarios,
            mappings, cfMes.totalPeriodo, cfMes.porCategoria,
          );
          serie.push({
            anio: p.anio, mes: p.mes,
            etiqueta: `${MESES_ABREV[p.mes - 1]} ${String(p.anio).slice(2)}`,
            facturado: d.facturado, cantidad: d.cantidad,
            margenContrib: d.margenContrib, margenContribPct: d.margenContribPct,
            costosFijos: d.costosFijos, resultadoOp: d.resultadoOp, resultadoOpPct: d.resultadoOpPct,
          });
        }
        mensual = serie;
      }

      const datosInforme: DatosInforme = {
        // Compat: el generador todavía usa anio/mes para el título hasta que lea `rango`.
        anio: rango.anioHasta,
        mes: rango.mesHasta,
        actual: datosActual,
        anterior: datosAnterior,
        // Sello de período parcial: null cuando está todo cargado.
        leyendaIntegridad: integridad.leyendaPDF,
        mensual,
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
  }, [prestaciones, recetasConPools, configHonorarios, prestadoresHonorarios, mappings, resumenCF, rango, rangoAnt, onClose]);

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

        <div className="bg-blue-50 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-blue-700 text-xs">
            <Calendar className="w-4 h-4" />
            <span>Comparado con {formatearPeriodo(rangoAnt)}</span>
          </div>
        </div>

        <PanelIntegridad verificando={verificando} integridad={integridad} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={generar} disabled={generando || bloqueado}
            title={bloqueado && !verificando ? 'El período tiene meses sin costos cargados' : undefined}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generando ? 'Generando...' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InformeGestionModal;
