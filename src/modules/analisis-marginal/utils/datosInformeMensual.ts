// ============================================================
// Modelo de datos del Informe Mensual de Gestión
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// UNA SOLA FUENTE DE VERDAD (regla dura del pedido, 01/09/2026)
// ------------------------------------------------------------
// La PLATA sale de `useEvolucionMensual`, el mismo hook que dibuja la grilla de
// Evolución Temporal. Este módulo no recalcula honorarios, pools ni insumos: lee
// las filas ya construidas por su id. Si el informe y la pantalla se separan, es
// porque alguien tocó el hook, y se separan las dos juntas.
//
// Eso corrige lo que hacía el informe anterior, que consultaba
// `movimientos_geclisa` y rearmaba el costeo por su cuenta. Compartía las
// primitivas, pero era un segundo ensamblado en paralelo: la clase de cosa que
// en agosto dejó $67,4 M de diferencia entre dos pantallas del mismo módulo.
//
// Las CANTIDADES no salen de ahí porque `FilaEvolucion` no las tiene: la grilla
// es sólo importes. Se cuentan sobre las mismas filas de `movimientos_geclisa`
// con `es_principal = true`, que es el universo que usa Análisis → Por
// Prestación. Una fila, una práctica.
//
// SÓLO MESES CERRADOS. El mes en curso no entra al informe: ni como mes
// elegible, ni en la serie, ni en los promedios.
// ============================================================

import type { EvolucionMensualData, FilaEvolucion, Mes } from '@shared/types/evolucionTemporal';
import { parseMesKey, labelMesCorto } from '@shared/types/evolucionTemporal';
import type { MovGecRow } from '@shared/utils/movimientosAgg';
import { detectarSegmento } from '@shared/utils/nombresPrestaciones';
import type { Segmento } from '@shared/utils/nombresPrestaciones';

const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const etiquetaMes = (m: Mes): string => {
  const { anio, mes } = parseMesKey(m);
  return `${MESES_LARGO[mes - 1]} ${anio}`;
};

// ============================================================
// Lectura de la matriz de Evolución
// ============================================================

/** Ids de las filas de nivel 0 y 1 que consume el informe. */
export const FILA = {
  FACTURACION: 'facturacion',
  FACT_CONSULTAS: 'facturacion.consultas',
  FACT_ESTUDIOS: 'facturacion.estudios',
  FACT_CIRUGIAS: 'facturacion.cirugias',
  COSTOS_VARIABLES: 'costos_variables',
  CV_HONORARIOS: 'cv.honorarios',
  CV_POOLS: 'cv.pools',
  CV_INSUMOS: 'cv.insumos',
  MARGEN: 'margen_contribucion',
  COSTOS_FIJOS: 'costos_fijos',
  NO_IDENTIFICADOS: 'costos_no_identificados',
} as const;

/** Aplana el árbol de filas a un índice por id, incluidos los hijos. */
export function indexarFilas(filas: FilaEvolucion[]): Map<string, FilaEvolucion> {
  const idx = new Map<string, FilaEvolucion>();
  const visitar = (fs: FilaEvolucion[]) => {
    for (const f of fs) {
      idx.set(f.id, f);
      if (f.hijos?.length) visitar(f.hijos);
    }
  };
  visitar(filas);
  return idx;
}

const valorDe = (idx: Map<string, FilaEvolucion>, id: string, mes: Mes): number =>
  idx.get(id)?.valores[mes] ?? 0;

// ============================================================
// Simulación de costo laboral
// ============================================================

/**
 * Meses sin liquidación de sueldos cargada.
 *
 * NO es que queden sin costo laboral: `useEvolucionMensual` cae en silencio a la
 * erogación clasificada "Sueldos y Cargas", que vale aproximadamente la mitad
 * del costo real (julio 2026: erogación $5.891.765 contra $11.989.070
 * liquidados). O sea que el mes sale reportado con ~$6 M de costo de menos.
 *
 * La simulación reemplaza esa cifra por una estimada y DECLARADA. Es una
 * estimación etiquetada, no un dato inventado que se hace pasar por real: se
 * marca en cada sección donde aparece el número y la diferencia contra la
 * pantalla se informa en pesos.
 */
