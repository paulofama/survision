// ============================================================
// PDF - INFORME MENSUAL DE PRESUPUESTOS
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Lee la misma estructura que la pantalla (`calcularInformePresupuestos`): el
// PDF no recalcula nada. Apaisado: el ranking tiene nueve columnas.
// Uso interno: lleva nombres de pacientes en la cartera y en los practicados
// sin respaldo, y el permiso del informe lo tiene sólo la Dirección.
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  fmtFecha,
  variacion,
  type CantidadMonto,
  type InformePresupuestos,
} from './informePresupuestos';

type RGB = [number, number, number];

const COLORS = {
  headerBg: [30, 58, 138] as RGB, // blue-900
  primary: [37, 99, 235] as RGB, // blue-600
  primaryDark: [29, 78, 216] as RGB, // blue-700
  success: [22, 163, 74] as RGB,
  danger: [220, 38, 38] as RGB,
  warning: [161, 98, 7] as RGB, // yellow-700
  textDark: [15, 23, 42] as RGB,
  textMuted: [100, 116, 139] as RGB,
  border: [203, 213, 225] as RGB,
  tableBg: [248, 250, 252] as RGB,
};

const PAGE_W = 297; // A4 apaisado
const PAGE_H = 210;
const M = { left: 14, right: 14, top: 14, bottom: 18 };
const CONTENT_W = PAGE_W - M.left - M.right;

// ── Formato ─────────────────────────────────────────────────────────────────

const fmtMoneda = (n: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number): string => new Intl.NumberFormat('es-AR').format(n);
const fmtPct = (n: number): string =>
  `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;
const fmtDias = (n: number | null): string =>
  n === null ? '-' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n);

const SIN_ACEPTACION = 'Se registra desde julio 2026';

// ── Piezas ──────────────────────────────────────────────────────────────────

/** autoTable deja la posición final en el documento. */
const finalY = (doc: jsPDF): number =>
  (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? M.top;

/** Salta de página si lo que viene no entra. */
function espacio(doc: jsPDF, y: number, alto: number): number {
  if (y + alto > PAGE_H - M.bottom) {
    doc.addPage();
    return M.top;
  }
  return y;
}

/** Alto aproximado de una tabla de autoTable con esta configuración. */
const altoTabla = (filas: number): number => 9 + filas * 6.6;

/**
 * Título de sección. Con `filas`, reserva lugar para la tabla que sigue: si
 * entera entra en una página pero no en lo que queda de ésta, salta junto con
 * el título (no deja una fila suelta en la página siguiente). Si es más larga
 * que una página, alcanza con que entren el título y unas filas.
 */
function titulo(doc: jsPDF, y: number, texto: string, nota?: string, filas = 0): number {
  const altoTitulo = nota ? 24 : 18;
  const util = PAGE_H - M.top - M.bottom;
  const tablaEntera = altoTitulo + altoTabla(filas);
  y = espacio(doc, y, tablaEntera <= util ? tablaEntera : altoTitulo + altoTabla(3));
  doc.setTextColor(...COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(texto, M.left, y + 5);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(M.left, y + 7, M.left + CONTENT_W, y + 7);
  y += 10;
  if (nota) {
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const lineas = doc.splitTextToSize(nota, CONTENT_W) as string[];
    doc.text(lineas, M.left, y + 2);
    y += lineas.length * 3.4 + 1.5;
  }
  return y;
}

function texto(doc: jsPDF, y: number, t: string): number {
  doc.setTextColor(...COLORS.textMuted);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text(t, M.left, y + 4);
  return y + 9;
}

function tabla(
  doc: jsPDF,
  y: number,
  head: string[],
  body: string[][],
  opts: { izquierda?: number[]; fuerte?: number[]; anchos?: Record<number, number> } = {},
): number {
  const izquierda = new Set(opts.izquierda ?? [0]);
  const columnStyles: Record<number, { halign: 'left' | 'right'; fontStyle?: 'bold'; cellWidth?: number }> = {};
  head.forEach((_, i) => {
    columnStyles[i] = {
      halign: izquierda.has(i) ? 'left' : 'right',
      ...(opts.fuerte?.includes(i) ? { fontStyle: 'bold' as const } : {}),
      ...(opts.anchos?.[i] ? { cellWidth: opts.anchos[i] } : {}),
    };
  });
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: M.left, right: M.right, bottom: M.bottom },
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: COLORS.textDark, lineColor: COLORS.border },
    headStyles: { fillColor: COLORS.headerBg, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: COLORS.tableBg },
    columnStyles,
    didParseCell: (d) => {
      if (d.section === 'head') d.cell.styles.halign = izquierda.has(d.column.index) ? 'left' : 'right';
    },
  });
  return finalY(doc) + 6;
}

function encabezado(doc: jsPDF, inf: InformePresupuestos): number {
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, PAGE_W, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Informe de Presupuestos', M.left, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${inf.label} · Instituto Dr. Mercado`, M.left, 18);
  doc.setFontSize(8);
  doc.text('USO INTERNO - CONFIDENCIAL', PAGE_W - M.right, 11, { align: 'right' });
  doc.text(`Generado el ${fmtFecha(new Date().toISOString().slice(0, 10))}`, PAGE_W - M.right, 18, { align: 'right' });
  return 32;
}

