// ============================================
// HOOK: useEvolucionMensual
// Evolución Temporal del Análisis Marginal
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/hooks/useEvolucionMensual.ts
// ============================================
// v1.0 — Construye la matriz mes × fila (facturación, costos variables,
//        margen, costos fijos, no identificados, resultado) con la misma
//        lógica conceptual que el resto del módulo Análisis Marginal.
//
// DEPENDENCIAS EXTERNAS (hooks existentes):
//   - useRecetasCostos     → recetas con costos unitarios (pools + insumos)
//   - useHonorariosConfig  → configuración de honorarios + prestadores
//
// FUENTES DE DATOS:
//   - Atenciones del mes  → backend Express (GECLISA) vía API_BASE_URL
//   - Costos fijos        → Supabase (erogaciones_clasificacion + sueldos_registros)
//
// HIPÓTESIS v1 (a revisar si algo cambia):
//   1. Campo de fecha en atención = 'fecha' (formato 'YYYY-MM-DD' o ISO)
//      → Si el backend devuelve otro nombre, modificar la función `extraerMes`.
//   2. Endpoint de atenciones   = `${API_BASE_URL}/movimientos?anio=&mes=&limit=`
//      (devuelve {success, data:[{fecha,prestacion,prestador,os_sigla,os_nombre,total}]}).
//      → Si cambia, modificar la constante ENDPOINT_ATENCIONES.
//   3. Honorarios y es_socio NO tienen versionado histórico en BD.
//      → Se aplica la configuración vigente a todos los meses. Si a futuro
//        se agrega versionado, modificar la función `calcularHonorario`.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/apiConfig';
import useRecetasCostos from './useRecetasCostos';
import useHonorariosConfig from './useHonorariosConfig';
import type {
  EvolucionMensualData,
  FilaEvolucion,
  Mes,
  UseEvolucionMensualParams,
  UseEvolucionMensualReturn,
  AdvertenciaMensual,
} from '../types/evolucionTemporal';
import { toMesKey, generarRangoMeses, parseMesKey } from '../types/evolucionTemporal';

// ============================================
// CONFIGURACIÓN — Ajustar si cambia el backend
// ============================================

/** Endpoint que devuelve las atenciones de un mes desde GECLISA.
 *  Usa /movimientos (una fila por atención: fecha/prestacion/prestador/os/total).
 *  limit alto para no truncar meses con muchas atenciones. */
const ENDPOINT_ATENCIONES = (anio: number, mes: number) =>
  `${API_BASE_URL}/movimientos?anio=${anio}&mes=${mes}&limit=10000`;

/** Umbral de cobertura de receta debajo del cual se emite advertencia. */
const UMBRAL_COBERTURA_RECETA = 80; // %

/** Cantidad máxima de prestaciones detalle por segmento (default). */
const DEFAULT_TOP_PRESTACIONES = 10;

// ============================================
// TIPO ATENCIÓN (shape esperado del endpoint)
// ============================================

interface AtencionRaw {
  fecha: string;                 // 'YYYY-MM-DD' o ISO
  prestacion: string;            // nombre (puede traer código entre paréntesis)
  prestador: string | null;
  os_sigla: string | null;
  os_nombre: string | null;
  total: number;                 // ARS
}

// ============================================
// HELPERS DE CLASIFICACIÓN (replicados del módulo)
// ============================================

const detectarSegmento = (nombrePrestacion: string): 'Consultas' | 'Estudios' | 'Cirugias' => {
  const n = nombrePrestacion.toUpperCase();
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

const normalizarNombre = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Extrae el mes 'YYYY-MM' de una fecha en string.
 * Soporta 'YYYY-MM-DD' y formatos ISO.
 */
const extraerMes = (fechaStr: string): Mes | null => {
  if (!fechaStr) return null;
  const s = String(fechaStr).slice(0, 10); // 'YYYY-MM-DD'
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 7); // 'YYYY-MM'
  }
  // Fallback: parsear como Date
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return null;
  return toMesKey(d.getFullYear(), d.getMonth() + 1);
};

