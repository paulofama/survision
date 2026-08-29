// ============================================================
// HOOK: useEvolucionDetalle — apertura al detalle atómico
// Evolución Temporal · Análisis Marginal
// ============================================================
//
// Carga bajo demanda las filas del último nivel de una agrupación de la grilla
// mensual, y las cachea. Colapsar y volver a expandir no re-consulta.
//
// QUÉ ES "EL DETALLE" EN CADA BLOQUE
// ----------------------------------
// El prompt original pedía "comprobantes" en los cuatro bloques. No es posible:
// dos de ellos no tienen comprobante detrás. El detalle atómico real es:
//
//   costos_fijos      → comprobante de `erogaciones_clasificacion`. Es el único
//                       caso donde "comprobante" es literal.
//   costos_variables  → prestación. El costo es ESTÁNDAR (honorarios como % del
//                       facturado, pools e insumos según receta): no existe un
//                       comprobante que lo respalde.
//   facturacion       → obra social de esa prestación, y de ahí a las
//                       ATENCIONES una por una (nivel 4): fecha, paciente y
//                       prestador. Ese último nivel es el fondo del pozo.
//                       Se abre bajo demanda, una obra social por vez, así que
//                       nunca se traen las ~1.500 atenciones del mes de golpe.
//   no_identificados  → prestación facturada sin receta.
//   modulo_sueldos    → NO tiene detalle. Sueldos, Cargas Sociales y HC vienen
//                       del módulo de Sueldos; se devuelve una nota con link.
//                       Se decidió no exponer el detalle por empleado acá: el
//                       permiso de análisis marginal es más amplio que el de
//                       sueldos.
//
// CUADRATURA
// ----------
// Para cada mes, la suma del detalle debe dar el total de su fila padre. Si no,
// se agrega una fila de diferencia visible (nunca se oculta el desvío) y se
// registra en consola. Ver `cuadrarDetalle`.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { calcularHonorarioPrestacion } from '@shared/utils/honorariosPrestador';
import type { BloqueDetalle, FilaEvolucion, Mes } from '../types/evolucionTemporal';
import { parseMesKey, toMesKey } from '../types/evolucionTemporal';
import { cuadrarDetalle } from '../utils/cuadraturaDetalle';
import { normalizarNombre, detectarSegmento } from '@shared/utils/nombresPrestaciones';
import { crearIndiceRecetas } from '@shared/utils/buscadorRecetas';

/** Tope de filas por agrupación. Por encima se trunca y se avisa explícitamente. */
export const TOPE_FILAS_DETALLE = 200;

export interface ParamsDetalle {
  bloque: BloqueDetalle;
  clave: string;
  label: string;
  meses: Mes[];
  /** Nivel de las filas que se devuelven (una más que la fila padre). */
  nivel: 1 | 2 | 3 | 4;
  /** Total por mes de la fila padre — para verificar la cuadratura. */
  totalPadre: Record<Mes, number>;
}

export interface ResultadoDetalle {
  filas: FilaEvolucion[];
  loading: boolean;
  error: string | null;
  /** Cantidad real de elementos antes de truncar. */
  totalElementos: number;
  truncado: boolean;
}

const VACIO: ResultadoDetalle = { filas: [], loading: false, error: null, totalElementos: 0, truncado: false };

// Cache a nivel módulo: sobrevive al desmontaje de la fila.
const cache = new Map<string, ResultadoDetalle>();
const claveCache = (p: ParamsDetalle) => `${p.bloque}|${p.clave}|${p.meses[0]}|${p.meses[p.meses.length - 1]}`;

/** Limpia el cache. La página lo llama cuando cambia el período. */
export const invalidarCacheDetalle = (): void => { cache.clear(); };

const filtroMeses = (meses: Mes[]): string =>
  meses.map((m) => { const { anio, mes } = parseMesKey(m); return `and(anio.eq.${anio},mes.eq.${mes})`; }).join(',');

const vacio = (meses: Mes[]): Record<Mes, number> =>
  Object.fromEntries(meses.map((m) => [m, 0])) as Record<Mes, number>;

/** Trae todas las páginas de una consulta ya construida. */
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

// ============================================================
// CARGADORES POR BLOQUE
// ============================================================

interface Agrupado {
  clave: string;
  label: string;
  grupo?: string;
  valores: Record<Mes, number>;
  tituloCompleto?: string;
  negativo?: boolean;
  /** Si la fila se puede seguir abriendo (nivel 4). */
  detalleLazy?: { bloque: BloqueDetalle; clave: string; label: string };
}

