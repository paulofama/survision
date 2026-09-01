// ============================================================
// Sobre Quirúrgico + Ingreso de caja — verificación de los 3 circuitos
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Fixtures calcados de los presupuestos reales del testeo de Administración
// (10/08/2026): P-2026-810 Particular/Vivity, P-2026-812 OSEP/Tórico monofocal
// con descuento del 10%, P-2026-813 Círculo Médico/Monofocal con Avastin.
//
// Las reglas del comprobante de caja son las del segundo testeo (31/08/2026),
// donde Administración aportó el comprobante en papel que usa hoy como modelo:
// VALOR TOTAL / ENTREGA / RESTA PAGAR, dos copias, leyenda C/IVA — S/IVA y
// bloque de tesorería en blanco.
// ============================================================

import { describe, it, expect } from "vitest";
import { nuevoLienzo, nuevaHoja, cerrar, Lienzo, Orientacion } from "../modules/presupuestador/utils/sobre/pdfBase";
import {
  docPedidoCirugia, docIndicaciones, docCronograma, docRecetas,
  docAnalisisEcg, docCaja, docCajaCopia, docTrazabilidad, docConsentimiento,
  calcularDeposito, totalObraSocial, valorTotalCaja, restaPagar,
  requiereFactura, leyendaIva, DX_RECETAS, LEYENDA_RECETA_POR_SISTEMA,
  LEYENDA_A_CARGO_PACIENTE, SobreCtx,
} from "../modules/presupuestador/utils/sobre/documentos";
import {
  armarContexto, docsDelSobre, armarSobreCompleto,
  nombreArchivoSobre, nombreArchivoDocumento, DOCS,
  conceptoCompleto, recetasDelSobre, recetasDeMedicacionAdicional, fmtFechaISO,
} from "../modules/presupuestador/utils/sobre";
import {
  lioSugerido, itemsAplicables, clavesAplicables, Lio,
} from "../modules/presupuestador/utils/circuito";

const fmtARS = (v: number) => {
  const [e, d] = (v || 0).toFixed(2).split(".");
  return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
};

// ── Catálogo de LIOs igual al de las migraciones 33 y 44 ──────────────────────
// La leyenda de resultado visual la tiene SÓLO el Básico: en los demás lentes el
// objetivo refractivo lo elige el paciente y cambia caso por caso.
const LEYENDA_BASICO = "La pte. continúa usando anteojos de lejos y cerca";

const LIOS: Lio[] = [
  { id: "l1", nombre: "Básico",                  descripcion: null, codigo_practica: "030501", leyenda_resultado: LEYENDA_BASICO, activo: true, orden: 1 },
  { id: "l2", nombre: "Monofocal",               descripcion: null, codigo_practica: "030502", leyenda_resultado: null, activo: true, orden: 2 },
  { id: "l3", nombre: "Tórico monofocal",        descripcion: null, codigo_practica: "030503", leyenda_resultado: null, activo: true, orden: 3 },
  { id: "l4", nombre: "Multifocal Panoptic",     descripcion: null, codigo_practica: "030504", leyenda_resultado: null, activo: true, orden: 4 },
  { id: "l5", nombre: "Rango Extendido Vivity",  descripcion: null, codigo_practica: "030505", leyenda_resultado: null, activo: true, orden: 5 },
  { id: "l6", nombre: "Multifocal PanOptix Pro", descripcion: null, codigo_practica: "030514", leyenda_resultado: null, activo: true, orden: 6 },
  { id: "l7", nombre: "Lente rígido",            descripcion: null, codigo_practica: "030511", leyenda_resultado: null, activo: true, orden: 7 },
  { id: "l8", nombre: "Implante secundario",     descripcion: null, codigo_practica: "030508", leyenda_resultado: null, activo: true, orden: 8 },
];

const CONVENIOS = [
  { id: "c1", nombre: "Círculo Médico San Rafael", sub_rama: "circulo_medico" as const, codigo_practica: "020701",
    config: { cuenta: "62252", leyenda: "Valor según Círculo Médico San Rafael", lineas: ["Gastos", "Honorarios de Especialista"], diag: "Catarata" }, activo: true, orden: 1 },
  { id: "c2", nombre: "OSEP", sub_rama: "directa" as const, codigo_practica: "02.09.03",
    config: { cupo: "", diag: "CATARATA {ojo}" }, activo: true, orden: 2 },
];

const CONSENTIMIENTO = [
  { titulo: "PLACEHOLDER — pendiente del texto legal definitivo", cuerpo: "Texto placeholder. ".repeat(30) },
];

// ── Presupuestos reales (recortados a lo que usa el sobre) ────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P810: any = {
  id: "p810", numero_presupuesto: "P-2026-810",
  paciente_apellido: "Murgo", paciente_nombre: "Marianela", paciente_documento: "30724328",
  prestacion_codigo: "030505",
  prestacion_descripcion: "Facoemulsificacion mas Implante de Lio Rango Extendido Vivity",
  total_final: 6299260,
  datos_completos: {
    paciente: { obraSocial: "Particular", numeroAfiliado: "1", telefono: "2604842119", fechaNacimiento: "1983-01-20", documento: "30724328" },
    tratamiento: { prestacionCodigo: "030505", ojoTratar: "derecho" },
    insumos: [],
    precios: { neto: 5206000, iva: 1093260, total: 6299260, descuento: 0, porcentajeDescuento: 0, totalInsumos: 0, subtotalDespuesCobertura: 5206000 },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P812: any = {
  id: "p812", numero_presupuesto: "P-2026-812",
  paciente_apellido: "Murgo", paciente_nombre: "Marianela", paciente_documento: "30724328",
  prestacion_codigo: "030503",
  prestacion_descripcion: "Facoemulsificacion mas Implante de Lio Torico monofocal",
  total_final: 2411482.69,
  datos_completos: {
    paciente: { obraSocial: "Osep", numeroAfiliado: "4400499/00", telefono: "2604842119", fechaNacimiento: "1983-01-20", documento: "30724328" },
    tratamiento: { prestacionCodigo: "030503", ojoTratar: "derecho" },
    insumos: [],
    precios: { neto: 1992960.9, iva: 418521.789, total: 2411482.689, descuento: 221440.1, porcentajeDescuento: 10, totalInsumos: 0, subtotalDespuesCobertura: 2214401 },
  },
};

// P-2026-813 (Círculo Médico) + la ampolla de Avastin como ítem adicional.
// OJO: `obraSocial: "Ospelsym"` es el dato REAL de la ficha del paciente, y es
// el que disparó el bug transversal de la FASE 3 — ver el describe de cobertura.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P813: any = {
  id: "p813", numero_presupuesto: "P-2026-813",
  paciente_apellido: "Murgo", paciente_nombre: "Marianela", paciente_documento: "30724328",
  prestacion_codigo: "030502",
  prestacion_descripcion: "Facoemulsificacion mas Implantes de Lio Monofocal",
  total_final: 1557318.4,
  datos_completos: {
    paciente: { obraSocial: "Ospelsym", numeroAfiliado: "20307243287", telefono: "2604842119", fechaNacimiento: "1983-01-20", documento: "30724328", circuloMedico: true },
    tratamiento: { prestacionCodigo: "030502", ojoTratar: "derecho" },
    insumos: [{ id: 1, descripcion: "AVASTIN", monto: 106973.11, moneda: "ARS", montoOriginal: 106973.11 }],
    precios: { neto: 1394013.11, iva: 292742.75, total: 1686755.86, descuento: 0, porcentajeDescuento: 0, totalInsumos: 106973.11, subtotalDespuesCobertura: 1287040 },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aceptacionDe = (over: any) => ({
  presupuesto_id: "x", rama_cobertura: "PARTICULAR", sub_rama: null, convenio_id: null,
  fecha_tentativa_cirugia: "2026-08-11", ojo: "OD", lio_id: "l1", requiere_analisis_ecg: false,
  created_by: "test", deposito_modalidad: null, deposito_valor: null,
  caja_monto_unico: null, caja_registrado_por: null, caja_registrado_en: null,
  ...over,
});

const ctxDe = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presupuesto: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aceptacionOver: any,
  caja?: SobreCtx["caja"],
  entregasPrevias = 0,
): SobreCtx =>
  armarContexto({
    presupuesto,
    aceptacion: aceptacionDe(aceptacionOver),
    convenios: CONVENIOS,
    lios: LIOS,
    consentimiento: CONSENTIMIENTO,
    caja,
    entregasPrevias,
  });

/** Caja sin nada cargado (el operador todavía no tipeó la entrega). */
const CAJA_0: SobreCtx["caja"] = { depositoModalidad: null, depositoValor: null, montoUnico: null, entrega: null };
/** Entrega en pesos. `montoUnico` sólo aplica en obra social. */
const cajaCon = (entrega: number | null, montoUnico: number | null = null): SobreCtx["caja"] =>
  ({ depositoModalidad: null, depositoValor: null, montoUnico, entrega });

// ── Extracción de texto del PDF (jsPDF no comprime: los literales son legibles) ──

const rawPdf = (L: Lienzo): string => {
  const ab = L.doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(ab).reduce((s, b) => s + String.fromCharCode(b), "");
};

/**
 * El PDF guarda el texto en WinAnsi (CP1252), un byte por carácter, y `rawPdf`
 * lo lee byte a byte. En 0x80–0x9F CP1252 NO coincide con Unicode: el guion
 * largo se guarda como 0x97 y salía como U+0097 en vez de U+2014, así que una
 * comparación contra el literal del código fallaba aunque el PDF estuviera bien.
 * Fuera de ese rango los códigos coinciden (la "í" es 0xED en los dos).
 */
const CP1252_ALTO: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…",
  0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8A: "Š",
  0x8B: "‹", 0x8C: "Œ", 0x8E: "Ž", 0x91: "‘", 0x92: "’",
  0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
  0x98: "˜", 0x99: "™", 0x9A: "š", 0x9B: "›", 0x9C: "œ",
  0x9E: "ž", 0x9F: "Ÿ",
};

const deWinAnsi = (s: string): string =>
  s.replace(/[\u0080-\u009F]/g, (c) => CP1252_ALTO[c.charCodeAt(0)] ?? c);

/** El PDF renderiza cada línea como `(texto) Tj`. Devuelve el texto plano. */
const textoDe = (L: Lienzo): string => {
  const raw = rawPdf(L);
  const partes = raw.match(/\(((?:\\.|[^()\\])*)\)\s*Tj/g) || [];
  return deWinAnsi(
    partes
      .map((p) => p.replace(/\)\s*Tj$/, "").replace(/^\(/, "").replace(/\\([()\\])/g, "$1"))
      .join("\n"),
  );
};

type Builder = (L: Lienzo, c: SobreCtx, abrirHoja: (l: Lienzo) => void) => void;

const construir = (build: Builder, ctx: SobreCtx, orient?: Orientacion): Lienzo => {
  const L = nuevoLienzo({ fecha: "10/08/2026", orient });
  build(L, ctx, (l) => nuevaHoja(l, orient ?? "p"));
  cerrar(L);
  return L;
};

/** Una sola copia del comprobante, para asertar sin duplicados. */
const textoCaja = (ctx: SobreCtx): string =>
  textoDe(construir((L, c) => docCajaCopia(L, c, "paciente"), ctx));

