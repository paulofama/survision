// ============================================================
// PÁGINA: Conciliación agenda vs facturación
// Sistema de Gestión Integral — Survisión S.A.
// ============================================================
//
// POR QUÉ ESTA PANTALLA EXISTE APARTE DE POR PRESTACIÓN
// ------------------------------------------------------
// La misma sección vive al pie de Análisis › Por Prestación, donde contesta una
// pregunta sobre ese informe. Pero quien TRABAJA esta lista es Administración:
// es quien va a corregir los códigos en GECLISA.
//
// Y Análisis Marginal pide el permiso `analisis_marginal`, que el rol
// Administracion no tiene. Gatear la única entrada ahí dejaba la lista sólo
// para la Dirección; darle `analisis_marginal` a Administración habría sido
// abrirle rentabilidad, márgenes y resultado por prestación para resolver esto.
//
// Esta pantalla pide nada más `conciliacion`: la lista de diferencias y nada
// más. Reusa el mismo componente y el mismo hook, así los números de las dos
// pantallas no pueden separarse.
// ============================================================

import React, { useEffect, useState } from 'react';
import { GitCompareArrows, Loader2 } from 'lucide-react';
import ConciliacionAgendaSeccion from '../components/ConciliacionAgendaSeccion';
import useMesesConciliacion from '../hooks/useMesesConciliacion';
import { MESES_NOMBRE } from '@modules/analisis-marginal/utils/periodo';

/** "2026-09" → "septiembre 2026". */
const etiquetaMes = (mes: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  return `${MESES_NOMBRE[Number(m[2]) - 1]} ${m[1]}`;
};

const ConciliacionAgendaPage: React.FC = () => {
  const { meses, loading, error } = useMesesConciliacion();
  const [elegido, setElegido] = useState<string>('');

  // El mes más nuevo con datos, en cuanto se sepa cuál es. No se fija el mes
  // en curso: podría no tener filas todavía y la pantalla abriría vacía.
  useEffect(() => {
    if (!elegido && meses.length) setElegido(meses[0].mes);
  }, [meses, elegido]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="flex items-start gap-3">
        <GitCompareArrows className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Conciliación agenda vs facturación</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Turnos atendidos donde lo facturado no coincide con lo agendado. La corrección se
            hace en GECLISA: esta pantalla muestra dónde, no reescribe ningún número.
          </p>
        </div>
      </header>

      {loading && (
        <p className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando los períodos con datos…
        </p>
      )}

      {!loading && error && (
        <p className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          No se pudieron leer los períodos: {error}
        </p>
      )}

      {!loading && !error && meses.length === 0 && (
        <div className="mt-6 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 space-y-1 max-w-2xl">
          <p className="font-semibold text-gray-800">Todavía no hay períodos registrados.</p>
          <p className="text-xs">
            El registro lo deja el sync de la clínica, que corre cada hora. Si recién se puso en
            marcha, el primer período aparece en la próxima corrida.
          </p>
        </div>
      )}

      {!loading && !error && meses.length > 0 && (
        <>
          {/*
            Se ofrecen SÓLO los meses que tienen datos. La agenda de GECLISA se
            purga a los ~3 meses cerrados, así que un selector libre invitaría a
            elegir períodos vacíos y a leer ese vacío como "no hubo diferencias".
          */}
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Período">
            {meses.map((m) => (
              <button
                key={m.mes}
                id={`conciliacion-mes-${m.mes}`}
                onClick={() => setElegido(m.mes)}
                aria-pressed={elegido === m.mes}
                className={`px-3 py-1.5 rounded-lg border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  elegido === m.mes
                    ? 'border-blue-500 bg-blue-50 text-blue-900 font-medium'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {etiquetaMes(m.mes)}
                <span className={`ml-2 text-xs tabular-nums ${
                  m.pendientes > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {m.pendientes > 0 ? m.pendientes : '✓'}
                </span>
              </button>
            ))}
          </div>

          {elegido && (
            <ConciliacionAgendaSeccion
              mesClave={elegido}
              periodoLabel={etiquetaMes(elegido)}
              abiertaPorDefecto
            />
          )}

          <p className="mt-4 text-xs text-gray-500 max-w-2xl">
            El número de cada período son las diferencias sin corregir. Las corregidas se
            conservan marcadas, para poder ver cuánto se corrigió.
          </p>
        </>
      )}
    </div>
  );
};

export default ConciliacionAgendaPage;
