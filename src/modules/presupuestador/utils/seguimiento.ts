// ============================================================
// Seguimiento telefónico de presupuestos — lógica del circuito (pura)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Circuito (independiente del resultado comercial y de la regla "vencido 45d"):
//   entrega -> +3 días hábiles entra a la cola (pendiente_contacto)
//   ronda: hasta 2 llamados; 2 "no atendió" -> habilita WhatsApp
//   +5 días del WhatsApp -> reinicia UNA vez (ronda 2)
//   2da ronda sin contacto -> cierra "sin_respuesta"
//   atendió + encuesta -> "contactado" (sale), salvo rellamada agendada
// Días hábiles: lun-vie (sin feriados en esta versión).
// ============================================================

export type EstadoContacto = 'pendiente_contacto' | 'en_seguimiento' | 'contactado' | 'contactado_whatsapp' | 'sin_respuesta';
export type ResultadoLlamada = 'atendio' | 'no_atendio' | 'whatsapp_enviado';
export type AccionSeguimiento = 'llamar' | 'whatsapp' | 'cerrar';

export interface Seguimiento {
  presupuesto_id: string;
  estado_contacto: EstadoContacto;
  ronda: number;
  intentos_ronda: number;
  whatsapp_enviado_at: string | null;
  rellamada_at: string | null;
  cerrado_at: string | null;
}

export interface PresMin {
  id: string;
  estado: string;
  fecha_entrega?: string | null;
  fecha_creacion: string;
  numero_presupuesto?: string;
  paciente_nombre?: string;
  prestacion_descripcion?: string | null;
  telefono?: string | null;
}

// ── Badges ──
export const ESTADO_CONTACTO_META: Record<EstadoContacto, { label: string; bg: string; text: string; dot: string }> = {
  pendiente_contacto:  { label: 'Pendiente de contacto', bg: 'bg-amber-100',   text: 'text-amber-700', dot: 'bg-amber-500' },
  en_seguimiento:      { label: 'En seguimiento',        bg: 'bg-blue-100',    text: 'text-blue-700',  dot: 'bg-blue-500'  },
  contactado:          { label: 'Contactado',            bg: 'bg-green-100',   text: 'text-green-700', dot: 'bg-green-500' },
  contactado_whatsapp: { label: 'Contactado por WhatsApp', bg: 'bg-teal-100',  text: 'text-teal-700',  dot: 'bg-teal-500'  },
  sin_respuesta:       { label: 'Sin respuesta',         bg: 'bg-gray-200',    text: 'text-gray-600',  dot: 'bg-gray-400'  },
};

// ── Fechas ──
const toISO = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export function hoyISO(): string {
  return toISO(new Date());
}

/** Suma N días hábiles (lun-vie) a una fecha "YYYY-MM-DD". */
export function sumarDiasHabiles(fechaISO: string, n: number): string {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  let added = 0;
  while (added < n) {
    dt.setDate(dt.getDate() + 1);
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return toISO(dt);
}

/** Suma N días de calendario a una fecha "YYYY-MM-DD". */
export function sumarDiasCalendario(fechaISO: string, n: number): string {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toISO(dt);
}

// ── Teléfono (normalización a formato wa.me: 549 + 10 dígitos) ──

/**
 * Normaliza un teléfono argentino al formato de wa.me: `549` + 10 dígitos
 * (código de área + abonado, sin 0 ni 15). Devuelve null si no se puede
 * reducir con confianza a 10 dígitos significativos (input inválido).
 */
export function normalizarTelefonoAR(raw: string | null | undefined): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  // Quitar el "15" de celular ubicado tras el código de área (2 a 4 dígitos).
  if (d.length === 11) {
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === '15') { d = d.slice(0, areaLen) + d.slice(areaLen + 2); break; }
    }
  }
  if (d.length !== 10) return null;
  return '549' + d;
}

// ── Derivación del estado de contacto y de la cola (al vuelo) ──

export interface EstadoCola {
  enCola: boolean;
  accion?: AccionSeguimiento;
  estado: EstadoContacto;
  ronda: number;
  intentos: number;
}

/** Determina el estado de contacto a mostrar y si el presupuesto está en la cola hoy. */
export function derivarSeguimiento(pres: PresMin, seg: Seguimiento | null, hoy: string = hoyISO()): EstadoCola {
  const fechaBase = (pres.fecha_entrega || pres.fecha_creacion || '').slice(0, 10);
  const base = { ronda: seg?.ronda ?? 1, intentos: seg?.intentos_ronda ?? 0 };

  // Solo entregados entran al seguimiento.
  if (pres.estado !== 'entregado') {
    return { enCola: false, estado: seg?.estado_contacto ?? 'pendiente_contacto', ...base };
  }
  // Cerrados.
  if (seg && (seg.estado_contacto === 'contactado' || seg.estado_contacto === 'sin_respuesta')) {
    return { enCola: false, estado: seg.estado_contacto, ...base };
  }
  // Fresco (sin fila de seguimiento): entra a los 3 días hábiles.
  if (!seg) {
    const due = fechaBase ? hoy >= sumarDiasHabiles(fechaBase, 3) : false;
    return { enCola: due, accion: due ? 'llamar' : undefined, estado: 'pendiente_contacto', ronda: 1, intentos: 0 };
  }
  // Rellamada agendada: reaparece esa fecha.
  if (seg.rellamada_at) {
    const due = hoy >= seg.rellamada_at.slice(0, 10);
    return { enCola: due, accion: due ? 'llamar' : undefined, estado: 'en_seguimiento', ...base };
  }
  // WhatsApp enviado: espera 5 días y reintenta (ronda 2) o cierra (si ya es ronda 2).
  if (seg.whatsapp_enviado_at) {
    const reintento = sumarDiasCalendario(seg.whatsapp_enviado_at.slice(0, 10), 5);
    if (hoy >= reintento) {
      if (seg.ronda >= 2) return { enCola: true, accion: 'cerrar', estado: 'sin_respuesta', ...base };
      return { enCola: true, accion: 'llamar', estado: 'en_seguimiento', ronda: 2, intentos: 0 };
    }
    return { enCola: false, estado: 'contactado_whatsapp', ...base };
  }
  // En una ronda, sin WhatsApp: 2 fallos -> habilita WhatsApp; si no, reintento mismo día.
  if (seg.intentos_ronda >= 2) {
    return { enCola: true, accion: 'whatsapp', estado: 'en_seguimiento', ...base };
  }
  return { enCola: true, accion: 'llamar', estado: seg.intentos_ronda > 0 ? 'en_seguimiento' : 'pendiente_contacto', ...base };
}

