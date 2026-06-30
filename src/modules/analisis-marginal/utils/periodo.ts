// ============================================================
// PERÍODO — Análisis Marginal (selección mes / multi-mes)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Helper PURO (sin dependencias, sin React, sin Supabase) que modela el período
// del Análisis Marginal como un RANGO de meses (anioDesde,mesDesde) → (anioHasta,
// mesHasta). Todos los presets (mes, bimestre, trimestre, semestre, año, rango
// personalizado) se reducen a ese rango canónico, que es lo que consumen los
// hooks de datos (useEvolucionMensual ya trabaja así).
//
// Responsabilidades:
//   - presetARango(): traduce un preset + año + índice a un RangoPeriodo.
//   - mesesDelRango(): expande el rango a la lista de meses (para sumar mes a mes).
//   - rangoAnterior(): período inmediato anterior de IGUAL longitud (comparativo).
//   - formatearPeriodo(): etiqueta para título de página / PDF ("1er Semestre 2026").
//   - slugPeriodo(): identificador para nombre de archivo del PDF.
//   - subOpciones(): opciones secundarias del selector según el preset.
// ============================================================

export type PresetPeriodo = 'mes' | 'bimestre' | 'trimestre' | 'semestre' | 'anio' | 'personalizado';

export interface RangoPeriodo {
  preset: PresetPeriodo;
  anioDesde: number;
  mesDesde: number; // 1-12
  anioHasta: number;
  mesHasta: number; // 1-12
}

export interface Mes {
  anio: number;
  mes: number; // 1-12
}

// ------------------------------------------------------------
// Constantes de nombres
// ------------------------------------------------------------
export const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const MESES_ABREV = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const;

const ORDINALES: Record<number, string> = {
  1: '1er', 2: '2º', 3: '3er', 4: '4º', 5: '5º', 6: '6º',
};

// ------------------------------------------------------------
// Aritmética de meses (índice absoluto = anio*12 + (mes-1))
// ------------------------------------------------------------
function aIndice(anio: number, mes: number): number {
  return anio * 12 + (mes - 1);
}

function deIndice(indice: number): Mes {
  const anio = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return { anio, mes };
}

function sumarMeses(anio: number, mes: number, delta: number): Mes {
  return deIndice(aIndice(anio, mes) + delta);
}

/** Cantidad de meses que abarca el rango (inclusive). */
export function cantidadMeses(r: RangoPeriodo): number {
  return aIndice(r.anioHasta, r.mesHasta) - aIndice(r.anioDesde, r.mesDesde) + 1;
}

// ------------------------------------------------------------
// Construcción de rangos
// ------------------------------------------------------------

/** Rango de un solo mes. */
export function rangoMesUnico(anio: number, mes: number): RangoPeriodo {
  return { preset: 'mes', anioDesde: anio, mesDesde: mes, anioHasta: anio, mesHasta: mes };
}

/**
 * Traduce un preset + año + índice a un RangoPeriodo.
 * - mes: indice = mes (1-12)
 * - bimestre: indice 1-6 (ene-feb, mar-abr, …)
 * - trimestre: indice 1-4 (T1..T4)
 * - semestre: indice 1-2 (S1=ene-jun, S2=jul-dic)
 * - anio: indice ignorado (todo el año)
 * - personalizado: usar el rango directo; este helper devuelve el año completo como base.
 */
export function presetARango(preset: PresetPeriodo, anio: number, indice = 1): RangoPeriodo {
  switch (preset) {
    case 'mes':
      return { preset, anioDesde: anio, mesDesde: indice, anioHasta: anio, mesHasta: indice };
    case 'bimestre': {
      const mesDesde = (indice - 1) * 2 + 1;
      return { preset, anioDesde: anio, mesDesde, anioHasta: anio, mesHasta: mesDesde + 1 };
    }
    case 'trimestre': {
      const mesDesde = (indice - 1) * 3 + 1;
      return { preset, anioDesde: anio, mesDesde, anioHasta: anio, mesHasta: mesDesde + 2 };
    }
    case 'semestre': {
      const mesDesde = (indice - 1) * 6 + 1;
      return { preset, anioDesde: anio, mesDesde, anioHasta: anio, mesHasta: mesDesde + 5 };
    }
    case 'anio':
      return { preset, anioDesde: anio, mesDesde: 1, anioHasta: anio, mesHasta: 12 };
    case 'personalizado':
    default:
      return { preset: 'personalizado', anioDesde: anio, mesDesde: 1, anioHasta: anio, mesHasta: 12 };
  }
}

/** Normaliza un rango personalizado (ordena desde/hasta si vinieran invertidos). */
export function rangoPersonalizado(
  anioDesde: number, mesDesde: number, anioHasta: number, mesHasta: number,
): RangoPeriodo {
  const a = aIndice(anioDesde, mesDesde);
  const b = aIndice(anioHasta, mesHasta);
  const [ini, fin] = a <= b ? [a, b] : [b, a];
  const d = deIndice(ini);
  const h = deIndice(fin);
  return { preset: 'personalizado', anioDesde: d.anio, mesDesde: d.mes, anioHasta: h.anio, mesHasta: h.mes };
}

