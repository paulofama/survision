// ============================================
// INFORMES EJECUTIVOS - PÃGINA PRINCIPAL
// Sistema de Costos - Instituto Dr. Mercado
// v2.0 - Con HomogeneizaciÃ³n USD + ExoftalmologÃ­a
// ============================================
// RUTA: src/pages/InformesEjecutivosPage.tsx
// ============================================

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  FileText, 
  TrendingUp, 
  TrendingDown,
  Minus,
  Download,
  Calendar,
  DollarSign,
  Users,
  Building2,
  Activity,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Eye,
  RefreshCw
} from 'lucide-react';
import jsPDF from 'jspdf';

// ============================================
// TIPOS
// ============================================

interface ResumenMensual {
  atenciones: number;
  practicas: number;
  ingresos: {
    nominal: number;
    coseguro: number;
    ticketPromedio: number;
  };
  ingresosUSD: {
    valor: number;
    tipoCambio: number;
  };
  ingresosExoft: {
    valor: number;
    precioReferencia: number;
    cantidadExoftReal: number;
  };
  obrasSociales: number;
  profesionales: number;
  diasActivos: number;
  promedioDiario: number;
}

interface Comparativa {
  periodo: string;
  atenciones: number;
  ingresos: number;
  ingresosUSD: number;
  ingresosExoft: number;
  variacion: {
    atenciones: number;
    ingresosNominal: number;
    ingresosUSD: number;
    ingresosExoft: number;
  };
}

interface Insight {
  tipo: 'positivo' | 'negativo' | 'neutral' | 'info';
  titulo: string;
  descripcion: string;
}

interface DatosInforme {
  periodo: {
    anio: number;
    mes: number;
    nombre: string;
  };
  resumen: ResumenMensual;
  comparativas: {
    mesAnterior: Comparativa;
    interanual: Comparativa;
  };
  homogeneizacion: {
    tipoCambio: {
      actual: number;
      anterior: number;
      interanual: number;
    };
    precioExoftalmologia: {
      actual: number;
      anterior: number;
      interanual: number;
      cantidadActual: number;
    };
  };
  topPrestaciones: Array<{
    codigo: string;
    prestacion: string;
    cantidad: number;
    ingresos: number;
    porcentaje: number;
  }>;
  topPrestadores: Array<{
    prestador: string;
    atenciones: number;
    ingresos: number;
    porcentaje: number;
  }>;
  topObrasSociales: Array<{
    sigla: string;
    obra_social: string;
    atenciones: number;
    ingresos: number;
    porcentaje: number;
  }>;
  evolucionDiaria: Array<{
    dia: number;
    atenciones: number;
    ingresos: number;
  }>;
  insights: Insight[];
  indicadorSalud: {
    nivel: string;
    emoji: string;
    texto: string;
  };
}

// ============================================
// HELPERS
// ============================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatUSD = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('es-AR').format(Math.round(value));
};

const formatPercent = (value: number): string => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getApiUrl = (): string => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  return `http://${hostname}:3001`;
};

// ============================================
// COMPONENTE: BADGE DE VARIACIÃ“N
// ============================================

