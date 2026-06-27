// ============================================
// HOOK: useSeguimientoPacientes
// Seguimiento Mensual de Pacientes
// Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@shared/lib/supabase';

// ============================================
// TYPES
// ============================================

export interface KPIs {
  totalAtenciones: number;
  pacientesUnicos: number;
  totalCirugias: number;
  pacientesQuirurgicos: number;
  totalConsultas: number;
  totalEstudios: number;
}

export interface Alerta {
  id: string;
  nivel: 'critico' | 'medio' | 'informativo';
  semaforo: 'rojo' | 'amarillo' | 'verde';
  titulo: string;
  descripcion: string;
  cantidad: number;
  detalle: any[];
}

export interface PacienteQuirurgico {
  fichaId: number;
  paciente: string;
  edad: number;
  sexo: string;
  obraSocial: string;
  fechaCirugia: string;
  cirugia: string;
  codigoCirugia: string;
  prestadorCirugia: string;
  controlesPost: number;
  semaforo: 'rojo' | 'amarillo' | 'verde';
}

export interface Hiperfrecuentador {
  fichaId: number;
  paciente: string;
  edad: number;
  sexo: string;
  visitas: number;
  practicasTotal: number;
  clasificacion: string;
  obrasSociales: string[];
  prestadores: string[];
  servicios: string[];
  practicas: string[];
  esAlerta: boolean;
}

export interface DistribucionOS {
  osId: number;
  osNombre: string;
  osSigla: string;
  atenciones: number;
  pacientes: number;
  cirugias: number;
  participacionPct: number;
}

export interface DistribucionPrestador {
  preId: number;
  preNombre: string;
  atenciones: number;
  cirugias: number;
  participacionPct: number;
}

export interface TendenciaMes {
  anio: number;
  mes: number;
  label: string;
  atenciones: number;
  pacientes: number;
  consultas: number;
  estudios: number;
  cirugias: number;
  pacientesQx: number;
}

export interface InformeMensual {
  generadoEn: string;
  periodo: {
    mes: number;
    anio: number;
    label: string;
    mesAnteriorLabel: string;
  };
  umbrales: {
    hiperfrecuentador: number;
    reconsultaDias: number;
    controlesOk: number;
  };
  kpis: {
    actual: KPIs;
    anterior: KPIs;
    variacionPct: KPIs;
  };
  alertas: Alerta[];
  panelQuirurgico: PacienteQuirurgico[];
  hiperfrecuentadores: {
    todos: Hiperfrecuentador[];
    noQuirurgicos: Hiperfrecuentador[];
    quirurgicos: Hiperfrecuentador[];
    total: number;
  };
  distribucion: {
    porObraSocial: DistribucionOS[];
    porPrestador: DistribucionPrestador[];
    porTipoPaciente: { tipo: string; cantidad: number; porcentaje: number }[];
  };
  tendencia: TendenciaMes[];
}

export interface MesDisponible {
  anio: number;
  mes: number;
  label: string;
  atenciones: number;
}

const MESES_NOMBRE: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
  7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

// ============================================
// HOOK
// ============================================

export function useSeguimientoPacientes() {
  const [informe, setInforme] = useState<InformeMensual | null>(null);
  const [mesesDisponibles, setMesesDisponibles] = useState<MesDisponible[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mesSeleccionado, setMesSeleccionado] = useState<{ mes: number; anio: number } | null>(null);

  // Cargar meses disponibles desde los snapshots de Supabase (dashboards_snapshot,
  // modulo='seguimiento'). El daemon on-prem los mantiene frescos; así anda remoto.
  const cargarMeses = useCallback(async () => {
    try {
      const { data, error: sbErr } = await supabase
        .from('dashboards_snapshot')
        .select('anio, mes, resumen')
        .eq('modulo', 'seguimiento')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false });
      if (sbErr) throw new Error(sbErr.message);

      const meses: MesDisponible[] = (data || []).map((r) => ({
        anio: r.anio,
        mes: r.mes,
        label: `${MESES_NOMBRE[r.mes] || ''} ${r.anio}`,
        atenciones: (r.resumen as { atenciones?: number } | null)?.atenciones ?? 0,
      }));
      setMesesDisponibles(meses);
      // Auto-seleccionar el más reciente
      if (meses.length > 0 && !mesSeleccionado) {
        setMesSeleccionado({ mes: meses[0].mes, anio: meses[0].anio });
      }
    } catch (err) {
      console.error('Error cargando meses:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar informe mensual desde el snapshot de Supabase
  const cargarInforme = useCallback(async (mes: number, anio: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbErr } = await supabase
        .from('dashboards_snapshot')
        .select('payload')
        .eq('modulo', 'seguimiento')
        .eq('anio', anio)
        .eq('mes', mes)
        .maybeSingle();
      if (sbErr) throw new Error(sbErr.message);
      if (!data) {
        setError('Todavía no hay datos sincronizados para este mes. El sync corre 2 veces por día (12:00 y 17:00).');
        setInforme(null);
        return;
      }
      setInforme(data.payload as InformeMensual);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      setInforme(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar meses al montar
  useEffect(() => {
    cargarMeses();
  }, [cargarMeses]);

  // Cargar informe cuando cambia el mes seleccionado
  useEffect(() => {
    if (mesSeleccionado) {
      cargarInforme(mesSeleccionado.mes, mesSeleccionado.anio);
    }
  }, [mesSeleccionado, cargarInforme]);

  // Contadores de semáforo del panel quirúrgico
  const resumenSemaforo = useMemo(() => {
    if (!informe) return { rojo: 0, amarillo: 0, verde: 0 };
    const panel = informe.panelQuirurgico;
    return {
      rojo: panel.filter((p) => p.semaforo === 'rojo').length,
      amarillo: panel.filter((p) => p.semaforo === 'amarillo').length,
      verde: panel.filter((p) => p.semaforo === 'verde').length,
    };
  }, [informe]);

  return {
    informe,
    mesesDisponibles,
    loading,
    error,
    mesSeleccionado,
    setMesSeleccionado,
    resumenSemaforo,
    refetch: () => {
      if (mesSeleccionado) cargarInforme(mesSeleccionado.mes, mesSeleccionado.anio);
    },
  };
}
