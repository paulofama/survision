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

import { useEffect, useState } from "react";
import {
  Convenio, Lio, RamaCobertura, SubRama, Ojo,
  OJOS, SUB_RAMAS, CHECKLIST_ITEMS,
  itemsAplicables, clavesAplicables, lioSugerido,
  sbPatch, sbUpsert, sbDelete, sbInsert,
} from "../utils/circuito";
import { cargarOpcionesDiagnostico, type OpcionDiagnostico } from "../utils/sobre";

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

/** Para comparar coberturas escritas a mano: sin acentos, sin case, sin bordes. */
const normalizarCobertura = (s: string): string =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function ojoDesdeSnapshot(p: PresupuestoMin): Ojo | "" {
  const o = String(p?.datos_completos?.tratamiento?.ojoTratar || "").toLowerCase();
  if (o.includes("ambos")) return "AMBOS";
  if (o.includes("izq")) return "OI";
  if (o.includes("der")) return "OD";
  return "";
}

/**
 * Lo que hay que saber de una aceptación que ya existe, para poder editarla.
 *
 * `sobresImpresos` y `ultimoSobre` no son decoración: si el sobre ya salió, el
 * paciente y quirófano tienen un papel que dice el ojo y el convenio
 * anteriores. El modal lo advierte antes de dejar guardar.
 */
export interface AceptacionEditable {
  rama_cobertura: RamaCobertura;
  sub_rama: SubRama | null;
  convenio_id: string | null;
  fecha_tentativa_cirugia: string | null;
  ojo: Ojo | null;
  lio_id: string | null;
  diagnostico_opcion_id: string | null;
  requiere_analisis_ecg: boolean;
  sobresImpresos: number;
  ultimoSobre: string | null;
  /**
   * Pedidos de cirugía emitidos ANTES de aceptar (migración 72). Avisan algo
   * distinto del sobre: el pedido ya está en la obra social, no en manos del
   * paciente, y si cambia el ojo o el convenio hay que pedirlo de nuevo.
   */
  pedidosEmitidos: number;
  ultimoPedido: string | null;
}

