// ============================================
// MODAL INSUMO VARIABLE FUNCIONAL
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect } from 'react';
import { XIcon, SaveIcon, PlusIcon, EditIcon, PackageIcon } from 'lucide-react';

// ============================================
// TIPOS LOCALES SIMPLIFICADOS
// ============================================

interface InsumoVariableData {
  id?: string;
  codigo: string;
  descripcion: string;
  segmento: string;
  precio_unitario: number;
  unidad: string;
  consumo: string;
  cantidad: number;
  activo?: boolean;
}

interface InsumoModalProps {
  isOpen: boolean;
  onClose: () => void;
  insumo?: InsumoVariableData | null;
  onSubmit: (data: any) => Promise<void>;
  onUpdate?: (id: string, data: any) => Promise<void>;
}

// ============================================
// SEGMENTOS DISPONIBLES
// ============================================

const SEGMENTOS = [
  'Insumos Generales En Consultorio',
  'Insumos Generales En Quirófano',
  'Kit Parabulbar',
  'Kit Para RFG',
  'Implantes Quirúrgicos',
  'Re Esterilizable Catarata',
  'Re Esterilizable Retina',
  'Re Esterilizable + Lavado',
  'Kit Sedación'
];

const UNIDADES = [
  'UNIDAD',
  'ML',
  'KG',
  'GR',
  'CM',
  'UN',
  'Rollo',
  'Resma',
  'Ampolla',
  'Frasco'
];

const CONSUMOS = [
  'Anual',
  'Por Practica',
  'Mensual',
  'Trimestral',
  'Semestral',
  'Por Procedimiento',
  'Diario'
];

// ============================================
// COMPONENTE MODAL
// ============================================