// ============================================================
// 1. LIO — se deduce del presupuesto
// ============================================================
describe("LIO del presupuesto", () => {
  it("resuelve el LIO por código de prestación", () => {
    expect(lioSugerido(P810, LIOS)).toBe("l5"); // Rango Extendido Vivity
    expect(lioSugerido(P812, LIOS)).toBe("l3"); // Tórico monofocal
    expect(lioSugerido(P813, LIOS)).toBe("l2"); // Monofocal
  });

  it("cae al nombre cuando el código no está mapeado", () => {
    const p = { prestacion_codigo: "030509", prestacion_descripcion: "Implante Secundario de Lio Suturado o esclera o Iris (Incluye Vitrectomia)" };
    expect(lioSugerido(p, LIOS)).toBe("l8");
  });

  it("prefiere el nombre más largo (Tórico monofocal, no Monofocal)", () => {
    const p = { prestacion_codigo: "", prestacion_descripcion: "Facoemulsificacion mas Implante de Lio Torico monofocal" };
    expect(lioSugerido(p, LIOS)).toBe("l3");
  });

  it("devuelve vacío si la prestación no identifica un LIO", () => {
    const p = { prestacion_codigo: "030002", prestacion_descripcion: "Yag Laser - Capsulotomia" };
    expect(lioSugerido(p, LIOS)).toBe("");
  });

  it("el LIO del presupuesto llega al sobre y a la caja", () => {
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" });
    expect(ctx.lioNombre).toBe("Tórico monofocal");
    expect(textoDe(construir(docPedidoCirugia, ctx))).toContain("Tórico monofocal");
  });
});

// ============================================================
// 1b. Fecha de cirugía — columna `date`, sin corrimiento por zona horaria
// ============================================================
describe("Fecha de cirugía", () => {
  it("no se corre un día (columna date leída como UTC en un huso negativo)", () => {
    // new Date("2026-08-11") = medianoche UTC = 10/08 en Argentina.
    expect(fmtFechaISO("2026-08-11")).toBe("11/08/2026");
    expect(fmtFechaISO("2026-01-01")).toBe("01/01/2026");
    expect(fmtFechaISO("2026-12-31")).toBe("31/12/2026");
    expect(fmtFechaISO(null)).toBe("");
    expect(fmtFechaISO("")).toBe("");
  });

  it("la fecha llega intacta a los documentos del sobre", () => {
    // Fecha elegida lejos de la del membrete y cruzando fin de mes: con el bug
    // el 01/03 se imprimía como 28/02.
    const ctx = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2", fecha_tentativa_cirugia: "2026-03-01" });
    expect(ctx.fechaCirugia).toBe("01/03/2026");
    for (const build of [docPedidoCirugia, docIndicaciones, docTrazabilidad]) {
      const t = textoDe(construir(build, ctx));
      expect(t).toContain("01/03/2026");
      expect(t).not.toContain("28/02/2026");
    }
  });
});

// ============================================================
// 1c. BUG TRANSVERSAL — manda el convenio de la aceptación, no la ficha
// ============================================================
// Relevado el 31/08/2026 sobre P-2026-813: "cargué OSEP y todo lo extiende por
// Ospelsym". `datos_completos.paciente.obraSocial` es texto libre copiado de la
// ficha del paciente y le ganaba al convenio elegido al aceptar.
describe("Cobertura impresa", () => {
  it("imprime el convenio de la aceptación, no la obra social de la ficha", () => {
    // La ficha dice "Ospelsym" (que ni siquiera existe en el catálogo de
    // convenios); la aceptación dice OSEP. Manda OSEP.
    expect(P813.datos_completos.paciente.obraSocial).toBe("Ospelsym");
    const ctx = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l2" });
    expect(ctx.coberturaLabel).toBe("OSEP");

    for (const build of [docPedidoCirugia, docRecetas, docAnalisisEcg, docTrazabilidad]) {
      const t = textoDe(construir(build, ctx));
      expect(t, build.name).not.toContain("Ospelsym");
    }
    expect(textoCaja(ctx)).not.toContain("Ospelsym");
    expect(textoCaja(ctx)).toContain("OSEP");
  });

  it("el mismo presupuesto aceptado por Círculo Médico imprime Círculo Médico", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" });
    expect(ctx.coberturaLabel).toBe("Círculo Médico San Rafael");
    expect(textoDe(construir(docPedidoCirugia, ctx))).not.toContain("Ospelsym");
  });

  it("Particular nunca imprime la obra social de la ficha", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "PARTICULAR", lio_id: "l2" });
    expect(ctx.coberturaLabel).toBe("Particular");
    expect(textoDe(construir(docPedidoCirugia, ctx))).not.toContain("Ospelsym");
  });

  it("las recetas por sistema se deciden por el convenio, no por el texto de la ficha", () => {
    // Ficha "Ospelsym", convenio OSEP -> sí, por el convenio.
    const osep = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l2" });
    expect(osep.recetasPorSistema).toBe(true);
    // Ficha "Osep", convenio Círculo Médico -> NO: el convenio manda.
    const circulo = ctxDe(
      { ...P812, datos_completos: { ...P812.datos_completos, paciente: { ...P812.datos_completos.paciente, obraSocial: "Osep" } } },
      { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l3" },
    );
    expect(circulo.recetasPorSistema).toBe(false);
  });
});

// ============================================================
// 2. Checklist por cobertura
// ============================================================
describe("Checklist por cobertura", () => {
  it("Particular NO incluye los trámites de obra social", () => {
    const claves = clavesAplicables({ rama_cobertura: "PARTICULAR", requiere_analisis_ecg: true });
    expect(claves.has("orden_autorizada")).toBe(false);
    expect(claves.has("autorizacion_os")).toBe(false);
    expect(claves.has("consentimiento_firmado")).toBe(true);
    expect(claves.has("deposito_garantia")).toBe(true);
  });

  it("Obra social SÍ incluye orden autorizada y autorización", () => {
    const claves = clavesAplicables({ rama_cobertura: "OBRA_SOCIAL", requiere_analisis_ecg: true });
    expect(claves.has("orden_autorizada")).toBe(true);
    expect(claves.has("autorizacion_os")).toBe(true);
  });

  it("análisis/ECG existe siempre pero se pre-marca 'no aplica' si no se pidió", () => {
    const ctx = { rama_cobertura: "OBRA_SOCIAL" as const, requiere_analisis_ecg: false };
    const item = itemsAplicables(ctx).find((i) => i.clave === "analisis_ecg");
    expect(item).toBeDefined();
    expect(item?.noAplica?.(ctx)).toBe(true);
  });
});

