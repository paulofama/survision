// ============================================================
// PARÁMETROS DE COMISIONES — núcleo isomórfico
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Qué valores regían en una fecha dada. Lo usan el job del servidor (para
// devengar con la tasa que estaba vigente el día de la cirugía) y la pantalla
// de parametrización (para mostrar qué rige hoy y qué va a regir).
//
// Los parámetros NO se editan: cambiar un valor AGREGA una fila con una
// vigencia nueva. Recalcular el pasado tiene que ser imposible, porque el
// pasado ya se pagó. Es la misma lección que dejó `honorarios_config`, que
// tenía un UNIQUE por segmento y por eso reescribía la historia cada vez que
// alguien tocaba un porcentaje (migraciones 54 y 55).
// ============================================================

/** Nombre de la clave en la tabla -> nombre del campo que espera el cálculo. */
export const CLAVES = {
  tasa_comision: 'tasaComision',
  participantes_pct: 'participantesPct',
  recuperador_pct: 'recuperadorPct',
  dias_para_frio: 'diasParaFrio',
  ventana_recupero_dias: 'ventanaRecuperoDias',
};

/** Todo en cero: lo que rige cuando no se configuró nada. */
export const PARAMETROS_VACIOS = {
  tasaComision: 0,
  participantesPct: 0,
  recuperadorPct: 0,
  diasParaFrio: 0,
  ventanaRecuperoDias: 0,
};

const soloFecha = (v) => String(v ?? '').slice(0, 10);

/**
 * La fecha calendaria ARGENTINA de un timestamp.
 *
 * Cortar el ISO con slice(0,10) devuelve el día UTC: a las 21:30 de Mendoza
 * eso ya es el día siguiente. Sobre una llamada de seguimiento, ese error de
 * un día mete o saca el contacto de la ventana de recupero — o sea, mueve
 * plata de una persona a otra.
 */
export function fechaLocal(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/**
 * 'YYYY-MM-DD' desde el YYYYMMDD que guarda la columna numérica.
 *
 * `comisiones_parametros.valor` es numeric porque casi todos los parámetros
 * son porcentajes; la fecha de vigencia del régimen viaja ahí como entero.
 * No es lindo, pero es explícito y no admite una fecha a medias.
 */
export function fechaDesdeNumero(n) {
  const s = String(Math.trunc(Number(n) || 0));
  if (s.length !== 8) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) ? null : iso;
}

/**
 * Los parámetros que regían en `fecha`: para cada clave, la fila con la
 * vigencia más nueva que no sea posterior a esa fecha.
 *
 * Lo que no tiene fila vigente vale CERO, y con `tasaComision` en cero el
 * cálculo no devenga nada. Es deliberado: "todavía no lo configuraron" no se
 * puede confundir nunca con "es gratis".
 */
export function parametrosVigentes(filas, fecha) {
  const out = { ...PARAMETROS_VACIOS };
  if (!fecha) return out;

  const mejor = {};
  for (const f of filas || []) {
    const campo = CLAVES[f?.clave];
    if (!campo) continue;
    const v = soloFecha(f.vigencia_desde);
    if (!v || v > fecha) continue;
    if (!mejor[campo] || v > mejor[campo].v) mejor[campo] = { v, valor: Number(f.valor) };
  }
  for (const [campo, m] of Object.entries(mejor)) {
    if (Number.isFinite(m.valor)) out[campo] = m.valor;
  }
  return out;
}

/**
 * Desde qué día un presupuesto ENTREGADO entra al régimen, o null si la
 * Dirección todavía no lo encendió.
 *
 * Si hubiera más de una fila (no debería), gana la más vieja: el régimen
 * empezó cuando empezó, y una fila nueva no puede dejar gente afuera
 * retroactivamente.
 */
export function fechaVigenciaRegimen(filas) {
  const fechas = (filas || [])
    .filter((f) => f?.clave === 'fecha_vigencia_regimen')
    .map((f) => fechaDesdeNumero(f.valor))
    .filter(Boolean)
    .sort();
  return fechas[0] || null;
}

/**
 * ¿Está el régimen en condiciones de devengar?
 *
 * Hacen falta DOS actos explícitos de la Dirección —la fecha de vigencia y
 * una tasa— más al menos una persona marcada. Con cualquiera de los tres
 * faltando, el sistema no acumula deuda con nadie.
 */
export function estadoRegimen(filas, { comisionables = 0 } = {}) {
  const desde = fechaVigenciaRegimen(filas);
  if (!desde) return { activo: false, motivo: 'El régimen no está vigente: falta el parámetro fecha_vigencia_regimen' };
  if (!(filas || []).some((f) => f?.clave === 'tasa_comision')) {
    return { activo: false, desde, motivo: 'No hay tasa_comision cargada: no se devenga nada' };
  }
  if (!comisionables) return { activo: false, desde, motivo: 'Nadie está marcado como comisionable' };
  return { activo: true, desde };
}
