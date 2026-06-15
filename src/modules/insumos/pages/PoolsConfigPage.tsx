// ============================================
// PÁGINA: Configuración de Pools de Insumos
// Sistema de Costos - Instituto Dr. Mercado
// CON FUNCIONALIDAD DE IMPRESIÓN Y CREACIÓN
// ============================================

import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Search,
  Trash2,
  Package,
  DollarSign,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  Printer,
  FileText,
  Save
} from 'lucide-react';
import { usePools } from '@/hooks/usePools';
import { useInsumosVariables } from '@/hooks/useInsumosVariables';
import type { PoolConItems, PoolItemConInsumo } from '@/types/pools';
import type { InsumoVariable } from '@/types';

// ============================================
// COLORES POR POOL
// ============================================

const POOL_COLORS: Record<string, string> = {
  'Insumos Generales en Consultorio': 'border-l-blue-500 bg-blue-50',
  'Insumos Generales en Quirófano': 'border-l-green-500 bg-green-50',
  'Kit Parabulbar': 'border-l-purple-500 bg-purple-50',
  'Kit Para RFG': 'border-l-indigo-500 bg-indigo-50',
  'Re Esterilizable Catarata': 'border-l-yellow-500 bg-yellow-50',
  'Re Esterilizable Retina': 'border-l-orange-500 bg-orange-50',
  'Re Esterilizable + Lavado': 'border-l-red-500 bg-red-50',
  'Kit Sedación': 'border-l-amber-500 bg-amber-50',
};

const getPoolColor = (nombre: string): string => {
  return POOL_COLORS[nombre] || 'border-l-slate-500 bg-slate-50';
};

// ============================================
// FUNCIONES DE IMPRESIÓN DE POOLS
// ============================================

