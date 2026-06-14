// ============================================================
// TYPES - MÓDULO INFORMES DE GESTIÓN
// Instituto Dr. Mercado - Sistema de Costos
// ============================================================
// CAMBIO: Se agregaron acumActual y acumAnterior en las secciones
// porObraSocial, porPrestador y porPractica para alimentar
// las tablas comparativas anuales del PDF.
// ============================================================

// ---- Períodos y Filtros ----

export interface PeriodoInforme {
  mes: number;       // 1-12
  anio: number;      // 2024, 2025, etc.
  label: string;     // "Enero 2025"
  periodoGeclisa: string; // "202501" formato AAAAMM
}

export interface FiltrosInforme {
  periodoActual: PeriodoInforme;
  periodoAnterior: PeriodoInforme;     // Mes anterior automático
  acumuladoActual: {                    // Ene→mes actual del año actual
    desde: string;
    hasta: string;
    label: string;
  };
  acumuladoAnterior: {                  // Ene→mismo mes del año anterior
    desde: string;
    hasta: string;
    label: string;
  };
}

// ---- Métricas Base ----

export interface MetricasResumen {
  totalAtenciones: number;
  totalPracticas: number;
  totalFacturado: number;
  totalHonorarios: number;
  margenBruto: number;
  margenBrutoPct: number;
  ticketPromedio: number;
  pacientesUnicos: number;
  practicasPorAtencion: number;
}

export interface MetricasComparativas {
  actual: MetricasResumen;
  anterior: MetricasResumen;
  variacion: MetricasResumen;       // Diferencia absoluta
  variacionPct: MetricasResumen;    // Diferencia porcentual
}

// ---- Desglose por Obra Social ----

export interface DesglosePorOS {
  osId: number;
  osNombre: string;
  osSigla: string;
  atenciones: number;
  practicas: number;
  facturado: number;
  honorarios: number;
  margen: number;
  margenPct: number;
  participacionPct: number;  // % del total
}

// ---- Desglose por Prestador ----

export interface DesglosePorPrestador {
  preId: number;
  preNombre: string;
  atenciones: number;
  practicas: number;
  honorarios: number;
  facturado: number;          // Agregado para comparativas acumuladas
  facturadoAsociado: number;
  productividad: number;    // prácticas/día hábil
  esSocio: boolean;
}

// ---- Desglose por Práctica ----

export interface DesglosePorPractica {
  nomId: number;
  nomCod: string;
  nomNombre: string;
  cantidad: number;
  facturado: number;
  honorarios: number;
  margen: number;
  margenPct: number;
  participacionPct: number;
  ticketPromedio: number;
}

// ---- Desglose por Tipo (Consulta/Estudio/Cirugía) ----

export interface DesglosePorTipo {
  tipo: 'Consulta' | 'Estudio' | 'Cirugía' | 'Otro';
  cantidad: number;
  facturado: number;
  honorarios: number;
  margen: number;
  participacionPct: number;
}

// ---- Estructura completa del informe ----

export interface DatosInformeGestion {
  // Metadata
  generadoEn: string;
  periodo: PeriodoInforme;
  filtros: FiltrosInforme;

  // Sección 1: Resumen Ejecutivo
  resumenMensual: MetricasComparativas;      // mes actual vs mes anterior
  resumenAcumulado: MetricasComparativas;    // acum actual vs acum anterior

  // Sección 2: Desglose por OS
  porObraSocial: {
    mesActual: DesglosePorOS[];
    mesAnterior: DesglosePorOS[];
    acumActual: DesglosePorOS[];             // ✅ NUEVO - Acumulado año actual
    acumAnterior: DesglosePorOS[];           // ✅ NUEVO - Acumulado año anterior
  };

  // Sección 3: Desglose por Prestador
  porPrestador: {
    mesActual: DesglosePorPrestador[];
    mesAnterior: DesglosePorPrestador[];
    acumActual: DesglosePorPrestador[];      // ✅ NUEVO - Acumulado año actual
    acumAnterior: DesglosePorPrestador[];    // ✅ NUEVO - Acumulado año anterior
  };

  // Sección 4: Desglose por Práctica (Top 20)
  porPractica: {
    mesActual: DesglosePorPractica[];
    mesAnterior: DesglosePorPractica[];
    acumActual: DesglosePorPractica[];       // ✅ NUEVO - Acumulado año actual
    acumAnterior: DesglosePorPractica[];     // ✅ NUEVO - Acumulado año anterior
  };

  // Sección 5: Desglose por Tipo
  porTipo: {
    mesActual: DesglosePorTipo[];
    mesAnterior: DesglosePorTipo[];
  };
}

// ---- Estados del componente ----

export type EstadoInforme = 'idle' | 'cargando' | 'listo' | 'generando-pdf' | 'error';

export interface InformeGestionState {
  estado: EstadoInforme;
  datos: DatosInformeGestion | null;
  error: string | null;
  progreso: number; // 0-100 para barra de progreso
}

// ---- Configuración de informes disponibles ----

export interface TipoInforme {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;     // nombre del ícono Lucide
  disponible: boolean;
  proximamente?: boolean;
}

// Lista de informes del panel
export const INFORMES_DISPONIBLES: TipoInforme[] = [
  {
    id: 'gestion-mensual',
    nombre: 'Informe de Gestión Mensual',
    descripcion: 'Análisis completo del mes con comparativa vs mes anterior y acumulado año anterior.',
    icono: 'FileBarChart',
    disponible: true,
  },
  {
    id: 'rentabilidad',
    nombre: 'Informe de Rentabilidad',
    descripcion: 'Análisis de márgenes por práctica, prestador y obra social.',
    icono: 'TrendingUp',
    disponible: false,
    proximamente: true,
  },
  {
    id: 'productividad',
    nombre: 'Informe de Productividad',
    descripcion: 'Análisis de productividad por prestador y servicio.',
    icono: 'Activity',
    disponible: false,
    proximamente: true,
  },
  {
    id: 'facturacion',
    nombre: 'Informe de Facturación',
    descripcion: 'Detalle de facturación por obra social y período.',
    icono: 'Receipt',
    disponible: false,
    proximamente: true,
  },
];

// ---- Helpers ----

export const MESES_NOMBRE: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

export const crearPeriodo = (mes: number, anio: number): PeriodoInforme => ({
  mes,
  anio,
  label: `${MESES_NOMBRE[mes]} ${anio}`,
  periodoGeclisa: `${anio}${String(mes).padStart(2, '0')}`,
});

export const crearFiltros = (mes: number, anio: number): FiltrosInforme => {
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anioAnt = mes === 1 ? anio - 1 : anio;

  return {
    periodoActual: crearPeriodo(mes, anio),
    periodoAnterior: crearPeriodo(mesAnt, anioAnt),
    acumuladoActual: {
      desde: `${anio}-01-01`,
      hasta: `${anio}-${String(mes).padStart(2, '0')}-${new Date(anio, mes, 0).getDate()}`,
      label: `Ene-${MESES_NOMBRE[mes].substring(0, 3)} ${anio}`,
    },
    acumuladoAnterior: {
      desde: `${anio - 1}-01-01`,
      hasta: `${anio - 1}-${String(mes).padStart(2, '0')}-${new Date(anio - 1, mes, 0).getDate()}`,
      label: `Ene-${MESES_NOMBRE[mes].substring(0, 3)} ${anio - 1}`,
    },
  };
};
