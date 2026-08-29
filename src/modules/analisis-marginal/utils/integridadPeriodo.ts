// ============================================================
// VALIDACIÓN DE INTEGRIDAD DEL PERÍODO (Análisis Marginal)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
//
// Por qué existe: el informe de gestión se arma con tres fuentes que avanzan a
// distinto ritmo — facturación (espejo de GECLISA, al día), costo laboral
// (módulo Sueldos, se carga a mediados del mes siguiente) y erogaciones
// clasificadas (clasificación manual). Cuando un mes tiene facturación pero no
// tiene costos, el informe NO falla: imprime "Costos Fijos $0", un resultado
// operativo inflado y un punto de equilibrio en cero, con formato profesional y
// números falsos. Este módulo detecta esa situación ANTES de generar el PDF.
//
// Criterio (acordado con Paulo):
//   - BLOQUEA  → un mes con facturación y sin NINGÚN costo cargado.
//   - BLOQUEA  → quedan erogaciones sin clasificar por más del 5% del monto del
//                mes (ver más abajo).
//   - BLOQUEA  → alguna consulta falló: no se puede distinguir "no hay datos" de
//                "no se pudo consultar", y el fallback silencioso subestima el
//                costo laboral a ~la mitad.
//   - ADVIERTE → falta una parte (sueldos o erogaciones, no las dos), o quedan
//                erogaciones sin clasificar por menos del 5%.
//   - ADVIERTE → un mes sin ningún dato (fuera del rango cargado).
//
// ⚠️ Por qué se mide la COBERTURA y no la mera existencia (corregido 18/08/2026):
// la versión original solo chequeaba si el mes tenía erogaciones clasificadas.
// Con eso, un mes clasificado a medias pasaba el control. Julio 2026 lo destapó:
// 147 comprobantes sincronizados, y al clasificar solo los que tenían precedente
// histórico se cubría el 55% del monto — los otros $38,9 M quedaban fuera del
// informe y el mes pasaba de "bloqueado" a "OK". Ahora se compara contra los
// comprobantes crudos de `erogaciones_geclisa`.
//
// La comparación va por RPC (`app_cobertura_erogaciones_meses`, migración 40) y
// no por SELECT directo: `erogaciones_geclisa` tiene RLS con permiso 'analisis',
// distinto del 'analisis_marginal' de este módulo, así que un SELECT devolvería
// CERO filas sin error y la validación concluiría que no falta nada.
//
// Solo lectura: no escribe nada ni modifica el cálculo del informe.
// ============================================================

import { supabase } from '@shared/lib/supabase';
import { cargarCostoLaboralRangoDetallado, claveMes } from '@shared/services/costoLaboral';
import { RangoPeriodo, mesesDelRango, MESES_NOMBRE } from './periodo';

export type NivelIntegridad = 'ok' | 'advertencia' | 'bloqueante';

export interface MesIntegridad {
  anio: number;
  mes: number;
  /** "Julio 2026" */
  etiqueta: string;
  /** Cantidad de prestaciones facturadas (es_principal). */
  prestaciones: number;
  /** Costo laboral del módulo Sueldos (bruto + cargas). 0 si el mes no está cargado. */
  costoLaboral: number;
  tieneCostoLaboral: boolean;
  /** Cantidad de erogaciones clasificadas del mes (fijas + variables). */
  erogaciones: number;
  tieneErogaciones: boolean;
  /** Comprobantes sincronizados desde GECLISA para el mes. */
  erogacionesCrudas: number;
  /** Comprobantes crudos todavía sin clasificar. */
  erogacionesSinClasificar: number;
  /** Monto de lo que falta clasificar, y su peso sobre el total del mes. */
  montoSinClasificar: number;
  pctSinClasificar: number;
  nivel: NivelIntegridad;
  /** Qué le falta a este mes, en lenguaje del usuario. */
  faltantes: string[];
}

