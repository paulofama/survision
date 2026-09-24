// ============================================================
// Comisiones — la aritmética del dinero
// ============================================================
// Lo que se prueba acá no es que el módulo no explote: es que la suma de las
// partes dé EXACTAMENTE el pool, que un descuento baje la comisión y que un
// recupero fuera de ventana no pague. Cada uno de estos casos, mal, es plata
// mal pagada a una persona.
//
// Los casos siguen la lista de verificación del documento de la Dirección.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  baseComisionable,
  detectarRecupero,
  devengosDePractica,
  repartir,
  reversoDe,
  ROLES,
  TIPOS,
} from '@modules/comisiones/core/calculo.mjs';

/** P-2026-907, real: Carolina, 08/09 → 16/09, con 10 % de descuento. */
const PRECIOS_907 = {
  subtotalOriginal: 3060000,
  descuento: 306000,
  totalInsumos: 0,
  coberturaOS: 0,
  subtotalConGastos: 2754000,
};

/** P-2026-901, real: el caso que demuestra que subtotalConGastos descuenta la OS. */
const PRECIOS_901 = {
  subtotalOriginal: 414450,
  descuento: 23945,
  totalInsumos: 0,
  coberturaOS: 175000,
  subtotalConGastos: 215505,
};

const PARAMS = {
  tasaComision: 3,
  participantesPct: 30,
  recuperadorPct: 50,
  diasParaFrio: 45,
  ventanaRecuperoDias: 60,
};

const suma = (partes: { importe: number }[]) =>
  Math.round(partes.reduce((s, p) => s + p.importe, 0) * 100) / 100;

describe('baseComisionable', () => {
  it('resta el descuento: si el asesor lo regala, la comisión baja con él', () => {
    expect(baseComisionable(PRECIOS_907)).toBe(2754000);
  });

  it('NO descuenta la cobertura de la obra social', () => {
    // La Dirección decidió comisionar el valor total. `subtotalConGastos` no
    // sirve para esto porque YA la descuenta: en P-2026-901 vale 215.505
    // contra los 390.505 que corresponden.
    expect(baseComisionable(PRECIOS_901)).toBe(390505);
    expect(baseComisionable(PRECIOS_901)).not.toBe(PRECIOS_901.subtotalConGastos);
  });

  it('suma los insumos del presupuesto', () => {
    expect(baseComisionable({ ...PRECIOS_907, totalInsumos: 100000 })).toBe(2854000);
  });

  it('no se rompe con datos faltantes', () => {
    expect(baseComisionable(null)).toBe(0);
    expect(baseComisionable({})).toBe(0);
    expect(baseComisionable({ subtotalOriginal: 'x' })).toBe(0);
  });
});

describe('repartir — la suma de las partes es EXACTAMENTE el pool', () => {
  it('sin participantes ni recupero, todo al entregador', () => {
    const r = repartir(82620, 'carolina', [], null, PARAMS);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ beneficiario: 'carolina', rol: ROLES.ENTREGADOR, importe: 82620 });
  });

  it('con un participante: 70 / 30', () => {
    const r = repartir(82620, 'carolina', ['rosa'], null, PARAMS);
    expect(r.find(p => p.rol === ROLES.ENTREGADOR)!.importe).toBe(57834);
    expect(r.find(p => p.rol === ROLES.PARTICIPANTE)!.importe).toBe(24786);
    expect(suma(r)).toBe(82620);
  });

  it('con recupero, el recuperador saca SÓLO de la parte del entregador', () => {
    // El participante conserva sus 24.786 enteros: nunca cede.
    const r = repartir(82620, 'carolina', ['rosa'], 'gisela', PARAMS);
    expect(r.find(p => p.rol === ROLES.PARTICIPANTE)!.importe).toBe(24786);
    expect(r.find(p => p.rol === ROLES.ENTREGADOR)!.importe).toBe(28917);
    expect(r.find(p => p.rol === ROLES.RECUPERADOR)!.importe).toBe(28917);
    expect(suma(r)).toBe(82620);
  });

  it('con TRES participantes la bolsa cierra exacta, aunque no divida redondo', () => {
    // 30 % de 100 = 30, entre tres son 10 cada uno. Con un pool feo el último
    // se lleva el resto para que no se pierda ni sobre un centavo.
    const r = repartir(100.01, 'a', ['b', 'c', 'd'], null, PARAMS);
    expect(suma(r)).toBe(100.01);
    expect(r.filter(p => p.rol === ROLES.PARTICIPANTE)).toHaveLength(3);
  });

  it('el residuo del redondeo queda en el entregador, no se pierde', () => {
    const r = repartir(33.33, 'a', ['b'], 'c', PARAMS);
    expect(suma(r)).toBe(33.33);
  });

  it('un participante que es el mismo entregador se ignora', () => {
    const r = repartir(82620, 'carolina', ['carolina'], null, PARAMS);
    expect(r).toHaveLength(1);
    expect(r[0].importe).toBe(82620);
  });

  it('sin entregador o sin pool no reparte nada', () => {
    expect(repartir(82620, '', [], null, PARAMS)).toEqual([]);
    expect(repartir(0, 'carolina', [], null, PARAMS)).toEqual([]);
  });
});

