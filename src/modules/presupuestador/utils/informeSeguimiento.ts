// ============================================================
// Informe mensual de Seguimiento telefónico — cálculo
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// QUÉ ES
// ------
// El cálculo del informe que se presenta todos los meses. Es PURO: recibe las
// filas crudas y devuelve la estructura completa. La pantalla y el PDF leen de
// acá, así que los dos muestran exactamente el mismo número — que es la regla
// que el módulo de Análisis aprendió a fuerza de informes que discrepaban.
//
// LA TRAMPA DE LA COHORTE
// -----------------------
// Un presupuesto entregado en julio puede operarse en octubre. Contar "cirugías
// de octubre" contra "llamados de octubre" divide peras por naranjas: el
// resultado de octubre viene del trabajo de julio. Por eso hay DOS tableros:
//
//   · ACTIVIDAD DEL MES — lo que hizo el equipo. Se compara mes a mes.
//   · COHORTES — presupuestos entregados en un mes, seguidos a 30/60/90 días.
//
// LA COMPARACIÓN QUE NO HAY QUE HACER
// -----------------------------------
// "Llamados vs no llamados" SIEMPRE va a dar que llamar empeora la conversión,
// porque la cola se llena justamente con los que no convirtieron. Es sesgo de
// selección, no un hallazgo. Por eso acá no existe esa métrica: si alguien la
// quiere, tiene que ser contra presupuestos de antigüedad equivalente.
// ============================================================

import type { Seguimiento } from './seguimiento';

// ── Entradas ────────────────────────────────────────────────────────────────

/** Presupuesto, con lo que el informe necesita. */
export interface PresInforme {
  id: string;
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  prestacion_codigo: string | null;
  prestacion_descripcion: string | null;
  total_final: number | null;
  /** 'entregado' | 'practicado' | 'cancelado'. `practicado` = se operó. */
  estado: string;
  fecha_creacion: string;
  /**
   * Cuándo se operó. Es lo que permite medir la ventana de decisión: sin esto,
   * "operados a 90 días" se confundiría con "presupuestos que hoy tienen 90
   * días", que es otra cosa y da siempre cero para las cohortes viejas.
   * Está cargada en el 87% de los practicados.
   */
  fecha_practica?: string | null;
  telefono?: string | null;
}

export interface LlamadaInforme {
  presupuesto_id: string;
  usuario: string | null;
  /** 'telefono' | 'whatsapp' */
  canal: string;
  /** 'atendio' | 'no_atendio' | 'whatsapp_enviado' */
  resultado: string;
  created_at: string;
}

export interface EncuestaInforme {
  presupuesto_id: string;
  usuario: string | null;
  /** 'reviso' | 'no_reviso' */
  rama: string;
  respuestas: Array<{ clave: string; texto?: string; valor: boolean | null; nota?: string }> | null;
  observaciones: string | null;
  created_at: string;
}

export interface EntradaInforme {
  anio: number;
  mes: number;
  presupuestos: PresInforme[];
  seguimientos: Seguimiento[];
  llamadas: LlamadaInforme[];
  encuestas: EncuestaInforme[];
  /** Para poder fijarlo en los tests. Por defecto, ahora. */
  hoy?: Date;
}

// ── Salidas ─────────────────────────────────────────────────────────────────

/**
 * Un indicador con su comparativo.
 *
 * `n` es la cantidad de casos que lo sustenta y NO es decorativo: con menos de
 * `MINIMO_MUESTRA` casos, `confiable` es false y tanto la pantalla como el PDF
 * tienen que mostrar el valor apagado o directamente no mostrarlo. Sin eso, a
 * los tres meses alguien decide una política de precios con cuatro encuestas.
 */
