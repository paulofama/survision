// ============================================================
// Nombre corto de prestación, para que la tabla se pueda leer
// ============================================================
// Los casos salen de los nombres REALES de la base (122 distintos, 59 de más
// de 40 caracteres), no de ejemplos inventados.
// ============================================================

import { describe, it, expect } from 'vitest';
import { nombrePrestacionCorto, sinPrefijoCodigo } from '@modules/presupuestador/utils/nombrePrestacion';

describe('sinPrefijoCodigo', () => {
  it('saca el código que algunos registros traen adelante', () => {
    expect(sinPrefijoCodigo('030502 - Facoemulsificación mas Implante de Lio Premium Monofocal'))
      .toBe('Facoemulsificación mas Implante de Lio Premium Monofocal');
  });
  it('deja intacto el que no lo tiene', () => {
    expect(sinPrefijoCodigo('Mininuc')).toBe('Mininuc');
  });
  it('no confunde un número que no sea el prefijo', () => {
    expect(sinPrefijoCodigo('Yag Laser - Capsulotomia')).toBe('Yag Laser - Capsulotomia');
  });
});

describe('nombrePrestacionCorto', () => {
  // Las dos redacciones del MISMO código 030502 que conviven en la base.
  it('unifica las dos redacciones de la faco monofocal', () => {
    expect(nombrePrestacionCorto('Facoemulsificacion mas Implantes de Lio Monofocal'))
      .toBe('FACO + LIO MONOFOCAL');
    expect(nombrePrestacionCorto('030502 - Facoemulsificación mas Implante de Lio Premium Monofocal'))
      .toBe('FACO + LIO PREMIUM MONOFOCAL');
  });

  it('el lente queda visible, que es lo que distingue un presupuesto de otro', () => {
    expect(nombrePrestacionCorto('Facoemulsificacion mas Implante de Lio Basico')).toBe('FACO + LIO BÁSICO');
    expect(nombrePrestacionCorto('Facoemulsificacion mas Implante de Lio Torico monofocal')).toBe('FACO + LIO TÓRICO MONOFOCAL');
    expect(nombrePrestacionCorto('Facoemulsificacion mas Implante de Lio Rango Extendido Vivity')).toBe('FACO + LIO VIVITY');
    expect(nombrePrestacionCorto('Facoemulsificacion mas Implante de Lio PanOptix Pro')).toBe('FACO + LIO PANOPTIX PRO');
  });

  it('funciona sin acentos y sin importar mayúsculas', () => {
    expect(nombrePrestacionCorto('FACOEMULSIFICACION MAS IMPLANTE DE LIO BASICO')).toBe('FACO + LIO BÁSICO');
    expect(nombrePrestacionCorto('Facoemulsificación mas Implante de Lio Básico')).toBe('FACO + LIO BÁSICO');
  });

  it('otras prácticas frecuentes', () => {
    expect(nombrePrestacionCorto('Inyeccion Intravitrea de anti angiogenicos (Avastin)')).toBe('INTRAVÍTREA (AVASTIN)');
    expect(nombrePrestacionCorto('Cirugia de Pterigion (Con Injerto de Limbo)')).toBe('PTERIGIÓN C/INJERTO');
    expect(nombrePrestacionCorto('030002 - Yag Laser - Capsulotomía')).toBe('YAG LÁSER — CAPSULOTOMÍA');
    expect(nombrePrestacionCorto('030003 - Foto Coagulación Laser Diodo 1 Sesión')).toBe('FOTOCOAGULACIÓN LÁSER');
  });

  it('el orden de los patrones importa: gana el más específico', () => {
    // "tórico monofocal" no puede caer en el patrón de "monofocal" a secas.
    expect(nombrePrestacionCorto('Faco mas Lio Torico Monofocal')).toBe('FACO + LIO TÓRICO MONOFOCAL');
    // Una faco sin lente identificable no inventa un lente.
    expect(nombrePrestacionCorto('Facoemulsificacion simple')).toBe('FACO');
  });

  it('lo que no matchea vuelve COMPLETO, no truncado', () => {
    // Preferimos un nombre largo a uno abreviado mal.
    const raro = 'Otra prestación (especificar en comentarios)';
    expect(nombrePrestacionCorto(raro)).toBe(raro);
  });

  it('tolera vacío y nulo', () => {
    expect(nombrePrestacionCorto('')).toBe('');
    expect(nombrePrestacionCorto(null)).toBe('');
    expect(nombrePrestacionCorto(undefined)).toBe('');
  });

  it('todos los cortos entran en la columna', () => {
    const ejemplos = [
      'Facoemulsificación mas Implante de Lio Premium Monofocal',
      'Facoemulsificacion mas Implante de Lio Rango Extendido Vivity',
      'Inyeccion Intravitrea de anti angiogenicos (Avastin)',
      'Cirugia de Pterigion (Con Injerto de Limbo)',
      'Yag Laser - Capsulotomia',
    ];
    for (const e of ejemplos) {
      expect(nombrePrestacionCorto(e).length, e).toBeLessThanOrEqual(30);
    }
  });
});
