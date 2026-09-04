// ============================================================
// PDF de la Evolución Temporal — informe de estado de resultados
// Análisis Marginal · Instituto Dr. Mercado
// ============================================================
//
// QUÉ CAMBIÓ (01/09/2026)
// -----------------------
// Antes era un volcado de la grilla: la tabla tal cual se veía en pantalla, con
// el mes en curso incluido y un cartelito avisando que estaba incompleto. Ahora
// es un informe:
//
//   1. EL MES EN CURSO NO SALE. Ni como columna, ni en los totales, ni en los
//      promedios. Un mes con dos días cargados al lado de meses completos no es
//      una comparación, es una trampa visual — y ningún aviso al pie alcanza
//      para que alguien que hojea el PDF no lea esa columna como una caída.
//
//   2. Arranca por el ÚLTIMO MES CERRADO: sus cifras, cómo cerró contra el mes
//      anterior y contra el promedio, y la lectura por reglas.
//
//   3. Después el ESTADO DE RESULTADOS mes a mes, con el % sobre facturación de
//      cada línea, y al final la evolución con su gráfico.
//
// SOBRE LAS CANTIDADES
// --------------------
// Esta vista es SÓLO IMPORTES: `FilaEvolucion` no tiene cantidad de prácticas.
// Por eso la lectura del mes corre con `cantidadesDisponibles: false` y las
// reglas que separan volumen de precio se callan, en vez de afirmar sobre un
// cero que no significa "cero prácticas" sino "no lo sé". El informe que sí
// cruza volumen y plata es el Informe Mensual de Gestión.
//
// HASTA DÓNDE BAJA
// ----------------
// Hasta nivel 2. Los niveles 3 y 4 (comprobantes, obras sociales, atenciones
// una por una) se cargan bajo demanda y pueden ser miles de filas: no entran en
// un PDF que se imprime. Cuando hay filas abiertas de esos niveles, el informe
// lo dice en vez de omitirlo en silencio.
// ============================================================

import autoTable from 'jspdf-autotable';
import type { FilaEvolucion, Mes } from '@shared/types/evolucionTemporal';
import { labelMesCorto, parseMesKey } from '@shared/types/evolucionTemporal';
import {
  Lienzo, C, M, RGB,
  nuevoLienzo, nuevaHoja, seccion, parrafo, vinieta, aviso, kpi,
  asegurar, cerrar, graficoBarrasLinea, pieDe,
  fmt, fmtPct, vari, varPP,
  type PuntoSerie,
} from './pdf/informeBase';
import { leerMes, type ContextoLectura, type TonoLectura } from './lecturaMes';

const LEYENDA_PIE = 'Uso interno — confidencial · Instituto Dr. Mercado / Survisión S.A.';

const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const etiquetaLarga = (m: Mes): string => {
  const { anio, mes } = parseMesKey(m);
  return `${MESES_LARGO[mes - 1]} ${anio}`;
};

const TONO_COLOR: Record<TonoLectura, RGB> = {
  positivo: C.green, negativo: C.red, alerta: C.amber, neutro: C.medium,
};

/** Fondo de cada banda de nivel 0, en el mismo criterio que la pantalla. */
const FONDO_BANDA: Record<string, RGB> = {
  facturacion: [219, 234, 254],
  costos_variables: [255, 237, 213],
  margen_contribucion: [209, 250, 229],
  costos_fijos: [237, 233, 254],
  costos_no_identificados: [254, 243, 199],
  resultado_operativo: [187, 247, 208],
};

const fmtMoneda = (n: number): string => (!isFinite(n) || n === 0 ? '—' : fmt(n));

export interface DatosEvolucionPDF {
  meses: Mes[];
  mesEnCurso: Mes | null;
  filas: FilaEvolucion[];
  /** Ids de las filas abiertas en pantalla. */
  expandidas: Set<string>;
  /** Si la grilla está en modo porcentaje sobre facturación. */
  mostrarPct: boolean;
  /** Facturación por mes — denominador del modo porcentaje. */
  facturacionPorMes: Record<Mes, number>;
  ultimaActualizacion: string;
}

