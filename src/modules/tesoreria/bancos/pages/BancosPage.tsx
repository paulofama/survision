// ============================================================================
// PÁGINA: Bancos (subsección de Tesorería)
// Sistema de Gestión Integral - Instituto Dr. Mercado
// Ingesta del extracto Santander + conciliación banco <-> GECLISA.
// ============================================================================

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Banknote, Upload, RefreshCw, Filter, Search, X, Check, AlertCircle, CheckCircle,
  Loader2, ArrowLeftRight, FileText, Landmark, Ban, Unlink, TrendingUp, TrendingDown, ListChecks,
} from 'lucide-react';
import { useBancos, formatCurrency, formatDate, formatDateTime, type GeclisaValorRow } from '../hooks/useBancos';
import type { IngestaResult } from '../core/ingesta.mjs';

type Tab = 'resumen' | 'movimientos' | 'conciliacion' | 'importar';

const ESTADOS: Record<string, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
  conciliado_auto: { label: 'Conciliado auto', cls: 'bg-green-100 text-green-700' },
  conciliado_manual: { label: 'Conciliado manual', cls: 'bg-blue-100 text-blue-700' },
  solo_banco: { label: 'Solo banco', cls: 'bg-amber-100 text-amber-700' },
  ignorado: { label: 'Ignorado', cls: 'bg-slate-200 text-slate-600' },
};
const badgeEstado = (e: string) => ESTADOS[e] || { label: e, cls: 'bg-gray-100 text-gray-600' };