export interface SimulacionSueldos {
  /** Meses a los que se les aplica. */
  meses: Mes[];
  /** Importe estimado de costo laboral (bruto + contribuciones). */
  importe: number;
  /** Qué se usó de base, para imprimirlo en la aclaración. */
  base: string;
  /** Lo que venía de la erogación, para poder declarar la diferencia. */
  importeReemplazado: Record<Mes, number>;
}

/** Nombre de la categoría de costo fijo que lleva los sueldos. */
export const CATEGORIA_SUELDOS = 'Sueldos y Cargas';

// ============================================================
// Modelo del informe
// ============================================================

export interface CifrasMes {
  mes: Mes;
  etiqueta: string;
  /** "Ago 26", para ejes de gráficos. */
  etiquetaCorta: string;

  cantidad: number;
  cantidadPorSegmento: Record<Segmento, number>;

  facturacion: number;
  facturacionPorSegmento: Record<Segmento, number>;

  honorarios: number;
  pools: number;
  insumos: number;
  costosVariables: number;

  margenContribucion: number;
  margenContribucionPct: number;

  costosFijos: number;
  costosFijosPorCategoria: { categoria: string; monto: number; estimado: boolean }[];

  noIdentificados: number;

  resultadoOperativo: number;
  resultadoOperativoPct: number;

  ticketPromedio: number;

  /** true si alguna cifra del mes incluye un valor estimado. */
  tieneEstimados: boolean;
  /** Categorías estimadas del mes, para el sello. */
  categoriasEstimadas: string[];
  /** Diferencia contra lo que muestra Evolución Temporal, por la simulación. */
  diferenciaVsPantalla: number;

  coberturaReceta: number;
}

export interface AgregadoPorClave {
  clave: string;
  nombre: string;
  cantidad: number;
  facturacion: number;
  ticket: number;
  /** Participación sobre la facturación del mes, en %. */
  participacion: number;
}

export interface DatosInformeMensual {
  /** Mes del informe. Siempre cerrado. */
  mes: CifrasMes;
  /** Mes anterior cerrado. null si el informe arranca en el primer mes cargado. */
  anterior: CifrasMes | null;
  /** Serie de meses cerrados, del más viejo al más nuevo (hasta 12). */
  serie: CifrasMes[];
  /** Promedio de los meses cerrados previos al del informe (hasta 6). */
  promedio6: {
    meses: number;
    cantidad: number;
    facturacion: number;
    margenContribucion: number;
    costosFijos: number;
    resultadoOperativo: number;
    ticketPromedio: number;
  } | null;

  porObraSocial: AgregadoPorClave[];
  porObraSocialAnterior: AgregadoPorClave[];
  porPrestacion: AgregadoPorClave[];
  porPrestacionAnterior: AgregadoPorClave[];
  porPrestador: AgregadoPorClave[];

  /** Sello de la simulación, si el mes del informe la tiene. */
  simulacion: SimulacionSueldos | null;

  generadoEn: Date;
  generadoPor: string;
  filtros: string[];
}

// ============================================================
// Conteo de cantidades
// ============================================================

const SEG_VACIO = (): Record<Segmento, number> => ({ Consultas: 0, Estudios: 0, Cirugias: 0 });

/** Agrupa filas por mes. Sólo `es_principal` ya viene filtrado por el llamador. */
export function filasPorMes(filas: MovGecRow[]): Map<Mes, MovGecRow[]> {
  const m = new Map<Mes, MovGecRow[]>();
  for (const f of filas) {
    const k = `${f.anio}-${String(f.mes).padStart(2, '0')}`;
    const arr = m.get(k);
    if (arr) arr.push(f);
    else m.set(k, [f]);
  }
  return m;
}

/**
 * Cantidad de prácticas por segmento. El segmento sale del CÓDIGO de la
 * prestación (01 consultas, 02 estudios, 03 y 04 cirugías), no del nombre:
 * por nombre, Exoftalmología —que son 900 prácticas en julio— caía en Estudios
 * siendo una consulta.
 */
function contarPorSegmento(filas: MovGecRow[]): Record<Segmento, number> {
  const acc = SEG_VACIO();
  for (const f of filas) {
    const seg = detectarSegmento(f.practica_nombre || '', f.practica_codigo || '');
    acc[seg] += 1;
  }
  return acc;
}

