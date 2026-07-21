// ============================================================
// Panel Circuito — rama de aceptación + checklist de trámites del presupuesto
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Muestra los datos de la aceptación (cobertura/convenio/fecha/ojo/LIO) y el
// checklist de trámites hasta "LISTO PARA CIRUGÍA". Lee/escribe
// presupuestos_aceptacion y presupuestos_checklist (RLS 'presupuestador').
// ============================================================

import { useEffect, useState } from "react";
import {
  Aceptacion, ChecklistRow, Convenio, Lio,
  CHECKLIST_ITEMS, OJOS, SUB_RAMAS,
  listoParaCirugia, progresoChecklist,
  sbGet, sbPatch,
} from "../utils/circuito";
import { DOCS, armarContexto, cargarConsentimiento, generarDocumento, generarSobreCompleto } from "../utils/sobre";

interface PresupuestoMin {
  id: string;
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  paciente_documento?: string;
  total_final?: number | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos_completos?: any;
}

const fmtFecha = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
  } catch { return "—"; }
};

export default function CircuitoPanel({
  presupuesto,
  convenios,
  lios,
  username,
  onClose,
}: {
  presupuesto: PresupuestoMin;
  convenios: Convenio[];
  lios: Lio[];
  username: string | null;
  onClose: () => void;
}) {
  const [aceptacion, setAceptacion] = useState<Aceptacion | null>(null);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [consentimiento, setConsentimiento] = useState<{ titulo: string; cuerpo: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, ch, cons] = await Promise.all([
        sbGet<Aceptacion>(`presupuestos_aceptacion?presupuesto_id=eq.${presupuesto.id}&select=*`),
        sbGet<ChecklistRow>(`presupuestos_checklist?presupuesto_id=eq.${presupuesto.id}&select=*`),
        cargarConsentimiento(),
      ]);
      setAceptacion(a[0] || null);
      setConsentimiento(cons);
      // ordenar por el orden fijo de CHECKLIST_ITEMS
      const orden = new Map(CHECKLIST_ITEMS.map((it, i) => [it.clave, i]));
      setRows((ch || []).slice().sort((x, y) => (orden.get(x.item_clave) ?? 99) - (orden.get(y.item_clave) ?? 99)));
    } catch (e) {
      setError((e as Error).message || "No se pudo cargar el circuito");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchRow = async (row: ChecklistRow, patch: Partial<ChecklistRow>) => {
    // optimista
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    try {
      await sbPatch(`presupuestos_checklist?id=eq.${row.id}`, patch as Record<string, unknown>);
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar");
      cargar(); // revertir con el estado real
    }
  };

  const toggleCompletado = (row: ChecklistRow) => {
    const completado = !row.completado;
    patchRow(row, {
      completado,
      fecha_completado: completado ? new Date().toISOString() : null,
      completado_por: completado ? username : null,
    });
  };

  const toggleNoAplica = (row: ChecklistRow) => {
    const no_aplica = !row.no_aplica;
    // si pasa a "no aplica", limpiamos el completado
    patchRow(row, no_aplica ? { no_aplica, completado: false, fecha_completado: null, completado_por: null } : { no_aplica });
  };

  // ── Generación del Sobre Quirúrgico ──
  const generarUno = (clave: string) => {
    if (!aceptacion) return;
    const ctx = armarContexto({ presupuesto, aceptacion, convenios, lios, consentimiento });
    generarDocumento(clave, ctx);
  };
  const generarTodo = () => {
    if (!aceptacion) return;
    const ctx = armarContexto({ presupuesto, aceptacion, convenios, lios, consentimiento });
    generarSobreCompleto(ctx);
  };

  const labelDe = (clave: string) => CHECKLIST_ITEMS.find((i) => i.clave === clave)?.label || clave;
  const convenioNombre = aceptacion?.convenio_id ? (convenios.find((c) => c.id === aceptacion.convenio_id)?.nombre || "—") : "—";
  const lioNombre = aceptacion?.lio_id ? (lios.find((l) => l.id === aceptacion.lio_id)?.nombre || "—") : "—";
  const ojoLabel = aceptacion?.ojo ? (OJOS.find((o) => o.value === aceptacion.ojo)?.label || aceptacion.ojo) : "—";
  const subRamaLabel = aceptacion?.sub_rama ? (SUB_RAMAS.find((s) => s.value === aceptacion.sub_rama)?.label || aceptacion.sub_rama) : null;

  const listo = listoParaCirugia(rows);
  const prog = progresoChecklist(rows);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b bg-blue-50 border-blue-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Circuito de cirugía</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {presupuesto.numero_presupuesto} — {presupuesto.paciente_apellido}, {presupuesto.paciente_nombre}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {error && <p className="text-sm text-red-600">{error}</p>}

              {/* Estado LISTO */}
              <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${listo ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                <div>
                  <p className={`font-semibold ${listo ? "text-green-700" : "text-gray-700"}`}>
                    {listo ? "✅ LISTO PARA CIRUGÍA" : "En trámite"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{prog.hechos} de {prog.total} trámites completados</p>
                </div>
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full ${listo ? "bg-green-500" : "bg-blue-500"} transition-all`} style={{ width: `${prog.total ? (prog.hechos / prog.total) * 100 : 0}%` }} />
                </div>
              </div>

              {/* Datos de la aceptación */}
              {aceptacion ? (
                <div className="rounded-xl border border-gray-200 p-4 text-sm grid grid-cols-2 gap-y-2 gap-x-4">
                  <div><span className="text-gray-500">Cobertura:</span> <span className="font-medium text-gray-800">{aceptacion.rama_cobertura === "PARTICULAR" ? "Particular" : "Obra social"}</span></div>
                  <div><span className="text-gray-500">Ojo:</span> <span className="font-medium text-gray-800">{ojoLabel}</span></div>
                  {aceptacion.rama_cobertura === "OBRA_SOCIAL" && (
                    <>
                      <div className="col-span-2"><span className="text-gray-500">Vía:</span> <span className="font-medium text-gray-800">{subRamaLabel || "—"}</span></div>
                      <div className="col-span-2"><span className="text-gray-500">Convenio:</span> <span className="font-medium text-gray-800">{convenioNombre}</span></div>
                    </>
                  )}
                  <div><span className="text-gray-500">LIO:</span> <span className="font-medium text-gray-800">{lioNombre}</span></div>
                  <div><span className="text-gray-500">Fecha tentativa:</span> <span className="font-medium text-gray-800">{fmtFecha(aceptacion.fecha_tentativa_cirugia)}</span></div>
                  <div className="col-span-2"><span className="text-gray-500">Requiere análisis/ECG:</span> <span className="font-medium text-gray-800">{aceptacion.requiere_analisis_ecg ? "Sí" : "No"}</span></div>
                </div>
              ) : (
                <p className="text-sm text-amber-600">No hay datos de aceptación cargados para este presupuesto.</p>
              )}

              {/* Checklist */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Checklist de trámites</h4>
                <div className="space-y-1.5">
                  {rows.length === 0 && <p className="text-sm text-gray-400">Sin ítems de checklist.</p>}
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
                        r.no_aplica ? "bg-gray-50 border-gray-100 opacity-70" : r.completado ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
                      }`}
                    >
                      <button
                        onClick={() => toggleCompletado(r)}
                        disabled={r.no_aplica}
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          r.no_aplica ? "border-gray-200 cursor-not-allowed" : r.completado ? "bg-green-600 border-green-600 text-white" : "border-gray-300 hover:border-green-500"
                        }`}
                        title={r.no_aplica ? "No aplica" : r.completado ? "Marcar como pendiente" : "Marcar como completado"}
                      >
                        {r.completado && !r.no_aplica && "✓"}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${r.no_aplica ? "text-gray-400 line-through" : "text-gray-800"}`}>{labelDe(r.item_clave)}</p>
                        {r.completado && !r.no_aplica && (
                          <p className="text-[11px] text-gray-400">{fmtFecha(r.fecha_completado)}{r.completado_por ? ` · ${r.completado_por}` : ""}</p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleNoAplica(r)}
                        className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${
                          r.no_aplica ? "bg-gray-200 text-gray-600" : "text-gray-400 hover:bg-gray-100"
                        }`}
                        title="Marcar/desmarcar No aplica"
                      >
                        No aplica
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sobre Quirúrgico */}
              {aceptacion && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Sobre Quirúrgico</h4>
                  <div className="flex flex-wrap gap-2">
                    {DOCS.filter((d) => !d.condicional || aceptacion.requiere_analisis_ecg).map((d) => (
                      <button
                        key={d.clave}
                        onClick={() => generarUno(d.clave)}
                        className="text-xs border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={generarTodo}
                    className="mt-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    Descargar todo el Sobre
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
