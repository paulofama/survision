// ============================================================
// Sobre Quirúrgico — builders de los 5 documentos (jsPDF)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Cada builder dibuja su documento sobre el Lienzo recibido, arrancando en la
// hoja actual (el orquestador de index.ts abre una hoja nueva entre documentos).
// El contenido replica los formularios reales de la clínica.
// ============================================================

import autoTable from "jspdf-autotable";
import {
  Lienzo, M, CW, alinear,
  titulo, subtitulo, parrafo, vinieta, campo, campo2, espacio, rp, checkbox, firmas, asegurar,
} from "./pdfBase";

// ── Contexto de datos (pre-carga desde el presupuesto + aceptación) ──

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
  lioNombre: string;
  requiereAnalisisEcg: boolean;
  convenio: { nombre: string; subRama: string; codigo: string; config: Record<string, any> } | null;
  total: number;
  iva: number;
  consentimiento: { titulo: string; cuerpo: string }[];
  fmtARS: (n: number) => string;
}

const TXT_SOLICITUD = "Cirugía de catarata con técnica de facoemulsificación implante de lio plegable.";

// ============================================================
// DOC 1 — Pedido de cirugía (según convenio)
// ============================================================
export function docPedidoCirugia(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Pedido de cirugía");
  rp(L);
  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  campo2(L, "O. Social", ctx.paciente.obraSocial, "N°", "");
  espacio(L, 2);

  subtitulo(L, "Solicito");
  parrafo(L, TXT_SOLICITUD, { size: 10 });
  espacio(L, 1);

  const cfg = ctx.convenio?.config || {};
  const diagRaw = String(cfg.diag || "Catarata");
  const diag = diagRaw.replace("{ojo}", ctx.ojoDiag);
  campo(L, "Diagnóstico", diag);
  if (ctx.convenio?.codigo) campo(L, "Código", ctx.convenio.codigo);

  // Extras por convenio
  if (cfg.leyenda) { espacio(L, 1); parrafo(L, String(cfg.leyenda), { size: 9, bold: true }); }
  if (Array.isArray(cfg.lineas)) {
    for (const ln of cfg.lineas) campo(L, String(ln), "");
  }
  if (cfg.cuenta) campo(L, "Cuenta Survisión", String(cfg.cuenta));
  if (cfg.cupo !== undefined) campo(L, "CUPO", String(cfg.cupo || ""));

  espacio(L, 2);
  campo(L, "Fecha", ctx.fechaCirugia);
  firmas(L, ["Firma y sello del médico"]);
}