const agregarPor = (
  filas: MovGecRow[],
  clave: (f: MovGecRow) => { k: string; nombre: string },
  totalFacturado: number,
): AgregadoPorClave[] => {
  const m = new Map<string, AgregadoPorClave>();
  for (const f of filas) {
    const { k, nombre } = clave(f);
    let e = m.get(k);
    if (!e) {
      e = { clave: k, nombre, cantidad: 0, facturacion: 0, ticket: 0, participacion: 0 };
      m.set(k, e);
    }
    e.cantidad += 1;
    e.facturacion += Number(f.total) || 0;
  }
  return [...m.values()]
    .map(e => ({
      ...e,
      ticket: e.cantidad > 0 ? e.facturacion / e.cantidad : 0,
      participacion: totalFacturado > 0 ? (e.facturacion / totalFacturado) * 100 : 0,
    }))
    .sort((a, b) => b.facturacion - a.facturacion);
};

// ============================================================
// Armado
// ============================================================

function armarCifras(
  mes: Mes,
  idx: Map<string, FilaEvolucion>,
  movs: MovGecRow[],
  coberturaReceta: number,
  simulacion: SimulacionSueldos | null,
): CifrasMes {
  const cantidad = movs.length;
  const cantidadPorSegmento = contarPorSegmento(movs);

  const facturacion = valorDe(idx, FILA.FACTURACION, mes);
  const honorarios = valorDe(idx, FILA.CV_HONORARIOS, mes);
  const pools = valorDe(idx, FILA.CV_POOLS, mes);
  const insumos = valorDe(idx, FILA.CV_INSUMOS, mes);
  const costosVariables = valorDe(idx, FILA.COSTOS_VARIABLES, mes);
  const margen = valorDe(idx, FILA.MARGEN, mes);

  // ── Costos fijos, con la simulación aplicada si corresponde ──
  const filaCF = idx.get(FILA.COSTOS_FIJOS);
  const aplicaSim = !!simulacion && simulacion.meses.includes(mes);

  const categorias: { categoria: string; monto: number; estimado: boolean }[] = [];
  let cfTotal = valorDe(idx, FILA.COSTOS_FIJOS, mes);
  let diferencia = 0;

  for (const hijo of filaCF?.hijos ?? []) {
    const esSueldos = hijo.label.trim().toLowerCase() === CATEGORIA_SUELDOS.toLowerCase();
    if (aplicaSim && esSueldos) {
      const reemplazado = hijo.valores[mes] ?? 0;
      diferencia = simulacion!.importe - reemplazado;
      categorias.push({ categoria: hijo.label, monto: simulacion!.importe, estimado: true });
    } else {
      categorias.push({ categoria: hijo.label, monto: hijo.valores[mes] ?? 0, estimado: false });
    }
  }

  // Si el mes se simula y la categoría de sueldos no existía en la grilla (no
  // había ni erogación clasificada), se agrega entera: el costo laboral no puede
  // faltar de un informe de resultado.
  if (aplicaSim && !categorias.some(c => c.estimado)) {
    diferencia = simulacion!.importe;
    categorias.push({ categoria: CATEGORIA_SUELDOS, monto: simulacion!.importe, estimado: true });
  }
  cfTotal += diferencia;

  const noIdentificados = valorDe(idx, FILA.NO_IDENTIFICADOS, mes);
  const resultadoOperativo = margen - cfTotal;
  const categoriasEstimadas = categorias.filter(c => c.estimado).map(c => c.categoria);

  return {
    mes,
    etiqueta: etiquetaMes(mes),
    etiquetaCorta: labelMesCorto(mes),
    cantidad,
    cantidadPorSegmento,
    facturacion,
    facturacionPorSegmento: {
      Consultas: valorDe(idx, FILA.FACT_CONSULTAS, mes),
      Estudios: valorDe(idx, FILA.FACT_ESTUDIOS, mes),
      Cirugias: valorDe(idx, FILA.FACT_CIRUGIAS, mes),
    },
    honorarios, pools, insumos, costosVariables,
    margenContribucion: margen,
    margenContribucionPct: facturacion > 0 ? (margen / facturacion) * 100 : 0,
    costosFijos: cfTotal,
    costosFijosPorCategoria: categorias.sort((a, b) => b.monto - a.monto),
    noIdentificados,
    resultadoOperativo,
    resultadoOperativoPct: facturacion > 0 ? (resultadoOperativo / facturacion) * 100 : 0,
    ticketPromedio: cantidad > 0 ? facturacion / cantidad : 0,
    tieneEstimados: categoriasEstimadas.length > 0,
    categoriasEstimadas,
    diferenciaVsPantalla: diferencia,
    coberturaReceta,
  };
}

