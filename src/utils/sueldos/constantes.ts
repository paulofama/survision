// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES — MÓDULO CARGA DE SUELDOS
// ═══════════════════════════════════════════════════════════════════════════
// Sistema: SurVisión / Sistema Integral de Gestión
// Cliente: Instituto Dr. Mercado / Survisión S.A.
// Desarrollo: P. Famá
//
// Constantes globales del módulo Sueldos. Incluye:
//  - Datos de la empresa (CUIT, razón social)
//  - Mapeo área → cuenta contable por defecto (4.1.1.0X)
//  - Códigos de cuentas contables relevantes (gastos, pasivos, activos)
//  - Labels y colores para la UI
//  - Estados de liquidación y reglas de conciliación
//
// Empresa única: Survisión S.A. (no se diseña multi-empresa).
// ═══════════════════════════════════════════════════════════════════════════

import type {
  AreaEmpleado,
  EstadoEmpleado,
  ModalidadContratacion,
  TipoDocumento,
} from '../../types/sueldos';

// ───────────────────────────────────────────────────────────────────────────
// DATOS DE LA EMPRESA
// ───────────────────────────────────────────────────────────────────────────

export const SURVISION_CUIT = '30-70967266-1';
export const SURVISION_CUIT_SIN_GUIONES = '30709672661';
export const SURVISION_RAZON_SOCIAL = 'Survisión S.A.';
export const SURVISION_NOMBRE_FANTASIA = 'Instituto Dr. Mercado';

// ───────────────────────────────────────────────────────────────────────────
// PLAN DE CUENTAS — CÓDIGOS USADOS POR EL MÓDULO SUELDOS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cuentas de GASTOS (Debe del asiento de devengamiento).
 * Granularidad máxima por área: 4.1.1.01 a 4.1.1.08.
 */
export const CUENTAS_GASTOS_SUELDOS = {
  ADMINISTRACION: '4.1.1.01',
  LIMPIEZA: '4.1.1.02',
  CIRUGIAS: '4.1.1.03', // Cuenta dormida — mantener por compatibilidad histórica
  MEDICION: '4.1.1.05',
  RECEPCION: '4.1.1.06',
  CAJERA: '4.1.1.07',
  TELEFONISTA: '4.1.1.08',
} as const;

/**
 * Cuenta agrupadora de cargas sociales (NO imputable, sólo informativa).
 */
export const CUENTA_GASTOS_CARGAS_SOCIALES_AGRUPADORA = '4.1.1.04';

/**
 * Sub-cuentas de cargas sociales (Debe).
 */
export const CUENTAS_GASTOS_CARGAS_SOCIALES = {
  CONTRIB_SEGURIDAD_SOCIAL: '4.1.1.04.01',
  CONTRIB_OBRA_SOCIAL: '4.1.1.04.02',
  ART: '4.1.1.04.03',
  SCVO: '4.1.1.04.04',
} as const;

/**
 * Cuenta de gastos de horas complementarias facturadas.
 * Paulo las reimputa en el sistema contable real.
 */
export const CUENTA_GASTOS_HONORARIOS_HC = '4.1.2.02';

/**
 * Cuentas de PASIVOS — sueldos.
 */
export const CUENTAS_PASIVOS_SUELDOS = {
  SUELDOS_Y_JORNALES_A_PAGAR: '2.1.2.01',
  CARGAS_SOCIALES_A_PAGAR_AGRUPADORA: '2.1.2.02', // No imputable
  SS_A_PAGAR: '2.1.2.02.01', // Aporte 301 + Contrib 351
  OS_A_PAGAR: '2.1.2.02.02', // Aporte 302 + Contrib 352
  ART_A_PAGAR: '2.1.2.02.03',
  SCVO_A_PAGAR: '2.1.2.02.04',
  SINDICATO_A_PAGAR: '2.1.2.03',
} as const;

/**
 * Cuentas de ACTIVOS — las que se usan al cancelar pasivos.
 * No se crean: ya existen en el plan general.
 */