/** Comprobantes de una categoría de costos fijos. */
async function cargarCostosFijos(p: ParamsDetalle): Promise<Agrupado[]> {
  const cats = await supabase.from('categorias_costo_fijo').select('id,nombre');
  if (cats.error) throw new Error(cats.error.message);
  const catId = (cats.data || []).find((c: any) => c.nombre === p.clave)?.id;

  const filas = await traerTodo<any>((desde) => {
    let q = supabase.from('erogaciones_clasificacion')
      .select('id, anio, mes, fecha, monto, proveedor_nombre, descripcion, categoria_costo_fijo_id')
      .eq('tipo_costo', 'fijo')
      .or(filtroMeses(p.meses))
      .range(desde, desde + 999);
    q = catId ? q.eq('categoria_costo_fijo_id', catId) : q.is('categoria_costo_fijo_id', null);
    return q;
  });

  return filas.map((r) => {
    const mes = toMesKey(r.anio, r.mes);
    const v = vacio(p.meses);
    const monto = Number(r.monto) || 0;
    if (v[mes] !== undefined) v[mes] = monto;
    const dia = String(r.fecha || '').slice(8, 10);
    const mm = String(r.fecha || '').slice(5, 7);
    const prov = String(r.proveedor_nombre || '').trim();
    const desc = String(r.descripcion || '').trim();
    const label = [`${dia}/${mm}`, prov || null, desc || null].filter(Boolean).join(' · ');
    return {
      clave: String(r.id),
      label,
      grupo: prov || '(sin proveedor)',
      valores: v,
      tituloCompleto: label,
      negativo: monto < 0,
    };
  }).sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '', 'es') || a.label.localeCompare(b.label, 'es'));
}

/**
 * Separador de la clave compuesta del nivel 4. Es U+241F (símbolo de "unit
 * separator"), elegido justamente porque no puede aparecer en el nombre de una
 * práctica ni en una sigla de obra social.
 */
export const SEP_CLAVE = '␟';

/** Obras sociales de una prestación (nivel 3 de facturación). */
async function cargarFacturacionPorOS(p: ParamsDetalle): Promise<Agrupado[]> {
  const filas = await traerTodo<any>((desde) =>
    supabase.from('movimientos_geclisa')
      .select('anio, mes, os_sigla, os_nombre, total')
      .eq('es_principal', true)
      .eq('practica_nombre', p.clave)
      .or(filtroMeses(p.meses))
      .range(desde, desde + 999));

  const acum = new Map<string, Agrupado>();
  filas.forEach((r) => {
    const k = String(r.os_sigla || 'Sin OS');
    const e = acum.get(k) || {
      clave: k,
      label: k,
      grupo: k,
      valores: vacio(p.meses),
      tituloCompleto: String(r.os_nombre || k),
      // Nivel 4: abre las atenciones una por una. La clave lleva las dos
      // coordenadas que hacen falta para volver a encontrarlas.
      detalleLazy: { bloque: 'atenciones' as BloqueDetalle, clave: `${p.clave}${SEP_CLAVE}${k}`, label: `${p.label} · ${k}` },
    };
    const mes = toMesKey(r.anio, r.mes);
    if (e.valores[mes] !== undefined) e.valores[mes] += Number(r.total) || 0;
    acum.set(k, e);
  });
  return [...acum.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/**
 * Atenciones individuales de una prestación en una obra social (nivel 4).
 *
 * Es el fondo del pozo: una fila = una atención = un paciente en una fecha.
 * Debajo de esto no hay nada más que abrir.
 *
 * Cada fila carga su importe en el mes que le toca y cero en los demás, así
 * que la columna del mes suma exactamente el total de su obra social.
 */
async function cargarAtenciones(p: ParamsDetalle): Promise<Agrupado[]> {
  const [practica, osSigla] = p.clave.split(SEP_CLAVE);

  const filas = await traerTodo<any>((desde) => {
    let q = supabase.from('movimientos_geclisa')
      .select('atencion_id, anio, mes, fecha, paciente, paciente_documento, prestador_nombre, os_sigla, total')
      .eq('es_principal', true)
      .eq('practica_nombre', practica)
      .or(filtroMeses(p.meses))
      .range(desde, desde + 999);
    // 'Sin OS' es la etiqueta que puso el nivel 3 para os_sigla nula o vacía.
    q = osSigla === 'Sin OS' ? q.or('os_sigla.is.null,os_sigla.eq.') : q.eq('os_sigla', osSigla);
    return q;
  });

  return filas.map((r) => {
    const mes = toMesKey(r.anio, r.mes);
    const v = vacio(p.meses);
    const monto = Number(r.total) || 0;
    if (v[mes] !== undefined) v[mes] = monto;

    const f = String(r.fecha || '');
    const fechaCorta = `${f.slice(8, 10)}/${f.slice(5, 7)}`;
    const paciente = String(r.paciente || 'Sin paciente').trim();
    const prestador = String(r.prestador_nombre || '').trim();

    return {
      clave: String(r.atencion_id),
      label: [fechaCorta, paciente, prestador || null].filter(Boolean).join(' · '),
      grupo: prestador || '(sin prestador)',
      valores: v,
      tituloCompleto: [
        `Atención ${r.atencion_id}`,
        `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`,
        paciente,
        r.paciente_documento ? `DNI ${r.paciente_documento}` : null,
        prestador || null,
      ].filter(Boolean).join(' · '),
      negativo: monto < 0,
    };
  }).sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '', 'es') || a.label.localeCompare(b.label, 'es'));
}

