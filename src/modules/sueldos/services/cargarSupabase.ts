// ============================================================
// Helpers de carga de Supabase para el cómputo de Sueldos (browser)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Replican lo que hacían los endpoints backend (routes/conciliacion.js y
// asientos.js) para armar los inputs de los motores (conciliación / asiento):
// liquidación completa con bloques+líneas, F.931 confirmado, y mapa de empleados.
// ============================================================

import { supabase } from '@shared/lib/supabase';

/** Línea por empleado de un bloque de la minuta. */
export interface LineaEmpleadoRow {
  id: string;
  bloque_id: string;
  empleado_id: string;
  /** Lo que el liquidador cargó. El bruto lo estima el generador del asiento. */
  monto_neto_cargado: number | null;
  area_snapshot?: string | null;
  cuenta_contable_snapshot?: string | null;
  bruto_estimado?: number | null;
}

/** Línea por concepto (seguridad social, sindicato). */
export interface LineaConceptoRow {
  id: string;
  bloque_id: string;
  concepto_codigo: string;
  monto: number | null;
}

/** Bloque de la minuta con sus líneas ya anidadas. */
export interface BloqueCompleto {
  id: string;
  liquidacion_id: string;
  tipo: string;
  lineas_empleado: LineaEmpleadoRow[];
  lineas_concepto: LineaConceptoRow[];
}

/**
 * La liquidación del mes con todo lo que necesitan los motores.
 *
 * Son las columnas que de verdad se leen (`estado` gobierna si se puede
 * regenerar el asiento). Antes había además un `[k: string]: any` que no usaba
 * nadie y anulaba el chequeo de tipos sobre todo el objeto.
 */
export interface LiquidacionCompleta {
  id: string;
  anio: number;
  mes: number;
  estado: string;
  bloques: BloqueCompleto[];
}

/**
 * El F.931 confirmado. Las columnas son los códigos del formulario (301, 351,
 * Rem.1, …), que varían según el período, así que se declara como mapa de
 * valores en vez de enumerarlos. Es el mismo criterio que usa el generador.
 */
export type F931Confirmado = Record<string, number | string | null | undefined> & { id?: string };

/** Lo que el asiento necesita saber de un empleado para imputar su cuenta. */
export interface EmpleadoImputacion {
  id: string;
  apellido: string | null;
  nombre: string | null;
  area: string | null;
  cuenta_contable: string | null;
}

/** Carga liquidaciones_mes + bloques + líneas (empleado y concepto) anidadas. */
export async function cargarLiquidacionCompleta(anio: number, mes: number): Promise<LiquidacionCompleta | null> {
  const { data: liqRow, error: e1 } = await supabase
    .from('liquidaciones_mes').select('*').eq('anio', anio).eq('mes', mes).maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!liqRow) return null;

  const { data: bloques, error: e2 } = await supabase
    .from('liquidacion_bloques').select('*').eq('liquidacion_id', liqRow.id);
  if (e2) throw new Error(e2.message);

  const bloqueIds = (bloques || []).map((b) => b.id);
  let lineasEmp: LineaEmpleadoRow[] = [];
  let lineasConc: LineaConceptoRow[] = [];
  if (bloqueIds.length > 0) {
    const [empRes, concRes] = await Promise.all([
      supabase.from('liquidacion_lineas_empleado').select('*').in('bloque_id', bloqueIds),
      supabase.from('liquidacion_lineas_concepto').select('*').in('bloque_id', bloqueIds),
    ]);
    if (empRes.error) throw new Error(empRes.error.message);
    if (concRes.error) throw new Error(concRes.error.message);
    lineasEmp = empRes.data || [];
    lineasConc = concRes.data || [];
  }

  const bloquesCompletos: BloqueCompleto[] = (bloques || []).map((b) => ({
    ...b,
    lineas_empleado: lineasEmp.filter((l) => l.bloque_id === b.id),
    lineas_concepto: lineasConc.filter((l) => l.bloque_id === b.id),
  }));

  return { ...liqRow, bloques: bloquesCompletos };
}

/** Carga el F.931 confirmado más reciente del período (estado REVISADO_CONFIRMADO). */
export async function cargarF931Confirmado(anio: number, mes: number): Promise<F931Confirmado | null> {
  const { data, error } = await supabase
    .from('f931_declaraciones').select('*')
    .eq('anio', anio).eq('mes', mes).eq('estado', 'REVISADO_CONFIRMADO')
    .order('confirmado_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** Mapa empleado_id -> empleado (area, cuenta_contable). */
export async function cargarEmpleadosMap(): Promise<Map<string, EmpleadoImputacion>> {
  const { data, error } = await supabase
    .from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (error) throw new Error(error.message);
  const map = new Map<string, EmpleadoImputacion>();
  for (const e of data || []) map.set(e.id, e);
  return map;
}
