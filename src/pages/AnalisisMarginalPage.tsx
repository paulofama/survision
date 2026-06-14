// ============================================
// ANÁLISIS MARGINAL - CON COSTOS POR POOL
// Honorarios + Pools Individuales + Insumos Directos
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calculator,
  Filter,
  RefreshCw,
  Search,
  Building2,
  TrendingUp,
  DollarSign,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Loader2,
  Users,
  Percent,
  PiggyBank,
  TrendingDown,
  Info,
  Package,
  Syringe,
  FileText,
  Download,
  Eye,
  EyeOff,
  Settings
} from 'lucide-react';
import { useMovimientosPrestaciones } from '../hooks/useMovimientosPrestaciones';
import { useHonorariosConfig } from '../hooks/useHonorariosConfig';
import { supabase } from '../lib/supabase';

// ============================================
// TIPOS
// ============================================

interface CostosPorPool {
  consultorio: number;
  quirofano: number;
  parabulbar: number;
  rfg: number;
  reesterilizables: number;
  lavado: number;
  faco: number;
  implante: number;
  medicamentos: number;
  descartables: number;
}

interface RecetaConPools {
  codigo_practica: string;
  nombre_practica: string;
  categoria: string;
  cantidad_mensual_estimada: number;
  costo_pool_consultorio: number;
  costo_pool_quirofano: number;
  costo_pool_parabulbar: number;
  costo_pool_rfg: number;
  costo_pool_reesterilizables: number;
  costo_pool_lavado: number;
  costo_pool_faco: number;
  costo_pool_implante: number;
  costo_pool_medicamentos: number;
  costo_pool_descartables: number;
  costo_total_pools: number;
  costo_insumos_directos: number;
  costo_total_unitario: number;
}

interface PrestacionAgrupada {
  prestacion: string;
  codigo: string;
  cantidad: number;
  totalGeneral: number;
  segmentoDetectado: string;
  // Honorarios
  porcentajeHonorario: number;
  totalHonorarios: number;
  // Costos por pool
  costosPools: CostosPorPool;
  totalPools: number;
  // Insumos directos
  costoInsumosUnitario: number;
  totalInsumosDirectos: number;
  // Totales
  totalCostos: number;
  margenContribucion: number;
  porcentajeMargen: number;
  tieneReceta: boolean;
}

interface ColumnasVisibles {
  honorarios: boolean;
  consultorio: boolean;
  quirofano: boolean;
  parabulbar: boolean;
  rfg: boolean;
  reesterilizables: boolean;
  lavado: boolean;
  faco: boolean;
  implante: boolean;
  medicamentos: boolean;
  descartables: boolean;
  insumosDirectos: boolean;
}

// ============================================
// PATRONES DE CLASIFICACIÓN
// ============================================

const PATRONES_CIRUGIA = [
  'FACO', 'FACOEMULSIFICACION', 'CAPSULOTOMIA', 'VITRECTOMIA', 'TRABECULECTOMIA',
  'PTERIGION', 'CHALAZION', 'ICL', 'IMPLANTE', 'SUTURA', 'EXTRACCION', 'CIRUG',
  'QUIRURG', 'YAG', 'LASER', 'INTRAVITREA', 'AVASTIN', 'EYLEA', 'CROSSLINKING',
  'BIOPSIA', 'ESCISION', 'NEEDLING', 'PUNCTUM', 'PLUG', 'HERIDA', 'PERFORANTE'
];

const PATRONES_ESTUDIOS = [
  'OCT', 'TOMOGRAFIA', 'CAMPIMETRIA', 'TOPOGRAFIA', 'BIOMETRIA', 'ECOGRAFIA',
  'PAQUIMETRIA', 'MICROSCOPIA', 'RETINOGRAFIA', 'ANGIOGRAFIA', 'RFG', 'ERG',
  'TEST', 'ESTUDIO', 'EXPLORACION', 'MEDICION'
];

const PATRONES_CONSULTAS = [
  'CONSULTA', 'CONTROL', 'EXOFTALMOLOGIA', 'OFTALMOLOGIA', 'URGENCIA',
  'EVALUACION', 'CHEQUEO', 'REVISION', 'SEGUIMIENTO', 'VER ESTUDIOS'
];

