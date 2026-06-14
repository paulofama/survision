// ============================================
// HONORARIOS PAGE
// Configuración de honorarios por segmento
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Users,
  Calculator,
  Settings,
  UserCheck,
  UserX,
  Percent,
  Save,
  X,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle,
  Search,
  Building2
} from 'lucide-react';
import { useHonorariosConfig, HonorarioConfig, Prestador } from '../hooks/useHonorariosConfig';

// ============================================
// TIPOS LOCALES
// ============================================

type TabActiva = 'configuracion' | 'prestadores' | 'simulador';

interface FormConfiguracion {
  segmento: 'Consultas' | 'Estudios' | 'Cirugias';
  codigo_desde: string;
  codigo_hasta: string;
  porcentaje_socio: string;
  porcentaje_no_socio: string;
}

interface FormPrestador {
  nombre: string;
  matricula_provincial: string;
  cuit: string;
  es_socio: boolean;
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const HonorariosPage: React.FC = () => {
  // Hook de datos
  const {
    configuraciones,
    prestadores,
    estadisticas,
    loading,
    error,
    isConnected,
    actualizarConfiguracion,
    crearConfiguracion,
    eliminarConfiguracion,
    crearPrestador,
    actualizarPrestador,
    toggleSocioPrestador,
    eliminarPrestador,
    simularHonorario,
    refetch
  } = useHonorariosConfig();

  // Estados locales
  const [tabActiva, setTabActiva] = useState<TabActiva>('configuracion');
  const [editandoConfig, setEditandoConfig] = useState<string | null>(null);
  const [editandoPrestador, setEditandoPrestador] = useState<string | null>(null);
  const [mostrarFormConfig, setMostrarFormConfig] = useState(false);
  const [mostrarFormPrestador, setMostrarFormPrestador] = useState(false);
  const [busquedaPrestador, setBusquedaPrestador] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');
  const [mensajeError, setMensajeError] = useState('');

  // Estado del simulador
  const [simuladorMonto, setSimuladorMonto] = useState('');
  const [simuladorPrestador, setSimuladorPrestador] = useState('');
  const [simuladorCodigo, setSimuladorCodigo] = useState('');
  const [resultadoSimulacion, setResultadoSimulacion] = useState<any>(null);

  // Formularios
  const [formConfig, setFormConfig] = useState<FormConfiguracion>({
    segmento: 'Consultas',
    codigo_desde: '',
    codigo_hasta: '',
    porcentaje_socio: '',
    porcentaje_no_socio: ''
  });

  const [formPrestador, setFormPrestador] = useState<FormPrestador>({
    nombre: '',
    matricula_provincial: '',
    cuit: '',
    es_socio: false
  });

  // Prestadores filtrados
  const prestadoresFiltrados = useMemo(() => {
    if (!busquedaPrestador.trim()) return prestadores;
    const termino = busquedaPrestador.toLowerCase();
    return prestadores.filter(p => 
      p.nombre.toLowerCase().includes(termino) ||
      p.cuit?.includes(termino)
    );
  }, [prestadores, busquedaPrestador]);

  // ============================================
  // HANDLERS
  // ============================================

  const mostrarMensaje = (mensaje: string, tipo: 'exito' | 'error') => {
    if (tipo === 'exito') {
      setMensajeExito(mensaje);
      setTimeout(() => setMensajeExito(''), 3000);
    } else {
      setMensajeError(mensaje);
      setTimeout(() => setMensajeError(''), 5000);
    }
  };

  // Handlers Configuración
  const handleGuardarConfig = async (id: string, config: HonorarioConfig) => {
    const exito = await actualizarConfiguracion(id, {
      porcentaje_socio: config.porcentaje_socio,
      porcentaje_no_socio: config.porcentaje_no_socio
    });
    
    if (exito) {
      setEditandoConfig(null);
      mostrarMensaje('Configuración actualizada correctamente', 'exito');
    } else {
      mostrarMensaje('Error al actualizar configuración', 'error');
    }
  };

  const handleCrearConfig = async () => {
    const exito = await crearConfiguracion({
      segmento: formConfig.segmento,
      codigo_desde: formConfig.codigo_desde,
      codigo_hasta: formConfig.codigo_hasta,
      porcentaje_socio: parseFloat(formConfig.porcentaje_socio),
      porcentaje_no_socio: parseFloat(formConfig.porcentaje_no_socio)
    });

    if (exito) {
      setMostrarFormConfig(false);
      setFormConfig({
        segmento: 'Consultas',
        codigo_desde: '',
        codigo_hasta: '',
        porcentaje_socio: '',
        porcentaje_no_socio: ''
      });
      mostrarMensaje('Segmento creado correctamente', 'exito');
    } else {
      mostrarMensaje('Error al crear segmento', 'error');
    }
  };

  // Handlers Prestadores
  const handleToggleSocio = async (id: string) => {
    const exito = await toggleSocioPrestador(id);
    if (exito) {
      mostrarMensaje('Estado de socio actualizado', 'exito');
    }
  };

  const handleCrearPrestador = async () => {
    const exito = await crearPrestador({
      nombre: formPrestador.nombre.toUpperCase(),
      matricula_provincial: formPrestador.matricula_provincial ? parseInt(formPrestador.matricula_provincial) : undefined,
      cuit: formPrestador.cuit || undefined,
      es_socio: formPrestador.es_socio
    });

    if (exito) {
      setMostrarFormPrestador(false);
      setFormPrestador({
        nombre: '',
        matricula_provincial: '',
        cuit: '',
        es_socio: false
      });
      mostrarMensaje('Prestador creado correctamente', 'exito');
    } else {
      mostrarMensaje('Error al crear prestador', 'error');
    }
  };

  // Handler Simulador
  const handleSimular = () => {
    if (!simuladorMonto || !simuladorPrestador || !simuladorCodigo) {
      mostrarMensaje('Complete todos los campos', 'error');
      return;
    }

    const resultado = simularHonorario({
      monto: parseFloat(simuladorMonto),
      prestadorId: simuladorPrestador,
      codigoPractica: simuladorCodigo
    });

    if (resultado) {
      setResultadoSimulacion(resultado);
    } else {
      mostrarMensaje('No se encontró configuración para el código ingresado', 'error');
      setResultadoSimulacion(null);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // ============================================
  // RENDER: TABS
  // ============================================

  const renderTabs = () => (
    <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
      {[
        { id: 'configuracion', label: 'Configuración', icon: Settings },
        { id: 'prestadores', label: 'Prestadores', icon: Users },
        { id: 'simulador', label: 'Simulador', icon: Calculator }
      ].map(tab => {
        const Icon = tab.icon;
        const isActive = tabActiva === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => setTabActiva(tab.id as TabActiva)}
            className={`
              flex-1 flex items-center justify-center px-4 py-2.5 rounded-lg
              font-medium text-sm transition-all duration-200
              ${isActive 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }
            `}
          >
            <Icon className="h-4 w-4 mr-2" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  // ============================================
  // RENDER: TARJETAS DE RESUMEN
  // ============================================

  const renderResumen = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Segmentos</p>
            <p className="text-2xl font-bold text-gray-900">{estadisticas.totalSegmentos}</p>
          </div>
          <div className="p-3 bg-blue-100 rounded-lg">
            <Settings className="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Prestadores</p>
            <p className="text-2xl font-bold text-gray-900">{estadisticas.totalPrestadores}</p>
          </div>
          <div className="p-3 bg-purple-100 rounded-lg">
            <Users className="h-6 w-6 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Socios</p>
            <p className="text-2xl font-bold text-green-600">{estadisticas.socios}</p>
          </div>
          <div className="p-3 bg-green-100 rounded-lg">
            <UserCheck className="h-6 w-6 text-green-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">No Socios</p>
            <p className="text-2xl font-bold text-orange-600">{estadisticas.noSocios}</p>
          </div>
          <div className="p-3 bg-orange-100 rounded-lg">
            <UserX className="h-6 w-6 text-orange-600" />
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================
  // RENDER: TAB CONFIGURACIÓN
  // ============================================

  const renderTabConfiguracion = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Configuración de Honorarios</h3>
          <p className="text-sm text-gray-500">Porcentajes por segmento de práctica</p>
        </div>
        <button
          onClick={() => setMostrarFormConfig(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Segmento
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Segmento
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Código Desde
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Código Hasta
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <span className="flex items-center justify-center">
                  <UserCheck className="h-4 w-4 mr-1 text-green-600" />
                  Socio
                </span>
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <span className="flex items-center justify-center">
                  <UserX className="h-4 w-4 mr-1 text-orange-600" />
                  No Socio
                </span>
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-gray-500">Cargando configuración...</p>
                </td>
              </tr>
            ) : configuraciones.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Settings className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No hay segmentos configurados</p>
                  <p className="text-gray-400 text-sm mt-1">Agregue un segmento para comenzar</p>
                </td>
              </tr>
            ) : (
              configuraciones.map((config) => (
                <tr key={config.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className={`
                        w-3 h-3 rounded-full mr-3
                        ${config.segmento === 'Consultas' ? 'bg-blue-500' : ''}
                        ${config.segmento === 'Estudios' ? 'bg-purple-500' : ''}
                        ${config.segmento === 'Cirugias' ? 'bg-red-500' : ''}
                      `} />
                      <span className="font-medium text-gray-900">{config.segmento}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                      {config.codigo_desde}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                      {config.codigo_hasta}
                    </code>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {editandoConfig === config.id ? (
                      <input
                        type="number"
                        value={config.porcentaje_socio}
                        onChange={(e) => {
                          const updated = configuraciones.map(c => 
                            c.id === config.id 
                              ? { ...c, porcentaje_socio: parseFloat(e.target.value) }
                              : c
                          );
                          setConfiguraciones(updated);
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                        {config.porcentaje_socio}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {editandoConfig === config.id ? (
                      <input
                        type="number"
                        value={config.porcentaje_no_socio}
                        onChange={(e) => {
                          const updated = configuraciones.map(c => 
                            c.id === config.id 
                              ? { ...c, porcentaje_no_socio: parseFloat(e.target.value) }
                              : c
                          );
                          setConfiguraciones(updated);
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                      />
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-orange-100 text-orange-800">
                        {config.porcentaje_no_socio}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {editandoConfig === config.id ? (
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleGuardarConfig(config.id, config)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Guardar"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditandoConfig(null);
                            refetch();
                          }}
                          className="p-1.5 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => setEditandoConfig(config.id)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ============================================
  // RENDER: TAB PRESTADORES
  // ============================================

  const renderTabPrestadores = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Prestadores</h3>
            <p className="text-sm text-gray-500">Gestión de socios y no socios</p>
          </div>
          
          {/* Búsqueda */}
          <div className="relative">
            <input
              type="text"
              value={busquedaPrestador}
              onChange={(e) => setBusquedaPrestador(e.target.value)}
              placeholder="Buscar prestador..."
              className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>
        </div>

        <button
          onClick={() => setMostrarFormPrestador(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Prestador
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Prestador
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Matrícula
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                CUIT
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-gray-500">Cargando prestadores...</p>
                </td>
              </tr>
            ) : prestadoresFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No hay prestadores</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {busquedaPrestador ? 'No se encontraron resultados' : 'Agregue un prestador para comenzar'}
                  </p>
                </td>
              </tr>
            ) : (
              prestadoresFiltrados.map((prestador) => (
                <tr key={prestador.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center mr-3
                        ${prestador.es_socio ? 'bg-green-100' : 'bg-orange-100'}
                      `}>
                        {prestador.es_socio ? (
                          <UserCheck className="h-5 w-5 text-green-600" />
                        ) : (
                          <UserX className="h-5 w-5 text-orange-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{prestador.nombre}</p>
                        {prestador.geclisa_pre_id && (
                          <p className="text-xs text-gray-400">ID GECLISA: {prestador.geclisa_pre_id}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">
                    {prestador.matricula_provincial || '-'}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600 font-mono text-sm">
                    {prestador.cuit || '-'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleSocio(prestador.id)}
                      className={`
                        inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium
                        transition-colors cursor-pointer
                        ${prestador.es_socio 
                          ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                          : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                        }
                      `}
                    >
                      {prestador.es_socio ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Socio
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          No Socio
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => eliminarPrestador(prestador.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ============================================
  // RENDER: TAB SIMULADOR
  // ============================================

  const renderTabSimulador = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Formulario de simulación */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Calculator className="h-5 w-5 mr-2 text-blue-600" />
          Simular Honorario
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto de la Práctica
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={simuladorMonto}
                onChange={(e) => setSimuladorMonto(e.target.value)}
                placeholder="100000"
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código de Práctica
            </label>
            <input
              type="text"
              value={simuladorCodigo}
              onChange={(e) => setSimuladorCodigo(e.target.value)}
              placeholder="030101"
              maxLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
            />
            <p className="mt-1 text-xs text-gray-500">
              Consultas: 01xxxx | Estudios: 02xxxx | Cirugías: 03xxxx
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prestador
            </label>
            <select
              value={simuladorPrestador}
              onChange={(e) => setSimuladorPrestador(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Seleccione un prestador</option>
              {prestadores.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.es_socio ? 'Socio' : 'No Socio'})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSimular}
            className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Calculator className="h-5 w-5 mr-2" />
            Calcular Honorario
          </button>
        </div>
      </div>

      {/* Resultado */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <DollarSign className="h-5 w-5 mr-2 text-green-600" />
          Resultado
        </h3>

        {resultadoSimulacion ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <p className="text-sm text-green-600 font-medium mb-1">Honorario Calculado</p>
              <p className="text-4xl font-bold text-green-700">
                {formatCurrency(resultadoSimulacion.honorarioCalculado)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Monto Base</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(resultadoSimulacion.monto)}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Porcentaje</p>
                <p className="text-lg font-semibold text-gray-900">
                  {resultadoSimulacion.porcentaje}%
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Segmento</p>
                <p className="text-lg font-semibold text-gray-900">
                  {resultadoSimulacion.segmento}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Tipo</p>
                <span className={`
                  inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium
                  ${resultadoSimulacion.esSocio 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-orange-100 text-orange-800'
                  }
                `}>
                  {resultadoSimulacion.esSocio ? 'Socio' : 'No Socio'}
                </span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>{resultadoSimulacion.prestador}</strong> recibe el{' '}
                <strong>{resultadoSimulacion.porcentaje}%</strong> del monto facturado
                por ser <strong>{resultadoSimulacion.esSocio ? 'socio' : 'no socio'}</strong> en{' '}
                <strong>{resultadoSimulacion.segmento}</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Calculator className="h-16 w-16 mb-4" />
            <p className="text-lg font-medium">Ingrese los datos para simular</p>
            <p className="text-sm">Complete el formulario y presione calcular</p>
          </div>
        )}
      </div>
    </div>
  );

  // ============================================
  // RENDER: MODAL NUEVO SEGMENTO
  // ============================================

  const renderModalNuevoSegmento = () => (
    mostrarFormConfig && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Nuevo Segmento</h3>
            <button
              onClick={() => setMostrarFormConfig(false)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
              <select
                value={formConfig.segmento}
                onChange={(e) => setFormConfig({ ...formConfig, segmento: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="Consultas">Consultas</option>
                <option value="Estudios">Estudios</option>
                <option value="Cirugias">Cirugías</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código Desde</label>
                <input
                  type="text"
                  value={formConfig.codigo_desde}
                  onChange={(e) => setFormConfig({ ...formConfig, codigo_desde: e.target.value })}
                  placeholder="010000"
                  maxLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código Hasta</label>
                <input
                  type="text"
                  value={formConfig.codigo_hasta}
                  onChange={(e) => setFormConfig({ ...formConfig, codigo_hasta: e.target.value })}
                  placeholder="010999"
                  maxLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">% Socio</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formConfig.porcentaje_socio}
                    onChange={(e) => setFormConfig({ ...formConfig, porcentaje_socio: e.target.value })}
                    placeholder="60"
                    className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <Percent className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">% No Socio</label>
                <div className="relative">
                  <input
                    type="number"
                    value={formConfig.porcentaje_no_socio}
                    onChange={(e) => setFormConfig({ ...formConfig, porcentaje_no_socio: e.target.value })}
                    placeholder="50"
                    className="w-full px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <Percent className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={() => setMostrarFormConfig(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCrearConfig}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Guardar Segmento
            </button>
          </div>
        </div>
      </div>
    )
  );

  // ============================================
  // RENDER: MODAL NUEVO PRESTADOR
  // ============================================

  const renderModalNuevoPrestador = () => (
    mostrarFormPrestador && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Nuevo Prestador</h3>
            <button
              onClick={() => setMostrarFormPrestador(false)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
              <input
                type="text"
                value={formPrestador.nombre}
                onChange={(e) => setFormPrestador({ ...formPrestador, nombre: e.target.value })}
                placeholder="APELLIDO, NOMBRE"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Matrícula</label>
                <input
                  type="number"
                  value={formPrestador.matricula_provincial}
                  onChange={(e) => setFormPrestador({ ...formPrestador, matricula_provincial: e.target.value })}
                  placeholder="12345"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
                <input
                  type="text"
                  value={formPrestador.cuit}
                  onChange={(e) => setFormPrestador({ ...formPrestador, cuit: e.target.value })}
                  placeholder="20-12345678-9"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formPrestador.es_socio}
                  onChange={(e) => setFormPrestador({ ...formPrestador, es_socio: e.target.checked })}
                  className="sr-only"
                />
                <div className={`
                  relative w-11 h-6 rounded-full transition-colors
                  ${formPrestador.es_socio ? 'bg-green-600' : 'bg-gray-300'}
                `}>
                  <div className={`
                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                    ${formPrestador.es_socio ? 'translate-x-5' : 'translate-x-0'}
                  `} />
                </div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {formPrestador.es_socio ? 'Socio de la Clínica' : 'No Socio'}
                </span>
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              onClick={() => setMostrarFormPrestador(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCrearPrestador}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Guardar Prestador
            </button>
          </div>
        </div>
      </div>
    )
  );

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

  return (
    <div className="w-full h-full">
      {/* Mensajes */}
      {mensajeExito && (
        <div className="fixed top-4 right-4 z-50 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg shadow-lg flex items-center">
          <CheckCircle className="h-5 w-5 mr-2" />
          {mensajeExito}
        </div>
      )}
      {mensajeError && (
        <div className="fixed top-4 right-4 z-50 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          {mensajeError}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Configuración de Honorarios
              </h1>
              <p className="text-gray-500 text-sm">
                Gestión de porcentajes por segmento y prestadores
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Estado de conexión */}
            <div className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>

            <button
              onClick={refetch}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* Resumen */}
      {renderResumen()}

      {/* Tabs */}
      {renderTabs()}

      {/* Contenido según tab */}
      {tabActiva === 'configuracion' && renderTabConfiguracion()}
      {tabActiva === 'prestadores' && renderTabPrestadores()}
      {tabActiva === 'simulador' && renderTabSimulador()}

      {/* Modales */}
      {renderModalNuevoSegmento()}
      {renderModalNuevoPrestador()}

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500">
          Configuración de Honorarios | Sistema de Costos | Instituto Dr. Mercado
        </p>
      </div>
    </div>
  );
};

export default HonorariosPage;
