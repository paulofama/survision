// ============================================================
// Informe Mensual de Gestión — PDF
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// Entregable para la dirección, un PDF por mes cerrado.
//
// Dos cosas lo separan del informe de período que ya existía
// (`generarInformeGestion.ts`, que sigue vivo y sin cambios de salida):
//
//   1. VOLUMEN Y PLATA JUNTOS. Cada cifra de dinero va con su cantidad de
//      prácticas al lado, en todos los cortes. Una caída de facturación con la
//      misma cantidad de prácticas y una caída por menos prácticas son dos
//      historias distintas, y el informe tiene que dejar ver cuál pasó. Por eso
//      lo PRIMERO que se lee, antes que cualquier peso, son las tres líneas de
//      cantidad: consultas, estudios y cirugías.
//
//   2. SECCIÓN 4, "qué explica el cambio". El puente que descompone la
//      variación de resultado operativo en volumen, precio/mezcla, costos
//      variables y costos fijos, y que cierra al peso (ver `puenteResultado.ts`).
//
// Las primitivas de jsPDF salen de `pdf/informeBase.ts`, compartidas con el otro
// informe: no hay dos máquinas de PDF.
// ============================================================

import autoTable from 'jspdf-autotable';
import {
  Lienzo, C, M, CW, PW, PH, Y_CONTENIDO, RGB,
  nuevoLienzo, nuevaHoja, membrete, seccion, parrafo, vinieta, aviso, kpi,
  asegurar, cerrar, graficoBarrasLinea, graficoPuente,
  fmt, fmtCant, fmtPct, fmtDelta, vari, varPP, alinear,
  type PuntoSerie, type BarraPuente,
} from './pdf/informeBase';
import type { DatosInformeMensual, CifrasMes } from './datosInformeMensual';
import { construirPuente, rankearImpacto, puenteCierra, type LineaImpacto } from './puenteResultado';
import { leerMes, type ContextoLectura, type Lectura, type TonoLectura } from './lecturaMes';

const LEYENDA_PIE = 'Uso interno — confidencial · Instituto Dr. Mercado / Survisión S.A.';

/** Comprobante de costo fijo, para explicar el desvío de una categoría. */
export interface ComprobanteCF {
  categoria: string;
  fecha: string;
  proveedor: string;
  descripcion: string;
  monto: number;
}

export interface OpcionesInforme {
  /** Comprobantes de las categorías de mayor desvío (los trae el modal). */
  comprobantes?: ComprobanteCF[];
  /** Erogaciones del mes todavía sin clasificar, en $. */
  sinClasificar?: number;
  /** Anexo con el detalle completo por prestación. */
  incluirAnexo?: boolean;
}

// ── Estilo común de tablas ───────────────────────────────────────────────────
// `showHead: 'everyPage'` es lo que garantiza que una tabla partida NUNCA deje
// su encabezado en la página anterior.

const TABLA_BASE = {
  theme: 'grid' as const,
  styles: { fontSize: 7.5, cellPadding: 1.6, lineWidth: 0.1, lineColor: [220, 223, 228] as RGB },
  headStyles: { fillColor: C.primary, textColor: C.white, fontSize: 7.5, fontStyle: 'bold' as const },
  alternateRowStyles: { fillColor: C.tableAlt },
  showHead: 'everyPage' as const,
  margin: { left: M, right: M, top: Y_CONTENIDO, bottom: 22 },
};

const TONO_COLOR: Record<TonoLectura, RGB> = {
  positivo: C.green, negativo: C.red, alerta: C.amber, neutro: C.medium,
};

const colorDe = (n: number): RGB => (n >= 0 ? C.green : C.red);

/** Marca visible de dato estimado. Va donde aparece el número, no sólo al pie. */
const SELLO_EST = ' (est.)';

// ============================================================
// Documento
// ============================================================

/** Nombre del archivo: `Informe-Gestion-2026-07.pdf`. */
export const nombreArchivo = (d: DatosInformeMensual): string => `Informe-Gestion-${d.mes.mes}.pdf`;

/**
 * Arma el PDF sin descargarlo. Separado de `generarInformeMensualPDF` para
 * poder inspeccionarlo en tests: `save()` en jsdom no escribe a disco.
 */
export function armarInformeMensual(
  d: DatosInformeMensual,
  opts: OpcionesInforme = {},
): Lienzo {
  const L = nuevoLienzo(`Informe Mensual de Gestión — ${d.mes.etiqueta}`);
  const { doc } = L;

  portada(L, d);

  seccionResumen(L, d);
  seccionVolumen(L, d);
  seccionEvolucion(L, d);
  seccionExplicacion(L, d);
  seccionPrestaciones(L, d);
  seccionObrasSociales(L, d);
  seccionCostos(L, d, opts);
  seccionCalidad(L, d, opts);
  if (opts.incluirAnexo) anexo(L, d);

  // ── Índice ──
  // Se inserta como página 2 recién ahora, cuando ya se sabe cuántas páginas
  // hay y en cuál cayó cada sección. Insertar corre todo una posición, así que
  // los números registrados se ajustan en +1.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDoc = doc as any;
  if (anyDoc.getNumberOfPages() > 4) {
    anyDoc.insertPage(2);
    anyDoc.setPage(2);
    L.seccion = 'Índice';
    membrete(L);
    L.y = Y_CONTENIDO;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text('Índice', M, L.y);
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.5);
    doc.line(M, L.y + 2, M + CW, L.y + 2);
    L.y += 11;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    for (const it of L.indice) {
      doc.setTextColor(...C.dark);
      doc.text(it.titulo, M + 2, L.y);
      doc.setTextColor(...C.medium);
      const pag = String(it.pagina + 1);
      doc.text(pag, PW - M, L.y, { align: 'right' });
      // Línea de puntos entre el título y el número
      const x0 = M + 4 + doc.getTextWidth(it.titulo);
      const x1 = PW - M - doc.getTextWidth(pag) - 2;
      doc.setDrawColor(215, 218, 222);
      doc.setLineWidth(0.15);
      for (let x = x0; x < x1; x += 2) doc.line(x, L.y - 0.8, Math.min(x + 0.7, x1), L.y - 0.8);
      L.y += 6;
    }
  }

  cerrar(L, LEYENDA_PIE);
  return L;
}