const normalizarTexto = (texto: string): string => {
  return texto.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
};

const detectarSegmento = (nombre: string): string => {
  const nombreNorm = normalizarTexto(nombre);
  
  for (const patron of PATRONES_CIRUGIA) {
    if (nombreNorm.includes(patron)) return 'Cirugias';
  }
  for (const patron of PATRONES_ESTUDIOS) {
    if (nombreNorm.includes(patron)) return 'Estudios';
  }
  for (const patron of PATRONES_CONSULTAS) {
    if (nombreNorm.includes(patron)) return 'Consultas';
  }
  
  return 'Sin clasificar';
};

// ============================================
// EXTRACCIÓN DE CÓDIGO DE NOMENCLADOR
// Busca el último paréntesis con formato de código (6 dígitos)
// Ejemplo: "Exoftalmologia (300122) (010102)" → "010102"
// ============================================

const extraerCodigoNomenclador = (nombrePrestacion: string): string => {
  if (!nombrePrestacion) return '';
  
  // Buscar todos los patrones entre paréntesis que parezcan códigos (solo números, 6 dígitos)
  const matches = nombrePrestacion.match(/\((\d{6})\)/g);
  
  if (matches && matches.length > 0) {
    // Tomar el último match (generalmente es el código de nomenclador)
    const ultimoMatch = matches[matches.length - 1];
    // Extraer solo los números
    return ultimoMatch.replace(/[()]/g, '');
  }
  
  // Fallback: buscar cualquier número de 6 dígitos entre paréntesis
  const fallbackMatch = nombrePrestacion.match(/\((\d+)\)/);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }
  
  return '';
};

