// ============================================================
// SERVICIO (browser): Engine de conciliación Minuta vs F.931
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Port literal de server/services/conciliacionEngine.js. Función PURA: compara
// los 6 conceptos del bloque seguridad_social + sindicato de la minuta contra
// los campos del F.931, y clasifica cada diferencia. Sin I/O ni dependencias de
// Node. El hook la corre en el browser y persiste el resultado en Supabase.
// ============================================================

export interface ConcOpciones {
  umbralRedondeoAbs: number;
  umbralMaterialAbs: number;
  umbralMaterialPct: number;
}

export const CONC_DEFAULTS: ConcOpciones = {
  umbralRedondeoAbs: 1,
  umbralMaterialAbs: 100,
  umbralMaterialPct: 0.005,
};

export const MAPEO_SS_A_F931: { codigo: string; f931Field: string }[] = [
  { codigo: 'APORTE_SS', f931Field: 'aporte_ss_301' },
  { codigo: 'CONTRIB_SS', f931Field: 'contrib_ss_351' },
  { codigo: 'APORTE_OS', f931Field: 'aporte_os_302' },
  { codigo: 'CONTRIB_OS', f931Field: 'contrib_os_352' },
  { codigo: 'ART', f931Field: 'art' },
  { codigo: 'SCVO', f931Field: 'scvo' },
];

export interface DiferenciaNueva {
  bloque_tipo: string;
  concepto_codigo: string | null;
  monto_minuta: number;
  monto_f931: number;
  tipo_diferencia: string;
  justificada: boolean;
  justificacion: string | null;
}

interface LineaConcepto { concepto_codigo: string; monto: number | null }
interface Bloque { tipo: string; lineas_concepto?: LineaConcepto[] }
interface LiquidacionCompleta { bloques?: Bloque[] }
type F931Like = Record<string, number | null | undefined>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function buscarBloque(liq: LiquidacionCompleta, tipo: string): Bloque | null {
  if (!liq || !Array.isArray(liq.bloques)) return null;
  return liq.bloques.find((b) => b.tipo === tipo) || null;
}
function buscarLineaConcepto(bloque: Bloque | null, codigo: string): LineaConcepto | null {
  if (!bloque || !Array.isArray(bloque.lineas_concepto)) return null;
  return bloque.lineas_concepto.find((l) => l.concepto_codigo === codigo) || null;
}

function clasificarDiferencia(
  bloque_tipo: string, concepto_codigo: string, montoMinuta: number, montoF931: number, opts: ConcOpciones,
): DiferenciaNueva | null {
  const m = num(montoMinuta);
  const f = num(montoF931);
  if (m === 0 && f === 0) return null;

  const abs = Math.abs(m - f);
  const refMonto = Math.max(m, f);
  const umbralPctAbs = refMonto * opts.umbralMaterialPct;

  if (abs < opts.umbralRedondeoAbs) {
    return { bloque_tipo, concepto_codigo, monto_minuta: m, monto_f931: f, tipo_diferencia: 'AUTO_REDONDEO', justificada: true, justificacion: `Diferencia menor al umbral de redondeo ($${opts.umbralRedondeoAbs.toFixed(2)}).` };
  }
  const esMaterial = abs > opts.umbralMaterialAbs || abs > umbralPctAbs;
  if (esMaterial) {
    return { bloque_tipo, concepto_codigo, monto_minuta: m, monto_f931: f, tipo_diferencia: 'MATERIAL_RESIDUAL', justificada: false, justificacion: null };
  }
  return { bloque_tipo, concepto_codigo, monto_minuta: m, monto_f931: f, tipo_diferencia: 'AUTO_REDONDEO', justificada: true, justificacion: `Diferencia menor al umbral material ($${opts.umbralMaterialAbs.toFixed(2)} y ${(opts.umbralMaterialPct * 100).toFixed(2)}%).` };
}

function conciliarSindicato(liq: LiquidacionCompleta): DiferenciaNueva | null {
  const bloque = buscarBloque(liq, 'sindicato');
  if (!bloque) return null;
  const linea = buscarLineaConcepto(bloque, 'SINDICATO');
  const monto = num(linea?.monto ?? 0);
  if (monto === 0) return null;
  return {
    bloque_tipo: 'sindicato', concepto_codigo: 'SINDICATO', monto_minuta: monto, monto_f931: 0,
    tipo_diferencia: 'AUTO_SINDICATO_NO_F931', justificada: true,
    justificacion: 'Cuota sindical no se declara en F.931 (diferencia esperable, auto-justificada por el sistema).',
  };
}

export interface ResumenConc {
  total_diferencias: number;
  auto_justificadas: number;
  residuales_pendientes: number;
  justificadas_manualmente: number;
  monto_total_diferencias_absoluto: number;
  conciliado_completo: boolean;
}

export function conciliar(
  liquidacionCompleta: LiquidacionCompleta, f931: F931Like, opciones: Partial<ConcOpciones> = {},
): { diferencias: DiferenciaNueva[]; resumen: ResumenConc } {
  const opts = { ...CONC_DEFAULTS, ...opciones };
  const diferencias: DiferenciaNueva[] = [];

  if (!liquidacionCompleta) throw new Error('conciliar: falta liquidacionCompleta');
  if (!f931) throw new Error('conciliar: falta f931');

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

  const difSind = conciliarSindicato(liquidacionCompleta);
  if (difSind) diferencias.push(difSind);

  const resumen: ResumenConc = {
    total_diferencias: diferencias.length,
    auto_justificadas: diferencias.filter((d) => d.tipo_diferencia.startsWith('AUTO_')).length,
    residuales_pendientes: diferencias.filter((d) => d.tipo_diferencia === 'MATERIAL_RESIDUAL').length,
    justificadas_manualmente: 0,
    monto_total_diferencias_absoluto: diferencias.reduce((s, d) => s + Math.abs(d.monto_minuta - d.monto_f931), 0),
    conciliado_completo: diferencias.every((d) => d.justificada),
  };

  return { diferencias, resumen };
}
