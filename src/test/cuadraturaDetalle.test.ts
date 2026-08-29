// ============================================================
// Tests de la cuadratura del detalle (Evolución Temporal)
// ============================================================

import { describe, it, expect } from 'vitest';
import { cuadrarDetalle, TOLERANCIA } from '@shared/utils/cuadraturaDetalle';
import type { FilaEvolucion, Mes } from '@shared/types/evolucionTemporal';

const MESES: Mes[] = ['2026-01', '2026-02', '2026-03'];

const fila = (id: string, valores: Partial<Record<Mes, number>>): FilaEvolucion => ({
  id,
  tipo: 'comprobante',
  nivel: 2,
  label: id,
  expandible: false,
  valores: { '2026-01': 0, '2026-02': 0, '2026-03': 0, ...valores } as Record<Mes, number>,
  total: Object.values(valores).reduce<number>((s, v) => s + (Number(v) || 0), 0),
  promedioMensual: 0,
});

describe('cuadrarDetalle', () => {
  it('no agrega fila de diferencia cuando el detalle cierra exacto', () => {
    const filas = [
      fila('a', { '2026-01': 1000, '2026-02': 2000 }),
      fila('b', { '2026-01': 500, '2026-03': 300 }),
    ];
    const total = { '2026-01': 1500, '2026-02': 2000, '2026-03': 300 } as Record<Mes, number>;

    const r = cuadrarDetalle(filas, total, MESES, 'Servicios');

    expect(r.filaDiferencia).toBeNull();
    expect(r.desvios).toHaveLength(0);
  });

  it('detecta el desvío y lo expone en la fila de diferencia, por mes', () => {
    const filas = [fila('a', { '2026-01': 1000, '2026-02': 2000 })];
    const total = { '2026-01': 1500, '2026-02': 2000, '2026-03': 800 } as Record<Mes, number>;

    const r = cuadrarDetalle(filas, total, MESES, 'Servicios');

    expect(r.desvios).toHaveLength(2);
    expect(r.filaDiferencia).not.toBeNull();
    // el faltante va SOLO en los meses que no cuadran
    expect(r.filaDiferencia!.valores['2026-01']).toBe(500);
    expect(r.filaDiferencia!.valores['2026-02']).toBe(0);
    expect(r.filaDiferencia!.valores['2026-03']).toBe(800);
    expect(r.filaDiferencia!.total).toBe(1300);
    expect(r.filaDiferencia!.tipo).toBe('diferencia');
  });

  it('ignora diferencias por debajo de la tolerancia de un centavo', () => {
    const filas = [fila('a', { '2026-01': 1000 })];
    const total = { '2026-01': 1000 + TOLERANCIA / 2, '2026-02': 0, '2026-03': 0 } as Record<Mes, number>;

    const r = cuadrarDetalle(filas, total, MESES, 'Servicios');

    expect(r.filaDiferencia).toBeNull();
  });

  it('detecta diferencias negativas (el detalle suma de más)', () => {
    const filas = [fila('a', { '2026-01': 2000 })];
    const total = { '2026-01': 1500, '2026-02': 0, '2026-03': 0 } as Record<Mes, number>;

    const r = cuadrarDetalle(filas, total, MESES, 'Servicios');

    expect(r.filaDiferencia!.valores['2026-01']).toBe(-500);
    expect(r.desvios[0].diferencia).toBe(-500);
  });

  it('cuando está truncado, rotula la fila como resto no listado', () => {
    const filas = [fila('a', { '2026-01': 1000 })];
    const total = { '2026-01': 5000, '2026-02': 0, '2026-03': 0 } as Record<Mes, number>;

    const normal = cuadrarDetalle(filas, total, MESES, 'Facturación', false);
    const truncada = cuadrarDetalle(filas, total, MESES, 'Facturación', true);

    expect(normal.filaDiferencia!.label).toContain('Sin detalle');
    expect(truncada.filaDiferencia!.label).toContain('Resto no listado');
    // el importe es el mismo: cambia el rótulo, no el número
    expect(truncada.filaDiferencia!.total).toBe(normal.filaDiferencia!.total);
  });

  it('un detalle vacío expone el total completo como diferencia', () => {
    const total = { '2026-01': 1200, '2026-02': 0, '2026-03': 0 } as Record<Mes, number>;

    const r = cuadrarDetalle([], total, MESES, 'Alquiler');

    expect(r.filaDiferencia!.total).toBe(1200);
  });
});
