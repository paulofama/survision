import React, { useState, useEffect } from 'react';
import { InsumoVariable, InsumoSegmento } from '../types';

interface InsumoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (insumoData: Omit<InsumoVariable, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate?: (id: string, insumoData: Partial<InsumoVariable>) => Promise<void>;
  insumo?: InsumoVariable | null; // Si existe, es edición. Si no, es creación.
}

// Opciones para los selectores
const SEGMENTOS_OPTIONS: { value: InsumoSegmento; label: string }[] = [
  { value: 'IG En Consultorio', label: 'IG En Consultorio' },
  { value: 'IG En Quirófano', label: 'IG En Quirófano' },
  { value: 'Kit Parabulbar', label: 'Kit Parabulbar' },
  { value: 'KIT para RFG', label: 'KIT para RFG' },
  { value: 'Implante', label: 'Implantes Quirúrgicos' },
  { value: 'Re Esterilizables', label: 'Re Esterilizables' },
  { value: 'Re Esterilizable + Lavado', label: 'Re Esterilizable + Lavado' },
  { value: 'Medicamentos', label: 'Medicamentos' },
  { value: 'Descartables', label: 'Descartables' },
  { value: 'Kit De Faco', label: 'Kit De Faco' }
];

const UNIDADES_OPTIONS = [
  'Unidad', 'Unidades', 'Par', 'Litro', 'ML', 'Kg', 'Rollo', 'Resma', 
  'Paquete', 'GOTERO', 'Ampolla', 'TUBO', 'COMPRIMIDO', 'SACHET', 
  'KILO', 'UNIDAD'
];

const CONSUMO_OPTIONS = [
  'Anual', 'Por Practica', 'Por Procedimiento', 'Mensual', 'Semanal'
];

