// ============================================================
// Sobre Quirúrgico — primitivas jsPDF (membrete institucional + helpers)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Patrón visual del sistema (jsPDF): encabezado "Instituto Dr. Mercado —
// Survisión S.A." + lema, pie con datos de contacto y "Desarrollo: P. Famá".
// Provee un "Lienzo" con cursor `y` que gestiona saltos de página, encabezado
// y pie de forma consistente para todos los documentos del Sobre.
// ============================================================

import jsPDF from "jspdf";

export const PW = 210;   // A4 ancho (mm)
export const PH = 297;   // A4 alto (mm)
export const M = 18;     // margen
export const CW = PW - 2 * M;

const HEADER_BOTTOM = 34;      // y donde arranca el contenido
const FOOTER_TOP = PH - 20;    // por debajo de esto NO se dibuja contenido

// Alineación de headers de autoTable (mismo helper que el resto del sistema).
export type HAlign = "left" | "center" | "right";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const alinear = (d: any, aligns: Record<number, HAlign>) => {
  if (d.section === "head") {
    const a = aligns[d.column.index];
    if (a) d.cell.styles.halign = a;
  }
};

export interface Lienzo {
  doc: jsPDF;
  y: number;
}

// ── Membrete + pie ───────────────────────────────────────────────────────────

