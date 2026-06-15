// ===========================================================================
// UTIL: exportarAsiento - MODULO CARGA DE SUELDOS (Fase 4)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Exporta la propuesta de asiento a un archivo .xlsx (SheetJS) para copy-paste
// al sistema contable oficial. Los importes van como NUMEROS (no strings
// formateados) para que peguen limpio. El frontend escribe directo (xlsx es
// dependencia del front), consistente con el patron del proyecto.
// ===========================================================================

import * as XLSX from 'xlsx';
import type { AsientoSueldos, AsientoSueldosLinea } from '../types/sueldos';
import { periodoLabel } from './constantes';
import { LABEL_CRITERIO_BRUTO } from '../types/sueldos';

const SECCION_LABEL: Record<string, string> = {
  recibo: 'Recibo',
  facturado: 'Facturado',
};

/**
 * Construye y descarga el .xlsx del asiento.
 */
export function exportarAsientoExcel(
  cabecera: AsientoSueldos,
  lineas: AsientoSueldosLinea[]
): void {
  const periodo = periodoLabel(cabecera.anio, cabecera.mes);

  // ---- Bloque de encabezado (metadata) ----------------------------------
  const encabezado: (string | number)[][] = [
    ['Propuesta de Asiento (borrador para contabilidad)'],
    ['Survisión S.A. — Módulo Sueldos'],
    ['Período', periodo],
    ['Criterio de bruto', LABEL_CRITERIO_BRUTO[cabecera.criterio_bruto] ?? cabecera.criterio_bruto],
    ['Rem.1 usado', Number(cabecera.rem_1_usado ?? 0)],
    ['Total neto', Number(cabecera.total_neto ?? 0)],
    ['Bruto total (al Debe)', Number(cabecera.bruto_total ?? 0)],
    ['Monto de ajuste', Number(cabecera.monto_ajuste ?? 0)],
    ['Total Debe', Number(cabecera.total_debe ?? 0)],
    ['Total Haber', Number(cabecera.total_haber ?? 0)],
    ['Generado', cabecera.generado_at ? new Date(cabecera.generado_at).toLocaleString('es-AR') : ''],
    [], // fila en blanco
  ];

  // ---- Tabla de lineas ---------------------------------------------------
  const headerTabla = ['Sección', 'Cuenta', 'Nombre cuenta', 'Detalle', 'Debe', 'Haber', 'Estimado', 'Ajuste'];

  const filas = lineas.map((l) => [
    SECCION_LABEL[l.seccion] ?? l.seccion,
    l.cuenta_codigo ?? '(a determinar)',
    l.cuenta_nombre ?? '',
    l.detalle ?? '',
    Number(l.debe) || 0,
    Number(l.haber) || 0,
    l.es_estimado ? 'Sí' : '',
    l.es_ajuste ? 'Sí' : '',
  ]);

  const totalDebe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
  const filaTotales = ['', '', '', 'TOTALES', Math.round(totalDebe * 100) / 100, Math.round(totalHaber * 100) / 100, '', ''];

  const aoa: (string | number)[][] = [
    ...encabezado,
    headerTabla,
    ...filas,
    filaTotales,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Anchos de columna
  ws['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 48 },
    { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Asiento ${cabecera.mes}-${cabecera.anio}`);

  const nombre = `Asiento_Sueldos_${cabecera.anio}_${String(cabecera.mes).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, nombre);
}