export interface ArmarParams {
  evolucion: EvolucionMensualData;
  /** Filas de `movimientos_geclisa` con es_principal = true, de todo el rango. */
  movimientos: MovGecRow[];
  /** Mes del informe. Tiene que estar en `evolucion.mesesCerrados`. */
  mesInforme: Mes;
  simulacion: SimulacionSueldos | null;
  generadoPor: string;
  filtros: string[];
  /** Cuántos meses entran en la serie del informe. */
  mesesSerie?: number;
}

export function armarDatosInformeMensual(p: ArmarParams): DatosInformeMensual {
  const { evolucion, movimientos, mesInforme, simulacion } = p;

  // Sólo meses cerrados, en orden. El mes en curso queda afuera de todo.
  const cerrados = [...evolucion.mesesCerrados].sort();
  const idx = indexarFilas(evolucion.filas);
  const porMes = filasPorMes(movimientos);

  const cifrasDe = (m: Mes) =>
    armarCifras(m, idx, porMes.get(m) ?? [], evolucion.coberturaReceta[m] ?? 100, simulacion);

  const iInforme = cerrados.indexOf(mesInforme);
  const mes = cifrasDe(mesInforme);
  const anterior = iInforme > 0 ? cifrasDe(cerrados[iInforme - 1]) : null;

  // Serie: hasta N meses cerrados terminando en el del informe.
  const nSerie = p.mesesSerie ?? 12;
  const desde = Math.max(0, iInforme - (nSerie - 1));
  const serie = cerrados.slice(desde, iInforme + 1).map(cifrasDe);

  // Promedio de hasta 6 meses cerrados ANTERIORES al del informe.
  const previos = cerrados.slice(Math.max(0, iInforme - 6), iInforme).map(cifrasDe);
  const promedio6 = previos.length
    ? {
        meses: previos.length,
        cantidad: previos.reduce((s, c) => s + c.cantidad, 0) / previos.length,
        facturacion: previos.reduce((s, c) => s + c.facturacion, 0) / previos.length,
        margenContribucion: previos.reduce((s, c) => s + c.margenContribucion, 0) / previos.length,
        costosFijos: previos.reduce((s, c) => s + c.costosFijos, 0) / previos.length,
        resultadoOperativo: previos.reduce((s, c) => s + c.resultadoOperativo, 0) / previos.length,
        ticketPromedio: previos.reduce((s, c) => s + c.ticketPromedio, 0) / previos.length,
      }
    : null;

  const movsMes = porMes.get(mesInforme) ?? [];
  const movsAnt = anterior ? (porMes.get(anterior.mes) ?? []) : [];

  const osDe = (f: MovGecRow) => ({
    k: String(f.os_id ?? 'sd'),
    nombre: f.os_sigla || f.os_nombre || 'Sin obra social',
  });
  const prestacionDe = (f: MovGecRow) => ({
    k: String(f.practica_codigo || f.practica_nombre || 'sd'),
    nombre: f.practica_nombre || 'Sin prestación',
  });
  const prestadorDe = (f: MovGecRow) => ({
    k: String(f.pre_id ?? 'sd'),
    nombre: f.prestador_nombre || 'Sin asignar',
  });

  return {
    mes,
    anterior,
    serie,
    promedio6,
    porObraSocial: agregarPor(movsMes, osDe, mes.facturacion),
    porObraSocialAnterior: anterior ? agregarPor(movsAnt, osDe, anterior.facturacion) : [],
    porPrestacion: agregarPor(movsMes, prestacionDe, mes.facturacion),
    porPrestacionAnterior: anterior ? agregarPor(movsAnt, prestacionDe, anterior.facturacion) : [],
    porPrestador: agregarPor(movsMes, prestadorDe, mes.facturacion),
    simulacion: simulacion && simulacion.meses.includes(mesInforme) ? simulacion : null,
    generadoEn: new Date(),
    generadoPor: p.generadoPor,
    filtros: p.filtros,
  };
}