describe('detectarRecupero', () => {
  const base = {
    fechaEntrega: '2026-01-10',
    entregador: 'carolina',
    diasParaFrio: 45,
    ventanaDias: 60,
  };
  const llamada = (fecha: string, usuario = 'rosa', resultado = 'atendio') =>
    ({ id: 'l1', fecha, usuario, resultado, canal: 'telefono' });

  it('dentro de la ventana: hay recupero', () => {
    const r = detectarRecupero({ ...base, fechaPractica: '2026-04-10', llamadas: [llamada('2026-03-21')] });
    expect(r?.usuario).toBe('rosa');
    expect(r?.evidencia.contacto_efectivo).toBe('2026-03-21');
  });

  it('fuera de la ventana de 60 días: NO hay recupero', () => {
    // Aceptado a los 75 días del contacto. Todo es del entregador.
    const r = detectarRecupero({ ...base, fechaPractica: '2026-06-04', llamadas: [llamada('2026-03-21')] });
    expect(r).toBeNull();
  });

  it('operado antes de enfriarse: NO hay recupero aunque hayan llamado', () => {
    const r = detectarRecupero({ ...base, fechaPractica: '2026-02-01', llamadas: [llamada('2026-01-20')] });
    expect(r).toBeNull();
  });

  it('un intento fallido o un WhatsApp enviado NO son contacto efectivo', () => {
    const fallidas = [llamada('2026-03-21', 'rosa', 'no_atendio'), llamada('2026-03-22', 'rosa', 'whatsapp_enviado')];
    expect(detectarRecupero({ ...base, fechaPractica: '2026-04-10', llamadas: fallidas })).toBeNull();
  });

  it('nadie se recupera a sí mismo', () => {
    const r = detectarRecupero({ ...base, fechaPractica: '2026-04-10', llamadas: [llamada('2026-03-21', 'carolina')] });
    expect(r).toBeNull();
  });

  it('gana el ÚLTIMO contacto efectivo dentro de la ventana', () => {
    const l = [llamada('2026-03-01', 'rosa'), llamada('2026-03-25', 'gisela')];
    expect(detectarRecupero({ ...base, fechaPractica: '2026-04-10', llamadas: l })?.usuario).toBe('gisela');
  });

  it('una llamada anterior al enfriamiento no cuenta', () => {
    // Llamaron a los 20 días, cuando el presupuesto todavía estaba caliente.
    const r = detectarRecupero({ ...base, fechaPractica: '2026-04-10', llamadas: [llamada('2026-01-30')] });
    expect(r).toBeNull();
  });

  it('sin fechas devuelve null en vez de romperse', () => {
    expect(detectarRecupero({ ...base, fechaPractica: null, llamadas: [] })).toBeNull();
  });
});

