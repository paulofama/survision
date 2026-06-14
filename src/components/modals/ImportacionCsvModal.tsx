// ============================================
// MODAL IMPORTACIÓN CSV - PRÁCTICAS REALIZADAS
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import React, { useState, useRef } from 'react';
import { 
  XIcon, 
  UploadIcon, 
  FileSpreadsheetIcon,
  CheckIcon,
  AlertTriangleIcon,
  BarChart3Icon,
  CalendarIcon
} from 'lucide-react';

// ============================================
// TIPOS Y INTERFACES
// ============================================

interface PrestacionRealizada {
  codigo?: string;
  prestacion_id?: string;
  nombre_csv: string;
  nombre_bd?: string;
  mes: string;
  cantidad: number;
  coseguro_promedio: number;
  cobertura_promedio: number;
  total_promedio: number;
  total_facturado: number;
  similitud?: number;
  mapeado: boolean;
}

interface EstadisticasImportacion {
  totalRegistros: number;
  mesesEncontrados: string[];
  prestacionesUnicas: number;
  totalFacturado: number;
}

interface ImportacionCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  prestaciones: any[]; // Lista de prestaciones de BD
  onImportSuccess: (estadisticas: EstadisticasImportacion) => void;
}

// ============================================
// UTILIDADES FUZZY MATCHING
// ============================================

/**
 * Calcula similitud entre dos strings usando algoritmo Levenshtein
 */
