// ============================================================
// Circuito de aceptación del presupuesto — tipos, catálogos, checklist, REST
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Rama que se define al ACEPTAR un presupuesto (cobertura/convenio/fecha/ojo/LIO)
// y checklist de trámites hasta "LISTO PARA CIRUGÍA". Persistencia en las tablas
// presupuestos_aceptacion (1:1) y presupuestos_checklist (migración 25).
// ============================================================

import supabase, { ENV_CONFIG } from "@shared/lib/supabase";

const SUPABASE_URL = ENV_CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV_CONFIG.SUPABASE_ANON_KEY;

// ------------------------------------------------------------
// REST helpers (cliente autenticado; RLS aplica)
// ------------------------------------------------------------

export async function authHeaders(prefer?: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: prefer ?? "return=representation",
  };
}

export async function sbGet<T = any>(pathAndQuery: string): Promise<T[]> {
  const headers = await authHeaders();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export async function sbPatch(pathWithFilter: string, body: Record<string, unknown>): Promise<void> {
  const headers = await authHeaders("return=minimal");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithFilter}`, {
    method: "PATCH", headers, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
}

export async function sbInsert(table: string, body: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
  const headers = await authHeaders("return=minimal");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
}

/** Upsert por on_conflict. resolution 'merge' (pisa) o 'ignore' (preserva existente). */
export async function sbUpsert(
  table: string,
  body: Record<string, unknown> | Record<string, unknown>[],
  onConflict: string,
  resolution: "merge" | "ignore" = "merge",
): Promise<void> {
  const headers = await authHeaders(
    `return=minimal,resolution=${resolution}-duplicates`,
  );
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.statusText);
}

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export type RamaCobertura = "PARTICULAR" | "OBRA_SOCIAL";
export type SubRama = "circulo_medico" | "directa";
export type Ojo = "OD" | "OI" | "AMBOS";

export interface Convenio {
  id: string;
  nombre: string;
  sub_rama: "circulo_medico" | "directa" | "particular";
  codigo_practica: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  activo: boolean;
  orden: number;
}

export interface Lio {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  orden: number;
}

export interface Aceptacion {
  presupuesto_id: string;
  rama_cobertura: RamaCobertura;
  sub_rama: SubRama | null;
  convenio_id: string | null;
  fecha_tentativa_cirugia: string | null;
  ojo: Ojo | null;
  lio_id: string | null;
  requiere_analisis_ecg: boolean;
  created_by: string | null;
}

export interface ChecklistRow {
  id: string;
  presupuesto_id: string;
  item_clave: string;
  completado: boolean;
  no_aplica: boolean;
  fecha_completado: string | null;
  completado_por: string | null;
}

// ------------------------------------------------------------
// Opciones de UI
// ------------------------------------------------------------

export const OJOS: { value: Ojo; label: string }[] = [
  { value: "OD", label: "Ojo derecho (OD)" },
  { value: "OI", label: "Ojo izquierdo (OI)" },
  { value: "AMBOS", label: "Ambos ojos" },
];

export const SUB_RAMAS: { value: SubRama; label: string }[] = [
  { value: "circulo_medico", label: "Vía Círculo Médico (el paciente autoriza presencial)" },
  { value: "directa", label: "Vía directa (autorización por sistemas: OSEP, OSDE, etc.)" },
];

// ------------------------------------------------------------
// Checklist de seguimiento (definición fija; estado persistido en DB)
// ------------------------------------------------------------

export interface ChecklistDef {
  clave: string;
  label: string;
  /** Si devuelve true, el ítem no aplica para esa aceptación (se pre-marca no_aplica). */
  noAplica?: (a: Pick<Aceptacion, "rama_cobertura" | "requiere_analisis_ecg">) => boolean;
}

export const CHECKLIST_ITEMS: ChecklistDef[] = [
  { clave: "autorizacion_os",         label: "Autorización de OS gestionada",              noAplica: (a) => a.rama_cobertura === "PARTICULAR" },
  { clave: "orden_autorizada",        label: "Orden autorizada / pedido de cirugía recibido" },
  { clave: "consentimiento_firmado",  label: "Consentimiento firmado entregado" },
  { clave: "analisis_ecg",            label: "Análisis y ECG presentados",                 noAplica: (a) => !a.requiere_analisis_ecg },
  { clave: "deposito_garantia",       label: "Depósito en garantía realizado" },
  { clave: "lio_definido",            label: "LIO definido" },
  { clave: "fecha_cirugia_confirmada",label: "Fecha de cirugía confirmada" },
];

/** LISTO PARA CIRUGÍA = todos los ítems aplicables (no_aplica=false) completados. */
export function listoParaCirugia(rows: ChecklistRow[]): boolean {
  const aplican = rows.filter((r) => !r.no_aplica);
  return aplican.length > 0 && aplican.every((r) => r.completado);
}

/** Progreso: {hechos, total} sobre los ítems aplicables. */
export function progresoChecklist(rows: ChecklistRow[]): { hechos: number; total: number } {
  const aplican = rows.filter((r) => !r.no_aplica);
  return { hechos: aplican.filter((r) => r.completado).length, total: aplican.length };
}