/** Arma y descarga. Es lo que llama el modal. */
export function generarInformeMensualPDF(
  d: DatosInformeMensual,
  opts: OpcionesInforme = {},
): void {
  const L = armarInformeMensual(d, opts);
  L.doc.save(nombreArchivo(d));
}

// ============================================================
// Portada
// ============================================================

function portada(L: Lienzo, d: DatosInformeMensual) {
  const { doc } = L;
  const m = d.mes;

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PW, 6, 'F');

  doc.setDrawColor(...C.primary);
  doc.setLineWidth(1);
  doc.line(M, 52, PW - M, 52);

  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('INSTITUTO DR. MERCADO', PW / 2, 36, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...C.medium);
  doc.text('Survisión S.A.', PW / 2, 44, { align: 'center' });

  doc.setTextColor(...C.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Informe Mensual de Gestión', PW / 2, 72, { align: 'center' });

  doc.setFontSize(32);
  doc.setTextColor(...C.dark);
  doc.text(m.etiqueta.toUpperCase(), PW / 2, 92, { align: 'center' });

  // Tarjeta con las tres cantidades: es lo primero que se ve del informe.
  const cy = 110;
  doc.setFillColor(...C.light);
  doc.roundedRect(M + 12, cy, CW - 24, 46, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.medium);
  doc.text('PRÁCTICAS REALIZADAS', PW / 2, cy + 8, { align: 'center' });
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text(fmtCant(m.cantidad), PW / 2, cy + 21, { align: 'center' });

  const segs: [string, number][] = [
    ['Consultas', m.cantidadPorSegmento.Consultas],
    ['Estudios', m.cantidadPorSegmento.Estudios],
    ['Cirugías', m.cantidadPorSegmento.Cirugias],
  ];
  const anchoSeg = (CW - 24) / 3;
  segs.forEach(([nombre, cant], i) => {
    const x = M + 12 + anchoSeg * (i + 0.5);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.medium);
    doc.text(nombre, x, cy + 32, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text(fmtCant(cant), x, cy + 40, { align: 'center' });
  });

  // Datos de emisión
  let y = 172;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.dark);
  const linea = (etq: string, val: string) => {
    doc.setTextColor(...C.medium);
    doc.text(etq, M + 30, y);
    doc.setTextColor(...C.dark);
    doc.text(val, M + 70, y);
    y += 6;
  };
  const f = d.generadoEn;
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  linea('Emitido', `${dd}/${mm}/${f.getFullYear()} ${hh}:${mi}`);
  linea('Generado por', d.generadoPor || 'no identificado');
  linea('Filtros', d.filtros.length ? d.filtros.join(' · ') : 'sin filtros');
  linea('Comparado con', ant0(d));

  y += 6;
  // El informe sólo cubre meses cerrados: se dice explícitamente, para que nadie
  // busque el mes en curso.
  doc.setFontSize(8);
  doc.setTextColor(...C.medium);
  const nota = doc.splitTextToSize(
    'Este informe incluye únicamente meses cerrados. El mes en curso no se ' +
    'presenta en ninguna sección, ni entra en los promedios.', CW - 60) as string[];
  doc.text(nota, PW / 2, y, { align: 'center' });
  y += nota.length * 4;

  if (d.simulacion) {
    y += 4;
    doc.setFillColor(...C.amberLight);
    doc.setDrawColor(...C.amber);
    doc.setLineWidth(0.4);
    doc.roundedRect(M + 12, y, CW - 24, 20, 2, 2, 'FD');
    doc.setTextColor(...C.amber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CONTIENE DATOS ESTIMADOS', PW / 2, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const t = doc.splitTextToSize(
      `El costo laboral de ${d.mes.etiqueta} no está liquidado y se estimó sobre ${d.simulacion.base}. ` +
      'Las cifras de margen y resultado son provisorias.', CW - 34) as string[];
    doc.text(t, PW / 2, y + 13, { align: 'center' });
  }

  doc.setFontSize(8);
  doc.setTextColor(...C.medium);
  doc.text('Uso interno — confidencial', PW / 2, PH - 24, { align: 'center' });
}

const ant0 = (d: DatosInformeMensual): string =>
  d.anterior ? d.anterior.etiqueta : 'no hay mes cerrado anterior cargado';

// ============================================================
// 1 · Resumen del mes
// ============================================================