const formatCurrencyPrint = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const getFechaActual = (): string => {
  return new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const FOOTER_TEXT = 'Sistema de Costos - Desarrollo | P. Famá';

// Imprimir un pool individual con detalle
const imprimirPool = (pool: PoolConItems) => {
  const fechaActual = getFechaActual();
  const totalItems = pool.items.length;
  const costoTotal = pool.items.reduce((sum, item) => {
    if (!item.insumo) return sum;
    return sum + (item.insumo.precio_unitario * item.cantidad * item.factor_ajuste);
  }, 0);

  const filasHTML = pool.items
    .filter(item => item.insumo)
    .map((item, index) => {
      const costo = item.insumo!.precio_unitario * item.cantidad * item.factor_ajuste;
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${item.insumo!.codigo}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.insumo!.descripcion}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrencyPrint(item.insumo!.precio_unitario)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.cantidad}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.factor_ajuste}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500;">${formatCurrencyPrint(costo)}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Pool de Insumos - ${pool.nombre}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1f2937; }
        .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 20px; }
        .logo-title { font-size: 24px; font-weight: bold; color: #7c3aed; }
        .subtitle { font-size: 14px; color: #6b7280; margin-top: 5px; }
        .pool-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .pool-name { font-size: 20px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .pool-desc { color: #6b7280; font-size: 14px; margin-bottom: 10px; }
        .pool-stats { display: flex; gap: 30px; margin-top: 10px; }
        .stat-item { display: flex; flex-direction: column; }
        .stat-label { font-size: 12px; color: #6b7280; }
        .stat-value { font-size: 16px; font-weight: bold; color: #1f2937; }
        .stat-value.highlight { color: #059669; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
        thead { background: #7c3aed; color: white; }
        th { padding: 10px 8px; text-align: left; font-weight: 600; }
        th:nth-child(1), th:nth-child(5), th:nth-child(6) { text-align: center; }
        th:nth-child(4), th:nth-child(7) { text-align: right; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .total-row { background: #f3f4f6 !important; font-weight: bold; }
        .total-row td { padding: 12px 8px; border-top: 2px solid #7c3aed; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Pool de Insumos - Detalle</div>
      </div>
      <div class="pool-info">
        <div class="pool-name">${pool.nombre}</div>
        ${pool.descripcion ? `<div class="pool-desc">${pool.descripcion}</div>` : ''}
        <div class="pool-stats">
          <div class="stat-item"><span class="stat-label">Total de Insumos</span><span class="stat-value">${totalItems}</span></div>
          <div class="stat-item"><span class="stat-label">Prácticas/Mes</span><span class="stat-value">${pool.total_practicas_mes || 0}</span></div>
          <div class="stat-item"><span class="stat-label">Costo Total Pool</span><span class="stat-value highlight">${formatCurrencyPrint(costoTotal)}</span></div>
          <div class="stat-item"><span class="stat-label">Costo por Práctica</span><span class="stat-value highlight">${formatCurrencyPrint(pool.costo_por_practica || 0)}</span></div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th style="width: 80px;">Código</th>
            <th>Descripción</th>
            <th style="width: 100px;">Precio Unit.</th>
            <th style="width: 70px;">Cant.</th>
            <th style="width: 70px;">Factor</th>
            <th style="width: 110px;">Costo</th>
          </tr>
        </thead>
        <tbody>
          ${filasHTML}
          <tr class="total-row">
            <td colspan="6" style="text-align: right;">TOTAL DEL POOL:</td>
            <td style="text-align: right; color: #059669;">${formatCurrencyPrint(costoTotal)}</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>${FOOTER_TEXT}</span>
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) { ventana.document.write(htmlContent); ventana.document.close(); }
};

// Imprimir RESUMEN de todos los pools (sin detalle de insumos)
const imprimirPoolsResumen = (pools: PoolConItems[]) => {
  const fechaActual = getFechaActual();
  const totalPools = pools.length;
  const totalItems = pools.reduce((sum, pool) => sum + pool.items.length, 0);
  const costoTotalGeneral = pools.reduce((sum, pool) => sum + (pool.costo_total || 0), 0);

  const filasHTML = pools.map((pool, index) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${pool.nombre}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${pool.items.length}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: center;">${pool.total_practicas_mes || 0}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrencyPrint(pool.costo_total || 0)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #7c3aed;">${formatCurrencyPrint(pool.costo_por_practica || 0)}</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Resumen de Pools de Insumos</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1f2937; }
        .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 20px; }
        .logo-title { font-size: 24px; font-weight: bold; color: #7c3aed; }
        .subtitle { font-size: 14px; color: #6b7280; margin-top: 5px; }
        .resumen-general { display: flex; justify-content: space-around; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 25px; }
        .resumen-item { text-align: center; }
        .resumen-label { font-size: 12px; opacity: 0.9; }
        .resumen-value { font-size: 24px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead { background: #7c3aed; color: white; }
        th { padding: 12px 10px; text-align: left; font-weight: 600; }
        th:first-child, th:nth-child(3), th:nth-child(4) { text-align: center; }
        th:nth-child(5), th:nth-child(6) { text-align: right; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .total-row { background: #f3f4f6 !important; font-weight: bold; }
        .total-row td { padding: 12px 10px; border-top: 2px solid #7c3aed; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Resumen de Pools de Insumos</div>
      </div>
      <div class="resumen-general">
        <div class="resumen-item"><div class="resumen-label">Total Pools</div><div class="resumen-value">${totalPools}</div></div>
        <div class="resumen-item"><div class="resumen-label">Total Insumos</div><div class="resumen-value">${totalItems}</div></div>
        <div class="resumen-item"><div class="resumen-label">Costo Total</div><div class="resumen-value">${formatCurrencyPrint(costoTotalGeneral)}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            <th>Nombre del Pool</th>
            <th style="width: 80px;">Insumos</th>
            <th style="width: 90px;">Práct/Mes</th>
            <th style="width: 120px;">Costo Total</th>
            <th style="width: 120px;">Costo/Práctica</th>
          </tr>
        </thead>
        <tbody>
          ${filasHTML}
          <tr class="total-row">
            <td colspan="4" style="text-align: right;">TOTAL GENERAL:</td>
            <td style="text-align: right; color: #059669;">${formatCurrencyPrint(costoTotalGeneral)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>${FOOTER_TEXT}</span>
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) { ventana.document.write(htmlContent); ventana.document.close(); }
};

// Imprimir DETALLE COMPLETO de todos los pools (con insumos)
const imprimirPoolsDetalle = (pools: PoolConItems[]) => {
  const fechaActual = getFechaActual();
  const totalPools = pools.length;
  const totalItems = pools.reduce((sum, pool) => sum + pool.items.length, 0);
  const costoTotalGeneral = pools.reduce((sum, pool) => sum + (pool.costo_total || 0), 0);

  const poolsSections = pools.map((pool, poolIndex) => {
    const filasHTML = pool.items
      .filter(item => item.insumo)
      .map((item, index) => {
        const costo = item.insumo!.precio_unitario * item.cantidad * item.factor_ajuste;
        return `
          <tr>
            <td style="padding: 5px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 10px;">${index + 1}</td>
            <td style="padding: 5px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 10px;">${item.insumo!.codigo}</td>
            <td style="padding: 5px; border-bottom: 1px solid #e5e7eb; font-size: 10px;">${item.insumo!.descripcion}</td>
            <td style="padding: 5px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 10px;">${formatCurrencyPrint(item.insumo!.precio_unitario)}</td>
            <td style="padding: 5px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 10px;">${item.cantidad}</td>
            <td style="padding: 5px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500; font-size: 10px;">${formatCurrencyPrint(costo)}</td>
          </tr>
        `;
      }).join('');

    return `
      <div class="pool-section" style="${poolIndex > 0 ? 'page-break-before: always;' : ''}">
        <div class="pool-header">
          <h2>${poolIndex + 1}. ${pool.nombre}</h2>
          <div class="pool-stats-inline">
            <span><strong>${pool.items.length}</strong> insumos</span>
            <span><strong>${pool.total_practicas_mes || 0}</strong> práct/mes</span>
            <span>Total: <strong style="color: #059669;">${formatCurrencyPrint(pool.costo_total || 0)}</strong></span>
            <span>Por práctica: <strong style="color: #7c3aed;">${formatCurrencyPrint(pool.costo_por_practica || 0)}</strong></span>
          </div>
        </div>
        <table>
          <thead><tr>
            <th style="width: 25px;">#</th>
            <th style="width: 65px;">Código</th>
            <th>Descripción</th>
            <th style="width: 85px;">Precio Unit.</th>
            <th style="width: 45px;">Cant.</th>
            <th style="width: 85px;">Costo</th>
          </tr></thead>
          <tbody>
            ${filasHTML}
            <tr class="total-row">
              <td colspan="5" style="text-align: right; font-size: 11px;">TOTAL:</td>
              <td style="text-align: right; color: #059669; font-size: 11px;">${formatCurrencyPrint(pool.costo_total || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Detalle Completo - Pools de Insumos</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 15px; color: #1f2937; font-size: 11px; }
        .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 12px; margin-bottom: 15px; }
        .logo-title { font-size: 22px; font-weight: bold; color: #7c3aed; }
        .subtitle { font-size: 13px; color: #6b7280; margin-top: 5px; }
        .resumen-general { display: flex; justify-content: space-around; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 12px; border-radius: 8px; margin-bottom: 20px; }
        .resumen-item { text-align: center; }
        .resumen-label { font-size: 10px; opacity: 0.9; }
        .resumen-value { font-size: 18px; font-weight: bold; }
        .pool-section { margin-bottom: 20px; }
        .pool-header { background: #f3f4f6; padding: 10px; border-radius: 6px 6px 0 0; border-left: 4px solid #7c3aed; }
        .pool-header h2 { font-size: 14px; color: #1f2937; margin-bottom: 4px; }
        .pool-stats-inline { display: flex; gap: 15px; font-size: 11px; color: #6b7280; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        thead { background: #7c3aed; color: white; }
        th { padding: 6px 5px; text-align: left; font-weight: 600; font-size: 9px; }
        th:first-child { text-align: center; }
        th:nth-child(4), th:nth-child(6) { text-align: right; }
        th:nth-child(5) { text-align: center; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .total-row { background: #f3f4f6 !important; font-weight: bold; }
        .total-row td { padding: 6px 5px; border-top: 2px solid #7c3aed; }
        .footer { margin-top: 25px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
        @media print { body { padding: 8px; } .pool-section { page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Detalle Completo - Pools de Insumos</div>
      </div>
      <div class="resumen-general">
        <div class="resumen-item"><div class="resumen-label">Total Pools</div><div class="resumen-value">${totalPools}</div></div>
        <div class="resumen-item"><div class="resumen-label">Total Insumos</div><div class="resumen-value">${totalItems}</div></div>
        <div class="resumen-item"><div class="resumen-label">Costo Total</div><div class="resumen-value">${formatCurrencyPrint(costoTotalGeneral)}</div></div>
      </div>
      ${poolsSections}
      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>${FOOTER_TEXT}</span>
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) { ventana.document.write(htmlContent); ventana.document.close(); }
};

// ============================================
// INTERFAZ PARA NUEVO POOL
// ============================================

type TipoConsumo = 'Anual' | 'Mensual' | 'Trimestral' | 'Semestral';

interface NuevoPoolForm {
  nombre: string;
  descripcion: string;
  tipo_consumo: TipoConsumo;
}

const INITIAL_FORM_STATE: NuevoPoolForm = {
  nombre: '',
  descripcion: '',
  tipo_consumo: 'Anual'
};

const TIPOS_CONSUMO: { value: TipoConsumo; label: string }[] = [
  { value: 'Anual', label: 'Anual' },
  { value: 'Mensual', label: 'Mensual' },
  { value: 'Trimestral', label: 'Trimestral' },
  { value: 'Semestral', label: 'Semestral' },
];

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PoolsConfigPage: React.FC = () => {
  // Hooks
  const { 
    pools, 
    loading, 
    error, 
    createPool,
    addItemToPool, 
    removeItemFromPool,
    updatePoolItem,
    refetch,
    estadisticas 
  } = usePools();
  
  const { insumos } = useInsumosVariables();

  // Estado local
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const [searchInsumo, setSearchInsumo] = useState('');
  const [addingToPool, setAddingToPool] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showPrintMenu, setShowPrintMenu] = useState(false);

  // ============================================
  // ESTADO PARA MODAL DE NUEVO POOL
  // ============================================
  const [showNewPoolModal, setShowNewPoolModal] = useState(false);
  const [newPoolForm, setNewPoolForm] = useState<NuevoPoolForm>(INITIAL_FORM_STATE);
  const [savingPool, setSavingPool] = useState(false);

  // ============================================
  // HELPERS
  // ============================================

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const showMessage = (message: string, type: 'success' | 'error') => {
    if (type === 'success') {
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // Insumos filtrados para agregar (excluye los que ya están en el pool)
  const getInsumosDisponibles = (poolId: string): InsumoVariable[] => {
    const pool = pools.find(p => p.id === poolId);
    const idsEnPool = pool?.items.map(i => i.insumo_id) || [];
    
    return insumos
      .filter(ins => !idsEnPool.includes(ins.id))
      .filter(ins => 
        ins.descripcion.toLowerCase().includes(searchInsumo.toLowerCase()) ||
        ins.codigo.toLowerCase().includes(searchInsumo.toLowerCase())
      )
      .slice(0, 20);
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleTogglePool = (poolId: string) => {
    setExpandedPool(expandedPool === poolId ? null : poolId);
    setAddingToPool(null);
    setSearchInsumo('');
  };

  const handleAddInsumo = async (poolId: string, insumo: InsumoVariable) => {
    try {
      await addItemToPool(poolId, insumo.id, 1, 1);
      showMessage(`${insumo.descripcion} agregado al pool`, 'success');
      setSearchInsumo('');
    } catch (err) {
      showMessage('Error al agregar insumo', 'error');
    }
  };

  const handleRemoveInsumo = async (poolId: string, insumoId: string, descripcion: string) => {
    if (!confirm(`¿Eliminar "${descripcion}" del pool?`)) return;
    
    try {
      await removeItemFromPool(poolId, insumoId);
      showMessage('Insumo eliminado del pool', 'success');
    } catch (err) {
      showMessage('Error al eliminar insumo', 'error');
    }
  };

  const handleCantidadChange = (
    poolId: string, 
    insumoId: string, 
    newCantidad: string,
    currentFactor: number
  ) => {
    const cantidad = parseFloat(newCantidad);
    if (!isNaN(cantidad) && cantidad >= 0) {
      updatePoolItem(poolId, insumoId, cantidad, currentFactor);
    }
  };

  const handleFactorChange = (
    poolId: string, 
    insumoId: string, 
    currentCantidad: number,
    newFactor: string
  ) => {
    const factor = parseFloat(newFactor);
    if (!isNaN(factor) && factor >= 0) {
      updatePoolItem(poolId, insumoId, currentCantidad, factor);
    }
  };

  // ============================================
  // HANDLERS PARA NUEVO POOL
  // ============================================

  const handleOpenNewPoolModal = () => {
    setNewPoolForm(INITIAL_FORM_STATE);
    setShowNewPoolModal(true);
  };

  const handleCloseNewPoolModal = () => {
    setShowNewPoolModal(false);
    setNewPoolForm(INITIAL_FORM_STATE);
  };

  const handleNewPoolFormChange = (field: keyof NuevoPoolForm, value: string) => {
    setNewPoolForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreatePool = async () => {
    // Validación
    if (!newPoolForm.nombre.trim()) {
      showMessage('El nombre del pool es requerido', 'error');
      return;
    }

    try {
      setSavingPool(true);
      
      await createPool({
        nombre: newPoolForm.nombre.trim(),
        descripcion: newPoolForm.descripcion.trim() || undefined,
        tipo_consumo: newPoolForm.tipo_consumo
      });

      showMessage(`Pool "${newPoolForm.nombre}" creado exitosamente`, 'success');
      handleCloseNewPoolModal();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error al crear el pool';
      showMessage(errorMsg, 'error');
    } finally {
      setSavingPool(false);
    }
  };

  // ============================================
  // RENDER ITEM DE POOL
  // ============================================

  const renderPoolItem = (pool: PoolConItems, item: PoolItemConInsumo) => {
    if (!item.insumo) return null;

    const costo = item.insumo.precio_unitario * item.cantidad * item.factor_ajuste;

    return (
      <tr key={item.id} className="hover:bg-gray-50">
        <td className="px-3 py-2">
          <span className="font-mono text-sm text-gray-600">{item.insumo.codigo}</span>
        </td>
        <td className="px-3 py-2">
          <span className="text-sm text-gray-900">{item.insumo.descripcion}</span>
        </td>
        <td className="px-3 py-2 text-right">
          <span className="text-sm text-gray-600">
            {formatCurrency(item.insumo.precio_unitario)}
          </span>
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            defaultValue={item.cantidad}
            key={`cant-${item.id}-${item.cantidad}`}
            onChange={(e) => handleCantidadChange(
              pool.id, 
              item.insumo_id, 
              e.target.value,
              item.factor_ajuste
            )}
            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            min="0"
            step="0.01"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            defaultValue={item.factor_ajuste}
            key={`fact-${item.id}-${item.factor_ajuste}`}
            onChange={(e) => handleFactorChange(
              pool.id, 
              item.insumo_id, 
              item.cantidad,
              e.target.value
            )}
            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            min="0"
            step="0.01"
          />
        </td>
        <td className="px-3 py-2 text-right">
          <span className="text-sm font-medium text-green-600">
            {formatCurrency(costo)}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          <button
            onClick={() => handleRemoveInsumo(pool.id, item.insumo_id, item.insumo!.descripcion)}
            className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Eliminar del pool"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
    );
  };

  // ============================================
  // RENDER POOL CARD
  // ============================================

  const renderPoolCard = (pool: PoolConItems) => {
    const isExpanded = expandedPool === pool.id;
    const colorClass = getPoolColor(pool.nombre);
    const insumosDisponibles = getInsumosDisponibles(pool.id);

    return (
      <div
        key={pool.id}
        className={`bg-white rounded-lg shadow-sm border-l-4 ${colorClass} overflow-hidden transition-all`}
      >
        {/* Encabezado del Pool */}
        <div
          className="p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
          onClick={() => handleTogglePool(pool.id)}
        >
          <div className="flex items-center space-x-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Layers className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{pool.nombre}</h3>
              <p className="text-sm text-gray-500">
                {pool.items.length} insumos • {pool.total_practicas_mes || 0} prácticas/mes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-500">Costo Total</p>
              <p className="font-bold text-green-600">{formatCurrency(pool.costo_total)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Por Práctica</p>
              <p className="font-bold text-blue-600">{formatCurrency(pool.costo_por_practica || 0)}</p>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>

        {/* Contenido Expandido */}
        {isExpanded && (
          <div className="border-t">
            {/* Barra de acciones */}
            <div className="px-4 py-3 bg-gray-50 flex justify-between items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingToPool(addingToPool === pool.id ? null : pool.id);
                  setSearchInsumo('');
                }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar Insumo</span>
              </button>

              {/* BOTÓN DE IMPRESIÓN */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  imprimirPool(pool);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm transition-colors"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir Pool</span>
              </button>
            </div>

            {/* Buscador de insumos */}
            {addingToPool === pool.id && (
              <div className="px-4 py-3 bg-blue-50 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar insumo por código o descripción..."
                    value={searchInsumo}
                    onChange={(e) => setSearchInsumo(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  {searchInsumo && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchInsumo('');
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2"
                    >
                      <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
                
                {searchInsumo && (
                  <div className="mt-2 max-h-60 overflow-y-auto bg-white rounded-lg border">
                    {insumosDisponibles.length > 0 ? (
                      insumosDisponibles.map(insumo => (
                        <div
                          key={insumo.id}
                          className="px-3 py-2 hover:bg-gray-50 flex items-center justify-between cursor-pointer border-b last:border-0"
                          onClick={() => handleAddInsumo(pool.id, insumo)}
                        >
                          <div>
                            <span className="font-mono text-sm text-gray-500 mr-2">{insumo.codigo}</span>
                            <span className="text-sm text-gray-900">{insumo.descripcion}</span>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-sm text-gray-600">{formatCurrency(insumo.precio_unitario)}</span>
                            <Plus className="h-4 w-4 text-blue-600" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-4 text-center text-gray-500">
                        No se encontraron insumos disponibles
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tabla de Items */}
            {pool.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Precio Unit.</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Factor</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Costo</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pool.items.map(item => renderPoolItem(pool, item))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right font-medium text-gray-900">
                        Total del Pool:
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-green-600">
                        {formatCurrency(pool.costo_total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No hay insumos en este pool</p>
                <p className="text-sm text-gray-400">
                  Haz clic en "Agregar Insumo" para comenzar
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // MODAL DE NUEVO POOL
  // ============================================

  const renderNewPoolModal = () => {
    if (!showNewPoolModal) return null;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={handleCloseNewPoolModal}
        />

        {/* Modal */}
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Layers className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Nuevo Pool de Insumos</h3>
              </div>
              <button
                onClick={handleCloseNewPoolModal}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Pool <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPoolForm.nombre}
                  onChange={(e) => handleNewPoolFormChange('nombre', e.target.value)}
                  placeholder="Ej: Kit Sedación, Re Esterilizable Córnea..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  autoFocus
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={newPoolForm.descripcion}
                  onChange={(e) => handleNewPoolFormChange('descripcion', e.target.value)}
                  placeholder="Descripción opcional del pool..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
              </div>

              {/* Tipo de Consumo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Consumo <span className="text-red-500">*</span>
                </label>
                <select
                  value={newPoolForm.tipo_consumo}
                  onChange={(e) => handleNewPoolFormChange('tipo_consumo', e.target.value as TipoConsumo)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  {TIPOS_CONSUMO.map(tipo => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Define la frecuencia de consumo de los insumos del pool
                </p>
              </div>

              {/* Info */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> Una vez creado el pool, podrás agregar insumos haciendo clic en él y usando el botón "Agregar Insumo".
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
              <button
                onClick={handleCloseNewPoolModal}
                disabled={savingPool}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePool}
                disabled={savingPool || !newPoolForm.nombre.trim()}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPool ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Creando...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Crear Pool</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER PRINCIPAL - ANCHO COMPLETO
  // ============================================

  return (
    <div className="w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Layers className="h-8 w-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuración de Pools</h1>
            <p className="text-sm text-gray-500">
              Agrupa insumos de consumo mensual para prorratear entre prestaciones
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* BOTÓN NUEVO POOL */}
          <button
            onClick={handleOpenNewPoolModal}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Pool</span>
          </button>
          
          <div className="relative">
            <button
              onClick={() => setShowPrintMenu(!showPrintMenu)}
              disabled={loading || pools.length === 0}
              className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {showPrintMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowPrintMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border z-20">
                  <div className="py-1">
                    <button
                      onClick={() => { imprimirPoolsResumen(pools); setShowPrintMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4 text-purple-600" />
                      <div>
                        <p className="font-medium">Resumen de Pools</p>
                        <p className="text-xs text-gray-500">Listado sin detalle de insumos</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { imprimirPoolsDetalle(pools); setShowPrintMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 flex items-center gap-2"
                    >
                      <Layers className="h-4 w-4 text-purple-600" />
                      <div>
                        <p className="font-medium">Detalle Completo</p>
                        <p className="text-xs text-gray-500">Todos los pools con sus insumos</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Mensajes */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-green-800">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-red-800">{errorMessage}</span>
        </div>
      )}

      {/* Estadísticas - más compactas */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Layers className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Pools</p>
              <p className="text-xl font-bold text-gray-900">{estadisticas.total_pools}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Items</p>
              <p className="text-xl font-bold text-gray-900">{estadisticas.total_items}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Costo Total</p>
              <p className="text-lg font-bold text-green-600">
                {formatCurrency(estadisticas.costo_total_pools)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Layers className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Mayor Costo</p>
              <p className="text-sm font-medium text-gray-900 truncate" title={estadisticas.pool_mayor_costo}>
                {estadisticas.pool_mayor_costo}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && pools.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 text-purple-600 animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-800">{error}</p>
          <button
            onClick={refetch}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Lista de Pools */}
      {!loading && !error && pools.length > 0 && (
        <div className="space-y-3">
          {pools.map(pool => renderPoolCard(pool))}
        </div>
      )}

      {/* Empty State - ACTUALIZADO CON BOTÓN */}
      {!loading && !error && pools.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Layers className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay pools configurados</h3>
          <p className="text-gray-500 mb-6">
            Crea tu primer pool para agrupar insumos de consumo mensual.
          </p>
          <button
            onClick={handleOpenNewPoolModal}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            <span>Crear Primer Pool</span>
          </button>
        </div>
      )}

      {/* Modal de Nuevo Pool */}
      {renderNewPoolModal()}
    </div>
  );
};

export default PoolsConfigPage;
