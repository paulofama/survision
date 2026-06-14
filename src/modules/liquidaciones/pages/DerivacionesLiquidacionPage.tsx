// ============================================
// PÃGINA: LIQUIDACIÃ“N DE DERIVACIONES
// Sistema de Costos - Instituto Dr. Mercado
// ============================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Users,
  DollarSign,
  Filter,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  Settings,
  Percent,
  Save,
  X,
  ChevronDown,
  Printer,
  TrendingUp,
  MessageCircle,
  Phone,
  Send,
  Copy,
  Image,
  Check
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/apiConfig';
import jsPDF from 'jspdf';

// ============================================
// TIPOS
// ============================================

interface Derivador {
  id: number;
  nombre: string;
}

interface DerivadorConfig {
  id: string;
  entder_id: number;
  nombre: string;
  porcentaje: number;
  activo: boolean;
  observaciones: string | null;
  telefono: string | null;
}

interface RegistroDerivacion {
  atencion_id: number;
  fecha: string;
  apellido_nombre: string;
  prestador: string;
  derivador_id: number;
  derivador: string;
  prestacion: string;
  prestacion_codigo: string;
  coseguro: number;
}

interface ResumenDerivador {
  derivador_id: number;
  derivador: string;
  cant_atenciones: number;
  total_coseguro: number;
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const MESES = [
  { value: '', label: 'Todos' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const getNombreMes = (mes: number): string => {
  const nombres = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return nombres[mes] || '';
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const DerivacionesLiquidacionPage = () => {
  // Estado de filtros
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [mes, setMes] = useState<string>('');
  const [derivadorFiltro, setDerivadorFiltro] = useState<string>('');
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([]);

  // Estado de datos
  const [derivadores, setDerivadores] = useState<Derivador[]>([]);
  const [registros, setRegistros] = useState<RegistroDerivacion[]>([]);
  const [derivadoresConfig, setDerivadoresConfig] = useState<DerivadorConfig[]>([]);

  // Estado UI
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [generandoPDF, setGenerandoPDF] = useState(false);

  // Config editing state
  const [editingConfig, setEditingConfig] = useState<Record<number, number>>({});

  // WhatsApp modal state
  const [whatsappModal, setWhatsappModal] = useState<{
    open: boolean;
    derivadorId: number | null;
    derivadorNombre: string;
    telefono: string;
    sending: boolean;
    imagenCopiada: boolean;
  }>({ open: false, derivadorId: null, derivadorNombre: '', telefono: '', sending: false, imagenCopiada: false });
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const API_BASE = getApiBaseUrl();

  // ============================================
  // CARGA DE DATOS
  // ============================================

  // Cargar aÃ±os disponibles
  const cargarAnios = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/derivaciones/anios-disponibles`);
      const data = await response.json();
      if (data.success && data.data.length > 0) {
        setAniosDisponibles(data.data);
      } else {
        // Fallback: Ãºltimos 5 aÃ±os
        const currentYear = new Date().getFullYear();
        setAniosDisponibles(Array.from({ length: 5 }, (_, i) => currentYear - i));
      }
    } catch {
      const currentYear = new Date().getFullYear();
      setAniosDisponibles(Array.from({ length: 5 }, (_, i) => currentYear - i));
    }
  }, [API_BASE]);

  // Cargar derivadores desde GECLISA
  const cargarDerivadores = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/derivaciones/derivadores`);
      const data = await response.json();
      if (data.success) {
        setDerivadores(data.data);
      }
    } catch (err) {
      console.error('Error cargando derivadores:', err);
    }
  }, [API_BASE]);

