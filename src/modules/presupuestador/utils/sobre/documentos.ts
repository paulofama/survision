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
  /** Particular: cómo se expresa la entrega — MONTO fijo o PORCENTAJE del total. */
  depositoModalidad: DepositoModalidad | null;
  /** Particular: el número tipeado — $ si MONTO, % si PORCENTAJE. */
  depositoValor: number | null;
  /** Obra social: monto único (sin desglose de IVA), antes del descuento autorizado. */
  montoUnico: number | null;
  /**
   * ENTREGA que se recibe AHORA, en pesos, ya resuelta por el modal (en
   * Particular sale de aplicar `depositoModalidad`/`depositoValor`).
   *
   * El comprobante registra un pago PARCIAL, no el total del presupuesto: el
   * bug conceptual que relevó Administración era imprimir el total como si
   * fuera lo abonado.
   */
  entrega: number | null;
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
  /**
   * Frase de resultado visual del lente, del catálogo (migración 44). Vacía en
   * todos los LIO salvo el Básico — ver `LEYENDA_RESULTADO_VISUAL` más abajo.
   */
  lioLeyenda: string;
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
  /** Suma de las entregas ya registradas antes de ésta (migración 44). */
  entregasPrevias: number;
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

  espacio(L, 2);
  // RENGLÓN ÚNICO COMBINADO (Administración, 31/08/2026). Antes había un campo
  // "CUPO" que salía vacío —el cupo lo asigna OSEP y se completa a mano— más
  // una "Fecha de cirugía" aparte. Un solo renglón sirve para todas las obras
  // sociales y evita mantener lógica por convenio: si hay fecha cargada se
  // imprime, y si no queda la línea en blanco para completar a mano.
  campo(L, "CUPO / FECHA PROBABLE DE CIRUGÍA", ctx.fechaCirugia);
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
// legibilidad. Hoja apaisada propia, cuerpo de tabla grande.
//
// LA TABLA NO SE PARTE NUNCA (Administración, 31/08/2026). Antes el cronograma
// y el instructivo compartían documento; la tabla no entraba y autoTable la
// paginaba sola, llevándose la fila de las 24:00 a la hoja siguiente: "ver de
// que entre, porque no verán la última colocación". Ahora el instructivo
// arranca en su propia hoja y la tabla se dimensiona para entrar completa.

