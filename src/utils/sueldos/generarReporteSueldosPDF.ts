// ===========================================================================
// UTIL: generarReporteSueldosPDF - MODULO CARGA DE SUELDOS (Fase 5)
// ===========================================================================
// Sistema: SurVisión / Sistema Integral de Gestión
// Cliente: Instituto Dr. Mercado / Survisión S.A.
// Desarrollo: P. Famá
//
// PDF mensual de auditoría — 8 secciones (jsPDF + jspdf-autotable):
//   1. Encabezado (empresa, período, estado)
//   2. Resumen ejecutivo
//   3. Nómina por empleado (con HC y bruto estimado)
//   4. Detalle de la minuta (por bloque)
//   5. F.931 del período
//   6. Indicadores comparativos (mes vs mes anterior)
//   7. Propuesta de asiento (borrador para contabilidad)
//   8. Hallazgos del mes
//
// Recibe un objeto ya ensamblado (DatosReporteMes); la página lo arma desde
// Supabase. Números en formato AR. La propuesta de asiento va siempre rotulada
// como borrador (decisión CLAUDE.md).
// ===========================================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AsientoSueldos, AsientoSueldosLinea, F931Declaracion, HallazgoSueldos,
} from '../../types/sueldos';
import { LABEL_CRITICIDAD_HALLAZGO, LABEL_ESTADO_HALLAZGO } from '../../types/sueldos';
import type { IndicadorComparado } from './indicadores';

// ---------------------------------------------------------------------------
// TIPOS DE ENTRADA
// ---------------------------------------------------------------------------

export interface NominaFilaReporte {
  apellido_nombre: string;
  area: string;
  neto: number;
  hc: number;
  bruto: number;
}

export interface BloqueResumenReporte {
  label: string;
  total: number;
}

export interface DatosReporteMes {
  anio: number;
  mes: number;
  periodoLabel: string;
  estado: string;
  empresa: { razon_social: string; cuit: string };
  nomina: NominaFilaReporte[];
  minutaBloques: BloqueResumenReporte[];
  f931: F931Declaracion | null;
  indicadorActual: IndicadorComparado | null;
  asientoCabecera: AsientoSueldos | null;
  asientoLineas: AsientoSueldosLinea[];
  hallazgos: HallazgoSueldos[];
  generadoPor?: string;
  generadoEn: string; // ISO timestamp (lo pasa la página; no usar Date.now acá)
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const NF = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number | null | undefined) => '$ ' + NF.format(Number(n) || 0);
const pct = (n: number | null | undefined, dec = 2) =>
  n === null || n === undefined ? '—' : (Number(n)).toFixed(dec) + '%';
const varTxt = (n: number | null | undefined, suf = '%') =>
  n === null || n === undefined ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + suf;

const COLOR_AZUL: [number, number, number] = [37, 99, 235];
const COLOR_GRIS: [number, number, number] = [243, 244, 246];

// ---------------------------------------------------------------------------
// GENERADOR
// ---------------------------------------------------------------------------

