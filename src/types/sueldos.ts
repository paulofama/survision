// ═══════════════════════════════════════════════════════════════════════════
// TYPES — MÓDULO CARGA DE SUELDOS
// ═══════════════════════════════════════════════════════════════════════════
// Sistema: SurVisión / Sistema Integral de Gestión
// Cliente: Instituto Dr. Mercado / Survisión S.A.
// Desarrollo: P. Famá
//
// Interfaces TypeScript que reflejan el modelo de datos del módulo Sueldos
// en Supabase. Se usan en hooks, páginas, componentes y validaciones Zod.
//
// Fase 1: Plan de cuentas + Empleados + Log de auditoría.
// Las interfaces de Liquidaciones, F.931, Asientos y Hallazgos se agregan
// en fases posteriores.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// PLAN DE CUENTAS
// ───────────────────────────────────────────────────────────────────────────

export type CapituloCuenta =
  | 'ACTIVO'
  | 'PASIVO'
  | 'PATRIMONIO NETO'
  | 'GASTOS'
  | 'INGRESOS';

export type TipoCuentaResultado = 'OPERATIVOS' | 'NO OPERATIVOS' | null;

export type SaldoPorDefecto = 'D' | 'H';

export interface PlanCuenta {
  cta_codigo: string;
  cta_nombre: string;
  cta_codigo_madre: string | null;
  imputable: boolean;
  cap_id: CapituloCuenta;
  reexpresable: boolean;
  tipo_cta_resultado: TipoCuentaResultado;
  saldo_por_defecto: SaldoPorDefecto;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Cuenta con sus cuentas hijas resueltas (para mostrar árbol jerárquico).
 */
export interface PlanCuentaTreeNode extends PlanCuenta {
  hijas: PlanCuentaTreeNode[];
  nivel: number;
}

// ───────────────────────────────────────────────────────────────────────────
// EMPLEADOS
// ───────────────────────────────────────────────────────────────────────────

export type AreaEmpleado =
  | 'Administración'
  | 'Cajera'
  | 'Limpieza'
  | 'Medición'
  | 'Recepción'
  | 'Telefonista'
  | 'Cirugías';

export type TipoDocumento = 'DNI' | 'LE' | 'LC' | 'PASAPORTE' | 'CI';

export type SexoEmpleado = 'M' | 'F';

export type ModalidadContratacion =
  | 'LCT por tiempo indeterminado'
  | 'LCT plazo fijo'
  | 'LCT eventual'
  | 'LCT a tiempo parcial';

export type CondicionGanancias = 'Sujeto a retención' | 'No alcanzado';

export type EstadoEmpleado = 'activo' | 'inactivo';

export interface Empleado {
  id: string;

  // Identificación
  apellido: string;
  nombre: string;
  cuil: string; // formato: XX-XXXXXXXX-X
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: string; // ISO date YYYY-MM-DD
  sexo: SexoEmpleado;

  // Laborales
  fecha_ingreso: string; // ISO date YYYY-MM-DD
  fecha_egreso: string | null; // ISO date YYYY-MM-DD, null si activo
  area: AreaEmpleado;
  cuenta_contable: string; // FK a plan_cuentas.cta_codigo
  categoria: string | null;
  convenio: string | null;
  modalidad_contratacion: ModalidadContratacion | null;

  // Contacto
  domicilio: string | null;
  telefono: string | null;
  email: string | null;

  // Bancarios
  banco: string | null;
  cbu: string | null; // 22 dígitos
  cuenta_sueldo_nro: string | null;

  // Previsionales / fiscales
  obra_social: string | null;
  art_asignada: string | null;
  condicion_ganancias: CondicionGanancias | null;

  // Estado
  estado: EstadoEmpleado;

