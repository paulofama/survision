// ============================================================
// PDF GENERATOR - INFORME DE GESTIÓN MENSUAL
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================
//
// DEPENDENCIAS NECESARIAS:
//   npm install jspdf jspdf-autotable
//   npm install -D @types/jspdf
//
// USO:
//   import { generarPDFInformeGestion } from '../utils/pdfGeneratorInformeGestion';
//   generarPDFInformeGestion(datos);
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DatosInformeGestion, MetricasResumen } from '@/types/informes';

// ============================================================
// EVOLUCIÓN 12 MESES — Tipos para gráficos de líneas
// ============================================================
// Se agrega como propiedad OPCIONAL al objeto DatosInformeGestion
// (vía casteo en runtime). Si no viene definida, los gráficos
// simplemente no se dibujan y el informe queda igual a la versión
// anterior (retrocompatible 100%).
//
// El backend debe devolver esta estructura. Las cantidades se
// calculan desde MovEnca (atenciones para OS/Prestador) y MovPrac
// (cantidad de prácticas para Top 10 prácticas), sin importes.
// ============================================================

interface MesEvolucion {
  anio: number;
  mes: number;       // 1-12
  label: string;     // ej: "May 25"
}

interface SerieEvolucion {
  nombre: string;    // sigla de OS / nombre prestador / nombre práctica
  total: number;     // suma de los 12 meses (para ordenar y truncar)
  serie: number[];   // 12 valores (cantidades), uno por mes en orden
}

interface EvolucionMensual12M {
  meses: MesEvolucion[];                    // 12 elementos, orden cronológico
  obrasSociales: SerieEvolucion[];          // ya filtrado: top 10 por total
  prestadores: SerieEvolucion[];            // todos los activos
  practicas: SerieEvolucion[];              // ya filtrado: top 10 por total
}

// ============================================================
// CRUCE PRÁCTICAS × OBRAS SOCIALES (matriz mes actual)
// ============================================================
interface ColumnaOS {
  osId: number;
  sigla: string;
  nombre: string;
}

interface CeldaCruce {
  cantidad: number;
  facturado: number;
}

interface FilaPracticaCruce {
  nomId: number;
  nomCod: string;
  nomNombre: string;
  totalCantidad: number;
  totalFacturado: number;
  // Map por clave: osId (número como string) o "OTRAS"
  celdas: { [key: string]: CeldaCruce };
}

interface CruceOSxPracticas {
  columnasOS: ColumnaOS[];          // top 10 OS por facturación del mes
  filasPracticas: FilaPracticaCruce[]; // todas las prácticas, ordenadas DESC por facturación
}

// ---- Constantes de diseño ----
const COLORS = {
  primary: [37, 99, 235] as [number, number, number],       // blue-600
  primaryDark: [29, 78, 216] as [number, number, number],    // blue-700
  secondary: [75, 85, 99] as [number, number, number],      // gray-600
  success: [22, 163, 74] as [number, number, number],       // green-600
  danger: [220, 38, 38] as [number, number, number],        // red-600
  warning: [217, 119, 6] as [number, number, number],       // amber-600
  headerBg: [30, 58, 138] as [number, number, number],      // blue-900
  lightBg: [239, 246, 255] as [number, number, number],     // blue-50
  tableBg: [248, 250, 252] as [number, number, number],     // slate-50
  textDark: [15, 23, 42] as [number, number, number],       // slate-900
  textMuted: [100, 116, 139] as [number, number, number],   // slate-500
  border: [203, 213, 225] as [number, number, number],      // slate-300
};

// ---- Paleta de 10 colores distintivos para series del gráfico ----
// Elegidos para máximo contraste entre sí, accesibles en B/N también
const SERIE_COLORS: [number, number, number][] = [
  [37, 99, 235],    // blue-600
  [220, 38, 38],    // red-600
  [22, 163, 74],    // green-600
  [217, 119, 6],    // amber-600
  [124, 58, 237],   // violet-600
  [8, 145, 178],    // cyan-600
  [219, 39, 119],   // pink-600
  [101, 163, 13],   // lime-600
  [234, 88, 12],    // orange-600
  [71, 85, 105],    // slate-600
];

const MARGIN = { top: 20, left: 20, right: 20, bottom: 30 };
const PAGE_WIDTH = 210; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;

