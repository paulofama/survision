// ============================================================
// Sobre Quirúrgico — builders de los documentos (jsPDF)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Cada builder dibuja UN documento sobre el Lienzo recibido, arrancando en la
// hoja actual (el orquestador de index.ts abre una hoja nueva entre documentos).
// El contenido replica los formularios reales de la clínica.
//
// SEPARACIÓN POR DESTINO (regla de negocio, testeo Administración 10/08/2026):
//   - Se lleva el PACIENTE: pedido de cirugía, indicaciones, cronograma,
//     recetas, análisis/ECG y el comprobante de caja.
//   - Se archiva en QUIRÓFANO, desprendible: hoja de trazabilidad y
//     consentimiento informado. Cada uno en su HOJA PROPIA, sin contenido del
//     paciente compartiendo la página.
// ============================================================

import autoTable from "jspdf-autotable";
import {
  Lienzo, M, alinear,
  titulo, subtitulo, parrafo, vinieta, campo, campo2, espacio, rp, checkbox, firmas,
  asegurar, destino, importe, separador, membrete,
} from "./pdfBase";

// ── Contexto de datos (pre-carga desde el presupuesto + aceptación) ──

/** Cómo se determinó el depósito en garantía (Particular). */
export type DepositoModalidad = "MONTO" | "PORCENTAJE";

/** Lo que el operador carga en el modal de Ingreso de caja. */
export interface CajaOpts {
  /** Particular: MONTO fijo o PORCENTAJE sobre el valor total de la cirugía. */
  depositoModalidad: DepositoModalidad | null;
  /** Particular: $ si MONTO, % si PORCENTAJE. */
  depositoValor: number | null;
  /** Obra social: monto único (sin desglose de IVA), antes del descuento autorizado. */
  montoUnico: number | null;
}

export interface ItemAdicional {
  descripcion: string;
  monto: number;
}

export interface SobreCtx {
  numeroPresupuesto: string;
  paciente: {
    apellidoNombre: string;
    documento: string;
    edad: string;
    telefono: string;
    obraSocial: string;
    numeroAfiliado: string;
  };
  ojo: "OD" | "OI" | "AMBOS" | null;
  ojoDiag: string;           // "OD" / "OI" / "AO" para el diagnóstico
  ojoTexto: string;          // "ojo derecho" / etc. legible
  fechaCirugia: string;      // dd/mm/aaaa o ""
  fechaHoy: string;          // dd/mm/aaaa — emisión (recetas, comprobantes)
  lioNombre: string;
  requiereAnalisisEcg: boolean;
  // ── Cobertura ──
  esObraSocial: boolean;
  /** "circulo_medico" | "directa" | null (null = Particular). */
  subRama: string | null;
  /** Nombre a mostrar: "Particular" o la obra social del paciente. */
  coberturaLabel: string;
  /** Convenio/vía de autorización (sólo obra social). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convenio: { nombre: string; subRama: string; codigo: string; config: Record<string, any> } | null;
  // ── Importes del presupuesto ──
  precios: {
    /** Base de la cirugía después de la cobertura de la OS, ANTES del descuento. */
    baseAntesDescuento: number;
    descuento: number;
    porcentajeDescuento: number;
    neto: number;
    iva: number;
    total: number;
  };
  /** Insumos / medicación cargados en el presupuesto (ej. ampolla de Avastin). */
  itemsAdicionales: ItemAdicional[];
  /**
   * true si la cobertura carga las recetas por su propio sistema (OSEP): no se
   * emite la receta en papel de la medicación adicional.
   */
  recetasPorSistema: boolean;
  /** Datos que carga el operador al generar el comprobante de caja. */
  caja: CajaOpts;
  consentimiento: { titulo: string; cuerpo: string }[];
  fmtARS: (n: number) => string;
}

const TXT_SOLICITUD = "Cirugía de catarata con técnica de facoemulsificación implante de lio plegable.";

const pesos = (ctx: SobreCtx, n: number): string => `$ ${ctx.fmtARS(n)}`;

/**
 * Qué está pagando el paciente, en el formato pedido por Administración:
 * "Cirugía de catarata con LIO X + ampolla de Avastin".
 */
export function conceptoCompleto(ctx: SobreCtx): string {
  const base = ctx.lioNombre
    ? `Cirugía de catarata con LIO ${ctx.lioNombre}`
    : "Cirugía de catarata";
  return [base, ...ctx.itemsAdicionales.map((i) => i.descripcion)].join(" + ");
}

