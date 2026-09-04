// ============================================================
// Informe Mensual de Gestión — armado y guardas de render
// ============================================================
// Lo que se verifica acá es lo que no se puede ver a ojo sin abrir el PDF:
// que las cantidades cierren contra el total en los tres cortes, que el mes en
// curso no entre nunca, que la simulación se declare, y que ningún literal
// caiga en UTF-16 por un carácter fuera de WinAnsi.
// ============================================================

import { describe, it, expect } from 'vitest';
import type { EvolucionMensualData, FilaEvolucion, Mes } from '../shared/types/evolucionTemporal';
import type { MovGecRow } from '../shared/utils/movimientosAgg';
import {
  armarDatosInformeMensual, etiquetaMes, indexarFilas,
  type SimulacionSueldos,
} from '../modules/analisis-marginal/utils/datosInformeMensual';
import { armarInformeMensual, nombreArchivo } from '../modules/analisis-marginal/utils/generarInformeMensual';

const MESES: Mes[] = ['2026-05', '2026-06', '2026-07', '2026-08'];
const EN_CURSO: Mes = '2026-09';

const vals = (v: number[]): Record<Mes, number> =>
  Object.fromEntries(MESES.map((m, i) => [m, v[i]])) as Record<Mes, number>;

const fila = (
  id: string, label: string, nivel: 0 | 1, valores: Record<Mes, number>, hijos?: FilaEvolucion[],
): FilaEvolucion => ({
  id, label, tipo: 'subgrupo', nivel, expandible: !!hijos?.length,
  valores, total: 0, promedioMensual: 0, hijos,
});

const FILAS: FilaEvolucion[] = [
  fila('facturacion', 'FACTURACIÓN', 0, vals([80e6, 96e6, 100e6, 129e6]), [
    fila('facturacion.consultas', 'Consultas', 1, vals([50e6, 60e6, 62e6, 43e6])),
    fila('facturacion.estudios', 'Estudios', 1, vals([5e6, 6e6, 3e6, 1e6])),
    fila('facturacion.cirugias', 'Cirugías', 1, vals([25e6, 30e6, 35e6, 85e6])),
  ]),
  fila('costos_variables', 'COSTOS VARIABLES', 0, vals([40e6, 47e6, 46e6, 59e6]), [
    fila('cv.honorarios', 'Honorarios prestadores', 1, vals([30e6, 35e6, 34e6, 44e6])),
    fila('cv.pools', 'Costos de pools', 1, vals([4e6, 5e6, 4.5e6, 6e6])),
    fila('cv.insumos', 'Insumos directos', 1, vals([6e6, 7e6, 7.5e6, 9e6])),
  ]),
  fila('margen_contribucion', 'MARGEN DE CONTRIBUCIÓN', 0, vals([40e6, 49e6, 54e6, 70e6])),
  fila('costos_fijos', 'COSTOS FIJOS', 0, vals([28e6, 31e6, 23e6, 24e6]), [
    fila('cf.sueldos', 'Sueldos y Cargas', 1, vals([11e6, 16e6, 12e6, 5.9e6])),
    fila('cf.alquiler', 'Alquileres', 1, vals([17e6, 15e6, 11e6, 18.1e6])),
  ]),
  fila('costos_no_identificados', 'COSTOS NO IDENTIFICADOS', 0, vals([1e6, 1e6, 1e6, 1e6])),
];

const EVOLUCION: EvolucionMensualData = {
  meses: [...MESES, EN_CURSO],
  mesesCerrados: MESES,      // septiembre queda afuera: es el mes en curso
  mesEnCurso: EN_CURSO,
  filas: FILAS,
  ultimaActualizacion: '2026-09-01T00:00:00.000Z',
  coberturaReceta: Object.fromEntries([...MESES, EN_CURSO].map(m => [m, 97.5])) as Record<Mes, number>,
  advertencias: [],
};