// ---- Helpers de formato ----
const fmtMoneda = (n: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

const fmtNumero = (n: number): string => {
  return new Intl.NumberFormat('es-AR').format(Math.round(n));
};

const fmtPct = (n: number): string => {
  const signo = n > 0 ? '+' : '';
  return `${signo}${n.toFixed(1)}%`;
};

const fmtVariacion = (n: number): string => {
  if (n > 0) return `+${n.toFixed(1)}%`;
  if (n < 0) return `${n.toFixed(1)}%`;
  return `0.0%`;
};

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================
export const generarPDFInformeGestion = (datos: DatosInformeGestion): void => {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let yPos = MARGIN.top;

  // ============================================================
  // PÁGINA 1: PORTADA + RESUMEN EJECUTIVO
  // ============================================================
  dibujarPortada(doc, datos);
  doc.addPage();

  // ============================================================
  // PÁGINA 2: RESUMEN EJECUTIVO CON KPIs
  // ============================================================
  yPos = MARGIN.top;
  yPos = dibujarHeaderPagina(doc, yPos, 'RESUMEN EJECUTIVO', datos.periodo.label);

  // KPIs principales - Comparativa mensual
  yPos = dibujarSubtitulo(doc, yPos, `Comparativa Mensual`);
  yPos = dibujarTarjetasKPI(doc, yPos, datos.resumenMensual);

  // Tabla resumen mensual
  yPos += 5;
  yPos = dibujarTablaResumenComparativo(
    doc,
    yPos,
    'Mes Actual vs Mes Anterior',
    datos.resumenMensual.actual,
    datos.resumenMensual.anterior,
    datos.periodo.label,
    `Mes Anterior`
  );

  // Si hay espacio, agregar acumulado
  if (yPos > 200) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'RESUMEN EJECUTIVO (cont.)', datos.periodo.label);
  }

  yPos += 5;
  yPos = dibujarSubtitulo(doc, yPos, 'Comparativa Acumulada Anual');
  yPos = dibujarTablaResumenComparativo(
    doc,
    yPos,
    `Acumulado ${datos.periodo.anio} vs ${datos.periodo.anio - 1}`,
    datos.resumenAcumulado.actual,
    datos.resumenAcumulado.anterior,
    `Ene-${datos.periodo.label.split(' ')[0].substring(0, 3)} ${datos.periodo.anio}`,
    `Ene-${datos.periodo.label.split(' ')[0].substring(0, 3)} ${datos.periodo.anio - 1}`
  );

  // ============================================================
  // SECCIÓN: ANÁLISIS POR OBRA SOCIAL
  // ============================================================

  // OS - Desglose
  doc.addPage();
  yPos = MARGIN.top;
  yPos = dibujarHeaderPagina(doc, yPos, 'ANALISIS POR OBRA SOCIAL', datos.periodo.label);
  yPos = dibujarTablaOS(doc, yPos, datos.porObraSocial.mesActual, datos.periodo.label);

  // OS - Comparativo Mensual
  if (yPos > 180) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'OBRAS SOCIALES - COMPARATIVO MENSUAL', datos.periodo.label);
  }
  yPos += 5;
  yPos = dibujarTablaComparativa(doc, yPos, {
    titulo: 'Top 10 OS - Comparativo Mensual',
    datosBase: datos.porObraSocial.mesActual,
    datosComparar: datos.porObraSocial.mesAnterior,
    idField: 'osId',
    getName: (os) => os.osSigla || os.osNombre?.substring(0, 20) || '',
    cantField: 'atenciones',
    factField: 'facturado',
    colCantLabel: ['Atenc Act', 'Atenc Ant'],
    colFactLabel: ['Fact Act', 'Fact Ant'],
    maxRows: 10,
    nameMaxLen: 20,
  });

  // OS - Comparativo Anual
  if (yPos > 180) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'OBRAS SOCIALES - COMPARATIVO ANUAL', datos.periodo.label);
  }
  yPos += 5;
  yPos = dibujarTablaComparativa(doc, yPos, {
    titulo: `Top 10 OS - Acumulado ${datos.periodo.anio} vs ${datos.periodo.anio - 1}`,
    datosBase: datos.porObraSocial.acumActual || datos.porObraSocial.mesActual,
    datosComparar: datos.porObraSocial.acumAnterior || [],
    idField: 'osId',
    getName: (os) => os.osSigla || os.osNombre?.substring(0, 20) || '',
    cantField: 'atenciones',
    factField: 'facturado',
    colCantLabel: [`Atenc ${datos.periodo.anio}`, `Atenc ${datos.periodo.anio - 1}`],
    colFactLabel: [`Fact ${datos.periodo.anio}`, `Fact ${datos.periodo.anio - 1}`],
    maxRows: 10,
    nameMaxLen: 20,
  });

  // OS - Gráfico Evolución 12 meses (cantidades)
  const evolucion12M = (datos as any).evolucion12Meses as EvolucionMensual12M | undefined;
  if (evolucion12M?.obrasSociales?.length) {
    yPos += 4;
    yPos = dibujarGraficoEvolucion12M(doc, yPos, {
      titulo: 'Evolucion Mensual de Atenciones - Ultimos 12 meses',
      sectionHeaderTitle: 'OBRAS SOCIALES - EVOLUCION ANUAL',
      periodoLabel: datos.periodo.label,
      meses: evolucion12M.meses,
      series: evolucion12M.obrasSociales,
      sufijoLeyenda: '(Top 10 por cantidad total)',
    });
  }

  // ============================================================
  // SECCIÓN: ANÁLISIS POR PRESTADOR
  // ============================================================

  // Prestadores - Desglose
  doc.addPage();
  yPos = MARGIN.top;
  yPos = dibujarHeaderPagina(doc, yPos, 'ANALISIS POR PRESTADOR', datos.periodo.label);
  yPos = dibujarTablaPrestadores(doc, yPos, datos.porPrestador.mesActual, datos.periodo.label);

  // Prestadores - Comparativo Mensual
  if (yPos > 180) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'PRESTADORES - COMPARATIVO MENSUAL', datos.periodo.label);
  }
  yPos += 5;
  yPos = dibujarTablaComparativa(doc, yPos, {
    titulo: 'Prestadores - Comparativo Mensual',
    datosBase: datos.porPrestador.mesActual,
    datosComparar: datos.porPrestador.mesAnterior,
    idField: 'preId',
    getName: (pre) => pre.preNombre || '',
    cantField: 'atenciones',
    factField: 'facturado',
    colCantLabel: ['Atenc Act', 'Atenc Ant'],
    colFactLabel: ['Fact Act', 'Fact Ant'],
    maxRows: 10,
    nameMaxLen: 20,
  });

  // Prestadores - Comparativo Anual
  if (yPos > 180) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'PRESTADORES - COMPARATIVO ANUAL', datos.periodo.label);
  }
  yPos += 5;
  yPos = dibujarTablaComparativa(doc, yPos, {
    titulo: `Prestadores - Acumulado ${datos.periodo.anio} vs ${datos.periodo.anio - 1}`,
    datosBase: datos.porPrestador.acumActual || datos.porPrestador.mesActual,
    datosComparar: datos.porPrestador.acumAnterior || [],
    idField: 'preId',
    getName: (pre) => pre.preNombre || '',
    cantField: 'atenciones',
    factField: 'facturado',
    colCantLabel: [`Atenc ${datos.periodo.anio}`, `Atenc ${datos.periodo.anio - 1}`],
    colFactLabel: [`Fact ${datos.periodo.anio}`, `Fact ${datos.periodo.anio - 1}`],
    maxRows: 10,
    nameMaxLen: 20,
  });

  // Prestadores - Gráfico Evolución 12 meses (cantidades, todos los prestadores)
  if (evolucion12M?.prestadores?.length) {
    yPos += 4;
    yPos = dibujarGraficoEvolucion12M(doc, yPos, {
      titulo: 'Evolucion Mensual de Atenciones - Ultimos 12 meses',
      sectionHeaderTitle: 'PRESTADORES - EVOLUCION ANUAL',
      periodoLabel: datos.periodo.label,
      meses: evolucion12M.meses,
      series: evolucion12M.prestadores,
      sufijoLeyenda: '(Todos los prestadores activos)',
    });
  }

  // ============================================================
  // SECCIÓN: ANÁLISIS POR PRÁCTICA
  // ============================================================

  // Prácticas - Desglose
  doc.addPage();
  yPos = MARGIN.top;
  yPos = dibujarHeaderPagina(doc, yPos, 'TOP PRACTICAS POR FACTURACION', datos.periodo.label);
  yPos = dibujarTablaPracticas(doc, yPos, datos.porPractica.mesActual, datos.periodo.label);

  // Prácticas - Comparativo Mensual
  if (yPos > 180) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'PRACTICAS - COMPARATIVO MENSUAL', datos.periodo.label);
  }
  yPos += 5;
  yPos = dibujarTablaComparativa(doc, yPos, {
    titulo: 'Top 15 Practicas - Comparativo Mensual',
    datosBase: datos.porPractica.mesActual,
    datosComparar: datos.porPractica.mesAnterior || [],
    idField: 'nomId',
    idField2: 'nomCod',
    getName: (prac) => prac.nomNombre || '',
    cantField: 'cantidad',
    factField: 'facturado',
    colCantLabel: ['Cant Act', 'Cant Ant'],
    colFactLabel: ['Fact Act', 'Fact Ant'],
    maxRows: 15,
    nameMaxLen: 20,
  });

  // Prácticas - Comparativo Anual
  if (yPos > 180) {
    doc.addPage();
    yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(doc, yPos, 'PRACTICAS - COMPARATIVO ANUAL', datos.periodo.label);
  }
  yPos += 5;
  yPos = dibujarTablaComparativa(doc, yPos, {
    titulo: `Top 15 Practicas - Acumulado ${datos.periodo.anio} vs ${datos.periodo.anio - 1}`,
    datosBase: datos.porPractica.acumActual || datos.porPractica.mesActual,
    datosComparar: datos.porPractica.acumAnterior || [],
    idField: 'nomId',
    idField2: 'nomCod',
    getName: (prac) => prac.nomNombre || '',
    cantField: 'cantidad',
    factField: 'facturado',
    colCantLabel: [`Cant ${datos.periodo.anio}`, `Cant ${datos.periodo.anio - 1}`],
    colFactLabel: [`Fact ${datos.periodo.anio}`, `Fact ${datos.periodo.anio - 1}`],
    maxRows: 15,
    nameMaxLen: 20,
  });

  // Prácticas - Gráfico Evolución 12 meses (cantidades, top 10 por cantidad total)
  if (evolucion12M?.practicas?.length) {
    yPos += 4;
    yPos = dibujarGraficoEvolucion12M(doc, yPos, {
      titulo: 'Evolucion Mensual de Cantidades - Ultimos 12 meses',
      sectionHeaderTitle: 'PRACTICAS - EVOLUCION ANUAL',
      periodoLabel: datos.periodo.label,
      meses: evolucion12M.meses,
      series: evolucion12M.practicas,
      sufijoLeyenda: '(Top 10 por cantidad total)',
    });
  }

  // ============================================================
  // SECCIÓN: OBRAS SOCIALES × PRESTACIONES (matriz cruzada)
  // ============================================================
  const cruceOSxPracticas = (datos as any).cruceOSxPracticas as CruceOSxPracticas | undefined;
  if (cruceOSxPracticas?.filasPracticas?.length && cruceOSxPracticas?.columnasOS?.length) {
    dibujarSeccionCruceOSxPracticas(doc, datos.periodo.label, cruceOSxPracticas);
  }

  // ============================================================
  // PÁGINA FINAL: ANÁLISIS EJECUTIVO Y CONCLUSIONES
  // ============================================================
  doc.addPage();
  yPos = MARGIN.top;
  yPos = dibujarHeaderPagina(doc, yPos, 'ANALISIS EJECUTIVO Y CONCLUSIONES', datos.periodo.label);
  yPos = dibujarAnalisisEjecutivo(doc, yPos, datos);

  // ---- Agregar números de página a todas las páginas ----
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    dibujarFooterPagina(doc, i, totalPages);
  }

  // ---- Descargar ----
  const nombreArchivo = `Informe_Gestion_${datos.periodo.periodoGeclisa}.pdf`;
  doc.save(nombreArchivo);
};

