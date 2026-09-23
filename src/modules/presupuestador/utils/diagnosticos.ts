// ============================================================
// Diagnósticos del pedido de cirugía — catálogo por práctica
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
//
// Alimenta `presupuestos_diagnosticos` (migraciones 48/49/50), que es de donde
// el pedido de cirugía saca el diagnóstico, qué se solicita y si la práctica
// lleva lente intraocular.
//
// POR QUÉ ESTO EXISTE: el pedido imprimía un texto fijo de facoemulsificación y
// el diagnóstico del convenio, que en los tres dice "Catarata". Un pterigión se
// pedía como catarata, y ya había salido uno así (P-2026-733).
//
// REGLA QUE NO SE NEGOCIA: una práctica SIN diagnóstico cargado imprime el
// renglón EN BLANCO con un aviso, para completarlo a mano. Eso no es una deuda
// que haya que saldar cargando cualquier cosa — un blanco se nota y se llena;
// un diagnóstico equivocado se firma y se presenta a la obra social.
// ============================================================

import supabase from '@shared/lib/supabase';
import { traerTodo } from '@shared/lib/traerTodo';
import { sinPrefijoCodigo } from './nombrePrestacion';

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export interface Diagnostico {
  codigo_practica: string;
  diagnostico: string;
  solicitud: string;
  lleva_lio: boolean;
  activo: boolean;
}

/** Una práctica del catálogo con su diagnóstico (si lo tiene) y su volumen. */
export interface PracticaConDx {
  codigo: string;
  nombre: string;
  /** null = imprime el renglón en blanco. */
  dx: Diagnostico | null;
  /** Presupuestos emitidos con esta práctica. */
  presupuestos: number;
  /** De esos, los que llegaron a aceptarse: son los que imprimen un pedido. */
  aceptados: number;
}

export type Ojo = 'OD' | 'OI' | 'AMBOS';

/** Cómo se escribe cada ojo en el diagnóstico. Igual que en `sobre/index.ts`. */
export const OJO_DIAG: Record<Ojo, string> = { OD: 'OD', OI: 'OI', AMBOS: 'AO' };

/** El marcador que se reemplaza por el ojo de la aceptación al imprimir. */
export const MARCADOR_OJO = '{ojo}';

// ------------------------------------------------------------
// Lógica pura
// ------------------------------------------------------------

/** Las prácticas quirúrgicas del catálogo son las `03xxxx`. */
export const esQuirurgica = (codigo: string | null | undefined): boolean =>
  /^03\d{4}$/.test(String(codigo || '').trim());

/**
 * El diagnóstico como va a salir impreso, con el ojo puesto.
 * Es exactamente lo que hace `armarContexto`, para que la vista previa de la
 * pantalla no pueda discrepar del papel.
 */
export const conOjo = (diagnostico: string, ojo: Ojo | null): string =>
  String(diagnostico || '').replace(MARCADOR_OJO, ojo ? OJO_DIAG[ojo] : '').trim();

/**
 * Valida lo que la base va a exigir igual (CHECK de la migración 48), pero acá
 * el operador lo ve antes de perder lo que escribió.
 */
export function validarDiagnostico(d: { diagnostico: string; solicitud: string }): string | null {
  if (!String(d.diagnostico || '').trim()) return 'Escribí el diagnóstico.';
  if (!String(d.solicitud || '').trim()) return 'Escribí qué se solicita.';
  return null;
}

/**
 * Aviso, no error: la mayoría de los diagnósticos llevan el ojo, pero hay
 * prácticas bilaterales por definición donde ponerlo sobraría. Lo decide quien
 * carga; la pantalla sólo se asegura de que no sea un olvido.
 */
export const faltaElOjo = (diagnostico: string): boolean =>
  !String(diagnostico || '').includes(MARCADOR_OJO);

/**
 * Orden de la lista: **primero lo que falta, y dentro de eso lo que más se
 * presupuesta**, que es donde conviene empezar. Después lo ya cargado.
 */
export function ordenarPorPrioridad(filas: PracticaConDx[]): PracticaConDx[] {
  return [...filas].sort((a, b) => {
    const faltaA = a.dx ? 1 : 0;
    const faltaB = b.dx ? 1 : 0;
    if (faltaA !== faltaB) return faltaA - faltaB;
    if (b.aceptados !== a.aceptados) return b.aceptados - a.aceptados;
    if (b.presupuestos !== a.presupuestos) return b.presupuestos - a.presupuestos;
    return a.codigo.localeCompare(b.codigo);
  });
}

export type FiltroCarga = 'todas' | 'sin' | 'con';