/** Filas del cronograma. 9 horarios, de 8:00 a 24:00. */
const CRONOGRAMA: string[][] = [
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

/**
 * Encabezado de una columna de semana.
 *
 * El rango de fechas se imprime EN BLANCO para completar a mano, replicando lo
 * que Administración ya hace: "todos los pacientes lo preguntan, por lo cual lo
 * completamos delante de ellos". El esquema puede variar según indicación
 * médica, así que el sistema no lo calcula.
 *
 * Si mañana piden calcularlo a partir de la fecha de cirugía, es acá y en un
 * solo lugar: esta función recibe el `ctx` justamente para eso.
 */
export function encabezadoSemana(_ctx: SobreCtx, n: number): string {
  return `SEMANA ${n}\ndel ____/____ al ____/____\nAL OJO: ________`;
}

export function docCronograma(L: Lienzo, ctx: SobreCtx, abrirHoja: (L: Lienzo) => void) {
  titulo(L, "Cronograma de tratamiento quirúrgico", { size: 17 });
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  campo(L, "Paciente", ctx.paciente.apellidoNombre, { size: 12 });
  campo2(L, "Ojo a operar", ctx.ojoTexto, "Turno de cirugía", ctx.fechaCirugia, { size: 12 });

  // Contenido y estructura CONFIRMADOS por Administración (11/08/2026): no se
  // modifican. Lo que cambia es el formato, para que entre entero.
  parrafo(L, "Complete el ojo y las fechas de cada semana. G = Gatif Forte · N = Natax · A = Aucic Plus · D = Dolten.", { size: 10.5 });

  // Cuerpo 13pt: es el piso de legibilidad acordado para pacientes con visión
  // comprometida. Para hacer entrar las 9 filas se aprieta el padding y el
  // interlineado ANTES que el cuerpo de letra, nunca al revés.
  autoTable(L.doc, {
    startY: L.y,
    // `bottom` tiene que cubrir la franja del pie (FOOTER_ALTO = 20 mm) más un
    // respiro: si fuera menor, autoTable dibujaría por encima del pie en vez de
    // cortar. Con el formato actual la tabla termina ~20 mm antes de este piso.
    margin: { left: M, right: M, top: 38, bottom: 24 },
    head: [["Hora", encabezadoSemana(ctx, 1), encabezadoSemana(ctx, 2), encabezadoSemana(ctx, 3)]],
    body: CRONOGRAMA,
    // `pageBreak: 'avoid'` mantiene la tabla entera en una hoja; `rowPageBreak`
    // evita además que una fila se corte por la mitad.
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    styles: { fontSize: 13, cellPadding: 1.4, valign: "middle", lineWidth: 0.2, lineColor: [170, 170, 170] },
    headStyles: { fillColor: [20, 40, 90], textColor: [255, 255, 255], fontSize: 11, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 247, 252] },
    columnStyles: { 0: { cellWidth: 22, halign: "center", fontStyle: "bold" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => alinear(d, { 0: "center", 1: "left", 2: "left", 3: "left" }),
    // Red de seguridad: si aun así se abriera una hoja, que lleve el membrete.
    didDrawPage: (d) => { if (d.pageNumber > 1) membrete(L); },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 6;

  // El instructivo va en HOJA PROPIA: es lo que garantiza que el cronograma
  // nunca compita por espacio con él.
  abrirHoja(L);
  titulo(L, "Instructivo de colocación de gotas", { size: 17 });
  destino(L, "SE LO LLEVA EL PACIENTE", "paciente");
  campo(L, "Paciente", ctx.paciente.apellidoNombre, { size: 12 });
  espacio(L, 3);
  vinieta(L, "1) Lavarse las manos con abundante agua y jabón; mantener las uñas cortas.", { size: 14 });
  vinieta(L, "2) Inclinar la cabeza hacia atrás (sentado, parado o acostado) y agitar el gotero antes de cada colocación.", { size: 14 });
  vinieta(L, "3) Colocar el dedo en el punto blando debajo del párpado inferior, tirar hacia abajo lentamente y dejar caer la gota dentro del ojo.", { size: 14 });
  vinieta(L, "4) Soltar el párpado inferior y cerrar los ojos suavemente.", { size: 14 });
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
}

/**
 * Diagnóstico de TODAS las recetas del sobre quirúrgico.
 *
 * Antes cada receta traía el suyo: la A y la B decían "Cataratas" y la C
 * "Cirugía ocular". Administración lo unificó (31/08/2026): la medicación se
 * prescribe por la cirugía, no por la catarata. Constante única para que no
 * vuelva a divergir receta por receta.
 */
export const DX_RECETAS = "Cirugía ocular";

/**
 * Leyenda al pie de las recetas cuando la obra social las carga por su propio
 * sistema (OSEP). Las recetas se siguen imprimiendo —no se pierde el respaldo
 * en papel del sobre— pero el operador tiene que saber que además debe
 * cargarlas en el sistema de la obra social.
 */
export const LEYENDA_RECETA_POR_SISTEMA = "Receta a cargar por el sistema de OSEP.";

const RECETAS: RecetaDef[] = [
  {
    titulo: "Receta A",
    items: [
      "Gatif forte 1 (UNO) — (Gatifloxacina 0,5%)",
      "NATAX 1 (UNO) — (Bromfenac)",
    ],
  },
  {
    titulo: "Receta B",
    items: [
      "AUCIC PLUS 1 (UNO) — (Carboximetilcelulosa sódica + asociados)",
      "DOLTEN 10 mg x 10 COMP. — (Ketorolak 10 mg)",
    ],
  },
  {
    titulo: "Receta C",
    items: [
      "Tranquinal sublingual x 0,5 mg — 1 caja — (Alprazolam)",
    ],
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
  campo(L, "Dx", DX_RECETAS);
  campo(L, "Fecha", ctx.fechaHoy);
  firmas(L, ["Firma y sello del médico"]);
  if (ctx.recetasPorSistema) {
    espacio(L, 1);
    parrafo(L, LEYENDA_RECETA_POR_SISTEMA, { size: 9, bold: true, color: [90, 90, 90] });
  }
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Recetas de la medicación agregada en el presupuesto (ej. ampolla de Avastin). */
export function recetasDeMedicacionAdicional(ctx: SobreCtx): RecetaDef[] {
  return ctx.itemsAdicionales.map((it, i) => ({
    titulo: `Receta ${LETRAS[RECETAS.length + i] || String(RECETAS.length + i + 1)} - Medicación adicional`,
    items: [it.descripcion],
  }));
}

/**
 * Todas las recetas del sobre: las 3 fijas + las de medicación adicional.
 *
 * En OSEP se imprimen igual, con la leyenda al pie (definición del 31/08/2026:
 * antes se suprimía la receta de medicación adicional y se perdía el respaldo
 * en papel del sobre). Si alguna cobertura tuviera que dejar de imprimirlas,
 * es un flag del convenio —`recetas_suprimir`— y no un cambio de código.
 */
export function recetasDelSobre(ctx: SobreCtx): RecetaDef[] {
  if (ctx.convenio?.config?.recetas_suprimir === true) return [];
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

/** Total del ingreso para obra social: monto único − descuento + ítems adicionales. */
export function totalObraSocial(ctx: SobreCtx): number {
  const base = ctx.caja.montoUnico ?? 0;
  const adicionales = ctx.itemsAdicionales.reduce((s, i) => s + (i.monto || 0), 0);
  return Math.max(0, base - ctx.precios.descuento) + adicionales;
}

/**
 * VALOR TOTAL del comprobante.
 *
 * En obra social es el IMPORTE A CARGO DEL PACIENTE (la diferencia no cubierta),
 * no lo que liquida la obra social: el comprobante documenta lo que el paciente
 * paga. Es coherente con la leyenda al pie — ver `LEYENDA_A_CARGO_PACIENTE`.
 */
export function valorTotalCaja(ctx: SobreCtx): number {
  return ctx.esObraSocial ? totalObraSocial(ctx) : ctx.precios.total;
}

/**
 * Base sobre la que se calcula la entrega cuando se carga por porcentaje.
 * Aislado acá para poder cambiarlo en un solo lugar.
 */
export function baseDeposito(ctx: SobreCtx): number {
  return valorTotalCaja(ctx);
}

/**
 * Resuelve a pesos la entrega que el operador expresó como monto o porcentaje.
 * La usa el modal de caja para producir `CajaOpts.entrega`; los documentos ya
 * leen el número resuelto.
 */
export function calcularDeposito(ctx: SobreCtx): { monto: number; detalle: string } | null {
  const { depositoModalidad: modalidad, depositoValor: valor } = ctx.caja;
  if (!modalidad || valor == null || isNaN(valor)) return null;
  if (modalidad === "MONTO") {
    return { monto: valor, detalle: "Monto fijo definido en caja" };
  }
  const base = baseDeposito(ctx);
  return {
    monto: base * (valor / 100),
    detalle: `${ctx.fmtARS(valor)} % sobre el valor total (${pesos(ctx, base)})`,
  };
}

/** Entrega que se recibe en ESTE comprobante. */
export function entregaActual(ctx: SobreCtx): number {
  return ctx.caja.entrega ?? 0;
}

/** RESTA PAGAR = valor total − entregas anteriores − la de este comprobante. */
export function restaPagar(ctx: SobreCtx): number {
  return Math.max(0, valorTotalCaja(ctx) - ctx.entregasPrevias - entregaActual(ctx));
}

/**
 * Descuento a partir del cual la cirugía NO se factura.
 *
 * Queda como constante porque Administración todavía no cerró si el disparador
 * es cualquier descuento o sólo el 10%. Default: cualquier descuento > 0.
 */
export const UMBRAL_DESCUENTO_SIN_FACTURA = 0;

/**
 * REGLA DE FACTURACIÓN (Administración, 31/08/2026).
 *
 * El IVA nunca se desglosa en ningún comprobante. Lo que se imprime al lado del
 * valor total es una leyenda que le dice a Administración si esa cirugía se
 * factura:
 *
 *   sin descuento → "C/IVA" → corresponde emitir factura el día de la cirugía
 *   con descuento → "S/IVA" → no corresponde (el descuento se dio a cambio)
 *
 * Es automática, derivada del presupuesto: el operador no la elige. Ivana la usa
 * para saber si emite factura, Flavio para cerrar el ingreso el día de la
 * cirugía, y Administración para explicarle al paciente por qué no se le
 * extendió factura cuando se le hizo el descuento.
 *
 * En el papel va SÓLO la sigla, tal cual el comprobante actual: la
 * interpretación fiscal queda del lado interno, en el flag persistido.
 */
export function requiereFactura(ctx: SobreCtx): boolean {
  return !(ctx.precios.descuento > UMBRAL_DESCUENTO_SIN_FACTURA);
}

export const leyendaIva = (ctx: SobreCtx): string => (requiereFactura(ctx) ? "C/IVA" : "S/IVA");

/**
 * Pie del comprobante de obra social.
 *
 * Reemplaza a "Importe registrado por convenio con la obra social", que era
 * incorrecta: ese importe NO lo cubre la obra social — es justamente la parte
 * que el paciente debe abonar. Pendiente de la redacción final de
 * Administración, por eso vive en una constante.
 */
export const LEYENDA_A_CARGO_PACIENTE =
  "Importe a cargo del paciente — diferencia no cubierta por la obra social.";

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

export type CopiaCaja = "paciente" | "administracion";

const ROTULO_COPIA: Record<CopiaCaja, string> = {
  paciente: "COPIA PARA EL PACIENTE",
  administracion: "COPIA PARA ADMINISTRACIÓN",
};

/**
 * Una copia del comprobante. El contenido de las dos es IDÉNTICO: sólo cambia
 * el rótulo. Replica el comprobante en papel que Administración aportó como
 * modelo (paciente Segovia Mercedes, 19/08/26).
 */
export function docCajaCopia(L: Lienzo, ctx: SobreCtx, copia: CopiaCaja) {
  titulo(L, "Ingreso de caja");
  destino(L, ROTULO_COPIA[copia], "paciente");

  // ── Identificación ──
  // El DNI va SIEMPRE, en las dos coberturas (confirmado por Administración).
  // El N° de afiliado sólo existe si hay obra social.
  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  if (ctx.esObraSocial) {
    campo2(L, "O. Social", ctx.coberturaLabel, "N° de afiliado", ctx.paciente.numeroAfiliado);
  } else {
    campo(L, "O. Social", "PARTICULAR");
  }
  campo(L, "Ojo", ctx.ojoTexto);
  // Fecha de la ENTREGA DEL DINERO, no la de la cirugía.
  campo2(L, "Fecha", ctx.fechaHoy, "DNI", ctx.paciente.documento);
  espacio(L, 3);

  // ── Concepto ──
  subtitulo(L, conceptoCompleto(ctx).toUpperCase() + ":");
  // La leyenda de resultado visual sale del catálogo y hoy sólo la tiene el LIO
  // Básico: en los demás lentes el objetivo refractivo lo elige el paciente y
  // cambia caso por caso, así que una frase fija sería clínicamente incorrecta.
  if (ctx.lioLeyenda) {
    espacio(L, 1);
    parrafo(L, ctx.lioLeyenda, { size: 10, bold: true });
  }
  if (ctx.lioNombre) campo(L, "LIO ELEGIDO", ctx.lioNombre);
  espacio(L, 2);

  // ── Detalle ──
  // Los ítems e insumos se siguen detallando (regla de FASE 1). Ningún
  // comprobante discrimina IVA, en ninguna cobertura.
  const bruto = ctx.esObraSocial ? (ctx.caja.montoUnico ?? 0) : ctx.precios.baseAntesDescuento;
  importe(L, `Cirugía de catarata con LIO ${ctx.lioNombre}`.trim(), pesos(ctx, bruto), { size: 10 });
  bloqueDescuento(L, ctx);
  bloqueItemsAdicionales(L, ctx);
  separador(L);

  // ── Valor total + leyenda de facturación ──
  const total = valorTotalCaja(ctx);
  importe(L, `VALOR TOTAL          ${leyendaIva(ctx)}`, pesos(ctx, total), { bold: true, size: 12 });
  espacio(L, 3);

  // ── Entrega y saldo ──
  // El comprobante registra un PAGO PARCIAL: el paciente entrega una parte y
  // queda un saldo. Antes se imprimía el total del presupuesto como si fuera lo
  // abonado.
  if (ctx.entregasPrevias > 0) {
    importe(L, "Entregas anteriores", pesos(ctx, ctx.entregasPrevias), { size: 9.5, color: [90, 90, 90] });
  }
  const entrega = entregaActual(ctx);
  if (entrega > 0) {
    importe(L, "ENTREGA", pesos(ctx, entrega), { bold: true, size: 12 });
    importe(L, "RESTA PAGAR", pesos(ctx, restaPagar(ctx)), { bold: true, size: 12 });
  } else {
    campo(L, "ENTREGA", "");
    campo(L, "RESTA PAGAR", "");
    parrafo(L, "Sin entrega cargada en caja — completar a mano.", { size: 8.5, color: [150, 100, 30] });
  }
  espacio(L, 4);

  // ── Bloque de tesorería: SIEMPRE EN BLANCO ──
  // Flavio lo completa de puño y letra y pone su sello: eso es lo que deja
  // constancia de que él recibió el dinero. Si el sistema lo imprimiera
  // prellenado en las dos copias, perdería su función de registro manual.
  campo(L, "TESORERÍA", "");
  campo(L, "MONTO", "");
  campo(L, "FECHA", "");
  campo(L, "FIRMA", "");

  if (ctx.esObraSocial) {
    espacio(L, 2);
    parrafo(L, LEYENDA_A_CARGO_PACIENTE, { size: 8.5, color: [90, 90, 90] });
  }
}

/** Las dos copias del comprobante, cada una en su hoja. */
export function docCaja(L: Lienzo, ctx: SobreCtx, abrirHoja: (L: Lienzo) => void) {
  const copias: CopiaCaja[] = ["paciente", "administracion"];
  copias.forEach((c, i) => {
    if (i > 0) abrirHoja(L);
    docCajaCopia(L, ctx, c);
  });
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