/** Nuevo estado de la fila de seguimiento tras registrar un intento. */
export function aplicarLlamada(
  seg: Seguimiento | null,
  presId: string,
  resultado: ResultadoLlamada,
  hoy: string = hoyISO(),
  opts: { rellamadaISO?: string | null } = {},
): Omit<Seguimiento, never> {
  let ronda = seg?.ronda ?? 1;
  let intentos = seg?.intentos_ronda ?? 0;
  let whatsapp = seg?.whatsapp_enviado_at ?? null;

  // Entrada a ronda 2 (venimos del reintento post-WhatsApp): reset.
  if (whatsapp && ronda === 1 && hoy >= sumarDiasCalendario(whatsapp.slice(0, 10), 5)) {
    ronda = 2; intentos = 0; whatsapp = null;
  }

  let estado: EstadoContacto = 'en_seguimiento';
  let rellamada: string | null = seg?.rellamada_at ?? null;
  let cerrado: string | null = null;
  const ahora = new Date().toISOString();

  if (resultado === 'no_atendio') {
    intentos += 1;
    rellamada = null; // un intento nuevo limpia una rellamada previa
  } else if (resultado === 'whatsapp_enviado') {
    whatsapp = ahora;
    estado = 'contactado_whatsapp';
  } else {
    // atendió
    if (opts.rellamadaISO) {
      rellamada = opts.rellamadaISO;
      estado = 'en_seguimiento';
    } else {
      estado = 'contactado';
      cerrado = ahora;
    }
  }

  return {
    presupuesto_id: presId,
    estado_contacto: estado,
    ronda,
    intentos_ronda: intentos,
    whatsapp_enviado_at: whatsapp,
    rellamada_at: rellamada,
    cerrado_at: cerrado,
  };
}

// ── Encuesta (preguntas fijas con ramas) ──

export interface Pregunta { clave: string; texto: string; }

/** P1: referencia la práctica y el monto del presupuesto (se rellenan en la UI). */
export const PREGUNTA_INICIAL: Pregunta = { clave: 'reviso', texto: '¿Pudo revisar el presupuesto de {practica} por {monto}?' };

export const RAMA_REVISO: Pregunta[] = [
  { clave: 'detalle_claro',   texto: '¿Le resultó claro el detalle de lo presupuestado?' },
  { clave: 'valor_acorde',    texto: '¿El valor le pareció acorde?' },
  { clave: 'tiene_cobertura', texto: '¿Tiene una cobertura / obra social que quiera aplicar?' },
  { clave: 'consulta_otro',   texto: '¿Está consultando el mismo procedimiento en otro lugar?' },
  { clave: 'nueva_visita',    texto: '¿Le gustaría coordinar una nueva visita con el prestador para sacarse dudas?' },
  { clave: 'coordina_cirugia',texto: '¿Desea coordinar la cirugía / el turno?' },
];

export const RAMA_NO_REVISO: Pregunta[] = [
  { clave: 'tiene_duda', texto: '¿Tiene alguna duda antes de revisar el presupuesto? (anotarla en la nota)' },
  { clave: 'reenviar',   texto: '¿Necesita que le reenviemos el presupuesto (por WhatsApp o mail)?' },
  { clave: 'rellamar',   texto: '¿Le gustaría que lo llamemos nuevamente para conversarlo con más tiempo?' },
];

// ── WhatsApp (wa.me, sin API) ──

function nombrePila(s: string | null | undefined): string {
  const primero = String(s || '').trim().split(/\s+/)[0] || '';
  return primero ? primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase() : 'paciente';
}

/** Mensaje sugerido de WhatsApp, parametrizado con los datos del presupuesto. */
export function mensajeWhatsApp(p: PresMin, operadorNombre: string): string {
  return (
    `Hola ${nombrePila(p.paciente_nombre)}, soy ${operadorNombre || 'el equipo'} del Instituto Dr. Mercado. ` +
    `Lo/la contacto por el presupuesto que le entregamos para ${p.prestacion_descripcion || 'su tratamiento'} ` +
    `(N° ${p.numero_presupuesto || ''}). Si desea alguna aclaración o hacernos algún comentario, ` +
    `no dude en comunicarse con nosotros. ¡Muchas gracias!`
  );
}

/** URL wa.me con el mensaje precargado, o null si no hay teléfono. */
export function urlWhatsApp(p: PresMin, operadorNombre: string): string | null {
  if (!p.telefono) return null;
  return `https://wa.me/${p.telefono}?text=${encodeURIComponent(mensajeWhatsApp(p, operadorNombre))}`;
}
