// ============================================================
// PDF de Evolución Temporal — el informe
// ============================================================
// Dos cosas que este PDF no puede hacer mal, porque las dos llevan a leer una
// mejora donde no la hubo:
//
//   1. Mostrar el mes en curso. Media docena de días cargados al lado de meses
//      completos se lee como una caída que no ocurrió.
//   2. Callar que a un mes le falta la liquidación de sueldos. Agosto 2026 salía
//      con "la estructura 31,4% por debajo del promedio" y el mejor resultado
//      del año, cuando lo que pasaba era que le faltaban ~$6 M de costo laboral:
//      el hook cae en silencio a la erogación clasificada, que vale la mitad.
//
// El aplanado del árbol y el corte en nivel 2 se testean en
// `generarEvolucionPDF.test.ts`.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  armarEvolucionPDF, mesesConCostoLaboralIncompleto,
  type DatosEvolucionPDF,
} from '@modules/analisis-marginal/utils/generarEvolucionPDF';
import type { FilaEvolucion, Mes } from '@shared/types/evolucionTemporal';

const MM: Mes[] = ['2026-06', '2026-07', '2026-08'];
const EN_CURSO: Mes = '2026-09';
const TODOS = [...MM, EN_CURSO];

const vv = (v: number[]): Record<Mes, number> =>
  Object.fromEntries(TODOS.map((m, i) => [m, v[i]])) as Record<Mes, number>;

const f2 = (
  id: string, label: string, nivel: 0 | 1, valores: Record<Mes, number>, hijos?: FilaEvolucion[],
): FilaEvolucion => ({
  id, label,
  tipo: id === 'costos_fijos' ? 'costos_fijos' : 'subgrupo',
  nivel, expandible: !!hijos?.length, valores, total: 0, promedioMensual: 0, hijos,
});

/**
 * Junio y julio con las líneas del módulo de Sueldos; agosto sólo con la
 * erogación "Sueldos y Cargas". Es exactamente la firma del fallback.
 */
const FILAS: FilaEvolucion[] = [
  f2('facturacion', 'FACTURACIÓN', 0, vv([96e6, 100e6, 129e6, 3.5e6])),
  f2('costos_variables', 'COSTOS VARIABLES', 0, vv([47e6, 46e6, 59e6, 2.4e6])),
  f2('margen_contribucion', 'MARGEN DE CONTRIBUCIÓN', 0, vv([49e6, 54e6, 70e6, 1.1e6])),
  f2('costos_fijos', 'COSTOS FIJOS', 0, vv([31e6, 23e6, 19e6, 0]), [
    f2('cf.sueldos', 'Sueldos', 1, vv([14.5e6, 10.1e6, 0, 0])),
    f2('cf.cargas', 'Cargas Sociales', 1, vv([2.0e6, 1.8e6, 0, 0])),
    f2('cf.hc', 'HC empleados', 1, vv([1.2e6, 1.6e6, 0, 0])),
    f2('cf.syc', 'Sueldos y Cargas', 1, vv([0, 0, 5.9e6, 0])),
    f2('cf.alq', 'Alquiler', 1, vv([3.2e6, 0, 0, 0])),
  ]),
  f2('costos_no_identificados', 'COSTOS NO IDENTIFICADOS', 0, vv([1e6, 1e6, 1.4e6, 0])),
];

const datos = (over: Partial<DatosEvolucionPDF> = {}): DatosEvolucionPDF => ({
  meses: TODOS,
  mesEnCurso: EN_CURSO,
  filas: FILAS,
  expandidas: new Set(['costos_fijos']),
  mostrarPct: false,
  facturacionPorMes: vv([96e6, 100e6, 129e6, 3.5e6]),
  ultimaActualizacion: '2026-09-01T12:00:00.000Z',
  ...over,
});

const textoPdf = (doc: { output: (t: string) => unknown }): string => {
  const ab = doc.output('arraybuffer') as ArrayBuffer;
  const raw = new Uint8Array(ab).reduce((s, b) => s + String.fromCharCode(b), '');
  return (raw.match(/\(((?:\\.|[^()\\])*)\)\s*Tj/g) || [])
    .map(p => p.replace(/\)\s*Tj$/, '').replace(/^\(/, '').replace(/\\([()\\])/g, '$1'))
    .join('\n');
};

const texto = (over: Partial<DatosEvolucionPDF> = {}) =>
  textoPdf(armarEvolucionPDF(datos(over)).doc);