const InsumoModal: React.FC<InsumoModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onUpdate,
  insumo 
}) => {
  const isEditing = !!insumo; // Si hay insumo, estamos editando

  const [formData, setFormData] = useState({
    codigo: '',
    descripcion: '',
    segmento: '' as InsumoSegmento,
    precio_unitario: '',
    unidad: 'Unidad',
    consumo: 'Anual',
    cantidad: '1',
    activo: true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inicializar formulario - crear o editar
  useEffect(() => {
    if (isOpen) {
      if (insumo) {
        // Modo edición: cargar datos existentes
        setFormData({
          codigo: insumo.codigo || '',
          descripcion: insumo.descripcion || '',
          segmento: insumo.segmento,
          precio_unitario: insumo.precio_unitario.toString(),
          unidad: insumo.unidad || 'Unidad',
          consumo: insumo.consumo || 'Anual',
          cantidad: insumo.cantidad.toString(),
          activo: insumo.activo ?? true
        });
      } else {
        // Modo creación: formulario limpio
        setFormData({
          codigo: '',
          descripcion: '',
          segmento: '' as InsumoSegmento,
          precio_unitario: '',
          unidad: 'Unidad',
          consumo: 'Anual',
          cantidad: '1',
          activo: true
        });
      }
      setErrors({});
    }
  }, [insumo, isOpen]);

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Limpiar error del campo cuando el usuario empieza a escribir
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validaciones obligatorias
    if (!formData.codigo.trim()) {
      newErrors.codigo = 'El código es obligatorio';
    } else if (formData.codigo.length > 20) {
      newErrors.codigo = 'El código no puede tener más de 20 caracteres';
    }

    if (!formData.descripcion.trim()) {
      newErrors.descripcion = 'La descripción es obligatoria';
    } else if (formData.descripcion.length > 200) {
      newErrors.descripcion = 'La descripción no puede tener más de 200 caracteres';
    }

    if (!formData.segmento) {
      newErrors.segmento = 'El segmento es obligatorio';
    }

    // Validar precio
    const precio = parseFloat(formData.precio_unitario);
    if (!formData.precio_unitario || isNaN(precio) || precio <= 0) {
      newErrors.precio_unitario = 'El precio debe ser un número mayor a 0';
    } else if (precio > 10000000) {
      newErrors.precio_unitario = 'El precio no puede ser mayor a $10,000,000';
    }

    // Validar cantidad
    const cantidad = parseFloat(formData.cantidad);
    if (!formData.cantidad || isNaN(cantidad) || cantidad <= 0) {
      newErrors.cantidad = 'La cantidad debe ser un número mayor a 0';
    } else if (cantidad > 10000) {
      newErrors.cantidad = 'La cantidad no puede ser mayor a 10,000';
    }

    if (!formData.unidad.trim()) {
      newErrors.unidad = 'La unidad es obligatoria';
    }

    if (!formData.consumo.trim()) {
      newErrors.consumo = 'El tipo de consumo es obligatorio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const insumoData = {
        codigo: formData.codigo.trim().toUpperCase(),
        descripcion: formData.descripcion.trim().toUpperCase(),
        segmento: formData.segmento,
        precio_unitario: parseFloat(formData.precio_unitario),
        unidad: formData.unidad.trim(),
        consumo: formData.consumo.trim(),
        cantidad: parseFloat(formData.cantidad),
        activo: formData.activo
      };

      if (isEditing && insumo && onUpdate) {
        // Modo edición
        await onUpdate(insumo.id, insumoData);
      } else {
        // Modo creación
        await onSave(insumoData);
      }
      
      onClose();
    } catch (error) {
      console.error('Error al procesar insumo:', error);
      // El error se maneja en el componente padre
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // Generar código automático basado en segmento (solo para creación)
  const generateAutoCode = () => {
    if (!formData.segmento || isEditing) return;
    
    const prefixes: Record<string, string> = {
      'IG En Consultorio': 'IGC',
      'IG En Quirófano': 'IGQ',
      'Kit Parabulbar': 'KPB',
      'KIT para RFG': 'RFG',
      'Implante': 'IMP',
      'Re Esterilizables': 'REST',
      'Re Esterilizable + Lavado': 'RESTL',
      'Medicamentos': 'MED',
      'Descartables': 'DESC',
      'Kit De Faco': 'FACO'
    };
    
    const prefix = prefixes[formData.segmento] || 'GEN';
    const timestamp = Date.now().toString().slice(-6);
    const autoCode = `${prefix}${timestamp}`;
    
    handleInputChange('codigo', autoCode);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {isEditing ? 'Editar Insumo Variable' : 'Nuevo Insumo Variable'}
            </h2>
            {isEditing && insumo && (
              <p className="text-sm text-gray-600">
                ID: {insumo.id} • Creado: {new Date(insumo.created_at).toLocaleDateString('es-AR')}
              </p>
            )}
          </div>
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Info del costo actual (solo en edición) */}
        {isEditing && insumo && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-blue-800">
                <strong>Costo actual:</strong> {formatCurrency(insumo.precio_unitario * insumo.cantidad)}
              </span>
              <span className="text-blue-600">
                {insumo.cantidad} × {formatCurrency(insumo.precio_unitario)}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Código */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.codigo}
                onChange={(e) => handleInputChange('codigo', e.target.value)}
                placeholder="Ej: IGC001, MED123, etc."
                className={`flex-1 px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.codigo ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {!isEditing && (
                <button
                  type="button"
                  onClick={generateAutoCode}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                  disabled={isSubmitting || !formData.segmento}
                  title="Generar código automático"
                >
                  Auto
                </button>
              )}
            </div>
            {errors.codigo && (
              <p className="text-red-500 text-xs mt-1">{errors.codigo}</p>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción *
            </label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => handleInputChange('descripcion', e.target.value)}
              placeholder="Descripción detallada del insumo..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.descripcion ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            />
            {errors.descripcion && (
              <p className="text-red-500 text-xs mt-1">{errors.descripcion}</p>
            )}
          </div>

          {/* Segmento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Segmento *
            </label>
            <select
              value={formData.segmento}
              onChange={(e) => handleInputChange('segmento', e.target.value as InsumoSegmento)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.segmento ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            >
              <option value="">Seleccionar segmento...</option>
              {SEGMENTOS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.segmento && (
              <p className="text-red-500 text-xs mt-1">{errors.segmento}</p>
            )}
          </div>

          {/* Fila: Precio y Unidad */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio Unitario (ARS) *
              </label>
              <input
                type="number"
                value={formData.precio_unitario}
                onChange={(e) => handleInputChange('precio_unitario', e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.precio_unitario ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {errors.precio_unitario && (
                <p className="text-red-500 text-xs mt-1">{errors.precio_unitario}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unidad *
              </label>
              <select
                value={formData.unidad}
                onChange={(e) => handleInputChange('unidad', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.unidad ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              >
                {UNIDADES_OPTIONS.map((unidad) => (
                  <option key={unidad} value={unidad}>
                    {unidad}
                  </option>
                ))}
              </select>
              {errors.unidad && (
                <p className="text-red-500 text-xs mt-1">{errors.unidad}</p>
              )}
            </div>
          </div>

          {/* Fila: Cantidad y Consumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad *
              </label>
              <input
                type="number"
                value={formData.cantidad}
                onChange={(e) => handleInputChange('cantidad', e.target.value)}
                placeholder="1"
                step="0.01"
                min="0"
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.cantidad ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {errors.cantidad && (
                <p className="text-red-500 text-xs mt-1">{errors.cantidad}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Consumo *
              </label>
              <select
                value={formData.consumo}
                onChange={(e) => handleInputChange('consumo', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.consumo ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              >
                {CONSUMO_OPTIONS.map((consumo) => (
                  <option key={consumo} value={consumo}>
                    {consumo}
                  </option>
                ))}
              </select>
              {errors.consumo && (
                <p className="text-red-500 text-xs mt-1">{errors.consumo}</p>
              )}
            </div>
          </div>

          {/* Calculadora de costo (edición o creación con valores) */}
          {(formData.precio_unitario && formData.cantidad) && (
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="flex justify-between items-center text-sm">
                <span className="text-green-800">
                  <strong>
                    {isEditing ? 'Nuevo costo total:' : 'Costo total:'} 
                  </strong> {formatCurrency(
                    parseFloat(formData.precio_unitario) * parseFloat(formData.cantidad)
                  )}
                </span>
                <span className="text-green-600">
                  {formData.cantidad} × {formatCurrency(parseFloat(formData.precio_unitario) || 0)}
                </span>
              </div>
            </div>
          )}

          {/* Estado Activo */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.activo}
                onChange={(e) => handleInputChange('activo', e.target.checked)}
                className="mr-2"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-gray-700">
                Insumo activo
              </span>
            </label>
          </div>

          {/* Información de auditoría (solo en edición) */}
          {isEditing && insumo?.updated_at && (
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              Última modificación: {new Date(insumo.updated_at).toLocaleString('es-AR')}
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 
                (isEditing ? 'Actualizando...' : 'Creando...') : 
                (isEditing ? 'Actualizar Insumo' : 'Crear Insumo')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InsumoModal;
