// ============================================================
// Recordatorios de Turnos por WhatsApp — armado de mensajes y helpers
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Lógica pura (sin React) de la sección Turnos:
//   - Los 3 mensajes de recordatorio con sus placeholders.
//   - El formateo del prestador a "Dr. Apellido".
//   - El link wa.me (click-to-chat) que ya usa el botón existente.
//
// El envío sigue siendo por wa.me: se abre WhatsApp con el mensaje precargado y
// la secretaria toca enviar. Lo "automático" es que cada mensaje se ofrece en su
// momento (ver AgendaTurnosPage) y una sola vez por turno (dedup en el hook).
// ============================================================

import { TurnoFuturo } from '../hooks/useTurnosFuturos';

// ------------------------------------------------------------
// Tipos de recordatorio (momentos del ciclo del turno)
// ------------------------------------------------------------

export type TipoRecordatorio = 'inicial' | 'previo' | 'final';

// ------------------------------------------------------------
// Helpers de fecha / texto (sin Date donde importa, para evitar corrimiento TZ)
// ------------------------------------------------------------

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "YYYY-MM-DD" -> "dd/mm/aaaa". */
export function formatFechaISO(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** "YYYY-MM-DD" -> "martes 30/06" (día de semana + dd/mm). */
export function formatFechaLarga(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  // Mediodía local: evita que el día de semana se corra por timezone.
  const dt = new Date(a, m - 1, d, 12, 0, 0);
  const dia = DIAS_SEMANA[dt.getDay()];
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Hoy como "YYYY-MM-DD" en hora local. */
export function hoyISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Suma días a una fecha "YYYY-MM-DD" y devuelve "YYYY-MM-DD". */
export function sumarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + dias, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** "H:MM"/"HH:MM" -> minutos desde medianoche (NaN si no parsea). */
export function horaAMinutos(hora: string): number {
  const [h, m] = (hora || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

/** Minutos desde medianoche de la hora local actual. */
export function ahoraEnMinutos(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/** "APELLIDO, Nombre Segundo" -> "Nombre" (primer nombre de pila, capitalizado). */
export function nombrePila(paciente: string): string {
  const partes = (paciente || '').split(',');
  const pila = (partes[1] || partes[0] || '').trim();
  const primero = pila.split(/\s+/)[0] || '';
  return primero ? titleCase(primero) : 'paciente';
}

// ------------------------------------------------------------
// Prestador -> "Dr. Apellido"
// ------------------------------------------------------------
// En GECLISA pre_nombre viene "APELLIDO Nombre(s)" (apellido primero, en
// mayúsculas). Tomamos SOLO el apellido = primer token; si es una partícula de
// apellido compuesto ("de", "del", "la"...), sumamos el siguiente token.
// No hay dato de género en la fuente -> se usa "Dr." por defecto (regla dada).

const PARTICULAS_APELLIDO = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'SAN', 'SANTA', 'DA', 'DI', 'DELLA', 'VAN', 'VON', 'MC', 'MAC', 'LE']);

export function formatearPrestador(preNombre: string | null | undefined): string {
  const limpio = (preNombre || '').trim();
  if (!limpio || limpio.toUpperCase() === 'S/D') return 'el profesional';

  const tokens = limpio.split(/\s+/);
  let apellido = tokens[0];
  if (tokens.length > 1 && PARTICULAS_APELLIDO.has(tokens[0].toUpperCase())) {
    apellido = `${tokens[0]} ${tokens[1]}`;
  }
  return `Dr. ${titleCase(apellido)}`;
}

// ------------------------------------------------------------
// Armado de los 3 mensajes (placeholders: paciente / prestador / fecha / hora)
// ------------------------------------------------------------

/** Metadatos de cada tipo para la UI (título/subtítulo de su ventana). */
export const RECORDATORIO_META: Record<TipoRecordatorio, { titulo: string; descripcion: string }> = {
  inicial: { titulo: 'Al sacar el turno', descripcion: 'Confirmación — turnos sin el saludo inicial enviado' },
  previo: { titulo: 'Un día antes', descripcion: 'Recordatorio con pedido de confirmación (turnos de mañana)' },
  final: { titulo: 'Tres horas antes', descripcion: 'Aviso final (turnos de hoy dentro de las próximas 3 h)' },
};

/** Construye el texto exacto del mensaje según el tipo, con los datos del turno. */
export function construirMensaje(tipo: TipoRecordatorio, turno: TurnoFuturo): string {
  const paciente = nombrePila(turno.paciente);
  const prestador = formatearPrestador(turno.prestador);
  const fecha = formatFechaLarga(turno.fecha);
  const hora = turno.hora;

  switch (tipo) {
    case 'inicial':
      return (
        `Hola ${paciente}, ¡tu turno quedó confirmado! 🗓️\n` +
        `Te esperamos el ${fecha} a las ${hora} hs con el ${prestador}.\n` +
        `Si necesitás reprogramar o cancelar, avisanos con anticipación. ¡Gracias!`
      );
    case 'previo':
      return (
        `Hola ${paciente}, te recordamos que mañana ${fecha} a las ${hora} hs tenés tu turno con el ${prestador}.\n` +
        `Por favor confirmá tu asistencia respondiendo este mensaje. ¡Te esperamos!`
      );
    case 'final':
      return (
        `Hola ${paciente}, tu turno con el ${prestador} es hoy a las ${hora} hs. ⏰\n` +
        `Te pedimos llegar unos minutos antes. ¡Nos vemos pronto!`
      );
  }
}

/** Link wa.me con el mensaje del tipo precargado, o null si el turno no tiene teléfono. */
export function buildWhatsAppUrl(turno: TurnoFuturo, tipo: TipoRecordatorio): string | null {
  if (!turno.telefono_norm) return null;
  return `https://wa.me/${turno.telefono_norm}?text=${encodeURIComponent(construirMensaje(tipo, turno))}`;
}