export const CUENTAS_ACTIVOS = {
  CAJA: '1.1.1.01',
  BANCO_SANTANDER_RIO: '1.1.1.03',
  IIBB_RETENCIONES_PERCEPCIONES: '1.1.4.05', // Retenciones SUSS practicadas
} as const;

// ───────────────────────────────────────────────────────────────────────────
// MAPEO ÁREA → CUENTA CONTABLE POR DEFECTO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cuenta contable por defecto al dar de alta un empleado de un área.
 * Se puede sobreescribir manualmente en el formulario si hace falta.
 */
export const AREA_A_CUENTA_DEFAULT: Readonly<Record<AreaEmpleado, string>> = {
  'Administración': CUENTAS_GASTOS_SUELDOS.ADMINISTRACION,
  'Limpieza': CUENTAS_GASTOS_SUELDOS.LIMPIEZA,
  'Cirugías': CUENTAS_GASTOS_SUELDOS.CIRUGIAS,
  'Medición': CUENTAS_GASTOS_SUELDOS.MEDICION,
  'Recepción': CUENTAS_GASTOS_SUELDOS.RECEPCION,
  'Cajera': CUENTAS_GASTOS_SUELDOS.CAJERA,
  'Telefonista': CUENTAS_GASTOS_SUELDOS.TELEFONISTA,
};

/**
 * Devuelve la cuenta contable por defecto para un área. Útil al crear empleado.
 */
export function cuentaDefaultPorArea(area: AreaEmpleado): string {
  return AREA_A_CUENTA_DEFAULT[area];
}

// ───────────────────────────────────────────────────────────────────────────
// LABELS UI
// ───────────────────────────────────────────────────────────────────────────

/**
 * Labels para mostrar el estado del empleado en la UI.
 */
export const LABEL_ESTADO_EMPLEADO: Readonly<Record<EstadoEmpleado, string>> = {
  activo: 'Activo',
  inactivo: 'Baja',
};

/**
 * Labels para mostrar el tipo de documento.
 */
export const LABEL_TIPO_DOCUMENTO: Readonly<Record<TipoDocumento, string>> = {
  DNI: 'DNI',
  LE: 'L.E.',
  LC: 'L.C.',
  PASAPORTE: 'Pasaporte',
  CI: 'C.I.',
};

/**
 * Labels para la modalidad de contratación (mostrados tal cual).
 */
export const LABEL_MODALIDAD_CONTRATACION: Readonly<
  Record<ModalidadContratacion, string>
> = {
  'LCT por tiempo indeterminado': 'LCT por tiempo indeterminado',
  'LCT plazo fijo': 'LCT plazo fijo',
  'LCT eventual': 'LCT eventual',
  'LCT a tiempo parcial': 'LCT a tiempo parcial',
};

// ───────────────────────────────────────────────────────────────────────────
// COLORES POR ÁREA — para badges, gráficos, tags
// ───────────────────────────────────────────────────────────────────────────

/**
 * Clases Tailwind para badges de área (fondo + texto + borde).
 * Mantener la paleta del proyecto (blue/green/yellow/red/gray).
 */
export interface ColorArea {
  bg: string;
  text: string;
  border: string;
  /** Valor hex para usar en gráficos / PDFs */
  hex: string;
}

export const COLORES_AREA: Readonly<Record<AreaEmpleado, ColorArea>> = {
  'Administración': {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    hex: '#2563eb',
  },
  'Recepción': {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    hex: '#16a34a',
  },
  'Medición': {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    hex: '#ca8a04',
  },
  'Cajera': {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    hex: '#4f46e5',
  },
  'Telefonista': {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
    hex: '#db2777',
  },
  'Limpieza': {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
    hex: '#4b5563',
  },
  'Cirugías': {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    hex: '#dc2626',
  },
};

/**
 * Devuelve la clase tailwind compuesta para un badge de área.
 * Ejemplo: `<span className={badgeAreaClassName('Recepción')}>...</span>`
 */
