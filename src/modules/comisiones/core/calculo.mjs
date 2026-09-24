// ============================================================
// CÁLCULO DE COMISIONES — núcleo isomórfico
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// UNA sola implementación de la aritmética del dinero, que usan el job del
// servidor (con `import()` dinámico) y la pantalla. Duplicarla sería duplicar
// el lugar donde puede aparecer un error de plata pagada a una persona.
// Mismo patrón que `tesoreria/bancos/core/`.
//
// Sin dependencias: ni Supabase, ni fetch, ni React. Recibe datos, devuelve
// movimientos. Eso es lo que lo hace testeable de verdad.
//
// LAS REGLAS (Dirección, 24/09/2026)
// ----------------------------------
//   base    = subtotalOriginal − descuento + insumos   (SIN descontar la OS)
//   pool    = base × tasa_comision
//   devengo = cuando la práctica se REALIZA, no al cobrar
//
//   si hay N participantes:  parte_participantes = pool × participantes_pct
//                            parte_entregador    = pool − parte_participantes
//   si no:                   parte_entregador    = pool
//
//   si hubo recupero:        parte_recuperador = parte_entregador × recuperador_pct
//                            parte_entregador  = parte_entregador − parte_recuperador
//
// EL RECUPERADOR SACA SÓLO DE LA PARTE DEL ENTREGADOR. El participante nunca
// cede. Es decisión expresa de la Dirección, con su consecuencia asumida:
// participar rinde más que entregar.
// ============================================================

/** Roles que pueden cobrar. */
export const ROLES = { ENTREGADOR: 'ENTREGADOR', PARTICIPANTE: 'PARTICIPANTE', RECUPERADOR: 'RECUPERADOR' };

/** Tipos de asiento. Un DEVENGO emitido se corrige con REVERSO o AJUSTE. */
export const TIPOS = { DEVENGO: 'DEVENGO', REVERSO: 'REVERSO', AJUSTE: 'AJUSTE' };

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Centavos. El importe es plata que se le paga a una persona. */
export const redondear = (n) => Math.round(num(n) * 100) / 100;

/**
 * La base comisionable de un presupuesto.
 *
 * Sale de `datos_completos.precios`, que trae la descomposición completa en
 * los 1.092 presupuestos. NO usa `subtotalConGastos`: ese campo YA descuenta
 * la cobertura de la obra social (verificado en P-2026-901: 414.450 − 23.945
 * − 175.000 = 215.505) y la Dirección decidió comisionar el valor total.
 *
 * El descuento SÍ se resta: si el asesor lo otorga, la comisión baja con él.
 * Es deliberado, corrige el incentivo de regalar descuento para cerrar.
 */
export function baseComisionable(precios) {
  const p = precios || {};
  return redondear(num(p.subtotalOriginal) - num(p.descuento) + num(p.totalInsumos));
}

/**
 * Reparte el pool entre las personas.
 *
 * @param {number} pool
 * @param {string} entregador
 * @param {string[]} participantes
 * @param {string|null} recuperador
 * @param {{participantesPct:number, recuperadorPct:number}} pcts  en 0-100
 * @returns {{beneficiario:string, rol:string, pct:number, importe:number}[]}
 *
 * El residuo del redondeo se le deja al entregador, que es quien tiene la
 * parte más grande: así la suma de las partes da EXACTAMENTE el pool y no un
 * peso de más ni de menos. Un centavo suelto por presupuesto, acumulado sobre
 * cientos, es una diferencia que después nadie sabe explicar.
 */
export function repartir(pool, entregador, participantes, recuperador, pcts) {
  const total = redondear(pool);
  if (!entregador || total <= 0) return [];

  const lista = (participantes || []).filter((p) => p && p !== entregador);
  const pPct = lista.length ? Math.min(100, Math.max(0, num(pcts?.participantesPct))) : 0;
  const rPct = recuperador ? Math.min(100, Math.max(0, num(pcts?.recuperadorPct))) : 0;

  const partes = [];

  // 1. Los participantes se reparten su porción en partes iguales.
  const bolsaParticipantes = redondear(total * (pPct / 100));
  let repartidoAParticipantes = 0;
  lista.forEach((usuario, i) => {
    // Al último se le da el resto, para que la bolsa cierre exacta.
    const importe = i === lista.length - 1
      ? redondear(bolsaParticipantes - repartidoAParticipantes)
      : redondear(bolsaParticipantes / lista.length);
    repartidoAParticipantes = redondear(repartidoAParticipantes + importe);
    partes.push({ beneficiario: usuario, rol: ROLES.PARTICIPANTE, pct: redondear(pPct / lista.length), importe });
  });

  // 2. Lo que queda es del entregador, y de ahí sale lo del recuperador.
  const delEntregador = redondear(total - repartidoAParticipantes);
  const partesRecuperador = recuperador ? redondear(delEntregador * (rPct / 100)) : 0;

  if (recuperador && partesRecuperador > 0) {
    partes.push({
      beneficiario: recuperador,
      rol: ROLES.RECUPERADOR,
      pct: redondear((partesRecuperador / total) * 100),
      importe: partesRecuperador,
    });
  }

  // El residuo queda acá: esta resta hace que la suma cierre exacta.
  const restoEntregador = redondear(delEntregador - partesRecuperador);
  partes.unshift({
    beneficiario: entregador,
    rol: ROLES.ENTREGADOR,
    pct: redondear((restoEntregador / total) * 100),
    importe: restoEntregador,
  });

  return partes;
}

