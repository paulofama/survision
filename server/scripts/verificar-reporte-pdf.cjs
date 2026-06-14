// ============================================================
// VERIFICADOR del PDF de reporte de Sueldos (Fase 5)
// ============================================================
// USO:  cd server && node scripts/verificar-reporte-pdf.cjs [mes]   (default 12)
//
// Ensambla los datos REALES del mes (igual que ReportesSueldosPage) y genera el
// PDF de 8 secciones con jsPDF+autotable (mismo layout que
// generarReporteSueldosPDF.ts), lo guarda a disco y reporta validez/paginas.
// Agrega un hallazgo de MUESTRA solo en memoria (no toca la BD) para que la
// seccion 8 salga poblada. Objetivo: confirmar que el generador no crashea y
// produce un PDF valido con datos reales, sin depender del navegador.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');
const { jsPDF } = require(path.join('..', '..', 'node_modules', 'jspdf'));
const autoTableMod = require(path.join('..', '..', 'node_modules', 'jspdf-autotable'));
const autoTable = autoTableMod.default || autoTableMod;

const ANIO = 2025;
const MES = parseInt(process.argv[2], 10) || 12;
const NF = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => '$ ' + NF.format(Number(n) || 0);
const varTxt = (n, suf = '%') => (n === null || n === undefined ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + suf);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LBL_BLOQUE = { pago_sueldos: 'Pago de Sueldos', horas_complementarias: 'Horas Complementarias', dia_sanidad: 'Día de la Sanidad', seguridad_social: 'Seguridad Social', sindicato: 'Sindicato' };
const LBL_CRIT = { CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja', INFORMATIVA: 'Informativa' };
const LBL_EST_H = { ABIERTO: 'Abierto', EN_REVISION: 'En revisión', RESUELTO: 'Resuelto', NO_APLICA: 'No aplica' };

// indicador comparado del mes (con variacion vs mes anterior)
async function calcularIndicador() {
  const { data: as } = await supabase.from('asientos_sueldos').select('mes,bruto_total,total_neto').eq('anio', ANIO);
  const { data: fs2 } = await supabase.from('f931_declaraciones').select('mes,aporte_ss_301,aporte_os_302,contrib_ss_351,contrib_os_352,art,scvo,cantidad_trabajadores').eq('anio', ANIO).eq('estado', 'REVISADO_CONFIRMADO');
  const am = new Map(as.map((x) => [x.mes, x])); const fm = new Map(fs2.map((x) => [x.mes, x]));
  const ind = (m) => {
    const a = am.get(m), f = fm.get(m); if (!a && !f) return null;
    const bruto = r2(Number(a?.bruto_total)); const neto = r2(Number(a?.total_neto));
    const contrib = r2(Number(f?.contrib_ss_351) + Number(f?.contrib_os_352) + Number(f?.art) + Number(f?.scvo));
    const dot = Number(f?.cantidad_trabajadores) || 0;
    return { mes: m, dotacion: dot, neto, bruto, contribuciones: contrib, costo_laboral: r2(bruto + contrib), alicuota_cargas: bruto > 0 ? contrib / bruto : 0, neto_promedio: dot > 0 ? r2(neto / dot) : 0 };
  };
  const cur = ind(MES), prev = ind(MES - 1);
  if (!cur) return null;
  const pctv = (a, b) => (prev && b !== 0 ? r2(((a - b) / Math.abs(b)) * 100) : null);
  return { ...cur,
    var_bruto_pct: prev ? pctv(cur.bruto, prev.bruto) : null,
    var_costo_pct: prev ? pctv(cur.costo_laboral, prev.costo_laboral) : null,
    var_alicuota_pp: prev ? r2((cur.alicuota_cargas - prev.alicuota_cargas) * 100) : null,
    var_dotacion: prev ? cur.dotacion - prev.dotacion : null };
}

(async () => {
  // ----- ensamblar datos reales -----
  const { data: liq } = await supabase.from('liquidaciones_mes').select('*').eq('anio', ANIO).eq('mes', MES).maybeSingle();
  if (!liq) { console.log('No hay liquidacion'); process.exit(1); }
  const { data: bloques } = await supabase.from('liquidacion_bloques').select('*').eq('liquidacion_id', liq.id);
  const ids = bloques.map((b) => b.id);
  const [empR, conR, emplR] = await Promise.all([
    supabase.from('liquidacion_lineas_empleado').select('*').in('bloque_id', ids),
    supabase.from('liquidacion_lineas_concepto').select('*').in('bloque_id', ids),
    supabase.from('empleados').select('id,apellido,nombre,area'),
  ]);
  const lineasEmp = empR.data || [], lineasConc = conR.data || [];
  const empMap = new Map((emplR.data || []).map((e) => [e.id, e]));
  const bP = bloques.find((b) => b.tipo === 'pago_sueldos'), bH = bloques.find((b) => b.tipo === 'horas_complementarias');
  const pago = lineasEmp.filter((l) => l.bloque_id === bP?.id), hc = lineasEmp.filter((l) => l.bloque_id === bH?.id);
  const hcMap = new Map(hc.map((l) => [l.empleado_id, Number(l.monto_neto_cargado) || 0]));
  const nomina = pago.map((l) => { const e = empMap.get(l.empleado_id); return { apellido_nombre: e ? `${e.apellido}, ${e.nombre}` : '(empleado)', area: l.area_snapshot || e?.area || '', neto: Number(l.monto_neto_cargado) || 0, hc: hcMap.get(l.empleado_id) || 0, bruto: Number(l.bruto_estimado) || 0 }; }).sort((a, b) => a.apellido_nombre.localeCompare(b.apellido_nombre));
  const minutaBloques = bloques.map((b) => { const esC = b.tipo === 'seguridad_social' || b.tipo === 'sindicato'; const total = esC ? lineasConc.filter((l) => l.bloque_id === b.id).reduce((s, l) => s + (Number(l.monto) || 0), 0) : lineasEmp.filter((l) => l.bloque_id === b.id).reduce((s, l) => s + (Number(l.monto_neto_cargado) || 0), 0); return { label: LBL_BLOQUE[b.tipo] || b.tipo, total }; });
  const { data: asCab } = await supabase.from('asientos_sueldos').select('*').eq('liquidacion_id', liq.id).maybeSingle();
  let asLineas = [];
  if (asCab) { const { data } = await supabase.from('asiento_sueldos_lineas').select('*').eq('asiento_id', asCab.id).order('orden', { ascending: true }); asLineas = data || []; }
  const { data: f931 } = await supabase.from('f931_declaraciones').select('*').eq('anio', ANIO).eq('mes', MES).eq('estado', 'REVISADO_CONFIRMADO').limit(1).maybeSingle();
  const ind = await calcularIndicador();
  // hallazgo de muestra (solo memoria)
  const hallazgos = [{ codigo: 'H-01', titulo: 'Caída de alícuota efectiva de cargas vs mes anterior', descripcion: 'La alícuota de contribuciones sobre el bruto bajó respecto del período previo. Verificar régimen.', criticidad: 'ALTA', norma: 'Ley 27.541 / Dto. reducción contrib.', estado: 'ABIERTO' }];

  // ----- generar PDF (mismo layout que generarReporteSueldosPDF.ts) -----
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 40; let y = M;
  const AZUL = [37, 99, 235], GRIS = [243, 244, 246];
  const sec = (n, t) => { if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = M; } doc.setFillColor(...AZUL); doc.rect(M, y, W - 2 * M, 18, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(`${n}. ${t}`, M + 6, y + 13); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); y += 26; };
  const after = () => { y = ((doc.lastAutoTable && doc.lastAutoTable.finalY) || y) + 16; };

  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.text('Reporte de Auditoría — Sueldos', M, y); y += 18;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text('Survisión S.A.  ·  CUIT 30-70967266-1', M, y); y += 14;
  doc.setFont('helvetica', 'bold'); doc.text(`Período: ${MESES[MES]} ${ANIO}`, M, y); doc.setFont('helvetica', 'normal'); doc.text(`Estado: ${liq.estado}`, M + 200, y); y += 20;

  sec(2, 'Resumen ejecutivo');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: GRIS, textColor: 40, fontStyle: 'bold' }, head: [['Indicador', 'Valor', 'vs mes anterior']], body: [['Dotación', String(ind?.dotacion ?? '—'), ind?.var_dotacion != null ? varTxt(ind.var_dotacion, '') : '—'], ['Total neto', money(ind?.neto), '—'], ['Bruto (asiento)', money(ind?.bruto), varTxt(ind?.var_bruto_pct)], ['Contribuciones', money(ind?.contribuciones), '—'], ['Costo laboral', money(ind?.costo_laboral), varTxt(ind?.var_costo_pct)], ['Alícuota efectiva', ((ind?.alicuota_cargas ?? 0) * 100).toFixed(2) + '%', ind?.var_alicuota_pp != null ? varTxt(ind.var_alicuota_pp, ' pp') : '—'], ['Neto promedio', money(ind?.neto_promedio), '—']] }); after();

  sec(3, 'Nómina por empleado');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: AZUL, textColor: 255 }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }, head: [['Empleado', 'Área', 'Neto', 'HC', 'Bruto est.*']], body: nomina.map((n) => [n.apellido_nombre, n.area, money(n.neto), money(n.hc), money(n.bruto)]), foot: [['TOTAL', '', money(nomina.reduce((s, n) => s + n.neto, 0)), money(nomina.reduce((s, n) => s + n.hc, 0)), money(nomina.reduce((s, n) => s + n.bruto, 0))]], footStyles: { fillColor: GRIS, textColor: 20, fontStyle: 'bold', halign: 'right' } }); after();

  sec(4, 'Detalle de la minuta (por bloque)');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: GRIS, textColor: 40, fontStyle: 'bold' }, columnStyles: { 1: { halign: 'right' } }, head: [['Bloque', 'Total']], body: minutaBloques.map((b) => [b.label, money(b.total)]) }); after();

  sec(5, 'F.931 del período');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } }, headStyles: { fillColor: GRIS, textColor: 40, fontStyle: 'bold' }, head: [['Concepto', 'Importe', 'Concepto', 'Importe']], body: [['Rem. 1', money(f931?.rem_1), 'Aporte SS (301)', money(f931?.aporte_ss_301)], ['Cant. trab.', String(f931?.cantidad_trabajadores ?? '—'), 'Aporte OS (302)', money(f931?.aporte_os_302)], ['Contrib. SS (351)', money(f931?.contrib_ss_351), 'Contrib. OS (352)', money(f931?.contrib_os_352)], ['ART', money(f931?.art), 'SCVO', money(f931?.scvo)], ['Total a depositar', money(f931?.total_a_depositar), 'Estado', f931?.estado ?? '—']] }); after();

  sec(6, 'Indicadores comparativos');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 1: { halign: 'right' } }, headStyles: { fillColor: GRIS, textColor: 40, fontStyle: 'bold' }, head: [['Indicador', 'Variación vs mes anterior']], body: [['Bruto', varTxt(ind?.var_bruto_pct)], ['Costo laboral', varTxt(ind?.var_costo_pct)], ['Alícuota efectiva', ind?.var_alicuota_pp != null ? varTxt(ind.var_alicuota_pp, ' pp') : '—'], ['Dotación', ind?.var_dotacion != null ? varTxt(ind.var_dotacion, '') : '—']] }); after();

  sec(7, 'Propuesta de Asiento (borrador para contabilidad)');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: AZUL, textColor: 255 }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }, head: [['Secc.', 'Cuenta', 'Detalle', 'Debe', 'Haber']], body: asLineas.map((l) => [l.seccion === 'facturado' ? 'Fact.' : 'Rec.', l.cuenta_codigo || '(a det.)', (l.cuenta_nombre || l.detalle || '') + (l.es_estimado ? ' *' : ''), Number(l.debe) > 0 ? money(l.debe) : '', Number(l.haber) > 0 ? money(l.haber) : '']), foot: asCab ? [['', '', 'TOTALES', money(asCab.total_debe), money(asCab.total_haber)]] : undefined, footStyles: { fillColor: GRIS, textColor: 20, fontStyle: 'bold', halign: 'right' } }); after();

  sec(8, 'Hallazgos del mes');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: AZUL, textColor: 255 }, head: [['Cód.', 'Hallazgo', 'Criticidad', 'Norma', 'Estado']], body: hallazgos.map((h) => [h.codigo, h.titulo + (h.descripcion ? `\n${h.descripcion}` : ''), LBL_CRIT[h.criticidad], h.norma, LBL_EST_H[h.estado]]) }); after();

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.text(`Survisión S.A. — Reporte Sueldos ${MESES[MES]} ${ANIO} — Borrador`, M, doc.internal.pageSize.getHeight() - 16); doc.text(`${i}/${total}`, W - M - 20, doc.internal.pageSize.getHeight() - 16); }

  const out = path.join(__dirname, '..', '..', `Reporte_Sueldos_${ANIO}_${String(MES).padStart(2, '0')}_VERIF.pdf`);
  fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
  const buf = fs.readFileSync(out);
  console.log('PDF generado: ' + out);
  console.log('Tamaño: ' + Math.round(buf.length / 1024) + ' KB · Páginas: ' + total);
  console.log('Cabecera válida: ' + (buf.slice(0, 5).toString() === '%PDF-'));
  console.log('Nómina: ' + nomina.length + ' empleados · Asiento: ' + asLineas.length + ' líneas · Hallazgos: ' + hallazgos.length);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