export function badgeAreaClassName(area: AreaEmpleado): string {
  const c = COLORES_AREA[area];
  return `${c.bg} ${c.text} ${c.border} border px-2 py-0.5 rounded-md text-xs font-medium`;
}

// ───────────────────────────────────────────────────────────────────────────
// ESTADOS DE LIQUIDACIÓN DEL MES (declarativos — el tipo se cierra en Fase 2)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Los 7 estados del flujo del mes. Avance automático hasta CONCILIADO; manual
 * desde ASIENTO_GENERADO en adelante. Documentado en CLAUDE.md.
 */
export const ESTADOS_MES_ORDEN = [
  'VACIO',
  'MINUTA_EN_CARGA',
  'MINUTA_COMPLETA',
  'F931_CARGADO',
  'CONCILIADO',
  'ASIENTO_GENERADO',
  'CERRADO',
] as const;

export type EstadoMesKey = (typeof ESTADOS_MES_ORDEN)[number];

/**
 * Labels en español para cada estado del mes.
 */
export const LABEL_ESTADO_MES: Readonly<Record<EstadoMesKey, string>> = {
  VACIO: 'Vacío',
  MINUTA_EN_CARGA: 'Minuta en carga',
  MINUTA_COMPLETA: 'Minuta completa',
  F931_CARGADO: 'F.931 cargado',
  CONCILIADO: 'Conciliado',
  ASIENTO_GENERADO: 'Asiento generado',
  CERRADO: 'Cerrado',
};

/**
 * Color (Tailwind) para el chip de estado del mes. Pensado para la grilla
 * anual del dashboard.
 */
export const COLOR_ESTADO_MES: Readonly<Record<EstadoMesKey, ColorArea>> = {
  VACIO: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-200',
    hex: '#6b7280',
  },
  MINUTA_EN_CARGA: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    hex: '#ca8a04',
  },
  MINUTA_COMPLETA: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    hex: '#2563eb',
  },
  F931_CARGADO: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    hex: '#4f46e5',
  },
  CONCILIADO: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    hex: '#0891b2',
  },
  ASIENTO_GENERADO: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    hex: '#16a34a',
  },
  CERRADO: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
    hex: '#1f2937',
  },
};

// ───────────────────────────────────────────────────────────────────────────
// MESES — labels en español
// ───────────────────────────────────────────────────────────────────────────

export const MESES_LABEL: readonly string[] = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const MESES_LABEL_CORTO: readonly string[] = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

/**
 * Devuelve el label del mes (1-12). Para mes fuera de rango devuelve string vacío.
 */
export function mesLabel(mes: number, corto = false): string {
  if (mes < 1 || mes > 12) return '';
  return (corto ? MESES_LABEL_CORTO : MESES_LABEL)[mes - 1];
}

/**
 * Devuelve "Mes Año" (ej: "Mayo 2026").
 */
export function periodoLabel(anio: number, mes: number): string {
  return `${mesLabel(mes)} ${anio}`;
}

// ───────────────────────────────────────────────────────────────────────────
// REGLAS DE CONCILIACIÓN (Fase 3, dejadas declaradas para reuso temprano)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Umbral material para marcar una diferencia como residual (requiere
 * justificación manual). Si la diferencia supera el monto O el porcentaje,
 * se considera residual.
 */
export const UMBRAL_DIFERENCIA_MATERIAL = {
  MONTO_ABS: 100, // pesos
  PORCENTAJE: 0.005, // 0,5%
} as const;

/**
 * Diferencias menores a este umbral se ignoran (se asumen redondeos).
 */
export const UMBRAL_REDONDEO_ABS = 1; // pesos

// ───────────────────────────────────────────────────────────────────────────
// PERMISO DE REPORTES DEL MÓDULO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Clave del permiso que habilita la sección Reportes del módulo Sueldos.
 * Sólo el rol Auditor (Paulo) la tiene asignada.
 */
export const PERMISO_REPORTES_SUELDOS = 'sueldos:reportes';
