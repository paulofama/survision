// ============================================================
// HOOK: useConciliacionCostos — costo estándar vs gasto real
// Análisis Marginal · Sistema de Gestión Integral
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// El Análisis Marginal trabaja con COSTO ESTÁNDAR: los honorarios son un
// porcentaje del facturado y los insumos salen de las recetas. En paralelo, la
// clasificación de erogaciones registra el GASTO REAL, y esos comprobantes
// (~$645 M en 2026) no aparecen en ninguna pantalla del módulo.
//
// Sumarlos al estado de resultados sería un error: honorarios e insumos
// quedarían contados dos veces, y encima entrarían devoluciones y anticipos que
// no son costo de la actividad. Por eso esto es una CONCILIACIÓN, no una línea
// más del estado de resultados.
//
// Lo que sí aporta es el desvío. Dos brechas que hoy nadie ve:
//   · lo que efectivamente se paga de honorarios contra lo que el modelo calcula
//   · lo que se compra de insumos contra lo que las recetas consumen
//
// La primera es grande y su causa está sin definir (ver honorariosPrestador.ts).
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { calcularHonorarioPrestacion } from '@shared/utils/honorariosPrestador';
import type { Mes } from '../types/evolucionTemporal';
import { parseMesKey, toMesKey } from '../types/evolucionTemporal';
import { normalizarNombre, detectarSegmento } from '@shared/utils/nombresPrestaciones';
import { crearIndiceRecetas } from '@shared/utils/buscadorRecetas';

/** Médicos prestadores, por apellido + nombre para no confundir homónimos. */
const MEDICOS: Array<[string, string]> = [
  ['MERCADO', 'JORGE'], ['MAHIA', 'PABLO'], ['MUSA', 'CARLOS'],
  ['ROCA', 'LEANDRO'], ['GONZALEZ', 'MARTIN'], ['OLIVA', 'IGNACIA'], ['LOPEZ', 'JORGE'],
];
const mencionaMedico = (t: string): boolean =>
  MEDICOS.some(([ap, no]) => t.includes(ap) && t.includes(no));

export interface LineaConciliacion {
  concepto: string;
  /** Costo estándar por mes (el que usa el estado de resultados). */
  estandar: Record<Mes, number>;
  /** Gasto real por mes (erogaciones clasificadas como variables). */
  real: Record<Mes, number>;
  totalEstandar: number;
  totalReal: number;
  /** real − estándar. Positivo = se gastó más de lo que el modelo computa. */
  desvio: number;
  desvioPct: number;
}

export interface LineaFueraDeCosto {
  concepto: string;
  detalle: string;
  porMes: Record<Mes, number>;
  total: number;
}

export interface ConciliacionCostos {
  lineas: LineaConciliacion[];
  fueraDeCosto: LineaFueraDeCosto[];
  totalRealClasificado: number;
  loading: boolean;
  error: string | null;
}

const VACIO: ConciliacionCostos = {
  lineas: [], fueraDeCosto: [], totalRealClasificado: 0, loading: true, error: null,
};

const cero = (meses: Mes[]): Record<Mes, number> =>
  Object.fromEntries(meses.map((m) => [m, 0])) as Record<Mes, number>;

const filtroMeses = (meses: Mes[]): string =>
  meses.map((m) => { const { anio, mes } = parseMesKey(m); return `and(anio.eq.${anio},mes.eq.${mes})`; }).join(',');

