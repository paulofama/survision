// ============================================================
// Informe mensual de presupuestos — cálculo
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// QUÉ ES
// ------
// El ranking de presupuestadoras por monto convertido, con los cortes que
// pidió Paulo: cobertura, cirujano y tiempo a la práctica. Es PURO: recibe las
// filas que devuelve `informe_presupuestos_datos()` (migración 81) y arma todo.
// La pantalla y el PDF leen de acá, así que muestran el mismo número.
//
// DEFINICIONES (decididas con Paulo, 30/10/2026)
// ----------------------------------------------
//   · CONVERTIDO = match confirmado contra GECLISA, no "practicado". Hay
//     practicados marcados a mano que GECLISA no respalda: no suman en ningún
//     número y salen listados aparte para revisarlos (migración 80).
//   · MES = el de la cirugía, con la fecha de GECLISA. Un mes cerrado no cambia
//     después. La tasa de conversión se mide aparte, por cohorte de entrega.
//   · MONTO = neto que paga el paciente, sin IVA. La cobertura de la obra
//     social va como columna informativa: la cobra la clínica igual, no la
//     "vende" la presupuestadora.
//   · OBRA SOCIAL = el presupuesto descontó cobertura. El texto del campo no
//     sirve: hay afiliados a PAMI u OSDE que pagaron todo como particulares.
//   · DÍAS A LA PRÁCTICA = de la entrega (o la creación, si no se registró) a
//     la cirugía. Más de la mitad se opera en la primera semana: llegan con la
//     cirugía decidida. Por eso el ranking muestra cuánto del monto viene de
//     ahí, para no leer igual vender en una semana que recuperar a los dos
//     meses.
//   · ACEPTADO se registra desde julio de 2026. Antes no es cero: es "no hay
//     dato", y se devuelve null.
//   · ANULADO no cuenta en nada. CANCELADO no cuenta como entregado.
// ============================================================

import { mediana } from '@modules/presupuestador/utils/informeSeguimiento';
import { nombreMedicoPresupuesto } from '@shared/utils/medicosPresupuesto';

// ── Entradas ────────────────────────────────────────────────────────────────

/** Una fila de `informe_presupuestos_datos()`. Fechas 'YYYY-MM-DD'. */
export interface PresupuestoInforme {
  id: string;
  numero: string;
  /** Entrega del presupuesto; si no se registró, su creación. */
  fecha_base: string;
  estado: string;
  resultado: string | null;
  fecha_resultado: string | null;
  administrativa: string | null;
  cirujano: string | null;
  paciente: string;
  prestacion: string | null;
  neto: number;
  cobertura: number;
  obra_social: string | null;
  /** Fecha de la cirugía en GECLISA (match confirmado). null = no convertido. */
  fecha_conversion: string | null;
  /** Fecha cargada en el presupuesto (a mano o por el cruce). */
  fecha_practica: string | null;
}

export interface UsuarioInforme {
  username: string;
  nombre: string | null;
}

export interface EntradaInformePresupuestos {
  anio: number;
  /** 1-12 */
  mes: number;
  presupuestos: PresupuestoInforme[];
  usuarios: UsuarioInforme[];
  /** Hoy, para marcar las cohortes que todavía no maduraron. */
  hoy: Date;
}

// ── Salidas ─────────────────────────────────────────────────────────────────

export interface CantidadMonto {
  cantidad: number;
  neto: number;
}

export interface ResumenMes {
  convertidos: CantidadMonto;
  /** null: el mes es anterior al registro de aceptaciones. */
  aceptados: CantidadMonto | null;
  /** Aceptados sin operar al cierre del mes. null como `aceptados`. */
  cartera: CantidadMonto | null;
  entregados: CantidadMonto;
}

export interface FilaRanking {
  clave: string;
  nombre: string;
  cirugias: number;
  neto: number;
  /** % del monto convertido del mes. */
  pctTotal: number;
  /** % de su monto que se operó en los primeros 7 días. */
  pctPrimeraSemana: number;
  medianaDias: number | null;
  /** null: el mes es anterior al registro de aceptaciones. */
  aceptados: number | null;
  cobertura: number;
}

export interface FilaCirujano {
  clave: string;
  nombre: string;
  cirugias: number;
  neto: number;
  pctTotal: number;
  medianaDias: number | null;
}

export interface FilaCobertura {
  nombre: string;
  cirugias: number;
  neto: number;
  cobertura: number;
  pctTotal: number;
}

export interface FilaTramo {
  tramo: string;
  cirugias: number;
  neto: number;
  pctNeto: number;
}

