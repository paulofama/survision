// ============================================================
// HOOK - useInformePresupuestos
// Datos del informe mensual de presupuestos
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Los datos llegan de una sola llamada a `informe_presupuestos_datos()`
// (migración 81), que pide el permiso 'informes:presupuestos'. Trae todos los
// presupuestos (~1.200, un único jsonb) y el informe se calcula en memoria.
// ============================================================

import { useState, useCallback } from 'react';
import { supabase } from '@shared/lib/supabase';
import type { EstadoInforme } from '@shared/types/informes';
import {
  calcularInformePresupuestos,
  type InformePresupuestos,
  type PresupuestoInforme,
  type UsuarioInforme,
} from '../utils/informePresupuestos';

interface RespuestaRpc {
  presupuestos: PresupuestoInforme[];
  usuarios: UsuarioInforme[];
}

interface UseInformePresupuestosReturn {
  estado: EstadoInforme;
  informe: InformePresupuestos | null;
  error: string | null;
  cargar: (mes: number, anio: number) => Promise<void>;
  limpiar: () => void;
}

/** Números que llegan del jsonb: por las dudas de un string. */
const normalizar = (p: PresupuestoInforme): PresupuestoInforme => ({
  ...p,
  neto: Number(p.neto) || 0,
  cobertura: Number(p.cobertura) || 0,
});

export const useInformePresupuestos = (): UseInformePresupuestosReturn => {
  const [estado, setEstado] = useState<EstadoInforme>('idle');
  const [informe, setInforme] = useState<InformePresupuestos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (mes: number, anio: number) => {
    setEstado('cargando');
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('informe_presupuestos_datos');
      if (rpcErr) throw new Error(rpcErr.message);
      const r = data as RespuestaRpc | null;
      if (!r || !Array.isArray(r.presupuestos)) throw new Error('La base no devolvió datos para el informe.');
      setInforme(calcularInformePresupuestos({
        anio,
        mes,
        presupuestos: r.presupuestos.map(normalizar),
        usuarios: r.usuarios ?? [],
        hoy: new Date(),
      }));
      setEstado('listo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setEstado('error');
    }
  }, []);

  const limpiar = useCallback(() => {
    setEstado('idle');
    setInforme(null);
    setError(null);
  }, []);

  return { estado, informe, error, cargar, limpiar };
};
