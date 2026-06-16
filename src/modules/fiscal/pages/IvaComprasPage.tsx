// ============================================
// MODULO FISCAL - LIBRO IVA COMPRAS
// ============================================

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Download, Search, ShoppingCart } from 'lucide-react';
import {
  useFiscalPeriodos, useFiscalLibro, useAutoRefresh, sincronizarPeriodo, fmtMoneda, fmtMoneda0, fmtNum, fmtPeriodo,
} from '../hooks/useFiscalIva';

const IvaComprasPage: React.FC = () => {
  const { periodos, loading: loadingPer, refetch: refetchPer } = useFiscalPeriodos();
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { if (!periodo && periodos.length) setPeriodo(periodos[periodos.length - 1].periodo); }, [periodos, periodo]);

  const { rows, loading, error, refetch } = useFiscalLibro('compras', periodo);
  const { refreshing, autoMsg } = useAutoRefresh(periodo, async () => { await refetch(); await refetchPer(); });

  const filtradas = useMemo(() => {
    if (!busqueda.trim()) return rows;
    const b = busqueda.toLowerCase();
    return rows.filter(r => r.proveedor?.toLowerCase().includes(b) || String(r.cuit).includes(b) || String(r.numero).includes(b));
  }, [rows, busqueda]);

  const tot = useMemo(() => filtradas.reduce((a, r) => ({
    neto: a.neto + (r.neto_gravado || 0), iva: a.iva + (r.iva || 0), exento: a.exento + (r.exento || 0),
    perc: a.perc + ((r.perc_iva || 0) + (r.perc_ib || 0)), total: a.total + (r.total || 0),
  }), { neto: 0, iva: 0, exento: 0, perc: 0, total: 0 }), [filtradas]);

  const comprobante = (r: any) => `${r.tipo_comprobante} ${r.letra} ${String(r.sucursal).padStart(4, '0')}-${String(r.numero).padStart(8, '0')}`;

  const actualizar = async () => {
    if (!periodo) return;
    try { setSincronizando(true); setMsg('Sincronizando con GECLISA...'); await sincronizarPeriodo(periodo); await refetch(); await refetchPer(); setMsg('Actualizado desde GECLISA.'); setTimeout(() => setMsg(''), 3000); }
    catch (e) { setMsg('Error: ' + (e instanceof Error ? e.message : 'desconocido')); }
    finally { setSincronizando(false); }
  };

  const exportarCSV = () => {
    const headers = ['Fecha', 'Fecha Contable', 'Comprobante', 'Proveedor', 'CUIT', 'Cond IVA', 'Neto Gravado', 'IVA', 'Exento', 'Perc IVA', 'Perc IIBB', 'Total'];
    const data = filtradas.map(r => [r.fecha, r.fecha_contable || '', comprobante(r), r.proveedor || '', r.cuit || '', r.condicion_iva || '', r.neto_gravado, r.iva, r.exento, r.perc_iva, r.perc_ib, r.total]);
    const csv = [headers.join(';'), ...data.map(x => x.join(';'))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `iva_compras_${periodo}.csv`; a.click();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/fiscal" className="p-2 hover:bg-gray-200 rounded-lg"><ChevronLeft className="h-5 w-5 text-gray-600" /></Link>
          <div className="p-2 bg-indigo-100 rounded-lg"><ShoppingCart className="h-6 w-6 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Libro IVA Compras</h1>
            <p className="text-sm text-gray-500">Crédito fiscal — comprobantes recibidos (por fecha contable)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={periodo || ''} onChange={e => setPeriodo(e.target.value)} disabled={loadingPer}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
            {periodos.map(p => <option key={p.periodo} value={p.periodo}>{fmtPeriodo(p.periodo)}</option>)}
          </select>
          <button onClick={exportarCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><Download className="h-4 w-4" /> Exportar</button>
          <button onClick={actualizar} disabled={sincronizando || refreshing || !periodo} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${(sincronizando || refreshing) ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {(msg || autoMsg) && <div className="mb-4 p-3 rounded-lg bg-indigo-50 text-indigo-800 text-sm">{msg || autoMsg}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">Comprobantes</p><p className="text-2xl font-bold text-gray-900">{fmtNum(filtradas.length)}</p></div>
        <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">Neto Gravado</p><p className="text-xl font-bold text-gray-900">{fmtMoneda0(tot.neto)}</p></div>
        <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">IVA Crédito</p><p className="text-xl font-bold text-indigo-700">{fmtMoneda0(tot.iva)}</p></div>
        <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">Exento</p><p className="text-xl font-bold text-gray-500">{fmtMoneda0(tot.exento)}</p></div>
        <div className="bg-white rounded-lg p-4 border"><p className="text-sm text-gray-500">Total</p><p className="text-xl font-bold text-gray-900">{fmtMoneda0(tot.total)}</p></div>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar proveedor, CUIT, número..."
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64"><RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">F. Cont.</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Comprobante</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">CUIT</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Cond</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Neto Grav.</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">IVA</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Exento</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Perc.</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-500">Sin comprobantes en el período</td></tr>
                ) : filtradas.map(r => (
                  <tr key={r.id} className="hover:bg-indigo-50/40">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.fecha_contable || r.fecha}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-600">{comprobante(r)}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={r.proveedor}>{r.proveedor || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 font-mono text-xs">{r.cuit || '—'}</td>
                    <td className="px-3 py-2 text-center text-xs">{r.condicion_iva}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.neto_gravado ? fmtMoneda(r.neto_gravado) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-indigo-700">{r.iva ? fmtMoneda(r.iva) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{r.exento ? fmtMoneda(r.exento) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">{(r.perc_iva || r.perc_ib) ? fmtMoneda((r.perc_iva || 0) + (r.perc_ib || 0)) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtMoneda(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IvaComprasPage;
