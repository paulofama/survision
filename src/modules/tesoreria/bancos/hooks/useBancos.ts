// ============================================================================
// Hook de la subsección Bancos (Tesorería). Lee de Supabase y orquesta la
// ingesta / conciliación reutilizando el core isomórfico.
// Sistema de Gestión Integral - Instituto Dr. Mercado
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@shared/lib/supabase';
// Core isomórfico (compartido con el CLI diario)
import { ingestarExtracto } from '../core/ingesta.mjs';
import type { IngestaResult } from '../core/ingesta.mjs';
import { conciliarAutomatico, crearConciliacion, desconciliar, buscarSugerencias } from '../core/conciliacionEngine.mjs';

export interface CuentaBanco {
  id: string; banco: string; nro_cuenta: string; cbu: string | null;
  moneda: string; titular: string | null;
}
export interface MovimientoRow {
  id: string; fecha: string; anio: number; mes: number; posicion_dia: number;
  nro_comprobante: string | null; concepto: string | null; descripcion: string | null;
  contraparte_nombre: string | null; contraparte_cuit: string | null;
  importe: number; saldo_resultante: number | null; categoria: string | null;
  estado_conciliacion: string; importacion_id: string | null;
}
export interface GeclisaValorRow {
  id: string; fecha: string; importe: number; tercero_nombre: string | null;
  tercero_cuit: string | null; medio_nombre: string | null; comprobante: string | null;
  estado_conciliacion: string;
}
export interface ImportacionRow {
  id: string; periodo_desde: string | null; periodo_hasta: string | null;
  saldo_inicial: number | null; saldo_final: number | null;
  total_creditos: number; total_debitos: number; cant_movimientos: number;
  cant_nuevos: number; cant_duplicados: number; estado: string; motivo: string | null;
  origen: string; usuario: string | null; archivo_nombre: string | null;
  detalle_impositivo: any; created_at: string;
}

