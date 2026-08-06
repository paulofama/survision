import type { ResumenExtracto, ImpositivoDetalle } from './bancoExtractoParser.mjs';

export interface IngestaResult {
  ok: boolean;
  motivo?: string | null;
  resumen: ResumenExtracto | null;
  nuevos: number;
  duplicados: number;
  cantMovimientos?: number;
  impositivo?: ImpositivoDetalle;
  impositivoRaw?: string[][];
  importacion?: any;
  preview?: boolean;
  insertados?: number;
}

export interface IngestaParams {
  supabase: any;
  cuentaId: string;
  nroCuenta: string;
  bytes: Uint8Array | ArrayBuffer;
  reglas: any[];
  origen?: 'manual' | 'daemon';
  usuario?: string | null;
  archivoNombre?: string | null;
  archivoHash?: string | null;
  write?: boolean;
}

export function ingestarExtracto(p: IngestaParams): Promise<IngestaResult>;
