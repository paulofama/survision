// ============================================================
// Nombre corto de una prestación, para listados
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// En la Búsqueda de Presupuestos la columna de prestación corta el texto: de
// 122 prestaciones distintas, 59 tienen nombres de más de 40 caracteres. El
// resultado es que dos presupuestos del mismo paciente se ven idénticos —
// "Facoemulsificacion mas Implantes de..." las dos— y no hay forma de
// distinguirlos. Eso ya causó un enredo real (23/09/2026): se canceló el
// presupuesto equivocado de un paciente que tenía uno por cada ojo.
//
// El nombre corto NO reemplaza al completo: la celda sigue mostrando el nombre
// entero en el tooltip, y el PDF imprime siempre el largo. Esto es para poder
// leer una tabla de un vistazo.
//
// El acortado va por PATRÓN sobre el nombre, no por código, a propósito: el
// mismo código convive con varias redacciones (030502 aparece como
// "Facoemulsificación mas Implante de Lio Premium Monofocal" y como
// "Facoemulsificacion mas Implantes de Lio Monofocal"), así que mapear por
// código dejaría afuera la mitad de los registros. Si un nombre no matchea
// ningún patrón, se devuelve limpio pero completo: preferimos un nombre largo
// a uno abreviado mal.
// ============================================================

/** Minúsculas, sin acentos: para comparar sin depender de cómo se tipeó. */
const norm = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Saca el prefijo "030502 - " que algunos registros traen adelante.
 * El código se muestra en su propia columna, así que repetirlo es ruido.
 */
export const sinPrefijoCodigo = (desc: string): string =>
  String(desc || '').replace(/^\s*\d{6}\s*-\s*/, '').trim();

/**
 * Patrones, del más específico al más general. El primero que matchea gana.
 *
 * Las etiquetas salen de cómo la clínica nombra las prácticas al hablar, no de
 * una abreviatura mecánica: a la facoemulsificación le dicen "faco".
 */
const PATRONES: Array<[RegExp, string]> = [
  // Facoemulsificación + LIO. Lo que distingue un presupuesto de otro es el
  // lente, así que el lente es lo que tiene que quedar visible.
  [/faco.*lio\s+premium\s+monofocal/, 'FACO + LIO PREMIUM MONOFOCAL'],
  [/faco.*lio\s+torico\s+monofocal/, 'FACO + LIO TÓRICO MONOFOCAL'],
  [/faco.*lio\s+torico/, 'FACO + LIO TÓRICO'],
  [/faco.*lio\s+rango\s+extendido\s+vivity/, 'FACO + LIO VIVITY'],
  [/faco.*lio\s+panoptix\s+pro/, 'FACO + LIO PANOPTIX PRO'],
  [/faco.*lio\s+panoptic|faco.*lio\s+multifocal\s+panoptic/, 'FACO + LIO PANOPTIX'],
  [/faco.*lio\s+monofocal/, 'FACO + LIO MONOFOCAL'],
  [/faco.*lio\s+basico/, 'FACO + LIO BÁSICO'],
  [/faco.*lente\s+rigido/, 'FACO + LENTE RÍGIDO'],
  [/faco/, 'FACO'],

  [/inyeccion\s+intravitrea.*avastin/, 'INTRAVÍTREA (AVASTIN)'],
  [/inyeccion\s+intravitrea.*eylia/, 'INTRAVÍTREA (EYLIA)'],
  [/inyeccion\s+intravitrea/, 'INTRAVÍTREA'],

  [/pterigion.*injerto/, 'PTERIGIÓN C/INJERTO'],
  [/pterigion/, 'PTERIGIÓN'],

  [/yag\s*laser.*capsulotomia/, 'YAG LÁSER — CAPSULOTOMÍA'],
  [/yag\s*laser/, 'YAG LÁSER'],

  [/foto\s*coagulacion\s+laser\s+diodo/, 'FOTOCOAGULACIÓN LÁSER'],
  [/vitrectomia.*membrana\s+epimacular/, 'VITRECTOMÍA EPIMACULAR'],
  [/vitrectomia.*con\s+implante/, 'VITRECTOMÍA C/IMPLANTE'],
  [/vitrectomia.*sin\s+implante/, 'VITRECTOMÍA S/IMPLANTE'],
  [/vitrectomia/, 'VITRECTOMÍA'],
  [/punctum\s+plug.*bilateral/, 'PUNCTUM PLUG BILATERAL'],
  [/punctum\s+plug/, 'PUNCTUM PLUG'],
  [/implante\s+secundario/, 'IMPLANTE SECUNDARIO'],
  [/mininuc/, 'MININUC'],
  [/chalazion/, 'CHALAZIÓN'],
  [/ecografia.*bilateral/, 'ECOGRAFÍA BILATERAL'],
  [/ecografia.*unilateral/, 'ECOGRAFÍA UNILATERAL'],
];

/**
 * Nombre corto para mostrar en una tabla. Si no hay patrón que aplique,
 * devuelve la descripción sin el prefijo del código — completa, no truncada.
 */
export function nombrePrestacionCorto(descripcion: string | null | undefined): string {
  const limpio = sinPrefijoCodigo(String(descripcion || ''));
  if (!limpio) return '';
  const n = norm(limpio);
  for (const [patron, corto] of PATRONES) {
    if (patron.test(n)) return corto;
  }
  return limpio;
}

export default nombrePrestacionCorto;
