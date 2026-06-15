// ============================================================
// TYPES: Liquidación de Honorarios
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================

/** Prestador habilitado para liquidación */
export interface LiqPrestador {
  id: string;
  nombre: string;
  nombre_corto: string | null;
  pre_id_geclisa: number | null;
  es_socio: boolean;
  condicion_iva: string;
  cuit: string | null;
  activo: boolean;
  orden: number;
  telefono: string | null;
}

/** Estado IVA de la sección Facturación por Caja */
export type CajaIvaEstado = 'Exento' | '10,5%' | '21%' | 'Mixto' | 'Error';

/** Valores calculados de la sección Caja */
export interface CajaCalculated {
  exento: number;
  neto105: number;
  iva105: number;
  neto21: number;
  iva21: number;
  total: number;
  estado: CajaIvaEstado;
}

/** Sugerencia de autocorrección */
export interface CajaSuggestion {
  show: boolean;
  message: string;
  suggestedExento: number;
  suggestedNeto: number;
  originalExento: number;
  originalNeto: number;
}

/** Liquidación completa (estructura de BD) */
export interface LiqHonorario {
  id: string;
  
  // Sección 1: Datos generales
  fecha: string;                 // "YYYY-MM-DD"
  prestador_id: string;          // UUID del prestador
  
  // Sección 2: Ingreso por Caja
  ingreso_por_caja: number;
  
  // Sección 3: Facturación por Caja - Inputs del usuario
  caja_exento_input: number;
  caja_neto_input: number;
  caja_total_input: number;
  
  // Sección 3: Calculados por IVA por diferencia
  caja_exentos: number;
  caja_neto_105: number;
  caja_iva_105: number;
  caja_neto_21: number;
  caja_iva_21: number;
  caja_iva_total: number;
  caja_total: number;
  caja_estado: CajaIvaEstado;
  
  // Sección 4: Facturación por Obras Sociales
  os_exentos: number;
  os_gravados_21: number;
  os_gravados_105: number;
  os_iva_21: number;
  os_iva_105: number;
  os_iva_total: number;
  os_total: number;
  
  // Sección 5: Retenciones
  retencion_gastos: number;
  
  // Totales consolidados
  total_exentos: number;
  total_gravados_21: number;
  total_gravados_105: number;
  total_iva: number;
  total_liquidado: number;
  total_abonar: number;
  
  // Metadata
  estado: 'vigente' | 'anulada';
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Vista con datos del prestador incluidos */
export interface LiqHonorarioConPrestador extends LiqHonorario {
  prestador_nombre: string;
  prestador_corto: string | null;
  prestador_condicion_iva: string;
  prestador_cuit: string | null;
}

/** Datos del formulario (lo que ingresa el usuario) */
export interface LiqHonorarioFormData {
  fecha: string;
  prestador_id: string;
  ingreso_por_caja: number;
  caja_exento_input: number;
  caja_neto_input: number;
  caja_total_input: number;
  os_exentos: number;
  os_gravados_21: number;
  os_gravados_105: number;
  retencion_gastos: number;
}

/** Detalle para facturar (cálculo del reporte) */
export interface FacturacionDetails {
  lineaExenta: number;
  totalGravados21: number;
  totalIva21: number;
  totalConIva21: number;
  totalGravados105: number;
  totalIva105: number;
  totalConIva105: number;
  totalFacturable: number;
  ivaTotal: number;
}

/** Resultado de operación CRUD */
export interface LiqOperationResult {
  success: boolean;
  message: string;
  data?: LiqHonorario;
}