  created_at: string;
  updated_at: string;
}

/**
 * Datos requeridos para crear un nuevo empleado.
 * Excluye campos que se generan automáticamente o son opcionales.
 */
export type EmpleadoNuevo = Omit<
  Empleado,
  'id' | 'created_at' | 'updated_at' | 'estado' | 'fecha_egreso'
> & {
  estado?: EstadoEmpleado;
  fecha_egreso?: string | null;
};

/**
 * Datos para actualizar un empleado existente.
 * Todos los campos son opcionales excepto el id.
 */
export type EmpleadoActualizacion = Partial<Omit<Empleado, 'id' | 'created_at' | 'updated_at'>>;

/**
 * Empleado con metadata de UI para el listado.
 */
export interface EmpleadoListado extends Empleado {
  es_baja_reciente: boolean; // Baja en el año en curso
  es_alta_reciente: boolean; // Alta en el año en curso
  meses_antiguedad: number;
}

// ───────────────────────────────────────────────────────────────────────────
// LOG DE AUDITORÍA
// ───────────────────────────────────────────────────────────────────────────

export type AccionAuditoria =
  | 'INSERT_plan_cuentas'
  | 'UPDATE_plan_cuentas'
  | 'DELETE_plan_cuentas'
  | 'INSERT_empleados'
  | 'UPDATE_empleados'
  | 'DELETE_empleados'
  // Acciones de Fase 2 (liquidaciones)
  | 'INSERT_liquidaciones_mes'
  | 'UPDATE_liquidaciones_mes'
  | 'DELETE_liquidaciones_mes'
  | 'CIERRE_MES'
  | 'REAPERTURA_MES'
  // Acciones de Fase 3 (F.931)
  | 'INSERT_f931_declaraciones'
  | 'UPDATE_f931_declaraciones'
  | 'DELETE_f931_declaraciones'
  | 'CONFIRMADO_F931'
  | 'DESCARTADO_F931'
  // Acciones de Fase 4 (asientos)
  | 'GENERADO_ASIENTO'
  | 'UPDATE_asientos_sueldos'
  | 'DELETE_asientos_sueldos'
  // Acciones de Fase 5 (hallazgos)
  | 'INSERT_hallazgos'
  | 'UPDATE_hallazgos'
  | 'DELETE_hallazgos'
  | string; // Por extensibilidad

export interface LogAuditoriaSueldos {
  id: string;
  usuario_id: string | null;
  usuario_nombre_snapshot: string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id: string;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ───────────────────────────────────────────────────────────────────────────
// FILTROS Y CONSULTAS
// ───────────────────────────────────────────────────────────────────────────

export interface FiltrosEmpleados {
  busqueda: string; // búsqueda por apellido, nombre, CUIL o nº doc
  area: AreaEmpleado | 'TODAS';
  estado: EstadoEmpleado | 'TODOS';
}

export const FILTROS_EMPLEADOS_DEFAULT: FiltrosEmpleados = {
  busqueda: '',
  area: 'TODAS',
  estado: 'TODOS',
};

// ───────────────────────────────────────────────────────────────────────────
// RESULTADO DE OPERACIONES
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resultado estándar de operaciones CRUD del módulo.
 * Encapsula éxito/error sin lanzar excepciones.
 */
export type ResultadoOperacion<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; codigo?: string };

// ───────────────────────────────────────────────────────────────────────────
// HELPERS DE TIPOS — para autocompletado en valores conocidos
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lista de áreas disponibles. Usar para iterar en selects.
 */
export const AREAS_EMPLEADO: readonly AreaEmpleado[] = [
  'Administración',
  'Cajera',
  'Limpieza',
  'Medición',
  'Recepción',
  'Telefonista',
  'Cirugías',
] as const;

/**
 * Lista de tipos de documento disponibles.
 */
export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = [
  'DNI',
  'LE',
  'LC',
  'PASAPORTE',
  'CI',
] as const;

/**
 * Lista de modalidades de contratación disponibles.
 */
export const MODALIDADES_CONTRATACION: readonly ModalidadContratacion[] = [
  'LCT por tiempo indeterminado',
  'LCT plazo fijo',
  'LCT eventual',
  'LCT a tiempo parcial',
] as const;

// ===========================================================================
// FASE 2 — LIQUIDACIONES MENSUALES
// ===========================================================================
// Tipos que reflejan las tablas creadas en migrations/02_sueldos_fase2_*.sql:
//   - liquidaciones_mes
//   - liquidacion_bloques
//   - liquidacion_lineas_empleado
//   - liquidacion_lineas_concepto
//
// Las constantes (labels, colores, orden, mappings) viven en
// src/utils/sueldos/constantes.ts para no contaminar este archivo con data.
// ===========================================================================

// ───────────────────────────────────────────────────────────────────────────
// ESTADO DEL FLUJO MENSUAL
// ───────────────────────────────────────────────────────────────────────────

/**
 * 7 estados del flujo de carga del mes. Avance automático hasta CONCILIADO;
 * manual desde ASIENTO_GENERADO en adelante. La reapertura desde CERRADO
 * requiere justificación obligatoria.
 *
 * Equivale al `EstadoMesKey` de constantes.ts (mismo conjunto de literales).
 */
export type EstadoLiquidacion =
  | 'VACIO'
  | 'MINUTA_EN_CARGA'
  | 'MINUTA_COMPLETA'
  | 'F931_CARGADO'
  | 'CONCILIADO'
  | 'ASIENTO_GENERADO'
  | 'CERRADO';

/**
 * Orden canónico de los estados (útil para validar transiciones / progresión).
 */
export const ESTADOS_LIQUIDACION_ORDEN: readonly EstadoLiquidacion[] = [
  'VACIO',
  'MINUTA_EN_CARGA',
  'MINUTA_COMPLETA',
  'F931_CARGADO',
  'CONCILIADO',
  'ASIENTO_GENERADO',
  'CERRADO',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// BLOQUES DE LA MINUTA
// ───────────────────────────────────────────────────────────────────────────

/**
 * 4 bloques estables + 1 ocasional (dia_sanidad). Coinciden con el CHECK
 * de la columna `tipo` en la tabla `liquidacion_bloques`.
 */
export type TipoBloque =
  | 'pago_sueldos'           // Por empleado, contra Banco
  | 'horas_complementarias'  // Por empleado, contra Caja, origen 'facturado'
  | 'dia_sanidad'            // Por empleado, contra Caja (ocasional)
  | 'seguridad_social'       // Por concepto (6), contra Banco
  | 'sindicato';             // Por concepto (1), contra Banco

export const TIPOS_BLOQUE: readonly TipoBloque[] = [
  'pago_sueldos',
  'horas_complementarias',
  'dia_sanidad',
  'seguridad_social',
  'sindicato',
] as const;

/**
 * Bloques que llevan líneas por empleado (carga individual).
 * Los demás (`seguridad_social`, `sindicato`) usan líneas por concepto.
 */
export const TIPOS_BLOQUE_POR_EMPLEADO: readonly TipoBloque[] = [
  'pago_sueldos',
  'horas_complementarias',
  'dia_sanidad',
] as const;

export const TIPOS_BLOQUE_POR_CONCEPTO: readonly TipoBloque[] = [
  'seguridad_social',
  'sindicato',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// MEDIO DE PAGO Y CONTRACUENTA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Medio de pago del bloque. Determina la cuenta contracuenta del asiento.
 *   - caja                  -> 1.1.1.01 CAJA
 *   - banco_santander_rio   -> 1.1.1.03 BANCO SANTANDER RIO
 *
 * Extensible si en el futuro se agregan otras cuentas bancarias.
 */
export type MedioPago = 'caja' | 'banco_santander_rio';

export const MEDIOS_PAGO: readonly MedioPago[] = [
  'caja',
  'banco_santander_rio',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// ORIGEN DE LA LINEA (para el asiento contable)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Origen del concepto en la propuesta de asiento:
 *   - recibo:     pago al empleado declarado en recibo de sueldo (bruto al Debe)
 *   - facturado:  horas complementarias pagadas vía factura del prestador
 *                 (Paulo lo reimputa en sistema contable real a 4.1.2.02)
 *   - F931:       contribuciones/aportes que vienen del F.931 (Fase 3-4)
 *   - sin_origen: caso por defecto / no clasificable
 */
export type OrigenLinea = 'recibo' | 'facturado' | 'F931' | 'sin_origen';

export const ORIGENES_LINEA: readonly OrigenLinea[] = [
  'recibo',
  'facturado',
  'F931',
  'sin_origen',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// CONCEPTOS CANONICOS (para bloques de seguridad_social y sindicato)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Códigos canónicos de los conceptos que aparecen en bloques sin empleado.
 *   - SS:  Seguridad Social (Sistema Integrado Previsional Argentino - SIPA)
 *   - OS:  Obra Social
 *   - ART: Aseguradora de Riesgos del Trabajo
 *   - SCVO: Seguro Colectivo de Vida Obligatorio
 *
 * Los 6 primeros corresponden a `seguridad_social`; el último a `sindicato`.
 */
export type ConceptoCodigo =
  | 'APORTE_SS'    // 301 - aporte del empleado
  | 'CONTRIB_SS'   // 351 - contribución del empleador
  | 'APORTE_OS'    // 302 - aporte del empleado
  | 'CONTRIB_OS'   // 352 - contribución del empleador
  | 'ART'          // ART de mes
  | 'SCVO'         // Seguro de vida obligatorio
  | 'SINDICATO';   // Cuota sindical

export const CONCEPTOS_SEGURIDAD_SOCIAL: readonly ConceptoCodigo[] = [
  'APORTE_SS',
  'CONTRIB_SS',
  'APORTE_OS',
  'CONTRIB_OS',
  'ART',
  'SCVO',
] as const;

export const CONCEPTOS_SINDICATO: readonly ConceptoCodigo[] = ['SINDICATO'] as const;

// ───────────────────────────────────────────────────────────────────────────
// FILA DE LIQUIDACION MENSUAL
// ───────────────────────────────────────────────────────────────────────────

/**
 * Refleja la tabla `liquidaciones_mes`. Una fila por (anio, mes).
 */
export interface LiquidacionMes {
  id: string;

  anio: number;
  mes: number;

  estado: EstadoLiquidacion;

  // Metadata del cierre
  cerrado_at: string | null;
  cerrado_por: string | null;
  cerrado_por_nombre: string | null;

  // Metadata de reapertura (justificación obligatoria si reabierto_at no es null)
  reabierto_at: string | null;
  reabierto_por: string | null;
  reabierto_por_nombre: string | null;
  reapertura_justificacion: string | null;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Datos para crear una liquidación nueva (mes vacío).
 */
export type LiquidacionMesNueva = Pick<LiquidacionMes, 'anio' | 'mes'> & {
  observaciones?: string | null;
};

/**
 * Datos para actualizar una liquidación existente.
 * Excluye campos de auditoría (id, created_at, updated_at, anio, mes son inmutables).
 */
export type LiquidacionMesActualizacion = Partial<
  Omit<LiquidacionMes, 'id' | 'created_at' | 'updated_at' | 'anio' | 'mes'>
>;

// ───────────────────────────────────────────────────────────────────────────
// BLOQUE DE LA MINUTA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Refleja la tabla `liquidacion_bloques`. UNIQUE (liquidacion_id, tipo).
 */
export interface LiquidacionBloque {
  id: string;
  liquidacion_id: string;

  tipo: TipoBloque;

  medio_pago: MedioPago | null;
  cuenta_contracuenta: string | null;

  /** Total declarado por la contadora (para validar vs. suma de líneas). */
  total_declarado: number | null;

  /** La contadora marca cuando terminó de cargar este bloque. */
  completo: boolean;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

export type LiquidacionBloqueNuevo = Pick<
  LiquidacionBloque,
  'liquidacion_id' | 'tipo'
> & {
  medio_pago?: MedioPago | null;
  cuenta_contracuenta?: string | null;
  total_declarado?: number | null;
  observaciones?: string | null;
};

export type LiquidacionBloqueActualizacion = Partial<
  Omit<
    LiquidacionBloque,
    'id' | 'created_at' | 'updated_at' | 'liquidacion_id' | 'tipo'
  >
>;

// ───────────────────────────────────────────────────────────────────────────
// LINEA POR EMPLEADO (pago_sueldos, horas_complementarias, dia_sanidad)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Refleja la tabla `liquidacion_lineas_empleado`. UNIQUE (bloque_id, empleado_id).
 */
export interface LiquidacionLineaEmpleado {
  id: string;
  bloque_id: string;
  empleado_id: string;

  /** Monto neto cargado por la contadora (dato cierto de la minuta). */
  monto_neto_cargado: number;

  /** Bruto estimado por reparto proporcional Rem.1 del F.931. Se completa en Fase 3-4. */
  bruto_estimado: number | null;

  origen: OrigenLinea;

  /** Snapshots al momento de cargar (el empleado puede cambiar de área después). */
  area_snapshot: string | null;
  cuenta_contable_snapshot: string | null;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

export type LiquidacionLineaEmpleadoNueva = Pick<
  LiquidacionLineaEmpleado,
  'bloque_id' | 'empleado_id' | 'monto_neto_cargado'
> & {
  origen?: OrigenLinea;
  area_snapshot?: string | null;
  cuenta_contable_snapshot?: string | null;
  observaciones?: string | null;
};

export type LiquidacionLineaEmpleadoActualizacion = Partial<
  Omit<
    LiquidacionLineaEmpleado,
    'id' | 'created_at' | 'updated_at' | 'bloque_id' | 'empleado_id'
  >
>;

// ───────────────────────────────────────────────────────────────────────────
// LINEA POR CONCEPTO (seguridad_social, sindicato)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Refleja la tabla `liquidacion_lineas_concepto`. UNIQUE (bloque_id, concepto_codigo).
 */
export interface LiquidacionLineaConcepto {
  id: string;
  bloque_id: string;

  /** Código canónico — usar ConceptoCodigo para autocompletado, pero el campo es string libre. */
  concepto_codigo: ConceptoCodigo | string;

  /** Nombre legible para mostrar (snapshot al momento de crear la línea). */
  concepto_nombre: string;

  /** Cuenta contable del concepto (snapshot del plan al momento de cargar). */
  cuenta_contable: string;

  monto: number;
  origen: OrigenLinea;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

export type LiquidacionLineaConceptoNueva = Pick<
  LiquidacionLineaConcepto,
  'bloque_id' | 'concepto_codigo' | 'concepto_nombre' | 'cuenta_contable' | 'monto'
> & {
  origen?: OrigenLinea;
  observaciones?: string | null;
};

export type LiquidacionLineaConceptoActualizacion = Partial<
  Omit<
    LiquidacionLineaConcepto,
    'id' | 'created_at' | 'updated_at' | 'bloque_id'
  >
>;

// ───────────────────────────────────────────────────────────────────────────
// AGREGADOS Y RESUMENES (para UI y cálculos derivados)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Bloque con sus líneas resueltas (uno de los dos arrays se usará según `tipo`).
 */
export interface LiquidacionBloqueCompleto extends LiquidacionBloque {
  lineas_empleado: LiquidacionLineaEmpleado[];
  lineas_concepto: LiquidacionLineaConcepto[];
}

/**
 * Liquidación de un mes con todos sus bloques y líneas anidadas.
 */
export interface LiquidacionMesCompleta extends LiquidacionMes {
  bloques: LiquidacionBloqueCompleto[];
}

/**
 * Resumen calculado de un bloque: totales, cuadre vs. declarado, conteo de líneas.
 */
export interface ResumenBloque {
  bloque_id: string;
  tipo: TipoBloque;
  total_calculado: number;
  total_declarado: number | null;
  diferencia: number | null;             // total_calculado - total_declarado, null si no hay declarado
  cuadra: boolean;                       // |diferencia| < UMBRAL_REDONDEO_ABS
  cantidad_lineas: number;
  completo: boolean;
}

/**
 * Resumen del mes completo: 1 fila por bloque + totales globales.
 */
export interface ResumenLiquidacionMes {
  liquidacion_id: string;
  anio: number;
  mes: number;
  estado: EstadoLiquidacion;
  bloques: ResumenBloque[];
  total_general_calculado: number;
  total_general_declarado: number;
  cantidad_bloques_completos: number;
  cantidad_bloques_totales: number;
}

// ───────────────────────────────────────────────────────────────────────────
// TRANSICIONES DE ESTADO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resultado de evaluar si una transición es permitida.
 */
export interface TransicionEstado {
  desde: EstadoLiquidacion;
  hacia: EstadoLiquidacion;
  /** true si la transición es válida según el flujo definido. */
  permitida: boolean;
  /** true si la transición requiere justificación obligatoria (ej. reapertura). */
  requiere_justificacion: boolean;
  /** Razón legible (para mostrar en UI o log). */
  razon?: string;
}

// ===========================================================================
// FASE 3 — F.931 Y CONCILIACION
// ===========================================================================
// Tipos que reflejan las tablas creadas en
// migrations/04_sueldos_fase3_f931_conciliacion.sql:
//   - f931_declaraciones
//   - f931_adjuntos
//   - conciliacion_diferencias
//
// Mas tipos auxiliares del parser y del engine de conciliacion.
// ===========================================================================

// ───────────────────────────────────────────────────────────────────────────
// F.931 — ESTADOS Y ADJUNTOS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Estado de la declaracion F.931 cargada.
 *   PARSEADO_PENDIENTE_REVISION: el parser termino, la contadora aun no confirmo
 *   REVISADO_CONFIRMADO:         confirmada y lista para conciliar
 *   DESCARTADO:                  subida por error (ej. era un VEP)
 */
export type EstadoF931 =
  | 'PARSEADO_PENDIENTE_REVISION'
  | 'REVISADO_CONFIRMADO'
  | 'DESCARTADO';

export const ESTADOS_F931: readonly EstadoF931[] = [
  'PARSEADO_PENDIENTE_REVISION',
  'REVISADO_CONFIRMADO',
  'DESCARTADO',
] as const;

/**
 * Tipo de adjunto en el bucket sueldos-adjuntos.
 *   F931_OFICIAL: PDF valido del F.931
 *   VEP_ERROR:    parecia VEP, marcado como error (no usar)
 *   OTRO:         adjunto adicional (acuse, captura, etc.)
 */
export type TipoAdjunto = 'F931_OFICIAL' | 'VEP_ERROR' | 'OTRO';

export const TIPOS_ADJUNTO: readonly TipoAdjunto[] = [
  'F931_OFICIAL',
  'VEP_ERROR',
  'OTRO',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// F.931 — DECLARACION (refleja tabla f931_declaraciones)
// ───────────────────────────────────────────────────────────────────────────

export interface F931Declaracion {
  id: string;

  // Identificacion del periodo
  cuit: string;
  cuit_sin_guiones: string;
  razon_social: string | null;
  anio: number;
  mes: number;

  /** Vinculo opcional con la liquidacion del mes. */
  liquidacion_id: string | null;

  estado: EstadoF931;

  /** El PDF se parecia a un VEP en vez de un F.931. */
  parecio_vep: boolean;

  // ----- Campos tipados del F.931 (todos opcionales hasta confirmar) -------
  cantidad_trabajadores: number | null;

  rem_total: number | null;
  rem_1: number | null;     // Base aportes SS (clave para reparto bruto en Fase 4)
  rem_2: number | null;     // Base aportes OS
  rem_3: number | null;
  rem_4: number | null;
  rem_5: number | null;

  aporte_ss_301: number | null;
  aporte_os_302: number | null;
  contrib_ss_351: number | null;
  contrib_os_352: number | null;

  art: number | null;
  scvo: number | null;

  asignaciones_familiares: number | null;
  total_a_depositar: number | null;

  /** Campos secundarios sin columna tipada (extensible). */
  campos_extra: Record<string, unknown> | null;

  /** Texto crudo extraido del PDF (debug del parser). */
  raw_extract_text: string | null;

  parseado_at: string | null;
  confirmado_at: string | null;
  confirmado_por_nombre: string | null;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Payload para crear una declaracion (insert).
 */
export type F931DeclaracionNueva = Omit<
  F931Declaracion,
  'id' | 'created_at' | 'updated_at' | 'confirmado_at' | 'confirmado_por_nombre'
> & {
  estado?: EstadoF931;
};

export type F931DeclaracionActualizacion = Partial<
  Omit<F931Declaracion, 'id' | 'created_at' | 'updated_at' | 'cuit_sin_guiones' | 'anio' | 'mes'>
>;

// ───────────────────────────────────────────────────────────────────────────
// F.931 — ADJUNTOS (refleja tabla f931_adjuntos)
// ───────────────────────────────────────────────────────────────────────────

export interface F931Adjunto {
  id: string;
  declaracion_id: string;
  tipo_adjunto: TipoAdjunto;
  bucket_path: string;            // path en Supabase Storage
  nombre_original: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  detectado_como_vep: boolean;
  subido_at: string;
  subido_por_nombre: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export type F931AdjuntoNuevo = Pick<
  F931Adjunto,
  'declaracion_id' | 'bucket_path'
> & {
  tipo_adjunto?: TipoAdjunto;
  nombre_original?: string | null;
  mime_type?: string | null;
  tamano_bytes?: number | null;
  detectado_como_vep?: boolean;
  subido_por_nombre?: string | null;
  observaciones?: string | null;
};

// ───────────────────────────────────────────────────────────────────────────
// F.931 — PARSER (resultado del backend al procesar un PDF)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Subconjunto de campos extraidos del PDF (sin metadata de tabla).
 * Todos opcionales: el parser puede no encontrar todos.
 */
export interface F931ParsedFields {
  cantidad_trabajadores: number | null;
  rem_total: number | null;
  rem_1: number | null;
  rem_2: number | null;
  rem_3: number | null;
  rem_4: number | null;
  rem_5: number | null;
  aporte_ss_301: number | null;
  aporte_os_302: number | null;
  contrib_ss_351: number | null;
  contrib_os_352: number | null;
  art: number | null;
  scvo: number | null;
  asignaciones_familiares: number | null;
  total_a_depositar: number | null;
  campos_extra: Record<string, unknown> | null;
}

export type F931ParseErrorCodigo =
  | 'PDF_INVALIDO'           // archivo no es PDF o esta corrupto
  | 'TEXTO_NO_EXTRACTABLE'   // PDF escaneado/imagen sin OCR
  | 'FORMATO_NO_F931'        // no parece F.931 (puede ser VEP u otro doc)
  | 'CUIT_NO_COINCIDE'       // CUIT detectado != SURVISION_CUIT (warning, no fatal)
  | 'PARSE_FALLO_GENERICO';

export interface F931ParseError {
  codigo: F931ParseErrorCodigo;
  mensaje: string;
  detalle?: string;
}

/**
 * Resultado del parser F.931. Discriminated union por `ok`.
 */
export type F931ParseResult =
  | {
      ok: true;
      /** El PDF parecia VEP en vez de F.931 (warning, no fatal). */
      detectado_como_vep: boolean;
      /** CUIT extraido del PDF (puede no coincidir con la empresa). */
      cuit_detectado: string | null;
      /** Período extraido del PDF. */
      periodo_detectado: { anio: number; mes: number } | null;
      /** true si el CUIT detectado coincide con SURVISION_CUIT. */
      cuit_coincide: boolean;
      /** Campos parseados del F.931. */
      campos: F931ParsedFields;
      /** Texto crudo del PDF (para debug y guardar en raw_extract_text). */
      raw_text: string;
      /** Advertencias no fatales detectadas durante el parseo. */
      warnings: string[];
    }
  | {
      ok: false;
      error: F931ParseError;
    };

// ───────────────────────────────────────────────────────────────────────────
// CONCILIACION — DIFERENCIAS Y TIPOS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Clasificacion de una diferencia entre minuta y F.931.
 *   AUTO_SINDICATO_NO_F931:        sindicato no se declara en F.931 (esperable)
 *   AUTO_RETENCION_SUSS_DESDOBLADA: F.931 separa retenciones SS y OS por concepto
 *   AUTO_REDONDEO:                  diferencia absoluta < UMBRAL_REDONDEO_ABS
 *   MATERIAL_RESIDUAL:              supera el umbral, requiere justificacion
 *   JUSTIFICADA_MANUAL:             el usuario explico la diferencia
 */
export type TipoDiferencia =
  | 'AUTO_SINDICATO_NO_F931'
  | 'AUTO_RETENCION_SUSS_DESDOBLADA'
  | 'AUTO_REDONDEO'
  | 'MATERIAL_RESIDUAL'
  | 'JUSTIFICADA_MANUAL';

export const TIPOS_DIFERENCIA: readonly TipoDiferencia[] = [
  'AUTO_SINDICATO_NO_F931',
  'AUTO_RETENCION_SUSS_DESDOBLADA',
  'AUTO_REDONDEO',
  'MATERIAL_RESIDUAL',
  'JUSTIFICADA_MANUAL',
] as const;

/**
 * Tipos de diferencia que son auto-justificadas por el engine.
 * Las demas requieren intervencion del usuario (cuando son materiales).
 */
export const TIPOS_DIFERENCIA_AUTO: readonly TipoDiferencia[] = [
  'AUTO_SINDICATO_NO_F931',
  'AUTO_RETENCION_SUSS_DESDOBLADA',
  'AUTO_REDONDEO',
] as const;

/**
 * Refleja la tabla conciliacion_diferencias. UNIQUE (liquidacion_id, bloque_tipo, concepto_codigo).
 * La columna `diferencia` es GENERATED en la BD; aqui se trata como readonly (no enviar en updates).
 */
export interface ConciliacionDiferencia {
  id: string;
  liquidacion_id: string;

  bloque_tipo: TipoBloque;
  /** Codigo del concepto comparado. null si es el agregado del bloque. */
  concepto_codigo: ConceptoCodigo | string | null;

  monto_minuta: number;
  monto_f931: number;
  /** Calculada por la BD: monto_minuta - monto_f931. No enviar en INSERT/UPDATE. */
  diferencia: number;

  tipo_diferencia: TipoDiferencia;
  justificada: boolean;
  justificacion: string | null;

  justificada_at: string | null;
  justificada_por_nombre: string | null;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

export type ConciliacionDiferenciaNueva = Pick<
  ConciliacionDiferencia,
  'liquidacion_id' | 'bloque_tipo' | 'monto_minuta' | 'monto_f931' | 'tipo_diferencia'
> & {
  concepto_codigo?: ConceptoCodigo | string | null;
  justificada?: boolean;
  justificacion?: string | null;
  justificada_por_nombre?: string | null;
  observaciones?: string | null;
};

export type ConciliacionDiferenciaActualizacion = Partial<
  Omit<
    ConciliacionDiferencia,
    'id' | 'created_at' | 'updated_at' | 'liquidacion_id' | 'diferencia'
  >
>;

// ───────────────────────────────────────────────────────────────────────────
// CONCILIACION — AGREGADO DEL MES (para UI / reportes)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resumen de la conciliacion de un mes.
 */
export interface ResumenConciliacion {
  liquidacion_id: string;
  /** ¿Hay un F.931 confirmado vinculado al mes? */
  tiene_f931_confirmado: boolean;
  /** Total de filas en conciliacion_diferencias para este mes. */
  total_diferencias: number;
  auto_justificadas: number;
  residuales_pendientes: number;      // MATERIAL_RESIDUAL sin justificar
  justificadas_manualmente: number;
  /** Suma de |diferencia| de todas las filas. */
  monto_total_diferencias_absoluto: number;
  /** true si todas las diferencias estan justificadas (manual o auto). */
  conciliado_completo: boolean;
}

/**
 * Entrada para el engine de conciliacion: cuanto trae la minuta para un
 * concepto/bloque y cuanto trae el F.931 (campo extraido).
 */
export interface EntradaConciliacion {
  bloque_tipo: TipoBloque;
  concepto_codigo: ConceptoCodigo | string | null;
  monto_minuta: number;
  monto_f931: number;
}

// ===========================================================================
// FASE 4 — PROPUESTA DE ASIENTO (devengamiento)
// ===========================================================================
// Tipos que reflejan las tablas creadas en
// migrations/05_sueldos_fase4_asientos.sql:
//   - asientos_sueldos          (cabecera, 1 por liquidacion)
//   - asiento_sueldos_lineas    (detalle Debe/Haber)
// ===========================================================================

/**
 * Criterio de calculo del bruto al Debe.
 *   REM1_AJUSTE:   bruto total = Rem.1 del F.931, brecha a linea de ajuste.
 *   RECONCILIABLE: bruto total = neto + aporte_301 + aporte_302 + sindicato.
 */
export type TipoCriterioBruto = 'REM1_AJUSTE' | 'RECONCILIABLE';

export const CRITERIOS_BRUTO: readonly TipoCriterioBruto[] = [
  'RECONCILIABLE',
  'REM1_AJUSTE',
] as const;

export const LABEL_CRITERIO_BRUTO: Readonly<Record<TipoCriterioBruto, string>> = {
  REM1_AJUSTE: 'Rem.1 + línea de ajuste',
  RECONCILIABLE: 'Bruto reconciliable (cuadra exacto)',
};

/**
 * Seccion del asiento (los dos pares de columnas del reporte).
 *   recibo:    devengamiento del recibo (bruto, cargas, netos a pagar).
 *   facturado: horas complementarias (Paulo reimputa luego a 4.1.2.02).
 */
export type SeccionAsiento = 'recibo' | 'facturado';

export const SECCIONES_ASIENTO: readonly SeccionAsiento[] = ['recibo', 'facturado'] as const;

/**
 * Refleja la tabla asientos_sueldos (cabecera). UNIQUE (liquidacion_id).
 */
export interface AsientoSueldos {
  id: string;
  liquidacion_id: string;
  anio: number;
  mes: number;

  f931_declaracion_id: string | null;

  criterio_bruto: TipoCriterioBruto;

  rem_1_usado: number | null;
  total_neto: number | null;
  bruto_total: number | null;
  /** Brecha Rem.1 - (neto+aportes+sindicato). + si va al Haber. */
  monto_ajuste: number | null;

  total_debe: number;
  total_haber: number;

  generado_at: string | null;
  generado_por_nombre: string | null;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Refleja la tabla asiento_sueldos_lineas (detalle Debe/Haber).
 */
export interface AsientoSueldosLinea {
  id: string;
  asiento_id: string;

  orden: number;
  seccion: SeccionAsiento;

  /** Cuenta contable (snapshot). null en la linea de ajuste (a determinar). */
  cuenta_codigo: string | null;
  cuenta_nombre: string | null;

  detalle: string | null;

  debe: number;
  haber: number;

  /** Linea de cuadre de la brecha Rem.1. */
  es_ajuste: boolean;
  /** Monto por reparto proporcional Rem.1 (se marca con asterisco). */
  es_estimado: boolean;

  empleado_id: string | null;
  area: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Asiento completo: cabecera + lineas ordenadas.
 */
export interface AsientoCompleto {
  cabecera: AsientoSueldos;
  lineas: AsientoSueldosLinea[];
}

/**
 * Resultado de generar el asiento (incluye advertencias del generador).
 */
export interface AsientoGenerarResult {
  cabecera: AsientoSueldos;
  lineas: AsientoSueldosLinea[];
  warnings: string[];
  mensaje?: string;
}

// ===========================================================================
// FASE 5 — HALLAZGOS DE AUDITORIA
// ===========================================================================
// Refleja la tabla migrations/06_sueldos_fase5_hallazgos.sql: hallazgos_sueldos.
// Acceso gated a nivel app por el permiso PERMISO_REPORTES_SUELDOS (solo Auditor).
// ===========================================================================

export type CriticidadHallazgo = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFORMATIVA';

export const CRITICIDADES_HALLAZGO: readonly CriticidadHallazgo[] = [
  'CRITICA', 'ALTA', 'MEDIA', 'BAJA', 'INFORMATIVA',
] as const;

export type EstadoHallazgo = 'ABIERTO' | 'EN_REVISION' | 'RESUELTO' | 'NO_APLICA';

export const ESTADOS_HALLAZGO: readonly EstadoHallazgo[] = [
  'ABIERTO', 'EN_REVISION', 'RESUELTO', 'NO_APLICA',
] as const;

export type OrigenHallazgo = 'manual' | 'automatico';

/**
 * Refleja la tabla hallazgos_sueldos.
 */
export interface HallazgoSueldos {
  id: string;

  /** Vinculo opcional con la liquidacion del mes (null = transversal). */
  liquidacion_id: string | null;
  anio: number | null;
  mes: number | null;

  /** Codigo legible (ej. 'H-01'). */
  codigo: string | null;

  titulo: string;
  descripcion: string | null;

  criticidad: CriticidadHallazgo;
  norma: string | null;
  estado: EstadoHallazgo;
  recomendacion: string | null;

  origen: OrigenHallazgo;

  detectado_at: string | null;
  resuelto_at: string | null;
  creado_por_nombre: string | null;

  observaciones: string | null;

  created_at: string;
  updated_at: string;
}

export type HallazgoSueldosNuevo = Pick<HallazgoSueldos, 'titulo'> & {
  liquidacion_id?: string | null;
  anio?: number | null;
  mes?: number | null;
  codigo?: string | null;
  descripcion?: string | null;
  criticidad?: CriticidadHallazgo;
  norma?: string | null;
  estado?: EstadoHallazgo;
  recomendacion?: string | null;
  origen?: OrigenHallazgo;
  creado_por_nombre?: string | null;
  observaciones?: string | null;
};

export type HallazgoSueldosActualizacion = Partial<
  Omit<HallazgoSueldos, 'id' | 'created_at' | 'updated_at'>
>;

export const LABEL_CRITICIDAD_HALLAZGO: Readonly<Record<CriticidadHallazgo, string>> = {
  CRITICA: 'Crítica',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja',
  INFORMATIVA: 'Informativa',
};

export const LABEL_ESTADO_HALLAZGO: Readonly<Record<EstadoHallazgo, string>> = {
  ABIERTO: 'Abierto',
  EN_REVISION: 'En revisión',
  RESUELTO: 'Resuelto',
  NO_APLICA: 'No aplica',
};
