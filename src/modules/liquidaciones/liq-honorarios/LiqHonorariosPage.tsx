// ============================================================
// PAGE: Liquidación de Honorarios
// Página principal con 3 tabs: Nueva, Lista, Reporte
// ============================================================

import { useState, useCallback } from 'react';
import { FileText, List, FileCheck, Plus } from 'lucide-react';
import { useLiqHonorarios } from './useLiqHonorarios';
import { LiqHonorariosForm } from './LiqHonorariosForm';
import { LiqHonorariosList } from './LiqHonorariosList';
import { LiqHonorariosReport } from './LiqHonorariosReport';
import type { LiqHonorarioConPrestador } from './types';

type TabId = 'form' | 'list' | 'report';

export default function LiqHonorariosPage() {
  const [activeTab, setActiveTab] = useState<TabId>('form');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportLiq, setReportLiq] = useState<LiqHonorarioConPrestador | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const {
    liquidaciones,
    prestadores,
    loading,
    error,
    stats,
    guardar,
    eliminar,
    getById,
    reload,
  } = useLiqHonorarios();

  // ─── Toast notifications ──────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 5000 : 3000);
  }, []);

  // ─── Handlers ─────────────────────────────────────────
  const handleEdit = useCallback(
    (id: string) => {
      setEditingId(id);
      setActiveTab('form');
      const liq = getById(id);
      if (liq) showToast(`Editando liquidación de ${liq.prestador_nombre}`, 'info');
    },
    [getById, showToast]
  );

  const handleViewReport = useCallback(
    (id: string) => {
      const liq = getById(id);
      if (liq) {
        setReportLiq(liq);
        setActiveTab('report');
      }
    },
    [getById]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const liq = getById(id);
      const nombre = liq?.prestador_nombre || 'desconocido';
      if (!window.confirm(`¿Está seguro que desea eliminar la liquidación de ${nombre}?\n\nEsta acción no se puede deshacer.`)) {
        return;
      }
      const result = await eliminar(id);
      showToast(result.message, result.success ? 'success' : 'error');

      // Si estaba editando esa misma, limpiar
      if (editingId === id) {
        setEditingId(null);
        setActiveTab('list');
      }
      // Si estaba viendo su reporte, volver a lista
      if (reportLiq?.id === id) {
        setReportLiq(null);
        setActiveTab('list');
      }
    },
    [eliminar, editingId, reportLiq, getById, showToast]
  );

  const handleSaved = useCallback(
    (message: string) => {
      showToast(message, 'success');
      setEditingId(null);
      setActiveTab('list');
    },
    [showToast]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    showToast('Edición cancelada', 'info');
  }, [showToast]);

  const handleNewLiq = useCallback(() => {
    setEditingId(null);
    setActiveTab('form');
  }, []);

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Institucional */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold tracking-wide">INSTITUTO DR. MERCADO</h1>
          <p className="text-blue-200 text-sm mt-0.5">Survisión S.A.</p>
          <h2 className="text-lg font-medium mt-2 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Sistema de Liquidación de Prestadores
          </h2>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}</span>
            {toast.message}
          </div>
        </div>
      )}

      {/* Contenido Principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {/* Error global */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-white rounded-lg p-1 shadow-sm border border-gray-200">
          <button
            onClick={handleNewLiq}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'form'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {editingId ? (
              <>
                <FileText className="w-4 h-4" />
                ✏️ Editando Liquidación
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Nueva Liquidación
              </>
            )}
          </button>

          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <List className="w-4 h-4" />
            Liquidaciones ({stats.count})
          </button>

          {reportLiq && (
            <button
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'report'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              Ver Reporte
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'form' && (
          <LiqHonorariosForm
            prestadores={prestadores}
            editingLiq={editingId ? getById(editingId) : undefined}
            onSave={guardar}
            onSaved={handleSaved}
            onCancelEdit={handleCancelEdit}
            showToast={showToast}
          />
        )}

        {activeTab === 'list' && (
          <LiqHonorariosList
            liquidaciones={liquidaciones}
            loading={loading}
            stats={stats}
            onEdit={handleEdit}
            onViewReport={handleViewReport}
            onDelete={handleDelete}
            onNew={handleNewLiq}
          />
        )}

        {activeTab === 'report' && reportLiq && (
          <LiqHonorariosReport liquidacion={reportLiq} />
        )}
      </div>
    </div>
  );
}
