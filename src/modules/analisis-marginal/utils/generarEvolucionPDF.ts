// ============================================================
// PDF de la Evolución Temporal
// Análisis Marginal · Instituto Dr. Mercado
// ============================================================
//
// Exporta la grilla mes × concepto tal como se está viendo en pantalla: los
// mismos meses, el mismo modo ($ o %) y las mismas filas abiertas. Si el
// usuario colapsó todo, salen las seis bandas; si abrió Costos Fijos, salen
// sus categorías.
//
// HASTA DÓNDE BAJA
// ----------------
// Hasta nivel 2. Los niveles 3 y 4 (comprobantes, obras sociales, atenciones
// una por una) se cargan bajo demanda contra la base y pueden ser miles de
// filas: no entran en un PDF que se imprime, y para eso está la pantalla.
// Cuando hay filas abiertas de esos niveles, el PDF lo dice en la portada en
// vez de omitirlo en silencio.
//
// ORIENTACIÓN
// -----------
// Apaisado y siempre. Con 8 meses son 11 columnas; en vertical no entran sin
// achicar la tipografía hasta volverla ilegible.
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FilaEvolucion, Mes } from '@shared/types/evolucionTemporal';
import { labelMesCorto } from '@shared/types/evolucionTemporal';

type RGB = [number, number, number];

