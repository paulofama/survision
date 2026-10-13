// ============================================================
// SECCIÓN: Agenda vs facturación
// Análisis Marginal — Sistema de Gestión Integral
// ============================================================
//
// Vive al pie de Por Prestación porque contesta una pregunta sobre ESE informe:
// "la agenda tenía 5 turnos de este código y el informe muestra 1, ¿falta
// plata?". No falta: el informe es fiel a lo facturado y la agenda refleja lo
// agendado. Esta sección muestra en qué turnos difieren y por qué.
//
// Arranca CERRADA. Es una herramienta de control, no un número de gestión:
// quien abre Por Prestación viene a ver rentabilidad, y un panel de
// discrepancias desplegado arriba de todo competiría con eso.
// ============================================================

import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@shared/context/auth-context';
import useConciliacionAgenda, { FilaConciliacion } from '../hooks/useConciliacionAgenda';

/**
 * Dónde se usa este componente
 * -----------------------------
 * En dos lugares, con el mismo hook y los mismos números:
 *
 *  · al pie de Análisis › Por Prestación, cerrado, porque contesta una
 *    pregunta sobre ESE informe;
 *  · como pantalla propia en Conciliación agenda, abierta, que es la que ve
 *    Administración —quien corrige los códigos en GECLISA— sin necesitar el
 *    permiso de Análisis Marginal.
 */

const fmtARS = (n: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);

/**
 * Fecha de una columna `date`.
 *
 * Se formatea sin construir un Date a propósito: `new Date("2026-08-11")` es
 * medianoche UTC, que en Argentina (UTC-3) es el DÍA ANTERIOR. Es un bug que ya
 * apareció tres veces en el proyecto.
 */
const fmtFecha = (d: string | null): string => {
  if (!d) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};

/** Cómo se lee la diferencia de esta fila, según su causa. */
const detalleDeFila = (f: FilaConciliacion): string => {
  switch (f.causa) {
    case 'codigo_distinto':
      return `agenda ${f.cod_agendado || '—'} → facturado ${f.cod_facturado || '—'}`;
    case 'otro_mes':
      return `turno ${fmtFecha(f.fecha_turno)}, movimiento ${fmtFecha(f.fecha_movimiento)}`;
    default:
      return `agenda ${f.cod_agendado || '—'}`;
  }
};

interface Props {
  /** Período "YYYY-MM". */
  mesClave: string;
  /** Para el encabezado: "septiembre 2026". */
  periodoLabel: string;
  /**
   * Abierta de entrada. En la pantalla propia sí —es el contenido de la
   * página—; al pie de Por Prestación no, porque ahí compite con la tabla de
   * rentabilidad, que es a lo que fue el usuario.
   */
  abiertaPorDefecto?: boolean;
}

const ConciliacionAgendaSeccion: React.FC<Props> = ({
  mesClave, periodoLabel, abiertaPorDefecto = false,
}) => {
  const { tienePermiso } = useAuth();
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const [verResueltas, setVerResueltas] = useState(false);
  const puedeVer = tienePermiso('conciliacion');
  const { filas, porCausa, turnos, monto, resueltas, sinDatos, loading, error } =
    useConciliacionAgenda(puedeVer ? mesClave : '', verResueltas);

  // Sin el permiso, la sección no existe. Mostrarla igual no filtraría datos
  // —la RLS devuelve cero filas— pero diría "sin datos espejados", que es
  // falso: los datos están, lo que falta es el permiso. Un cartel que miente
  // sobre los datos es justo lo que esta sección vino a corregir.
  if (!puedeVer) return null;

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        id="conciliacion-toggle"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900">
              Agenda vs facturación — {periodoLabel}
            </span>
            <span className="block text-xs text-gray-500">
              {loading
                ? 'Leyendo…'
                : sinDatos
                  ? 'Sin datos espejados para este período'
                  : turnos === 0
                    ? 'Todas las diferencias del período están corregidas'
                    : `${turnos} turno(s) con diferencia · ${fmtARS(monto)} involucrados`}
            </span>
          </span>
        </span>
        {abierta
          ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {abierta && (
        <div className="border-t border-gray-100 px-4 py-4">
          <p className="text-xs text-gray-600 max-w-3xl">
            Este informe es fiel a lo <strong>facturado</strong>. La agenda refleja lo{' '}
            <strong>agendado</strong>, y las dos difieren en alrededor del 1,5 % de los turnos
            atendidos. Lo que figura acá <strong>no es plata perdida</strong>: está contada en la
            fila de otro código o en otro mes. La corrección se hace en GECLISA.
          </p>

          {loading && (
            <p className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la conciliación…
            </p>
          )}

          {!loading && error && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              No se pudo leer la conciliación: {error}
            </p>
          )}

          {!loading && !error && sinDatos && (
            <div className="mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="font-semibold text-gray-800">No hay datos de este período.</p>
              <p>
                No quiere decir que no hubiera diferencias. La agenda de GECLISA es una ventana
                que guarda unos tres meses cerrados y después se purga: un mes anterior al
                arranque de este registro ya no se puede recalcular.
              </p>
            </div>
          )}

          {!loading && !error && !sinDatos && turnos === 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Las {resueltas} diferencia(s) de este período ya se corrigieron en GECLISA.
            </p>
          )}

          {!loading && !error && turnos > 0 && (
            <>
              <div className="mt-4 flex flex-col gap-2">
                {porCausa.map((c) => (
                  <div key={c.clave} className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-sm font-bold text-gray-900 tabular-nums w-7 text-right shrink-0">
                      {c.turnos}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{c.titulo}</span>
                      <span className="block text-xs text-gray-500">{c.detalle}</span>
                    </span>
                    <span className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">
                      {fmtARS(c.monto)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-1.5 pr-3 font-medium">Fecha</th>
                      <th className="py-1.5 pr-3 font-medium">Paciente</th>
                      <th className="py-1.5 pr-3 font-medium">O. Social</th>
                      <th className="py-1.5 pr-3 font-medium">Diferencia</th>
                      <th className="py-1.5 pr-3 font-medium text-right">Importe</th>
                      <th className="py-1.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.turno_id} className="border-b border-gray-50">
                        <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap tabular-nums">
                          {fmtFecha(f.fecha_turno)}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-900">{f.paciente || '—'}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{f.obra_social || '—'}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{detalleDeFila(f)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-800 tabular-nums whitespace-nowrap">
                          {fmtARS(Number(f.monto) || 0)}
                        </td>
                        <td className="py-1.5 whitespace-nowrap">
                          {f.resuelta_at
                            ? <span className="text-emerald-700">corregida</span>
                            : <span className="text-amber-700">pendiente</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && !error && resueltas > 0 && (
            <label
              htmlFor="conciliacion-ver-resueltas"
              className="mt-4 inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer"
            >
              <input
                id="conciliacion-ver-resueltas"
                type="checkbox"
                checked={verResueltas}
                onChange={(e) => setVerResueltas(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              Mostrar también las {resueltas} ya corregidas en GECLISA
            </label>
          )}
        </div>
      )}
    </div>
  );
};

export default ConciliacionAgendaSeccion;
