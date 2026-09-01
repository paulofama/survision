// ============================================================
// Sobre Quirúrgico — orquestador (contexto + generación de PDFs)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Cada documento es un bloque independiente que arranca en HOJA PROPIA. El
// sobre completo se ensambla en un único PDF con este orden:
//   documentos del paciente  →  trazabilidad  →  consentimiento
// (los dos últimos se desprenden al imprimir y se archivan en quirófano).
// Si más adelante Administración pide PDFs separados, alcanza con llamar
// `generarDocumento` por clave: las plantillas ya son independientes.
// ============================================================

import { nuevoLienzo, nuevaHoja, cerrar, Lienzo, Orientacion } from "./pdfBase";
import {
  SobreCtx, CajaOpts,
  docPedidoCirugia, docIndicaciones, docCronograma, docRecetas,
  docAnalisisEcg, docCaja, docTrazabilidad, docConsentimiento,
} from "./documentos";
import { Aceptacion, Convenio, Lio, sbGet } from "../circuito";

export type { SobreCtx, CajaOpts, ItemAdicional, DepositoModalidad, RecetaDef, CopiaCaja } from "./documentos";
export {
  calcularDeposito, totalObraSocial, baseDeposito,
  conceptoCompleto, recetasDelSobre, recetasDeMedicacionAdicional,
  // Caja: valor total, entrega y regla de facturación (FASE 3).
  valorTotalCaja, entregaActual, restaPagar,
  requiereFactura, leyendaIva, UMBRAL_DESCUENTO_SIN_FACTURA,
  LEYENDA_A_CARGO_PACIENTE, LEYENDA_RECETA_POR_SISTEMA, DX_RECETAS,
} from "./documentos";

// ── Formato / helpers ─────────────────────────────────────────────────────────

const fmtARS = (v: number): string => {
  if (isNaN(v) || v == null) v = 0;
  const [ent, dec] = v.toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

/**
 * Formatea a dd/mm/aaaa.
 *
 * OJO: `fecha_tentativa_cirugia` es una columna `date` y llega como
 * "2026-08-11". `new Date("2026-08-11")` la interpreta como medianoche UTC, que
 * en Argentina (UTC-3) es el DÍA ANTERIOR: la fecha de cirugía salía impresa un
 * día antes en todo el sobre. Las fechas sin hora se formatean sin construir un
 * Date; el resto (timestamptz) sí se convierte a hora local, que es lo correcto.
 */
export const fmtFechaISO = (d: string | null | undefined): string => {
  if (!d) return "";
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (soloFecha) {
    const [, a, m, dd] = soloFecha;
    return `${dd}/${m}/${a}`;
  }
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
  } catch { return ""; }
};

const hoyTexto = (): string => {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
};

const calcEdad = (fnac: string | null | undefined): string => {
  if (!fnac) return "";
  const d = new Date(fnac);
  if (isNaN(d.getTime())) return "";
  const hoy = new Date();
  let e = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) e--;
  return e >= 0 && e < 130 ? String(e) : "";
};

const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const OJO_TEXTO: Record<string, string> = { OD: "ojo derecho (OD)", OI: "ojo izquierdo (OI)", AMBOS: "ambos ojos" };
const OJO_DIAG: Record<string, string> = { OD: "OD", OI: "OI", AMBOS: "AO" };

// ── Consentimiento vigente (versionable) ──────────────────────────────────────

export async function cargarConsentimiento(): Promise<{ titulo: string; cuerpo: string }[]> {
  try {
    const rows = await sbGet<{ contenido: { titulo: string; cuerpo: string }[] }>(
      "presupuestos_textos_legales?clave=eq.consentimiento_catarata&vigente=eq.true&select=contenido",
    );
    const cont = rows?.[0]?.contenido;
    if (Array.isArray(cont) && cont.length) return cont;
  } catch { /* usa fallback */ }
  return [{ titulo: "", cuerpo: "[Texto del consentimiento pendiente de carga — placeholder]" }];
}

// ── Armado del contexto (puro) ────────────────────────────────────────────────

export const CAJA_VACIA: CajaOpts = {
  depositoModalidad: null,
  depositoValor: null,
  montoUnico: null,
  entrega: null,
};

/**
 * Lee los parámetros de caja ya persistidos en la aceptación (migración 33).
 *
 * `entrega` arranca SIEMPRE en null, a propósito: cada comprobante documenta un
 * pago nuevo, así que el operador tiene que tipear cuánto se recibe ahora. Lo
 * que se conserva de la aceptación es el marco —la modalidad y, en obra social,
 * el importe a cargo del paciente— no el dinero entregado.
 */
export function cajaDesdeAceptacion(a: Aceptacion | null): CajaOpts {
  if (!a) return { ...CAJA_VACIA };
  return {
    depositoModalidad: a.deposito_modalidad ?? null,
    depositoValor: a.deposito_valor == null ? null : num(a.deposito_valor),
    montoUnico: a.caja_monto_unico == null ? null : num(a.caja_monto_unico),
    entrega: null,
  };
}

