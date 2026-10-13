// ============================================================
// HOOK: useConciliacionAgenda
// Análisis Marginal — Sistema de Gestión Integral
// ============================================================
//
// QUÉ CONTESTA ESTA SECCIÓN
// --------------------------
// "El informe Por Prestación muestra 1 práctica del código 030514 y la agenda
// tenía 5 turnos: ¿sub-registra?" No. El informe es fiel a lo FACTURADO; la
// agenda refleja lo AGENDADO, y las dos difieren en ~1,5 % de los turnos
// atendidos. Esta sección muestra exactamente dónde, para que Administración lo
// corrija en GECLISA.
//
// POR QUÉ LEE UN ESPEJO Y NO GECLISA
// -----------------------------------
// `Turnos` es una ventana móvil que se purga: sostiene tres meses cerrados.
// El cálculo sólo se puede hacer mientras el mes esté en la ventana, así que lo
// hace el daemon on-prem y deja el resultado en `conciliacion_agenda`
// (migración 73). El front remoto lee el espejo — no tiene a GECLISA enfrente.
//
// Consecuencia visible: un mes anterior a la puesta en marcha del espejo no
// tiene datos, y eso NO significa que no hubiera discrepancias. La pantalla lo
// dice en vez de mostrar un cero tranquilizador.
// ============================================================

import { useState, useEffect } from 'react';
import { supabase } from '@shared/lib/supabase';
import { traerTodo } from '@shared/lib/traerTodo';

/** Una discrepancia, tal como la dejó el extractor. */
export interface FilaConciliacion {
  turno_id: number;
  fecha_turno: string;
  paciente: string | null;
  obra_social: string | null;
  prestador: string | null;
  cod_agendado: string | null;
  cod_facturado: string | null;
  practica: string | null;
  fecha_movimiento: string | null;
  monto: number | null;
  causa: string;
  resuelta_at: string | null;
  detectada_at: string;
}

/** Las cuatro causas, con el texto que ve el usuario. */
export const CAUSAS_CONCILIACION: { clave: string; titulo: string; detalle: string }[] = [
  {
    clave: 'codigo_distinto',
    titulo: 'El código facturado no es el agendado',
    detalle: 'La práctica está contada, pero en la fila de otro código.',
  },
  {
    clave: 'otro_mes',
    titulo: 'El movimiento cae en otro período',
    detalle: 'La fecha del movimiento no coincide con la del turno, así que la práctica suma en otro mes.',
  },
  {
    clave: 'sin_practica',
    titulo: 'Hay atención pero ninguna práctica cargada',
    detalle: 'La práctica no existe para ningún informe. Suelen ser consultas y controles, sin importe.',
  },
  {
    clave: 'sin_atencion',
    titulo: 'El turno no tiene atención',
    detalle: 'Se atendió según la agenda, pero no se cargó el movimiento.',
  },
];

export interface ResumenCausa {
  clave: string;
  titulo: string;
  detalle: string;
  turnos: number;
  monto: number;
}

interface Resultado {
  filas: FilaConciliacion[];
  /** Resumen por causa, DERIVADO del detalle: un solo lugar donde viven los números. */
  porCausa: ResumenCausa[];
  turnos: number;
  monto: number;
  resueltas: number;
  /**
   * `true` cuando el mes no tiene NINGUNA fila espejada. No es lo mismo que
   * "no hubo discrepancias": puede ser un mes anterior al espejo, o que ya
   * salió de la ventana sin haberse llegado a espejar.
   */
  sinDatos: boolean;
  loading: boolean;
  error: string;
}

const VACIO: Omit<Resultado, 'loading' | 'error'> = {
  filas: [], porCausa: [], turnos: 0, monto: 0, resueltas: 0, sinDatos: true,
};

/**
 * Discrepancias del mes entre la agenda y lo facturado.
 *
 * @param mesClave período "YYYY-MM"
 * @param incluirResueltas si se muestran también las ya corregidas en GECLISA
 */
export default function useConciliacionAgenda(
  mesClave: string,
  incluirResueltas = false,
): Resultado {
  const [datos, setDatos] = useState(VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    // Sin período no hay nada que pedir. Pasar "" es como lo apaga quien no
    // tiene el permiso: los hooks corren antes del early return del
    // componente, así que sin este corte saldría una consulta al vacío.
    if (!mesClave) {
      setDatos(VACIO);
      setLoading(false);
      setError('');
      return () => { vivo = false; };
    }
    const cargar = async () => {
      setLoading(true);
      setError('');
      try {
        // El `order` no es cosmético: sin ORDER BY, PostgREST no garantiza el
        // orden entre páginas y una consulta paginada puede repetir o perder
        // filas. Se ordena por importe para que lo que más mueve quede arriba.
        const todas = await traerTodo<FilaConciliacion>((desde) =>
          supabase
            .from('conciliacion_agenda')
            .select('turno_id, fecha_turno, paciente, obra_social, prestador,'
              + ' cod_agendado, cod_facturado, practica, fecha_movimiento, monto,'
              + ' causa, resuelta_at, detectada_at')
            .eq('mes', mesClave)
            .order('monto', { ascending: false })
            .order('turno_id', { ascending: true })
            .range(desde, desde + 999));

        if (!vivo) return;

        const resueltas = todas.filter((f) => f.resuelta_at).length;
        const visibles = incluirResueltas ? todas : todas.filter((f) => !f.resuelta_at);

        const porCausa = CAUSAS_CONCILIACION
          .map((c) => {
            const propias = visibles.filter((f) => f.causa === c.clave);
            return {
              ...c,
              turnos: propias.length,
              monto: propias.reduce((s, f) => s + (Number(f.monto) || 0), 0),
            };
          })
          .filter((c) => c.turnos > 0);

        setDatos({
          filas: visibles,
          porCausa,
          turnos: visibles.length,
          monto: visibles.reduce((s, f) => s + (Number(f.monto) || 0), 0),
          resueltas,
          // Mirar TODAS, no las visibles: un mes donde todo se corrigió tiene
          // datos y hay que decir eso, no "sin datos".
          sinDatos: todas.length === 0,
        });
      } catch (e) {
        if (!vivo) return;
        setDatos(VACIO);
        setError((e as Error).message || 'No se pudo leer la conciliación');
      } finally {
        if (vivo) setLoading(false);
      }
    };
    cargar();
    return () => { vivo = false; };
  }, [mesClave, incluirResueltas]);

  return { ...datos, loading, error };
}
