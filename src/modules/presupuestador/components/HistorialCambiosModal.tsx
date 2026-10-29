// ============================================================
// Historial de cambios del presupuesto, desde la Búsqueda
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// La línea de tiempo vivía sólo en el panel Circuito, que se abre con el
// presupuesto ACEPTADO. Después de volver a pendiente, el registro de quién lo
// había aceptado, quién lo revirtió y por qué quedaba guardado sin que ninguna
// pantalla lo mostrara (migración 79). Este modal lo muestra para cualquier
// presupuesto que tenga algo registrado.
// ============================================================

import { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { cargarHistorial, sbGet, type Convenio, type Emision, type HistorialFila } from "../utils/circuito";
import LineaDeTiempo from "./LineaDeTiempo";

export default function HistorialCambiosModal({
  presupuestoId,
  numero,
  convenios,
  onClose,
}: {
  presupuestoId: string;
  numero: string;
  convenios: Convenio[];
  onClose: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState<HistorialFila[]>([]);
  const [emisiones, setEmisiones] = useState<Emision[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError("");
      try {
        const [h, e] = await Promise.all([
          cargarHistorial(presupuestoId),
          sbGet<Emision>(
            `presupuestos_sobres?presupuesto_id=eq.${presupuestoId}`
            + "&select=documentos,modo,cobertura,generado_por,generado_en&order=generado_en.desc",
          ),
        ]);
        if (!vivo) return;
        setHistorial(h);
        setEmisiones(e);
      } catch (err) {
        if (vivo) setError((err as Error).message || "No se pudo cargar el historial");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [presupuestoId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" />
            Historial · {numero}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto">
          {cargando ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : error ? (
            <p className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          ) : (
            <LineaDeTiempo historial={historial} emisiones={emisiones} convenios={convenios} />
          )}
        </div>

        <div className="flex justify-end px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
