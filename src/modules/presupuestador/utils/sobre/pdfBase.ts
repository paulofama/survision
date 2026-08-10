// ============================================================
// Sobre Quirúrgico — primitivas jsPDF (membrete institucional + helpers)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Patrón visual del sistema (jsPDF): membrete "Instituto Dr. Mercado —
// Survisión S.A." + lema + dirección y teléfono + fecha de emisión, y pie con
// datos de guardia y "Desarrollo: P. Famá".
// Provee un "Lienzo" con cursor `y` que gestiona saltos de página, encabezado
// y pie de forma consistente para todos los documentos del Sobre.
//
// El Lienzo soporta ORIENTACIÓN POR HOJA: el cronograma de gotas va en A4
// apaisado con letra grande (pacientes de catarata, visión comprometida) sin
// afectar al resto de los documentos.
// ============================================================

import jsPDF from "jspdf";

export const A4_CORTO = 210;  // A4 lado corto (mm)
export const A4_LARGO = 297;  // A4 lado largo (mm)
export const M = 18;          // margen

/** Ancho útil en A4 vertical (los helpers usan `L.cw`, que respeta la orientación). */
export const CW = A4_CORTO - 2 * M;

const HEADER_BOTTOM = 38;     // y donde arranca el contenido
const FOOTER_ALTO = 20;       // franja reservada para el pie

export type Orientacion = "p" | "l";

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
  /** Ancho de la hoja actual (mm) — cambia con la orientación. */
  pw: number;
  /** Alto de la hoja actual (mm). */
  ph: number;
  /** Ancho útil de la hoja actual (pw - 2*M). */
  cw: number;
  orient: Orientacion;
  /** Fecha de emisión que se imprime en el membrete (dd/mm/aaaa). */
  fecha: string;
}

const footerTop = (L: Lienzo): number => L.ph - FOOTER_ALTO;

const fechaDeHoy = (): string => {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
};

// ── Membrete + pie ───────────────────────────────────────────────────────────

function cabecera(L: Lienzo) {
  const { doc, pw } = L;
  doc.setTextColor(20, 40, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("INSTITUTO DR. MERCADO", pw / 2, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.text("Survisión S.A.", pw / 2, 19.5, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text("Innovación y trayectoria en la Recuperación de la visión", pw / 2, 24, { align: "center" });
  // Dirección + teléfono en el propio membrete (las recetas deben llevarlos).
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "3 de Febrero 448 - San Rafael, Mza.  ·  Tel: 0260-4426757 / 0260-4425776",
    pw / 2, 29, { align: "center" },
  );
  // Fecha de emisión (arriba a la derecha).
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 70);
  doc.text(`San Rafael, ${L.fecha}`, pw - M, 14, { align: "right" });

  doc.setDrawColor(20, 40, 90);
  doc.setLineWidth(0.5);
  doc.line(M, 32, pw - M, 32);
  L.y = HEADER_BOTTOM;
  doc.setTextColor(30, 30, 30);
}

function pie(L: Lienzo) {
  const { doc, pw } = L;
  const top = footerTop(L);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, top, pw - M, top);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("Guardia: 260-4669362  ·  info@survision.com.ar", pw / 2, top + 5, { align: "center" });
  doc.setTextColor(150, 150, 150);
  doc.text("Desarrollo: P. Famá", pw / 2, top + 9, { align: "center" });
  doc.setTextColor(30, 30, 30);
}

// ── Ciclo de vida del lienzo ──────────────────────────────────────────────────

function medidas(orient: Orientacion): { pw: number; ph: number } {
  return orient === "l"
    ? { pw: A4_LARGO, ph: A4_CORTO }
    : { pw: A4_CORTO, ph: A4_LARGO };
}

export function nuevoLienzo(opts: { orient?: Orientacion; fecha?: string } = {}): Lienzo {
  const orient = opts.orient ?? "p";
  const { pw, ph } = medidas(orient);
  const doc = new jsPDF(orient, "mm", "a4");
  const L: Lienzo = { doc, y: 0, pw, ph, cw: pw - 2 * M, orient, fecha: opts.fecha || fechaDeHoy() };
  cabecera(L);
  return L;
}

/**
 * Continúa en el MISMO doc: abre una hoja nueva con su membrete.
 * `orient` permite cambiar de orientación (por defecto conserva la actual).
 * El pie NO se dibuja acá — lo estampa `cerrar()` en todas las hojas.
 */
export function nuevaHoja(L: Lienzo, orient?: Orientacion) {
  const o = orient ?? L.orient;
  const { pw, ph } = medidas(o);
  L.doc.addPage("a4", o);
  L.orient = o;
  L.pw = pw;
  L.ph = ph;
  L.cw = pw - 2 * M;
  cabecera(L);
}