export function armarContexto(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presupuesto: any;
  aceptacion: Aceptacion | null;
  convenios: Convenio[];
  lios: Lio[];
  consentimiento: { titulo: string; cuerpo: string }[];
  /** Datos de caja del operador. Si se omite, se usan los persistidos. */
  caja?: CajaOpts;
  /**
   * Suma de las entregas YA registradas (migración 44). El comprobante que se
   * está por emitir descuenta ésas más la entrega actual, así el saldo del
   * segundo pago sale correcto.
   */
  entregasPrevias?: number;
}): SobreCtx {
  const { presupuesto: p, aceptacion: a, convenios, lios, consentimiento } = args;
  const datos = p?.datos_completos || {};
  const dp = datos.paciente || {};
  const prec = datos.precios || {};

  const convenio = a?.convenio_id ? convenios.find((c) => c.id === a.convenio_id) || null : null;
  const lio = a?.lio_id ? lios.find((l) => l.id === a.lio_id) || null : null;
  const ojo = (a?.ojo as SobreCtx["ojo"]) ?? null;

  const esObraSocial = a?.rama_cobertura === "OBRA_SOCIAL";

  // OSEP carga las recetas por su propio sistema (electrónicas). Se resuelve
  // por config del convenio (`recetas_por_sistema`, migración 34) para que sea
  // configurable sin tocar código; el match por nombre queda de respaldo.
  //
  // Se mira SÓLO el convenio, nunca `dp.obraSocial`: ese campo es texto libre
  // copiado de la ficha del paciente y puede decir cualquier cosa (ver el
  // bloque de `coberturaLabel`).
  const recetasPorSistema = esObraSocial && (
    convenio?.config?.recetas_por_sistema === true ||
    /osep/i.test(convenio?.nombre || "")
  );

  // Importes. `subtotalDespuesCobertura` es la base ANTES del descuento; el
  // descuento se aplica sólo sobre ella y los insumos se suman después.
  const descuento = num(prec.descuento);
  const neto = num(prec.neto ?? prec.subtotalConGastos);
  const totalInsumos = num(prec.totalInsumos);
  const baseAntesDescuento = prec.subtotalDespuesCobertura != null
    ? num(prec.subtotalDespuesCobertura)
    : Math.max(0, neto - totalInsumos + descuento);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsAdicionales = (Array.isArray(datos.insumos) ? datos.insumos : []).map((i: any) => ({
    descripcion: String(i?.descripcion || "Ítem adicional"),
    monto: num(i?.monto),
  }));

  return {
    numeroPresupuesto: p?.numero_presupuesto || "",
    paciente: {
      apellidoNombre: `${p?.paciente_apellido || ""}, ${p?.paciente_nombre || ""}`.replace(/^, |, $/g, ""),
      documento: p?.paciente_documento || dp.documento || "",
      edad: calcEdad(dp.fechaNacimiento),
      telefono: dp.telefono || "",
      obraSocial: dp.obraSocial || "",
      numeroAfiliado: dp.numeroAfiliado || "",
    },
    ojo,
    ojoDiag: ojo ? OJO_DIAG[ojo] : "",
    ojoTexto: ojo ? OJO_TEXTO[ojo] : "",
    fechaCirugia: fmtFechaISO(a?.fecha_tentativa_cirugia),
    fechaHoy: hoyTexto(),
    lioNombre: lio?.nombre || "",
    // Sale del catálogo (migración 44), no de una constante: hoy sólo el LIO
    // Básico tiene frase. Ver el comentario de `Lio.leyenda_resultado`.
    lioLeyenda: lio?.leyenda_resultado || "",
    requiereAnalisisEcg: !!a?.requiere_analisis_ecg,
    esObraSocial,
    subRama: a?.sub_rama ?? null,
    // ── FUENTE ÚNICA DE VERDAD DE LA COBERTURA ──────────────────────────────
    // Manda el CONVENIO DE LA ACEPTACIÓN, no la obra social de la ficha.
    //
    // Bug relevado por Administración (31/08/2026, P-2026-813): "cargué OSEP y
    // todo lo extiende por Ospelsym". La precedencia estaba invertida y ganaba
    // `dp.obraSocial`, que es `datos_completos.paciente.obraSocial` — texto
    // libre copiado de la ficha al crear el presupuesto, sin relación con el
    // catálogo de convenios ("Ospelsym" no existe como convenio).
    //
    // El convenio es el que define aranceles, autorización y liquidación, y es
    // además el snapshot que pide la regla: se fija en `convenio_id` al aceptar
    // el presupuesto, así que editar después la ficha del paciente no altera
    // ningún documento ya emitido.
    //
    // `dp.obraSocial` queda sólo como último recurso, para el caso de una
    // aceptación vieja marcada como obra social pero sin `convenio_id`.
    coberturaLabel: esObraSocial
      ? (convenio?.nombre || dp.obraSocial || "Obra social")
      : "Particular",
    convenio: convenio
      ? { nombre: convenio.nombre, subRama: convenio.sub_rama, codigo: convenio.codigo_practica || "", config: convenio.config || {} }
      : null,
    precios: {
      baseAntesDescuento,
      descuento,
      porcentajeDescuento: num(prec.porcentajeDescuento),
      neto,
      iva: num(prec.iva),
      total: num(prec.total ?? p?.total_final),
    },
    itemsAdicionales,
    recetasPorSistema,
    caja: args.caja ?? cajaDesdeAceptacion(a),
    entregasPrevias: num(args.entregasPrevias),
    consentimiento,
    fmtARS,
  };
}