export function generarReporteSueldosPDF(d: DatosReporteMes): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40; // margen
  let y = M;

  const sectionTitle = (n: number, txt: string) => {
    if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = M; }
    doc.setFillColor(...COLOR_AZUL);
    doc.rect(M, y, W - 2 * M, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${n}. ${txt}`, M + 6, y + 13);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    y += 26;
  };

  const afterTable = () => {
    // lastAutoTable lo agrega el plugin jspdf-autotable (no tipado)
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 16;
  };

  // ---- 1. ENCABEZADO ----------------------------------------------------
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Reporte de Auditoría — Sueldos', M, y);
  y += 18;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${d.empresa.razon_social}  ·  CUIT ${d.empresa.cuit}`, M, y);
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text(`Período: ${d.periodoLabel}`, M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Estado: ${d.estado}`, M + 200, y);
  y += 12;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Generado ${new Date(d.generadoEn).toLocaleString('es-AR')}${d.generadoPor ? '  ·  ' + d.generadoPor : ''}  ·  Desarrollo: P. Famá`,
    M, y
  );
  doc.setTextColor(0, 0, 0);
  y += 18;

  // ---- 2. RESUMEN EJECUTIVO --------------------------------------------
  sectionTitle(2, 'Resumen ejecutivo');
  const ind = d.indicadorActual;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: COLOR_GRIS, textColor: 40, fontStyle: 'bold' },
    head: [['Indicador', 'Valor', 'vs mes anterior']],
    body: [
      ['Dotación (empleados)', String(ind?.dotacion ?? '—'), ind?.var_dotacion != null ? varTxt(ind.var_dotacion, '') : '—'],
      ['Total neto', money(ind?.neto), '—'],
      ['Bruto (asiento)', money(ind?.bruto), varTxt(ind?.var_bruto_pct)],
      ['Contribuciones patronales', money(ind?.contribuciones), '—'],
      ['Costo laboral total', money(ind?.costo_laboral), varTxt(ind?.var_costo_pct)],
      ['Alícuota efectiva de cargas', pct((ind?.alicuota_cargas ?? 0) * 100), ind?.var_alicuota_pp != null ? varTxt(ind.var_alicuota_pp, ' pp') : '—'],
      ['Neto promedio', money(ind?.neto_promedio), '—'],
    ],
  });
  afterTable();

  // ---- 3. NOMINA POR EMPLEADO ------------------------------------------
  sectionTitle(3, 'Nómina por empleado');
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: COLOR_AZUL, textColor: 255 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    head: [['Empleado', 'Área', 'Neto', 'HC', 'Bruto est.*']],
    body: d.nomina.length
      ? d.nomina.map((n) => [n.apellido_nombre, n.area, money(n.neto), money(n.hc), money(n.bruto)])
      : [['(sin nómina cargada)', '', '', '', '']],
    foot: d.nomina.length
      ? [[
          'TOTAL', '',
          money(d.nomina.reduce((s, n) => s + n.neto, 0)),
          money(d.nomina.reduce((s, n) => s + n.hc, 0)),
          money(d.nomina.reduce((s, n) => s + n.bruto, 0)),
        ]]
      : undefined,
    footStyles: { fillColor: COLOR_GRIS, textColor: 20, fontStyle: 'bold', halign: 'right' },
  });
  afterTable();
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('* Bruto estimado por reparto proporcional. Ver propuesta de asiento.', M, y);
  doc.setTextColor(0, 0, 0);
  y += 14;

  // ---- 4. DETALLE DE LA MINUTA -----------------------------------------
  sectionTitle(4, 'Detalle de la minuta (por bloque)');
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: COLOR_GRIS, textColor: 40, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    head: [['Bloque', 'Total']],
    body: d.minutaBloques.map((b) => [b.label, money(b.total)]),
  });
  afterTable();

  // ---- 5. F.931 DEL PERIODO --------------------------------------------
  sectionTitle(5, 'F.931 del período');
  const f = d.f931;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
    headStyles: { fillColor: COLOR_GRIS, textColor: 40, fontStyle: 'bold' },
    head: [['Concepto', 'Importe', 'Concepto', 'Importe']],
    body: [
      ['Rem. 1 (base SS)', money(f?.rem_1), 'Aporte SS (301)', money(f?.aporte_ss_301)],
      ['Cant. trabajadores', String(f?.cantidad_trabajadores ?? '—'), 'Aporte OS (302)', money(f?.aporte_os_302)],
      ['Contrib. SS (351)', money(f?.contrib_ss_351), 'Contrib. OS (352)', money(f?.contrib_os_352)],
      ['ART', money(f?.art), 'SCVO', money(f?.scvo)],
      ['Total a depositar', money(f?.total_a_depositar), 'Estado', f?.estado ?? '—'],
    ],
  });
  afterTable();

  // ---- 6. INDICADORES COMPARATIVOS -------------------------------------
  sectionTitle(6, 'Indicadores comparativos');
  if (ind) {
    const alerta = ind.var_alicuota_pp != null && Math.abs(ind.var_alicuota_pp) >= 1;
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 1: { halign: 'right' } },
      headStyles: { fillColor: COLOR_GRIS, textColor: 40, fontStyle: 'bold' },
      head: [['Indicador', 'Variación vs mes anterior']],
      body: [
        ['Bruto', varTxt(ind.var_bruto_pct)],
        ['Costo laboral', varTxt(ind.var_costo_pct)],
        ['Alícuota efectiva de cargas', ind.var_alicuota_pp != null ? varTxt(ind.var_alicuota_pp, ' pp') : '—'],
        ['Dotación', ind.var_dotacion != null ? varTxt(ind.var_dotacion, '') : '—'],
      ],
    });
    afterTable();
    if (alerta) {
      doc.setFontSize(8);
      doc.setTextColor(180, 30, 30);
      doc.text('⚠ Quiebre de alícuota efectiva ≥ 1 punto porcentual vs mes anterior — revisar.', M, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
    }
  } else {
    doc.setFontSize(9);
    doc.text('Sin datos comparativos (falta asiento o F.931 del período).', M, y);
    y += 16;
  }

  // ---- 7. PROPUESTA DE ASIENTO -----------------------------------------
  sectionTitle(7, 'Propuesta de Asiento (borrador para contabilidad)');
  if (d.asientoLineas.length) {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      headStyles: { fillColor: COLOR_AZUL, textColor: 255 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      head: [['Secc.', 'Cuenta', 'Detalle', 'Debe', 'Haber']],
      body: d.asientoLineas.map((l) => [
        l.seccion === 'facturado' ? 'Fact.' : 'Rec.',
        l.cuenta_codigo ?? '(a det.)',
        (l.cuenta_nombre ?? l.detalle ?? '') + (l.es_estimado ? ' *' : ''),
        Number(l.debe) > 0 ? money(l.debe) : '',
        Number(l.haber) > 0 ? money(l.haber) : '',
      ]),
      foot: d.asientoCabecera ? [[
        '', '', 'TOTALES', money(d.asientoCabecera.total_debe), money(d.asientoCabecera.total_haber),
      ]] : undefined,
      footStyles: { fillColor: COLOR_GRIS, textColor: 20, fontStyle: 'bold', halign: 'right' },
    });
    afterTable();
  } else {
    doc.setFontSize(9);
    doc.text('Asiento no generado para este período.', M, y);
    y += 16;
  }

  // ---- 8. HALLAZGOS -----------------------------------------------------
  sectionTitle(8, 'Hallazgos del mes');
  if (d.hallazgos.length) {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: COLOR_AZUL, textColor: 255 },
      head: [['Cód.', 'Hallazgo', 'Criticidad', 'Norma', 'Estado']],
      body: d.hallazgos.map((h) => [
        h.codigo ?? '—',
        h.titulo + (h.descripcion ? `\n${h.descripcion}` : ''),
        LABEL_CRITICIDAD_HALLAZGO[h.criticidad],
        h.norma ?? '—',
        LABEL_ESTADO_HALLAZGO[h.estado],
      ]),
    });
    afterTable();
  } else {
    doc.setFontSize(9);
    doc.text('Sin hallazgos cargados para este mes.', M, y);
    y += 16;
  }

  // ---- Pie de página en todas las páginas ------------------------------
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `${d.empresa.razon_social} — Reporte Sueldos ${d.periodoLabel} — Borrador, no reemplaza la contabilización oficial`,
      M, doc.internal.pageSize.getHeight() - 16
    );
    doc.text(`${i}/${total}`, W - M - 20, doc.internal.pageSize.getHeight() - 16);
    doc.setTextColor(0, 0, 0);
  }

  const nombre = `Reporte_Sueldos_${d.anio}_${String(d.mes).padStart(2, '0')}.pdf`;
  doc.save(nombre);
}