/** Filtro de la pantalla: texto libre sobre código y nombre + estado de carga. */
export function filtrar(filas: PracticaConDx[], texto: string, carga: FiltroCarga): PracticaConDx[] {
  const q = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return filas.filter((f) => {
    if (carga === 'sin' && f.dx) return false;
    if (carga === 'con' && !f.dx) return false;
    if (!q) return true;
    const heno = (f.codigo + ' ' + f.nombre + ' ' + (f.dx?.diagnostico || ''))
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return heno.includes(q);
  });
}

/**
 * Cruza el catálogo de prácticas con los diagnósticos cargados y el volumen.
 * Separado de la carga para poder probarlo sin base.
 */
export function cruzar(
  practicas: { codigo: string; practica: string }[],
  diagnosticos: Diagnostico[],
  presupuestosPorCodigo: Map<string, number>,
  aceptadosPorCodigo: Map<string, number>,
): PracticaConDx[] {
  const porCodigo = new Map(diagnosticos.map((d) => [String(d.codigo_practica).trim(), d]));
  return practicas
    .filter((p) => esQuirurgica(p.codigo))
    .map((p) => {
      const cod = String(p.codigo).trim();
      return {
        codigo: cod,
        nombre: sinPrefijoCodigo(p.practica),
        dx: porCodigo.get(cod) ?? null,
        presupuestos: presupuestosPorCodigo.get(cod) ?? 0,
        aceptados: aceptadosPorCodigo.get(cod) ?? 0,
      };
    });
}

// ------------------------------------------------------------
// Carga
// ------------------------------------------------------------

export interface PanelDiagnosticos {
  filas: PracticaConDx[];
  /** Prácticas quirúrgicas del catálogo. */
  total: number;
  /** De esas, cuántas tienen diagnóstico cargado y activo. */
  cargadas: number;
  /** Presupuestos que hoy imprimirían el renglón en blanco. */
  presupuestosSinDx: number;
}

export async function cargarPanelDiagnosticos(): Promise<PanelDiagnosticos> {
  // `traerTodo` pagina: `presupuestos` pasa las 1.000 filas y PostgREST corta
  // sin avisar, así que un conteo sin paginar saldría corto y creíble.
  const [practicas, diagnosticos, presupuestos, aceptaciones] = await Promise.all([
    traerTodo<{ codigo: string; practica: string }>((desde) =>
      supabase.from('prestaciones').select('codigo,practica').range(desde, desde + 999)),
    traerTodo<Diagnostico>((desde) =>
      supabase.from('presupuestos_diagnosticos')
        .select('codigo_practica,diagnostico,solicitud,lleva_lio,activo')
        .range(desde, desde + 999)),
    traerTodo<{ id: string; prestacion_codigo: string | null }>((desde) =>
      supabase.from('presupuestos').select('id,prestacion_codigo').range(desde, desde + 999)),
    traerTodo<{ presupuesto_id: string }>((desde) =>
      supabase.from('presupuestos_aceptacion').select('presupuesto_id').range(desde, desde + 999)),
  ]);

  const aceptados = new Set(aceptaciones.map((a) => a.presupuesto_id));
  const porCodigo = new Map<string, number>();
  const aceptPorCodigo = new Map<string, number>();
  for (const p of presupuestos) {
    const cod = String(p.prestacion_codigo || '').trim();
    if (!cod) continue;
    porCodigo.set(cod, (porCodigo.get(cod) ?? 0) + 1);
    if (aceptados.has(p.id)) aceptPorCodigo.set(cod, (aceptPorCodigo.get(cod) ?? 0) + 1);
  }

  const filas = ordenarPorPrioridad(cruzar(practicas, diagnosticos, porCodigo, aceptPorCodigo));
  const cargadas = filas.filter((f) => f.dx && f.dx.activo).length;
  const presupuestosSinDx = filas
    .filter((f) => !f.dx || !f.dx.activo)
    .reduce((s, f) => s + f.presupuestos, 0);

  return { filas, total: filas.length, cargadas, presupuestosSinDx };
}

// ------------------------------------------------------------
// Escritura (requiere `presupuestador:config`, migración 50)
// ------------------------------------------------------------

export async function guardarDiagnostico(d: Diagnostico): Promise<void> {
  const error = validarDiagnostico(d);
  if (error) throw new Error(error);
  // Upsert por la PK: la pantalla no distingue alta de edición, y la práctica
  // es una sola.
  const { error: e } = await supabase
    .from('presupuestos_diagnosticos')
    .upsert(
      {
        codigo_practica: String(d.codigo_practica).trim(),
        diagnostico: String(d.diagnostico).trim(),
        solicitud: String(d.solicitud).trim(),
        lleva_lio: !!d.lleva_lio,
        activo: !!d.activo,
      },
      { onConflict: 'codigo_practica' },
    );
  if (e) throw new Error(e.message);
}
