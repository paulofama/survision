// ============================================================
// Textos legales versionados — lógica de la pantalla
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  limpiarSecciones,
  mover,
  REQUISITOS_LEY_26529,
  seccionVacia,
  validarTexto,
  type SeccionTexto,
} from '@modules/presupuestador/utils/textosLegales';

const s = (titulo: string, cuerpo: string): SeccionTexto => ({ titulo, cuerpo });

describe('seccionVacia', () => {
  it('vacía es sin título Y sin cuerpo', () => {
    expect(seccionVacia(s('', ''))).toBe(true);
    expect(seccionVacia(s('   ', '  '))).toBe(true);
    expect(seccionVacia(s('Riesgos', ''))).toBe(false);
    expect(seccionVacia(s('', 'Un párrafo sin título.'))).toBe(false);
  });
});

describe('limpiarSecciones', () => {
  it('saca las vacías y recorta los espacios', () => {
    const r = limpiarSecciones([s('  Riesgos ', '  Texto. '), s('', ''), s('Alternativas', 'Otro.')]);
    expect(r).toEqual([
      { titulo: 'Riesgos', cuerpo: 'Texto.' },
      { titulo: 'Alternativas', cuerpo: 'Otro.' },
    ]);
  });

  it('un párrafo sin título se conserva: el título es opcional', () => {
    expect(limpiarSecciones([s('', 'Sólo texto.')])).toEqual([{ titulo: '', cuerpo: 'Sólo texto.' }]);
  });

  it('no muta lo que recibe', () => {
    const entrada = [s(' Riesgos ', ' x ')];
    limpiarSecciones(entrada);
    expect(entrada[0].titulo).toBe(' Riesgos ');
  });
});

describe('validarTexto', () => {
  it('rechaza el texto vacío: no se puede activar un consentimiento sin contenido', () => {
    expect(validarTexto([])).not.toBeNull();
    expect(validarTexto([s('', '')])).not.toBeNull();
  });

  it('rechaza un título sin texto, que imprimiría un encabezado suelto', () => {
    expect(validarTexto([s('Riesgos', '')])).toMatch(/sin texto/i);
  });

  it('acepta una sección con cuerpo', () => {
    expect(validarTexto([s('Riesgos', 'Infección, desprendimiento.')])).toBeNull();
    expect(validarTexto([s('', 'Sin título pero con texto.')])).toBeNull();
  });
});

describe('mover', () => {
  const base = [s('a', 'a'), s('b', 'b'), s('c', 'c')];

  it('sube y baja una sección', () => {
    expect(mover(base, 1, -1).map((x) => x.titulo)).toEqual(['b', 'a', 'c']);
    expect(mover(base, 1, 1).map((x) => x.titulo)).toEqual(['a', 'c', 'b']);
  });

  it('en los extremos no hace nada, no rompe el orden', () => {
    expect(mover(base, 0, -1).map((x) => x.titulo)).toEqual(['a', 'b', 'c']);
    expect(mover(base, 2, 1).map((x) => x.titulo)).toEqual(['a', 'b', 'c']);
  });

  it('con un índice fuera de rango devuelve lo mismo', () => {
    expect(mover(base, 9, -1)).toEqual(base);
    expect(mover(base, -1, 1)).toEqual(base);
  });

  it('no muta el arreglo original', () => {
    mover(base, 0, 1);
    expect(base.map((x) => x.titulo)).toEqual(['a', 'b', 'c']);
  });
});

describe('REQUISITOS_LEY_26529', () => {
  it('son los seis incisos del artículo 5 que aplican a una cirugía', () => {
    // g) y h) los agregó la Ley 26.742 y son sobre enfermedad irreversible y
    // cuidados paliativos: no corresponden a una catarata.
    expect(REQUISITOS_LEY_26529.map((r) => r.inciso)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(REQUISITOS_LEY_26529.every((r) => r.texto.trim().length > 10)).toBe(true);
  });
});