export interface FilaCohorte {
  anio: number;
  mes: number;
  label: string;
  entregados: number;
  convertidos: number;
  /** % de los entregados que ya se operaron (a hoy). */
  tasa: number;
  netoConvertido: number;
  /** Menos de 60 días desde el fin del mes: la tasa todavía sube. */
  enCurso: boolean;
}

export interface FilaCartera {
  numero: string;
  paciente: string;
  prestacion: string;
  presupuestadora: string;
  cirujano: string;
  fechaAceptacion: string;
  diasDesdeAceptacion: number;
  neto: number;
}

export interface FilaSinRespaldo {
  numero: string;
  paciente: string;
  prestacion: string;
  presupuestadora: string;
  cirujano: string;
  fechaPractica: string;
  neto: number;
}

export interface InformePresupuestos {
  anio: number;
  mes: number;
  label: string;
  labelAnterior: string;
  resumen: ResumenMes;
  resumenAnterior: ResumenMes;
  ranking: FilaRanking[];
  cirujanos: FilaCirujano[];
  obraSocial: FilaCobertura;
  particular: FilaCobertura;
  porObraSocial: FilaCobertura[];
  tramos: FilaTramo[];
  cohortes: FilaCohorte[];
  cartera: FilaCartera[];
  sinRespaldo: FilaSinRespaldo[];
}

// ── Constantes ──────────────────────────────────────────────────────────────

/** Primer día con aceptaciones registradas (circuito quirúrgico). */
export const ACEPTACION_DESDE = '2026-07-01';

/** Una cohorte con menos de esto desde su fin de mes todavía está en curso. */
export const DIAS_MADURACION = 60;

/** Cantidad de cohortes que muestra el informe, terminando en el mes elegido. */
export const CANTIDAD_COHORTES = 6;

export const TRAMOS: readonly { tramo: string; hasta: number }[] = [
  { tramo: '0 a 7 días', hasta: 7 },
  { tramo: '8 a 30 días', hasta: 30 },
  { tramo: '31 a 60 días', hasta: 60 },
  { tramo: 'Más de 60 días', hasta: Infinity },
];

export const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ── Fechas ('YYYY-MM-DD', sin zona: son días) ──────────────────────────────

const pad = (n: number): string => String(n).padStart(2, '0');

/** Primer y último día del mes. */
export const rangoMes = (anio: number, mes: number): { desde: string; hasta: string } => {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return { desde: `${anio}-${pad(mes)}-01`, hasta: `${anio}-${pad(mes)}-${pad(ultimo)}` };
};

/** Mes anterior (o posterior con delta positivo). */
export const moverMes = (anio: number, mes: number, delta: number): { anio: number; mes: number } => {
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
};

