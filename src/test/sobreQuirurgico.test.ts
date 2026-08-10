// ============================================================
// Sobre Quirúrgico + Ingreso de caja — verificación de los 3 circuitos
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Fixtures calcados de los presupuestos reales del testeo de Administración
// (10/08/2026): P-2026-810 Particular/Vivity, P-2026-812 OSEP/Tórico monofocal
// con descuento del 10%, P-2026-813 Círculo Médico/Monofocal con Avastin.
// ============================================================

import { describe, it, expect } from "vitest";
import { nuevoLienzo, nuevaHoja, cerrar, Lienzo } from "../modules/presupuestador/utils/sobre/pdfBase";
import {
  docPedidoCirugia, docIndicaciones, docCronograma, docRecetas,
  docAnalisisEcg, docCaja, docTrazabilidad, docConsentimiento,
  calcularDeposito, totalObraSocial, SobreCtx,
} from "../modules/presupuestador/utils/sobre/documentos";
import {
  armarContexto, docsDelSobre, armarSobreCompleto,
  nombreArchivoSobre, nombreArchivoDocumento, DOCS,
  conceptoCompleto, recetasDelSobre, recetasDeMedicacionAdicional,
} from "../modules/presupuestador/utils/sobre";
import {
  lioSugerido, itemsAplicables, clavesAplicables, Lio,
} from "../modules/presupuestador/utils/circuito";

const fmtARS = (v: number) => {
  const [e, d] = (v || 0).toFixed(2).split(".");
  return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
};

// ── Catálogo de LIOs igual al de la migración 33 ──────────────────────────────
const LIOS: Lio[] = [
  { id: "l1", nombre: "Básico",                  descripcion: null, codigo_practica: "030501", activo: true, orden: 1 },
  { id: "l2", nombre: "Monofocal",               descripcion: null, codigo_practica: "030502", activo: true, orden: 2 },
  { id: "l3", nombre: "Tórico monofocal",        descripcion: null, codigo_practica: "030503", activo: true, orden: 3 },
  { id: "l4", nombre: "Multifocal Panoptic",     descripcion: null, codigo_practica: "030504", activo: true, orden: 4 },
  { id: "l5", nombre: "Rango Extendido Vivity",  descripcion: null, codigo_practica: "030505", activo: true, orden: 5 },
  { id: "l6", nombre: "Multifocal PanOptix Pro", descripcion: null, codigo_practica: "030514", activo: true, orden: 6 },
  { id: "l7", nombre: "Lente rígido",            descripcion: null, codigo_practica: "030511", activo: true, orden: 7 },
  { id: "l8", nombre: "Implante secundario",     descripcion: null, codigo_practica: "030508", activo: true, orden: 8 },
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
): SobreCtx =>
  armarContexto({
    presupuesto,
    aceptacion: aceptacionDe(aceptacionOver),
    convenios: CONVENIOS,
    lios: LIOS,
    consentimiento: CONSENTIMIENTO,
    caja,
  });

// ── Extracción de texto del PDF (jsPDF no comprime: los literales son legibles) ──

const rawPdf = (L: Lienzo): string => {
  const ab = L.doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(ab).reduce((s, b) => s + String.fromCharCode(b), "");
};

/** El PDF renderiza cada línea como `(texto) Tj`. Devuelve el texto plano. */
const textoDe = (L: Lienzo): string => {
  const raw = rawPdf(L);
  const partes = raw.match(/\(((?:\\.|[^()\\])*)\)\s*Tj/g) || [];
  return partes
    .map((p) => p.replace(/\)\s*Tj$/, "").replace(/^\(/, "").replace(/\\([()\\])/g, "$1"))
    .join("\n");
};