/** Genera N atenciones de un mes, repartidas entre segmentos y obras sociales. */
const movs = (anio: number, mes: number, n: number, codigoBase = '0101'): MovGecRow[] =>
  Array.from({ length: n }, (_, i) => ({
    anio, mes,
    os_id: i % 3, os_sigla: ['OSEP', 'PART', 'OSDE'][i % 3], os_nombre: null,
    practica_codigo: i % 10 === 0 ? '030501' : i % 7 === 0 ? '020101' : codigoBase,
    practica_nombre: i % 10 === 0 ? 'Facoemulsificacion' : i % 7 === 0 ? 'Campo Visual' : 'Exoftalmologia',
    pre_id: i % 2, prestador_nombre: ['MERCADO JORGE', 'MAHIA PABLO'][i % 2],
    total: 50_000 + (i % 5) * 1_000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any as MovGecRow[];

const MOVIMIENTOS: MovGecRow[] = [
  ...movs(2026, 5, 120), ...movs(2026, 6, 140),
  ...movs(2026, 7, 150), ...movs(2026, 8, 130),
  // Septiembre existe en la base pero NO tiene que entrar al informe.
  ...movs(2026, 9, 40),
];

const armar = (mes: Mes, sim: SimulacionSueldos | null = null) =>
  armarDatosInformeMensual({
    evolucion: EVOLUCION, movimientos: MOVIMIENTOS, mesInforme: mes,
    simulacion: sim, generadoPor: 'test', filtros: [],
  });

// ── Extracción del texto del PDF ─────────────────────────────────────────────

const textoDe = (doc: { output: (t: string) => unknown }): string => {
  const ab = doc.output('arraybuffer') as ArrayBuffer;
  const raw = new Uint8Array(ab).reduce((s, b) => s + String.fromCharCode(b), '');
  const partes = raw.match(/\(((?:\\.|[^()\\])*)\)\s*Tj/g) || [];
  return partes
    .map(p => p.replace(/\)\s*Tj$/, '').replace(/^\(/, '').replace(/\\([()\\])/g, '$1'))
    .join('\n');
};

describe('armado del informe mensual', () => {
  it('las cantidades por segmento suman el total del mes', () => {
    for (const m of MESES) {
      const d = armar(m);
      const s = d.mes.cantidadPorSegmento;
      expect(s.Consultas + s.Estudios + s.Cirugias, m).toBe(d.mes.cantidad);
    }
  });

  it('las cantidades por obra social suman el total del mes', () => {
    const d = armar('2026-07');
    expect(d.porObraSocial.reduce((s, o) => s + o.cantidad, 0)).toBe(d.mes.cantidad);
  });

  it('las cantidades por prestación suman el total del mes', () => {
    const d = armar('2026-07');
    expect(d.porPrestacion.reduce((s, p) => s + p.cantidad, 0)).toBe(d.mes.cantidad);
  });

  it('la plata sale de las filas de Evolución, sin recalcular', () => {
    const d = armar('2026-07');
    expect(d.mes.facturacion).toBe(100e6);
    expect(d.mes.costosVariables).toBe(46e6);
    expect(d.mes.margenContribucion).toBe(54e6);
    expect(d.mes.costosFijos).toBe(23e6);
    expect(d.mes.resultadoOperativo).toBe(54e6 - 23e6);
  });

  it('el mes en curso NUNCA entra: ni como mes, ni en la serie, ni en cantidades', () => {
    const d = armar('2026-08');
    expect(d.serie.map(s => s.mes)).not.toContain(EN_CURSO);
    expect(d.mes.mes).not.toBe(EN_CURSO);
    // Las 40 atenciones de septiembre no se cuentan en ningún lado.
    const total = d.serie.reduce((s, c) => s + c.cantidad, 0);
    expect(total).toBe(120 + 140 + 150 + 130);
  });

  it('el promedio usa sólo meses cerrados anteriores al del informe', () => {
    const d = armar('2026-08');
    expect(d.promedio6?.meses).toBe(3);          // may, jun, jul
    expect(d.promedio6?.facturacion).toBeCloseTo((80e6 + 96e6 + 100e6) / 3, 6);
  });

  it('el primer mes cargado no tiene anterior y no rompe', () => {
    const d = armar('2026-05');
    expect(d.anterior).toBeNull();
    expect(d.promedio6).toBeNull();
    expect(() => armarInformeMensual(d)).not.toThrow();
  });

  it('el ticket promedio es facturación sobre cantidad', () => {
    const d = armar('2026-07');
    expect(d.mes.ticketPromedio).toBeCloseTo(100e6 / 150, 6);
  });
});

describe('simulación de costo laboral', () => {
  const SIM: SimulacionSueldos = {
    meses: ['2026-08'],
    importe: 11_989_070,
    base: 'el costo laboral liquidado de Julio 2026',
    importeReemplazado: {},
  };

  it('reemplaza la categoría de sueldos y ajusta el total de costos fijos', () => {
    const d = armar('2026-08', SIM);
    const sueldos = d.mes.costosFijosPorCategoria.find(c => c.categoria === 'Sueldos y Cargas');
    expect(sueldos?.monto).toBe(11_989_070);
    expect(sueldos?.estimado).toBe(true);
    // 24 M originales - 5,9 M de erogación + 11.989.070 estimado
    expect(d.mes.costosFijos).toBeCloseTo(24e6 - 5.9e6 + 11_989_070, 6);
    expect(d.mes.diferenciaVsPantalla).toBeCloseTo(11_989_070 - 5.9e6, 6);
  });

  it('el resultado operativo baja por el costo laboral real', () => {
    const sin = armar('2026-08');
    const con = armar('2026-08', SIM);
    expect(con.mes.resultadoOperativo).toBeLessThan(sin.mes.resultadoOperativo);
  });

  it('no toca los meses que sí tienen liquidación', () => {
    const d = armar('2026-07', SIM);
    expect(d.simulacion).toBeNull();
    expect(d.mes.tieneEstimados).toBe(false);
    expect(d.mes.costosFijos).toBe(23e6);
  });

  it('el mes estimado queda marcado para el sello', () => {
    const d = armar('2026-08', SIM);
    expect(d.mes.tieneEstimados).toBe(true);
    expect(d.mes.categoriasEstimadas).toContain('Sueldos y Cargas');
  });
});

describe('render del PDF', () => {
  it('ningún literal cae en UTF-16 por un carácter fuera de WinAnsi', () => {
    // Si se cuela una flecha, un menos tipográfico o similar, jsPDF codifica la
    // cadena entera en UTF-16 y el renglón sale letra por letra. El marcador es
    // la aparición de bytes NUL en el texto extraído.
    for (const [mes, sim] of [['2026-07', null], ['2026-08', {
      meses: ['2026-08'], importe: 11_989_070,
      base: 'el costo laboral liquidado de Julio 2026', importeReemplazado: {},
    }]] as const) {
      const d = armar(mes, sim as SimulacionSueldos | null);
      const L = armarInformeMensual(d, { incluirAnexo: true });
      const t = textoDe(L.doc);
      expect(t.includes(String.fromCharCode(0)), `${mes}: literal en UTF-16`).toBe(false);
    }
  });

  it('imprime las tres líneas de cantidad y el total', () => {
    const d = armar('2026-07');
    const t = textoDe(armarInformeMensual(d).doc);
    expect(t).toContain('Consultas');
    expect(t).toContain('Estudios');
    expect(t).toContain('Cirugías');
    expect(t).toContain('PRÁCTICAS REALIZADAS');
  });

  it('los porcentajes usan coma decimal, no punto', () => {
    const d = armar('2026-07');
    const t = textoDe(armarInformeMensual(d).doc);
    // Un porcentaje con punto decimal sería "12.3%": no debe existir ninguno.
    expect(t).not.toMatch(/\d+\.\d%/);
    expect(t).toMatch(/\d+,\d%/);
  });

  it('el mes estimado lleva el sello en el PDF', () => {
    const d = armar('2026-08', {
      meses: ['2026-08'], importe: 11_989_070,
      base: 'el costo laboral liquidado de Julio 2026', importeReemplazado: {},
    });
    const t = textoDe(armarInformeMensual(d).doc);
    expect(t).toContain('CONTIENE DATOS ESTIMADOS');
    expect(t).toContain('ESTIMADO');
    expect(t).toContain('(estimado)');
  });

  it('dice explícitamente que sólo incluye meses cerrados', () => {
    const t = textoDe(armarInformeMensual(armar('2026-07')).doc);
    expect(t).toContain('únicamente meses cerrados');
  });

  it('el pie lleva la página y el total en todas las hojas', () => {
    const L = armarInformeMensual(armar('2026-07'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = (L.doc as any).getNumberOfPages();
    const t = textoDe(L.doc);
    expect((t.match(/Página \d+ de \d+/g) || []).length).toBe(total);
    // Sin el guion largo a propósito: el PDF guarda WinAnsi (0x97) y el
    // extractor lee byte a byte, así que "—" no coincide con U+2014. Lo que se
    // verifica es que la leyenda esté en todas las hojas, no su tipografía.
    expect((t.match(/Uso interno/g) || []).length).toBeGreaterThanOrEqual(total);
  });

  it('el nombre del archivo lleva el mes', () => {
    expect(nombreArchivo(armar('2026-07'))).toBe('Informe-Gestion-2026-07.pdf');
  });
});

describe('indexarFilas', () => {
  it('encuentra las filas de nivel 0 y las hijas', () => {
    const idx = indexarFilas(FILAS);
    expect(idx.get('facturacion')).toBeDefined();
    expect(idx.get('facturacion.consultas')).toBeDefined();
    expect(idx.get('cv.honorarios')).toBeDefined();
    expect(idx.get('no.existe')).toBeUndefined();
  });
});

describe('etiquetaMes', () => {
  it('arma la etiqueta en castellano', () => {
    expect(etiquetaMes('2026-07')).toBe('Julio 2026');
    expect(etiquetaMes('2026-12')).toBe('Diciembre 2026');
  });
});
