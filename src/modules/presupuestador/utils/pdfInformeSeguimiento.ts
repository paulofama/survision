// ============================================================
// PDF del Informe mensual de Seguimiento telefónico
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// Reusa las primitivas de `analisis-marginal/utils/pdf/informeBase`: membrete,
// secciones, KPIs, avisos y pie institucional. No dibuja nada por su cuenta que
// ya exista ahí.
//
// Los números NO se calculan acá: llegan armados desde
// `utils/informeSeguimiento`, el mismo módulo que alimenta la pantalla. Esa es
// la regla que evita que el papel y el monitor muestren cosas distintas.
// ============================================================

import autoTable from 'jspdf-autotable';
import type { CellHookData } from 'jspdf-autotable';
import {
  nuevoLienzo, membrete, seccion, parrafo, vinieta, aviso, kpi, cerrar, alinear,
  M, C, type Lienzo,
} from '@modules/analisis-marginal/utils/pdf/informeBase';
import type { Indicador, InformeSeguimiento } from './informeSeguimiento';

const ars = (n: number) =>
  '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
const unDec = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n || 0);

const valorDe = (i: Indicador): string => {
  if (i.formato === 'porcentaje') return unDec(i.valor) + ' %';
  if (i.formato === 'dias') return Math.round(i.valor) + ' d';
  if (i.formato === 'ratio') return unDec(i.valor);
  return String(Math.round(i.valor));
};

const deltaDe = (i: Indicador): { etiqueta: string; texto: string; pos: boolean }[] => {
  if (i.delta === null) return [{ etiqueta: 'mes anterior', texto: 'sin dato', pos: true }];
  const signo = i.delta >= 0 ? '+' : '−';
  const abs = Math.abs(i.delta);
  const texto = i.formato === 'porcentaje' ? `${signo}${unDec(abs)} pp`
    : i.formato === 'dias' ? `${signo}${Math.round(abs)} d`
    : i.formato === 'ratio' ? `${signo}${unDec(abs)}`
    : `${signo}${Math.round(abs)}`;
  const mejora = i.delta === 0 ? true : (i.delta > 0) === i.subirEsBueno;
  return [{ etiqueta: 'mes anterior', texto, pos: mejora }];
};

/** Tabla con el estilo del resto de los informes. Devuelve el nuevo cursor. */
function tabla(
  L: Lienzo,
  head: string[],
  body: (string | number)[][],
  aligns: Record<number, 'left' | 'center' | 'right'> = {},
  anchos: Record<number, number> = {},
): number {
  autoTable(L.doc, {
    startY: L.y,
    margin: { left: M, right: M, top: 30, bottom: 22 },
    head: [head],
    body: body.map((r) => r.map((c) => String(c))),
    styles: { fontSize: 7.5, cellPadding: 1.6, lineWidth: 0.1, lineColor: [210, 214, 220] },
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 249, 253] },
    columnStyles: Object.fromEntries(Object.entries(anchos).map(([k, v]) => [k, { cellWidth: v }])),
    didParseCell: (d: CellHookData) => alinear(d, aligns),
    didDrawPage: () => membrete(L),
  });
  return L.doc.lastAutoTable.finalY + 5;
}

/**
 * Arma el PDF sin descargarlo. Separado de la descarga para poder generarlo en
 * un test y revisar el resultado — mismo patrón que `armarSobreCompleto`.
 */
