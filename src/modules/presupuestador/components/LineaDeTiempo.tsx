// ============================================================
// Línea de tiempo del presupuesto — sólo el dibujo
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// El armado de los eventos es puro y vive en `utils/lineaDeTiempo.ts`, con sus
// tests. Acá sólo se dibuja.
//
// La usan el panel Circuito y el historial de la Búsqueda. Estaba dentro del
// Circuito, que sólo se abre con el presupuesto ACEPTADO: después de volver a
// pendiente, el registro de qué pasó quedaba guardado y nadie lo podía ver
// (migración 79).
// ============================================================

import { useMemo } from "react";
import type { Convenio, Emision, HistorialFila } from "../utils/circuito";
import { lineaDeTiempo } from "../utils/lineaDeTiempo";

/** Fecha y hora, para la línea de tiempo: dos cambios del mismo día se ordenan. */
const fmtFechaHora = (d: string | null | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  const dd = dt.getDate().toString().padStart(2, "0");
  const mm = (dt.getMonth() + 1).toString().padStart(2, "0");
  const hh = dt.getHours().toString().padStart(2, "0");
  const mi = dt.getMinutes().toString().padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()} ${hh}:${mi}`;
};

export default function LineaDeTiempo({
  historial,
  emisiones,
  convenios,
}: {
  historial: HistorialFila[];
  emisiones: Emision[];
  convenios: Convenio[];
}) {
  const eventos = useMemo(
    () => lineaDeTiempo(historial, emisiones, convenios),
    [historial, emisiones, convenios],
  );

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Qué pasó con este presupuesto</h4>
      {eventos.length === 0 ? (
        <p className="text-xs text-gray-500">
          Todavía no se emitió ningún documento ni se registró ningún cambio.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {eventos.map((ev, i) => (
            <li
              key={`${ev.cuando}-${i}`}
              className="flex items-start gap-2.5 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2"
            >
              <span
                className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                  ev.clase === "emision" ? "bg-blue-500" : "bg-amber-500"
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900 break-words">{ev.titulo}</span>
                {ev.detalle && <span className="block text-gray-600 break-words">{ev.detalle}</span>}
                <span className="block text-gray-400">
                  {fmtFechaHora(ev.cuando)}
                  {ev.quien ? ` · ${ev.quien}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-gray-500 mt-2">
        Azul: documentos emitidos. Ámbar: cambios registrados.
      </p>
    </div>
  );
}