const VariationBadge: React.FC<{ value: number; showIcon?: boolean; size?: 'sm' | 'md' }> = ({ 
  value, 
  showIcon = true,
  size = 'md'
}) => {
  const isPositive = value > 0;
  const isNeutral = Math.abs(value) < 1;
  
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';
  
  if (isNeutral) {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full bg-gray-100 text-gray-600`}>
        {showIcon && <Minus className="w-3 h-3" />}
        {formatPercent(value)}
      </span>
    );
  }
  
  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses} rounded-full ${
      isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {showIcon && (isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
      {formatPercent(value)}
    </span>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

const InformesEjecutivosPage: React.FC = () => {
  // Estados
  const [pinIngresado, setPinIngresado] = useState('');
  const [autenticado, setAutenticado] = useState(false);
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const [errorPin, setErrorPin] = useState('');
  
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [mesSeleccionado, setMesSeleccionado] = useState(new Date().getMonth() + 1);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosInforme | null>(null);
  const [generandoPDF, setGenerandoPDF] = useState(false);
  
  const [pinGuardado, setPinGuardado] = useState('');
  
  // ============================================
  // VERIFICACIÃ“N DE PIN
  // ============================================
  
  const verificarPin = async () => {
    if (intentosFallidos >= 3) {
      setErrorPin('Demasiados intentos fallidos. Recarga la pÃ¡gina.');
      return;
    }
    
    try {
      const response = await fetch(`${getApiUrl()}/api/informes/verificar-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinIngresado })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAutenticado(true);
        setPinGuardado(pinIngresado);
        setErrorPin('');
        // Cargar datos inmediatamente
        cargarDatos(pinIngresado);
      } else {
        setIntentosFallidos(prev => prev + 1);
        setErrorPin(`PIN incorrecto. Intento ${intentosFallidos + 1} de 3.`);
        setPinIngresado('');
      }
    } catch (err) {
      setErrorPin('Error de conexiÃ³n con el servidor');
    }
  };
  
  // ============================================
  // CARGA DE DATOS
  // ============================================
  
  const cargarDatos = async (pin?: string) => {
    const pinToUse = pin || pinGuardado;
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/informes/ejecutivo-mensual?anio=${anioSeleccionado}&mes=${mesSeleccionado}&pin=${pinToUse}`
      );
      
      if (!response.ok) {
        throw new Error('Error al cargar datos del informe');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setDatos(data);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexiÃ³n');
    } finally {
      setLoading(false);
    }
  };
  
  // Recargar cuando cambia perÃ­odo
  useEffect(() => {
    if (autenticado && pinGuardado) {
      cargarDatos();
    }
  }, [anioSeleccionado, mesSeleccionado]);
  
  // ============================================
  // GENERACIÃ“N DE PDF
  // ============================================
  
  const generarPDF = async () => {
    if (!datos) return;
    
    setGenerandoPDF(true);
    
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      
      // Colores corporativos (como arrays)
      const colorPrimario: [number, number, number] = [30, 58, 95];
      const colorSecundario: [number, number, number] = [59, 130, 246];
      const colorVerde: [number, number, number] = [34, 197, 94];
      const colorRojo: [number, number, number] = [239, 68, 68];
      const colorGris: [number, number, number] = [107, 114, 128];
      
      // ============================================
      // PÃGINA 1: PORTADA
      // ============================================
      
      // Header con gradiente
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 80, 'F');
      
      // Logo cÃ­rculo
      doc.setFillColor(255, 255, 255);
      doc.circle(pageWidth / 2, 35, 18, 'F');
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('IDM', pageWidth / 2, 38, { align: 'center' });
      
      // TÃ­tulo
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('INFORME EJECUTIVO MENSUAL', pageWidth / 2, 65, { align: 'center' });
      
      // PerÃ­odo
      const nombreMes = datos.periodo.nombre.charAt(0).toUpperCase() + datos.periodo.nombre.slice(1);
      doc.setFontSize(14);
      doc.text(nombreMes, pageWidth / 2, 73, { align: 'center' });
      
      // Indicador de salud
      const saludColors: Record<string, [number, number, number]> = {
        'excelente': colorVerde,
        'bueno': [59, 130, 246],
        'estable': [234, 179, 8],
        'atencion': colorRojo
      };
      const saludColor = saludColors[datos.indicadorSalud.nivel] || colorGris;
      
      doc.setFillColor(saludColor[0], saludColor[1], saludColor[2]);
      doc.roundedRect(pageWidth / 2 - 30, 90, 60, 12, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text(`${datos.indicadorSalud.emoji} ${datos.indicadorSalud.texto}`, pageWidth / 2, 98, { align: 'center' });
      
      // SubtÃ­tulo
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(12);
      doc.text('Instituto Dr. Mercado - Centro de OftalmologÃ­a', pageWidth / 2, 115, { align: 'center' });
      
      // Box de mÃ©tricas principales
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, 130, contentWidth, 80, 3, 3, 'F');
      
      // KPIs principales
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const kpiY = 145;
      const kpiWidth = contentWidth / 3;
      
      // Atenciones
      doc.text('ATENCIONES', margin + kpiWidth * 0.5, kpiY, { align: 'center' });
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(formatNumber(datos.resumen.atenciones), margin + kpiWidth * 0.5, kpiY + 12, { align: 'center' });
      
      // Ingresos Nominales
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('INGRESOS (NOMINAL)', margin + kpiWidth * 1.5, kpiY, { align: 'center' });
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(datos.resumen.ingresos.nominal), margin + kpiWidth * 1.5, kpiY + 12, { align: 'center' });
      
      // Profesionales
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('PROFESIONALES', margin + kpiWidth * 2.5, kpiY, { align: 'center' });
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(String(datos.resumen.profesionales), margin + kpiWidth * 2.5, kpiY + 12, { align: 'center' });
      
      // LÃ­nea separadora
      doc.setDrawColor(200, 200, 200);
      doc.line(margin + 10, kpiY + 25, pageWidth - margin - 10, kpiY + 25);
      
      // MÃ‰TRICAS HOMOGENEIZADAS
      const homY = kpiY + 35;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colorSecundario[0], colorSecundario[1], colorSecundario[2]);
      doc.text('MÃ‰TRICAS HOMOGENEIZADAS (AJUSTADAS POR INFLACIÃ“N)', margin + 10, homY);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(10);
      
      // USD
      doc.text('En USD:', margin + 10, homY + 10);
      doc.setFont('helvetica', 'bold');
      doc.text(formatUSD(datos.resumen.ingresosUSD.valor), margin + 45, homY + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.text(`(TC: \$${formatNumber(datos.resumen.ingresosUSD.tipoCambio)})`, margin + 80, homY + 10);
      
      // ExoftalmologÃ­as
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(10);
      doc.text('En ExoftalmologÃ­as:', margin + 10, homY + 20);
      doc.setFont('helvetica', 'bold');
      doc.text(`${formatNumber(datos.resumen.ingresosExoft.valor)} equiv.`, margin + 55, homY + 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.text(`(Precio ref: ${formatCurrency(datos.resumen.ingresosExoft.precioReferencia)})`, margin + 90, homY + 20);
      
      // Confidencialidad
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(margin, 220, contentWidth, 15, 2, 2, 'F');
      doc.setTextColor(146, 64, 14);
      doc.setFontSize(9);
      doc.text('âš ï¸ DOCUMENTO CONFIDENCIAL - Solo para uso interno de la DirecciÃ³n', pageWidth / 2, 229, { align: 'center' });
      
      // Footer
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(8);
      doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, pageWidth / 2, 280, { align: 'center' });
      doc.text('Sistema de Costos - P. FamÃ¡ | Desarrollo', pageWidth / 2, 285, { align: 'center' });
      
      // ============================================
      // PÃGINA 2: RESUMEN EJECUTIVO
      // ============================================
      
      doc.addPage();
      
      // Header
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMEN EJECUTIVO', margin, 17);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(nombreMes, pageWidth - margin, 17, { align: 'right' });
      
      let y = 40;
      
      // Tabla comparativa completa
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, contentWidth, 70, 3, 3, 'F');
      
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Comparativa de Ingresos', margin + 5, y + 10);
      
      // Headers de tabla
      const colX = [margin + 5, margin + 40, margin + 80, margin + 120, margin + 160];
      
      doc.setFontSize(8);
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.text('PerÃ­odo', colX[0], y + 20);
      doc.text('Nominal (\$)', colX[1], y + 20);
      doc.text('En USD', colX[2], y + 20);
      doc.text('En Exoft.', colX[3], y + 20);
      doc.text('Var. Real', colX[4], y + 20);
      
      // Fila actual
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      y += 30;
      doc.text(`${datos.periodo.mes}/${datos.periodo.anio}`, colX[0], y);
      doc.text(formatCurrency(datos.resumen.ingresos.nominal), colX[1], y);
      doc.text(formatUSD(datos.resumen.ingresosUSD.valor), colX[2], y);
      doc.text(formatNumber(datos.resumen.ingresosExoft.valor), colX[3], y);
      doc.text('ACTUAL', colX[4], y);
      
      // Fila mes anterior
      doc.setFont('helvetica', 'normal');
      y += 12;
      const compAnterior = datos.comparativas.mesAnterior;
      doc.text(compAnterior.periodo, colX[0], y);
      doc.text(formatCurrency(compAnterior.ingresos), colX[1], y);
      doc.text(formatUSD(compAnterior.ingresosUSD), colX[2], y);
      doc.text(formatNumber(compAnterior.ingresosExoft), colX[3], y);
      
      const varUSDMensual = compAnterior.variacion.ingresosUSD;
      const colorVarMensual = varUSDMensual >= 0 ? colorVerde : colorRojo;
      doc.setTextColor(colorVarMensual[0], colorVarMensual[1], colorVarMensual[2]);
      doc.text(formatPercent(varUSDMensual), colX[4], y);
      
      // Fila interanual
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      y += 12;
      const compInter = datos.comparativas.interanual;
      doc.text(compInter.periodo, colX[0], y);
      doc.text(formatCurrency(compInter.ingresos), colX[1], y);
      doc.text(formatUSD(compInter.ingresosUSD), colX[2], y);
      doc.text(formatNumber(compInter.ingresosExoft), colX[3], y);
      
      const varUSDInter = compInter.variacion.ingresosUSD;
      const colorVarInter = varUSDInter >= 0 ? colorVerde : colorRojo;
      doc.setTextColor(colorVarInter[0], colorVarInter[1], colorVarInter[2]);
      doc.text(formatPercent(varUSDInter), colX[4], y);
      
      // Nota explicativa
      y += 20;
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.text('* "Var. Real" muestra la variaciÃ³n en USD, que refleja el crecimiento/decrecimiento real ajustado por inflaciÃ³n.', margin + 5, y);
      doc.text(`* "En Exoft." muestra cuÃ¡ntas exoftalmologÃ­as equivalentes se facturaron (precio ref: ${formatCurrency(datos.homogeneizacion.precioExoftalmologia.actual)}).`, margin + 5, y + 5);
      
      // KPIs adicionales
      y += 25;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, contentWidth, 40, 3, 3, 'F');
      
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const kpi2Width = contentWidth / 4;
      
      doc.text('Ticket Promedio', margin + kpi2Width * 0.5, y + 10, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(datos.resumen.ingresos.ticketPromedio), margin + kpi2Width * 0.5, y + 20, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.text('DÃ­as Activos', margin + kpi2Width * 1.5, y + 10, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(String(datos.resumen.diasActivos), margin + kpi2Width * 1.5, y + 20, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.text('Promedio/DÃ­a', margin + kpi2Width * 2.5, y + 10, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(String(datos.resumen.promedioDiario), margin + kpi2Width * 2.5, y + 20, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.text('Obras Sociales', margin + kpi2Width * 3.5, y + 10, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(String(datos.resumen.obrasSociales), margin + kpi2Width * 3.5, y + 20, { align: 'center' });
      
      // ParÃ¡metros de homogeneizaciÃ³n
      y += 55;
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin, y, contentWidth, 35, 3, 3, 'F');
      
      doc.setTextColor(colorSecundario[0], colorSecundario[1], colorSecundario[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('ðŸ“Š ParÃ¡metros de HomogeneizaciÃ³n Utilizados', margin + 5, y + 10);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(8);
      
      const homData = datos.homogeneizacion;
      doc.text(`Tipo de Cambio: Actual \$${formatNumber(homData.tipoCambio.actual)} | Anterior \$${formatNumber(homData.tipoCambio.anterior)} | Interanual \$${formatNumber(homData.tipoCambio.interanual)}`, margin + 5, y + 20);
      doc.text(`Precio ExoftalmologÃ­a: Actual ${formatCurrency(homData.precioExoftalmologia.actual)} | Anterior ${formatCurrency(homData.precioExoftalmologia.anterior)} | Interanual ${formatCurrency(homData.precioExoftalmologia.interanual)}`, margin + 5, y + 28);
      
      // Footer pÃ¡gina
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(8);
      doc.text('PÃ¡gina 2 de 6', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // ============================================
      // PÃGINA 3: TOP PRESTACIONES
      // ============================================
      
      doc.addPage();
      
      // Header
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('ANÃLISIS POR PRESTACIÃ“N', margin, 17);
      
      y = 35;
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(11);
      doc.text('Top 10 Prestaciones por Ingresos', margin, y);
      
      // Tabla de prestaciones
      y += 10;
      
      // Header tabla
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('#', margin + 3, y + 6);
      doc.text('CÃ³digo', margin + 12, y + 6);
      doc.text('PrestaciÃ³n', margin + 35, y + 6);
      doc.text('Cant.', margin + 115, y + 6);
      doc.text('Ingresos', margin + 135, y + 6);
      doc.text('%', margin + 170, y + 6);
      
      y += 8;
      
      datos.topPrestaciones.slice(0, 10).forEach((prest, index) => {
        const rowY = y + (index * 8);
        
        // Fondo alternado
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, rowY, contentWidth, 8, 'F');
        }
        
        doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        
        doc.text(String(index + 1), margin + 3, rowY + 6);
        doc.text(prest.codigo?.trim() || '-', margin + 12, rowY + 6);
        doc.text((prest.prestacion?.trim() || '-').substring(0, 40), margin + 35, rowY + 6);
        doc.text(formatNumber(prest.cantidad), margin + 115, rowY + 6);
        doc.text(formatCurrency(prest.ingresos), margin + 135, rowY + 6);
        doc.text(`${prest.porcentaje.toFixed(1)}%`, margin + 170, rowY + 6);
      });
      
      // Footer pÃ¡gina
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(8);
      doc.text('PÃ¡gina 3 de 6', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // ============================================
      // PÃGINA 4: TOP PRESTADORES
      // ============================================
      
      doc.addPage();
      
      // Header
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('ANÃLISIS POR PROFESIONAL', margin, 17);
      
      y = 35;
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(11);
      doc.text('Top 5 Profesionales por Ingresos (Con Prorrateo)', margin, y);
      
      // Tabla
      y += 10;
      
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('#', margin + 3, y + 6);
      doc.text('Profesional', margin + 15, y + 6);
      doc.text('Atenciones', margin + 100, y + 6);
      doc.text('Ingresos', margin + 135, y + 6);
      doc.text('%', margin + 170, y + 6);
      
      y += 8;
      
      datos.topPrestadores.forEach((prest, index) => {
        const rowY = y + (index * 10);
        
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, rowY, contentWidth, 10, 'F');
        }
        
        doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        doc.text(String(index + 1), margin + 3, rowY + 7);
        doc.setFont('helvetica', 'bold');
        doc.text((prest.prestador?.trim() || '-').substring(0, 35), margin + 15, rowY + 7);
        doc.setFont('helvetica', 'normal');
        doc.text(formatNumber(prest.atenciones), margin + 100, rowY + 7);
        doc.text(formatCurrency(prest.ingresos), margin + 135, rowY + 7);
        doc.text(`${prest.porcentaje.toFixed(1)}%`, margin + 170, rowY + 7);
      });
      
      // Footer pÃ¡gina
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(8);
      doc.text('PÃ¡gina 4 de 6', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // ============================================
      // PÃGINA 5: TOP OBRAS SOCIALES
      // ============================================
      
      doc.addPage();
      
      // Header
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('ANÃLISIS POR FINANCIADOR', margin, 17);
      
      y = 35;
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(11);
      doc.text('Top 10 Obras Sociales por Ingresos', margin, y);
      
      // Tabla
      y += 10;
      
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('#', margin + 3, y + 6);
      doc.text('Sigla', margin + 12, y + 6);
      doc.text('Obra Social', margin + 35, y + 6);
      doc.text('Atenciones', margin + 100, y + 6);
      doc.text('Ingresos', margin + 135, y + 6);
      doc.text('%', margin + 170, y + 6);
      
      y += 8;
      
      datos.topObrasSociales.slice(0, 10).forEach((os, index) => {
        const rowY = y + (index * 8);
        
        if (index % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, rowY, contentWidth, 8, 'F');
        }
        
        doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        
        doc.text(String(index + 1), margin + 3, rowY + 6);
        doc.setFont('helvetica', 'bold');
        doc.text(os.sigla?.trim() || '-', margin + 12, rowY + 6);
        doc.setFont('helvetica', 'normal');
        doc.text((os.obra_social?.trim() || '-').substring(0, 30), margin + 35, rowY + 6);
        doc.text(formatNumber(os.atenciones), margin + 100, rowY + 6);
        doc.text(formatCurrency(os.ingresos), margin + 135, rowY + 6);
        doc.text(`${os.porcentaje.toFixed(1)}%`, margin + 170, rowY + 6);
      });
      
      // Footer pÃ¡gina
      doc.setTextColor(colorGris[0], colorGris[1], colorGris[2]);
      doc.setFontSize(8);
      doc.text('PÃ¡gina 5 de 6', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // ============================================
      // PÃGINA 6: INSIGHTS Y CONCLUSIONES
      // ============================================
      
      doc.addPage();
      
      // Header
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('INSIGHTS Y CONCLUSIONES', margin, 17);
      
      y = 35;
      doc.setTextColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.setFontSize(11);
      doc.text('Observaciones AutomÃ¡ticas del PerÃ­odo', margin, y);
      
      y += 10;
      
      // Insights
      datos.insights.forEach((insight, index) => {
        if (y > 240) return; // Evitar overflow
        
        const insightColors: Record<string, [number, number, number]> = {
          'positivo': [220, 252, 231],
          'negativo': [254, 226, 226],
          'neutral': [243, 244, 246],
          'info': [239, 246, 255]
        };
        
        const textColors: Record<string, [number, number, number]> = {
          'positivo': [22, 101, 52],
          'negativo': [153, 27, 27],
          'neutral': [55, 65, 81],
          'info': [30, 64, 175]
        };
        
        const bgColor = insightColors[insight.tipo] || insightColors['info'];
        const txtColor = textColors[insight.tipo] || textColors['info'];
        
        doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F');
        
        doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(insight.titulo, margin + 5, y + 8);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(insight.descripcion.substring(0, 100), margin + 5, y + 15);
        
        y += 25;
      });
      
      // SecciÃ³n "PrÃ³ximamente"
      y = Math.max(y, 200);
      doc.setFillColor(254, 249, 195);
      doc.roundedRect(margin, y, contentWidth, 30, 3, 3, 'F');
      
      doc.setTextColor(146, 64, 14);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('ðŸš€ PrÃ³ximamente: AnÃ¡lisis de Rentabilidad', margin + 5, y + 12);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('En futuras versiones incluiremos anÃ¡lisis de costos, mÃ¡rgenes por prestaciÃ³n y rentabilidad por profesional.', margin + 5, y + 22);
      
      // Footer final
      doc.setFillColor(colorPrimario[0], colorPrimario[1], colorPrimario[2]);
      doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text('Sistema de Costos - Instituto Dr. Mercado', pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text('P. FamÃ¡ | Desarrollo', pageWidth / 2, pageHeight - 6, { align: 'center' });
      
      // Footer pÃ¡gina
      doc.setTextColor(255, 255, 255);
      doc.text('PÃ¡gina 6 de 6', pageWidth - margin, pageHeight - 12, { align: 'right' });
      
      // ============================================
      // GUARDAR PDF
      // ============================================
      
      const fileName = `Informe_Ejecutivo_${nombreMes.replace(' ', '_')}.pdf`;
      doc.save(fileName);
      
    } catch (err) {
      console.error('Error generando PDF:', err);
      alert('Error al generar el PDF. Por favor intente nuevamente.');
    } finally {
      setGenerandoPDF(false);
    }
  };
  
  // ============================================
  // PANTALLA DE LOGIN
  // ============================================
  
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Informes Ejecutivos</h1>
            <p className="text-gray-500 mt-2">Acceso restringido - Ingrese PIN</p>
          </div>
          
          {/* Formulario */}
          <div className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={pinIngresado}
                onChange={(e) => setPinIngresado(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verificarPin()}
                placeholder="Ingrese PIN de acceso"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-xl tracking-widest"
                maxLength={10}
                disabled={intentosFallidos >= 3}
                autoFocus
              />
            </div>
            
            {errorPin && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                {errorPin}
              </div>
            )}
            
            <button
              onClick={verificarPin}
              disabled={!pinIngresado || intentosFallidos >= 3}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Eye className="w-5 h-5" />
              Acceder
            </button>
          </div>
          
          {/* Footer */}
          <div className="mt-8 text-center text-xs text-gray-400">
            Instituto Dr. Mercado - Sistema de Costos
          </div>
        </div>
      </div>
    );
  }
  
  // ============================================
  // PANTALLA PRINCIPAL
  // ============================================
  
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.location.href = '/'}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Informes Ejecutivos
                </h1>
                <p className="text-blue-200 text-sm">Instituto Dr. Mercado</p>
              </div>
            </div>
            
            {/* Selector de perÃ­odo */}
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-blue-300" />
              <select
                value={anioSeleccionado}
                onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-400"
              >
                {[2024, 2025, 2026].map(anio => (
                  <option key={anio} value={anio} className="text-gray-800">{anio}</option>
                ))}
              </select>
              <select
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(Number(e.target.value))}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-400"
              >
                {meses.map((mes, index) => (
                  <option key={index + 1} value={index + 1} className="text-gray-800">{mes}</option>
                ))}
              </select>
              <button
                onClick={() => cargarDatos()}
                disabled={loading}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <span className="text-gray-500">Cargando informe...</span>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => cargarDatos()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        ) : datos ? (
          <div className="space-y-6">
            {/* Indicador de Salud + BotÃ³n PDF */}
            <div className="flex items-center justify-between">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium ${
                datos.indicadorSalud.nivel === 'excelente' ? 'bg-green-500' :
                datos.indicadorSalud.nivel === 'bueno' ? 'bg-blue-500' :
                datos.indicadorSalud.nivel === 'estable' ? 'bg-yellow-500' :
                'bg-red-500'
              }`}>
                <span className="text-lg">{datos.indicadorSalud.emoji}</span>
                {datos.indicadorSalud.texto}
              </div>
              
              <button
                onClick={generarPDF}
                disabled={generandoPDF}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg disabled:opacity-50"
              >
                {generandoPDF ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                Descargar PDF Ejecutivo
              </button>
            </div>
            
            {/* KPIs Principales */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Atenciones */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-gray-500 text-sm">Atenciones</span>
                </div>
                <div className="text-3xl font-bold text-gray-800">{formatNumber(datos.resumen.atenciones)}</div>
                <div className="mt-2">
                  <VariationBadge value={datos.comparativas.mesAnterior.variacion.atenciones} size="sm" />
                </div>
              </div>
              
              {/* Ingresos Nominales */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-gray-500 text-sm">Ingresos (Nominal)</span>
                </div>
                <div className="text-2xl font-bold text-gray-800">{formatCurrency(datos.resumen.ingresos.nominal)}</div>
                <div className="mt-2">
                  <VariationBadge value={datos.comparativas.mesAnterior.variacion.ingresosNominal} size="sm" />
                </div>
              </div>
              
              {/* Ingresos USD */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 shadow-sm border border-blue-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">USD</span>
                  </div>
                  <span className="text-blue-700 text-sm font-medium">Ingresos Reales</span>
                </div>
                <div className="text-2xl font-bold text-blue-800">{formatUSD(datos.resumen.ingresosUSD.valor)}</div>
                <div className="mt-2 flex items-center gap-2">
                  <VariationBadge value={datos.comparativas.mesAnterior.variacion.ingresosUSD} size="sm" />
                  <span className="text-xs text-blue-600">TC: ${formatNumber(datos.resumen.ingresosUSD.tipoCambio)}</span>
                </div>
              </div>
              
              {/* ExoftalmologÃ­as Equivalentes */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 shadow-sm border border-purple-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                    <span className="text-white text-lg">ðŸ¥</span>
                  </div>
                  <span className="text-purple-700 text-sm font-medium">ExoftalmologÃ­as Equiv.</span>
                </div>
                <div className="text-2xl font-bold text-purple-800">{formatNumber(datos.resumen.ingresosExoft.valor)}</div>
                <div className="mt-2 flex items-center gap-2">
                  <VariationBadge value={datos.comparativas.mesAnterior.variacion.ingresosExoft} size="sm" />
                  <span className="text-xs text-purple-600">Ref: {formatCurrency(datos.resumen.ingresosExoft.precioReferencia)}</span>
                </div>
              </div>
            </div>
            
            {/* Insights */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Insights AutomÃ¡ticos</h2>
              <div className="space-y-3">
                {datos.insights.map((insight, index) => (
                  <div 
                    key={index}
                    className={`p-4 rounded-lg border ${
                      insight.tipo === 'positivo' ? 'bg-green-50 border-green-200' :
                      insight.tipo === 'negativo' ? 'bg-red-50 border-red-200' :
                      insight.tipo === 'neutral' ? 'bg-gray-50 border-gray-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="font-semibold text-gray-800">{insight.titulo}</div>
                    <div className="text-sm text-gray-600 mt-1">{insight.descripcion}</div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Top 5 Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Prestaciones */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Top 5 Prestaciones</h3>
                <div className="space-y-3">
                  {datos.topPrestaciones.slice(0, 5).map((prest, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-yellow-100 text-yellow-700' :
                          index === 1 ? 'bg-gray-200 text-gray-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {index + 1}
                        </span>
                        <span className="text-gray-700 text-sm truncate max-w-[180px]">
                          {prest.prestacion?.trim()}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-800">{formatCurrency(prest.ingresos)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Top Obras Sociales */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Top 5 Obras Sociales</h3>
                <div className="space-y-3">
                  {datos.topObrasSociales.slice(0, 5).map((os, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-yellow-100 text-yellow-700' :
                          index === 1 ? 'bg-gray-200 text-gray-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <span className="font-medium text-gray-800">{os.sigla}</span>
                          <span className="text-gray-500 text-sm ml-2">{os.obra_social?.trim().substring(0, 20)}</span>
                        </div>
                      </div>
                      <span className="font-semibold text-gray-800">{formatCurrency(os.ingresos)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* PrÃ³ximamente */}
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">ðŸš€</span>
                <div>
                  <h3 className="font-bold text-amber-800">PrÃ³ximamente: AnÃ¡lisis de Rentabilidad</h3>
                  <p className="text-amber-700 text-sm mt-1">
                    En futuras versiones incluiremos anÃ¡lisis de costos, mÃ¡rgenes por prestaciÃ³n y rentabilidad por profesional.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="text-center text-gray-400 text-sm pt-4">
              Sistema de Costos - Instituto Dr. Mercado | P. FamÃ¡ | Desarrollo
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InformesEjecutivosPage;
