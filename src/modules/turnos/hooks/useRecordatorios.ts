// ============================================================
// HOOK: useRecordatorios — marca persistente de avisos por TIPO de mensaje
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Lee turnos_recordatorios (qué avisos ya se enviaron por WhatsApp) y expone
// marcar()/desmarcar() por TIPO (inicial / previo / final), con actualización
// optimista. Cada tipo se envía UNA sola vez por turno (control de duplicados).
// La marca persiste entre syncs del daemon porque esta tabla se cruza por
// turno_id (estable) y el daemon no la toca. Escribe con el cliente autenticado
// (RLS exige permiso 'turnos').
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';
import { useAuth } from '@shared/context/AuthContext';
import { TipoRecordatorio } from '../utils/recordatorios';

/** Columna timestamptz de cada tipo en turnos_recordatorios. */
const COL: Record<TipoRecordatorio, string> = {
  inicial: 'aviso_inicial_at',
  previo: 'aviso_previo_at',
  final: 'aviso_final_at',
};

export type AvisadosPorTipo = Record<TipoRecordatorio, Set<number>>;

interface UseRecordatoriosResult {
  avisados: AvisadosPorTipo;
  marcar: (turnoId: number, tipo: TipoRecordatorio) => Promise<void>;
  desmarcar: (turnoId: number, tipo: TipoRecordatorio) => Promise<void>;
  loading: boolean;
}

const vacio = (): AvisadosPorTipo => ({ inicial: new Set(), previo: new Set(), final: new Set() });

export function useRecordatorios(): UseRecordatoriosResult {
  const { usuario } = useAuth();
  const [avisados, setAvisados] = useState<AvisadosPorTipo>(vacio);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('turnos_recordatorios')
        .select('turno_id, aviso_inicial_at, aviso_previo_at, aviso_final_at');
      if (error) throw new Error(error.message);

      const next = vacio();
      (data || []).forEach((r: any) => {
        if (r.aviso_inicial_at) next.inicial.add(r.turno_id);
        if (r.aviso_previo_at) next.previo.add(r.turno_id);
        if (r.aviso_final_at) next.final.add(r.turno_id);
      });
      setAvisados(next);
    } catch (err) {
      console.error('Error cargando recordatorios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const setTipo = useCallback((tipo: TipoRecordatorio, turnoId: number, add: boolean) => {
    setAvisados((prev) => {
      const set = new Set(prev[tipo]);
      if (add) set.add(turnoId);
      else set.delete(turnoId);
      return { ...prev, [tipo]: set };
    });
  }, []);

  const marcar = useCallback(async (turnoId: number, tipo: TipoRecordatorio) => {
    setTipo(tipo, turnoId, true); // optimista
    // Upsert por turno_id: setea SOLO la columna de este tipo; las de los otros
    // tipos no van en el payload -> se preservan (ON CONFLICT DO UPDATE parcial).
    const { error } = await supabase
      .from('turnos_recordatorios')
      .upsert(
        { turno_id: turnoId, [COL[tipo]]: new Date().toISOString(), avisado_por: usuario?.username ?? null, canal: 'whatsapp' },
        { onConflict: 'turno_id' },
      );
    if (error) {
      console.error('Error marcando recordatorio:', error.message);
      setTipo(tipo, turnoId, false); // revertir
    }
  }, [usuario, setTipo]);

  const desmarcar = useCallback(async (turnoId: number, tipo: TipoRecordatorio) => {
    setTipo(tipo, turnoId, false); // optimista
    const { error } = await supabase
      .from('turnos_recordatorios')
      .update({ [COL[tipo]]: null })
      .eq('turno_id', turnoId);
    if (error) {
      console.error('Error desmarcando recordatorio:', error.message);
      setTipo(tipo, turnoId, true); // revertir
    }
  }, [setTipo]);

  return { avisados, marcar, desmarcar, loading };
}
