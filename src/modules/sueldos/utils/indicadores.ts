// ===========================================================================
// UTIL: indicadores - MODULO CARGA DE SUELDOS (Fase 5)
// ===========================================================================
// Sistema: SurVisión / Sistema Integral de Gestión
// Cliente: Instituto Dr. Mercado / Survisión S.A.
// Desarrollo: P. Famá
//
// Indicadores comparativos del módulo Sueldos para los reportes del Auditor.
// Funciones puras: reciben datos ya cargados (asiento + F.931 + dotación) y
// devuelven la serie de indicadores con variaciones mes vs mes anterior.
//
// Decisión (Paulo 2026-06-13): la ALÍCUOTA EFECTIVA de cargas se calcula sobre
// el BRUTO del asiento (no sobre el Rem.1, que está topeado).
//   alícuota = (contrib 351 + 352 + ART + SCVO) / bruto_total
// ===========================================================================

import type { AsientoSueldos, F931Declaracion } from '../types/sueldos';

export interface IndicadorMes {
  anio: number;
  mes: number;
  dotacion: number;          // cantidad de empleados del mes
  neto: number;              // total neto pagado
  bruto: number;             // bruto del asiento (base del costo laboral)
  aportes: number;           // retenciones del empleado (301 + 302)
  contribuciones: number;    // cargas patronales (351 + 352 + ART + SCVO)
  costo_laboral: number;     // bruto + contribuciones (costo total para la empresa)
  alicuota_cargas: number;   // contribuciones / bruto  (0..1)
  neto_promedio: number;     // neto / dotación
}

export interface IndicadorComparado extends IndicadorMes {
  /** Variación % del bruto vs mes anterior (null si no hay anterior). */
  var_bruto_pct: number | null;
  /** Variación % del costo laboral vs mes anterior. */
  var_costo_pct: number | null;
  /** Variación de la alícuota en puntos porcentuales vs mes anterior. */
  var_alicuota_pp: number | null;
  /** Variación de dotación (empleados) vs mes anterior. */
  var_dotacion: number | null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula el indicador de un mes a partir del asiento (cabecera) + el F.931 +
 * la dotación (cantidad de empleados). Si falta el asiento o el F.931, usa lo
 * que haya (los faltantes quedan en 0).
 */
export function calcularIndicadorMes(
  anio: number,
  mes: number,
  asiento: AsientoSueldos | null,
  f931: Pick<F931Declaracion, 'aporte_ss_301' | 'aporte_os_302' | 'contrib_ss_351' | 'contrib_os_352' | 'art' | 'scvo' | 'cantidad_trabajadores'> | null,
  dotacionMinuta?: number
): IndicadorMes {
  const bruto = r2(num(asiento?.bruto_total));
  const neto = r2(num(asiento?.total_neto));
  const aportes = r2(num(f931?.aporte_ss_301) + num(f931?.aporte_os_302));
  const contribuciones = r2(
    num(f931?.contrib_ss_351) + num(f931?.contrib_os_352) + num(f931?.art) + num(f931?.scvo)
  );
  const dotacion = dotacionMinuta ?? num(f931?.cantidad_trabajadores);
  const costo_laboral = r2(bruto + contribuciones);
  const alicuota_cargas = bruto > 0 ? contribuciones / bruto : 0;
  const neto_promedio = dotacion > 0 ? r2(neto / dotacion) : 0;

  return { anio, mes, dotacion, neto, bruto, aportes, contribuciones, costo_laboral, alicuota_cargas, neto_promedio };
}

/**
 * Ordena la serie por (anio, mes) y agrega las variaciones contra el mes
 * inmediatamente anterior de la serie.
 */
export function compararSerie(indicadores: IndicadorMes[]): IndicadorComparado[] {
  const orden = [...indicadores].sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));
  return orden.map((ind, i) => {
    const prev = i > 0 ? orden[i - 1] : null;
    const pct = (act: number, ant: number): number | null =>
      prev && ant !== 0 ? r2(((act - ant) / Math.abs(ant)) * 100) : null;
    return {
      ...ind,
      var_bruto_pct: prev ? pct(ind.bruto, prev.bruto) : null,
      var_costo_pct: prev ? pct(ind.costo_laboral, prev.costo_laboral) : null,
      var_alicuota_pp: prev ? r2((ind.alicuota_cargas - prev.alicuota_cargas) * 100) : null,
      var_dotacion: prev ? ind.dotacion - prev.dotacion : null,
    };
  });
}

/**
 * Devuelve el indicador comparado de un mes puntual dentro de una serie ya
 * comparada (o null si no está).
 */
export function indicadorDeMes(
  serie: IndicadorComparado[],
  anio: number,
  mes: number
): IndicadorComparado | null {
  return serie.find((s) => s.anio === anio && s.mes === mes) ?? null;
}
