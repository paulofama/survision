// ============================================================
// Formulario de llamada + encuesta de seguimiento
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Registra el intento (usuario logueado + fecha/hora), pregunta ¿Atendió?; si
// no atendió guarda el intento fallido; si atendió corre la encuesta con ramas
// y actualiza el estado de contacto. NO toca el resultado comercial.
// ============================================================

import { useState } from "react";
import {
  Seguimiento, PREGUNTA_INICIAL, RAMA_REVISO, RAMA_NO_REVISO,
  aplicarLlamada, sumarDiasHabiles, hoyISO,
} from "../utils/seguimiento";
import { sbInsert, sbUpsert } from "../utils/circuito";

interface Pres {
  id: string;
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  prestacion_descripcion: string | null;
  total_final: number | string | null;
}

const fmtARS = (v: number) => { const [e, d] = (v || 0).toFixed(2).split("."); return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`; };

interface RespState { v: boolean | null; nota: string; }

function PreguntaRow({ texto, estado, onValor, onNota }: { texto: string; estado: RespState; onValor: (v: boolean) => void; onNota: (n: string) => void; }) {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <p className="text-sm text-gray-800 mb-2">{texto}</p>
      <div className="flex items-center gap-2 mb-2">
        {[{ v: true, l: "Sí" }, { v: false, l: "No" }].map((o) => (
          <button
            key={o.l}
            onClick={() => onValor(o.v)}
            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
              estado.v === o.v ? (o.v ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600") : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={estado.nota}
        onChange={(e) => onNota(e.target.value)}
        placeholder="Nota (opcional)"
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

export default function LlamadaModal({
  presupuesto,
  seguimiento,
  username,
  onClose,
  onDone,
}: {
  presupuesto: Pres;
  seguimiento: Seguimiento | null;
  username: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [paso, setPaso] = useState<"inicial" | "encuesta">("inicial");
  const [p1, setP1] = useState<boolean | null>(null);
  const [p1nota, setP1nota] = useState("");
  const [resp, setResp] = useState<Record<string, RespState>>({});
  const [obs, setObs] = useState("");
  const [rellamada, setRellamada] = useState<string>(sumarDiasHabiles(hoyISO(), 2));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const monto = `$ ${fmtARS(parseFloat(String(presupuesto.total_final)) || 0)}`;
  const practica = presupuesto.prestacion_descripcion || "el tratamiento";
  const textoP1 = PREGUNTA_INICIAL.texto.replace("{practica}", practica).replace("{monto}", monto);
  const preguntas = p1 ? RAMA_REVISO : RAMA_NO_REVISO;
  const setRespV = (clave: string, v: boolean) => setResp((s) => ({ ...s, [clave]: { v, nota: s[clave]?.nota ?? "" } }));
  const setRespN = (clave: string, nota: string) => setResp((s) => ({ ...s, [clave]: { v: s[clave]?.v ?? null, nota } }));
  const agendaRellamada = p1 === false && resp["rellamar"]?.v === true;

  const guardarSeg = async (nuevo: Seguimiento) => {
    await sbUpsert(
      "presupuestos_seguimiento",
      { ...nuevo, updated_by: username, ...(seguimiento ? {} : { created_by: username }) },
      "presupuesto_id",
      "merge",
    );
  };

  const registrarNoAtendio = async () => {
    setGuardando(true); setError("");
    try {
      await sbInsert("presupuestos_seguimiento_llamadas", { presupuesto_id: presupuesto.id, usuario: username, canal: "telefono", resultado: "no_atendio" });
      await guardarSeg(aplicarLlamada(seguimiento, presupuesto.id, "no_atendio"));
      onDone();
    } catch (e) { setError((e as Error).message || "No se pudo guardar"); setGuardando(false); }
  };

  const guardarEncuesta = async () => {
    if (p1 === null) return;
    setGuardando(true); setError("");
    try {
      const rama = p1 ? "reviso" : "no_reviso";
      const respuestas = [
        { clave: "reviso", texto: textoP1, valor: p1, nota: p1nota || "" },
        ...preguntas.map((q) => ({ clave: q.clave, texto: q.texto, valor: resp[q.clave]?.v ?? null, nota: resp[q.clave]?.nota ?? "" })),
      ];
      await sbInsert("presupuestos_seguimiento_llamadas", { presupuesto_id: presupuesto.id, usuario: username, canal: "telefono", resultado: "atendio" });
      await sbInsert("presupuestos_seguimiento_encuesta", { presupuesto_id: presupuesto.id, usuario: username, rama, respuestas, observaciones: obs || null });
      const rellamadaISO = agendaRellamada ? rellamada : null;
      await guardarSeg(aplicarLlamada(seguimiento, presupuesto.id, "atendio", hoyISO(), { rellamadaISO }));
      onDone();
    } catch (e) { setError((e as Error).message || "No se pudo guardar"); setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b bg-blue-50 border-blue-100">
          <h3 className="font-bold text-gray-900">Llamada de seguimiento</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {presupuesto.numero_presupuesto} — {presupuesto.paciente_apellido}, {presupuesto.paciente_nombre} · {practica} · {monto}
          </p>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {paso === "inicial" ? (
            <div className="text-center py-4">
              <p className="text-sm font-medium text-gray-700 mb-4">¿El paciente atendió el llamado?</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setPaso("encuesta")} className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">Sí, atendió</button>
                <button onClick={registrarNoAtendio} disabled={guardando} className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-40">{guardando ? "Guardando…" : "No atendió"}</button>
              </div>
              <p className="text-[11px] text-gray-400 mt-4">Se registra automáticamente el usuario y la fecha/hora.</p>
            </div>
          ) : (
            <>
              <PreguntaRow texto={textoP1} estado={{ v: p1, nota: p1nota }} onValor={(v) => setP1(v)} onNota={setP1nota} />
              {p1 !== null && (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{p1 ? "Revisó el presupuesto" : "No lo revisó todavía"}</p>
                  {preguntas.map((q) => (
                    <PreguntaRow
                      key={q.clave}
                      texto={q.texto}
                      estado={resp[q.clave] ?? { v: null, nota: "" }}
                      onValor={(v) => setRespV(q.clave, v)}
                      onNota={(n) => setRespN(q.clave, n)}
                    />
                  ))}
                  {agendaRellamada && (
                    <label className="block text-sm border border-blue-100 bg-blue-50/50 rounded-lg p-3">
                      <span className="block text-gray-600 mb-1 font-medium">Fecha de rellamada</span>
                      <input type="date" value={rellamada} onChange={(e) => setRellamada(e.target.value)} className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm" />
                      <span className="text-[11px] text-gray-500 mt-1 block">El presupuesto vuelve a la cola ese día.</span>
                    </label>
                  )}
                  <label className="block text-sm">
                    <span className="block text-gray-600 mb-1 font-medium">Observaciones generales</span>
                    <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </label>
                </>
              )}
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-between gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
          {paso === "encuesta" && (
            <button onClick={guardarEncuesta} disabled={p1 === null || guardando} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40">
              {guardando ? "Guardando…" : "Guardar encuesta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
