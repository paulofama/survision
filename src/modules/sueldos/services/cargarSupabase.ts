// ============================================================
// Helpers de carga de Supabase para el cómputo de Sueldos (browser)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Replican lo que hacían los endpoints backend (routes/conciliacion.js y
// asientos.js) para armar los inputs de los motores (conciliación / asiento):
// liquidación completa con bloques+líneas, F.931 confirmado, y mapa de empleados.
// ============================================================

import { supabase } from '@shared/lib/supabase';

export interface LiquidacionCompleta {
  id: string;
  anio: number;
  mes: number;
  estado: string;
  bloques: any[];
  [k: string]: any;
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

  const bloqueIds = (bloques || []).map((b: any) => b.id);
  let lineasEmp: any[] = [];
  let lineasConc: any[] = [];
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

  const bloquesCompletos = (bloques || []).map((b: any) => ({
    ...b,
    lineas_empleado: lineasEmp.filter((l) => l.bloque_id === b.id),
    lineas_concepto: lineasConc.filter((l) => l.bloque_id === b.id),
  }));

  return { ...(liqRow as any), bloques: bloquesCompletos };
}

/** Carga el F.931 confirmado más reciente del período (estado REVISADO_CONFIRMADO). */
export async function cargarF931Confirmado(anio: number, mes: number): Promise<any | null> {
  const { data, error } = await supabase
    .from('f931_declaraciones').select('*')
    .eq('anio', anio).eq('mes', mes).eq('estado', 'REVISADO_CONFIRMADO')
    .order('confirmado_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** Mapa empleado_id -> empleado (area, cuenta_contable). */
export async function cargarEmpleadosMap(): Promise<Map<string, any>> {
  const { data, error } = await supabase
    .from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (error) throw new Error(error.message);
  const map = new Map<string, any>();
  for (const e of data || []) map.set(e.id, e);
  return map;
}