export interface Indicador {
  clave: string;
  label: string;
  /** Valor del mes que se informa. */
  valor: number;
  /** Mismo indicador el mes anterior. null si no hay dato. */
  anterior: number | null;
  /** Variación en puntos porcentuales o en unidades, según `formato`. */
  delta: number | null;
  /** true si subir es bueno. Para pintar el delta. */
  subirEsBueno: boolean;
  formato: 'porcentaje' | 'dias' | 'cantidad' | 'ratio';
  n: number;
  confiable: boolean;
  /** Qué mide, en una línea, para que el informe se explique solo. */
  definicion: string;
}

export interface TramoAntiguedad {
  etiqueta: string;
  cantidad: number;
  monto: number;
}

export interface EscalonEmbudo {
  etiqueta: string;
  cantidad: number;
  monto: number;
  /** % sobre el escalón anterior. null en el primero. */
  retencion: number | null;
}

export interface Cohorte {
  anio: number;
  mes: number;
  etiqueta: string;
  entregados: number;
  monto: number;
  /** Cuántos de la cohorte se operaron dentro de cada ventana. */
  a30: number;
  a60: number;
  a90: number;
  /** Cuántos entraron al circuito. */
  enCircuito: number;
  /** null cuando la ventana todavía no se cumplió: NO es un cero. */
  cerrada90: boolean;
}

export interface FranjaContacto {
  etiqueta: string;
  intentos: number;
  contactos: number;
  tasa: number;
}

export interface Objecion {
  clave: string;
  pregunta: string;
  /** Cuántos respondieron que SÍ. */
  si: number;
  /** Cuántos respondieron que NO. */
  no: number;
  /** Total de encuestas donde la pregunta se respondió. */
  n: number;
  /** Lectura de negocio de la respuesta dominante. */
  lectura: string;
}

export interface Operador {
  usuario: string;
  intentos: number;
  contactos: number;
  encuestas: number;
  tasa: number;
}

export interface PendienteLlamar {
  numero: string;
  paciente: string;
  telefono: string | null;
  practica: string;
  monto: number;
  diasDesdeCreacion: number;
}

/**
 * CUÁNTO TARDA UN PACIENTE EN DECIDIRSE.
 *
 * Es la sección que le da sentido a todo lo demás: si la mediana es 9 días y el
 * circuito llama a los 294, el llamado llega cuando la decisión ya está tomada.
 * Se mide sobre los operados, con `fecha_practica` − `fecha_creacion`.
 */
export interface VentanaDecision {
  n: number;
  medianaDias: number | null;
  dentro30: number;
  dentro60: number;
  dentro90: number;
  pctDentro30: number;
  /** Operados sin `fecha_practica`: no se pueden ubicar en la ventana. */
  sinFecha: number;
}

export interface InformeSeguimiento {
  anio: number;
  mes: number;
  etiquetaPeriodo: string;
  indicadores: Indicador[];
  plataEnRiesgo: { tramos: TramoAntiguedad[]; total: number; cantidad: number };
  embudo: EscalonEmbudo[];
  /** Conversión del mes completo, al margen del circuito. Contexto, no embudo. */
  conversionMes: { operados: number; total: number; tasa: number };
  ventanaDecision: VentanaDecision;
  cohortes: Cohorte[];
  porHora: FranjaContacto[];
  porDiaSemana: FranjaContacto[];
  objeciones: Objecion[];
  operadores: Operador[];
  /** Entregados sin operar que NUNCA entraron al circuito. Con nombre y teléfono. */
  sinSeguimiento: PendienteLlamar[];
  /** En el circuito, sin contacto y con los intentos agotados. */
  perdidosDeSeguimiento: PendienteLlamar[];
  /** Advertencias que el informe imprime: muestras chicas, meses sin datos. */
  advertencias: string[];
}

// ── Constantes ──────────────────────────────────────────────────────────────

/** Debajo de esto, un porcentaje es anécdota. */
export const MINIMO_MUESTRA = 20;

