// ============================================
// Médicos del Presupuestador: lista única (TRANSITORIA)
// Sistema de Gestión Integral · Survisión S.A.
// ============================================
//
// `presupuestos.cirujano` (y el derivador de `datos_completos`) guardan un
// código estable ('dr_oliva'), no el ID de GECLISA. Antes la lista vivía
// escrita dentro de Presupuestador.tsx y cada pantalla que mostraba el médico
// armaba el nombre por su cuenta: al sumar a la Dra. Arias había que acordarse
// de todos los lugares, y el Análisis decía "Dr. Oliva".
//
// Ahora todo lo que elige o muestra un médico del Presupuestador lee de acá:
// selectores de cirujano y derivador, PDF de emisión, Análisis e informes.
//
// SOLUCIÓN TRANSITORIA. El destino es la tabla `prestadores` de Supabase como
// única fuente, sincronizada desde GECLISA. `geclisaPreId` es la clave de ese
// pase: con él cada código de acá se vincula a su fila (`prestadores.
// geclisa_pre_id`, UNIQUE) sin duplicar a nadie ni romper los presupuestos ya
// guardados. Por eso todo médico nuevo entra con su ID de GECLISA.
// ============================================

export interface MedicoPresupuesto {
  /** Código guardado en `presupuestos.cirujano`. No cambiar: rompe históricos. */
  value: string;
  /** Nombre que se muestra en pantalla y en los PDF. */
  label: string;
  /** `Prestadores.pre_id` de GECLISA (= `prestadores.geclisa_pre_id`). */
  geclisaPreId: number;
}

export const MEDICOS_PRESUPUESTO: readonly MedicoPresupuesto[] = [
  { value: 'sd', label: 'S/D', geclisaPreId: 0 },
  { value: 'survision', label: 'Survision', geclisaPreId: 1 },
  { value: 'dr_mahia', label: 'Dr. Pablo Mahia', geclisaPreId: 4 },
  { value: 'dr_musa', label: 'Dr. Carlos Musa', geclisaPreId: 3 },
  { value: 'dr_roca', label: 'Dr. Leandro Roca', geclisaPreId: 14 },
  { value: 'dr_mercado', label: 'Dr. Jorge Mercado', geclisaPreId: 2 },
  { value: 'dr_oliva', label: 'Dra. Ignacia Oliva', geclisaPreId: 17 },
  { value: 'dr_arias', label: 'Dra. Francisca Arias', geclisaPreId: 18 },
];

/**
 * Derivadores: los mismos médicos más el Dr. López, que deriva pero no opera.
 * Su ID es el de `EntidadesDerivantes` (5): no es prestador en GECLISA.
 */
export const DERIVADORES_PRESUPUESTO: readonly { value: string; label: string }[] = [
  { value: '', label: 'Sin derivador' },
  ...MEDICOS_PRESUPUESTO.map(({ value, label }) => ({ value, label })),
  { value: 'dr_lopez', label: 'Dr. Jorge Lopez' },
];

/**
 * Nombre a mostrar para un código de cirujano o derivador. Un código que no
 * está en la lista se muestra tal cual, para que se note y se agregue.
 */
export function nombreMedicoPresupuesto(codigo: string | null | undefined): string {
  if (!codigo) return 'Sin prestador';
  return DERIVADORES_PRESUPUESTO.find((m) => m.value === codigo)?.label ?? codigo;
}
