// ============================================================
// Tests del cálculo de honorarios
// ============================================================
//
// Dos exclusiones, las dos por decisión de negocio:
//
//   1. La institución no se paga honorarios a sí misma. Antes se le
//      computaban $108.995.444 sobre facturación propia (SURVISION en dos
//      grafías), inflando el costo variable.
//
//   2. Sobre un INSUMO facturado como práctica (código 04xxxx) no se cobra
//      honorario — definido por Paulo el 25/08/2026. Esas filas traen un
//      cirujano asignado, así que el cálculo se las aplicaba.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calcularHonorarioPrestacion,
  generaHonorario,
  clavePrestador,
} from '@shared/utils/honorariosPrestador';

const CIRUGIAS = { porcentaje_socio: 40, porcentaje_no_socio: 33 };
const CONSULTAS = { porcentaje_socio: 60, porcentaje_no_socio: 50 };

describe('generaHonorario', () => {
  it('un médico genera honorario', () => {
    expect(generaHonorario('MAHIA PABLO DANIEL')).toBe(true);
  });

  it('la institución no, en cualquiera de sus grafías', () => {
    expect(generaHonorario('SURVISION')).toBe(false);
    expect(generaHonorario('SurVision')).toBe(false);
    expect(clavePrestador('SURVISION')).toBe(clavePrestador('SurVision'));
  });

  it('los marcadores operativos tampoco', () => {
    expect(generaHonorario('S/D')).toBe(false);
    expect(generaHonorario('Sin Prestador')).toBe(false);
    expect(generaHonorario(null)).toBe(false);
    expect(generaHonorario('')).toBe(false);
  });
});

describe('calcularHonorarioPrestacion', () => {
  it('aplica el porcentaje del segmento según sea socio o no', () => {
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, CIRUGIAS, '030614')).toBe(400);
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', false, CIRUGIAS, '030614')).toBe(330);
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, CONSULTAS, '010102')).toBe(600);
  });

  it('NO cobra honorario sobre un insumo facturado como práctica (04)', () => {
    // Las 9 filas de "Insumo Puntum Plug" traen cirujano asignado; sin esta
    // regla se les calculaba honorario como a cualquier acto profesional.
    expect(calcularHonorarioPrestacion(403700, 'ROCA LEANDRO NICOLAS', true, CIRUGIAS, '040109')).toBe(0);
    expect(calcularHonorarioPrestacion(293000, 'MAHIA PABLO DANIEL', false, CIRUGIAS, '040108')).toBe(0);
  });

  it('la exclusión del insumo también vale con el código sin cero inicial', () => {
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, CIRUGIAS, '40109')).toBe(0);
  });

  it('no computa honorario sobre facturación de la institución', () => {
    expect(calcularHonorarioPrestacion(1000, 'SURVISION', true, CIRUGIAS, '030614')).toBe(0);
  });

  it('devuelve 0 si no hay configuración para el segmento', () => {
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, null, '030614')).toBe(0);
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, undefined, '030614')).toBe(0);
  });

  it('una práctica normal sin código sigue cobrando honorario', () => {
    // El fallback de 2024: sin código no hay forma de saber si es insumo, y
    // los nomencladores viejos no tienen prefijo 04.
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, CIRUGIAS, null)).toBe(400);
    expect(calcularHonorarioPrestacion(1000, 'MAHIA PABLO', true, CIRUGIAS, '')).toBe(400);
  });
});