/** Intentos antes de considerar a alguien perdido de seguimiento. */
export const INTENTOS_PARA_PERDIDO = 3;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ── Helpers ─────────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Fecha de una columna `date` o de un timestamp, sin correr el día.
 * Mismo criterio que `aFecha` de shared/utils; ver el bug de las fechas.
 */
const fecha = (s: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? new Date(`${s.trim()}T12:00:00`) : new Date(s);

const dias = (desde: string, hasta: Date): number =>
  Math.round((hasta.getTime() - fecha(desde).getTime()) / 86400000);

const mismoMes = (s: string, anio: number, mes: number): boolean => {
  const d = fecha(s);
  return d.getFullYear() === anio && d.getMonth() + 1 === mes;
};

/** Mediana. Devuelve null con la lista vacía: un 0 mentiría. */
export const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

const pct = (parte: number, total: number): number => (total > 0 ? (parte / total) * 100 : 0);

const mesAnterior = (anio: number, mes: number): { anio: number; mes: number } =>
  mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };

// ── Cálculo ─────────────────────────────────────────────────────────────────

/** Métricas de un mes, para poder compararlo contra otro sin duplicar código. */
function metricasDelMes(e: EntradaInforme, anio: number, mes: number) {
  const { presupuestos, seguimientos, llamadas } = e;
  const enCircuito = new Set(seguimientos.map((s) => s.presupuesto_id));

  // Presupuestos entregados en el mes (el universo que el circuito debería tomar).
  const entregadosMes = presupuestos.filter(
    (p) => p.estado !== 'cancelado' && mismoMes(p.fecha_creacion, anio, mes),
  );
  const captados = entregadosMes.filter((p) => enCircuito.has(p.id));

  // Intentos del mes.
  const intentosMes = llamadas.filter((l) => mismoMes(l.created_at, anio, mes));
  const telefonicos = intentosMes.filter((l) => l.canal === 'telefono');
  const contactos = telefonicos.filter((l) => l.resultado === 'atendio');

  // Tiempo hasta el primer contacto, de los presupuestos contactados en el mes.
  const primerIntento = new Map<string, string>();
  for (const l of [...llamadas].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!primerIntento.has(l.presupuesto_id)) primerIntento.set(l.presupuesto_id, l.created_at);
  }
  const porId = new Map(presupuestos.map((p) => [p.id, p]));
  const latencias: number[] = [];
  for (const [pid, cuando] of primerIntento) {
    if (!mismoMes(cuando, anio, mes)) continue;
    const p = porId.get(pid);
    if (!p) continue;
    latencias.push(dias(p.fecha_creacion, fecha(cuando)));
  }

  return {
    entregados: entregadosMes.length,
    captados: captados.length,
    tasaCaptacion: pct(captados.length, entregadosMes.length),
    intentos: telefonicos.length,
    contactos: contactos.length,
    tasaContacto: pct(contactos.length, telefonicos.length),
    intentosPorContacto: contactos.length > 0 ? telefonicos.length / contactos.length : 0,
    latenciaMediana: mediana(latencias),
    latenciaN: latencias.length,
  };
}

