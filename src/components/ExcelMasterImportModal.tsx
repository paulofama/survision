import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { InsumoSegmento, ExcelInsumoRow, ImportacionExcelResult } from '../types';

interface ExcelMasterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ExcelInsumoRow[], segmento: InsumoSegmento) => Promise<ImportacionExcelResult>;
}

// Mapeo de nombres del Excel a valores de enum válidos
const SEGMENTO_MAPPING: Record<string, InsumoSegmento> = {
  'Insumos Generales en Consultorio': 'IG En Consultorio',
  'Insumos Generales en Quirófano': 'IG En Quirófano',
  'Kit Parabulbar': 'Kit Parabulbar',
  'KIT para RFG': 'KIT para RFG',
  'Implantes Quirúrgicos': 'Implante',
  'Re Esterilizable Catarara': 'Re Esterilizables',
  'Re Esterilizable Retina': 'Re Esterilizables',
  'KIT SEDACION': 'Medicamentos',
  'INSUMOS DESCARTABLES': 'Descartables',
  'Insumos Descartables': 'Descartables',
  'Descartables': 'Descartables',
  'Re Esterilizable + Lavado': 'Re Esterilizable + Lavado',
  'Kit De Faco': 'Kit De Faco',
  'IG Generales en Quirófano': 'IG En Quirófano',
  'Generales en Quirófano': 'IG En Quirófano',
  'IG En Quirófano': 'IG En Quirófano',
  'IG En Consultorio': 'IG En Consultorio',
  'Generales en Consultorio': 'IG En Consultorio',
  // Si el Excel tiene una hoja llamada "Hoja1", usaremos el segmento más común
  'Hoja1': 'Descartables'
};

// Función para detectar automáticamente el segmento basado en el contenido
const detectarSegmentoPorContenido = (descripcion: string): InsumoSegmento => {
  const desc = descripcion.toLowerCase();
  
  if (desc.includes('descartable') || desc.includes('jeringa') || desc.includes('gasa')) {
    return 'Descartables';
  }
  if (desc.includes('medicamento') || desc.includes('sedacion') || desc.includes('anestesia')) {
    return 'Medicamentos';
  }
  if (desc.includes('parabulbar') || desc.includes('kit')) {
    return 'Kit Parabulbar';
  }
  if (desc.includes('implante') || desc.includes('lente')) {
    return 'Implante';
  }
  if (desc.includes('quirofano') || desc.includes('quirúfano') || desc.includes('cirugia')) {
    return 'IG En Quirófano';
  }
  if (desc.includes('consultorio') || desc.includes('consulta')) {
    return 'IG En Consultorio';
  }
  if (desc.includes('esteriliz')) {
    return 'Re Esterilizables';
  }
  
  // Por defecto, si no se puede detectar
  return 'Descartables';
};

