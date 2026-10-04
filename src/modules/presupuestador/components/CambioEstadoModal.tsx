// ============================================================
// Revertir / anular un presupuesto, con motivo y auditoría
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// Hasta la migración 70, "Cambiar" hacía un borrado SILENCIOSO: ponía en NULL
// el resultado, el motivo, las observaciones, la fecha y el usuario, sin pedir
// explicación y sin dejar rastro. Y no tocaba la aceptación, así que el
// presupuesto volvía a figurar como pendiente conservando ojo, convenio, LIO y
// checklist — se le podía seguir generando el sobre y registrando plata.
//
// Eso dejó tres aceptaciones huérfanas, dos con dinero cobrado: $1.000.000 en
// P-2026-813 y $100.000 en P-2026-966.
//
// LAS TRES REGLAS QUE APLICA
// ---------------------------
//   1. Con entregas de caja VIGENTES no se revierte ni se anula. El diálogo
//      dice cuánto hay cobrado y manda al circuito a anular la entrega, que
//      tiene su propio motivo (migración 47).
//   2. Un presupuesto PRACTICADO no se revierte: la cirugía ya se hizo, fue
//      aceptado de hecho. Anularlo queda para `presupuestador:config`.
//   3. Todo cambio pide motivo y queda en `presupuestos_historial`. El
//      registro original no se borra nunca.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, X, Loader2, ArrowLeftRight, Ban } from "lucide-react";
import { sbGet, sbInsert, sbPatch } from "../utils/circuito";

/** Qué se está por hacer. */
export type AccionEstado = "revertir" | "anular";

interface MotivoFila {
  id: string;
  nombre: string;
  exige_observacion: boolean;
}

interface EntregaVigente {
  id: string;
  monto: number | string;
}

export interface PresupuestoACambiar {
  id: string;
  numero_presupuesto: string;
  estado: string;
  resultado: string | null;
}

const fmtARS = (v: number): string => {
  const [ent, dec] = (Number(v) || 0).toFixed(2).split(".");
  return `$ ${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

const TITULO: Record<AccionEstado, string> = {
  revertir: "Revertir el resultado",
  anular: "Anular el presupuesto",
};

export default function CambioEstadoModal({
  presupuesto,
  accion,
  usuario,
  onHecho,
  onClose,
  onIrAlCircuito,
}: {
  presupuesto: PresupuestoACambiar;
  accion: AccionEstado;
  usuario: string | null;
  onHecho: (mensaje: string) => void;
  onClose: () => void;
  /** Para el botón "Ver entregas" cuando el cambio queda bloqueado. */
  onIrAlCircuito: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [motivos, setMotivos] = useState<MotivoFila[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [entregas, setEntregas] = useState<EntregaVigente[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError("");
      try {
        const tipo = accion === "revertir" ? "REVERSION" : "ANULADO";
        const [ms, es] = await Promise.all([
          sbGet<MotivoFila>(
            `presupuestos_motivos_resultado?tipo=eq.${tipo}&activo=eq.true`
            + `&order=orden.asc&select=id,nombre,exige_observacion`,
          ),
          // Sólo las VIGENTES: una entrega anulada ya no retiene nada.
          sbGet<EntregaVigente>(
            `presupuestos_caja_entregas?presupuesto_id=eq.${presupuesto.id}`
            + `&anulada_at=is.null&select=id,monto`,
          ),
        ]);
        if (!vivo) return;
        setMotivos(ms);
        setEntregas(es);
      } catch (e) {
        if (vivo) setError((e as Error).message || "No se pudieron cargar los motivos");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [presupuesto.id, accion]);

  const totalEntregas = entregas.reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const bloqueado = entregas.length > 0;
  const motivoElegido = motivos.find((m) => m.id === motivoId);
  const faltaObservacion = !!motivoElegido?.exige_observacion && observaciones.trim().length < 3;
  const puedeGuardar = !!motivoId && !faltaObservacion && !guardando;

  const confirmar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError("");
    try {
      const ahora = new Date().toISOString();
      const anterior = presupuesto.resultado;

      if (accion === "revertir") {
        // 1. El resultado comercial vuelve a pendiente.
        await sbPatch(`presupuestos?id=eq.${presupuesto.id}`, {
          resultado: null,
          resultado_motivo_id: null,
          resultado_observaciones: null,
          fecha_resultado: null,
          resultado_por: null,
        });
        // 2. La aceptación deja de estar vigente, pero NO se borra: si el
        //    paciente vuelve, el modal se precarga con lo que ya se definió.
        await sbPatch(
          `presupuestos_aceptacion?presupuesto_id=eq.${presupuesto.id}&revertida_at=is.null`,
          {
            revertida_at: ahora,
            revertida_por: usuario,
            reversion_motivo: [motivoElegido?.nombre, observaciones.trim()].filter(Boolean).join(" — "),
          },
        );
      } else {
        await sbPatch(`presupuestos?id=eq.${presupuesto.id}`, {
          resultado: "ANULADO",
          resultado_motivo_id: motivoId,
          resultado_observaciones: observaciones.trim() || null,
          fecha_resultado: ahora,
          resultado_por: usuario,
        });
        // Anular también baja la aceptación: un presupuesto anulado no tiene
        // circuito vigente.
        await sbPatch(
          `presupuestos_aceptacion?presupuesto_id=eq.${presupuesto.id}&revertida_at=is.null`,
          {
            revertida_at: ahora,
            revertida_por: usuario,
            reversion_motivo: `Anulado: ${[motivoElegido?.nombre, observaciones.trim()].filter(Boolean).join(" — ")}`,
          },
        );
      }

      // 3. La constancia. Va último a propósito: si fallara, el cambio ya se
      //    hizo y preferimos un cambio sin historial a un historial que miente.
      await sbInsert("presupuestos_historial", {
        presupuesto_id: presupuesto.id,
        campo: "resultado",
        valor_anterior: anterior,
        valor_nuevo: accion === "revertir" ? null : "ANULADO",
        motivo_id: motivoId,
        observaciones: observaciones.trim() || null,
        usuario,
      });

      onHecho(
        accion === "revertir"
          ? `${presupuesto.numero_presupuesto} volvió a Pendiente`
          : `${presupuesto.numero_presupuesto} quedó Anulado`,
      );
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar el cambio");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            {accion === "revertir"
              ? <ArrowLeftRight className="w-4 h-4 text-gray-500" />
              : <Ban className="w-4 h-4 text-gray-500" />}
            {TITULO[accion]}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">{presupuesto.numero_presupuesto}</p>

          {cargando && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          )}

          {!cargando && bloqueado && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-900 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                No se puede {accion === "revertir" ? "revertir" : "anular"}
              </p>
              <p>
                Este presupuesto tiene {entregas.length === 1 ? "una entrega" : `${entregas.length} entregas`} de
                caja vigente{entregas.length === 1 ? "" : "s"} por <strong>{fmtARS(totalEntregas)}</strong>.
              </p>
              <p>
                Para {accion === "revertir" ? "revertirlo" : "anularlo"} hay que anular
                primero {entregas.length === 1 ? "la entrega" : "las entregas"}, dejando el motivo.
              </p>
            </div>
          )}

          {!cargando && !bloqueado && (
            <>
              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">Motivo *</span>
                <select
                  value={motivoId}
                  onChange={(e) => setMotivoId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccioná…</option>
                  {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </label>

              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">
                  Observaciones {motivoElegido?.exige_observacion ? "*" : "(opcional)"}
                </span>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {accion === "revertir" && (
                <p className="text-[11px] text-gray-500">
                  Los datos del circuito (ojo, convenio, LIO) se conservan: si se vuelve a aceptar,
                  el formulario llega precargado.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          {bloqueado ? (
            <>
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
                Cerrar
              </button>
              <button
                onClick={onIrAlCircuito}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Ver entregas
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!puedeGuardar}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center gap-1.5"
              >
                {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {accion === "revertir" ? "Revertir" : "Anular"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
