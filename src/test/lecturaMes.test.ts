// ============================================================
// Reglas de lectura del mes — que no inventen y que no callen
// ============================================================
// Lo que hay que garantizar: que cada viñeta salga sólo cuando su condición
// numérica se cumple, y que si no se cumple ninguna, el informe no escriba nada
// en vez de rellenar con adjetivos.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  leerMes, catalogoReglas, UMBRALES, type ContextoLectura,
} from '../modules/analisis-marginal/utils/lecturaMes';

/** Mes plano: ninguna regla debería dispararse. */
const NEUTRO: ContextoLectura = {
  mesEtiqueta: 'Agosto 2026',
  mesAnteriorEtiqueta: 'Julio 2026',
  varFacturacion: 0.5,
  varCantidad: 0.3,
  varTicket: 0.2,
  varCostosFijos: 1,
  varCostosFijosVsPromedio: 2,
  margenPct: 54.2,
  margenPctAnterior: 54.0,
  resultadoOperativo: 31_000_000,
  resultadoOperativoPct: 30.9,
  segmentos: [
    { nombre: 'Consultas', cantidad: 1332, varCantidad: -1 },
    { nombre: 'Estudios', cantidad: 18, varCantidad: 2 },
    { nombre: 'Cirugías', cantidad: 65, varCantidad: 1 },
  ],
  obraSocialTop: { nombre: 'OSEP', participacion: 25 },
  coberturaReceta: 97.5,
  categoriasSimuladas: [],
  sinClasificar: 0,
};

const con = (over: Partial<ContextoLectura>): ContextoLectura => ({ ...NEUTRO, ...over });
const claves = (c: ContextoLectura, max = 99) => leerMes(c, max).map(l => l.regla);

describe('leerMes — silencio cuando no hay nada que decir', () => {
  it('un mes sin desvíos no genera ninguna viñeta', () => {
    expect(leerMes(NEUTRO)).toEqual([]);
  });
});

describe('volumen contra precio', () => {
  it('facturación cae fuerte con cantidad estable → es mix/precio', () => {
    const r = claves(con({ varFacturacion: -8, varCantidad: -1 }));
    expect(r).toContain('caida_por_mix');
    expect(r).not.toContain('caida_por_volumen');
  });

  it('no se dispara si la cantidad también cayó', () => {
    expect(claves(con({ varFacturacion: -8, varCantidad: -7 }))).not.toContain('caida_por_mix');
  });

  it('justo en el umbral de facturación no dispara', () => {
    const r = claves(con({ varFacturacion: -UMBRALES.FACTURACION_MATERIAL, varCantidad: 0 }));
    expect(r).not.toContain('caida_por_mix');
  });

  it('cantidad cae con ticket estable → es volumen', () => {
    const r = claves(con({ varCantidad: -9, varTicket: 0.5, varFacturacion: -9 }));
    expect(r).toContain('caida_por_volumen');
  });

  it('más prácticas al mismo ticket → crecimiento de actividad', () => {
    const r = claves(con({ varCantidad: 8, varTicket: 0.5, varFacturacion: 8 }));
    expect(r).toContain('crecimiento_por_volumen');
  });

  it('más facturación sin más prácticas → precio o mezcla', () => {
    const r = claves(con({ varFacturacion: 12, varCantidad: 0.5, varTicket: 11 }));
    expect(r).toContain('crecimiento_por_precio');
  });
});

describe('rentabilidad', () => {
  it('el margen que cae más del umbral en pp se reporta', () => {
    const r = claves(con({ margenPct: 50, margenPctAnterior: 54 }));
    expect(r).toContain('margen_cae');
  });

  it('una caída de margen menor al umbral no se reporta', () => {
    const r = claves(con({ margenPct: 53, margenPctAnterior: 54 }));
    expect(r).not.toContain('margen_cae');
  });

  it('resultado operativo negativo es alerta', () => {
    const l = leerMes(con({ resultadoOperativo: -1_000_000, resultadoOperativoPct: -3.2 }), 99);
    const neg = l.find(x => x.regla === 'resultado_negativo');
    expect(neg).toBeDefined();
    expect(neg!.tono).toBe('alerta');
  });
});