const ExcelMasterImportModal: React.FC<ExcelMasterImportModalProps> = ({ 
  isOpen, 
  onClose, 
  onImport 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [results, setResults] = useState<Record<string, ImportacionExcelResult>>({});
  const [currentSegment, setCurrentSegment] = useState<string>('');

  const processExcelFile = useCallback(async () => {
    if (!file) {
      alert('Por favor selecciona un archivo Excel');
      return;
    }

    try {
      setImporting(true);
      setProgress('Leyendo archivo Excel...');
      setResults({});

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'buffer' });
      
      console.log(`📊 Hojas encontradas:`, workbook.SheetNames);
      
      // Procesar todas las hojas
      const processedData: Record<string, ExcelInsumoRow[]> = {};
      
      for (const sheetName of workbook.SheetNames) {
        console.log(`🔄 Procesando hoja: ${sheetName}`);
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (jsonData.length < 2) {
          console.log(`⚠️ Hoja ${sheetName} está vacía o solo tiene encabezados`);
          continue;
        }

        console.log(`📋 Estructura de datos encontrada:`, {
          filas: jsonData.length,
          primeraFila: jsonData[0],
          segundaFila: jsonData[1]
        });

        // Detectar estructura de columnas automáticamente
        const headers = jsonData[0];
        console.log(`📄 Headers detectados:`, headers);

        // Mapear nombre de hoja a segmento válido
        let segmento = SEGMENTO_MAPPING[sheetName];
        if (!segmento) {
          console.log(`⚠️ Hoja "${sheetName}" no tiene mapeo directo, usando detección automática`);
          segmento = 'Descartables'; // Por defecto
        }
        
        // Procesar filas de datos
        const segmentData: ExcelInsumoRow[] = [];
        
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          
          if (row && row.length >= 4 && row[0] && row[1]) {
            try {
              // Detectar el segmento basado en la descripción si es "Hoja1"
              const descripcionCompleta = String(row[1] || '').trim();
              if (sheetName === 'Hoja1' && descripcionCompleta) {
                segmento = detectarSegmentoPorContenido(descripcionCompleta);
              }

              const insumo: ExcelInsumoRow = {
                codigo: String(row[0] || '').trim(),
                descripcion: descripcionCompleta,
                precio_unitario: parseFloat(String(row[2] || '0').replace(',', '.')) || 0,
                unidad: String(row[3] || 'Unidad').trim(),
                consumo: String(row[4] || 'Por Procedimiento').trim(),
                cantidad: parseFloat(String(row[5] || '1').replace(',', '.')) || 1
              };

              // Validaciones básicas
              if (insumo.codigo && insumo.descripcion && insumo.precio_unitario > 0) {
                segmentData.push(insumo);
              } else {
                console.warn(`⚠️ Fila ${i + 1} ignorada - datos incompletos:`, {
                  codigo: insumo.codigo,
                  descripcion: insumo.descripcion,
                  precio: insumo.precio_unitario
                });
              }
            } catch (error) {
              console.error(`❌ Error procesando fila ${i + 1}:`, error, row);
            }
          }
        }

        if (segmentData.length > 0) {
          // Agrupar por segmento detectado si hay múltiples
          if (!processedData[segmento]) {
            processedData[segmento] = [];
          }
          processedData[segmento] = processedData[segmento].concat(segmentData);
          console.log(`✅ Segmento "${segmento}": ${segmentData.length} insumos procesados`);
        }
      }

      console.log(`📊 Resumen de datos procesados:`, Object.keys(processedData).map(k => `${k}: ${processedData[k].length} items`));

      if (Object.keys(processedData).length === 0) {
        throw new Error('No se encontraron datos válidos en el archivo Excel. Verifique la estructura del archivo.');
      }

      // Procesar cada segmento por separado (CORRECCIÓN CRÍTICA)
      const results: Record<string, ImportacionExcelResult> = {};
      
      for (const [segmento, data] of Object.entries(processedData)) {
        setCurrentSegment(segmento);
        console.log(`📊 Procesando segmento: ${segmento} con ${data.length} elementos`);
        
        try {
          // ✅ UNA SOLA LLAMADA CON TODOS LOS DATOS DEL SEGMENTO
          const result = await onImport(data, segmento as InsumoSegmento);
          results[segmento] = result;
          
          console.log(`✅ Segmento ${segmento} completado:`, result);
        } catch (error) {
          console.error(`❌ Error importando segmento ${segmento}:`, error);
          results[segmento] = {
            exitosos: 0,
            errores: data.length,
            duplicados: 0,
            detalles: [{
              fila: 1,
              error: error instanceof Error ? error.message : 'Error desconocido',
              insumo: data[0]
            }]
          };
        }
      }

      setResults(results);
      setProgress('¡Importación completada!');
      
      // Mostrar resumen final
      const totalExitosos = Object.values(results).reduce((sum, r) => sum + r.exitosos, 0);
      const totalDuplicados = Object.values(results).reduce((sum, r) => sum + r.duplicados, 0);
      const totalErrores = Object.values(results).reduce((sum, r) => sum + r.errores, 0);
      
      console.log(`🎉 IMPORTACIÓN COMPLETADA - Total: ${totalExitosos} exitosos, ${totalDuplicados} duplicados, ${totalErrores} errores`);

      if (totalExitosos === 0 && totalErrores > 0) {
        setProgress(`Importación completada con errores. ${totalErrores} elementos no pudieron ser importados.`);
      }

    } catch (error) {
      console.error('❌ Error en importación:', error);
      setProgress('Error en la importación: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    } finally {
      setImporting(false);
      setCurrentSegment('');
    }
  }, [file, onImport]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults({});
      setProgress('');
    }
  };

  const handleReset = () => {
    setFile(null);
    setResults({});
    setProgress('');
    setCurrentSegment('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Importación Masiva desde Excel</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={importing}
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label htmlFor="excel-file" className="block text-sm font-medium text-gray-700 mb-2">
            Seleccionar archivo Excel (.xlsx)
          </label>
          <input
            type="file"
            id="excel-file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={importing}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
        </div>

        {file && (
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="text-sm">
              <strong>Archivo seleccionado:</strong> {file.name}
            </p>
            <p className="text-xs text-gray-600">
              Tamaño: {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}

        {progress && (
          <div className={`mb-4 p-3 rounded ${progress.includes('Error') || progress.includes('errores') ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
            <p>
              {progress}
              {currentSegment && ` - Procesando: ${currentSegment}`}
            </p>
          </div>
        )}

        {Object.keys(results).length > 0 && (
          <div className="mb-4 space-y-2">
            <h3 className="text-lg font-medium">Resultados por Segmento:</h3>
            {Object.entries(results).map(([segmento, result]) => (
              <div key={segmento} className="p-3 bg-gray-50 rounded">
                <h4 className="font-medium">{segmento}</h4>
                <div className="text-sm text-gray-600 grid grid-cols-3 gap-4">
                  <span className="text-green-600">✅ Exitosos: {result.exitosos}</span>
                  <span className="text-yellow-600">⚠️ Duplicados: {result.duplicados}</span>
                  <span className="text-red-600">❌ Errores: {result.errores}</span>
                </div>
                {result.errores > 0 && result.detalles && result.detalles.length > 0 && (
                  <div className="mt-2 text-xs text-red-600">
                    <p><strong>Primer error:</strong> {result.detalles[0].error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={handleReset}
            disabled={importing}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Limpiar
          </button>
          <button
            onClick={processExcelFile}
            disabled={!file || importing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? 'Importando...' : 'Importar Datos'}
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          <p><strong>Formato esperado:</strong> Excel con columnas: Código | Descripción | Precio Unitario | Unidad | Consumo | Cantidad</p>
          <p><strong>Segmentos válidos:</strong> Descartables, Medicamentos, IG En Consultorio, IG En Quirófano, etc.</p>
          <p><strong>Detección automática:</strong> Si la hoja se llama "Hoja1", se detectará el segmento por el contenido</p>
        </div>
      </div>
    </div>
  );
};

export default ExcelMasterImportModal;
