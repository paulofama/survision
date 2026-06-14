// ============================================================
// SERVICIO: Engine de Conciliacion Minuta vs F.931
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// Funcion PURA que compara los conceptos de la minuta (Fase 2) contra los
// campos del F.931 (Fase 3) y devuelve un array de diferencias clasificadas.
//
// NO toca la BD — solo computa. El endpoint que la llama persiste el
// resultado (con manejo especial de las justificadas manualmente).
//
// API:
//   const { conciliar } = require('./services/conciliacionEngine');
//   const { diferencias, resumen } = conciliar(liquidacionCompleta, f931, {
//     umbralRedondeoAbs: 1,        // diferencia < $1 => AUTO_REDONDEO
//     umbralMaterialAbs: 100,      // diferencia > $100 => MATERIAL_RESIDUAL
//     umbralMaterialPct: 0.005,    // o > 0.5% del concepto => MATERIAL_RESIDUAL
//   });
//
// Las diferencias devueltas tienen forma de `ConciliacionDiferenciaNueva`:
//   { bloque_tipo, concepto_codigo, monto_minuta, monto_f931,
//     tipo_diferencia, justificada, justificacion }
//
// La columna `diferencia` (= monto_minuta - monto_f931) la calcula la BD
// como GENERATED, asi que no la incluimos en el INSERT.
//
// Reglas (per CLAUDE.md):
//   - sindicato no se declara en F.931 => AUTO_SINDICATO_NO_F931 (auto-just)
//   - |diferencia| < umbralRedondeoAbs => AUTO_REDONDEO (auto-just)
//   - |diferencia| <= umbralMaterialAbs Y <= ref*umbralMaterialPct
//        => AUTO_REDONDEO (auto-just, "menor al umbral material")
//   - resto => MATERIAL_RESIDUAL (pendiente de justificacion humana)
//
// Conceptos NO conciliados en Fase 3:
//   - pago_sueldos / horas_complementarias / dia_sanidad: el F.931 no trae
//     estos como conceptos sino como remuneraciones brutas (rem_1 a rem_5).
//     La conciliacion fina contra brutos viene en Fase 4 (asiento).
// ============================================================

// Defaults por si el caller no pasa opciones (alineados con
// src/utils/sueldos/constantes.ts: UMBRAL_REDONDEO_ABS y UMBRAL_DIFERENCIA_MATERIAL).
const DEFAULTS = {
  umbralRedondeoAbs: 1,
  umbralMaterialAbs: 100,
  umbralMaterialPct: 0.005,
};

// Mapeo de los 6 conceptos del bloque seguridad_social a los campos del F.931
const MAPEO_SS_A_F931 = [
  { codigo: 'APORTE_SS',  f931Field: 'aporte_ss_301' },
  { codigo: 'CONTRIB_SS', f931Field: 'contrib_ss_351' },
  { codigo: 'APORTE_OS',  f931Field: 'aporte_os_302' },
  { codigo: 'CONTRIB_OS', f931Field: 'contrib_os_352' },
  { codigo: 'ART',        f931Field: 'art' },
  { codigo: 'SCVO',       f931Field: 'scvo' },
];

// ============================================================
// HELPERS
// ============================================================

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buscarBloque(liq, tipo) {
  if (!liq || !Array.isArray(liq.bloques)) return null;
  return liq.bloques.find((b) => b.tipo === tipo) || null;
}

function buscarLineaConcepto(bloque, codigo) {
  if (!bloque || !Array.isArray(bloque.lineas_concepto)) return null;
  return bloque.lineas_concepto.find((l) => l.concepto_codigo === codigo) || null;
}

// ============================================================
// CLASIFICACION DE UNA DIFERENCIA INDIVIDUAL
// ============================================================

/**
 * Dado un par (montoMinuta, montoF931) y los umbrales, devuelve una
 * diferencia clasificada — o null si no hay diferencia que reportar
 * (ambos en 0).
 */
function clasificarDiferencia(bloque_tipo, concepto_codigo, montoMinuta, montoF931, opts) {
  const m = num(montoMinuta);
  const f = num(montoF931);

  // Si ambos son 0 no hay nada que conciliar
  if (m === 0 && f === 0) return null;

  const diff = m - f;
  const abs = Math.abs(diff);
  const refMonto = Math.max(m, f);
  const umbralPctAbs = refMonto * opts.umbralMaterialPct;

  // Redondeo trivial
  if (abs < opts.umbralRedondeoAbs) {
    return {
      bloque_tipo,
      concepto_codigo,
      monto_minuta: m,
      monto_f931: f,
      tipo_diferencia: 'AUTO_REDONDEO',
      justificada: true,
      justificacion: `Diferencia menor al umbral de redondeo ($${opts.umbralRedondeoAbs.toFixed(2)}).`,
    };
  }

  // Material: supera AMBOS umbrales (abs Y pct)
  // CLAUDE.md: "diferencia > $100 o > 0.5% del concepto => requiere justificacion"
  // Lo interpreto como: si supera CUALQUIERA es material.
  const esMaterial = abs > opts.umbralMaterialAbs || abs > umbralPctAbs;

  if (esMaterial) {
    return {
      bloque_tipo,
      concepto_codigo,
      monto_minuta: m,
      monto_f931: f,
      tipo_diferencia: 'MATERIAL_RESIDUAL',
      justificada: false,
      justificacion: null,
    };
  }

  // En el medio: la diferencia es mayor al redondeo trivial pero no llega
  // a material. Auto-justificada con leyenda explicativa.
  return {
    bloque_tipo,
    concepto_codigo,
    monto_minuta: m,
    monto_f931: f,
    tipo_diferencia: 'AUTO_REDONDEO',
    justificada: true,
    justificacion: `Diferencia menor al umbral material ($${opts.umbralMaterialAbs.toFixed(2)} y ${(opts.umbralMaterialPct * 100).toFixed(2)}%).`,
  };
}

// ============================================================
// REGLA AUTOMATICA: sindicato no se declara en F.931
// ============================================================

/**
 * Si hay un monto cargado en el bloque sindicato, generar una diferencia
 * auto-justificada (el F.931 no incluye sindicato).
 */
function conciliarSindicato(liq) {
  const bloque = buscarBloque(liq, 'sindicato');
  if (!bloque) return null;

  const linea = buscarLineaConcepto(bloque, 'SINDICATO');
  const monto = num(linea?.monto ?? 0);
  if (monto === 0) return null;

  return {
    bloque_tipo: 'sindicato',
    concepto_codigo: 'SINDICATO',
    monto_minuta: monto,
    monto_f931: 0,
    tipo_diferencia: 'AUTO_SINDICATO_NO_F931',
    justificada: true,
    justificacion: 'Cuota sindical no se declara en F.931 (diferencia esperable, auto-justificada por el sistema).',
  };
}

// ============================================================
// API PRINCIPAL
// ============================================================

/**
 * Calcula las diferencias entre la minuta y el F.931 de un mes.
 *
 * @param {Object} liquidacionCompleta - LiquidacionMesCompleta de Fase 2
 * @param {Object} f931 - F931Declaracion de Fase 3
 * @param {Object} [opciones] - umbralRedondeoAbs, umbralMaterialAbs, umbralMaterialPct
 * @returns {{ diferencias: Array, resumen: Object }}
 */
function conciliar(liquidacionCompleta, f931, opciones = {}) {
  const opts = { ...DEFAULTS, ...opciones };
  const diferencias = [];

  if (!liquidacionCompleta) {
    throw new Error('conciliar: falta liquidacionCompleta');
  }
  if (!f931) {
    throw new Error('conciliar: falta f931');
  }

  // 1. Conceptos del bloque seguridad_social (6 conceptos)
  const bloqueSS = buscarBloque(liquidacionCompleta, 'seguridad_social');
  if (bloqueSS) {
    for (const { codigo, f931Field } of MAPEO_SS_A_F931) {
      const linea = buscarLineaConcepto(bloqueSS, codigo);
      const montoMinuta = num(linea?.monto ?? 0);
      const montoF931 = num(f931[f931Field] ?? 0);
      const dif = clasificarDiferencia('seguridad_social', codigo, montoMinuta, montoF931, opts);
      if (dif) diferencias.push(dif);
    }
  }

  // 2. Sindicato (regla automatica)
  const difSind = conciliarSindicato(liquidacionCompleta);
  if (difSind) diferencias.push(difSind);

  // 3. pago_sueldos / horas_complementarias / dia_sanidad: NO se concilian
  //    contra F.931 en Fase 3. Quedan para Fase 4 (comparacion contra
  //    rem_1 / rem_4 del F.931 dentro del calculo del asiento).

  // Armar resumen
  const resumen = {
    total_diferencias: diferencias.length,
    auto_justificadas: diferencias.filter((d) => d.tipo_diferencia.startsWith('AUTO_')).length,
    residuales_pendientes: diferencias.filter((d) => d.tipo_diferencia === 'MATERIAL_RESIDUAL').length,
    justificadas_manualmente: 0, // El engine no las genera; el endpoint las preserva si ya existen
    monto_total_diferencias_absoluto: diferencias.reduce((s, d) => s + Math.abs(d.monto_minuta - d.monto_f931), 0),
    conciliado_completo: diferencias.every((d) => d.justificada),
  };

  return { diferencias, resumen };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  conciliar,
  // Helpers exportados para tests / debug
  clasificarDiferencia,
  conciliarSindicato,
  MAPEO_SS_A_F931,
  DEFAULTS,
};