/** Expande el rango a la lista de meses (para sumar mes a mes). */
export function mesesDelRango(r: RangoPeriodo): Mes[] {
  const ini = aIndice(r.anioDesde, r.mesDesde);
  const fin = aIndice(r.anioHasta, r.mesHasta);
  const out: Mes[] = [];
  for (let i = ini; i <= fin; i++) out.push(deIndice(i));
  return out;
}

/**
 * Período inmediato anterior de IGUAL longitud (comparativo, Opción A).
 * Ej.: 1er semestre 2026 → 2º semestre 2025; T2-2026 → T1-2026; año 2026 → 2025.
 */
export function rangoAnterior(r: RangoPeriodo): RangoPeriodo {
  const n = cantidadMeses(r);
  const desde = sumarMeses(r.anioDesde, r.mesDesde, -n);
  const hasta = sumarMeses(r.anioDesde, r.mesDesde, -1);
  return {
    preset: r.preset,
    anioDesde: desde.anio, mesDesde: desde.mes,
    anioHasta: hasta.anio, mesHasta: hasta.mes,
  };
}

// ------------------------------------------------------------
// Etiquetas
// ------------------------------------------------------------

/** Etiqueta del período para título de página / PDF. */
export function formatearPeriodo(r: RangoPeriodo): string {
  const n = cantidadMeses(r);

  // Un solo mes: siempre "Mes Año", sin importar el preset.
  if (n === 1) return `${MESES_NOMBRE[r.mesDesde - 1]} ${r.anioDesde}`;

  switch (r.preset) {
    case 'anio':
      return `Año ${r.anioDesde}`;
    case 'semestre': {
      const idx = Math.floor((r.mesDesde - 1) / 6) + 1;
      return `${ORDINALES[idx]} Semestre ${r.anioDesde}`;
    }
    case 'trimestre': {
      const idx = Math.floor((r.mesDesde - 1) / 3) + 1;
      return `${ORDINALES[idx]} Trimestre ${r.anioDesde}`;
    }
    case 'bimestre':
      return `Bimestre ${MESES_ABREV[r.mesDesde - 1]}–${MESES_ABREV[r.mesHasta - 1]} ${r.anioDesde}`;
    default:
      // Personalizado / fallback: "May a Jun 2026" o "Oct 2025 a Mar 2026".
      return r.anioDesde === r.anioHasta
        ? `${MESES_ABREV[r.mesDesde - 1]} a ${MESES_ABREV[r.mesHasta - 1]} ${r.anioDesde}`
        : `${MESES_ABREV[r.mesDesde - 1]} ${r.anioDesde} a ${MESES_ABREV[r.mesHasta - 1]} ${r.anioHasta}`;
  }
}

/** Identificador del período para nombre de archivo del PDF (sin espacios). */
export function slugPeriodo(r: RangoPeriodo): string {
  const dd = `${r.anioDesde}-${String(r.mesDesde).padStart(2, '0')}`;
  if (cantidadMeses(r) === 1) return dd;
  const hh = `${r.anioHasta}-${String(r.mesHasta).padStart(2, '0')}`;
  return `${dd}_a_${hh}`;
}

// ------------------------------------------------------------
// Opciones del selector (para la UI del MarginalLayout)
// ------------------------------------------------------------

export interface SubOpcion {
  indice: number;
  label: string;
}

/** Opciones secundarias según el preset (qué bimestre/trimestre/semestre/mes). */
export function subOpciones(preset: PresetPeriodo): SubOpcion[] {
  switch (preset) {
    case 'mes':
      return MESES_NOMBRE.map((nombre, i) => ({ indice: i + 1, label: nombre }));
    case 'bimestre':
      return Array.from({ length: 6 }, (_, i) => ({
        indice: i + 1,
        label: `${MESES_ABREV[i * 2]}–${MESES_ABREV[i * 2 + 1]}`,
      }));
    case 'trimestre':
      return Array.from({ length: 4 }, (_, i) => ({ indice: i + 1, label: `${ORDINALES[i + 1]} Trimestre` }));
    case 'semestre':
      return [
        { indice: 1, label: '1er Semestre (Ene–Jun)' },
        { indice: 2, label: '2º Semestre (Jul–Dic)' },
      ];
    case 'anio':
    case 'personalizado':
    default:
      return [];
  }
}

export const PRESETS: { value: PresetPeriodo; label: string }[] = [
  { value: 'mes', label: 'Mes' },
  { value: 'bimestre', label: 'Bimestre' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'semestre', label: 'Semestre' },
  { value: 'anio', label: 'Año' },
  { value: 'personalizado', label: 'Personalizado' },
];
