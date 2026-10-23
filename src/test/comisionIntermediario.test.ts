import { describe, it, expect } from 'vitest';
import {
  comisionIntermediario,
  comisionDePrestacion,
  porcentajeIntermediarioVigente,
} from '@shared/utils/comisionIntermediario';
import type { ConfigComisionIntermediario } from '@shared/utils/comisionIntermediario';

const SANCOR = 8111;
const OSEP = 8094;

const cfg: ConfigComisionIntermediario = {
  porcentajes: [
    { intermediario: 'circulo_medico', porcentaje: 7.2, vigencia_desde: '2000-01-01' },
    { intermediario: 'circulo_medico', porcentaje: 6, vigencia_desde: '2026-11-15' },
  ],
  osIntermediario: new Map([[SANCOR, 'circulo_medico']]),
};

describe('comisión del Círculo Médico', () => {
  it('aplica el porcentaje sobre la cobertura de una obra social del Círculo', () => {
    expect(comisionIntermediario(cfg, SANCOR, 100_000, '2026-09')).toBeCloseTo(7_200, 6);
  });

  it('las obras sociales directas no pagan comisión', () => {
    expect(comisionIntermediario(cfg, OSEP, 100_000, '2026-09')).toBe(0);
    expect(comisionIntermediario(cfg, null, 100_000, '2026-09')).toBe(0);
  });

  it('una versión que empieza a mitad de mes ya rige para ese mes', () => {
    expect(porcentajeIntermediarioVigente(cfg.porcentajes, 'circulo_medico', '2026-10')).toBe(7.2);
    expect(porcentajeIntermediarioVigente(cfg.porcentajes, 'circulo_medico', '2026-11')).toBe(6);
  });

  it('sin versión vigente no inventa un porcentaje', () => {
    expect(porcentajeIntermediarioVigente([], 'circulo_medico', '2026-09')).toBe(0);
  });

  it('una prestación usa su propio mes, no el del cierre del período', () => {
    const prest = { os_id: SANCOR, cobertura: 50_000, anio: 2026, mes_numero: 12 };
    expect(comisionDePrestacion(cfg, prest)).toBeCloseTo(3_000, 6);
    expect(comisionDePrestacion(cfg, { ...prest, mes_numero: 9 })).toBeCloseTo(3_600, 6);
  });
});
