// ============================================================
// Informe mensual de presupuestos — cálculo
// ============================================================
// Lo que se fija acá son las definiciones decididas con Paulo: qué es
// convertido, de qué mes es, qué monto cuenta, qué es obra social, y que lo que
// no tiene dato (aceptaciones antes de julio 2026) no se muestre como cero.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calcularInformePresupuestos, diasAPractica, tramoDe, rangoMes, moverMes, variacion,
  type PresupuestoInforme, type EntradaInformePresupuestos,
} from '@modules/informes/utils/informePresupuestos';

const HOY = new Date(2026, 9, 30, 12); // 30/10/2026

const pres = (o: Partial<PresupuestoInforme> & { id: string }): PresupuestoInforme => ({
  numero: 'P-' + o.id,
  fecha_base: '2026-09-01',
  estado: 'entregado',
  resultado: null,
  fecha_resultado: null,
  administrativa: 'rosa',
  cirujano: 'dr_mercado',
  paciente: 'Perez, Juan',
  prestacion: 'Faco',
  neto: 1_000_000,
  cobertura: 0,
  obra_social: 'Particular',
  fecha_conversion: null,
  fecha_practica: null,
  ...o,
});

const conv = (id: string, fecha: string, o: Partial<PresupuestoInforme> = {}): PresupuestoInforme =>
  pres({ id, estado: 'practicado', fecha_conversion: fecha, fecha_practica: fecha, ...o });

const entrada = (o: Partial<EntradaInformePresupuestos> = {}): EntradaInformePresupuestos => ({
  anio: 2026, mes: 9, presupuestos: [], hoy: HOY,
  usuarios: [{ username: 'rosa', nombre: 'Rosa Rodriguez' }, { username: 'caro', nombre: 'Carolina Martinez' }],
  ...o,
});

describe('fechas', () => {
  it('rango del mes, con febrero bisiesto y no bisiesto', () => {
    expect(rangoMes(2026, 2)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoMes(2028, 2).hasta).toBe('2028-02-29');
  });
  it('mover mes cruza el año', () => {
    expect(moverMes(2026, 1, -1)).toEqual({ anio: 2025, mes: 12 });
    expect(moverMes(2025, 12, 1)).toEqual({ anio: 2026, mes: 1 });
  });
});

describe('convertido', () => {
  it('cuenta sólo lo confirmado en GECLISA, por mes de la cirugía', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        conv('a', '2026-09-10'),
        conv('b', '2026-10-02'), // otro mes
        pres({ id: 'c', estado: 'practicado', fecha_practica: '2026-09-15' }), // a mano, sin respaldo
      ],
    }));
    expect(inf.resumen.convertidos).toEqual({ cantidad: 1, neto: 1_000_000 });
    expect(inf.sinRespaldo.map((s) => s.numero)).toEqual(['P-c']);
  });

  it('un presupuesto anulado no cuenta, aunque tenga cirugía', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [conv('a', '2026-09-10', { resultado: 'ANULADO' })],
    }));
    expect(inf.resumen.convertidos.cantidad).toBe(0);
    expect(inf.ranking).toEqual([]);
  });
});

describe('ranking', () => {
  it('ordena por monto neto y usa el nombre completo', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        conv('a', '2026-09-10', { administrativa: 'rosa', neto: 500_000 }),
        conv('b', '2026-09-11', { administrativa: 'caro', neto: 2_000_000 }),
        conv('c', '2026-09-12', { administrativa: 'rosa', neto: 700_000 }),
      ],
    }));
    expect(inf.ranking.map((r) => [r.nombre, r.cirugias, r.neto])).toEqual([
      ['Carolina Martinez', 1, 2_000_000],
      ['Rosa Rodriguez', 2, 1_200_000],
    ]);
    expect(inf.ranking[0].pctTotal).toBeCloseTo((2_000_000 / 3_200_000) * 100);
  });

  it('separa lo operado en la primera semana', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        conv('a', '2026-09-05', { fecha_base: '2026-09-01', neto: 300_000 }), // 4 días
        conv('b', '2026-09-30', { fecha_base: '2026-07-01', neto: 700_000 }), // 91 días
      ],
    }));
    expect(inf.ranking[0].pctPrimeraSemana).toBeCloseTo(30);
    expect(inf.ranking[0].medianaDias).toBe(47.5);
  });

  it('un usuario que no está en la lista se muestra por su usuario', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [conv('a', '2026-09-10', { administrativa: 'nueva' }), conv('b', '2026-09-10', { administrativa: null })],
    }));
    expect(inf.ranking.map((r) => r.nombre).sort()).toEqual(['Sin presupuestadora', 'nueva']);
  });
});

