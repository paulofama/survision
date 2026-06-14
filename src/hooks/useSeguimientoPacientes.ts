// ============================================
// HOOK: useSeguimientoPacientes
// Seguimiento Mensual de Pacientes
// Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

// ============================================
// HOOK
// ============================================

export function useSeguimientoPacientes() {
  const [informe, setInforme] = useState<InformeMensual | null>(null);
  const [mesesDisponibles, setMesesDisponibles] = useState<MesDisponible[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mesSeleccionado, setMesSeleccionado] = useState<{ mes: number; anio: number } | null>(null);

  // Cargar meses disponibles
  const cargarMeses = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/seguimiento-pacientes/meses-disponibles`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setMesesDisponibles(data.meses || []);
      // Auto-seleccionar el más reciente
      if (data.meses?.length > 0 && !mesSeleccionado) {
        const ultimo = data.meses[0];
        setMesSeleccionado({ mes: ultimo.mes, anio: ultimo.anio });
      }
    } catch (err) {
      console.error('Error cargando meses:', err);
    }
  }, []);

  // Cargar informe mensual
  const cargarInforme = useCallback(async (mes: number, anio: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/seguimiento-pacientes/informe-mensual?mes=${mes}&anio=${anio}`
      );
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data: InformeMensual = await res.json();
      setInforme(data);
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
