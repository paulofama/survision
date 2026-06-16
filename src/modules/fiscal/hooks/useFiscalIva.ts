// ============================================
// HOOK / API: Modulo Fiscal (IVA)
// ============================================
// Lee los libros desde Supabase (directo, como el resto de la app) y delega en
// el backend SOLO la sincronizacion GECLISA->Supabase (auto/manual).
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@shared/lib/supabase';
import { getApiBaseUrl } from '@shared/lib/apiConfig';

export interface IvaPeriodo {
  periodo: string;
  ventas_filas: number; ventas_neto_gravado: number; ventas_iva: number; ventas_exento: number; ventas_total: number;
  compras_filas: number; compras_neto_gravado: number; compras_iva: number; compras_exento: number; compras_total: number;
  posicion_iva: number; ultima_sync: string | null; estado: string;
}

export interface IvaComprobante {
  id: string; periodo: string; fecha: string; fecha_contable?: string;
  tipo_comprobante: string; letra: string; sucursal: number; numero: number;
  razon_social?: string; proveedor?: string; cuit: string; condicion_iva: string;
  neto_gravado: number; iva: number; exento: number;
  perc_iva?: number; perc_ib?: number; imp_internos?: number; otros?: number;
  total: number; signo: number; fuente?: string;
}

export interface IvaAlicuota {
  id: string; tipo: 'venta' | 'compra'; periodo: string; alicuota: number; neto: number; iva: number;
}

// ---- helpers de lectura Supabase (con paginacion > 1000 filas) ----
async function fetchAll(table: string, periodo: string, orderCol: string): Promise<any[]> {
  const pageSize = 1000; let from = 0; const all: any[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from(table).select('*').eq('periodo', periodo)
      .order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function getPeriodos(): Promise<IvaPeriodo[]> {
  const { data, error } = await supabase.from('fiscal_iva_periodos').select('*').order('periodo', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as IvaPeriodo[];
}

export async function getLibro(tipo: 'ventas' | 'compras', periodo: string): Promise<IvaComprobante[]> {
  return fetchAll(`fiscal_iva_${tipo}`, periodo, 'fecha') as Promise<IvaComprobante[]>;
}

export async function getAlicuotas(periodo: string): Promise<IvaAlicuota[]> {
  return fetchAll('fiscal_iva_alicuotas', periodo, 'alicuota') as Promise<IvaAlicuota[]>;
}

export async function sincronizarPeriodo(periodo: string): Promise<any> {
  const res = await fetch(`${getApiBaseUrl()}/fiscal/${periodo}/sync`, { method: 'POST' });
  const j = await res.json();
  if (!res.ok || !j.success) throw new Error(j.error || 'Error al sincronizar');
  return j;
}

export async function getFreshness(periodo: string): Promise<{ stale: boolean; geclisa: any; supabase: any }> {
  const res = await fetch(`${getApiBaseUrl()}/fiscal/${periodo}/freshness`);
  const j = await res.json();
  if (!res.ok || !j.success) throw new Error(j.error || 'Error al chequear frescura');
  return j;
}

// ---- formateadores ----
export const fmtMoneda = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n || 0);
export const fmtMoneda0 = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0);
export const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(n || 0);
export const fmtPeriodo = (p: string) => {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const [y, m] = p.split('-').map(Number);
  return `${meses[m - 1]} ${y}`;
};

// ---- hook: lista de periodos (para selector + dashboard) ----
export const useFiscalPeriodos = () => {
  const [periodos, setPeriodos] = useState<IvaPeriodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setLoading(true); setError(null); setPeriodos(await getPeriodos()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  return { periodos, loading, error, refetch: cargar };
};

// ---- hook: libro de un periodo (ventas o compras) ----
export const useFiscalLibro = (tipo: 'ventas' | 'compras', periodo: string | null) => {
  const [rows, setRows] = useState<IvaComprobante[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!periodo) { setRows([]); return; }
    try { setLoading(true); setError(null); setRows(await getLibro(tipo, periodo)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, [tipo, periodo]);

  useEffect(() => { cargar(); }, [cargar]);
  return { rows, loading, error, refetch: cargar };
};

// ---- hook: auto-refresh al abrir/cambiar periodo ----
// Chequea freshness (GECLISA vs Supabase) y, si esta desactualizado, sincroniza
// solo. Una vez por periodo por sesion. Silencioso si GECLISA no responde
// (se sigue mostrando lo que hay en Supabase).
export const useAutoRefresh = (periodo: string | null, onSynced: () => Promise<void> | void) => {
  const [refreshing, setRefreshing] = useState(false);
  const [autoMsg, setAutoMsg] = useState('');
  const done = useRef<Set<string>>(new Set());
  const cb = useRef(onSynced);
  cb.current = onSynced;

  useEffect(() => {
    if (!periodo || done.current.has(periodo)) return;
    done.current.add(periodo);
    let cancel = false;
    (async () => {
      try {
        const f = await getFreshness(periodo);
        if (f.stale && !cancel) {
          setRefreshing(true);
          setAutoMsg(`Actualizando ${fmtPeriodo(periodo)} desde GECLISA...`);
          await sincronizarPeriodo(periodo);
          await cb.current?.();
          if (!cancel) { setAutoMsg('Datos actualizados desde GECLISA.'); setTimeout(() => setAutoMsg(''), 3500); }
        }
      } catch {
        /* GECLISA inaccesible: se muestra lo de Supabase, sin ruido */
      } finally {
        if (!cancel) setRefreshing(false);
      }
    })();
    return () => { cancel = true; };
  }, [periodo]);

  return { refreshing, autoMsg };
};