/** Prestaciones que componen honorarios / pools / insumos. */
async function cargarCostosVariables(p: ParamsDetalle): Promise<Agrupado[]> {
  const [mov, rec, maps, pres, cfg] = await Promise.all([
    traerTodo<any>((d) => supabase.from('movimientos_geclisa')
      .select('anio, mes, practica_codigo, practica_nombre, prestador_nombre, total')
      .eq('es_principal', true).or(filtroMeses(p.meses)).range(d, d + 999)),
    traerTodo<any>((d) => supabase.from('v_recetas_costos_por_pool')
      .select('codigo_practica, nombre_practica, costo_total_pools, costo_insumos_directos').range(d, d + 999)),
    traerTodo<any>((d) => supabase.from('prestaciones_nombre_mapping').select('nombre_geclisa, nombre_receta').range(d, d + 999)),
    traerTodo<any>((d) => supabase.from('prestadores').select('nombre, es_socio').range(d, d + 999)),
    traerTodo<any>((d) => supabase.from('honorarios_config').select('segmento, porcentaje_socio, porcentaje_no_socio').range(d, d + 999)),
  ]);

  const rm = crearIndiceRecetas(rec, maps);
  const pm = new Map(pres.map((x) => [String(x.nombre).toUpperCase(), x]));
  const cs: Record<string, any> = {}; cfg.forEach((c) => cs[c.segmento] = c);

  const acum = new Map<string, Agrupado>();
  mov.forEach((r) => {
    const facturado = Number(r.total) || 0;
    const nombre = String(r.practica_nombre || 'Sin práctica');
    const receta = rm.buscar(r.practica_codigo, nombre);
    let monto = 0;
    if (p.clave === 'honorarios') {
      const inf = pm.get(String(r.prestador_nombre || '').toUpperCase());
      monto = calcularHonorarioPrestacion(facturado, r.prestador_nombre, inf?.es_socio || false, cs[detectarSegmento(nombre, r.practica_codigo)], r.practica_codigo);
    } else if (p.clave === 'pools') {
      monto = receta ? Number(receta.costo_total_pools) || 0 : 0;
    } else {
      monto = receta ? Number(receta.costo_insumos_directos) || 0 : 0;
    }
    if (monto === 0) return;
    const e = acum.get(nombre) || { clave: nombre, label: nombre, grupo: detectarSegmento(nombre, r.practica_codigo), valores: vacio(p.meses), tituloCompleto: nombre };
    const mes = toMesKey(r.anio, r.mes);
    if (e.valores[mes] !== undefined) e.valores[mes] += monto;
    acum.set(nombre, e);
  });
  return [...acum.values()].sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '', 'es') || a.label.localeCompare(b.label, 'es'));
}

/** Prestaciones facturadas sin receta cargada. */
async function cargarSinReceta(p: ParamsDetalle): Promise<Agrupado[]> {
  const [mov, rec, maps] = await Promise.all([
    traerTodo<any>((d) => supabase.from('movimientos_geclisa')
      .select('anio, mes, practica_codigo, practica_nombre, total').eq('es_principal', true).or(filtroMeses(p.meses)).range(d, d + 999)),
    traerTodo<any>((d) => supabase.from('v_recetas_costos_por_pool').select('codigo_practica, nombre_practica').range(d, d + 999)),
    traerTodo<any>((d) => supabase.from('prestaciones_nombre_mapping').select('nombre_geclisa, nombre_receta').range(d, d + 999)),
  ]);
  const S = crearIndiceRecetas(rec, maps);

  const acum = new Map<string, Agrupado>();
  mov.forEach((r) => {
    const nombre = String(r.practica_nombre || 'Sin práctica');
    if (S.tiene(r.practica_codigo, nombre)) return;
    const e = acum.get(nombre) || { clave: nombre, label: nombre, grupo: detectarSegmento(nombre, r.practica_codigo), valores: vacio(p.meses), tituloCompleto: nombre };
    const mes = toMesKey(r.anio, r.mes);
    if (e.valores[mes] !== undefined) e.valores[mes] += Number(r.total) || 0;
    acum.set(nombre, e);
  });
  return [...acum.values()].sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '', 'es') || a.label.localeCompare(b.label, 'es'));
}