const diaUTC = (s: string): number => {
  const [a, m, d] = s.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Días entre dos fechas 'YYYY-MM-DD' (b - a). */
export const diasEntre = (a: string, b: string): number => Math.round((diaUTC(b) - diaUTC(a)) / 86_400_000);

const enRango = (f: string | null, r: { desde: string; hasta: string }): boolean =>
  !!f && f.slice(0, 10) >= r.desde && f.slice(0, 10) <= r.hasta;

const hoyISO = (hoy: Date): string => `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;

export const labelMes = (anio: number, mes: number): string => `${MESES_LARGO[mes - 1]} ${anio}`;

/** dd/mm/aaaa */
export const fmtFecha = (s: string | null): string => {
  if (!s) return '—';
  const [a, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

// ── Reglas ──────────────────────────────────────────────────────────────────

const cuenta = (p: PresupuestoInforme): boolean => p.resultado !== 'ANULADO';

/** Días de la entrega a la cirugía. Nunca negativo: la entrega puede cargarse tarde. */
export const diasAPractica = (p: PresupuestoInforme): number =>
  p.fecha_conversion ? Math.max(0, diasEntre(p.fecha_base, p.fecha_conversion)) : 0;

export const tramoDe = (dias: number): string => (TRAMOS.find((t) => dias <= t.hasta) ?? TRAMOS[TRAMOS.length - 1]).tramo;

const pct = (parte: number, total: number): number => (total > 0 ? (parte / total) * 100 : 0);

const sumar = (ps: PresupuestoInforme[]): CantidadMonto => ({
  cantidad: ps.length,
  neto: ps.reduce((a, p) => a + (Number(p.neto) || 0), 0),
});

/** Convertidos en el mes: cirugía confirmada en GECLISA con fecha en el mes. */
const convertidosDe = (ps: PresupuestoInforme[], r: { desde: string; hasta: string }) =>
  ps.filter((p) => cuenta(p) && enRango(p.fecha_conversion, r));

/**
 * Aceptados sin operar al cierre del mes: aceptados hasta esa fecha, sin
 * cirugía confirmada hasta esa fecha, y que no se dieron por practicados a mano
 * antes. Un cancelado no es cartera.
 */
const carteraAl = (ps: PresupuestoInforme[], hasta: string) =>
  ps.filter((p) =>
    p.resultado === 'ACEPTADO'
    && p.estado !== 'cancelado'
    && !!p.fecha_resultado && p.fecha_resultado <= hasta
    && !(p.fecha_conversion && p.fecha_conversion <= hasta)
    && !(p.estado === 'practicado' && !p.fecha_conversion && p.fecha_practica && p.fecha_practica <= hasta));

const resumenDe = (ps: PresupuestoInforme[], anio: number, mes: number): ResumenMes => {
  const r = rangoMes(anio, mes);
  const hayAceptacion = r.hasta >= ACEPTACION_DESDE;
  return {
    convertidos: sumar(convertidosDe(ps, r)),
    aceptados: hayAceptacion
      ? sumar(ps.filter((p) => p.resultado === 'ACEPTADO' && enRango(p.fecha_resultado, r)))
      : null,
    cartera: hayAceptacion ? sumar(carteraAl(ps, r.hasta)) : null,
    entregados: sumar(ps.filter((p) => cuenta(p) && p.estado !== 'cancelado' && enRango(p.fecha_base, r))),
  };
};

/** Nombre de la obra social para agrupar: el texto libre trae "Sancor" y "SANCOR". */
const claveOS = (s: string | null): string => (s ?? '').trim().toUpperCase() || '(SIN NOMBRE)';

// ── Cálculo ─────────────────────────────────────────────────────────────────

export function calcularInformePresupuestos(e: EntradaInformePresupuestos): InformePresupuestos {
  const { anio, mes, presupuestos: ps } = e;
  const r = rangoMes(anio, mes);
  const ant = moverMes(anio, mes, -1);
  const hayAceptacion = r.hasta >= ACEPTACION_DESDE;

  const nombreUsuario = new Map(e.usuarios.map((u) => [u.username, u.nombre?.trim() || u.username]));
  const nombrePresupuestadora = (k: string | null): string =>
    (k ? nombreUsuario.get(k) ?? k : 'Sin presupuestadora');

  const conv = convertidosDe(ps, r);
  const totalNeto = conv.reduce((a, p) => a + p.neto, 0);

  // ── Ranking de presupuestadoras ──
  const aceptadosMes = hayAceptacion
    ? ps.filter((p) => p.resultado === 'ACEPTADO' && enRango(p.fecha_resultado, r))
    : [];
  const claves = new Set<string>([
    ...conv.map((p) => p.administrativa ?? ''),
    ...aceptadosMes.map((p) => p.administrativa ?? ''),
  ]);
  const ranking: FilaRanking[] = [...claves].map((k) => {
    const suyos = conv.filter((p) => (p.administrativa ?? '') === k);
    const neto = suyos.reduce((a, p) => a + p.neto, 0);
    const netoSemana = suyos.filter((p) => diasAPractica(p) <= 7).reduce((a, p) => a + p.neto, 0);
    return {
      clave: k,
      nombre: nombrePresupuestadora(k || null),
      cirugias: suyos.length,
      neto,
      pctTotal: pct(neto, totalNeto),
      pctPrimeraSemana: pct(netoSemana, neto),
      medianaDias: mediana(suyos.map(diasAPractica)),
      aceptados: hayAceptacion ? aceptadosMes.filter((p) => (p.administrativa ?? '') === k).length : null,
      cobertura: suyos.reduce((a, p) => a + p.cobertura, 0),
    };
  }).sort((a, b) => b.neto - a.neto || b.cirugias - a.cirugias || a.nombre.localeCompare(b.nombre));

  // ── Cirujanos ──
  const cirujanos: FilaCirujano[] = [...new Set(conv.map((p) => p.cirujano ?? ''))].map((k) => {
    const suyos = conv.filter((p) => (p.cirujano ?? '') === k);
    const neto = suyos.reduce((a, p) => a + p.neto, 0);
    return {
      clave: k,
      nombre: nombreMedicoPresupuesto(k || null),
      cirugias: suyos.length,
      neto,
      pctTotal: pct(neto, totalNeto),
      medianaDias: mediana(suyos.map(diasAPractica)),
    };
  }).sort((a, b) => b.neto - a.neto || b.cirugias - a.cirugias);

  // ── Cobertura ──
  const filaCob = (nombre: string, xs: PresupuestoInforme[]): FilaCobertura => {
    const neto = xs.reduce((a, p) => a + p.neto, 0);
    return { nombre, cirugias: xs.length, neto, cobertura: xs.reduce((a, p) => a + p.cobertura, 0), pctTotal: pct(neto, totalNeto) };
  };
  const conOS = conv.filter((p) => p.cobertura > 0);
  const porOS = new Map<string, PresupuestoInforme[]>();
  for (const p of conOS) {
    const k = claveOS(p.obra_social);
    porOS.set(k, [...(porOS.get(k) ?? []), p]);
  }
  const porObraSocial = [...porOS.entries()]
    .map(([k, xs]) => filaCob(k, xs))
    .sort((a, b) => b.neto - a.neto || b.cirugias - a.cirugias);

  // ── Tramos ──
  const tramos: FilaTramo[] = TRAMOS.map(({ tramo }) => {
    const xs = conv.filter((p) => tramoDe(diasAPractica(p)) === tramo);
    const neto = xs.reduce((a, p) => a + p.neto, 0);
    return { tramo, cirugias: xs.length, neto, pctNeto: pct(neto, totalNeto) };
  });

  // ── Cohortes de entrega ──
  const hoy = hoyISO(e.hoy);
  const cohortes: FilaCohorte[] = [];
  for (let i = CANTIDAD_COHORTES - 1; i >= 0; i--) {
    const c = moverMes(anio, mes, -i);
    const rc = rangoMes(c.anio, c.mes);
    const entregados = ps.filter((p) => cuenta(p) && p.estado !== 'cancelado' && enRango(p.fecha_base, rc));
    const convertidos = entregados.filter((p) => !!p.fecha_conversion);
    cohortes.push({
      anio: c.anio,
      mes: c.mes,
      label: labelMes(c.anio, c.mes),
      entregados: entregados.length,
      convertidos: convertidos.length,
      tasa: pct(convertidos.length, entregados.length),
      netoConvertido: convertidos.reduce((a, p) => a + p.neto, 0),
      enCurso: diasEntre(rc.hasta, hoy) < DIAS_MADURACION,
    });
  }

  // ── Cartera al cierre del mes ──
  const cartera: FilaCartera[] = (hayAceptacion ? carteraAl(ps, r.hasta) : [])
    .map((p) => ({
      numero: p.numero,
      paciente: p.paciente,
      prestacion: p.prestacion ?? '',
      presupuestadora: nombrePresupuestadora(p.administrativa),
      cirujano: nombreMedicoPresupuesto(p.cirujano),
      fechaAceptacion: p.fecha_resultado as string,
      diasDesdeAceptacion: Math.max(0, diasEntre(p.fecha_resultado as string, r.hasta)),
      neto: p.neto,
    }))
    .sort((a, b) => b.diasDesdeAceptacion - a.diasDesdeAceptacion || a.numero.localeCompare(b.numero));

  // ── Practicados a mano sin respaldo, con fecha en el mes ──
  const sinRespaldo: FilaSinRespaldo[] = ps
    .filter((p) => cuenta(p) && p.estado === 'practicado' && !p.fecha_conversion && enRango(p.fecha_practica, r))
    .map((p) => ({
      numero: p.numero,
      paciente: p.paciente,
      prestacion: p.prestacion ?? '',
      presupuestadora: nombrePresupuestadora(p.administrativa),
      cirujano: nombreMedicoPresupuesto(p.cirujano),
      fechaPractica: p.fecha_practica as string,
      neto: p.neto,
    }))
    .sort((a, b) => a.fechaPractica.localeCompare(b.fechaPractica) || a.numero.localeCompare(b.numero));

  return {
    anio,
    mes,
    label: labelMes(anio, mes),
    labelAnterior: labelMes(ant.anio, ant.mes),
    resumen: resumenDe(ps, anio, mes),
    resumenAnterior: resumenDe(ps, ant.anio, ant.mes),
    ranking,
    cirujanos,
    obraSocial: filaCob('Obra social', conOS),
    particular: filaCob('Particular', conv.filter((p) => !(p.cobertura > 0))),
    porObraSocial,
    tramos,
    cohortes,
    cartera,
    sinRespaldo,
  };
}

/** Variación % contra el mes anterior. null si no hay base para comparar. */
export const variacion = (actual: number, anterior: number): number | null =>
  anterior > 0 ? ((actual - anterior) / anterior) * 100 : null;
