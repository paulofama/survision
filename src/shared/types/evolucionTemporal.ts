// ============================================
// TYPES: Evolución Temporal del Análisis Marginal
// Sistema de Gestión Integral - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/types/evolucionTemporal.ts
// ============================================
// v1.0 — Tabla matricial mensual con filas expandibles
//        Alcance: desde enero 2026 en adelante
// ============================================

// ============================================
// ALIAS TEMPORAL
// ============================================

/**
 * Identificador de mes en formato 'YYYY-MM'.
 * Ejemplo: '2026-01', '2026-04'.
 * Se usa como key en todos los registros indexados por mes.
 */
export type Mes = string;

// ============================================
// TIPO DE FILA (gobierna el render y los estilos)
// ============================================

export type TipoFila =
  // Bloques principales (Nivel 0 — banda de color)
  | 'facturacion'
  | 'costos_variables'
  | 'margen_contribucion'
  | 'costos_fijos'
  | 'costos_no_identificados'
  | 'resultado_operativo'
  // Niveles de detalle (sin banda)
  | 'subgrupo'       // Nivel 1 — ej: "Consultas", "Honorarios", "Sueldos y Cargas"
  | 'detalle'        // Nivel 2 — ej: prestación específica, categoría CF
  // Último nivel: el dato atómico. Se carga bajo demanda (lazy).
  | 'comprobante'    // un comprobante / atención / prestación individual
  | 'nota'           // fila informativa (ej: "esto viene del módulo Sueldos")
  | 'diferencia';    // fila de descuadre entre el detalle y su total

// ============================================
// FILA (unidad de render de la tabla)
// ============================================

export interface FilaEvolucion {
  /** Id estable para React keys. Ejemplo: 'facturacion.consultas.exoftalmologia' */
  id: string;
  tipo: TipoFila;
  /** Etiqueta que se muestra en la columna de concepto */
  label: string;
  /** Nivel jerárquico. 0 = banda, 1 = subgrupo, 2 = detalle, 3 = agrupación, 4 = atención individual */
  nivel: 0 | 1 | 2 | 3 | 4;
  /** Si tiene hijos y se puede colapsar */
  expandible: boolean;
  /**
   * La fila se abre cargando sus hijos bajo demanda (no vienen en `hijos`).
   * Lo consume la página para disparar `useEvolucionDetalle` al expandir.
   */
  detalleLazy?: {
    /** Bloque al que pertenece — determina de dónde salen los hijos. */
    bloque: BloqueDetalle;
    /** Clave estable de la agrupación (categoría, segmento+prestación, etc.). */
    clave: string;
    /** Etiqueta, para mensajes de error y de cuadratura. */
    label: string;
  };
  /** Montos indexados por mes. Si el mes no existe, se renderiza 0 */
  valores: Record<Mes, number>;
  /** Suma de todos los meses visibles */
  total: number;
  /** Promedio mensual (excluye el mes en curso) */
  promedioMensual: number;
  /** Hijos (si expandible = true) */
  hijos?: FilaEvolucion[];
  /** Flags opcionales para UI */
  metadata?: {
    /** True si la prestación NO tiene receta cargada */
    sinReceta?: boolean;
    /** True si el valor es una estimación, no un cálculo exacto */
    esEstimado?: boolean;
    /** True si corresponde a erogaciones sin clasificar */
    sinClasificar?: boolean;
    /** True si es un subtotal o total (render en negrita) */
    esSubtotal?: boolean;
    /** Segmento al que pertenece la fila (si aplica) */
    segmento?: 'Consultas' | 'Estudios' | 'Cirugias';
    /** Texto completo para el tooltip, cuando el label se trunca. */
    tituloCompleto?: string;
    /** Proveedor / obra social — se usa para el separador visual por grupo. */
    grupo?: string;
    /** True si el importe es negativo (nota de crédito, devolución). */
    esNegativo?: boolean;
  };
}

/**
 * Bloques que admiten apertura al detalle atómico. El nivel donde aparece ese
 * detalle NO es el mismo en todos: en costos fijos la categoría es nivel 1 y el
 * comprobante nivel 2; en facturación hay un nivel más (segmento → prestación →
 * obra social). Por eso se identifica por bloque y no por profundidad.
 */