// ============================================================
// DOC 1 — Pedido de cirugía (según convenio)
// ============================================================
export function docPedidoCirugia(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Pedido de cirugía");
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  rp(L);
  campo(L, "Paciente", ctx.paciente.apellidoNombre);

  // El N° de afiliado SÓLO existe si hay obra social. En Particular ni siquiera
  // se dibuja el campo (antes salía "O. Social: Particular / N°: ___").
  if (ctx.esObraSocial) {
    campo2(L, "Obra social", ctx.coberturaLabel, "N° de afiliado", ctx.paciente.numeroAfiliado);
    if (ctx.subRama === "circulo_medico" && ctx.convenio?.nombre) {
      campo(L, "Vía de autorización", ctx.convenio.nombre);
    }
  } else {
    campo(L, "Cobertura", "Particular");
  }
  // El ojo a operar va SIEMPRE, en todas las coberturas.
  campo(L, "Ojo a operar", ctx.ojoTexto);
  espacio(L, 2);

  subtitulo(L, "Solicito");
  parrafo(L, TXT_SOLICITUD, { size: 10 });
  espacio(L, 1);

  const cfg = ctx.convenio?.config || {};
  const diagRaw = String(cfg.diag || "Catarata");
  const diag = diagRaw.replace("{ojo}", ctx.ojoDiag);
  campo(L, "Diagnóstico", diag);
  campo(L, "LIO indicado", ctx.lioNombre);
  if (ctx.convenio?.codigo) campo(L, "Código", ctx.convenio.codigo);

  // Extras por convenio
  if (cfg.leyenda) { espacio(L, 1); parrafo(L, String(cfg.leyenda), { size: 9, bold: true }); }
  if (Array.isArray(cfg.lineas)) {
    for (const ln of cfg.lineas) campo(L, String(ln), "");
  }
  if (cfg.cuenta) campo(L, "Cuenta Survisión", String(cfg.cuenta));
  if (cfg.cupo !== undefined) campo(L, "CUPO", String(cfg.cupo || ""));

  espacio(L, 2);
  campo(L, "Fecha de cirugía", ctx.fechaCirugia);
  firmas(L, ["Firma y sello del médico"]);
}

