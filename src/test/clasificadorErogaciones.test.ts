// ============================================================
// El auto-clasificador de erogaciones — de dónde saca la sugerencia
// ============================================================
// Dos piezas chicas de las que depende que un gasto caiga en el lugar
// correcto. Las dos ya fallaron una vez, y ninguna de las dos falla ruidosa:
// producen un número creíble en la categoría equivocada.
// ============================================================

import { describe, it, expect } from 'vitest';
import { normalizarProveedor, porTipoProveedor } from '@shared/hooks/useErogaciones';

describe('normalizarProveedor — el guión NO es un proveedor', () => {
  // Al 27/09/2026 había 489 comprobantes con proveedor "-" en el histórico,
  // repartidos entre variable/honorarios (223), no_es_gasto (83), Sueldos y
  // Cargas (64) e Impuestos (53). Tratar eso como un proveedor hace que la
  // clasificación dominante del tacho —honorarios, por ser la porción más
  // grande— se le aplique a cualquier gasto sin nombre.
  //
  // Lo que produjo en agosto-2026: PANADERÍA, MERIENDA, MAPLES HUEVOS y
  // MANDADOS sugeridos como honorarios médicos. 11 de 15 sugerencias mal.

  it('devuelve vacío para el relleno que pone el espejo', () => {
    expect(normalizarProveedor('-')).toBe('');
    expect(normalizarProveedor(' - ')).toBe('');
    expect(normalizarProveedor('S/D')).toBe('');
    expect(normalizarProveedor('—')).toBe('');
  });

  it('devuelve vacío cuando no hay nada', () => {
    expect(normalizarProveedor(null)).toBe('');
    expect(normalizarProveedor(undefined)).toBe('');
    expect(normalizarProveedor('')).toBe('');
    expect(normalizarProveedor('   ')).toBe('');
  });

  it('un proveedor de verdad se normaliza, no se descarta', () => {
    expect(normalizarProveedor('  alcon   laboratorio ')).toBe('ALCON LABORATORIO');
    expect(normalizarProveedor('Casado Mauricio')).toBe('CASADO MAURICIO');
  });

  it('no se lleva puesto un nombre que apenas contiene un guión', () => {
    expect(normalizarProveedor('LA UNION S.R .L.')).toBe('LA UNION S.R .L.');
    expect(normalizarProveedor('ANDESMAR (FARMACIA COLON)')).toBe('ANDESMAR (FARMACIA COLON)');
    expect(normalizarProveedor('SED-CAMARAS')).toBe('SED-CAMARAS');
  });
});

describe('porTipoProveedor — lo que GECLISA ya sabía', () => {
  // La tabla Proveedores de GECLISA clasifica a cada proveedor desde el alta,
  // para las retenciones. Sirve para el proveedor NUEVO, que no tiene
  // histórico del que aprender.
  const idDe = (n: string) => `id-${n}`;

  it('insumos médicos es un costo variable', () => {
    expect(porTipoProveedor(4, 1, idDe)).toEqual({ tipo: 'variable', cat: null, sub: 'insumos' });
  });

  it('prestación de servicios médicos es un honorario variable', () => {
    expect(porTipoProveedor(5, 2, idDe)).toEqual({ tipo: 'variable', cat: null, sub: 'honorarios' });
  });

  it('insumos (no médicos) es costo fijo de oficina', () => {
    expect(porTipoProveedor(3, 1, idDe)).toEqual({ tipo: 'fijo', cat: 'id-Insumos de Oficina', sub: null });
  });

  it('el tipo 1 lo desempata el concepto de ganancias', () => {
    // Mezcla un flete con un estudio jurídico: sin el concepto no alcanza.
    expect(porTipoProveedor(1, 2, idDe)).toEqual({ tipo: 'fijo', cat: 'id-Honorarios Profesionales', sub: null });
    expect(porTipoProveedor(1, 4, idDe)).toEqual({ tipo: 'fijo', cat: 'id-Servicios', sub: null });
  });

  it('"S/D" y "sin dato" NO son un tipo: no se sugiere nada', () => {
    // 0 es S/D en GECLISA; null es caja o liquidaciones, que no tienen
    // proveedor de esa tabla. Inventar un tipo acá es peor que no sugerir.
    expect(porTipoProveedor(0, 1, idDe)).toBeNull();
    expect(porTipoProveedor(null, null, idDe)).toBeNull();
    expect(porTipoProveedor(undefined, undefined, idDe)).toBeNull();
  });

  it('si la categoría no existe devuelve null en cat, no un id inventado', () => {
    const sinCategorias = () => null;
    expect(porTipoProveedor(3, 1, sinCategorias)).toEqual({ tipo: 'fijo', cat: null, sub: null });
  });
});
