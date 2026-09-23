// ============================================================
// Diagnósticos del pedido de cirugía — lógica de la pantalla
// ============================================================
// Lo que se prueba acá es lo que decide QUÉ VE quien carga los diagnósticos y
// CÓMO va a salir impreso. El riesgo del módulo no es que explote: es que
// imprima un diagnóstico que no corresponde y alguien lo firme.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  conOjo,
  cruzar,
  esPropuesta,
  esQuirurgica,
  faltaElOjo,
  filtrar,
  ordenarPorPrioridad,
  validarDiagnostico,
  type Diagnostico,
  type PracticaConDx,
} from '@modules/presupuestador/utils/diagnosticos';

const dx = (over: Partial<Diagnostico> = {}): Diagnostico => ({
  codigo_practica: '030501',
  diagnostico: 'Catarata {ojo}',
  solicitud: 'Cirugía de catarata con técnica de facoemulsificación.',
  lleva_lio: true,
  activo: true,
  ...over,
});

const fila = (over: Partial<PracticaConDx> = {}): PracticaConDx => ({
  codigo: '030501',
  nombre: 'Facoemulsificacion',
  dx: null,
  presupuestos: 0,
  aceptados: 0,
  ...over,
});

describe('esQuirurgica', () => {
  it('toma las 03xxxx y deja afuera los estudios', () => {
    expect(esQuirurgica('030501')).toBe(true);
    expect(esQuirurgica('031002')).toBe(true);
    // Los 02xxxx son estudios (ecografías, topografías): no se opera nada.
    expect(esQuirurgica('020007')).toBe(false);
    expect(esQuirurgica('010102')).toBe(false);
  });

  it('no se cuelga con vacíos ni con códigos de otro largo', () => {
    expect(esQuirurgica('')).toBe(false);
    expect(esQuirurgica(null)).toBe(false);
    expect(esQuirurgica('03')).toBe(false);
    expect(esQuirurgica('0305011')).toBe(false);
  });
});

describe('conOjo — la vista previa tiene que decir lo mismo que el papel', () => {
  it('reemplaza el marcador con la sigla del ojo', () => {
    expect(conOjo('Catarata {ojo}', 'OD')).toBe('Catarata OD');
    expect(conOjo('Catarata {ojo}', 'OI')).toBe('Catarata OI');
  });

  it('AMBOS se escribe AO, no "AMBOS"', () => {
    expect(conOjo('Pterigión {ojo}', 'AMBOS')).toBe('Pterigión AO');
  });

  it('sin ojo elegido, el marcador desaparece y no deja el espacio colgando', () => {
    expect(conOjo('Catarata {ojo}', null)).toBe('Catarata');
  });

  it('un diagnóstico sin marcador se imprime tal cual', () => {
    expect(conOjo('Endoftalmitis', 'OD')).toBe('Endoftalmitis');
  });
});

describe('validarDiagnostico', () => {
  it('exige diagnóstico y solicitud, como el CHECK de la base', () => {
    expect(validarDiagnostico({ diagnostico: '', solicitud: 'algo' })).toMatch(/diagn/i);
    expect(validarDiagnostico({ diagnostico: 'algo', solicitud: '' })).toMatch(/solicit/i);
    expect(validarDiagnostico({ diagnostico: 'Catarata {ojo}', solicitud: 'Faco.' })).toBeNull();
  });

  it('los espacios no cuentan como contenido', () => {
    expect(validarDiagnostico({ diagnostico: '   ', solicitud: 'algo' })).not.toBeNull();
  });
});

describe('faltaElOjo — aviso, no error', () => {
  it('avisa cuando el diagnóstico no lleva el marcador', () => {
    expect(faltaElOjo('Catarata')).toBe(true);
    expect(faltaElOjo('Catarata {ojo}')).toBe(false);
  });
});

describe('ordenarPorPrioridad', () => {
  it('lo que FALTA va primero, aunque se presupueste menos', () => {
    const r = ordenarPorPrioridad([
      fila({ codigo: '030501', dx: dx(), presupuestos: 500 }),
      fila({ codigo: '030601', dx: null, presupuestos: 10 }),
    ]);
    expect(r.map((f) => f.codigo)).toEqual(['030601', '030501']);
  });

  it('entre las que faltan, manda lo ACEPTADO: eso ya está imprimiendo pedidos', () => {
    const r = ordenarPorPrioridad([
      fila({ codigo: '030601', presupuestos: 189, aceptados: 0 }),
      fila({ codigo: '030003', presupuestos: 27, aceptados: 1 }),
    ]);
    expect(r[0].codigo).toBe('030003');
  });

  it('sin aceptados, ordena por cuánto se presupuesta', () => {
    const r = ordenarPorPrioridad([
      fila({ codigo: '030002', presupuestos: 91 }),
      fila({ codigo: '030601', presupuestos: 189 }),
      fila({ codigo: '030510', presupuestos: 36 }),
    ]);
    expect(r.map((f) => f.codigo)).toEqual(['030601', '030002', '030510']);
  });

  it('no muta el arreglo que recibe', () => {
    const entrada = [fila({ codigo: '030002', presupuestos: 1 }), fila({ codigo: '030601', presupuestos: 9 })];
    ordenarPorPrioridad(entrada);
    expect(entrada[0].codigo).toBe('030002');
  });

  it('una PROPUESTA ordena con las que faltan, no con las cargadas', () => {
    // Si no, la propuesta se hundiría al fondo de la lista justo cuando es lo
    // que hay que ir a revisar.
    const r = ordenarPorPrioridad([
      fila({ codigo: '030501', dx: dx({ activo: true }), presupuestos: 500 }),
      fila({ codigo: '030002', dx: dx({ codigo_practica: '030002', activo: false, nota_interna: 'PROPUESTO.' }), presupuestos: 91 }),
      fila({ codigo: '030601', dx: null, presupuestos: 189 }),
    ]);
    expect(r.map((f) => f.codigo)).toEqual(['030601', '030002', '030501']);
  });
});

