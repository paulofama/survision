// ============================================================
// Puente del resultado operativo — cierre exacto
// ============================================================
// Lo único que este puente tiene que garantizar es que los cuatro efectos
// sumen la diferencia de resultado operativo. Si no cierra, el informe le
// atribuye a algo una plata que no se movió por ahí.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  construirPuente, puenteCierra, rankearImpacto,
  type MesPuente, type LineaImpacto,
} from '../modules/analisis-marginal/utils/puenteResultado';

// Julio y agosto 2026 reales (facturación y cantidades de movimientos_geclisa).
const JULIO: MesPuente = {
  etiqueta: 'Julio 2026',
  facturacion: 100_679_831.74,
  cantidad: 1523,
  costosVariables: 46_153_073,
  costosFijos: 23_412_646,
};

const AGOSTO: MesPuente = {
  etiqueta: 'Agosto 2026',
  facturacion: 128_989_441,
  cantidad: 1415,
  costosVariables: 58_100_000,
  costosFijos: 29_500_173,
};

describe('construirPuente', () => {
  it('los cuatro efectos suman exactamente la variación de resultado', () => {
    const p = construirPuente(JULIO, AGOSTO);
    const suma = p.efectos.reduce((s, e) => s + e.valor, 0);
    expect(suma).toBeCloseTo(p.variacion, 6);
    expect(p.residuo).toBeCloseTo(0, 6);
    expect(puenteCierra(p)).toBe(true);
  });

  it('el resultado operativo de cada extremo es facturación − variables − fijos', () => {
    const p = construirPuente(JULIO, AGOSTO);
    expect(p.desde.resultadoOperativo).toBeCloseTo(
      JULIO.facturacion - JULIO.costosVariables - JULIO.costosFijos, 6);
    expect(p.hasta.resultadoOperativo).toBeCloseTo(
      AGOSTO.facturacion - AGOSTO.costosVariables - AGOSTO.costosFijos, 6);
  });

  it('volumen y precio/mix suman la variación de facturación', () => {
    const p = construirPuente(JULIO, AGOSTO);
    const vol = p.efectos.find(e => e.clave === 'volumen')!.valor;
    const mix = p.efectos.find(e => e.clave === 'precio_mix')!.valor;
    expect(vol + mix).toBeCloseTo(AGOSTO.facturacion - JULIO.facturacion, 6);
  });

  it('menos prácticas al mismo ticket da efecto volumen negativo y precio/mix cero', () => {
    const base: MesPuente = { etiqueta: 'A', facturacion: 1000, cantidad: 100, costosVariables: 0, costosFijos: 0 };
    const menos: MesPuente = { ...base, etiqueta: 'B', facturacion: 800, cantidad: 80 };
    const p = construirPuente(base, menos);
    expect(p.efectos.find(e => e.clave === 'volumen')!.valor).toBeCloseTo(-200, 9);
    expect(p.efectos.find(e => e.clave === 'precio_mix')!.valor).toBeCloseTo(0, 9);
  });

  it('mismo volumen a mayor ticket da precio/mix positivo y volumen cero', () => {
    const base: MesPuente = { etiqueta: 'A', facturacion: 1000, cantidad: 100, costosVariables: 0, costosFijos: 0 };
    const caro: MesPuente = { ...base, etiqueta: 'B', facturacion: 1500 };
    const p = construirPuente(base, caro);
    expect(p.efectos.find(e => e.clave === 'volumen')!.valor).toBeCloseTo(0, 9);
    expect(p.efectos.find(e => e.clave === 'precio_mix')!.valor).toBeCloseTo(500, 9);
  });

  it('un costo que sube resta resultado (signo dado vuelta)', () => {
    const a: MesPuente = { etiqueta: 'A', facturacion: 1000, cantidad: 10, costosVariables: 100, costosFijos: 100 };
    const b: MesPuente = { etiqueta: 'B', facturacion: 1000, cantidad: 10, costosVariables: 300, costosFijos: 250 };
    const p = construirPuente(a, b);
    expect(p.efectos.find(e => e.clave === 'costos_variables')!.valor).toBeCloseTo(-200, 9);
    expect(p.efectos.find(e => e.clave === 'costos_fijos')!.valor).toBeCloseTo(-150, 9);
    expect(p.variacion).toBeCloseTo(-350, 9);
  });

  it('cierra aunque el mes anterior no tenga prácticas (ticket cero, sin división por cero)', () => {
    const vacio: MesPuente = { etiqueta: 'A', facturacion: 0, cantidad: 0, costosVariables: 0, costosFijos: 500 };
    const p = construirPuente(vacio, JULIO);
    expect(Number.isFinite(p.variacion)).toBe(true);
    expect(puenteCierra(p)).toBe(true);
  });

  it('cierra con el resultado cayendo y con el resultado subiendo', () => {
    expect(puenteCierra(construirPuente(JULIO, AGOSTO))).toBe(true);
    expect(puenteCierra(construirPuente(AGOSTO, JULIO))).toBe(true);
  });

  it('los pesos son relativos al desvío total', () => {
    const p = construirPuente(JULIO, AGOSTO);
    const sumaPesos = p.efectos.reduce((s, e) => s + e.peso, 0);
    // Suman ±100% según el signo del desvío.
    expect(Math.abs(sumaPesos)).toBeCloseTo(100, 6);
  });

  it('sin variación de resultado, los pesos son cero y no NaN', () => {
    const p = construirPuente(JULIO, { ...JULIO, etiqueta: 'igual' });
    expect(p.variacion).toBeCloseTo(0, 9);
    p.efectos.forEach(e => expect(Number.isNaN(e.peso)).toBe(false));
  });
});