/**
 * Dibuja el membrete en la hoja ACTUAL. Se usa para las hojas que agrega
 * jspdf-autotable por su cuenta al partir una tabla: las crea sin pasar por
 * `nuevaHoja`, así que quedarían sin membrete.
 */
export function membrete(L: Lienzo) {
  cabecera(L);
}

/**
 * Cierra el documento estampando el pie en TODAS las hojas. Recorrerlas al
 * final (en vez de dibujar el pie al saltar de página) garantiza que ninguna
 * quede sin pie, incluidas las que agrega autoTable. Llamar antes de save().
 */
export function cerrar(L: Lienzo) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = L.doc as any;
  const total: number = doc.getNumberOfPages();
  const actual: number = doc.getCurrentPageInfo().pageNumber;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    pie({ ...L, pw: doc.internal.pageSize.getWidth(), ph: doc.internal.pageSize.getHeight() });
  }
  doc.setPage(actual);
}

/** Asegura `alto` mm de espacio; si no entra, salta de hoja (misma orientación). */
export function asegurar(L: Lienzo, alto: number) {
  if (L.y + alto > footerTop(L) - 4) nuevaHoja(L);
}

// ── Bloques de contenido ──────────────────────────────────────────────────────

export function titulo(L: Lienzo, txt: string, opts: { size?: number } = {}) {
  const size = opts.size ?? 12.5;
  asegurar(L, size + 4);
  const { doc } = L;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(20, 40, 90);
  doc.text(txt, M, L.y);
  doc.setDrawColor(20, 40, 90);
  doc.setLineWidth(0.4);
  doc.line(M, L.y + 1.8, M + L.cw, L.y + 1.8);
  doc.setTextColor(30, 30, 30);
  L.y += size * 0.64;
}

export function subtitulo(L: Lienzo, txt: string, opts: { size?: number } = {}) {
  const size = opts.size ?? 10;
  asegurar(L, size);
  const { doc } = L;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(40, 40, 40);
  doc.text(txt, M, L.y);
  L.y += size * 0.55;
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
  const ancho = opts.ancho ?? (L.cw - (x - M));
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
  parrafo(L, txt, { size, bold: opts.bold, x: M + size * 0.55, ancho: L.cw - size * 0.55, gap: 0.8 });
}

export function espacio(L: Lienzo, mm = 3) {
  L.y += mm;
}

/**
 * Sello de destino del documento. Sirve para separar de un vistazo lo que se
 * lleva el paciente de lo que se archiva en quirófano.
 */
export function destino(L: Lienzo, texto: string, tono: "paciente" | "quirofano" = "paciente") {
  asegurar(L, 10);
  const { doc } = L;
  const fill: [number, number, number] = tono === "quirofano" ? [235, 240, 250] : [240, 245, 240];
  const borde: [number, number, number] = tono === "quirofano" ? [20, 40, 90] : [120, 150, 120];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const w = doc.getTextWidth(texto) + 8;
  doc.setFillColor(...fill);
  doc.setDrawColor(...borde);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, L.y - 4, w, 6.5, 1.2, 1.2, "FD");
  doc.setTextColor(...borde);
  doc.text(texto, M + 4, L.y);
  doc.setTextColor(30, 30, 30);
  L.y += 8;
}

/** Campo con etiqueta + valor y línea de base (para completar/mostrar). */
export function campo(L: Lienzo, label: string, valor: string, opts: { ancho?: number; x?: number; size?: number } = {}) {
  const size = opts.size ?? 9;
  asegurar(L, size * 0.9);
  const { doc } = L;
  const x = opts.x ?? M;
  const ancho = opts.ancho ?? L.cw;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
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
  L.y += size * 0.78;
}

/** Dos campos en la misma fila. */
export function campo2(L: Lienzo, l1: string, v1: string, l2: string, v2: string, opts: { size?: number } = {}) {
  const yIni = L.y;
  campo(L, l1, v1, { x: M, ancho: L.cw / 2 - 4, size: opts.size });
  const yFin = L.y;
  L.y = yIni;
  campo(L, l2, v2, { x: M + L.cw / 2 + 2, ancho: L.cw / 2 - 2, size: opts.size });
  L.y = Math.max(yFin, L.y);
}

/** Línea de importe destacada (etiqueta a la izquierda, monto a la derecha). */
export function importe(
  L: Lienzo,
  label: string,
  valor: string,
  opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {},
) {
  const size = opts.size ?? 10;
  asegurar(L, size);
  const { doc } = L;
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...(opts.color ?? [30, 30, 30]));
  doc.text(label, M, L.y);
  doc.text(valor, M + L.cw, L.y, { align: "right" });
  doc.setTextColor(30, 30, 30);
  L.y += size * 0.62;
}

/** Línea separadora fina (para cerrar un bloque de importes). */
export function separador(L: Lienzo) {
  asegurar(L, 4);
  const { doc } = L;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(M, L.y, M + L.cw, L.y);
  L.y += 4;
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
  const ancho = L.cw / n;
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