// ============================================================
// 3. Pedido de cirugía — ojo siempre, N° de afiliado sólo si hay OS
// ============================================================
describe("Pedido de cirugía", () => {
  it("Particular: con ojo y SIN número de afiliado", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const t = textoDe(construir(docPedidoCirugia, ctx));
    expect(t).toContain("Ojo a operar");
    expect(t).toContain("ojo derecho (OD)");
    expect(t).toContain("Cobertura");
    expect(t).not.toContain("afiliado");
    expect(t).not.toContain("O. Social");
  });

  it("OSEP (vía directa): con ojo y con número de afiliado", () => {
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" });
    const t = textoDe(construir(docPedidoCirugia, ctx));
    expect(t).toContain("Ojo a operar");
    expect(t).toContain("N° de afiliado");
    expect(t).toContain("4400499/00");
    expect(t).toContain("CATARATA OD");
  });

  it("Círculo Médico: con ojo, número de afiliado y la vía de autorización", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" });
    const t = textoDe(construir(docPedidoCirugia, ctx));
    expect(t).toContain("Ojo a operar");
    expect(t).toContain("N° de afiliado");
    expect(t).toContain("20307243287");
    expect(t).toContain("Círculo Médico San Rafael");
    expect(t).toContain("020701");
  });

  // ── FASE 3 · 6.1 ──
  it("renglón único CUPO / FECHA PROBABLE, con la fecha si está cargada", () => {
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" });
    const t = textoDe(construir(docPedidoCirugia, ctx));
    expect(t).toContain("CUPO / FECHA PROBABLE DE CIRUGÍA");
    expect(t).toContain("11/08/2026");
    // Ya no existe el "CUPO:" suelto que salía siempre vacío ni la "Fecha de
    // cirugía" aparte.
    expect(t).not.toMatch(/^CUPO:?$/m);
    expect(t).not.toContain("Fecha de cirugía");
  });

  it("sin fecha cargada, el renglón queda en blanco para completar a mano", () => {
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3", fecha_tentativa_cirugia: null });
    const t = textoDe(construir(docPedidoCirugia, ctx));
    expect(t).toContain("CUPO / FECHA PROBABLE DE CIRUGÍA");
  });

  it("el renglón combinado también sale en Particular (no depende del convenio)", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    expect(textoDe(construir(docPedidoCirugia, ctx))).toContain("CUPO / FECHA PROBABLE DE CIRUGÍA");
  });
});

// ============================================================
// 4. Recetas — una por hoja, con membrete completo
// ============================================================
describe("Recetas", () => {
  it("van una por hoja (3 hojas) y con dirección, teléfono y fecha", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const L = nuevoLienzo({ fecha: "10/08/2026" });
    docRecetas(L, ctx, (l) => nuevaHoja(l));
    cerrar(L);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBe(3);
    const t = textoDe(L);
    expect(t).toContain("Receta A");
    expect(t).toContain("Receta B");
    expect(t).toContain("Receta C");
    // Membrete completo repetido en las 3 hojas
    expect((t.match(/INSTITUTO DR. MERCADO/g) || []).length).toBe(3);
    expect((t.match(/3 de Febrero 448/g) || []).length).toBe(3);
    expect((t.match(/0260-4426757/g) || []).length).toBe(3);
    expect((t.match(/10\/08\/2026/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  // ── FASE 3 · 6.4 ──
  it("TODAS las recetas llevan Dx: Cirugía ocular", () => {
    expect(DX_RECETAS).toBe("Cirugía ocular");
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const L = nuevoLienzo({ fecha: "10/08/2026" });
    docRecetas(L, ctx, (l) => nuevaHoja(l));
    cerrar(L);
    const t = textoDe(L);
    // Una por receta, ninguna con el diagnóstico viejo.
    expect((t.match(/Cirugía ocular/g) || []).length).toBe(3);
    expect(t).not.toContain("Cataratas");
  });

  it("la medicación adicional genera su propia receta (Círculo Médico)", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" });
    expect(ctx.recetasPorSistema).toBe(false);
    expect(recetasDeMedicacionAdicional(ctx).map((r) => r.items[0])).toEqual(["AVASTIN"]);
    expect(recetasDelSobre(ctx)).toHaveLength(4);

    const L = nuevoLienzo({ fecha: "10/08/2026" });
    docRecetas(L, ctx, (l) => nuevaHoja(l));
    cerrar(L);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBe(4);
    const t = textoDe(L);
    expect(t).toContain("Receta D - Medicación adicional");
    expect(t).toContain("AVASTIN");
    // Con membrete completo también en la receta nueva
    expect((t.match(/3 de Febrero 448/g) || []).length).toBe(4);
  });

  // ── FASE 3 · 6.5 · CAMBIO DE REGLA ──
  // Antes OSEP suprimía la receta de medicación adicional y se perdía el
  // respaldo en papel del sobre. Ahora se imprimen todas, con leyenda al pie.
  it("OSEP SÍ imprime las recetas, con la leyenda de carga por su sistema", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l2" });
    expect(ctx.recetasPorSistema).toBe(true);
    expect(recetasDeMedicacionAdicional(ctx).map((r) => r.items[0])).toEqual(["AVASTIN"]);
    expect(recetasDelSobre(ctx)).toHaveLength(4);

    const L = nuevoLienzo(); docRecetas(L, ctx, (l) => nuevaHoja(l)); cerrar(L);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBe(4);
    const t = textoDe(L);
    expect(t).toContain("Medicación adicional");
    // La leyenda va en CADA receta, no una sola vez.
    expect((t.match(new RegExp(LEYENDA_RECETA_POR_SISTEMA, "g")) || []).length).toBe(4);
  });

  it("fuera de OSEP no aparece ninguna leyenda de carga por sistema", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const L = nuevoLienzo(); docRecetas(L, ctx, (l) => nuevaHoja(l)); cerrar(L);
    expect(textoDe(L)).not.toContain(LEYENDA_RECETA_POR_SISTEMA);
  });

  it("suprimir las recetas es un flag del convenio, no un cambio de código", () => {
    const conveniosSuprime = [
      CONVENIOS[0],
      { ...CONVENIOS[1], config: { ...CONVENIOS[1].config, recetas_suprimir: true } },
    ];
    const ctx = armarContexto({
      presupuesto: P813,
      aceptacion: aceptacionDe({ rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l2" }),
      convenios: conveniosSuprime, lios: LIOS, consentimiento: CONSENTIMIENTO,
    });
    expect(recetasDelSobre(ctx)).toEqual([]);
  });

  it("Particular con medicación adicional SÍ emite la receta", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "PARTICULAR", lio_id: "l2" });
    expect(ctx.recetasPorSistema).toBe(false);
    expect(recetasDelSobre(ctx)).toHaveLength(4);
  });

  it("muestra el N° de afiliado sólo en obra social", () => {
    const part = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const Lp = nuevoLienzo(); docRecetas(Lp, part, (l) => nuevaHoja(l)); cerrar(Lp);
    expect(textoDe(Lp)).not.toContain("afiliado");

    const os = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" });
    const Lo = nuevoLienzo(); docRecetas(Lo, os, (l) => nuevaHoja(l)); cerrar(Lo);
    expect(textoDe(Lo)).toContain("4400499/00");
  });
});

