// ============================================================
// Textos legales versionados — consentimiento informado
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
//
// `presupuestos_textos_legales` (migración 25) guarda el consentimiento por
// clave y versión. La regla que le da sentido al versionado: UNA VERSIÓN NO SE
// EDITA NUNCA. El texto que firmó un paciente en agosto tiene que poder leerse
// en dos años tal como estaba en agosto; si se edita la fila, esa prueba
// desaparece. Cargar un cambio = versión nueva.
//
// El alta y la activación van por RPC (migración 51) porque activar son dos
// escrituras —bajar la vigente y subir la nueva— y hay un índice único que
// admite una sola vigente por clave: sueltas desde el navegador, si la segunda
// falla la clave queda SIN vigente.
// ============================================================

import supabase from '@shared/lib/supabase';

export const CLAVE_CONSENTIMIENTO = 'consentimiento_catarata';

export interface SeccionTexto {
  titulo: string;
  cuerpo: string;
}

export interface VersionTexto {
  id: string;
  clave: string;
  version: number;
  contenido: SeccionTexto[];
  vigente: boolean;
  es_placeholder: boolean;
  notas: string | null;
  created_at: string;
  created_by: string | null;
}

// ------------------------------------------------------------
// Lógica pura
// ------------------------------------------------------------

/** Una sección sin título ni cuerpo no aporta nada y ensucia el documento. */
export const seccionVacia = (s: SeccionTexto): boolean =>
  !String(s.titulo || '').trim() && !String(s.cuerpo || '').trim();

/** Saca las secciones vacías y recorta, que es lo que se guarda. */
export const limpiarSecciones = (secciones: SeccionTexto[]): SeccionTexto[] =>
  secciones
    .filter((s) => !seccionVacia(s))
    .map((s) => ({ titulo: String(s.titulo || '').trim(), cuerpo: String(s.cuerpo || '').trim() }));

export function validarTexto(secciones: SeccionTexto[]): string | null {
  const limpias = limpiarSecciones(secciones);
  if (limpias.length === 0) return 'El texto no puede estar vacío.';
  if (limpias.some((s) => !s.cuerpo)) return 'Hay una sección con título y sin texto.';
  return null;
}

/** Mueve una sección una posición. Devuelve un arreglo nuevo. */
export function mover(secciones: SeccionTexto[], desde: number, delta: number): SeccionTexto[] {
  const hasta = desde + delta;
  if (desde < 0 || desde >= secciones.length || hasta < 0 || hasta >= secciones.length) return secciones;
  const copia = [...secciones];
  const [x] = copia.splice(desde, 1);
  copia.splice(hasta, 0, x);
  return copia;
}

/**
 * Qué enumera el artículo 5 de la Ley 26.529 (Derechos del Paciente) como
 * contenido del consentimiento informado. Está acá como CHECKLIST A LA VISTA de
 * quien redacta, no como validación automática: el sistema no puede decidir si
 * un párrafo explica bien un riesgo.
 *
 * Los incisos g) y h) —agregados por la Ley 26.742— son sobre enfermedad
 * irreversible y cuidados paliativos, así que no aplican a una catarata.
 *
 * Verificar la redacción final con quien la escriba: esto es una guía de qué
 * temas no pueden faltar, no asesoramiento legal.
 */
export const REQUISITOS_LEY_26529: { inciso: string; texto: string }[] = [
  { inciso: 'a', texto: 'Su estado de salud.' },
  { inciso: 'b', texto: 'El procedimiento propuesto, con especificación de los objetivos perseguidos.' },
  { inciso: 'c', texto: 'Los beneficios esperados del procedimiento.' },
  { inciso: 'd', texto: 'Los riesgos, molestias y efectos adversos previsibles.' },
  { inciso: 'e', texto: 'Los procedimientos alternativos, con sus riesgos, beneficios y perjuicios.' },
  { inciso: 'f', texto: 'Las consecuencias previsibles de NO realizar el procedimiento, ni los alternativos.' },
];

// ------------------------------------------------------------
// Carga y escritura
// ------------------------------------------------------------

export async function cargarVersiones(clave = CLAVE_CONSENTIMIENTO): Promise<VersionTexto[]> {
  const { data, error } = await supabase
    .from('presupuestos_textos_legales')
    .select('id,clave,version,contenido,vigente,es_placeholder,notas,created_at,created_by')
    .eq('clave', clave)
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as VersionTexto[];
}

/**
 * Guarda una versión NUEVA. Nunca pisa una existente: la numeración la hace la
 * base, y si `activar` es true la deja vigente en la misma transacción.
 */
export async function guardarVersion(args: {
  clave?: string;
  secciones: SeccionTexto[];
  notas?: string;
  esPlaceholder?: boolean;
  activar?: boolean;
  creadoPor?: string;
}): Promise<number> {
  const error = validarTexto(args.secciones);
  if (error) throw new Error(error);
  const { data, error: e } = await supabase.rpc('app_guardar_texto_legal', {
    p_clave: args.clave ?? CLAVE_CONSENTIMIENTO,
    p_contenido: limpiarSecciones(args.secciones),
    p_notas: args.notas ?? null,
    p_es_placeholder: !!args.esPlaceholder,
    p_activar: !!args.activar,
    p_creado_por: args.creadoPor ?? null,
  });
  if (e) throw new Error(e.message);
  return Number(data);
}

export async function activarVersion(version: number, clave = CLAVE_CONSENTIMIENTO): Promise<void> {
  const { error } = await supabase.rpc('app_activar_texto_legal', {
    p_clave: clave,
    p_version: version,
  });
  if (error) throw new Error(error.message);
}
