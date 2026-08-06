// Tipos del parser isomórfico del extracto Santander (bancoExtractoParser.mjs).

export interface MovimientoBanco {
  fecha: string;                 // YYYY-MM-DD
  anio: number | null;
  mes: number | null;
  posicionDia: number;
  nroComprobante: string | null;
  concepto: string;
  descripcion: string;
  contraparteNombre: string | null;
  contraparteCuit: string | null;
  importe: number;               // con signo (delta de saldo)
  saldoResultante: number;
  hashDedup: string;
}

export interface ImpositivoDetalle {
  ley25413_creditos: number | null;
  ley25413_debitos: number | null;
  ley25413_total: number | null;
  computable_creditos_33: number | null;
  computable_debitos_33: number | null;
  sircreb_total: number | null;
  raw: string[][];
}

export interface ResumenExtracto {
  nroCuenta: string;
  periodoDesde: string | null;
  periodoHasta: string | null;
  saldoInicial: number;
  saldoFinal: number;
  saldoFinalDeclarado: number | null;
  validadoContraDeclarado: boolean;
  totalCreditos: number;
  totalDebitos: number;
  cantMovimientos: number;
  saldoRecalculado: number;
  cierraCadena: boolean;
  controlSecundario: { verificados: number; discrepancias: number };
  impositivo: ImpositivoDetalle;
}

export interface ParseResult {
  ok: boolean;
  motivoRechazo: string | null;
  resumen: ResumenExtracto | null;
  movimientos: MovimientoBanco[];
  impositivoRaw: string[][];
}

export interface ParseOpts { nroCuenta?: string; }

export function parseNumeroAR(v: unknown): number | null;
export function parseWorkbook(workbook: unknown, opts?: ParseOpts): ParseResult;
export function parseExtracto(bytes: Uint8Array | ArrayBuffer, opts?: ParseOpts): ParseResult;
