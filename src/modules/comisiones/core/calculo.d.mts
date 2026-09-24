// Tipos del núcleo isomórfico de comisiones (calculo.mjs).

export type RolComision = 'ENTREGADOR' | 'PARTICIPANTE' | 'RECUPERADOR';
export type TipoMovimiento = 'DEVENGO' | 'REVERSO' | 'AJUSTE';

export declare const ROLES: Record<RolComision, RolComision>;
export declare const TIPOS: Record<TipoMovimiento, TipoMovimiento>;

/** La descomposición de precios que guarda `datos_completos.precios`. */
export interface PreciosPresupuesto {
  subtotalOriginal?: number | string | null;
  descuento?: number | string | null;
  totalInsumos?: number | string | null;
  /** OJO: este campo YA descuenta la cobertura de la obra social. No es la base. */
  subtotalConGastos?: number | string | null;
  coberturaOS?: number | string | null;
  [k: string]: unknown;
}

/** Una llamada del seguimiento, como la ve el cálculo. */
export interface LlamadaSeguimiento {
  id?: string | null;
  fecha: string;              // YYYY-MM-DD
  usuario: string;
  resultado: string;          // 'atendio' | 'no_atendio' | 'whatsapp_enviado'
  canal?: string | null;
}

export interface ParametrosComision {
  tasaComision: number;          // % sobre la base
  participantesPct: number;      // % del pool para el conjunto de participantes
  recuperadorPct: number;        // % de la parte del entregador
  diasParaFrio: number;
  ventanaRecuperoDias: number;
}

export interface ParteReparto {
  beneficiario: string;
  rol: RolComision;
  pct: number;
  importe: number;
}

export interface EvidenciaRecupero {
  llamada_id: string | null;
  contacto_efectivo: string;
  canal: string | null;
  dias_desde_entrega: number;
  dias_hasta_practica: number;
}

export interface PresupuestoParaDevengo {
  id: string;
  atencionId?: number | null;
  precios: PreciosPresupuesto;
  entregadoPor: string | null;
  fechaEntrega: string | null;
  fechaPractica: string | null;
}

/** Una fila lista para insertar en `comisiones_movimientos`. */
export interface MovimientoComision {
  presupuesto_id: string;
  beneficiario: string;
  rol: RolComision;
  tipo: TipoMovimiento;
  evento_origen: string;
  evidencia: EvidenciaRecupero | { revierte_movimiento: string } | null;
  base_comisionable: number;
  tasa_aplicada: number;
  pct_reparto: number;
  importe: number;
  fecha_devengo: string;
  motivo?: string;
  created_by?: string;
}

export declare function redondear(n: unknown): number;

export declare function baseComisionable(precios: PreciosPresupuesto | null | undefined): number;

export declare function repartir(
  pool: number,
  entregador: string,
  participantes: string[],
  recuperador: string | null,
  pcts: { participantesPct: number; recuperadorPct: number },
): ParteReparto[];

export declare function detectarRecupero(args: {
  fechaEntrega: string | null;
  fechaPractica: string | null;
  entregador: string | null;
  llamadas: LlamadaSeguimiento[];
  diasParaFrio: number;
  ventanaDias: number;
}): { usuario: string; evidencia: EvidenciaRecupero } | null;

export declare function devengosDePractica(args: {
  presupuesto: PresupuestoParaDevengo;
  participantes: string[];
  llamadas: LlamadaSeguimiento[];
  parametros: ParametrosComision;
}): MovimientoComision[];

export declare function reversoDe(
  movimiento: { id: string; presupuesto_id: string; beneficiario: string; rol: RolComision;
                base_comisionable: number; tasa_aplicada: number; pct_reparto: number; importe: number },
  opts: { motivo: string; evento: string; fecha: string; usuario: string },
): MovimientoComision;
