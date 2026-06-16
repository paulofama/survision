// ============================================
// MODULO FISCAL - RESUMEN ANUAL (planilla: meses en columnas, conceptos en filas)
// ============================================

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Download, Table } from 'lucide-react';
import { useFiscalPeriodos, IvaPeriodo } from '../hooks/useFiscalIva';

type RowDef =
  | { tipo: 'header'; label: string; grupo: 'v' | 'c' }
  | { tipo: 'dato'; k: keyof IvaPeriodo; label: string; grupo: 'v' | 'c' | 'p'; strong?: boolean };

const ROWS: RowDef[] = [
  { tipo: 'header', label: 'VENTAS', grupo: 'v' },
  { tipo: 'dato', k: 'ventas_neto_gravado', label: 'Gravado', grupo: 'v' },
  { tipo: 'dato', k: 'ventas_exento', label: 'Exento', grupo: 'v' },
  { tipo: 'dato', k: 'ventas_iva', label: 'IVA Débito', grupo: 'v' },
  { tipo: 'dato', k: 'ventas_total', label: 'Total Ventas', grupo: 'v', strong: true },
  { tipo: 'header', label: 'COMPRAS', grupo: 'c' },
  { tipo: 'dato', k: 'compras_neto_gravado', label: 'Gravado', grupo: 'c' },
  { tipo: 'dato', k: 'compras_exento', label: 'Exento', grupo: 'c' },
  { tipo: 'dato', k: 'compras_iva', label: 'IVA Crédito', grupo: 'c' },
  { tipo: 'dato', k: 'compras_total', label: 'Total Compras', grupo: 'c', strong: true },
  { tipo: 'dato', k: 'posicion_iva', label: 'Posición IVA', grupo: 'p', strong: true },
];

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtC = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-AR');

interface Col { tipo: 'mes' | 'total'; key: string; label: string; year: string; data: IvaPeriodo }

const ResumenAnualPage: React.FC = () => {
  const { periodos, loading, refetch } = useFiscalPeriodos();

  // Columnas: por año, los meses + una columna "Total <año>".
  const cols = useMemo<Col[]>(() => {
    const porAnio: Record<string, IvaPeriodo[]> = {};
    [...periodos].sort((a, b) => a.periodo.localeCompare(b.periodo)).forEach(p => {
      const y = p.periodo.slice(0, 4); (porAnio[y] = porAnio[y] || []).push(p);
    });
    const out: Col[] = [];
    Object.keys(porAnio).sort().forEach(y => {
      porAnio[y].forEach(p => out.push({ tipo: 'mes', key: p.periodo, label: MESES[Number(p.periodo.slice(5, 7)) - 1], year: y, data: p }));
      // total del año
      const tot: any = { periodo: `Total ${y}` };
      ROWS.forEach(r => { if (r.tipo === 'dato') tot[r.k] = porAnio[y].reduce((s, p) => s + (Number(p[r.k]) || 0), 0); });
      out.push({ tipo: 'total', key: `tot-${y}`, label: `Total ${y}`, year: y, data: tot });
    });
    return out;
  }, [periodos]);

  // agrupar columnas por año para el header de dos filas
  const years = useMemo(() => {
    const m: Record<string, number> = {};
    cols.forEach(c => { m[c.year] = (m[c.year] || 0) + 1; });
    return Object.keys(m).sort().map(y => ({ year: y, span: m[y] }));
  }, [cols]);

  const val = (c: Col, k: keyof IvaPeriodo) => Number((c.data as any)[k]) || 0;

  const exportarCSV = () => {
    const head = ['Concepto', ...cols.map(c => c.tipo === 'total' ? c.label : `${c.label} ${c.year}`)];
    const lines = [head.join(';')];
    ROWS.forEach(r => {
      if (r.tipo === 'header') { lines.push(r.label); return; }
      lines.push([r.label, ...cols.map(c => fmtC(val(c, r.k)))].join(';'));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'resumen_anual_iva.csv'; a.click();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/fiscal" className="p-2 hover:bg-gray-200 rounded-lg"><ChevronLeft className="h-5 w-5 text-gray-600" /></Link>
          <div className="p-2 bg-slate-800 rounded-lg"><Table className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Resumen Anual IVA</h1>
            <p className="text-sm text-gray-500">Conceptos por fila, meses en columnas, total por año</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarCSV} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><Download className="h-4 w-4" /> Exportar</button>
          <button onClick={() => refetch()} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Recargar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase border-r sticky left-0 bg-gray-100 z-20 min-w-[150px]">Concepto</th>
                {years.map(y => <th key={y.year} colSpan={y.span} className="px-3 py-1 text-center text-xs font-bold text-gray-700 border-r">{y.year}</th>)}
              </tr>
              <tr className="bg-gray-50 border-b">
                {cols.map(c => (
                  <th key={c.key} className={`px-3 py-2 text-right text-xs font-medium whitespace-nowrap ${c.tipo === 'total' ? 'bg-amber-100 text-amber-800 font-bold border-r' : 'text-gray-500'}`}>{c.tipo === 'total' ? 'Total' : c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={cols.length + 1} className="px-4 py-16 text-center"><RefreshCw className="h-7 w-7 text-slate-500 animate-spin inline" /></td></tr>
              ) : cols.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-12 text-center text-gray-500">Sin datos cargados</td></tr>
              ) : ROWS.map((r, ri) => r.tipo === 'header' ? (
                <tr key={ri} className={r.grupo === 'v' ? 'bg-blue-50' : 'bg-indigo-50'}>
                  <td className={`px-3 py-1.5 text-xs font-bold uppercase border-r sticky left-0 z-10 ${r.grupo === 'v' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'}`} colSpan={1}>{r.label}</td>
                  <td colSpan={cols.length} className={r.grupo === 'v' ? 'bg-blue-50' : 'bg-indigo-50'}></td>
                </tr>
              ) : (
                <tr key={ri} className={`border-b border-gray-100 ${r.strong ? 'font-semibold bg-gray-50/60' : ''} ${r.grupo === 'p' ? 'border-t-2 border-slate-300' : ''}`}>
                  <td className={`px-3 py-1.5 whitespace-nowrap border-r sticky left-0 z-10 bg-white ${r.strong ? 'font-semibold' : ''} ${r.grupo === 'p' ? 'text-slate-800 font-bold' : 'text-gray-700'}`}>{r.label}</td>
                  {cols.map(c => {
                    const v = val(c, r.k);
                    const cls = r.grupo === 'p' ? (v >= 0 ? 'text-red-600' : 'text-green-700') : '';
                    return <td key={c.key} className={`px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap ${c.tipo === 'total' ? 'bg-amber-50 font-semibold border-r' : ''} ${cls}`}>{fmtC(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">Importes redondeados a pesos. Posición IVA = IVA Débito − IVA Crédito (rojo: a pagar; verde: a favor). Libro IVA (FAC/NC/ND) desde GECLISA. La columna <strong>Total</strong> de cada año suma sus meses.</p>
    </div>
  );
};

export default ResumenAnualPage;