// ============================================================
// FUNCIONES DE DIBUJO
// ============================================================

function dibujarPortada(doc: jsPDF, datos: DatosInformeGestion): void {
  // Fondo header
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, 210, 100, 'F');

  // Línea decorativa
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 100, 210, 3, 'F');

  // Título instituto
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('INSTITUTO DR. MERCADO', 105, 35, { align: 'center' });

  // Título informe
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME DE', 105, 55, { align: 'center' });
  doc.text('GESTION MENSUAL', 105, 68, { align: 'center' });

  // Período
  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.text(datos.periodo.label.toUpperCase(), 105, 85, { align: 'center' });

  // Sección de datos debajo
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const infoY = 120;

  doc.setFillColor(...COLORS.lightBg);
  doc.roundedRect(25, infoY - 10, CONTENT_WIDTH + 10, 40, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENTO CONFIDENCIAL - USO EXCLUSIVO DIRECCION', 105, infoY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(10);

  doc.text(`Periodo analizado: ${datos.periodo.label}`, 105, infoY + 14, { align: 'center' });
  doc.text(
    `Comparativa con: Mes anterior y Acumulado ${datos.periodo.anio - 1}`,
    105,
    infoY + 22,
    { align: 'center' }
  );

  // ============================================================
  // RESUMEN COMPARATIVO EN PORTADA
  // ============================================================
  const resY = 175;
  const actual = datos.resumenMensual.actual;
  const anterior = datos.resumenMensual.anterior;

  // Título sección
  doc.setTextColor(...COLORS.primaryDark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DEL PERIODO', 105, resY, { align: 'center' });

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(40, resY + 3, 170, resY + 3);

  // --- Tarjeta: Atenciones ---
  const cardW = 75;
  const cardH = 50;
  const gap = 10;
  const cardX1 = 105 - cardW - gap / 2;  // Tarjeta izquierda
  const cardX2 = 105 + gap / 2;          // Tarjeta derecha
  const cardY = resY + 10;

  // Tarjeta 1: ATENCIONES
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(cardX1, cardY, cardW, cardH, 3, 3, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX1, cardY, cardW, cardH, 3, 3, 'S');

  // Borde superior azul
  doc.setFillColor(...COLORS.primary);
  doc.rect(cardX1, cardY, cardW, 2, 'F');

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ATENCIONES', cardX1 + cardW / 2, cardY + 10, { align: 'center' });

  // Mes actual
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Mes Actual:', cardX1 + 6, cardY + 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(fmtNumero(actual.totalAtenciones), cardX1 + cardW - 6, cardY + 21, { align: 'right' });

  // Mes anterior
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Mes Anterior:', cardX1 + 6, cardY + 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(fmtNumero(anterior.totalAtenciones), cardX1 + cardW - 6, cardY + 31, { align: 'right' });

  // Variación atenciones
  const varAtenc = anterior.totalAtenciones !== 0
    ? ((actual.totalAtenciones - anterior.totalAtenciones) / Math.abs(anterior.totalAtenciones)) * 100
    : 0;
  const colorAtenc = varAtenc >= 0 ? COLORS.success : COLORS.danger;
  doc.setTextColor(...colorAtenc);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${varAtenc >= 0 ? '+' : ''}${varAtenc.toFixed(1)}%`, cardX1 + cardW / 2, cardY + 44, { align: 'center' });

  // Tarjeta 2: FACTURADO
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(cardX2, cardY, cardW, cardH, 3, 3, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX2, cardY, cardW, cardH, 3, 3, 'S');

  // Borde superior verde
  doc.setFillColor(...COLORS.success);
  doc.rect(cardX2, cardY, cardW, 2, 'F');

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURADO', cardX2 + cardW / 2, cardY + 10, { align: 'center' });

  // Mes actual
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Mes Actual:', cardX2 + 6, cardY + 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(fmtMoneda(actual.totalFacturado), cardX2 + cardW - 6, cardY + 21, { align: 'right' });

  // Mes anterior
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Mes Anterior:', cardX2 + 6, cardY + 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(fmtMoneda(anterior.totalFacturado), cardX2 + cardW - 6, cardY + 31, { align: 'right' });

  // Variación facturado
  const varFact = anterior.totalFacturado !== 0
    ? ((actual.totalFacturado - anterior.totalFacturado) / Math.abs(anterior.totalFacturado)) * 100
    : 0;
  const colorFact = varFact >= 0 ? COLORS.success : COLORS.danger;
  doc.setTextColor(...colorFact);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${varFact >= 0 ? '+' : ''}${varFact.toFixed(1)}%`, cardX2 + cardW / 2, cardY + 44, { align: 'center' });

  // Fecha de generación
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generado: ${new Date(datos.generadoEn).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    105,
    cardY + cardH + 12,
    { align: 'center' }
  );

  // Footer portada (solo una línea limpia)
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN.left, 280, MARGIN.left + CONTENT_WIDTH, 280);

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Costos - Instituto Dr. Mercado', MARGIN.left, 285);
  doc.text('P. Fama | Desarrollo', MARGIN.left + CONTENT_WIDTH, 285, { align: 'right' });
}

function dibujarHeaderPagina(doc: jsPDF, y: number, titulo: string, subtitulo: string): number {
  // Barra azul
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(MARGIN.left, y, CONTENT_WIDTH, 10, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, MARGIN.left + 5, y + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitulo, MARGIN.left + CONTENT_WIDTH - 5, y + 7, { align: 'right' });

  // Línea debajo
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(MARGIN.left, y + 11, MARGIN.left + CONTENT_WIDTH, y + 11);

  return y + 16;
}

function dibujarSubtitulo(doc: jsPDF, y: number, texto: string): number {
  doc.setTextColor(...COLORS.primaryDark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(texto, MARGIN.left, y + 5);

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN.left, y + 7, MARGIN.left + CONTENT_WIDTH, y + 7);

  return y + 12;
}

function dibujarTarjetasKPI(
  doc: jsPDF,
  y: number,
  comparativa: { actual: MetricasResumen; anterior: MetricasResumen; variacionPct: MetricasResumen }
): number {
  const kpis = [
    {
      label: 'Atenciones',
      valor: fmtNumero(comparativa.actual.totalAtenciones),
      variacion: comparativa.variacionPct.totalAtenciones,
    },
    {
      label: 'Facturado',
      valor: fmtMoneda(comparativa.actual.totalFacturado),
      variacion: comparativa.variacionPct.totalFacturado,
    },
    {
      label: 'Ticket Promedio',
      valor: fmtMoneda(comparativa.actual.ticketPromedio),
      variacion: comparativa.variacionPct.ticketPromedio,
    },
  ];

  const cardWidth = (CONTENT_WIDTH - 6) / 3; // 3 tarjetas con 3px gap
  const cardHeight = 22;

  kpis.forEach((kpi, i) => {
    const x = MARGIN.left + i * (cardWidth + 3);

    // Fondo tarjeta
    doc.setFillColor(...COLORS.lightBg);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F');

    // Borde superior color según variación
    const borderColor = kpi.variacion >= 0 ? COLORS.success : COLORS.danger;
    doc.setFillColor(...borderColor);
    doc.rect(x, y, cardWidth, 1.5, 'F');

    // Label
    doc.setTextColor(...COLORS.textMuted);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), x + cardWidth / 2, y + 6, { align: 'center' });

    // Valor
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.valor, x + cardWidth / 2, y + 13, { align: 'center' });

    // Variación
    doc.setTextColor(...(kpi.variacion >= 0 ? COLORS.success : COLORS.danger));
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(fmtVariacion(kpi.variacion), x + cardWidth / 2, y + 19, { align: 'center' });
  });

  return y + cardHeight + 5;
}