export default function AceptacionModal({
  presupuesto,
  convenios,
  lios,
  username,
  onClose,
  onDone,
  lioEditable = false,
  edicion = null,
}: {
  presupuesto: PresupuestoMin;
  convenios: Convenio[];
  lios: Lio[];
  username: string | null;
  onClose: () => void;
  onDone: () => void;
  /**
   * Cuando viene, el modal EDITA una aceptación existente en vez de crearla:
   * precarga los campos, avisa si el sobre ya se imprimió y registra en el
   * historial qué cambió. Sin esto se comporta exactamente como antes.
   */
  edicion?: AceptacionEditable | null;
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

  // En edición se arranca de lo que ya está guardado; en alta, de los valores
  // que el presupuesto sugiere.
  const [rama, setRama] = useState<RamaCobertura | "">(edicion?.rama_cobertura ?? "");
  const [subRama, setSubRama] = useState<SubRama | "">(edicion?.sub_rama ?? "");
  const [convenioId, setConvenioId] = useState<string>(edicion?.convenio_id ?? "");
  const [fecha, setFecha] = useState<string>(edicion?.fecha_tentativa_cirugia ?? "");
  const [ojo, setOjo] = useState<Ojo | "">(edicion?.ojo ?? ojoDesdeSnapshot(presupuesto));
  const [lioId, setLioId] = useState<string>(
    edicion?.lio_id || lioDelPresupuesto || (lios.length === 1 ? lios[0].id : ""),
  );
  const [requiere, setRequiere] = useState<boolean>(edicion?.requiere_analisis_ecg ?? false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string>("");

  // Las indicaciones posibles de la práctica, cuando se hace por varias
  // (migración 60: la inyección intravítrea puede ser por DMAE húmeda, edema
  // macular diabético u oclusión venosa). Lista vacía = una sola indicación,
  // y el modal queda exactamente como estaba.
  const [opcionesDx, setOpcionesDx] = useState<OpcionDiagnostico[]>([]);
  const [opcionDxId, setOpcionDxId] = useState<string>(edicion?.diagnostico_opcion_id ?? "");

  useEffect(() => {
    let vigente = true;
    cargarOpcionesDiagnostico(presupuesto.prestacion_codigo).then((o) => {
      if (vigente) setOpcionesDx(o);
    });
    return () => { vigente = false; };
  }, [presupuesto.prestacion_codigo]);

  const esOS = rama === "OBRA_SOCIAL";
  const conveniosDeSubRama = convenios.filter((c) => c.sub_rama === subRama && c.activo);

  // La obra social de la FICHA del paciente es texto libre y no tiene por qué
  // coincidir con el catálogo de convenios. Toda la documentación se emite con
  // el convenio (define aranceles, autorización y liquidación), así que si
  // difieren hay que avisarlo ACÁ, antes de imprimir el sobre.
  const obraSocialFicha = String(presupuesto?.datos_completos?.paciente?.obraSocial || "").trim();
  const convenioElegido = convenios.find((c) => c.id === convenioId) || null;
  const avisoCobertura =
    esOS && convenioElegido && obraSocialFicha &&
    normalizarCobertura(obraSocialFicha) !== normalizarCobertura(convenioElegido.nombre)
      ? { ficha: obraSocialFicha, convenio: convenioElegido.nombre }
      : null;

  // Si la práctica tiene varias indicaciones, elegir una es OBLIGATORIO. Sin
  // eso el pedido sale con el diagnóstico en blanco y hay que completarlo a
  // mano después, que es justo lo que este campo viene a evitar.
  const valido =
    !!rama &&
    !!ojo &&
    !!lioId &&
    (opcionesDx.length === 0 || !!opcionDxId) &&
    (!esOS || (!!subRama && !!convenioId));

  const confirmar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const ahora = new Date().toISOString();

      // 1) Resultado ACEPTADO.
      //    En EDICIÓN no se toca: el presupuesto ya está aceptado y pisar la
      //    fecha y el usuario del resultado borraría quién lo aceptó
      //    originalmente, que es justo lo que el historial viene a preservar.
      if (!edicion) {
        await sbPatch(`presupuestos?id=eq.${presupuesto.id}`, {
          resultado: "ACEPTADO",
          resultado_motivo_id: null,
          resultado_observaciones: null,
          fecha_resultado: ahora,
          resultado_por: username,
        });
      }

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
          diagnostico_opcion_id: opcionDxId || null,
          requiere_analisis_ecg: requiere,
          created_by: username,
          // LIMPIAR LA MARCA DE REVERSIÓN (migración 70). El upsert pega sobre
          // la MISMA fila si el presupuesto ya se había aceptado y revertido;
          // sin esto la aceptación nueva nacería marcada como revertida y el
          // circuito no volvería a aparecer nunca.
          revertida_at: null,
          revertida_por: null,
          reversion_motivo: null,
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

      // 4) En EDICIÓN, la constancia de qué cambió — campo por campo.
      //
      // Se escribe sólo lo que efectivamente cambió: una fila por campo es lo
      // que permite después responder "¿cuándo pasó de OD a OI y quién lo
      // hizo?", que con una fila genérica por "se editó el circuito" no se
      // puede. Va al final y no bloquea: si falla, el cambio ya se guardó.
      if (edicion) {
        const antes: Record<string, string | null> = {
          rama_cobertura: edicion.rama_cobertura,
          convenio_id: edicion.convenio_id,
          ojo: edicion.ojo,
          fecha_tentativa_cirugia: edicion.fecha_tentativa_cirugia,
          requiere_analisis_ecg: String(edicion.requiere_analisis_ecg),
          diagnostico_opcion_id: edicion.diagnostico_opcion_id,
        };
        const despues: Record<string, string | null> = {
          rama_cobertura: rama || null,
          convenio_id: esOS ? convenioId : null,
          ojo: ojo || null,
          fecha_tentativa_cirugia: fecha || null,
          requiere_analisis_ecg: String(requiere),
          diagnostico_opcion_id: opcionDxId || null,
        };
        const cambios = Object.keys(antes)
          .filter((k) => (antes[k] ?? null) !== (despues[k] ?? null))
          .map((k) => ({
            presupuesto_id: presupuesto.id,
            campo: k,
            valor_anterior: antes[k],
            valor_nuevo: despues[k],
            // Queda registrado qué papel ya estaba circulando cuando se editó:
            // es lo que permite reconstruir después por qué un papel y la base
            // dicen cosas distintas.
            observaciones: [
              edicion.sobresImpresos > 0 ? `sobre ya impreso (${edicion.sobresImpresos})` : "",
              edicion.pedidosEmitidos > 0 ? `pedido ya emitido (${edicion.pedidosEmitidos})` : "",
            ].filter(Boolean).join(" + ") || null,
            usuario: username,
          }));
        if (cambios.length) {
          try {
            await sbInsert("presupuestos_historial", cambios);
          } catch {
            /* el cambio ya se guardó; el historial no puede impedirlo */
          }
        }
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
        <div className={`px-5 py-4 border-b ${edicion ? "bg-blue-50 border-blue-100" : "bg-green-50 border-green-100"}`}>
          <h3 className="font-bold text-gray-900">
            {edicion ? "Modificar los datos del circuito" : "Aceptar presupuesto — datos del circuito"}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {presupuesto.numero_presupuesto} — {presupuesto.paciente_apellido}, {presupuesto.paciente_nombre}
          </p>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/*
            EL SOBRE YA IMPRESO ES EL PUNTO DELICADO. El ojo, el convenio y la
            opción de diagnóstico salen impresos: si el sobre ya salió, el
            paciente y quirófano tienen un papel que dice lo anterior.

            No bloquea —corregir un error de tipeo en el ojo tiene que ser
            posible, y revertir está vedado cuando hay caja— pero el operador
            tiene que saber que además de guardar hay que reimprimir y
            recuperar el papel viejo.
          */}
          {edicion && edicion.sobresImpresos > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                El sobre ya se imprimió{edicion.ultimoSobre ? ` el ${edicion.ultimoSobre}` : ""}
              </p>
              <p>
                Si cambiás el ojo, el convenio o el diagnóstico, el papel que tienen el paciente
                y quirófano va a decir otra cosa.
              </p>
              <p className="text-amber-800">Hay que reimprimir el sobre y recuperar el anterior.</p>
            </div>
          )}
          {/*
            El pedido viaja a la obra social, no al paciente: no se puede
            "recuperar el anterior". Se avisa aparte del sobre porque la acción
            que corresponde es otra.
          */}
          {edicion && edicion.pedidosEmitidos > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                El pedido de cirugía ya se emitió{edicion.ultimoPedido ? ` el ${edicion.ultimoPedido}` : ""}
              </p>
              <p>
                Si cambiás el ojo o el convenio, el pedido que está en la obra social va a decir
                otra cosa que la autorización.
              </p>
              <p className="text-amber-800">Hay que emitir el pedido de nuevo y avisar a la obra social.</p>
            </div>
          )}
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
              {/*
                Aviso NO bloqueante: el error se detecta acá y no en el papel
                impreso. Caso real (P-2026-813): la ficha decía "Ospelsym" y se
                aceptó con OSEP; los documentos salían con Ospelsym. Ahora manda
                el convenio, y esto lo deja explícito antes de aceptar.

                El texto anterior decía que "el presupuesto se emitió con el
                convenio", y era al revés: el presupuesto se emitió con el dato
                de la FICHA — el convenio recién se elige acá.

                La tercera línea es la que importa en la práctica: el
                presupuesto ya impreso NO se reimprime (no hay acción para eso
                en Búsqueda), así que el paciente se queda con un papel que dice
                la obra social de la ficha mientras quirófano recibe todo por el
                convenio. Si eso no es lo buscado, el momento de corregirlo es
                éste. Caso real: P-2026-999 (Murgo) — ficha "Osep", convenio
                Círculo Médico San Rafael.
              */}
              {avisoCobertura && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">La obra social de la ficha no coincide con el convenio</p>
                  <p>
                    La ficha del paciente dice <strong>{avisoCobertura.ficha}</strong> y
                    estás aceptando con el convenio <strong>{avisoCobertura.convenio}</strong>.
                  </p>
                  <p>
                    Toda la documentación del sobre va a salir por <strong>{avisoCobertura.convenio}</strong>.
                  </p>
                  <p className="text-amber-800">
                    El presupuesto que ya se le entregó al paciente dice{" "}
                    <strong>{avisoCobertura.ficha}</strong> y no se vuelve a imprimir.
                  </p>
                </div>
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
              {/*
                Cuando es de sólo lectura NO se usa un <select disabled>: se
                renderizaba en gris claro, con aspecto de control apagado, y
                Administración lo leía como "no se cargó el LIO" (testeo del
                31/08/2026). Va como dato legible, alto contraste, y la
                aclaración de que no se modifica queda abajo en letra menor.
              */}
              {lioSoloLectura ? (
                <div className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-900">
                  {lioPresupuestoNombre}
                </div>
              ) : (
                <select
                  value={lioId}
                  onChange={(e) => setLioId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  <option value="">Seleccioná…</option>
                  {lios.filter((l) => l.activo).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              )}
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

          {/*
            DIAGNÓSTICO, sólo cuando la práctica se hace por varias
            indicaciones. Una inyección intravítrea puede ser por DMAE húmeda,
            edema macular diabético u oclusión venosa, y cuál va en el pedido
            lo sabe quien atendió al paciente, no la práctica.

            No viene preseleccionado a propósito. Elegir por el médico es el
            error que este módulo vino a evitar: antes el pedido imprimía
            "Catarata" para todo y un pterigión salió pedido como catarata.
          */}
          {opcionesDx.length > 0 && (
            <label className="block text-sm">
              <span className="block text-gray-600 mb-1 font-medium">Diagnóstico *</span>
              <select
                value={opcionDxId}
                onChange={(e) => setOpcionDxId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                <option value="">Seleccioná…</option>
                {opcionesDx.map((o) => (
                  <option key={o.id} value={o.id}>{o.diagnostico.replace("{ojo}", "").trim()}</option>
                ))}
              </select>
              <span className="text-[11px] text-gray-500 mt-1 block">
                Esta práctica se hace por varias indicaciones. Es lo que va impreso en el pedido a la
                obra social, así que lo elige quien atendió al paciente.
              </span>
            </label>
          )}

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
            {guardando ? "Guardando…" : (edicion ? "Guardar cambios" : "Aceptar y guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}
