// ============================================================
// Modal de aceptación del presupuesto — captura la rama del circuito
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Al ACEPTAR, define: rama de cobertura (Particular / OS → Círculo o directa +
// convenio), fecha tentativa, ojo, LIO y si requiere análisis/ECG. Persiste:
//   1) presupuestos.resultado = 'ACEPTADO'
//   2) fila en presupuestos_aceptacion
//   3) filas del checklist (con no_aplica según la rama)
// ============================================================

import { useState } from "react";
import {
  Convenio, Lio, RamaCobertura, SubRama, Ojo,
  OJOS, SUB_RAMAS, CHECKLIST_ITEMS,
  itemsAplicables, clavesAplicables, lioSugerido,
  sbPatch, sbUpsert, sbDelete,
} from "../utils/circuito";

interface PresupuestoMin {
  id: string;
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  prestacion_codigo?: string;
  prestacion_descripcion?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos_completos?: any;
}

function ojoDesdeSnapshot(p: PresupuestoMin): Ojo | "" {
  const o = String(p?.datos_completos?.tratamiento?.ojoTratar || "").toLowerCase();
  if (o.includes("ambos")) return "AMBOS";
  if (o.includes("izq")) return "OI";
  if (o.includes("der")) return "OD";
  return "";
}

export default function AceptacionModal({
  presupuesto,
  convenios,
  lios,
  username,
  onClose,
  onDone,
  lioEditable = false,
}: {
  presupuesto: PresupuestoMin;
  convenios: Convenio[];
  lios: Lio[];
  username: string | null;
  onClose: () => void;
  onDone: () => void;
  /**
   * Definición de Administración (10/08/2026): "el LIO debe quedar el del
   * presupuesto" — el selector es de SÓLO LECTURA. Pasar `lioEditable` sólo si
   * en el futuro se habilita cambiar la lente durante el circuito.
   */
  lioEditable?: boolean;
}) {
  // El LIO del presupuesto viene preseleccionado (se deduce de la prestación).
  const lioDelPresupuesto = lioSugerido(presupuesto, lios);
  const lioPresupuestoNombre = lios.find((l) => l.id === lioDelPresupuesto)?.nombre || "";
  // Si la prestación NO identifica un LIO no se puede bloquear el campo: el
  // operador quedaría sin poder aceptar el presupuesto.
  const lioSoloLectura = !lioEditable && !!lioDelPresupuesto;

  const [rama, setRama] = useState<RamaCobertura | "">("");
  const [subRama, setSubRama] = useState<SubRama | "">("");
  const [convenioId, setConvenioId] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [ojo, setOjo] = useState<Ojo | "">(ojoDesdeSnapshot(presupuesto));
  const [lioId, setLioId] = useState<string>(
    lioDelPresupuesto || (lios.length === 1 ? lios[0].id : ""),
  );
  const [requiere, setRequiere] = useState<boolean>(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>("");

  const esOS = rama === "OBRA_SOCIAL";
  const conveniosDeSubRama = convenios.filter((c) => c.sub_rama === subRama && c.activo);

  const valido =
    !!rama &&
    !!ojo &&
    !!lioId &&
    (!esOS || (!!subRama && !!convenioId));

  const confirmar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const ahora = new Date().toISOString();

      // 1) Resultado ACEPTADO
      await sbPatch(`presupuestos?id=eq.${presupuesto.id}`, {
        resultado: "ACEPTADO",
        resultado_motivo_id: null,
        resultado_observaciones: null,
        fecha_resultado: ahora,
        resultado_por: username,
      });

      // 2) Fila de aceptación (1:1)
      await sbUpsert(
        "presupuestos_aceptacion",
        {
          presupuesto_id: presupuesto.id,
          rama_cobertura: rama,
          sub_rama: esOS ? subRama : null,
          convenio_id: esOS ? convenioId : null,
          fecha_tentativa_cirugia: fecha || null,
          ojo,
          lio_id: lioId,
          requiere_analisis_ecg: requiere,
          created_by: username,
        },
        "presupuesto_id",
        "merge",
      );

      // 3) Checklist: sólo los ítems que EXISTEN para esta cobertura
      //    (ej. "Orden autorizada" no corresponde a un circuito Particular).
      //    `no_aplica` sigue marcando los que existen pero no corresponden a
      //    este caso puntual (ej. análisis/ECG no solicitados).
      const aRef = { rama_cobertura: rama as RamaCobertura, requiere_analisis_ecg: requiere };
      const aplicables = itemsAplicables(aRef);
      const rows = aplicables.map((it) => ({
        presupuesto_id: presupuesto.id,
        item_clave: it.clave,
        no_aplica: it.noAplica ? it.noAplica(aRef) : false,
      }));
      await sbUpsert("presupuestos_checklist", rows, "presupuesto_id,item_clave", "merge");

      // 3b) Si se re-acepta cambiando de cobertura (OS -> Particular), borrar las
      //     filas que quedaron de la cobertura anterior y ya no corresponden.
      const sobrantes = CHECKLIST_ITEMS
        .map((it) => it.clave)
        .filter((c) => !clavesAplicables(aRef).has(c));
      if (sobrantes.length) {
        await sbDelete(
          `presupuestos_checklist?presupuesto_id=eq.${presupuesto.id}` +
          `&item_clave=in.(${sobrantes.join(",")})`,
        );
      }

      onDone();
    } catch (e) {
      setError((e as Error).message || "No se pudo guardar");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b bg-green-50 border-green-100">
          <h3 className="font-bold text-gray-900">Aceptar presupuesto — datos del circuito</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {presupuesto.numero_presupuesto} — {presupuesto.paciente_apellido}, {presupuesto.paciente_nombre}
          </p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Rama de cobertura */}
          <div>
            <span className="block text-sm text-gray-600 mb-1 font-medium">Cobertura *</span>
            <div className="flex gap-2">
              {(["PARTICULAR", "OBRA_SOCIAL"] as RamaCobertura[]).map((r) => (
                <button
                  key={r}
                  onClick={() => { setRama(r); if (r === "PARTICULAR") { setSubRama(""); setConvenioId(""); } }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    rama === r ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {r === "PARTICULAR" ? "Particular" : "Obra social"}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-rama + convenio (solo OS) */}
          {esOS && (
            <>
              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">Vía de autorización *</span>
                <select
                  value={subRama}
                  onChange={(e) => { setSubRama(e.target.value as SubRama | ""); setConvenioId(""); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  <option value="">Seleccioná…</option>
                  {SUB_RAMAS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              {subRama && (
                <label className="block text-sm">
                  <span className="block text-gray-600 mb-1 font-medium">Convenio *</span>
                  <select
                    value={convenioId}
                    onChange={(e) => setConvenioId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  >
                    <option value="">Seleccioná…</option>
                    {conveniosDeSubRama.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  {conveniosDeSubRama.length === 0 && (
                    <span className="text-xs text-amber-600 mt-1 block">No hay convenios cargados para esta vía.</span>
                  )}
                </label>
              )}
            </>
          )}

          {/* Ojo + LIO */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="block text-gray-600 mb-1 font-medium">Ojo a operar *</span>
              <select
                value={ojo}
                onChange={(e) => setOjo(e.target.value as Ojo | "")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Seleccioná…</option>
                {OJOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-gray-600 mb-1 font-medium">LIO *</span>
              <select
                value={lioId}
                onChange={(e) => setLioId(e.target.value)}
                disabled={lioSoloLectura}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                <option value="">Seleccioná…</option>
                {lios.filter((l) => l.activo).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              {lioPresupuestoNombre ? (
                <span className="text-[11px] text-gray-500 mt-1 block">
                  {lioSoloLectura
                    ? `Es el LIO del presupuesto — no se modifica en el circuito.`
                    : lioId === lioDelPresupuesto
                      ? `Del presupuesto: ${lioPresupuestoNombre}`
                      : `⚠️ El presupuesto es ${lioPresupuestoNombre}`}
                </span>
              ) : (
                <span className="text-[11px] text-amber-600 mt-1 block">
                  La prestación del presupuesto no identifica un LIO — elegilo a mano.
                </span>
              )}
            </label>
          </div>

          {/* Fecha tentativa */}
          <label className="block text-sm">
            <span className="block text-gray-600 mb-1 font-medium">Fecha tentativa de cirugía (opcional)</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </label>

          {/* Requiere análisis / ECG */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiere}
              onChange={(e) => setRequiere(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-gray-700">Requiere análisis de laboratorio y ECG</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            disabled={!valido || guardando}
            onClick={confirmar}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Aceptar y guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