function calcularSimilitud(str1: string, str2: string): number {
  const matriz: number[][] = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matriz[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matriz[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const costo = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }

  const distancia = matriz[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : (maxLen - distancia) / maxLen;
}

/**
 * Normaliza texto para comparación
 */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[áäàâã]/g, 'a')
    .replace(/[éëèê]/g, 'e')
    .replace(/[íïìî]/g, 'i')
    .replace(/[óöòôõ]/g, 'o')
    .replace(/[úüùû]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca la mejor coincidencia para una prestación
 */
function buscarMejorCoincidencia(nombreCsv: string, prestaciones: any[]): any {
  const nombreNormalizado = normalizarTexto(nombreCsv);
  let mejorCoincidencia = null;
  let mejorSimilitud = 0;

  for (const prestacion of prestaciones) {
    const nombreBdNormalizado = normalizarTexto(prestacion.practica || '');
    const similitud = calcularSimilitud(nombreNormalizado, nombreBdNormalizado);
    
    if (similitud > mejorSimilitud && similitud > 0.6) { // Umbral de similitud 60%
      mejorSimilitud = similitud;
      mejorCoincidencia = {
        ...prestacion,
        similitud
      };
    }
  }

  return mejorCoincidencia;
}

// ============================================
// COMPONENTE MODAL
// ============================================

const ImportacionCsvModal: React.FC<ImportacionCsvModalProps> = ({
  isOpen,
  onClose,
  prestaciones = [],
  onImportSuccess
}) => {
  // Estados del componente
  const [archivo, setArchivo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState<'seleccion' | 'procesando' | 'revision' | 'completado'>('seleccion');
  const [datosProcessed, setDatosProcessed] = useState<PrestacionRealizada[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasImportacion | null>(null);
  const [error, setError] = useState('');
  const [mesSeleccionado, setMesSeleccionado] = useState('');
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================
  // FUNCIONES DE PROCESAMIENTO
  // ============================================

  /**
   * Procesa el CSV y extrae datos por mes
   */
  const procesarCSV = async (contenido: string): Promise<PrestacionRealizada[]> => {
    const lineas = contenido.split('\n').filter(linea => linea.trim());
    const headers = lineas[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    // Verificar headers requeridos
    const headersRequeridos = ['Fecha', 'Prestacion', 'Coseguro', 'Cobertura', 'Total'];
    const headersFaltantes = headersRequeridos.filter(h => !headers.includes(h));
    
    if (headersFaltantes.length > 0) {
      throw new Error(`Headers faltantes en CSV: ${headersFaltantes.join(', ')}`);
    }

    // Procesar datos
    const registros: any[] = [];
    
    for (let i = 1; i < lineas.length; i++) {
      const valores = lineas[i].split(',').map(v => v.replace(/"/g, '').trim());
      const registro: any = {};
      
      headers.forEach((header, index) => {
        registro[header] = valores[index] || '';
      });
      
      // Validar y convertir
      if (registro.Fecha && registro.Prestacion) {
        const fecha = new Date(registro.Fecha);
        if (!isNaN(fecha.getTime())) {
          registro.mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
          registro.coseguro = parseFloat(registro.Coseguro) || 0;
          registro.cobertura = parseFloat(registro.Cobertura) || 0;
          registro.total = parseFloat(registro.Total) || 0;
          registros.push(registro);
        }
      }
    }

    // Agrupar por prestación y mes
    const agrupados = new Map<string, any>();
    
    registros.forEach(registro => {
      const clave = `${registro.Prestacion}|${registro.mes}`;
      
      if (agrupados.has(clave)) {
        const existente = agrupados.get(clave);
        existente.cantidad += 1;
        existente.coseguros.push(registro.coseguro);
        existente.coberturas.push(registro.cobertura);
        existente.totales.push(registro.total);
      } else {
        agrupados.set(clave, {
          nombre_csv: registro.Prestacion,
          mes: registro.mes,
          cantidad: 1,
          coseguros: [registro.coseguro],
          coberturas: [registro.cobertura],
          totales: [registro.total]
        });
      }
    });

    // Calcular promedios y buscar coincidencias
    const resultados: PrestacionRealizada[] = [];
    
    for (const [, grupo] of agrupados) {
      const coseguro_promedio = grupo.coseguros.reduce((a: number, b: number) => a + b, 0) / grupo.coseguros.length;
      const cobertura_promedio = grupo.coberturas.reduce((a: number, b: number) => a + b, 0) / grupo.coberturas.length;
      const total_promedio = grupo.totales.reduce((a: number, b: number) => a + b, 0) / grupo.totales.length;
      const total_facturado = grupo.totales.reduce((a: number, b: number) => a + b, 0);

      // Buscar coincidencia con fuzzy matching
      const coincidencia = buscarMejorCoincidencia(grupo.nombre_csv, prestaciones);
      
      resultados.push({
        nombre_csv: grupo.nombre_csv,
        mes: grupo.mes,
        cantidad: grupo.cantidad,
        coseguro_promedio: Math.round(coseguro_promedio * 100) / 100,
        cobertura_promedio: Math.round(cobertura_promedio * 100) / 100,
        total_promedio: Math.round(total_promedio * 100) / 100,
        total_facturado: Math.round(total_facturado * 100) / 100,
        codigo: coincidencia?.codigo,
        prestacion_id: coincidencia?.id,
        nombre_bd: coincidencia?.practica,
        similitud: coincidencia?.similitud || 0,
        mapeado: !!coincidencia
      });
    }

    return resultados.sort((a, b) => b.cantidad - a.cantidad);
  };

  /**
   * Maneja la selección de archivo
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Por favor selecciona un archivo CSV válido');
      return;
    }

    setArchivo(file);
    setError('');
    setPaso('procesando');
    setLoading(true);

    try {
      const contenido = await file.text();
      const datos = await procesarCSV(contenido);
      
      // Extraer meses disponibles
      const mesesUnicos = [...new Set(datos.map(d => d.mes))].sort().reverse();
      setMesesDisponibles(mesesUnicos);
      setMesSeleccionado(mesesUnicos[0] || '');
      
      // Calcular estadísticas
      const stats: EstadisticasImportacion = {
        totalRegistros: datos.length,
        mesesEncontrados: mesesUnicos,
        prestacionesUnicas: new Set(datos.map(d => d.nombre_csv)).size,
        totalFacturado: datos.reduce((sum, d) => sum + d.total_facturado, 0)
      };

      setDatosProcessed(datos);
      setEstadisticas(stats);
      setPaso('revision');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando archivo');
      setPaso('seleccion');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ejecuta la importación final
   */
  const ejecutarImportacion = async () => {
    if (!mesSeleccionado) {
      setError('Selecciona un mes para importar');
      return;
    }

    setLoading(true);
    try {
      const datosMes = datosProcessed.filter(d => d.mes === mesSeleccionado && d.mapeado);
      
      if (datosMes.length === 0) {
        throw new Error('No hay datos mapeados para el mes seleccionado');
      }

      // TODO: Aquí se haría la llamada a la API para guardar en BD
      // await importarPrestacionesRealizadas(datosMes, mesSeleccionado);

      setEstadisticas({
        totalRegistros: datosMes.length,
        mesesEncontrados: [mesSeleccionado],
        prestacionesUnicas: datosMes.length,
        totalFacturado: datosMes.reduce((sum, d) => sum + d.total_facturado, 0)
      });

      setPaso('completado');
      
      // Notificar éxito al componente padre
      if (onImportSuccess && estadisticas) {
        onImportSuccess(estadisticas);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la importación');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resetea el modal
   */
  const resetModal = () => {
    setArchivo(null);
    setPaso('seleccion');
    setDatosProcessed([]);
    setEstadisticas(null);
    setError('');
    setMesesDisponibles([]);
    setMesSeleccionado('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Cierra el modal
   */
  const handleClose = () => {
    resetModal();
    onClose();
  };

  /**
   * Formatea moneda
   */
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // ============================================
  // RENDER
  // ============================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-screen overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <FileSpreadsheetIcon className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Importar Prácticas Realizadas
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Contenido por pasos */}
        <div className="p-6">
          {/* Paso 1: Selección de archivo */}
          {paso === 'seleccion' && (
            <div className="text-center">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12">
                <FileSpreadsheetIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Selecciona archivo CSV
                </h3>
                <p className="text-gray-600 mb-6">
                  Archivo con registros de prácticas realizadas para análisis marginal
                </p>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2 mx-auto"
                >
                  <UploadIcon className="h-5 w-5" />
                  <span>Cargar Archivo CSV</span>
                </button>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}
              </div>
              
              {/* Información del formato */}
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Formato esperado:</h4>
                <p className="text-sm text-blue-800">
                  CSV con columnas: Fecha, Prestacion, Coseguro, Cobertura, Total
                </p>
              </div>
            </div>
          )}

          {/* Paso 2: Procesando */}
          {paso === 'procesando' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Procesando archivo...
              </h3>
              <p className="text-gray-600">
                Analizando datos y mapeando prestaciones
              </p>
            </div>
          )}

          {/* Paso 3: Revisión */}
          {paso === 'revision' && estadisticas && (
            <div>
              {/* Estadísticas generales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">
                    {estadisticas.totalRegistros}
                  </div>
                  <div className="text-sm text-blue-800">Registros procesados</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">
                    {estadisticas.mesesEncontrados.length}
                  </div>
                  <div className="text-sm text-green-800">Meses disponibles</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">
                    {estadisticas.prestacionesUnicas}
                  </div>
                  <div className="text-sm text-purple-800">Prestaciones únicas</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(estadisticas.totalFacturado)}
                  </div>
                  <div className="text-sm text-orange-800">Total facturado</div>
                </div>
              </div>

              {/* Selector de mes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar mes a importar:
                </label>
                <div className="flex items-center space-x-4">
                  <select
                    value={mesSeleccionado}
                    onChange={(e) => setMesSeleccionado(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    {mesesDisponibles.map(mes => (
                      <option key={mes} value={mes}>
                        {new Date(mes + '-01').toLocaleDateString('es-AR', { 
                          year: 'numeric', 
                          month: 'long' 
                        })}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-600">
                    {datosProcessed.filter(d => d.mes === mesSeleccionado).length} registros
                  </span>
                </div>
              </div>

              {/* Preview de datos */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <h4 className="font-medium text-gray-900">
                    Preview - {mesSeleccionado} 
                    ({datosProcessed.filter(d => d.mes === mesSeleccionado && d.mapeado).length} mapeados)
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Estado</th>
                        <th className="px-4 py-2 text-left">Prestación CSV</th>
                        <th className="px-4 py-2 text-left">Coincidencia BD</th>
                        <th className="px-4 py-2 text-right">Cantidad</th>
                        <th className="px-4 py-2 text-right">Facturado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datosProcessed
                        .filter(d => d.mes === mesSeleccionado)
                        .slice(0, 10)
                        .map((item, index) => (
                          <tr key={index} className="border-t border-gray-200">
                            <td className="px-4 py-2">
                              {item.mapeado ? (
                                <CheckIcon className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertTriangleIcon className="h-4 w-4 text-yellow-600" />
                              )}
                            </td>
                            <td className="px-4 py-2 font-medium">
                              {item.nombre_csv}
                            </td>
                            <td className="px-4 py-2">
                              {item.mapeado ? (
                                <div>
                                  <div className="font-medium">{item.nombre_bd}</div>
                                  <div className="text-xs text-gray-500">
                                    {item.codigo} ({(item.similitud! * 100).toFixed(0)}%)
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">Sin coincidencia</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">{item.cantidad}</td>
                            <td className="px-4 py-2 text-right">
                              {formatCurrency(item.total_facturado)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Paso 4: Completado */}
          {paso === 'completado' && estadisticas && (
            <div className="text-center">
              <CheckIcon className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                ¡Importación Exitosa!
              </h3>
              <p className="text-gray-600 mb-6">
                Se importaron {estadisticas.totalRegistros} registros del mes {mesSeleccionado}
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {estadisticas.prestacionesUnicas}
                    </div>
                    <div className="text-sm text-green-800">Prestaciones actualizadas</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(estadisticas.totalFacturado)}
                    </div>
                    <div className="text-sm text-green-800">Total procesado</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          {paso === 'revision' && (
            <>
              <button
                onClick={() => setPaso('seleccion')}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                onClick={ejecutarImportacion}
                disabled={loading || !mesSeleccionado}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center space-x-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <BarChart3Icon className="h-4 w-4" />
                )}
                <span>Importar Datos</span>
              </button>
            </>
          )}
          
          {paso === 'completado' && (
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Finalizar
            </button>
          )}
          
          {(paso === 'seleccion' || paso === 'procesando') && (
            <button
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportacionCsvModal;