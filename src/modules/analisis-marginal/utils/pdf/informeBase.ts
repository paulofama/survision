// ============================================================
// Primitivas de PDF para los informes del Análisis Marginal
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// Vivían dentro de `generarInformeGestion.ts` como closures sobre `doc`. Se
// extrajeron acá para que el informe mensual las use sin duplicar la máquina de
// jsPDF (paleta, membrete, pie, secciones, gráficos vectoriales). Mismo patrón
// que `presupuestador/utils/sobre/pdfBase.ts`: un `Lienzo` que se pasa a cada
// helper y lleva el cursor vertical.
//
// REGLAS DE FORMA (informe de dirección, se imprime y se entrega):
//   · Importes en formato argentino, sin decimales, con signo $.
//   · Cantidades SIN $ y en otra familia de peso, para que no se confundan con
//     plata de un vistazo. Es un pedido explícito: el informe muestra volumen y
//     dinero juntos, y hay que poder distinguirlos.
//   · Porcentajes con UN decimal, siempre.
//   · Nunca "N/A" ni celda vacía: si un dato no está, se dice con palabras.
// ============================================================

import jsPDF from 'jspdf';

// ── Geometría A4 ─────────────────────────────────────────────────────────────

export const PW = 210;  // ancho A4 vertical (mm)
export const PH = 297;  // alto A4 vertical (mm)
export const M = 18;    // margen
export const CW = PW - M * 2;

/** Y a partir de la cual empieza el contenido (debajo del membrete). */
export const Y_CONTENIDO = 32;
/** Y del pie: nada de contenido puede pasar de acá. */
export const Y_PIE = PH - 18;

// ── Paleta ───────────────────────────────────────────────────────────────────
// Sobria y consistente con la app. El color SEÑALA (positivo / negativo /
// alerta / estimado); no decora.

export type RGB = [number, number, number];

export const C = {
  primary: [30, 64, 175] as RGB,
  primaryLight: [219, 234, 254] as RGB,
  dark: [31, 41, 55] as RGB,
  medium: [107, 114, 128] as RGB,
  light: [243, 244, 246] as RGB,
  white: [255, 255, 255] as RGB,
  green: [22, 163, 74] as RGB,
  red: [220, 38, 38] as RGB,
  amber: [217, 119, 6] as RGB,
  amberLight: [254, 243, 199] as RGB,
  cyan: [8, 145, 178] as RGB,
  tableAlt: [248, 250, 252] as RGB,
  grid: [225, 228, 232] as RGB,
};

// ── Formato ──────────────────────────────────────────────────────────────────