/** Cuatro tarjetas del resumen, con la variación contra el mes anterior. */
function tarjetas(doc: jsPDF, y: number, inf: InformePresupuestos): number {
  const r = inf.resumen;
  const ra = inf.resumenAnterior;
  const items: { label: string; actual: CantidadMonto | null; anterior: CantidadMonto | null }[] = [
    { label: 'Convertidos (respaldo GECLISA)', actual: r.convertidos, anterior: ra.convertidos },
    { label: 'Aceptados en el mes', actual: r.aceptados, anterior: ra.aceptados },
    { label: 'Cartera al cierre (aceptados sin operar)', actual: r.cartera, anterior: ra.cartera },
    { label: 'Presupuestos entregados', actual: r.entregados, anterior: ra.entregados },
  ];
  const gap = 4;
  const w = (CONTENT_W - gap * 3) / 4;
  const h = 24;
  items.forEach((it, i) => {
    const x = M.left + i * (w + gap);
    doc.setFillColor(...COLORS.tableBg);
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(it.label, x + 3, y + 5);
    if (it.actual === null) {
      doc.setFontSize(9);
      doc.text(SIN_ACEPTACION, x + 3, y + 13);
      return;
    }
    doc.setTextColor(...COLORS.textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(fmtMoneda(it.actual.neto), x + 3, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${fmtNum(it.actual.cantidad)} presupuestos`, x + 3, y + 17);
    if (it.anterior !== null) {
      const v = variacion(it.actual.neto, it.anterior.neto);
      if (v === null) {
        doc.setTextColor(...COLORS.textMuted);
        doc.text('sin base para comparar', x + 3, y + 21.5);
      } else {
        doc.setTextColor(...(v >= 0 ? COLORS.success : COLORS.danger));
        doc.setFont('helvetica', 'bold');
        doc.text(`${v >= 0 ? '+' : ''}${fmtPct(v)} vs ${inf.labelAnterior}`, x + 3, y + 21.5);
      }
    }
  });
  doc.setTextColor(...COLORS.textMuted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Montos: neto que paga el paciente, sin IVA. Convertido = cirugía confirmada contra lo facturado en GECLISA, por mes de la cirugía.', M.left, y + h + 5);
  return y + h + 11;
}

function pies(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const y = PAGE_H - 8;
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(M.left, y - 4, M.left + CONTENT_W, y - 4);
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Instituto Dr. Mercado - Informe de Presupuestos - Uso interno', M.left, y);
    doc.text(`Página ${i} de ${total}`, PAGE_W - M.right, y, { align: 'right' });
  }
}

// ── Documento ───────────────────────────────────────────────────────────────

export function generarPDFInformePresupuestos(inf: InformePresupuestos): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let y = encabezado(doc, inf);
  y = tarjetas(doc, y, inf);

  // Ranking
  y = titulo(doc, y, 'Ranking de presupuestadoras',
    'Por monto convertido en el mes. "1.ª semana": parte del monto operada dentro de los 7 días de la entrega (llega con la cirugía decidida).',
    inf.ranking.length);
  y = inf.ranking.length === 0
    ? texto(doc, y, 'No hubo cirugías convertidas en el mes.')
    : tabla(doc, y,
      ['#', 'Presupuestadora', 'Cirugías', 'Monto neto', '% total', '1.ª semana', 'Mediana días', 'Aceptados', 'Cobertura OS'],
      inf.ranking.map((f, i) => [
        String(i + 1), f.nombre, fmtNum(f.cirugias), fmtMoneda(f.neto), fmtPct(f.pctTotal),
        f.cirugias ? fmtPct(f.pctPrimeraSemana) : '-', fmtDias(f.medianaDias),
        f.aceptados === null ? '-' : fmtNum(f.aceptados), fmtMoneda(f.cobertura),
      ]),
      { izquierda: [0, 1], fuerte: [1, 3], anchos: { 0: 8 } });

  // Cobertura
  y = titulo(doc, y, 'Por cobertura', 'Obra social = el presupuesto descontó cobertura. Un afiliado que pagó todo cuenta como particular.',
    2 + inf.porObraSocial.length);
  y = inf.resumen.convertidos.cantidad === 0
    ? texto(doc, y, 'Sin cirugías en el mes.')
    : tabla(doc, y,
      ['Cobertura', 'Cirugías', 'Monto neto', '% total', 'Cobertura OS'],
      [
        ...[inf.obraSocial, inf.particular].map((f) => [f.nombre, fmtNum(f.cirugias), fmtMoneda(f.neto), fmtPct(f.pctTotal), fmtMoneda(f.cobertura)]),
        ...inf.porObraSocial.map((f) => [`    ${f.nombre}`, fmtNum(f.cirugias), fmtMoneda(f.neto), fmtPct(f.pctTotal), fmtMoneda(f.cobertura)]),
      ]);

  // Cirujanos
  y = titulo(doc, y, 'Por cirujano', undefined, inf.cirujanos.length);
  y = inf.cirujanos.length === 0
    ? texto(doc, y, 'Sin cirugías en el mes.')
    : tabla(doc, y,
      ['Cirujano', 'Cirugías', 'Monto neto', '% total', 'Mediana días'],
      inf.cirujanos.map((f) => [f.nombre, fmtNum(f.cirugias), fmtMoneda(f.neto), fmtPct(f.pctTotal), fmtDias(f.medianaDias)]),
      { fuerte: [0, 2] });

  // Tramos
  y = titulo(doc, y, 'Tiempo a la práctica', 'De la entrega del presupuesto (o su creación, si no se registró la entrega) a la cirugía en GECLISA.',
    inf.tramos.length);
  y = tabla(doc, y,
    ['Tramo', 'Cirugías', 'Monto neto', '% del monto'],
    inf.tramos.map((f) => [f.tramo, fmtNum(f.cirugias), fmtMoneda(f.neto), fmtPct(f.pctNeto)]));

  // Cohortes
  y = titulo(doc, y, 'Conversión por mes de entrega',
    'De los presupuestos entregados cada mes, cuántos ya se operaron a la fecha. "En curso": menos de 60 días desde el fin del mes, la tasa todavía sube.',
    inf.cohortes.length);
  y = tabla(doc, y,
    ['Mes de entrega', 'Entregados', 'Operados', 'Tasa', 'Monto operado', ''],
    inf.cohortes.map((f) => [f.label, fmtNum(f.entregados), fmtNum(f.convertidos), fmtPct(f.tasa), fmtMoneda(f.netoConvertido), f.enCurso ? 'en curso' : '']),
    { izquierda: [0, 5], fuerte: [3] });

  // Cartera
  y = titulo(doc, y, `Cartera: aceptados sin operar al cierre de ${inf.label}`, undefined, inf.cartera.length);
  if (inf.resumen.cartera === null) y = texto(doc, y, SIN_ACEPTACION);
  else if (inf.cartera.length === 0) y = texto(doc, y, 'No hay aceptados pendientes de operar.');
  else {
    y = tabla(doc, y,
      ['Presupuesto', 'Paciente', 'Práctica', 'Presupuestadora', 'Cirujano', 'Aceptado', 'Días', 'Monto neto'],
      inf.cartera.map((f) => [f.numero, f.paciente, f.prestacion, f.presupuestadora, f.cirujano, fmtFecha(f.fechaAceptacion), fmtNum(f.diasDesdeAceptacion), fmtMoneda(f.neto)]),
      { izquierda: [0, 1, 2, 3, 4], fuerte: [0] });
  }

  // Sin respaldo
  y = titulo(doc, y, 'Practicados sin respaldo en GECLISA',
    'Marcados practicados a mano con fecha en el mes, sin la práctica facturada en GECLISA. No suman en ningún número del informe: revisar.',
    inf.sinRespaldo.length);
  if (inf.sinRespaldo.length === 0) texto(doc, y, 'Ninguno en el mes.');
  else {
    tabla(doc, y,
      ['Presupuesto', 'Paciente', 'Práctica', 'Presupuestadora', 'Cirujano', 'Fecha marcada', 'Monto neto'],
      inf.sinRespaldo.map((f) => [f.numero, f.paciente, f.prestacion, f.presupuestadora, f.cirujano, fmtFecha(f.fechaPractica), fmtMoneda(f.neto)]),
      { izquierda: [0, 1, 2, 3, 4], fuerte: [0] });
  }

  pies(doc);
  doc.save(`Informe_Presupuestos_${inf.anio}-${String(inf.mes).padStart(2, '0')}.pdf`);
}
