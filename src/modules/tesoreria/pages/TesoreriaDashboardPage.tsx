// ============================================
// TESORERÍA - DASHBOARD
// Sistema Integral de Gestión - Instituto Dr. Mercado
// v2.0.0
// ============================================
// La métrica principal es el EFECTIVO NETO DEL MES (entra en efectivo − sale
// por egreso de caja − sale por OP/PV en efectivo). Reemplaza al "Saldo Actual
// de Caja", que acumulaba todos los comprobantes desde 2018 —incluidas
// transferencias y tarjetas, que van al banco— y sin restar los pagos a
// proveedores: daba $1.041M, un número ficticio. Ver migración 30.
// ============================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Clock,
  ArrowRight,
  DollarSign,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  Activity,
  BarChart3,
  Wifi,
  WifiOff,
  Info
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTesoreriaCaja, CategoriaMedio, MedioPago } from '../hooks/useTesoreriaCaja';

// ============================================
// HELPERS A NIVEL DE MÓDULO
// ============================================

const ETIQUETA_MEDIO: Record<CategoriaMedio, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  cta_cte: 'Cuenta corriente',
  retencion: 'Retenciones',
  otro: 'Otros'
};

const COLOR_MEDIO: Record<CategoriaMedio, string> = {
  efectivo: 'bg-emerald-500',
  transferencia: 'bg-blue-500',
  tarjeta: 'bg-violet-500',
  cheque: 'bg-amber-500',
  cta_cte: 'bg-gray-400',
  retencion: 'bg-rose-400',
  otro: 'bg-gray-300'
};

const ICONO_MEDIO: Record<CategoriaMedio, React.ElementType> = {
  efectivo: Banknote,
  transferencia: ArrowLeftRight,
  tarjeta: CreditCard,
  cheque: DollarSign,
  cta_cte: DollarSign,
  retencion: DollarSign,
  otro: DollarSign
};

// Puente entre el "listado de caja" de GECLISA (que sólo muestra la recaudación
// del mostrador, todos los medios) y el efectivo neto real de la caja física.
// Los honorarios/proveedores pagados en efectivo NO figuran en ese listado
// (se registran como OP/PV), pero salen de la misma caja -> hay que restarlos.
interface ConciliacionProps {
  recaudacionTotal: number;   // caja del mes, todos los medios (= listado GECLISA)
  entraEfectivo: number;      // cobranzas en efectivo
  saleCajaEfectivo: number;   // egresos de caja en efectivo
  saleProveedores: number;    // honorarios/proveedores pagados en efectivo
  neto: number;
  formatCurrency: (v: number) => string;
}

