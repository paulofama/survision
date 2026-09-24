// Tipos del núcleo de parámetros de comisiones (parametros.mjs).

import type { ParametrosComision } from './calculo.d.mts';

/** Una fila de `comisiones_parametros`, como la devuelve la base. */
export interface FilaParametro {
  clave: string;
  valor: number | string;
  vigencia_desde: string;   // date
  notas?: string | null;
  created_by?: string | null;
}

export declare const CLAVES: Record<string, keyof ParametrosComision>;
export declare const PARAMETROS_VACIOS: ParametrosComision;

export declare function fechaLocal(ts: string | Date | null | undefined): string | null;
export declare function fechaDesdeNumero(n: number | string | null | undefined): string | null;

export declare function parametrosVigentes(
  filas: FilaParametro[] | null | undefined,
  fecha: string | null | undefined,
): ParametrosComision;

export declare function fechaVigenciaRegimen(filas: FilaParametro[] | null | undefined): string | null;

export declare function estadoRegimen(
  filas: FilaParametro[] | null | undefined,
  opts?: { comisionables?: number },
): { activo: boolean; desde?: string; motivo?: string };