  // Cargar configuraciÃ³n de porcentajes desde Supabase
  const cargarConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data, error: sbError } = await supabase
        .from('derivadores_config')
        .select('*')
        .order('entder_id');

      if (sbError) throw new Error(sbError.message);
      setDerivadoresConfig(data || []);
    } catch (err) {
      console.error('Error cargando config derivadores:', err);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Cargar datos de liquidaciÃ³n
  const cargarLiquidacion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/derivaciones/liquidacion?anio=${anio}`;
      if (mes) url += `&mes=${mes}`;
      if (derivadorFiltro) url += `&derivador_id=${derivadorFiltro}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setRegistros(data.data);
      } else {
        throw new Error(data.error || 'Error obteniendo datos');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      setRegistros([]);
    } finally {
      setLoading(false);
    }
  }, [API_BASE, anio, mes, derivadorFiltro]);

  // Carga inicial
  useEffect(() => {
    cargarAnios();
    cargarDerivadores();
    cargarConfig();
  }, [cargarAnios, cargarDerivadores, cargarConfig]);

  // Recargar datos cuando cambian filtros
  useEffect(() => {
    cargarLiquidacion();
  }, [cargarLiquidacion]);

  // ============================================
  // OBTENER PORCENTAJE DE CONFIGURACIÃ“N
  // ============================================

  const getPorcentaje = useCallback((derivadorId: number): number => {
    const config = derivadoresConfig.find(c => c.entder_id === derivadorId);
    return config?.porcentaje || 0;
  }, [derivadoresConfig]);

  // ============================================
  // DATOS PROCESADOS CON PORCENTAJE Y DEVENGADO
  // Se quita IVA (21%) del coseguro: neto = bruto / 1.21
  // ============================================

  const registrosProcesados = useMemo(() => {
    return registros.map(r => {
      const coseguroSinIva = r.coseguro / 1.21;
      return {
        ...r,
        coseguro: coseguroSinIva,
        porcentaje: getPorcentaje(r.derivador_id),
        devengado: coseguroSinIva * getPorcentaje(r.derivador_id)
      };
    });
  }, [registros, getPorcentaje]);

  // Agrupar por derivador para resumen
  const resumenPorDerivador = useMemo(() => {
    const mapa = new Map<number, {
      derivador_id: number;
      derivador: string;
      cant_atenciones: number;
      total_coseguro: number;
      porcentaje: number;
      devengado: number;
    }>();

    registrosProcesados.forEach(r => {
      const existing = mapa.get(r.derivador_id);
      if (existing) {
        existing.cant_atenciones++;
        existing.total_coseguro += r.coseguro;
        existing.devengado += r.devengado;
      } else {
        mapa.set(r.derivador_id, {
          derivador_id: r.derivador_id,
          derivador: r.derivador,
          cant_atenciones: 1,
          total_coseguro: r.coseguro,
          porcentaje: r.porcentaje,
          devengado: r.devengado
        });
      }
    });

    return Array.from(mapa.values()).sort((a, b) => b.devengado - a.devengado);
  }, [registrosProcesados]);

  // Totales generales
  const totales = useMemo(() => ({
    registros: registrosProcesados.length,
    coseguro: registrosProcesados.reduce((sum, r) => sum + r.coseguro, 0),
    devengado: registrosProcesados.reduce((sum, r) => sum + r.devengado, 0),
    derivadores: new Set(registrosProcesados.map(r => r.derivador_id)).size
  }), [registrosProcesados]);

  // ============================================
  // GUARDAR CONFIGURACIÃ“N DE PORCENTAJE
  // ============================================

  const guardarPorcentaje = async (entderId: number, nombre: string, porcentaje: number) => {
    try {
      // Verificar si ya existe
      const existente = derivadoresConfig.find(c => c.entder_id === entderId);

      if (existente) {
        // Actualizar
        const { error: sbError } = await supabase
          .from('derivadores_config')
          .update({ porcentaje, nombre, updated_by: 'sistema' })
          .eq('entder_id', entderId);
        if (sbError) throw new Error(sbError.message);
      } else {
        // Insertar
        const { error: sbError } = await supabase
          .from('derivadores_config')
          .insert({ entder_id: entderId, nombre, porcentaje, created_by: 'sistema' });
        if (sbError) throw new Error(sbError.message);
      }

      await cargarConfig();
      showSuccess(`Porcentaje actualizado para ${nombre}`);

      // Limpiar editing state
      setEditingConfig(prev => {
        const next = { ...prev };
        delete next[entderId];
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error guardando';
      setError(message);
    }
  };

  // ============================================
  // GENERACIÃ“N DE PDF
  // ============================================

  const generarPDF = async (derivadorId: number) => {
    setGenerandoPDF(true);
    try {
      const datosDeriv = registrosProcesados.filter(r => r.derivador_id === derivadorId);
      if (datosDeriv.length === 0) {
        setError('No hay datos para generar el PDF');
        return;
      }

      const derivadorNombre = datosDeriv[0].derivador;
      const porcentaje = datosDeriv[0].porcentaje;
      const totalCoseguro = datosDeriv.reduce((sum, r) => sum + r.coseguro, 0);
      const totalDevengado = datosDeriv.reduce((sum, r) => sum + r.devengado, 0);

      const periodoTexto = mes
        ? `${getNombreMes(parseInt(mes))} ${anio}`
        : `AÃ±o ${anio}`;

      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      // ============================================
      // ENCABEZADO
      // ============================================
      
      // Fondo header
      doc.setFillColor(30, 58, 95); // Azul oscuro corporativo
      doc.rect(0, 0, pageWidth, 45, 'F');

      // LÃ­nea decorativa
      doc.setFillColor(41, 128, 185); // Azul medio
      doc.rect(0, 45, pageWidth, 2, 'F');

      // Logo texto
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Instituto Dr. Mercado', margin, 20);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('LiquidaciÃ³n de Derivaciones', margin, 30);

      // PerÃ­odo (derecha)
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(periodoTexto, pageWidth - margin, 20, { align: 'right' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const fechaGeneracion = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      doc.text(`Generado: ${fechaGeneracion}`, pageWidth - margin, 30, { align: 'right' });

      // ============================================
      // DATOS DEL DERIVADOR
      // ============================================

      let y = 55;

      doc.setFillColor(245, 247, 250); // Fondo gris claro
      doc.roundedRect(margin, y, contentWidth, 22, 3, 3, 'F');

      doc.setTextColor(30, 58, 95);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Derivador:', margin + 5, y + 8);
      doc.setFontSize(14);
      doc.text(derivadorNombre, margin + 40, y + 8);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Porcentaje: ${(porcentaje * 100).toFixed(1)}%`, margin + 5, y + 17);
      doc.text(`Total Atenciones: ${datosDeriv.length}`, margin + 70, y + 17);
      doc.text(`PerÃ­odo: ${periodoTexto}`, pageWidth - margin - 5, y + 17, { align: 'right' });

      y += 30;

      // ============================================
      // TABLA DE DETALLE
      // ============================================

      // Headers de tabla
      const colWidths = [12, 16, 36, 22, 40, 22, 10, 22];
      const colHeaders = ['ID', 'Fecha', 'Apellido y Nombre', 'Prestador', 'PrestaciÃ³n', 'Coseguro (s/IVA)', '%', 'Devengado'];
      const colAligns: ('left' | 'right' | 'center')[] = ['center', 'center', 'left', 'left', 'left', 'right', 'center', 'right'];

      // Header row
      doc.setFillColor(30, 58, 95);
      doc.rect(margin, y, contentWidth, 8, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');

      let xPos = margin;
      colHeaders.forEach((header, i) => {
        const align = colAligns[i];
        let textX = xPos + 2;
        if (align === 'center') textX = xPos + colWidths[i] / 2;
        if (align === 'right') textX = xPos + colWidths[i] - 2;
        doc.text(header, textX, y + 5.5, { align });
        xPos += colWidths[i];
      });

      y += 8;

      // Data rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      let rowIndex = 0;

      for (const registro of datosDeriv) {
        // Verificar espacio para nueva pÃ¡gina
        if (y > pageHeight - 45) {
          // Pie de pÃ¡gina antes de nueva pÃ¡gina
          agregarPiePagina(doc, pageWidth, pageHeight, margin);
          doc.addPage('portrait');

          // Re-dibujar header en nueva pÃ¡gina
          doc.setFillColor(30, 58, 95);
          doc.rect(0, 0, pageWidth, 20, 'F');
          doc.setFillColor(41, 128, 185);
          doc.rect(0, 20, pageWidth, 1.5, 'F');

          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(`LiquidaciÃ³n Derivaciones - ${derivadorNombre}`, margin, 13);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.text(periodoTexto, pageWidth - margin, 13, { align: 'right' });

          y = 28;

          // Headers de tabla
          doc.setFillColor(30, 58, 95);
          doc.rect(margin, y, contentWidth, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'bold');

          xPos = margin;
          colHeaders.forEach((header, i) => {
            const align = colAligns[i];
            let textX = xPos + 2;
            if (align === 'center') textX = xPos + colWidths[i] / 2;
            if (align === 'right') textX = xPos + colWidths[i] - 2;
            doc.text(header, textX, y + 5.5, { align });
            xPos += colWidths[i];
          });

          y += 8;
          rowIndex = 0;
        }

        // Fondo alternado
        if (rowIndex % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentWidth, 7, 'F');
        }

        // Datos de la fila
        doc.setTextColor(51, 51, 51);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);

        const rowData = [
          String(registro.atencion_id),
          formatDate(registro.fecha),
          registro.apellido_nombre.substring(0, 22),
          registro.prestador.substring(0, 14),
          registro.prestacion.substring(0, 24),
          formatCurrency(registro.coseguro).replace('ARS', '$'),
          `${(registro.porcentaje * 100).toFixed(0)}%`,
          formatCurrency(registro.devengado).replace('ARS', '$')
        ];

        xPos = margin;
        rowData.forEach((cellData, i) => {
          const align = colAligns[i];
          let textX = xPos + 2;
          if (align === 'center') textX = xPos + colWidths[i] / 2;
          if (align === 'right') textX = xPos + colWidths[i] - 2;
          doc.text(cellData, textX, y + 4.8, { align });
          xPos += colWidths[i];
        });

        y += 7;
        rowIndex++;
      }

      // ============================================
      // LÃNEA SEPARADORA Y TOTALES
      // ============================================

      y += 3;
      doc.setDrawColor(30, 58, 95);
      doc.setLineWidth(0.8);
      doc.line(margin, y, margin + contentWidth, y);
      y += 5;

      // Total a Cobrar
      doc.setFillColor(30, 58, 95);
      doc.roundedRect(margin, y, contentWidth, 20, 3, 3, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Total a Cobrar', margin + 8, y + 8);

      doc.setFontSize(16);
      doc.text(formatCurrency(totalDevengado).replace('ARS', '$'), margin + 8, y + 17);

      // Detalle del cÃ¡lculo (derecha)
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Coseguro Total (s/IVA): ${formatCurrency(totalCoseguro).replace('ARS', '$')}`, pageWidth - margin - 5, y + 8, { align: 'right' });
      doc.text(`Porcentaje: ${(porcentaje * 100).toFixed(1)}%`, pageWidth - margin - 5, y + 14, { align: 'right' });
      doc.text(`Registros: ${datosDeriv.length}`, pageWidth - margin - 5, y + 17.5, { align: 'right' });

      y += 28;

      // ============================================
      // FIRMA "RECIBÃ"
      // ============================================

      if (y < pageHeight - 40) {
        // LÃ­nea de firma
        const firmaX = pageWidth - margin - 80;
        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.3);
        doc.line(firmaX, y + 8, firmaX + 75, y + 8);

        doc.setTextColor(80, 80, 80);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('RecibÃ­', firmaX + 30, y + 14, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 95);
        doc.text(derivadorNombre, firmaX + 37.5, y + 20, { align: 'center' });
      }

      // Pie de pÃ¡gina
      agregarPiePagina(doc, pageWidth, pageHeight, margin);

      // Guardar
      const nombreArchivo = `Liquidacion_Derivaciones_${derivadorNombre.replace(/\s+/g, '_')}_${periodoTexto.replace(/\s+/g, '_')}.pdf`;
      doc.save(nombreArchivo);

      showSuccess(`PDF generado: ${nombreArchivo}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generando PDF';
      setError(message);
    } finally {
      setGenerandoPDF(false);
    }
  };

  // Generar todos los PDFs
  const generarTodosPDFs = async () => {
    setGenerandoPDF(true);
    try {
      const derivadoresUnicos = [...new Set(registrosProcesados.map(r => r.derivador_id))];
      for (const derivId of derivadoresUnicos) {
        await generarPDF(derivId);
        // PequeÃ±a pausa entre descargas
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      showSuccess(`${derivadoresUnicos.length} PDFs generados exitosamente`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generando PDFs';
      setError(message);
    } finally {
      setGenerandoPDF(false);
    }
  };

  // Helper: Pie de pÃ¡gina
  const agregarPiePagina = (doc: jsPDF, pageW: number, pageH: number, m: number) => {
    doc.setFillColor(245, 247, 250);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.line(m, pageH - 12, pageW - m, pageH - 12);

    doc.setTextColor(130, 130, 130);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema de Costos - Desarrollo | P. FamÃ¡', m, pageH - 5);
    doc.text(`Instituto Dr. Mercado - ${new Date().getFullYear()}`, pageW - m, pageH - 5, { align: 'right' });
  };

  // ============================================
  // HELPERS UI
  // ============================================

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // ============================================
  // WHATSAPP
  // ============================================

  const abrirWhatsappModal = (derivadorId: number) => {
    const datosDeriv = resumenPorDerivador.find(d => d.derivador_id === derivadorId);
    if (!datosDeriv) return;

    const config = derivadoresConfig.find(c => c.entder_id === derivadorId);
    const telefonoGuardado = config?.telefono || '';

    setWhatsappModal({
      open: true,
      derivadorId,
      derivadorNombre: datosDeriv.derivador,
      telefono: telefonoGuardado,
      sending: false,
      imagenCopiada: false
    });
    setImagenPreview(null);

    // Generar imagen despuÃ©s de que el modal se monte
    setTimeout(() => generarImagenLiquidacion(derivadorId), 100);
  };

  // ============================================
  // GENERAR IMAGEN CON CANVAS
  // ============================================

  const generarImagenLiquidacion = (derivadorId: number) => {
    const datos = resumenPorDerivador.find(d => d.derivador_id === derivadorId);
    if (!datos) return;

    const detalle = registrosProcesados.filter(r => r.derivador_id === derivadorId);
    const periodoTexto = mes ? `${getNombreMes(parseInt(mes))} ${anio}` : `${anio}`;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = 680;
    const PAD = 24;
    const rowH = 40;
    const headerTableH = 34;
    const tableStartY = 195;
    const tableH = headerTableH + detalle.length * rowH;
    const H = tableStartY + tableH + 100;

    canvas.width = W * 2;
    canvas.height = H * 2;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);

    // ---- FONDO BLANCO ----
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ---- HEADER ----
    const headerH = 70;
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#0f2942');
    grad.addColorStop(1, '#1a56a8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, headerH);

    // LÃ­nea accent
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, headerH, W, 3);

    // Texto header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('INSTITUTO DR. MERCADO', PAD, 30);
    ctx.fillStyle = '#93c5fd';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('Liquidacion de Derivaciones', PAD, 50);

    // Periodo (derecha)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(periodoTexto, W - PAD, 30);
    const fechaGen = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    ctx.fillStyle = '#93c5fd';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillText(fechaGen, W - PAD, 50);
    ctx.textAlign = 'left';

    // ---- DERIVADOR ----
    const derY = headerH + 3 + 18;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillText('DERIVADOR', PAD, derY);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText(datos.derivador, PAD, derY + 22);

    // LÃ­nea separadora
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, derY + 34);
    ctx.lineTo(W - PAD, derY + 34);
    ctx.stroke();

    // ---- SECTION TITLE ----
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('DETALLE', PAD, tableStartY - 12);

    // ---- TABLA ----
    const tblX = PAD;
    const tblW = W - PAD * 2;
    const col = [tblX, tblX + 80, tblX + 80 + 220, tblX + 80 + 220 + 160];
    // col: #/Fecha, Paciente, Coseguro, Devengado

    // Header de tabla
    ctx.fillStyle = '#1e3a5f';
    roundRect(ctx, tblX, tableStartY, tblW, headerTableH, 6);
    ctx.fill();
    // Rect bottom sin redondeo
    ctx.fillRect(tblX, tableStartY + 6, tblW, headerTableH - 6);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText('Fecha', col[0] + 8, tableStartY + 21);
    ctx.fillText('Paciente / Prestacion', col[1] + 8, tableStartY + 21);
    ctx.textAlign = 'right';
    ctx.fillText('Coseguro (s/IVA)', col[2] + 150, tableStartY + 21);
    ctx.fillText('Devengado', col[3] + tblW - (col[3] - tblX) - 8, tableStartY + 21);
    ctx.textAlign = 'left';

    // Filas
    let ry = tableStartY + headerTableH;
    detalle.forEach((r, i) => {
      // Zebra
      ctx.fillStyle = i % 2 === 0 ? '#f8fafc' : '#ffffff';
      ctx.fillRect(tblX, ry, tblW, rowH);

      // LÃ­nea separadora sutil
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tblX, ry + rowH);
      ctx.lineTo(tblX + tblW, ry + rowH);
      ctx.stroke();

      const midY = ry + 16;

      // Fecha
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Arial, sans-serif';
      ctx.fillText(formatDate(r.fecha), col[0] + 8, midY);

      // Paciente (bold) + prestaciÃ³n (small)
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px Arial, sans-serif';
      ctx.fillText(r.apellido_nombre.substring(0, 26), col[1] + 8, midY);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px Arial, sans-serif';
      ctx.fillText(r.prestacion.substring(0, 42), col[1] + 8, midY + 14);

      // Coseguro
      ctx.fillStyle = '#334155';
      ctx.font = '11px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatCurrency(r.coseguro), col[2] + 150, midY);

      // Devengado
      ctx.fillStyle = '#1d4ed8';
      ctx.font = 'bold 11px Arial, sans-serif';
      ctx.fillText(formatCurrency(r.devengado), tblX + tblW - 8, midY);
      ctx.textAlign = 'left';

      ry += rowH;
    });

    // Borde inferior tabla
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tblX, ry);
    ctx.lineTo(tblX + tblW, ry);
    ctx.stroke();

    // ---- TOTAL ----
    const totalY = ry + 14;
    const totalH = 50;
    const totalGrad = ctx.createLinearGradient(tblX, totalY, tblX + tblW, totalY);
    totalGrad.addColorStop(0, '#0f2942');
    totalGrad.addColorStop(1, '#1a56a8');
    ctx.fillStyle = totalGrad;
    roundRect(ctx, tblX, totalY, tblW, totalH, 8);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText(formatCurrency(datos.devengado), tblX + 16, totalY + 33);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#93c5fd';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillText(`${datos.cant_atenciones} atenc.  |  ${(datos.porcentaje * 100).toFixed(1)}%  |  Coseguro: ${formatCurrency(datos.total_coseguro)}`, tblX + tblW - 12, totalY + 21);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '9px Arial, sans-serif';
    ctx.fillText('TOTAL A COBRAR', tblX + tblW - 12, totalY + 40);
    ctx.textAlign = 'left';

    // ---- FOOTER ----
    const footY = totalY + totalH + 18;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '9px Arial, sans-serif';
    ctx.fillText('Instituto Dr. Mercado  |  P. Fama | Desarrollo', PAD, footY);
    ctx.textAlign = 'right';
    ctx.fillText(fechaGen, W - PAD, footY);
    ctx.textAlign = 'left';

    // Generate preview
    const dataUrl = canvas.toDataURL('image/png');
    setImagenPreview(dataUrl);
  };

  // Helper: rounded rectangle
  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // ============================================
  // COPIAR IMAGEN AL PORTAPAPELES
  // ============================================

  const copiarImagenAlPortapapeles = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('No se pudo generar la imagen'));
        }, 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      setWhatsappModal(prev => ({ ...prev, imagenCopiada: true }));
      setTimeout(() => setWhatsappModal(prev => ({ ...prev, imagenCopiada: false })), 3000);
    } catch (err) {
      console.error('Error copiando imagen:', err);
      setError('No se pudo copiar la imagen. IntentÃ¡ con clic derecho > Copiar imagen.');
    }
  };

  const guardarTelefonoDerivador = async (entderId: number, telefono: string) => {
    try {
      const existente = derivadoresConfig.find(c => c.entder_id === entderId);
      if (existente) {
        const { error: sbError } = await supabase
          .from('derivadores_config')
          .update({ telefono })
          .eq('entder_id', entderId);
        if (sbError) throw new Error(sbError.message);
      } else {
        const nombre = resumenPorDerivador.find(d => d.derivador_id === entderId)?.derivador || '';
        const { error: sbError } = await supabase
          .from('derivadores_config')
          .insert({ entder_id: entderId, nombre, porcentaje: 0, telefono, created_by: 'sistema' });
        if (sbError) throw new Error(sbError.message);
      }
      await cargarConfig();
    } catch (err) {
      console.error('Error guardando telefono:', err);
    }
  };

  const abrirWhatsapp = async () => {
    if (!whatsappModal.derivadorId || !whatsappModal.telefono.trim()) return;

    setWhatsappModal(prev => ({ ...prev, sending: true }));

    // Guardar telÃ©fono
    await guardarTelefonoDerivador(whatsappModal.derivadorId, whatsappModal.telefono.trim());

    // Formatear telÃ©fono
    let tel = whatsappModal.telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '54' + tel.substring(1);
    if (!tel.startsWith('54') && tel.length <= 10) tel = '54' + tel;
    tel = tel.replace(/^(54)(9?)(\d{2,4})(15)(\d{6,8})$/, '$1$29$3$5');

    // Abrir WhatsApp (sin texto, el usuario pega la imagen)
    const url = `https://wa.me/${tel}`;
    window.open(url, '_blank');

    setWhatsappModal(prev => ({ ...prev, open: false, sending: false }));
    showSuccess(`WhatsApp abierto. Pega la imagen con Ctrl+V`);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-600" />
            LiquidaciÃ³n de Derivaciones
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            GestiÃ³n y liquidaciÃ³n de comisiones por derivaciones mÃ©dicas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Configurar %
          </button>
          <button
            onClick={generarTodosPDFs}
            disabled={registrosProcesados.length === 0 || generandoPDF}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generandoPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Generar Todos los PDF
          </button>
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{successMessage}</span>
        </div>
      )}

      {/* Panel ConfiguraciÃ³n de Porcentajes */}
      {showConfig && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Percent className="h-5 w-5 text-blue-600" />
              ConfiguraciÃ³n de Porcentajes por Derivador
            </h3>
            <button onClick={() => setShowConfig(false)}>
              <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          {loadingConfig ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Derivador</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Porcentaje Actual</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Nuevo %</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">AcciÃ³n</th>
                  </tr>
                </thead>
                <tbody>
                  {derivadores.map(d => {
                    const config = derivadoresConfig.find(c => c.entder_id === d.id);
                    const currentPorcentaje = config?.porcentaje || 0;
                    const isEditing = editingConfig[d.id] !== undefined;

                    return (
                      <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-sm text-gray-500">{d.id}</td>
                        <td className="py-2 px-3 text-sm font-medium text-gray-900">{d.nombre}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            currentPorcentaje > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {(currentPorcentaje * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="100"
                              value={isEditing ? editingConfig[d.id] : (currentPorcentaje * 100)}
                              onChange={(e) => setEditingConfig(prev => ({
                                ...prev,
                                [d.id]: parseFloat(e.target.value) || 0
                              }))}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <span className="text-xs text-gray-500">%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          {isEditing && (
                            <button
                              onClick={() => guardarPorcentaje(d.id, d.nombre, editingConfig[d.id] / 100)}
                              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              <Save className="h-3 w-3" />
                              Guardar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Filter className="h-4 w-4 text-blue-600" />
            Filtros
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">AÃ±o</label>
            <select
              value={anio}
              onChange={(e) => setAnio(parseInt(e.target.value))}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {aniosDisponibles.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Mes</label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {MESES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Derivador</label>
            <select
              value={derivadorFiltro}
              onChange={(e) => setDerivadorFiltro(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
            >
              <option value="">Todos</option>
              {derivadores.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>

          <button
            onClick={cargarLiquidacion}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Cards de Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Registros</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totales.registros.toLocaleString('es-AR')}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Derivadores</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totales.derivadores}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Coseguro <span className="text-[10px] text-gray-400">(s/IVA)</span></p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totales.coseguro)}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Devengado</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(totales.devengado)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Resumen por Derivador */}
      {resumenPorDerivador.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Resumen por Derivador
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Derivador</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Atenciones</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Coseguro <span className="text-[10px] text-gray-400">(s/IVA)</span></th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">%</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Devengado</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumenPorDerivador.map(d => (
                  <tr key={d.derivador_id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.derivador}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{d.cant_atenciones.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(d.total_coseguro)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {(d.porcentaje * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-blue-700">{formatCurrency(d.devengado)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => generarPDF(d.derivador_id)}
                          disabled={generandoPDF}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                          title={`Generar PDF para ${d.derivador}`}
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => abrirWhatsappModal(d.derivador_id)}
                          className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                          title={`Enviar por WhatsApp a ${d.derivador}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-900">TOTALES</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{totales.registros.toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(totales.coseguro)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm text-right text-blue-700">{formatCurrency(totales.devengado)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de Detalle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            Detalle de PrÃ¡cticas Derivadas
            <span className="text-xs font-normal text-gray-500">
              ({registrosProcesados.length} registros)
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <p className="text-sm text-gray-500">Cargando datos de GECLISA...</p>
          </div>
        ) : registrosProcesados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No se encontraron registros de derivaciones</p>
            <p className="text-sm text-gray-400 mt-1">AjustÃ¡ los filtros para ver resultados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Apellido y Nombre</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prestador</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Derivador</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">PrestaciÃ³n</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Coseguro <span className="text-[10px] text-gray-400">(s/IVA)</span></th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">%</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Devengado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {registrosProcesados.map((r, idx) => (
                  <tr key={`${r.atencion_id}-${idx}`} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{r.atencion_id}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700">{formatDate(r.fecha)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-900 font-medium">{r.apellido_nombre}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{r.prestador}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{r.derivador}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700 max-w-[250px] truncate" title={r.prestacion}>
                      {r.prestacion}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right text-gray-700 font-mono">
                      {formatCurrency(r.coseguro)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        {(r.porcentaje * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-semibold text-blue-700 font-mono">
                      {formatCurrency(r.devengado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 font-semibold">
                  <td colSpan={6} className="px-3 py-3 text-sm text-gray-900">TOTALES</td>
                  <td className="px-3 py-3 text-sm text-right text-gray-900 font-mono">{formatCurrency(totales.coseguro)}</td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-sm text-right text-blue-700 font-mono">{formatCurrency(totales.devengado)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {/* Canvas oculto para generar imagen */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Modal WhatsApp con Imagen */}
      {whatsappModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setWhatsappModal(prev => ({ ...prev, open: false }))} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-4 flex items-center gap-3 shrink-0">
              <div className="p-2 bg-white/20 rounded-full">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Enviar LiquidaciÃ³n</h3>
                <p className="text-green-100 text-xs">{whatsappModal.derivadorNombre}</p>
              </div>
              <button
                onClick={() => setWhatsappModal(prev => ({ ...prev, open: false }))}
                className="ml-auto text-white/80 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body - scrollable */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Preview de imagen */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Image className="h-4 w-4 text-gray-400" />
                    Vista previa de la imagen
                  </p>
                  <button
                    onClick={copiarImagenAlPortapapeles}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-300 ${
                      whatsappModal.imagenCopiada 
                        ? 'bg-green-100 text-green-700 border border-green-300' 
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    {whatsappModal.imagenCopiada ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copiada al portapapeles
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar imagen
                      </>
                    )}
                  </button>
                </div>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50 shadow-inner">
                  {imagenPreview ? (
                    <img 
                      src={imagenPreview} 
                      alt="LiquidaciÃ³n" 
                      className="w-full h-auto"
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center text-gray-400">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Generando imagen...
                    </div>
                  )}
                </div>
              </div>

              {/* Pasos */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pasos para enviar</p>
                <div className="space-y-3">
                  {/* Paso 1 */}
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      whatsappModal.imagenCopiada ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {whatsappModal.imagenCopiada ? <Check className="h-3.5 w-3.5" /> : '1'}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${whatsappModal.imagenCopiada ? 'text-green-700' : 'text-gray-700'}`}>
                        {whatsappModal.imagenCopiada ? 'Imagen copiada al portapapeles' : 'Copiar imagen al portapapeles'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {whatsappModal.imagenCopiada 
                          ? 'Listo! La imagen estÃ¡ en tu portapapeles' 
                          : 'HacÃ© clic en "Copiar imagen" arriba'}
                      </p>
                    </div>
                  </div>

                  {/* Paso 2 */}
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      whatsappModal.imagenCopiada ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>
                      2
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${whatsappModal.imagenCopiada ? 'text-gray-700' : 'text-gray-400'}`}>
                        Abrir WhatsApp y pegar con Ctrl+V
                      </p>
                      {whatsappModal.imagenCopiada && (
                        <div className="mt-2 flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 mb-1">
                              <Phone className="h-3 w-3 inline mr-1" />
                              TelÃ©fono del derivador
                            </label>
                            <input
                              type="tel"
                              value={whatsappModal.telefono}
                              onChange={(e) => setWhatsappModal(prev => ({ ...prev, telefono: e.target.value }))}
                              placeholder="Ej: 261 456 7890"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                              autoFocus
                            />
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Se guarda para prÃ³ximos envÃ­os
                            </p>
                          </div>
                          <button
                            onClick={abrirWhatsapp}
                            disabled={!whatsappModal.telefono.trim() || whatsappModal.sending}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                          >
                            {whatsappModal.sending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Abrir WhatsApp
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
              <p className="text-[10px] text-gray-400">
                La imagen queda en el portapapeles hasta que copies otra cosa
              </p>
              <button
                onClick={() => setWhatsappModal(prev => ({ ...prev, open: false }))}
                className="px-4 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DerivacionesLiquidacionPage;
