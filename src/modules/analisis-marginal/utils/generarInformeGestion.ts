// ============================================
// GENERADOR DE INFORME DE GESTIÃ“N MENSUAL - PDF
// Instituto Dr. Mercado â€” v2.0
// ============================================
// RUTA DESTINO: src/utils/generarInformeGestion.ts
// ============================================
// v2.0: Portada print-friendly, fix nombres CF,
//       punto de equilibrio, conclusiones ampliadas
// ============================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================
// TIPOS
// ============================================

export interface DatosMes {
  facturado: number;
  honorarios: number;
  costoPools: number;
  costoInsumos: number;
  costoTotal: number;
  margenContrib: number;
  margenContribPct: number;
  costosFijos: number;
  resultadoOp: number;
  resultadoOpPct: number;
  cantidad: number;
  ticketPromedio: number;
  prestadoresActivos: number;
  obrasSocialesActivas: number;
  segmentos: {
    Consultas: { cantidad: number; facturado: number; costos: number; margenPct: number };
    Estudios: { cantidad: number; facturado: number; costos: number; margenPct: number };
    Cirugias: { cantidad: number; facturado: number; costos: number; margenPct: number };
  };
  prestadores: {
    nombre: string; esSocio: boolean;
    cantidad: number; facturado: number; honorarios: number;
    pools: number; insumos: number; mc: number; mcPct: number; ro: number; roPct: number;
  }[];
  topPrestaciones: {
    nombre: string; segmento: string; cantidad: number; facturado: number;
    honorarios: number; pools: number; insumos: number;
    mc: number; mcPct: number;
  }[];
  topObrasSociales: {
    sigla: string; nombre: string; cantidad: number; facturado: number;
    mc: number; mcPct: number;
  }[];
  // Acepta ambos formatos de campo (nombre O categoria_nombre)
  costosFijosDetalle: { nombre?: string; categoria_nombre?: string; color?: string; categoria_color?: string; total: number; porcentaje: number }[];
}

export interface DatosInforme {
  anio: number;
  mes: number;
  actual: DatosMes;
  anterior: DatosMes | null;
}

// ============================================
// CONSTANTES
// ============================================

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const C = {
  primary: [30, 64, 175] as [number, number, number],
  primaryLight: [219, 234, 254] as [number, number, number],
  dark: [31, 41, 55] as [number, number, number],
  medium: [107, 114, 128] as [number, number, number],
  light: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  amber: [217, 119, 6] as [number, number, number],
  cyan: [8, 145, 178] as [number, number, number],
  tableAlt: [248, 250, 252] as [number, number, number],
};

const PW = 210; // A4
const PH = 297;
const M = 18;
const CW = PW - M * 2;

// ============================================
// HELPERS
// ============================================

