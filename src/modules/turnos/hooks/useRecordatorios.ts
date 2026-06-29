// ============================================================
// HOOK: useRecordatorios — marca persistente de turnos ya avisados
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Lee turnos_recordatorios (qué turnos ya se avisaron por WhatsApp) y expone
// marcar()/desmarcar() con actualización optimista. La marca persiste entre
// syncs del daemon porque esta tabla se cruza por turno_id y el daemon no la
// toca. Escribe con el cliente autenticado (RLS exige permiso 'turnos').
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';
import { useAuth } from '@shared/context/AuthContext';

interface UseRecordatoriosResult {
  avisados: Set<number>;
  marcar: (turnoId: number) => Promise<void>;
  desmarcar: (turnoId: number) => Promise<void>;
  loading: boolean;
}

export function useRecordatorios(): UseRecordatoriosResult {
  const { usuario } = useAuth();
  const [avisados, setAvisados] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('turnos_recordatorios')
        .select('turno_id');
      if (error) throw new Error(error.message);
      setAvisados(new Set((data || []).map((r: { turno_id: number }) => r.turno_id)));
    } catch (err) {
      console.error('Error cargando recordatorios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const marcar = useCallback(async (turnoId: number) => {
    // Optimista
    setAvisados((prev) => new Set(prev).add(turnoId));
    const { error } = await supabase
      .from('turnos_recordatorios')
      .upsert(
        { turno_id: turnoId, avisado_at: new Date().toISOString(), avisado_por: usuario?.username ?? null, canal: 'whatsapp' },
        { onConflict: 'turno_id' },
      );
    if (error) {
      console.error('Error marcando recordatorio:', error.message);
      setAvisados((prev) => { const n = new Set(prev); n.delete(turnoId); return n; }); // revertir
    }
  }, [usuario]);

  const desmarcar = useCallback(async (turnoId: number) => {
    setAvisados((prev) => { const n = new Set(prev); n.delete(turnoId); return n; });
    const { error } = await supabase
      .from('turnos_recordatorios')
      .delete()
      .eq('turno_id', turnoId);
    if (error) {
      console.error('Error desmarcando recordatorio:', error.message);
      setAvisados((prev) => new Set(prev).add(turnoId)); // revertir
    }
  }, []);

  return { avisados, marcar, desmarcar, loading };
}