// ============================================================
// DOC 2 — Indicaciones para la cirugía (paciente)
// ============================================================
export function docIndicaciones(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Indicaciones para cirugía de cataratas");
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  campo(L, "Nombre y Apellido", ctx.paciente.apellidoNombre);
  campo2(L, "Ojo a operar", ctx.ojoTexto, "Turno de cirugía", ctx.fechaCirugia);
  campo(L, "Hora de llegada", "a confirmar 72 HS a 24 HS antes");
  espacio(L, 2);

  subtitulo(L, "Tratamiento prequirúrgico", { size: 11 });
  parrafo(L, "La noche anterior tomará un tranquilizante para ayudar a un buen descanso (puede repetirse antes de la cirugía si es necesario).", { size: 10 });
  parrafo(L, "El tratamiento con gotas comienza UN DÍA antes de la cirugía y continúa por 3 semanas después. Se realiza de 8:00 (mañana) a 24:00 (noche); el paciente descansa durante la noche.", { size: 10 });
  parrafo(L, "Se utilizan tres tipos de gotas y un analgésico en comprimidos desde el día de la cirugía:", { size: 10 });
  vinieta(L, "NATAX (antiinflamatorio)", { size: 10 });
  vinieta(L, "AUCIC PLUS (lubricante ocular)", { size: 10 });
  vinieta(L, "GATIF FORTE (antibiótico)", { size: 10 });
  vinieta(L, "Dolten comprimido (analgésico)", { size: 10 });
  espacio(L, 1);
  parrafo(L, "MEDICACIÓN INDICADA POR SU MÉDICO DE CABECERA NO DEBE SER SUSPENDIDA DURANTE EL TRATAMIENTO.", { bold: true, size: 10, color: [150, 30, 30] });
  espacio(L, 2);

  subtitulo(L, "El día de la cirugía deberá concurrir", { size: 11 });
  vinieta(L, "Con camisa con botones al frente (no remera ni camiseta), para el monitoreo cardiovascular.", { size: 10 });
  vinieta(L, "Sin cremas, maquillaje ni alhajas.", { size: 10 });
  vinieta(L, "Acompañado por una sola persona.", { size: 10 });
  vinieta(L, "Tomar Dolten 1 comprimido cada 12 hs antes de la cirugía y por 3 días posteriores (puede reemplazarse por ibuprofeno, tafirol o su analgésico autorizado).", { size: 10 });
  espacio(L, 1);
  parrafo(L, "Al llegar a quirófano se solicitará el sobre quirúrgico, que debe contener: antiparras transparentes de protección y los formularios completos de trazabilidad y el consentimiento firmado.", { size: 10 });
  espacio(L, 2);

  subtitulo(L, "Cuidados post-quirúrgicos", { size: 11 });
  parrafo(L, "Al retirarse del instituto: permanecer una hora con el ojo cerrado (no tapado) y continuar el cronograma de gotas, tomando el párpado inferior para colocarlas y así evitar apretar las incisiones.", { size: 10 });
  parrafo(L, "La primera noche: dormir con las antiparras de protección y con dos almohadas. Al colocarse las antiparras, tomarlas por las patillas para no golpear el ojo.", { size: 10 });
  subtitulo(L, "NO deberá", { size: 10.5 });
  vinieta(L, "Apretarse ni frotarse el ojo.", { size: 10 });
  vinieta(L, "Agacharse, levantar peso o exponerse a golpes.", { size: 10 });
  subtitulo(L, "Podrá", { size: 10.5 });
  vinieta(L, "Estar acostado o sentado, mirar televisión, leer, asistir a reuniones.", { size: 10 });
  vinieta(L, "Mantener su alimentación habitual.", { size: 10 });
  parrafo(L, "Para higienizar el ojo: hervir agua con manzanilla y colocar compresas TIBIAS con gasas estériles.", { size: 10 });
  espacio(L, 1);
  parrafo(L, "URGENCIAS: 2604-669362 (9 a 21 hs).", { bold: true, size: 10.5 });
  parrafo(L, "CONSULTAS POR CIRUGÍA DE CATARATA: 2604-673230 (9 a 13 hs), únicamente por WhatsApp.", { bold: true, size: 10.5 });
}

