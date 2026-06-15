// ===========================================================================
// PAGE: EmpleadoFormPage - MODULO CARGA DE SUELDOS
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Formulario alta / edicion de empleados.
//
// Rutas (definidas en App.tsx):
//   /sueldos/empleados/nuevo     -> modo crear
//   /sueldos/empleados/:id       -> modo editar
//
// Validaciones (Zod):
//  - apellido y nombre obligatorios
//  - CUIL formato XX-XXXXXXXX-X con digito verificador valido
//  - numero documento solo digitos
//  - fechas coherentes: nacimiento < ingreso <= hoy; egreso >= ingreso
//  - email valido si se completa
//  - CBU 22 digitos si se completa
//  - cuenta_contable obligatoria (se autocompleta segun area)
//  - CUIL unico: chequeo via hook al guardar (devuelve error si duplicado)
//
// La gestion de estado (alta/baja) se hace desde el listado, NO desde el form.
// El form siempre crea como "activo" y al editar muestra el estado solo lectura.
// ===========================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  User,
  Briefcase,
  Phone,
  CreditCard,
  Shield,
  UserCheck,
  UserMinus,
} from 'lucide-react';

import { useEmpleados } from '../hooks/useEmpleados';
import { usePlanCuentas } from '../hooks/usePlanCuentas';
import {
  AREAS_EMPLEADO,
  MODALIDADES_CONTRATACION,
  TIPOS_DOCUMENTO,
  type AreaEmpleado,
  type CondicionGanancias,
  type EmpleadoNuevo,
  type ModalidadContratacion,
  type SexoEmpleado,
  type TipoDocumento,
} from '../types/sueldos';
import {
  AREA_A_CUENTA_DEFAULT,
  LABEL_ESTADO_EMPLEADO,
  cuentaDefaultPorArea,
} from '../utils/constantes';

// ---------------------------------------------------------------------------
// VALIDADOR DE CUIL (algoritmo oficial AFIP)
// ---------------------------------------------------------------------------

/** Acepta XX-XXXXXXXX-X o 11 digitos pegados. Retorna true si el verificador cuadra. */
export function cuilValido(raw: string): boolean {
  if (!raw) return false;
  const d = raw.replace(/\D+/g, '');
  if (d.length !== 11) return false;

  const prefijo = d.substring(0, 2);
  const prefijosValidos = ['20', '23', '24', '27', '30', '33', '34'];
  if (!prefijosValidos.includes(prefijo)) return false;

  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(d[i]!, 10) * mult[i]!;
  }
  const mod = suma % 11;
  let verificador: number;
  if (mod === 0) verificador = 0;
  else if (mod === 1) verificador = 9; // convencion AFIP para caso borde
  else verificador = 11 - mod;

  return verificador === parseInt(d[10]!, 10);
}

/** Formatea 11 digitos a XX-XXXXXXXX-X. Si la entrada no tiene 11 digitos, la devuelve sin cambios. */
function formatearCuil(raw: string): string {
  const d = raw.replace(/\D+/g, '');
  if (d.length !== 11) return raw;
  return `${d.substring(0, 2)}-${d.substring(2, 10)}-${d.substring(10)}`;
}

// ---------------------------------------------------------------------------
// ESQUEMA ZOD
// ---------------------------------------------------------------------------

const HOY_ISO = new Date().toISOString().substring(0, 10);

