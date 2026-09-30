// ============================================================
// CUIL — validador y formato
// ============================================================
// El algoritmo es el de AFIP: peso fijo por posición, módulo 11, y la
// convención de que resto 1 da verificador 9.
//
// Los CUIL de acá son ARMADOS para el test —se calculó el verificador con el
// mismo algoritmo— y no corresponden a ninguna persona real.
// ============================================================

import { describe, it, expect } from 'vitest';
import { cuilValido, formatearCuil } from '@modules/sueldos/utils/cuil';

describe('cuilValido', () => {
  it('acepta un CUIL con el verificador correcto, con guiones o pegado', () => {
    // 20-12345678: 2*5+0*4+1*3+2*2+3*7+4*6+5*5+6*4+7*3+8*2 = 148
    // 148 % 11 = 5 -> verificador 11-5 = 6
    expect(cuilValido('20-12345678-6')).toBe(true);
    expect(cuilValido('20123456786')).toBe(true);
  });

  it('rechaza un CUIL con el verificador cambiado', () => {
    expect(cuilValido('20-12345678-5')).toBe(false);
  });

  it('rechaza prefijos que AFIP no emite', () => {
    // Mismo cuerpo, prefijo inválido: no llega a mirar el verificador.
    expect(cuilValido('21-12345678-6')).toBe(false);
    expect(cuilValido('99-12345678-6')).toBe(false);
  });

  it('acepta los siete prefijos válidos', () => {
    for (const p of ['20', '23', '24', '27', '30', '33', '34']) {
      const cuerpo = '12345678';
      const d = p + cuerpo;
      const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      let suma = 0;
      for (let i = 0; i < 10; i++) suma += parseInt(d[i]!, 10) * mult[i]!;
      const mod = suma % 11;
      const v = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
      expect(cuilValido(`${d}${v}`)).toBe(true);
    }
  });

  it('rechaza lo que no tiene once dígitos', () => {
    expect(cuilValido('')).toBe(false);
    expect(cuilValido('2012345678')).toBe(false);
    expect(cuilValido('201234567845')).toBe(false);
  });

  it('ignora cualquier separador, no sólo el guión', () => {
    expect(cuilValido('20 12345678 6')).toBe(true);
    expect(cuilValido('20.12345678.6')).toBe(true);
  });
});

describe('formatearCuil', () => {
  it('pone los guiones cuando hay once dígitos', () => {
    expect(formatearCuil('20123456786')).toBe('20-12345678-6');
  });

  it('deja la entrada como está si todavía no hay once dígitos', () => {
    // Es lo que hace que el campo no pelee con el usuario mientras escribe.
    expect(formatearCuil('2012')).toBe('2012');
    expect(formatearCuil('')).toBe('');
  });

  it('reformatea aunque ya venga con separadores', () => {
    expect(formatearCuil('20 12345678 6')).toBe('20-12345678-6');
  });
});