const ConciliacionCaja: React.FC<ConciliacionProps> = ({
  recaudacionTotal, entraEfectivo, saleCajaEfectivo, saleProveedores, neto, formatCurrency
}) => (
  <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
    <h3 className="font-semibold text-gray-900 mb-1">Conciliación con el listado de caja</h3>
    <p className="text-xs text-gray-500 mb-4">
      Por qué el listado de caja de GECLISA da positivo y el efectivo neto no: ese listado muestra
      lo que entra al mostrador pero no los honorarios pagados en efectivo, que salen de la misma caja.
    </p>
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between py-1">
        <span className="text-gray-700">
          Recaudación de caja del mes <span className="text-gray-400">(todos los medios — lo que ves en GECLISA)</span>
        </span>
        <span className="font-medium text-gray-900">{formatCurrency(recaudacionTotal)}</span>
      </div>
      <div className="flex items-center justify-between py-1 pl-4 border-l-2 border-gray-100">
        <span className="text-gray-500">de eso, en efectivo (mostrador)</span>
        <span className="text-gray-600">{formatCurrency(entraEfectivo - saleCajaEfectivo)}</span>
      </div>
      <div className="flex items-center justify-between py-1">
        <span className="text-gray-700">
          − Honorarios y proveedores pagados en efectivo <span className="text-gray-400">(no figuran en el listado)</span>
        </span>
        <span className="font-medium text-red-600">−{formatCurrency(saleProveedores)}</span>
      </div>
      <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200">
        <span className="font-semibold text-gray-900">= Efectivo neto del mes</span>
        <span className={`font-bold ${neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {neto >= 0 ? '+' : ''}{formatCurrency(neto)}
        </span>
      </div>
    </div>
  </div>
);

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon: Icon, color }) => (
  <div className={`${color} rounded-xl p-6 text-white shadow-lg`}>
    <div className="flex items-center justify-between mb-4">
      <span className="text-white/80 font-medium">{title}</span>
      <Icon className="h-6 w-6 text-white/60" />
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-bold">{value}</span>
    </div>
    {subtitle && <p className="text-white/70 text-sm mt-2">{subtitle}</p>}
  </div>
);

interface BarraMediosProps {
  medios: MedioPago[];
  total: number;
  formatCurrency: (v: number) => string;
}

const BarraMedios: React.FC<BarraMediosProps> = ({ medios, total, formatCurrency }) => {
  if (!medios.length || total <= 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">Sin movimientos en el período</div>;
  }
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden mb-4">
        {medios.map((m) => (
          <div
            key={m.categoria}
            className={COLOR_MEDIO[m.categoria] || COLOR_MEDIO.otro}
            style={{ width: `${(m.total / total) * 100}%` }}
            title={`${ETIQUETA_MEDIO[m.categoria] || m.categoria}: ${formatCurrency(m.total)}`}
          />
        ))}
      </div>
      <div className="space-y-2">
        {medios.map((m) => {
          const Icono = ICONO_MEDIO[m.categoria] || DollarSign;
          return (
            <div key={m.categoria} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded ${COLOR_MEDIO[m.categoria] || COLOR_MEDIO.otro}`} />
                <Icono className="h-4 w-4 text-gray-400" />
                <span className="text-gray-700">{ETIQUETA_MEDIO[m.categoria] || m.categoria}</span>
                <span className="text-gray-400 text-xs">({m.n})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-xs w-12 text-right">
                  {((m.total / total) * 100).toFixed(1)}%
                </span>
                <span className="font-medium text-gray-900 w-32 text-right">{formatCurrency(m.total)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const TesoreriaDashboardPage: React.FC = () => {
  const {
    dashboard,
    loading,
    error,
    isConnected,
    fetchDashboard,
    formatCurrency,
    formatNumber,
    formatFrescura,
    nombreMes
  } = useTesoreriaCaja();

  const [periodo, setPeriodo] = useState<{ anio: number; mes: number } | null>(null);

  useEffect(() => {
    fetchDashboard(periodo?.anio, periodo?.mes);
  }, [fetchDashboard, periodo]);

  const handleRefresh = useCallback(() => {
    fetchDashboard(periodo?.anio, periodo?.mes);
  }, [fetchDashboard, periodo]);

  const cambiarMes = useCallback((delta: number) => {
    setPeriodo((prev) => {
      const base = prev ?? (dashboard ? { anio: dashboard.periodo.anio, mes: dashboard.periodo.mes } : null);
      if (!base) return prev;
      const d = new Date(base.anio, base.mes - 1 + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
    });
  }, [dashboard]);

  const totalIngresos = dashboard
    ? dashboard.ingresosPorMedio.reduce((s, m) => s + m.total, 0)
    : 0;
  const totalEgresosProv = dashboard
    ? dashboard.egresos.proveedoresPorMedio.reduce((s, m) => s + m.total, 0)
    : 0;
  // Caja del mes tal como la larga el listado de GECLISA (todos los medios):
  // ingresos de caja menos egresos de caja. Reconcilia al peso con el archivo.
  const recaudacionCaja = dashboard
    ? dashboard.comprobantes.ingresos - dashboard.comprobantes.egresos
    : 0;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Wallet className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tesorería</h1>
            <p className="text-sm text-gray-500">Caja y cobranzas</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
            isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {isConnected ? (
              <><Wifi className="h-4 w-4" /><span>Conectado</span></>
            ) : (
              <><WifiOff className="h-4 w-4" /><span>Sin conexión</span></>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading && !dashboard && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
            <span className="text-gray-500">Cargando datos...</span>
          </div>
        </div>
      )}

      {dashboard && (
        <>
          {/* Selector de mes */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={() => cambiarMes(-1)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 text-sm"
            >
              ← Mes anterior
            </button>
            <span className="font-semibold text-gray-900 capitalize min-w-[10rem] text-center">
              {nombreMes(dashboard.periodo.anio, dashboard.periodo.mes)}
            </span>
            <button
              onClick={() => cambiarMes(1)}
              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 text-sm"
            >
              Mes siguiente →
            </button>
            {periodo && (
              <button
                onClick={() => setPeriodo(null)}
                className="px-3 py-1.5 text-emerald-600 hover:text-emerald-700 text-sm font-medium"
              >
                Volver al mes actual
              </button>
            )}
          </div>

          {/* Recaudación de caja del mes — el mismo número que larga el listado de GECLISA */}
          <div className="rounded-2xl p-8 mb-6 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-700">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/80 text-lg mb-2">
                  Recaudación de Caja del mes
                </p>
                <p className="text-5xl font-bold text-white">
                  {formatCurrency(recaudacionCaja)}
                </p>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-white/90 text-sm">
                  <span className="flex items-center gap-1.5">
                    <ArrowUpRight className="h-4 w-4" />
                    Ingresos {formatCurrency(dashboard.comprobantes.ingresos)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ArrowDownRight className="h-4 w-4" />
                    Egresos de caja {formatCurrency(dashboard.comprobantes.egresos)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Activity className="h-4 w-4" />
                    {formatNumber(dashboard.comprobantes.movimientos)} comprobantes
                  </span>
                </div>

                <p className="text-white/70 mt-4 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  {formatFrescura(dashboard.frescura.sincronizado)}
                  {dashboard.frescura.ultimaFechaDato && (
                    <span className="text-white/50">
                      · último movimiento {new Date(dashboard.frescura.ultimaFechaDato + 'T12:00:00').toLocaleDateString('es-AR')}
                    </span>
                  )}
                </p>
              </div>
              <div className="hidden md:block">
                <Wallet className="h-28 w-28 text-white/20" />
              </div>
            </div>
          </div>

          {/* Aclaración metodológica */}
          <div className="mb-6 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Es la caja tal como la larga el sistema (listado de caja): cobranzas del mostrador
              por todos los medios menos los egresos de caja. Los honorarios pagados en efectivo se
              analizan más abajo (no figuran en el listado de caja).
            </span>
          </div>

          {/* Métricas del mes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Cobranzas del mes"
              value={formatCurrency(totalIngresos)}
              subtitle="Todos los medios (caja + banco)"
              icon={TrendingUp}
              color="bg-gradient-to-br from-blue-500 to-blue-600"
            />
            <StatCard
              title="Efectivo cobrado"
              value={formatCurrency(dashboard.efectivo.entra)}
              subtitle={`${formatNumber(dashboard.efectivo.movimientos)} movimientos en efectivo`}
              icon={Banknote}
              color="bg-gradient-to-br from-green-500 to-green-600"
            />
            <StatCard
              title="Egresos de caja"
              value={formatCurrency(dashboard.egresos.caja)}
              subtitle="Comprobantes de egreso"
              icon={ArrowDownRight}
              color="bg-gradient-to-br from-red-500 to-red-600"
            />
            <StatCard
              title="Pagos a proveedores"
              value={formatCurrency(dashboard.egresos.proveedores)}
              subtitle={`${formatCurrency(dashboard.efectivo.saleProveedores)} en efectivo`}
              icon={TrendingDown}
              color="bg-gradient-to-br from-orange-500 to-orange-600"
            />
          </div>

          {/* Medios de pago */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold text-gray-900">Cómo cobró la clínica</h3>
              </div>
              <BarraMedios
                medios={dashboard.ingresosPorMedio}
                total={totalIngresos}
                formatCurrency={formatCurrency}
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-900">Cómo pagó a proveedores</h3>
                </div>
                <Link
                  to="/tesoreria/proveedores"
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
                >
                  Ver todos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <BarraMedios
                medios={dashboard.egresos.proveedoresPorMedio}
                total={totalEgresosProv}
                formatCurrency={formatCurrency}
              />
            </div>
          </div>

          {/* Evolución y últimos movimientos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold text-gray-900">Efectivo — últimos 14 días</h3>
              </div>

              {dashboard.evolucionEfectivo.length > 0 ? (
                <div className="space-y-2">
                  {dashboard.evolucionEfectivo.map((dia) => {
                    const neto = dia.entra - dia.sale;
                    const maxValue = Math.max(
                      ...dashboard.evolucionEfectivo.map(d => Math.max(d.entra, d.sale)),
                      1
                    );
                    return (
                      <div key={dia.fecha} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16">
                          {new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                            weekday: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <div className="flex-1 flex gap-1 h-5">
                          <div
                            className="bg-green-400 rounded-l"
                            style={{ width: `${(dia.entra / maxValue) * 50}%` }}
                            title={`Entra: ${formatCurrency(dia.entra)}`}
                          />
                          <div
                            className="bg-red-400 rounded-r"
                            style={{ width: `${(dia.sale / maxValue) * 50}%` }}
                            title={`Sale: ${formatCurrency(dia.sale)}`}
                          />
                        </div>
                        <span className={`text-xs font-medium w-28 text-right ${
                          neto > 0 ? 'text-green-600' : neto < 0 ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {neto > 0 ? '+' : ''}{formatCurrency(neto)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  No hay datos para mostrar
                </div>
              )}

              <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-400 rounded" />
                  <span className="text-sm text-gray-500">Entra</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-400 rounded" />
                  <span className="text-sm text-gray-500">Sale (caja + proveedores)</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-900">Últimos Movimientos</h3>
                </div>
                <Link
                  to="/tesoreria/caja/movimientos"
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
                >
                  Ver todos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="space-y-3">
                {dashboard.ultimosMovimientos.map((mov) => (
                  <div
                    key={mov.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${mov.ingreso > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                        {mov.ingreso > 0 ? (
                          <ArrowUpRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{mov.nombre || 'Sin nombre'}</p>
                        <p className="text-xs text-gray-500">
                          {mov.tipo} • {new Date(mov.fecha + 'T12:00:00').toLocaleDateString('es-AR')}
                        </p>
                      </div>
                    </div>
                    <span className={`font-semibold ${mov.ingreso > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.ingreso > 0 ? '+' : '-'}{formatCurrency(mov.ingreso || mov.egreso)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Sección de análisis (fuera del listado de caja) ── */}
          <div className="flex items-center gap-2 mt-8 mb-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Análisis de efectivo · no figura en el listado de caja
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Conciliación con el listado de caja de GECLISA */}
          <ConciliacionCaja
            recaudacionTotal={recaudacionCaja}
            entraEfectivo={dashboard.efectivo.entra}
            saleCajaEfectivo={dashboard.efectivo.saleCaja}
            saleProveedores={dashboard.efectivo.saleProveedores}
            neto={dashboard.efectivo.neto}
            formatCurrency={formatCurrency}
          />

          {/* Accesos rápidos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link
              to="/tesoreria/caja/movimientos"
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
            >
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-gray-700">Movimientos</span>
            </Link>
            <Link
              to="/tesoreria/caja/saldo-historico"
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
            >
              <Calendar className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-gray-700">Flujo mensual</span>
            </Link>
            <Link
              to="/tesoreria/proveedores"
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
            >
              <TrendingDown className="h-5 w-5 text-emerald-600" />
              <span className="font-medium text-gray-700">Proveedores</span>
            </Link>
            <div className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-lg p-4 opacity-50 cursor-not-allowed">
              <DollarSign className="h-5 w-5 text-gray-400" />
              <span className="font-medium text-gray-400">Bancos</span>
              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Próx.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TesoreriaDashboardPage;