describe('aceptados', () => {
  it('antes de julio 2026 es "sin dato", no cero', () => {
    const inf = calcularInformePresupuestos(entrada({
      anio: 2026, mes: 6, presupuestos: [conv('a', '2026-06-10')],
    }));
    expect(inf.resumen.aceptados).toBeNull();
    expect(inf.resumen.cartera).toBeNull();
    expect(inf.ranking[0].aceptados).toBeNull();
  });

  it('una presupuestadora con aceptados y sin cirugías entra al ranking', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        conv('a', '2026-09-10', { administrativa: 'rosa' }),
        pres({ id: 'b', administrativa: 'caro', resultado: 'ACEPTADO', fecha_resultado: '2026-09-20' }),
      ],
    }));
    const caro = inf.ranking.find((r) => r.clave === 'caro');
    expect(caro).toMatchObject({ cirugias: 0, neto: 0, aceptados: 1 });
    expect(inf.resumen.aceptados).toEqual({ cantidad: 1, neto: 1_000_000 });
  });

  it('la cartera es al cierre del mes: lo operado después todavía es cartera', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        pres({ id: 'a', resultado: 'ACEPTADO', fecha_resultado: '2026-09-05', estado: 'practicado', fecha_conversion: '2026-10-10' }),
        pres({ id: 'b', resultado: 'ACEPTADO', fecha_resultado: '2026-09-05', estado: 'practicado', fecha_conversion: '2026-09-20' }),
        pres({ id: 'c', resultado: 'ACEPTADO', fecha_resultado: '2026-08-20', estado: 'cancelado' }),
        pres({ id: 'd', resultado: 'ACEPTADO', fecha_resultado: '2026-10-01' }), // después del cierre
      ],
    }));
    expect(inf.cartera.map((c) => [c.numero, c.diasDesdeAceptacion])).toEqual([['P-a', 25]]);
  });
});

describe('cobertura', () => {
  it('obra social es haber descontado cobertura, no el texto del campo', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        conv('a', '2026-09-10', { obra_social: 'Osep', cobertura: 400_000 }),
        conv('b', '2026-09-10', { obra_social: 'PAMI', cobertura: 0 }), // pagó todo
        conv('c', '2026-09-10', { obra_social: 'OSEP', cobertura: 100_000 }),
      ],
    }));
    expect(inf.obraSocial).toMatchObject({ cirugias: 2, cobertura: 500_000 });
    expect(inf.particular.cirugias).toBe(1);
    expect(inf.porObraSocial.map((o) => [o.nombre, o.cirugias])).toEqual([['OSEP', 2]]);
  });
});

describe('tiempo a la práctica', () => {
  it('cuatro tramos, y nunca días negativos', () => {
    expect(tramoDe(0)).toBe('0 a 7 días');
    expect(tramoDe(8)).toBe('8 a 30 días');
    expect(tramoDe(60)).toBe('31 a 60 días');
    expect(tramoDe(61)).toBe('Más de 60 días');
    expect(diasAPractica(pres({ id: 'x', fecha_base: '2026-09-10', fecha_conversion: '2026-09-08' }))).toBe(0);
  });
});

describe('cohortes', () => {
  it('seis meses hasta el elegido; los de menos de 60 días quedan en curso', () => {
    const inf = calcularInformePresupuestos(entrada({
      presupuestos: [
        pres({ id: 'a', fecha_base: '2026-09-03', estado: 'practicado', fecha_conversion: '2026-10-05' }),
        pres({ id: 'b', fecha_base: '2026-09-04' }),
        pres({ id: 'c', fecha_base: '2026-09-05', estado: 'cancelado' }), // no cuenta
      ],
    }));
    expect(inf.cohortes.map((c) => c.label)).toEqual([
      'Abril 2026', 'Mayo 2026', 'Junio 2026', 'Julio 2026', 'Agosto 2026', 'Septiembre 2026',
    ]);
    const sep = inf.cohortes[5];
    expect(sep).toMatchObject({ entregados: 2, convertidos: 1, tasa: 50, enCurso: true });
    expect(inf.cohortes[4].enCurso).toBe(false); // agosto: 60 días al 30/10
  });
});

describe('variación', () => {
  it('sin base no inventa un porcentaje', () => {
    expect(variacion(10, 0)).toBeNull();
    expect(variacion(15, 10)).toBeCloseTo(50);
  });
});
