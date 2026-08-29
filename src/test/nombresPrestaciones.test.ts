// ============================================================
// Tests de normalización y segmentación de prestaciones
// ============================================================
//
// LA REGLA: el segmento sale del CÓDIGO de práctica, no del nombre.
//   01xxxx → Consultas · 02xxxx → Estudios · 03xxxx → Cirugías
//
// Hasta el 2026-08-25 el sistema adivinaba por palabras del nombre. Esa
// heurística clasificaba mal 23 prácticas por $281.066.317 solo en 2026, con
// Exoftalmología (010102, $243,5 M) como caso principal: es una CONSULTA y
// caía en "Estudios" por descarte. Como Consultas paga 60/50 de honorarios y
// Estudios 40/33, el error movía plata.
//
// El fallback por nombre sigue existiendo porque 2024 usa otros nomencladores
// (30xxxx y 46xxxx) que no codifican el segmento.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  normalizarNombre,
  detectarSegmento,
  detectarSegmentoPorNombre,
  segmentoPorCodigo,
} from '@shared/utils/nombresPrestaciones';

describe('normalizarNombre', () => {
  it('hace coincidir el mismo nombre escrito distinto en cada sistema', () => {
    expect(normalizarNombre('CIRUGIA DE CATARATAS')).toBe(normalizarNombre('Cirugía de Cataratas'));
    expect(normalizarNombre('OCT de Mácula')).toBe(normalizarNombre('OCT DE MACULA'));
  });

  it('NO alcanza cuando los sistemas separan las palabras distinto', () => {
    // Caso real y motivo por el que existe `prestaciones_nombre_mapping`:
    // GECLISA escribe "Exoftalmologia" y la receta "EXO OFTALMOLOGÍA". Al
    // sacar el espacio quedan dos O seguidas y las claves NO coinciden.
    expect(normalizarNombre('EXO OFTALMOLOGÍA')).toBe('exooftalmologia');
    expect(normalizarNombre('Exoftalmologia')).toBe('exoftalmologia');
    expect(normalizarNombre('EXO OFTALMOLOGÍA')).not.toBe(normalizarNombre('Exoftalmologia'));
  });

  it('tolera null y undefined sin romper', () => {
    expect(normalizarNombre(null)).toBe('');
    expect(normalizarNombre(undefined)).toBe('');
  });
});

describe('segmentoPorCodigo', () => {
  it('aplica la regla de los dos primeros dígitos', () => {
    expect(segmentoPorCodigo('010102')).toBe('Consultas');
    expect(segmentoPorCodigo('020015')).toBe('Estudios');
    expect(segmentoPorCodigo('030614')).toBe('Cirugias');
  });

  it('rellena a 6 dígitos: los códigos de 5 vienen sin el cero inicial', () => {
    // 10102 y 010102 son el mismo código. Sin padding, "10102" se leería como
    // prefijo "10" y no encontraría segmento.
    expect(segmentoPorCodigo('10102')).toBe('Consultas');
    expect(segmentoPorCodigo('30614')).toBe('Cirugias');
  });

  it('devuelve null para códigos de nomencladores que no codifican segmento', () => {
    expect(segmentoPorCodigo('300122')).toBeNull(); // nomenclador 2024
    expect(segmentoPorCodigo('460003')).toBeNull(); // nomenclador 2024
  });

  it('los insumos facturados como práctica (04) van con las cirugías', () => {
    // GECLISA los agrupa en CIRUGIA y los factura con el acto quirúrgico.
    // No cambia honorarios: Cirugías y Estudios pagan igual (40/33).
    expect(segmentoPorCodigo('040108')).toBe('Cirugias');
    expect(segmentoPorCodigo('040109')).toBe('Cirugias');
  });

  it('devuelve null si no hay código', () => {
    expect(segmentoPorCodigo(null)).toBeNull();
    expect(segmentoPorCodigo(undefined)).toBeNull();
    expect(segmentoPorCodigo('')).toBeNull();
    expect(segmentoPorCodigo('   ')).toBeNull();
  });
});

describe('detectarSegmento — el código manda sobre el nombre', () => {
  it('Exoftalmología es Consulta por código, aunque el nombre no lo diga', () => {
    // El caso que motivó el cambio: $243,5 M en 2026.
    expect(detectarSegmento('Exoftalmologia', '010102')).toBe('Consultas');
    // Sin el código habría caído en Estudios por descarte.
    expect(detectarSegmentoPorNombre('Exoftalmologia')).toBe('Estudios');
  });

  it('el código gana aunque el nombre sugiera otro segmento', () => {
    // "Control de Cirugia" tiene la palabra CIRUGIA, pero es 01 = consulta.
    expect(detectarSegmento('Control de Cirugia', '010103')).toBe('Consultas');
    // Y al revés: un nombre sin palabras clave con código 03 es cirugía.
    expect(detectarSegmento('Mininuc', '030510')).toBe('Cirugias');
  });

  it('cae al nombre cuando el código no sirve (nomencladores de 2024)', () => {
    expect(detectarSegmento('Consulta Oftalmológica', '300122')).toBe('Consultas');
    expect(detectarSegmento('YAG Láser', '460204')).toBe('Cirugias');
  });

  it('cae al nombre cuando no hay código', () => {
    expect(detectarSegmento('CIRUGIA DE CATARATAS FACO', null)).toBe('Cirugias');
    expect(detectarSegmento('OCT DE MACULA', '')).toBe('Estudios');
  });

  it('sin código ni nombre utilizable, devuelve Estudios', () => {
    expect(detectarSegmento(null, null)).toBe('Estudios');
  });
});

describe('detectarSegmentoPorNombre (fallback, solo cuando el código no sirve)', () => {
  it('clasifica consultas', () => {
    expect(detectarSegmentoPorNombre('CONSULTA OFTALMOLOGICA')).toBe('Consultas');
    expect(detectarSegmentoPorNombre('RECETA DE ANTEOJOS')).toBe('Consultas');
  });

  it('clasifica cirugías', () => {
    expect(detectarSegmentoPorNombre('CIRUGIA DE CATARATAS FACO')).toBe('Cirugias');
    expect(detectarSegmentoPorNombre('CROSS LINKING CORNEAL')).toBe('Cirugias');
  });

  it('todo lo que no es consulta ni cirugía cae en estudios', () => {
    expect(detectarSegmentoPorNombre('OCT DE MACULA')).toBe('Estudios');
    expect(detectarSegmentoPorNombre('CAMPO VISUAL COMPUTARIZADO')).toBe('Estudios');
  });

  it('consultas gana sobre cirugías cuando el nombre menciona las dos', () => {
    expect(detectarSegmentoPorNombre('CONTROL POST CIRUGIA')).toBe('Consultas');
  });

  it('es indiferente a mayúsculas y tolera nulos', () => {
    expect(detectarSegmentoPorNombre('cirugia de pterigion')).toBe('Cirugias');
    expect(detectarSegmentoPorNombre(null)).toBe('Estudios');
  });
});