// ============================================================
// 5. Cronograma — una sola hoja apaisada, instructivo aparte
// ============================================================
describe("Cronograma de gotas", () => {
  const ctxCron = () => ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });

  it("se dibuja en A4 apaisado", () => {
    const L = construir(docCronograma, ctxCron(), "l");
    expect(L.pw).toBe(297);
    expect(L.ph).toBe(210);
    // MediaBox apaisado (A4 = 841.89 x 595.28 pt; jsPDF escribe más decimales)
    expect(rawPdf(L)).toMatch(/MediaBox \[0 0 841\.88\d* 595\.27\d*\]/);
  });

  // ── FASE 3 · 6.3 ──
  it("el cronograma entra COMPLETO en la primera hoja, con la fila de las 24:00", () => {
    const L = construir(docCronograma, ctxCron(), "l");
    // Hoja 1 = cronograma, hoja 2 = instructivo. Ni una más: si la tabla se
    // partiera habría una hoja intermedia.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBe(2);

    // El texto de la hoja 1 tiene que traer las 9 franjas, la última incluida.
    // Se corta el volcado en el título del instructivo, que abre la hoja 2.
    const t = textoDe(L);
    const hoja1 = t.split("Instructivo de colocación de gotas")[0];
    for (const h of ["8:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"]) {
      expect(hoja1, `franja ${h} fuera de la primera hoja`).toContain(h);
    }
  });

  it("el instructivo de gotas va en su propia hoja", () => {
    const L = construir(docCronograma, ctxCron(), "l");
    const t = textoDe(L);
    expect(t).toContain("Cronograma de tratamiento quirúrgico");
    expect(t).toContain("Instructivo de colocación de gotas");
    // El instructivo arranca después del cronograma, no antes.
    expect(t.indexOf("Cronograma de tratamiento")).toBeLessThan(t.indexOf("Instructivo de colocación"));
    // Y la hoja del instructivo lleva su propio membrete.
    expect((t.match(/INSTITUTO DR. MERCADO/g) || []).length).toBe(2);
  });

  // ── FASE 3 · 6.2 ──
  it("cada semana tiene espacio para el rango de fechas, en blanco", () => {
    const t = textoDe(construir(docCronograma, ctxCron(), "l"));
    for (const s of ["SEMANA 1", "SEMANA 2", "SEMANA 3"]) {
      expect(t, s).toContain(s);
    }
    // Tres renglones "del __/__ al __/__" y tres "AL OJO", uno por semana.
    expect((t.match(/del ____\/____ al ____\/____/g) || []).length).toBe(3);
    expect((t.match(/AL OJO: ________/g) || []).length).toBe(3);
  });

  it("conserva el contenido original del cronograma", () => {
    const t = textoDe(construir(docCronograma, ctxCron(), "l"));
    expect(t).toContain("G = Gatif Forte");
    expect(t).toContain("Gatif Forte + Natax + Dolten (desde el día de la cirugía)");
    expect(t).toContain("Aucic Plus");
  });
});

// ============================================================
// 6. Ingreso de caja — VALOR TOTAL / ENTREGA / RESTA PAGAR
// ============================================================
describe("Ingreso de caja — dos copias", () => {
  it("emite COPIA PARA EL PACIENTE y COPIA PARA ADMINISTRACIÓN, una por hoja", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(1500000));
    const L = construir(docCaja, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBe(2);
    const t = textoDe(L);
    expect(t).toContain("COPIA PARA EL PACIENTE");
    expect(t).toContain("COPIA PARA ADMINISTRACIÓN");
  });

  it("el contenido de las dos copias es idéntico salvo el rótulo", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(1500000));
    const limpiar = (c: "paciente" | "administracion") =>
      textoDe(construir((L, x) => docCajaCopia(L, x, c), ctx))
        .replace(/COPIA PARA (EL PACIENTE|ADMINISTRACIÓN)/g, "COPIA");
    expect(limpiar("paciente")).toBe(limpiar("administracion"));
  });
});