// ── Definición de documentos ──────────────────────────────────────────────────

export interface DocDef {
  clave: string;
  label: string;
  /** `abrirHoja` abre una hoja nueva del mismo documento (recetas: una por hoja). */
  build: (L: Lienzo, ctx: SobreCtx, abrirHoja: (l: Lienzo) => void) => void;
  /** Orientación de la hoja del documento. Default vertical. */
  orient?: Orientacion;
  /** Sólo si el circuito requiere análisis/ECG. */
  condicional?: boolean;
  /** Se archiva en quirófano (va al final del sobre, desprendible). */
  quirofano?: boolean;
}

export const DOCS: DocDef[] = [
  // ── Se los lleva el paciente ──
  { clave: "pedido",         label: "Pedido de cirugía",        build: docPedidoCirugia },
  { clave: "indicaciones",   label: "Indicaciones",             build: docIndicaciones },
  { clave: "cronograma",     label: "Cronograma de gotas",      build: docCronograma, orient: "l" },
  { clave: "recetas",        label: "Recetas (una por hoja)",   build: docRecetas },
  { clave: "analisis",       label: "Análisis y ECG",           build: docAnalisisEcg, condicional: true },
  { clave: "caja",           label: "Ingreso de caja",          build: docCaja },
  // ── Se archivan en quirófano (hoja propia, al final) ──
  { clave: "trazabilidad",   label: "Trazabilidad",             build: docTrazabilidad, quirofano: true },
  { clave: "consentimiento", label: "Consentimiento informado", build: docConsentimiento, quirofano: true },
];

/** Documentos que van en el sobre, en orden: paciente primero, quirófano al final. */
export function docsDelSobre(ctx: SobreCtx): DocDef[] {
  const incluidos = DOCS.filter((d) => !d.condicional || ctx.requiereAnalisisEcg);
  return [
    ...incluidos.filter((d) => !d.quirofano),
    ...incluidos.filter((d) => d.quirofano),
  ];
}

// ── Generación ────────────────────────────────────────────────────────────────

const slug = (s: string) => (s || "sobre").replace(/[^A-Za-z0-9._-]/g, "_");

export const nombreArchivoDocumento = (clave: string, ctx: SobreCtx): string =>
  `Sobre-${slug(clave)}-${slug(ctx.numeroPresupuesto)}.pdf`;

export const nombreArchivoSobre = (ctx: SobreCtx): string =>
  `Sobre-Quirurgico-${slug(ctx.numeroPresupuesto)}.pdf`;

function construir(L: Lienzo, def: DocDef, ctx: SobreCtx) {
  def.build(L, ctx, (l) => nuevaHoja(l, def.orient ?? "p"));
}

/** Arma el PDF del Sobre completo sin descargarlo (usable para tests). */
export function armarSobreCompleto(ctx: SobreCtx): Lienzo | null {
  const incluir = docsDelSobre(ctx);
  if (!incluir.length) return null;
  const L = nuevoLienzo({ orient: incluir[0].orient, fecha: ctx.fechaHoy });
  incluir.forEach((d, i) => {
    if (i > 0) nuevaHoja(L, d.orient ?? "p");
    construir(L, d, ctx);
  });
  cerrar(L);
  return L;
}

/** Genera y descarga UN documento del Sobre. */
export function generarDocumento(clave: string, ctx: SobreCtx): void {
  const def = DOCS.find((d) => d.clave === clave);
  if (!def) return;
  const L = nuevoLienzo({ orient: def.orient, fecha: ctx.fechaHoy });
  construir(L, def, ctx);
  cerrar(L);
  L.doc.save(nombreArchivoDocumento(def.clave, ctx));
}

/** Genera y descarga el Sobre completo (multipágina), respetando condicionales. */
export function generarSobreCompleto(ctx: SobreCtx): void {
  const L = armarSobreCompleto(ctx);
  if (L) L.doc.save(nombreArchivoSobre(ctx));
}
