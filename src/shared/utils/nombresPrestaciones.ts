// ============================================================
// PRESTACIONES — normalización de nombres y segmentación
// ============================================================
//
// SEGMENTACIÓN: MANDA EL CÓDIGO, NO EL NOMBRE
// -------------------------------------------
// El código de práctica de GECLISA codifica el segmento en sus dos primeros
// dígitos (regla del instituto, confirmada 2026-08-25):
//
//     01xxxx → Consultas
//     02xxxx → Estudios
//     03xxxx → Cirugías
//
// Hasta ahora el sistema adivinaba el segmento buscando palabras en el nombre.
// Esa heurística clasificaba mal 23 prácticas por $281.066.317 solo en 2026 —
// un tercio de lo facturado. El caso grande era Exoftalmología (código 010102,
// $243,5 M): el nombre no contiene ninguna palabra clave, así que caía en
// "Estudios" por descarte cuando en realidad es una CONSULTA. Como el
// porcentaje de honorarios de Consultas es 60/50 y el de Estudios 40/33, el
// error movía plata, no solo la presentación.
//
// LONGITUD DEL CÓDIGO
// -------------------
// Conviven códigos de 5 y de 6 caracteres: los de 5 son el mismo código sin el
// cero inicial (10102 = 010102). Hay que rellenar a 6 ANTES de mirar el
// prefijo, o `10102` se leería como prefijo "10" y no encontraría segmento.
//
// EL FALLBACK POR NOMBRE SIGUE HACIENDO FALTA
// -------------------------------------------
// En 2024 se usaban otros dos nomencladores (prefijos 30xxxx y 46xxxx, 12.453
// filas) que no codifican el segmento. Desde 2025 todo es 01/02/03/04, así que
// el período del Análisis Marginal se resuelve entero por código; el fallback
// cubre 2024 y cualquier código de un sistema ajeno.
//
// PREFIJO 04 — INSUMOS FACTURADOS COMO PRÁCTICA
// ---------------------------------------------
// 04xxxx son insumos que se facturan como si fueran una práctica ("Insumo
// Puntum Plug", 9 filas históricas, $2.772.774). No es un segmento clínico,
// pero el modelo solo tiene tres, así que hay que mapearlo a uno.
//
// Va a Cirugías porque es donde los pone la propia GECLISA: las 9 filas están
// en los grupos CIRUGIA / CIRUGIAS DR ROCA, siempre con un cirujano asignado
// (Mahía, Roca) y facturadas junto al acto quirúrgico. Como Cirugías y
// Estudios pagan el mismo honorario (40/33), esto NO cambia ningún importe
// respecto de lo que hacía el fallback por nombre: solo deja de contarlos
// como estudios.
//
// DOS COSAS ABIERTAS sobre estos insumos (no las resuelve este archivo):
//   1. Hoy generan honorarios, porque tienen prestador asignado. Si el
//      porcentaje no corresponde sobre un insumo de reventa, hay que
//      excluirlos en honorariosPrestador.ts, no acá.
//   2. No tienen receta ni figuran en `insumos_variables`: se computa el
//      ingreso y CERO costo, así que aparecen con margen del 100% menos
//      honorarios. Falta cargar el costo de compra del Puntum Plug.
//
// ADVERTENCIA SOBRE normalizarNombre
// ----------------------------------
// Es la clave con la que se cruzan los movimientos de GECLISA contra las
// recetas de costos. Cambiarla cambia qué prestación encuentra su receta, y por
// lo tanto el costo y el margen de todo el módulo. No es presentación.
// ============================================================

export type Segmento = 'Consultas' | 'Estudios' | 'Cirugias';

/**
 * Clave de cruce entre nombres de prestación de orígenes distintos.
 * Baja a minúsculas, saca acentos y descarta todo lo que no sea alfanumérico.
 *
 * OJO: no resuelve diferencias de separación de palabras. "EXO OFTALMOLOGÍA"
 * da "exooftalmologia" y "Exoftalmologia" da "exoftalmologia": NO coinciden.
 * Esos casos los puentea la tabla `prestaciones_nombre_mapping`.
 */
