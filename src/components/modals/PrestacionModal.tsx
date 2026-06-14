// ============================================
// MODAL PRESTACIÓN FUNCIONAL
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect } from 'react';
import { XIcon, SaveIcon, PlusIcon, EditIcon } from 'lucide-react';

// ============================================
// TIPOS LOCALES SIMPLIFICADOS
// ============================================

interface Agrupacion {
  id: string;
  nombre: string;
  activa: boolean;
  orden: number;
}

interface PrestacionData {
  id?: string;
  codigo: string;
  practica: string;
  agrupacion_id: string;
  precio: number;
  observaciones?: string;
  activa?: boolean;
}

interface PrestacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agrupaciones: Agrupacion[];
  prestacion?: PrestacionData | null;
  onSubmit: (data: any) => Promise<void>;
  onUpdate?: (id: string, data: any) => Promise<void>;
}

// ============================================
// COMPONENTE MODAL
// ============================================

const PrestacionModal: React.FC<PrestacionModalProps> = ({
  isOpen,
  onClose,
  agrupaciones = [],
  prestacion = null,
  onSubmit,
  onUpdate
}) => {
  // Determinar modo
  const isEditMode = prestacion !== null;

  // Estados del formulario
  const [formData, setFormData] = useState({
    codigo: '',
    practica: '',
    agrupacion_id: '',
    precio: 0,
    observaciones: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar datos cuando cambia la prestación
  useEffect(() => {
    if (isEditMode && prestacion) {
      setFormData({
        codigo: prestacion.codigo || '',
        practica: prestacion.practica || '',
        agrupacion_id: prestacion.agrupacion_id || '',
        precio: prestacion.precio || 0,
        observaciones: prestacion.observaciones || ''
      });
    } else {
      // Limpiar formulario
      setFormData({
        codigo: '',
        practica: '',
        agrupacion_id: '',
        precio: 0,
        observaciones: ''
      });
    }
    setErrors({});
  }, [isEditMode, prestacion]);

  // ============================================
  // FUNCIONES
  // ============================================

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Limpiar error del campo
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.codigo.trim()) {
      newErrors.codigo = 'Código es requerido';
    }

    if (!formData.practica.trim()) {
      newErrors.practica = 'Práctica es requerida';
    }

    if (!formData.agrupacion_id) {
      newErrors.agrupacion_id = 'Agrupación es requerida';
    }

    if (formData.precio < 0) {
      newErrors.precio = 'Precio debe ser mayor o igual a 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const generateAutoCode = () => {
    if (!formData.agrupacion_id) return;

    const agrupacion = agrupaciones.find(a => a.id === formData.agrupacion_id);
    if (!agrupacion) return;

    const prefijos: Record<string, string> = {
      'Consultas / Guardia': '010',
      'Controles': '011',
      'Fondo de Ojos': '012',
      'Estudios Diagnósticos': '020',
      'Retina': '030',
      'Córnea': '031',
      'Catarata': '032',
      'Glaucoma': '033',
      'Párpados': '034'
    };

    const prefijo = prefijos[agrupacion.nombre] || '999';
    const numero = Math.floor(Math.random() * 900) + 100;
    const codigo = `${prefijo}${numero}`;
    
    handleChange('codigo', codigo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const data = {
        codigo: formData.codigo.toUpperCase(),
        practica: formData.practica.toUpperCase(),
        agrupacion_id: formData.agrupacion_id,
        precio: Number(formData.precio),
        observaciones: formData.observaciones?.toUpperCase() || undefined,
        activa: true
      };

      if (isEditMode && prestacion && onUpdate) {
        await onUpdate(prestacion.id!, data);
      } else {
        await onSubmit(data);
      }

      onClose();
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {isEditMode ? (
              <>
                <EditIcon className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Editar Prestación</h2>
              </>
            ) : (
              <>
                <PlusIcon className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Nueva Prestación</h2>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Información de prestación en modo edición */}
        {isEditMode && prestacion && (
          <div className="bg-blue-50 border-b border-blue-200 p-4">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Editando:</span> {prestacion.practica}
            </p>
            <p className="text-xs text-blue-600">Código: {prestacion.codigo}</p>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Código */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Código <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={formData.codigo}
                  onChange={(e) => handleChange('codigo', e.target.value)}
                  className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase ${
                    errors.codigo ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="010101"
                  maxLength={20}
                  disabled={loading}
                />
                {!isEditMode && (
                  <button
                    type="button"
                    onClick={generateAutoCode}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    disabled={loading || !formData.agrupacion_id}
                  >
                    Auto
                  </button>
                )}
              </div>
              {errors.codigo && (
                <p className="mt-1 text-sm text-red-600">{errors.codigo}</p>
              )}
            </div>

            {/* Agrupación */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agrupación <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.agrupacion_id}
                onChange={(e) => handleChange('agrupacion_id', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.agrupacion_id ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              >
                <option value="">Seleccionar agrupación...</option>
                {agrupaciones
                  .filter(a => a.activa)
                  .sort((a, b) => a.orden - b.orden)
                  .map((agrupacion) => (
                    <option key={agrupacion.id} value={agrupacion.id}>
                      {agrupacion.nombre}
                    </option>
                  ))
                }
              </select>
              {errors.agrupacion_id && (
                <p className="mt-1 text-sm text-red-600">{errors.agrupacion_id}</p>
              )}
            </div>

            {/* Práctica */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Práctica <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.practica}
                onChange={(e) => handleChange('practica', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase ${
                  errors.practica ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="DESCRIPCIÓN DE LA PRÁCTICA MÉDICA"
                maxLength={200}
                disabled={loading}
              />
              {errors.practica && (
                <p className="mt-1 text-sm text-red-600">{errors.practica}</p>
              )}
            </div>

            {/* Precio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio (USD) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.precio}
                  onChange={(e) => handleChange('precio', Number(e.target.value))}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.precio ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  min="0"
                  disabled={loading}
                />
              </div>
              {errors.precio && (
                <p className="mt-1 text-sm text-red-600">{errors.precio}</p>
              )}
            </div>

            {/* Espacio vacío */}
            <div></div>

            {/* Observaciones */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observaciones
              </label>
              <textarea
                value={formData.observaciones}
                onChange={(e) => handleChange('observaciones', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase border-gray-300"
                placeholder="OBSERVACIONES ADICIONALES (OPCIONAL)"
                maxLength={500}
                disabled={loading}
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{isEditMode ? 'Actualizando...' : 'Guardando...'}</span>
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  <span>{isEditMode ? 'Actualizar' : 'Guardar'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PrestacionModal;