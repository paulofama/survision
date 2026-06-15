// ============================================
// PÁGINA: Prestaciones (Catálogo de Prácticas)
// Sistema de Costos - Instituto Dr. Mercado
// Con Tipo de Cambio BCRA y columnas USD/ARS
// ============================================

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, PlusIcon, SearchIcon, EditIcon, TrashIcon,
  RefreshCwIcon, FilterIcon, TagIcon, X, Save, AlertCircle, DatabaseIcon
} from 'lucide-react';
import { usePrestaciones } from '@shared/hooks/usePrestaciones';
import { useTipoCambio, TipoCambio } from '@shared/context/TipoCambioContext';
import { TipoCambioIndicator } from '@shared/components/ui/TipoCambioIndicator';

// ============================================
// TIPOS
// ============================================

interface Prestacion {
  id: string;
  codigo: string;
  practica: string;
  agrupacion_id: string | null;
  agrupacion_nombre?: string;
  precio: number;
  moneda?: 'USD' | 'ARS';
  activa: boolean;
  observaciones?: string;
  created_at: string;
  updated_at: string;
}

interface Agrupacion {
  id: string;
  nombre: string;
  descripcion?: string;
}

const AGRUPACION_COLORS: Record<string, string> = {
  'Consultas': 'bg-blue-100 text-blue-800',
  'Cirugías': 'bg-red-100 text-red-800',
  'Estudios': 'bg-green-100 text-green-800',
  'Procedimientos': 'bg-purple-100 text-purple-800',
  'Tratamientos': 'bg-orange-100 text-orange-800',
  'Diagnóstico': 'bg-cyan-100 text-cyan-800',
  'default': 'bg-gray-100 text-gray-800'
};

// ============================================
// MODAL DE EDICIÓN DE PRECIO (Bidireccional USD/ARS)
// ============================================

