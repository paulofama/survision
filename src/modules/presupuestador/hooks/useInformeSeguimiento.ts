// ============================================================
// Carga de datos del informe mensual de Seguimiento telefónico
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// Trae las cuatro tablas del circuito y se las pasa al cálculo. El hook NO
// calcula nada: toda la lógica vive en `utils/informeSeguimiento`, que es puro
// y está testeado, y de ahí leen tanto la pantalla como el PDF.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { sbGet } from '../utils/circuito';
import type { Seguimiento } from '../utils/seguimiento';
import {
  calcularInformeSeguimiento,
  type InformeSeguimiento, type PresInforme, type LlamadaInforme, type EncuestaInforme,
} from '../utils/informeSeguimiento';

const SELECT_PRES =
  'id,numero_presupuesto,paciente_apellido,paciente_nombre,prestacion_codigo,' +
  'prestacion_descripcion,total_final,estado,fecha_creacion,fecha_practica,telefono';

/**
 * Trae TODAS las páginas de una tabla.
 *
 * PostgREST corta en 1.000 filas sin avisar —devuelve `error: null`, así que
 * una respuesta truncada es indistinguible de una completa—. `presupuestos` ya
 * pasó las 1.000, así que acá no es precaución: es obligatorio.
 */
async function traerTodas<T>(recurso: string): Promise<T[]> {
  const out: T[] = [];
  let desde = 0;
  for (;;) {
    const sep = recurso.includes('?') ? '&' : '?';
    const page = await sbGet<T>(`${recurso}${sep}limit=1000&offset=${desde}`);
    out.push(...page);
    if (page.length < 1000) break;
    desde += 1000;
  }
  return out;
}

export function useInformeSeguimiento(anio: number, mes: number) {
  const [informe, setInforme] = useState<InformeSeguimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [presupuestos, seguimientos, llamadas, encuestas] = await Promise.all([
        traerTodas<PresInforme>(`presupuestos?select=${SELECT_PRES}`),
        traerTodas<Seguimiento>('presupuestos_seguimiento?select=*'),
        traerTodas<LlamadaInforme>('presupuestos_seguimiento_llamadas?select=*'),
        traerTodas<EncuestaInforme>('presupuestos_seguimiento_encuesta?select=*'),
      ]);
      setInforme(calcularInformeSeguimiento({ anio, mes, presupuestos, seguimientos, llamadas, encuestas }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el informe');
      setInforme(null);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  return { informe, loading, error, recargar: cargar };
}

export default useInformeSeguimiento;