export function armarPdfInformeSeguimiento(inf: InformeSeguimiento): Lienzo {
  const L = nuevoLienzo(`Seguimiento telefónico — ${inf.etiquetaPeriodo}`);

  // ── 1. Portada: el indicador que ordena todo el informe ──
  seccion(L, '1. Tiempo al primer contacto');
  const lat = inf.indicadores.find((i) => i.clave === 'latencia');
  const vd = inf.ventanaDecision;
  const dias = lat && lat.n > 0 ? Math.round(lat.valor) : null;

  const ancho = (L.cw - 6) / 2;
  kpi(L, M, L.y, ancho, 'Tiempo al primer contacto',
    dias === null ? 'sin datos' : `${dias} días`,
    [{ etiqueta: `sobre ${lat?.n ?? 0} contactados`, texto: '', pos: true, neutro: true }]);
  kpi(L, M + ancho + 6, L.y, ancho, 'Ventana de decisión del paciente',
    vd.medianaDias === null ? '—' : `${unDec(vd.medianaDias)} días`,
    [{ etiqueta: `${Math.round(vd.pctDentro30)} % opera dentro de 30 d`, texto: '', pos: true, neutro: true }]);
  L.y += 24;

  if (dias !== null && vd.medianaDias !== null && dias > 30) {
    aviso(L,
      `El primer llamado llega a los ${dias} días, y la mediana entre el presupuesto y la cirugía ` +
      `es de ${unDec(vd.medianaDias)} días: ${vd.dentro30} de ${vd.n} operaciones ocurren dentro del primer mes. ` +
      'El contacto se produce fuera de la ventana en la que el paciente decide.', 'alerta');
  }

  if (inf.advertencias.length) {
    seccion(L, 'Cómo leer este informe', { alto: 14 + inf.advertencias.length * 5 });
    for (const a of inf.advertencias) vinieta(L, a, C.medium);
    L.y += 2;
  }

  // ── 2. Indicadores ──
  seccion(L, '2. Indicadores del mes', { hojaNueva: true });
  const anchoKpi = (L.cw - 12) / 3;
  inf.indicadores.forEach((i, n) => {
    const col = n % 3;
    const fila = Math.floor(n / 3);
    kpi(L, M + col * (anchoKpi + 6), L.y + fila * 26, anchoKpi,
      `${i.label}${i.confiable ? '' : '  (muestra chica)'}`, valorDe(i), deltaDe(i));
  });
  L.y += Math.ceil(inf.indicadores.length / 3) * 26 + 4;
  parrafo(L, 'Cada indicador lleva el n de casos que lo sustenta. Por debajo de 20 casos el porcentaje no es representativo y el valor va marcado.', { size: 7.5, color: C.medium });

  // ── 3. Plata en riesgo ──
  seccion(L, '3. Plata en riesgo');
  parrafo(L, `Presupuestos entregados que todavía no se operaron: ${inf.plataEnRiesgo.cantidad} por ${ars(inf.plataEnRiesgo.total)}.`);
  L.y = tabla(L,
    ['Antigüedad', 'Presupuestos', 'Monto', '% del total'],
    inf.plataEnRiesgo.tramos.filter((t) => t.cantidad > 0).map((t) => [
      t.etiqueta, t.cantidad, ars(t.monto),
      unDec(inf.plataEnRiesgo.total ? (t.monto / inf.plataEnRiesgo.total) * 100 : 0) + ' %',
    ]),
    { 1: 'right', 2: 'right', 3: 'right' });

  // ── 4. Embudo ──
  seccion(L, '4. Embudo del mes');
  L.y = tabla(L,
    ['Escalón', 'Presupuestos', 'Monto', '% del anterior'],
    inf.embudo.map((e) => [
      e.etiqueta, e.cantidad, ars(e.monto),
      e.retencion === null ? '—' : Math.round(e.retencion) + ' %',
    ]),
    { 1: 'right', 2: 'right', 3: 'right' });
  parrafo(L,
    `Conversión del mes completo: ${inf.conversionMes.operados} de ${inf.conversionMes.total} ` +
    `(${unDec(inf.conversionMes.tasa)} %), con y sin seguimiento. Va aparte del embudo porque ` +
    'incluye presupuestos que el circuito nunca tocó.', { size: 7.5, color: C.medium });

  // ── 5. Cohortes ──
  seccion(L, '5. Cohortes');
  parrafo(L, 'Presupuestos de cada mes y cuántos se operaron dentro de 30, 60 y 90 días. Una ventana abierta todavía puede sumar.');
  L.y = tabla(L,
    ['Mes', 'Entregados', 'En circuito', '30 d', '60 d', '90 d', 'Conversión'],
    inf.cohortes.map((c) => [
      c.etiqueta + (c.cerrada90 ? '' : ' (abierta)'),
      c.entregados, c.enCircuito, c.a30, c.a60, c.a90,
      c.entregados ? unDec((c.a90 / c.entregados) * 100) + ' %' : '—',
    ]),
    { 1: 'right', 2: 'right', 3: 'right', 4: 'right', 5: 'right', 6: 'right' });

  // ── 6. Contactabilidad ──
  seccion(L, '6. Contactabilidad', { hojaNueva: true });
  parrafo(L, 'Histórico completo de llamadas telefónicas. El n pesa tanto como el porcentaje: una franja con pocos intentos no prueba nada.');
  L.y = tabla(L, ['Hora', 'Intentos', 'Contactos', 'Tasa'],
    inf.porHora.map((f) => [f.etiqueta, f.intentos, f.contactos, Math.round(f.tasa) + ' %']),
    { 1: 'right', 2: 'right', 3: 'right' });
  L.y = tabla(L, ['Día', 'Intentos', 'Contactos', 'Tasa'],
    inf.porDiaSemana.map((f) => [f.etiqueta, f.intentos, f.contactos, Math.round(f.tasa) + ' %']),
    { 1: 'right', 2: 'right', 3: 'right' });

  // ── 7. Objeciones ──
  seccion(L, '7. Mapa de objeciones');
  parrafo(L, 'Qué contestan los pacientes que atienden. Es la sección que dice cómo convertir a un indeciso.');
  L.y = tabla(L,
    ['Pregunta', 'Sí', 'No', 'n', 'Qué significa'],
    inf.objeciones.map((o) => [o.pregunta, o.si, o.no, o.n, o.lectura]),
    { 1: 'right', 2: 'right', 3: 'right' },
    { 0: 52, 1: 10, 2: 10, 3: 10 });

  // ── 8. Operadores ──
  seccion(L, '8. Actividad del mes por operador');
  L.y = tabla(L,
    ['Operador', 'Intentos', 'Contactos', 'Tasa', 'Encuestas'],
    inf.operadores.map((o) => [o.usuario, o.intentos, o.contactos, unDec(o.tasa) + ' %', o.encuestas]),
    { 1: 'right', 2: 'right', 3: 'right', 4: 'right' });

  // ── 9. Pendientes, con nombre y teléfono ──
  seccion(L, '9. Sin seguimiento', { hojaNueva: true });
  parrafo(L,
    `${inf.sinSeguimiento.length} presupuestos entregados sin operar que nunca entraron al circuito, ` +
    `por ${ars(inf.sinSeguimiento.reduce((a, x) => a + x.monto, 0))}. Ordenados por monto: ésta es la lista para llamar.`);
  L.y = tabla(L,
    ['Presupuesto', 'Paciente', 'Teléfono', 'Práctica', 'Monto', 'Días'],
    inf.sinSeguimiento.map((f) => [
      f.numero, f.paciente, f.telefono || 'sin teléfono',
      (f.practica || '').slice(0, 38), ars(f.monto), f.diasDesdeCreacion,
    ]),
    { 4: 'right', 5: 'right' },
    { 0: 22, 2: 26, 4: 24, 5: 12 });

  if (inf.perdidosDeSeguimiento.length) {
    seccion(L, '10. Perdidos de seguimiento');
    parrafo(L, 'Están en el circuito, se agotaron los intentos y nunca atendieron. Requieren otro canal, no otra llamada.');
    L.y = tabla(L,
      ['Presupuesto', 'Paciente', 'Teléfono', 'Práctica', 'Monto', 'Días'],
      inf.perdidosDeSeguimiento.map((f) => [
        f.numero, f.paciente, f.telefono || 'sin teléfono',
        (f.practica || '').slice(0, 38), ars(f.monto), f.diasDesdeCreacion,
      ]),
      { 4: 'right', 5: 'right' },
      { 0: 22, 2: 26, 4: 24, 5: 12 });
  }

  cerrar(L, `Informe de Seguimiento telefónico · ${inf.etiquetaPeriodo}`);
  return L;
}

/** Arma el PDF y lo descarga. */
export function generarPdfInformeSeguimiento(inf: InformeSeguimiento): void {
  const L = armarPdfInformeSeguimiento(inf);
  L.doc.save(`Seguimiento-${inf.anio}-${String(inf.mes).padStart(2, '0')}.pdf`);
}

export default generarPdfInformeSeguimiento;