const empleadoSchema = z
  .object({
    apellido: z.string().min(1, 'Apellido es requerido').max(80),
    nombre: z.string().min(1, 'Nombre es requerido').max(80),
    cuil: z
      .string()
      .min(1, 'CUIL es requerido')
      .refine(cuilValido, 'CUIL invalido (verificar digito verificador)'),
    tipo_documento: z.enum(['DNI', 'LE', 'LC', 'PASAPORTE', 'CI']),
    numero_documento: z
      .string()
      .min(1, 'Numero de documento requerido')
      .max(20)
      .regex(/^[A-Z0-9]+$/i, 'Solo letras y numeros'),
    fecha_nacimiento: z
      .string()
      .min(1, 'Fecha de nacimiento requerida')
      .refine((v) => v >= '1900-01-01' && v <= HOY_ISO, 'Fecha de nacimiento invalida'),
    sexo: z.enum(['M', 'F']),

    fecha_ingreso: z
      .string()
      .min(1, 'Fecha de ingreso requerida')
      .refine((v) => v <= HOY_ISO, 'No puede ser posterior a hoy'),
    fecha_egreso: z.string().optional().or(z.literal('')),

    area: z.enum([
      'Administración',
      'Cajera',
      'Limpieza',
      'Medición',
      'Recepción',
      'Telefonista',
      'Cirugías',
    ]),
    cuenta_contable: z.string().min(1, 'Cuenta contable requerida'),
    categoria: z.string().max(80).optional().or(z.literal('')),
    convenio: z.string().max(80).optional().or(z.literal('')),
    modalidad_contratacion: z
      .enum([
        'LCT por tiempo indeterminado',
        'LCT plazo fijo',
        'LCT eventual',
        'LCT a tiempo parcial',
      ])
      .optional()
      .or(z.literal('')),

    domicilio: z.string().max(200).optional().or(z.literal('')),
    telefono: z.string().max(40).optional().or(z.literal('')),
    email: z
      .string()
      .email('Email invalido')
      .max(120)
      .optional()
      .or(z.literal('')),

    banco: z.string().max(80).optional().or(z.literal('')),
    cbu: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine(
        (v) => !v || /^\d{22}$/.test(v.replace(/\D+/g, '')),
        'CBU debe tener 22 digitos'
      ),
    cuenta_sueldo_nro: z.string().max(40).optional().or(z.literal('')),

    obra_social: z.string().max(120).optional().or(z.literal('')),
    art_asignada: z.string().max(120).optional().or(z.literal('')),
    condicion_ganancias: z
      .enum(['Sujeto a retención', 'No alcanzado'])
      .optional()
      .or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // fecha_egreso debe ser >= fecha_ingreso
    if (data.fecha_egreso && data.fecha_ingreso && data.fecha_egreso < data.fecha_ingreso) {
      ctx.addIssue({
        path: ['fecha_egreso'],
        code: z.ZodIssueCode.custom,
        message: 'Egreso debe ser posterior o igual al ingreso',
      });
    }
    // nacimiento debe ser anterior al ingreso
    if (data.fecha_nacimiento && data.fecha_ingreso && data.fecha_nacimiento >= data.fecha_ingreso) {
      ctx.addIssue({
        path: ['fecha_nacimiento'],
        code: z.ZodIssueCode.custom,
        message: 'Nacimiento debe ser anterior al ingreso',
      });
    }
  });

type EmpleadoForm = z.infer<typeof empleadoSchema>;

const DEFAULT_VALUES: EmpleadoForm = {
  apellido: '',
  nombre: '',
  cuil: '',
  tipo_documento: 'DNI',
  numero_documento: '',
  fecha_nacimiento: '',
  sexo: 'M',
  fecha_ingreso: HOY_ISO,
  fecha_egreso: '',
  area: 'Administración',
  cuenta_contable: AREA_A_CUENTA_DEFAULT['Administración'],
  categoria: '',
  convenio: '',
  modalidad_contratacion: 'LCT por tiempo indeterminado',
  domicilio: '',
  telefono: '',
  email: '',
  banco: '',
  cbu: '',
  cuenta_sueldo_nro: '',
  obra_social: '',
  art_asignada: '',
  condicion_ganancias: '',
};

// ---------------------------------------------------------------------------
// SUBCOMPONENTES (module scope)
// ---------------------------------------------------------------------------

interface SeccionProps {
  titulo: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const Seccion: React.FC<SeccionProps> = ({ titulo, icon, children }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200">
    <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
      <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">{icon}</div>
      <h3 className="text-base font-semibold text-gray-900">{titulo}</h3>
    </div>
    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  </div>
);

interface CampoProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  colSpan?: 1 | 2;
  children: React.ReactNode;
}

const Campo: React.FC<CampoProps> = ({ label, required, error, hint, colSpan = 1, children }) => (
  <div className={colSpan === 2 ? 'md:col-span-2' : ''}>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1 text-xs text-red-600">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    ) : null}
  </div>
);

const inputBase =
  'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';

function inputClass(hasError?: boolean): string {
  return `${inputBase} ${hasError ? 'border-red-400' : 'border-gray-300'}`;
}

// ---------------------------------------------------------------------------
// PAGINA
// ---------------------------------------------------------------------------

const EmpleadoFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id?: string }>();
  const id = routeId && routeId !== 'nuevo' ? routeId : undefined;
  const isEditMode = !!id;

  const {
    buscarPorId,
    crearEmpleado,
    actualizarEmpleado,
    loading: loadingEmpleados,
  } = useEmpleados();
  const {
    cuentasGastosSueldos,
    buscarPorCodigo: buscarCuenta,
    loading: loadingCuentas,
  } = usePlanCuentas();

  const empleado = useMemo(
    () => (id ? buscarPorId(id) : undefined),
    [id, buscarPorId]
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmpleadoForm>({
    resolver: zodResolver(empleadoSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Hidratar el form en modo edicion (cuando el empleado este disponible)
  useEffect(() => {
    if (!isEditMode) return;
    if (!empleado) return;
    reset({
      apellido: empleado.apellido,
      nombre: empleado.nombre,
      cuil: empleado.cuil,
      tipo_documento: empleado.tipo_documento,
      numero_documento: empleado.numero_documento,
      fecha_nacimiento: empleado.fecha_nacimiento,
      sexo: empleado.sexo,
      fecha_ingreso: empleado.fecha_ingreso,
      fecha_egreso: empleado.fecha_egreso ?? '',
      area: empleado.area,
      cuenta_contable: empleado.cuenta_contable,
      categoria: empleado.categoria ?? '',
      convenio: empleado.convenio ?? '',
      modalidad_contratacion: empleado.modalidad_contratacion ?? '',
      domicilio: empleado.domicilio ?? '',
      telefono: empleado.telefono ?? '',
      email: empleado.email ?? '',
      banco: empleado.banco ?? '',
      cbu: empleado.cbu ?? '',
      cuenta_sueldo_nro: empleado.cuenta_sueldo_nro ?? '',
      obra_social: empleado.obra_social ?? '',
      art_asignada: empleado.art_asignada ?? '',
      condicion_ganancias: empleado.condicion_ganancias ?? '',
    });
  }, [empleado, isEditMode, reset]);

  // Auto-rellenar cuenta_contable cuando cambia el area (solo si no se modifico manualmente)
  const areaActual = watch('area');
  const cuentaActual = watch('cuenta_contable');
  useEffect(() => {
    if (!areaActual) return;
    const cuentaSugerida = cuentaDefaultPorArea(areaActual);
    const cuentaEsDefaultDeOtraArea = Object.values(AREA_A_CUENTA_DEFAULT).includes(cuentaActual);
    // Solo sobrescribir si esta vacia o si el valor actual es la cuenta default de otra area
    if (!cuentaActual || cuentaEsDefaultDeOtraArea) {
      setValue('cuenta_contable', cuentaSugerida, { shouldDirty: true });
    }
  }, [areaActual, cuentaActual, setValue]);

  // ---- Submit -------------------------------------------------------------

  const onSubmit = async (data: EmpleadoForm) => {
    setGlobalError(null);
    setGlobalSuccess(null);

    // Normalizar CUIL al formato XX-XXXXXXXX-X
    const cuilNormalizado = formatearCuil(data.cuil);

    const payload: EmpleadoNuevo = {
      apellido: data.apellido.trim(),
      nombre: data.nombre.trim(),
      cuil: cuilNormalizado,
      tipo_documento: data.tipo_documento as TipoDocumento,
      numero_documento: data.numero_documento.trim().toUpperCase(),
      fecha_nacimiento: data.fecha_nacimiento,
      sexo: data.sexo as SexoEmpleado,
      fecha_ingreso: data.fecha_ingreso,
      fecha_egreso: data.fecha_egreso || null,
      area: data.area as AreaEmpleado,
      cuenta_contable: data.cuenta_contable,
      categoria: data.categoria?.trim() || null,
      convenio: data.convenio?.trim() || null,
      modalidad_contratacion:
        (data.modalidad_contratacion as ModalidadContratacion) || null,
      domicilio: data.domicilio?.trim() || null,
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      banco: data.banco?.trim() || null,
      cbu: data.cbu ? data.cbu.replace(/\D+/g, '') : null,
      cuenta_sueldo_nro: data.cuenta_sueldo_nro?.trim() || null,
      obra_social: data.obra_social?.trim() || null,
      art_asignada: data.art_asignada?.trim() || null,
      condicion_ganancias:
        (data.condicion_ganancias as CondicionGanancias) || null,
    };

    const res = isEditMode && id
      ? await actualizarEmpleado(id, payload)
      : await crearEmpleado(payload);

    if (!res.ok) {
      if (res.codigo === 'CUIL_DUPLICADO') {
        setError('cuil', { type: 'manual', message: res.error });
      }
      setGlobalError(res.error);
      return;
    }

    setGlobalSuccess(
      isEditMode ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente'
    );
    // Navegar al listado tras un breve delay para que se vea el mensaje
    setTimeout(() => navigate('/sueldos/empleados'), 700);
  };

  // ---- Loading state en modo editar antes de hidratar --------------------

  const esperandoCarga = isEditMode && !empleado && loadingEmpleados;
  const noEncontrado = isEditMode && !empleado && !loadingEmpleados;

  if (esperandoCarga) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (noEncontrado) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/sueldos/empleados')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al listado
        </button>
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-800">
          No se encontró el empleado con id <code>{id}</code>.
        </div>
      </div>
    );
  }

  // ---- Render --------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/sueldos/empleados')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            title="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? 'Editar empleado' : 'Nuevo empleado'}
            </h1>
            {isEditMode && empleado && (
              <p className="text-sm text-gray-500">
                {empleado.apellido}, {empleado.nombre} ·{' '}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                    empleado.estado === 'activo'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}
                >
                  {empleado.estado === 'activo' ? (
                    <UserCheck className="h-3 w-3" />
                  ) : (
                    <UserMinus className="h-3 w-3" />
                  )}
                  {LABEL_ESTADO_EMPLEADO[empleado.estado]}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/sueldos/empleados')}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (isEditMode && !isDirty)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEditMode ? 'Guardar cambios' : 'Crear empleado'}
          </button>
        </div>
      </div>

      {/* Mensajes globales */}
      {globalSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{globalSuccess}</p>
        </div>
      )}
      {globalError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{globalError}</p>
        </div>
      )}

      {/* Identificacion */}
      <Seccion titulo="Identificación" icon={<User className="h-5 w-5" />}>
        <Campo label="Apellido" required error={errors.apellido?.message}>
          <input
            type="text"
            {...register('apellido')}
            className={inputClass(!!errors.apellido)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo label="Nombre" required error={errors.nombre?.message}>
          <input
            type="text"
            {...register('nombre')}
            className={inputClass(!!errors.nombre)}
            disabled={isSubmitting}
          />
        </Campo>

        <Campo
          label="CUIL"
          required
          error={errors.cuil?.message}
          hint="Formato XX-XXXXXXXX-X (se valida el dígito verificador)"
        >
          <Controller
            name="cuil"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={(e) => {
                  field.onBlur();
                  const formateado = formatearCuil(e.target.value);
                  if (formateado !== e.target.value) field.onChange(formateado);
                }}
                placeholder="20-12345678-9"
                className={`${inputClass(!!errors.cuil)} font-mono`}
                disabled={isSubmitting}
              />
            )}
          />
        </Campo>
        <Campo label="Sexo" required error={errors.sexo?.message}>
          <select
            {...register('sexo')}
            className={inputClass(!!errors.sexo)}
            disabled={isSubmitting}
          >
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </Campo>

        <Campo
          label="Tipo de documento"
          required
          error={errors.tipo_documento?.message}
        >
          <select
            {...register('tipo_documento')}
            className={inputClass(!!errors.tipo_documento)}
            disabled={isSubmitting}
          >
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          label="Número de documento"
          required
          error={errors.numero_documento?.message}
        >
          <input
            type="text"
            {...register('numero_documento')}
            className={inputClass(!!errors.numero_documento)}
            disabled={isSubmitting}
          />
        </Campo>

        <Campo
          label="Fecha de nacimiento"
          required
          error={errors.fecha_nacimiento?.message}
        >
          <input
            type="date"
            {...register('fecha_nacimiento')}
            className={inputClass(!!errors.fecha_nacimiento)}
            disabled={isSubmitting}
          />
        </Campo>
      </Seccion>

      {/* Laborales */}
      <Seccion titulo="Datos laborales" icon={<Briefcase className="h-5 w-5" />}>
        <Campo
          label="Fecha de ingreso"
          required
          error={errors.fecha_ingreso?.message}
        >
          <input
            type="date"
            {...register('fecha_ingreso')}
            className={inputClass(!!errors.fecha_ingreso)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo
          label="Fecha de egreso"
          error={errors.fecha_egreso?.message}
          hint="Solo si fue dado de baja. Normalmente se setea desde el listado."
        >
          <input
            type="date"
            {...register('fecha_egreso')}
            className={inputClass(!!errors.fecha_egreso)}
            disabled={isSubmitting}
          />
        </Campo>

        <Campo label="Área" required error={errors.area?.message}>
          <select
            {...register('area')}
            className={inputClass(!!errors.area)}
            disabled={isSubmitting}
          >
            {AREAS_EMPLEADO.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Campo>
        <Campo
          label="Cuenta contable"
          required
          error={errors.cuenta_contable?.message}
          hint={(() => {
            const c = buscarCuenta(cuentaActual);
            return c ? `${c.cta_codigo} - ${c.cta_nombre}` : 'Se autocompleta según el área seleccionada';
          })()}
        >
          <select
            {...register('cuenta_contable')}
            className={`${inputClass(!!errors.cuenta_contable)} font-mono`}
            disabled={isSubmitting || loadingCuentas}
          >
            {loadingCuentas && <option value="">Cargando cuentas...</option>}
            {cuentasGastosSueldos.map((c) => (
              <option key={c.cta_codigo} value={c.cta_codigo}>
                {c.cta_codigo} — {c.cta_nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Categoría" error={errors.categoria?.message}>
          <input
            type="text"
            {...register('categoria')}
            className={inputClass(!!errors.categoria)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo label="Convenio" error={errors.convenio?.message}>
          <input
            type="text"
            {...register('convenio')}
            className={inputClass(!!errors.convenio)}
            placeholder="UTHGRA, UATRE, etc."
            disabled={isSubmitting}
          />
        </Campo>

        <Campo
          label="Modalidad de contratación"
          error={errors.modalidad_contratacion?.message}
          colSpan={2}
        >
          <select
            {...register('modalidad_contratacion')}
            className={inputClass(!!errors.modalidad_contratacion)}
            disabled={isSubmitting}
          >
            <option value="">(Sin especificar)</option>
            {MODALIDADES_CONTRATACION.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
      </Seccion>

      {/* Contacto */}
      <Seccion titulo="Contacto" icon={<Phone className="h-5 w-5" />}>
        <Campo label="Domicilio" error={errors.domicilio?.message} colSpan={2}>
          <input
            type="text"
            {...register('domicilio')}
            className={inputClass(!!errors.domicilio)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo label="Teléfono" error={errors.telefono?.message}>
          <input
            type="text"
            {...register('telefono')}
            className={inputClass(!!errors.telefono)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo label="Email" error={errors.email?.message}>
          <input
            type="email"
            {...register('email')}
            className={inputClass(!!errors.email)}
            disabled={isSubmitting}
          />
        </Campo>
      </Seccion>

      {/* Bancarios */}
      <Seccion titulo="Datos bancarios" icon={<CreditCard className="h-5 w-5" />}>
        <Campo label="Banco" error={errors.banco?.message}>
          <input
            type="text"
            {...register('banco')}
            className={inputClass(!!errors.banco)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo
          label="Cuenta sueldo Nº"
          error={errors.cuenta_sueldo_nro?.message}
        >
          <input
            type="text"
            {...register('cuenta_sueldo_nro')}
            className={inputClass(!!errors.cuenta_sueldo_nro)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo
          label="CBU"
          error={errors.cbu?.message}
          hint="22 dígitos (se guardan sin guiones ni espacios)"
          colSpan={2}
        >
          <input
            type="text"
            {...register('cbu')}
            className={`${inputClass(!!errors.cbu)} font-mono`}
            maxLength={30}
            disabled={isSubmitting}
          />
        </Campo>
      </Seccion>

      {/* Previsionales */}
      <Seccion titulo="Previsionales / fiscales" icon={<Shield className="h-5 w-5" />}>
        <Campo label="Obra social" error={errors.obra_social?.message}>
          <input
            type="text"
            {...register('obra_social')}
            className={inputClass(!!errors.obra_social)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo label="ART asignada" error={errors.art_asignada?.message}>
          <input
            type="text"
            {...register('art_asignada')}
            className={inputClass(!!errors.art_asignada)}
            disabled={isSubmitting}
          />
        </Campo>
        <Campo
          label="Condición ante Ganancias"
          error={errors.condicion_ganancias?.message}
          colSpan={2}
        >
          <select
            {...register('condicion_ganancias')}
            className={inputClass(!!errors.condicion_ganancias)}
            disabled={isSubmitting}
          >
            <option value="">(Sin especificar)</option>
            <option value="Sujeto a retención">Sujeto a retención</option>
            <option value="No alcanzado">No alcanzado</option>
          </select>
        </Campo>
      </Seccion>

      {/* Botones inferiores duplicados (UX en forms largos) */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => navigate('/sueldos/empleados')}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting || (isEditMode && !isDirty)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEditMode ? 'Guardar cambios' : 'Crear empleado'}
        </button>
      </div>
    </form>
  );
};

export default EmpleadoFormPage;
