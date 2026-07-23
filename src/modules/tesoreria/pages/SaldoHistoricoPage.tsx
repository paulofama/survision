// ============================================
// TESORERÍA - FLUJO DE EFECTIVO MENSUAL
// Sistema Integral de Gestión - Instituto Dr. Mercado
// v2.0.0
// ============================================
// Antes esta página consultaba el "saldo de caja a una fecha" sumando todos los
// comprobantes desde 2018 (transferencias y tarjetas incluidas, sin restar los
// pagos a proveedores) -> devolvía cifras de miles de millones, ficticias.
//
// Ahora muestra el FLUJO DE EFECTIVO mes a mes: cuánto entró en efectivo, cuánto
// salió por egresos de caja, cuánto salió pagando proveedores en efectivo, y el
// neto. Fuente: RPC tes_efectivo_por_mes (migración 30), alcance 2024+.
// ============================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Info,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTesoreriaCaja, FlujoMes } from '../hooks/useTesoreriaCaja';

// ============================================
// HELPERS A NIVEL DE MÓDULO
// ============================================

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const etiquetaMes = (f: FlujoMes) => `${MESES[f.mes - 1] || '?'} ${f.anio}`;

interface FilaFlujoProps {
  fila: FlujoMes;
  maxAbs: number;
  formatCurrency: (v: number) => string;
}

const FilaFlujo: React.FC<FilaFlujoProps> = ({ fila, maxAbs, formatCurrency }) => {
  const saleTotal = fila.sale_caja + fila.sale_prov;
  const anchoEntra = maxAbs > 0 ? (fila.entra / maxAbs) * 50 : 0;
  const anchoSale = maxAbs > 0 ? (saleTotal / maxAbs) * 50 : 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4 text-sm font-medium text-gray-900 whitespace-nowrap">
        {etiquetaMes(fila)}
      </td>
      <td className="py-3 px-4 text-sm text-right text-green-600 whitespace-nowrap">
        {formatCurrency(fila.entra)}
      </td>
      <td className="py-3 px-4 text-sm text-right text-red-600 whitespace-nowrap">
        {formatCurrency(fila.sale_caja)}
      </td>
      <td className="py-3 px-4 text-sm text-right text-orange-600 whitespace-nowrap">
        {formatCurrency(fila.sale_prov)}
      </td>
      <td className={`py-3 px-4 text-sm text-right font-semibold whitespace-nowrap ${
        fila.neto >= 0 ? 'text-green-700' : 'text-red-700'
      }`}>
        {fila.neto >= 0 ? '+' : ''}{formatCurrency(fila.neto)}
      </td>
      <td className="py-3 px-4 w-48">
        <div className="flex gap-1 h-4">
          <div
            className="bg-green-400 rounded-l"
            style={{ width: `${anchoEntra}%` }}
            title={`Entra: ${formatCurrency(fila.entra)}`}
          />
          <div
            className="bg-red-400 rounded-r"
            style={{ width: `${anchoSale}%` }}
            title={`Sale: ${formatCurrency(saleTotal)}`}
          />
        </div>
      </td>
    </tr>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const SaldoHistoricoPage: React.FC = () => {
  const {
    flujoMensual,
    loading,
    error,
    fetchFlujoMensual,
    formatCurrency
  } = useTesoreriaCaja();

  const [desde, setDesde] = useState<string>('2024-01-01');

  useEffect(() => {
    fetchFlujoMensual(desde);
  }, [fetchFlujoMensual, desde]);

  const filas = useMemo(
    () => [...flujoMensual].sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes)),
    [flujoMensual]
  );

  const maxAbs = useMemo(
    () => Math.max(1, ...filas.map(f => Math.max(f.entra, f.sale_caja + f.sale_prov))),
    [filas]
  );

  const totales = useMemo(() => filas.reduce(
    (acc, f) => ({
      entra: acc.entra + f.entra,
      sale_caja: acc.sale_caja + f.sale_caja,
      sale_prov: acc.sale_prov + f.sale_prov,
      neto: acc.neto + f.neto
    }),
    { entra: 0, sale_caja: 0, sale_prov: 0, neto: 0 }
  ), [filas]);

  const promedioNeto = filas.length ? totales.neto / filas.length : 0;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/tesoreria" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div className="p-2 bg-emerald-100 rounded-lg">
          <Banknote className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Flujo de Efectivo Mensual</h1>
          <p className="text-sm text-gray-500">Movimiento de caja mes a mes, sólo medios de pago en efectivo</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <button
            onClick={() => fetchFlujoMensual(desde)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Aclaración metodológica */}
      <div className="mb-6 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>
          Sólo cuenta el <strong>efectivo</strong>: las transferencias y tarjetas van al banco, no a la caja.
          Se restan tanto los egresos de caja como los pagos a proveedores hechos en efectivo.
          El detalle de medios de pago está disponible desde enero de 2024.
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Resumen del período */}
      {filas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="h-4 w-4 text-green-600" />
              <span className="text-sm text-gray-500">Entró en efectivo</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totales.entra)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="h-4 w-4 text-red-600" />
              <span className="text-sm text-gray-500">Salió de caja</span>
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totales.sale_caja)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-gray-500">Pagó proveedores en efectivo</span>
            </div>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(totales.sale_prov)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Neto del período</span>
            </div>
            <p className={`text-xl font-bold ${totales.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {totales.neto >= 0 ? '+' : ''}{formatCurrency(totales.neto)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Promedio {formatCurrency(promedioNeto)} por mes
            </p>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading && filas.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin" />
              <span className="text-gray-500">Cargando flujo...</span>
            </div>
          </div>
        ) : filas.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            No hay datos para el período seleccionado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Mes</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Entra</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Sale de caja</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Paga proveedores</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Neto</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Comparación</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <FilaFlujo
                    key={`${f.anio}-${f.mes}`}
                    fila={f}
                    maxAbs={maxAbs}
                    formatCurrency={formatCurrency}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Fuente: espejo de GECLISA (MovValores / MovProv_Valores). Desarrollo: P. Famá
      </p>
    </div>
  );
};

export default SaldoHistoricoPage;
