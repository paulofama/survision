// ===========================================================================
// PAGE: ReportesSueldosPage - MODULO CARGA DE SUELDOS (Fase 5)
// ===========================================================================
// Sistema: SurVisión / Sistema Integral de Gestión
// Cliente: Instituto Dr. Mercado / Survisión S.A.
// Desarrollo: P. Famá
//
// Reportes del Auditor. Gated por el permiso sueldos:reportes (solo Auditor).
// Muestra la serie anual de indicadores comparativos y permite descargar el
// PDF mensual de 8 secciones de cada mes.
//
// Ruta: /sueldos/reportes
// ===========================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Download, Loader2, Lock, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@shared/lib/supabase';
import { useAuth } from '@shared/context/AuthContext';
import type { ModuloSistema } from '@shared/types/auth.types';
import type {
  AsientoSueldos, AsientoSueldosLinea, F931Declaracion, HallazgoSueldos,
} from '../types/sueldos';
import { PERMISO_REPORTES_SUELDOS, periodoLabel, mesLabel } from '../utils/constantes';
import {
  calcularIndicadorMes, compararSerie, indicadorDeMes, type IndicadorComparado,
} from '../utils/indicadores';
import {
  generarReporteSueldosPDF, type DatosReporteMes, type NominaFilaReporte,
} from '../utils/generarReporteSueldosPDF';

const NF = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number | null | undefined) => '$ ' + NF.format(Number(n) || 0);
const ANIOS = [2025, 2026, 2024];

const LABEL_BLOQUE: Record<string, string> = {
  pago_sueldos: 'Pago de Sueldos',
  horas_complementarias: 'Horas Complementarias',
  dia_sanidad: 'Día de la Sanidad',
  seguridad_social: 'Seguridad Social',
  sindicato: 'Sindicato',
};

// ---------------------------------------------------------------------------
// PAGINA
// ---------------------------------------------------------------------------