// ============================================================
// DOC 3 — Cronograma de gotas + instructivo (A4 APAISADO, letra grande)
// ============================================================
// Lo lee el propio paciente, que viene de una catarata: prioridad absoluta a la
// legibilidad. Hoja apaisada propia, cuerpo de tabla 14pt.
export function docCronograma(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Cronograma de tratamiento quirúrgico", { size: 17 });
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  campo(L, "Paciente", ctx.paciente.apellidoNombre, { size: 12 });
  campo2(L, "Ojo a operar", ctx.ojoTexto, "Turno de cirugía", ctx.fechaCirugia, { size: 12 });
  espacio(L, 2);

  // Contenido y estructura CONFIRMADOS por Administración (11/08/2026): no se
  // modifican. Lo único que cambia respecto del original es el tamaño de letra
  // y la hoja apaisada, para que lo puedan leer el paciente y sus acompañantes.
  parrafo(L, "Complete el ojo en cada semana. G = Gatif Forte · N = Natax · A = Aucic Plus · D = Dolten.", { size: 11 });
  const cron: string[][] = [
    ["8:00",  "Gatif Forte + Natax + Dolten (desde el día de la cirugía)", "Gatif Forte + Natax", "Natax"],
    ["10:00", "Aucic Plus", "Aucic Plus", "Aucic Plus"],
    ["12:00", "Gatif Forte", "—", "—"],
    ["14:00", "Aucic Plus", "Aucic Plus", "Aucic Plus"],
    ["16:00", "Gatif Forte", "Gatif Forte", "—"],
    ["18:00", "Aucic Plus", "Aucic Plus", "Aucic Plus"],
    ["20:00", "Gatif Forte + Natax + Dolten", "Natax", "Natax"],
    ["22:00", "Aucic Plus", "Aucic Plus", "Aucic Plus"],
    ["24:00", "Gatif Forte", "Gatif Forte", "—"],
  ];
  // Si la tabla no entra, autoTable abre la hoja por su cuenta (sin pasar por
  // `nuevaHoja`): el hook le pone el membrete. `margin.top` deja libre esa
  // franja para que no se pise con el contenido.
  let primeraHoja = true;
  autoTable(L.doc, {
    startY: L.y,
    margin: { left: M, right: M, top: 38, bottom: 24 },
    head: [["Hora", "Semana 1 — AL OJO: ____", "Semana 2 — AL OJO: ____", "Semana 3 — AL OJO: ____"]],
    body: cron,
    styles: { fontSize: 14, cellPadding: 2.2, valign: "middle", lineWidth: 0.2, lineColor: [170, 170, 170] },
    headStyles: { fillColor: [20, 40, 90], textColor: [255, 255, 255], fontSize: 13, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 247, 252] },
    columnStyles: { 0: { cellWidth: 24, halign: "center", fontStyle: "bold" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => alinear(d, { 0: "center", 1: "left", 2: "left", 3: "left" }),
    didDrawPage: () => {
      if (primeraHoja) { primeraHoja = false; return; }
      membrete(L);
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 6;

  // Instructivo de gotas — también agrandado (lo lee el paciente).
  asegurar(L, 60);
  titulo(L, "Instructivo de colocación de gotas", { size: 16 });
  vinieta(L, "1) Lavarse las manos con abundante agua y jabón; mantener las uñas cortas.", { size: 13 });
  vinieta(L, "2) Inclinar la cabeza hacia atrás (sentado, parado o acostado) y agitar el gotero antes de cada colocación.", { size: 13 });
  vinieta(L, "3) Colocar el dedo en el punto blando debajo del párpado inferior, tirar hacia abajo lentamente y dejar caer la gota dentro del ojo.", { size: 13 });
  vinieta(L, "4) Soltar el párpado inferior y cerrar los ojos suavemente.", { size: 13 });
}

// ============================================================
// DOC 4 — Recetas de medicación (UNA POR HOJA, con membrete completo)
// ============================================================
// El membrete (logo institucional, dirección, teléfono y fecha) lo dibuja
// `cabecera()` de pdfBase en cada hoja nueva: por eso cada receta va en su
// propia página.

export interface RecetaDef {
  titulo: string;
  items: string[];
  diag: string;
}

const RECETAS: RecetaDef[] = [
  {
    titulo: "Receta A",
    items: [
      "Gatif forte 1 (UNO) — (Gatifloxacina 0,5%)",
      "NATAX 1 (UNO) — (Bromfenac)",
    ],
    diag: "Cataratas",
  },
  {
    titulo: "Receta B",
    items: [
      "AUCIC PLUS 1 (UNO) — (Carboximetilcelulosa sódica + asociados)",
      "DOLTEN 10 mg x 10 COMP. — (Ketorolak 10 mg)",
    ],
    diag: "Cataratas",
  },
  {
    titulo: "Receta C",
    items: [
      "Tranquinal sublingual x 0,5 mg — 1 caja — (Alprazolam)",
    ],
    diag: "Cirugía ocular",
  },
];

/** Dibuja UNA receta en la hoja actual (que ya trae el membrete). */
export function docReceta(L: Lienzo, ctx: SobreCtx, def: RecetaDef) {
  titulo(L, def.titulo);
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  if (ctx.esObraSocial) {
    campo2(L, "Obra social", ctx.coberturaLabel, "N° de afiliado", ctx.paciente.numeroAfiliado);
  } else {
    campo(L, "Cobertura", "Particular");
  }
  espacio(L, 2);
  rp(L);
  for (const it of def.items) vinieta(L, it, { bold: true, size: 11 });
  espacio(L, 2);
  campo(L, "Dx", def.diag);
  campo(L, "Fecha", ctx.fechaHoy);
  firmas(L, ["Firma y sello del médico"]);
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Recetas de la medicación agregada en el presupuesto (ej. ampolla de Avastin).
 * EXCEPCIÓN: si la cobertura carga las recetas por su propio sistema (OSEP),
 * no se emiten en papel.
 */
export function recetasDeMedicacionAdicional(ctx: SobreCtx): RecetaDef[] {
  if (ctx.recetasPorSistema) return [];
  return ctx.itemsAdicionales.map((it, i) => ({
    titulo: `Receta ${LETRAS[RECETAS.length + i] || String(RECETAS.length + i + 1)} - Medicación adicional`,
    items: [it.descripcion],
    diag: "Cirugía de catarata",
  }));
}

/** Todas las recetas del sobre: las 3 fijas + las de medicación adicional. */
export function recetasDelSobre(ctx: SobreCtx): RecetaDef[] {
  return [...RECETAS, ...recetasDeMedicacionAdicional(ctx)];
}

/** Cada receta en su hoja. `abrirHoja` la provee el orquestador. */
export function docRecetas(L: Lienzo, ctx: SobreCtx, abrirHoja: (L: Lienzo) => void) {
  recetasDelSobre(ctx).forEach((def, i) => {
    if (i > 0) abrirHoja(L);
    docReceta(L, ctx, def);
  });
}

// ============================================================
// DOC 5 — Análisis y ECG (condicional)
// ============================================================
export function docAnalisisEcg(L: Lienzo, ctx: SobreCtx) {
  // Solicitud de laboratorio
  titulo(L, "Solicitud de laboratorio");
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  campo(L, "Nombre", ctx.paciente.apellidoNombre);
  if (ctx.esObraSocial) {
    campo2(L, "Obra social", ctx.coberturaLabel, "N° de afiliado", ctx.paciente.numeroAfiliado);
  } else {
    campo(L, "Cobertura", "Particular");
  }
  campo(L, "Laboratorio", "");
  espacio(L, 1);
  subtitulo(L, "Solicito");
  const dets = ["Hemograma", "VSG", "Glucemia", "Uremia", "Colesterol", "Triglicéridos", "Tiempo de coagulación", "Tiempo de sangría", "TTPK", "Orina completo", "Hb glicosilada"];
  // Checklist en dos columnas, todas tildadas (panel prequirúrgico estándar).
  const colX = [M, M + L.cw / 2];
  let idx = 0;
  for (let fila = 0; fila < Math.ceil(dets.length / 2); fila++) {
    asegurar(L, 7);
    for (let c = 0; c < 2 && idx < dets.length; c++) {
      checkbox(L, colX[c], L.y, dets[idx], true);
      idx++;
    }
    L.y += 6;
  }
  espacio(L, 4);

  // Solicitud de ECG
  titulo(L, "Solicitud de ECG");
  campo(L, "Nombre", ctx.paciente.apellidoNombre);
  campo(L, ctx.esObraSocial ? "Obra social" : "Cobertura", ctx.coberturaLabel);
  espacio(L, 1);
  subtitulo(L, "Solicito");
  parrafo(L, "ECG Y RIESGO QUIRÚRGICO (ANESTESIA LOCAL-GENERAL)", { bold: true });
  campo(L, "Diagnóstico", "Cirugía de catarata");
  campo(L, "Fecha", ctx.fechaHoy);
  firmas(L, ["Firma y sello del médico"]);
}

// ============================================================
// DOC 6 — Ingreso de caja (según cobertura)
// ============================================================
// Reglas (Administración, 10/08/2026 + ajustes del 11/08/2026):
//   - IVA: NINGÚN comprobante lo discrimina, en ninguna cobertura. Sólo el
//     valor total. Las líneas replican el detalle del presupuesto que el
//     paciente ya tiene firmado (subtotal / descuento / insumos / total).
//   - El monto lo carga SIEMPRE el operador a mano: en Particular como monto
//     fijo o porcentaje; en obra social como monto único. Nada automático.
//   - El comprobante detalla el OJO a operar y el concepto completo
//     ("Cirugía de catarata con LIO X + ampolla de Avastin").
//   - El descuento autorizado va como línea propia con la aclaración
//     "Exento de IVA" (con descuento no se emite factura), en TODAS las
//     coberturas.
//   - Todos los ítems adicionales del presupuesto se detallan acá.

/**
 * Base sobre la que se calcula el depósito por porcentaje.
 * Decisión vigente: el VALOR TOTAL de la cirugía.
 * Está aislado acá para poder cambiarlo en un solo lugar.
 */
export function baseDeposito(ctx: SobreCtx): number {
  return ctx.precios.total;
}

/** Resultado del depósito en garantía (Particular). */
export function calcularDeposito(ctx: SobreCtx): { monto: number; detalle: string } | null {
  const { depositoModalidad: modalidad, depositoValor: valor } = ctx.caja;
  if (!modalidad || valor == null || isNaN(valor)) return null;
  if (modalidad === "MONTO") {
    return { monto: valor, detalle: "Monto fijo definido en caja" };
  }
  const base = baseDeposito(ctx);
  return {
    monto: base * (valor / 100),
    detalle: `${ctx.fmtARS(valor)} % sobre el valor total de la cirugía (${pesos(ctx, base)})`,
  };
}

/** Total del ingreso para obra social: monto único − descuento + ítems adicionales. */
export function totalObraSocial(ctx: SobreCtx): number {
  const base = ctx.caja.montoUnico ?? 0;
  const adicionales = ctx.itemsAdicionales.reduce((s, i) => s + (i.monto || 0), 0);
  return Math.max(0, base - ctx.precios.descuento) + adicionales;
}

function bloqueItemsAdicionales(L: Lienzo, ctx: SobreCtx) {
  if (!ctx.itemsAdicionales.length) return;
  for (const it of ctx.itemsAdicionales) {
    importe(L, `+ ${it.descripcion}`, pesos(ctx, it.monto), { size: 10, color: [30, 80, 150] });
  }
}

function bloqueDescuento(L: Lienzo, ctx: SobreCtx) {
  if (!(ctx.precios.descuento > 0)) return;
  const pct = ctx.precios.porcentajeDescuento;
  // "Exento de IVA": cuando se aplica un descuento autorizado no se emite
  // factura (definición de Administración, 10/08/2026). Aplica a todas las
  // coberturas, Particular incluida.
  const etiqueta = pct > 0
    ? `Descuento autorizado (${ctx.fmtARS(pct)} %) - Exento de IVA`
    : "Descuento autorizado - Exento de IVA";
  // Guion ASCII a propósito: el menos tipográfico (U+2212) no está en WinAnsi y
  // fuerza a jsPDF a UTF-16, lo que rompe el renderizado del importe.
  importe(L, etiqueta, `- ${pesos(ctx, ctx.precios.descuento)}`, { size: 10, color: [190, 80, 20] });
}

export function docCaja(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Ingreso de caja: cirugía de catarata con LIO");
  destino(L, "COPIA PARA EL PACIENTE", "paciente");
  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  if (ctx.esObraSocial) {
    campo2(L, "Obra social", ctx.coberturaLabel, "N° de afiliado", ctx.paciente.numeroAfiliado);
  } else {
    campo2(L, "Cobertura", "Particular", "DNI", ctx.paciente.documento);
  }
  // El ojo va destacado: el comprobante tiene que dejar claro cuál se opera.
  campo(L, "Ojo a operar", ctx.ojoTexto);
  campo2(L, "LIO elegido", ctx.lioNombre, "Fecha de cirugía", ctx.fechaCirugia);
  // Qué está pagando exactamente: "Cirugía de catarata con LIO X + Avastin".
  campo(L, "Concepto", conceptoCompleto(ctx));
  espacio(L, 3);

  subtitulo(L, "Detalle");

  if (ctx.esObraSocial) {
    // ── Obra social (directa o Círculo Médico): monto único ──
    const montoUnico = ctx.caja.montoUnico ?? 0;
    importe(L, `Cirugía de catarata con LIO ${ctx.lioNombre}`.trim(), pesos(ctx, montoUnico), { size: 10 });
    bloqueDescuento(L, ctx);
    bloqueItemsAdicionales(L, ctx);
    separador(L);
    importe(L, "TOTAL", pesos(ctx, totalObraSocial(ctx)), { bold: true, size: 12 });
    espacio(L, 2);
    parrafo(L, "Importe registrado por convenio con la obra social.", { size: 8.5, color: [90, 90, 90] });
  } else {
    // ── Particular ──
    // Las líneas replican el detalle del presupuesto que ya tiene el paciente
    // (subtotal, descuento, insumos, TOTAL A PAGAR). Ningún comprobante
    // discrimina IVA, en ninguna cobertura.
    importe(L, `Cirugía de catarata con LIO ${ctx.lioNombre}`.trim(), pesos(ctx, ctx.precios.baseAntesDescuento), { size: 10 });
    bloqueDescuento(L, ctx);
    bloqueItemsAdicionales(L, ctx);
    separador(L);
    importe(L, "VALOR TOTAL DE LA CIRUGÍA", pesos(ctx, ctx.precios.total), { bold: true, size: 12 });
    espacio(L, 4);

    // Depósito en garantía — lo define el operador (monto o porcentaje).
    subtitulo(L, "Depósito en garantía");
    const dep = calcularDeposito(ctx);
    if (dep) {
      importe(L, "Depósito en garantía", pesos(ctx, dep.monto), { bold: true, size: 12 });
      parrafo(L, dep.detalle, { size: 8.5, color: [90, 90, 90] });
      espacio(L, 1);
      importe(L, "Saldo a abonar", pesos(ctx, Math.max(0, ctx.precios.total - dep.monto)), { size: 10 });
    } else {
      campo(L, "Depósito en garantía", "");
      parrafo(L, "Sin monto cargado en caja — completar a mano.", { size: 8.5, color: [150, 100, 30] });
    }
    espacio(L, 2);
    parrafo(L, "Este depósito en garantía habilita la solicitud de los insumos quirúrgicos.", { size: 9, color: [90, 90, 90] });
  }

  firmas(L, ["Firma del paciente", "Recibí conforme (caja)"]);
}

// ============================================================
// DOC 7 — Formulario Ley de Trazabilidad (ARCHIVA QUIRÓFANO)
// ============================================================
export function docTrazabilidad(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Ley de Trazabilidad — Instituto Dr. Mercado");
  destino(L, "ARCHIVAR EN QUIRÓFANO — NO SE LO LLEVA EL PACIENTE", "quirofano");

  subtitulo(L, "A completar por el paciente");
  campo2(L, "Día de cirugía", ctx.fechaCirugia, "Ojo a operar", ctx.ojoTexto);
  campo(L, "Apellido y nombre", ctx.paciente.apellidoNombre);
  campo2(L, "Edad", ctx.paciente.edad, "DNI", ctx.paciente.documento);
  campo(L, "Dirección", "");
  campo2(L, "Provincia", "", "Localidad", "");
  campo2(L, "Código postal", "", "Teléfono", ctx.paciente.telefono);
  campo2(L, "Obra social", ctx.coberturaLabel, "N° de afiliado", ctx.esObraSocial ? ctx.paciente.numeroAfiliado : "—");
  campo(L, "Código de HIV (M. Salud)   SI / NO   N°", "");
  espacio(L, 3);

  subtitulo(L, "A completar por quirófano");
  campo2(L, "Historia clínica", "", "Lente", ctx.lioNombre);
  campo2(L, "Dioptría", "", "SN", "");
  campo2(L, "Fecha vencimiento", "", "Código", "");
  campo2(L, "Serie", "", "Fecha factura", "");
  campo(L, "T. exitosa lente — Código", "");
  campo(L, "T. exitosa datos del paciente", "");
  espacio(L, 3);

  parrafo(L, "Firmar quien se responsabiliza por el tratamiento:", { bold: true });
  firmas(L, ["Firma", "Aclaración — DNI"]);
}

// ============================================================
// DOC 8 — Consentimiento informado (ARCHIVA QUIRÓFANO)
// ============================================================
// El texto legal definitivo lo provee Administración y se carga como una nueva
// versión vigente en presupuestos_textos_legales. Acá NO se redacta ni se
// inventa: se imprime lo que esté cargado (hoy, un placeholder).
export function docConsentimiento(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Consentimiento informado para la cirugía de catarata");
  destino(L, "ARCHIVAR EN QUIRÓFANO — NO SE LO LLEVA EL PACIENTE", "quirofano");

  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  campo2(L, "DNI", ctx.paciente.documento, "Ojo a operar", ctx.ojoTexto);
  campo2(L, "Fecha de cirugía", ctx.fechaCirugia, "LIO", ctx.lioNombre);
  espacio(L, 2);

  parrafo(L, "Marco legal: Leyes 26.529 y 26.742 y Decreto Reglamentario 1089/2012. Modelo aprobado por el Consejo Argentino de Oftalmología.", { size: 8, color: [90, 90, 90] });
  espacio(L, 1);

  for (const sec of ctx.consentimiento) {
    if (sec.titulo) subtitulo(L, sec.titulo);
    if (sec.cuerpo) parrafo(L, sec.cuerpo);
  }

  espacio(L, 3);
  parrafo(L, "Autorización del consentimiento informado: dejo constancia de que he comprendido la información brindada y autorizo la realización del procedimiento por el equipo médico interviniente.");
  campo(L, "Doctores del equipo", "");
  espacio(L, 4);
  firmas(L, ["Firma del paciente\nAclaración — DNI", "Firma del testigo\nAclaración — DNI"]);
}