describe('rankearImpacto', () => {
  const LINEAS: LineaImpacto[] = [
    { nombre: 'OSEP', tipo: 'obra_social', cantidadActual: 500, cantidadAnterior: 400, montoActual: 5000, montoAnterior: 4000, variacion: 1000, peso: 0 },
    { nombre: 'OSDE', tipo: 'obra_social', cantidadActual: 100, cantidadAnterior: 150, montoActual: 900, montoAnterior: 1400, variacion: -500, peso: 0 },
    { nombre: 'Círculo', tipo: 'obra_social', cantidadActual: 80, cantidadAnterior: 60, montoActual: 800, montoAnterior: 600, variacion: 200, peso: 0 },
    { nombre: 'Particular', tipo: 'obra_social', cantidadActual: 40, cantidadAnterior: 42, montoActual: 400, montoAnterior: 420, variacion: -20, peso: 0 },
    { nombre: 'Otra A', tipo: 'obra_social', cantidadActual: 10, cantidadAnterior: 9, montoActual: 100, montoAnterior: 90, variacion: 10, peso: 0 },
    { nombre: 'Otra B', tipo: 'obra_social', cantidadActual: 5, cantidadAnterior: 6, montoActual: 50, montoAnterior: 55, variacion: -5, peso: 0 },
  ];

  it('ordena por impacto absoluto, no por signo', () => {
    const r = rankearImpacto(LINEAS, 1000, 3);
    expect(r.lineas.map(l => l.nombre)).toEqual(['OSEP', 'OSDE', 'Círculo']);
  });

  it('informa cuántas quedaron afuera y cuánto suman (no trunca en silencio)', () => {
    const r = rankearImpacto(LINEAS, 1000, 3);
    expect(r.omitidas).toBe(3);
    expect(r.montoOmitido).toBeCloseTo(-20 + 10 - 5, 9);
  });

  it('el peso usa el desvío total como base', () => {
    const r = rankearImpacto(LINEAS, 1000, 1);
    expect(r.lineas[0].peso).toBeCloseTo(100, 6);
  });

  it('con desvío cero los pesos son cero, no NaN', () => {
    const r = rankearImpacto(LINEAS, 0, 5);
    r.lineas.forEach(l => expect(Number.isNaN(l.peso)).toBe(false));
  });

  it('con menos líneas que el top no reporta omitidas', () => {
    const r = rankearImpacto(LINEAS.slice(0, 2), 1000, 5);
    expect(r.lineas).toHaveLength(2);
    expect(r.omitidas).toBe(0);
    expect(r.montoOmitido).toBe(0);
  });
});