const ReportesSueldosPage: React.FC = () => {
  const navigate = useNavigate();
  const { tienePermiso, usuario } = useAuth();
  const esAuditor = tienePermiso(PERMISO_REPORTES_SUELDOS as ModuloSistema);

  const [anio, setAnio] = useState<number>(2025);
  const [serie, setSerie] = useState<IndicadorComparado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState<number | null>(null);

  const cargarSerie = useCallback(async (anioSel: number) => {
    try {
      setLoading(true);
      setError(null);
      const [asRes, fRes] = await Promise.all([
        supabase.from('asientos_sueldos').select('*').eq('anio', anioSel),
        supabase.from('f931_declaraciones').select('*').eq('anio', anioSel).eq('estado', 'REVISADO_CONFIRMADO'),
      ]);
      if (asRes.error) throw new Error(asRes.error.message);
      if (fRes.error) throw new Error(fRes.error.message);

      const asByMes = new Map<number, AsientoSueldos>((asRes.data || []).map((a) => [a.mes, a as AsientoSueldos]));
      const fByMes = new Map<number, F931Declaracion>((fRes.data || []).map((f) => [f.mes, f as F931Declaracion]));

      const meses = new Set<number>([...asByMes.keys(), ...fByMes.keys()]);
      const indicadores = [...meses].map((mes) =>
        calcularIndicadorMes(anioSel, mes, asByMes.get(mes) ?? null, fByMes.get(mes) ?? null)
      );
      setSerie(compararSerie(indicadores));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando indicadores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (esAuditor) cargarSerie(anio);
  }, [esAuditor, anio, cargarSerie]);

  // ---- Ensamblar datos del mes y generar PDF ----------------------------

  const descargarPDF = useCallback(async (mes: number) => {
    setGenerando(mes);
    setError(null);
    try {
      // Liquidacion + bloques + lineas
      const { data: liq } = await supabase.from('liquidaciones_mes')
        .select('*').eq('anio', anio).eq('mes', mes).maybeSingle();
      if (!liq) throw new Error(`No hay liquidación para ${mes}/${anio}`);

      const { data: bloques } = await supabase.from('liquidacion_bloques')
        .select('*').eq('liquidacion_id', liq.id);
      const bloqueIds = (bloques || []).map((b) => b.id);
      const [empRes, concRes, empleadosRes] = await Promise.all([
        supabase.from('liquidacion_lineas_empleado').select('*').in('bloque_id', bloqueIds.length ? bloqueIds : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('liquidacion_lineas_concepto').select('*').in('bloque_id', bloqueIds.length ? bloqueIds : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('empleados').select('id, apellido, nombre, area'),
      ]);
      const lineasEmp = empRes.data || [];
      const lineasConc = concRes.data || [];
      const empMap = new Map((empleadosRes.data || []).map((e) => [e.id, e]));

      const bloquePago = (bloques || []).find((b) => b.tipo === 'pago_sueldos');
      const bloqueHC = (bloques || []).find((b) => b.tipo === 'horas_complementarias');
      const pagoLineas = lineasEmp.filter((l) => l.bloque_id === bloquePago?.id);
      const hcLineas = lineasEmp.filter((l) => l.bloque_id === bloqueHC?.id);
      const hcPorEmp = new Map(hcLineas.map((l) => [l.empleado_id, Number(l.monto_neto_cargado) || 0]));

      const nomina: NominaFilaReporte[] = pagoLineas.map((l) => {
        const e = empMap.get(l.empleado_id);
        return {
          apellido_nombre: e ? `${e.apellido}, ${e.nombre}` : '(empleado)',
          area: l.area_snapshot || e?.area || '',
          neto: Number(l.monto_neto_cargado) || 0,
          hc: hcPorEmp.get(l.empleado_id) || 0,
          bruto: Number(l.bruto_estimado) || 0,
        };
      }).sort((a, b) => a.apellido_nombre.localeCompare(b.apellido_nombre));

      // Totales por bloque
      const minutaBloques = (bloques || []).map((b) => {
        const esConcepto = b.tipo === 'seguridad_social' || b.tipo === 'sindicato';
        const total = esConcepto
          ? lineasConc.filter((l) => l.bloque_id === b.id).reduce((s, l) => s + (Number(l.monto) || 0), 0)
          : lineasEmp.filter((l) => l.bloque_id === b.id).reduce((s, l) => s + (Number(l.monto_neto_cargado) || 0), 0);
        return { label: LABEL_BLOQUE[b.tipo] ?? b.tipo, total };
      });

      // Asiento
      const { data: asCab } = await supabase.from('asientos_sueldos')
        .select('*').eq('liquidacion_id', liq.id).maybeSingle();
      let asLineas: AsientoSueldosLinea[] = [];
      if (asCab) {
        const { data } = await supabase.from('asiento_sueldos_lineas')
          .select('*').eq('asiento_id', asCab.id).order('orden', { ascending: true });
        asLineas = (data || []) as AsientoSueldosLinea[];
      }

      // F.931
      const { data: f931 } = await supabase.from('f931_declaraciones')
        .select('*').eq('anio', anio).eq('mes', mes).eq('estado', 'REVISADO_CONFIRMADO')
        .order('confirmado_at', { ascending: false }).limit(1).maybeSingle();

      // Hallazgos
      const { data: hallazgos } = await supabase.from('hallazgos_sueldos')
        .select('*').eq('liquidacion_id', liq.id);

      const datos: DatosReporteMes = {
        anio, mes,
        periodoLabel: periodoLabel(anio, mes),
        estado: liq.estado,
        empresa: { razon_social: 'Survisión S.A.', cuit: '30-70967266-1' },
        nomina,
        minutaBloques,
        f931: (f931 as F931Declaracion) ?? null,
        indicadorActual: indicadorDeMes(serie, anio, mes),
        asientoCabecera: (asCab as AsientoSueldos) ?? null,
        asientoLineas: asLineas,
        hallazgos: (hallazgos as HallazgoSueldos[]) ?? [],
        generadoPor: usuario?.nombre_completo,
        generadoEn: new Date().toISOString(),
      };

      generarReporteSueldosPDF(datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando el PDF');
    } finally {
      setGenerando(null);
    }
  }, [anio, serie, usuario]);

  // ---- Render gate ------------------------------------------------------

  if (!esAuditor) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate('/sueldos')} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Volver a Sueldos
        </button>
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <Lock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Acceso restringido</h2>
          <p className="text-sm text-gray-500">Los reportes de Sueldos son exclusivos del rol <span className="font-semibold">Auditor</span> (permiso <code>sueldos:reportes</code>).</p>
        </div>
      </div>
    );
  }

  // ---- Render -----------------------------------------------------------

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/sueldos')} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Volver">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" /> Reportes de Sueldos
            </h1>
            <p className="text-sm text-gray-500">Indicadores comparativos y reporte mensual de auditoría (PDF 8 secciones).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Año:</label>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" /><p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      ) : serie.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay datos de {anio} (faltan asientos o F.931 confirmados).</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Mes</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Dot.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Neto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Bruto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Costo laboral</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Alícuota</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Δ Alíc.</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-20">PDF</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {serie.map((s) => {
                  const quiebre = s.var_alicuota_pp != null && Math.abs(s.var_alicuota_pp) >= 1;
                  return (
                    <tr key={s.mes} className={quiebre ? 'bg-yellow-50/40' : ''}>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{mesLabel(s.mes)}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-700">{s.dotacion}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-700">{money(s.neto)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-700">{money(s.bruto)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-700">{money(s.costo_laboral)}</td>
                      <td className="px-3 py-2 text-right text-sm font-mono text-gray-700">{(s.alicuota_cargas * 100).toFixed(2)}%</td>
                      <td className={`px-3 py-2 text-right text-sm font-mono ${quiebre ? 'text-yellow-700 font-semibold' : 'text-gray-500'}`}>
                        {s.var_alicuota_pp != null ? `${s.var_alicuota_pp >= 0 ? '+' : ''}${s.var_alicuota_pp.toFixed(2)}pp` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => descargarPDF(s.mes)} disabled={generando === s.mes}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50">
                          {generando === s.mes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-gray-400" />
            Filas resaltadas: quiebre de alícuota efectiva ≥ 1 punto porcentual vs mes anterior. Alícuota = contribuciones / bruto del asiento.
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportesSueldosPage;
