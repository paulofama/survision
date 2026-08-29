// ============================================================
// HONORARIOS POR PRESTADOR — quién genera honorario y cuánto
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// La fórmula del honorario (porcentaje del facturado según segmento y si el
// prestador es socio) estaba copiada en OCHO lugares: el informe de gestión, el
// dashboard marginal, las cinco pantallas de análisis y el hook de evolución
// temporal. Cualquier corrección había que hacerla ocho veces, y una sola que
// se olvidara dejaba dos pantallas mostrando números distintos para el mismo
// período.
//
// EL DEFECTO QUE MOTIVÓ CENTRALIZARLO (medido el 2026-08-20)
// ----------------------------------------------------------
// La tabla `prestadores` contiene, además de los médicos, entradas que NO son
// profesionales: la propia institución (cargada en dos grafías, "SURVISION" y
// "SurVision") y marcadores operativos. Como el cálculo se aplicaba a todo lo
// que tuviera prestador, el modelo computaba honorarios sobre la facturación
// institucional:
//
//   SURVISION    $315.145.572 facturados  ->  $103.998.039 de honorario
//   SurVision     $12.423.656             ->    $4.997.405
//                                             ─────────────
//                                             $108.995.444
//
// Ese costo no existe: la clínica no se paga honorarios a sí misma. Inflaba el
// costo variable y hundía el margen de contribución de todo lo facturado bajo
// ese nombre.
//
// QUÉ NO RESUELVE
// ---------------
// Contra los médicos reales el modelo queda MUY corto: se pagaron $341,5 M
// contra $204,9 M calculados en ene-ago 2026 (Mercado cobró el 136% de lo que
// facturó). Eso depende de definiciones que no son técnicas — si los pagos
// incluyen retiros de socio, si hay prestaciones facturadas bajo la institución
// que corresponden a un médico, y si los porcentajes de `honorarios_config`
// siguen vigentes. Está pendiente de definición y NO se toca acá.
// ============================================================

import { esInsumoFacturado } from './nombresPrestaciones';

/**
 * Entradas de `prestadores` que no son profesionales y por lo tanto no generan
 * honorario. Se compara normalizado (sin acentos, sin espacios, minúsculas),
 * así que "SURVISION" y "SurVision" caen en la misma clave.
 *
 * Para agregar o quitar una entrada, hacerlo acá: es el único lugar que decide
 * quién factura sin generar honorario.
 */
const PRESTADORES_SIN_HONORARIO = new Set([
  'survision',   // la institución: facturación propia, no hay a quién pagarle
  'sd',          // "S/D" — prestador no informado
  'sinprestador',
]);

/** Normaliza un nombre de prestador para comparar sin depender de la grafía. */
export const clavePrestador = (nombre: string | null | undefined): string =>
  String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/**
 * ¿Este prestador genera honorario médico?
 * False para la institución y los marcadores operativos.
 */
export const generaHonorario = (nombre: string | null | undefined): boolean => {
  const k = clavePrestador(nombre);
  if (!k) return false;
  return !PRESTADORES_SIN_HONORARIO.has(k);
};

export interface ConfigSegmentoHonorario {
  porcentaje_socio: number;
  porcentaje_no_socio: number;
}

/**
 * Honorario de una prestación. Devuelve 0 cuando:
 *   - el prestador no genera honorario (la institución, marcadores operativos),
 *   - la práctica es un INSUMO facturado como práctica (código 04xxxx), o
 *   - no hay configuración para el segmento.
 *
 * Lo de los insumos lo definió Paulo el 25/08/2026: sobre un insumo de reventa
 * no se paga honorario. Antes se pagaba, porque esas filas traen un cirujano
 * asignado y el cálculo se aplicaba a todo lo que tuviera prestador.
 *
 * El parámetro `codigo` es obligatorio a propósito: obliga a decidir en cada
 * punto de uso si el código está disponible. Pasar `null` es una decisión
 * explícita ("acá no lo tengo"), no un olvido.
 *
 * @param facturado importe facturado de la prestación
 * @param nombrePrestador tal como viene de GECLISA
 * @param esSocio flag de la ficha del prestador
 * @param config configuración del segmento que corresponde a la prestación
 * @param codigo `practica_codigo`; null/'' si el origen no lo trae
 */
export const calcularHonorarioPrestacion = (
  facturado: number,
  nombrePrestador: string | null | undefined,
  esSocio: boolean,
  config: ConfigSegmentoHonorario | null | undefined,
  codigo: string | null | undefined,
): number => {
  if (!config) return 0;
  if (esInsumoFacturado(codigo)) return 0;
  if (!generaHonorario(nombrePrestador)) return 0;
  const pct = esSocio ? config.porcentaje_socio : config.porcentaje_no_socio;
  return (Number(facturado) || 0) * ((Number(pct) || 0) / 100);
};
