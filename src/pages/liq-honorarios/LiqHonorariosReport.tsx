// ============================================================
// COMPONENT: LiqHonorariosReport
// Reporte imprimible — diseño profesional minimalista
// ============================================================

import { useRef, useCallback } from 'react';
import { Printer, Download } from 'lucide-react';
import { calcularFacturacionDetails } from './useCajaCalculation';
import type { LiqHonorarioConPrestador, FacturacionDetails } from './types';

interface Props {
  liquidacion: LiqHonorarioConPrestador;
}

const FMT = (n: number): string =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const NUM = (n: number): string => (n === 0 ? '—' : FMT(n));

export function LiqHonorariosReport({ liquidacion: liq }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  const fechaEmision = new Date().toLocaleDateString('es-AR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const numeroLiq = 'LIQ-' + liq.id.substring(0, 8).toUpperCase();
  const fechaLiq  = new Date(liq.fecha + 'T12:00:00');
  const periodo   = fechaLiq.toLocaleDateString('es-AR', { month: 'numeric', year: 'numeric' });
  const fechaFmt  = fechaLiq.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const facturacion: FacturacionDetails = calcularFacturacionDetails({
    cajaExentos:     liq.caja_exentos,
    osExentos:       liq.os_exentos,
    cajaGravados21:  liq.caja_neto_21,
    osGravados21:    liq.os_gravados_21,
    cajaGravados105: liq.caja_neto_105,
    osGravados105:   liq.os_gravados_105,
  });

  const totalIva21  = (liq.caja_iva_21  || 0) + (liq.os_iva_21  || 0);
  const totalIva105 = (liq.caja_iva_105 || 0) + (liq.os_iva_105 || 0);

  const handlePrint = useCallback(() => {
    const safePrest = liq.prestador_nombre.replace(/[\\/:*?"<>|]/g, '').trim();
    const ymd = fechaLiq.getFullYear().toString()
      + String(fechaLiq.getMonth() + 1).padStart(2, '0')
      + String(fechaLiq.getDate()).padStart(2, '0');
    const originalTitle = document.title;
    document.title = `${ymd}. Liquidacion ${safePrest}`;
    const afterPrint = () => { document.title = originalTitle; window.removeEventListener('afterprint', afterPrint); };
    window.addEventListener('afterprint', afterPrint);
    window.print();
  }, [liq, fechaLiq]);

  const handleDownloadPDF = useCallback(() => handlePrint(), [handlePrint]);

  /* ─── Clases de celda ─────────────────────────────────── */
  const TH  = 'px-3 py-2 text-right text-[9.5px] font-semibold uppercase tracking-wide text-gray-500';
  const THL = 'px-3 py-2 text-left  text-[9.5px] font-semibold uppercase tracking-wide text-gray-500';
  const TD  = 'px-3 py-2 text-right text-[11px] tabular-nums text-gray-700';
  const TDL = 'px-3 py-2 text-left  text-[11px] font-medium text-gray-800';
  const TS  = 'px-3 py-2 text-right text-[11px] tabular-nums font-semibold text-gray-800 bg-gray-50';
  const TSL = 'px-3 py-2 text-left  text-[11px] font-semibold text-gray-800 bg-gray-50';

  const ROW_DIV = { borderBottom: '1px solid #e5e7eb' } as React.CSSProperties;
  const NAVY = '#1a3558';

  return (
    <div>
      {/* Botones — se ocultan al imprimir */}
      <div className="flex gap-3 mb-5 print:hidden">
        <button onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">
          <Printer className="w-4 h-4" /> Imprimir
        </button>
        <button onClick={handleDownloadPDF}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">
          <Download className="w-4 h-4" /> Descargar PDF
        </button>
      </div>

      {/* ═══════════════════════ REPORTE ═══════════════════════ */}
      <div
        ref={reportRef}
        data-print-report
        className="bg-white mx-auto"
        style={{ maxWidth: '190mm', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
      >

        {/* ENCABEZADO */}
        <div className="flex justify-between items-start mb-6 pb-4"
             style={{ borderBottom: `2px solid ${NAVY}` }}>
          <div>
            <p className="text-[15px] font-bold tracking-widest text-gray-900 uppercase leading-tight">
              Instituto Dr. Mercado
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Survisión S.A.</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Dirección Institucional &nbsp;·&nbsp; CUIT: XX-XXXXXXXX-X
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold tracking-widest text-gray-400 uppercase mb-1">
              Liquidación de Prestador
            </p>
            <p className="text-[17px] font-bold tracking-wide" style={{ color: NAVY }}>{numeroLiq}</p>
            <p className="text-[10px] text-gray-500 mt-1">
              Fecha:&nbsp;<span className="font-semibold text-gray-700">{fechaFmt}</span>
            </p>
            <p className="text-[9px] text-gray-400">Emitido: {fechaEmision}</p>
          </div>
        </div>

        {/* PRESTADOR + PERÍODO */}
        <div className="flex justify-between items-end mb-6 px-0.5">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Prestador</p>
            <p className="text-[14px] font-bold text-gray-900">{liq.prestador_nombre}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Período Liquidado</p>
            <p className="text-[14px] font-bold text-gray-900">{periodo}</p>
          </div>
        </div>

        {/* ══ TABLA PRINCIPAL ══ */}
        <table className="w-full border-collapse mb-6" style={{ fontSize: '11px' }}>
          <thead>
            <tr style={{ background: NAVY }}>
              <th className="px-3 py-2.5 text-left text-[9.5px] font-semibold uppercase tracking-wide text-white w-[28%]">Concepto</th>
              <th className="px-3 py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white">Exento</th>
              <th className="px-3 py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white">Neto 21%</th>
              <th className="px-3 py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white">IVA 21%</th>
              <th className="px-3 py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white">Neto 10,5%</th>
              <th className="px-3 py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white">IVA 10,5%</th>
              <th className="px-3 py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-wide text-white">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr style={ROW_DIV}>
              <td className={TDL}>Ingreso por Caja</td>
              <td className={TD}>{NUM(liq.ingreso_por_caja)}</td>
              <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
              <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
              <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
              <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
              <td className={`${TD} font-semibold text-gray-800`}>{NUM(liq.ingreso_por_caja)}</td>
            </tr>

            <tr style={ROW_DIV}>
              <td className={TDL}>Facturación por Caja</td>
              <td className={TD}>{NUM(liq.caja_exentos)}</td>
              <td className={TD}>{NUM(liq.caja_neto_21)}</td>
              <td className={TD}>{NUM(liq.caja_iva_21)}</td>
              <td className={TD}>{NUM(liq.caja_neto_105)}</td>
              <td className={TD}>{NUM(liq.caja_iva_105)}</td>
              <td className={`${TD} font-semibold text-gray-800`}>{NUM(liq.caja_total)}</td>
            </tr>

            <tr style={ROW_DIV}>
              <td className={TDL}>Cobrado por Obras Sociales</td>
              <td className={TD}>{NUM(liq.os_exentos)}</td>
              <td className={TD}>{NUM(liq.os_gravados_21)}</td>
              <td className={TD}>{NUM(liq.os_iva_21)}</td>
              <td className={TD}>{NUM(liq.os_gravados_105)}</td>
              <td className={TD}>{NUM(liq.os_iva_105)}</td>
              <td className={`${TD} font-semibold text-gray-800`}>{NUM(liq.os_total)}</td>
            </tr>

            {/* Subtotal */}
            <tr style={{ borderTop: `2px solid ${NAVY}`, borderBottom: '1px solid #d1d5db' }}>
              <td className={TSL}>Subtotal Liquidado</td>
              <td className={TS}>{NUM(liq.total_exentos)}</td>
              <td className={TS}>{NUM(liq.total_gravados_21)}</td>
              <td className={TS}>{NUM(totalIva21)}</td>
              <td className={TS}>{NUM(liq.total_gravados_105)}</td>
              <td className={TS}>{NUM(totalIva105)}</td>
              <td className={`${TS} text-gray-900`}>{FMT(liq.total_liquidado)}</td>
            </tr>

            {/* Retención */}
            <tr style={{ borderBottom: `1px solid #e5e7eb` }}>
              <td className="px-3 py-2 text-left text-[11px] text-gray-500 italic">(−) Retención por Gastos</td>
              {[0,1,2,3,4].map(i => (
                <td key={i} className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
              ))}
              <td className="px-3 py-2 text-right text-[11px] tabular-nums font-semibold text-red-600">
                {liq.retencion_gastos > 0 ? `(${FMT(liq.retencion_gastos)})` : '—'}
              </td>
            </tr>

            {/* Total */}
            <tr style={{ background: NAVY }}>
              <td colSpan={6} className="px-3 py-3 text-left text-[11px] font-bold text-white uppercase tracking-wide">
                Total a Abonar al Prestador
              </td>
              <td className="px-3 py-3 text-right text-[14px] font-bold text-white tabular-nums">
                $ {FMT(liq.total_abonar)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ══ DETALLE PARA FACTURAR ══ */}
        <div className="mb-6">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
            Detalle para Facturar
          </p>
          <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #9ca3af' }}>
                <th className={`${THL} w-[34%]`}>Concepto</th>
                <th className={TH}>Exento</th>
                <th className={TH}>Neto 21%</th>
                <th className={TH}>IVA 21%</th>
                <th className={TH}>Neto 10,5%</th>
                <th className={TH}>IVA 10,5%</th>
                <th className={`${TH} text-gray-700 font-bold`}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={ROW_DIV}>
                <td className={TDL}>Honorarios exentos — período {periodo}</td>
                <td className={TD}>{NUM(facturacion.lineaExenta)}</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className={`${TD} font-semibold text-gray-800`}>{NUM(facturacion.lineaExenta)}</td>
              </tr>
              <tr style={ROW_DIV}>
                <td className={TDL}>Honorarios gravados 21% — período {periodo}</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className={TD}>{NUM(facturacion.totalGravados21)}</td>
                <td className={TD}>{NUM(facturacion.totalIva21)}</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className={`${TD} font-semibold text-gray-800`}>{NUM(facturacion.totalConIva21)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td className={TDL}>Honorarios gravados 10,5% — período {periodo}</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className="px-3 py-2 text-right text-[11px] text-gray-400">—</td>
                <td className={TD}>{NUM(facturacion.totalGravados105)}</td>
                <td className={TD}>{NUM(facturacion.totalIva105)}</td>
                <td className={`${TD} font-semibold text-gray-800`}>{NUM(facturacion.totalConIva105)}</td>
              </tr>
              <tr style={{ borderTop: '1px solid #9ca3af' }}>
                <td className={TSL}>Total</td>
                <td className={TS}>{NUM(facturacion.lineaExenta)}</td>
                <td className={TS}>{NUM(facturacion.totalGravados21)}</td>
                <td className={TS}>{NUM(facturacion.totalIva21)}</td>
                <td className={TS}>{NUM(facturacion.totalGravados105)}</td>
                <td className={TS}>{NUM(facturacion.totalIva105)}</td>
                <td className={`${TS} text-gray-900`}>{NUM(facturacion.totalFacturable)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[9px] text-gray-400 italic mt-1.5">
            * El Ingreso por Caja no se incluye en la facturación.
          </p>
        </div>

        {/* ══ RESUMEN ══ */}
        <div className="flex justify-end mb-8">
          <div style={{ minWidth: '220px' }}>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Resumen de Liquidación
            </p>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
              <div className="flex justify-between px-3 py-2 text-[11px]"
                   style={{ borderBottom: '1px solid #f3f4f6' }}>
                <span className="text-gray-500">Total Bruto Liquidado</span>
                <span className="tabular-nums font-medium text-gray-800">$ {FMT(liq.total_liquidado)}</span>
              </div>
              <div className="flex justify-between px-3 py-2 text-[11px]"
                   style={{ borderBottom: '1px solid #f3f4f6' }}>
                <span className="text-gray-500">Retenciones</span>
                <span className={`tabular-nums font-medium ${liq.retencion_gastos > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {liq.retencion_gastos > 0 ? `$ ${FMT(liq.retencion_gastos)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between px-3 py-2.5 text-[12px]"
                   style={{ background: NAVY }}>
                <span className="font-bold text-white">Total Neto a Abonar</span>
                <span className="tabular-nums font-bold text-white">$ {FMT(liq.total_abonar)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ FIRMAS ══ */}
        <div className="grid grid-cols-2 gap-16 mb-6">
          <div>
            <div style={{ borderBottom: '1px solid #9ca3af', height: '36px' }} />
            <p className="text-[10px] font-semibold text-gray-700 mt-2">Firma del Prestador</p>
            <p className="text-[9px] text-gray-400">Recibí Conforme &nbsp;·&nbsp; Fecha: ___/___/______</p>
          </div>
          <div>
            <div style={{ borderBottom: '1px solid #9ca3af', height: '36px' }} />
            <p className="text-[10px] font-semibold text-gray-700 mt-2">Administración</p>
            <p className="text-[9px] text-gray-400">Instituto Dr. Mercado &nbsp;·&nbsp; Sello y Firma</p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="pt-3 text-center" style={{ borderTop: '1px solid #e5e7eb' }}>
          <p className="text-[8.5px] text-gray-400">
            Documento generado electrónicamente — {numeroLiq} &nbsp;·&nbsp;
            Comprobante de liquidación y autorización de pago. Conservar como respaldo contable y administrativo.
          </p>
        </div>
      </div>

      {/* ESTILOS DE IMPRESIÓN */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          [data-print-report],
          [data-print-report] * { visibility: visible !important; }

          [data-print-report] {
            position: fixed;
            top: 0; left: 0;
            width: 100%;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: 14mm 14mm 14mm 14mm;
          }

          table { page-break-inside: avoid; }
          tr    { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