export function calcularInformeSeguimiento(e: EntradaInforme): InformeSeguimiento {
  const hoy = e.hoy ?? new Date();
  const { presupuestos, seguimientos, llamadas, encuestas } = e;
  const advertencias: string[] = [];

  const enCircuito = new Set(seguimientos.map((s) => s.presupuesto_id));
  const segPorId = new Map(seguimientos.map((s) => [s.presupuesto_id, s]));

  const act = metricasDelMes(e, e.anio, e.mes);
  const ant = mesAnterior(e.anio, e.mes);
  const prev = metricasDelMes(e, ant.anio, ant.mes);

  // ── Indicadores ──
  const delta = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : a - b;

  const indicadores: Indicador[] = [
    {
      clave: 'captacion',
      label: 'Tasa de captación',
      valor: act.tasaCaptacion, anterior: prev.entregados ? prev.tasaCaptacion : null,
      delta: delta(act.tasaCaptacion, prev.entregados ? prev.tasaCaptacion : null),
      subirEsBueno: true, formato: 'porcentaje',
      n: act.entregados, confiable: act.entregados >= MINIMO_MUESTRA,
      definicion: 'Presupuestos del mes que ingresaron al circuito de seguimiento.',
    },
    {
      clave: 'latencia',
      label: 'Tiempo al primer contacto',
      valor: act.latenciaMediana ?? 0, anterior: prev.latenciaMediana,
      delta: delta(act.latenciaMediana, prev.latenciaMediana),
      subirEsBueno: false, formato: 'dias',
      n: act.latenciaN, confiable: act.latenciaN > 0,
      definicion: 'Mediana de días entre el presupuesto y el primer intento de contacto.',
    },
    {
      clave: 'contacto',
      label: 'Tasa de contacto efectivo',
      valor: act.tasaContacto, anterior: prev.intentos ? prev.tasaContacto : null,
      delta: delta(act.tasaContacto, prev.intentos ? prev.tasaContacto : null),
      subirEsBueno: true, formato: 'porcentaje',
      n: act.intentos, confiable: act.intentos >= MINIMO_MUESTRA,
      definicion: 'Llamadas telefónicas en las que el paciente atendió.',
    },
    {
      clave: 'eficiencia',
      label: 'Intentos por contacto logrado',
      valor: act.intentosPorContacto, anterior: prev.contactos ? prev.intentosPorContacto : null,
      delta: delta(act.intentosPorContacto, prev.contactos ? prev.intentosPorContacto : null),
      subirEsBueno: false, formato: 'ratio',
      n: act.intentos, confiable: act.contactos > 0,
      definicion: 'Cuántas llamadas cuesta hablar con un paciente.',
    },
    {
      clave: 'actividad',
      label: 'Intentos realizados',
      valor: act.intentos, anterior: prev.intentos,
      delta: delta(act.intentos, prev.intentos),
      subirEsBueno: true, formato: 'cantidad',
      n: act.intentos, confiable: true,
      definicion: 'Llamadas telefónicas hechas en el mes.',
    },
  ];

  // ── Intención: de los contactados, cuántos dijeron que coordinan ──
  const encuestasMes = encuestas.filter((x) => mismoMes(x.created_at, e.anio, e.mes));
  const coordina = encuestasMes.filter((x) =>
    (x.respuestas || []).some((r) => r.clave === 'coordina_cirugia' && r.valor === true)).length;
  indicadores.push({
    clave: 'intencion',
    label: 'Tasa de intención',
    valor: pct(coordina, encuestasMes.length), anterior: null, delta: null,
    subirEsBueno: true, formato: 'porcentaje',
    n: encuestasMes.length, confiable: encuestasMes.length >= MINIMO_MUESTRA,
    definicion: 'Contactados que dijeron querer coordinar la cirugía.',
  });

  // ── Plata en riesgo: entregado sin operar, por antigüedad ──
  const sinOperar = presupuestos.filter((p) => p.estado === 'entregado');
  const TRAMOS: Array<[string, number, number]> = [
    ['0 a 30 días', 0, 30], ['31 a 90 días', 31, 90],
    ['91 a 180 días', 91, 180], ['181 a 365 días', 181, 365], ['Más de 365 días', 366, Infinity],
  ];
  const tramos: TramoAntiguedad[] = TRAMOS.map(([etiqueta, min, max]) => {
    const dentro = sinOperar.filter((p) => {
      const d = dias(p.fecha_creacion, hoy);
      return d >= min && d <= max;
    });
    return { etiqueta, cantidad: dentro.length, monto: dentro.reduce((a, p) => a + num(p.total_final), 0) };
  });

  // ── Embudo del mes ──
  const entregadosMes = presupuestos.filter(
    (p) => p.estado !== 'cancelado' && mismoMes(p.fecha_creacion, e.anio, e.mes));
  const montoDe = (ps: PresInforme[]) => ps.reduce((a, p) => a + num(p.total_final), 0);
  const captadosMes = entregadosMes.filter((p) => enCircuito.has(p.id));
  const conIntento = new Set(llamadas.map((l) => l.presupuesto_id));
  const intentadosMes = captadosMes.filter((p) => conIntento.has(p.id));
  const contactadosIds = new Set(
    llamadas.filter((l) => l.resultado === 'atendio').map((l) => l.presupuesto_id));
  const contactadosMes = intentadosMes.filter((p) => contactadosIds.has(p.id));
  const encuestadosIds = new Set(encuestas.map((x) => x.presupuesto_id));
  const encuestadosMes = contactadosMes.filter((p) => encuestadosIds.has(p.id));

  const armarEmbudo = (pasos: Array<[string, PresInforme[]]>): EscalonEmbudo[] =>
    pasos.map(([etiqueta, ps], i) => ({
      etiqueta, cantidad: ps.length, monto: montoDe(ps),
      retencion: i === 0 ? null : pct(ps.length, pasos[i - 1][1].length),
    }));

  // CADA ESCALÓN ES SUBCONJUNTO DEL ANTERIOR. El último son los operados
  // ENTRE LOS ENCUESTADOS, no los operados del mes: si se pusieran todos, el
  // embudo mostraría un paso que crece (450% del anterior en septiembre) y
  // daría a entender que el circuito produjo cirugías que no tocó nunca.
  const embudo = armarEmbudo([
    ['Presupuestos del mes', entregadosMes],
    ['Ingresaron al circuito', captadosMes],
    ['Con algún intento', intentadosMes],
    ['Contactados', contactadosMes],
    ['Encuestados', encuestadosMes],
    ['Operados de los encuestados', encuestadosMes.filter((p) => p.estado === 'practicado')],
  ]);

  // La conversión del mes entero va aparte: es contexto, no un paso del embudo.
  const operadosMes = entregadosMes.filter((p) => p.estado === 'practicado');
  const conversionMes = {
    operados: operadosMes.length,
    total: entregadosMes.length,
    tasa: pct(operadosMes.length, entregadosMes.length),
  };

  // ── Ventana de decisión: cuánto tarda el paciente en operarse ──
  const operadosTodos = presupuestos.filter((p) => p.estado === 'practicado');
  const demoras = operadosTodos
    .filter((p) => p.fecha_practica)
    .map((p) => dias(p.fecha_creacion, fecha(p.fecha_practica as string)))
    // Negativos: presupuesto cargado DESPUÉS de operar. No es una demora.
    .filter((d) => d >= 0);
  const dentro = (v: number) => demoras.filter((d) => d <= v).length;
  const ventanaDecision: VentanaDecision = {
    n: demoras.length,
    medianaDias: mediana(demoras),
    dentro30: dentro(30), dentro60: dentro(60), dentro90: dentro(90),
    pctDentro30: pct(dentro(30), demoras.length),
    sinFecha: operadosTodos.length - demoras.length,
  };

  // ── Cohortes: las últimas 6, medidas a 30/60/90 días ──
  const cohortes: Cohorte[] = [];
  for (let i = 5; i >= 0; i--) {
    let a = e.anio, m = e.mes - i;
    while (m <= 0) { m += 12; a -= 1; }
    const dela = presupuestos.filter((p) => p.estado !== 'cancelado' && mismoMes(p.fecha_creacion, a, m));
    // Operado DENTRO de la ventana: se mide con la fecha en que se operó, no
    // con la antigüedad de hoy. Con la antigüedad, toda cohorte de más de 90
    // días daba cero, que es justo al revés de lo que pasa.
    const operadosEn = (ventana: number) =>
      dela.filter((p) => {
        if (p.estado !== 'practicado' || !p.fecha_practica) return false;
        const d = dias(p.fecha_creacion, fecha(p.fecha_practica));
        return d >= 0 && d <= ventana;
      }).length;
    // Fin del mes de la cohorte + 90 días: si todavía no pasó, la ventana no cerró.
    const finMes = new Date(a, m, 0, 12);
    cohortes.push({
      anio: a, mes: m, etiqueta: `${MESES[m - 1].slice(0, 3)} ${a}`,
      entregados: dela.length, monto: montoDe(dela),
      a30: operadosEn(30), a60: operadosEn(60), a90: operadosEn(90),
      enCircuito: dela.filter((p) => enCircuito.has(p.id)).length,
      cerrada90: hoy.getTime() >= finMes.getTime() + 90 * 86400000,
    });
  }

  // ── Contactabilidad por hora y por día de semana (histórico, no sólo el mes) ──
  const tel = llamadas.filter((l) => l.canal === 'telefono');
  const agrupar = (clave: (d: Date) => number, etiqueta: (k: number) => string): FranjaContacto[] => {
    const m = new Map<number, { intentos: number; contactos: number }>();
    for (const l of tel) {
      const k = clave(new Date(l.created_at));
      const x = m.get(k) ?? { intentos: 0, contactos: 0 };
      x.intentos++;
      if (l.resultado === 'atendio') x.contactos++;
      m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, x]) => ({
      etiqueta: etiqueta(k), intentos: x.intentos, contactos: x.contactos,
      tasa: pct(x.contactos, x.intentos),
    }));
  };
  const porHora = agrupar((d) => d.getHours(), (h) => `${String(h).padStart(2, '0')}:00`);
  const porDiaSemana = agrupar((d) => d.getDay(), (k) => DIAS[k]);

  // ── Mapa de objeciones ──
  const LECTURAS: Record<string, { pregunta: string; lectura: string }> = {
    detalle_claro: { pregunta: '¿Le resultó claro el detalle?', lectura: 'Si predomina el NO, el problema es cómo se comunica el presupuesto.' },
    valor_acorde: { pregunta: '¿El valor le pareció acorde?', lectura: 'Si predomina el NO, el problema es precio o financiación: no se arregla llamando más.' },
    tiene_cobertura: { pregunta: '¿Tiene cobertura para aplicar?', lectura: 'Si predomina el SÍ, hay margen para gestionar la obra social y destrabar.' },
    consulta_otro: { pregunta: '¿Consulta en otro lugar?', lectura: 'Si predomina el SÍ, es competencia: gana el que llama primero.' },
    nueva_visita: { pregunta: '¿Quiere una nueva visita?', lectura: 'Si predomina el SÍ, el paciente no rechaza: tiene dudas. Se convierte con un turno.' },
    coordina_cirugia: { pregunta: '¿Desea coordinar la cirugía?', lectura: 'Es la intención de compra. El resto del informe existe para mover esta línea.' },
    tiene_duda: { pregunta: '¿Tiene dudas antes de revisar?', lectura: 'Dudas previas: el presupuesto no se explica solo.' },
    reenviar: { pregunta: '¿Necesita que se lo reenviemos?', lectura: 'Si predomina el SÍ, hay un problema de entrega, no de precio.' },
    rellamar: { pregunta: '¿Prefiere que lo llamemos de nuevo?', lectura: 'Puerta abierta: no cerrar el caso.' },
  };
  const conteo = new Map<string, { si: number; no: number }>();
  for (const x of encuestas) {
    for (const r of x.respuestas || []) {
      if (r.valor === null || r.valor === undefined) continue;
      const c = conteo.get(r.clave) ?? { si: 0, no: 0 };
      if (r.valor) c.si++; else c.no++;
      conteo.set(r.clave, c);
    }
  }
  const objeciones: Objecion[] = [...conteo.entries()]
    .filter(([clave]) => clave !== 'reviso')
    .map(([clave, c]) => ({
      clave,
      pregunta: LECTURAS[clave]?.pregunta ?? clave,
      si: c.si, no: c.no, n: c.si + c.no,
      lectura: LECTURAS[clave]?.lectura ?? '',
    }))
    .sort((a, b) => b.n - a.n);

  // ── Actividad por operador (del mes) ──
  const opMap = new Map<string, Operador>();
  for (const l of llamadas.filter((x) => mismoMes(x.created_at, e.anio, e.mes))) {
    const u = l.usuario || '(sin usuario)';
    const o = opMap.get(u) ?? { usuario: u, intentos: 0, contactos: 0, encuestas: 0, tasa: 0 };
    o.intentos++;
    if (l.resultado === 'atendio') o.contactos++;
    opMap.set(u, o);
  }
  for (const x of encuestasMes) {
    const u = x.usuario || '(sin usuario)';
    const o = opMap.get(u) ?? { usuario: u, intentos: 0, contactos: 0, encuestas: 0, tasa: 0 };
    o.encuestas++;
    opMap.set(u, o);
  }
  const operadores = [...opMap.values()]
    .map((o) => ({ ...o, tasa: pct(o.contactos, o.intentos) }))
    .sort((a, b) => b.intentos - a.intentos);

  // ── Pendientes, CON NOMBRE: el informe tiene que salir accionable ──
  const aPendiente = (p: PresInforme): PendienteLlamar => ({
    numero: p.numero_presupuesto,
    paciente: `${p.paciente_apellido || ''}, ${p.paciente_nombre || ''}`.replace(/^, |, $/g, ''),
    telefono: p.telefono ?? null,
    practica: p.prestacion_descripcion || p.prestacion_codigo || '',
    monto: num(p.total_final),
    diasDesdeCreacion: dias(p.fecha_creacion, hoy),
  });

  const sinSeguimiento = sinOperar
    .filter((p) => !enCircuito.has(p.id))
    .map(aPendiente)
    .sort((a, b) => b.monto - a.monto);

  const perdidosDeSeguimiento = sinOperar
    .filter((p) => {
      const s = segPorId.get(p.id);
      return s && !s.cerrado_at && !contactadosIds.has(p.id)
        && num(s.intentos_ronda) >= INTENTOS_PARA_PERDIDO;
    })
    .map(aPendiente)
    .sort((a, b) => b.monto - a.monto);

  // ── Advertencias que el informe imprime ──
  for (const i of indicadores) {
    if (!i.confiable && i.formato === 'porcentaje') {
      advertencias.push(`"${i.label}" se calcula sobre ${i.n} caso${i.n === 1 ? '' : 's'}: por debajo de ${MINIMO_MUESTRA} el porcentaje no es representativo.`);
    }
  }
  if (!prev.intentos) {
    advertencias.push(`No hubo actividad en ${MESES[ant.mes - 1]} ${ant.anio}: las comparaciones contra el mes anterior quedan vacías.`);
  }
  const sinCerrar = cohortes.filter((c) => !c.cerrada90).length;
  if (sinCerrar) {
    advertencias.push(`${sinCerrar} de las 6 cohortes todavía no cumplieron 90 días: su columna a 90 no es un resultado final.`);
  }

  return {
    anio: e.anio, mes: e.mes,
    etiquetaPeriodo: `${MESES[e.mes - 1]} ${e.anio}`,
    indicadores,
    plataEnRiesgo: {
      tramos,
      total: tramos.reduce((a, t) => a + t.monto, 0),
      cantidad: tramos.reduce((a, t) => a + t.cantidad, 0),
    },
    embudo, conversionMes, ventanaDecision,
    cohortes, porHora, porDiaSemana, objeciones, operadores,
    sinSeguimiento, perdidosDeSeguimiento, advertencias,
  };
}
