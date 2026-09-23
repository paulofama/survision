// ============================================================
// Anulación de entregas de caja
// ============================================================
// Lo que se fija acá es que una entrega anulada DEJE DE SUMAR pero NO
// desaparezca: hubo un comprobante impreso y entregado al paciente, así que
// tiene que quedar rastro de qué se cargó y por qué se dio de baja.
// ============================================================

import { describe, it, expect } from 'vitest';
import { sumaEntregas, entregasVigentes, type CajaEntrega } from '@modules/presupuestador/utils/circuito';

const entrega = (o: Partial<CajaEntrega> & { id: string; monto: number }): CajaEntrega => ({
  presupuesto_id: 'p1',
  fecha: '2026-09-14',
  valor_total: 1830391.2,
  requiere_factura: false,
  practica_codigo: null,
  registrado_por: 'marianela_murgo',
  observaciones: null,
  created_at: '2026-09-14T13:34:47Z',
  anulada_at: null,
  anulada_por: null,
  anulacion_motivo: null,
  ...o,
});

describe('sumaEntregas', () => {
  it('suma las vigentes', () => {
    expect(sumaEntregas([entrega({ id: 'a', monto: 1500000 }), entrega({ id: 'b', monto: 150000 })]))
      .toBe(1650000);
  });

  it('IGNORA las anuladas: es el punto de todo esto', () => {
    // El caso real del 23/09/2026: una prueba de $150.000 sobre el presupuesto
    // de un paciente. Si siguiera sumando, el saldo que se le informa queda mal.
    const con = [
      entrega({ id: 'a', monto: 1500000 }),
      entrega({ id: 'b', monto: 150000, anulada_at: '2026-09-23T12:00:00Z', anulada_por: 'paulo', anulacion_motivo: 'prueba del sistema' }),
    ];
    expect(sumaEntregas(con)).toBe(1500000);
  });

  it('todas anuladas: el entregado es cero, no la suma original', () => {
    const anulada = (id: string, monto: number) => entrega({
      id, monto, anulada_at: '2026-09-23T12:00:00Z', anulada_por: 'paulo', anulacion_motivo: 'prueba',
    });
    expect(sumaEntregas([anulada('a', 1500000), anulada('b', 150000)])).toBe(0);
  });

  it('sin entregas da cero', () => {
    expect(sumaEntregas([])).toBe(0);
  });
});

describe('entregasVigentes', () => {
  it('la anulada NO se pierde de la lista, sólo queda fuera de las vigentes', () => {
    const todas = [
      entrega({ id: 'a', monto: 1500000 }),
      entrega({ id: 'b', monto: 150000, anulada_at: '2026-09-23T12:00:00Z', anulada_por: 'paulo', anulacion_motivo: 'prueba' }),
    ];
    expect(entregasVigentes(todas).map((e) => e.id)).toEqual(['a']);
    // La lista completa se sigue mostrando en pantalla, tachada.
    expect(todas).toHaveLength(2);
  });
});
