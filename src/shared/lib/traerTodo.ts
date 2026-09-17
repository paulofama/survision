// ============================================================
// traerTodo — pagina una consulta de Supabase hasta agotarla
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// PostgREST devuelve como máximo 1000 filas por request y NO avisa que truncó:
// la respuesta llega con `error: null` y 1000 filas, indistinguible de una
// consulta que devolvió exactamente todo lo que había.
//
// EL BUG QUE MOTIVÓ CENTRALIZARLO (27/08/2026)
// --------------------------------------------
// La Evolución Temporal traía `erogaciones_clasificacion` sin paginar y sin
// filtrar por tipo, así que pedía fijas + variables + sin clasificar: 1.172
// filas en ene-ago 2026. Se quedaba con 1.000 y perdía el resto en silencio.
// El costo fijo del mes salía menos de lo real y el resultado operativo más,
// con un desvío que además cambiaba entre cargas —según qué 1.000 filas
// devolviera el motor, porque sin ORDER BY el orden no está garantizado—.
//
// Contra el Análisis Marginal se veían $7.000 de diferencia, pero el error
// podía llegar a $2,3 M en un mes. Que se viera chico fue casualidad.
//
// CUÁNDO USARLO
// -------------
// Siempre que una consulta pueda superar las 1000 filas hoy o dentro de un
// año. Las tablas que crecen con la operación (erogaciones, movimientos,
// atenciones) califican todas. Para un maestro de 30 filas da igual, pero
// tampoco cuesta nada.
// ============================================================

/** Tamaño de página. PostgREST corta en 1000; pedimos exactamente eso. */
const PAGINA = 1000;

/**
 * Ejecuta una consulta paginada hasta traer todas las filas.
 *
 * @param construir recibe el offset y devuelve la consulta YA con `.range()`.
 *
 * @example
 * const filas = await traerTodo<Erogacion>((desde) =>
 *   supabase.from('erogaciones_clasificacion')
 *     .select('anio, mes, monto')
 *     .or(filtroMeses)
 *     .range(desde, desde + 999));
 */
export async function traerTodo<T>(
  construir: (desde: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const salida: T[] = [];
  let desde = 0;

  for (;;) {
    const { data, error } = await construir(desde);
    if (error) {
      const msg = (error as { message?: string })?.message ?? String(error);
      throw new Error(msg);
    }
    const filas = (data || []) as T[];
    salida.push(...filas);
    // Una página incompleta significa que no hay más.
    if (filas.length < PAGINA) break;
    desde += PAGINA;

    // SI EL CONSTRUCTOR SE OLVIDÓ EL `.range()`, ACÁ SE FRENA.
    // Sin `.range()`, PostgREST devuelve siempre las mismas 1.000 primeras
    // filas: la condición de corte de arriba nunca se cumple y este bucle
    // pediría la misma página para siempre, acumulando duplicados hasta colgar
    // la pestaña. Es un error de programación, no un caso de datos, así que
    // conviene que explote con un mensaje que diga qué hacer en vez de quedar
    // girando. El tope está alto a propósito: 500.000 filas es más de lo que
    // cualquier pantalla pide, y bastante más que la tabla más grande que hay.
    if (desde >= PAGINA * 500) {
      throw new Error(
        'traerTodo superó las 500.000 filas. Casi seguro que la consulta no ' +
        'aplica `.range(desde, desde + 999)` con el `desde` que recibe, así que ' +
        'devuelve siempre la misma página.',
      );
    }
  }

  return salida;
}

export default traerTodo;