export interface IntegridadPeriodo {
  nivel: NivelIntegridad;
  meses: MesIntegridad[];
  /** Meses que impiden generar el informe. */
  bloqueantes: MesIntegridad[];
  /** Meses con datos incompletos que no impiden generar. */
  advertencias: MesIntegridad[];
  /**
   * Error de cualquiera de las consultas del chequeo (costo laboral, cobertura
   * de erogaciones o facturación). Implica nivel bloqueante: si no se pudo
   * verificar, no se puede afirmar que el período esté completo.
   */
  errorVerificacion: string | null;
  /** Una línea para estampar en el PDF cuando se genera con datos parciales. */
  leyendaPDF: string | null;
}

/**
 * Cuánto del monto del mes puede quedar sin clasificar antes de bloquear.
 * Por encima de esto el informe sale materialmente mal; por debajo son colas
 * razonables (un comprobante suelto que nadie tocó todavía).
 */
const TOLERANCIA_SIN_CLASIFICAR = 0.05;

const PEOR: Record<NivelIntegridad, number> = { ok: 0, advertencia: 1, bloqueante: 2 };

const peorDe = (a: NivelIntegridad, b: NivelIntegridad): NivelIntegridad =>
  (PEOR[a] >= PEOR[b] ? a : b);

const etiquetaMes = (anio: number, mes: number): string =>
  `${MESES_NOMBRE[mes - 1]} ${anio}`;

/** Filtro OR de los meses del rango, en el formato de PostgREST. */
const filtroMeses = (rango: RangoPeriodo): string =>
  mesesDelRango(rango).map((p) => `and(anio.eq.${p.anio},mes.eq.${p.mes})`).join(',');

interface FilaMes { anio: number; mes: number }

interface CoberturaMes {
  crudas: number;
  crudasMonto: number;
  clasificadas: number;
  clasificadasMonto: number;
}

interface FilaCobertura {
  anio: number;
  mes: number;
  crudas: number;
  crudas_monto: number;
  clasificadas: number;
  clasificadas_monto: number;
}

/**
 * Cobertura de clasificación por mes. Devuelve el error en vez de tragárselo:
 * un chequeo que no se pudo hacer no es un chequeo aprobado.
 */
async function cargarCobertura(rango: RangoPeriodo): Promise<{ meses: Map<string, CoberturaMes>; error: string | null }> {
  const meses = new Map<string, CoberturaMes>();
  const { data, error } = await supabase.rpc('app_cobertura_erogaciones_meses', {
    p_anio_desde: rango.anioDesde,
    p_mes_desde: rango.mesDesde,
    p_anio_hasta: rango.anioHasta,
    p_mes_hasta: rango.mesHasta,
  });
  if (error) return { meses, error: error.message };
  ((data || []) as FilaCobertura[]).forEach((r) => {
    meses.set(claveMes(r.anio, r.mes), {
      crudas: Number(r.crudas || 0),
      crudasMonto: Number(r.crudas_monto || 0),
      clasificadas: Number(r.clasificadas || 0),
      clasificadasMonto: Number(r.clasificadas_monto || 0),
    });
  });
  return { meses, error: null };
}

