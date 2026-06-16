// ============================================
// MODULO FISCAL - DASHBOARD IVA
// Indicadores: Posicion IVA + evolucion | Composicion por alicuota | Gravado vs Exento
// ============================================

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { FileText, ShoppingCart, Scale, TrendingUp, RefreshCw } from 'lucide-react';
import {
  useFiscalPeriodos, getAlicuotas, sincronizarPeriodo, IvaAlicuota,
  fmtMoneda0, fmtMoneda, fmtPeriodo,
} from '../hooks/useFiscalIva';

const FiscalDashboardPage: React.FC = () => {
  const { periodos, loading, refetch } = useFiscalPeriodos();
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [alic, setAlic] = useState<IvaAlicuota[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { if (!periodo && periodos.length) setPeriodo(periodos[periodos.length - 1].periodo); }, [periodos, periodo]);
  useEffect(() => { if (periodo) getAlicuotas(periodo).then(setAlic).catch(() => setAlic([])); }, [periodo]);

  const sel = useMemo(() => periodos.find(p => p.periodo === periodo) || null, [periodos, periodo]);

  const actualizar = async () => {
    if (!periodo) return;
    try { setSincronizando(true); setMsg('Sincronizando con GECLISA...'); await sincronizarPeriodo(periodo); await refetch(); const a = await getAlicuotas(periodo); setAlic(a); setMsg('Actualizado.'); setTimeout(() => setMsg(''), 3000); }
    catch (e) { setMsg('Error: ' + (e instanceof Error ? e.message : 'desconocido')); }
    finally { setSincronizando(false); }
  };

  // --- Evolucion posicion IVA (debito vs credito + posicion) ---
  const labels = periodos.map(p => fmtPeriodo(p.periodo));
  const evolucionOpt = {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtMoneda0(v) },
    legend: { data: ['Débito (ventas)', 'Crédito (compras)', 'Posición'] },
    grid: { left: 70, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 35 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => (v / 1e6).toFixed(1) + 'M' } },
    series: [
      { name: 'Débito (ventas)', type: 'bar', data: periodos.map(p => p.ventas_iva), itemStyle: { color: '#2563eb' } },
      { name: 'Crédito (compras)', type: 'bar', data: periodos.map(p => p.compras_iva), itemStyle: { color: '#6366f1' } },
      { name: 'Posición', type: 'line', data: periodos.map(p => p.posicion_iva), itemStyle: { color: '#dc2626' }, lineStyle: { width: 2 } },
    ],
  };

  // --- Gravado vs Exento (ventas) ---
  const gravExentoOpt = {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtMoneda0(v) },
    legend: { data: ['Gravado', 'Exento'] },
    grid: { left: 70, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 35 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => (v / 1e6).toFixed(0) + 'M' } },
    series: [
      { name: 'Gravado', type: 'bar', stack: 'v', data: periodos.map(p => p.ventas_neto_gravado), itemStyle: { color: '#2563eb' } },
      { name: 'Exento', type: 'bar', stack: 'v', data: periodos.map(p => p.ventas_exento), itemStyle: { color: '#cbd5e1' } },
    ],
  };

  // --- Composicion por alicuota (periodo seleccionado) ---
  const aggAlic = (tipo: 'venta' | 'compra') => {
    const m: Record<string, { neto: number; iva: number }> = {};
    alic.filter(a => a.tipo === tipo).forEach(a => { const k = String(a.alicuota); m[k] = m[k] || { neto: 0, iva: 0 }; m[k].neto += a.neto; m[k].iva += a.iva; });
    return Object.entries(m).map(([al, v]) => ({ alicuota: Number(al), ...v })).sort((a, b) => a.alicuota - b.alicuota);
  };
  const alicVentas = aggAlic('venta'), alicCompras = aggAlic('compra');
  const pctExento = sel && sel.ventas_total ? (sel.ventas_exento / sel.ventas_total * 100) : 0;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-lg"><Scale className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Módulo Fiscal — IVA</h1>
            <p className="text-sm text-gray-500">Posición IVA, composición por alícuota y gravado vs exento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/fiscal/ventas" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><FileText className="h-4 w-4" /> IVA Ventas</Link>
          <Link to="/fiscal/compras" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><ShoppingCart className="h-4 w-4" /> IVA Compras</Link>
          <select value={periodo || ''} onChange={e => setPeriodo(e.target.value)} disabled={loading} className="px-3 py-2 border border-gray-300 rounded-lg">
            {periodos.map(p => <option key={p.periodo} value={p.periodo}>{fmtPeriodo(p.periodo)}</option>)}
          </select>
          <button onClick={actualizar} disabled={sincronizando || !periodo} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 rounded-lg bg-slate-100 text-slate-800 text-sm">{msg}</div>}

      {/* KPIs del periodo seleccionado */}
      {sel && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">Débito fiscal (ventas)</p><p className="text-2xl font-bold text-blue-700">{fmtMoneda0(sel.ventas_iva)}</p></div>
          <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">Crédito fiscal (compras)</p><p className="text-2xl font-bold text-indigo-700">{fmtMoneda0(sel.compras_iva)}</p></div>
          <div className="bg-white rounded-lg p-4 border">
            <p className="text-sm text-gray-500">Posición IVA</p>
            <p className={`text-2xl font-bold ${sel.posicion_iva >= 0 ? 'text-red-700' : 'text-green-700'}`}>{fmtMoneda0(sel.posicion_iva)}</p>
            <p className="text-xs text-gray-400">{sel.posicion_iva >= 0 ? 'a pagar' : 'saldo a favor'}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">% Ventas exentas</p><p className="text-2xl font-bold text-gray-700">{pctExento.toFixed(1)}%</p></div>
        </div>
      )}

      {/* Evolucion posicion IVA */}
      <div className="bg-white rounded-xl border p-4 mb-6">
        <h2 className="font-semibold text-gray-800 mb-2 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-500" /> Posición IVA — evolución mensual</h2>
        {periodos.length ? <ReactECharts option={evolucionOpt} style={{ height: 320 }} /> : <p className="text-gray-400 text-center py-12">Sin datos</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Gravado vs exento */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold text-gray-800 mb-2">Ventas: gravado vs exento</h2>
          {periodos.length ? <ReactECharts option={gravExentoOpt} style={{ height: 300 }} /> : <p className="text-gray-400 text-center py-12">Sin datos</p>}
        </div>

        {/* Composicion por alicuota */}
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Composición por alícuota · {periodo ? fmtPeriodo(periodo) : ''}</h2>
          <div className="grid grid-cols-2 gap-4">
            {[{ t: 'Ventas', d: alicVentas, c: 'text-blue-700' }, { t: 'Compras', d: alicCompras, c: 'text-indigo-700' }].map(({ t, d, c }) => (
              <div key={t}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t}</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-400"><th className="text-left py-1">Alíc.</th><th className="text-right">Neto</th><th className="text-right">IVA</th></tr></thead>
                  <tbody>
                    {d.length === 0 ? <tr><td colSpan={3} className="text-gray-400 py-2">—</td></tr> : d.map(a => (
                      <tr key={a.alicuota} className="border-t border-gray-100">
                        <td className="py-1">{a.alicuota === 0 ? 'Exento' : a.alicuota + '%'}</td>
                        <td className="text-right font-mono">{fmtMoneda0(a.neto)}</td>
                        <td className={`text-right font-mono ${c}`}>{a.iva ? fmtMoneda0(a.iva) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FiscalDashboardPage;