describe('devengosDePractica — el caso testigo, de punta a punta', () => {
  const p907 = {
    id: 'uuid-907',
    atencionId: 12345,
    precios: PRECIOS_907,
    entregadoPor: 'carolina_martinez',
    fechaEntrega: '2026-09-08',
    fechaPractica: '2026-09-16',
  };

  it('P-2026-907 real: base 2.754.000, pool 82.620, todo al entregador', () => {
    const m = devengosDePractica({ presupuesto: p907, participantes: [], llamadas: [], parametros: PARAMS });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      beneficiario: 'carolina_martinez',
      rol: ROLES.ENTREGADOR,
      tipo: TIPOS.DEVENGO,
      base_comisionable: 2754000,
      tasa_aplicada: 3,
      importe: 82620,
      fecha_devengo: '2026-09-16',
      evento_origen: 'practica:12345',
    });
  });

  it('sin tasa vigente no devenga NADA: el régimen nace inerte', () => {
    const m = devengosDePractica({ presupuesto: p907, participantes: [], llamadas: [], parametros: { ...PARAMS, tasaComision: 0 } });
    expect(m).toEqual([]);
  });

  it('sin entregador cargado no devenga nada', () => {
    const m = devengosDePractica({ presupuesto: { ...p907, entregadoPor: null }, participantes: [], llamadas: [], parametros: PARAMS });
    expect(m).toEqual([]);
  });

  it('el mismo presupuesto dos veces produce el MISMO evento_origen', () => {
    // Es lo que hace idempotente al job: el UNIQUE de la tabla lo rechaza.
    const a = devengosDePractica({ presupuesto: p907, participantes: [], llamadas: [], parametros: PARAMS });
    const b = devengosDePractica({ presupuesto: p907, participantes: [], llamadas: [], parametros: PARAMS });
    expect(a[0].evento_origen).toBe(b[0].evento_origen);
  });

  it('con participante y recupero, la evidencia queda en el movimiento', () => {
    const frio = {
      ...p907,
      fechaEntrega: '2026-01-10',
      fechaPractica: '2026-04-10',
    };
    const m = devengosDePractica({
      presupuesto: frio,
      participantes: ['gisela_cornuz'],
      llamadas: [{ id: 'l9', fecha: '2026-03-21', usuario: 'rosa_rodriguez', resultado: 'atendio', canal: 'telefono' }],
      parametros: PARAMS,
    });
    const rec = m.find(x => x.rol === ROLES.RECUPERADOR)!;
    expect(rec.beneficiario).toBe('rosa_rodriguez');
    expect(rec.evidencia).toMatchObject({ llamada_id: 'l9', contacto_efectivo: '2026-03-21' });
    // El entregador y el recuperador se parten lo que queda; el participante no cede.
    expect(m.find(x => x.rol === ROLES.PARTICIPANTE)!.importe).toBe(24786);
    expect(suma(m)).toBe(82620);
  });

  it('sólo el recuperador lleva evidencia; los demás no', () => {
    const m = devengosDePractica({ presupuesto: p907, participantes: ['gisela'], llamadas: [], parametros: PARAMS });
    expect(m.every(x => x.evidencia === null)).toBe(true);
  });
});

describe('reversoDe — un devengo no se edita, se contradice', () => {
  it('el reverso es el negativo exacto, con su motivo', () => {
    const dev = {
      id: 'mov-1', presupuesto_id: 'uuid-907', beneficiario: 'carolina', rol: ROLES.ENTREGADOR,
      base_comisionable: 2754000, tasa_aplicada: 3, pct_reparto: 100, importe: 82620,
    };
    const rev = reversoDe(dev, { motivo: 'La cirugía se cayó', evento: 'anulacion:abc', fecha: '2026-10-01', usuario: 'paulofama' });
    expect(rev.importe).toBe(-82620);
    expect(rev.tipo).toBe(TIPOS.REVERSO);
    expect(rev.motivo).toBe('La cirugía se cayó');
    expect(rev.evidencia).toMatchObject({ revierte_movimiento: 'mov-1' });
    // Devengo + reverso = 0. Eso es lo que tiene que quedar en la liquidación.
    expect(dev.importe + rev.importe).toBe(0);
  });
});