describe('costos', () => {
  it('costos fijos que suben más del umbral', () => {
    expect(claves(con({ varCostosFijos: 18 }))).toContain('costos_fijos_suben');
  });

  it('desvío contra el promedio, en los dos sentidos', () => {
    expect(claves(con({ varCostosFijosVsPromedio: 22 }))).toContain('costos_fijos_vs_promedio');
    expect(claves(con({ varCostosFijosVsPromedio: -22 }))).toContain('costos_fijos_vs_promedio');
  });
});

describe('concentración y segmentos', () => {
  it('una obra social que pasa el umbral de participación', () => {
    const r = claves(con({ obraSocialTop: { nombre: 'OSEP', participacion: 62 } }));
    expect(r).toContain('concentracion_obra_social');
  });

  it('sin obra social top no rompe', () => {
    expect(() => leerMes(con({ obraSocialTop: null }))).not.toThrow();
  });

  it('reporta el segmento que más cayó, no todos', () => {
    const l = leerMes(con({
      segmentos: [
        { nombre: 'Consultas', cantidad: 1000, varCantidad: -20 },
        { nombre: 'Estudios', cantidad: 10, varCantidad: -40 },
        { nombre: 'Cirugías', cantidad: 60, varCantidad: 0 },
      ],
    }), 99);
    const seg = l.filter(x => x.regla === 'segmento_cae');
    expect(seg).toHaveLength(1);
    expect(seg[0].texto).toContain('Estudios');
  });

  it('un segmento vacío no genera viñeta', () => {
    const r = claves(con({
      segmentos: [{ nombre: 'Estudios', cantidad: 0, varCantidad: -100 }],
    }));
    expect(r).not.toContain('segmento_cae');
  });
});

describe('calidad del dato', () => {
  it('las categorías simuladas se declaran como alerta', () => {
    const l = leerMes(con({ categoriasSimuladas: ['Sueldos y Cargas'] }), 99);
    const sim = l.find(x => x.regla === 'dato_simulado');
    expect(sim).toBeDefined();
    expect(sim!.tono).toBe('alerta');
    expect(sim!.texto).toContain('ESTIMADO');
  });

  it('cobertura de receta baja se reporta', () => {
    expect(claves(con({ coberturaReceta: 62 }))).toContain('cobertura_receta_baja');
  });

  it('cobertura alta no se reporta', () => {
    expect(claves(con({ coberturaReceta: 97 }))).not.toContain('cobertura_receta_baja');
  });
});

describe('orden y tope', () => {
  it('las alertas van primero', () => {
    const l = leerMes(con({
      resultadoOperativo: -1, resultadoOperativoPct: -1,
      varFacturacion: -20, varCantidad: 0,
      categoriasSimuladas: ['Sueldos y Cargas'],
    }), 99);
    expect(l[0].tono).toBe('alerta');
  });

  it('respeta el tope de viñetas', () => {
    const muchas = con({
      varFacturacion: -20, varCantidad: -0.5, varTicket: -19,
      margenPct: 40, margenPctAnterior: 54,
      varCostosFijos: 30, varCostosFijosVsPromedio: 40,
      resultadoOperativo: -1, resultadoOperativoPct: -1,
      obraSocialTop: { nombre: 'OSEP', participacion: 70 },
      coberturaReceta: 50,
      categoriasSimuladas: ['Sueldos y Cargas'],
    });
    expect(leerMes(muchas, 5)).toHaveLength(5);
    expect(leerMes(muchas, 99).length).toBeGreaterThan(5);
  });
});

describe('catálogo', () => {
  it('cada regla documenta su umbral', () => {
    const cat = catalogoReglas();
    expect(cat.length).toBeGreaterThan(8);
    cat.forEach(r => {
      expect(r.clave).toBeTruthy();
      expect(r.descripcion.length).toBeGreaterThan(20);
    });
  });
});