const EditPrecioModal: React.FC<{
  prestacion: Prestacion;
  tipoCambio: TipoCambio | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (codigo: string, precio: number, moneda: 'USD' | 'ARS') => Promise<void>;
}> = ({ prestacion, tipoCambio, isOpen, onClose, onSave }) => {
  const [precioUSD, setPrecioUSD] = useState<string>('');
  const [precioARS, setPrecioARS] = useState<string>('');
  const [monedaGuardar, setMonedaGuardar] = useState<'USD' | 'ARS'>('USD');
  const [campoActivo, setCampoActivo] = useState<'USD' | 'ARS' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tc = tipoCambio?.compra || 1000;

  useEffect(() => {
    if (isOpen && prestacion) {
      const monedaOriginal = prestacion.moneda || 'USD';
      const precioOriginal = prestacion.precio || 0;
      
      setMonedaGuardar(monedaOriginal);
      
      if (monedaOriginal === 'USD') {
        setPrecioUSD(precioOriginal > 0 ? precioOriginal.toString() : '');
        setPrecioARS(precioOriginal > 0 ? (precioOriginal * tc).toFixed(2) : '');
      } else {
        setPrecioARS(precioOriginal > 0 ? precioOriginal.toString() : '');
        setPrecioUSD(precioOriginal > 0 ? (precioOriginal / tc).toFixed(2) : '');
      }
      
      setError(null);
      setCampoActivo(null);
    }
  }, [isOpen, prestacion, tc]);

  // Cuando cambia USD, calcular ARS
  const handleUSDChange = (value: string) => {
    setPrecioUSD(value);
    setCampoActivo('USD');
    setMonedaGuardar('USD');
    const numValue = parseFloat(value) || 0;
    if (numValue > 0 && tipoCambio) {
      setPrecioARS((numValue * tc).toFixed(2));
    } else if (value === '') {
      setPrecioARS('');
    }
  };

  // Cuando cambia ARS, calcular USD
  const handleARSChange = (value: string) => {
    setPrecioARS(value);
    setCampoActivo('ARS');
    setMonedaGuardar('ARS');
    const numValue = parseFloat(value) || 0;
    if (numValue > 0 && tipoCambio) {
      setPrecioUSD((numValue / tc).toFixed(2));
    } else if (value === '') {
      setPrecioUSD('');
    }
  };

  const handleSave = async () => {
    const precioFinal = monedaGuardar === 'USD' 
      ? parseFloat(precioUSD) 
      : parseFloat(precioARS);
    
    if (isNaN(precioFinal) || precioFinal < 0) {
      setError('Ingrese un precio válido');
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      await onSave(prestacion.codigo, precioFinal, monedaGuardar);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) handleSave();
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onKeyDown={handleKeyDown}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Editar Precio</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Info de la prestación */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Código</p>
            <p className="font-mono font-medium text-gray-900">{prestacion.codigo}</p>
            <p className="text-xs text-gray-500 mt-2 mb-1">Práctica</p>
            <p className="text-sm text-gray-700">{prestacion.practica}</p>
          </div>

          {/* Tipo de cambio */}
          {tipoCambio && (
            <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2 border border-green-200">
              <span className="text-sm text-green-700">Tipo de Cambio:</span>
              <span className="font-mono font-bold text-green-800">$ {tc.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Campo USD */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Precio en Dólares
              {campoActivo === 'USD' && <span className="ml-2 text-xs text-green-600">(editando)</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-green-600 font-medium">US$</span>
              <input
                type="number"
                value={precioUSD}
                onChange={(e) => handleUSDChange(e.target.value)}
                className={`w-full pl-14 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-right font-mono text-lg ${
                  campoActivo === 'USD' ? 'border-green-500 bg-green-50' : 'border-gray-300'
                }`}
                placeholder="0.00"
                step="0.01"
                min="0"
                autoFocus
              />
            </div>
          </div>

          {/* Separador con flecha bidireccional */}
          <div className="flex items-center justify-center">
            <div className="flex-1 border-t border-gray-200"></div>
            <span className="px-3 text-gray-400 text-lg">⇅</span>
            <div className="flex-1 border-t border-gray-200"></div>
          </div>

          {/* Campo ARS */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Precio en Pesos
              {campoActivo === 'ARS' && <span className="ml-2 text-xs text-blue-600">(editando)</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-blue-600 font-medium">$</span>
              <input
                type="number"
                value={precioARS}
                onChange={(e) => handleARSChange(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-right font-mono text-lg ${
                  campoActivo === 'ARS' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Indicador de qué se guardará */}
          <div className={`rounded-lg p-3 border ${
            monedaGuardar === 'USD' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
          }`}>
            <p className="text-xs text-gray-600 mb-1">Se guardará como:</p>
            <p className={`font-mono font-bold text-lg ${
              monedaGuardar === 'USD' ? 'text-green-800' : 'text-blue-800'
            }`}>
              {monedaGuardar === 'USD' 
                ? `US$ ${parseFloat(precioUSD || '0').toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                : `$ ${parseFloat(precioARS || '0').toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
              }
              <span className="text-sm font-normal ml-2">({monedaGuardar})</span>
            </p>
          </div>

          {/* Precio actual */}
          {prestacion.precio > 0 && (
            <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
              <span className="font-medium">Precio actual: </span>
              <span className="font-mono text-gray-700">
                {prestacion.moneda === 'ARS' ? '$ ' : 'US$ '}
                {prestacion.precio?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                <span className="text-xs ml-1">({prestacion.moneda || 'USD'})</span>
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center space-x-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 px-6 py-4 bg-gray-50 rounded-b-lg">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2">
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Guardando...</span></>
            ) : (
              <><Save className="h-4 w-4" /><span>Guardar</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PrestacionesPage: React.FC = () => {
  const {
    prestaciones = [],
    agrupaciones = [],
    loading,
    error,
    searchTerm,
    selectedAgrupacion,
    setSearchTerm,
    setSelectedAgrupacion,
    deletePrestacion,
    refetch
  } = usePrestaciones();

  // Tipo de cambio desde el context centralizado
  const { tipoCambio, loading: loadingTC, convertirARS, convertirUSD } = useTipoCambio();

  const [modalOpen, setModalOpen] = useState(false);
  const [prestacionEditar, setPrestacionEditar] = useState<Prestacion | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Helpers
  const formatCurrency = (amount: number, moneda: 'USD' | 'ARS' = 'USD'): string => {
    const prefix = moneda === 'USD' ? 'US$ ' : '$ ';
    return prefix + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  const getPrecioEnPesos = (precio: number, moneda: 'USD' | 'ARS' = 'USD'): number => {
    if (moneda === 'ARS') return precio;
    return convertirARS(precio);
  };

  const getPrecioEnUSD = (precio: number, moneda: 'USD' | 'ARS' = 'USD'): number => {
    if (moneda === 'USD') return precio;
    return convertirUSD(precio);
  };

  const getAgrupacionColor = (nombre?: string): string => AGRUPACION_COLORS[nombre || ''] || AGRUPACION_COLORS['default'];

  const showMessage = (message: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccessMessage(message); setTimeout(() => setSuccessMessage(''), 3000); }
    else { setErrorMessage(message); setTimeout(() => setErrorMessage(''), 5000); }
  };

  // Filtrado
  const prestacionesFiltradas = prestaciones.filter((p: Prestacion) => {
    const matchesSearch = p.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) || p.practica?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAgrupacion = selectedAgrupacion === '' || p.agrupacion_id === selectedAgrupacion;
    return matchesSearch && matchesAgrupacion;
  });

  // Stats
  const prestacionesConPrecio = prestaciones.filter((p: Prestacion) => p.precio > 0);
  const stats = {
    total: prestaciones.length,
    filtradas: prestacionesFiltradas.length,
    precioPromedio: prestacionesConPrecio.length > 0 ? prestacionesConPrecio.reduce((sum: number, p: Prestacion) => sum + (p.precio || 0), 0) / prestacionesConPrecio.length : 0,
    agrupaciones: agrupaciones.length
  };

  // Sync GECLISA → Supabase
  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/nomenclador/sync', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Error en sincronización');
      showMessage(`Sync completo: ${result.insertados} nuevas, ${result.actualizados} actualizadas`, 'success');
      await refetch();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Error en sincronización', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Handlers
  const abrirModalEditar = (prestacion: Prestacion) => { setPrestacionEditar(prestacion); setModalOpen(true); };
  const cerrarModal = () => { setModalOpen(false); setPrestacionEditar(null); };

  const handleSavePrecio = async (codigo: string, precio: number, moneda: 'USD' | 'ARS') => {
    try {
      const response = await fetch(`/api/nomenclador/precio/${codigo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio, moneda }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Error actualizando precio');
      showMessage(`Precio actualizado: ${formatCurrency(precio, moneda)}`, 'success');
      await refetch();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error actualizando precio';
      showMessage(errorMsg, 'error');
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePrestacion(id);
      showMessage('Prestación eliminada', 'success');
      setDeleteConfirm(null);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Error eliminando', 'error');
    }
  };

  if (error) {
    return (
      <div className="w-full h-full p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">Error cargando prestaciones</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={refetch} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Mensajes Toast */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2">
          <AlertCircle className="h-5 w-5" /><span>{errorMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div className="flex items-center space-x-3">
          <DollarSign className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Prestaciones</h1>
            <p className="text-gray-600">Gestión de prácticas médicas</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <TipoCambioIndicator size="md" showDetails={true} />
          <button onClick={handleSync} disabled={syncing || loading} className="flex items-center space-x-2 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50" title="Sincronizar nombres desde GECLISA">
            <DatabaseIcon className={`h-4 w-4 ${syncing ? 'animate-pulse text-green-600' : 'text-gray-500'}`} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
          <button onClick={refetch} disabled={loading} className="flex items-center space-x-2 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span>Actualizar</span>
          </button>
          <button className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            <PlusIcon className="h-4 w-4" /><span>Nueva</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-6 pb-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <DollarSign className="h-8 w-8 text-blue-500" />
            <div><p className="text-sm text-gray-500">Total</p><p className="text-2xl font-bold text-blue-600">{stats.total}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <FilterIcon className="h-8 w-8 text-green-500" />
            <div><p className="text-sm text-gray-500">Mostrando</p><p className="text-2xl font-bold text-green-600">{stats.filtradas}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">💵</span>
            <div><p className="text-sm text-gray-500">Promedio USD</p><p className="text-xl font-bold text-gray-900">{formatCurrency(stats.precioPromedio, 'USD')}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <TagIcon className="h-8 w-8 text-purple-500" />
            <div><p className="text-sm text-gray-500">Agrupaciones</p><p className="text-2xl font-bold text-purple-600">{stats.agrupaciones}</p></div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 mx-6 mb-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Buscar por código o nombre..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" value={selectedAgrupacion} onChange={(e) => setSelectedAgrupacion(e.target.value)}>
            <option value="">Todas las agrupaciones</option>
            {agrupaciones.map((a: Agrupacion) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <span className="text-sm text-gray-500">{prestacionesFiltradas.length} de {prestaciones.length}</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
          {loading ? (
            <div className="p-8 text-center flex-1 flex items-center justify-center">
              <div><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p className="mt-2 text-gray-600">Cargando prestaciones...</p></div>
            </div>
          ) : prestacionesFiltradas.length === 0 ? (
            <div className="p-8 text-center flex-1 flex items-center justify-center">
              <div><DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" /><h3 className="text-lg font-medium text-gray-900 mb-2">No hay prestaciones</h3></div>
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Código</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Práctica</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Agrupación</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase w-28">
                      <div className="flex items-center justify-end space-x-1"><span>💵</span><span>USD</span></div>
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
                      <div className="flex items-center justify-end space-x-1"><span>🇦🇷</span><span>ARS</span></div>
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">Estado</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">Acc.</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {prestacionesFiltradas.map((p: Prestacion) => {
                    // IMPORTANTE: Si no hay moneda definida, asumir USD (es el default en Supabase)
                    const monedaReal = p.moneda || 'USD';
                    const precioUSD = monedaReal === 'USD' ? p.precio : getPrecioEnUSD(p.precio, monedaReal);
                    const precioARS = getPrecioEnPesos(p.precio, monedaReal);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-gray-900">{p.codigo}</td>
                        <td className="px-3 py-2 text-sm text-gray-900"><div className="truncate max-w-sm" title={p.practica}>{p.practica}</div></td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {p.agrupacion_nombre ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getAgrupacionColor(p.agrupacion_nombre)}`}>{p.agrupacion_nombre}</span>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-right">
                          {p.precio > 0 && monedaReal === 'USD' ? (
                            <span className="font-mono font-medium text-green-600">US$ {p.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          ) : p.precio > 0 && precioUSD > 0 ? (
                            <span className="font-mono text-gray-400 text-xs">~US$ {precioUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-right">
                          {p.precio > 0 ? (
                            monedaReal === 'ARS' ? (
                              <span className="font-mono font-medium text-blue-600">$ {p.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                            ) : precioARS > 0 ? (
                              <span className="font-mono text-gray-600">$ {precioARS.toLocaleString('es-AR', { minimumFractionDigits: 0 })}</span>
                            ) : <span className="text-gray-300">—</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.activa ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {p.activa ? 'OK' : 'No'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button onClick={() => abrirModalEditar(p)} className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded" title="Editar precio"><EditIcon className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteConfirm(p.id)} className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded" title="Eliminar"><TrashIcon className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Editar Precio */}
      {prestacionEditar && <EditPrecioModal prestacion={prestacionEditar} tipoCambio={tipoCambio} isOpen={modalOpen} onClose={cerrarModal} onSave={handleSavePrecio} />}

      {/* Modal Confirmar Eliminación */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirmar eliminación</h3>
            <p className="text-gray-600 mb-6">¿Estás seguro de eliminar esta prestación?</p>
            <div className="flex space-x-3">
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">Eliminar</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrestacionesPage;
