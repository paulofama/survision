// ============================================================
// Revisión de matches ambiguos presupuesto → práctica realizada (Fase C)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Lista los presupuestos con matches 'sugerido' (varios candidatos). Por cada
// uno, el operador elige la cirugía correcta ("Es esta" → marca practicado y
// descarta las otras) o las descarta todas ("Ninguna").
// ============================================================

import { useEffect, useState } from "react";
import { sbGet, sbPatch } from "../utils/circuito";

interface PresInfo {
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  paciente_documento: string;
  prestacion_descripcion: string;
  fecha_creacion: string;
}

interface MatchRow {
  id: string;
  presupuesto_id: string;
  atencion_id: number;
  codigo_realizado: string | null;
  practica_nombre: string | null;
  prestador_nombre: string | null;
  fecha_practica: string | null;
  presupuestos?: PresInfo;
}

interface Grupo {
  presupuesto_id: string;
  info?: PresInfo;
  candidatos: MatchRow[];
}

const fmt = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return `${dt.getUTCDate().toString().padStart(2, "0")}/${(dt.getUTCMonth() + 1).toString().padStart(2, "0")}/${dt.getUTCFullYear()}`;
  } catch { return "—"; }
};

const SELECT =
  "*,presupuestos(numero_presupuesto,paciente_apellido,paciente_nombre,paciente_documento,prestacion_descripcion,fecha_creacion)";

export default function MatchesRevisionModal({
  username,
  onClose,
  onChanged,
}: {
  username: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await sbGet<MatchRow>(
        `presupuestos_practica_match?estado=eq.sugerido&select=${SELECT}&order=presupuesto_id`,
      );
      const m = new Map<string, Grupo>();
      for (const r of rows) {
        if (!m.has(r.presupuesto_id)) m.set(r.presupuesto_id, { presupuesto_id: r.presupuesto_id, info: r.presupuestos, candidatos: [] });
        m.get(r.presupuesto_id)!.candidatos.push(r);
      }
      setGrupos([...m.values()]);
    } catch (e) {
      setError((e as Error).message || "No se pudieron cargar los matches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async (g: Grupo, cand: MatchRow) => {
    setBusy(cand.id);
    setError("");
    try {
      const now = new Date().toISOString();
      // 1) confirmar el elegido
      await sbPatch(`presupuestos_practica_match?id=eq.${cand.id}`, { estado: "confirmado", revisado_por: username, revisado_at: now });
      // 2) descartar los demás candidatos (aún 'sugerido') del presupuesto
      await sbPatch(`presupuestos_practica_match?presupuesto_id=eq.${g.presupuesto_id}&estado=eq.sugerido`, { estado: "descartado", revisado_por: username, revisado_at: now });
      // 3) marcar el presupuesto practicado con la fecha real
      await sbPatch(`presupuestos?id=eq.${g.presupuesto_id}`, { estado: "practicado", fecha_practica: cand.fecha_practica });
      setGrupos((prev) => prev.filter((x) => x.presupuesto_id !== g.presupuesto_id));
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "No se pudo confirmar");
    } finally {
      setBusy(null);
    }
  };

  const descartar = async (g: Grupo) => {
    setBusy("desc-" + g.presupuesto_id);
    setError("");
    try {
      await sbPatch(`presupuestos_practica_match?presupuesto_id=eq.${g.presupuesto_id}&estado=eq.sugerido`, { estado: "descartado", revisado_por: username, revisado_at: new Date().toISOString() });
      setGrupos((prev) => prev.filter((x) => x.presupuesto_id !== g.presupuesto_id));
      onChanged?.();
    } catch (e) {
      setError((e as Error).message || "No se pudo descartar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b bg-amber-50 border-amber-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Matches a confirmar</h3>
            <p className="text-xs text-gray-500 mt-0.5">Presupuestos con más de una cirugía candidata. Elegí la correcta o descartá.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" /></div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No hay matches pendientes de revisión.</p>
          ) : (
            grupos.map((g) => (
              <div key={g.presupuesto_id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800">
                    {g.info?.numero_presupuesto} — {g.info?.paciente_apellido}, {g.info?.paciente_nombre}
                    <span className="text-xs font-normal text-gray-500"> · DNI {g.info?.paciente_documento}</span>
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {g.info?.prestacion_descripcion} · presupuesto {fmt(g.info?.fecha_creacion)}
                  </p>
                </div>
                <div className="p-3 space-y-1.5">
                  {g.candidatos.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2 border border-gray-100 bg-white">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{c.practica_nombre || c.codigo_realizado}</p>
                        <p className="text-xs text-gray-500">Cirugía {fmt(c.fecha_practica)}{c.prestador_nombre ? ` · ${c.prestador_nombre}` : ""}</p>
                      </div>
                      <button
                        onClick={() => confirmar(g, c)}
                        disabled={busy !== null}
                        className="text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {busy === c.id ? "…" : "Es esta"}
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => descartar(g)}
                      disabled={busy !== null}
                      className="text-xs text-gray-500 hover:text-red-600 hover:underline disabled:opacity-40"
                    >
                      {busy === "desc-" + g.presupuesto_id ? "…" : "Ninguna — descartar"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
