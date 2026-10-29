import { describe, it, expect } from 'vitest';
import {
  MEDICOS_PRESUPUESTO,
  DERIVADORES_PRESUPUESTO,
  nombreMedicoPresupuesto,
} from '@shared/utils/medicosPresupuesto';

describe('médicos del Presupuestador', () => {
  it('cada médico está atado a un ID de GECLISA distinto (clave del pase a la tabla única)', () => {
    const ids = MEDICOS_PRESUPUESTO.map((m) => m.geclisaPreId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('los códigos guardados en presupuestos viejos siguen existiendo', () => {
    const codigos = MEDICOS_PRESUPUESTO.map((m) => m.value);
    for (const c of ['sd', 'survision', 'dr_mahia', 'dr_musa', 'dr_roca', 'dr_mercado', 'dr_oliva']) {
      expect(codigos).toContain(c);
    }
  });

  it('incluye a las Dras. Oliva y Arias con su ID de GECLISA', () => {
    expect(MEDICOS_PRESUPUESTO.find((m) => m.value === 'dr_oliva')?.geclisaPreId).toBe(17);
    expect(MEDICOS_PRESUPUESTO.find((m) => m.value === 'dr_arias')?.geclisaPreId).toBe(18);
  });

  it('los derivadores son los médicos más el Dr. López y "Sin derivador"', () => {
    expect(DERIVADORES_PRESUPUESTO[0]).toEqual({ value: '', label: 'Sin derivador' });
    expect(DERIVADORES_PRESUPUESTO.map((d) => d.value)).toContain('dr_lopez');
    expect(DERIVADORES_PRESUPUESTO).toHaveLength(MEDICOS_PRESUPUESTO.length + 2);
  });

  it('muestra el nombre real, y un código desconocido tal cual', () => {
    expect(nombreMedicoPresupuesto('dr_oliva')).toBe('Dra. Ignacia Oliva');
    expect(nombreMedicoPresupuesto('dr_lopez')).toBe('Dr. Jorge Lopez');
    expect(nombreMedicoPresupuesto('dr_nuevo')).toBe('dr_nuevo');
    expect(nombreMedicoPresupuesto(null)).toBe('Sin prestador');
  });
});
