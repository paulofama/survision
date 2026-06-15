// ============================================
// PÁGINA: Recetas de Costos por Práctica
// Sistema de Costos - Instituto Dr. Mercado
// VERSIÓN: Modal de Configuración + Tabla Expandida
// ============================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Package,
  Syringe,
  X,
  Save,
  AlertCircle,
  Loader2,
  Calculator,
  RefreshCw,
  Info,
  CheckCircle,
  Settings,
  ChevronDown,
  ChevronUp,
  Printer
} from 'lucide-react';
import { useRecetasCostos } from '@shared/hooks/useRecetasCostos';
import { usePools } from '@shared/hooks/usePools';
import { useInsumosVariables } from '@shared/hooks/useInsumosVariables';
import { usePrestaciones } from '@shared/hooks/usePrestaciones';
import type {
  CategoriaPractica,
  NuevaPracticaReceta,
  RecetaCompleta,
  PracticaRecetaConCostos
} from '@shared/types/recetas';
import {
  CATEGORIAS_PRACTICAS,
  formatCategoria,
  getCategoriaColor
} from '@shared/types/recetas';

// ============================================
// HELPER: Detectar categoría por nombre
// ============================================

const detectarCategoriaPorNombre = (nombre: string): CategoriaPractica => {
  const nombreUpper = nombre.toUpperCase();
  
  const patronesCirugia = [
    'FACO', 'FACOEMULSIFICACION', 'CIRUG', 'QUIRURG', 'VITRECTOMIA',
    'TRABECULECTOMIA', 'BLEFAROPLAST', 'PTERIGION', 'CHALAZION',
    'IMPLANTE', 'TRASPLANTE', 'CROSSLINKING', 'LASIK', 'PRK',
    'EXTRACCION', 'ENUCLEACION', 'DACRIO', 'ESTRABISMO', 'SUTURA'
  ];
  
  const patronesEstudios = [
    'OCT', 'CAMPIMETRIA', 'CAMPO VISUAL', 'TOPOGRAFIA', 'BIOMETRIA',
    'ECOGRAFIA', 'ANGIOGRAFIA', 'PAQUIMETRIA', 'MICROSCOPIA', 'ESPECULAR',
    'RETINOGRAFIA', 'POTENCIAL', 'ELECTRORETINO', 'ABERROMETRIA',
    'TOMOGRAFIA', 'TEST', 'ESTUDIO', 'EXPLORACION', 'MEDICION', 'RFG'
  ];
  
  if (patronesCirugia.some(p => nombreUpper.includes(p))) return 'Cirugias';
  if (patronesEstudios.some(p => nombreUpper.includes(p))) return 'Estudios';
  return 'Consultas';
};

// ============================================
// HELPER: Formatear moneda
// ============================================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  }).format(value);
};

// ============================================
// FUNCIÓN: Imprimir Receta de Costos
// ============================================

