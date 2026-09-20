// ============================================================
// Informe mensual de Seguimiento telefónico — cálculo
// ============================================================
// Lo que se fija acá es sobre todo lo que el informe NO debe hacer: inventar
// porcentajes con muestras chicas, contar como cero una ventana que todavía no
// cerró, o mezclar la actividad de un mes con el resultado de otro.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calcularInformeSeguimiento, mediana, MINIMO_MUESTRA,
  type EntradaInforme, type PresInforme, type LlamadaInforme, type EncuestaInforme,
} from '@modules/presupuestador/utils/informeSeguimiento';
import type { Seguimiento } from '@modules/presupuestador/utils/seguimiento';

const HOY = new Date(2026, 8, 20, 12); // 20/09/2026

const pres = (o: Partial<PresInforme> & { id: string }): PresInforme => ({
  numero_presupuesto: 'P-' + o.id,
  paciente_apellido: 'Perez', paciente_nombre: 'Juan',
  prestacion_codigo: '030502', prestacion_descripcion: 'Faco',
  total_final: 1_000_000, estado: 'entregado',
  fecha_creacion: '2026-09-01', telefono: '5492604000000',
  ...o,
});

const seg = (id: string, o: Partial<Seguimiento> = {}): Seguimiento => ({
  presupuesto_id: id, estado_contacto: 'en_seguimiento', ronda: 1, intentos_ronda: 1,
  whatsapp_enviado_at: null, rellamada_at: null, cerrado_at: null, ...o,
});

const llam = (id: string, o: Partial<LlamadaInforme> = {}): LlamadaInforme => ({
  presupuesto_id: id, usuario: 'rosa', canal: 'telefono', resultado: 'no_atendio',
  created_at: '2026-09-10T10:00:00-03:00', ...o,
});

const entrada = (o: Partial<EntradaInforme> = {}): EntradaInforme => ({
  anio: 2026, mes: 9, presupuestos: [], seguimientos: [], llamadas: [], encuestas: [],
  hoy: HOY, ...o,
});

describe('mediana', () => {
  it('con lista vacía devuelve null, no cero', () => {
    // Un 0 diría "se contactó el mismo día", que es lo contrario del problema.
    expect(mediana([])).toBeNull();
  });
  it('impar y par', () => {
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('Muestras chicas', () => {
  it('marca como NO confiable un porcentaje con pocos casos', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a' }), pres({ id: 'b' })],
      seguimientos: [seg('a')],
    }));
    const captacion = r.indicadores.find((i) => i.clave === 'captacion')!;
    expect(captacion.valor).toBe(50);      // 1 de 2
    expect(captacion.n).toBe(2);
    expect(captacion.confiable).toBe(false);
  });

  it('avisa por escrito cuándo un porcentaje no es representativo', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a' })], seguimientos: [seg('a')],
    }));
    expect(r.advertencias.join(' ')).toContain(String(MINIMO_MUESTRA));
  });

  it('con muestra suficiente sí lo marca confiable', () => {
    const ps = Array.from({ length: 25 }, (_, i) => pres({ id: 'p' + i }));
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: ps, seguimientos: ps.slice(0, 10).map((p) => seg(p.id)),
    }));
    const captacion = r.indicadores.find((i) => i.clave === 'captacion')!;
    expect(captacion.confiable).toBe(true);
    expect(captacion.valor).toBe(40);
  });
});

describe('Tiempo al primer contacto', () => {
  it('mide desde el presupuesto hasta el PRIMER intento, no el último', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a', fecha_creacion: '2026-09-01' })],
      seguimientos: [seg('a')],
      llamadas: [
        llam('a', { created_at: '2026-09-06T10:00:00-03:00' }),
        llam('a', { created_at: '2026-09-15T10:00:00-03:00' }),
      ],
    }));
    const lat = r.indicadores.find((i) => i.clave === 'latencia')!;
    expect(lat.valor).toBe(5);
    expect(lat.subirEsBueno).toBe(false); // más días es peor
  });

  it('sin intentos el indicador no es confiable', () => {
    const r = calcularInformeSeguimiento(entrada({ presupuestos: [pres({ id: 'a' })] }));
    expect(r.indicadores.find((i) => i.clave === 'latencia')!.confiable).toBe(false);
  });
});

