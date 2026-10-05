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
  SobreCtx, CajaOpts, RecetaDeCostos, Consentimiento,
  docPedidoCirugia, docIndicaciones, docCronograma,
  docAnalisisEcg, docCaja, docRecetaCostos, docTrazabilidad, docConsentimiento,
  recetasDelSobre, recetasFijasDelSobre, recetasDeMedicacionAdicional,
  docRecetaFija, docRecetasAdicionales,
} from "./documentos";
import { Aceptacion, Convenio, Lio, sbGet, lioSugerido, practicaDelPresupuesto } from "../circuito";
import { cargarCostoPrestacion } from "@shared/services/costoPrestacion";
import { sinPrefijoCodigo } from '../nombrePrestacion';

export type { SobreCtx, CajaOpts, ItemAdicional, DepositoModalidad, RecetaDef, CopiaCaja, RecetaDeCostos, Consentimiento } from "./documentos";
export { LEYENDA_RESPONSABILIDAD_RECETA } from "./documentos";
export {
  calcularDeposito, baseDeposito,
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

/**
 * El ojo que trae el presupuesto, para cuando todavía no hay aceptación.
 *
 * `tratamiento.ojoTratar` es texto libre del formulario ("derecho",
 * "izquierdo", "ambos"), no el código de la aceptación. Lo tiene el 98,9 % de
 * los presupuestos; el resto imprime el renglón vacío, que es lo que hacía
 * todo el sobre antes de poder emitirse pre-aceptación.
 */
function ojoDelPresupuesto(p: { datos_completos?: { tratamiento?: { ojoTratar?: string } } } | null | undefined): SobreCtx["ojo"] {
  const o = String(p?.datos_completos?.tratamiento?.ojoTratar || "").toLowerCase();
  if (o.includes("ambos")) return "AMBOS";
  if (o.includes("izq")) return "OI";
  if (o.includes("der")) return "OD";
  return null;
}

// ── Consentimiento vigente (versionable) ──────────────────────────────────────

/**
 * Diagnóstico y solicitud de una práctica (migración 48).
 *
 * Devuelve todo vacío si la práctica no está cargada, y eso es deliberado: el
 * pedido imprime el renglón en blanco para completar a mano en vez de asumir
 * un diagnóstico. Antes se asumía "Catarata" para todas, y un pterigión salía
 * pedido como catarata.
 */
export async function cargarDiagnosticoPractica(
  codigo: string | null | undefined,
  /**
   * La opción que eligió quien aceptó, cuando la práctica se hace por varias
   * indicaciones (migración 60). Sin esto, una intravítrea sale en blanco
   * aunque las tres opciones estén cargadas — y así tiene que ser: elegir por
   * el médico es el error que este módulo vino a evitar.
   */
  opcionId?: string | null,
): Promise<{ diagnostico: string; solicitud: string; llevaLio: boolean }> {
  const vacio = { diagnostico: '', solicitud: '', llevaLio: false };
  const cod = String(codigo || '').trim();
  if (!cod) return vacio;
  try {
    // La opción elegida manda. Se busca por id Y por código: si alguien
    // cambió la práctica del presupuesto después de aceptar, la opción vieja
    // no puede imprimirse sobre la práctica nueva.
    const op = String(opcionId || '').trim();
    if (op) {
      const rows = await sbGet<{ diagnostico: string; solicitud: string; lleva_lio: boolean }>(
        `presupuestos_diagnostico_opciones?id=eq.${encodeURIComponent(op)}`
        + `&codigo_practica=eq.${encodeURIComponent(cod)}&activo=eq.true`
        + `&select=diagnostico,solicitud,lleva_lio`,
      );
      const r = rows[0];
      if (r) return { diagnostico: r.diagnostico || '', solicitud: r.solicitud || '', llevaLio: !!r.lleva_lio };
      return vacio;
    }

    const rows = await sbGet<{ diagnostico: string; solicitud: string; lleva_lio: boolean }>(
      `presupuestos_diagnosticos?codigo_practica=eq.${encodeURIComponent(cod)}&activo=eq.true&select=diagnostico,solicitud,lleva_lio`,
    );
    const r = rows[0];
    if (!r) return vacio;
    return { diagnostico: r.diagnostico || '', solicitud: r.solicitud || '', llevaLio: !!r.lleva_lio };
  } catch {
    // Si la consulta falla, el pedido sale con el renglón en blanco. Preferible
    // a caer a un diagnóstico por defecto que podría ser el equivocado.
    return vacio;
  }
}

/** Una indicación posible de una práctica que se hace por varias. */
export interface OpcionDiagnostico {
  id: string;
  diagnostico: string;
  solicitud: string;
  lleva_lio: boolean;
}

/**
 * Las indicaciones posibles de una práctica, para que quien acepta elija.
 *
 * Lista vacía = la práctica tiene una sola indicación (o ninguna cargada) y
 * el circuito sigue como siempre. Si la consulta falla también devuelve
 * vacío: no poder ofrecer las opciones no puede impedir aceptar un
 * presupuesto — el pedido saldrá con el renglón en blanco, como antes.
 */
export async function cargarOpcionesDiagnostico(
  codigo: string | null | undefined,
): Promise<OpcionDiagnostico[]> {
  const cod = String(codigo || '').trim();
  if (!cod) return [];
  try {
    return await sbGet<OpcionDiagnostico>(
      `presupuestos_diagnostico_opciones?codigo_practica=eq.${encodeURIComponent(cod)}`
      + `&activo=eq.true&order=orden.asc&select=id,diagnostico,solicitud,lleva_lio`,
    );
  } catch {
    return [];
  }
}

/**
 * Texto vigente del consentimiento informado.
 *
 * `esPlaceholder` NO es un detalle de presentación: mientras sea true el
 * documento imprime el aviso y NO el bloque de firmas, para que nadie firme un
 * texto que no rige (migración 51). Si la consulta falla también se considera
 * placeholder — ante la duda, no se firma.
 */
/**
 * Qué documentos pidió la clínica no imprimir (migración 69).
 *
 * Ante cualquier falla devuelve la lista VACÍA, o sea el sobre completo. Es el
 * lado seguro: que se imprima de más se ve y se tira; que falte el pedido de
 * cirugía el día de la operación, no.
 */
export async function cargarDocumentosDesactivados(): Promise<string[]> {
  try {
    const rows = await sbGet<{ valor: string }>(
      "presupuestos_config?clave=eq.documentos_desactivados&select=valor",
    );
    return String(rows?.[0]?.valor || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function cargarConsentimiento(): Promise<Consentimiento> {
  const respaldo: Consentimiento = {
    secciones: [{ titulo: "", cuerpo: "[Texto del consentimiento pendiente de carga — placeholder]" }],
    esPlaceholder: true,
  };
  try {
    const rows = await sbGet<{ contenido: { titulo: string; cuerpo: string }[]; es_placeholder: boolean }>(
      "presupuestos_textos_legales?clave=eq.consentimiento_catarata&vigente=eq.true&select=contenido,es_placeholder",
    );
    const fila = rows?.[0];
    const cont = fila?.contenido;
    if (Array.isArray(cont) && cont.length) {
      return { secciones: cont, esPlaceholder: !!fila?.es_placeholder };
    }
  } catch { /* usa el respaldo */ }
  return respaldo;
}

// ── Receta de costos de la práctica ───────────────────────────────────────────

/**
 * Trae la receta de costos de la práctica presupuestada, para la hoja que se
 * archiva en quirófano.
 *
 * Usa el MISMO servicio que el panel de Prestaciones Realizadas: la pantalla y
 * el papel no pueden mostrar costos distintos para la misma práctica.
 *
 * Devuelve null si la práctica no tiene receta — no es un error, y la hoja se
 * imprime igual diciéndolo.
 */
export async function cargarRecetaDeCostos(
  codigoPractica: string | null | undefined,
  nombrePractica: string | null | undefined,
): Promise<RecetaDeCostos | null> {
  try {
    const c = await cargarCostoPrestacion(codigoPractica, nombrePractica);
    if (!c) return null;
    return {
      nombreReceta: c.nombreReceta,
      codigoReceta: c.codigoReceta,
      pools: c.pools,
      insumos: c.insumos,
      costoPools: c.costoPools,
      costoInsumos: c.costoInsumos,
      costoTotal: c.costoTotal,
    };
  } catch {
    // Que no se pueda leer la receta no puede impedir emitir el sobre: la hoja
    // sale con el aviso de "sin receta cargada", que es visible y accionable.
    return null;
  }
}

// ── Armado del contexto (puro) ────────────────────────────────────────────────

export const CAJA_VACIA: CajaOpts = {
  depositoModalidad: null,
  depositoValor: null,
  entrega: null,
};

/**
 * Lee los parámetros de caja ya persistidos en la aceptación (migración 33).
 *
 * `entrega` arranca SIEMPRE en null, a propósito: cada comprobante documenta un
 * pago nuevo, así que el operador tiene que tipear cuánto se recibe ahora. Lo
 * que se conserva de la aceptación es el marco —la modalidad de la entrega en
 * Particular— no el dinero entregado.
 *
 * `caja_monto_unico` ya no se lee: el valor total sale del presupuesto en todas
 * las coberturas. La columna se conserva con lo cargado hasta el 15/09/2026,
 * que es el rastro de los comprobantes emitidos con el cálculo viejo.
 */
export function cajaDesdeAceptacion(a: Aceptacion | null): CajaOpts {
  if (!a) return { ...CAJA_VACIA };
  return {
    depositoModalidad: a.deposito_modalidad ?? null,
    depositoValor: a.deposito_valor == null ? null : num(a.deposito_valor),
    entrega: null,
  };
}

/**
 * Cobertura con la que se emite el Pedido de cirugía antes de aceptar.
 *
 * `convenioId` en null con `esObraSocial` en true es un estado válido y
 * deliberado: "es obra social, la vía todavía no está definida". El pedido
 * imprime la obra social de la ficha y deja en blanco el código, la leyenda y
 * la cuenta, que es lo que Administración completa a mano. Un blanco se nota y
 * se llena; una vía de autorización equivocada se firma.
 */
export interface CoberturaPedido {
  esObraSocial: boolean;
  convenioId: string | null;
}

/**
 * Lo único que el presupuesto guardado sabe por sí mismo sobre la cobertura.
 *
 * `precios.coberturaOS > 0` significa que se presupuestó con cobertura de obra
 * social. Verificado el 05/10/2026 contra las 21 aceptaciones vigentes: acierta
 * las 21, incluido P-2026-965, donde la ficha dice "Osep" pero el presupuesto
 * se aceptó como Particular — la cobertura acierta justo donde la ficha miente.
 *
 * QUÉ **NO** DEVUELVE, A PROPÓSITO: el convenio.
 * De los 10 casos de obra social, los 10 tienen "Osep" (o ".") en la ficha,
 * pero 7 se aceptaron por OSEP y 3 por Círculo Médico San Rafael. Deducir la
 * vía del texto de la ficha erraría 3 de cada 10, que es el bug de P-2026-813
 * otra vez. El `circuloMedico` de la ficha tampoco sirve: está en false en las
 * 21 aceptaciones, incluidas las 3 de Círculo Médico — es un flag de precio.
 */
export function coberturaSugerida(
  presupuesto: { datos_completos?: { precios?: { coberturaOS?: number | string | null } } } | null | undefined,
): CoberturaPedido {
  const cob = num(presupuesto?.datos_completos?.precios?.coberturaOS);
  return { esObraSocial: cob > 0, convenioId: null };
}

export function armarContexto(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presupuesto: any;
  aceptacion: Aceptacion | null;
  convenios: Convenio[];
  lios: Lio[];
  /**
   * Cobertura elegida al emitir el Pedido de cirugía ANTES de aceptar.
   *
   * SÓLO se mira cuando no hay aceptación. Con aceptación manda ella y esto se
   * ignora: el convenio de la aceptación es el snapshot y ningún camino de
   * impresión puede pisarlo. Ver `generarPedidoDePresupuesto`.
   */
  coberturaPedido?: CoberturaPedido | null;
  /** Documentos desactivados (ver `cargarDocumentosDesactivados`). Vacío = sobre completo. */
  documentosDesactivados?: string[];
  consentimiento: Consentimiento;
  /** Receta de costos de la práctica (ver `cargarRecetaDeCostos`). */
  receta?: RecetaDeCostos | null;
  /** Diagnóstico y solicitud de la práctica (ver `cargarDiagnosticoPractica`). */
  diag?: { diagnostico: string; solicitud: string; llevaLio: boolean } | null;
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

  /**
   * La aceptación manda siempre. Sólo cuando NO hay aceptación —el camino del
   * Pedido de cirugía previo— se usa la cobertura que eligió el operador.
   */
  const cob = a ? null : (args.coberturaPedido ?? null);
  const convenioId = a ? (a.convenio_id ?? null) : (cob?.convenioId ?? null);
  const convenio = convenioId ? convenios.find((c) => c.id === convenioId) || null : null;
  const lio = a?.lio_id ? lios.find((l) => l.id === a.lio_id) || null : null;
  /**
   * El ojo manda el de la ACEPTACIÓN, que es el que quedó congelado y el que
   * sale impreso en todo el sobre.
   *
   * Sin aceptación se cae al del presupuesto, que lo trae el 98,9 % de los
   * registros en `tratamiento.ojoTratar` como texto libre ("derecho",
   * "izquierdo", "ambos"). Eso es lo que permite emitir el Pedido de cirugía
   * ANTES de aceptar, que es el circuito que pidió la clínica.
   *
   * NO es un reemplazo del de la aceptación: verificado el 04/10/2026, las 21
   * aceptaciones vigentes coinciden con el ojo de su presupuesto — cero
   * discrepancias. Si algún día divergen, manda la aceptación.
   */
  const ojo = (a?.ojo as SobreCtx["ojo"]) ?? ojoDelPresupuesto(p);

  const esObraSocial = a ? a.rama_cobertura === "OBRA_SOCIAL" : (cob?.esObraSocial ?? false);

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
      // Domicilio del snapshot (migración 68). Los presupuestos anteriores a
      // la migración no lo traen y la hoja imprime el renglón en blanco.
      direccion: dp.direccion || "",
      localidad: dp.localidad || "",
      provincia: dp.provincia || "",
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
    // Sin aceptación la sub-rama la define el convenio elegido: de ella depende
    // el renglón "Vía de autorización" del pedido (sólo Círculo Médico).
    subRama: a ? (a.sub_rama ?? null) : (convenio?.sub_rama ?? null),
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
    // `dp.obraSocial` queda sólo como último recurso, en dos casos donde no hay
    // convenio con el cual contradecirlo: una aceptación vieja marcada como
    // obra social pero sin `convenio_id`, y el Pedido de cirugía emitido antes
    // de aceptar cuando el operador eligió "obra social, vía sin definir".
    // No es la precedencia invertida del bug: si hay convenio, gana el convenio.
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
    documentosDesactivados: args.documentosDesactivados ?? [],
    receta: args.receta ?? null,
    // El {ojo} se reemplaza acá, con el ojo de la ACEPTACIÓN, que es el que
    // manda en todo el sobre.
    diag: {
      diagnostico: String(args.diag?.diagnostico || '').replace('{ojo}', ojo ? OJO_DIAG[ojo] : '').trim(),
      solicitud: args.diag?.solicitud || '',
      llevaLio: !!args.diag?.llevaLio,
    },
    practicaCodigo: String(p?.prestacion_codigo || '').trim(),
    practicaDescripcion: sinPrefijoCodigo(String(p?.prestacion_descripcion || '')),
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
  /**
   * El documento no tiene nada que imprimir para ESTE contexto.
   *
   * No alcanza con que `build` no dibuje nada: el orquestador abre la hoja
   * ANTES de llamarlo, así que un documento vacío sale como una página en
   * blanco con membrete. Pasó al suprimir las recetas de OSEP.
   */
  omitirSi?: (ctx: SobreCtx) => boolean;
  /** Se archiva en quirófano (va al final del sobre, desprendible). */
  quirofano?: boolean;
}

/**
 * "Se omite si la clínica lo desactivó."
 *
 * Va en TODOS los documentos y no sólo en los tres que se apagaron hoy: así
 * prender o apagar cualquiera es editar una fila de `presupuestos_config`, sin
 * tocar código. Un documento que no está en la lista no se omite.
 */
const desactivado = (clave: string) => (ctx: SobreCtx): boolean =>
  ctx.documentosDesactivados.includes(clave);

export const DOCS: DocDef[] = [
  // ── Se los lleva el paciente ──
  { clave: "pedido",         label: "Pedido de cirugía",        build: docPedidoCirugia },
  { clave: "indicaciones",   label: "Indicaciones",             build: docIndicaciones,
    omitirSi: desactivado("indicaciones") },
  // El cronograma trae el instructivo de gotas en su segunda hoja: se van juntos.
  { clave: "cronograma",     label: "Cronograma de gotas",      build: docCronograma, orient: "l",
    omitirSi: desactivado("cronograma") },
  // ── Recetas: una entrada por receta ──
  // Cada una es su propio documento para que se tilde por separado. Heredan
  // gratis la casilla, el "↓ sola", el orden y el registro de lo impreso.
  // `recetasFijasDelSobre` devuelve [] cuando el convenio las suprime (OSEP),
  // así el flag sigue valiendo para las tres de una.
  { clave: "receta_a",       label: "Receta A — Gatif Forte + Natax",      build: docRecetaFija(0),
    omitirSi: (ctx) => recetasFijasDelSobre(ctx).length < 1 || ctx.documentosDesactivados.includes("receta_a") },
  { clave: "receta_b",       label: "Receta B — Aucic Plus + Dolten",      build: docRecetaFija(1),
    omitirSi: (ctx) => recetasFijasDelSobre(ctx).length < 2 || ctx.documentosDesactivados.includes("receta_b") },
  { clave: "receta_c",       label: "Receta C — Tranquinal sublingual",    build: docRecetaFija(2),
    omitirSi: (ctx) => recetasFijasDelSobre(ctx).length < 3 || ctx.documentosDesactivados.includes("receta_c") },
  { clave: "recetas_extra",  label: "Recetas de medicación adicional",     build: docRecetasAdicionales,
    omitirSi: (ctx) => recetasDelSobre(ctx).length === 0
      || recetasDeMedicacionAdicional(ctx).length === 0
      || ctx.documentosDesactivados.includes("recetas_extra") },
  { clave: "analisis",       label: "Análisis y ECG",           build: docAnalisisEcg, condicional: true,
    omitirSi: desactivado("analisis") },
  { clave: "caja",           label: "Ingreso de caja",          build: docCaja,
    omitirSi: desactivado("caja") },
  // ── Se archivan en quirófano (hoja propia, al final) ──
  { clave: "receta_costos",  label: "Receta de costos",         build: docRecetaCostos, quirofano: true,
    omitirSi: desactivado("receta_costos") },
  { clave: "trazabilidad",   label: "Trazabilidad",             build: docTrazabilidad, quirofano: true,
    omitirSi: desactivado("trazabilidad") },
  {
    clave: "consentimiento", label: "Consentimiento informado", build: docConsentimiento, quirofano: true,
    /**
     * Se omite mientras el texto vigente sea el placeholder, y vuelve SOLO
     * cuando se cargue el real (migración 69). Hasta hoy el sobre imprimía una
     * hoja con el membrete, el paciente y "ESTA HOJA NO SE FIRMA".
     *
     * La lista de desactivados sigue mandando, por si algún día hay que
     * suprimirlo incluso con texto cargado.
     */
    omitirSi: (ctx) => ctx.consentimiento.esPlaceholder || ctx.documentosDesactivados.includes("consentimiento"),
  },
];

/**
 * Documentos que PUEDEN ir en el sobre, en orden: paciente primero, quirófano
 * al final. Es la lista sobre la que el operador elige.
 *
 * Quedan afuera los condicionales que no aplican y los que no tienen nada que
 * imprimir para este contexto (`omitirSi`).
 */
export function docsDelSobre(ctx: SobreCtx): DocDef[] {
  const incluidos = DOCS.filter((d) => (!d.condicional || ctx.requiereAnalisisEcg) && !d.omitirSi?.(ctx));
  return [
    ...incluidos.filter((d) => !d.quirofano),
    ...incluidos.filter((d) => d.quirofano),
  ];
}

/**
 * Los documentos que el operador eligió imprimir, en el orden del sobre.
 *
 * `claves` acota; `undefined` significa "todo lo que corresponda" (que es lo
 * que hacía el sobre antes de que se pudiera elegir). El orden NUNCA sale de la
 * selección: lo fija `docsDelSobre`, para que el sobre se arme siempre igual
 * sin importar en qué orden se tildaron las casillas.
 */
export function docsElegidos(ctx: SobreCtx, claves?: string[]): DocDef[] {
  const todos = docsDelSobre(ctx);
  if (!claves) return todos;
  return todos.filter((d) => claves.includes(d.clave));
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

/**
 * Arma el PDF del Sobre sin descargarlo (usable para tests).
 *
 * `claves` es la selección del operador; sin ella entra todo lo que
 * corresponda. Devuelve null si no queda ningún documento.
 */
export function armarSobreCompleto(ctx: SobreCtx, claves?: string[]): Lienzo | null {
  const incluir = docsElegidos(ctx, claves);
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
  if (!def || def.omitirSi?.(ctx)) return;
  const L = nuevoLienzo({ orient: def.orient, fecha: ctx.fechaHoy });
  construir(L, def, ctx);
  cerrar(L);
  L.doc.save(nombreArchivoDocumento(def.clave, ctx));
}

/**
 * Emite el Pedido de cirugía de un presupuesto GUARDADO, sin esperar a que se
 * acepte.
 *
 * POR QUÉ EXISTE
 * --------------
 * El pedido vivía sólo dentro del Sobre Quirúrgico, o sea después de aceptar.
 * Pero el orden real de la clínica es al revés: se pide la cirugía, la obra
 * social autoriza, y recién entonces se acepta el presupuesto.
 *
 * QUÉ SALE Y QUÉ NO
 * -----------------
 * Sale todo lo que el presupuesto ya sabe: paciente, DNI, obra social de la
 * ficha, N° de afiliado, código y práctica, ojo (`tratamiento.ojoTratar`, que
 * tiene el 98,9 % de los registros), diagnóstico y solicitud por práctica
 * (migración 48) y el LIO que la prestación implica.
 *
 * LA COBERTURA LA ELIGE QUIEN EMITE
 * ----------------------------------
 * Antes este camino pasaba `aceptacion: null` y nada más, así que
 * `rama_cobertura` quedaba sin valor y el pedido imprimía "Cobertura:
 * Particular" para TODOS: a un paciente de OSEP le salía un pedido que afirmaba
 * que era particular, y sin los campos de obra social ni N° de afiliado. No era
 * un renglón que faltaba, era un renglón que mentía.
 *
 * Ahora la cobertura es un parámetro explícito (`cobertura`). No se deduce del
 * texto de la ficha —erraría la vía en 3 de cada 10, ver `coberturaSugerida`—:
 * la elige quien emite el pedido, que es la misma persona que después elige el
 * convenio al aceptar. Con la vía sin definir, el pedido sale con la obra
 * social de la ficha y el código, la leyenda y la cuenta en blanco.
 *
 * NO sale la fecha de cirugía, que nace al aceptar: el renglón combinado
 * "CUPO / FECHA PROBABLE" queda en blanco para completar a mano.
 *
 * El PDF se arma desde el SNAPSHOT guardado, nunca desde el formulario: por eso
 * el botón está deshabilitado hasta guardar. Un pedido firmado que no coincida
 * con ningún presupuesto guardado es exactamente el problema que las fases 2 y
 * 4 vinieron a cerrar.
 *
 * DEVUELVE LO QUE IMPRIMIÓ
 * -------------------------
 * `cobertura` es la etiqueta tal como salió en el papel, no la que el operador
 * eligió: son la misma cosa salvo con la vía sin definir, donde el pedido
 * imprime la obra social de la ficha. Quien registra la emisión guarda esto, y
 * así el registro y el papel no pueden divergir (migración 72).
 */
export async function generarPedidoDePresupuesto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presupuesto: any,
  lios: Lio[],
  convenios: Convenio[],
  cobertura: CoberturaPedido,
): Promise<{ cobertura: string; convenioId: string | null }> {
  const practica = practicaDelPresupuesto(presupuesto);
  const diag = await cargarDiagnosticoPractica(practica.codigo, null);
  const ctx = armarContexto({
    presupuesto,
    // Todavía no hay aceptación: ése es el punto de este camino.
    aceptacion: null,
    convenios,
    coberturaPedido: cobertura,
    lios,
    consentimiento: { secciones: [], esPlaceholder: true },
    diag,
  });
  // El LIO lo deduce la prestación (`lioSugerido`), igual que al aceptar: sin
  // aceptación no hay `lio_id`, pero el renglón "LIO indicado" del pedido sí
  // tiene que salir cuando la práctica lo lleva.
  const lioId = lioSugerido(presupuesto, lios);
  const ctxConLio: SobreCtx = {
    ...ctx,
    lioNombre: lios.find((l) => l.id === lioId)?.nombre || "",
  };
  generarDocumento("pedido", ctxConLio);
  return { cobertura: ctxConLio.coberturaLabel, convenioId: cobertura.convenioId };
}

/** Genera y descarga el Sobre con los documentos elegidos (todos si no se acota). */
export function generarSobreCompleto(ctx: SobreCtx, claves?: string[]): void {
  const L = armarSobreCompleto(ctx, claves);
  if (L) L.doc.save(nombreArchivoSobre(ctx));
}
