// ============================================================
// Tests del cruce prestación facturada ↔ receta de costo
// ============================================================
//
// La regla: manda el CÓDIGO de práctica, el nombre es respaldo.
//
// El nombre no alcanza porque el extractor del espejo lo corta en el primer
// paréntesis, y ahí se pierde la variante que define el costo: dos códigos con
// costos muy distintos terminan compartiendo el mismo nombre. Cruzar por
// nombre elige cualquiera de los dos.
//
// Medido el 27/08/2026 sobre $870.745.862 facturados en 2026:
// por nombre 82,6% de cobertura, por código 97,5%.
// ============================================================

import { describe, it, expect } from 'vitest';
import { crearIndiceRecetas, claveCodigo } from '@shared/utils/buscadorRecetas';

/** Las dos vitrectomías: mismo nombre en el espejo, costo muy distinto. */
const RECETAS = [
  { codigo_practica: '030606', nombre_practica: 'VITRECTOMÍA EN DESPRENDIMIENTO DE RETINA (CON IMPLANTE)', costo: 682152 },
  { codigo_practica: '030614', nombre_practica: 'VITRECTOMÍA EN DESPRENDIMIENTO DE RETINA (SIN IMPLANTE)', costo: 392852 },
  { codigo_practica: '030601', nombre_practica: 'INYECCIÓN INTRAVÍTREA DE ANTIANGIOGÉNICOS (AVASTIN)', costo: 52512 },
  { codigo_practica: '030602', nombre_practica: 'INYECCIÓN INTRAVÍTREA DE ANTIANGIOGÉNICOS (EYLIA)', costo: 1558515 },
  { codigo_practica: '010102', nombre_practica: 'EXO OFTALMOLOGÍA', costo: 2998 },
  { codigo_practica: '020015', nombre_practica: 'TOPOGRAFIA CORNEAL', costo: 1500 },
];

const ALIAS = [
  { nombre_geclisa: 'Exoftalmologia', nombre_receta: 'EXO OFTALMOLOGÍA' },
];

describe('claveCodigo', () => {
  it('rellena a 6 dígitos: los códigos de 5 vienen sin el cero inicial', () => {
    expect(claveCodigo('10102')).toBe('010102');
    expect(claveCodigo('030614')).toBe('030614');
  });

  it('devuelve cadena vacía si no hay código', () => {
    expect(claveCodigo(null)).toBe('');
    expect(claveCodigo(undefined)).toBe('');
    expect(claveCodigo('  ')).toBe('');
  });
});

describe('crearIndiceRecetas — el código manda', () => {
  const idx = crearIndiceRecetas(RECETAS, ALIAS);

  it('distingue dos variantes que comparten el nombre truncado', () => {
    // Esto es lo que el cruce por nombre NO puede hacer: el espejo guarda
    // "Vitrectomia en Desprendimiento de Retina" para los dos códigos.
    const conImplante = idx.buscar('030606', 'Vitrectomia en Desprendimiento de Retina');
    const sinImplante = idx.buscar('030614', 'Vitrectomia en Desprendimiento de Retina');

    expect(conImplante?.costo).toBe(682152);
    expect(sinImplante?.costo).toBe(392852);
  });

  it('lo facturado con código 030601 es Avastin, no Eylia', () => {
    // La diferencia es de 30 veces: define si la práctica da margen o pérdida.
    expect(idx.buscar('030601', 'Inyeccion Intravitrea de anti angiogenicos')?.costo).toBe(52512);
  });

  it('el código gana aunque el nombre apunte a otra receta', () => {
    // Nombre de una, código de otra: manda el código.
    expect(idx.buscar('020015', 'EXO OFTALMOLOGÍA')?.costo).toBe(1500);
  });

  it('acepta el código sin el cero inicial', () => {
    expect(idx.buscar('30614', 'lo que sea')?.costo).toBe(392852);
  });
});

describe('crearIndiceRecetas — el nombre como respaldo', () => {
  const idx = crearIndiceRecetas(RECETAS, ALIAS);

  it('cae al nombre cuando el código no está en el índice', () => {
    // Códigos de los nomencladores 2024 (30xxxx, 46xxxx): no cruzan por código.
    expect(idx.buscar('460204', 'TOPOGRAFIA CORNEAL')?.costo).toBe(1500);
  });

  it('cae al nombre cuando no hay código', () => {
    expect(idx.buscar(null, 'TOPOGRAFIA CORNEAL')?.costo).toBe(1500);
    expect(idx.buscar('', 'TOPOGRAFIA CORNEAL')?.costo).toBe(1500);
  });

  it('los alias siguen resolviendo lo que la normalización no cubre', () => {
    // "Exoftalmologia" normaliza distinto que "EXO OFTALMOLOGÍA" (doble O).
    expect(idx.buscar(null, 'Exoftalmologia')?.costo).toBe(2998);
  });

  it('devuelve null cuando no encuentra por ninguna vía', () => {
    expect(idx.buscar('999999', 'PRACTICA INEXISTENTE')).toBeNull();
    expect(idx.buscar(null, null)).toBeNull();
  });
});

describe('crearIndiceRecetas — casos borde', () => {
  it('tiene() responde sin exponer la receta', () => {
    const idx = crearIndiceRecetas(RECETAS, ALIAS);
    expect(idx.tiene('030614', 'x')).toBe(true);
    expect(idx.tiene('999999', 'x')).toBe(false);
  });

  it('una receta sin código sigue siendo alcanzable por nombre', () => {
    const idx = crearIndiceRecetas([{ codigo_practica: null, nombre_practica: 'ALGO', costo: 10 }]);
    expect(idx.cantidadPorCodigo).toBe(0);
    expect(idx.buscar(null, 'ALGO')?.costo).toBe(10);
  });

  it('ante dos recetas con el mismo código, gana la primera y no rompe', () => {
    const idx = crearIndiceRecetas([
      { codigo_practica: '030614', nombre_practica: 'A', costo: 1 },
      { codigo_practica: '030614', nombre_practica: 'B', costo: 2 },
    ]);
    expect(idx.buscar('030614', '')?.costo).toBe(1);
  });

  it('un índice vacío no rompe', () => {
    const idx = crearIndiceRecetas([]);
    expect(idx.buscar('030614', 'x')).toBeNull();
    expect(idx.cantidadPorCodigo).toBe(0);
  });
});