export const fmt = (n: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

/** Importe con signo explícito — para variaciones y para el puente. */
export const fmtDelta = (n: number): string => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`;

/** Cantidades: sin $, separador de miles argentino. */
export const fmtCant = (n: number): string =>
  new Intl.NumberFormat('es-AR').format(Math.round(n));

/**
 * Porcentajes SIEMPRE con un decimal y coma decimal: "54,2%", no "54.2%".
 * `toFixed` devuelve punto y se colaba en todas las tablas del informe.
 */
const unDecimal = (n: number): string =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

export const fmtPct = (n: number): string => `${unDecimal(n)}%`;

export const fmtPctDelta = (n: number): string => `${n >= 0 ? '+' : ''}${unDecimal(n)}%`;

/** Diferencia de dos porcentajes, en puntos porcentuales. */
export const varPP = (a: number, b: number): string => {
  const d = a - b;
  return `${d >= 0 ? '+' : ''}${unDecimal(d)} pp`;
};

export interface Variacion {
  /** Variación porcentual. 0 si no se puede calcular. */
  pct: number;
  /** Diferencia absoluta. */
  abs: number;
  /** Texto listo para imprimir. Nunca "N/A": ver `calculable`. */
  texto: string;
  /** true si la variación mejora el número (para elegir color). */
  pos: boolean;
  /**
   * false cuando la base es cero y el porcentaje no tiene sentido. El llamador
   * imprime la explicación en palabras en vez de un "N/A" mudo.
   */
  calculable: boolean;
}

export const vari = (actual: number, anterior: number): Variacion => {
  const abs = actual - anterior;
  if (!anterior) {
    return {
      pct: 0, abs, pos: abs >= 0, calculable: false,
      texto: anterior === 0 && actual === 0 ? 'sin movimiento' : 'sin base de comparación',
    };
  }
  const pct = (abs / Math.abs(anterior)) * 100;
  return { pct, abs, pos: pct >= 0, calculable: true, texto: fmtPctDelta(pct) };
};

/** Alinea los encabezados de autoTable con los datos de su columna. */
export type HAlign = 'left' | 'center' | 'right';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const alinear = (d: any, aligns: Record<number, HAlign>) => {
  if (d.section === 'head') {
    const a = aligns[d.column.index];
    if (a) d.cell.styles.halign = a;
  }
};

// ── Lienzo ───────────────────────────────────────────────────────────────────

export type Orientacion = 'p' | 'l';

export interface Lienzo {
  doc: jsPDF;
  /** Cursor vertical en mm. */
  y: number;
  /** Ancho y alto de la hoja: cambian con la orientación. */
  pw: number;
  ph: number;
  /** Ancho útil entre márgenes. */
  cw: number;
  orient: Orientacion;
  /** Bajada del membrete de cada hoja: "Informe de Gestión — Julio 2026". */
  subtitulo: string;
  /** Título de la sección en curso, a la derecha del membrete. */
  seccion: string;
  /** Índice: se llena a medida que se abren secciones, se dibuja al final. */
  indice: { titulo: string; pagina: number }[];
}

/** Y del pie para un lienzo dado. */
export const pieDe = (L: Lienzo): number => L.ph - 18;

export function nuevoLienzo(subtitulo: string, orient: Orientacion = 'p'): Lienzo {
  const pw = orient === 'l' ? PH : PW;
  const ph = orient === 'l' ? PW : PH;
  return {
    doc: new jsPDF(orient, 'mm', 'a4'),
    y: Y_CONTENIDO,
    pw, ph, cw: pw - M * 2, orient,
    subtitulo,
    seccion: '',
    indice: [],
  };
}

/** Membrete de la hoja actual. */
export function membrete(L: Lienzo) {
  const { doc } = L;
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, L.pw, 22, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Instituto Dr. Mercado', M, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(L.subtitulo, M, 15);
  if (L.seccion) doc.text(L.seccion, L.pw - M, 12, { align: 'right' });
}

/**
 * Abre hoja nueva con su membrete. El pie NO se dibuja acá: lo estampa
 * `cerrar()` recorriendo todas las páginas, que es la única forma de poder
 * escribir "Página X de Y" (Y no se conoce hasta el final) y de no dejar sin
 * pie las hojas que abre jspdf-autotable por su cuenta.
 */
export function nuevaHoja(L: Lienzo, seccion?: string) {
  L.doc.addPage();
  if (seccion !== undefined) L.seccion = seccion;
  membrete(L);
  L.y = Y_CONTENIDO;
}

/** Asegura `alto` mm libres antes del pie; si no entran, abre hoja. */
export function asegurar(L: Lienzo, alto: number) {
  if (L.y + alto > pieDe(L)) nuevaHoja(L);
}

/**
 * Abre una sección: título subrayado, y la registra para el índice.
 * `alto` es el espacio que necesita el primer bloque de la sección, para no
 * dejar un título huérfano al pie de una hoja.
 */
export function seccion(L: Lienzo, titulo: string, opts: { hojaNueva?: boolean; alto?: number } = {}) {
  if (opts.hojaNueva) nuevaHoja(L, titulo);
  else asegurar(L, (opts.alto ?? 20) + 12);
  L.seccion = titulo;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.indice.push({ titulo, pagina: (L.doc as any).getCurrentPageInfo().pageNumber });

  const { doc } = L;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  doc.text(titulo, M, L.y);
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.5);
  doc.line(M, L.y + 2, M + L.cw, L.y + 2);
  doc.setTextColor(...C.dark);
  L.y += 9;
}

export function parrafo(
  L: Lienzo,
  texto: string,
  opts: { size?: number; color?: RGB; bold?: boolean } = {},
) {
  const size = opts.size ?? 9;
  const { doc } = L;
  doc.setFontSize(size);
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setTextColor(...(opts.color ?? C.dark));
  const lineas = doc.splitTextToSize(texto, L.cw) as string[];
  asegurar(L, lineas.length * (size * 0.47) + 3);
  doc.text(lineas, M, L.y);
  doc.setTextColor(...C.dark);
  doc.setFont('helvetica', 'normal');
  L.y += lineas.length * (size * 0.47) + 3;
}

/** Viñeta de lectura del mes. */
export function vinieta(L: Lienzo, texto: string, color: RGB = C.dark) {
  const { doc } = L;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const lineas = doc.splitTextToSize(texto, L.cw - 6) as string[];
  asegurar(L, lineas.length * 4.3 + 2);
  doc.setFillColor(...color);
  doc.circle(M + 1.5, L.y - 1.2, 0.9, 'F');
  doc.setTextColor(...C.dark);
  doc.text(lineas, M + 5, L.y);
  L.y += lineas.length * 4.3 + 2;
}

/**
 * Recuadro de advertencia. Se usa para el sello de dato simulado, que por
 * definición tiene que verse en CADA sección donde aparezca el número, no sólo
 * una vez al pie del informe.
 */
export function aviso(L: Lienzo, texto: string, tono: 'alerta' | 'info' = 'alerta') {
  const { doc } = L;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const lineas = doc.splitTextToSize(texto, L.cw - 8) as string[];
  const alto = lineas.length * 3.8 + 5;
  asegurar(L, alto + 2);
  const fondo = tono === 'alerta' ? C.amberLight : C.primaryLight;
  const borde = tono === 'alerta' ? C.amber : C.primary;
  doc.setFillColor(...fondo);
  doc.setDrawColor(...borde);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, L.y - 3.5, L.cw, alto, 1.5, 1.5, 'FD');
  doc.setTextColor(...borde);
  doc.text(lineas, M + 4, L.y + 0.5);
  doc.setTextColor(...C.dark);
  L.y += alto + 2;
}

/** Ficha de indicador: etiqueta, valor grande y hasta dos comparaciones. */
export function kpi(
  L: Lienzo,
  x: number, y: number, w: number,
  label: string, valor: string,
  comparaciones: { etiqueta: string; texto: string; pos: boolean; neutro?: boolean }[] = [],
) {
  const { doc } = L;
  const alto = 15 + comparaciones.length * 4;
  doc.setFillColor(...C.light);
  doc.roundedRect(x, y, w, alto, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.medium);
  doc.text(label, x + 3, y + 5);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.dark);
  doc.text(valor, x + 3, y + 12);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  comparaciones.forEach((c, i) => {
    const col = c.neutro ? C.medium : (c.pos ? C.green : C.red);
    doc.setTextColor(...C.medium);
    doc.text(c.etiqueta, x + 3, y + 16.5 + i * 4);
    doc.setTextColor(col[0], col[1], col[2]);
    doc.text(c.texto, x + w - 3, y + 16.5 + i * 4, { align: 'right' });
  });
  doc.setTextColor(...C.dark);
}

// ── Gráficos vectoriales ─────────────────────────────────────────────────────
// Dibujados con primitivas de jsPDF: nada de imágenes rasterizadas.

export interface PuntoSerie {
  etiqueta: string;
  /** Serie de barras. */
  barra: number;
  /** Serie de línea superpuesta (opcional). */
  linea?: number;
  /** Marca la barra como estimada (se dibuja rayada). */
  estimado?: boolean;
}

/**
 * Barras + línea opcional sobre eje secundario. Devuelve el alto consumido.
 * `formatoEje` decide si la escala se rotula como plata o como cantidad.
 */
export function graficoBarrasLinea(
  L: Lienzo,
  serie: PuntoSerie[],
  opts: {
    alto?: number;
    formatoEje?: (n: number) => string;
    colorBarra?: RGB;
    colorLinea?: RGB;
    leyendaBarra?: string;
    leyendaLinea?: string;
  } = {},
) {
  if (!serie.length) return;
  const { doc } = L;
  const alto = opts.alto ?? 46;
  const fmtEje = opts.formatoEje ?? ((n: number) => fmtCant(n / 1_000_000) + ' M');
  const colBarra = opts.colorBarra ?? C.primaryLight;
  const colLinea = opts.colorLinea ?? C.cyan;

  asegurar(L, alto + 16);

  const gX = M + 20;              // deja lugar a los rótulos del eje
  const gW = L.cw - 20;
  const gTop = L.y;
  const gBot = L.y + alto;

  // Escala: incluye el 0 para que las barras no mientan sobre su tamaño.
  const valores = serie.map(s => s.barra);
  const lineas = serie.filter(s => s.linea !== undefined).map(s => s.linea as number);
  const max = Math.max(0, ...valores, ...lineas);
  const min = Math.min(0, ...valores, ...lineas);
  const rango = max - min || 1;
  const escY = (v: number) => gBot - ((v - min) / rango) * alto;

  // Grilla horizontal y rótulos
  doc.setFontSize(6);
  doc.setTextColor(...C.medium);
  doc.setDrawColor(...C.grid);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const v = min + (rango * i) / 4;
    const yy = escY(v);
    doc.line(gX, yy, gX + gW, yy);
    doc.text(fmtEje(v), gX - 2, yy + 1.2, { align: 'right' });
  }

  // Cero marcado si la escala lo cruza
  if (min < 0 && max > 0) {
    doc.setDrawColor(...C.medium);
    doc.setLineWidth(0.3);
    doc.line(gX, escY(0), gX + gW, escY(0));
  }

  const paso = gW / serie.length;
  const anchoBarra = Math.min(paso * 0.55, 11);

  serie.forEach((s, i) => {
    const cx = gX + paso * (i + 0.5);
    const y0 = escY(0);
    const y1 = escY(s.barra);
    doc.setFillColor(...colBarra);
    doc.rect(cx - anchoBarra / 2, Math.min(y0, y1), anchoBarra, Math.abs(y1 - y0), 'F');
    // Las barras estimadas se rayan: se tienen que poder distinguir impresas
    // en blanco y negro, no sólo por color.
    if (s.estimado) {
      doc.setDrawColor(...C.amber);
      doc.setLineWidth(0.4);
      const yTop = Math.min(y0, y1), h = Math.abs(y1 - y0);
      for (let k = 1; k < h; k += 2.2) {
        doc.line(cx - anchoBarra / 2, yTop + k, cx + anchoBarra / 2, yTop + k);
      }
    }
    doc.setFontSize(6);
    doc.setTextColor(...C.medium);
    doc.text(s.etiqueta, cx, gBot + 4, { align: 'center' });
  });

  // Línea superpuesta
  if (lineas.length) {
    doc.setDrawColor(...colLinea);
    doc.setLineWidth(0.6);
    let prev: [number, number] | null = null;
    serie.forEach((s, i) => {
      if (s.linea === undefined) return;
      const cx = gX + paso * (i + 0.5);
      const cy = escY(s.linea);
      if (prev) doc.line(prev[0], prev[1], cx, cy);
      prev = [cx, cy];
    });
    doc.setFillColor(...colLinea);
    serie.forEach((s, i) => {
      if (s.linea === undefined) return;
      doc.circle(gX + paso * (i + 0.5), escY(s.linea), 0.8, 'F');
    });
  }

  L.y = gBot + 8;

  // Leyenda
  if (opts.leyendaBarra || opts.leyendaLinea) {
    doc.setFontSize(6.5);
    let lx = M;
    if (opts.leyendaBarra) {
      doc.setFillColor(...colBarra);
      doc.rect(lx, L.y - 2.2, 4, 2.6, 'F');
      doc.setTextColor(...C.medium);
      doc.text(opts.leyendaBarra, lx + 5.5, L.y);
      lx += 8 + doc.getTextWidth(opts.leyendaBarra);
    }
    if (opts.leyendaLinea) {
      doc.setDrawColor(...colLinea);
      doc.setLineWidth(0.6);
      doc.line(lx, L.y - 1, lx + 4, L.y - 1);
      doc.setTextColor(...C.medium);
      doc.text(opts.leyendaLinea, lx + 5.5, L.y);
    }
    doc.setTextColor(...C.dark);
    L.y += 5;
  }
}

export interface BarraPuente {
  etiqueta: string;
  /** Contribución con signo. El total se dibuja como columna anclada al cero. */
  valor: number;
  tipo: 'inicio' | 'delta' | 'fin';
}

/**
 * Gráfico de puente (waterfall). Cada delta arranca donde terminó el anterior,
 * así se ve cómo se llega del resultado de un mes al del siguiente.
 */
export function graficoPuente(L: Lienzo, barras: BarraPuente[], opts: { alto?: number } = {}) {
  if (!barras.length) return;
  const { doc } = L;
  const alto = opts.alto ?? 52;
  asegurar(L, alto + 20);

  const gX = M + 22;
  const gW = L.cw - 22;
  const gTop = L.y;
  const gBot = L.y + alto;

  // Acumulados para saber dónde arranca y termina cada columna
  const tramos: { desde: number; hasta: number; b: BarraPuente }[] = [];
  let acum = 0;
  for (const b of barras) {
    if (b.tipo === 'inicio' || b.tipo === 'fin') {
      tramos.push({ desde: 0, hasta: b.valor, b });
      acum = b.valor;
    } else {
      tramos.push({ desde: acum, hasta: acum + b.valor, b });
      acum += b.valor;
    }
  }

  const todos = tramos.flatMap(t => [t.desde, t.hasta]);
  const max = Math.max(0, ...todos);
  const min = Math.min(0, ...todos);
  const rango = max - min || 1;
  const escY = (v: number) => gBot - ((v - min) / rango) * alto;

  doc.setFontSize(6);
  doc.setDrawColor(...C.grid);
  doc.setLineWidth(0.15);
  doc.setTextColor(...C.medium);
  for (let i = 0; i <= 4; i++) {
    const v = min + (rango * i) / 4;
    const yy = escY(v);
    doc.line(gX, yy, gX + gW, yy);
    doc.text(fmtCant(v / 1_000_000) + ' M', gX - 2, yy + 1.2, { align: 'right' });
  }
  doc.setDrawColor(...C.medium);
  doc.setLineWidth(0.3);
  doc.line(gX, escY(0), gX + gW, escY(0));

  const paso = gW / tramos.length;
  const ancho = Math.min(paso * 0.6, 15);

  tramos.forEach((t, i) => {
    const cx = gX + paso * (i + 0.5);
    const yA = escY(t.desde);
    const yB = escY(t.hasta);
    const esExtremo = t.b.tipo !== 'delta';
    const col: RGB = esExtremo ? C.primary : (t.b.valor >= 0 ? C.green : C.red);
    doc.setFillColor(col[0], col[1], col[2]);
    doc.rect(cx - ancho / 2, Math.min(yA, yB), ancho, Math.max(Math.abs(yB - yA), 0.5), 'F');

    // Conector punteado hasta la columna siguiente
    if (i < tramos.length - 1 && t.b.tipo !== 'fin') {
      doc.setDrawColor(...C.medium);
      doc.setLineWidth(0.2);
      const yFin = escY(t.hasta);
      const xIni = cx + ancho / 2;
      const xFin = gX + paso * (i + 1.5) - ancho / 2;
      for (let x = xIni; x < xFin; x += 1.6) {
        doc.line(x, yFin, Math.min(x + 0.8, xFin), yFin);
      }
    }

    // Valor arriba (o abajo si la columna baja)
    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(esExtremo ? C.primary : (t.b.valor >= 0 ? C.green : C.red)));
    const texto = esExtremo ? fmtCant(t.b.valor / 1_000_000) + ' M' : fmtDelta(t.b.valor / 1_000_000) + ' M';
    doc.text(texto, cx, Math.min(yA, yB) - 1.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...C.medium);
    const et = doc.splitTextToSize(t.b.etiqueta, paso + 4) as string[];
    doc.text(et.slice(0, 2), cx, gBot + 4, { align: 'center' });
  });

  doc.setTextColor(...C.dark);
  L.y = gBot + 12;
}

// ── Cierre ───────────────────────────────────────────────────────────────────

/**
 * Estampa el pie en TODAS las hojas con "Página X de Y". Recorrerlas al final es
 * la única forma de conocer el total, y además cubre las hojas que abre
 * jspdf-autotable por su cuenta, que no pasan por `nuevaHoja`.
 */
export function cerrar(L: Lienzo, leyendaPie: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = L.doc as any;
  const total: number = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // El tamaño se lee de CADA hoja y no del lienzo: un informe puede mezclar
    // vertical y apaisado (la grilla del estado de resultados va apaisada) y el
    // pie tiene que caer donde corresponde en las dos.
    const pw: number = doc.internal.pageSize.getWidth();
    const ph: number = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(M, ph - 14, pw - M, ph - 14);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.medium);
    doc.text(leyendaPie, M, ph - 9);
    doc.text(`Página ${p} de ${total}`, pw - M, ph - 9, { align: 'right' });
  }
  doc.setPage(total);
}
