// ============================================
// MODAL PRESTACIÓN - CREAR Y EDITAR UNIFICADO
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useEffect } from 'react';
import { XIcon, SaveIcon, DollarSignIcon, EditIcon, PlusIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Agrupacion, NuevaPrestacion, PrestacionConAgrupacion } from '../../types';

// ============================================
// VALIDACIÓN CON ZOD
// ============================================

const esquemaPrestacion = z.object({
  codigo: z
    .string()
    .min(1, 'Código es requerido')
    .max(20, 'Código máximo 20 caracteres')
    .regex(/^[A-Z0-9]+$/, 'Solo letras mayúsculas y números'),
  practica: z
    .string()
    .min(1, 'Práctica es requerida')
    .max(200, 'Práctica máximo 200 caracteres'),
  agrupacion_id: z
    .string()
    .min(1, 'Agrupación es requerida'),
  precio: z
    .number()
    .min(0, 'Precio debe ser mayor o igual a 0')
    .max(10000000, 'Precio máximo $10,000,000'),
  observaciones: z
    .string()
    .max(500, 'Observaciones máximo 500 caracteres')
    .optional(),
});

type FormData = z.infer<typeof esquemaPrestacion>;

// ============================================
// INTERFAZ DEL COMPONENTE
// ============================================

interface PrestacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agrupaciones: Agrupacion[];
  prestacion?: PrestacionConAgrupacion | null; // Si existe, es modo edición
  onSubmit: (data: NuevaPrestacion) => Promise<void>;
  onUpdate?: (id: string, data: Partial<PrestacionConAgrupacion>) => Promise<void>;
  loading?: boolean;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const PrestacionModal: React.FC<PrestacionModalProps> = ({
  isOpen,
  onClose,
  agrupaciones,
  prestacion = null, // null = crear, objeto = editar
  onSubmit,
  onUpdate,
  loading = false
}) => {
  // Determinar modo
  const isEditMode = prestacion !== null;
  
  // Estados locales
  const [submitting, setSubmitting] = useState(false);
  const [previewPrecio, setPreviewPrecio] = useState(0);

  // Configuración del formulario
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset
  } = useForm<FormData>({
    resolver: zodResolver(esquemaPrestacion),
    defaultValues: {
      codigo: '',
      practica: '',
      agrupacion_id: '',
      precio: 0,
      observaciones: ''
    }
  });

  // Observar cambios en precio para preview
  const precioActual = watch('precio');
  useEffect(() => {
    setPreviewPrecio(precioActual || 0);
  }, [precioActual]);

  // ============================================
  // EFECTO PARA CARGAR DATOS EN MODO EDICIÓN
  // ============================================

  useEffect(() => {
    if (isEditMode && prestacion) {
      // Precargar datos de la prestación
      setValue('codigo', prestacion.codigo);
      setValue('practica', prestacion.practica);
      setValue('agrupacion_id', prestacion.agrupacion_id || '');
      setValue('precio', prestacion.precio);
      setValue('observaciones', prestacion.observaciones || '');
      setPreviewPrecio(prestacion.precio);
    } else {
      // Limpiar formulario en modo crear
      reset({
        codigo: '',
        practica: '',
        agrupacion_id: '',
        precio: 0,
        observaciones: ''
      });
      setPreviewPrecio(0);
    }
  }, [isEditMode, prestacion, setValue, reset]);

  // ============================================
  // FUNCIONES DEL FORMULARIO
  // ============================================

  /**
   * Manejar envío del formulario (crear o editar)
   */
  const handleFormSubmit = async (data: FormData) => {
    try {
      setSubmitting(true);
      
      if (isEditMode && prestacion && onUpdate) {
        // Modo edición - actualizar prestación existente
        const datosActualizados = {
          codigo: data.codigo.toUpperCase(),
          practica: data.practica.toUpperCase(),
          agrupacion_id: data.agrupacion_id,
          precio: data.precio,
          observaciones: data.observaciones?.toUpperCase() || undefined,
        };

        await onUpdate(prestacion.id, datosActualizados);
      } else {
        // Modo creación - crear nueva prestación
        const nuevaPrestacion: NuevaPrestacion = {
          codigo: data.codigo.toUpperCase(),
          practica: data.practica.toUpperCase(),
          agrupacion_id: data.agrupacion_id,
          precio: data.precio,
          observaciones: data.observaciones?.toUpperCase() || undefined,
          activa: true
        };

        await onSubmit(nuevaPrestacion);
      }
      
      // Limpiar formulario y cerrar
      reset();
      setPreviewPrecio(0);
      onClose();
      
    } catch (error) {
      console.error('Error procesando prestación:', error);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Generar código automático basado en agrupación
   */
  const generarCodigoAutomatico = () => {
    const agrupacionId = watch('agrupacion_id');
    if (!agrupacionId) return;

    const agrupacion = agrupaciones.find(a => a.id === agrupacionId);
    if (!agrupacion) return;

    // Generar código basado en el nombre de la agrupación
    const prefijos: Record<string, string> = {
      'Consultas / Guardia': '010',
      'Controles': '011',
      'Fondo de Ojos': '012',
      'Estudios Diagnósticos': '020',
      'Retina': '030',
      'Córnea': '031',
      'Catarata': '032',
      'Glaucoma': '033',
      'Párpados': '034',
      'Órbita': '035',
      'Vías Lagrimales': '036',
      'Trauma': '037',
      'Conjuntiva': '038',
    };

    const prefijo = prefijos[agrupacion.nombre] || '999';
    const numeroAleatorio = Math.floor(Math.random() * 900) + 100;
    const codigoGenerado = `${prefijo}${numeroAleatorio}`;
    
    setValue('codigo', codigoGenerado);
  };

  /**
   * Formatear precio en tiempo real
   */
  const formatearPrecio = (valor: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(valor);
  };

  // ============================================
  // CERRAR MODAL
  // ============================================

  const cerrarModal = () => {
    if (!submitting) {
      reset();
      setPreviewPrecio(0);
      onClose();
    }
  };

  // ============================================
  // RENDER CONDICIONAL
  // ============================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
        {/* Header del Modal */}
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
            onClick={cerrarModal}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Información de prestación en modo edición */}
        {isEditMode && prestacion && (
          <div className="bg-blue-50 border-b border-blue-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Editando:</span> {prestacion.practica}
                </p>
                <p className="text-xs text-blue-600">
                  Código: {prestacion.codigo} | Agrupación: {prestacion.agrupacion_nombre}
                </p>
              </div>
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                Modo Edición
              </span>
            </div>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Código */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Código <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  {...register('codigo')}
                  className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase ${
                    errors.codigo ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="010101"
                  maxLength={20}
                  disabled={submitting}
                />
                {!isEditMode && (
                  <button
                    type="button"
                    onClick={generarCodigoAutomatico}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                    disabled={submitting}
                  >
                    Auto
                  </button>
                )}
              </div>
              {errors.codigo && (
                <p className="mt-1 text-sm text-red-600">{errors.codigo.message}</p>
              )}
            </div>

            {/* Agrupación */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agrupación <span className="text-red-500">*</span>
              </label>
              <select
                {...register('agrupacion_id')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.agrupacion_id ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={submitting}
              >
                <option value="">Seleccionar agrupación...</option>
                {agrupaciones
                  .filter(agrupacion => agrupacion.activa)
                  .sort((a, b) => a.orden - b.orden)
                  .map((agrupacion) => (
                    <option key={agrupacion.id} value={agrupacion.id}>
                      {agrupacion.nombre}
                    </option>
                  ))
                }
              </select>
              {errors.agrupacion_id && (
                <p className="mt-1 text-sm text-red-600">{errors.agrupacion_id.message}</p>
              )}
            </div>

            {/* Práctica */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Práctica <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('practica')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase ${
                  errors.practica ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="DESCRIPCIÓN DE LA PRÁCTICA MÉDICA"
                maxLength={200}
                disabled={submitting}
              />
              {errors.practica && (
                <p className="mt-1 text-sm text-red-600">{errors.practica.message}</p>
              )}
            </div>

            {/* Precio */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio (USD) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  {...register('precio', { valueAsNumber: true })}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.precio ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                  min="0"
                  max="10000000"
                  disabled={submitting}
                />
              </div>
              {errors.precio && (
                <p className="mt-1 text-sm text-red-600">{errors.precio.message}</p>
              )}
              
              {/* Preview del precio */}
              {previewPrecio > 0 && (
                <p className="mt-1 text-sm text-blue-600 font-medium">
                  Preview: {formatearPrecio(previewPrecio)}
                </p>
              )}
            </div>

            {/* Estado (solo en modo edición) */}
            {isEditMode && prestacion && (
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estado
                </label>
                <div className="pt-2">
                  <span className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium ${
                    prestacion.activa 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {prestacion.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>
            )}

            {/* Observaciones */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observaciones
              </label>
              <textarea
                {...register('observaciones')}
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase ${
                  errors.observaciones ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="OBSERVACIONES ADICIONALES (OPCIONAL)"
                maxLength={500}
                disabled={submitting}
              />
              {errors.observaciones && (
                <p className="mt-1 text-sm text-red-600">{errors.observaciones.message}</p>
              )}
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={cerrarModal}
              disabled={submitting}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{isEditMode ? 'Actualizando...' : 'Guardando...'}</span>
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  <span>{isEditMode ? 'Actualizar Prestación' : 'Guardar Prestación'}</span>
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