async function traerTodo<T>(build: (desde: number) => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

export function useConciliacionCostos(meses: Mes[], activo: boolean): ConciliacionCostos {
  const [estado, setEstado] = useState<ConciliacionCostos>(VACIO);

  const cargar = useCallback(async (ms: Mes[]) => {
    setEstado({ ...VACIO, loading: true });
    try {
      const orM = filtroMeses(ms);
      const [mov, rec, maps, pres, cfg, ero] = await Promise.all([
        traerTodo<any>((d) => supabase.from('movimientos_geclisa')
          .select('anio, mes, practica_codigo, practica_nombre, prestador_nombre, total')
          .eq('es_principal', true).or(orM).range(d, d + 999)),
        traerTodo<any>((d) => supabase.from('v_recetas_costos_por_pool')
          .select('codigo_practica, nombre_practica, costo_total_pools, costo_insumos_directos').range(d, d + 999)),
        traerTodo<any>((d) => supabase.from('prestaciones_nombre_mapping')
          .select('nombre_geclisa, nombre_receta').range(d, d + 999)),
        traerTodo<any>((d) => supabase.from('prestadores').select('nombre, es_socio').range(d, d + 999)),
        traerTodo<any>((d) => supabase.from('honorarios_config')
          .select('segmento, porcentaje_socio, porcentaje_no_socio').range(d, d + 999)),
        traerTodo<any>((d) => supabase.from('erogaciones_clasificacion')
          .select('anio, mes, monto, proveedor_nombre, descripcion')
          .eq('tipo_costo', 'variable').or(orM).range(d, d + 999)),
      ]);

      const rm = crearIndiceRecetas(rec, maps);
      const pm = new Map(pres.map((p) => [String(p.nombre).toUpperCase(), p]));
      const cs: Record<string, any> = {}; cfg.forEach((c) => cs[c.segmento] = c);

      // ── estándar ──
      const honEst = cero(ms), insEst = cero(ms);
      mov.forEach((r) => {
        const mes = toMesKey(r.anio, r.mes);
        if (honEst[mes] === undefined) return;
        const facturado = Number(r.total) || 0;
        const nombre = String(r.practica_nombre || '');
        const inf = pm.get(String(r.prestador_nombre || '').toUpperCase());
        honEst[mes] += calcularHonorarioPrestacion(facturado, r.prestador_nombre, inf?.es_socio || false, cs[detectarSegmento(nombre, r.practica_codigo)], r.practica_codigo);
        const receta = rm.buscar(r.practica_codigo, nombre);
        if (receta) insEst[mes] += (Number(receta.costo_total_pools) || 0) + (Number(receta.costo_insumos_directos) || 0);
      });

      // ── real, clasificado por concepto ──
      const honReal = cero(ms), insReal = cero(ms);
      const devol = cero(ms), antic = cero(ms), resto = cero(ms);
      let totalReal = 0;

      ero.forEach((r) => {
        const mes = toMesKey(r.anio, r.mes);
        if (honReal[mes] === undefined) return;
        const monto = Math.abs(Number(r.monto) || 0);
        totalReal += monto;
        const t = `${r.proveedor_nombre || ''} ${r.descripcion || ''}`.toUpperCase();

        // El orden importa: una "DEVOLUCION ... DR. MERCADO" es devolución, no honorario.
        if (/DEVOLUCI|DEVBOLUCION|N\.C\.|NOTA DE CREDITO|REINTEGRO/.test(t)) { devol[mes] += monto; return; }
        if (/ANTICIPO|ANTIC\./.test(t)) { antic[mes] += monto; return; }
        if (mencionaMedico(t) || /HONORARIOS|DERIVACIONES|MONITOREOS/.test(t)) { honReal[mes] += monto; return; }
        if (/ALCON|DROGUER|FARMACIA|LABORAT|INSUMO|DESCARTABLE|MED S\.R\.L/.test(t)) { insReal[mes] += monto; return; }
        resto[mes] += monto;
      });

      const sum = (v: Record<Mes, number>) => ms.reduce((s, m) => s + (v[m] || 0), 0);
      const linea = (concepto: string, est: Record<Mes, number>, real: Record<Mes, number>): LineaConciliacion => {
        const te = sum(est), tr = sum(real);
        return { concepto, estandar: est, real, totalEstandar: te, totalReal: tr, desvio: tr - te, desvioPct: te > 0 ? ((tr - te) / te) * 100 : 0 };
      };

      setEstado({
        loading: false,
        error: null,
        totalRealClasificado: totalReal,
        lineas: [
          linea('Honorarios médicos', honEst, honReal),
          linea('Insumos y pools', insEst, insReal),
        ],
        fueraDeCosto: [
          { concepto: 'Devoluciones y notas de crédito', detalle: 'Menos ingreso, no más costo: no corresponde compararlas contra el costo estándar.', porMes: devol, total: sum(devol) },
          { concepto: 'Anticipos', detalle: 'Pagos a cuenta que se cancelan después; no son costo del período.', porMes: antic, total: sum(antic) },
          { concepto: 'Otros gastos variables', detalle: 'Erogaciones variables que no encuadran en los conceptos anteriores.', porMes: resto, total: sum(resto) },
        ],
      });
    } catch (e) {
      setEstado({ ...VACIO, loading: false, error: e instanceof Error ? e.message : 'Error cargando la conciliación' });
    }
  }, []);

  useEffect(() => {
    if (!activo || meses.length === 0) { setEstado({ ...VACIO, loading: false }); return; }
    void cargar(meses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, meses.join('|'), cargar]);

  return estado;
}

export default useConciliacionCostos;