/** Aplana el árbol respetando qué está abierto. Solo baja hasta nivel 2. */
export function aplanar(
  filas: FilaEvolucion[],
  expandidas: Set<string>,
  acc: FilaEvolucion[] = [],
): FilaEvolucion[] {
  for (const f of filas) {
    acc.push(f);
    if (f.nivel < 2 && expandidas.has(f.id) && f.hijos?.length) {
      aplanar(f.hijos, expandidas, acc);
    }
  }
  return acc;
}

/** Cuenta las filas abiertas cuyo detalle no entra en el PDF. */
export function contarDetalleOmitido(filas: FilaEvolucion[], expandidas: Set<string>): number {
  let n = 0;
  const recorrer = (arr: FilaEvolucion[]) => {
    for (const f of arr) {
      if (f.detalleLazy && expandidas.has(f.id)) n++;
      if (f.hijos?.length) recorrer(f.hijos);
    }
  };
  recorrer(filas);
  return n;
}

// ============================================================
// Lectura de la matriz
// ============================================================

const buscar = (filas: FilaEvolucion[], id: string): FilaEvolucion | null => {
  for (const f of filas) {
    if (f.id === id) return f;
    if (f.hijos?.length) {
      const h = buscar(f.hijos, id);
      if (h) return h;
    }
  }
  return null;
};

const valor = (filas: FilaEvolucion[], id: string, m: Mes): number =>
  buscar(filas, id)?.valores[m] ?? 0;

interface CifrasMes {
  mes: Mes;
  facturacion: number;
  costosVariables: number;
  margen: number;
  costosFijos: number;
  noIdentificados: number;
  resultado: number;
  margenPct: number;
  resultadoPct: number;
}

const cifras = (filas: FilaEvolucion[], m: Mes): CifrasMes => {
  const facturacion = valor(filas, 'facturacion', m);
  const costosVariables = valor(filas, 'costos_variables', m);
  const margen = valor(filas, 'margen_contribucion', m);
  const costosFijos = valor(filas, 'costos_fijos', m);
  const noIdentificados = valor(filas, 'costos_no_identificados', m);
  const resultado = margen - costosFijos;
  return {
    mes: m, facturacion, costosVariables, margen, costosFijos, noIdentificados, resultado,
    margenPct: facturacion > 0 ? (margen / facturacion) * 100 : 0,
    resultadoPct: facturacion > 0 ? (resultado / facturacion) * 100 : 0,
  };
};

const promedio = (c: CifrasMes[], get: (x: CifrasMes) => number): number =>
  c.length ? c.reduce((s, x) => s + get(x), 0) / c.length : 0;

// ============================================================
// Meses cuyo costo laboral NO viene del módulo de Sueldos
// ============================================================
// `useEvolucionMensual` usa el costo laboral liquidado (bruto + cargas) cuando
// el mes está cargado en el módulo, y si no cae EN SILENCIO a la erogación
// clasificada "Sueldos y Cargas", que vale aproximadamente la mitad. Medido en
// julio 2026: erogación $5.891.765 contra $11.989.070 liquidados.
//
// El síntoma en la grilla es inconfundible: los meses del módulo tienen las
// líneas "Sueldos", "Cargas Sociales" y "HC empleados"; el mes que cayó al
// fallback las tiene todas en cero y aparece una única "Sueldos y Cargas".
//
// Sin esto el informe cuenta un cuento al revés: agosto 2026 salía con la
// estructura "31,4% por debajo del promedio" y el mejor resultado del año,
// cuando lo que pasaba era que le faltaban seis millones de sueldos.

const ETIQUETA_MODULO = ['sueldos', 'cargas sociales', 'hc empleados'];
const ETIQUETA_EROGACION = 'sueldos y cargas';

const norm = (s: string) => s.trim().toLowerCase();

