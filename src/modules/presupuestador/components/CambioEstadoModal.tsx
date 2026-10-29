// ============================================================
// Volver a pendiente / anular un presupuesto, con motivo y auditoría
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
// La 70 agregó motivo e historial, pero el cambio seguía siendo tres
// escrituras sueltas desde acá. Desde la migración 79 lo hace UNA función de
// la base, en una sola transacción:
//
//   `presupuesto_chequear_cambio()`   qué bloquea y qué advierte; el modal lo
//                                     muestra antes de pedir el motivo.
//   `presupuesto_cambiar_resultado()` vuelve a validar con la fila tomada,
//                                     cambia el resultado, baja la aceptación
//                                     y el trigger escribe el historial con
//                                     quién y cuándo se había registrado el
//                                     resultado original.
//
// LAS REGLAS (decididas con Paulo, 2026-10-29)
// --------------------------------------------
//   Bloquean: entrega de caja vigente · cirugía practicada · práctica vinculada
//             a lo facturado en GECLISA · comisión devengada o liquidada.
//   Advierte: documentos ya emitidos. Seguir pide `presupuestador:config` y
//             una confirmación explícita.
//
// Los textos de los bloqueos vienen de la base: la regla y el mensaje viven en
// un solo lugar.
// ============================================================

import { useEffect, useState } from "react";
import { AlertTriangle, X, Loader2, Undo2, Ban, FileWarning } from "lucide-react";
import supabase from "@shared/lib/supabase";
import { sbGet } from "../utils/circuito";

/** Qué se está por hacer. */
export type AccionEstado = "revertir" | "anular";

interface MotivoFila {
  id: string;
  nombre: string;
  exige_observacion: boolean;
}

interface Bloqueo {
  clave: string;
  mensaje: string;
}

/** Lo que devuelve `presupuesto_chequear_cambio()` (migración 79). */
interface Chequeo {
  numero: string;
  resultado: string | null;
  estado: string;
  bloqueos: Bloqueo[];
  documentos: { cantidad: number; ultimo: string | null };
  puede_con_documentos: boolean;
}

export interface PresupuestoACambiar {
  id: string;
  numero_presupuesto: string;
  estado: string;
  resultado: string | null;
}

const fmtFecha = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR");
};

const TITULO: Record<AccionEstado, string> = {
  revertir: "Volver a pendiente",
  anular: "Anular el presupuesto",
};

const RESULTADO_LABEL: Record<string, string> = {
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  SIN_RESPUESTA: "Sin respuesta",
  ANULADO: "Anulado",
};

export default function CambioEstadoModal({
  presupuesto,
  accion,
  onHecho,
  onClose,
  onIrAlCircuito,
}: {
  presupuesto: PresupuestoACambiar;
  accion: AccionEstado;
  onHecho: (mensaje: string) => void;
  onClose: () => void;
  /** Para el botón "Ver entregas" cuando lo bloquea la caja. */
  onIrAlCircuito: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [motivos, setMotivos] = useState<MotivoFila[]>([]);
  const [chequeo, setChequeo] = useState<Chequeo | null>(null);
  const [motivoId, setMotivoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [confirmaDocumentos, setConfirmaDocumentos] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError("");
      try {
        const tipo = accion === "revertir" ? "REVERSION" : "ANULADO";
        const [ms, ch] = await Promise.all([
          sbGet<MotivoFila>(
            `presupuestos_motivos_resultado?tipo=eq.${tipo}&activo=eq.true`
            + `&order=orden.asc&select=id,nombre,exige_observacion`,
          ),
          supabase.rpc("presupuesto_chequear_cambio", {
            p_presupuesto_id: presupuesto.id,
            p_accion: accion,
          }),
        ]);
        if (ch.error) throw new Error(ch.error.message);
        if (!vivo) return;
        setMotivos(ms);
        setChequeo(ch.data as Chequeo);
      } catch (e) {
        if (vivo) setError((e as Error).message || "No se pudo revisar el presupuesto");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [presupuesto.id, accion]);

  const bloqueos = chequeo?.bloqueos ?? [];
  const bloqueado = bloqueos.length > 0;
  const bloqueaCaja = bloqueos.some((b) => b.clave === "caja");
  const documentos = chequeo?.documentos.cantidad ?? 0;
  const motivoElegido = motivos.find((m) => m.id === motivoId);
  const faltaObservacion = !!motivoElegido?.exige_observacion && observaciones.trim().length < 3;
  const puedeGuardar =
    !!chequeo && !bloqueado && !!motivoId && !faltaObservacion
    && (documentos === 0 || confirmaDocumentos) && !guardando;

  const confirmar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError("");
    try {
      const { error: e } = await supabase.rpc("presupuesto_cambiar_resultado", {
        p_presupuesto_id: presupuesto.id,
        p_accion: accion,
        p_motivo_id: motivoId,
        p_observaciones: observaciones.trim() || null,
        p_confirma_documentos: confirmaDocumentos,
      });
      if (e) throw new Error(e.message);
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

  const anterior = presupuesto.resultado ? RESULTADO_LABEL[presupuesto.resultado] || presupuesto.resultado : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            {accion === "revertir"
              ? <Undo2 className="w-4 h-4 text-gray-500" />
              : <Ban className="w-4 h-4 text-gray-500" />}
            {TITULO[accion]}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">
            {presupuesto.numero_presupuesto}
            {anterior ? ` · hoy: ${anterior}` : " · hoy: pendiente"}
          </p>

          {cargando && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Revisando caja, cirugía y documentos…
            </div>
          )}

          {!cargando && bloqueado && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-900 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                No se puede {accion === "revertir" ? "volver a pendiente" : "anular"}
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {bloqueos.map((b) => <li key={b.clave}>{b.mensaje}</li>)}
              </ul>
            </div>
          )}

          {!cargando && chequeo && !bloqueado && (
            <>
              {documentos > 0 && (
                <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-3 text-xs text-yellow-900 space-y-2">
                  <p className="font-semibold flex items-center gap-1.5">
                    <FileWarning className="w-4 h-4" />
                    Ya hay papeles circulando
                  </p>
                  <p>
                    Se {documentos === 1 ? "emitió un documento" : `emitieron ${documentos} documentos`}
                    {chequeo.documentos.ultimo ? ` (el último el ${fmtFecha(chequeo.documentos.ultimo)})` : ""}.
                    El paciente o la obra social pueden tener un sobre o un pedido que ya no corresponde.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmaDocumentos}
                      onChange={(e) => setConfirmaDocumentos(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Lo sé y me ocupo de recuperar los papeles.</span>
                  </label>
                </div>
              )}

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

              <p className="text-[11px] text-gray-500">
                {accion === "revertir"
                  ? "El historial guarda quién había registrado el resultado y cuándo. "
                    + "Los datos del circuito (ojo, convenio, LIO) se conservan: si se vuelve a aceptar, "
                    + "el formulario llega precargado."
                  : "El presupuesto deja de contar en la tasa de aceptación. El historial guarda el resultado anterior."}
              </p>
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
              {bloqueaCaja && (
                <button
                  onClick={onIrAlCircuito}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Ver entregas
                </button>
              )}
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
                {accion === "revertir" ? "Volver a pendiente" : "Anular"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