function seccionResumen(L: Lienzo, d: DatosInformeMensual) {
  const m = d.mes;
  const a = d.anterior;
  const p = d.promedio6;

  seccion(L, '1. Resumen del mes', { hojaNueva: true });

  // ── Las tres líneas de cantidad, primero que nada ──
  const segs: [string, number, number][] = [
    ['Consultas', m.cantidadPorSegmento.Consultas, a?.cantidadPorSegmento.Consultas ?? 0],
    ['Estudios', m.cantidadPorSegmento.Estudios, a?.cantidadPorSegmento.Estudios ?? 0],
    ['Cirugías', m.cantidadPorSegmento.Cirugias, a?.cantidadPorSegmento.Cirugias ?? 0],
  ];

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Prácticas realizadas', 'Cantidad', a ? `vs ${a.etiquetaCorta}` : 'Variación', 'Participación']],
    body: [
      ...segs.map(([n, act, anterior]) => {
        const v = vari(act, anterior);
        return [
          n,
          fmtCant(act),
          a ? (v.calculable ? v.texto : v.texto) : 'sin comparación',
          fmtPct(m.cantidad > 0 ? (act / m.cantidad) * 100 : 0),
        ];
      }),
      [
        'TOTAL',
        fmtCant(m.cantidad),
        a ? vari(m.cantidad, a.cantidad).texto : 'sin comparación',
        '100,0%',
      ],
    ],
    styles: { ...TABLA_BASE.styles, fontSize: 9, cellPadding: 2.2 },
    headStyles: { ...TABLA_BASE.headStyles, fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 62, fontStyle: 'bold' },
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right' });
      if (h.section === 'body' && h.row.index === 3) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      }
      if (h.section === 'body' && h.column.index === 2 && a) {
        const txt = String(h.cell.raw);
        if (txt.startsWith('+')) h.cell.styles.textColor = C.green;
        else if (txt.startsWith('-')) h.cell.styles.textColor = C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 7;

  // ── Seis indicadores ──
  const cmp = (act: number, anterior: number | undefined, prom: number | undefined, esPct = false) => {
    const out: { etiqueta: string; texto: string; pos: boolean; neutro?: boolean }[] = [];
    if (anterior !== undefined) {
      const v = vari(act, anterior);
      out.push({
        etiqueta: a ? `vs ${a.etiquetaCorta}` : 'vs anterior',
        texto: esPct ? varPP(act, anterior) : v.texto,
        pos: esPct ? act >= anterior : v.pos,
        neutro: !esPct && !v.calculable,
      });
    }
    if (prom !== undefined && p) {
      const v = vari(act, prom);
      out.push({
        etiqueta: `vs prom. ${p.meses}m`,
        texto: esPct ? varPP(act, prom) : v.texto,
        pos: esPct ? act >= prom : v.pos,
        neutro: !esPct && !v.calculable,
      });
    }
    return out;
  };

  const w = (CW - 8) / 3;
  const fila1 = L.y;
  kpi(L, M, fila1, w, 'PRÁCTICAS REALIZADAS', fmtCant(m.cantidad),
    cmp(m.cantidad, a?.cantidad, p?.cantidad));
  kpi(L, M + w + 4, fila1, w, 'FACTURACIÓN', fmt(m.facturacion),
    cmp(m.facturacion, a?.facturacion, p?.facturacion));
  kpi(L, M + (w + 4) * 2, fila1, w, 'TICKET PROMEDIO', fmt(m.ticketPromedio),
    cmp(m.ticketPromedio, a?.ticketPromedio, p?.ticketPromedio));

  const fila2 = fila1 + 25;
  kpi(L, M, fila2, w, `MARGEN DE CONTRIBUCIÓN (${fmtPct(m.margenContribucionPct)})`,
    fmt(m.margenContribucion), cmp(m.margenContribucion, a?.margenContribucion, p?.margenContribucion));
  kpi(L, M + w + 4, fila2, w, `COSTOS FIJOS${m.tieneEstimados ? SELLO_EST : ''}`,
    fmt(m.costosFijos), cmp(m.costosFijos, a?.costosFijos, p?.costosFijos));
  kpi(L, M + (w + 4) * 2, fila2, w, `RESULTADO OPERATIVO (${fmtPct(m.resultadoOperativoPct)})${m.tieneEstimados ? SELLO_EST : ''}`,
    fmt(m.resultadoOperativo), cmp(m.resultadoOperativo, a?.resultadoOperativo, p?.resultadoOperativo));

  L.y = fila2 + 27;

  if (m.tieneEstimados && d.simulacion) {
    aviso(L,
      `Los costos fijos y el resultado operativo de ${m.etiqueta} incluyen ${m.categoriasEstimadas.join(', ')} ` +
      `por ${fmt(d.simulacion.importe)}, ESTIMADO sobre ${d.simulacion.base}. ` +
      `Sin esa estimación el sistema tomaría ${fmt(d.simulacion.importe - m.diferenciaVsPantalla)}, ` +
      `que es la erogación clasificada y vale menos de la mitad del costo laboral real.`);
  }

  // ── Lectura del mes ──
  const lecturas = construirLecturas(d);
  if (lecturas.length) {
    asegurar(L, 12 + lecturas.length * 9);
    parrafo(L, 'Lectura del mes', { bold: true, size: 10, color: C.primary });
    for (const l of lecturas) vinieta(L, l.texto, TONO_COLOR[l.tono]);
  }
}

function construirLecturas(d: DatosInformeMensual): Lectura[] {
  const m = d.mes;
  const a = d.anterior;
  if (!a) return [];
  const p = d.promedio6;
  const top = d.porObraSocial[0];

  const varDe = (x: number, y: number) => (y !== 0 ? ((x - y) / Math.abs(y)) * 100 : 0);

  const ctx: ContextoLectura = {
    mesEtiqueta: m.etiqueta,
    mesAnteriorEtiqueta: a.etiqueta,
    varFacturacion: varDe(m.facturacion, a.facturacion),
    varCantidad: varDe(m.cantidad, a.cantidad),
    varTicket: varDe(m.ticketPromedio, a.ticketPromedio),
    varCostosFijos: varDe(m.costosFijos, a.costosFijos),
    varCostosFijosVsPromedio: p ? varDe(m.costosFijos, p.costosFijos) : 0,
    margenPct: m.margenContribucionPct,
    margenPctAnterior: a.margenContribucionPct,
    resultadoOperativo: m.resultadoOperativo,
    resultadoOperativoPct: m.resultadoOperativoPct,
    segmentos: [
      { nombre: 'Consultas', cantidad: m.cantidadPorSegmento.Consultas, varCantidad: varDe(m.cantidadPorSegmento.Consultas, a.cantidadPorSegmento.Consultas) },
      { nombre: 'Estudios', cantidad: m.cantidadPorSegmento.Estudios, varCantidad: varDe(m.cantidadPorSegmento.Estudios, a.cantidadPorSegmento.Estudios) },
      { nombre: 'Cirugías', cantidad: m.cantidadPorSegmento.Cirugias, varCantidad: varDe(m.cantidadPorSegmento.Cirugias, a.cantidadPorSegmento.Cirugias) },
    ],
    obraSocialTop: top ? { nombre: top.nombre, participacion: top.participacion } : null,
    coberturaReceta: m.coberturaReceta,
    categoriasSimuladas: m.categoriasEstimadas,
    sinClasificar: 0,
  };
  return leerMes(ctx, 5);
}