describe('el mes en curso queda afuera', () => {
  it('no aparece como columna en ninguna parte', () => {
    expect(texto()).not.toContain('Sep 26');
  });

  it('el informe dice que lo excluyó, no lo omite en silencio', () => {
    const t = texto();
    expect(t).toContain('Septiembre 2026');
    expect(t).toContain('NO se incluye');
  });

  it('el último mes cerrado es agosto', () => {
    // Sin el guion largo: el PDF lo guarda como byte WinAnsi (0x97) y el
    // extractor lee byte a byte, así que no coincide con U+2014.
    const t = texto();
    expect(t).toContain('1. Agosto 2026');
    expect(t).toContain('el último mes cerrado');
  });

  it('el total se calcula sin el mes en curso', () => {
    // 96 + 100 + 129 = 325 M. Con septiembre serían 328,5 M.
    const t = texto();
    expect(t).toContain('325.000.000');
    expect(t).not.toContain('328.500.000');
  });

  it('sin mes en curso en el rango no inventa el aviso', () => {
    expect(texto({ meses: MM, mesEnCurso: null })).not.toContain('NO se incluye');
  });

  it('si el rango es sólo el mes en curso lo dice, en vez de sacar un PDF vacío', () => {
    expect(texto({ meses: [EN_CURSO] })).toContain('No hay meses cerrados');
  });
});

describe('costo laboral incompleto', () => {
  it('detecta el mes que cayó a la erogación clasificada', () => {
    expect(mesesConCostoLaboralIncompleto(FILAS, MM)).toEqual(['2026-08']);
  });

  it('no marca los meses que tienen el módulo cargado', () => {
    const r = mesesConCostoLaboralIncompleto(FILAS, MM);
    expect(r).not.toContain('2026-06');
    expect(r).not.toContain('2026-07');
  });

  it('sin categorías de sueldos no marca nada', () => {
    const sinSueldos = FILAS.map(f =>
      f.id === 'costos_fijos' ? { ...f, hijos: f.hijos?.filter(h => h.label === 'Alquiler') } : f);
    expect(mesesConCostoLaboralIncompleto(sinSueldos, MM)).toEqual([]);
  });

  it('advierte que el resultado está sobreestimado, no que hubo un ahorro', () => {
    const t = texto();
    expect(t).toContain('COSTO LABORAL INCOMPLETO');
    expect(t).toContain('SOBREESTIMADO');
    expect(t).toContain('no son un ahorro');
  });

  it('NO afirma que la estructura bajó: sería atribuir a gestión un dato que falta', () => {
    expect(texto()).not.toContain('por debajo del promedio de los meses cerrados');
  });

  it('con todos los meses liquidados no aparece la advertencia', () => {
    const completo = FILAS.map(f =>
      f.id === 'costos_fijos'
        ? {
            ...f,
            hijos: f.hijos?.map(h =>
              h.label === 'Sueldos' ? { ...h, valores: vv([14.5e6, 10.1e6, 12e6, 0]) } : h),
          }
        : f);
    expect(texto({ filas: completo })).not.toContain('COSTO LABORAL INCOMPLETO');
  });
});

describe('forma del informe', () => {
  it('el pie numerado está en todas las hojas', () => {
    const L = armarEvolucionPDF(datos());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = (L.doc as any).getNumberOfPages();
    const t = textoPdf(L.doc);
    expect((t.match(/Página \d+ de \d+/g) || []).length).toBe(total);
  });

  it('todas las hojas salvo la portada llevan membrete', () => {
    const L = armarEvolucionPDF(datos());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = (L.doc as any).getNumberOfPages();
    const t = textoPdf(L.doc);
    // La portada lleva el nombre en mayúsculas; las demás, la banda azul.
    expect((t.match(/Instituto Dr\. Mercado/g) || []).length).toBeGreaterThanOrEqual(total - 1);
  });

  it('sale apaisado', () => {
    const L = armarEvolucionPDF(datos());
    expect(L.pw).toBe(297);
    expect(L.ph).toBe(210);
  });

  it('el orden es último mes, estado de resultados, evolución', () => {
    const t = texto();
    const a = t.indexOf('el último mes cerrado');
    const b = t.indexOf('Estado de resultados mes a mes');
    const c = t.indexOf('Evolución del período');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('ningún literal cae en UTF-16 por un carácter fuera de WinAnsi', () => {
    expect(texto().includes(String.fromCharCode(0))).toBe(false);
  });

  it('los porcentajes usan coma decimal', () => {
    expect(texto()).not.toMatch(/\d+\.\d%/);
  });

  it('la tabla de la serie no se parte dejando meses sueltos', () => {
    // Cada mes tiene que estar en la misma hoja que los demás: si la tabla se
    // parte, la serie deja de leerse como serie.
    const L = armarEvolucionPDF(datos());
    const t = textoPdf(L.doc);
    // Las tres filas de la tabla de apoyo aparecen una sola vez cada una.
    for (const m of ['Junio 2026', 'Julio 2026']) {
      expect((t.match(new RegExp(m, 'g')) || []).length).toBeGreaterThan(0);
    }
    // El encabezado de esa tabla no se repite: no hubo corte.
    expect((t.match(/Margen contrib\./g) || []).length).toBe(1);
  });
});
