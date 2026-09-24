// ============================================================
// Comisiones — los parámetros y sus vigencias
// ============================================================
// Lo que se prueba acá es que el pasado no se pueda recalcular: un movimiento
// devengado en septiembre tiene que seguir mirando la tasa de septiembre
// aunque en octubre alguien cargue otra. Y que el régimen no se encienda solo.
//
// El caso de `honorarios_config` está fresco: tenía un UNIQUE por segmento, y
// cada vez que alguien tocaba un porcentaje reescribía toda la historia hacia
// atrás (migraciones 54 y 55). Esto es el mismo problema, un módulo después.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  PARAMETROS_VACIOS,
  estadoRegimen,
  fechaDesdeNumero,
  fechaLocal,
  fechaVigenciaRegimen,
  parametrosVigentes,
} from '@modules/comisiones/core/parametros.mjs';

const fila = (clave: string, valor: number, vigencia_desde: string) => ({ clave, valor, vigencia_desde });

/** Lo que va a haber en la tabla el día que la Dirección encienda el régimen. */
const TABLA = [
  fila('dias_para_frio', 45, '2000-01-01'),
  fila('ventana_recupero_dias', 60, '2000-01-01'),
  fila('fecha_vigencia_regimen', 20261001, '2000-01-01'),
  fila('tasa_comision', 3, '2026-10-01'),
  fila('participantes_pct', 30, '2026-10-01'),
  fila('recuperador_pct', 50, '2026-10-01'),
];

describe('parametrosVigentes', () => {
  it('toma la fila vigente a esa fecha, no la última cargada', () => {
    const conAumento = [...TABLA, fila('tasa_comision', 4, '2027-01-01')];
    // Una cirugía de diciembre se paga al 3 %, aunque en enero la tasa sea 4.
    expect(parametrosVigentes(conAumento, '2026-12-15').tasaComision).toBe(3);
    expect(parametrosVigentes(conAumento, '2027-01-01').tasaComision).toBe(4);
  });

  it('antes de la primera vigencia, la tasa es CERO — no la primera que aparezca', () => {
    // Con tasa 0 el cálculo no devenga nada. Es la diferencia entre "todavía
    // no está configurado" y "es gratis".
    expect(parametrosVigentes(TABLA, '2026-09-30').tasaComision).toBe(0);
    expect(parametrosVigentes(TABLA, '2026-10-01').tasaComision).toBe(3);
  });

  it('los plazos siguen vigentes aunque la tasa todavía no', () => {
    const p = parametrosVigentes(TABLA, '2026-09-30');
    expect(p.diasParaFrio).toBe(45);
    expect(p.ventanaRecuperoDias).toBe(60);
  });

  it('con dos vigencias el mismo día gana la más nueva de la lista ordenada', () => {
    const p = parametrosVigentes([fila('tasa_comision', 3, '2026-10-01'), fila('tasa_comision', 5, '2026-11-01')], '2026-12-01');
    expect(p.tasaComision).toBe(5);
  });

  it('ignora claves que no conoce en vez de romperse', () => {
    expect(parametrosVigentes([fila('clave_inventada', 99, '2000-01-01')], '2026-10-01')).toEqual(PARAMETROS_VACIOS);
  });

  it('sin filas, sin fecha o con basura devuelve todo en cero', () => {
    expect(parametrosVigentes([], '2026-10-01')).toEqual(PARAMETROS_VACIOS);
    expect(parametrosVigentes(TABLA, null)).toEqual(PARAMETROS_VACIOS);
    expect(parametrosVigentes(null, '2026-10-01')).toEqual(PARAMETROS_VACIOS);
  });

  it('acepta la vigencia como timestamp completo, que es como la manda PostgREST', () => {
    const p = parametrosVigentes([{ clave: 'tasa_comision', valor: '3', vigencia_desde: '2026-10-01T00:00:00+00:00' }], '2026-10-01');
    expect(p.tasaComision).toBe(3);
  });
});

describe('fechaDesdeNumero', () => {
  it('convierte el entero de la columna numérica', () => {
    expect(fechaDesdeNumero(20261001)).toBe('2026-10-01');
    expect(fechaDesdeNumero('20260115')).toBe('2026-01-15');
  });

  it('rechaza lo que no sea una fecha de 8 dígitos', () => {
    expect(fechaDesdeNumero(2026)).toBeNull();
    expect(fechaDesdeNumero(0)).toBeNull();
    expect(fechaDesdeNumero(null)).toBeNull();
    expect(fechaDesdeNumero('hola')).toBeNull();
    expect(fechaDesdeNumero(20261301)).toBeNull(); // mes 13
  });
});

describe('fechaLocal — el día argentino, no el día UTC', () => {
  it('las 21:30 de Mendoza siguen siendo el mismo día', () => {
    // 2026-09-24 21:30 ART = 2026-09-25 00:30 UTC. Cortar el ISO daría el 25.
    expect(fechaLocal('2026-09-25T00:30:00.000Z')).toBe('2026-09-24');
  });

  it('una fecha de mediodía no se mueve', () => {
    expect(fechaLocal('2026-09-24T15:00:00.000Z')).toBe('2026-09-24');
  });

  it('sin fecha o con basura devuelve null', () => {
    expect(fechaLocal(null)).toBeNull();
    expect(fechaLocal('no es una fecha')).toBeNull();
  });
});

describe('fechaVigenciaRegimen', () => {
  it('lee el piso del régimen', () => {
    expect(fechaVigenciaRegimen(TABLA)).toBe('2026-10-01');
  });

  it('sin la fila, el régimen no está vigente', () => {
    expect(fechaVigenciaRegimen(TABLA.filter((f) => f.clave !== 'fecha_vigencia_regimen'))).toBeNull();
  });

  it('si hubiera dos, gana la más vieja: nadie queda afuera retroactivamente', () => {
    const dos = [...TABLA, fila('fecha_vigencia_regimen', 20270101, '2026-12-01')];
    expect(fechaVigenciaRegimen(dos)).toBe('2026-10-01');
  });
});

describe('estadoRegimen — nace inerte y hacen falta tres cosas', () => {
  it('con todo cargado y alguien marcado, está activo', () => {
    expect(estadoRegimen(TABLA, { comisionables: 2 })).toMatchObject({ activo: true, desde: '2026-10-01' });
  });

  it('sin fecha de vigencia no devenga, aunque haya tasa y gente', () => {
    const r = estadoRegimen(TABLA.filter((f) => f.clave !== 'fecha_vigencia_regimen'), { comisionables: 5 });
    expect(r.activo).toBe(false);
    expect(r.motivo).toMatch(/fecha_vigencia_regimen/);
  });

  it('sin tasa no devenga, aunque la fecha esté', () => {
    const r = estadoRegimen(TABLA.filter((f) => f.clave !== 'tasa_comision'), { comisionables: 5 });
    expect(r.activo).toBe(false);
    expect(r.motivo).toMatch(/tasa_comision/);
  });

  it('sin nadie marcado no devenga', () => {
    const r = estadoRegimen(TABLA, { comisionables: 0 });
    expect(r.activo).toBe(false);
    expect(r.motivo).toMatch(/comisionable/);
  });

  it('la tabla tal como la dejó la migración 56 está apagada', () => {
    // Sólo los dos plazos. Es el estado real de la base hoy.
    const recienMigrada = TABLA.filter((f) => ['dias_para_frio', 'ventana_recupero_dias'].includes(f.clave));
    expect(estadoRegimen(recienMigrada, { comisionables: 0 }).activo).toBe(false);
    expect(estadoRegimen(recienMigrada, { comisionables: 99 }).activo).toBe(false);
  });
});