export const normalizarNombre = (s: string | null | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Segmento según los dos primeros dígitos del código de práctica. */
const SEGMENTO_POR_PREFIJO: Record<string, Segmento> = {
  '01': 'Consultas',
  '02': 'Estudios',
  '03': 'Cirugias',
  // Insumos facturados como práctica. No es un segmento clínico; va con las
  // cirugías porque ahí los agrupa GECLISA y ahí se facturan. Ver cabecera.
  '04': 'Cirugias',
};

/**
 * Prefijos que NO son un acto profesional sino un insumo que se factura como
 * si fuera una práctica. Importa porque sobre un insumo no se paga honorario
 * (definido por Paulo, 25/08/2026): ver `calcularHonorarioPrestacion`.
 */
const PREFIJOS_INSUMO = new Set(['04']);

/** ¿Este código es un insumo facturado como práctica (04xxxx)? */
export const esInsumoFacturado = (codigo: string | null | undefined): boolean => {
  const c = String(codigo ?? '').trim();
  if (!c) return false;
  return PREFIJOS_INSUMO.has(c.padStart(6, '0').slice(0, 2));
};

/**
 * Segmento a partir del código de práctica, o null si el código está vacío o
 * pertenece a un nomenclador que no codifica el segmento (30xxxx, 46xxxx).
 */
export const segmentoPorCodigo = (codigo: string | null | undefined): Segmento | null => {
  const c = String(codigo ?? '').trim();
  if (!c) return null;
  return SEGMENTO_POR_PREFIJO[c.padStart(6, '0').slice(0, 2)] ?? null;
};

/** Prácticas que se facturan como consulta o control de consultorio. */
const CLAVES_CONSULTAS = [
  'CONSULTA', 'CONTROL', 'PRIMERA VEZ', 'VISITA',
  'URGENCIA', 'GUARDIA', 'RECETA', 'VER ESTUDIO',
] as const;

/** Prácticas de quirófano y láser. */
const CLAVES_CIRUGIAS = [
  'CIRUGIA', 'QUIRURGIC', 'FACO', 'VITRECTOMIA', 'TRABECULECTOMIA',
  'IMPLANTE', 'EXTRACCION', 'TRASPLANTE', 'INYECCION', 'LASER',
  'PTERIGION', 'CHALAZION', 'NEEDLING', 'CROSS LINKING',
] as const;

/**
 * Heurística por nombre. SOLO para cuando no hay código utilizable.
 * El orden importa: primero consultas, después cirugías, y lo que no cae en
 * ninguna de las dos es un estudio.
 *
 * Saca los acentos antes de comparar. Sin eso, "YAG Láser" no encontraba la
 * clave LASER y 9 prácticas de 2024 por $9.383.586 —trabeculectomías, cirugías
 * refractivas, extracciones— quedaban como estudios.
 */
export const detectarSegmentoPorNombre = (nombre: string | null | undefined): Segmento => {
  const n = String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  if (CLAVES_CONSULTAS.some((k) => n.includes(k))) return 'Consultas';
  if (CLAVES_CIRUGIAS.some((k) => n.includes(k))) return 'Cirugias';
  return 'Estudios';
};

/**
 * Segmento de una prestación. El código manda; el nombre es el respaldo.
 *
 * El segundo parámetro es obligatorio a propósito: obliga a decidir en cada
 * punto de uso si el código está disponible. Pasar `null` es una decisión
 * explícita ("acá no lo tengo"), no un olvido.
 *
 * @param nombre  nombre de la práctica en GECLISA
 * @param codigo  `practica_codigo`; null/'' si el origen no lo trae
 */
export const detectarSegmento = (
  nombre: string | null | undefined,
  codigo: string | null | undefined,
): Segmento => segmentoPorCodigo(codigo) ?? detectarSegmentoPorNombre(nombre);
