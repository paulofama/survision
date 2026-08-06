export const DEFAULTS: {
  ventanaDiasHabiles: number;
  toleranciaImporte: number;
  toleranciaLotePct: number;
  umbralNombre: number;
};

export function nombreSimilitud(a: string | null | undefined, b: string | null | undefined): number;
export function diasHabilesEntre(a: string, b: string): number;

export interface Sugerencia {
  valor: any;
  score: number;
  sim: number;
  dias: number;
  importeOk: boolean;
  cuitMatch: boolean;
}

export function buscarSugerencias(bancoMov: any, valoresPendientes: any[], opts?: Record<string, unknown>): Sugerencia[];

export function crearConciliacion(supabase: any, args: {
  tipo?: 'automatica' | 'manual';
  usuario?: string | null;
  bancoIds?: string[];
  geclisaIds?: string[];
  diferencia?: number;
  motivoDiferencia?: string | null;
  observacion?: string | null;
  totalBanco?: number;
  totalGeclisa?: number;
}): Promise<string>;

export function desconciliar(supabase: any, conciliacionId: string, usuario?: string | null): Promise<{ bancoIds: string[]; geclisaIds: string[] }>;

export interface ConciliarOpts {
  cuentaId: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  [k: string]: unknown;
}

export function conciliarAutomatico(supabase: any, opts: ConciliarOpts): Promise<{ auto: number; ambiguos: number; sinCandidato: number; banco: number; valores?: number }>;

export function conciliarGetnet(supabase: any, opts: ConciliarOpts): Promise<{ auto: number; ambiguos: number; sinCandidato: number; getnet: number; tarjetas?: number }>;

export function conciliarTodo(supabase: any, opts: ConciliarOpts): Promise<{ auto: number; ambiguos: number; sinCandidato: number; banco: number; valores?: number; getnet: { auto: number; ambiguos: number; sinCandidato: number; getnet: number; tarjetas?: number } }>;