function cabecera(L: Lienzo) {
  const { doc } = L;
  doc.setTextColor(20, 40, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("INSTITUTO DR. MERCADO", PW / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text("Survisión S.A.", PW / 2, 19.5, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text("Innovación y trayectoria en la Recuperación de la visión", PW / 2, 24.5, { align: "center" });
  doc.setDrawColor(20, 40, 90);
  doc.setLineWidth(0.5);
  doc.line(M, 28, PW - M, 28);
  L.y = HEADER_BOTTOM;
  doc.setTextColor(30, 30, 30);
}

function pie(L: Lienzo) {
  const { doc } = L;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, FOOTER_TOP, PW - M, FOOTER_TOP);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("Tel: 0260-4426757 / 0260-4425776  ·  Guardia: 260-4669362  ·  info@survision.com.ar", PW / 2, FOOTER_TOP + 5, { align: "center" });
  doc.text("3 de Febrero 448 - San Rafael, Mza.", PW / 2, FOOTER_TOP + 9, { align: "center" });
  doc.setTextColor(150, 150, 150);
  doc.text("Desarrollo: P. Famá", PW / 2, FOOTER_TOP + 13, { align: "center" });
  doc.setTextColor(30, 30, 30);
}

// ── Ciclo de vida del lienzo ──────────────────────────────────────────────────

export function nuevoLienzo(): Lienzo {
  const doc = new jsPDF("p", "mm", "a4");
  const L: Lienzo = { doc, y: 0 };
  cabecera(L);
  return L;
}

/** Continúa en el MISMO doc: cierra la hoja actual (pie) y abre una nueva. */
export function nuevaHoja(L: Lienzo) {
  pie(L);
  L.doc.addPage();
  cabecera(L);
}

/** Cierra la última hoja (dibuja el pie). Llamar antes de save(). */
export function cerrar(L: Lienzo) {
  pie(L);
}

/** Asegura `alto` mm de espacio; si no entra, salta de hoja. */
export function asegurar(L: Lienzo, alto: number) {
  if (L.y + alto > FOOTER_TOP - 4) nuevaHoja(L);
}

// ── Bloques de contenido ──────────────────────────────────────────────────────

export function titulo(L: Lienzo, txt: string) {
  asegurar(L, 12);
  const { doc } = L;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(20, 40, 90);
  doc.text(txt, M, L.y);
  doc.setDrawColor(20, 40, 90);
  doc.setLineWidth(0.4);
  doc.line(M, L.y + 1.8, M + CW, L.y + 1.8);
  doc.setTextColor(30, 30, 30);
  L.y += 8;
}

export function subtitulo(L: Lienzo, txt: string) {
  asegurar(L, 8);
  const { doc } = L;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(txt, M, L.y);
  L.y += 5.5;
  doc.setTextColor(30, 30, 30);
}

export function parrafo(
  L: Lienzo,
  txt: string,
  opts: { size?: number; bold?: boolean; x?: number; ancho?: number; gap?: number; color?: [number, number, number] } = {},
) {
  const { doc } = L;
  const size = opts.size ?? 9;
  const x = opts.x ?? M;
  const ancho = opts.ancho ?? (CW - (x - M));
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(opts.color ?? [40, 40, 40]));
  const lines = doc.splitTextToSize(txt, ancho) as string[];
  const lh = size * 0.42;
  for (const ln of lines) {
    asegurar(L, lh + 0.5);
    doc.text(ln, x, L.y);
    L.y += lh;
  }
  L.y += opts.gap ?? 1.5;
  doc.setTextColor(30, 30, 30);
}

export function vinieta(L: Lienzo, txt: string, opts: { size?: number; bold?: boolean } = {}) {
  const { doc } = L;
  const size = opts.size ?? 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.text("•", M + 1, L.y);
  parrafo(L, txt, { size, bold: opts.bold, x: M + 5, ancho: CW - 5, gap: 0.8 });
}

export function espacio(L: Lienzo, mm = 3) {
  L.y += mm;
}

/** Campo con etiqueta + valor y línea de base (para completar/mostrar). */
export function campo(L: Lienzo, label: string, valor: string, opts: { ancho?: number; x?: number } = {}) {
  asegurar(L, 8);
  const { doc } = L;
  const x = opts.x ?? M;
  const ancho = opts.ancho ?? CW;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text(`${label}:`, x, L.y);
  const lw = doc.getTextWidth(`${label}: `);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  doc.text(valor || "", x + lw + 1, L.y);
  doc.setDrawColor(170, 170, 170);
  doc.setLineWidth(0.2);
  doc.line(x + lw, L.y + 1, x + ancho, L.y + 1);
  doc.setTextColor(30, 30, 30);
  L.y += 7;
}

/** Dos campos en la misma fila. */
export function campo2(L: Lienzo, l1: string, v1: string, l2: string, v2: string) {
  const yIni = L.y;
  campo(L, l1, v1, { x: M, ancho: CW / 2 - 4 });
  const yFin = L.y;
  L.y = yIni;
  campo(L, l2, v2, { x: M + CW / 2 + 2, ancho: CW / 2 - 2 });
  L.y = Math.max(yFin, L.y);
}

/** Marca "Rp/" grande (recetario). */
export function rp(L: Lienzo) {
  asegurar(L, 12);
  const { doc } = L;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 40, 90);
  doc.text("Rp/", M, L.y + 4);
  doc.setTextColor(30, 30, 30);
  L.y += 10;
}

/** Casilla de verificación con etiqueta. Devuelve el ancho ocupado. */
export function checkbox(L: Lienzo, x: number, y: number, label: string, checked: boolean): number {
  const { doc } = L;
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.3);
  doc.rect(x, y - 3, 3.5, 3.5);
  if (checked) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("X", x + 0.6, y - 0.4);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(label, x + 5, y);
  return 5 + doc.getTextWidth(label) + 6;
}

/** Líneas de firma (una o varias en fila). */
export function firmas(L: Lienzo, etiquetas: string[]) {
  asegurar(L, 20);
  L.y += 8;
  const { doc } = L;
  const n = etiquetas.length;
  const ancho = CW / n;
  etiquetas.forEach((et, i) => {
    const x = M + i * ancho + 4;
    const w = ancho - 8;
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.line(x, L.y, x + w, L.y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(et, x + w / 2, L.y + 4, { align: "center" });
  });
  doc.setTextColor(30, 30, 30);
  L.y += 10;
}
