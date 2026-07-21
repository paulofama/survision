// ============================================================
// Sobre Quirúrgico — orquestador (contexto + generación de PDFs)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================

import { nuevoLienzo, nuevaHoja, cerrar } from "./pdfBase";
import {
  SobreCtx,
  docPedidoCirugia, docIndicaciones, docRecetas, docAnalisisEcg, docDeposito,
} from "./documentos";
import { Aceptacion, Convenio, Lio, sbGet } from "../circuito";

export type { SobreCtx } from "./documentos";

// ── Formato / helpers ─────────────────────────────────────────────────────────

const fmtARS = (v: number): string => {
  if (isNaN(v) || v == null) v = 0;
  const [ent, dec] = v.toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

const fmtFechaISO = (d: string | null | undefined): string => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
  } catch { return ""; }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function armarContexto(args: {
  presupuesto: any;
  aceptacion: Aceptacion | null;
  convenios: Convenio[];
  lios: Lio[];
  consentimiento: { titulo: string; cuerpo: string }[];
}): SobreCtx {
  const { presupuesto: p, aceptacion: a, convenios, lios, consentimiento } = args;
  const datos = p?.datos_completos || {};
  const dp = datos.paciente || {};

  const convenio = a?.convenio_id ? convenios.find((c) => c.id === a.convenio_id) || null : null;
  const lio = a?.lio_id ? lios.find((l) => l.id === a.lio_id) || null : null;
  const ojo = (a?.ojo as SobreCtx["ojo"]) ?? null;

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
    lioNombre: lio?.nombre || "",
    requiereAnalisisEcg: !!a?.requiere_analisis_ecg,
    convenio: convenio ? { nombre: convenio.nombre, subRama: convenio.sub_rama, codigo: convenio.codigo_practica || "", config: convenio.config || {} } : null,
    total: Number(datos?.precios?.total ?? p?.total_final ?? 0),
    iva: Number(datos?.precios?.iva ?? 0),
    consentimiento,
    fmtARS,
  };
}

// ── Definición de documentos ──────────────────────────────────────────────────

export interface DocDef {
  clave: string;
  label: string;
  build: (L: ReturnType<typeof nuevoLienzo>, ctx: SobreCtx) => void;
  condicional?: boolean; // solo si requiere análisis/ECG
}

export const DOCS: DocDef[] = [
  { clave: "pedido",       label: "Pedido de cirugía",                          build: docPedidoCirugia },
  { clave: "indicaciones", label: "Indicaciones, trazabilidad y consentimiento", build: docIndicaciones },
  { clave: "recetas",      label: "Recetas de medicación",                      build: docRecetas },
  { clave: "analisis",     label: "Análisis y ECG",                             build: docAnalisisEcg, condicional: true },
  { clave: "deposito",     label: "Depósito en garantía",                       build: docDeposito },
];

// ── Generación ────────────────────────────────────────────────────────────────

const slug = (s: string) => (s || "sobre").replace(/[^A-Za-z0-9._-]/g, "_");

/** Genera y descarga UN documento del Sobre. */
export function generarDocumento(clave: string, ctx: SobreCtx): void {
  const def = DOCS.find((d) => d.clave === clave);
  if (!def) return;
  const L = nuevoLienzo();
  def.build(L, ctx);
  cerrar(L);
  L.doc.save(`Sobre-${slug(def.clave)}-${slug(ctx.numeroPresupuesto)}.pdf`);
}

/** Genera y descarga el Sobre completo (multipágina), respetando condicionales. */
export function generarSobreCompleto(ctx: SobreCtx): void {
  const incluir = DOCS.filter((d) => !d.condicional || ctx.requiereAnalisisEcg);
  const L = nuevoLienzo();
  incluir.forEach((d, i) => {
    if (i > 0) nuevaHoja(L);
    d.build(L, ctx);
  });
  cerrar(L);
  L.doc.save(`Sobre-Quirurgico-${slug(ctx.numeroPresupuesto)}.pdf`);
}
