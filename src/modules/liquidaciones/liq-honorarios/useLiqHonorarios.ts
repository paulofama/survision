// ============================================================
// HOOK: useLiqHonorarios
// CRUD completo contra Supabase + estado local
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@shared/lib/supabase';
import type {
  LiqHonorario,
  LiqHonorarioConPrestador,
  LiqPrestador,
  LiqOperationResult,
  CajaCalculated,
} from './types';
import { calcularOS, calcularTotales } from './useCajaCalculation';

export function useLiqHonorarios() {
  const [liquidaciones, setLiquidaciones] = useState<LiqHonorarioConPrestador[]>([]);
  const [prestadores, setPrestadores] = useState<LiqPrestador[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Cargar prestadores ───────────────────────────────
  const loadPrestadores = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('liq_honorarios_prestadores')
      .select('*')
      .eq('activo', true)
      .order('orden', { ascending: true });

    if (err) {
      console.error('Error cargando prestadores:', err);
      setError('Error al cargar prestadores: ' + err.message);
      return;
    }
    setPrestadores(data || []);
  }, []);

  // ─── Cargar liquidaciones ─────────────────────────────
  const loadLiquidaciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('liq_honorarios')
        .select(`
          *,
          prestador:liq_honorarios_prestadores (
            nombre,
            nombre_corto,
            condicion_iva,
            cuit
          )
        `)
        .eq('estado', 'vigente')
        .order('fecha', { ascending: false });

      if (err) throw new Error(err.message);

      // Mapear el join a la estructura plana
      const mapped: LiqHonorarioConPrestador[] = (data || []).map((row: any) => ({
        ...row,
        prestador_nombre: row.prestador?.nombre || '',
        prestador_corto: row.prestador?.nombre_corto || null,
        prestador_condicion_iva: row.prestador?.condicion_iva || '',
        prestador_cuit: row.prestador?.cuit || null,
        // Limpiar el objeto anidado
        prestador: undefined,
      }));

      setLiquidaciones(mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError('Error al cargar liquidaciones: ' + msg);
      console.error('Error cargando liquidaciones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Guardar (crear o actualizar) ─────────────────────
  const guardar = useCallback(
    async (params: {
      id?: string; // Si existe → update, sino → insert
      fecha: string;
      prestadorId: string;
      ingresoPorCaja: number;
      cajaExentoInput: number;
      cajaNetoInput: number;
      cajaTotalInput: number;
      cajaValues: CajaCalculated;
      osExentos: number;
      osGravados21: number;
      osGravados105: number;
      retencionGastos: number;
    }): Promise<LiqOperationResult> => {
      try {
        const os = calcularOS(params.osExentos, params.osGravados21, params.osGravados105);
        const totales = calcularTotales(
          params.ingresoPorCaja,
          params.cajaValues,
          os,
          params.retencionGastos
        );

        const record = {
          fecha: params.fecha,
          prestador_id: params.prestadorId,
          ingreso_por_caja: params.ingresoPorCaja,
          
          // Caja inputs
          caja_exento_input: params.cajaExentoInput,
          caja_neto_input: params.cajaNetoInput,
          caja_total_input: params.cajaTotalInput,
          
          // Caja calculados
          caja_exentos: params.cajaValues.exento,
          caja_neto_105: params.cajaValues.neto105,
          caja_iva_105: params.cajaValues.iva105,
          caja_neto_21: params.cajaValues.neto21,
          caja_iva_21: params.cajaValues.iva21,
          caja_iva_total: params.cajaValues.iva105 + params.cajaValues.iva21,
          caja_total: params.cajaValues.total,
          caja_estado: params.cajaValues.estado,
          
          // OS
          os_exentos: params.osExentos,
          os_gravados_21: params.osGravados21,
          os_gravados_105: params.osGravados105,
          os_iva_21: os.osIva21,
          os_iva_105: os.osIva105,
          os_iva_total: os.osIvaTotal,
          os_total: os.osTotal,
          
          // Retenciones y totales
          retencion_gastos: params.retencionGastos,
          total_exentos: totales.totalExentos,
          total_gravados_21: totales.totalGravados21,
          total_gravados_105: totales.totalGravados105,
          total_iva: totales.totalIva,
          total_liquidado: totales.totalLiquidado,
          total_abonar: totales.totalAbonar,
        };

        if (params.id) {
          // UPDATE
          const { data, error: err } = await supabase
            .from('liq_honorarios')
            .update(record)
            .eq('id', params.id)
            .select()
            .single();

          if (err) throw new Error(err.message);
          await loadLiquidaciones();
          return { success: true, message: 'Liquidación actualizada exitosamente', data };
        } else {
          // INSERT
          const { data, error: err } = await supabase
            .from('liq_honorarios')
            .insert([{ ...record, estado: 'vigente' }])
            .select()
            .single();

          if (err) throw new Error(err.message);
          await loadLiquidaciones();
          return { success: true, message: 'Liquidación guardada exitosamente', data };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al guardar';
        return { success: false, message: msg };
      }
    },
    [loadLiquidaciones]
  );

  // ─── Eliminar (soft delete) ───────────────────────────
  const eliminar = useCallback(
    async (id: string): Promise<LiqOperationResult> => {
      try {
        const { error: err } = await supabase
          .from('liq_honorarios')
          .update({ estado: 'anulada' })
          .eq('id', id);

        if (err) throw new Error(err.message);
        await loadLiquidaciones();
        return { success: true, message: 'Liquidación eliminada correctamente' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al eliminar';
        return { success: false, message: msg };
      }
    },
    [loadLiquidaciones]
  );

  // ─── Obtener una liquidación por ID ───────────────────
  const getById = useCallback(
    (id: string): LiqHonorarioConPrestador | undefined => {
      return liquidaciones.find((l) => l.id === id);
    },
    [liquidaciones]
  );

  // ─── Estadísticas ─────────────────────────────────────
  const stats = {
    count: liquidaciones.length,
    totalLiquidado: liquidaciones.reduce((sum, l) => sum + l.total_liquidado, 0),
    totalAbonar: liquidaciones.reduce((sum, l) => sum + l.total_abonar, 0),
  };

  // ─── Carga inicial ────────────────────────────────────
  useEffect(() => {
    loadPrestadores();
    loadLiquidaciones();
  }, [loadPrestadores, loadLiquidaciones]);

  return {
    liquidaciones,
    prestadores,
    loading,
    error,
    stats,
    guardar,
    eliminar,
    getById,
    reload: loadLiquidaciones,
  };
}