/** Trae todas las páginas de una tabla filtrada por los meses del rango. */
async function contarPorMes(
  tabla: 'movimientos_geclisa' | 'erogaciones_clasificacion',
  rango: RangoPeriodo,
  soloPrincipales: boolean,
): Promise<Map<string, number>> {
  const conteo = new Map<string, number>();
  const orMeses = filtroMeses(rango);
  let from = 0;
  for (;;) {
    let q = supabase.from(tabla).select('anio, mes').or(orMeses).range(from, from + 999);
    if (soloPrincipales) q = q.eq('es_principal', true);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    ((data || []) as unknown as FilaMes[]).forEach((r) => {
      const k = claveMes(r.anio, r.mes);
      conteo.set(k, (conteo.get(k) || 0) + 1);
    });
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return conteo;
}

/**
 * Revisa, mes por mes, si el período tiene las tres fuentes cargadas.
 * No lanza si una consulta falla: degrada a bloqueante con el motivo, porque un
 * chequeo que no se pudo hacer no es un chequeo aprobado.
 */
export async function verificarIntegridadPeriodo(rango: RangoPeriodo): Promise<IntegridadPeriodo> {
  const meses = mesesDelRango(rango);

  const [laboral, factPorMes, cobertura] = await Promise.all([
    cargarCostoLaboralRangoDetallado(rango.anioDesde, rango.mesDesde, rango.anioHasta, rango.mesHasta),
    contarPorMes('movimientos_geclisa', rango, true).catch((e: unknown) => e instanceof Error ? e : new Error(String(e))),
    cargarCobertura(rango),
  ]);

  const errConsulta = factPorMes instanceof Error ? factPorMes : null;
  const fact = factPorMes instanceof Error ? new Map<string, number>() : factPorMes;

  // Un error de consulta invalida el chequeo entero: no se puede afirmar nada.
  const errorGlobal = laboral.error || cobertura.error || (errConsulta ? errConsulta.message : null);

  const detalle: MesIntegridad[] = meses.map((p) => {
    const k = claveMes(p.anio, p.mes);
    const cl = laboral.meses.get(k);
    const prestaciones = fact.get(k) || 0;
    const cob = cobertura.meses.get(k);

    const erogaciones = cob ? cob.clasificadas : 0;
    const erogacionesCrudas = cob ? cob.crudas : 0;
    const erogacionesSinClasificar = Math.max(0, erogacionesCrudas - erogaciones);
    const montoSinClasificar = cob ? Math.max(0, cob.crudasMonto - cob.clasificadasMonto) : 0;
    const pctSinClasificar = cob && cob.crudasMonto > 0 ? montoSinClasificar / cob.crudasMonto : 0;

    const tieneCostoLaboral = !!cl;
    const tieneErogaciones = erogaciones > 0;
    // Solo cuenta como "incompleto" si hay comprobantes crudos esperando.
    const clasificacionIncompleta = erogacionesSinClasificar > 0;

    const faltantes: string[] = [];
    if (!tieneCostoLaboral) faltantes.push('sueldos (asiento + F.931 confirmado)');
    if (!tieneErogaciones && erogacionesCrudas > 0) faltantes.push('clasificar las erogaciones');
    else if (!tieneErogaciones) faltantes.push('erogaciones clasificadas');
    else if (clasificacionIncompleta) {
      faltantes.push(
        `clasificar ${erogacionesSinClasificar} de ${erogacionesCrudas} comprobantes ` +
        `(${(pctSinClasificar * 100).toFixed(0)}% del gasto del mes)`,
      );
    }

    let nivel: NivelIntegridad = 'ok';
    if (prestaciones === 0 && !tieneCostoLaboral && erogacionesCrudas === 0) {
      nivel = 'advertencia';
      faltantes.length = 0;
      faltantes.push('el mes no tiene ningún dato cargado');
    } else if (prestaciones > 0 && !tieneCostoLaboral && !tieneErogaciones) {
      nivel = 'bloqueante';
    } else if (clasificacionIncompleta && pctSinClasificar > TOLERANCIA_SIN_CLASIFICAR) {
      // Media clasificación distorsiona el informe más de lo que se nota.
      nivel = 'bloqueante';
    } else if (faltantes.length > 0) {
      nivel = 'advertencia';
    }

    return {
      anio: p.anio,
      mes: p.mes,
      etiqueta: etiquetaMes(p.anio, p.mes),
      prestaciones,
      costoLaboral: cl ? cl.costoLaboral : 0,
      tieneCostoLaboral,
      erogaciones,
      tieneErogaciones,
      erogacionesCrudas,
      erogacionesSinClasificar,
      montoSinClasificar,
      pctSinClasificar,
      nivel,
      faltantes,
    };
  });

  let nivel = detalle.reduce<NivelIntegridad>((acc, m) => peorDe(acc, m.nivel), 'ok');
  if (errorGlobal) nivel = 'bloqueante';

  const bloqueantes = detalle.filter((m) => m.nivel === 'bloqueante');
  const advertencias = detalle.filter((m) => m.nivel === 'advertencia');

  const leyendaPDF = advertencias.length > 0 && nivel === 'advertencia'
    ? `Período incompleto: ${advertencias.map((m) => `${m.etiqueta} sin ${m.faltantes.join(' ni ')}`).join('; ')}.`
    : null;

  return { nivel, meses: detalle, bloqueantes, advertencias, errorVerificacion: errorGlobal, leyendaPDF };
}