// ============================================================
// HOOK
// ============================================================

export function useEvolucionDetalle(params: ParamsDetalle | null): ResultadoDetalle {
  const [estado, setEstado] = useState<ResultadoDetalle>(VACIO);
  const pedidoRef = useRef(0);

  const cargar = useCallback(async (p: ParamsDetalle) => {
    const key = claveCache(p);
    const enCache = cache.get(key);
    if (enCache) { setEstado(enCache); return; }

    const id = ++pedidoRef.current;
    setEstado({ ...VACIO, loading: true });

    try {
      // El módulo de Sueldos no tiene detalle: se devuelve una nota.
      if (p.bloque === 'modulo_sueldos') {
        const nota: FilaEvolucion = {
          id: `${p.clave}.nota`, tipo: 'nota', nivel: p.nivel, label:
            'Proviene del módulo Sueldos (asiento del mes + F.931 confirmado). El detalle por empleado se consulta en Sueldos → Liquidaciones.',
          expandible: false, valores: vacio(p.meses), total: 0, promedioMensual: 0,
        };
        const r: ResultadoDetalle = { filas: [nota], loading: false, error: null, totalElementos: 1, truncado: false };
        cache.set(key, r);
        if (id === pedidoRef.current) setEstado(r);
        return;
      }

      let datos: Agrupado[];
      switch (p.bloque) {
        case 'costos_fijos': datos = await cargarCostosFijos(p); break;
        case 'facturacion': datos = await cargarFacturacionPorOS(p); break;
        case 'costos_variables': datos = await cargarCostosVariables(p); break;
        case 'no_identificados': datos = await cargarSinReceta(p); break;
        case 'atenciones': datos = await cargarAtenciones(p); break;
        default: datos = [];
      }

      const totalElementos = datos.length;
      // Si hay que truncar, se eligen los de mayor peso — pero se muestran en el
      // orden natural (grupo, luego label), que es el que sirve para leer.
      let visibles = datos;
      let truncado = false;
      if (datos.length > TOPE_FILAS_DETALLE) {
        const porPeso = [...datos].sort((a, b) => {
          const sa = p.meses.reduce((s, m) => s + Math.abs(a.valores[m] || 0), 0);
          const sb = p.meses.reduce((s, m) => s + Math.abs(b.valores[m] || 0), 0);
          return sb - sa;
        }).slice(0, TOPE_FILAS_DETALLE);
        const conservar = new Set(porPeso.map((x) => x.clave));
        visibles = datos.filter((x) => conservar.has(x.clave));
        truncado = true;
      }

      const filas: FilaEvolucion[] = visibles.map((d) => {
        const total = p.meses.reduce((s, m) => s + (d.valores[m] || 0), 0);
        return {
          id: `${p.bloque}.${p.clave}.${d.clave}`,
          tipo: 'comprobante',
          nivel: p.nivel,
          label: d.label,
          // Solo el nivel 3 de facturación se puede seguir abriendo.
          expandible: !!d.detalleLazy,
          ...(d.detalleLazy ? { detalleLazy: d.detalleLazy } : {}),
          valores: d.valores,
          total,
          // Un promedio mensual de un comprobante único no significa nada.
          promedioMensual: 0,
          metadata: { tituloCompleto: d.tituloCompleto, grupo: d.grupo, esNegativo: total < 0 },
        };
      });

      // Cuadratura: agrega la fila de diferencia si el detalle no cierra.
      const { filaDiferencia, desvios } = cuadrarDetalle(filas, p.totalPadre, p.meses, p.label, truncado);
      if (desvios.length) {
        console.warn(`[Evolución] El detalle de "${p.label}" (${p.bloque}) no cuadra:`, desvios);
      }
      if (filaDiferencia) filas.push({ ...filaDiferencia, nivel: p.nivel });

      const r: ResultadoDetalle = { filas, loading: false, error: null, totalElementos, truncado };
      cache.set(key, r);
      if (id === pedidoRef.current) setEstado(r);
    } catch (e) {
      if (id !== pedidoRef.current) return;
      setEstado({ ...VACIO, error: e instanceof Error ? e.message : 'Error cargando el detalle' });
    }
  }, []);

  useEffect(() => {
    if (!params) { setEstado(VACIO); return; }
    void cargar(params);
    // Se depende de la clave, no del objeto: evita recargar por identidad nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params ? claveCache(params) : null, cargar]);

  return estado;
}

export default useEvolucionDetalle;
