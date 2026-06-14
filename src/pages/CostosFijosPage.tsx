// ===========================================================
// CostosFijosPage.tsx - v2.4
// Sistema de Costos Fijos - Instituto Dr. Mercado
// Menú contextual de clasificación en primera columna
// v2.4: Columna "Tipo" informativa (Fijo / Variable / vacío)
// ===========================================================
// RUTA DESTINO: src/pages/CostosFijosPage.tsx
// ===========================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DollarSign,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  CheckSquare,
  Square,
  MinusSquare,
  TrendingDown,
  Package,
  FileText,
  Sparkles,
  AlertCircle,
  Loader2,
  Wallet,
  Tag,
  PieChart,
  X,
  Bot,
  BookmarkPlus,
  Settings2,
  Trash2,
  HelpCircle,
  ChevronRight as ChevronRightSmall,
  RotateCcw
} from 'lucide-react';
import useErogaciones, { Erogacion, TipoCosto, SubcategoriaVariable } from '../hooks/useErogaciones';

// ===========================================================
// HELPERS
// ===========================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (fecha: string): string => {
  if (!fecha) return '-';
  try {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return fecha;
  }
};

const fuenteConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'MovProv': { label: 'Proveedor', color: 'bg-blue-100 text-blue-800', icon: <Package className="w-3 h-3" /> },
  'MovValoresEnca': { label: 'Egreso Caja', color: 'bg-amber-100 text-amber-800', icon: <Wallet className="w-3 h-3" /> },
  'LiqComp': { label: 'Liquidación', color: 'bg-purple-100 text-purple-800', icon: <FileText className="w-3 h-3" /> },
};

// ===========================================================
// COMPONENTE PRINCIPAL
// ===========================================================

