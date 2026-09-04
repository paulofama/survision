// ============================================================
// Modal del Informe Mensual de Gestión
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// Elige el mes (SÓLO CERRADOS) y dispara el PDF.
//
// La plata la trae `useEvolucionMensual`, el mismo hook de la grilla de
// Evolución Temporal: por eso el informe no puede separarse de la pantalla.
// Las cantidades se cuentan acá sobre las filas de `movimientos_geclisa` con
// `es_principal = true`, que es el universo de Análisis → Por Prestación.
// ============================================================

import { useState, useCallback, useMemo, useEffect } from 'react';
import { FileText, Loader2, X, Download, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@shared/lib/supabase';
import useEvolucionMensual from '@shared/hooks/useEvolucionMensual';
import type { MovGecRow } from '@shared/utils/movimientosAgg';
import { toMesKey, parseMesKey, type Mes } from '@shared/types/evolucionTemporal';
import { traerTodo } from '@shared/lib/traerTodo';
import { cargarCostoLaboralRango, claveMes } from '@shared/services/costoLaboral';
import {
  armarDatosInformeMensual, etiquetaMes, CATEGORIA_SUELDOS,
  type SimulacionSueldos,
} from '../utils/datosInformeMensual';
import { generarInformeMensualPDF, type ComprobanteCF } from '../utils/generarInformeMensual';

/** Cuántos meses de historia pide el informe para la serie y los promedios. */
const MESES_HISTORIA = 12;

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

/**
 * Meses cerrados: todos los anteriores al corriente. Se calcula por calendario,
 * igual que `useEvolucionMensual`, para que las dos listas coincidan siempre.
 */
function mesesCerradosHasta(hoy: Date, cantidad: number): Mes[] {
  const out: Mes[] = [];
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  d.setMonth(d.getMonth() - 1); // el mes en curso queda afuera
  for (let i = 0; i < cantidad; i++) {
    out.push(toMesKey(d.getFullYear(), d.getMonth() + 1));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function InformeMensualModal({
  isOpen, onClose, generadoPor,
}: {
  isOpen: boolean;
  onClose: () => void;
  generadoPor: string;
}) {
  const opciones = useMemo(() => mesesCerradosHasta(new Date(), 18), []);
  const [mesElegido, setMesElegido] = useState<Mes>(opciones[0]);
  const [incluirAnexo, setIncluirAnexo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [simulacion, setSimulacion] = useState<SimulacionSueldos | null>(null);
  const [chequeando, setChequeando] = useState(false);

  // Rango: MESES_HISTORIA meses terminando en el elegido.
  const { anio: aH, mes: mH } = parseMesKey(mesElegido);
  const desde = new Date(aH, mH - 1, 1);
  desde.setMonth(desde.getMonth() - (MESES_HISTORIA - 1));

  const { data: evolucion, loading, error: errEvol } = useEvolucionMensual({
    anioDesde: desde.getFullYear(),
    mesDesde: desde.getMonth() + 1,
    anioHasta: aH,
    mesHasta: mH,
  });

  // ── Simulación de sueldos ──
  // Se propone sola si el mes elegido no tiene liquidación cargada. El operador
  // la ve antes de generar: no se aplica a escondidas.
  useEffect(() => {
    if (!isOpen) return;
    let vivo = true;
    (async () => {
      setChequeando(true);
      setSimulacion(null);
      try {
        const { data } = await supabase
          .from('liquidaciones_mes')
          .select('anio, mes, estado')
          .order('anio', { ascending: false })
          .order('mes', { ascending: false });
        const cargadas = (data || []) as { anio: number; mes: number; estado: string }[];
        const tiene = cargadas.some(l => toMesKey(l.anio, l.mes) === mesElegido);
        if (tiene || !cargadas.length) { if (vivo) setChequeando(false); return; }

        // Último mes liquidado ANTERIOR al elegido: es la base acordada.
        const previa = cargadas.find(l => toMesKey(l.anio, l.mes) < mesElegido);
        if (!previa) { if (vivo) setChequeando(false); return; }

        // Vía el servicio compartido, no llamando la RPC a mano: es el mismo
        // que usan useEvolucionMensual y useCostosFijosDistribucion, y ya sabe
        // que el campo es `costo_laboral` (bruto + cargas), no sólo el bruto.
        const meses = await cargarCostoLaboralRango(
          previa.anio, previa.mes, previa.anio, previa.mes,
        );
        const importe = meses.get(claveMes(previa.anio, previa.mes))?.costoLaboral ?? 0;
        if (!importe || !vivo) { if (vivo) setChequeando(false); return; }

        setSimulacion({
          meses: [mesElegido],
          importe,
          base: `el costo laboral liquidado de ${etiquetaMes(toMesKey(previa.anio, previa.mes))}`,
          importeReemplazado: {},
        });
      } catch {
        /* sin simulación: el informe sale con lo que haya y lo declara */
      } finally {
        if (vivo) setChequeando(false);
      }
    })();
    return () => { vivo = false; };
  }, [isOpen, mesElegido]);

  const generar = useCallback(async () => {
    setGenerando(true);
    setError('');
    try {
      // Cantidades: mismas filas que Análisis → Por Prestación.
      const { anio, mes } = parseMesKey(mesElegido);
      const d0 = new Date(anio, mes - 1, 1);
      d0.setMonth(d0.getMonth() - (MESES_HISTORIA - 1));
      const orMeses: string[] = [];
      const cur = new Date(d0);
      while (cur.getFullYear() < anio || (cur.getFullYear() === anio && cur.getMonth() + 1 <= mes)) {
        orMeses.push(`and(anio.eq.${cur.getFullYear()},mes.eq.${cur.getMonth() + 1})`);
        cur.setMonth(cur.getMonth() + 1);
      }
      // `traerTodo` pagina: PostgREST corta en 1000 filas sin avisar, y acá se
      // piden 12 meses de atenciones (más de 12.000 filas).
      const filtro = orMeses.join(',');
      const movimientos = await traerTodo<MovGecRow>((offset) =>
        supabase
          .from('movimientos_geclisa')
          .select('*')
          .or(filtro)
          .eq('es_principal', true)
          .range(offset, offset + 999),
      );

      // Comprobantes de las 3 categorías de mayor desvío del mes.
      const comprobantes = await cargarComprobantes(anio, mes);

      const datos = armarDatosInformeMensual({
        evolucion, movimientos, mesInforme: mesElegido, simulacion,
        generadoPor, filtros: [], mesesSerie: MESES_HISTORIA,
      });

      generarInformeMensualPDF(datos, { comprobantes, incluirAnexo });
      onClose();
    } catch (e) {
      setError((e as Error).message || 'No se pudo generar el informe');
    } finally {
      setGenerando(false);
    }
  }, [evolucion, mesElegido, simulacion, generadoPor, incluirAnexo, onClose]);

  if (!isOpen) return null;

  const listo = !loading && !chequeando && !errEvol;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b bg-blue-50 border-blue-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Informe Mensual de Gestión
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Un PDF por mes, para la dirección.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <label className="block text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Mes del informe *</span>
            <select
              value={mesElegido}
              onChange={(e) => setMesElegido(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {opciones.map(m => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
            </select>
            <span className="text-[11px] text-gray-500 mt-1 block">
              Sólo meses cerrados. El mes en curso no se ofrece: sus datos están incompletos
              y el informe no lo presenta en ninguna sección.
            </span>
          </label>

          {chequeando && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Verificando la liquidación de sueldos del mes…
            </p>
          )}

          {simulacion && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Costo laboral estimado
              </p>
              <p>
                {etiquetaMes(mesElegido)} no tiene liquidación de sueldos cargada. El informe
                va a usar <strong>{fmt(simulacion.importe)}</strong>, estimado sobre {simulacion.base}.
              </p>
              <p>
                Sin esa estimación el sistema cae a la erogación clasificada, que vale
                aproximadamente la mitad del costo laboral real. El PDF marca el dato como
                estimado en cada sección donde aparece.
              </p>
            </div>
          )}

          {!chequeando && !simulacion && (
            <p className="text-xs text-green-700 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" /> La liquidación de sueldos de {etiquetaMes(mesElegido)} está cargada: no hace falta estimar.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={incluirAnexo} onChange={(e) => setIncluirAnexo(e.target.checked)} className="rounded" />
            Incluir anexo con el detalle completo por prestación
          </label>

          {loading && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Cargando la serie de {MESES_HISTORIA} meses…
            </p>
          )}
          {errEvol && <p className="text-xs text-red-600">No se pudo cargar la evolución: {errEvol}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            disabled={!listo || generando}
            onClick={generar}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40 flex items-center gap-2"
          >
            {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Comprobantes de las tres categorías de costo fijo con mayor desvío contra el
 * mes anterior. Es la apertura que ya existe en Evolución Temporal, traída acá
 * para que el informe pueda explicar el desvío sin que nadie tenga que ir a
 * buscarlo a la pantalla.
 */
async function cargarComprobantes(anio: number, mes: number): Promise<ComprobanteCF[]> {
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anioAnt = mes === 1 ? anio - 1 : anio;

  const { data } = await supabase
    .from('erogaciones_clasificacion')
    .select('anio, mes, fecha, monto, proveedor_nombre, descripcion, categoria_costo_fijo_id, categorias_costo_fijo(nombre)')
    .in('anio', [anio, anioAnt])
    .in('mes', [mes, mesAnt]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (data || []) as any[];
  const nombreDe = (r: any) => r.categorias_costo_fijo?.nombre || 'Sin categoría'; // eslint-disable-line @typescript-eslint/no-explicit-any

  const totales = new Map<string, { act: number; ant: number }>();
  for (const r of filas) {
    const cat = nombreDe(r);
    const e = totales.get(cat) || { act: 0, ant: 0 };
    if (r.anio === anio && r.mes === mes) e.act += Number(r.monto) || 0;
    else e.ant += Number(r.monto) || 0;
    totales.set(cat, e);
  }

  const top3 = [...totales.entries()]
    .map(([cat, v]) => ({ cat, desvio: Math.abs(v.act - v.ant) }))
    .sort((a, b) => b.desvio - a.desvio)
    .slice(0, 3)
    .map(x => x.cat);

  return filas
    .filter(r => r.anio === anio && r.mes === mes && top3.includes(nombreDe(r)))
    .sort((a, b) => Math.abs(Number(b.monto)) - Math.abs(Number(a.monto)))
    .slice(0, 24)
    .map(r => ({
      categoria: nombreDe(r),
      fecha: String(r.fecha || '').slice(8, 10) + '/' + String(r.fecha || '').slice(5, 7),
      proveedor: r.proveedor_nombre || '',
      descripcion: r.descripcion || '',
      monto: Number(r.monto) || 0,
    }));
}
