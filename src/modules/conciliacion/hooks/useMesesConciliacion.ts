// ============================================================
// HOOK: useMesesConciliacion
// Conciliación agenda vs facturación — Sistema de Gestión Integral
// ============================================================
//
// Los períodos que TIENEN datos espejados, para el selector de la pantalla.
//
// POR QUÉ NO UN SELECTOR DE AÑO Y MES COMÚN
// ------------------------------------------
// Porque la mayoría de las combinaciones no existen y nunca van a existir. La
// agenda de GECLISA es una ventana móvil que guarda unos tres meses cerrados:
// un mes anterior al arranque de este espejo ya no se puede recalcular. Un
// selector libre invitaría a elegir períodos vacíos y a leer ese vacío como
// "no hubo diferencias", que es exactamente la confusión que esta pantalla
// vino a deshacer.
//
// Así que se ofrecen los meses que hay, con cuántas diferencias tiene cada uno.
// ============================================================

import { useState, useEffect } from 'react';
import { supabase } from '@shared/lib/supabase';
import { traerTodo } from '@shared/lib/traerTodo';

export interface MesConciliacion {
  mes: string;
  /** Diferencias todavía sin corregir. */
  pendientes: number;
  /** Ya corregidas en GECLISA; la fila se conserva marcada. */
  resueltas: number;
}

interface Resultado {
  meses: MesConciliacion[];
  loading: boolean;
  error: string;
}

export default function useMesesConciliacion(): Resultado {
  const [meses, setMeses] = useState<MesConciliacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      setLoading(true);
      setError('');
      try {
        // Se traen `mes` y `resuelta_at` y se agrupa en el cliente: PostgREST
        // no hace GROUP BY sin una vista, y la tabla crece ~18 filas por mes,
        // así que agrupar acá no cuesta nada. Paginado igual, con ORDER BY.
        const filas = await traerTodo<{ mes: string; resuelta_at: string | null }>((desde) =>
          supabase
            .from('conciliacion_agenda')
            .select('mes, resuelta_at')
            .order('mes', { ascending: false })
            .order('turno_id', { ascending: true })
            .range(desde, desde + 999));

        if (!vivo) return;

        const porMes = new Map<string, MesConciliacion>();
        for (const f of filas) {
          const m = porMes.get(f.mes) || { mes: f.mes, pendientes: 0, resueltas: 0 };
          if (f.resuelta_at) m.resueltas += 1; else m.pendientes += 1;
          porMes.set(f.mes, m);
        }
        // Del más nuevo al más viejo: lo que se está corrigiendo ahora va primero.
        setMeses([...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes)));
      } catch (e) {
        if (!vivo) return;
        setMeses([]);
        setError((e as Error).message || 'No se pudieron leer los períodos');
      } finally {
        if (vivo) setLoading(false);
      }
    };
    cargar();
    return () => { vivo = false; };
  }, []);

  return { meses, loading, error };
}