// ============================================
// HOOK PRINCIPAL
// ============================================

const useEvolucionMensual = (
  params: UseEvolucionMensualParams = {}
): UseEvolucionMensualReturn => {
  const {
    anioDesde = 2026,
    mesDesde = 1,
    anioHasta,
    mesHasta,
    segmento = null,
    osSigla = null,
    prestador = null,
    topPrestacionesPorSegmento = DEFAULT_TOP_PRESTACIONES,
  } = params;

  // Default "hasta": mes actual
  const hoy = new Date();
  const anioFin = anioHasta ?? hoy.getFullYear();
  const mesFin = mesHasta ?? (hoy.getMonth() + 1);
  const mesHoyKey = toMesKey(hoy.getFullYear(), hoy.getMonth() + 1);

  // Dependencias (cargan solas)
  const { recetas, loading: loadingRecetas } = useRecetasCostos();
  const {
    configuraciones: configHonorarios,
    prestadores: prestadoresHonorarios,
    loading: loadingHonorarios,
  } = useHonorariosConfig();

  // Estado propio
  const [data, setData] = useState<EvolucionMensualData>({
    meses: [],
    mesesCerrados: [],
    mesEnCurso: null,
    filas: [],
    ultimaActualizacion: '',
    coberturaReceta: {},
    advertencias: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ref para evitar races entre llamadas concurrentes
  const requestIdRef = useRef(0);

  // ============================================
  // FETCH DE ATENCIONES POR MES
  // ============================================

  const fetchAtencionesMes = useCallback(async (mes: Mes): Promise<AtencionRaw[]> => {
    const { anio, mes: mesN } = parseMesKey(mes);
    const url = ENDPOINT_ATENCIONES(anio, mesN);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al traer atenciones de ${mes}`);
    const json = await res.json();
    if (json && json.success === false) {
      throw new Error(json.error || `Error al traer atenciones de ${mes}`);
    }
    const rows: any[] = json?.data ?? json ?? [];
    return rows.map((r): AtencionRaw => ({
      fecha: r.fecha ?? r.me_fecha ?? r.fechaAtencion ?? '',
      prestacion: r.prestacion ?? r.practica ?? '',
      prestador: r.prestador ?? null,
      os_sigla: r.os_sigla ?? r.osSigla ?? null,
      os_nombre: r.os_nombre ?? r.osNombre ?? null,
      total: Number(r.total) || 0,
    }));
  }, []);

  // ============================================
  // FETCH DE COSTOS FIJOS POR MES (Supabase)
  // ============================================

  /**
   * Devuelve, por mes:
   *   - totalFijosClasificados: suma por categoría + sueldos
   *   - porCategoria: Record<nombreCategoria, monto>
   *   - sinClasificar: suma de erogaciones con tipo_costo='sin_clasificar'
   */
  const fetchCostosFijosMes = useCallback(async (meses: Mes[]) => {
    if (meses.length === 0) {
      return {
        fijosPorMes: {} as Record<Mes, { porCategoria: Record<string, number>; total: number }>,
        sueldosPorMes: {} as Record<Mes, number>,
        sinClasificarPorMes: {} as Record<Mes, number>,
      };
    }

    // Filtro OR para los meses del rango
    const filtroOR = meses
      .map(m => {
        const { anio, mes: mesN } = parseMesKey(m);
        return `and(anio.eq.${anio},mes.eq.${mesN})`;
      })
      .join(',');

    // 1. Erogaciones clasificadas como fijo
    const { data: dataFijos, error: errFijos } = await supabase
      .from('erogaciones_clasificacion')
      .select('anio, mes, monto, tipo_costo, categorias_costo_fijo(nombre)')
      .or(filtroOR);
    if (errFijos) throw errFijos;

    // 2. Sueldos
    const { data: dataSueldos, error: errSueldos } = await supabase
      .from('sueldos_registros')
      .select('anio, mes, monto')
      .or(filtroOR);
    if (errSueldos) throw errSueldos;

    // Agregación
    const fijosPorMes: Record<Mes, { porCategoria: Record<string, number>; total: number }> = {};
    const sueldosPorMes: Record<Mes, number> = {};
    const sinClasificarPorMes: Record<Mes, number> = {};

    meses.forEach(m => {
      fijosPorMes[m] = { porCategoria: {}, total: 0 };
      sueldosPorMes[m] = 0;
      sinClasificarPorMes[m] = 0;
    });

    (dataFijos || []).forEach((r: any) => {
      const mesKey = toMesKey(r.anio, r.mes);
      if (!fijosPorMes[mesKey]) return;
      const monto = Number(r.monto) || 0;

      // Normalización de tipo_costo (misma lógica que useErogaciones)
      const rawTipo = String(r.tipo_costo || '').replace(/^"|"$/g, '').trim();

      if (rawTipo === 'fijo') {
        const catNombre = (r.categorias_costo_fijo as any)?.nombre || 'Sin categoría';
        fijosPorMes[mesKey].porCategoria[catNombre] = (fijosPorMes[mesKey].porCategoria[catNombre] || 0) + monto;
        fijosPorMes[mesKey].total += monto;
      } else if (rawTipo === 'sin_clasificar') {
        sinClasificarPorMes[mesKey] += monto;
      }
    });

    (dataSueldos || []).forEach((r: any) => {
      const mesKey = toMesKey(r.anio, r.mes);
      if (sueldosPorMes[mesKey] !== undefined) {
        sueldosPorMes[mesKey] += Number(r.monto) || 0;
      }
    });

    return { fijosPorMes, sueldosPorMes, sinClasificarPorMes };
  }, []);

  // ============================================
  // CONSTRUCCIÓN DE LA MATRIZ
  // ============================================

  const cargarData = useCallback(async () => {
    // Esperar a que dependencias estén listas
    if (loadingRecetas || loadingHonorarios) return;

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      // Rango de meses
      const meses = generarRangoMeses(anioDesde, mesDesde, anioFin, mesFin);
      if (meses.length === 0) {
        setData({
          meses: [], mesesCerrados: [], mesEnCurso: null,
          filas: [], ultimaActualizacion: new Date().toISOString(),
          coberturaReceta: {}, advertencias: [],
        });
        setLoading(false);
        return;
      }

      // Mes en curso (si cae en el rango)
      const mesEnCurso = meses.includes(mesHoyKey) ? mesHoyKey : null;
      const mesesCerrados = meses.filter(m => m !== mesEnCurso);

      // ============================================
      // 1. FETCH EN PARALELO — Atenciones y CF
      // ============================================

      const atencionesResults = await Promise.allSettled(
        meses.map(m => fetchAtencionesMes(m))
      );
      const atencionesPorMes: Record<Mes, AtencionRaw[]> = {};
      const advertencias: AdvertenciaMensual[] = [];

      atencionesResults.forEach((res, i) => {
        const m = meses[i];
        if (res.status === 'fulfilled') {
          atencionesPorMes[m] = res.value;
        } else {
          atencionesPorMes[m] = [];
          advertencias.push({
            mes: m,
            tipo: 'error_fetch',
            severidad: 'error',
            mensaje: `No se pudieron cargar las atenciones de ${m}. ${res.reason?.message || ''}`,
          });
        }
      });

      // Costos fijos
      let fijosData: Awaited<ReturnType<typeof fetchCostosFijosMes>> = {
        fijosPorMes: {}, sueldosPorMes: {}, sinClasificarPorMes: {},
      };
      try {
        fijosData = await fetchCostosFijosMes(meses);
      } catch (e) {
        console.error('Error cargando CF:', e);
        advertencias.push({
          mes: meses[0],
          tipo: 'sin_cf',
          severidad: 'warning',
          mensaje: 'No se pudieron cargar los costos fijos de Supabase.',
        });
      }

      // Abortar si hubo otra llamada después
      if (currentRequestId !== requestIdRef.current) return;

      // ============================================
      // 2. PROCESAMIENTO DE ATENCIONES — montos por fila
      // ============================================

      // Mapas auxiliares
      const recetasMap = new Map(recetas.map(r => [normalizarNombre(r.nombre_practica), r]));
      const prestadoresMap = new Map(prestadoresHonorarios.map(p => [p.nombre.toUpperCase(), p]));

      // Acumuladores por fila
      const makeEmpty = (): Record<Mes, number> =>
        Object.fromEntries(meses.map(m => [m, 0])) as Record<Mes, number>;

      const facturacionPorSegmento = {
        Consultas: makeEmpty(),
        Estudios: makeEmpty(),
        Cirugias: makeEmpty(),
      };

      // Facturación detallada: Map<segmento, Map<nombrePrestacion, Record<Mes, number>>>
      const facturacionDetalle: Record<'Consultas' | 'Estudios' | 'Cirugias', Map<string, Record<Mes, number>>> = {
        Consultas: new Map(),
        Estudios: new Map(),
        Cirugias: new Map(),
      };

      const honorariosPorMes = makeEmpty();
      const poolsPorMes = makeEmpty();
      const insumosPorMes = makeEmpty();

      const facturadoSinRecetaPorMes = makeEmpty();
      const facturadoConRecetaPorMes = makeEmpty();

      // Procesar cada atención
      meses.forEach(m => {
        const atenciones = atencionesPorMes[m] || [];
        atenciones.forEach(a => {
          // Filtros opcionales
          const seg = detectarSegmento(a.prestacion);
          if (segmento && seg !== segmento) return;
          if (osSigla && a.os_sigla !== osSigla) return;
          if (prestador && a.prestador !== prestador) return;

          const facturado = a.total || 0;
          const claveNombre = normalizarNombre(a.prestacion);
          const receta = recetasMap.get(claveNombre) ?? null;
          const costoPools = Number(receta?.costo_pools) || 0;
          const costoInsumos = Number(receta?.costo_insumos_directos) || 0;

          // Honorarios (se calculan siempre, no dependen de receta)
          let honorario = 0;
          if (a.prestador) {
            const prestInfo = prestadoresMap.get(a.prestador.toUpperCase());
            const esSocio = prestInfo?.es_socio || false;
            const configSeg = configHonorarios.find(c => c.segmento === seg);
            if (configSeg) {
              const pct = esSocio ? configSeg.porcentaje_socio : configSeg.porcentaje_no_socio;
              honorario = facturado * (pct / 100);
            }
          }

          // Acumular
          facturacionPorSegmento[seg][m] += facturado;
          honorariosPorMes[m] += honorario;
          poolsPorMes[m] += costoPools;
          insumosPorMes[m] += costoInsumos;

          if (receta) {
            facturadoConRecetaPorMes[m] += facturado;
          } else {
            facturadoSinRecetaPorMes[m] += facturado;
          }

          // Detalle por prestación
          const detalleMap = facturacionDetalle[seg];
          const prev = detalleMap.get(a.prestacion);
          if (prev) {
            prev[m] = (prev[m] || 0) + facturado;
          } else {
            const empty = makeEmpty();
            empty[m] += facturado;
            detalleMap.set(a.prestacion, empty);
          }
        });
      });

      // ============================================
      // 3. BUILDER DE FILAS
      // ============================================

      const sumar = (v: Record<Mes, number>) =>
        meses.reduce((s, m) => s + (v[m] || 0), 0);

      const promedio = (v: Record<Mes, number>) => {
        if (mesesCerrados.length === 0) return 0;
        const suma = mesesCerrados.reduce((s, m) => s + (v[m] || 0), 0);
        return suma / mesesCerrados.length;
      };

      const filaBase = (
        id: string, label: string, tipo: FilaEvolucion['tipo'],
        nivel: 0 | 1 | 2, valores: Record<Mes, number>,
        opts: { expandible?: boolean; hijos?: FilaEvolucion[]; metadata?: FilaEvolucion['metadata'] } = {}
      ): FilaEvolucion => ({
        id, label, tipo, nivel,
        expandible: opts.expandible ?? false,
        valores,
        total: sumar(valores),
        promedioMensual: promedio(valores),
        hijos: opts.hijos,
        metadata: opts.metadata,
      });

      // Derivadas
      const facturacionTotal = makeEmpty();
      meses.forEach(m => {
        facturacionTotal[m] =
          facturacionPorSegmento.Consultas[m] +
          facturacionPorSegmento.Estudios[m] +
          facturacionPorSegmento.Cirugias[m];
      });

      const costosVariables = makeEmpty();
      meses.forEach(m => {
        costosVariables[m] = honorariosPorMes[m] + poolsPorMes[m] + insumosPorMes[m];
      });

      const margenContrib = makeEmpty();
      meses.forEach(m => {
        margenContrib[m] = facturacionTotal[m] - costosVariables[m];
      });

      const costosFijosPorMes = makeEmpty();
      const cfPorCategoriaMes: Record<string, Record<Mes, number>> = {};
      meses.forEach(m => {
        const bloque = fijosData.fijosPorMes[m] || { porCategoria: {}, total: 0 };
        const sueldos = fijosData.sueldosPorMes[m] || 0;
        costosFijosPorMes[m] = bloque.total + sueldos;

        Object.entries(bloque.porCategoria).forEach(([cat, monto]) => {
          if (!cfPorCategoriaMes[cat]) cfPorCategoriaMes[cat] = makeEmpty();
          cfPorCategoriaMes[cat][m] = (cfPorCategoriaMes[cat][m] || 0) + monto;
        });

        if (sueldos > 0) {
          const cat = 'Remuneraciones Personal';
          if (!cfPorCategoriaMes[cat]) cfPorCategoriaMes[cat] = makeEmpty();
          cfPorCategoriaMes[cat][m] = (cfPorCategoriaMes[cat][m] || 0) + sueldos;
        }
      });

      const noIdentificadosVariables = facturadoSinRecetaPorMes; // exposición: facturación sin receta
      const noIdentificadosFijos = fijosData.sinClasificarPorMes;

      const noIdentificadosTotal = makeEmpty();
      meses.forEach(m => {
        noIdentificadosTotal[m] = noIdentificadosVariables[m] + noIdentificadosFijos[m];
      });

      const resultadoOperativo = makeEmpty();
      meses.forEach(m => {
        resultadoOperativo[m] = margenContrib[m] - costosFijosPorMes[m];
      });

      // Cobertura de receta por mes (%)
      const coberturaReceta: Record<Mes, number> = {};
      meses.forEach(m => {
        const tot = facturadoConRecetaPorMes[m] + facturadoSinRecetaPorMes[m];
        coberturaReceta[m] = tot > 0 ? (facturadoConRecetaPorMes[m] / tot) * 100 : 0;
      });

      // ============================================
      // 4. ARMAR EL ÁRBOL DE FILAS
      // ============================================

      // --- Facturación: 3 segmentos → top N prestaciones c/u ---
      const buildDetalleSegmento = (seg: 'Consultas' | 'Estudios' | 'Cirugias'): FilaEvolucion[] => {
        const arr = Array.from(facturacionDetalle[seg].entries())
          .map(([nombre, valores]) => ({
            nombre,
            valores,
            total: sumar(valores),
            tieneReceta: recetasMap.has(normalizarNombre(nombre)),
          }))
          .sort((a, b) => b.total - a.total);

        const top = arr.slice(0, topPrestacionesPorSegmento);
        const resto = arr.slice(topPrestacionesPorSegmento);

        const hijos: FilaEvolucion[] = top.map((p, i) =>
          filaBase(
            `facturacion.${seg.toLowerCase()}.top${i}`,
            p.nombre,
            'detalle', 2, p.valores,
            { metadata: { sinReceta: !p.tieneReceta, segmento: seg } }
          )
        );

        if (resto.length > 0) {
          const restoValores = makeEmpty();
          resto.forEach(p => {
            meses.forEach(m => {
              restoValores[m] += p.valores[m] || 0;
            });
          });
          hijos.push(filaBase(
            `facturacion.${seg.toLowerCase()}.resto`,
            `Resto (${resto.length} prestaciones)`,
            'detalle', 2, restoValores,
            { metadata: { segmento: seg } }
          ));
        }

        return hijos;
      };

      const filaConsultas = filaBase(
        'facturacion.consultas', 'Consultas', 'subgrupo', 1,
        facturacionPorSegmento.Consultas,
        { expandible: facturacionDetalle.Consultas.size > 0, hijos: buildDetalleSegmento('Consultas'), metadata: { segmento: 'Consultas' } }
      );
      const filaEstudios = filaBase(
        'facturacion.estudios', 'Estudios', 'subgrupo', 1,
        facturacionPorSegmento.Estudios,
        { expandible: facturacionDetalle.Estudios.size > 0, hijos: buildDetalleSegmento('Estudios'), metadata: { segmento: 'Estudios' } }
      );
      const filaCirugias = filaBase(
        'facturacion.cirugias', 'Cirugías', 'subgrupo', 1,
        facturacionPorSegmento.Cirugias,
        { expandible: facturacionDetalle.Cirugias.size > 0, hijos: buildDetalleSegmento('Cirugias'), metadata: { segmento: 'Cirugias' } }
      );

      const filaFacturacion = filaBase(
        'facturacion', 'FACTURACIÓN', 'facturacion', 0, facturacionTotal,
        { expandible: true, hijos: [filaConsultas, filaEstudios, filaCirugias] }
      );

      // --- Costos Variables: 3 subgrupos (honorarios / pools / insumos) ---
      const filaHonorarios = filaBase(
        'cv.honorarios', 'Honorarios prestadores', 'subgrupo', 1, honorariosPorMes
      );
      const filaPools = filaBase(
        'cv.pools', 'Costos de pools', 'subgrupo', 1, poolsPorMes
      );
      const filaInsumos = filaBase(
        'cv.insumos', 'Insumos directos', 'subgrupo', 1, insumosPorMes
      );

      const filaCostosVariables = filaBase(
        'costos_variables', 'COSTOS VARIABLES', 'costos_variables', 0, costosVariables,
        { expandible: true, hijos: [filaHonorarios, filaPools, filaInsumos] }
      );

      // --- Margen de contribución (subtotal, no expandible) ---
      const filaMargenContrib = filaBase(
        'margen_contribucion', 'MARGEN DE CONTRIBUCIÓN', 'margen_contribucion', 0, margenContrib,
        { metadata: { esSubtotal: true } }
      );

      // --- Costos Fijos: por categoría ---
      const categoriasCF = Object.keys(cfPorCategoriaMes).sort((a, b) => {
        const totA = sumar(cfPorCategoriaMes[a]);
        const totB = sumar(cfPorCategoriaMes[b]);
        return totB - totA;
      });
      const filasCF: FilaEvolucion[] = categoriasCF.map((cat, i) =>
        filaBase(`cf.${i}`, cat, 'subgrupo', 1, cfPorCategoriaMes[cat])
      );
      const filaCostosFijos = filaBase(
        'costos_fijos', 'COSTOS FIJOS', 'costos_fijos', 0, costosFijosPorMes,
        { expandible: filasCF.length > 0, hijos: filasCF }
      );

      // --- No identificados: 2 subgrupos (variables sin receta, fijos sin clasificar) ---
      const filaNoIdVariables = filaBase(
        'noid.variables',
        'Variables — facturación sin receta',
        'subgrupo', 1,
        noIdentificadosVariables,
        { metadata: { sinReceta: true, esEstimado: true } }
      );
      const filaNoIdFijos = filaBase(
        'noid.fijos',
        'Fijos — erogaciones sin clasificar',
        'subgrupo', 1,
        noIdentificadosFijos,
        { metadata: { sinClasificar: true } }
      );
      const filaNoIdentificados = filaBase(
        'costos_no_identificados', 'COSTOS NO IDENTIFICADOS', 'costos_no_identificados', 0,
        noIdentificadosTotal,
        { expandible: true, hijos: [filaNoIdVariables, filaNoIdFijos] }
      );

      // --- Resultado Operativo ---
      const filaResultado = filaBase(
        'resultado_operativo', 'RESULTADO OPERATIVO', 'resultado_operativo', 0, resultadoOperativo,
        { metadata: { esSubtotal: true } }
      );

      const filas: FilaEvolucion[] = [
        filaFacturacion,
        filaCostosVariables,
        filaMargenContrib,
        filaCostosFijos,
        filaNoIdentificados,
        filaResultado,
      ];

      // ============================================
      // 5. ADVERTENCIAS ADICIONALES
      // ============================================

      meses.forEach(m => {
        if (costosFijosPorMes[m] === 0 && atencionesPorMes[m]?.length > 0) {
          advertencias.push({
            mes: m,
            tipo: 'sin_cf',
            severidad: 'warning',
            mensaje: `${m}: no hay costos fijos cargados. El resultado operativo puede estar sobrevaluado.`,
          });
        }
        if (coberturaReceta[m] > 0 && coberturaReceta[m] < UMBRAL_COBERTURA_RECETA) {
          advertencias.push({
            mes: m,
            tipo: 'baja_cobertura_receta',
            severidad: 'warning',
            mensaje: `${m}: cobertura de receta ${coberturaReceta[m].toFixed(1)}%. El margen puede estar sobrevaluado.`,
          });
        }
        if (fijosData.sinClasificarPorMes[m] > 0) {
          advertencias.push({
            mes: m,
            tipo: 'erogaciones_sin_clasificar',
            severidad: 'info',
            mensaje: `${m}: hay erogaciones sin clasificar por $ ${Math.round(fijosData.sinClasificarPorMes[m]).toLocaleString('es-AR')}. Clasificá en el módulo de erogaciones.`,
          });
        }
      });

      if (mesEnCurso) {
        advertencias.unshift({
          mes: mesEnCurso,
          tipo: 'mes_incompleto',
          severidad: 'info',
          mensaje: `${mesEnCurso} es el mes en curso y no está completo. No se incluye en promedios.`,
        });
      }

      // ============================================
      // 6. SET STATE
      // ============================================

      if (currentRequestId !== requestIdRef.current) return;

      setData({
        meses,
        mesesCerrados,
        mesEnCurso,
        filas,
        ultimaActualizacion: new Date().toISOString(),
        coberturaReceta,
        advertencias,
      });
    } catch (err) {
      if (currentRequestId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Error cargando evolución temporal';
      console.error('❌ useEvolucionMensual:', err);
      setError(msg);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    anioDesde, mesDesde, anioFin, mesFin,
    segmento, osSigla, prestador, topPrestacionesPorSegmento,
    loadingRecetas, loadingHonorarios,
    recetas, configHonorarios, prestadoresHonorarios,
    fetchAtencionesMes, fetchCostosFijosMes,
    mesHoyKey,
  ]);

  useEffect(() => {
    cargarData();
  }, [cargarData]);

  return {
    data,
    loading: loading || loadingRecetas || loadingHonorarios,
    error,
    refetch: cargarData,
  };
};

export default useEvolucionMensual;