const InsumoModal: React.FC<InsumoModalProps> = ({
  isOpen,
  onClose,
  insumo = null,
  onSubmit,
  onUpdate
}) => {
  // Determinar modo
  const isEditMode = insumo !== null;

  // Estados del formulario
  const [formData, setFormData] = useState({
    codigo: '',
    descripcion: '',
    segmento: '',
    precio_unitario: 0,
    unidad: '',
    consumo: '',
    cantidad: 0
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [costoTotal, setCostoTotal] = useState(0);

  // ============================================
  // EFECTOS
  // ============================================

  // Cargar datos cuando cambia el insumo
  useEffect(() => {
    if (isEditMode && insumo) {
      setFormData({
        codigo: insumo.codigo || '',
        descripcion: insumo.descripcion || '',
        segmento: insumo.segmento || '',
        precio_unitario: insumo.precio_unitario || 0,
        unidad: insumo.unidad || '',
        consumo: insumo.consumo || '',
        cantidad: insumo.cantidad || 0
      });
    } else {
      // Limpiar formulario
      setFormData({
        codigo: '',
        descripcion: '',
        segmento: '',
        precio_unitario: 0,
        unidad: 'UNIDAD',
        consumo: 'Por Practica',
        cantidad: 1
      });
    }
    setErrors({});
  }, [isEditMode, insumo]);

  // Calcular costo total
  useEffect(() => {
    const total = formData.precio_unitario * formData.cantidad;
    setCostoTotal(total);
  }, [formData.precio_unitario, formData.cantidad]);

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
    } else if (formData.codigo.length > 20) {
      newErrors.codigo = 'Código máximo 20 caracteres';
    }

    if (!formData.descripcion.trim()) {
      newErrors.descripcion = 'Descripción es requerida';
    } else if (formData.descripcion.length > 200) {
      newErrors.descripcion = 'Descripción máximo 200 caracteres';
    }

    if (!formData.segmento) {
      newErrors.segmento = 'Segmento es requerido';
    }

    if (formData.precio_unitario < 0) {
      newErrors.precio_unitario = 'Precio debe ser mayor o igual a 0';
    }

    if (formData.cantidad <= 0) {
      newErrors.cantidad = 'Cantidad debe ser mayor a 0';
    }

    if (!formData.unidad.trim()) {
      newErrors.unidad = 'Unidad es requerida';
    }

    if (!formData.consumo.trim()) {
      newErrors.consumo = 'Consumo es requerido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const generateAutoCode = () => {
    if (!formData.segmento) return;

    const prefijos: Record<string, string> = {
      'Insumos Generales En Consultorio': '40',
      'Insumos Generales En Quirófano': '41',
      'Kit Parabulbar': '10',
      'Kit Para RFG': '20',
      'Implantes Quirúrgicos': '20',
      'Re Esterilizable Catarata': '30',
      'Re Esterilizable Retina': '31',
      'Re Esterilizable + Lavado': '32',
      'Kit Sedación': '10'
    };

    const prefijo = prefijos[formData.segmento] || '99';
    const numero = Math.floor(Math.random() * 900) + 100;
    const codigo = `${prefijo}${numero}`;
    
    handleChange('codigo', codigo);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const data = {
        codigo: formData.codigo.toUpperCase(),
        descripcion: formData.descripcion.toUpperCase(),
        segmento: formData.segmento,
        precio_unitario: Number(formData.precio_unitario),
        unidad: formData.unidad.toUpperCase(),
        consumo: formData.consumo,
        cantidad: Number(formData.cantidad),
        activo: true
      };

      if (isEditMode && insumo && onUpdate) {
        await onUpdate(insumo.id!, data);
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
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {isEditMode ? (
              <>
                <EditIcon className="h-6 w-6 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Editar Insumo Variable</h2>
              </>
            ) : (
              <>
                <PlusIcon className="h-6 w-6 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Nuevo Insumo Variable</h2>
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

        {/* Información de insumo en modo edición */}
        {isEditMode && insumo && (
          <div className="bg-green-50 border-b border-green-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-800">
                  <span className="font-medium">Editando:</span> {insumo.descripcion}
                </p>
                <p className="text-xs text-green-600">
                  Código: {insumo.codigo} | Segmento: {insumo.segmento}
                </p>
              </div>
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                Modo Edición
              </span>
            </div>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
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
                  className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 uppercase ${
                    errors.codigo ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="40101"
                  maxLength={20}
                  disabled={loading}
                />
                {!isEditMode && (
                  <button
                    type="button"
                    onClick={generateAutoCode}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    disabled={loading || !formData.segmento}
                  >
                    Auto
                  </button>
                )}
              </div>
              {errors.codigo && (
                <p className="mt-1 text-sm text-red-600">{errors.codigo}</p>
              )}
            </div>

            {/* Segmento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Segmento <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.segmento}
                onChange={(e) => handleChange('segmento', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.segmento ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              >
                <option value="">Seleccionar segmento...</option>
                {SEGMENTOS.map((segmento) => (
                  <option key={segmento} value={segmento}>
                    {segmento}
                  </option>
                ))}
              </select>
              {errors.segmento && (
                <p className="mt-1 text-sm text-red-600">{errors.segmento}</p>
              )}
            </div>

            {/* Unidad */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unidad <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.unidad}
                onChange={(e) => handleChange('unidad', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.unidad ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              >
                {UNIDADES.map((unidad) => (
                  <option key={unidad} value={unidad}>
                    {unidad}
                  </option>
                ))}
              </select>
              {errors.unidad && (
                <p className="mt-1 text-sm text-red-600">{errors.unidad}</p>
              )}
            </div>

            {/* Descripción */}
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => handleChange('descripcion', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 uppercase ${
                  errors.descripcion ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="DESCRIPCIÓN DEL INSUMO MÉDICO"
                maxLength={200}
                disabled={loading}
              />
              {errors.descripcion && (
                <p className="mt-1 text-sm text-red-600">{errors.descripcion}</p>
              )}
            </div>

            {/* Precio Unitario */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio Unitario (ARS) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={formData.precio_unitario}
                  onChange={(e) => handleChange('precio_unitario', Number(e.target.value))}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    errors.precio_unitario ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  min="0"
                  disabled={loading}
                />
              </div>
              {errors.precio_unitario && (
                <p className="mt-1 text-sm text-red-600">{errors.precio_unitario}</p>
              )}
            </div>

            {/* Cantidad */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cantidad <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.cantidad}
                onChange={(e) => handleChange('cantidad', Number(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.cantidad ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="1"
                min="0.01"
                disabled={loading}
              />
              {errors.cantidad && (
                <p className="mt-1 text-sm text-red-600">{errors.cantidad}</p>
              )}
            </div>

            {/* Consumo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Consumo <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.consumo}
                onChange={(e) => handleChange('consumo', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.consumo ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={loading}
              >
                {CONSUMOS.map((consumo) => (
                  <option key={consumo} value={consumo}>
                    {consumo}
                  </option>
                ))}
              </select>
              {errors.consumo && (
                <p className="mt-1 text-sm text-red-600">{errors.consumo}</p>
              )}
            </div>

            {/* Costo Total Calculado */}
            {(formData.precio_unitario > 0 || formData.cantidad > 0) && (
              <div className="md:col-span-3">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Costo Total:</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(costoTotal)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.precio_unitario.toLocaleString()} × {formData.cantidad.toLocaleString()} = {costoTotal.toLocaleString()}
                  </p>
                </div>
              </div>
            )}
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
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{isEditMode ? 'Actualizando...' : 'Guardando...'}</span>
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  <span>{isEditMode ? 'Actualizar Insumo' : 'Guardar Insumo'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InsumoModal;