function dibujarTablaResumenComparativo(
  doc: jsPDF,
  y: number,
  titulo: string,
  actual: MetricasResumen,
  anterior: MetricasResumen,
  labelActual: string,
  labelAnterior: string
): number {
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, MARGIN.left, y + 4);
  y += 7;

  const filas = [
    ['Total Atenciones', fmtNumero(actual.totalAtenciones), fmtNumero(anterior.totalAtenciones)],
    ['Pacientes Unicos', fmtNumero(actual.pacientesUnicos), fmtNumero(anterior.pacientesUnicos)],
    ['Total Practicas', fmtNumero(actual.totalPracticas), fmtNumero(anterior.totalPracticas)],
    ['Practicas/Atencion', actual.practicasPorAtencion.toFixed(2), anterior.practicasPorAtencion.toFixed(2)],
    ['Total Facturado', fmtMoneda(actual.totalFacturado), fmtMoneda(anterior.totalFacturado)],
    ['Total Honorarios', fmtMoneda(actual.totalHonorarios), fmtMoneda(anterior.totalHonorarios)],
    ['Ticket Promedio', fmtMoneda(actual.ticketPromedio), fmtMoneda(anterior.ticketPromedio)],
  ];

  // Agregar columna de variación
  const filasConVariacion = filas.map((fila, i) => {
    const valActual = [
      actual.totalAtenciones, actual.pacientesUnicos, actual.totalPracticas,
      actual.practicasPorAtencion, actual.totalFacturado, actual.totalHonorarios,
      actual.ticketPromedio,
    ][i];
    const valAnterior = [
      anterior.totalAtenciones, anterior.pacientesUnicos, anterior.totalPracticas,
      anterior.practicasPorAtencion, anterior.totalFacturado, anterior.totalHonorarios,
      anterior.ticketPromedio,
    ][i];
    const pct = valAnterior !== 0
      ? ((valActual - valAnterior) / Math.abs(valAnterior)) * 100
      : 0;
    return [...fila, fmtVariacion(pct)];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right },
    head: [['Indicador', labelActual, labelAnterior, 'Variacion']],
    body: filasConVariacion,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: COLORS.tableBg,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { halign: 'right', cellWidth: 40 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'center', cellWidth: 30 },
    },
    didParseCell: (data) => {
      // Colorear variacion
      if (data.column.index === 3 && data.section === 'body') {
        const text = data.cell.text[0] || '';
        if (text.startsWith('+')) {
          data.cell.styles.textColor = COLORS.success;
          data.cell.styles.fontStyle = 'bold';
        } else if (text.startsWith('-')) {
          data.cell.styles.textColor = COLORS.danger;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 5;
}

// ============================================================
// TABLA OBRA SOCIAL - MODIFICADA
// Se quitó: columna "Práct." (redundante) y "Honorarios"
// Se agregó: columna "%" (% de atenciones sobre el total)
// ============================================================
function dibujarTablaOS(
  doc: jsPDF,
  y: number,
  osData: any[],
  periodo: string
): number {
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Desglose por Obra Social - ${periodo}`, MARGIN.left, y + 4);
  y += 7;

  // Calcular total de atenciones y total facturado para porcentajes
  const totalAtenciones = osData.reduce((sum, os) => sum + (os.atenciones || 0), 0);
  const totalFacturado = osData.reduce((sum, os) => sum + (os.facturado || 0), 0);

  const filas = osData.slice(0, 15).map((os, i) => {
    const pctAtenc = totalAtenciones > 0
      ? ((os.atenciones / totalAtenciones) * 100).toFixed(1)
      : '0.0';
    const pctFact = totalFacturado > 0
      ? ((os.facturado / totalFacturado) * 100).toFixed(1)
      : '0.0';

    return [
      `${i + 1}`,
      os.osSigla || os.osNombre.substring(0, 20),
      fmtNumero(os.atenciones),
      `${pctAtenc}%`,
      fmtMoneda(os.facturado),
      `${pctFact}%`,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right },
    head: [['#', 'Obra Social', 'Atenc.', '%', 'Facturado', 'Part%']],
    body: filas,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: COLORS.tableBg },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 65, fontStyle: 'bold' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 38, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
    },
  });

  return (doc as any).lastAutoTable.finalY + 3;
}

// ============================================================
// FUNCIÓN GENÉRICA COMPARATIVA
// Usada para las 6 tablas: OS/Prestadores/Prácticas x Mensual/Anual
// Formato: # | Entidad | Cant Act | Cant Ant | Var% | Fact Act | Fact Ant | Var%
// ============================================================
function dibujarTablaComparativa(
  doc: jsPDF,
  y: number,
  config: {
    titulo: string;
    datosBase: any[];
    datosComparar: any[];
    idField: string;
    idField2?: string; // Para claves compuestas (ej: nomId + nomCod)
    getName: (item: any) => string;
    cantField: string;
    factField: string;
    colCantLabel: [string, string];
    colFactLabel: [string, string];
    maxRows: number;
    nameMaxLen: number;
  }
): number {
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(config.titulo, MARGIN.left, y + 4);
  y += 7;

  const filas = config.datosBase.slice(0, config.maxRows).map((item, i) => {
    const cantAct = item[config.cantField] || 0;
    const factAct = item[config.factField] || 0;

    // Soporte para clave compuesta (ej: Nomenclador usa nom_id + nom_cod)
    const itemAnt = config.datosComparar.find(c => {
      const match1 = c[config.idField] === item[config.idField];
      if (!config.idField2) return match1;
      return match1 && String(c[config.idField2]).trim() === String(item[config.idField2]).trim();
    });
    const cantAnt = itemAnt?.[config.cantField] || 0;
    const factAnt = itemAnt?.[config.factField] || 0;

    const varCant = cantAnt > 0
      ? ((cantAct - cantAnt) / cantAnt) * 100 : 0;
    const varFact = factAnt > 0
      ? ((factAct - factAnt) / factAnt) * 100 : 0;

    return [
      `${i + 1}`,
      config.getName(item).substring(0, config.nameMaxLen),
      fmtNumero(cantAct),
      fmtNumero(cantAnt),
      fmtVariacion(varCant),
      fmtMoneda(factAct),
      fmtMoneda(factAnt),
      fmtVariacion(varFact),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right },
    head: [[
      '#', '',
      config.colCantLabel[0], config.colCantLabel[1], 'Var%',
      config.colFactLabel[0], config.colFactLabel[1], 'Var%',
    ]],
    body: filas,
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.5,
    },
    alternateRowStyles: { fillColor: COLORS.tableBg },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 34, fontStyle: 'bold' },
      2: { cellWidth: 17, halign: 'right' },
      3: { cellWidth: 17, halign: 'right' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
      7: { cellWidth: 15, halign: 'center' },
    },
    didParseCell: (data) => {
      // Colorear variaciones (columnas 4 y 7)
      if ((data.column.index === 4 || data.column.index === 7) && data.section === 'body') {
        const text = data.cell.text[0] || '';
        if (text.startsWith('+')) {
          data.cell.styles.textColor = COLORS.success;
          data.cell.styles.fontStyle = 'bold';
        } else if (text.startsWith('-')) {
          data.cell.styles.textColor = COLORS.danger;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 3;
}

function dibujarTablaPrestadores(
  doc: jsPDF,
  y: number,
  prestadores: any[],
  periodo: string
): number {
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Desglose por Prestador - ${periodo}`, MARGIN.left, y + 4);
  y += 7;

  // Totales para porcentajes
  const totalAtenciones = prestadores.reduce((sum, p) => sum + (p.atenciones || 0), 0);
  const totalFacturado = prestadores.reduce((sum, p) => sum + (p.facturado || 0), 0);

  const filas = prestadores.slice(0, 15).map((pre, i) => {
    const pctAtenc = totalAtenciones > 0
      ? ((pre.atenciones / totalAtenciones) * 100).toFixed(1)
      : '0.0';
    const pctFact = totalFacturado > 0
      ? (((pre.facturado || 0) / totalFacturado) * 100).toFixed(1)
      : '0.0';

    return [
      `${i + 1}`,
      pre.preNombre.substring(0, 25),
      fmtNumero(pre.atenciones),
      `${pctAtenc}%`,
      fmtMoneda(pre.facturado || 0),
      `${pctFact}%`,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right },
    head: [['#', 'Prestador', 'Atenc.', '%', 'Facturado', '%']],
    body: filas,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: COLORS.tableBg },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 16, halign: 'center' },
    },
  });

  return (doc as any).lastAutoTable.finalY + 3;
}