/**
 * ¿Hubo recupero?
 *
 * Tres condiciones, todas obligatorias:
 *   1. La práctica se realizó DESPUÉS de que el presupuesto se enfriara
 *      (entrega + diasParaFrio).
 *   2. Hubo un contacto EFECTIVO (el paciente atendió) después del enfriamiento.
 *      Un intento fallido o un WhatsApp enviado no cuentan.
 *   3. La práctica se realizó dentro de la ventana desde ese contacto.
 *
 * Y una cuarta que no está en el documento pero sí en el algoritmo: el
 * recuperador NO puede ser el propio entregador. Nadie se recupera a sí mismo
 * un presupuesto que dejó enfriar.
 *
 * @returns {{usuario:string, evidencia:object}|null}
 */
export function detectarRecupero({ fechaEntrega, fechaPractica, entregador, llamadas, diasParaFrio, ventanaDias }) {
  if (!fechaEntrega || !fechaPractica) return null;

  const dias = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
  if (dias(fechaEntrega, fechaPractica) <= num(diasParaFrio)) return null;

  const efectivas = (llamadas || [])
    .filter((l) => l && l.resultado === 'atendio' && l.fecha && l.usuario)
    .filter((l) => dias(fechaEntrega, l.fecha) > num(diasParaFrio))
    .filter((l) => l.usuario !== entregador)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const ultima = efectivas[0];
  if (!ultima) return null;

  const desdeContacto = dias(ultima.fecha, fechaPractica);
  if (desdeContacto < 0 || desdeContacto > num(ventanaDias)) return null;

  return {
    usuario: ultima.usuario,
    evidencia: {
      llamada_id: ultima.id ?? null,
      contacto_efectivo: ultima.fecha,
      canal: ultima.canal ?? null,
      dias_desde_entrega: dias(fechaEntrega, ultima.fecha),
      dias_hasta_practica: desdeContacto,
    },
  };
}

/**
 * Los movimientos que corresponden a un presupuesto ya operado.
 *
 * Devuelve la lista completa, lista para insertar. No escribe nada: quien
 * llama decide si persiste. `eventoOrigen` es lo que hace idempotente al job
 * (hay un UNIQUE sobre él en la tabla).
 */
export function devengosDePractica({ presupuesto, participantes, llamadas, parametros }) {
  const base = baseComisionable(presupuesto.precios);
  const tasa = num(parametros.tasaComision);
  if (base <= 0 || tasa <= 0 || !presupuesto.entregadoPor) return [];

  const recupero = detectarRecupero({
    fechaEntrega: presupuesto.fechaEntrega,
    fechaPractica: presupuesto.fechaPractica,
    entregador: presupuesto.entregadoPor,
    llamadas,
    diasParaFrio: parametros.diasParaFrio,
    ventanaDias: parametros.ventanaRecuperoDias,
  });

  const pool = redondear(base * (tasa / 100));
  const partes = repartir(pool, presupuesto.entregadoPor, participantes, recupero?.usuario ?? null, {
    participantesPct: parametros.participantesPct,
    recuperadorPct: parametros.recuperadorPct,
  });

  const evento = `practica:${presupuesto.atencionId ?? presupuesto.id}`;

  return partes
    .filter((p) => p.importe !== 0)
    .map((p) => ({
      presupuesto_id: presupuesto.id,
      beneficiario: p.beneficiario,
      rol: p.rol,
      tipo: TIPOS.DEVENGO,
      evento_origen: evento,
      evidencia: p.rol === ROLES.RECUPERADOR ? recupero.evidencia : null,
      base_comisionable: base,
      tasa_aplicada: tasa,
      pct_reparto: p.pct,
      importe: p.importe,
      fecha_devengo: presupuesto.fechaPractica,
    }));
}

/**
 * El asiento en contrario de un devengo. No se edita el original: se emite
 * esto, con su motivo y su usuario.
 */
export function reversoDe(movimiento, { motivo, evento, fecha, usuario }) {
  return {
    presupuesto_id: movimiento.presupuesto_id,
    beneficiario: movimiento.beneficiario,
    rol: movimiento.rol,
    tipo: TIPOS.REVERSO,
    evento_origen: evento,
    evidencia: { revierte_movimiento: movimiento.id },
    base_comisionable: movimiento.base_comisionable,
    tasa_aplicada: movimiento.tasa_aplicada,
    pct_reparto: movimiento.pct_reparto,
    importe: redondear(-num(movimiento.importe)),
    fecha_devengo: fecha,
    motivo,
    created_by: usuario,
  };
}