// ============================================
// FORMATEO
// ============================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const getSegmentoColor = (segmento: string): string => {
  switch (segmento) {
    case 'Cirugias': return 'bg-red-100 text-red-800';
    case 'Estudios': return 'bg-blue-100 text-blue-800';
    case 'Consultas': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getMargenColor = (porcentaje: number): string => {
  if (porcentaje >= 50) return 'text-green-600';
  if (porcentaje >= 30) return 'text-blue-600';
  if (porcentaje >= 0) return 'text-yellow-600';
  return 'text-red-600';
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const AnalisisMarginalPage: React.FC = () => {
  // Hook de datos de GECLISA
  const {
    prestaciones,
    opcionesFiltros,
    filtros,
    aplicarFiltros,
    limpiarFiltros,
    loading,
    error,
    isConnected,
    refetch
  } = useMovimientosPrestaciones();

  // Hook de honorarios
  const {
    configuraciones: configHonorarios,
    prestadores: prestadoresHonorarios,
    loading: loadingHonorarios
  } = useHonorariosConfig();

  // Estados locales
  const [recetasConPools, setRecetasConPools] = useState<RecetaConPools[]>([]);
  const [loadingRecetas, setLoadingRecetas] = useState(true);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const [ordenColumna, setOrdenColumna] = useState<string>('codigo');
  const [ordenDireccion, setOrdenDireccion] = useState<'asc' | 'desc'>('asc');
  const [filtroSegmento, setFiltroSegmento] = useState<string>('');
  const [mostrarConfigColumnas, setMostrarConfigColumnas] = useState(false);
  
  // Columnas visibles (por defecto solo las principales)
  const [columnasVisibles, setColumnasVisibles] = useState<ColumnasVisibles>({
    honorarios: true,
    consultorio: true,
    quirofano: true,
    parabulbar: true,
    rfg: false,
    reesterilizables: true,
    lavado: true,
    faco: false,
    implante: false,
    medicamentos: false,
    descartables: false,
    insumosDirectos: true
  });

  // ============================================
  // CARGAR RECETAS CON POOLS
  // ============================================

  useEffect(() => {
    const cargarRecetasConPools = async () => {
      try {
        setLoadingRecetas(true);
        
        const { data, error: fetchError } = await supabase
          .from('v_recetas_costos_por_pool')
          .select('*');

        if (fetchError) {
          console.warn('Vista v_recetas_costos_por_pool no disponible:', fetchError.message);
          setRecetasConPools([]);
          return;
        }

        setRecetasConPools(data || []);
        console.log(`✅ ${data?.length || 0} recetas con pools cargadas`);

      } catch (err) {
        console.error('Error cargando recetas:', err);
        setRecetasConPools([]);
      } finally {
        setLoadingRecetas(false);
      }
    };

    cargarRecetasConPools();
  }, []);

  // ============================================
  // FUNCIONES AUXILIARES
  // ============================================

  const buscarPrestadorPorNombre = (nombrePrestador: string): { esSocio: boolean } => {
    if (!nombrePrestador || prestadoresHonorarios.length === 0) {
      return { esSocio: false };
    }
    const nombreUpper = nombrePrestador.toUpperCase();
    const prestador = prestadoresHonorarios.find(p => {
      const nombreConfig = p.nombre.toUpperCase();
      return nombreUpper.includes(nombreConfig) || nombreConfig.includes(nombreUpper);
    });
    return { esSocio: prestador?.es_socio || false };
  };

  const obtenerPorcentajeHonorario = (segmento: string, esSocio: boolean): number => {
    const segmentoNorm = segmento.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const config = configHonorarios.find(c => 
      c.segmento.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === segmentoNorm
    );
    if (config) {
      return esSocio ? config.porcentaje_socio : config.porcentaje_no_socio;
    }
    const defaults: Record<string, { socio: number; noSocio: number }> = {
      'consultas': { socio: 60, noSocio: 50 },
      'estudios': { socio: 40, noSocio: 33 },
      'cirugias': { socio: 40, noSocio: 33 },
      'sin clasificar': { socio: 0, noSocio: 0 }
    };
    return defaults[segmentoNorm]?.[esSocio ? 'socio' : 'noSocio'] || 0;
  };

  const obtenerRecetaPorCodigo = (codigo: string): RecetaConPools | null => {
    if (!codigo) return null;
    const receta = recetasConPools.find(r => r.codigo_practica === codigo);
    // Debug: descomentar para ver el matching
    // if (receta) console.log(`✅ Match: ${codigo} → ${receta.nombre_practica}`);
    // else if (codigo) console.log(`❌ Sin match: ${codigo}`);
    return receta || null;
  };

  // ============================================
  // DATOS AGRUPADOS CON POOLS DESGLOSADOS
  // ============================================

  const prestacionesAgrupadas = useMemo((): PrestacionAgrupada[] => {
    const agrupacion = new Map<string, {
      prestacion: string;
      codigo: string;
      cantidad: number;
      totalGeneral: number;
      prestadores: Set<string>;
      segmentoDetectado: string;
    }>();

    prestaciones.forEach(p => {
      const key = p.prestacion || 'SIN PRESTACIÓN';
      
      if (agrupacion.has(key)) {
        const existing = agrupacion.get(key)!;
        existing.cantidad += 1;
        existing.totalGeneral += p.total || 0;
        if (p.prestador) existing.prestadores.add(p.prestador);
      } else {
        const segmento = detectarSegmento(key);
        // Extraer código del nombre de la prestación (ej: "Exoftalmologia (300122) (010102)" → "010102")
        const codigoExtraido = extraerCodigoNomenclador(key);
        
        agrupacion.set(key, {
          prestacion: key,
          codigo: codigoExtraido,
          cantidad: 1,
          totalGeneral: p.total || 0,
          prestadores: new Set(p.prestador ? [p.prestador] : []),
          segmentoDetectado: segmento
        });
      }
    });

    return Array.from(agrupacion.values()).map(item => {
      // Calcular % honorarios promedio
      let porcentajeHonorario = 0;
      if (item.prestadores.size > 0) {
        let suma = 0;
        item.prestadores.forEach(nombre => {
          const { esSocio } = buscarPrestadorPorNombre(nombre);
          suma += obtenerPorcentajeHonorario(item.segmentoDetectado, esSocio);
        });
        porcentajeHonorario = suma / item.prestadores.size;
      } else {
        porcentajeHonorario = obtenerPorcentajeHonorario(item.segmentoDetectado, false);
      }

      const totalHonorarios = item.totalGeneral * (porcentajeHonorario / 100);

      // Buscar receta con pools
      const receta = obtenerRecetaPorCodigo(item.codigo);
      const tieneReceta = !!receta;

      // Costos por pool (unitarios)
      const costosPools: CostosPorPool = {
        consultorio: receta?.costo_pool_consultorio || 0,
        quirofano: receta?.costo_pool_quirofano || 0,
        parabulbar: receta?.costo_pool_parabulbar || 0,
        rfg: receta?.costo_pool_rfg || 0,
        reesterilizables: receta?.costo_pool_reesterilizables || 0,
        lavado: receta?.costo_pool_lavado || 0,
        faco: receta?.costo_pool_faco || 0,
        implante: receta?.costo_pool_implante || 0,
        medicamentos: receta?.costo_pool_medicamentos || 0,
        descartables: receta?.costo_pool_descartables || 0
      };

      // Totales (unitario × cantidad)
      const costoPoolsUnitario = receta?.costo_total_pools || 0;
      const totalPools = costoPoolsUnitario * item.cantidad;

      const costoInsumosUnitario = receta?.costo_insumos_directos || 0;
      const totalInsumosDirectos = costoInsumosUnitario * item.cantidad;

      // Costo total
      const totalCostos = totalHonorarios + totalPools + totalInsumosDirectos;

      // Margen
      const margenContribucion = item.totalGeneral - totalCostos;
      const porcentajeMargen = item.totalGeneral > 0 
        ? (margenContribucion / item.totalGeneral) * 100 
        : 0;

      return {
        prestacion: item.prestacion,
        codigo: item.codigo,
        cantidad: item.cantidad,
        totalGeneral: item.totalGeneral,
        segmentoDetectado: item.segmentoDetectado,
        porcentajeHonorario,
        totalHonorarios,
        costosPools,
        totalPools,
        costoInsumosUnitario,
        totalInsumosDirectos,
        totalCostos,
        margenContribucion,
        porcentajeMargen,
        tieneReceta
      };
    });
  }, [prestaciones, configHonorarios, prestadoresHonorarios, recetasConPools]);

  // ============================================
  // FILTRADO Y ORDENAMIENTO
  // ============================================

  const prestacionesFiltradas = useMemo(() => {
    let resultado = [...prestacionesAgrupadas];

    if (busquedaLocal) {
      const term = busquedaLocal.toLowerCase();
      resultado = resultado.filter(p => 
        p.prestacion.toLowerCase().includes(term) ||
        p.codigo.toLowerCase().includes(term)
      );
    }

    if (filtroSegmento) {
      resultado = resultado.filter(p => p.segmentoDetectado === filtroSegmento);
    }

    resultado.sort((a, b) => {
      // Ordenamiento por código (string)
      if (ordenColumna === 'codigo') {
        const codigoA = a.codigo || '';
        const codigoB = b.codigo || '';
        const comparacion = codigoA.localeCompare(codigoB);
        return ordenDireccion === 'asc' ? comparacion : -comparacion;
      }
      
      // Ordenamiento por nombre de prestación (string)
      if (ordenColumna === 'prestacion') {
        const comparacion = a.prestacion.localeCompare(b.prestacion);
        return ordenDireccion === 'asc' ? comparacion : -comparacion;
      }
      
      // Ordenamiento numérico para el resto
      let valA: number, valB: number;
      
      switch (ordenColumna) {
        case 'cantidad': valA = a.cantidad; valB = b.cantidad; break;
        case 'facturado': valA = a.totalGeneral; valB = b.totalGeneral; break;
        case 'honorarios': valA = a.totalHonorarios; valB = b.totalHonorarios; break;
        case 'consultorio': valA = a.costosPools.consultorio * a.cantidad; valB = b.costosPools.consultorio * b.cantidad; break;
        case 'quirofano': valA = a.costosPools.quirofano * a.cantidad; valB = b.costosPools.quirofano * b.cantidad; break;
        case 'parabulbar': valA = a.costosPools.parabulbar * a.cantidad; valB = b.costosPools.parabulbar * b.cantidad; break;
        case 'rfg': valA = a.costosPools.rfg * a.cantidad; valB = b.costosPools.rfg * b.cantidad; break;
        case 'reesterilizables': valA = a.costosPools.reesterilizables * a.cantidad; valB = b.costosPools.reesterilizables * b.cantidad; break;
        case 'lavado': valA = a.costosPools.lavado * a.cantidad; valB = b.costosPools.lavado * b.cantidad; break;
        case 'insumos': valA = a.totalInsumosDirectos; valB = b.totalInsumosDirectos; break;
        case 'costos': valA = a.totalCostos; valB = b.totalCostos; break;
        case 'margen': valA = a.margenContribucion; valB = b.margenContribucion; break;
        case 'porcentaje': valA = a.porcentajeMargen; valB = b.porcentajeMargen; break;
        default: valA = a.totalGeneral; valB = b.totalGeneral;
      }

      return ordenDireccion === 'asc' ? valA - valB : valB - valA;
    });

    return resultado;
  }, [prestacionesAgrupadas, busquedaLocal, filtroSegmento, ordenColumna, ordenDireccion]);

  // ============================================
  // RESUMEN
  // ============================================

  const resumen = useMemo(() => {
    const data = prestacionesFiltradas;
    return {
      cantidadPrestaciones: data.length,
      cantidadRegistros: data.reduce((s, p) => s + p.cantidad, 0),
      totalFacturado: data.reduce((s, p) => s + p.totalGeneral, 0),
      totalHonorarios: data.reduce((s, p) => s + p.totalHonorarios, 0),
      totalPools: data.reduce((s, p) => s + p.totalPools, 0),
      totalInsumosDirectos: data.reduce((s, p) => s + p.totalInsumosDirectos, 0),
      totalCostos: data.reduce((s, p) => s + p.totalCostos, 0),
      totalMargen: data.reduce((s, p) => s + p.margenContribucion, 0)
    };
  }, [prestacionesFiltradas]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleOrdenar = (columna: string) => {
    if (ordenColumna === columna) {
      setOrdenDireccion(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setOrdenColumna(columna);
      setOrdenDireccion('desc');
    }
  };

  const toggleColumna = (col: keyof ColumnasVisibles) => {
    setColumnasVisibles(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const isLoading = loading || loadingHonorarios || loadingRecetas;

  // Contar columnas visibles para colspan
  const columnasPoolVisibles = Object.entries(columnasVisibles)
    .filter(([key, value]) => value && key !== 'honorarios' && key !== 'insumosDirectos')
    .length;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-full mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calculator className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Análisis Marginal</h1>
              <p className="text-sm text-gray-500">
                Prestaciones + Honorarios + Costos por Pool + Margen de Contribución
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
            
            <button
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Filter className="h-4 w-4" />
              Filtros
              {mostrarFiltros ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Filtros */}
        {mostrarFiltros && (
          <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
            <div className="grid grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
                <select
                  value={filtros.anio}
                  onChange={(e) => aplicarFiltros({ anio: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.anios.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mes</label>
                <select
                  value={filtros.mes}
                  onChange={(e) => aplicarFiltros({ mes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.meses.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              {/* ========== FIX: Obra Social - Corregido para usar objetos ========== */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Obra Social</label>
                <select
                  value={filtros.obraSocialId}
                  onChange={(e) => aplicarFiltros({ obraSocialId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Todas</option>
                  {opcionesFiltros.obrasSociales.map(os => (
                    <option key={os.id} value={os.id}>{os.nombre}</option>
                  ))}
                </select>
              </div>
              {/* ========== FIX: Prestador - Corregido para usar objetos ========== */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prestador</label>
                <select
                  value={filtros.prestadorId}
                  onChange={(e) => aplicarFiltros({ prestadorId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Todos</option>
                  {opcionesFiltros.prestadores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
                <select
                  value={filtroSegmento}
                  onChange={(e) => setFiltroSegmento(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Todos</option>
                  <option value="Cirugias">Cirugías</option>
                  <option value="Estudios">Estudios</option>
                  <option value="Consultas">Consultas</option>
                  <option value="Sin clasificar">Sin clasificar</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={limpiarFiltros}
                  className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                >
                  <X className="h-4 w-4" />
                  Limpiar
                </button>
                <button
                  onClick={refetch}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualizar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cards de resumen */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Σ Total Facturado</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(resumen.totalFacturado)}</p>
                <p className="text-xs text-gray-400">{resumen.cantidadRegistros} atenciones</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Σ Honorarios</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(resumen.totalHonorarios)}</p>
                <p className="text-xs text-gray-400">
                  {resumen.totalFacturado > 0 ? formatPercent(resumen.totalHonorarios / resumen.totalFacturado * 100) : '0%'} del total
                </p>
              </div>
              <Percent className="h-8 w-8 text-orange-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Σ Total Costos</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(resumen.totalCostos)}</p>
                <p className="text-xs text-gray-400">Honorarios + Pools + Insumos</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Σ Margen Contrib.</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(resumen.totalMargen)}</p>
                <p className="text-xs text-gray-400">
                  {resumen.totalFacturado > 0 ? formatPercent(resumen.totalMargen / resumen.totalFacturado * 100) : '0%'} del total
                </p>
              </div>
              <PiggyBank className="h-8 w-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Prestaciones</p>
                <p className="text-xl font-bold text-gray-900">{resumen.cantidadPrestaciones}</p>
                <p className="text-xs text-gray-400">tipos únicos</p>
              </div>
              <FileText className="h-8 w-8 text-gray-500" />
            </div>
          </div>
        </div>

        {/* Configuración de columnas */}
        <div className="bg-white rounded-xl shadow-sm border mb-4">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar prestación..."
                  value={busquedaLocal}
                  onChange={(e) => setBusquedaLocal(e.target.value)}
                  className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64"
                />
              </div>
              <span className="text-sm text-gray-500">
                {prestacionesFiltradas.length} registros encontrados
              </span>
            </div>
            
            <div className="relative">
              <button
                onClick={() => setMostrarConfigColumnas(!mostrarConfigColumnas)}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                <Settings className="h-4 w-4" />
                Columnas
                <ChevronDown className="h-4 w-4" />
              </button>
              
              {mostrarConfigColumnas && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 p-4 w-64">
                  <p className="font-medium text-sm text-gray-700 mb-3">Columnas de Pools</p>
                  <div className="space-y-2">
                    {[
                      { key: 'honorarios', label: 'Honorarios' },
                      { key: 'consultorio', label: 'Pool Consultorio' },
                      { key: 'quirofano', label: 'Pool Quirófano' },
                      { key: 'parabulbar', label: 'Kit Parabulbar' },
                      { key: 'rfg', label: 'Kit RFG' },
                      { key: 'reesterilizables', label: 'Re Esterilizables' },
                      { key: 'lavado', label: 'Re Est. + Lavado' },
                      { key: 'faco', label: 'Kit Faco' },
                      { key: 'implante', label: 'Implante' },
                      { key: 'medicamentos', label: 'Medicamentos' },
                      { key: 'descartables', label: 'Descartables' },
                      { key: 'insumosDirectos', label: 'Insumos Directos' }
                    ].map(col => (
                      <label key={col.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={columnasVisibles[col.key as keyof ColumnasVisibles]}
                          onChange={() => toggleColumna(col.key as keyof ColumnasVisibles)}
                          className="rounded text-blue-600"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th 
                    className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 w-20"
                    onClick={() => handleOrdenar('codigo')}
                    title="Ordenar por código"
                  >
                    <div className="flex items-center gap-1">
                      Código
                      {ordenColumna === 'codigo' && (
                        ordenDireccion === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleOrdenar('prestacion')}
                    title="Ordenar por nombre"
                  >
                    <div className="flex items-center gap-1">
                      Prestación
                      {ordenColumna === 'prestacion' && (
                        ordenDireccion === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleOrdenar('cantidad')}
                  >
                    Cant.
                  </th>
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleOrdenar('facturado')}
                  >
                    Σ Total
                  </th>
                  
                  {columnasVisibles.honorarios && (
                    <th 
                      className="px-3 py-3 text-right text-xs font-medium text-orange-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('honorarios')}
                    >
                      Σ Honor.
                    </th>
                  )}
                  
                  {columnasVisibles.consultorio && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('consultorio')}
                      title="Pool Insumos Generales Consultorio"
                    >
                      Consult.
                    </th>
                  )}
                  
                  {columnasVisibles.quirofano && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('quirofano')}
                      title="Pool Insumos Generales Quirófano"
                    >
                      Quiróf.
                    </th>
                  )}
                  
                  {columnasVisibles.parabulbar && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('parabulbar')}
                      title="Kit Parabulbar"
                    >
                      Parabul.
                    </th>
                  )}
                  
                  {columnasVisibles.rfg && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('rfg')}
                      title="Kit RFG"
                    >
                      RFG
                    </th>
                  )}
                  
                  {columnasVisibles.reesterilizables && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('reesterilizables')}
                      title="Re Esterilizables"
                    >
                      ReEster.
                    </th>
                  )}
                  
                  {columnasVisibles.lavado && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('lavado')}
                      title="Re Esterilizable + Lavado"
                    >
                      +Lavado
                    </th>
                  )}
                  
                  {columnasVisibles.faco && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      title="Kit Faco"
                    >
                      Faco
                    </th>
                  )}
                  
                  {columnasVisibles.implante && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      title="Implante"
                    >
                      Implant.
                    </th>
                  )}
                  
                  {columnasVisibles.medicamentos && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      title="Medicamentos"
                    >
                      Medic.
                    </th>
                  )}
                  
                  {columnasVisibles.descartables && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-purple-600 uppercase cursor-pointer hover:bg-gray-100"
                      title="Descartables"
                    >
                      Descart.
                    </th>
                  )}
                  
                  {columnasVisibles.insumosDirectos && (
                    <th 
                      className="px-2 py-3 text-right text-xs font-medium text-green-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleOrdenar('insumos')}
                      title="Insumos Directos"
                    >
                      Ins.Dir.
                    </th>
                  )}
                  
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-red-600 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleOrdenar('costos')}
                  >
                    Σ Costos
                  </th>
                  <th 
                    className="px-3 py-3 text-right text-xs font-medium text-blue-600 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleOrdenar('margen')}
                  >
                    Margen
                  </th>
                  <th 
                    className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleOrdenar('porcentaje')}
                  >
                    %
                  </th>
                </tr>
              </thead>
              
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={20} className="px-4 py-8 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                      <p className="text-gray-500 mt-2">Cargando datos...</p>
                    </td>
                  </tr>
                ) : prestacionesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-4 py-8 text-center text-gray-500">
                      No hay datos para mostrar
                    </td>
                  </tr>
                ) : (
                  prestacionesFiltradas.map((item, idx) => (
                    <tr 
                      key={idx} 
                      className={`hover:bg-gray-50 ${!item.tieneReceta ? 'bg-yellow-50' : ''}`}
                    >
                      {/* Columna Código */}
                      <td className="px-2 py-2 text-center">
                        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                          {item.codigo || '-'}
                        </span>
                      </td>
                      
                      {/* Columna Prestación */}
                      <td className="px-4 py-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate" title={item.prestacion}>
                              {item.prestacion.length > 50 ? item.prestacion.substring(0, 50) + '...' : item.prestacion}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${getSegmentoColor(item.segmentoDetectado)}`}>
                                {item.segmentoDetectado}
                              </span>
                              {!item.tieneReceta && (
                                <span className="text-xs text-yellow-600" title="Sin receta configurada">⚠️</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-3 py-2 text-center text-sm font-medium">{item.cantidad}</td>
                      <td className="px-3 py-2 text-right text-sm font-medium">{formatCurrency(item.totalGeneral)}</td>
                      
                      {columnasVisibles.honorarios && (
                        <td className="px-3 py-2 text-right text-sm text-orange-600">
                          {formatCurrency(item.totalHonorarios)}
                          <span className="text-xs text-gray-400 block">{formatPercent(item.porcentajeHonorario)}</span>
                        </td>
                      )}
                      
                      {columnasVisibles.consultorio && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.consultorio > 0 ? formatCurrency(item.costosPools.consultorio * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.quirofano && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.quirofano > 0 ? formatCurrency(item.costosPools.quirofano * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.parabulbar && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.parabulbar > 0 ? formatCurrency(item.costosPools.parabulbar * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.rfg && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.rfg > 0 ? formatCurrency(item.costosPools.rfg * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.reesterilizables && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.reesterilizables > 0 ? formatCurrency(item.costosPools.reesterilizables * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.lavado && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.lavado > 0 ? formatCurrency(item.costosPools.lavado * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.faco && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.faco > 0 ? formatCurrency(item.costosPools.faco * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.implante && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.implante > 0 ? formatCurrency(item.costosPools.implante * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.medicamentos && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.medicamentos > 0 ? formatCurrency(item.costosPools.medicamentos * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.descartables && (
                        <td className="px-2 py-2 text-right text-sm text-purple-600">
                          {item.costosPools.descartables > 0 ? formatCurrency(item.costosPools.descartables * item.cantidad) : '-'}
                        </td>
                      )}
                      
                      {columnasVisibles.insumosDirectos && (
                        <td className="px-2 py-2 text-right text-sm text-green-600">
                          {item.totalInsumosDirectos > 0 ? formatCurrency(item.totalInsumosDirectos) : '-'}
                        </td>
                      )}
                      
                      <td className="px-3 py-2 text-right text-sm font-medium text-red-600">
                        {formatCurrency(item.totalCostos)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold">
                        <span className={getMargenColor(item.porcentajeMargen)}>
                          {formatCurrency(item.margenContribucion)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-sm">
                        <span className={`font-medium ${getMargenColor(item.porcentajeMargen)}`}>
                          {formatPercent(item.porcentajeMargen)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              
              {prestacionesFiltradas.length > 0 && (
                <tfoot className="bg-gray-100 border-t-2">
                  <tr className="font-bold text-sm">
                    <td colSpan={2} className="px-4 py-3">TOTALES ({prestacionesFiltradas.length} prácticas)</td>
                    <td className="px-3 py-3 text-center">{resumen.cantidadRegistros}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(resumen.totalFacturado)}</td>
                    
                    {columnasVisibles.honorarios && (
                      <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(resumen.totalHonorarios)}</td>
                    )}
                    
                    {columnasVisibles.consultorio && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.consultorio * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.quirofano && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.quirofano * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.parabulbar && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.parabulbar * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.rfg && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.rfg * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.reesterilizables && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.reesterilizables * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.lavado && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.lavado * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.faco && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.faco * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.implante && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.implante * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.medicamentos && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.medicamentos * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.descartables && (
                      <td className="px-2 py-3 text-right text-purple-600">
                        {formatCurrency(prestacionesFiltradas.reduce((s, p) => s + p.costosPools.descartables * p.cantidad, 0))}
                      </td>
                    )}
                    
                    {columnasVisibles.insumosDirectos && (
                      <td className="px-2 py-3 text-right text-green-600">{formatCurrency(resumen.totalInsumosDirectos)}</td>
                    )}
                    
                    <td className="px-3 py-3 text-right text-red-600">{formatCurrency(resumen.totalCostos)}</td>
                    <td className="px-3 py-3 text-right text-green-600">{formatCurrency(resumen.totalMargen)}</td>
                    <td className="px-2 py-3 text-right">
                      {resumen.totalFacturado > 0 ? formatPercent(resumen.totalMargen / resumen.totalFacturado * 100) : '0%'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Leyenda */}
        <div className="p-3 bg-gray-50 rounded-lg border flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>⚠️ = Sin receta configurada</span>
            <span className="text-green-600">● Verde = Margen ≥50%</span>
            <span className="text-blue-600">● Azul = Margen 30-50%</span>
            <span className="text-yellow-600">● Amarillo = Margen 0-30%</span>
            <span className="text-red-600">● Rojo = Margen negativo</span>
          </div>
          <span>P. Famá | Desarrollo</span>
        </div>
      </div>
    </div>
  );
};

export default AnalisisMarginalPage;
