// ============================================================
// CUIL — validación y formato (algoritmo oficial AFIP)
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Estaba dentro de `EmpleadoFormPage.tsx`. Se movió acá por dos razones:
//
//   · un .tsx que exporta un componente Y una función suelta rompe el Fast
//     Refresh de Vite, y
//   · es una función pura con un algoritmo publicado, así que merece tests
//     propios en vez de vivir escondida en una pantalla.
// ============================================================

/** Los únicos prefijos que emite AFIP. */
const PREFIJOS_VALIDOS = ['20', '23', '24', '27', '30', '33', '34'];

/** Los pesos del dígito verificador, en orden. */
const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Acepta XX-XXXXXXXX-X o 11 dígitos pegados. Retorna true si el verificador
 * cuadra.
 */
export function cuilValido(raw: string): boolean {
  if (!raw) return false;
  const d = raw.replace(/\D+/g, '');
  if (d.length !== 11) return false;

  if (!PREFIJOS_VALIDOS.includes(d.substring(0, 2))) return false;

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(d[i]!, 10) * MULTIPLICADORES[i]!;
  }
  const mod = suma % 11;
  let verificador: number;
  if (mod === 0) verificador = 0;
  else if (mod === 1) verificador = 9; // convención AFIP para el caso borde
  else verificador = 11 - mod;

  return verificador === parseInt(d[10]!, 10);
}

/**
 * Formatea 11 dígitos a XX-XXXXXXXX-X. Si la entrada no tiene 11 dígitos, la
 * devuelve sin cambios: así el campo no pelea con el usuario mientras escribe.
 */
export function formatearCuil(raw: string): string {
  const d = raw.replace(/\D+/g, '');
  if (d.length !== 11) return raw;
  return `${d.substring(0, 2)}-${d.substring(2, 10)}-${d.substring(10)}`;
}