const imprimirReceta = (receta: RecetaCompleta) => {
  const fechaActual = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const pools = receta.pools || [];
  const insumos = receta.insumos_directos || [];

  const filasPoolsHTML = pools.length > 0 
    ? pools.map((pool, index) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${pool.pool_nombre}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(pool.costo_total_pool || 0)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${pool.total_practicas_pool || '?'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${pool.porcentaje_asignacion}%</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500; color: #7c3aed;">${formatCurrency(pool.costo_por_practica)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #9ca3af;">No hay pools asignados</td></tr>';

  const filasInsumosHTML = insumos.length > 0
    ? insumos.map((insumo, index) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${index + 1}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${insumo.insumo_codigo}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${insumo.insumo_nombre || insumo.insumo_descripcion}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(insumo.insumo_precio_unitario || 0)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${insumo.cantidad_por_practica}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500; color: #059669;">${formatCurrency(insumo.costo_por_practica || 0)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #9ca3af;">No hay insumos directos asignados</td></tr>';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Receta de Costos - ${receta.codigo_practica}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1f2937; font-size: 12px; }
        .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .logo-title { font-size: 22px; font-weight: bold; color: #2563eb; }
        .subtitle { font-size: 13px; color: #6b7280; margin-top: 5px; }
        .practica-info { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2563eb; }
        .practica-codigo { font-size: 14px; color: #1e40af; font-family: monospace; font-weight: bold; }
        .practica-nombre { font-size: 18px; font-weight: bold; color: #1f2937; margin-top: 5px; }
        .practica-categoria { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-top: 8px; }
        .cat-cirugias { background: #fef2f2; color: #dc2626; }
        .cat-estudios { background: #eff6ff; color: #2563eb; }
        .cat-consultas { background: #f0fdf4; color: #16a34a; }
        .resumen-costos { display: flex; justify-content: space-between; gap: 15px; margin-bottom: 25px; }
        .resumen-item { flex: 1; background: #f9fafb; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #e5e7eb; }
        .resumen-item.total { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; border: none; }
        .resumen-label { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
        .resumen-item.total .resumen-label { color: #d1fae5; }
        .resumen-value { font-size: 16px; font-weight: bold; }
        .resumen-item.pools .resumen-value { color: #7c3aed; }
        .resumen-item.insumos .resumen-value { color: #059669; }
        .resumen-item.total .resumen-value { color: white; font-size: 18px; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 14px; font-weight: bold; color: #1f2937; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid; display: flex; align-items: center; gap: 8px; }
        .section-title.pools { border-color: #7c3aed; }
        .section-title.insumos { border-color: #059669; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        thead { background: #f3f4f6; }
        th { padding: 10px 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
        th:first-child { text-align: center; width: 40px; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .subtotal-row { background: #f3f4f6 !important; font-weight: bold; }
        .subtotal-row td { padding: 10px 8px; border-top: 2px solid #d1d5db; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Sistema de Costos - Receta de Costos por Práctica</div>
      </div>

      <div class="practica-info">
        <div class="practica-codigo">${receta.codigo_practica}</div>
        <div class="practica-nombre">${receta.nombre_practica}</div>
        <span class="practica-categoria cat-${receta.categoria.toLowerCase()}">${receta.categoria}</span>
        <span style="margin-left: 15px; color: #6b7280;">Cantidad mensual estimada: <strong>${receta.cantidad_mensual_estimada}</strong></span>
      </div>

      <div class="resumen-costos">
        <div class="resumen-item pools">
          <div class="resumen-label">Costo Pools</div>
          <div class="resumen-value">${formatCurrency(receta.totales?.costo_pools || 0)}</div>
        </div>
        <div class="resumen-item insumos">
          <div class="resumen-label">Costo Insumos</div>
          <div class="resumen-value">${formatCurrency(receta.totales?.costo_insumos_directos || 0)}</div>
        </div>
        <div class="resumen-item total">
          <div class="resumen-label">Costo Total por Práctica</div>
          <div class="resumen-value">${formatCurrency(receta.totales?.costo_total_por_practica || 0)}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title pools">📦 Pools de Insumos (${pools.length})</div>
        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Nombre del Pool</th>
              <th style="text-align: right;">Costo Total Pool</th>
              <th style="text-align: center;">Práct/Mes</th>
              <th style="text-align: center;">% Asignado</th>
              <th style="text-align: right; width: 100px;">Costo/Práctica</th>
            </tr>
          </thead>
          <tbody>
            ${filasPoolsHTML}
            ${pools.length > 0 ? `<tr class="subtotal-row"><td colspan="5" style="text-align: right;">SUBTOTAL POOLS:</td><td style="text-align: right; color: #7c3aed;">${formatCurrency(receta.totales?.costo_pools || 0)}</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title insumos">💉 Insumos Directos (${insumos.length})</div>
        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th style="width: 80px;">Código</th>
              <th>Descripción</th>
              <th style="text-align: right;">Precio Unit.</th>
              <th style="text-align: center;">Cantidad</th>
              <th style="text-align: right; width: 100px;">Costo/Práctica</th>
            </tr>
          </thead>
          <tbody>
            ${filasInsumosHTML}
            ${insumos.length > 0 ? `<tr class="subtotal-row"><td colspan="5" style="text-align: right;">SUBTOTAL INSUMOS:</td><td style="text-align: right; color: #059669;">${formatCurrency(receta.totales?.costo_insumos_directos || 0)}</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>Sistema de Costos - Desarrollo | P. Famá</span>
      </div>

      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) {
    ventana.document.write(htmlContent);
    ventana.document.close();
  }
};

// ============================================
// FUNCIÓN DE IMPRESIÓN DE TODAS LAS RECETAS
// ============================================

const imprimirTodasRecetas = (recetas: RecetaCompleta[]) => {
  const fechaActual = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Calcular totales generales
  const totalRecetas = recetas.length;
  const recetasPorCategoria = {
    Cirugias: recetas.filter(r => r.categoria === 'Cirugias').length,
    Estudios: recetas.filter(r => r.categoria === 'Estudios').length,
    Consultas: recetas.filter(r => r.categoria === 'Consultas').length
  };
  const costoTotalGeneral = recetas.reduce((sum, r) => sum + r.costo_total, 0);

  // Generar secciones por categoría
  const categorias: Array<{ nombre: string; color: string; bgColor: string }> = [
    { nombre: 'Cirugias', color: '#dc2626', bgColor: '#fef2f2' },
    { nombre: 'Estudios', color: '#2563eb', bgColor: '#eff6ff' },
    { nombre: 'Consultas', color: '#16a34a', bgColor: '#f0fdf4' }
  ];

  const seccionesHTML = categorias.map((cat, catIndex) => {
    const recetasCategoria = recetas.filter(r => r.categoria === cat.nombre);
    if (recetasCategoria.length === 0) return '';

    const filasHTML = recetasCategoria.map((receta, index) => `
      <tr>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 11px;">${receta.codigo_practica}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${receta.nombre_practica}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 11px;">${receta.cantidad_mensual_estimada}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 11px;">${formatCurrency(receta.costo_pools)}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 11px;">${formatCurrency(receta.costo_insumos_directos)}</td>
        <td style="padding: 6px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; font-size: 11px; color: #059669;">${formatCurrency(receta.costo_total)}</td>
      </tr>
    `).join('');

    const subtotalCategoria = recetasCategoria.reduce((sum, r) => sum + r.costo_total, 0);

    return `
      <div class="categoria-section" style="${catIndex > 0 ? 'margin-top: 25px;' : ''}">
        <div class="categoria-header" style="background: ${cat.bgColor}; border-left: 4px solid ${cat.color}; padding: 10px 15px; margin-bottom: 10px;">
          <h2 style="font-size: 16px; color: ${cat.color}; margin: 0;">${cat.nombre} (${recetasCategoria.length})</h2>
        </div>
        <table>
          <thead style="background: ${cat.color};">
            <tr>
              <th style="width: 80px;">Código</th>
              <th>Práctica</th>
              <th style="width: 70px; text-align: center;">Cant/Mes</th>
              <th style="width: 100px; text-align: right;">Pools</th>
              <th style="width: 100px; text-align: right;">Insumos</th>
              <th style="width: 100px; text-align: right;">Costo Total</th>
            </tr>
          </thead>
          <tbody>
            ${filasHTML}
            <tr style="background: ${cat.bgColor}; font-weight: bold;">
              <td colspan="5" style="padding: 8px; text-align: right; font-size: 12px;">Subtotal ${cat.nombre}:</td>
              <td style="padding: 8px; text-align: right; font-size: 12px; color: ${cat.color};">${formatCurrency(subtotalCategoria)}</td>
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
      <title>Reporte Completo - Recetas de Costos</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          padding: 20px;
          color: #1f2937;
          font-size: 12px;
        }
        .header {
          text-align: center;
          border-bottom: 3px solid #2563eb;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .logo-title {
          font-size: 24px;
          font-weight: bold;
          color: #2563eb;
        }
        .subtitle {
          font-size: 14px;
          color: #6b7280;
          margin-top: 5px;
        }
        .resumen-general {
          display: flex;
          justify-content: space-around;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 25px;
        }
        .resumen-item {
          text-align: center;
        }
        .resumen-label {
          font-size: 11px;
          opacity: 0.9;
        }
        .resumen-value {
          font-size: 18px;
          font-weight: bold;
        }
        .resumen-detail {
          font-size: 10px;
          opacity: 0.8;
          margin-top: 3px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        thead {
          color: white;
        }
        th {
          padding: 8px 6px;
          text-align: left;
          font-weight: 600;
          font-size: 10px;
        }
        tbody tr:nth-child(even) {
          background: #f9fafb;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #6b7280;
        }
        .total-general {
          margin-top: 20px;
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          color: white;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
        }
        .total-general-label {
          font-size: 14px;
          opacity: 0.9;
        }
        .total-general-value {
          font-size: 28px;
          font-weight: bold;
        }
        @media print {
          body { padding: 10px; }
          .categoria-section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Reporte Completo - Recetas de Costos por Práctica</div>
      </div>

      <div class="resumen-general">
        <div class="resumen-item">
          <div class="resumen-label">Total Recetas</div>
          <div class="resumen-value">${totalRecetas}</div>
        </div>
        <div class="resumen-item">
          <div class="resumen-label">Cirugías</div>
          <div class="resumen-value">${recetasPorCategoria.Cirugias}</div>
        </div>
        <div class="resumen-item">
          <div class="resumen-label">Estudios</div>
          <div class="resumen-value">${recetasPorCategoria.Estudios}</div>
        </div>
        <div class="resumen-item">
          <div class="resumen-label">Consultas</div>
          <div class="resumen-value">${recetasPorCategoria.Consultas}</div>
        </div>
      </div>

      ${seccionesHTML}

      <div class="total-general">
        <div class="total-general-label">COSTO TOTAL GENERAL</div>
        <div class="total-general-value">${formatCurrency(costoTotalGeneral)}</div>
      </div>

      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>Sistema de Costos - Desarrollo | P. Famá</span>
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) {
    ventana.document.write(htmlContent);
    ventana.document.close();
  }
};

// ============================================
// FUNCIÓN: Imprimir RESUMEN de todas las recetas
// ============================================

const imprimirRecetasResumen = (recetas: RecetaCompleta[]) => {
  const fechaActual = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalRecetas = recetas.length;
  const recetasPorCategoria = {
    Cirugias: recetas.filter(r => r.categoria === 'Cirugias').length,
    Estudios: recetas.filter(r => r.categoria === 'Estudios').length,
    Consultas: recetas.filter(r => r.categoria === 'Consultas').length
  };
  const costoTotalGeneral = recetas.reduce((sum, r) => sum + (r.costo_total || 0), 0);

  const categorias: Array<{ nombre: string; color: string; bgColor: string }> = [
    { nombre: 'Cirugias', color: '#dc2626', bgColor: '#fef2f2' },
    { nombre: 'Estudios', color: '#2563eb', bgColor: '#eff6ff' },
    { nombre: 'Consultas', color: '#16a34a', bgColor: '#f0fdf4' }
  ];

  const seccionesHTML = categorias.map((cat) => {
    const recetasCategoria = recetas.filter(r => r.categoria === cat.nombre);
    if (recetasCategoria.length === 0) return '';

    const filasHTML = recetasCategoria.map((receta) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 12px;">${receta.codigo_practica}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px;">${receta.nombre_practica}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 12px;">${receta.cantidad_mensual_estimada}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px;">${formatCurrency(receta.costo_pools || 0)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-size: 12px;">${formatCurrency(receta.costo_insumos_directos || 0)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; font-size: 12px; color: #059669;">${formatCurrency(receta.costo_total || 0)}</td>
      </tr>
    `).join('');

    const subtotalCategoria = recetasCategoria.reduce((sum, r) => sum + (r.costo_total || 0), 0);

    return `
      <div class="categoria-section" style="margin-bottom: 25px;">
        <div style="background: ${cat.bgColor}; border-left: 4px solid ${cat.color}; padding: 10px 15px; margin-bottom: 10px;">
          <h2 style="font-size: 16px; color: ${cat.color}; margin: 0;">${cat.nombre} (${recetasCategoria.length})</h2>
        </div>
        <table>
          <thead style="background: ${cat.color}; color: white;">
            <tr><th style="width: 80px;">Código</th><th>Práctica</th><th style="width: 70px; text-align: center;">Cant/Mes</th><th style="width: 100px; text-align: right;">Pools</th><th style="width: 100px; text-align: right;">Insumos</th><th style="width: 100px; text-align: right;">Costo Total</th></tr>
          </thead>
          <tbody>
            ${filasHTML}
            <tr style="background: ${cat.bgColor}; font-weight: bold;"><td colspan="5" style="padding: 10px; text-align: right;">Subtotal ${cat.nombre}:</td><td style="padding: 10px; text-align: right; color: ${cat.color};">${formatCurrency(subtotalCategoria)}</td></tr>
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
      <title>Resumen de Recetas de Costos</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1f2937; }
        .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .logo-title { font-size: 24px; font-weight: bold; color: #2563eb; }
        .subtitle { font-size: 14px; color: #6b7280; margin-top: 5px; }
        .resumen-general { display: flex; justify-content: space-around; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
        .resumen-item { text-align: center; }
        .resumen-label { font-size: 11px; opacity: 0.9; }
        .resumen-value { font-size: 20px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { padding: 10px 8px; text-align: left; font-weight: 600; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .total-general { margin-top: 20px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 15px; border-radius: 8px; text-align: center; }
        .total-general-label { font-size: 14px; opacity: 0.9; }
        .total-general-value { font-size: 28px; font-weight: bold; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Resumen de Recetas de Costos</div>
      </div>
      <div class="resumen-general">
        <div class="resumen-item"><div class="resumen-label">Total Recetas</div><div class="resumen-value">${totalRecetas}</div></div>
        <div class="resumen-item"><div class="resumen-label">Cirugías</div><div class="resumen-value">${recetasPorCategoria.Cirugias}</div></div>
        <div class="resumen-item"><div class="resumen-label">Estudios</div><div class="resumen-value">${recetasPorCategoria.Estudios}</div></div>
        <div class="resumen-item"><div class="resumen-label">Consultas</div><div class="resumen-value">${recetasPorCategoria.Consultas}</div></div>
      </div>
      ${seccionesHTML}
      <div class="total-general">
        <div class="total-general-label">COSTO TOTAL GENERAL</div>
        <div class="total-general-value">${formatCurrency(costoTotalGeneral)}</div>
      </div>
      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>Sistema de Costos - Desarrollo | P. Famá</span>
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) { ventana.document.write(htmlContent); ventana.document.close(); }
};

// ============================================
// FUNCIÓN: Imprimir DETALLE COMPLETO de todas las recetas
// ============================================

const imprimirRecetasDetalle = (recetas: RecetaCompleta[]) => {
  const fechaActual = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalRecetas = recetas.length;
  const costoTotalGeneral = recetas.reduce((sum, r) => sum + (r.costo_total || 0), 0);

  const categoriaColors: Record<string, { bg: string; text: string }> = {
    'Cirugias': { bg: '#fef2f2', text: '#dc2626' },
    'Estudios': { bg: '#eff6ff', text: '#2563eb' },
    'Consultas': { bg: '#f0fdf4', text: '#16a34a' }
  };

  const recetasSections = recetas.map((receta, recetaIndex) => {
    const colors = categoriaColors[receta.categoria] || categoriaColors['Consultas'];
    const pools = receta.pools || [];
    const insumos = receta.insumos_directos || [];

    const poolsHTML = pools.length > 0 ? `
      <div style="margin-top: 10px;">
        <div style="font-weight: 600; font-size: 11px; color: #7c3aed; margin-bottom: 5px;">📦 Pools (${pools.length})</div>
        <table style="font-size: 10px;">
          <thead style="background: #7c3aed; color: white;"><tr><th>Pool</th><th style="text-align: center; width: 60px;">% Asig</th><th style="text-align: right; width: 80px;">Costo/Práct</th></tr></thead>
          <tbody>${pools.map(p => `<tr><td style="padding: 4px;">${p.pool_nombre}</td><td style="padding: 4px; text-align: center;">${p.porcentaje_asignacion}%</td><td style="padding: 4px; text-align: right;">${formatCurrency(p.costo_por_practica)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    ` : `<div style="margin-top: 10px; padding: 8px; background: #f3f4f6; border-radius: 4px; color: #6b7280; font-size: 10px;">📦 Sin pools asignados</div>`;

    const insumosHTML = insumos.length > 0 ? `
      <div style="margin-top: 10px;">
        <div style="font-weight: 600; font-size: 11px; color: #059669; margin-bottom: 5px;">💉 Insumos (${insumos.length})</div>
        <table style="font-size: 10px;">
          <thead style="background: #059669; color: white;"><tr><th style="width: 60px;">Código</th><th>Descripción</th><th style="text-align: center; width: 40px;">Cant</th><th style="text-align: right; width: 70px;">Costo</th></tr></thead>
          <tbody>${insumos.map(i => `<tr><td style="padding: 4px; font-family: monospace;">${i.insumo_codigo}</td><td style="padding: 4px;">${i.insumo_nombre || i.insumo_descripcion}</td><td style="padding: 4px; text-align: center;">${i.cantidad_por_practica}</td><td style="padding: 4px; text-align: right;">${formatCurrency(i.costo_por_practica || 0)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    ` : `<div style="margin-top: 10px; padding: 8px; background: #f3f4f6; border-radius: 4px; color: #6b7280; font-size: 10px;">💉 Sin insumos directos asignados</div>`;

    return `
      <div class="receta-section" style="${recetaIndex > 0 ? 'page-break-before: always;' : ''}">
        <div style="background: ${colors.bg}; border-left: 4px solid ${colors.text}; padding: 12px; margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-family: monospace; color: #6b7280; font-size: 12px;">${receta.codigo_practica}</span>
              <h3 style="font-size: 16px; color: #1f2937; margin: 3px 0;">${receta.nombre_practica}</h3>
              <span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: 600; background: ${colors.text}; color: white;">${receta.categoria}</span>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 10px; color: #6b7280;">COSTO TOTAL</div>
              <div style="font-size: 22px; font-weight: bold; color: ${colors.text};">${formatCurrency(receta.costo_total || 0)}</div>
              <div style="font-size: 10px; color: #6b7280;">Pools: ${formatCurrency(receta.costo_pools || 0)} | Insumos: ${formatCurrency(receta.costo_insumos_directos || 0)}</div>
            </div>
          </div>
        </div>
        ${poolsHTML}
        ${insumosHTML}
      </div>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Detalle Completo - Recetas de Costos</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 15px; color: #1f2937; font-size: 11px; }
        .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 15px; }
        .logo-title { font-size: 22px; font-weight: bold; color: #2563eb; }
        .subtitle { font-size: 13px; color: #6b7280; margin-top: 5px; }
        .resumen-general { display: flex; justify-content: space-around; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 12px; border-radius: 8px; margin-bottom: 20px; }
        .resumen-item { text-align: center; }
        .resumen-label { font-size: 10px; opacity: 0.9; }
        .resumen-value { font-size: 18px; font-weight: bold; }
        .receta-section { margin-bottom: 25px; }
        table { width: 100%; border-collapse: collapse; }
        th { padding: 5px; text-align: left; font-weight: 600; font-size: 9px; }
        td { padding: 4px; border-bottom: 1px solid #e5e7eb; }
        tbody tr:nth-child(even) { background: #f9fafb; }
        .footer { margin-top: 25px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
        @media print { body { padding: 8px; } .receta-section { page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-title">INSTITUTO DR. MERCADO</div>
        <div class="subtitle">Detalle Completo - Recetas de Costos</div>
      </div>
      <div class="resumen-general">
        <div class="resumen-item"><div class="resumen-label">Total Recetas</div><div class="resumen-value">${totalRecetas}</div></div>
        <div class="resumen-item"><div class="resumen-label">Costo Total General</div><div class="resumen-value">${formatCurrency(costoTotalGeneral)}</div></div>
      </div>
      ${recetasSections}
      <div class="footer">
        <span>Generado: ${fechaActual}</span>
        <span>Sistema de Costos - Desarrollo | P. Famá</span>
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const ventana = window.open('', '_blank', 'width=900,height=700');
  if (ventana) { ventana.document.write(htmlContent); ventana.document.close(); }
};

// ============================================
// COMPONENTE: Modal para crear/editar receta básica
// ============================================

interface RecetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  receta?: PracticaRecetaConCostos | null;
  onSave: (data: NuevaPracticaReceta) => Promise<void>;
  prestacionesDisponibles: { codigo: string; nombre: string; agrupacion?: string }[];
}

const RecetaModal: React.FC<RecetaModalProps> = ({
  isOpen,
  onClose,
  receta,
  onSave,
  prestacionesDisponibles
}) => {
  const [formData, setFormData] = useState<NuevaPracticaReceta>({
    codigo_practica: '',
    nombre_practica: '',
    categoria: 'Consultas',
    subcategoria: null,
    cantidad_mensual_estimada: 10,
    observaciones: null
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Autocompletado
  const [searchPrestacion, setSearchPrestacion] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  
  const isEditing = !!receta;
  
  // Cargar datos si estamos editando
  useEffect(() => {
    if (receta) {
      setFormData({
        codigo_practica: receta.codigo_practica,
        nombre_practica: receta.nombre_practica,
        categoria: receta.categoria,
        subcategoria: receta.subcategoria,
        cantidad_mensual_estimada: receta.cantidad_mensual_estimada,
        observaciones: receta.observaciones
      });
    } else {
      setFormData({
        codigo_practica: '',
        nombre_practica: '',
        categoria: 'Consultas',
        subcategoria: null,
        cantidad_mensual_estimada: 10,
        observaciones: null
      });
    }
    setSearchPrestacion('');
  }, [receta, isOpen]);

  // Filtrar sugerencias
  const sugerencias = useMemo(() => {
    if (!searchPrestacion || searchPrestacion.length < 2 || isEditing) return [];
    const term = searchPrestacion.toLowerCase();
    return prestacionesDisponibles
      .filter(p => 
        p.codigo.toLowerCase().includes(term) || 
        p.nombre.toLowerCase().includes(term)
      )
      .slice(0, 10);
  }, [searchPrestacion, prestacionesDisponibles, isEditing]);

  const handleSelectPrestacion = (prestacion: { codigo: string; nombre: string }) => {
    setFormData({
      ...formData,
      codigo_practica: prestacion.codigo,
      nombre_practica: prestacion.nombre,
      categoria: detectarCategoriaPorNombre(prestacion.nombre)
    });
    setSearchPrestacion('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || sugerencias.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, sugerencias.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && sugerencias[selectedIndex]) {
      e.preventDefault();
      handleSelectPrestacion(sugerencias[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.codigo_practica || !formData.nombre_practica) {
      setError('Código y nombre son requeridos');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {isEditing ? 'Editar Receta' : 'Nueva Receta de Costos'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-blue-500 rounded-lg">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          {/* Búsqueda de prestaciones (solo en modo crear) */}
          {!isEditing && (
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                🔍 Buscar Prestación (GECLISA)
              </label>
              <input
                ref={searchRef}
                type="text"
                value={searchPrestacion}
                onChange={e => {
                  setSearchPrestacion(e.target.value);
                  setShowSuggestions(true);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Escribir código o nombre..."
              />
              
              {/* Dropdown de sugerencias */}
              {showSuggestions && sugerencias.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {sugerencias.map((p, idx) => (
                    <div
                      key={p.codigo}
                      className={`px-3 py-2 cursor-pointer ${
                        idx === selectedIndex ? 'bg-blue-100' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleSelectPrestacion(p)}
                    >
                      <span className="font-mono text-sm text-gray-500">{p.codigo}</span>
                      <span className="mx-2">-</span>
                      <span className="text-gray-900">{p.nombre}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código *
              </label>
              <input
                type="text"
                value={formData.codigo_practica}
                onChange={e => setFormData({ ...formData, codigo_practica: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 420101"
                disabled={isEditing}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad Mensual *
              </label>
              <input
                type="number"
                value={formData.cantidad_mensual_estimada}
                onChange={e => setFormData({ ...formData, cantidad_mensual_estimada: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                min="1"
                placeholder="Prácticas/mes"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la Práctica *
            </label>
            <input
              type="text"
              value={formData.nombre_practica}
              onChange={e => setFormData({ ...formData, nombre_practica: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: FACOEMULSIFICACIÓN"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría *
            </label>
            <select
              value={formData.categoria}
              onChange={e => setFormData({ ...formData, categoria: e.target.value as CategoriaPractica })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIAS_PRACTICAS.map(cat => (
                <option key={cat} value={cat}>{formatCategoria(cat)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              value={formData.observaciones || ''}
              onChange={e => setFormData({ ...formData, observaciones: e.target.value || null })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Notas adicionales..."
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditing ? 'Guardar Cambios' : 'Crear Receta'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE: Modal de Configuración (Pools + Insumos)
// ============================================

interface ConfigModalProps {
  isOpen: boolean;
  receta: RecetaCompleta | null;
  onClose: () => void;
  pools: any[];
  insumos: any[];
  onAgregarPool: (poolId: string) => Promise<void>;
  onEliminarPool: (id: string) => Promise<void>;
  onAgregarInsumo: (insumoId: string, cantidad: number) => Promise<void>;
  onActualizarInsumo: (id: string, cantidad: number) => Promise<void>;
  onEliminarInsumo: (id: string) => Promise<void>;
}

const ConfigModal: React.FC<ConfigModalProps> = ({
  isOpen,
  receta,
  onClose,
  pools,
  insumos,
  onAgregarPool,
  onEliminarPool,
  onAgregarInsumo,
  onActualizarInsumo,
  onEliminarInsumo
}) => {
  const [showAddPool, setShowAddPool] = useState(false);
  const [showAddInsumo, setShowAddInsumo] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [selectedInsumoId, setSelectedInsumoId] = useState('');
  const [cantidadInsumo, setCantidadInsumo] = useState(1);
  const [saving, setSaving] = useState(false);
  
  // Estado para editar insumos
  const [editandoInsumoId, setEditandoInsumoId] = useState<string | null>(null);
  const [cantidadEditando, setCantidadEditando] = useState<number>(1);

  // Reset al cerrar
  useEffect(() => {
    if (!isOpen) {
      setShowAddPool(false);
      setShowAddInsumo(false);
      setSelectedPoolId('');
      setSelectedInsumoId('');
      setCantidadInsumo(1);
      setEditandoInsumoId(null);
    }
  }, [isOpen]);

  if (!isOpen || !receta) return null;

  // Pools disponibles (no asignados)
  const poolsDisponibles = pools.filter(p => 
    !(receta.pools || []).some(rp => rp.pool_id === p.id)
  );

  // Insumos disponibles (no asignados)
  const insumosDisponibles = insumos.filter(i => 
    !(receta.insumos_directos || []).some(ri => ri.insumo_id === i.id)
  );

  const handleAgregarPool = async () => {
    if (!selectedPoolId) return;
    setSaving(true);
    try {
      await onAgregarPool(selectedPoolId);
      setSelectedPoolId('');
      setShowAddPool(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAgregarInsumo = async () => {
    if (!selectedInsumoId) return;
    setSaving(true);
    try {
      await onAgregarInsumo(selectedInsumoId, cantidadInsumo);
      setSelectedInsumoId('');
      setCantidadInsumo(1);
      setShowAddInsumo(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-purple-700 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configurar Receta
              </h2>
              <p className="text-purple-200 text-sm mt-1">
                {receta.codigo_practica} - {receta.nombre_practica}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-purple-500 rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Resumen de costos */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="bg-purple-500 bg-opacity-50 rounded-lg p-3">
              <p className="text-xs text-purple-200">Cant. Mensual</p>
              <p className="text-lg font-bold">{receta.cantidad_mensual_estimada}</p>
            </div>
            <div className="bg-purple-500 bg-opacity-50 rounded-lg p-3">
              <p className="text-xs text-purple-200">Costo Pools</p>
              <p className="text-lg font-bold">{formatCurrency(receta.totales.costo_pools)}</p>
            </div>
            <div className="bg-purple-500 bg-opacity-50 rounded-lg p-3">
              <p className="text-xs text-purple-200">Costo Insumos</p>
              <p className="text-lg font-bold">{formatCurrency(receta.totales.costo_insumos_directos)}</p>
            </div>
            <div className="bg-green-500 bg-opacity-80 rounded-lg p-3">
              <p className="text-xs text-green-100">COSTO TOTAL</p>
              <p className="text-xl font-bold">{formatCurrency(receta.totales.costo_total_por_practica)}</p>
            </div>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECCIÓN: POOLS */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-600" />
                Pools de Insumos
                <span className="text-sm bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  {(receta.pools || []).length}
                </span>
              </h3>
              <button
                onClick={() => setShowAddPool(true)}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1"
              >
                <Plus className="h-4 w-4" /> Agregar Pool
              </button>
            </div>

            {/* Formulario agregar pool */}
            {showAddPool && (
              <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex gap-2">
                  <select
                    value={selectedPoolId}
                    onChange={e => setSelectedPoolId(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg"
                  >
                    <option value="">Seleccionar pool...</option>
                    {poolsDisponibles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({formatCurrency(p.costo_total || 0)})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAgregarPool}
                    disabled={!selectedPoolId || saving}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                  </button>
                  <button
                    onClick={() => setShowAddPool(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de pools */}
            {(receta.pools || []).length > 0 ? (
              <div className="space-y-2">
                {(receta.pools || []).map(pool => (
                  <div 
                    key={pool.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{pool.pool_nombre}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Pool total: {formatCurrency(pool.costo_total_pool)} •{' '}
                        {pool.total_practicas_pool || '?'} prácticas/mes •{' '}
                        {pool.porcentaje_asignacion}% asignado
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-purple-700">
                          {formatCurrency(pool.costo_por_practica)}
                        </p>
                        <p className="text-xs text-gray-500">/práctica</p>
                      </div>
                      <button
                        onClick={() => onEliminarPool(pool.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Subtotal */}
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-right">
                    <span className="text-sm text-gray-500">Subtotal Pools: </span>
                    <span className="text-lg font-bold text-purple-700">
                      {formatCurrency(receta.totales.costo_pools)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-gray-50 rounded-lg text-center">
                <Package className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">No hay pools asignados</p>
                <p className="text-sm text-gray-400">Los pools se prorratean entre todas las prácticas que los usan</p>
              </div>
            )}
          </div>

          {/* SECCIÓN: INSUMOS DIRECTOS */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Syringe className="h-5 w-5 text-green-600" />
                Insumos Directos
                <span className="text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {(receta.insumos_directos || []).length}
                </span>
              </h3>
              <button
                onClick={() => setShowAddInsumo(true)}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
              >
                <Plus className="h-4 w-4" /> Agregar Insumo
              </button>
            </div>

            {/* Formulario agregar insumo */}
            {showAddInsumo && (
              <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex gap-2">
                  <select
                    value={selectedInsumoId}
                    onChange={e => setSelectedInsumoId(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg"
                  >
                    <option value="">Seleccionar insumo...</option>
                    {insumosDisponibles.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.codigo} - {i.descripcion} ({formatCurrency(i.precio_unitario)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={cantidadInsumo}
                    onChange={e => setCantidadInsumo(parseFloat(e.target.value) || 1)}
                    className="w-24 px-3 py-2 border rounded-lg"
                    min="0.01"
                    step="0.01"
                    placeholder="Cant"
                  />
                  <button
                    onClick={handleAgregarInsumo}
                    disabled={!selectedInsumoId || saving}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                  </button>
                  <button
                    onClick={() => setShowAddInsumo(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de insumos */}
            {(receta.insumos_directos || []).length > 0 ? (
              <div className="space-y-2">
                {(receta.insumos_directos || []).map(insumo => (
                  <div 
                    key={insumo.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {insumo.insumo_codigo} - {insumo.insumo_nombre || insumo.insumo_descripcion}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatCurrency(insumo.insumo_precio_unitario || 0)} × {insumo.cantidad_por_practica} {insumo.insumo_unidad}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Edición de cantidad */}
                      {editandoInsumoId === insumo.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={cantidadEditando}
                            onChange={e => setCantidadEditando(parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border rounded text-center text-sm"
                            min="0.01"
                            step="0.01"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              if (cantidadEditando > 0) {
                                setSaving(true);
                                try {
                                  await onActualizarInsumo(insumo.id, cantidadEditando);
                                  setEditandoInsumoId(null);
                                } finally {
                                  setSaving(false);
                                }
                              }
                            }}
                            disabled={saving || cantidadEditando <= 0}
                            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                            title="Guardar"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => setEditandoInsumoId(null)}
                            className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                            title="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditandoInsumoId(insumo.id);
                            setCantidadEditando(insumo.cantidad_por_practica);
                          }}
                          className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors font-mono"
                          title="Editar cantidad"
                        >
                          {insumo.cantidad_por_practica}
                        </button>
                      )}
                      
                      <div className="text-right min-w-[100px]">
                        <p className="text-lg font-bold text-green-700">
                          {formatCurrency(insumo.costo_por_practica || 0)}
                        </p>
                        <p className="text-xs text-gray-500">/práctica</p>
                      </div>
                      <button
                        onClick={() => onEliminarInsumo(insumo.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar insumo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Subtotal */}
                <div className="flex justify-end pt-2 border-t">
                  <div className="text-right">
                    <span className="text-sm text-gray-500">Subtotal Insumos: </span>
                    <span className="text-lg font-bold text-green-700">
                      {formatCurrency(receta.totales.costo_insumos_directos)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-gray-50 rounded-lg text-center">
                <Syringe className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">No hay insumos directos asignados</p>
                <p className="text-sm text-gray-400">Los insumos directos se multiplican por la cantidad por práctica</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer con botón de impresión */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => imprimirReceta(receta)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Imprimir Receta
            </button>
            <p className="text-sm text-gray-500">
              <Info className="h-4 w-4 inline mr-1" />
              Los costos se actualizan automáticamente
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL: RecetasCostosPage
// ============================================

const RecetasCostosPage: React.FC = () => {
  // Hooks
  const {
    recetas,
    loading,
    error,
    estadisticas,
    filtroCategoria,
    setFiltroCategoria,
    searchTerm,
    setSearchTerm,
    crearReceta,
    actualizarReceta,
    eliminarReceta,
    cargarRecetaCompleta,
    agregarPoolAReceta,
    eliminarPoolDeReceta,
    agregarInsumoAReceta,
    actualizarInsumoDeReceta,
    eliminarInsumoDeReceta,
    refetch
  } = useRecetasCostos();

  const { pools } = usePools();
  const { insumos } = useInsumosVariables();
  const { prestaciones } = usePrestaciones();

  // Estados locales
  const [showRecetaModal, setShowRecetaModal] = useState(false);
  const [recetaEditar, setRecetaEditar] = useState<PracticaRecetaConCostos | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [recetaConfigurar, setRecetaConfigurar] = useState<RecetaCompleta | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [loadingPrint, setLoadingPrint] = useState(false);

  // Handlers
  const handleNuevaReceta = () => {
    setRecetaEditar(null);
    setShowRecetaModal(true);
  };

  const handleEditarReceta = (receta: PracticaRecetaConCostos) => {
    setRecetaEditar(receta);
    setShowRecetaModal(true);
  };

  const handleGuardarReceta = async (data: NuevaPracticaReceta) => {
    if (recetaEditar) {
      await actualizarReceta(recetaEditar.id, data);
      setSuccessMessage('Receta actualizada correctamente');
    } else {
      await crearReceta(data);
      setSuccessMessage('Receta creada correctamente');
    }
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleEliminarReceta = async (id: string) => {
    if (!confirm('¿Eliminar esta receta? Se perderán todas las configuraciones de costos.')) return;
    await eliminarReceta(id);
    setSuccessMessage('Receta eliminada correctamente');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleConfigurar = async (receta: PracticaRecetaConCostos) => {
    const completa = await cargarRecetaCompleta(receta.id);
    setRecetaConfigurar(completa);
    setShowConfigModal(true);
  };

  // Handlers para el modal de configuración
  const handleAgregarPool = async (poolId: string) => {
    if (!recetaConfigurar) return;
    await agregarPoolAReceta({ receta_id: recetaConfigurar.id, pool_id: poolId });
    const actualizada = await cargarRecetaCompleta(recetaConfigurar.id);
    setRecetaConfigurar(actualizada);
    await refetch();
  };

  const handleEliminarPool = async (id: string) => {
    if (!recetaConfigurar) return;
    await eliminarPoolDeReceta(id);
    const actualizada = await cargarRecetaCompleta(recetaConfigurar.id);
    setRecetaConfigurar(actualizada);
    await refetch();
  };

  const handleAgregarInsumo = async (insumoId: string, cantidad: number) => {
    if (!recetaConfigurar) return;
    await agregarInsumoAReceta({ receta_id: recetaConfigurar.id, insumo_id: insumoId, cantidad_por_practica: cantidad });
    const actualizada = await cargarRecetaCompleta(recetaConfigurar.id);
    setRecetaConfigurar(actualizada);
    await refetch();
  };

  const handleEliminarInsumo = async (id: string) => {
    if (!recetaConfigurar) return;
    await eliminarInsumoDeReceta(id);
    const actualizada = await cargarRecetaCompleta(recetaConfigurar.id);
    setRecetaConfigurar(actualizada);
    await refetch();
  };

  const handleActualizarInsumo = async (id: string, cantidad: number) => {
    if (!recetaConfigurar) return;
    await actualizarInsumoDeReceta(id, cantidad);
    const actualizada = await cargarRecetaCompleta(recetaConfigurar.id);
    setRecetaConfigurar(actualizada);
    await refetch();
  };

  // Handler para imprimir detalle completo (carga todos los detalles primero)
  const handleImprimirDetalleCompleto = async () => {
    setShowPrintMenu(false);
    setLoadingPrint(true);
    
    // IMPORTANTE: Abrir ventana ANTES del await para evitar bloqueo de popup
    const ventanaImpresion = window.open('', '_blank', 'width=900,height=700');
    
    if (!ventanaImpresion) {
      alert('El navegador bloqueó la ventana de impresión. Por favor habilita los popups para este sitio.');
      setLoadingPrint(false);
      return;
    }
    
    // Mostrar mensaje de carga en la ventana
    ventanaImpresion.document.write(`
      <html>
        <head><title>Cargando...</title></head>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
          <div style="text-align: center;">
            <div style="font-size: 24px; color: #2563eb; margin-bottom: 10px;">⏳</div>
            <div style="font-size: 18px; color: #374151;">Cargando detalles de ${recetas.length} recetas...</div>
            <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">Por favor espere</div>
          </div>
        </body>
      </html>
    `);
    
    try {
      console.log('Iniciando carga de', recetas.length, 'recetas...');
      
      // Cargar en lotes de 10 para no sobrecargar
      const BATCH_SIZE = 10;
      const recetasCompletas: RecetaCompleta[] = [];
      
      for (let i = 0; i < recetas.length; i += BATCH_SIZE) {
        const batch = recetas.slice(i, i + BATCH_SIZE);
        console.log(`Cargando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(recetas.length/BATCH_SIZE)}...`);
        
        const promesas = batch.map(receta => 
          cargarRecetaCompleta(receta.id).catch(err => {
            console.error('Error cargando receta', receta.id, err);
            return null;
          })
        );
        
        const resultados = await Promise.all(promesas);
        
        // Filtrar y mapear este lote
        for (const completa of resultados) {
          if (completa) {
            recetasCompletas.push({
              ...completa,
              costo_pools: completa.totales?.costo_pools || 0,
              costo_insumos_directos: completa.totales?.costo_insumos_directos || 0,
              costo_total: completa.totales?.costo_total_por_practica || 0
            } as RecetaCompleta);
          }
        }
      }
      
      console.log('Recetas completas cargadas:', recetasCompletas.length);
      
      if (recetasCompletas.length === 0) {
        ventanaImpresion.close();
        alert('No se pudieron cargar los detalles de las recetas');
        return;
      }
      
      // Generar e imprimir con los datos completos
      generarHTMLDetalle(recetasCompletas, ventanaImpresion);
    } catch (err) {
      console.error('Error al cargar detalles:', err);
      ventanaImpresion.close();
      alert('Error al cargar los detalles de las recetas: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setLoadingPrint(false);
    }
  };
  
  // Función auxiliar para generar el HTML en la ventana ya abierta
  const generarHTMLDetalle = (recetas: RecetaCompleta[], ventana: Window) => {
    const fechaActual = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const totalRecetas = recetas.length;
    const costoTotalGeneral = recetas.reduce((sum, r) => sum + (r.costo_total || 0), 0);

    const categoriaColors: Record<string, { bg: string; text: string }> = {
      'Cirugias': { bg: '#fef2f2', text: '#dc2626' },
      'Estudios': { bg: '#eff6ff', text: '#2563eb' },
      'Consultas': { bg: '#f0fdf4', text: '#16a34a' }
    };

    const recetasSections = recetas.map((receta) => {
      const colors = categoriaColors[receta.categoria] || categoriaColors['Consultas'];
      const pools = receta.pools || [];
      const insumos = receta.insumos_directos || [];

      // Pools en formato compacto horizontal
      const poolsHTML = pools.length > 0 ? `
        <div style="margin-top: 4px;">
          <span style="font-weight: 600; font-size: 8px; color: #7c3aed;">📦 POOLS:</span>
          <table style="font-size: 8px; width: 100%; border-collapse: collapse; margin-top: 2px;">
            <thead style="background: #7c3aed; color: white;"><tr><th style="padding: 2px 3px; text-align: left;">Pool</th><th style="padding: 2px; text-align: center; width: 40px;">%</th><th style="padding: 2px 3px; text-align: right; width: 65px;">Costo</th></tr></thead>
            <tbody>${pools.map(p => `<tr style="background: #faf5ff;"><td style="padding: 2px 3px; border-bottom: 1px solid #e9d5ff;">${p.pool_nombre}</td><td style="padding: 2px; text-align: center; border-bottom: 1px solid #e9d5ff;">${p.porcentaje_asignacion}%</td><td style="padding: 2px 3px; text-align: right; border-bottom: 1px solid #e9d5ff;">${formatCurrency(p.costo_por_practica || 0)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : '<span style="font-size: 7px; color: #9ca3af; margin-left: 5px;">Sin pools</span>';

      // Insumos en formato compacto
      const insumosHTML = insumos.length > 0 ? `
        <div style="margin-top: 4px;">
          <span style="font-weight: 600; font-size: 8px; color: #059669;">💉 INSUMOS:</span>
          <table style="font-size: 8px; width: 100%; border-collapse: collapse; margin-top: 2px;">
            <thead style="background: #059669; color: white;"><tr><th style="padding: 2px 3px; width: 50px;">Código</th><th style="padding: 2px 3px; text-align: left;">Descripción</th><th style="padding: 2px; text-align: center; width: 30px;">Cant</th><th style="padding: 2px 3px; text-align: right; width: 65px;">Costo</th></tr></thead>
            <tbody>${insumos.map(i => `<tr style="background: #f0fdf4;"><td style="padding: 2px 3px; font-family: monospace; font-size: 7px; border-bottom: 1px solid #bbf7d0;">${i.insumo_codigo}</td><td style="padding: 2px 3px; border-bottom: 1px solid #bbf7d0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${(i.insumo_nombre || i.insumo_descripcion || '').substring(0, 40)}</td><td style="padding: 2px; text-align: center; border-bottom: 1px solid #bbf7d0;">${i.cantidad_por_practica}</td><td style="padding: 2px 3px; text-align: right; border-bottom: 1px solid #bbf7d0;">${formatCurrency(i.costo_por_practica || 0)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : '<span style="font-size: 7px; color: #9ca3af; margin-left: 5px;">Sin insumos directos</span>';

      return `
        <div class="receta-card">
          <div style="background: ${colors.bg}; border-left: 3px solid ${colors.text}; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-family: monospace; color: #374151; font-size: 9px; font-weight: 600;">${receta.codigo_practica}</span>
                <span style="font-size: 10px; color: #1f2937; font-weight: 500;">${receta.nombre_practica}</span>
                <span style="padding: 1px 6px; border-radius: 8px; font-size: 7px; font-weight: 600; background: ${colors.text}; color: white;">${receta.categoria}</span>
              </div>
            </div>
            <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 7px; color: #6b7280;">Pools: ${formatCurrency(receta.costo_pools || 0)}</span>
              <span style="font-size: 7px; color: #6b7280;">Ins: ${formatCurrency(receta.costo_insumos_directos || 0)}</span>
              <span style="font-size: 12px; font-weight: bold; color: ${colors.text};">${formatCurrency(receta.costo_total || 0)}</span>
            </div>
          </div>
          <div style="padding: 4px 8px 8px 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${poolsHTML}
            ${insumosHTML}
          </div>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Detalle Completo - Recetas de Costos</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 10px; color: #1f2937; font-size: 9px; }
          .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 10px; }
          .logo-title { font-size: 16px; font-weight: bold; color: #2563eb; }
          .subtitle { font-size: 10px; color: #6b7280; margin-top: 3px; }
          .resumen-general { display: flex; justify-content: center; gap: 40px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 8px; border-radius: 6px; margin-bottom: 12px; }
          .resumen-item { text-align: center; }
          .resumen-label { font-size: 8px; opacity: 0.9; }
          .resumen-value { font-size: 14px; font-weight: bold; }
          .receta-card { 
            border: 1px solid #e5e7eb; 
            border-radius: 4px; 
            margin-bottom: 8px; 
            page-break-inside: avoid; 
            break-inside: avoid;
          }
          .footer { margin-top: 15px; padding-top: 8px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8px; color: #6b7280; }
          @media print { 
            body { padding: 5px; } 
            .receta-card { page-break-inside: avoid; break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-title">INSTITUTO DR. MERCADO</div>
          <div class="subtitle">Detalle Completo - Recetas de Costos</div>
        </div>
        <div class="resumen-general">
          <div class="resumen-item"><div class="resumen-label">Total Recetas</div><div class="resumen-value">${totalRecetas}</div></div>
          <div class="resumen-item"><div class="resumen-label">Costo Total General</div><div class="resumen-value">${formatCurrency(costoTotalGeneral)}</div></div>
        </div>
        ${recetasSections}
        <div class="footer">
          <span>Generado: ${fechaActual}</span>
          <span>Sistema de Costos - Desarrollo | P. Famá</span>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    ventana.document.open();
    ventana.document.write(htmlContent);
    ventana.document.close();
  };

  // Prestaciones para autocompletado
  const prestacionesParaAutocomplete = useMemo(() => {
    return prestaciones.map(p => ({
      codigo: p.codigo,
      nombre: p.nombre,
      agrupacion: p.agrupacion
    }));
  }, [prestaciones]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calculator className="h-7 w-7 text-blue-600" />
            Recetas de Costos
          </h1>
          <p className="text-gray-500 mt-1">
            Configura los costos de cada práctica (pools + insumos directos)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowPrintMenu(!showPrintMenu)}
              disabled={loading || recetas.length === 0 || loadingPrint}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Imprimir recetas"
            >
              <Printer className="h-5 w-5" />
              {loadingPrint ? 'Cargando...' : 'Imprimir'}
              <ChevronDown className="h-4 w-4" />
            </button>
            {loadingPrint && (
              <span className="text-sm text-green-600 animate-pulse">
                Cargando detalles de {recetas.length} recetas...
              </span>
            )}
            {showPrintMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowPrintMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border z-20">
                  <div className="py-1">
                    <button
                      onClick={() => { imprimirRecetasResumen(recetas); setShowPrintMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-green-50 flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="font-medium">Resumen de Recetas</p>
                        <p className="text-xs text-gray-500">Listado por categoría sin detalle</p>
                      </div>
                    </button>
                    <button
                      onClick={handleImprimirDetalleCompleto}
                      disabled={loadingPrint}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-green-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Calculator className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="font-medium">Detalle Completo</p>
                        <p className="text-xs text-gray-500">Todas las recetas con pools e insumos</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={refetch}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Actualizar"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={handleNuevaReceta}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Nueva Receta
          </button>
        </div>
      </div>

      {/* Mensaje de éxito */}
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="h-5 w-5" />
          {successMessage}
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500">Total Recetas</p>
          <p className="text-2xl font-bold text-gray-900">{estadisticas?.total_recetas || 0}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500">🔪 Cirugías</p>
          <p className="text-2xl font-bold text-red-600">{estadisticas?.recetas_por_categoria?.Cirugias || 0}</p>
          <p className="text-xs text-gray-500">Prom: {formatCurrency(estadisticas?.costo_promedio_cirugia || 0)}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500">🔬 Estudios</p>
          <p className="text-2xl font-bold text-blue-600">{estadisticas?.recetas_por_categoria?.Estudios || 0}</p>
          <p className="text-xs text-gray-500">Prom: {formatCurrency(estadisticas?.costo_promedio_estudio || 0)}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500">👨‍⚕️ Consultas</p>
          <p className="text-2xl font-bold text-green-600">{estadisticas?.recetas_por_categoria?.Consultas || 0}</p>
          <p className="text-xs text-gray-500">Prom: {formatCurrency(estadisticas?.costo_promedio_consulta || 0)}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500">Configuradas</p>
          <p className="text-2xl font-bold text-purple-600">
            {(estadisticas?.recetas_con_pools || 0) + (estadisticas?.recetas_con_insumos || 0)}
          </p>
          <p className="text-xs text-gray-500">Con pools o insumos</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por código o nombre..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value as CategoriaPractica | '')}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS_PRACTICAS.map(cat => (
              <option key={cat} value={cat}>{formatCategoria(cat)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de Recetas */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cant/Mes</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pools</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Insumos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">C. Pools</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">C. Insumos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo Total</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                    <p className="text-gray-500 mt-2">Cargando recetas...</p>
                  </td>
                </tr>
              ) : recetas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <FileText className="h-12 w-12 mx-auto text-gray-300" />
                    <p className="text-gray-500 mt-2">No hay recetas configuradas</p>
                    <button
                      onClick={handleNuevaReceta}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Crear primera receta
                    </button>
                  </td>
                </tr>
              ) : (
                recetas.map(receta => (
                  <tr key={receta.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-gray-700">{receta.codigo_practica}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-900 font-medium">{receta.nombre_practica}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${getCategoriaColor(receta.categoria)}`}>
                        {formatCategoria(receta.categoria)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-gray-700">{receta.cantidad_mensual_estimada}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 text-xs bg-purple-100 text-purple-700 rounded-full">
                        {receta.cantidad_pools}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 text-xs bg-green-100 text-green-700 rounded-full">
                        {receta.cantidad_insumos_directos}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-purple-700 font-medium">{formatCurrency(receta.costo_pools)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-green-700 font-medium">{formatCurrency(receta.costo_insumos_directos)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-blue-700 font-bold">{formatCurrency(receta.costo_total)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleConfigurar(receta)}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Configurar pools e insumos"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEditarReceta(receta)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar datos básicos"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEliminarReceta(receta.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar receta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">¿Cómo funcionan las recetas de costos?</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li><strong>Pools:</strong> El costo del pool se divide por la cantidad mensual estimada de prácticas (prorrateo)</li>
              <li><strong>Insumos Directos:</strong> Se multiplica precio × cantidad por cada práctica</li>
              <li><strong>Costo Total:</strong> Suma de Pools + Insumos Directos</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modales */}
      <RecetaModal
        isOpen={showRecetaModal}
        onClose={() => setShowRecetaModal(false)}
        receta={recetaEditar}
        onSave={handleGuardarReceta}
        prestacionesDisponibles={prestacionesParaAutocomplete}
      />

      <ConfigModal
        isOpen={showConfigModal}
        receta={recetaConfigurar}
        onClose={() => {
          setShowConfigModal(false);
          setRecetaConfigurar(null);
        }}
        pools={pools}
        insumos={insumos}
        onAgregarPool={handleAgregarPool}
        onEliminarPool={handleEliminarPool}
        onAgregarInsumo={handleAgregarInsumo}
        onActualizarInsumo={handleActualizarInsumo}
        onEliminarInsumo={handleEliminarInsumo}
      />
    </div>
  );
};

export default RecetasCostosPage;
