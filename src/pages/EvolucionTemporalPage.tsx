// ============================================
// EVOLUCIÓN TEMPORAL
// Sistema de Costos - Instituto Dr. Mercado
// Tendencias y comparativos mensuales
// v3.0 - Con ECharts
// ============================================
// RUTA DESTINO: src/pages/EvolucionTemporalPage.tsx
// ============================================

import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Calendar,
  ArrowUp,
  ArrowDown,
  BarChart3
} from 'lucide-react';
import {
  fetchEvolucionMensual,
  fetchStats,
  type EvolucionMensual,
  type StatsData
} from '../lib/apiAnalisis';

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const EvolucionTemporalPage: React.FC = () => {
  // Estados
  const [evolucion, setEvolucion] = useState<EvolucionMensual[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meses, setMeses] = useState(12);

  // ============================================
  // FUNCIONES
  // ============================================

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [evoData, statsData] = await Promise.all([
        fetchEvolucionMensual(meses),
        fetchStats()
      ]);

      setEvolucion(evoData);
      setStats(statsData);
      
      console.log(`✅ ${evoData.length} meses de evolución cargados`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error cargando datos';
      setError(errorMessage);
      console.error('❌ Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [meses]);

  // Formatear moneda
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Formatear número
  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('es-AR').format(value);
  };

  // Calcular variación mes a mes
  const calcularVariacion = (actual: number, anterior: number): { porcentaje: number; tendencia: 'up' | 'down' | 'equal' } => {
    if (anterior === 0) return { porcentaje: 0, tendencia: 'equal' };
    const porcentaje = ((actual - anterior) / anterior) * 100;
    return {
      porcentaje: Math.round(porcentaje * 10) / 10,
      tendencia: porcentaje > 0 ? 'up' : porcentaje < 0 ? 'down' : 'equal'
    };
  };

  // Totales
  const totales = useMemo(() => {
    return evolucion.reduce((acc, mes) => ({
      practicas: acc.practicas + mes.practicas,
      ingreso: acc.ingreso + mes.ingreso,
      coseguro: acc.coseguro + mes.coseguro,
      cobertura: acc.cobertura + mes.cobertura
    }), { practicas: 0, ingreso: 0, coseguro: 0, cobertura: 0 });
  }, [evolucion]);

  // Promedios
  const promedios = useMemo(() => {
    const len = evolucion.length || 1;
    return {
      practicas: Math.round(totales.practicas / len),
      ingreso: Math.round(totales.ingreso / len)
    };
  }, [totales, evolucion]);

  // ============================================
  // CONFIGURACIÓN ECHARTS - PRÁCTICAS
  // ============================================

  const chartOptionPracticas = useMemo(() => {
    const mesesLabels = evolucion.map(e => e.mesNombre);
    const practicasData = evolucion.map(e => e.practicas);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#1f2937'
        },
        formatter: (params: any) => {
          const data = params[0];
          const index = data.dataIndex;
          const mes = evolucion[index];
          
          let variacionHtml = '';
          if (index > 0) {
            const variacion = calcularVariacion(mes.practicas, evolucion[index - 1].practicas);
            const color = variacion.tendencia === 'up' ? '#16a34a' : variacion.tendencia === 'down' ? '#dc2626' : '#6b7280';
            const signo = variacion.porcentaje > 0 ? '+' : '';
            variacionHtml = `<div style="color: ${color}; font-size: 12px; margin-top: 4px;">
              ${variacion.tendencia === 'up' ? '▲' : variacion.tendencia === 'down' ? '▼' : '—'} 
              ${signo}${variacion.porcentaje}% vs mes anterior
            </div>`;
          }

          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">${data.name}</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; background: #3b82f6; border-radius: 2px;"></span>
                <span style="color: #6b7280;">Prácticas:</span>
                <span style="font-weight: 600; color: #1f2937;">${formatNumber(data.value)}</span>
              </div>
              ${variacionHtml}
            </div>
          `;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: mesesLabels,
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: meses > 12 ? 45 : 0
        },
        axisLine: {
          lineStyle: {
            color: '#e5e7eb'
          }
        },
        axisTick: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => formatNumber(value)
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        splitLine: {
          lineStyle: {
            color: '#f3f4f6',
            type: 'dashed'
          }
        }
      },
      series: [
        {
          name: 'Prácticas',
          type: 'bar',
          data: practicasData,
          barWidth: '60%',
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#60a5fa' },
                { offset: 1, color: '#2563eb' }
              ]
            }
          },
          emphasis: {
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: '#93c5fd' },
                  { offset: 1, color: '#3b82f6' }
                ]
              }
            }
          },
          label: {
            show: true,
            position: 'top',
            color: '#4b5563',
            fontSize: 10,
            fontWeight: 500,
            formatter: (params: any) => formatNumber(params.value)
          }
        }
      ],
      animationDuration: 1000,
      animationEasing: 'cubicOut'
    };
  }, [evolucion, meses]);

  // ============================================
  // CONFIGURACIÓN ECHARTS - INGRESOS
  // ============================================

  const chartOptionIngresos = useMemo(() => {
    const mesesLabels = evolucion.map(e => e.mesNombre);
    const ingresosData = evolucion.map(e => e.ingreso);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: {
          color: '#1f2937'
        },
        formatter: (params: any) => {
          const data = params[0];
          const index = data.dataIndex;
          const mes = evolucion[index];

          return `
            <div style="padding: 8px;">
              <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">${data.name}</div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; background: #22c55e; border-radius: 2px;"></span>
                <span style="color: #6b7280;">Ingreso:</span>
                <span style="font-weight: 600; color: #1f2937;">${formatCurrency(data.value)}</span>
              </div>
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
                <div>Coseguro: ${formatCurrency(mes.coseguro)}</div>
                <div>Cobertura: ${formatCurrency(mes.cobertura)}</div>
              </div>
            </div>
          `;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: mesesLabels,
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          rotate: meses > 12 ? 45 : 0
        },
        axisLine: {
          lineStyle: {
            color: '#e5e7eb'
          }
        },
        axisTick: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (value: number) => {
            if (value >= 1000000) {
              return `$${(value / 1000000).toFixed(0)}M`;
            }
            return `$${(value / 1000).toFixed(0)}K`;
          }
        },
        axisLine: {
          show: false
        },
        axisTick: {
          show: false
        },
        splitLine: {
          lineStyle: {
            color: '#f3f4f6',
            type: 'dashed'
          }
        }
      },
      series: [
        {
          name: 'Ingresos',
          type: 'bar',
          data: ingresosData,
          barWidth: '60%',
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#4ade80' },
                { offset: 1, color: '#16a34a' }
              ]
            }
          },
          emphasis: {
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: '#86efac' },
                  { offset: 1, color: '#22c55e' }
                ]
              }
            }
          },
          label: {
            show: true,
            position: 'top',
            color: '#4b5563',
            fontSize: 10,
            fontWeight: 500,
            formatter: (params: any) => {
              const value = params.value;
              if (value >= 1000000) {
                return `$${(value / 1000000).toFixed(1)}M`;
              }
              return `$${(value / 1000).toFixed(0)}K`;
            }
          }
        }
      ],
      animationDuration: 1000,
      animationEasing: 'cubicOut',
      animationDelay: 300
    };
  }, [evolucion, meses]);

  // ============================================
  // RENDER - ERROR
  // ============================================

  if (error) {
    return (
      <div className="w-full h-full p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-red-800 mb-2">Error cargando datos</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <TrendingUp className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Evolución Temporal</h1>
            <p className="text-gray-600">Tendencias y comparativos mensuales</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <select
            value={meses}
            onChange={(e) => setMeses(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
            <option value={24}>Últimos 24 meses</option>
          </select>
          
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Banner Informativo */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Ingresos totales de GECLISA:</span> Este reporte incluye 
            <span className="font-semibold"> TODAS </span> las atenciones registradas, independientemente de si tienen costos configurados.
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Para análisis de rentabilidad con costos asignados, consulte <span className="font-medium">Análisis Marginal → Por Prestación</span>.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Comparativo Mes Actual vs Anterior */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                Mes Actual vs Mes Anterior
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {evolucion.length >= 2 && (
                  <>
                    <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                      <p className="text-sm text-blue-600 mb-1">Prácticas Mes Actual</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatNumber(evolucion[evolucion.length - 1]?.practicas || 0)}
                      </p>
                      {(() => {
                        const variacion = calcularVariacion(
                          evolucion[evolucion.length - 1]?.practicas || 0,
                          evolucion[evolucion.length - 2]?.practicas || 0
                        );
                        return (
                          <div className={`flex items-center mt-1 text-sm ${
                            variacion.tendencia === 'up' ? 'text-green-600' : 
                            variacion.tendencia === 'down' ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {variacion.tendencia === 'up' && <ArrowUp className="h-3 w-3 mr-1" />}
                            {variacion.tendencia === 'down' && <ArrowDown className="h-3 w-3 mr-1" />}
                            {variacion.porcentaje > 0 ? '+' : ''}{variacion.porcentaje}%
                          </div>
                        );
                      })()}
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Prácticas Mes Anterior</p>
                      <p className="text-2xl font-bold text-gray-700">
                        {formatNumber(evolucion[evolucion.length - 2]?.practicas || 0)}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
                      <p className="text-sm text-green-600 mb-1">Ingreso Mes Actual</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatCurrency(evolucion[evolucion.length - 1]?.ingreso || 0)}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Ingreso Mes Anterior</p>
                      <p className="text-2xl font-bold text-gray-700">
                        {formatCurrency(evolucion[evolucion.length - 2]?.ingreso || 0)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Promedios del Período */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-purple-600" />
                Promedios del Período
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-sm text-purple-600 mb-1">Prácticas Promedio/Mes</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {formatNumber(promedios.practicas)}
                  </p>
                </div>

                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-600 mb-1">Ingreso Promedio/Mes</p>
                  <p className="text-2xl font-bold text-yellow-900">
                    {formatCurrency(promedios.ingreso)}
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600 mb-1">Total Período</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatNumber(totales.practicas)}
                  </p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 mb-1">Ingreso Total Período</p>
                  <p className="text-2xl font-bold text-green-900">
                    {formatCurrency(totales.ingreso)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico ECharts - Prácticas */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
              Evolución de Prácticas por Mes
            </h3>
            
            <ReactECharts 
              option={chartOptionPracticas} 
              style={{ height: '320px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>

          {/* Gráfico ECharts - Ingresos */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
              Evolución de Ingresos por Mes
            </h3>
            
            <ReactECharts 
              option={chartOptionIngresos} 
              style={{ height: '320px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </div>

          {/* Tabla Detallada */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Detalle Mensual</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Período
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Prácticas
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Var. %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Coseguro
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Cobertura
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Ingreso Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {evolucion.map((mes, index) => {
                    const variacion = index > 0 
                      ? calcularVariacion(mes.practicas, evolucion[index - 1].practicas)
                      : null;

                    return (
                      <tr key={mes.periodo} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {mes.mesNombre}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                          {formatNumber(mes.practicas)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {variacion ? (
                            <span className={`flex items-center justify-end ${
                              variacion.tendencia === 'up' ? 'text-green-600' : 
                              variacion.tendencia === 'down' ? 'text-red-600' : 'text-gray-500'
                            }`}>
                              {variacion.tendencia === 'up' && <ArrowUp className="h-3 w-3 mr-1" />}
                              {variacion.tendencia === 'down' && <ArrowDown className="h-3 w-3 mr-1" />}
                              {variacion.porcentaje > 0 ? '+' : ''}{variacion.porcentaje}%
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-orange-600">
                          {formatCurrency(mes.coseguro)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-cyan-600">
                          {formatCurrency(mes.cobertura)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                          {formatCurrency(mes.ingreso)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-gray-900">TOTALES</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      {formatNumber(totales.practicas)}
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600">
                      {formatCurrency(totales.coseguro)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-cyan-600">
                      {formatCurrency(totales.cobertura)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {formatCurrency(totales.ingreso)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EvolucionTemporalPage;
