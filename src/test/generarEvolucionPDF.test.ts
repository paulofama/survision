// ============================================================
// Tests del aplanado del PDF de Evolución Temporal
// ============================================================
//
// Lo que se verifica acá es el contrato que pidió Paulo: el PDF sale con
// EXACTAMENTE las filas que están abiertas en pantalla. Ni todo colapsado ni
// todo abierto.
//
// Y el corte en nivel 2: los niveles 3 y 4 (comprobantes, obras sociales,
// atenciones una por una) se cargan bajo demanda contra la base y pueden ser
// miles de filas. No entran en el PDF, pero tampoco se omiten en silencio:
// `contarDetalleOmitido` alimenta el aviso de la portada.
// ============================================================

import { describe, it, expect } from 'vitest';
import { aplanar, contarDetalleOmitido } from '@modules/analisis-marginal/utils/generarEvolucionPDF';
import type { FilaEvolucion } from '@shared/types/evolucionTemporal';

const fila = (
  id: string,
  nivel: 0 | 1 | 2 | 3 | 4,
  hijos?: FilaEvolucion[],
  detalleLazy?: FilaEvolucion['detalleLazy'],
): FilaEvolucion => ({
  id,
  tipo: nivel === 0 ? 'facturacion' : nivel === 1 ? 'subgrupo' : 'detalle',
  nivel,
  label: id,
  expandible: !!hijos?.length || !!detalleLazy,
  valores: {},
  total: 0,
  promedioMensual: 0,
  ...(hijos ? { hijos } : {}),
  ...(detalleLazy ? { detalleLazy } : {}),
});

/** Árbol de prueba con la misma forma que la grilla real. */
const ARBOL: FilaEvolucion[] = [
  fila('facturacion', 0, [
    fila('fact.consultas', 1, [
      fila('fact.consultas.exo', 2, undefined, { bloque: 'facturacion', clave: 'Exoftalmologia', label: 'Exoftalmología' }),
      fila('fact.consultas.recetas', 2),
    ]),
    fila('fact.cirugias', 1, [fila('fact.cirugias.faco', 2)]),
  ]),
  fila('costos_fijos', 0, [
    fila('cf.servicios', 1, undefined, { bloque: 'costos_fijos', clave: 'Servicios', label: 'Servicios' }),
    fila('cf.limpieza', 1, undefined, { bloque: 'costos_fijos', clave: 'Limpieza', label: 'Limpieza' }),
  ]),
  fila('resultado_operativo', 0),
];

describe('aplanar — el PDF respeta el estado de la pantalla', () => {
  it('con todo colapsado salen solo las bandas de nivel 0', () => {
    const r = aplanar(ARBOL, new Set());
    expect(r.map(f => f.id)).toEqual(['facturacion', 'costos_fijos', 'resultado_operativo']);
  });

  it('abrir una banda incluye a sus hijos y NO a los de las otras', () => {
    const r = aplanar(ARBOL, new Set(['costos_fijos']));
    expect(r.map(f => f.id)).toEqual([
      'facturacion',
      'costos_fijos', 'cf.servicios', 'cf.limpieza',
      'resultado_operativo',
    ]);
  });

  it('respeta la profundidad: abrir el nieto sin el padre no lo saca a la superficie', () => {
    // 'fact.consultas' está abierto pero su padre 'facturacion' no: la rama
    // entera queda fuera, igual que en pantalla.
    const r = aplanar(ARBOL, new Set(['fact.consultas']));
    expect(r.map(f => f.id)).toEqual(['facturacion', 'costos_fijos', 'resultado_operativo']);
  });

  it('abre dos niveles cuando ambos están expandidos', () => {
    const r = aplanar(ARBOL, new Set(['facturacion', 'fact.consultas']));
    expect(r.map(f => f.id)).toEqual([
      'facturacion',
      'fact.consultas', 'fact.consultas.exo', 'fact.consultas.recetas',
      'fact.cirugias',
      'costos_fijos',
      'resultado_operativo',
    ]);
  });

  it('no baja más allá del nivel 2 aunque la fila esté abierta', () => {
    // El nivel 3 se carga contra la base; el PDF corta antes.
    const todo = new Set(['facturacion', 'fact.consultas', 'fact.consultas.exo', 'costos_fijos', 'cf.servicios']);
    const r = aplanar(ARBOL, todo);
    expect(r.every(f => f.nivel <= 2)).toBe(true);
  });
});

describe('contarDetalleOmitido — el aviso de la portada', () => {
  it('no avisa nada si no hay detalle abierto', () => {
    expect(contarDetalleOmitido(ARBOL, new Set(['facturacion']))).toBe(0);
  });

  it('cuenta las filas con detalle lazy que están abiertas', () => {
    expect(contarDetalleOmitido(ARBOL, new Set(['costos_fijos', 'cf.servicios']))).toBe(1);
    expect(contarDetalleOmitido(ARBOL, new Set(['cf.servicios', 'cf.limpieza']))).toBe(2);
  });

  it('las cuenta aunque su rama no se esté imprimiendo', () => {
    // 'fact.consultas.exo' es nivel 2 con detalle lazy: aunque su padre esté
    // cerrado y no salga en la tabla, el usuario lo tiene abierto en pantalla
    // y el PDF debe decir que ese detalle no está.
    expect(contarDetalleOmitido(ARBOL, new Set(['fact.consultas.exo']))).toBe(1);
  });
});