describe("Ingreso de caja — Particular", () => {
  const base = { rama_cobertura: "PARTICULAR", lio_id: "l5" };

  it("imprime VALOR TOTAL, ENTREGA y RESTA PAGAR", () => {
    const ctx = ctxDe(P810, base, cajaCon(1500000));
    expect(valorTotalCaja(ctx)).toBe(6299260);
    expect(restaPagar(ctx)).toBe(6299260 - 1500000);
    const t = textoCaja(ctx);
    expect(t).toContain("VALOR TOTAL");
    expect(t).toContain("ENTREGA");
    expect(t).toContain("RESTA PAGAR");
    expect(t).toContain(fmtARS(6299260));
    expect(t).toContain(fmtARS(1500000));
    expect(t).toContain(fmtARS(6299260 - 1500000));
  });

  // Caso 1 de la verificación del prompt de FASE 3.
  it("total 1.011.600 con entrega 700.000 deja resta 311.600", () => {
    const p = {
      ...P810,
      total_final: 1011600,
      datos_completos: {
        ...P810.datos_completos,
        precios: { ...P810.datos_completos.precios, total: 1011600, descuento: 0, porcentajeDescuento: 0, subtotalDespuesCobertura: 1011600 },
      },
    };
    const ctx = ctxDe(p, { rama_cobertura: "PARTICULAR", lio_id: "l1" }, cajaCon(700000));
    expect(restaPagar(ctx)).toBe(311600);
    const t = textoCaja(ctx);
    expect(t).toContain(fmtARS(1011600));
    expect(t).toContain(fmtARS(700000));
    expect(t).toContain(fmtARS(311600));
  });

  it("una segunda entrega descuenta del saldo que dejó la primera", () => {
    // Ya se entregaron 700.000; ahora se entregan 200.000.
    const ctx = ctxDe(P810, base, cajaCon(200000), 700000);
    expect(restaPagar(ctx)).toBe(6299260 - 700000 - 200000);
    const t = textoCaja(ctx);
    expect(t).toContain("Entregas anteriores");
    expect(t).toContain(fmtARS(700000));
    expect(t).toContain(fmtARS(6299260 - 900000));
  });

  it("el saldo nunca sale negativo aunque se sobre-entregue", () => {
    const ctx = ctxDe(P810, base, cajaCon(9999999));
    expect(restaPagar(ctx)).toBe(0);
  });

  it("la entrega por PORCENTAJE se resuelve sobre el valor total", () => {
    const ctx = ctxDe(P810, base, { depositoModalidad: "PORCENTAJE", depositoValor: 30, montoUnico: null, entrega: null });
    expect(calcularDeposito(ctx)?.monto).toBeCloseTo(6299260 * 0.3, 2);
  });

  it("sin entrega cargada deja los renglones para completar a mano", () => {
    const ctx = ctxDe(P810, base, CAJA_0);
    const t = textoCaja(ctx);
    expect(t).toContain("ENTREGA");
    expect(t).toContain("RESTA PAGAR");
    expect(t).toContain("completar a mano");
  });

  it("el DNI va siempre, sin N° de afiliado", () => {
    const ctx = ctxDe(P810, base, cajaCon(100000));
    const t = textoCaja(ctx);
    expect(t).toContain("30724328");
    expect(t).toContain("PARTICULAR");
    expect(t).not.toContain("afiliado");
  });

  it("detalla el ojo a operar", () => {
    const ctx = ctxDe(P810, base, cajaCon(100000));
    expect(textoCaja(ctx)).toContain("ojo derecho (OD)");
  });

  it("el descuento se muestra como línea propia con Exento de IVA", () => {
    const conDescuento = {
      ...P810,
      datos_completos: {
        ...P810.datos_completos,
        precios: { ...P810.datos_completos.precios, descuento: 520600, porcentajeDescuento: 10 },
      },
    };
    const ctx = ctxDe(conDescuento, base, cajaCon(100000));
    const t = textoCaja(ctx);
    expect(t).toContain("Descuento autorizado (10,00 %) - Exento de IVA");
    expect(t).toContain(fmtARS(520600));
  });
});

// ── FASE 3 · 7.5 · la leyenda que le dice a Ivana si factura ──
describe("Ingreso de caja — leyenda C/IVA — S/IVA", () => {
  it("sin descuento: C/IVA y requiere_factura = true", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(100000));
    expect(ctx.precios.descuento).toBe(0);
    expect(requiereFactura(ctx)).toBe(true);
    expect(leyendaIva(ctx)).toBe("C/IVA");
    const t = textoCaja(ctx);
    expect(t).toContain("C/IVA");
    expect(t).not.toContain("S/IVA");
  });

  it("con descuento: S/IVA y requiere_factura = false", () => {
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, cajaCon(500000, 2214401));
    expect(ctx.precios.descuento).toBe(221440.1);
    expect(requiereFactura(ctx)).toBe(false);
    expect(leyendaIva(ctx)).toBe("S/IVA");
    const t = textoCaja(ctx);
    expect(t).toContain("S/IVA");
    expect(t).not.toContain("C/IVA");
  });

  it("cualquier descuento mayor a cero dispara S/IVA, no sólo el 10%", () => {
    const conPeso = {
      ...P810,
      datos_completos: {
        ...P810.datos_completos,
        precios: { ...P810.datos_completos.precios, descuento: 1, porcentajeDescuento: 0 },
      },
    };
    const ctx = ctxDe(conPeso, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(100000));
    expect(leyendaIva(ctx)).toBe("S/IVA");
  });

  it("en el papel va sólo la sigla, sin interpretación fiscal", () => {
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, cajaCon(500000, 2214401));
    const t = textoCaja(ctx);
    expect(t).not.toContain("no corresponde factura");
    expect(t).not.toContain("requiere_factura");
  });
});

// ── FASE 3 · 5.2 · la leyenda de resultado visual ──
describe("Ingreso de caja — leyenda de resultado visual del LIO", () => {
  it("el LIO Básico imprime la frase de resultado visual", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l1" }, cajaCon(100000));
    expect(ctx.lioLeyenda).toBe(LEYENDA_BASICO);
    expect(textoCaja(ctx)).toContain(LEYENDA_BASICO);
  });

  it("los demás lentes NO imprimen ninguna frase", () => {
    for (const id of ["l2", "l3", "l4", "l5", "l6", "l7", "l8"]) {
      const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: id }, cajaCon(100000));
      expect(ctx.lioLeyenda, id).toBe("");
      expect(textoCaja(ctx), id).not.toContain("anteojos");
    }
  });

  it("el nombre del lente sí va siempre", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l6" }, cajaCon(100000));
    const t = textoCaja(ctx);
    expect(t).toContain("LIO ELEGIDO");
    expect(t).toContain("Multifocal PanOptix Pro");
  });
});