describe('Contacto efectivo', () => {
  it('cuenta sólo llamadas telefónicas: el whatsapp no diluye la tasa', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a' })], seguimientos: [seg('a')],
      llamadas: [
        llam('a', { resultado: 'atendio' }),
        llam('a', { resultado: 'no_atendio' }),
        llam('a', { canal: 'whatsapp', resultado: 'whatsapp_enviado' }),
      ],
    }));
    const c = r.indicadores.find((i) => i.clave === 'contacto')!;
    expect(c.n).toBe(2);       // los 2 telefónicos
    expect(c.valor).toBe(50);
    expect(r.indicadores.find((i) => i.clave === 'eficiencia')!.valor).toBe(2);
  });
});

describe('Embudo', () => {
  it('cada escalón retiene respecto del anterior y nunca crece', () => {
    const ps = [pres({ id: 'a' }), pres({ id: 'b' }), pres({ id: 'c' })];
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: ps,
      seguimientos: [seg('a'), seg('b')],
      llamadas: [llam('a', { resultado: 'atendio' }), llam('b')],
    }));
    const cant = r.embudo.map((x) => x.cantidad);
    expect(cant[0]).toBe(3);   // del mes
    expect(cant[1]).toBe(2);   // en circuito
    expect(cant[2]).toBe(2);   // con intento
    expect(cant[3]).toBe(1);   // contactados
    for (let i = 1; i < cant.length; i++) expect(cant[i]).toBeLessThanOrEqual(cant[i - 1]);
    expect(r.embudo[1].retencion).toBeCloseTo(66.7, 0);
  });
});

describe('Cohortes', () => {
  it('marca como NO cerrada la ventana de 90 días que todavía no se cumplió', () => {
    // La cohorte de septiembre 2026 no puede tener resultado a 90 días el 20/09.
    const r = calcularInformeSeguimiento(entrada({ presupuestos: [pres({ id: 'a' })] }));
    const sep = r.cohortes.find((c) => c.mes === 9 && c.anio === 2026)!;
    expect(sep.cerrada90).toBe(false);
    expect(r.advertencias.join(' ')).toContain('90 días');
  });

  it('una cohorte vieja sí queda cerrada', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'v', fecha_creacion: '2026-04-05' })],
    }));
    const abr = r.cohortes.find((c) => c.mes === 4)!;
    expect(abr.cerrada90).toBe(true);
  });
});

describe('Plata en riesgo', () => {
  it('reparte por antigüedad y sólo cuenta lo que no se operó', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [
        pres({ id: 'a', fecha_creacion: '2026-09-15', total_final: 100 }),   // 5 días
        pres({ id: 'b', fecha_creacion: '2026-06-20', total_final: 200 }),   // 92 días
        pres({ id: 'c', fecha_creacion: '2026-09-15', total_final: 999, estado: 'practicado' }),
        pres({ id: 'd', fecha_creacion: '2026-09-15', total_final: 888, estado: 'cancelado' }),
      ],
    }));
    expect(r.plataEnRiesgo.total).toBe(300);
    expect(r.plataEnRiesgo.cantidad).toBe(2);
    expect(r.plataEnRiesgo.tramos[0]).toMatchObject({ cantidad: 1, monto: 100 });
    expect(r.plataEnRiesgo.tramos[2]).toMatchObject({ cantidad: 1, monto: 200 });
  });
});

describe('Pendientes con nombre', () => {
  it('lista los entregados que nunca entraron al circuito, del monto más alto al más bajo', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [
        pres({ id: 'a', total_final: 500 }),
        pres({ id: 'b', total_final: 900, paciente_apellido: 'Gomez', paciente_nombre: 'Ana' }),
        pres({ id: 'c', total_final: 100 }),
      ],
      seguimientos: [seg('a')],
    }));
    expect(r.sinSeguimiento.map((x) => x.monto)).toEqual([900, 100]);
    expect(r.sinSeguimiento[0].paciente).toBe('Gomez, Ana');
    expect(r.sinSeguimiento[0].telefono).toBeTruthy();
  });

  it('marca perdido de seguimiento al que agotó intentos sin que atiendan', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a' }), pres({ id: 'b' })],
      seguimientos: [seg('a', { intentos_ronda: 3 }), seg('b', { intentos_ronda: 1 })],
      llamadas: [llam('a'), llam('a'), llam('a'), llam('b')],
    }));
    expect(r.perdidosDeSeguimiento.map((x) => x.numero)).toEqual(['P-a']);
  });

  it('el que SÍ atendió no cuenta como perdido, aunque tenga muchos intentos', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a' })],
      seguimientos: [seg('a', { intentos_ronda: 5 })],
      llamadas: [llam('a'), llam('a', { resultado: 'atendio' })],
    }));
    expect(r.perdidosDeSeguimiento).toEqual([]);
  });
});

describe('Mapa de objeciones', () => {
  const enc = (respuestas: Array<{ clave: string; valor: boolean }>): EncuestaInforme => ({
    presupuesto_id: 'a', usuario: 'rosa', rama: 'reviso',
    respuestas, observaciones: null, created_at: '2026-09-10T10:00:00-03:00',
  });

  it('cuenta síes y noes por pregunta, y deja afuera la de apertura', () => {
    const r = calcularInformeSeguimiento(entrada({
      encuestas: [
        enc([{ clave: 'reviso', valor: true }, { clave: 'valor_acorde', valor: false }]),
        enc([{ clave: 'reviso', valor: true }, { clave: 'valor_acorde', valor: false }]),
        enc([{ clave: 'reviso', valor: true }, { clave: 'valor_acorde', valor: true }]),
      ],
    }));
    const precio = r.objeciones.find((o) => o.clave === 'valor_acorde')!;
    expect({ si: precio.si, no: precio.no, n: precio.n }).toEqual({ si: 1, no: 2, n: 3 });
    expect(r.objeciones.find((o) => o.clave === 'reviso')).toBeUndefined();
    expect(precio.lectura).toContain('precio');
  });

  it('una respuesta sin contestar no se cuenta como NO', () => {
    const r = calcularInformeSeguimiento(entrada({
      encuestas: [enc([{ clave: 'valor_acorde', valor: null as unknown as boolean }])],
    }));
    expect(r.objeciones.find((o) => o.clave === 'valor_acorde')).toBeUndefined();
  });
});

describe('Actividad por operador', () => {
  it('suma intentos, contactos y encuestas de cada uno, ordenado por trabajo', () => {
    const r = calcularInformeSeguimiento(entrada({
      llamadas: [
        llam('a', { usuario: 'rosa', resultado: 'atendio' }),
        llam('b', { usuario: 'rosa' }),
        llam('c', { usuario: 'flavio' }),
      ],
      encuestas: [{
        presupuesto_id: 'a', usuario: 'rosa', rama: 'reviso',
        respuestas: [], observaciones: null, created_at: '2026-09-10T10:00:00-03:00',
      }],
    }));
    expect(r.operadores[0]).toMatchObject({ usuario: 'rosa', intentos: 2, contactos: 1, encuestas: 1, tasa: 50 });
    expect(r.operadores[1]).toMatchObject({ usuario: 'flavio', intentos: 1, contactos: 0 });
  });
});

describe('Aislamiento del período', () => {
  it('la actividad de otro mes no entra en el mes informado', () => {
    const r = calcularInformeSeguimiento(entrada({
      presupuestos: [pres({ id: 'a' })],
      llamadas: [
        llam('a', { created_at: '2026-08-10T10:00:00-03:00' }),
        llam('a', { created_at: '2026-09-10T10:00:00-03:00' }),
      ],
    }));
    expect(r.indicadores.find((i) => i.clave === 'actividad')!.valor).toBe(1);
    // …pero el mes anterior sí se usa para comparar.
    expect(r.indicadores.find((i) => i.clave === 'actividad')!.anterior).toBe(1);
  });
});