export default function CostosFijosPage() {
  const {
    anio,
    mes,
    erogaciones,
    estadisticas,
    categorias,
    proveedoresDefault,
    loading,
    loadingClasificacion,
    error,
    successMessage,
    pendienteGuardarDefault,
    confirmarGuardarDefault,
    setPendienteGuardarDefault,
    eliminarProveedorDefault,
    cargarErogaciones,
    clasificarErogacion,
    cambiarPeriodo,
    MESES
  } = useErogaciones();

  // Filtros locales
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroFuente, setFiltroFuente] = useState<string>('');
  const [filtroClasificacion, setFiltroClasificacion] = useState<'todas' | 'fijos' | 'variables' | 'sin_clasificar'>('todas');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');

  // Menú de clasificación: { clave, nivel }
  // nivel: 'tipo' = elegir Fijo/Variable/Sin clasificar
  // nivel: 'categoria' = elegir categoría (submenu de Fijo)
  // nivel: 'subcategoria' = elegir honorarios/insumos (submenu de Variable)
  const [menuAbierto, setMenuAbierto] = useState<{ clave: string; nivel: 'tipo' | 'categoria' | 'subcategoria' } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Panel de reglas
  const [mostrarReglas, setMostrarReglas] = useState(false);

  // ============================================
  // CARGAR DATOS AL MONTAR
  // ============================================

  useEffect(() => {
    cargarErogaciones();
  }, []);

  // Cerrar menú con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAbierto(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // ============================================
  // FILTRADO
  // ============================================

  const erogacionesFiltradas = useMemo(() => {
    return erogaciones.filter(e => {
      if (filtroTexto) {
        const texto = filtroTexto.toLowerCase();
        const coincide =
          e.proveedor_nombre.toLowerCase().includes(texto) ||
          e.descripcion.toLowerCase().includes(texto) ||
          e.numero_comprobante?.toLowerCase().includes(texto);
        if (!coincide) return false;
      }
      if (filtroFuente && e.fuente !== filtroFuente) return false;
      if (filtroClasificacion === 'fijos' && e.tipo_costo !== 'fijo') return false;
      if (filtroClasificacion === 'variables' && e.tipo_costo !== 'variable') return false;
      if (filtroClasificacion === 'sin_clasificar' && e.tipo_costo !== 'sin_clasificar') return false;
      if (filtroCategoria && e.categoria_costo_fijo_id !== filtroCategoria) return false;
      return true;
    });
  }, [erogaciones, filtroTexto, filtroFuente, filtroClasificacion, filtroCategoria]);

  // ============================================
  // NAVEGACIÓN DE PERÍODO
  // ============================================

  const irAMesAnterior = () => {
    if (mes === 1) cambiarPeriodo(anio - 1, 12);
    else cambiarPeriodo(anio, mes - 1);
  };

  const irAMesSiguiente = () => {
    if (mes === 12) cambiarPeriodo(anio + 1, 1);
    else cambiarPeriodo(anio, mes + 1);
  };

  // ============================================
  // HANDLERS DEL MENÚ
  // ============================================

  const handleAbrirMenu = (erogacion: Erogacion) => {
    if (loadingClasificacion) return;
    const clave = `${erogacion.fuente}_${erogacion.id_geclisa}`;
    if (menuAbierto?.clave === clave) {
      setMenuAbierto(null);
      return;
    }
    setMenuAbierto({ clave, nivel: 'tipo' });
  };

  const handleSeleccionarTipo = async (erogacion: Erogacion, tipo: TipoCosto) => {
    const clave = `${erogacion.fuente}_${erogacion.id_geclisa}`;

    if (tipo === 'fijo') {
      // Mostrar segundo nivel: seleccionar categoría
      setMenuAbierto({ clave, nivel: 'categoria' });
      return;
    }

    if (tipo === 'variable') {
      // Mostrar segundo nivel: seleccionar honorarios/insumos
      setMenuAbierto({ clave, nivel: 'subcategoria' });
      return;
    }

    // Sin clasificar → aplicar directo
    setMenuAbierto(null);
    await clasificarErogacion(erogacion, tipo);
  };

  const handleSeleccionarCategoria = async (erogacion: Erogacion, categoriaId: string) => {
    setMenuAbierto(null);
    await clasificarErogacion(erogacion, 'fijo', categoriaId);
  };

  const handleSeleccionarSubcategoria = async (erogacion: Erogacion, sub: SubcategoriaVariable) => {
    setMenuAbierto(null);
    await clasificarErogacion(erogacion, 'variable', null, sub);
  };

  // ============================================
  // RENDER: Icono según estado
  // ============================================

  const renderIconoEstado = (erogacion: Erogacion) => {
    const tipo = erogacion.tipo_costo;
    const configs: Record<TipoCosto, { icon: React.ReactNode; hoverBg: string }> = {
      'fijo': { icon: <CheckSquare className="w-5 h-5 text-blue-600" />, hoverBg: 'hover:bg-blue-100' },
      'variable': { icon: <MinusSquare className="w-5 h-5 text-amber-600" />, hoverBg: 'hover:bg-amber-100' },
      'sin_clasificar': { icon: <Square className="w-5 h-5 text-gray-400" />, hoverBg: 'hover:bg-gray-200' },
    };
    const c = configs[tipo] || configs['sin_clasificar'];

    return (
      <button
        onClick={() => handleAbrirMenu(erogacion)}
        disabled={loadingClasificacion}
        className={`p-1 rounded transition-colors ${c.hoverBg}`}
        title="Click para clasificar"
      >
        {c.icon}
      </button>
    );
  };

  // ============================================
  // RENDER: Menú contextual de clasificación
  // ============================================

  const renderMenuClasificacion = (erogacion: Erogacion) => {
    const clave = `${erogacion.fuente}_${erogacion.id_geclisa}`;
    if (!menuAbierto || menuAbierto.clave !== clave) return null;

    const tipoActual = erogacion.tipo_costo;

    // NIVEL 1: Elegir tipo
    if (menuAbierto.nivel === 'tipo') {
      return (
        <div
          ref={menuRef}
          className="absolute left-10 top-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-52 animate-in fade-in"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase font-semibold tracking-wider border-b border-gray-100">
            Clasificar como
          </div>

          {/* Opción: Costo Fijo */}
          <button
            onClick={() => handleSeleccionarTipo(erogacion, 'fijo')}
            className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
              tipoActual === 'fijo'
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <span>Costo Fijo</span>
            </div>
            <ChevronRightSmall className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {/* Opción: Variable */}
          <button
            onClick={() => handleSeleccionarTipo(erogacion, 'variable')}
            className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
              tipoActual === 'variable'
                ? 'bg-amber-50 text-amber-700 font-medium'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <MinusSquare className="w-4 h-4 text-amber-600" />
              <span>Variable</span>
            </div>
            <ChevronRightSmall className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {/* Separador + Opción: Sin clasificar (solo si ya está clasificado) */}
          {tipoActual !== 'sin_clasificar' && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => handleSeleccionarTipo(erogacion, 'sin_clasificar')}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 text-gray-500"
              >
                <RotateCcw className="w-4 h-4 text-gray-400" />
                <span>Quitar clasificación</span>
              </button>
            </>
          )}
        </div>
      );
    }

    // NIVEL 2: Elegir categoría (para Fijo)
    if (menuAbierto.nivel === 'categoria') {
      return (
        <div
          ref={menuRef}
          className="absolute left-10 top-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-56 max-h-80 overflow-y-auto animate-in fade-in"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          {/* Header con botón volver */}
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
            <button
              onClick={() => setMenuAbierto({ clave, nivel: 'tipo' })}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <ChevronLeft className="w-3 h-3" />
              Volver
            </button>
            <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">
              Categoría
            </span>
          </div>

          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleSeleccionarCategoria(erogacion, cat.id)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5 transition-colors ${
                erogacion.categoria_costo_fijo_id === cat.id
                  ? 'bg-blue-50 font-medium'
                  : ''
              }`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 border"
                style={{
                  backgroundColor: cat.color,
                  borderColor: cat.color
                }}
              />
              <span className="text-gray-700">{cat.nombre}</span>
            </button>
          ))}
        </div>
      );
    }

    // NIVEL 2b: Elegir subcategoría (para Variable)
    if (menuAbierto.nivel === 'subcategoria') {
      return (
        <div
          ref={menuRef}
          className="absolute left-10 top-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-52 animate-in fade-in"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          {/* Header con volver */}
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
            <button
              onClick={() => setMenuAbierto({ clave, nivel: 'tipo' })}
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
            >
              <ChevronLeft className="w-3 h-3" />
              Volver
            </button>
            <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">
              Tipo variable
            </span>
          </div>

          {/* Honorarios */}
          <button
            onClick={() => handleSeleccionarSubcategoria(erogacion, 'honorarios')}
            className={`w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5 transition-colors ${
              erogacion.subcategoria_variable === 'honorarios' ? 'bg-amber-50 font-medium' : ''
            }`}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0 bg-orange-400 border border-orange-400" />
            <span className="text-gray-700">Honorarios</span>
          </button>

          {/* Insumos */}
          <button
            onClick={() => handleSeleccionarSubcategoria(erogacion, 'insumos')}
            className={`w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5 transition-colors ${
              erogacion.subcategoria_variable === 'insumos' ? 'bg-amber-50 font-medium' : ''
            }`}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0 bg-yellow-500 border border-yellow-500" />
            <span className="text-gray-700">Insumos</span>
          </button>
        </div>
      );
    }

    return null;
  };

  // ============================================
  // RENDER: Fondo de fila según clasificación
  // ============================================

  const getRowBg = (erogacion: Erogacion): string => {
    if (erogacion.tipo_costo === 'fijo') {
      return erogacion.auto_clasificado
        ? 'bg-violet-50 hover:bg-violet-100'
        : 'bg-blue-50 hover:bg-blue-100';
    }
    if (erogacion.tipo_costo === 'variable') {
      return 'bg-amber-50 hover:bg-amber-100';
    }
    return 'hover:bg-gray-50';
  };

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="p-6 max-w-full">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Clasificación de Erogaciones</h1>
          <p className="text-sm text-gray-500 mt-1">Click en el icono de cada fila para clasificar</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={irAMesAnterior} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-800">{MESES[mes - 1]} {anio}</span>
          </div>
          <button onClick={irAMesSiguiente} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => cargarErogaciones()}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-2"
            title="Refrescar"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setMostrarReglas(!mostrarReglas)}
            className={`p-2 rounded-lg transition-colors ml-1 ${mostrarReglas ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            title="Reglas de auto-clasificación"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* MENSAJES */}
      {successMessage && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
          <Sparkles className="w-4 h-4" />
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* BANNER AUTO-PARAMETRIZACIÓN */}
      {pendienteGuardarDefault && (
        <div className="mb-4 px-4 py-3 bg-violet-50 border border-violet-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-violet-700 text-sm">
            <Bot className="w-4 h-4" />
            <span>
              ¿Recordar que <strong>"{pendienteGuardarDefault.proveedor_nombre}"</strong> siempre es{' '}
              <strong>Costo Fijo → {pendienteGuardarDefault.categoria_nombre}</strong>?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmarGuardarDefault}
              className="px-3 py-1 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 flex items-center gap-1"
            >
              <BookmarkPlus className="w-3 h-3" /> Sí, recordar
            </button>
            <button onClick={() => setPendienteGuardarDefault(null)} className="p-1 hover:bg-violet-200 rounded">
              <X className="w-4 h-4 text-violet-500" />
            </button>
          </div>
        </div>
      )}

      {/* PANEL DE REGLAS */}
      {mostrarReglas && (
        <div className="mb-4 p-4 bg-white border rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Bot className="w-4 h-4" /> Reglas de Auto-clasificación
            </h3>
            <span className="text-xs text-gray-500">{proveedoresDefault.length} reglas</span>
          </div>
          {proveedoresDefault.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No hay reglas definidas. Clasificá un gasto como fijo y te preguntará si querés recordarlo.
            </p>
          ) : (
            <div className="space-y-2">
              {proveedoresDefault.map(prov => (
                <div key={prov.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-500" />
                    <span className="font-medium">{prov.prov_nombre}</span>
                    {prov.categoria && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{prov.categoria}</span>
                    )}
                  </div>
                  <button
                    onClick={() => eliminarProveedorDefault(prov.prov_nombre)}
                    className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                    title="Eliminar regla"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5 STAT CARDS */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Total */}
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 uppercase font-medium">Total</span>
          </div>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(estadisticas.totalErogaciones)}</p>
          <p className="text-xs text-gray-400 mt-1">{estadisticas.cantidadTotal} registros</p>
        </div>

        {/* Fijos */}
        <div className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 mb-1">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-blue-600 uppercase font-medium">Fijos</span>
          </div>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(estadisticas.totalCostosFijos)}</p>
          <p className="text-xs text-blue-400 mt-1">{estadisticas.cantidadFijos} registros ({estadisticas.porcentajeFijos}%)</p>
        </div>

        {/* Variables */}
        <div className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-amber-500">
          <div className="flex items-center gap-2 mb-1">
            <MinusSquare className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-600 uppercase font-medium">Variables</span>
          </div>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(estadisticas.totalCostosVariables)}</p>
          <p className="text-xs text-amber-400 mt-1">{estadisticas.cantidadVariables} registros ({estadisticas.porcentajeVariables}%)</p>
          {estadisticas.cantidadVariables > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px]">
              <span className="text-orange-600">Hon: {estadisticas.cantidadVariablesHonorarios}</span>
              <span className="text-gray-300">|</span>
              <span className="text-yellow-600">Ins: {estadisticas.cantidadVariablesInsumos}</span>
            </div>
          )}
        </div>

        {/* Sin Clasificar */}
        <div className="bg-white p-4 rounded-xl border shadow-sm border-l-4 border-l-gray-300">
          <div className="flex items-center gap-2 mb-1">
            <Square className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500 uppercase font-medium">Sin clasificar</span>
          </div>
          <p className="text-xl font-bold text-gray-600">{formatCurrency(estadisticas.totalSinClasificar)}</p>
          <p className="text-xs text-gray-400 mt-1">{estadisticas.cantidadSinClasificar} registros</p>
        </div>

        {/* Progreso */}
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <PieChart className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-gray-500 uppercase font-medium">Clasificado</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">{estadisticas.porcentajeClasificado}%</p>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full flex">
              <div className="bg-blue-500 transition-all duration-500" style={{ width: `${estadisticas.porcentajeFijos}%` }} />
              <div className="bg-amber-500 transition-all duration-500" style={{ width: `${estadisticas.porcentajeVariables}%` }} />
            </div>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-blue-500">Fijos</span>
            <span className="text-[10px] text-amber-500">Variables</span>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-xl border shadow-sm mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar proveedor, descripción..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
            />
            {filtroTexto && (
              <button onClick={() => setFiltroTexto('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
          </div>

          <select
            value={filtroFuente}
            onChange={(e) => setFiltroFuente(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none"
          >
            <option value="">Todas las fuentes</option>
            <option value="MovProv">Proveedores</option>
            <option value="MovValoresEnca">Egresos Caja</option>
            <option value="LiqComp">Liquidaciones</option>
          </select>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {[
              { key: 'todas', label: 'Todas', icon: null },
              { key: 'fijos', label: 'Fijos', icon: <CheckSquare className="w-3 h-3 text-blue-600" /> },
              { key: 'variables', label: 'Variables', icon: <MinusSquare className="w-3 h-3 text-amber-600" /> },
              { key: 'sin_clasificar', label: 'Sin Clas.', icon: <Square className="w-3 h-3 text-gray-400" /> },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFiltroClasificacion(f.key as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                  filtroClasificacion === f.key
                    ? 'bg-white shadow text-gray-800'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>

          {filtroClasificacion === 'fijos' && (
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none"
            >
              <option value="">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
              ))}
            </select>
          )}

          <span className="text-xs text-gray-500">{erogacionesFiltradas.length} de {erogaciones.length}</span>
        </div>
      </div>

      {/* LEYENDA */}
      <div className="flex items-center gap-6 mb-3 px-1">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5 text-gray-400" /> Sin clasificar</span>
          <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5 text-blue-600" /> Fijo</span>
          <span className="flex items-center gap-1"><MinusSquare className="w-3.5 h-3.5 text-amber-600" /> Variable</span>
        </div>
        <div className="flex items-center gap-3 ml-auto text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-50 border border-blue-200 rounded" /> Fijo manual</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-violet-50 border border-violet-200 rounded" /> Fijo auto</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-50 border border-amber-200 rounded" /> Variable</span>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-3 text-gray-500">Cargando erogaciones...</span>
          </div>
        ) : erogacionesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <DollarSign className="w-12 h-12 mb-3" />
            <p className="font-medium">No hay erogaciones para mostrar</p>
            <p className="text-sm mt-1">
              {erogaciones.length > 0
                ? 'Probá ajustando los filtros'
                : `No se encontraron datos para ${MESES[mes - 1]} ${anio}`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-12">
                    <HelpCircle className="w-3 h-3 inline" title="Click para clasificar" />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fuente</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Proveedor / Descripción</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-24">Tipo</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {erogacionesFiltradas.map((erogacion) => {
                  const clave = `${erogacion.fuente}_${erogacion.id_geclisa}`;
                  const fuente = fuenteConfig[erogacion.fuente] || {
                    label: erogacion.fuente,
                    color: 'bg-gray-100 text-gray-800',
                    icon: <FileText className="w-3 h-3" />
                  };

                  return (
                    <tr key={clave} className={`${getRowBg(erogacion)} transition-colors`}>
                      {/* Columna clasificación con menú */}
                      <td className="px-3 py-2.5 relative">
                        {renderIconoEstado(erogacion)}
                        {renderMenuClasificacion(erogacion)}
                      </td>

                      {/* Fecha */}
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(erogacion.fecha)}</td>

                      {/* Fuente */}
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${fuente.color}`}>
                          {fuente.icon}
                          {fuente.label}
                        </span>
                      </td>

                      {/* Proveedor */}
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-800 truncate max-w-xs">{erogacion.proveedor_nombre}</div>
                        {erogacion.descripcion && erogacion.descripcion !== erogacion.proveedor_nombre && (
                          <div className="text-xs text-gray-400 truncate max-w-xs">{erogacion.descripcion}</div>
                        )}
                        {erogacion.auto_clasificado && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Bot className="w-3 h-3 text-violet-400" />
                            <span className="text-[10px] text-violet-400">Auto</span>
                          </div>
                        )}
                      </td>

                      {/* Tipo (Fijo / Variable / vacío) */}
                      <td className="px-3 py-2.5">
                        {erogacion.tipo_costo === 'fijo' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            <CheckSquare className="w-3 h-3" />
                            Fijo
                          </span>
                        ) : erogacion.tipo_costo === 'variable' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <MinusSquare className="w-3 h-3" />
                            Variable
                          </span>
                        ) : null}
                      </td>

                      {/* Categoría */}
                      <td className="px-3 py-2.5">
                        {erogacion.tipo_costo === 'fijo' && erogacion.categoria_costo_fijo_nombre ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${erogacion.categoria_costo_fijo_color}20`,
                              color: erogacion.categoria_costo_fijo_color || '#6B7280'
                            }}
                          >
                            <Tag className="w-3 h-3" />
                            {erogacion.categoria_costo_fijo_nombre}
                          </span>
                        ) : erogacion.tipo_costo === 'variable' ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            erogacion.subcategoria_variable === 'honorarios'
                              ? 'bg-orange-100 text-orange-700'
                              : erogacion.subcategoria_variable === 'insumos'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            <TrendingDown className="w-3 h-3" />
                            {erogacion.subcategoria_variable === 'honorarios'
                              ? 'Honorarios'
                              : erogacion.subcategoria_variable === 'insumos'
                              ? 'Insumos'
                              : 'Variable'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">—</span>
                        )}
                      </td>

                      {/* Monto */}
                      <td className={`px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap ${
                        erogacion.monto >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(erogacion.monto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overlay para cerrar menú */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(null)} />
      )}
    </div>
  );
}