// ── FASE 3 · 7.6 · el bloque de tesorería se imprime vacío ──
describe("Ingreso de caja — bloque de tesorería", () => {
  it("imprime TESORERÍA / MONTO / FECHA / FIRMA en blanco", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(1500000));
    for (const et of ["TESORERÍA", "MONTO", "FECHA", "FIRMA"]) {
      expect(textoCaja(ctx), et).toContain(et);
    }
  });

  it("no prellena el operador que registró la entrega", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(1500000));
    // Flavio lo completa de puño y letra: si el sistema lo imprimiera, el bloque
    // perdería su función de registro manual.
    expect(textoCaja(ctx)).not.toContain("test");
  });
});

describe("Ingreso de caja — Obra social vía directa (OSEP)", () => {
  const base = { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" };

  it("el VALOR TOTAL es el importe a cargo del paciente", () => {
    const ctx = ctxDe(P812, base, cajaCon(500000, 2214401));
    expect(totalObraSocial(ctx)).toBeCloseTo(2214401 - 221440.1, 2);
    expect(valorTotalCaja(ctx)).toBeCloseTo(2214401 - 221440.1, 2);
    const t = textoCaja(ctx);
    expect(t).toContain(fmtARS(2214401 - 221440.1));
    expect(t).toContain(LEYENDA_A_CARGO_PACIENTE);
  });

  it("ya no dice que el importe lo cubre la obra social", () => {
    const ctx = ctxDe(P812, base, cajaCon(500000, 2214401));
    expect(textoCaja(ctx)).not.toContain("Importe registrado por convenio");
  });

  it("mantiene ENTREGA y RESTA PAGAR, igual que en Particular", () => {
    const ctx = ctxDe(P812, base, cajaCon(500000, 2214401));
    expect(restaPagar(ctx)).toBeCloseTo(2214401 - 221440.1 - 500000, 2);
    const t = textoCaja(ctx);
    expect(t).toContain("ENTREGA");
    expect(t).toContain("RESTA PAGAR");
  });

  it("DNI y N° de afiliado", () => {
    const ctx = ctxDe(P812, base, cajaCon(500000, 2214401));
    const t = textoCaja(ctx);
    expect(t).toContain("30724328");        // DNI
    expect(t).toContain("4400499/00");      // afiliado
  });

  it("SIN ninguna línea de IVA", () => {
    const ctx = ctxDe(P812, base, cajaCon(500000, 2214401));
    const t = textoCaja(ctx);
    expect(t).not.toMatch(/IVA \(incluido\)/);
    expect(t).not.toContain(fmtARS(418521.789));
  });
});

describe("Ingreso de caja — Círculo Médico", () => {
  const base = { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" };

  it("sin detalle de IVA", () => {
    const ctx = ctxDe(P813, base, cajaCon(400000, 1287040));
    const t = textoCaja(ctx);
    expect(t).not.toMatch(/IVA \(incluido\)/);
    expect(t).not.toContain(fmtARS(292742.75));
  });

  it("detalla la ampolla de Avastin del presupuesto y la suma al total", () => {
    const ctx = ctxDe(P813, base, cajaCon(400000, 1287040));
    expect(ctx.itemsAdicionales).toEqual([{ descripcion: "AVASTIN", monto: 106973.11 }]);
    expect(valorTotalCaja(ctx)).toBeCloseTo(1287040 + 106973.11, 2);
    const t = textoCaja(ctx);
    expect(t).toContain("AVASTIN");
    expect(t).toContain(fmtARS(106973.11));
    expect(t).toContain(fmtARS(1287040 + 106973.11));
  });

  it("el concepto dice qué está pagando, en el encabezado del detalle", () => {
    const ctx = ctxDe(P813, base, cajaCon(400000, 1287040));
    expect(conceptoCompleto(ctx)).toBe("Cirugía de catarata con LIO Monofocal + AVASTIN");
    expect(textoCaja(ctx)).toContain("CIRUGÍA DE CATARATA CON LIO MONOFOCAL + AVASTIN");
  });

  it("detalla el ojo a operar", () => {
    const ctx = ctxDe(P813, base, cajaCon(400000, 1287040));
    expect(textoCaja(ctx)).toContain("ojo derecho (OD)");
  });

  it("los ítems adicionales también se detallan en Particular", () => {
    const ctx = ctxDe(P813, { rama_cobertura: "PARTICULAR", lio_id: "l2" }, cajaCon(500000));
    expect(textoCaja(ctx)).toContain("AVASTIN");
  });
});

describe("Ingreso de caja — regla transversal de IVA", () => {
  const CASOS: [string, SobreCtx, number][] = [
    ["Particular", ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(100000)), 1093260],
    ["OSEP", ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, cajaCon(500000, 2214401)), 418521.789],
    ["Círculo", ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" }, cajaCon(400000, 1287040)), 292742.75],
  ];

  it.each(CASOS)("%s: nunca desglosa el IVA", (nombre, ctx, montoIva) => {
    const t = textoCaja(ctx);
    expect(t, nombre).not.toContain("IVA (incluido)");
    expect(t, nombre).not.toContain("Neto");
    expect(t, nombre).not.toContain(fmtARS(montoIva));
    // Las únicas menciones admitidas de "IVA" son la sigla de facturación y la
    // aclaración del descuento. \b para no engancharse con "ARCHIVAR".
    for (const m of t.match(/[^\n]*\bIVA\b[^\n]*/g) || []) {
      expect(m, `${nombre}: "${m}"`).toMatch(/C\/IVA|S\/IVA|Exento de IVA/);
    }
  });

  it.each(CASOS)("%s: el ojo a operar figura en el comprobante", (nombre, ctx) => {
    expect(textoCaja(ctx), nombre).toContain("ojo derecho (OD)");
  });
});

// ============================================================
// 7. Estructura del sobre — trazabilidad y consentimiento desprendibles
// ============================================================
describe("Estructura del Sobre Quirúrgico", () => {
  it("trazabilidad y consentimiento van últimos y en hoja propia", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, cajaCon(100000));
    const orden = docsDelSobre(ctx).map((d) => d.clave);
    expect(orden.slice(-2)).toEqual(["trazabilidad", "consentimiento"]);
    expect(orden.indexOf("caja")).toBeLessThan(orden.indexOf("trazabilidad"));
    // Ningún documento del paciente después de los de quirófano
    expect(DOCS.filter((d) => d.quirofano).map((d) => d.clave)).toEqual(["trazabilidad", "consentimiento"]);
  });

  it("cada documento de quirófano lleva su sello y arranca en su hoja", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const tTraz = textoDe(construir(docTrazabilidad, ctx));
    expect(tTraz).toContain("ARCHIVAR EN QUIRÓFANO");
    expect(tTraz).toContain("Ley de Trazabilidad");
    // La trazabilidad ya no comparte hoja con las indicaciones del paciente
    expect(tTraz).not.toContain("Tratamiento prequirúrgico");
    expect(tTraz).not.toContain("Cronograma");

    const tCons = textoDe(construir(docConsentimiento, ctx));
    expect(tCons).toContain("ARCHIVAR EN QUIRÓFANO");
    expect(tCons).toContain("Consentimiento informado");
    expect(tCons).not.toContain("Ley de Trazabilidad");
  });

  it("el consentimiento conserva el placeholder (no se inventa texto legal)", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    expect(textoDe(construir(docConsentimiento, ctx))).toContain("PLACEHOLDER");
  });

  it("las indicaciones del paciente ya no arrastran trazabilidad ni consentimiento", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const t = textoDe(construir(docIndicaciones, ctx));
    expect(t).toContain("Indicaciones para cirugía de cataratas");
    expect(t).not.toContain("Ley de Trazabilidad");
    expect(t).not.toContain("Consentimiento informado");
  });

  it("el análisis/ECG sólo entra si el circuito lo requiere", () => {
    const sin = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5", requiere_analisis_ecg: false });
    const con = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5", requiere_analisis_ecg: true });
    expect(docsDelSobre(sin).map((d) => d.clave)).not.toContain("analisis");
    expect(docsDelSobre(con).map((d) => d.clave)).toContain("analisis");
  });

  it("genera el sobre completo de las 3 coberturas sin romperse", () => {
    const casos: [string, SobreCtx][] = [
      ["Particular", ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5", requiere_analisis_ecg: true }, cajaCon(1500000))],
      ["OSEP",       ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, cajaCon(500000, 2214401))],
      ["Círculo",    ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" }, cajaCon(400000, 1287040))],
    ];
    for (const [nombre, ctx] of casos) {
      const incluir = docsDelSobre(ctx);
      const L = nuevoLienzo({ orient: incluir[0].orient, fecha: "10/08/2026" });
      incluir.forEach((d, i) => {
        if (i > 0) nuevaHoja(L, d.orient ?? "p");
        d.build(L, ctx, (l) => nuevaHoja(l, d.orient ?? "p"));
      });
      cerrar(L);
      const ab = L.doc.output("arraybuffer") as ArrayBuffer;
      expect(String.fromCharCode(...new Uint8Array(ab).slice(0, 5)), nombre).toBe("%PDF-");
      // pedido + indicaciones + cronograma + instructivo + 3 recetas
      // + 2 copias de caja + trazabilidad + consentimiento (+ análisis si aplica)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((L.doc as any).getNumberOfPages(), nombre).toBeGreaterThanOrEqual(11);
      // Toda hoja lleva membrete y pie
      const t = textoDe(L);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paginas = (L.doc as any).getNumberOfPages();
      expect((t.match(/INSTITUTO DR. MERCADO/g) || []).length, nombre).toBe(paginas);
      expect((t.match(/Guardia: 260-4669362/g) || []).length, nombre).toBe(paginas);
      // El crédito de desarrollo no va en documentos que ve el paciente.
      expect(t, nombre).not.toContain("P. Famá");
      // Ningún literal cayó en UTF-16 (pasa si se cuela un carácter fuera de
      // WinAnsi, ej. el menos tipográfico U+2212: el importe sale ilegible).
      expect(t.includes(String.fromCharCode(0)), `${nombre}: texto codificado en UTF-16`).toBe(false);
    }
  });

  it("arma el sobre completo y lo nombra con el número de presupuesto", () => {
    // Se usa `armarSobreCompleto` (sin descargar): `generarSobreCompleto` es la
    // misma función + `save()`, que en test escribiría el PDF a disco.
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, cajaCon(500000, 2214401));
    const L = armarSobreCompleto(ctx);
    expect(L).not.toBeNull();
    expect(nombreArchivoSobre(ctx)).toBe("Sobre-Quirurgico-P-2026-812.pdf");
    expect(nombreArchivoDocumento("caja", ctx)).toBe("Sobre-caja-P-2026-812.pdf");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L!.doc as any).getNumberOfPages()).toBeGreaterThanOrEqual(11);
  });

  it("los builders sueltos siguen produciendo PDFs válidos", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5", requiere_analisis_ecg: true }, cajaCon(100000));
    const builders: [string, Builder][] = [
      ["pedido", docPedidoCirugia], ["indicaciones", docIndicaciones], ["cronograma", docCronograma],
      ["analisis", docAnalisisEcg], ["caja", docCaja], ["trazabilidad", docTrazabilidad],
      ["consentimiento", docConsentimiento],
    ];
    for (const [nombre, build] of builders) {
      const L = construir(build, ctx, nombre === "cronograma" ? "l" : undefined);
      const ab = L.doc.output("arraybuffer") as ArrayBuffer;
      expect(String.fromCharCode(...new Uint8Array(ab).slice(0, 5)), nombre).toBe("%PDF-");
    }
  });
});