/** Meses en los que el costo laboral salió de la erogación y está subestimado. */
export function mesesConCostoLaboralIncompleto(filas: FilaEvolucion[], meses: Mes[]): Mes[] {
  const cf = buscar(filas, 'costos_fijos');
  if (!cf?.hijos?.length) return [];
  const delModulo = cf.hijos.filter(h => ETIQUETA_MODULO.includes(norm(h.label)));
  const deErogacion = cf.hijos.filter(h => norm(h.label) === ETIQUETA_EROGACION);
  if (!delModulo.length || !deErogacion.length) return [];

  return meses.filter(m => {
    const modulo = delModulo.reduce((s, h) => s + (h.valores[m] || 0), 0);
    const erog = deErogacion.reduce((s, h) => s + (h.valores[m] || 0), 0);
    return modulo === 0 && erog > 0;
  });
}

// ============================================================
// Documento
// ============================================================

export function armarEvolucionPDF(datos: DatosEvolucionPDF): Lienzo {
  const { mesEnCurso, filas, expandidas, mostrarPct, facturacionPorMes } = datos;

  // ── El mes en curso queda afuera de TODO ──
  const meses = datos.meses.filter(m => m !== mesEnCurso).sort();
  const cerrado = meses.length ? meses[meses.length - 1] : null;

  const desde = meses[0] ? labelMesCorto(meses[0]) : '';
  const hasta = cerrado ? labelMesCorto(cerrado) : '';
  const periodo = meses.length === 1 ? desde : `${desde} a ${hasta}`;

  const L = nuevoLienzo(`Evolución Temporal — ${periodo}`, 'l');
  const { doc } = L;

  if (!meses.length) {
    // Único caso en que el informe no tiene nada que decir: se dice.
    L.seccion = '';
    nuevaHoja(L);
    parrafo(L,
      'No hay meses cerrados en el rango seleccionado. El informe sólo incluye meses ' +
      'completos: si el rango abarca únicamente el mes en curso, no hay nada que comparar.',
      { size: 11 });
    cerrar(L, LEYENDA_PIE);
    return L;
  }

  const serie = meses.map(m => cifras(filas, m));
  const ult = serie[serie.length - 1];
  const prev = serie.length > 1 ? serie[serie.length - 2] : null;
  const previos = serie.slice(0, -1);

  const sinLiquidacion = mesesConCostoLaboralIncompleto(filas, meses);

  portada(L, datos, meses, ult, periodo, sinLiquidacion);
  seccionUltimoMes(L, ult, prev, previos, cerrado!, sinLiquidacion);
  seccionEstadoResultados(L, meses, filas, expandidas, mostrarPct, facturacionPorMes, datos, sinLiquidacion);
  seccionEvolucion(L, serie, sinLiquidacion);

  cerrar(L, LEYENDA_PIE);
  return L;
}

// ── Portada ──────────────────────────────────────────────────────────────────