const fmt = (n: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtNum = (n: number): string => new Intl.NumberFormat('es-AR').format(Math.round(n));
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

const vari = (actual: number, anterior: number) => {
  if (anterior === 0) return { valor: 0, texto: 'N/A', pos: true };
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100;
  return { valor: pct, texto: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, pos: pct >= 0 };
};

const varPP = (a: number, b: number): string => { const d = a - b; return `${d >= 0 ? '+' : ''}${d.toFixed(1)} pp`; };

// Extrae nombre de categorÃ­a (acepta ambos formatos)
const getCFName = (cf: any): string => cf.nombre || cf.categoria_nombre || 'Sin categorÃ­a';

// Fuerza alineaciÃ³n de headers para que coincidan con los datos
type HAlign = 'left' | 'center' | 'right';
const alinear = (d: any, aligns: Record<number, HAlign>) => {
  if (d.section === 'head') {
    const a = aligns[d.column.index];
    if (a) d.cell.styles.halign = a;
  }
};

// ============================================
// NARRATIVA
// ============================================

function narResumen(d: DatosInforme): string {
  const { actual: a, anterior: ant } = d;
  const mes = MESES[d.mes - 1];
  let t = '';

  if (!ant) {
    t += `En ${mes} ${d.anio}, el Instituto Dr. Mercado registrÃ³ una facturaciÃ³n total de ${fmt(a.facturado)} `;
    t += `con ${fmtNum(a.cantidad)} prestaciones realizadas, generando un ticket promedio de ${fmt(a.ticketPromedio)}. `;
    t += `El margen de contribuciÃ³n alcanzÃ³ el ${fmtPct(a.margenContribPct)}, y tras distribuir los costos fijos `;
    t += `(${fmt(a.costosFijos)}/mes), el resultado operativo se ubicÃ³ en ${fmtPct(a.resultadoOpPct)}.`;
    return t;
  }

  const vF = vari(a.facturado, ant.facturado);
  const vC = vari(a.cantidad, ant.cantidad);

  t += `En ${mes} ${d.anio}, el Instituto Dr. Mercado facturÃ³ ${fmt(a.facturado)}, `;
  t += vF.pos
    ? `lo que representa un crecimiento del ${vF.texto} respecto al mes anterior. `
    : `registrando una contracciÃ³n del ${vF.texto} respecto al mes anterior. `;
  t += `Se realizaron ${fmtNum(a.cantidad)} prestaciones (${vC.texto}), con un ticket promedio de ${fmt(a.ticketPromedio)}. `;

  const dMC = a.margenContribPct - ant.margenContribPct;
  if (Math.abs(dMC) > 2) {
    t += dMC > 0
      ? `El margen de contribuciÃ³n mejorÃ³ ${dMC.toFixed(1)} puntos porcentuales, alcanzando ${fmtPct(a.margenContribPct)}. `
      : `El margen de contribuciÃ³n se contrajo ${Math.abs(dMC).toFixed(1)} puntos porcentuales, ubicÃ¡ndose en ${fmtPct(a.margenContribPct)}. `;
  } else {
    t += `El margen de contribuciÃ³n se mantuvo estable en ${fmtPct(a.margenContribPct)}. `;
  }

  t += `El resultado operativo, tras distribuir costos fijos por ${fmt(a.costosFijos)}/mes, `;
  t += a.resultadoOpPct > 20
    ? `se ubicÃ³ en un saludable ${fmtPct(a.resultadoOpPct)}.`
    : a.resultadoOpPct > 0
      ? `se ubicÃ³ en ${fmtPct(a.resultadoOpPct)}, un nivel que requiere monitoreo.`
      : `resultÃ³ negativo en ${fmtPct(a.resultadoOpPct)}, lo que indica que la operaciÃ³n no cubriÃ³ los costos fijos del perÃ­odo.`;

  return t;
}

function narSegmentos(d: DatosInforme): string {
  const { actual: a } = d;
  const s = a.segmentos;
  let t = '';

  const maxF = Math.max(s.Consultas.facturado, s.Estudios.facturado, s.Cirugias.facturado);
  const dom = maxF === s.Cirugias.facturado ? 'CirugÃ­as' : maxF === s.Estudios.facturado ? 'Estudios' : 'Consultas';
  t += `El segmento de ${dom} concentra el ${fmtPct((maxF / a.facturado) * 100)} de la facturaciÃ³n. `;

  if (s.Cirugias.facturado > 0) {
    t += `Las cirugÃ­as, con ${s.Cirugias.cantidad} intervenciones y un ticket promedio de ${fmt(s.Cirugias.facturado / Math.max(s.Cirugias.cantidad, 1))}, `;
    t += `presentan un margen del ${fmtPct(s.Cirugias.margenPct)}. `;
  }
  if (s.Estudios.facturado > 0) t += `Los estudios diagnÃ³sticos (${fmtNum(s.Estudios.cantidad)} prestaciones) operan con un margen del ${fmtPct(s.Estudios.margenPct)}. `;
  if (s.Consultas.facturado > 0) t += `Las consultas (${fmtNum(s.Consultas.cantidad)}) mantienen un margen del ${fmtPct(s.Consultas.margenPct)}.`;

  return t;
}

function generarConclusiones(d: DatosInforme): string[] {
  const { actual: a, anterior: ant } = d;
  const cc: string[] = [];

  // 1. RO
  if (a.resultadoOpPct > 25) cc.push('La clÃ­nica presenta una posiciÃ³n financiera sÃ³lida con resultado operativo superior al 25%, lo que permite considerar inversiones en equipamiento o ampliaciÃ³n de servicios.');
  else if (a.resultadoOpPct > 10) cc.push('El resultado operativo es positivo pero moderado. Se recomienda monitorear la evoluciÃ³n de costos fijos y evaluar oportunidades de mejora en el pricing de prestaciones de bajo margen.');
  else if (a.resultadoOpPct > 0) cc.push('El resultado operativo es ajustado. Es prioritario revisar la estructura de costos fijos e identificar prestaciones que no estÃ¡n contribuyendo adecuadamente a su cobertura.');
  else cc.push('El resultado operativo negativo indica que la facturaciÃ³n no cubre la totalidad de los costos. Se requieren medidas correctivas urgentes: revisiÃ³n de aranceles, renegociaciÃ³n con obras sociales, y optimizaciÃ³n de costos.');

  // 2. ConcentraciÃ³n OS
  if (a.topObrasSociales.length > 0) {
    const topOS = a.topObrasSociales[0];
    const concPct = (topOS.facturado / a.facturado) * 100;
    if (concPct > 35) cc.push(`La concentraciÃ³n del ${fmtPct(concPct)} de la facturaciÃ³n en ${topOS.sigla} representa un riesgo de dependencia. Se recomienda diversificar la cartera de financiadores y fortalecer la relaciÃ³n comercial con obras sociales de menor participaciÃ³n.`);
  }

  // 3. EvoluciÃ³n CF
  if (ant) {
    const vCF = vari(a.costosFijos, ant.costosFijos);
    if (!vCF.pos || Math.abs(vCF.valor) > 10) {
      cc.push(`Los costos fijos ${vCF.pos ? 'aumentaron' : 'disminuyeron'} un ${Math.abs(vCF.valor).toFixed(1)}% respecto al mes anterior. ${vCF.pos ? 'Se recomienda analizar las categorÃ­as de mayor incremento para evaluar si se trata de un ajuste estructural o un gasto extraordinario.' : 'La reducciÃ³n refleja una mejora en la eficiencia operativa.'}`);
    }
  }

  // 4. Productividad
  if (a.prestadoresActivos > 0) {
    const prod = a.cantidad / a.prestadoresActivos;
    if (prod > 300) cc.push(`La productividad de ${Math.round(prod)} prestaciones por profesional es elevada. Evaluar la posibilidad de incorporar recurso humano para mantener la calidad de atenciÃ³n.`);
  }

  // 5. FacturaciÃ³n
  if (ant) {
    const vF = vari(a.facturado, ant.facturado);
    if (!vF.pos && Math.abs(vF.valor) > 10) cc.push(`La caÃ­da del ${Math.abs(vF.valor).toFixed(0)}% en facturaciÃ³n respecto al mes anterior requiere anÃ¡lisis de causas: estacionalidad, pÃ©rdida de convenios, o reducciÃ³n de demanda.`);
    if (vF.pos && vF.valor > 10) cc.push(`El crecimiento del ${vF.valor.toFixed(1)}% en facturaciÃ³n es un indicador positivo. Se recomienda verificar si es sostenible o responde a factores puntuales.`);
  }

  // 6. CF weight
  const cfW = (a.costosFijos / a.facturado) * 100;
  if (cfW > 25) cc.push(`Los costos fijos representan el ${fmtPct(cfW)} de la facturaciÃ³n. Se recomienda revisar la estructura para identificar posibles eficiencias, especialmente en las categorÃ­as de mayor peso.`);

  // 7. Segmentos
  const bestSeg = [a.segmentos.Consultas, a.segmentos.Estudios, a.segmentos.Cirugias];
  const names = ['Consultas', 'Estudios', 'CirugÃ­as'];
  const worstIdx = bestSeg.reduce((mi, s, i) => s.margenPct < bestSeg[mi].margenPct ? i : mi, 0);
  if (bestSeg[worstIdx].margenPct < 40 && bestSeg[worstIdx].facturado > 0) {
    cc.push(`El segmento de ${names[worstIdx]} presenta el margen mÃ¡s bajo (${fmtPct(bestSeg[worstIdx].margenPct)}). Se sugiere revisar el pricing y la estructura de costos de este tipo de prestaciones.`);
  }

  return cc;
}

// ============================================
// GENERADOR PDF PRINCIPAL
// ============================================

export function generarInformeGestionPDF(datos: DatosInforme): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const { actual: a, anterior: ant } = datos;
  const mesNombre = MESES[datos.mes - 1];
  let pageNum = 0;

  // â”€â”€ HELPERS LAYOUT â”€â”€
  const addHeader = (titulo: string) => {
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PW, 22, 'F');
    doc.setTextColor(...C.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Instituto Dr. Mercado', M, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Informe de GestiÃ³n â€” ${mesNombre} ${datos.anio}`, M, 15);
    doc.text(titulo, PW - M, 12, { align: 'right' });
  };

  const addFooter = () => {
    pageNum++;
    doc.setDrawColor(200, 200, 200);
    doc.line(M, PH - 14, PW - M, PH - 14);
    doc.setFontSize(7);
    doc.setTextColor(...C.medium);
    doc.text('Documento confidencial â€” Instituto Dr. Mercado / SurvisiÃ³n S.A.', M, PH - 9);
    doc.text(`PÃ¡gina ${pageNum}`, PW - M, PH - 9, { align: 'right' });
  };

  const addSection = (y: number, titulo: string): number => {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(titulo, M, y);
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(0.5);
    doc.line(M, y + 2, M + CW, y + 2);
    return y + 9;
  };

  const addNarrativa = (y: number, texto: string): number => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.dark);
    const lines = doc.splitTextToSize(texto, CW);
    doc.text(lines, M, y);
    return y + lines.length * 4.2 + 3;
  };

  const addKPI = (x: number, y: number, w: number, label: string, valor: string, varTxt?: string, pos?: boolean) => {
    doc.setFillColor(...C.light);
    doc.roundedRect(x, y, w, 18, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...C.medium);
    doc.text(label, x + 3, y + 5);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.dark);
    doc.text(valor, x + 3, y + 13);
    if (varTxt) {
      doc.setFontSize(7);
      const col = pos ? C.green : C.red;
      doc.setTextColor(col[0], col[1], col[2]);
      doc.text(varTxt, x + w - 3, y + 13, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal');
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 1: CARÃTULA (print-friendly)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Fondo blanco con franja azul superior
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PW, 6, 'F');

  // LÃ­nea decorativa
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(1);
  doc.line(M, 50, PW - M, 50);

  // Instituto
  doc.setTextColor(...C.medium);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('INSTITUTO', PW / 2, 70, { align: 'center' });

  doc.setTextColor(...C.primary);
  doc.setFontSize(30);
  doc.setFont('helvetica', 'bold');
  doc.text('Dr. Mercado', PW / 2, 85, { align: 'center' });

  // LÃ­nea
  doc.setLineWidth(0.5);
  doc.line(PW / 2 - 35, 93, PW / 2 + 35, 93);

  // TÃ­tulo
  doc.setTextColor(...C.dark);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Informe de GestiÃ³n', PW / 2, 115, { align: 'center' });

  doc.setTextColor(...C.primary);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.text(`${mesNombre} ${datos.anio}`, PW / 2, 128, { align: 'center' });

  // Recuadro de KPIs en la portada
  const boxY = 150;
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.3);
  doc.roundedRect(M + 10, boxY, CW - 20, 50, 3, 3, 'S');

  // KPIs portada
  const colW = (CW - 20) / 3;

  doc.setFontSize(8); doc.setTextColor(...C.medium); doc.setFont('helvetica', 'normal');
  doc.text('FacturaciÃ³n', M + 10 + colW * 0.5, boxY + 12, { align: 'center' });
  doc.setFontSize(15); doc.setTextColor(...C.dark); doc.setFont('helvetica', 'bold');
  doc.text(fmt(a.facturado), M + 10 + colW * 0.5, boxY + 24, { align: 'center' });

  doc.setFontSize(8); doc.setTextColor(...C.medium); doc.setFont('helvetica', 'normal');
  doc.text('Margen ContribuciÃ³n', M + 10 + colW * 1.5, boxY + 12, { align: 'center' });
  doc.setFontSize(15); doc.setTextColor(...C.dark); doc.setFont('helvetica', 'bold');
  doc.text(fmtPct(a.margenContribPct), M + 10 + colW * 1.5, boxY + 24, { align: 'center' });

  doc.setFontSize(8); doc.setTextColor(...C.medium); doc.setFont('helvetica', 'normal');
  doc.text('Resultado Operativo', M + 10 + colW * 2.5, boxY + 12, { align: 'center' });
  doc.setFontSize(15);
  const roCol = a.resultadoOpPct > 20 ? C.green : a.resultadoOpPct > 0 ? C.amber : C.red;
  doc.setTextColor(roCol[0], roCol[1], roCol[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtPct(a.resultadoOpPct), M + 10 + colW * 2.5, boxY + 24, { align: 'center' });

  // Prestaciones y ticket
  doc.setFontSize(8); doc.setTextColor(...C.medium); doc.setFont('helvetica', 'normal');
  doc.text(`${fmtNum(a.cantidad)} prestaciones  Â·  Ticket promedio ${fmt(a.ticketPromedio)}`, PW / 2, boxY + 40, { align: 'center' });

  // Footer portada
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.5);
  doc.line(M, 235, PW - M, 235);

  doc.setFontSize(8); doc.setTextColor(...C.medium);
  doc.text('DOCUMENTO CONFIDENCIAL', PW / 2, 245, { align: 'center' });
  doc.setFontSize(7);
  doc.text('SurvisiÃ³n S.A. â€” Sistema Integral de GestiÃ³n', PW / 2, 251, { align: 'center' });
  doc.text(`Emitido: ${new Date().toLocaleDateString('es-AR')}`, PW / 2, 257, { align: 'center' });

  // Franja azul inferior
  doc.setFillColor(...C.primary);
  doc.rect(0, PH - 6, PW, 6, 'F');

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 2: RESUMEN EJECUTIVO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage();
  addHeader('Resumen Ejecutivo'); addFooter();
  let y = 32;
  y = addSection(y, '1. Resumen Ejecutivo');
  y = addNarrativa(y, narResumen(datos));
  y += 3;

  // KPI cards
  const kW = (CW - 9) / 4;
  const vF = ant ? vari(a.facturado, ant.facturado) : null;
  const vCa = ant ? vari(a.cantidad, ant.cantidad) : null;
  const vTk = ant ? vari(a.ticketPromedio, ant.ticketPromedio) : null;
  const vHo = ant ? vari(a.honorarios, ant.honorarios) : null;

  addKPI(M, y, kW, 'FACTURADO', fmt(a.facturado), vF?.texto, vF?.pos);
  addKPI(M + kW + 3, y, kW, 'PRESTACIONES', fmtNum(a.cantidad), vCa?.texto, vCa?.pos);
  addKPI(M + (kW + 3) * 2, y, kW, 'TICKET PROMEDIO', fmt(a.ticketPromedio), vTk?.texto, vTk?.pos);
  addKPI(M + (kW + 3) * 3, y, kW, 'HONORARIOS', fmt(a.honorarios), vHo?.texto, vHo?.pos);
  y += 24;

  const vMC = ant ? { t: varPP(a.margenContribPct, ant.margenContribPct), p: a.margenContribPct >= ant.margenContribPct } : null;
  const vRO = ant ? { t: varPP(a.resultadoOpPct, ant.resultadoOpPct), p: a.resultadoOpPct >= ant.resultadoOpPct } : null;
  const vCF = ant ? vari(a.costosFijos, ant.costosFijos) : null;

  addKPI(M, y, kW, 'MARGEN CONTRIB.', fmtPct(a.margenContribPct), vMC?.t, vMC?.p);
  addKPI(M + kW + 3, y, kW, 'COSTOS FIJOS', fmt(a.costosFijos), vCF?.texto, !vCF?.pos);
  addKPI(M + (kW + 3) * 2, y, kW, 'RES. OPERATIVO', fmtPct(a.resultadoOpPct), vRO?.t, vRO?.p);
  addKPI(M + (kW + 3) * 3, y, kW, 'PRESTADORES', `${a.prestadoresActivos} activos`);
  y += 28;

  // Comparativo
  if (ant) {
    y = addSection(y, '2. Comparativo Mensual');
    const mesAntNombre = MESES[(datos.mes - 2 + 12) % 12];
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [['Indicador', mesAntNombre, mesNombre, 'VariaciÃ³n']],
      body: [
        ['Facturado', fmt(ant.facturado), fmt(a.facturado), vari(a.facturado, ant.facturado).texto],
        ['Prestaciones', fmtNum(ant.cantidad), fmtNum(a.cantidad), vari(a.cantidad, ant.cantidad).texto],
        ['Ticket Promedio', fmt(ant.ticketPromedio), fmt(a.ticketPromedio), vari(a.ticketPromedio, ant.ticketPromedio).texto],
        ['Honorarios', fmt(ant.honorarios), fmt(a.honorarios), vari(a.honorarios, ant.honorarios).texto],
        ['Pools + Insumos', fmt(ant.costoPools + ant.costoInsumos), fmt(a.costoPools + a.costoInsumos), vari(a.costoPools + a.costoInsumos, ant.costoPools + ant.costoInsumos).texto],
        ['Margen Contrib. %', fmtPct(ant.margenContribPct), fmtPct(a.margenContribPct), varPP(a.margenContribPct, ant.margenContribPct)],
        ['Costos Fijos', fmt(ant.costosFijos), fmt(a.costosFijos), vari(a.costosFijos, ant.costosFijos).texto],
        ['Res. Operativo %', fmtPct(ant.resultadoOpPct), fmtPct(a.resultadoOpPct), varPP(a.resultadoOpPct, ant.resultadoOpPct)],
      ],
      headStyles: { fillColor: C.primary, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, halign: 'left' }, 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 40 }, 3: { halign: 'right', cellWidth: 35 } },
      alternateRowStyles: { fillColor: C.tableAlt },
      didParseCell: (d: any) => { alinear(d, { 0: 'left', 1: 'right', 2: 'right', 3: 'right' }); },
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 3: SEGMENTOS + TOP PRESTACIONES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage(); addHeader('Actividad Operativa'); addFooter();
  y = 32;
  y = addSection(y, '3. Actividad por Segmento');
  y = addNarrativa(y, narSegmentos(datos));
  y += 2;

  const segRows: any[][] = [];
  (['Consultas', 'Estudios', 'Cirugias'] as const).forEach(seg => {
    const s = a.segmentos[seg];
    segRows.push([seg === 'Cirugias' ? 'CirugÃ­as' : seg, fmtNum(s.cantidad), fmt(s.facturado), fmtPct(a.facturado > 0 ? s.facturado / a.facturado * 100 : 0), fmt(s.cantidad > 0 ? s.facturado / s.cantidad : 0), fmtPct(s.margenPct)]);
  });
  segRows.push(['TOTAL', fmtNum(a.cantidad), fmt(a.facturado), '100%', fmt(a.ticketPromedio), fmtPct(a.margenContribPct)]);

  autoTable(doc, { startY: y, margin: { left: M, right: M }, head: [['Segmento', 'Cantidad', 'Facturado', '% Fact.', 'Ticket Prom.', 'MC %']], body: segRows,
    headStyles: { fillColor: C.primary, fontSize: 8, fontStyle: 'bold' }, bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 1: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 38 }, 3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 38 }, 5: { halign: 'right', cellWidth: 18 } },
    didParseCell: (d: any) => { alinear(d, { 0: 'left', 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right' }); if (d.row.index === segRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = C.primaryLight; } },
  });

  y = (doc as any).lastAutoTable.finalY + 10;
  y = addSection(y, '4. Top Prestaciones por FacturaciÃ³n');

  autoTable(doc, { startY: y, margin: { left: M, right: M },
    head: [['#', 'PrestaciÃ³n', 'Seg.', 'Cant.', 'Facturado', 'MC %']],
    body: a.topPrestaciones.slice(0, 10).map((p, i) => [`${i + 1}`, p.nombre.length > 45 ? p.nombre.substring(0, 42) + '...' : p.nombre, p.segmento, fmtNum(p.cantidad), fmt(p.facturado), fmtPct(p.mcPct)]),
    headStyles: { fillColor: C.primary, fontSize: 7, fontStyle: 'bold' }, bodyStyles: { fontSize: 7 },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 65 }, 2: { cellWidth: 20 }, 3: { cellWidth: 15, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' }, 5: { cellWidth: 18, halign: 'right' } },
    alternateRowStyles: { fillColor: C.tableAlt },
    didParseCell: (d: any) => { alinear(d, { 0: 'center', 1: 'left', 2: 'left', 3: 'right', 4: 'right', 5: 'right' }); },
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 4: PRESTADORES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage(); addHeader('AnÃ¡lisis por Prestador'); addFooter();
  y = 32;
  y = addSection(y, '5. Rentabilidad por Prestador');

  const preRows = a.prestadores.sort((x, z) => z.facturado - x.facturado)
    .map(p => [p.nombre + (p.esSocio ? ' *' : ''), fmtNum(p.cantidad), fmt(p.facturado), fmt(p.honorarios), fmt(p.mc), fmtPct(p.mcPct), fmt(p.ro), fmtPct(p.roPct)]);

  const totP = a.prestadores.reduce((ac, p) => ({ c: ac.c + p.cantidad, f: ac.f + p.facturado, h: ac.h + p.honorarios, m: ac.m + p.mc, r: ac.r + p.ro }), { c: 0, f: 0, h: 0, m: 0, r: 0 });
  preRows.push(['TOTAL', fmtNum(totP.c), fmt(totP.f), fmt(totP.h), fmt(totP.m), fmtPct(totP.f > 0 ? (totP.m / totP.f) * 100 : 0), fmt(totP.r), fmtPct(totP.f > 0 ? (totP.r / totP.f) * 100 : 0)]);

  autoTable(doc, { startY: y, margin: { left: M, right: M },
    head: [['Prestador', 'Cant.', 'Facturado', 'Honorarios', 'M.Contrib.', 'MC%', 'Res.Op.', 'RO%']],
    body: preRows,
    headStyles: { fillColor: C.primary, fontSize: 7, fontStyle: 'bold' }, bodyStyles: { fontSize: 7 },
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 14, halign: 'right' }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 24, halign: 'right' }, 7: { cellWidth: 14, halign: 'right' } },
    alternateRowStyles: { fillColor: C.tableAlt },
    didParseCell: (d: any) => { alinear(d, { 0: 'left', 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right', 6: 'right', 7: 'right' }); if (d.row.index === preRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = C.primaryLight; } },
  });
  y = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(7); doc.setTextColor(...C.medium); doc.text('* Socio de la instituciÃ³n', M, y);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 5: OBRAS SOCIALES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage(); addHeader('Obras Sociales'); addFooter();
  y = 32;
  y = addSection(y, '6. Top Obras Sociales por FacturaciÃ³n');

  autoTable(doc, { startY: y, margin: { left: M, right: M },
    head: [['#', 'Obra Social', 'Cant.', 'Facturado', '% Conc.', 'MC %']],
    body: a.topObrasSociales.slice(0, 15).map((os, i) => [`${i + 1}`, os.sigla, fmtNum(os.cantidad), fmt(os.facturado), fmtPct(a.facturado > 0 ? os.facturado / a.facturado * 100 : 0), fmtPct(os.mcPct)]),
    headStyles: { fillColor: C.primary, fontSize: 7, fontStyle: 'bold' }, bodyStyles: { fontSize: 7 },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 40 }, 2: { cellWidth: 20, halign: 'right' }, 3: { cellWidth: 35, halign: 'right' }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 20, halign: 'right' } },
    alternateRowStyles: { fillColor: C.tableAlt },
    didParseCell: (d: any) => { alinear(d, { 0: 'center', 1: 'left', 2: 'right', 3: 'right', 4: 'right', 5: 'right' }); },
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  if (a.topObrasSociales.length >= 3) {
    const t3F = a.topObrasSociales.slice(0, 3).reduce((s, os) => s + os.facturado, 0);
    const t3P = (t3F / a.facturado) * 100;
    y = addNarrativa(y, `Las tres principales obras sociales (${a.topObrasSociales.slice(0, 3).map(o => o.sigla).join(', ')}) concentran el ${fmtPct(t3P)} de la facturaciÃ³n total. ${t3P > 70 ? 'Este nivel de concentraciÃ³n representa un riesgo significativo de dependencia.' : t3P > 50 ? 'La concentraciÃ³n es moderada, pero se recomienda diversificar.' : 'La diversificaciÃ³n es adecuada.'}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 6: COSTOS + PUNTO DE EQUILIBRIO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage(); addHeader('Estructura de Costos'); addFooter();
  y = 32;
  y = addSection(y, '7. Estructura de Costos Fijos');

  const cfRows = a.costosFijosDetalle.sort((x, z) => z.total - x.total).map(cf => [getCFName(cf), fmt(cf.total), fmtPct(cf.porcentaje)]);
  cfRows.push(['TOTAL COSTOS FIJOS', fmt(a.costosFijos), '100%']);

  autoTable(doc, { startY: y, margin: { left: M, right: M },
    head: [['CategorÃ­a', 'Promedio Mensual', '% del Total']],
    body: cfRows,
    headStyles: { fillColor: C.primary, fontSize: 8, fontStyle: 'bold' }, bodyStyles: { fontSize: 8, textColor: C.dark },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 45, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' } },
    alternateRowStyles: { fillColor: C.tableAlt },
    didParseCell: (d: any) => { alinear(d, { 0: 'left', 1: 'right', 2: 'right' }); if (d.row.index === cfRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = C.primaryLight; } },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Verificar espacio para CV + PE (~150mm)
  if (y > 150) {
    doc.addPage(); addHeader('Estructura de Costos (cont.)'); addFooter();
    y = 32;
  }

  y = addSection(y, '8. Costos Variables');

  const cvRows = [
    ['Honorarios Profesionales', fmt(a.honorarios), fmtPct(a.facturado > 0 ? (a.honorarios / a.facturado) * 100 : 0)],
    ['Pools de Insumos', fmt(a.costoPools), fmtPct(a.facturado > 0 ? (a.costoPools / a.facturado) * 100 : 0)],
    ['Insumos Directos', fmt(a.costoInsumos), fmtPct(a.facturado > 0 ? (a.costoInsumos / a.facturado) * 100 : 0)],
    ['TOTAL COSTOS VARIABLES', fmt(a.costoTotal), fmtPct(a.facturado > 0 ? (a.costoTotal / a.facturado) * 100 : 0)],
  ];

  autoTable(doc, { startY: y, margin: { left: M, right: M },
    head: [['Concepto', 'Monto', '% s/Facturado']],
    body: cvRows,
    headStyles: { fillColor: C.cyan, fontSize: 8, fontStyle: 'bold' }, bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { cellWidth: 45, halign: 'right' }, 2: { cellWidth: 30, halign: 'right' } },
    didParseCell: (d: any) => { alinear(d, { 0: 'left', 1: 'right', 2: 'right' }); if (d.row.index === cvRows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [207, 250, 254]; } },
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA DEDICADA: PUNTO DE EQUILIBRIO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage(); addHeader('Punto de Equilibrio'); addFooter();
  y = 32;
  y = addSection(y, '9. Punto de Equilibrio');

  // PE calculations
  const mcRatio = a.margenContribPct / 100;
  const cvRatio = 1 - mcRatio;
  const puntoEquilibrio = mcRatio > 0 ? a.costosFijos / mcRatio : 0;
  const margenSeguridad = a.facturado - puntoEquilibrio;
  const margenSeguridadPct = a.facturado > 0 ? (margenSeguridad / a.facturado) * 100 : 0;
  const pePrestaciones = a.ticketPromedio > 0 ? puntoEquilibrio / a.ticketPromedio : 0;

  // â”€â”€ GRÃFICO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const chX = M + 18;       // left (room for Y labels)
  const chY = y + 2;        // top
  const chW = 145;           // width
  const chH = 88;            // height
  const chB = chY + chH;     // bottom
  const chR = chX + chW;     // right

  // Scale
  const maxVal = Math.max(a.facturado * 1.25, puntoEquilibrio * 1.6);
  const scX = (v: number) => chX + (v / maxVal) * chW;
  const scY = (v: number) => chB - (v / maxVal) * chH;

  // Background
  doc.setFillColor(250, 251, 252);
  doc.roundedRect(chX - 1, chY - 1, chW + 2, chH + 2, 1, 1, 'F');

  // Grid lines (horizontal)
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.15);
  const gridSteps = 5;
  for (let i = 1; i <= gridSteps; i++) {
    const gVal = (maxVal / gridSteps) * i;
    const gy = scY(gVal);
    doc.line(chX, gy, chR, gy);
    // Y-axis label
    doc.setFontSize(6);
    doc.setTextColor(160, 160, 160);
    const label = gVal >= 1000000 ? `$${(gVal / 1000000).toFixed(0)}M` : `$${(gVal / 1000).toFixed(0)}K`;
    doc.text(label, chX - 2, gy + 1, { align: 'right' });
  }
  // Grid lines (vertical)
  for (let i = 1; i <= gridSteps; i++) {
    const gVal = (maxVal / gridSteps) * i;
    const gx = scX(gVal);
    doc.line(gx, chY, gx, chB);
  }

  // â”€â”€ GREEN PROFIT ZONE (between PE and actual) â”€â”€
  if (margenSeguridad > 0) {
    doc.setFillColor(220, 252, 231); // green-100
    const peX = scX(puntoEquilibrio);
    const actX = scX(a.facturado);
    const peYpt = scY(puntoEquilibrio);
    // Revenue at actual
    const revAtAct = scY(a.facturado);
    // Cost at actual
    const costAtAct = scY(a.costosFijos + a.facturado * cvRatio);
    // Draw filled zone as rectangle approximation
    doc.rect(peX, Math.min(revAtAct, peYpt), actX - peX, Math.abs(costAtAct - revAtAct), 'F');
  }

  // â”€â”€ RED LOSS ZONE (between 0 and PE) â”€â”€
  if (puntoEquilibrio > 0) {
    doc.setFillColor(254, 226, 226); // red-100
    const peX = scX(puntoEquilibrio);
    const peYpt = scY(puntoEquilibrio);
    // At x=0: revenue=0, cost=CF
    const cfY = scY(a.costosFijos);
    // Triangle: (chX, chB) â†’ (chX, cfY) â†’ (peX, peYpt)
    // Approximate with rectangle from 0 to PE
    const midCostY = scY(a.costosFijos + (puntoEquilibrio * cvRatio) / 2);
    const midRevY = scY(puntoEquilibrio / 2);
    doc.rect(chX, Math.min(cfY, midCostY), peX - chX, Math.abs(chB - cfY), 'F');
  }

  // â”€â”€ AXES â”€â”€
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.4);
  doc.line(chX, chB, chR, chB);  // X axis
  doc.line(chX, chY, chX, chB);  // Y axis

  // X-axis labels
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  for (let i = 1; i <= gridSteps; i++) {
    const gVal = (maxVal / gridSteps) * i;
    const gx = scX(gVal);
    const label = gVal >= 1000000 ? `$${(gVal / 1000000).toFixed(0)}M` : `$${(gVal / 1000).toFixed(0)}K`;
    doc.text(label, gx, chB + 4, { align: 'center' });
  }
  doc.setFontSize(7);
  doc.text('FacturaciÃ³n', chX + chW / 2, chB + 9, { align: 'center' });

  // â”€â”€ FIXED COSTS LINE (horizontal) â”€â”€
  doc.setDrawColor(234, 179, 8); // amber
  doc.setLineWidth(0.6);
  const cfLineY = scY(a.costosFijos);
  // Dashed effect: draw segments
  for (let x = chX; x < chR; x += 4) {
    doc.line(x, cfLineY, Math.min(x + 2, chR), cfLineY);
  }
  // Label
  doc.setFillColor(255, 251, 235);
  doc.roundedRect(chR - 32, cfLineY - 4, 31, 7, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setTextColor(161, 98, 7);
  doc.text('Costos Fijos', chR - 16.5, cfLineY, { align: 'center' });

  // â”€â”€ TOTAL COSTS LINE â”€â”€
  doc.setDrawColor(220, 38, 38); // red
  doc.setLineWidth(1);
  const costStart = scY(a.costosFijos); // at x=0, cost = CF
  const costEnd = scY(a.costosFijos + maxVal * cvRatio); // at x=max
  doc.line(chX, costStart, chR, costEnd);
  // Label
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(chR - 30, costEnd - 8, 29, 7, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setTextColor(185, 28, 28);
  doc.text('Costos Totales', chR - 15.5, costEnd - 4, { align: 'center' });

  // â”€â”€ REVENUE LINE â”€â”€
  doc.setDrawColor(30, 64, 175); // blue
  doc.setLineWidth(1);
  doc.line(chX, chB, chR, scY(maxVal));
  // Label
  const revEndY = scY(maxVal);
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(chR - 24, revEndY - 1, 23, 7, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setTextColor(30, 64, 175);
  doc.text('Ingresos', chR - 12.5, revEndY + 3.5, { align: 'center' });

  // â”€â”€ BREAK-EVEN POINT â”€â”€
  const peXpt = scX(puntoEquilibrio);
  const peYpt = scY(puntoEquilibrio);
  // Vertical dashed line from PE to X axis
  doc.setDrawColor(22, 163, 74); // green
  doc.setLineWidth(0.3);
  for (let yy = peYpt; yy < chB; yy += 3) {
    doc.line(peXpt, yy, peXpt, Math.min(yy + 1.5, chB));
  }
  // Circle
  doc.setFillColor(22, 163, 74);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.8);
  doc.circle(peXpt, peYpt, 2.5, 'FD');
  // Label box
  const peLabelX = peXpt;
  const peLabelY = peYpt - 8;
  doc.setFillColor(220, 252, 231);
  doc.setDrawColor(22, 163, 74);
  doc.setLineWidth(0.3);
  doc.roundedRect(peLabelX - 18, peLabelY - 3, 36, 7, 1.5, 1.5, 'FD');
  doc.setFontSize(6);
  doc.setTextColor(22, 101, 52);
  doc.text(`PE: ${fmt(puntoEquilibrio)}`, peLabelX, peLabelY + 1.5, { align: 'center' });

  // â”€â”€ CURRENT FACTURACIÃ“N MARKER â”€â”€
  const actXpt = scX(a.facturado);
  const actRevY = scY(a.facturado); // on revenue line
  const actCostY = scY(a.costosFijos + a.facturado * cvRatio); // on cost line
  // Vertical line
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.3);
  for (let yy = actRevY; yy < chB; yy += 3) {
    doc.line(actXpt, yy, actXpt, Math.min(yy + 1.5, chB));
  }
  // Revenue point
  doc.setFillColor(30, 64, 175);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.circle(actXpt, actRevY, 2, 'FD');
  // Cost point
  doc.setFillColor(220, 38, 38);
  doc.circle(actXpt, actCostY, 2, 'FD');
  // Bracket showing profit
  if (margenSeguridad > 0) {
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.5);
    doc.line(actXpt + 3, actRevY, actXpt + 3, actCostY);
    doc.line(actXpt + 2, actRevY, actXpt + 4, actRevY);
    doc.line(actXpt + 2, actCostY, actXpt + 4, actCostY);
    // Label
    const profitMid = (actRevY + actCostY) / 2;
    doc.setFontSize(5.5);
    doc.setTextColor(22, 101, 52);
    doc.text(fmt(a.resultadoOp), actXpt + 6, profitMid + 1);
  }
  // Label box for actual
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.3);
  doc.roundedRect(actXpt - 18, chB + 5, 36, 7, 1.5, 1.5, 'FD');
  doc.setFontSize(6);
  doc.setTextColor(30, 58, 138);
  doc.text(`Real: ${fmt(a.facturado)}`, actXpt, chB + 9.5, { align: 'center' });

  // â”€â”€ MARGEN DE SEGURIDAD arrow â”€â”€
  if (margenSeguridad > 0) {
    const arrowY = chB + 16;
    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(0.4);
    doc.line(peXpt, arrowY, actXpt, arrowY);
    // Arrow heads
    doc.line(peXpt, arrowY, peXpt + 2, arrowY - 1.5);
    doc.line(peXpt, arrowY, peXpt + 2, arrowY + 1.5);
    doc.line(actXpt, arrowY, actXpt - 2, arrowY - 1.5);
    doc.line(actXpt, arrowY, actXpt - 2, arrowY + 1.5);
    doc.setFontSize(6);
    doc.setTextColor(22, 101, 52);
    doc.text(`Margen de Seguridad: ${fmtPct(margenSeguridadPct)}`, (peXpt + actXpt) / 2, arrowY - 2, { align: 'center' });
  }

  // â”€â”€ LEGEND â”€â”€
  const legY = chY + 2;
  const legX = chX + 3;
  doc.setFontSize(5.5);
  // Revenue
  doc.setFillColor(30, 64, 175); doc.rect(legX, legY, 6, 2, 'F');
  doc.setTextColor(60, 60, 60); doc.text('Ingresos', legX + 8, legY + 1.8);
  // Total costs
  doc.setFillColor(220, 38, 38); doc.rect(legX, legY + 4, 6, 2, 'F');
  doc.text('Costos Totales', legX + 8, legY + 5.8);
  // Fixed costs
  doc.setFillColor(234, 179, 8); doc.rect(legX, legY + 8, 6, 2, 'F');
  doc.text('Costos Fijos', legX + 8, legY + 9.8);
  // Zones
  doc.setFillColor(220, 252, 231); doc.rect(legX, legY + 12, 6, 2, 'F');
  doc.text('Zona de Ganancia', legX + 8, legY + 13.8);
  doc.setFillColor(254, 226, 226); doc.rect(legX, legY + 16, 6, 2, 'F');
  doc.text('Zona de PÃ©rdida', legX + 8, legY + 17.8);

  // Y after chart
  y = chB + 24;

  // â”€â”€ TABLA PE â”€â”€
  const peRows = [
    ['Costos Fijos Mensuales', fmt(a.costosFijos)],
    ['Margen de ContribuciÃ³n %', fmtPct(a.margenContribPct)],
    ['Punto de Equilibrio (facturaciÃ³n)', fmt(puntoEquilibrio)],
    ['Punto de Equilibrio (prestaciones)', fmtNum(pePrestaciones)],
    ['FacturaciÃ³n Real del PerÃ­odo', fmt(a.facturado)],
    ['Margen de Seguridad', `${fmt(margenSeguridad)} (${fmtPct(margenSeguridadPct)})`],
  ];

  autoTable(doc, { startY: y, margin: { left: M, right: M },
    body: peRows,
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' }, 1: { cellWidth: 70, halign: 'right' } },
    didParseCell: (d: any) => { alinear(d, { 0: 'left', 1: 'right' });
      if (d.row.index === 2) { d.cell.styles.fillColor = [254, 243, 199]; d.cell.styles.fontStyle = 'bold'; }
      if (d.row.index === 5) { d.cell.styles.fillColor = margenSeguridad > 0 ? [220, 252, 231] : [254, 226, 226]; d.cell.styles.fontStyle = 'bold'; }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;
  const peNarrativa = margenSeguridad > 0
    ? `La clÃ­nica opera ${fmtPct(margenSeguridadPct)} por encima de su punto de equilibrio. Esto significa que la facturaciÃ³n podrÃ­a caer hasta ${fmt(margenSeguridad)} antes de generar pÃ©rdidas operativas. Se necesitan al menos ${fmtNum(pePrestaciones)} prestaciones mensuales al ticket promedio actual para cubrir los costos fijos.`
    : `La facturaciÃ³n actual se encuentra por debajo del punto de equilibrio en ${fmt(Math.abs(margenSeguridad))}. Esto indica que el instituto no estÃ¡ cubriendo la totalidad de sus costos fijos con la operaciÃ³n corriente. Se requiere incrementar la facturaciÃ³n en al menos ${fmt(Math.abs(margenSeguridad))} o reducir costos fijos para alcanzar el equilibrio.`;
  y = addNarrativa(y, peNarrativa);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃGINA 7: CONCLUSIONES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.addPage(); addHeader('Conclusiones'); addFooter();
  y = 32;
  y = addSection(y, '10. Conclusiones y Recomendaciones');

  const conclusiones = generarConclusiones(datos);

  conclusiones.forEach((conclusion, i) => {
    if (y > PH - 40) { doc.addPage(); addHeader('Conclusiones (cont.)'); addFooter(); y = 32; }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.primary);
    doc.text(`${i + 1}.`, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.dark);
    const lines = doc.splitTextToSize(conclusion, CW - 8);
    doc.text(lines, M + 8, y);
    y += lines.length * 4.2 + 5;
  });

  // Firma
  y += 15;
  if (y > PH - 80) { doc.addPage(); addHeader(''); addFooter(); y = 50; }
  doc.setDrawColor(...C.medium); doc.setLineWidth(0.3);
  doc.line(M, y, M + 60, y);
  doc.setFontSize(8); doc.setTextColor(...C.medium);
  doc.text('DirecciÃ³n MÃ©dica', M, y + 5);
  doc.text(`${mesNombre} ${datos.anio}`, M, y + 10);

  // â”€â”€ DISCLAIMER â”€â”€
  y += 25;
  if (y > PH - 45) { doc.addPage(); addHeader(''); addFooter(); y = PH - 55; }

  const discTexto = 'Nota importante: La validez de los indicadores presentados en este informe estÃ¡ sujeta al registro completo y oportuno de la totalidad de las erogaciones del perÃ­odo analizado. Cualquier omisiÃ³n, demora o error en la carga de gastos, comprobantes de proveedores, liquidaciones de honorarios o cargas sociales puede impactar significativamente en los mÃ¡rgenes y resultados aquÃ­ expuestos. Se recomienda verificar la integridad de los datos previo a la toma de decisiones basadas en este documento.';
  const discLines = doc.splitTextToSize(discTexto, CW - 12);
  const discH = discLines.length * 3.8 + 10;

  // Red border box
  doc.setDrawColor(185, 28, 28);  // red-700
  doc.setLineWidth(0.6);
  doc.setFillColor(254, 242, 242);  // red-50
  doc.roundedRect(M, y, CW, discH, 2, 2, 'FD');

  // Icon area
  doc.setFillColor(220, 38, 38);  // red-600
  doc.roundedRect(M + 3, y + 3, 5, 5, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.white);
  doc.text('!', M + 5.5, y + 6.8, { align: 'center' });

  // Title
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(153, 27, 27);
  doc.text('AVISO SOBRE VALIDEZ DE LA INFORMACIÃ“N', M + 11, y + 7);

  // Body
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(127, 29, 29);
  doc.text(discLines, M + 6, y + 13);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GUARDAR
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  doc.save(`Informe_Gestion_${datos.anio}_${String(datos.mes).padStart(2, '0')}_${mesNombre}.pdf`);
}