function dibujarTablaPracticas(
  doc: jsPDF,
  y: number,
  practicas: any[],
  periodo: string
): number {
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Top 20 Practicas por Facturacion - ${periodo}`, MARGIN.left, y + 4);
  y += 7;

  const filas = practicas.slice(0, 20).map((prac, i) => [
    `${i + 1}`,
    prac.nomNombre.substring(0, 30),
    fmtNumero(prac.cantidad),
    fmtMoneda(prac.facturado),
    fmtMoneda(prac.honorarios),
    `${prac.participacionPct.toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN.left, right: MARGIN.right },
    head: [['#', 'Practica', 'Cant.', 'Facturado', 'Honorarios', 'Part%']],
    body: filas,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: COLORS.tableBg,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 21, halign: 'center' },
    },
  });

  return (doc as any).lastAutoTable.finalY + 3;
}

// ============================================================
// ANÁLISIS EJECUTIVO - Generación automática de insights
// ============================================================

interface BloqueAnalisis {
  icono: string;
  titulo: string;
  color: [number, number, number];
  parrafos: string[];
}

function generarBloques(datos: DatosInformeGestion): BloqueAnalisis[] {
  const bloques: BloqueAnalisis[] = [];
  const m = datos.resumenMensual;
  const a = datos.resumenAcumulado;
  const pctM = m.variacionPct || {} as any;
  const pctA = a.variacionPct || {} as any;
  const act = m.actual;
  const ant = m.anterior;
  const acumAct = a.actual;
  const acumAnt = a.anterior;

  // --- Helper ---
  const pct = (v: number) => {
    if (!v || !isFinite(v)) return '0.0%';
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  };
  const mon = (v: number) => {
    if (!v) return '$0';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v);
  };
  const num = (v: number) => new Intl.NumberFormat('es-AR').format(Math.round(v || 0));

  // ===========================================================
  // BLOQUE 1: PANORAMA GENERAL
  // ===========================================================
  const parrafosPanorama: string[] = [];
  const totalAtenc = act.totalAtenciones || 0;
  const totalAtencAnt = ant.totalAtenciones || 0;
  const totalFact = act.totalFacturado || 0;
  const totalFactAnt = ant.totalFacturado || 0;

  let lineaPrincipal = `En ${datos.periodo.label} se registraron ${num(totalAtenc)} atenciones`;
  if (totalAtencAnt > 0) {
    const varAtenc = pctM.totalAtenciones || 0;
    lineaPrincipal += `, lo que representa una variacion del ${pct(varAtenc)} respecto al mes anterior (${num(totalAtencAnt)}).`;
  } else {
    lineaPrincipal += '.';
  }
  parrafosPanorama.push(lineaPrincipal);

  if (totalFact > 0) {
    let lineaFact = `La facturacion del periodo alcanzo ${mon(totalFact)}`;
    if (totalFactAnt > 0) {
      lineaFact += ` frente a ${mon(totalFactAnt)} del mes previo (${pct(pctM.totalFacturado || 0)}).`;
    } else {
      lineaFact += '.';
    }
    parrafosPanorama.push(lineaFact);
  }

  if (acumAct.totalAtenciones > 0 && acumAnt.totalAtenciones > 0) {
    const varAcum = pctA.totalAtenciones || 0;
    parrafosPanorama.push(
      `En terminos interanuales, el acumulado de atenciones (${num(acumAct.totalAtenciones)}) ` +
      `muestra una variacion del ${pct(varAcum)} respecto al mismo periodo de ${datos.periodo.anio - 1} (${num(acumAnt.totalAtenciones)}).`
    );
  }

  bloques.push({
    icono: 'PANORAMA GENERAL',
    titulo: 'Panorama General del Periodo',
    color: COLORS.primaryDark,
    parrafos: parrafosPanorama,
  });

  // ===========================================================
  // BLOQUE 2: SEÑALES POSITIVAS
  // ===========================================================
  const positivas: string[] = [];

  if ((pctM.totalAtenciones || 0) > 0)
    positivas.push(`Crecimiento en atenciones mensuales del ${pct(pctM.totalAtenciones)}.`);
  if ((pctM.totalFacturado || 0) > 5)
    positivas.push(`Facturacion mensual en alza: ${pct(pctM.totalFacturado)}.`);
  if ((pctM.ticketPromedio || 0) > 0)
    positivas.push(`El ticket promedio por atencion mejoro un ${pct(pctM.ticketPromedio)}.`);
  if ((pctA.totalAtenciones || 0) > 0)
    positivas.push(`Acumulado interanual de atenciones con tendencia positiva (${pct(pctA.totalAtenciones)}).`);
  if ((pctA.totalFacturado || 0) > 0)
    positivas.push(`Facturacion acumulada interanual en crecimiento (${pct(pctA.totalFacturado)}).`);

  // Prestadores con crecimiento
  const preAct = datos.porPrestador?.mesActual || [];
  const preAnt = datos.porPrestador?.mesAnterior || [];
  if (preAct.length > 0 && preAnt.length > 0) {
    const crecieron = preAct.filter(p => {
      const prev = preAnt.find((a: any) => a.preId === p.preId);
      return prev && p.atenciones > prev.atenciones;
    });
    if (crecieron.length > 0) {
      const top = crecieron.sort((a, b) => b.atenciones - a.atenciones)[0];
      const prev = preAnt.find((a: any) => a.preId === top.preId);
      if (prev) {
        const varPre = prev.atenciones > 0 ? ((top.atenciones - prev.atenciones) / prev.atenciones) * 100 : 0;
        positivas.push(`${top.preNombre?.trim()} destaca con ${pct(varPre)} de crecimiento en atenciones.`);
      }
    }
  }

  if (positivas.length === 0) positivas.push('No se identificaron indicadores con crecimiento significativo en este periodo.');

  bloques.push({
    icono: 'FORTALEZAS',
    titulo: 'Senales Positivas y Fortalezas',
    color: COLORS.success,
    parrafos: positivas,
  });

  // ===========================================================
  // BLOQUE 3: ALERTAS Y PUNTOS CRÍTICOS
  // ===========================================================
  const alertas: string[] = [];

  if ((pctM.totalAtenciones || 0) < -5)
    alertas.push(`Caida en atenciones mensuales del ${pct(pctM.totalAtenciones)}. Evaluar causas operativas o estacionales.`);
  if ((pctM.totalFacturado || 0) < -5)
    alertas.push(`Retroceso en facturacion mensual: ${pct(pctM.totalFacturado)}. Revisar mix de prestaciones y convenios.`);
  if ((pctA.totalAtenciones || 0) < -5)
    alertas.push(`El acumulado interanual de atenciones muestra retroceso (${pct(pctA.totalAtenciones)}).`);

  // Prestadores con caída
  if (preAct.length > 0 && preAnt.length > 0) {
    const cayeron = preAct.filter(p => {
      const prev = preAnt.find((a: any) => a.preId === p.preId);
      return prev && prev.atenciones > 0 && p.atenciones < prev.atenciones * 0.8;
    });
    cayeron.forEach(p => {
      const prev = preAnt.find((a: any) => a.preId === p.preId);
      if (prev) {
        const varP = ((p.atenciones - prev.atenciones) / prev.atenciones) * 100;
        alertas.push(`${p.preNombre?.trim()}: caida del ${pct(varP)} en atenciones respecto al mes anterior.`);
      }
    });
  }

  if (alertas.length === 0) alertas.push('No se detectaron alertas criticas en el periodo analizado.');

  bloques.push({
    icono: 'ALERTAS',
    titulo: 'Alertas y Puntos Criticos',
    color: COLORS.danger,
    parrafos: alertas,
  });

  // ===========================================================
  // BLOQUE 4: ANÁLISIS DIMENSIONAL
  // ===========================================================
  const dimensional: string[] = [];

  // OS
  const osAct = datos.porObraSocial?.mesActual || [];
  if (osAct.length > 0) {
    const topOS = osAct.sort((a, b) => (b.atenciones || 0) - (a.atenciones || 0))[0];
    const pctOS = totalAtenc > 0 ? ((topOS.atenciones || 0) / totalAtenc * 100).toFixed(1) : '0';
    dimensional.push(
      `La obra social con mayor volumen es ${(topOS.osSigla || topOS.osNombre || '').trim()} ` +
      `con ${num(topOS.atenciones)} atenciones (${pctOS}% del total).`
    );

    const top3 = osAct.slice(0, 3);
    const pctTop3 = totalAtenc > 0
      ? (top3.reduce((s, o) => s + (o.atenciones || 0), 0) / totalAtenc * 100).toFixed(1)
      : '0';
    dimensional.push(`Las 3 principales obras sociales concentran el ${pctTop3}% de las atenciones.`);
  }

  // Prestadores
  if (preAct.length > 0) {
    const topPre = preAct.sort((a, b) => (b.atenciones || 0) - (a.atenciones || 0))[0];
    const pctPre = totalAtenc > 0 ? ((topPre.atenciones || 0) / totalAtenc * 100).toFixed(1) : '0';
    dimensional.push(
      `El prestador con mayor actividad es ${topPre.preNombre?.trim()} ` +
      `con ${num(topPre.atenciones)} atenciones (${pctPre}% del total).`
    );
  }

  // Prácticas
  const pracAct = datos.porPractica?.mesActual || [];
  if (pracAct.length > 0) {
    const topPrac = pracAct.sort((a, b) => (b.cantidad || 0) - (a.cantidad || 0))[0];
    dimensional.push(
      `La practica mas frecuente es "${topPrac.nomNombre?.trim()}" con ${num(topPrac.cantidad)} realizaciones.`
    );
  }

  if (dimensional.length > 0) {
    bloques.push({
      icono: 'DIMENSIONES',
      titulo: 'Analisis por Dimension',
      color: COLORS.secondary,
      parrafos: dimensional,
    });
  }

  // ===========================================================
  // BLOQUE 5: CONCLUSIÓN
  // ===========================================================
  const conclusion: string[] = [];
  const indicadoresPos = [
    pctM.totalAtenciones > 0, pctM.totalFacturado > 0,
    pctA.totalAtenciones > 0, pctA.totalFacturado > 0,
  ].filter(Boolean).length;

  if (indicadoresPos >= 3) {
    conclusion.push(
      'El periodo muestra un desempeno favorable en la mayoria de los indicadores clave. ' +
      'Se recomienda sostener las estrategias actuales y monitorear la evolucion mensual.'
    );
  } else if (indicadoresPos >= 1) {
    conclusion.push(
      'El periodo presenta resultados mixtos. Existen senales de crecimiento en algunos indicadores, ' +
      'pero se observan areas que requieren atencion. Se sugiere profundizar el analisis de las dimensiones en retroceso.'
    );
  } else {
    conclusion.push(
      'Los indicadores del periodo reflejan un contexto desafiante. Se recomienda revisar las ' +
      'estrategias comerciales, evaluar la eficiencia operativa y analizar factores externos que puedan estar impactando.'
    );
  }

  bloques.push({
    icono: 'CONCLUSION',
    titulo: 'Conclusion y Recomendaciones',
    color: COLORS.primaryDark,
    parrafos: conclusion,
  });

  return bloques;
}