const construir = (build: (L: Lienzo, c: SobreCtx) => void, ctx: SobreCtx): Lienzo => {
  const L = nuevoLienzo({ fecha: "10/08/2026" });
  build(L, ctx);
  cerrar(L);
  return L;
};

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

  it("OSEP NO emite la receta de medicación (tiene sistema propio)", () => {
    const p813osep = {
      ...P813,
      datos_completos: {
        ...P813.datos_completos,
        paciente: { ...P813.datos_completos.paciente, obraSocial: "Osep" },
      },
    };
    const ctx = ctxDe(p813osep, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l2" });
    expect(ctx.recetasPorSistema).toBe(true);
    expect(recetasDeMedicacionAdicional(ctx)).toEqual([]);
    expect(recetasDelSobre(ctx)).toHaveLength(3);

    const L = nuevoLienzo(); docRecetas(L, ctx, (l) => nuevaHoja(l)); cerrar(L);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBe(3);
    expect(textoDe(L)).not.toContain("Medicación adicional");
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
// 5. Cronograma — hoja apaisada y letra grande
// ============================================================
describe("Cronograma de gotas", () => {
  it("se dibuja en A4 apaisado", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const L = nuevoLienzo({ orient: "l", fecha: "10/08/2026" });
    expect(L.pw).toBe(297);
    expect(L.ph).toBe(210);
    docCronograma(L, ctx);
    cerrar(L);
    // MediaBox apaisado (A4 = 841.89 x 595.28 pt; jsPDF escribe más decimales)
    expect(rawPdf(L)).toMatch(/MediaBox \[0 0 841\.88\d* 595\.27\d*\]/);
    const t = textoDe(L);
    expect(t).toContain("Cronograma de tratamiento quirúrgico");
    expect(t).toContain("Instructivo de colocación de gotas");
  });

  it("conserva el contenido original del cronograma (sólo cambió el tamaño)", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" });
    const L = nuevoLienzo({ orient: "l", fecha: "10/08/2026" });
    docCronograma(L, ctx);
    cerrar(L);
    const t = textoDe(L);
    // Encabezados y leyenda de referencias tal cual el formulario original
    // (autoTable puede envolver el encabezado en dos renglones).
    for (const s of ["Semana 1", "Semana 2", "Semana 3", "AL OJO: ____", "G = Gatif Forte"]) {
      expect(t, s).toContain(s);
    }
    // Las 9 franjas horarias
    for (const h of ["8:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"]) {
      expect(t, h).toContain(h);
    }
  });
});

// ============================================================
// 6. Ingreso de caja
// ============================================================
describe("Ingreso de caja — Particular", () => {
  const base = { rama_cobertura: "PARTICULAR", lio_id: "l5" };

  it("depósito por MONTO fijo", () => {
    const ctx = ctxDe(P810, base, { depositoModalidad: "MONTO", depositoValor: 1500000, montoUnico: null });
    expect(calcularDeposito(ctx)?.monto).toBe(1500000);
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("Depósito en garantía");
    expect(t).toContain("1.500.000,00");
    expect(t).toContain("Monto fijo definido en caja");
    // Saldo = total - depósito
    expect(t).toContain(fmtARS(6299260 - 1500000));
  });

  it("depósito por PORCENTAJE sobre el valor total", () => {
    const ctx = ctxDe(P810, base, { depositoModalidad: "PORCENTAJE", depositoValor: 30, montoUnico: null });
    expect(calcularDeposito(ctx)?.monto).toBeCloseTo(6299260 * 0.3, 2);
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("sobre el valor total de la cirugía");
    expect(t).toContain(fmtARS(6299260 * 0.3));
  });

  it("tampoco discrimina IVA (regla nueva: ninguna cobertura lo hace)", () => {
    const ctx = ctxDe(P810, base, { depositoModalidad: "MONTO", depositoValor: 100000, montoUnico: null });
    const t = textoDe(construir(docCaja, ctx));
    expect(t).not.toContain("IVA (incluido)");
    expect(t).not.toContain(fmtARS(1093260));   // el importe del IVA
    // El valor total sí figura (es lo único que se muestra)
    expect(t).toContain("VALOR TOTAL DE LA CIRUGÍA");
    expect(t).toContain(fmtARS(6299260));
  });

  it("detalla el ojo a operar", () => {
    const ctx = ctxDe(P810, base, { depositoModalidad: "MONTO", depositoValor: 100000, montoUnico: null });
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("Ojo a operar");
    expect(t).toContain("ojo derecho (OD)");
  });

  it("el descuento también aplica en Particular, con la aclaración Exento de IVA", () => {
    const conDescuento = {
      ...P810,
      datos_completos: {
        ...P810.datos_completos,
        precios: { ...P810.datos_completos.precios, descuento: 520600, porcentajeDescuento: 10 },
      },
    };
    const ctx = ctxDe(conDescuento, base, { depositoModalidad: "MONTO", depositoValor: 100000, montoUnico: null });
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("Descuento autorizado (10,00 %) - Exento de IVA");
    expect(t).toContain(fmtARS(520600));
  });

  it("sin monto cargado deja el campo para completar a mano", () => {
    const ctx = ctxDe(P810, base);
    expect(calcularDeposito(ctx)).toBeNull();
    expect(textoDe(construir(docCaja, ctx))).toContain("completar a mano");
  });
});

describe("Ingreso de caja — Obra social vía directa (OSEP)", () => {
  const base = { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" };

  it("monto único, SIN ninguna línea de IVA", () => {
    const ctx = ctxDe(P812, base, { depositoModalidad: null, depositoValor: null, montoUnico: 2214401 });
    const t = textoDe(construir(docCaja, ctx));
    expect(t).not.toMatch(/IVA \(incluido\)/);
    expect(t).not.toContain(fmtARS(418521.789));
  });

  it("el descuento se muestra como línea propia con Exento de IVA e impacta el total", () => {
    const ctx = ctxDe(P812, base, { depositoModalidad: null, depositoValor: null, montoUnico: 2214401 });
    expect(ctx.precios.descuento).toBe(221440.1);
    expect(totalObraSocial(ctx)).toBeCloseTo(2214401 - 221440.1, 2);
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("Descuento autorizado (10,00 %) - Exento de IVA");
    expect(t).toContain(fmtARS(221440.1));
    expect(t).toContain(fmtARS(2214401 - 221440.1));
  });

  it("detalla el ojo a operar", () => {
    const ctx = ctxDe(P812, base, { depositoModalidad: null, depositoValor: null, montoUnico: 2214401 });
    expect(textoDe(construir(docCaja, ctx))).toContain("Ojo a operar");
  });
});

describe("Ingreso de caja — Círculo Médico", () => {
  const base = { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" };

  it("sin detalle de IVA", () => {
    const ctx = ctxDe(P813, base, { depositoModalidad: null, depositoValor: null, montoUnico: 1287040 });
    const t = textoDe(construir(docCaja, ctx));
    expect(t).not.toMatch(/IVA \(incluido\)/);
    expect(t).not.toContain(fmtARS(292742.75));
  });

  it("detalla la ampolla de Avastin del presupuesto y la suma al total", () => {
    const ctx = ctxDe(P813, base, { depositoModalidad: null, depositoValor: null, montoUnico: 1287040 });
    expect(ctx.itemsAdicionales).toEqual([{ descripcion: "AVASTIN", monto: 106973.11 }]);
    expect(totalObraSocial(ctx)).toBeCloseTo(1287040 + 106973.11, 2);
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("AVASTIN");
    expect(t).toContain(fmtARS(106973.11));
    expect(t).toContain(fmtARS(1287040 + 106973.11));
  });

  it("el concepto dice qué está pagando: 'Cirugía de catarata con LIO X + AVASTIN'", () => {
    const ctx = ctxDe(P813, base, { depositoModalidad: null, depositoValor: null, montoUnico: 1287040 });
    expect(conceptoCompleto(ctx)).toBe("Cirugía de catarata con LIO Monofocal + AVASTIN");
    const t = textoDe(construir(docCaja, ctx));
    expect(t).toContain("Concepto");
    expect(t).toContain("Cirugía de catarata con LIO Monofocal + AVASTIN");
  });

  it("detalla el ojo a operar", () => {
    const ctx = ctxDe(P813, base, { depositoModalidad: null, depositoValor: null, montoUnico: 1287040 });
    expect(textoDe(construir(docCaja, ctx))).toContain("Ojo a operar");
  });

  it("los ítems adicionales también se detallan en Particular", () => {
    const ctx = ctxDe(
      { ...P813, datos_completos: { ...P813.datos_completos, paciente: { ...P813.datos_completos.paciente, obraSocial: "Particular" } } },
      { rama_cobertura: "PARTICULAR", lio_id: "l2" },
      { depositoModalidad: "MONTO", depositoValor: 500000, montoUnico: null },
    );
    expect(textoDe(construir(docCaja, ctx))).toContain("AVASTIN");
  });
});

describe("Ingreso de caja — regla transversal de IVA", () => {
  const CASOS: [string, SobreCtx, number][] = [
    ["Particular", ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, { depositoModalidad: "MONTO", depositoValor: 100000, montoUnico: null }), 1093260],
    ["OSEP", ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, { depositoModalidad: null, depositoValor: null, montoUnico: 2214401 }), 418521.789],
    ["Círculo", ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" }, { depositoModalidad: null, depositoValor: null, montoUnico: 1287040 }), 292742.75],
  ];

  it.each(CASOS)("%s: ninguna línea de IVA ni el importe del IVA", (nombre, ctx, montoIva) => {
    const t = textoDe(construir(docCaja, ctx));
    expect(t, nombre).not.toContain("IVA (incluido)");
    expect(t, nombre).not.toContain("Neto");
    expect(t, nombre).not.toContain(fmtARS(montoIva));
    // La única mención admitida de "IVA" es la aclaración del descuento.
    for (const m of t.match(/[^\n]*IVA[^\n]*/g) || []) {
      expect(m, `${nombre}: "${m}"`).toContain("Exento de IVA");
    }
  });

  it.each(CASOS)("%s: el ojo a operar figura en el comprobante", (nombre, ctx) => {
    expect(textoDe(construir(docCaja, ctx)), nombre).toContain("ojo derecho (OD)");
  });
});

// ============================================================
// 7. Estructura del sobre — trazabilidad y consentimiento desprendibles
// ============================================================
describe("Estructura del Sobre Quirúrgico", () => {
  it("trazabilidad y consentimiento van últimos y en hoja propia", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5" }, { depositoModalidad: "MONTO", depositoValor: 100000, montoUnico: null });
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
      ["Particular", ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5", requiere_analisis_ecg: true }, { depositoModalidad: "PORCENTAJE", depositoValor: 30, montoUnico: null })],
      ["OSEP",       ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, { depositoModalidad: null, depositoValor: null, montoUnico: 2214401 })],
      ["Círculo",    ctxDe(P813, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "circulo_medico", convenio_id: "c1", lio_id: "l2" }, { depositoModalidad: null, depositoValor: null, montoUnico: 1287040 })],
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
      // pedido + indicaciones + cronograma + 3 recetas + caja + trazabilidad
      // + consentimiento (+ análisis si aplica)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((L.doc as any).getNumberOfPages(), nombre).toBeGreaterThanOrEqual(8);
      // Toda hoja lleva membrete y pie
      const t = textoDe(L);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paginas = (L.doc as any).getNumberOfPages();
      expect((t.match(/INSTITUTO DR. MERCADO/g) || []).length, nombre).toBe(paginas);
      expect((t.match(/Desarrollo: P. Famá/g) || []).length, nombre).toBe(paginas);
      // Ningún literal cayó en UTF-16 (pasa si se cuela un carácter fuera de
      // WinAnsi, ej. el menos tipográfico U+2212: el importe sale ilegible).
      expect(t.includes(String.fromCharCode(0)), `${nombre}: texto codificado en UTF-16`).toBe(false);
    }
  });

  it("arma el sobre completo y lo nombra con el número de presupuesto", () => {
    // Se usa `armarSobreCompleto` (sin descargar): `generarSobreCompleto` es la
    // misma función + `save()`, que en test escribiría el PDF a disco.
    const ctx = ctxDe(P812, { rama_cobertura: "OBRA_SOCIAL", sub_rama: "directa", convenio_id: "c2", lio_id: "l3" }, { depositoModalidad: null, depositoValor: null, montoUnico: 2214401 });
    const L = armarSobreCompleto(ctx);
    expect(L).not.toBeNull();
    expect(nombreArchivoSobre(ctx)).toBe("Sobre-Quirurgico-P-2026-812.pdf");
    expect(nombreArchivoDocumento("caja", ctx)).toBe("Sobre-caja-P-2026-812.pdf");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L!.doc as any).getNumberOfPages()).toBeGreaterThanOrEqual(8);
  });

  it("los builders sueltos siguen produciendo PDFs válidos", () => {
    const ctx = ctxDe(P810, { rama_cobertura: "PARTICULAR", lio_id: "l5", requiere_analisis_ecg: true }, { depositoModalidad: "MONTO", depositoValor: 100000, montoUnico: null });
    const builders: [string, (L: Lienzo, c: SobreCtx) => void][] = [
      ["pedido", docPedidoCirugia], ["indicaciones", docIndicaciones], ["cronograma", docCronograma],
      ["analisis", docAnalisisEcg], ["caja", docCaja], ["trazabilidad", docTrazabilidad],
      ["consentimiento", docConsentimiento],
    ];
    for (const [nombre, build] of builders) {
      const L = construir(build, ctx);
      const ab = L.doc.output("arraybuffer") as ArrayBuffer;
      expect(String.fromCharCode(...new Uint8Array(ab).slice(0, 5)), nombre).toBe("%PDF-");
    }
  });
});