// ============================================================
// DOC 2 — Indicaciones, trazabilidad y consentimiento (2a–2f)
// ============================================================
export function docIndicaciones(L: Lienzo, ctx: SobreCtx) {
  // ── 2a. Indicaciones para cirugía de cataratas ──
  titulo(L, "Indicaciones para cirugía de cataratas");
  campo(L, "Nombre y Apellido", ctx.paciente.apellidoNombre);
  campo2(L, "Ojo a operar", ctx.ojoTexto, "Turno de cirugía", ctx.fechaCirugia);
  campo(L, "Hora de llegada", "a confirmar 72 HS a 24 HS antes");
  espacio(L, 2);

  subtitulo(L, "Tratamiento prequirúrgico");
  parrafo(L, "La noche anterior tomará un tranquilizante para ayudar a un buen descanso (puede repetirse antes de la cirugía si es necesario).");
  parrafo(L, "El tratamiento con gotas comienza UN DÍA antes de la cirugía y continúa por 3 semanas después. Se realiza de 8:00 (mañana) a 24:00 (noche); el paciente descansa durante la noche.");
  parrafo(L, "Se utilizan tres tipos de gotas y un analgésico en comprimidos desde el día de la cirugía:");
  vinieta(L, "NATAX (antiinflamatorio)");
  vinieta(L, "AUCIC PLUS (lubricante ocular)");
  vinieta(L, "GATIF FORTE (antibiótico)");
  vinieta(L, "Dolten comprimido (analgésico)");
  espacio(L, 1);
  parrafo(L, "MEDICACIÓN INDICADA POR SU MÉDICO DE CABECERA NO DEBE SER SUSPENDIDA DURANTE EL TRATAMIENTO.", { bold: true, color: [150, 30, 30] });
  espacio(L, 2);

  subtitulo(L, "El día de la cirugía deberá concurrir");
  vinieta(L, "Con camisa con botones al frente (no remera ni camiseta), para el monitoreo cardiovascular.");
  vinieta(L, "Sin cremas, maquillaje ni alhajas.");
  vinieta(L, "Acompañado por una sola persona.");
  vinieta(L, "Tomar Dolten 1 comprimido cada 12 hs antes de la cirugía y por 3 días posteriores (puede reemplazarse por ibuprofeno, tafirol o su analgésico autorizado).");
  espacio(L, 1);
  parrafo(L, "Al llegar a quirófano se solicitará el sobre quirúrgico, que debe contener: antiparras transparentes de protección y los formularios completos de trazabilidad y el consentimiento firmado.");

  // ── 2b. Cronograma de tratamiento quirúrgico ──
  asegurar(L, 90);
  titulo(L, "Cronograma de tratamiento quirúrgico");
  parrafo(L, "Complete el ojo en cada semana. G = Gatif Forte · N = Natax · A = Aucic Plus · D = Dolten.", { size: 8 });
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
  autoTable(L.doc, {
    startY: L.y,
    margin: { left: M, right: M },
    head: [["Hora", "Semana 1 — AL OJO: ____", "Semana 2 — AL OJO: ____", "Semana 3 — AL OJO: ____"]],
    body: cron,
    styles: { fontSize: 7.5, cellPadding: 1.6, valign: "middle" },
    headStyles: { fillColor: [20, 40, 90], textColor: [255, 255, 255], fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: 16, halign: "center" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => alinear(d, { 0: "center", 1: "left", 2: "left", 3: "left" }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.y = (L.doc as any).lastAutoTable.finalY + 5;

  // ── 2c. Cuidados post-quirúrgicos ──
  titulo(L, "Cuidados post-quirúrgicos");
  parrafo(L, "Al retirarse del instituto: permanecer una hora con el ojo cerrado (no tapado) y continuar el cronograma de gotas, tomando el párpado inferior para colocarlas y así evitar apretar las incisiones.");
  parrafo(L, "La primera noche: dormir con las antiparras de protección y con dos almohadas. Al colocarse las antiparras, tomarlas por las patillas para no golpear el ojo.");
  subtitulo(L, "NO deberá");
  vinieta(L, "Apretarse ni frotarse el ojo.");
  vinieta(L, "Agacharse, levantar peso o exponerse a golpes.");
  subtitulo(L, "Podrá");
  vinieta(L, "Estar acostado o sentado, mirar televisión, leer, asistir a reuniones.");
  vinieta(L, "Mantener su alimentación habitual.");
  parrafo(L, "Para higienizar el ojo: hervir agua con manzanilla y colocar compresas TIBIAS con gasas estériles.");
  espacio(L, 1);
  parrafo(L, "URGENCIAS: 2604-669362 (9 a 21 hs).", { bold: true });
  parrafo(L, "CONSULTAS POR CIRUGÍA DE CATARATA: 2604-673230 (9 a 13 hs), únicamente por WhatsApp.", { bold: true });

  // ── 2d. Instructivo de colocación de gotas ──
  titulo(L, "Instructivo de colocación de gotas");
  vinieta(L, "1) Lavarse las manos con abundante agua y jabón; mantener las uñas cortas.");
  vinieta(L, "2) Inclinar la cabeza hacia atrás (sentado, parado o acostado) y agitar el gotero antes de cada colocación.");
  vinieta(L, "3) Colocar el dedo en el punto blando debajo del párpado inferior, tirar hacia abajo lentamente y dejar caer la gota dentro del ojo.");
  vinieta(L, "4) Soltar el párpado inferior y cerrar los ojos suavemente.");

  // ── 2e. Formulario Ley de Trazabilidad ──
  asegurar(L, 120);
  titulo(L, "Ley de Trazabilidad — Instituto Dr. Mercado");
  subtitulo(L, "A completar por el paciente");
  campo2(L, "Día de cirugía", ctx.fechaCirugia, "Ojo a operar", ctx.ojoTexto);
  campo(L, "Apellido y nombre", ctx.paciente.apellidoNombre);
  campo2(L, "Edad", ctx.paciente.edad, "DNI", ctx.paciente.documento);
  campo(L, "Dirección", "");
  campo2(L, "Provincia", "", "Localidad", "");
  campo2(L, "Código postal", "", "Teléfono", ctx.paciente.telefono);
  campo2(L, "Obra social", ctx.paciente.obraSocial, "N° de afiliado", ctx.paciente.numeroAfiliado);
  campo(L, "Código de HIV (M. Salud)   SI / NO   N°", "");
  espacio(L, 2);
  subtitulo(L, "A completar por quirófano");
  campo2(L, "Historia clínica", "", "Lente", "");
  campo2(L, "Dioptría", "", "SN", "");
  campo2(L, "Fecha vencimiento", "", "Código", "");
  campo2(L, "Serie", "", "Fecha factura", "");
  campo(L, "T. exitosa lente — Código", "");
  campo(L, "T. exitosa datos del paciente", "");

  // ── 2f. Consentimiento informado ──
  asegurar(L, 60);
  parrafo(L, "Firmar quien se responsabiliza por el tratamiento:", { bold: true });
  firmas(L, ["Firma"]);
  titulo(L, "Consentimiento informado para la cirugía de catarata");
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

// ============================================================
// DOC 3 — Recetas de medicación (3 recetas Rp/)
// ============================================================
function recetaRp(L: Lienzo, ctx: SobreCtx, tituloR: string, items: string[], diag: string) {
  asegurar(L, 70);
  subtitulo(L, tituloR);
  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  campo2(L, "O. social", ctx.paciente.obraSocial, "N°", "");
  rp(L);
  for (const it of items) vinieta(L, it, { bold: true });
  if (diag) { espacio(L, 1); campo(L, "Dx", diag); }
  campo(L, "Fecha", "");
  firmas(L, ["Firma y sello"]);
  espacio(L, 4);
}

export function docRecetas(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Recetas de medicación");
  recetaRp(L, ctx, "Receta A", [
    "Gatif forte 1 (UNO) — (Gatifloxacina 0,5%)",
    "NATAX 1 (UNO) — (Bromfenac)",
  ], "Cataratas");
  recetaRp(L, ctx, "Receta B", [
    "AUCIC PLUS 1 (UNO) — (Carboximetilcelulosa sódica + asociados)",
    "DOLTEN 10 mg x 10 COMP. — (Ketorolak 10 mg)",
  ], "Cataratas");
  recetaRp(L, ctx, "Receta C", [
    "Tranquinal sublingual x 0,5 mg — 1 caja — (Alprazolam)",
  ], "Cirugía ocular");
}

// ============================================================
// DOC 4 — Análisis y ECG (condicional)
// ============================================================
export function docAnalisisEcg(L: Lienzo, ctx: SobreCtx) {
  // Solicitud de laboratorio
  titulo(L, "Solicitud de laboratorio");
  campo(L, "Nombre", ctx.paciente.apellidoNombre);
  campo2(L, "Obra Social", ctx.paciente.obraSocial, "Laboratorio", "");
  espacio(L, 1);
  subtitulo(L, "Solicito");
  const dets = ["Hemograma", "VSG", "Glucemia", "Uremia", "Colesterol", "Triglicéridos", "Tiempo de coagulación", "Tiempo de sangría", "TTPK", "Orina completo", "Hb glicosilada"];
  // Checklist en dos columnas, todas tildadas (panel prequirúrgico estándar).
  const colX = [M, M + CW / 2];
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
  campo(L, "Obra Social", ctx.paciente.obraSocial);
  espacio(L, 1);
  subtitulo(L, "Solicito");
  parrafo(L, "ECG Y RIESGO QUIRÚRGICO (ANESTESIA LOCAL-GENERAL)", { bold: true });
  campo(L, "Diagnóstico", "Cirugía de catarata");
  campo(L, "Fecha", "");
  firmas(L, ["Firma y sello del médico"]);
}

// ============================================================
// DOC 5 — Depósito en garantía
// ============================================================
export function docDeposito(L: Lienzo, ctx: SobreCtx) {
  titulo(L, "Ingreso de caja: cirugía de catarata con LIO");
  parrafo(L, "COPIA PARA EL PACIENTE", { bold: true, size: 8, color: [90, 90, 90] });
  espacio(L, 1);
  campo(L, "Paciente", ctx.paciente.apellidoNombre);
  campo2(L, "O. Social", ctx.paciente.obraSocial, "DNI", ctx.paciente.documento);
  campo2(L, "Ojo", ctx.ojoTexto, "Fecha", ctx.fechaCirugia);
  campo(L, "LIO elegido", ctx.lioNombre || "Básico");
  espacio(L, 2);
  campo(L, "Valor total", `$ ${ctx.fmtARS(ctx.total)}`);
  campo(L, "IVA (incluido)", `$ ${ctx.fmtARS(ctx.iva)}`);
  espacio(L, 2);
  parrafo(L, "Este depósito en garantía habilita la solicitud de los insumos quirúrgicos.", { size: 9, color: [90, 90, 90] });
  firmas(L, ["Firma del paciente", "Recibí conforme (caja)"]);
}