function dibujarAnalisisEjecutivo(doc: jsPDF, y: number, datos: DatosInformeGestion): number {
  const bloques = generarBloques(datos);
  const maxY = 265; // Límite antes de footer

  for (const bloque of bloques) {
    // Estimar altura del bloque
    const alturaEstimada = 12 + bloque.parrafos.length * 10;
    if (y + alturaEstimada > maxY) {
      doc.addPage();
      y = MARGIN.top;
      y = dibujarHeaderPagina(doc, y, 'ANALISIS EJECUTIVO Y CONCLUSIONES (cont.)', datos.periodo.label);
    }

    // Barra lateral de color
    doc.setFillColor(...bloque.color);
    doc.rect(MARGIN.left, y, 3, alturaEstimada - 2, 'F');

    // Título del bloque
    doc.setTextColor(...bloque.color);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(bloque.titulo, MARGIN.left + 7, y + 5);

    // Línea bajo título
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(MARGIN.left + 7, y + 7, MARGIN.left + CONTENT_WIDTH - 5, y + 7);

    // Párrafos
    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    let yTexto = y + 13;

    for (const parrafo of bloque.parrafos) {
      if (yTexto > maxY) {
        doc.addPage();
        y = MARGIN.top;
        y = dibujarHeaderPagina(doc, y, 'ANALISIS EJECUTIVO Y CONCLUSIONES (cont.)', datos.periodo.label);
        yTexto = y + 5;
      }

      // Viñeta
      doc.setFillColor(...bloque.color);
      doc.circle(MARGIN.left + 9, yTexto - 1.2, 0.8, 'F');

      // Texto con word-wrap
      const maxWidth = CONTENT_WIDTH - 17;
      const lines = doc.splitTextToSize(parrafo, maxWidth);
      doc.text(lines, MARGIN.left + 13, yTexto);
      yTexto += lines.length * 3.8 + 2;
    }

    y = yTexto + 4;
  }

  // --- Firma de generación ---
  if (y + 15 > maxY) {
    doc.addPage();
    y = MARGIN.top + 10;
  }
  y += 5;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(MARGIN.left, y, MARGIN.left + CONTENT_WIDTH, y);
  y += 5;
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Instituto Dr. Mercado - Sistema de Costos | ${datos.generadoEn ? new Date(datos.generadoEn).toLocaleString('es-AR') : ''}`,
    105,
    y,
    { align: 'center' }
  );

  return y + 5;
}


// ============================================================
// GRÁFICO DE EVOLUCIÓN 12 MESES — Líneas múltiples nativas en jsPDF
// ============================================================
// Dibuja un gráfico de líneas para una sección (OS / Prestador / Práctica).
// Diseño consistente con el resto del PDF: caja blanca con borde gris,
// ejes con grid, líneas de 0.7pt, puntos circulares de 1pt en cada mes,
// punto destacado en el último mes (mes del informe).
// Siempre trabaja con CANTIDADES, nunca con importes.
//
// Si la altura disponible no alcanza, salta de página automáticamente
// y repite el header de la sección.
// ============================================================
function dibujarGraficoEvolucion12M(
  doc: jsPDF,
  y: number,
  config: {
    titulo: string;
    sectionHeaderTitle: string;  // por si necesita repetir header al saltar página
    periodoLabel: string;
    meses: MesEvolucion[];
    series: SerieEvolucion[];
    sufijoLeyenda?: string;       // ej: "(Top 10 por cantidad)"
  }
): number {
  // ---- Validación defensiva ----
  if (!config.meses?.length || !config.series?.length) return y;

  // ---- Cálculo de altura total que va a ocupar el gráfico ----
  const numSeries = config.series.length;
  const filasLeyenda = Math.ceil(numSeries / 2);   // 2 columnas
  const altoLeyenda = filasLeyenda * 4 + 4;        // 4mm por fila + padding
  const altoGrafico = 70;                           // alto del área del chart
  const altoTotal = 7 + altoGrafico + altoLeyenda + 6;  // título + chart + leyenda + margen

  // ---- Salto de página si no entra ----
  if (y + altoTotal > 270) {
    doc.addPage();
    y = MARGIN.top;
    y = dibujarHeaderPagina(doc, y, config.sectionHeaderTitle, config.periodoLabel);
    y += 3;
  }

  // ---- Título del gráfico ----
  doc.setTextColor(...COLORS.textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const tituloCompleto = config.sufijoLeyenda
    ? `${config.titulo}  ${config.sufijoLeyenda}`
    : config.titulo;
  doc.text(tituloCompleto, MARGIN.left, y + 4);
  y += 7;

  // ---- Geometría del área de gráfico ----
  const chartX = MARGIN.left;
  const chartY = y;
  const chartW = CONTENT_WIDTH;
  const chartH = altoGrafico;

  // Padding interno (espacio para ejes)
  const padLeft = 14;     // espacio para etiquetas Y
  const padRight = 4;
  const padTop = 4;
  const padBottom = 10;   // espacio para etiquetas X

  const plotX = chartX + padLeft;
  const plotY = chartY + padTop;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  // ---- Caja de fondo ----
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.rect(chartX, chartY, chartW, chartH, 'FD');

  // ---- Cálculo de máximo Y (para escalar) ----
  let maxValor = 0;
  config.series.forEach(s => {
    s.serie.forEach(v => {
      if (v > maxValor) maxValor = v;
    });
  });
  // Pequeño margen visual arriba (10%)
  const yMax = maxValor > 0 ? Math.ceil(maxValor * 1.1) : 1;
  // Redondear a nice number para los ticks
  const yMaxRedondeado = redondearNice(yMax);

  // ---- Grid horizontal + etiquetas Y (5 ticks: 0, 25%, 50%, 75%, 100%) ----
  const numTicksY = 5;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMuted);
  doc.setDrawColor(230, 232, 236);  // gris muy clarito para grid
  doc.setLineWidth(0.15);

  for (let i = 0; i < numTicksY; i++) {
    const ratio = i / (numTicksY - 1);
    const yTick = plotY + plotH - (plotH * ratio);
    const valor = yMaxRedondeado * ratio;

    // Línea de grid
    if (i > 0) {
      doc.line(plotX, yTick, plotX + plotW, yTick);
    }
    // Etiqueta
    doc.text(fmtNumero(valor), plotX - 1.5, yTick + 1, { align: 'right' });
  }

  // ---- Eje X: etiquetas de meses ----
  const numMeses = config.meses.length;
  const stepX = numMeses > 1 ? plotW / (numMeses - 1) : 0;

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(6);
  config.meses.forEach((m, i) => {
    const xMes = plotX + stepX * i;
    doc.text(m.label, xMes, plotY + plotH + 4, { align: 'center' });
  });

  // ---- Línea base del eje X ----
  doc.setDrawColor(...COLORS.textMuted);
  doc.setLineWidth(0.3);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  // ---- Dibujar series (líneas + puntos) ----
  doc.setLineWidth(0.7);

  config.series.forEach((serie, sIdx) => {
    const color = SERIE_COLORS[sIdx % SERIE_COLORS.length];
    doc.setDrawColor(...color);
    doc.setFillColor(...color);

    // Trazar líneas conectando puntos
    let prevX: number | null = null;
    let prevY: number | null = null;

    serie.serie.forEach((valor, mIdx) => {
      const x = plotX + stepX * mIdx;
      const ratio = yMaxRedondeado > 0 ? valor / yMaxRedondeado : 0;
      const yPunto = plotY + plotH - (plotH * ratio);

      if (prevX !== null && prevY !== null) {
        doc.line(prevX, prevY, x, yPunto);
      }

      prevX = x;
      prevY = yPunto;
    });

    // Dibujar puntos al final (encima de las líneas)
    serie.serie.forEach((valor, mIdx) => {
      const x = plotX + stepX * mIdx;
      const ratio = yMaxRedondeado > 0 ? valor / yMaxRedondeado : 0;
      const yPunto = plotY + plotH - (plotH * ratio);

      const esUltimo = mIdx === serie.serie.length - 1;
      const radio = esUltimo ? 1.4 : 0.9;
      doc.circle(x, yPunto, radio, 'F');
    });
  });

  y = chartY + chartH + 3;

  // ---- Leyenda en 2 columnas ----
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textDark);

  const legColW = CONTENT_WIDTH / 2;
  const legX1 = MARGIN.left;
  const legX2 = MARGIN.left + legColW;

  config.series.forEach((serie, sIdx) => {
    const color = SERIE_COLORS[sIdx % SERIE_COLORS.length];
    const col = sIdx % 2;       // 0 izq, 1 der
    const row = Math.floor(sIdx / 2);
    const xCol = col === 0 ? legX1 : legX2;
    const yRow = y + row * 4;

    // Cuadrito de color
    doc.setFillColor(...color);
    doc.rect(xCol, yRow - 1.5, 2.5, 2.5, 'F');

    // Texto: nombre + total entre paréntesis
    const nombreCorto = serie.nombre.length > 32
      ? serie.nombre.substring(0, 30) + '…'
      : serie.nombre;
    doc.setTextColor(...COLORS.textDark);
    doc.text(`${nombreCorto}  (${fmtNumero(serie.total)})`, xCol + 4, yRow + 0.5);
  });

  y += filasLeyenda * 4 + 3;

  return y;
}

// ---- Utilidad: redondear un número a un valor "nice" para ticks ----
function redondearNice(valor: number): number {
  if (valor <= 0) return 1;
  const exp = Math.floor(Math.log10(valor));
  const base = Math.pow(10, exp);
  const mant = valor / base;
  let niceMant: number;
  if (mant <= 1) niceMant = 1;
  else if (mant <= 2) niceMant = 2;
  else if (mant <= 2.5) niceMant = 2.5;
  else if (mant <= 5) niceMant = 5;
  else niceMant = 10;
  return niceMant * base;
}


// ============================================================
// SECCIÓN: OBRAS SOCIALES × PRESTACIONES — MATRIZ CRUZADA
// ============================================================
// Tabla de doble entrada:
//   - Filas: TODAS las prácticas (ordenadas DESC por facturación)
//   - Columnas: Top 10 OS + "Otras" + columna "Total" al final
//   - Cada celda muestra cantidad arriba y monto abreviado abajo (2 líneas)
// Pagina automáticamente cada ~17 filas, repitiendo el header de tabla.
// ============================================================

// Formatea importes en formato compacto: $1.2M, $450K, $-
function fmtMonedaCorto(n: number): string {
  if (!n || n === 0) return '$-';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function dibujarSeccionCruceOSxPracticas(
  doc: jsPDF,
  periodoLabel: string,
  cruce: CruceOSxPracticas
): void {
  const FILAS_POR_PAGINA = 17;
  const totalPracticas = cruce.filasPracticas.length;
  const totalPaginas = Math.ceil(totalPracticas / FILAS_POR_PAGINA);

  // Cálculo de anchos
  // Layout: # (6mm) + Practica (44mm) + 10 OS + OTRAS + TOTAL = 12 cols numéricas
  // Total ancho 170mm — col práctica 44mm, # 6mm, sobran 120mm para 12 cols => 10mm cada una
  const colNumW = 10;
  const colHashW = 6;
  const colPracticaW = CONTENT_WIDTH - colHashW - colNumW * 12; // 50mm

  // Generar columnas (10 OS + OTRAS + TOTAL)
  const colsOS = cruce.columnasOS.map(c => ({ key: String(c.osId), label: c.sigla }));
  const cols: { key: string; label: string }[] = [
    ...colsOS,
    { key: 'OTRAS', label: 'Otras' },
    { key: '__TOTAL__', label: 'Total' },
  ];

  for (let pagina = 0; pagina < totalPaginas; pagina++) {
    doc.addPage();
    let yPos = MARGIN.top;
    yPos = dibujarHeaderPagina(
      doc,
      yPos,
      'OBRAS SOCIALES x PRESTACIONES',
      periodoLabel
    );

    // Subtítulo con info de paginación
    const inicio = pagina * FILAS_POR_PAGINA;
    const fin = Math.min(inicio + FILAS_POR_PAGINA, totalPracticas);
    const subtituloTabla = totalPaginas > 1
      ? `Matriz de Cantidades y Facturacion - ${periodoLabel} (${inicio + 1}-${fin} de ${totalPracticas} practicas)`
      : `Matriz de Cantidades y Facturacion - ${periodoLabel}`;

    doc.setTextColor(...COLORS.textDark);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(subtituloTabla, MARGIN.left, yPos + 4);
    yPos += 7;

    // Leyenda chiquita arriba a la derecha
    doc.setTextColor(...COLORS.textMuted);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text('Cant. arriba / Facturado abajo', MARGIN.left + CONTENT_WIDTH, yPos - 2, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // ====================
    // CABECERA DE TABLA (con OS rotadas 90° para que entren nombres completos)
    // ====================
    const headerH = 22; // más alto para etiquetas verticales
    let xCursor = MARGIN.left;

    // Fondo cabecera
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(MARGIN.left, yPos, CONTENT_WIDTH, headerH, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');

    // Col # 
    doc.setFontSize(7);
    doc.text('#', xCursor + colHashW / 2, yPos + headerH / 2 + 1, { align: 'center' });
    xCursor += colHashW;

    // Col Práctica
    doc.text('Practica', xCursor + 2, yPos + headerH / 2 + 1);
    xCursor += colPracticaW;

    // Cols OS / Otras / Total — rotadas 90° (anti-horario)
    doc.setFontSize(7);
    cols.forEach(c => {
      const lbl = c.label.length > 11 ? c.label.substring(0, 10) + '.' : c.label;
      // Texto rotado: x=centro de columna, y=parte inferior de la cabecera
      doc.text(lbl, xCursor + colNumW / 2 + 1.5, yPos + headerH - 2, { angle: 90 });
      xCursor += colNumW;
    });

    yPos += headerH;

    // ====================
    // FILAS
    // ====================
    const rowH = 9; // 2 líneas: cant + monto
    const filasPag = cruce.filasPracticas.slice(inicio, fin);

    filasPag.forEach((fila, i) => {
      const numAbs = inicio + i + 1;
      // Fondo alternado
      if (i % 2 === 1) {
        doc.setFillColor(...COLORS.tableBg);
        doc.rect(MARGIN.left, yPos, CONTENT_WIDTH, rowH, 'F');
      }

      xCursor = MARGIN.left;

      // # 
      doc.setTextColor(...COLORS.textMuted);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(String(numAbs), xCursor + colHashW / 2, yPos + 5.5, { align: 'center' });
      xCursor += colHashW;

      // Práctica
      doc.setTextColor(...COLORS.textDark);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      // Truncar si excede el ancho disponible
      const nombreMax = doc.splitTextToSize(fila.nomNombre || 'S/D', colPracticaW - 3)[0] || '';
      doc.text(nombreMax, xCursor + 2, yPos + 5.5);
      xCursor += colPracticaW;

      // Celdas numéricas (OS + Otras + Total)
      doc.setFont('helvetica', 'normal');
      cols.forEach(c => {
        let cant = 0, fact = 0;
        if (c.key === '__TOTAL__') {
          cant = fila.totalCantidad;
          fact = fila.totalFacturado;
        } else {
          const celda = fila.celdas[c.key];
          if (celda) {
            cant = celda.cantidad;
            fact = celda.facturado;
          }
        }

        const celdaCenter = xCursor + colNumW / 2;
        if (cant === 0) {
          // Celda vacía - guion centrado
          doc.setTextColor(...COLORS.textMuted);
          doc.setFontSize(7);
          doc.text('-', celdaCenter, yPos + 5.5, { align: 'center' });
        } else {
          // Línea 1: cantidad
          doc.setTextColor(...COLORS.textDark);
          doc.setFontSize(7);
          doc.setFont('helvetica', c.key === '__TOTAL__' ? 'bold' : 'normal');
          doc.text(fmtNumero(cant), celdaCenter, yPos + 4, { align: 'center' });

          // Línea 2: monto compacto
          doc.setTextColor(...(c.key === '__TOTAL__' ? COLORS.primary : COLORS.textMuted));
          doc.setFontSize(6);
          doc.setFont('helvetica', c.key === '__TOTAL__' ? 'bold' : 'normal');
          doc.text(fmtMonedaCorto(fact), celdaCenter, yPos + 7.5, { align: 'center' });
        }

        xCursor += colNumW;
      });

      // Línea inferior tenue de la fila
      doc.setDrawColor(...COLORS.border);
      doc.setLineWidth(0.1);
      doc.line(MARGIN.left, yPos + rowH, MARGIN.left + CONTENT_WIDTH, yPos + rowH);

      yPos += rowH;
    });

    // Borde izquierdo y derecho de toda la tabla
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.rect(
      MARGIN.left,
      yPos - rowH * filasPag.length - headerH,
      CONTENT_WIDTH,
      rowH * filasPag.length + headerH
    );

    // ====================
    // FOOTER de la tabla con totales (solo en última página)
    // ====================
    if (pagina === totalPaginas - 1) {
      // Calcular totales por columna
      const totalesCol: { [key: string]: { cantidad: number; facturado: number } } = {};
      cols.forEach(c => {
        totalesCol[c.key] = { cantidad: 0, facturado: 0 };
      });
      let granCant = 0, granFact = 0;

      cruce.filasPracticas.forEach(fila => {
        cols.forEach(c => {
          if (c.key === '__TOTAL__') {
            totalesCol[c.key].cantidad += fila.totalCantidad;
            totalesCol[c.key].facturado += fila.totalFacturado;
          } else {
            const celda = fila.celdas[c.key];
            if (celda) {
              totalesCol[c.key].cantidad += celda.cantidad;
              totalesCol[c.key].facturado += celda.facturado;
            }
          }
        });
        granCant += fila.totalCantidad;
        granFact += fila.totalFacturado;
      });

      // Fila de totales
      doc.setFillColor(...COLORS.lightBg);
      doc.rect(MARGIN.left, yPos, CONTENT_WIDTH, rowH, 'F');

      xCursor = MARGIN.left;
      doc.setTextColor(...COLORS.primaryDark);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('', xCursor + colHashW / 2, yPos + 5.5, { align: 'center' });
      xCursor += colHashW;

      doc.text('TOTALES', xCursor + 2, yPos + 5.5);
      xCursor += colPracticaW;

      cols.forEach(c => {
        const t = totalesCol[c.key];
        const celdaCenter = xCursor + colNumW / 2;
        if (t.cantidad === 0) {
          doc.setTextColor(...COLORS.textMuted);
          doc.setFontSize(7);
          doc.text('-', celdaCenter, yPos + 5.5, { align: 'center' });
        } else {
          doc.setTextColor(...COLORS.primaryDark);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.text(fmtNumero(t.cantidad), celdaCenter, yPos + 4, { align: 'center' });

          doc.setFontSize(6);
          doc.text(fmtMonedaCorto(t.facturado), celdaCenter, yPos + 7.5, { align: 'center' });
        }
        xCursor += colNumW;
      });

      // Borde superior y completo del row de totales
      doc.setDrawColor(...COLORS.primary);
      doc.setLineWidth(0.4);
      doc.line(MARGIN.left, yPos, MARGIN.left + CONTENT_WIDTH, yPos);
      doc.line(MARGIN.left, yPos + rowH, MARGIN.left + CONTENT_WIDTH, yPos + rowH);
    }
  }
}


function dibujarFooterPagina(doc: jsPDF, pagina: number, total: number): void {
  const y = 290;

  // Línea separadora
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN.left, y - 5, MARGIN.left + CONTENT_WIDTH, y - 5);

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');

  // Izquierda: instituto
  doc.text('Instituto Dr. Mercado - Informe de Gestion', MARGIN.left, y);

  // Centro: página
  doc.text(`Pagina ${pagina} de ${total}`, 105, y, { align: 'center' });

  // Derecha: desarrollador
  doc.text('P. Fama | Desarrollo', MARGIN.left + CONTENT_WIDTH, y, { align: 'right' });
}