describe('esPropuesta — apagada CON nota, esperando que alguien la lea', () => {
  it('una fila apagada con nota es una propuesta', () => {
    expect(esPropuesta(dx({ activo: false, nota_interna: 'PROPUESTO, sin revisar. Confirmar.' }))).toBe(true);
  });

  it('una fila apagada SIN nota no es una propuesta: fue revisada y se bajó', () => {
    expect(esPropuesta(dx({ activo: false, nota_interna: null }))).toBe(false);
    expect(esPropuesta(dx({ activo: false, nota_interna: '   ' }))).toBe(false);
  });

  it('una fila activa nunca es una propuesta, tenga nota o no', () => {
    expect(esPropuesta(dx({ activo: true, nota_interna: 'Lo confirmó el Dr. Mercado.' }))).toBe(false);
  });

  it('sin fila no hay propuesta', () => {
    expect(esPropuesta(null)).toBe(false);
    expect(esPropuesta(undefined)).toBe(false);
  });
});

describe('filtrar', () => {
  const filas = [
    fila({ codigo: '030501', nombre: 'Facoemulsificacion mas Lio Monofocal', dx: dx() }),
    fila({ codigo: '030408', nombre: 'Cirugia de Pterigion', dx: null }),
    fila({ codigo: '030601', nombre: 'Inyección Intravítrea de Anti angiogénicos (Avastin)', dx: null }),
  ];

  it('separa las que faltan de las cargadas', () => {
    expect(filtrar(filas, '', 'sin').map((f) => f.codigo)).toEqual(['030408', '030601']);
    expect(filtrar(filas, '', 'con').map((f) => f.codigo)).toEqual(['030501']);
    expect(filtrar(filas, '', 'todas')).toHaveLength(3);
  });

  it('busca por código y por nombre', () => {
    expect(filtrar(filas, '030408', 'todas').map((f) => f.codigo)).toEqual(['030408']);
    expect(filtrar(filas, 'pterigion', 'todas').map((f) => f.codigo)).toEqual(['030408']);
  });

  it('ignora los acentos en los dos sentidos', () => {
    // Este es el bug que ya costó plata en otros módulos: buscar "intravitrea"
    // no puede fallar porque el catálogo escribe "Intravítrea".
    expect(filtrar(filas, 'intravitrea', 'todas').map((f) => f.codigo)).toEqual(['030601']);
    expect(filtrar(filas, 'Pterigión', 'todas').map((f) => f.codigo)).toEqual(['030408']);
  });

  it('busca también dentro del diagnóstico cargado', () => {
    expect(filtrar(filas, 'catarata', 'todas').map((f) => f.codigo)).toEqual(['030501']);
  });

  it('una PROPUESTA cuenta como "sin diagnóstico": imprime el renglón igual de vacío', () => {
    const conPropuesta = [
      ...filas,
      fila({ codigo: '030002', nombre: 'Yag Laser - Capsulotomia',
             dx: dx({ codigo_practica: '030002', activo: false, nota_interna: 'PROPUESTO, sin revisar.' }) }),
    ];
    expect(filtrar(conPropuesta, '', 'sin').map((f) => f.codigo)).toContain('030002');
    expect(filtrar(conPropuesta, '', 'con').map((f) => f.codigo)).not.toContain('030002');
    expect(filtrar(conPropuesta, '', 'propuestas').map((f) => f.codigo)).toEqual(['030002']);
  });

  it('una fila apagada sin nota no aparece entre las propuestas', () => {
    const apagada = [fila({ codigo: '030999', dx: dx({ codigo_practica: '030999', activo: false, nota_interna: null }) })];
    expect(filtrar(apagada, '', 'propuestas')).toHaveLength(0);
    expect(filtrar(apagada, '', 'sin')).toHaveLength(1);
  });
});

describe('cruzar', () => {
  const practicas = [
    { codigo: '030501', practica: '030501 - Facoemulsificacion mas Lio Basico' },
    { codigo: '030601', practica: 'Inyección Intravítrea (Avastin)' },
    { codigo: '020007', practica: 'Ecografia Unilateral' },
  ];

  it('deja afuera lo que no es cirugía', () => {
    const r = cruzar(practicas, [], new Map(), new Map());
    expect(r.map((f) => f.codigo)).toEqual(['030501', '030601']);
  });

  it('saca el prefijo del código del nombre', () => {
    const r = cruzar(practicas, [], new Map(), new Map());
    expect(r[0].nombre).toBe('Facoemulsificacion mas Lio Basico');
  });

  it('engancha el diagnóstico y deja null cuando no hay', () => {
    const r = cruzar(practicas, [dx({ codigo_practica: '030501' })], new Map(), new Map());
    expect(r[0].dx?.diagnostico).toBe('Catarata {ojo}');
    expect(r[1].dx).toBeNull();
  });

  it('trae el volumen, y cuenta 0 —no undefined— cuando la práctica nunca se presupuestó', () => {
    const r = cruzar(practicas, [], new Map([['030601', 189]]), new Map([['030601', 2]]));
    expect(r[1].presupuestos).toBe(189);
    expect(r[1].aceptados).toBe(2);
    expect(r[0].presupuestos).toBe(0);
    expect(r[0].aceptados).toBe(0);
  });
});