const CATEGORIAS: Record<string, string> = {
  getnet: 'Getnet', first_data: 'First Data', circulo_medico: 'Círculo Médico', osep: 'OSEP', osde: 'OSDE',
  debin: 'DEBIN', transferencia_recibida: 'Transf. recibida', transferencia_realizada: 'Transf. realizada',
  haberes: 'Haberes', honorarios: 'Honorarios', afip: 'AFIP', impuesto_ley_25413: 'Ley 25.413',
  sircreb: 'SIRCREB', comision_bancaria: 'Comisión', iva: 'IVA', debito_automatico: 'Déb. automático',
  seguro: 'Seguro', fci: 'FCI', pago_servicios: 'Servicios', interbanking: 'Interbanking', otro_debito: 'Otro débito',
};
const catLabel = (c: string | null) => (c ? CATEGORIAS[c] || c : '—');

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function BancosPage() {
  const b = useBancos();
  const [tab, setTab] = useState<Tab>('resumen');

  if (!b.cuenta && b.loading) {
    return <div className="p-6 flex items-center gap-2 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Cargando…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-600" /> Bancos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {b.cuenta ? `${b.cuenta.banco} · Cta. ${b.cuenta.nro_cuenta}` : 'Conciliación de extracto bancario con GECLISA'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => b.reconciliar()} disabled={b.procesando}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50">
            {b.procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reconciliar
          </button>
          <button onClick={() => setTab('importar')}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            <Upload className="h-4 w-4" /> Importar extracto
          </button>
        </div>
      </div>

      {b.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" /><span className="text-sm">{b.error}</span>
          <button onClick={() => b.setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['resumen', 'Resumen'], ['movimientos', 'Movimientos'], ['conciliacion', 'Conciliación'], ['importar', 'Importar']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <Resumen b={b} />}
      {tab === 'movimientos' && <Movimientos b={b} />}
      {tab === 'conciliacion' && <Conciliacion b={b} />}
      {tab === 'importar' && <Importar b={b} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Card({ label, value, cls, icon }: { label: string; value: string; cls?: string; icon?: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
          <p className={`text-xl font-bold mt-1 ${cls || 'text-gray-900'}`}>{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Resumen({ b }: { b: ReturnType<typeof useBancos> }) {
  const ult = b.importaciones.find((i) => i.estado === 'ok');
  const imp = ult?.detalle_impositivo || {};
  const c = b.contadores;
  return (
    <div className="space-y-6">
      {/* Cuenta + último extracto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:col-span-2">
          <div className="flex items-center gap-2 text-gray-700 font-semibold mb-3"><Landmark className="h-5 w-5 text-emerald-600" /> Cuenta</div>
          {b.cuenta ? (
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-gray-500">Banco</span><span className="text-gray-900">{b.cuenta.banco}</span>
              <span className="text-gray-500">Cuenta</span><span className="text-gray-900 font-mono">{b.cuenta.nro_cuenta}</span>
              <span className="text-gray-500">CBU</span><span className="text-gray-900 font-mono">{b.cuenta.cbu}</span>
              <span className="text-gray-500">Titular</span><span className="text-gray-900">{b.cuenta.titular}</span>
            </div>
          ) : <p className="text-sm text-gray-400">Sin cuenta configurada</p>}
        </div>
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl shadow-sm p-5 text-white">
          <p className="text-xs uppercase text-emerald-100">Saldo último extracto</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(ult?.saldo_final)}</p>
          <p className="text-xs text-emerald-100 mt-2">Al {formatDate(ult?.periodo_hasta)} · importado {formatDateTime(ult?.created_at)}</p>
        </div>
      </div>

      {/* Contadores del período */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Conciliado auto" value={String(c.conciliadoAuto)} cls="text-green-600" icon={<CheckCircle className="h-6 w-6 text-green-500" />} />
        <Card label="Conciliado manual" value={String(c.conciliadoManual)} cls="text-blue-600" icon={<Check className="h-6 w-6 text-blue-500" />} />
        <Card label="Pendientes banco" value={String(c.pendienteBanco)} cls="text-gray-700" icon={<AlertCircle className="h-6 w-6 text-gray-400" />} />
        <Card label="Pendientes GECLISA" value={String(c.pendienteGeclisa)} cls="text-gray-700" icon={<ListChecks className="h-6 w-6 text-gray-400" />} />
        <Card label="Solo banco" value={String(c.soloBanco)} cls="text-amber-600" icon={<Ban className="h-6 w-6 text-amber-400" />} />
        <Card label="Ignorados" value={String(c.ignorado)} cls="text-slate-500" />
        <Card label="Total créditos" value={formatCurrency(c.totalCreditos)} cls="text-green-600" icon={<TrendingUp className="h-6 w-6 text-green-500" />} />
        <Card label="Total débitos" value={formatCurrency(c.totalDebitos)} cls="text-red-600" icon={<TrendingDown className="h-6 w-6 text-red-500" />} />
      </div>

      {/* Detalle impositivo */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center gap-2 text-gray-700 font-semibold mb-3"><FileText className="h-5 w-5 text-emerald-600" /> Detalle impositivo del período</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><p className="text-gray-500">Ley 25.413 s/ créditos</p><p className="font-semibold text-gray-900">{formatCurrency(imp.ley25413_creditos)}</p></div>
          <div><p className="text-gray-500">Ley 25.413 s/ débitos</p><p className="font-semibold text-gray-900">{formatCurrency(imp.ley25413_debitos)}</p></div>
          <div><p className="text-gray-500">SIRCREB</p><p className="font-semibold text-gray-900">{formatCurrency(imp.sircreb_total)}</p></div>
          <div><p className="text-gray-500">Computable 33% s/ créditos</p><p className="font-semibold text-emerald-700">{formatCurrency(imp.computable_creditos_33)}</p></div>
          <div><p className="text-gray-500">Computable 33% s/ débitos</p><p className="font-semibold text-emerald-700">{formatCurrency(imp.computable_debitos_33)}</p></div>
        </div>
        {!ult && <p className="text-xs text-gray-400 mt-2">Todavía no hay un extracto importado.</p>}
      </div>

      {/* Historial de importaciones */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700">Historial de importaciones</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr><th className="px-4 py-2 text-left">Fecha</th><th className="px-4 py-2 text-left">Período</th><th className="px-4 py-2 text-right">Nuevos</th><th className="px-4 py-2 text-right">Duplicados</th><th className="px-4 py-2 text-left">Origen</th><th className="px-4 py-2 text-left">Estado</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {b.importaciones.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">{formatDateTime(i.created_at)}</td>
                  <td className="px-4 py-2 text-gray-600">{formatDate(i.periodo_desde)} – {formatDate(i.periodo_hasta)}</td>
                  <td className="px-4 py-2 text-right">{i.cant_nuevos}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{i.cant_duplicados}</td>
                  <td className="px-4 py-2 text-gray-600">{i.origen}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${i.estado === 'ok' ? 'bg-green-100 text-green-700' : i.estado === 'rechazada' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{i.estado}</span>
                    {i.motivo && <span className="ml-2 text-xs text-red-500" title={i.motivo}>⚠</span>}
                  </td>
                </tr>
              ))}
              {!b.importaciones.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin importaciones</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Movimientos({ b }: { b: ReturnType<typeof useBancos> }) {
  const { filtros, setFiltros } = b;
  const categorias = useMemo(() => Array.from(new Set(b.movimientos.map((m) => m.categoria).filter(Boolean))) as string[], [b.movimientos]);
  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><Filter className="h-4 w-4 text-emerald-600" /> Filtros</div>
          <div><label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={filtros.fechaDesde} onChange={(e) => setFiltros({ ...filtros, fechaDesde: e.target.value })} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={filtros.fechaHasta} onChange={(e) => setFiltros({ ...filtros, fechaHasta: e.target.value })} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Categoría</label>
            <select value={filtros.categoria} onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="">Todas</option>{categorias.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Estado</label>
            <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="">Todos</option>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select></div>
          <div className="flex-1 min-w-[180px]"><label className="block text-xs text-gray-500 mb-1">Buscar</label>
            <div className="relative"><Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-2.5" />
              <input value={filtros.busqueda} onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })} placeholder="Contraparte, CUIT, texto…" className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg" /></div></div>
          <button onClick={() => setFiltros({ fechaDesde: filtros.fechaDesde, fechaHasta: filtros.fechaHasta, categoria: '', estado: '', busqueda: '' })} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4" /> Limpiar</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700 flex items-center justify-between">
          <span>Movimientos <span className="text-xs font-normal text-gray-500">({b.movimientos.length})</span></span>
          {b.loading && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Concepto / Contraparte</th>
                <th className="px-3 py-2 text-left">Categoría</th><th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-left">Estado</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {b.movimientos.map((m) => {
                const est = badgeEstado(m.estado_conciliacion);
                const conc = m.estado_conciliacion === 'conciliado_auto' || m.estado_conciliacion === 'conciliado_manual';
                return (
                  <tr key={m.id} className="hover:bg-emerald-50/30">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(m.fecha)}</td>
                    <td className="px-3 py-2"><div className="text-gray-900">{m.concepto}</div>{m.contraparte_nombre && <div className="text-xs text-gray-400 truncate max-w-[280px]">{m.contraparte_nombre}</div>}</td>
                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">{catLabel(m.categoria)}</span></td>
                    <td className={`px-3 py-2 text-right font-mono font-medium ${m.importe >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(m.importe)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">{formatCurrency(m.saldo_resultante)}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${est.cls}`}>{est.label}</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {conc ? (
                        <button onClick={() => b.desconciliarMov(m.id)} title="Desconciliar" className="p-1 text-gray-400 hover:text-red-600"><Unlink className="h-4 w-4" /></button>
                      ) : m.estado_conciliacion === 'pendiente' ? (
                        <>
                          <button onClick={() => b.marcarEstado([m.id], 'solo_banco')} title="Marcar solo banco" className="p-1 text-gray-400 hover:text-amber-600"><Ban className="h-4 w-4" /></button>
                          <button onClick={() => b.marcarEstado([m.id], 'ignorado')} title="Ignorar" className="p-1 text-gray-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                        </>
                      ) : (
                        <button onClick={() => b.marcarEstado([m.id], 'pendiente')} title="Volver a pendiente" className="p-1 text-gray-400 hover:text-emerald-600"><RefreshCw className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!b.movimientos.length && !b.loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No hay movimientos en el período/filtros</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Conciliacion({ b }: { b: ReturnType<typeof useBancos> }) {
  const pendientesBanco = useMemo(() => b.movimientos.filter((m) => m.estado_conciliacion === 'pendiente' && m.importe > 0), [b.movimientos]);
  const [selB, setSelB] = useState<Set<string>>(new Set());
  const [selG, setSelG] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState('');

  // Sugerencias: si hay exactamente 1 banco seleccionado, rankear geclisa
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>();
    if (selB.size === 1) {
      const mov = pendientesBanco.find((m) => selB.has(m.id));
      if (mov) for (const s of b.sugerenciasPara(mov)) map.set(s.valor.id, s.sim);
    }
    return map;
  }, [selB, pendientesBanco, b]);

  const geclisaOrden = useMemo(() => {
    const arr = [...b.geclisaPendientes];
    if (scoreMap.size) arr.sort((x, y) => (scoreMap.get(y.id) ?? -1) - (scoreMap.get(x.id) ?? -1));
    return arr;
  }, [b.geclisaPendientes, scoreMap]);

  const totalB = round2(pendientesBanco.filter((m) => selB.has(m.id)).reduce((s, m) => s + Number(m.importe), 0));
  const totalG = round2(b.geclisaPendientes.filter((g) => selG.has(g.id)).reduce((s, g) => s + Number(g.importe), 0));
  const diff = round2(totalB - totalG);
  const puedeConciliar = selB.size > 0 && selG.size > 0 && (Math.abs(diff) <= 0.01 || motivo.trim().length > 0);

  const toggle = (set: Set<string>, id: string, upd: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); upd(n);
  };

  const conciliar = async () => {
    await b.conciliarManual([...selB], [...selG], diff !== 0 ? { motivo: motivo.trim() } : undefined);
    setSelB(new Set()); setSelG(new Set()); setMotivo('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-2">
        <ArrowLeftRight className="h-4 w-4 mt-0.5 shrink-0" />
        Seleccioná movimientos del banco y valores de GECLISA (podés varios de cada lado para 1:N). Al elegir un solo movimiento del banco, GECLISA se ordena por coincidencia de nombre.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Banco pendientes */}
        <Panel titulo={`Banco · pendientes (${pendientesBanco.length})`} total={totalB} totalCls="text-green-600">
          {pendientesBanco.map((m) => (
            <FilaSel key={m.id} sel={selB.has(m.id)} onClick={() => toggle(selB, m.id, setSelB)}
              main={`${formatDate(m.fecha)} · ${m.contraparte_nombre?.split('/')[0]?.trim() || m.concepto}`}
              sub={catLabel(m.categoria)} monto={formatCurrency(m.importe)} montoCls="text-green-600" />
          ))}
          {!pendientesBanco.length && <p className="text-sm text-gray-400 p-4 text-center">Sin pendientes</p>}
        </Panel>

        {/* GECLISA pendientes */}
        <Panel titulo={`GECLISA · pendientes (${b.geclisaPendientes.length})`} total={totalG} totalCls="text-blue-600">
          {geclisaOrden.map((g: GeclisaValorRow) => {
            const sc = scoreMap.get(g.id);
            return (
              <FilaSel key={g.id} sel={selG.has(g.id)} onClick={() => toggle(selG, g.id, setSelG)}
                highlight={sc !== undefined && sc >= 0.6}
                main={`${formatDate(g.fecha)} · ${g.tercero_nombre || ''}`}
                sub={`${g.medio_nombre || ''}${sc !== undefined ? ` · ${(sc * 100).toFixed(0)}% nombre` : ''}`}
                monto={formatCurrency(g.importe)} montoCls="text-blue-600" />
            );
          })}
          {!b.geclisaPendientes.length && <p className="text-sm text-gray-400 p-4 text-center">Sin pendientes</p>}
        </Panel>
      </div>

      {/* Barra de acción */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-center gap-4">
        <div className="text-sm">
          <span className="text-gray-500">Banco</span> <b className="text-green-600">{formatCurrency(totalB)}</b>
          <span className="mx-2 text-gray-300">|</span>
          <span className="text-gray-500">GECLISA</span> <b className="text-blue-600">{formatCurrency(totalG)}</b>
          <span className="mx-2 text-gray-300">|</span>
          <span className="text-gray-500">Diferencia</span> <b className={Math.abs(diff) <= 0.01 ? 'text-gray-700' : 'text-red-600'}>{formatCurrency(diff)}</b>
        </div>
        {Math.abs(diff) > 0.01 && selB.size > 0 && selG.size > 0 && (
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la diferencia (arancel, retención…)" className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-gray-300 rounded-lg" />
        )}
        <div className="ml-auto flex items-center gap-2">
          {selB.size > 0 && (
            <button onClick={() => b.marcarEstado([...selB], 'solo_banco')} className="flex items-center gap-1 px-3 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"><Ban className="h-4 w-4" /> Solo banco</button>
          )}
          <button onClick={conciliar} disabled={!puedeConciliar || b.procesando}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {b.procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Conciliar ({selB.size}↔{selG.size})
          </button>
        </div>
      </div>
    </div>
  );
}

function Panel({ titulo, total, totalCls, children }: { titulo: string; total: number; totalCls: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className={`px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between`}>
        <span className="text-sm font-semibold text-gray-700">{titulo}</span>
        <span className={`text-sm font-mono font-bold ${totalCls}`}>{formatCurrency(total)}</span>
      </div>
      <div className="overflow-y-auto max-h-[460px] divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function FilaSel({ sel, onClick, main, sub, monto, montoCls, highlight }: { sel: boolean; onClick: () => void; main: string; sub: string; monto: string; montoCls: string; highlight?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50 ${sel ? 'bg-emerald-50' : highlight ? 'bg-yellow-50' : ''}`}>
      <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300'}`}>{sel && <Check className="h-3 w-3 text-white" />}</span>
      <span className="flex-1 min-w-0"><span className="block text-sm text-gray-900 truncate">{main}</span><span className="block text-xs text-gray-400 truncate">{sub}</span></span>
      <span className={`font-mono text-sm ${montoCls}`}>{monto}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
function Importar({ b }: { b: ReturnType<typeof useBancos> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IngestaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const elegir = async (f: File | null) => {
    setFile(f); setPreview(null); setMsg(null);
    if (!f) return;
    setBusy(true);
    try { setPreview(await b.importarArchivo(f, { write: false })); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Error al leer el archivo'); }
    finally { setBusy(false); }
  };

  const confirmar = async () => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const res = await b.importarArchivo(file, { write: true });
      if (res.ok) { setMsg(`Importado: ${res.nuevos} nuevos, ${res.duplicados} duplicados. Conciliación ejecutada.`); setFile(null); setPreview(null); if (inputRef.current) inputRef.current.value = ''; }
      else setMsg(`Rechazado: ${res.motivo}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Error al importar'); }
    finally { setBusy(false); }
  };

  const r = preview?.resumen;
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 text-gray-700 font-semibold mb-4"><Upload className="h-5 w-5 text-emerald-600" /> Importar extracto (.xlsx del resumen Santander)</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={(e) => elegir(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
        {busy && <p className="text-sm text-gray-500 mt-3 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</p>}
        {msg && <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${msg.startsWith('Rechazado') || msg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>{msg}</div>}

        {preview && r && (
          <div className="mt-4 border border-gray-200 rounded-lg p-4">
            {preview.ok ? (
              <>
                <div className="flex items-center gap-2 text-green-700 font-medium mb-3"><CheckCircle className="h-5 w-5" /> Validado — la cadena de saldos cierra contra el declarado</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Info l="Período" v={`${formatDate(r.periodoDesde)} – ${formatDate(r.periodoHasta)}`} />
                  <Info l="Saldo inicial" v={formatCurrency(r.saldoInicial)} />
                  <Info l="Saldo final" v={formatCurrency(r.saldoFinal)} />
                  <Info l="Créditos" v={formatCurrency(r.totalCreditos)} cls="text-green-600" />
                  <Info l="Débitos" v={formatCurrency(r.totalDebitos)} cls="text-red-600" />
                  <Info l="Movimientos" v={String(r.cantMovimientos)} />
                  <Info l="Nuevos" v={String(preview.nuevos)} cls="text-emerald-700" />
                  <Info l="Duplicados (ya cargados)" v={String(preview.duplicados)} cls="text-gray-500" />
                </div>
                <button onClick={confirmar} disabled={busy} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar importación ({preview.nuevos} nuevos)
                </button>
              </>
            ) : (
              <div className="flex items-start gap-2 text-red-700"><AlertCircle className="h-5 w-5 mt-0.5 shrink-0" /><div><p className="font-medium">Archivo rechazado — no se sube nada</p><p className="text-sm mt-1">{preview.motivo}</p></div></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ l, v, cls }: { l: string; v: string; cls?: string }) {
  return <div><p className="text-gray-500">{l}</p><p className={`font-semibold ${cls || 'text-gray-900'}`}>{v}</p></div>;
}