// ============================================================
// 2 · Volumen y actividad
// ============================================================

function seccionVolumen(L: Lienzo, d: DatosInformeMensual) {
  const m = d.mes;
  const a = d.anterior;
  seccion(L, '2. Volumen y actividad', { hojaNueva: true });

  parrafo(L, `Cantidad de prácticas por mes — últimos ${d.serie.length} meses cerrados.`, { size: 8.5, color: C.medium });
  const serie: PuntoSerie[] = d.serie.map(s => ({ etiqueta: s.etiquetaCorta, barra: s.cantidad }));
  graficoBarrasLinea(L, serie, {
    alto: 42,
    formatoEje: (n) => fmtCant(n),
    leyendaBarra: 'Prácticas realizadas',
  });

  // ── Por segmento ──
  asegurar(L, 40);
  parrafo(L, 'Por segmento', { bold: true, size: 10, color: C.primary });
  const segRows = (['Consultas', 'Estudios', 'Cirugias'] as const).map(s => {
    const cant = m.cantidadPorSegmento[s];
    const fact = m.facturacionPorSegmento[s];
    const cantA = a?.cantidadPorSegmento[s] ?? 0;
    const factA = a?.facturacionPorSegmento[s] ?? 0;
    const ticket = cant > 0 ? fact / cant : 0;
    return [
      s === 'Cirugias' ? 'Cirugías' : s,
      fmtCant(cant),
      a ? vari(cant, cantA).texto : '—',
      fmt(fact),
      a ? vari(fact, factA).texto : '—',
      fmt(ticket),
    ];
  });
  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Segmento', 'Prácticas', a ? `vs ${a.etiquetaCorta}` : 'Var.', 'Facturado', a ? `vs ${a.etiquetaCorta}` : 'Var.', 'Ticket prom.']],
    body: [
      ...segRows,
      ['TOTAL', fmtCant(m.cantidad), a ? vari(m.cantidad, a.cantidad).texto : '—',
        fmt(m.facturacion), a ? vari(m.facturacion, a.facturacion).texto : '—', fmt(m.ticketPromedio)],
    ],
    columnStyles: {
      0: { cellWidth: 34 }, 1: { halign: 'right', fontStyle: 'bold' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right' });
      if (h.section === 'body' && h.row.index === 3) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      }
      if (h.section === 'body' && (h.column.index === 2 || h.column.index === 4)) {
        const t = String(h.cell.raw);
        if (t.startsWith('+')) h.cell.styles.textColor = C.green;
        else if (t.startsWith('-')) h.cell.styles.textColor = C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 7;

  // ── Por prestador ──
  asegurar(L, 40);
  parrafo(L, 'Actividad por prestador', { bold: true, size: 10, color: C.primary });
  const prestadores = d.porPrestador.slice(0, 12);
  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Prestador', 'Prácticas', 'Participación', 'Facturado', 'Ticket prom.']],
    body: prestadores.map(p => [
      p.nombre, fmtCant(p.cantidad),
      fmtPct(m.cantidad > 0 ? (p.cantidad / m.cantidad) * 100 : 0),
      fmt(p.facturacion), fmt(p.ticket),
    ]),
    columnStyles: {
      0: { cellWidth: 62 }, 1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right' }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;
  if (d.porPrestador.length > prestadores.length) {
    parrafo(L, `Se listan los ${prestadores.length} prestadores de mayor facturación. Quedan ${d.porPrestador.length - prestadores.length} más, que suman ${fmt(d.porPrestador.slice(12).reduce((s, x) => s + x.facturacion, 0))}.`, { size: 7.5, color: C.medium });
  }
}

// ============================================================
// 3 · Evolución
// ============================================================

function seccionEvolucion(L: Lienzo, d: DatosInformeMensual) {
  seccion(L, '3. Evolución de los últimos meses', { hojaNueva: true });

  parrafo(L, 'Facturación y resultado operativo, mes a mes. Sólo meses cerrados.', { size: 8.5, color: C.medium });
  const serie: PuntoSerie[] = d.serie.map(s => ({
    etiqueta: s.etiquetaCorta,
    barra: s.facturacion,
    linea: s.resultadoOperativo,
    estimado: s.tieneEstimados,
  }));
  graficoBarrasLinea(L, serie, {
    alto: 46,
    leyendaBarra: 'Facturación',
    leyendaLinea: 'Resultado operativo',
  });

  if (d.serie.some(s => s.tieneEstimados)) {
    parrafo(L, 'Las barras rayadas corresponden a meses con costo laboral estimado.', { size: 7.5, color: C.amber });
  }

  // ── Estado de resultados comparativo ──
  asegurar(L, 50);
  parrafo(L, 'Estado de resultados comparativo', { bold: true, size: 10, color: C.primary });

  const cols = d.serie.slice(-6);
  const filaEERR = (label: string, get: (c: CifrasMes) => number, pctSobreFact = true, bold = false) => [
    label,
    ...cols.flatMap(c => {
      const v = get(c);
      return pctSobreFact && c.facturacion > 0
        ? [fmt(v), fmtPct((v / c.facturacion) * 100)]
        : [fmt(v), '—'];
    }),
  ];

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [
      ['Concepto', ...cols.flatMap(c => [c.etiquetaCorta + (c.tieneEstimados ? '*' : ''), '%'])],
    ],
    body: [
      ['Prácticas', ...cols.flatMap(c => [fmtCant(c.cantidad), '—'])],
      filaEERR('Facturación', c => c.facturacion),
      filaEERR('Honorarios', c => -c.honorarios),
      filaEERR('Pools', c => -c.pools),
      filaEERR('Insumos', c => -c.insumos),
      filaEERR('Margen de contribución', c => c.margenContribucion),
      filaEERR('Costos fijos', c => -c.costosFijos),
      filaEERR('Resultado operativo', c => c.resultadoOperativo),
    ],
    styles: { ...TABLA_BASE.styles, fontSize: 6.6, cellPadding: 1.2 },
    headStyles: { ...TABLA_BASE.headStyles, fontSize: 6.6 },
    columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      if (h.column.index > 0) h.cell.styles.halign = 'right';
      if (h.section === 'body' && (h.row.index === 5 || h.row.index === 7)) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      }
      if (h.section === 'body' && h.row.index === 0) h.cell.styles.textColor = C.cyan;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;
  if (cols.some(c => c.tieneEstimados)) {
    parrafo(L, '* Mes con costo laboral estimado, no liquidado.', { size: 7.5, color: C.amber });
  }
  parrafo(L, 'Los porcentajes son sobre la facturación de cada mes. Las prácticas son cantidad, no importe.', { size: 7.5, color: C.medium });
}

// ============================================================
// 4 · Qué explica el cambio
// ============================================================

function seccionExplicacion(L: Lienzo, d: DatosInformeMensual) {
  const m = d.mes;
  const a = d.anterior;
  seccion(L, '4. Qué explica el cambio', { hojaNueva: true });

  if (!a) {
    parrafo(L,
      `No hay un mes cerrado anterior a ${m.etiqueta} en el rango cargado, así que no ` +
      'se puede descomponer la variación. Esta sección requiere dos meses cerrados consecutivos.');
    return;
  }

  const puente = construirPuente(
    { etiqueta: a.etiqueta, facturacion: a.facturacion, cantidad: a.cantidad, costosVariables: a.costosVariables, costosFijos: a.costosFijos },
    { etiqueta: m.etiqueta, facturacion: m.facturacion, cantidad: m.cantidad, costosVariables: m.costosVariables, costosFijos: m.costosFijos },
  );

  parrafo(L,
    `El resultado operativo pasó de ${fmt(puente.desde.resultadoOperativo)} en ${a.etiqueta} a ` +
    `${fmt(puente.hasta.resultadoOperativo)} en ${m.etiqueta}: ${fmtDelta(puente.variacion)}. ` +
    'El puente descompone esa diferencia en cuatro efectos que suman exactamente ese número.');

  const barras: BarraPuente[] = [
    { etiqueta: a.etiquetaCorta, valor: puente.desde.resultadoOperativo, tipo: 'inicio' },
    ...puente.efectos.map(e => ({
      etiqueta: e.etiqueta.replace('Efecto ', ''),
      valor: e.valor,
      tipo: 'delta' as const,
    })),
    { etiqueta: m.etiquetaCorta, valor: puente.hasta.resultadoOperativo, tipo: 'fin' },
  ];
  graficoPuente(L, barras, { alto: 50 });

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Efecto', 'Contribución', 'Peso', 'Cómo se compone']],
    body: [
      ...puente.efectos.map(e => [e.etiqueta, fmtDelta(e.valor), fmtPct(e.peso), e.detalle]),
      ['TOTAL EXPLICADO', fmtDelta(puente.efectos.reduce((s, e) => s + e.valor, 0)), '100,0%',
        `Diferencia de resultado entre ${a.etiquetaCorta} y ${m.etiquetaCorta}`],
    ],
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' }, 1: { halign: 'right', cellWidth: 28 },
      2: { halign: 'right', cellWidth: 16 }, 3: { fontSize: 7 },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right' });
      if (h.section === 'body' && h.row.index === 4) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      } else if (h.section === 'body' && h.column.index === 1) {
        h.cell.styles.textColor = String(h.cell.raw).startsWith('+') ? C.green : C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;

  parrafo(L,
    puenteCierra(puente)
      ? 'Los cuatro efectos cierran exactamente contra la diferencia de resultado operativo.'
      : `Atención: la descomposición deja un residuo de ${fmt(puente.residuo)} sin explicar.`,
    { size: 7.5, color: puenteCierra(puente) ? C.medium : C.red });

  parrafo(L,
    'El efecto precio y mezcla van juntos porque desde la facturación agregada no se ' +
    'pueden separar: un ticket más alto puede venir de aumentos o de haber hecho ' +
    'proporcionalmente más cirugías que consultas. Las líneas de abajo muestran dónde ' +
    'se movió.', { size: 7.5, color: C.medium });

  // ── Las 5 líneas de mayor impacto ──
  asegurar(L, 45);
  parrafo(L, 'Líneas de mayor impacto', { bold: true, size: 10, color: C.primary });

  const antPorOS = new Map(d.porObraSocialAnterior.map(o => [o.clave, o]));
  const lineas: LineaImpacto[] = d.porObraSocial.map(o => {
    const prev = antPorOS.get(o.clave);
    return {
      nombre: o.nombre, tipo: 'obra_social' as const,
      cantidadActual: o.cantidad, cantidadAnterior: prev?.cantidad ?? 0,
      montoActual: o.facturacion, montoAnterior: prev?.facturacion ?? 0,
      variacion: o.facturacion - (prev?.facturacion ?? 0), peso: 0,
    };
  });
  // Las que existían antes y desaparecieron también son impacto.
  for (const prev of d.porObraSocialAnterior) {
    if (!d.porObraSocial.some(o => o.clave === prev.clave)) {
      lineas.push({
        nombre: prev.nombre, tipo: 'obra_social',
        cantidadActual: 0, cantidadAnterior: prev.cantidad,
        montoActual: 0, montoAnterior: prev.facturacion,
        variacion: -prev.facturacion, peso: 0,
      });
    }
  }

  const rk = rankearImpacto(lineas, puente.variacion, 5);
  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Obra social', `Prácticas ${a.etiquetaCorta}`, `Prácticas ${m.etiquetaCorta}`, 'Variación $', 'Peso s/ desvío']],
    body: rk.lineas.map(l => [
      l.nombre, fmtCant(l.cantidadAnterior), fmtCant(l.cantidadActual),
      fmtDelta(l.variacion), fmtPct(l.peso),
    ]),
    columnStyles: {
      0: { cellWidth: 48 }, 1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right' });
      if (h.section === 'body' && h.column.index === 3) {
        h.cell.styles.textColor = String(h.cell.raw).startsWith('+') ? C.green : C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;

  if (rk.omitidas > 0) {
    parrafo(L,
      `Se muestran las 5 de mayor impacto. Las otras ${rk.omitidas} obras sociales suman ` +
      `${fmtDelta(rk.montoOmitido)} entre todas.`, { size: 7.5, color: C.medium });
  }
}

// ============================================================
// 5 · Rentabilidad por prestación
// ============================================================

function seccionPrestaciones(L: Lienzo, d: DatosInformeMensual) {
  const m = d.mes;
  seccion(L, '5. Rentabilidad por prestación', { hojaNueva: true });

  parrafo(L,
    'Los costos fijos se asignan en proporción a la facturación de cada prestación, ' +
    'el mismo criterio que usa la pantalla de Análisis Marginal por Grupo.',
    { size: 8, color: C.medium });

  const top = d.porPrestacion.slice(0, 10);
  // MC y RO por prestación: se estiman con el margen del mes aplicado a la
  // participación de cada una. El costeo fino por prestación vive en la pantalla
  // Por Prestación; acá el objetivo es el ranking, no el costeo unitario.
  const mcRatio = m.facturacion > 0 ? m.margenContribucion / m.facturacion : 0;

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Prestación', 'Cant.', 'Facturado', 'Ticket', 'MC $', 'MC %', 'CF asignado', 'RO $', 'RO %']],
    body: top.map(p => {
      const mc = p.facturacion * mcRatio;
      const cf = m.facturacion > 0 ? m.costosFijos * (p.facturacion / m.facturacion) : 0;
      const ro = mc - cf;
      return [
        p.nombre.length > 34 ? p.nombre.slice(0, 33) + '…' : p.nombre,
        fmtCant(p.cantidad), fmt(p.facturacion), fmt(p.ticket),
        fmt(mc), fmtPct(p.facturacion > 0 ? (mc / p.facturacion) * 100 : 0),
        fmt(cf), fmt(ro), fmtPct(p.facturacion > 0 ? (ro / p.facturacion) * 100 : 0),
      ];
    }),
    styles: { ...TABLA_BASE.styles, fontSize: 6.8, cellPadding: 1.3 },
    headStyles: { ...TABLA_BASE.headStyles, fontSize: 6.8 },
    columnStyles: {
      0: { cellWidth: 46 }, 1: { halign: 'right', textColor: C.cyan },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right', 6: 'right', 7: 'right', 8: 'right' });
      // Resultado operativo negativo en rojo.
      if (h.section === 'body' && (h.column.index === 7 || h.column.index === 8)) {
        if (String(h.cell.raw).includes('-')) h.cell.styles.textColor = C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;

  const resto = d.porPrestacion.length - top.length;
  if (resto > 0) {
    parrafo(L,
      `Top 10 por facturación. Las otras ${resto} prestaciones del mes suman ` +
      `${fmt(d.porPrestacion.slice(10).reduce((s, p) => s + p.facturacion, 0))} en ` +
      `${fmtCant(d.porPrestacion.slice(10).reduce((s, p) => s + p.cantidad, 0))} prácticas.`,
      { size: 7.5, color: C.medium });
  }
  parrafo(L,
    'MC y RO por prestación son estimados: aplican el margen del mes a la participación ' +
    // OJO: nada de flechas ni de caracteres fuera de WinAnsi en los literales.
    // La "→" (U+2192) hace que jsPDF codifique toda la cadena en UTF-16 y el
    // renglón sale letra por letra, ilegible. Mismo gotcha que documentó el
    // sobre quirúrgico con el menos tipográfico.
    'de cada prestación. El costeo unitario exacto está en Análisis Marginal, Por Prestación.',
    { size: 7.5, color: C.medium });
}

// ============================================================
// 6 · Obras sociales
// ============================================================

function seccionObrasSociales(L: Lienzo, d: DatosInformeMensual) {
  const m = d.mes;
  const a = d.anterior;
  seccion(L, '6. Obras sociales', { hojaNueva: true });

  const antPorOS = new Map(d.porObraSocialAnterior.map(o => [o.clave, o]));
  const filas = d.porObraSocial.slice(0, 15);

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Obra social', 'Prácticas', a ? `Var. cant.` : 'Var.', 'Facturado', a ? 'Var. $' : 'Var.', 'Participación']],
    body: filas.map(o => {
      const prev = antPorOS.get(o.clave);
      return [
        o.nombre, fmtCant(o.cantidad),
        prev ? vari(o.cantidad, prev.cantidad).texto : 'nueva',
        fmt(o.facturacion),
        prev ? vari(o.facturacion, prev.facturacion).texto : 'nueva',
        fmtPct(o.participacion),
      ];
    }),
    columnStyles: {
      0: { cellWidth: 50 }, 1: { halign: 'right', textColor: C.cyan },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right' });
      if (h.section === 'body' && (h.column.index === 2 || h.column.index === 4)) {
        const t = String(h.cell.raw);
        if (t.startsWith('+')) h.cell.styles.textColor = C.green;
        else if (t.startsWith('-')) h.cell.styles.textColor = C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 6;

  if (!a) {
    parrafo(L, 'Sin mes anterior cargado no se pueden identificar subas ni bajas.', { size: 8, color: C.medium });
    return;
  }

  // ── Las que más crecieron y las que más cayeron ──
  const conVar = d.porObraSocial.map(o => {
    const prev = antPorOS.get(o.clave);
    return {
      nombre: o.nombre,
      dCant: o.cantidad - (prev?.cantidad ?? 0),
      dFact: o.facturacion - (prev?.facturacion ?? 0),
    };
  });
  const subenFact = [...conVar].sort((x, y) => y.dFact - x.dFact).slice(0, 3);
  const bajanFact = [...conVar].sort((x, y) => x.dFact - y.dFact).slice(0, 3);

  asegurar(L, 40);
  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Las que más crecieron', 'Prácticas', 'Facturación', 'Las que más cayeron', 'Prácticas', 'Facturación']],
    body: [0, 1, 2].map(i => {
      const s = subenFact[i];
      const b = bajanFact[i];
      return [
        s ? s.nombre : '—', s ? `${s.dCant >= 0 ? '+' : ''}${fmtCant(s.dCant)}` : '—', s ? fmtDelta(s.dFact) : '—',
        b ? b.nombre : '—', b ? `${b.dCant >= 0 ? '+' : ''}${fmtCant(b.dCant)}` : '—', b ? fmtDelta(b.dFact) : '—',
      ];
    }),
    columnStyles: {
      0: { cellWidth: 38 }, 1: { halign: 'right' }, 2: { halign: 'right' },
      3: { cellWidth: 38 }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 4: 'right', 5: 'right' });
      if (h.section === 'body' && (h.column.index === 2)) h.cell.styles.textColor = C.green;
      if (h.section === 'body' && (h.column.index === 5)) h.cell.styles.textColor = C.red;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;
  parrafo(L, 'Ordenadas por variación de facturación contra el mes anterior. La columna de prácticas es la variación de cantidad, para poder distinguir si el movimiento fue de volumen.', { size: 7.5, color: C.medium });
}

// ============================================================
// 7 · Costos
// ============================================================

function seccionCostos(L: Lienzo, d: DatosInformeMensual, opts: OpcionesInforme) {
  const m = d.mes;
  const a = d.anterior;
  const p = d.promedio6;
  seccion(L, '7. Costos', { hojaNueva: true });

  // ── Variables ──
  parrafo(L, 'Costos variables', { bold: true, size: 10, color: C.primary });
  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Concepto', 'Importe', '% s/ facturación', a ? `vs ${a.etiquetaCorta}` : 'Var.']],
    body: [
      ['Honorarios de prestadores', fmt(m.honorarios), fmtPct(m.facturacion > 0 ? (m.honorarios / m.facturacion) * 100 : 0), a ? vari(m.honorarios, a.honorarios).texto : '—'],
      ['Costos de pools', fmt(m.pools), fmtPct(m.facturacion > 0 ? (m.pools / m.facturacion) * 100 : 0), a ? vari(m.pools, a.pools).texto : '—'],
      ['Insumos directos', fmt(m.insumos), fmtPct(m.facturacion > 0 ? (m.insumos / m.facturacion) * 100 : 0), a ? vari(m.insumos, a.insumos).texto : '—'],
      ['TOTAL VARIABLES', fmt(m.costosVariables), fmtPct(m.facturacion > 0 ? (m.costosVariables / m.facturacion) * 100 : 0), a ? vari(m.costosVariables, a.costosVariables).texto : '—'],
    ],
    columnStyles: { 0: { cellWidth: 62 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right' });
      if (h.section === 'body' && h.row.index === 3) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 7;

  // ── Fijos por categoría ──
  asegurar(L, 45);
  parrafo(L, 'Costos fijos por categoría', { bold: true, size: 10, color: C.primary });

  const antPorCat = new Map((a?.costosFijosPorCategoria ?? []).map(c => [c.categoria, c.monto]));
  const promPorCat = new Map<string, number>();
  if (p) {
    const previos = d.serie.filter(s => s.mes < m.mes).slice(-p.meses);
    for (const s of previos) {
      for (const c of s.costosFijosPorCategoria) {
        promPorCat.set(c.categoria, (promPorCat.get(c.categoria) ?? 0) + c.monto / previos.length);
      }
    }
  }

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Categoría', 'Importe', '% del total', a ? `vs ${a.etiquetaCorta}` : 'Var.', p ? `vs prom. ${p.meses}m` : 'Var. prom.']],
    body: [
      ...m.costosFijosPorCategoria.map(c => {
        const prev = antPorCat.get(c.categoria);
        const prom = promPorCat.get(c.categoria);
        return [
          c.categoria + (c.estimado ? ' (estimado)' : ''),
          fmt(c.monto),
          fmtPct(m.costosFijos > 0 ? (c.monto / m.costosFijos) * 100 : 0),
          prev !== undefined ? vari(c.monto, prev).texto : 'sin base',
          prom !== undefined ? vari(c.monto, prom).texto : 'sin base',
        ];
      }),
      ['TOTAL FIJOS', fmt(m.costosFijos), '100,0%',
        a ? vari(m.costosFijos, a.costosFijos).texto : '—',
        p ? vari(m.costosFijos, p.costosFijos).texto : '—'],
    ],
    columnStyles: { 0: { cellWidth: 56 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right' });
      const ultima = h.row.index === m.costosFijosPorCategoria.length;
      if (h.section === 'body' && ultima) {
        h.cell.styles.fillColor = C.primaryLight;
        h.cell.styles.fontStyle = 'bold';
      } else if (h.section === 'body' && h.column.index === 0 && String(h.cell.raw).includes('(estimado)')) {
        h.cell.styles.textColor = C.amber;
        h.cell.styles.fontStyle = 'bold';
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 5;

  if (m.tieneEstimados && d.simulacion) {
    aviso(L,
      `${m.categoriasEstimadas.join(', ')}: ${fmt(d.simulacion.importe)} ESTIMADO sobre ${d.simulacion.base}. ` +
      'No hay liquidación cargada para este mes. El valor real puede diferir.');
  }

  // ── Comprobantes de las categorías de mayor desvío ──
  const comps = opts.comprobantes ?? [];
  if (comps.length) {
    asegurar(L, 45);
    parrafo(L, 'Comprobantes de las categorías de mayor desvío', { bold: true, size: 10, color: C.primary });
    autoTable(L.doc, {
      ...TABLA_BASE,
      startY: L.y,
      head: [['Categoría', 'Fecha', 'Proveedor', 'Descripción', 'Importe']],
      body: comps.map(c => [
        c.categoria, c.fecha, c.proveedor || 'sin proveedor',
        (c.descripcion || '').slice(0, 42), fmt(c.monto),
      ]),
      styles: { ...TABLA_BASE.styles, fontSize: 6.8, cellPadding: 1.2 },
      headStyles: { ...TABLA_BASE.headStyles, fontSize: 6.8 },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 16 }, 2: { cellWidth: 38 }, 4: { halign: 'right', cellWidth: 26 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (h: any) => alinear(h, { 4: 'right' }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L.y = (L.doc as any).lastAutoTable.finalY + 4;
  } else {
    parrafo(L,
      'No se listan comprobantes: ninguna categoría de costo fijo se desvió lo ' +
      'suficiente del mes anterior como para requerir explicación, o el detalle no ' +
      'estaba disponible al generar el informe.', { size: 7.5, color: C.medium });
  }
}

// ============================================================
// 8 · Calidad de datos y alertas
// ============================================================

function seccionCalidad(L: Lienzo, d: DatosInformeMensual, opts: OpcionesInforme) {
  const m = d.mes;
  seccion(L, '8. Calidad de datos y alertas', { hojaNueva: true });

  const alertas: { tema: string; detalle: string; critico: boolean }[] = [];

  if (d.simulacion) {
    alertas.push({
      tema: 'Costo laboral estimado',
      critico: true,
      detalle:
        `${m.etiqueta} no tiene liquidación de sueldos cargada. El informe usa ` +
        `${fmt(d.simulacion.importe)} estimado sobre ${d.simulacion.base}. ` +
        `Evolución Temporal muestra ${fmt(d.simulacion.importe - m.diferenciaVsPantalla)} ` +
        `para la misma categoría, porque cae a la erogación clasificada: el informe y la ` +
        `pantalla difieren en ${fmt(Math.abs(m.diferenciaVsPantalla))} de costos fijos y ` +
        `de resultado operativo. La pantalla es la que subestima.`,
    });
  }

  if (m.coberturaReceta < 100) {
    alertas.push({
      tema: 'Prestaciones sin receta',
      critico: m.coberturaReceta < 80,
      detalle:
        `El ${fmtPct(100 - m.coberturaReceta)} de la facturación del mes no tiene receta ` +
        `de costos cargada, así que su costo variable no está computado.`,
    });
  }

  if (m.noIdentificados > 0) {
    const prop = m.facturacion > 0 ? (m.noIdentificados / m.facturacion) * 100 : 0;
    alertas.push({
      tema: 'Costos no identificados',
      critico: prop > 10,
      detalle:
        `${fmt(m.noIdentificados)}, que es el ${fmtPct(prop)} de la facturación del mes. ` +
        'Incluye facturación sin receta y erogaciones sin clasificar.',
    });
  }

  const sinClas = opts.sinClasificar ?? 0;
  if (sinClas > 0) {
    alertas.push({
      tema: 'Erogaciones sin clasificar',
      critico: false,
      detalle: `${fmt(sinClas)} en comprobantes que todavía no se marcaron como fijos ni variables.`,
    });
  }

  if (!d.anterior) {
    alertas.push({
      tema: 'Sin mes de comparación',
      critico: false,
      detalle:
        `No hay un mes cerrado anterior a ${m.etiqueta} en el rango cargado. Las secciones ` +
        'de variación y el puente quedan sin base de comparación.',
    });
  }

  if (!alertas.length) {
    parrafo(L,
      `No se detectaron alertas de calidad de datos para ${m.etiqueta}. La liquidación de ` +
      'sueldos está cargada, la cobertura de recetas es completa, no hay erogaciones sin ' +
      'clasificar y hay mes anterior para comparar.', { color: C.green });
    return;
  }

  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Alerta', 'Detalle']],
    body: alertas.map(a => [a.tema, a.detalle]),
    columnStyles: { 0: { cellWidth: 44, fontStyle: 'bold' }, 1: { fontSize: 7 } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => {
      if (h.section === 'body' && alertas[h.row.index]?.critico && h.column.index === 0) {
        h.cell.styles.textColor = C.red;
      }
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 6;

  parrafo(L,
    'Las cifras de este informe salen de las mismas fuentes que alimentan Evolución ' +
    'Temporal y Análisis por Prestación. La única diferencia declarada es la estimación ' +
    'de costo laboral señalada arriba, si aplica.', { size: 7.5, color: C.medium });
}

// ============================================================
// Anexo
// ============================================================

function anexo(L: Lienzo, d: DatosInformeMensual) {
  seccion(L, 'Anexo · Detalle por prestación', { hojaNueva: true });
  autoTable(L.doc, {
    ...TABLA_BASE,
    startY: L.y,
    head: [['Prestación', 'Cantidad', 'Facturado', 'Ticket promedio', 'Participación']],
    body: d.porPrestacion.map(p => [
      p.nombre, fmtCant(p.cantidad), fmt(p.facturacion), fmt(p.ticket), fmtPct(p.participacion),
    ]),
    styles: { ...TABLA_BASE.styles, fontSize: 6.5, cellPadding: 1 },
    headStyles: { ...TABLA_BASE.headStyles, fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 72 }, 1: { halign: 'right', textColor: C.cyan },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (h: any) => alinear(h, { 1: 'right', 2: 'right', 3: 'right', 4: 'right' }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 4;
}