const C = {
  primary: [30, 64, 175] as RGB,
  white: [255, 255, 255] as RGB,
  dark: [31, 41, 55] as RGB,
  medium: [107, 114, 128] as RGB,
  light: [243, 244, 246] as RGB,
  verde: [4, 120, 87] as RGB,
  rojo: [185, 28, 28] as RGB,
  ambar: [180, 83, 9] as RGB,
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

const fmtMoneda = (n: number): string =>
  !isFinite(n) || n === 0 ? '—' : new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

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

export function generarEvolucionPDF(datos: DatosEvolucionPDF): void {
  const { meses, mesEnCurso, filas, expandidas, mostrarPct, facturacionPorMes } = datos;

  const doc = new jsPDF('l', 'mm', 'a4');
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 10;
  let pageNum = 0;

  const desde = meses[0] ? labelMesCorto(meses[0]) : '';
  const hasta = meses.length ? labelMesCorto(meses[meses.length - 1]) : '';
  const periodo = meses.length === 1 ? desde : `${desde} a ${hasta}`;

  const addHeader = () => {
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PW, 18, 'F');
    doc.setTextColor(...C.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Instituto Dr. Mercado', M, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Evolución Temporal — ${periodo}`, M, 14);
    doc.text(mostrarPct ? '% sobre facturación' : 'Importes en pesos', PW - M, 11, { align: 'right' });
  };

  const addFooter = () => {
    pageNum++;
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PH - 12, PW - M, PH - 12);
    doc.setFontSize(7);
    doc.setTextColor(...C.medium);
    doc.text('Documento confidencial — Instituto Dr. Mercado / Survisión S.A.', M, PH - 7);
    doc.text(`Página ${pageNum}`, PW - M, PH - 7, { align: 'right' });
  };

  addHeader();

  // ── Leyenda: qué está mostrando y qué no ──
  const visibles = aplanar(filas, expandidas);
  const omitido = contarDetalleOmitido(filas, expandidas);
  const avisos: string[] = [];
  if (mesEnCurso) avisos.push(`${labelMesCorto(mesEnCurso)} es el mes en curso: está incompleto.`);
  if (omitido > 0) {
    avisos.push(
      `${omitido} ${omitido === 1 ? 'fila tiene' : 'filas tienen'} abierto el detalle por comprobante o atención; ` +
      'ese nivel no se incluye en el PDF y se consulta en pantalla.',
    );
  }

  let y = 24;
  if (avisos.length) {
    doc.setFillColor(254, 249, 195);
    doc.setDrawColor(234, 179, 8);
    const alto = 4.5 * avisos.length + 3;
    doc.roundedRect(M, y, PW - M * 2, alto, 1, 1, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ambar);
    avisos.forEach((t, i) => doc.text(t, M + 3, y + 5 + i * 4.5));
    y += alto + 4;
  }

  // ── Tabla principal ──
  const head = [['Concepto', ...meses.map(m => labelMesCorto(m)), 'Total', 'Prom.']];

  const body = visibles.map(f => {
    const sangria = f.nivel === 0 ? '' : f.nivel === 1 ? '   ' : '      ';
    const celdas = meses.map(m => {
      const v = f.valores[m] || 0;
      const fact = facturacionPorMes[m] || 0;
      if (v === 0) return '—';
      return mostrarPct && fact > 0 ? fmtPct((v / fact) * 100) : fmtMoneda(v);
    });
    return [
      `${sangria}${f.label}`,
      ...celdas,
      fmtMoneda(f.total),
      f.promedioMensual ? fmtMoneda(f.promedioMensual) : '—',
    ];
  });

  // La columna de concepto cede ancho cuando hay muchos meses. Con 12 meses y
  // 58 mm fijos, cada columna de datos queda en 15,6 mm y un total anual de
  // nueve cifras ($870.745.862, 12 caracteres) se corta. Achicándola a 42 mm
  // entra hasta diciembre; con pocos meses se queda ancha, que es cuando el
  // nombre de la categoría es lo que más se agradece leer entero.
  const anchoConcepto = meses.length >= 11 ? 42 : meses.length >= 9 ? 50 : 58;

  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: M, right: M, bottom: 16 },
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.2, textColor: C.dark, lineColor: [229, 231, 235], lineWidth: 0.1, overflow: 'ellipsize' },
    headStyles: { fillColor: C.primary, textColor: C.white, fontSize: 6.5, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: anchoConcepto, halign: 'left' },
      ...Object.fromEntries(meses.map((_, i) => [i + 1, { halign: 'right' as const }])),
      [meses.length + 1]: { halign: 'right' as const, fontStyle: 'bold' as const },
      [meses.length + 2]: { halign: 'right' as const, textColor: C.medium },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const f = visibles[d.row.index];
      if (!f) return;

      if (f.nivel === 0) {
        d.cell.styles.fillColor = FONDO_BANDA[f.tipo] || C.light;
        d.cell.styles.fontStyle = 'bold';
      } else if (f.metadata?.esSubtotal) {
        d.cell.styles.fontStyle = 'bold';
      }

      // El resultado operativo se pinta según signo, como en pantalla.
      if (f.tipo === 'resultado_operativo' && d.column.index > 0) {
        const txt = String(d.cell.raw ?? '');
        if (txt.startsWith('-') || txt.includes('-$')) d.cell.styles.textColor = C.rojo;
        else if (txt !== '—') d.cell.styles.textColor = C.verde;
      }
      // Marca visual del mes en curso.
      const idxMesCurso = mesEnCurso ? meses.indexOf(mesEnCurso) + 1 : -1;
      if (d.column.index === idxMesCurso) d.cell.styles.textColor = C.medium;
    },
    didDrawPage: () => {
      if (pageNum > 0) addHeader();
      addFooter();
    },
  });

  // ── Pie con la fecha del dato ──
  const finY = (doc as any).lastAutoTable?.finalY ?? y;
  if (finY < PH - 22) {
    doc.setFontSize(7);
    doc.setTextColor(...C.medium);
    const cuando = datos.ultimaActualizacion
      ? new Date(datos.ultimaActualizacion).toLocaleString('es-AR')
      : new Date().toLocaleString('es-AR');
    doc.text(`Datos al ${cuando}.`, M, finY + 5);
  }

  const nombre = `Evolucion_Temporal_${meses[0] || ''}_${meses[meses.length - 1] || ''}.pdf`;
  doc.save(nombre.replace(/\s+/g, '_'));
}

export default generarEvolucionPDF;