export type BloqueDetalle =
  | 'costos_fijos'          // → comprobantes de erogaciones_clasificacion
  | 'costos_variables'      // → prestaciones (costo calculado, no hay comprobante)
  | 'facturacion'           // → obras sociales de una prestación
  | 'no_identificados'      // → prestaciones sin receta
  | 'modulo_sueldos'        // → no tiene detalle: se muestra una nota
  /**
   * Nivel 4: las atenciones una por una (paciente, fecha, importe). Es el
   * fondo del pozo — abajo de una atención ya no hay nada que abrir.
   * La clave viene compuesta: `práctica␟obra social` (ver SEP_CLAVE).
   */
  | 'atenciones';

// ============================================
// ADVERTENCIAS (banner superior)
// ============================================

export type TipoAdvertencia =
  | 'sin_cf'                          // El mes no tiene costos fijos cargados
  | 'baja_cobertura_receta'           // > 20% de facturación sin receta
  | 'erogaciones_sin_clasificar'      // Hay erogaciones en 'sin_clasificar'
  | 'mes_incompleto'                  // El mes es el actual (en curso)
  | 'sin_datos'                       // No se pudieron cargar datos del mes
  | 'error_fetch';                    // Error de red al traer el mes

export interface AdvertenciaMensual {
  mes: Mes;
  tipo: TipoAdvertencia;
  mensaje: string;
  /** Severidad para pintar el banner */
  severidad: 'info' | 'warning' | 'error';
}

// ============================================
// RESULTADO COMPLETO DEL HOOK
// ============================================

export interface EvolucionMensualData {
  /** Meses visibles en orden ascendente */
  meses: Mes[];
  /** Meses ya cerrados (excluye el mes en curso) */
  mesesCerrados: Mes[];
  /** Mes actual (si está dentro del rango) — se renderiza diferente */
  mesEnCurso: Mes | null;
  /** Estructura jerárquica lista para render */
  filas: FilaEvolucion[];
  /** ISO timestamp de última actualización */
  ultimaActualizacion: string;
  /** % de facturación con receta cargada, por mes */
  coberturaReceta: Record<Mes, number>;
  /** Advertencias a mostrar en el banner superior */
  advertencias: AdvertenciaMensual[];
}

// ============================================
// PARÁMETROS DEL HOOK
// ============================================

export interface UseEvolucionMensualParams {
  /** Año de inicio del rango. Default: 2026 */
  anioDesde?: number;
  /** Mes de inicio del rango (1-12). Default: 1 */
  mesDesde?: number;
  /** Año de fin del rango. Default: año actual */
  anioHasta?: number;
  /** Mes de fin del rango (1-12). Default: mes actual */
  mesHasta?: number;
  /** Filtro opcional por segmento */
  segmento?: 'Consultas' | 'Estudios' | 'Cirugias' | null;
  /** Filtro opcional por obra social (sigla) */
  osSigla?: string | null;
  /** Filtro opcional por prestador (nombre) */
  prestador?: string | null;
  /** Cantidad máxima de prestaciones detalle por segmento (default 10) */
  topPrestacionesPorSegmento?: number;
}

// ============================================
// RETORNO DEL HOOK
// ============================================

export interface UseEvolucionMensualReturn {
  data: EvolucionMensualData;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================
// HELPERS DE MES (re-utilizables)
// ============================================

/** Construye un Mes ('2026-04') desde año y mes numérico */
export const toMesKey = (anio: number, mes: number): Mes =>
  `${anio}-${String(mes).padStart(2, '0')}`;

/** Descompone un Mes en año y mes numérico */
export const parseMesKey = (m: Mes): { anio: number; mes: number } => {
  const [a, n] = m.split('-');
  return { anio: Number(a), mes: Number(n) };
};

/** Label corto para mostrar en la tabla. Ej: '2026-04' → 'Abr 26' */
export const labelMesCorto = (m: Mes): string => {
  const { anio, mes } = parseMesKey(m);
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[mes - 1]} ${String(anio).slice(2)}`;
};

/** Genera la lista ordenada de meses entre dos puntos (inclusive) */
export const generarRangoMeses = (
  anioDesde: number, mesDesde: number,
  anioHasta: number, mesHasta: number
): Mes[] => {
  const result: Mes[] = [];
  let a = anioDesde;
  let m = mesDesde;
  while (a < anioHasta || (a === anioHasta && m <= mesHasta)) {
    result.push(toMesKey(a, m));
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return result;
};
