// ============================================================
// Historial de seguimiento de un presupuesto (llamadas + encuestas)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================

import { useEffect, useState } from "react";
import { sbGet } from "../utils/circuito";

interface Llamada { id: string; usuario: string | null; canal: string; resultado: string; numero: string | null; texto: string | null; created_at: string; }
interface Encuesta { id: string; usuario: string | null; rama: string; respuestas: { clave: string; texto: string; valor: boolean | null; nota: string }[]; observaciones: string | null; created_at: string; }

const fmtDT = (d: string) => { try { return new Date(d).toLocaleString("es-AR"); } catch { return d; } };
const CANAL: Record<string, string> = { telefono: "Teléfono", whatsapp: "WhatsApp" };
const RES: Record<string, { l: string; c: string }> = {
  atendio: { l: "Atendió", c: "text-green-700 bg-green-100" },
  no_atendio: { l: "No atendió", c: "text-red-600 bg-red-100" },
  whatsapp_enviado: { l: "WhatsApp enviado", c: "text-teal-700 bg-teal-100" },
};

export default function HistorialSeguimientoModal({ presupuestoId, numero, onClose }: { presupuestoId: string; numero: string; onClose: () => void; }) {
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ll, en] = await Promise.all([
          sbGet<Llamada>(`presupuestos_seguimiento_llamadas?presupuesto_id=eq.${presupuestoId}&select=*&order=created_at.desc`),
          sbGet<Encuesta>(`presupuestos_seguimiento_encuesta?presupuesto_id=eq.${presupuestoId}&select=*&order=created_at.desc`),
        ]);
        setLlamadas(ll); setEncuestas(en);
      } catch { /* noop */ } finally { setLoading(false); }
    })();
  }, [presupuestoId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Historial de seguimiento — {numero}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : (
            <>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Intentos ({llamadas.length})</h4>
                {llamadas.length === 0 ? <p className="text-sm text-gray-400">Sin intentos registrados.</p> : (
                  <div className="space-y-1.5">
                    {llamadas.map((l) => {
                      const r = RES[l.resultado] || { l: l.resultado, c: "text-gray-600 bg-gray-100" };
                      return (
                        <div key={l.id} className="flex items-center gap-3 text-xs border border-gray-100 rounded-lg px-3 py-2">
                          <span className="text-gray-400 w-36 flex-shrink-0">{fmtDT(l.created_at)}</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${r.c}`}>{r.l}</span>
                          <span className="text-gray-500">{CANAL[l.canal] || l.canal}</span>
                          <span className="text-gray-400 ml-auto">{l.usuario || "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Encuestas ({encuestas.length})</h4>
                {encuestas.length === 0 ? <p className="text-sm text-gray-400">Sin encuestas.</p> : (
                  <div className="space-y-3">
                    {encuestas.map((e) => (
                      <div key={e.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.rama === "reviso" ? "text-green-700 bg-green-100" : "text-amber-700 bg-amber-100"}`}>
                            {e.rama === "reviso" ? "Revisó el presupuesto" : "No lo revisó"}
                          </span>
                          <span className="text-[11px] text-gray-400">{fmtDT(e.created_at)} · {e.usuario || "—"}</span>
                        </div>
                        <div className="space-y-1">
                          {(e.respuestas || []).map((r, i) => (
                            <div key={i} className="text-xs">
                              <span className="text-gray-600">{r.texto}</span>{" "}
                              <span className={`font-medium ${r.valor === true ? "text-green-700" : r.valor === false ? "text-red-600" : "text-gray-400"}`}>
                                {r.valor === true ? "Sí" : r.valor === false ? "No" : "—"}
                              </span>
                              {r.nota ? <span className="text-gray-400"> · {r.nota}</span> : null}
                            </div>
                          ))}
                        </div>
                        {e.observaciones && <p className="text-xs text-gray-500 mt-2 italic">Obs.: {e.observaciones}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