export interface Filtros {
  fechaDesde: string; fechaHasta: string;
  categoria: string; estado: string; busqueda: string;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const primerDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

export function formatCurrency(n: number | null | undefined): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Number(n || 0));
}
export function formatDate(s: string | null | undefined): string {
  if (!s) return '';
  return new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function formatDateTime(s: string | null | undefined): string {
  if (!s) return '';
  return new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function traerTodo(build: (from: number) => any): Promise<any[]> {
  const filas: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from).range(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return filas;
}

async function emailUsuario(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email || null;
}

export function useBancos() {
  const [cuenta, setCuenta] = useState<CuentaBanco | null>(null);
  const [reglas, setReglas] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoRow[]>([]);
  const [geclisaPendientes, setGeclisaPendientes] = useState<GeclisaValorRow[]>([]);
  const [importaciones, setImportaciones] = useState<ImportacionRow[]>([]);
  const [contadores, setContadores] = useState({
    conciliadoAuto: 0, conciliadoManual: 0, pendienteBanco: 0, soloBanco: 0,
    ignorado: 0, pendienteGeclisa: 0, totalCreditos: 0, totalDebitos: 0,
  });
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<Filtros>({
    fechaDesde: primerDiaMes(), fechaHasta: hoyISO(), categoria: '', estado: '', busqueda: '',
  });
  const cuentaRef = useRef<CuentaBanco | null>(null);

  // ---- Carga base (cuenta + reglas + importaciones) ----
  const cargarBase = useCallback(async () => {
    const { data: c } = await supabase.from('banco_cuentas').select('id, banco, nro_cuenta, cbu, moneda, titular').eq('activa', true).order('created_at').limit(1).maybeSingle();
    cuentaRef.current = c || null;
    setCuenta(c || null);
    const { data: r } = await supabase.from('banco_reglas').select('*').order('orden');
    setReglas(r || []);
    const { data: imp } = await supabase.from('banco_importaciones').select('*').order('created_at', { ascending: false }).limit(20);
    setImportaciones(imp || []);
    // Si hay importación, encuadrar los filtros en su período
    const ok = (imp || []).find((x: ImportacionRow) => x.estado === 'ok' && x.periodo_desde);
    if (ok) setFiltros((f) => ({ ...f, fechaDesde: ok.periodo_desde!, fechaHasta: ok.periodo_hasta || hoyISO() }));
    return c || null;
  }, []);

  // ---- Movimientos (con filtros) + geclisa pendientes + contadores ----
  const cargarMovimientos = useCallback(async () => {
    const c = cuentaRef.current;
    if (!c) return;
    setLoading(true);
    setError(null);
    try {
      const movs = await traerTodo(() => {
        let q = supabase.from('banco_movimientos')
          .select('id, fecha, anio, mes, posicion_dia, nro_comprobante, concepto, descripcion, contraparte_nombre, contraparte_cuit, importe, saldo_resultante, categoria, estado_conciliacion, importacion_id')
          .eq('cuenta_id', c.id)
          .gte('fecha', filtros.fechaDesde).lte('fecha', filtros.fechaHasta)
          .order('fecha', { ascending: true }).order('posicion_dia', { ascending: true });
        if (filtros.categoria) q = q.eq('categoria', filtros.categoria);
        if (filtros.estado) q = q.eq('estado_conciliacion', filtros.estado);
        if (filtros.busqueda) {
          const t = filtros.busqueda.replace(/[%,]/g, ' ').trim();
          q = q.or(`descripcion.ilike.%${t}%,contraparte_nombre.ilike.%${t}%,contraparte_cuit.ilike.%${t}%`);
        }
        return q;
      });
      setMovimientos(movs as MovimientoRow[]);

      // geclisa pendientes en el período (± 5 días de colchón)
      const buffer = 5 * 86400000;
      const gd = new Date(new Date(filtros.fechaDesde + 'T00:00:00Z').getTime() - buffer).toISOString().slice(0, 10);
      const gh = new Date(new Date(filtros.fechaHasta + 'T00:00:00Z').getTime() + buffer).toISOString().slice(0, 10);
      const gv = await traerTodo(() => supabase.from('geclisa_valores')
        .select('id, fecha, importe, tercero_nombre, tercero_cuit, medio_nombre, comprobante, estado_conciliacion')
        .eq('estado_conciliacion', 'pendiente').gte('fecha', gd).lte('fecha', gh)
        .order('fecha', { ascending: true }));
      setGeclisaPendientes(gv as GeclisaValorRow[]);

      // Contadores del período (sobre el conjunto cargado)
      const cont = { conciliadoAuto: 0, conciliadoManual: 0, pendienteBanco: 0, soloBanco: 0, ignorado: 0, pendienteGeclisa: gv.length, totalCreditos: 0, totalDebitos: 0 };
      for (const m of movs as MovimientoRow[]) {
        const imp = Number(m.importe);
        if (imp >= 0) cont.totalCreditos += imp; else cont.totalDebitos += -imp;
        if (m.estado_conciliacion === 'conciliado_auto') cont.conciliadoAuto++;
        else if (m.estado_conciliacion === 'conciliado_manual') cont.conciliadoManual++;
        else if (m.estado_conciliacion === 'solo_banco') cont.soloBanco++;
        else if (m.estado_conciliacion === 'ignorado') cont.ignorado++;
        else cont.pendienteBanco++;
      }
      setContadores(cont);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando movimientos');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => { cargarBase().then((c) => { if (c) cargarMovimientos(); }); }, [cargarBase]);
  useEffect(() => { if (cuentaRef.current) cargarMovimientos(); }, [cargarMovimientos]);

  // ---- Acciones ----
  const importarArchivo = useCallback(async (file: File, opts: { write: boolean }): Promise<IngestaResult> => {
    const c = cuentaRef.current;
    if (!c) throw new Error('No hay cuenta bancaria configurada');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const usuario = await emailUsuario();
    const res = await ingestarExtracto({
      supabase, cuentaId: c.id, nroCuenta: c.nro_cuenta, bytes, reglas,
      origen: 'manual', usuario, archivoNombre: file.name, write: opts.write,
    });
    if (opts.write && res.ok) {
      await conciliarAutomatico(supabase, { cuentaId: c.id, usuario: usuario || 'motor' });
      await cargarBase();
      await cargarMovimientos();
    }
    return res;
  }, [reglas, cargarBase, cargarMovimientos]);

  const reconciliar = useCallback(async () => {
    const c = cuentaRef.current;
    if (!c) return;
    setProcesando(true);
    setError(null);
    try {
      const usuario = await emailUsuario();
      const r = await conciliarAutomatico(supabase, { cuentaId: c.id, usuario: usuario || 'motor' });
      await cargarMovimientos();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error reconciliando');
    } finally {
      setProcesando(false);
    }
  }, [cargarMovimientos]);

  const conciliarManual = useCallback(async (bancoIds: string[], geclisaIds: string[], opts?: { motivo?: string }) => {
    setProcesando(true);
    setError(null);
    try {
      const usuario = await emailUsuario();
      const totalBanco = movimientos.filter((m) => bancoIds.includes(m.id)).reduce((s, m) => s + Number(m.importe), 0);
      const totalGeclisa = geclisaPendientes.filter((g) => geclisaIds.includes(g.id)).reduce((s, g) => s + Number(g.importe), 0);
      const diferencia = Math.round((totalBanco - totalGeclisa) * 100) / 100;
      await crearConciliacion(supabase, {
        tipo: 'manual', usuario, bancoIds, geclisaIds,
        diferencia, motivoDiferencia: opts?.motivo || null, totalBanco, totalGeclisa,
        observacion: opts?.motivo || null,
      });
      await cargarMovimientos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error conciliando');
      throw e;
    } finally {
      setProcesando(false);
    }
  }, [movimientos, geclisaPendientes, cargarMovimientos]);

  const desconciliarMov = useCallback(async (bancoMovId: string) => {
    setProcesando(true);
    try {
      const usuario = await emailUsuario();
      const { data } = await supabase.from('conciliacion_banco').select('conciliacion_id').eq('banco_movimiento_id', bancoMovId).limit(1).maybeSingle();
      if (data?.conciliacion_id) await desconciliar(supabase, data.conciliacion_id, usuario);
      await cargarMovimientos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconciliando');
    } finally {
      setProcesando(false);
    }
  }, [cargarMovimientos]);

  const marcarEstado = useCallback(async (bancoIds: string[], estado: 'solo_banco' | 'ignorado' | 'pendiente') => {
    setProcesando(true);
    try {
      const { error: e } = await supabase.from('banco_movimientos').update({ estado_conciliacion: estado }).in('id', bancoIds);
      if (e) throw new Error(e.message);
      await cargarMovimientos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error actualizando estado');
    } finally {
      setProcesando(false);
    }
  }, [cargarMovimientos]);

  const sugerenciasPara = useCallback((mov: MovimientoRow) => {
    return buscarSugerencias(mov, geclisaPendientes);
  }, [geclisaPendientes]);

  return {
    cuenta, reglas, movimientos, geclisaPendientes, importaciones, contadores,
    loading, procesando, error, setError, filtros, setFiltros,
    importarArchivo, reconciliar, conciliarManual, desconciliarMov, marcarEstado, sugerenciasPara,
    recargar: cargarMovimientos,
  };
}