function portada(
  L: Lienzo, datos: DatosEvolucionPDF, meses: Mes[], ult: CifrasMes, periodo: string,
  sinLiquidacion: Mes[],
) {
  const { doc } = L;

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, L.pw, 6, 'F');

  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INSTITUTO DR. MERCADO', L.pw / 2, 30, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...C.medium);
  doc.text('Survisión S.A.', L.pw / 2, 37, { align: 'center' });

  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.8);
  doc.line(M + 40, 44, L.pw - M - 40, 44);

  doc.setTextColor(...C.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Evolución Temporal y Estado de Resultados', L.pw / 2, 58, { align: 'center' });

  doc.setFontSize(24);
  doc.setTextColor(...C.dark);
  doc.text(periodo.toUpperCase(), L.pw / 2, 74, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.medium);
  doc.text(
    `${meses.length} ${meses.length === 1 ? 'mes cerrado' : 'meses cerrados'} · último cerrado: ${etiquetaLarga(ult.mes)}`,
    L.pw / 2, 82, { align: 'center' },
  );

  // ── Cifras del último mes, grandes ──
  const w = (L.cw - 16) / 3;
  const y0 = 94;
  kpi(L, M, y0, w, `FACTURACIÓN — ${labelMesCorto(ult.mes)}`, fmt(ult.facturacion));
  kpi(L, M + w + 8, y0, w, `MARGEN DE CONTRIBUCIÓN (${fmtPct(ult.margenPct)})`, fmt(ult.margen));
  kpi(L, M + (w + 8) * 2, y0, w, `RESULTADO OPERATIVO (${fmtPct(ult.resultadoPct)})`, fmt(ult.resultado));

  L.y = y0 + 26;

  // ── Qué queda afuera, dicho en la portada ──
  const notas: string[] = [];
  if (datos.mesEnCurso) {
    notas.push(
      `${etiquetaLarga(datos.mesEnCurso)} es el mes en curso y NO se incluye: ni como ` +
      'columna, ni en los totales, ni en los promedios. Un mes a medio cargar al lado de ' +
      'meses completos se lee como una caída que no ocurrió.',
    );
  }
  const omitido = contarDetalleOmitido(datos.filas, datos.expandidas);
  if (omitido > 0) {
    notas.push(
      `${omitido} ${omitido === 1 ? 'fila tiene' : 'filas tienen'} abierto el detalle por ` +
      'comprobante o por atención. Ese nivel no entra en el PDF y se consulta en pantalla.',
    );
  }
  if (sinLiquidacion.length) {
    notas.push(
      `COSTO LABORAL INCOMPLETO en ${sinLiquidacion.map(etiquetaLarga).join(', ')}: ` +
      'no hay liquidación de sueldos cargada y el sistema toma la erogación clasificada, ' +
      'que vale alrededor de la mitad del costo real. En esos meses los costos fijos están ' +
      'SUBESTIMADOS y el resultado operativo SOBREESTIMADO. Cualquier mejora que muestren ' +
      'contra el resto del período hay que leerla con eso en la mano.',
    );
  }
  notas.push(
    'Esta vista es de importes. Para el cruce de volumen y plata —cantidad de prácticas ' +
    'al lado de cada cifra— está el Informe Mensual de Gestión.',
  );
  for (const n of notas) aviso(L, n, n.startsWith('Esta vista') ? 'info' : 'alerta');

  const f = datos.ultimaActualizacion ? new Date(datos.ultimaActualizacion) : new Date();
  doc.setFontSize(8);
  doc.setTextColor(...C.medium);
  doc.text(`Datos al ${f.toLocaleString('es-AR')}.`, L.pw / 2, pieDe(L) - 4, { align: 'center' });
  doc.text('Uso interno — confidencial', L.pw / 2, pieDe(L), { align: 'center' });
}

// ── 1 · El último mes cerrado ────────────────────────────────────────────────

function seccionUltimoMes(
  L: Lienzo, ult: CifrasMes, prev: CifrasMes | null, previos: CifrasMes[], cerradoMes: Mes,
  sinLiquidacion: Mes[],
) {
  seccion(L, `1. ${etiquetaLarga(cerradoMes)} — el último mes cerrado`, { hojaNueva: true });

  const p = previos.length
    ? {
        facturacion: promedio(previos, x => x.facturacion),
        margen: promedio(previos, x => x.margen),
        costosFijos: promedio(previos, x => x.costosFijos),
        resultado: promedio(previos, x => x.resultado),
        margenPct: promedio(previos, x => x.margenPct),
        resultadoPct: promedio(previos, x => x.resultadoPct),
      }
    : null;

  const filaComp = (
    etq: string, act: number, ant: number | null, prom: number | null, esPct = false,
  ) => [
    etq,
    esPct ? fmtPct(act) : fmt(act),
    ant === null ? 'sin mes anterior' : (esPct ? fmtPct(ant) : fmt(ant)),
    ant === null ? '—' : (esPct ? varPP(act, ant) : vari(act, ant).texto),
    prom === null ? 'sin base' : (esPct ? fmtPct(prom) : fmt(prom)),
    prom === null ? '—' : (esPct ? varPP(act, prom) : vari(act, prom).texto),
  ];

  autoTable(doc(L), {
    startY: L.y,
    margin: { left: M, right: M, bottom: 20 },
    theme: 'grid',
    showHead: 'everyPage',
    head: [[
      'Concepto',
      labelMesCorto(ult.mes),
      prev ? labelMesCorto(prev.mes) : 'Mes anterior',
      'Var.',
      previos.length ? `Prom. ${previos.length}m` : 'Promedio',
      'Var.',
    ]],
    body: [
      filaComp('Facturación', ult.facturacion, prev?.facturacion ?? null, p?.facturacion ?? null),
      filaComp('Costos variables', ult.costosVariables, prev?.costosVariables ?? null, previos.length ? promedio(previos, x => x.costosVariables) : null),
      filaComp('Margen de contribución', ult.margen, prev?.margen ?? null, p?.margen ?? null),
      filaComp('Margen s/ facturación', ult.margenPct, prev?.margenPct ?? null, p?.margenPct ?? null, true),
      filaComp('Costos fijos', ult.costosFijos, prev?.costosFijos ?? null, p?.costosFijos ?? null),
      filaComp('Resultado operativo', ult.resultado, prev?.resultado ?? null, p?.resultado ?? null),
      filaComp('Resultado s/ facturación', ult.resultadoPct, prev?.resultadoPct ?? null, p?.resultadoPct ?? null, true),
    ],
    styles: { fontSize: 8, cellPadding: 2, lineColor: [225, 228, 232], lineWidth: 0.1 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontSize: 8, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.tableAlt },
    columnStyles: {
      0: { cellWidth: 62, fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right';
      if (h.section !== 'body') return;
      // Margen y resultado, resaltados: son las dos líneas que se miran.
      if (h.row.index === 2 || h.row.index === 5) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      }
      if (h.column.index === 3 || h.column.index === 5) {
        const t = String(h.cell.raw);
        if (t.startsWith('+')) h.cell.styles.textColor = C.green;
        else if (t.startsWith('-')) h.cell.styles.textColor = C.red;
      }
    },
    didDrawPage: (d) => { if (d.pageNumber > 1) membreteDe(L); },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 7;

  // ── Lectura por reglas ──
  if (!prev) {
    parrafo(L,
      'No hay un mes cerrado anterior en el rango, así que no se puede leer la variación.',
      { size: 8.5, color: C.medium });
    return;
  }

  const varDe = (x: number, y: number) => (y !== 0 ? ((x - y) / Math.abs(y)) * 100 : 0);
  const ctx: ContextoLectura = {
    mesEtiqueta: etiquetaLarga(ult.mes),
    mesAnteriorEtiqueta: etiquetaLarga(prev.mes),
    varFacturacion: varDe(ult.facturacion, prev.facturacion),
    varCantidad: 0,
    varTicket: 0,
    varCostosFijos: varDe(ult.costosFijos, prev.costosFijos),
    varCostosFijosVsPromedio: p ? varDe(ult.costosFijos, p.costosFijos) : 0,
    margenPct: ult.margenPct,
    margenPctAnterior: prev.margenPct,
    resultadoOperativo: ult.resultado,
    resultadoOperativoPct: ult.resultadoPct,
    segmentos: [],
    obraSocialTop: null,
    coberturaReceta: 100,
    categoriasSimuladas: [],
    sinClasificar: ult.noIdentificados,
    // Esta vista no trae cantidades: las reglas de volumen se callan.
    cantidadesDisponibles: false,
  };

  // Si al último mes le falta el costo laboral, eso se dice ANTES que cualquier
  // lectura: sin ese aviso, la baja de estructura se lee como una mejora.
  const ultIncompleto = sinLiquidacion.includes(ult.mes);
  if (ultIncompleto) {
    aviso(L,
      `${etiquetaLarga(ult.mes)} NO tiene liquidación de sueldos cargada. Sus costos fijos ` +
      `(${fmt(ult.costosFijos)}) sólo incluyen la erogación clasificada de sueldos, que vale ` +
      'alrededor de la mitad del costo laboral real. La baja de estructura y la mejora de ' +
      'resultado que muestran las columnas de arriba son, en buena parte, ese faltante: no ' +
      'son un ahorro. Las cifras del mes quedan provisorias hasta cargar la liquidación.');
  }

  // La lectura de estructura se calla si el mes tiene el costo laboral
  // incompleto: sería atribuir a gestión lo que es un dato que falta. Se filtra
  // ANTES de decidir si el título va, para no dejarlo huérfano.
  const lecturas = leerMes(ctx, 5)
    .filter(l => !(ultIncompleto && l.regla === 'costos_fijos_vs_promedio'));

  if (lecturas.length) {
    asegurar(L, 12 + lecturas.length * 9);
    parrafo(L, 'Lectura del mes', { bold: true, size: 10, color: C.primary });
    for (const l of lecturas) vinieta(L, l.texto, TONO_COLOR[l.tono]);
  } else if (!ultIncompleto) {
    parrafo(L,
      `${etiquetaLarga(ult.mes)} cerró sin desvíos que superen los umbrales de alerta ` +
      'definidos: facturación, margen y estructura se movieron dentro de lo esperable.',
      { size: 8.5, color: C.medium });
  }

  if (ult.noIdentificados > 0) {
    aviso(L,
      `Costos no identificados de ${etiquetaLarga(ult.mes)}: ${fmt(ult.noIdentificados)}, ` +
      `el ${fmtPct(ult.facturacion > 0 ? (ult.noIdentificados / ult.facturacion) * 100 : 0)} ` +
      'de la facturación. Incluye facturación sin receta y erogaciones sin clasificar; ' +
      'mientras esté ahí, el margen real es algo menor que el informado.');
  }
}

// ── 2 · Estado de resultados ─────────────────────────────────────────────────

function seccionEstadoResultados(
  L: Lienzo, meses: Mes[], filas: FilaEvolucion[], expandidas: Set<string>,
  mostrarPct: boolean, facturacionPorMes: Record<Mes, number>, datos: DatosEvolucionPDF,
  sinLiquidacion: Mes[],
) {
  seccion(L, '2. Estado de resultados mes a mes', { hojaNueva: true });

  parrafo(L,
    mostrarPct
      ? 'Cada línea como porcentaje de la facturación de su mes.'
      : 'Importes en pesos. La columna Total suma el período; el promedio es sobre meses cerrados.',
    { size: 8.5, color: C.medium });

  const visibles = aplanar(filas, expandidas);

  // Total y promedio se recalculan SOBRE LOS MESES CERRADOS. Los de la fila
  // vienen del hook e incluyen el mes en curso: usarlos acá contradiría la
  // decisión de excluirlo.
  const totalDe = (f: FilaEvolucion) => meses.reduce((s, m) => s + (f.valores[m] || 0), 0);

  const body = visibles.map(f => {
    const sangria = f.nivel === 0 ? '' : f.nivel === 1 ? '   ' : '      ';
    const celdas = meses.map(m => {
      const v = f.valores[m] || 0;
      const fact = facturacionPorMes[m] || 0;
      if (v === 0) return '—';
      return mostrarPct && fact > 0 ? fmtPct((v / fact) * 100) : fmtMoneda(v);
    });
    const tot = totalDe(f);
    return [
      `${sangria}${f.label}`,
      ...celdas,
      fmtMoneda(tot),
      meses.length ? fmtMoneda(tot / meses.length) : '—',
    ];
  });

  // La columna de concepto cede ancho cuando hay muchos meses: con 12 meses y
  // 58 mm fijos, un total anual de nueve cifras se corta.
  const anchoConcepto = meses.length >= 11 ? 42 : meses.length >= 9 ? 50 : 58;

  autoTable(doc(L), {
    head: [[
      'Concepto',
      ...meses.map(m => labelMesCorto(m) + (sinLiquidacion.includes(m) ? ' *' : '')),
      'Total', 'Prom.',
    ]],
    body,
    startY: L.y,
    margin: { left: M, right: M, top: 30, bottom: 20 },
    theme: 'grid',
    showHead: 'everyPage',
    styles: {
      fontSize: 6.5, cellPadding: 1.2, textColor: C.dark,
      lineColor: [229, 231, 235], lineWidth: 0.1, overflow: 'ellipsize',
    },
    headStyles: { fillColor: C.primary, textColor: C.white, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: anchoConcepto, halign: 'left' },
      ...Object.fromEntries(meses.map((_, i) => [i + 1, { halign: 'right' as const }])),
      [meses.length + 1]: { halign: 'right' as const, fontStyle: 'bold' as const },
      [meses.length + 2]: { halign: 'right' as const, textColor: C.medium },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => {
      if (d.section !== 'body') return;
      const f = visibles[d.row.index];
      if (!f) return;
      if (f.nivel === 0) {
        d.cell.styles.fillColor = FONDO_BANDA[f.tipo] || C.light;
        d.cell.styles.fontStyle = 'bold';
      } else if (f.metadata?.esSubtotal) {
        d.cell.styles.fontStyle = 'bold';
      }
      if (f.tipo === 'resultado_operativo' && d.column.index > 0) {
        const txt = String(d.cell.raw ?? '');
        if (txt.startsWith('-') || txt.includes('-$')) d.cell.styles.textColor = C.red;
        else if (txt !== '—') d.cell.styles.textColor = C.green;
      }
    },
    // Las hojas que abre autoTable por su cuenta necesitan su membrete.
    didDrawPage: (d) => { if (d.pageNumber > 1) membreteDe(L); },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 5;

  if (sinLiquidacion.length) {
    parrafo(L,
      `* ${sinLiquidacion.map(labelMesCorto).join(', ')}: sin liquidación de sueldos cargada. ` +
      'El costo laboral sale de la erogación clasificada y está subestimado; el total y el ' +
      'promedio de Costos Fijos también.',
      { size: 7.5, color: C.amber, bold: true });
  }
  if (datos.mesEnCurso) {
    parrafo(L,
      `El total y el promedio se calculan sobre los ${meses.length} meses cerrados. ` +
      `${etiquetaLarga(datos.mesEnCurso)} está excluido.`,
      { size: 7.5, color: C.medium });
  }
}

// ── 3 · Evolución ────────────────────────────────────────────────────────────

function seccionEvolucion(L: Lienzo, serie: CifrasMes[], sinLiquidacion: Mes[]) {
  seccion(L, '3. Evolución del período', { hojaNueva: true });

  const puntos: PuntoSerie[] = serie.map(s => ({
    etiqueta: labelMesCorto(s.mes) + (sinLiquidacion.includes(s.mes) ? ' *' : ''),
    barra: s.facturacion,
    linea: s.resultado,
    // Rayada: el resultado de ese mes está sobreestimado por el costo laboral
    // que falta, y en el gráfico es donde más engaña.
    estimado: sinLiquidacion.includes(s.mes),
  }));
  graficoBarrasLinea(L, puntos, {
    alto: 56,
    leyendaBarra: 'Facturación',
    leyendaLinea: 'Resultado operativo',
  });

  if (sinLiquidacion.length) {
    parrafo(L,
      `* ${sinLiquidacion.map(etiquetaLarga).join(', ')} sin liquidación de sueldos: su ` +
      'resultado operativo está sobreestimado. El pico de la línea en esos meses no es real.',
      { size: 7.5, color: C.amber, bold: true });
  }

  if (serie.length < 2) {
    parrafo(L, 'Con un solo mes cerrado no hay tendencia que describir.', { size: 9, color: C.medium });
    return;
  }

  // ── Descripción de la tendencia, por reglas ──
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  const mejorRO = serie.reduce((a, b) => (b.resultado > a.resultado ? b : a));
  const peorRO = serie.reduce((a, b) => (b.resultado < a.resultado ? b : a));
  const mejorFact = serie.reduce((a, b) => (b.facturacion > a.facturacion ? b : a));

  const promRO = promedio(serie, x => x.resultado);
  const promMargenPct = promedio(serie, x => x.margenPct);

  asegurar(L, 40);
  parrafo(L, 'Lectura del período', { bold: true, size: 10, color: C.primary });

  const vFact = vari(ultimo.facturacion, primero.facturacion);
  vinieta(L,
    `La facturación pasó de ${fmt(primero.facturacion)} en ${etiquetaLarga(primero.mes)} a ` +
    `${fmt(ultimo.facturacion)} en ${etiquetaLarga(ultimo.mes)} (${vFact.texto}). ` +
    `El mes de mayor facturación fue ${etiquetaLarga(mejorFact.mes)}, con ${fmt(mejorFact.facturacion)}.`,
    vFact.pos ? C.green : C.red);

  vinieta(L,
    `El resultado operativo promedió ${fmt(promRO)} por mes, con máximo en ` +
    `${etiquetaLarga(mejorRO.mes)} (${fmt(mejorRO.resultado)}) y mínimo en ` +
    `${etiquetaLarga(peorRO.mes)} (${fmt(peorRO.resultado)}).`);

  vinieta(L,
    `El margen de contribución promedió ${fmtPct(promMargenPct)} de la facturación. ` +
    `${etiquetaLarga(ultimo.mes)} cerró en ${fmtPct(ultimo.margenPct)}, ` +
    `${ultimo.margenPct >= promMargenPct ? 'por encima' : 'por debajo'} de ese promedio.`,
    ultimo.margenPct >= promMargenPct ? C.green : C.amber);

  if (sinLiquidacion.length) {
    vinieta(L,
      `${sinLiquidacion.length === 1 ? 'Un mes del período no tiene' : `${sinLiquidacion.length} meses del período no tienen`} ` +
      `la liquidación de sueldos cargada (${sinLiquidacion.map(etiquetaLarga).join(', ')}). ` +
      'Su resultado operativo está sobreestimado y arrastra hacia arriba el promedio del ' +
      'período: las comparaciones contra esos meses no son del todo válidas.',
      C.amber);
  }

  const mesesNegativos = serie.filter(s => s.resultado < 0);
  if (mesesNegativos.length) {
    vinieta(L,
      `${mesesNegativos.length} ${mesesNegativos.length === 1 ? 'mes cerró' : 'meses cerraron'} ` +
      `con resultado operativo negativo: ${mesesNegativos.map(s => labelMesCorto(s.mes)).join(', ')}.`,
      C.red);
  }

  // Tabla de apoyo del gráfico. Se reserva el alto completo (encabezado + una
  // fila por mes) para que no se parta dejando dos o tres meses sueltos en una
  // hoja: leída así, la serie deja de leerse como serie.
  asegurar(L, 12 + serie.length * 5.2);
  autoTable(doc(L), {
    startY: L.y,
    margin: { left: M, right: M, top: 30, bottom: 20 },
    theme: 'grid',
    showHead: 'everyPage',
    head: [['Mes', 'Facturación', 'Margen contrib.', 'MC %', 'Costos fijos', 'Resultado op.', 'RO %']],
    body: serie.map(s => [
      etiquetaLarga(s.mes), fmt(s.facturacion), fmt(s.margen), fmtPct(s.margenPct),
      fmt(s.costosFijos), fmt(s.resultado), fmtPct(s.resultadoPct),
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [225, 228, 232], lineWidth: 0.1 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontSize: 7.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.tableAlt },
    columnStyles: {
      0: { cellWidth: 34 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right';
      if (h.section === 'body' && (h.column.index === 5 || h.column.index === 6)) {
        h.cell.styles.textColor = String(h.cell.raw).includes('-') ? C.red : C.green;
      }
    },
    // Si aun así se parte, la hoja que abre autoTable necesita su membrete: si
    // no, sale una página suelta sin identificación institucional.
    didDrawPage: (d) => { if (d.pageNumber > 1) membreteDe(L); },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;
}

// ── Utilidades locales ───────────────────────────────────────────────────────

const doc = (L: Lienzo) => L.doc;

/** Repone el membrete en una hoja abierta por autoTable. */
function membreteDe(L: Lienzo) {
  const { doc: d } = L;
  d.setFillColor(...C.primary);
  d.rect(0, 0, L.pw, 22, 'F');
  d.setTextColor(...C.white);
  d.setFontSize(10);
  d.setFont('helvetica', 'bold');
  d.text('Instituto Dr. Mercado', M, 9);
  d.setFont('helvetica', 'normal');
  d.setFontSize(8);
  d.text(L.subtitulo, M, 15);
  if (L.seccion) d.text(L.seccion, L.pw - M, 12, { align: 'right' });
  d.setTextColor(...C.dark);
}

/** Arma y descarga. */
export function generarEvolucionPDF(datos: DatosEvolucionPDF): void {
  const L = armarEvolucionPDF(datos);
  const meses = datos.meses.filter(m => m !== datos.mesEnCurso).sort();
  const nombre = `Evolucion_Temporal_${meses[0] || ''}_${meses[meses.length - 1] || ''}.pdf`;
  L.doc.save(nombre.replace(/\s+/g, '_'));
}

export default generarEvolucionPDF;
