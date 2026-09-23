// ============================================================
// Panel Circuito — rama de aceptación + checklist de trámites del presupuesto
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Muestra los datos de la aceptación (cobertura/convenio/fecha/ojo/LIO) y el
// checklist de trámites hasta "LISTO PARA CIRUGÍA". Lee/escribe
// presupuestos_aceptacion y presupuestos_checklist (RLS 'presupuestador').
// ============================================================

import { useEffect, useState } from "react";
import {
  Aceptacion, ChecklistRow, Convenio, Lio, CajaEntrega,
  CHECKLIST_ITEMS, OJOS, SUB_RAMAS,
  clavesAplicables, listoParaCirugia, progresoChecklist,
  cargarEntregas, sumaEntregas, anularEntrega, practicaDelPresupuesto,
  sbGet, sbPatch, sbInsert,
} from "../utils/circuito";
import {
  CajaOpts, SobreCtx, RecetaDeCostos,
  docsDelSobre, armarContexto, cargarConsentimiento, cargarRecetaDeCostos, type Consentimiento,
  cargarDiagnosticoPractica,
  generarDocumento, generarSobreCompleto,
  valorTotalCaja, requiereFactura, restaPagar,
} from "../utils/sobre";
import CajaIngresoModal from "./CajaIngresoModal";

interface PresupuestoMin {
  id: string;
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  paciente_documento?: string;
  prestacion_codigo?: string;
  prestacion_descripcion?: string;
  total_final?: number | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos_completos?: any;
}

/**
 * Qué se genera después de confirmar los datos de caja.
 *
 * El sobre viaja con la selección de documentos: el modal se abre en el medio
 * y al volver hay que armar EXACTAMENTE lo que el operador había tildado.
 */
type PendienteCaja =
  | { modo: "uno" }
  | { modo: "sobre"; claves: string[] };

// `fecha_tentativa_cirugia` es una columna `date` ("2026-08-11"): construir un
// Date con eso la ubica a medianoche UTC y en Argentina muestra el día
// anterior. Las fechas sin hora se formatean tal cual; las timestamptz
// (fecha_completado) sí pasan a hora local.
/** Importes en formato argentino: 1.234.567,00 (convención del proyecto). */
const fmtImporte = (n: number): string =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const fmtFecha = (d: string | null | undefined): string => {
  if (!d) return "—";
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (soloFecha) {
    const [, a, m, dd] = soloFecha;
    return `${dd}/${m}/${a}`;
  }
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
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
  const [entregas, setEntregas] = useState<CajaEntrega[]>([]);
  // Arranca como placeholder: hasta que la consulta diga lo contrario, el
  // consentimiento no se firma.
  const [consentimiento, setConsentimiento] = useState<Consentimiento>({ secciones: [], esPlaceholder: true });
  const [receta, setReceta] = useState<RecetaDeCostos | null>(null);
  // Diagnóstico y solicitud de la práctica, para el pedido de cirugía.
  const [diag, setDiag] = useState<{ diagnostico: string; solicitud: string; llevaLio: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [pendienteCaja, setPendienteCaja] = useState<PendienteCaja | null>(null);
  // Se guardan los DESTILDADOS, no los tildados: así un documento nuevo entra
  // al sobre por defecto en vez de quedar afuera sin que nadie lo note.
  const [excluidos, setExcluidos] = useState<string[]>([]);
  // Entrega que se está anulando (abre el modal del motivo).
  const [anulando, setAnulando] = useState<CajaEntrega | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const practica = practicaDelPresupuesto(presupuesto);
      const [a, ch, ent, cons, rec, dx] = await Promise.all([
        sbGet<Aceptacion>(`presupuestos_aceptacion?presupuesto_id=eq.${presupuesto.id}&select=*`),
        sbGet<ChecklistRow>(`presupuestos_checklist?presupuesto_id=eq.${presupuesto.id}&select=*`),
        cargarEntregas(presupuesto.id),
        cargarConsentimiento(),
        // La receta de costos de la práctica, para la hoja que se archiva en
        // quirófano. Si no hay, la hoja lo declara en vez de omitirse.
        cargarRecetaDeCostos(practica.codigo, practica.descripcion),
        cargarDiagnosticoPractica(practica.codigo),
      ]);
      const acept = a[0] || null;
      setAceptacion(acept);
      setEntregas(ent || []);
      setConsentimiento(cons);
      setReceta(rec);
      setDiag(dx);
      // Sólo los ítems que existen para esta cobertura (ej. "Orden autorizada"
      // no corresponde a un circuito Particular), en el orden fijo de la
      // definición. Filtrar acá corrige también los circuitos ya aceptados
      // antes de esta regla, sin tocar datos.
      const validas = acept
        ? clavesAplicables(acept)
        : new Set(CHECKLIST_ITEMS.map((it) => it.clave));
      const orden = new Map(CHECKLIST_ITEMS.map((it, i) => [it.clave, i]));
      setRows(
        (ch || [])
          .filter((r) => validas.has(r.item_clave))
          .slice()
          .sort((x, y) => (orden.get(x.item_clave) ?? 99) - (orden.get(y.item_clave) ?? 99)),
      );
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
  const contexto = (caja?: CajaOpts): SobreCtx | null => {
    if (!aceptacion) return null;
    return armarContexto({
      presupuesto, aceptacion, convenios, lios, consentimiento, receta, diag, caja,
      // Lo ya entregado: el comprobante nuevo descuenta de este saldo.
      entregasPrevias: sumaEntregas(entregas),
    });
  };

  /**
   * Deja constancia de qué se imprimió (migración 46).
   *
   * Nunca bloquea la impresión: si falla el registro, el sobre igual sale. El
   * papel es lo que el paciente se lleva; la auditoría es interna.
   */
  const registrarSobre = async (documentos: string[], modo: "sobre" | "documento") => {
    if (!documentos.length) return;
    try {
      await sbInsert("presupuestos_sobres", {
        presupuesto_id: presupuesto.id,
        documentos,
        modo,
        generado_por: username,
      });
    } catch {
      // Silencio a propósito: ver el comentario de arriba.
    }
  };

  /**
   * El comprobante de caja necesita datos que carga el operador (monto o % del
   * depósito en Particular), así que cualquier generación que lo incluya pasa
   * antes por el modal.
   */
  const generarUno = (clave: string) => {
    if (!aceptacion) return;
    if (clave === "caja") { setPendienteCaja({ modo: "uno" }); return; }
    const ctx = contexto();
    if (!ctx) return;
    generarDocumento(clave, ctx);
    registrarSobre([clave], "documento");
  };

  /** Claves tildadas, en el orden del sobre (no en el orden en que se tildaron). */
  const clavesElegidas = () =>
    docsDelContexto.filter((d) => !excluidos.includes(d.clave)).map((d) => d.clave);

  const generarSobre = () => {
    if (!aceptacion) return;
    const claves = clavesElegidas();
    if (!claves.length) return;
    // Si la caja entra en el sobre, primero hay que cargar la entrega.
    if (claves.includes("caja")) { setPendienteCaja({ modo: "sobre", claves }); return; }
    const ctx = contexto();
    if (!ctx) return;
    generarSobreCompleto(ctx, claves);
    registrarSobre(claves, "sobre");
  };

  const toggleDoc = (clave: string) =>
    setExcluidos((prev) => (prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]));

  /** Persiste lo cargado en caja y genera lo que estaba pendiente. */
  const confirmarCaja = async (caja: CajaOpts) => {
    if (!aceptacion || !pendienteCaja) return;

    // El contexto se arma ANTES de registrar la entrega: `entregasPrevias` tiene
    // que ser lo entregado hasta el comprobante anterior, no incluir el actual
    // (que va en su propio renglón ENTREGA).
    const ctx = contexto(caja);

    try {
      // Parámetros del comprobante. `caja_monto_unico` NO se manda: desde el
      // 15/09/2026 el valor total sale del presupuesto y ya no se carga a mano.
      // Al no incluirlo en el PATCH, la columna conserva lo que se guardó con el
      // cálculo viejo, que es el rastro de los comprobantes ya emitidos.
      await sbPatch(`presupuestos_aceptacion?presupuesto_id=eq.${presupuesto.id}`, {
        deposito_modalidad: caja.depositoModalidad,
        deposito_valor: caja.depositoValor,
        caja_registrado_por: username,
        caja_registrado_en: new Date().toISOString(),
      });
      setAceptacion((prev) => (prev ? {
        ...prev,
        deposito_modalidad: caja.depositoModalidad,
        deposito_valor: caja.depositoValor,
      } : prev));

      // La ENTREGA es una fila nueva, nunca un upsert: si se pisara, el segundo
      // pago borraría el primero y el saldo quedaría mal.
      if (ctx && caja.entrega != null && caja.entrega > 0) {
        // `fecha` en local, no UTC: a la noche `toISOString()` da el día
        // siguiente y el comprobante saldría fechado mañana.
        const hoy = new Date();
        const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
        await sbInsert("presupuestos_caja_entregas", {
          presupuesto_id: presupuesto.id,
          fecha,
          monto: caja.entrega,
          // Congelados con la entrega: reimprimir un comprobante viejo tiene que
          // dar el mismo saldo y la misma sigla aunque después se edite el
          // presupuesto.
          valor_total: valorTotalCaja(ctx),
          requiere_factura: requiereFactura(ctx),
          registrado_por: username,
        });
        // `updated_at` NO se manda nunca: lo maneja el trigger (devuelve 400).
        await cargar();
      }
    } catch (e) {
      // Si falla el guardado, igual se emite el comprobante: la caja no puede
      // quedar bloqueada por un problema de red.
      setError((e as Error).message || "No se pudo guardar el dato de caja (el comprobante se generó igual)");
    }

    if (ctx) {
      if (pendienteCaja.modo === "sobre") {
        generarSobreCompleto(ctx, pendienteCaja.claves);
        registrarSobre(pendienteCaja.claves, "sobre");
      } else {
        generarDocumento("caja", ctx);
        registrarSobre(["caja"], "documento");
      }
    }
    setPendienteCaja(null);
  };

  // La botonera muestra EXACTAMENTE los documentos que va a traer el sobre.
  // Salía de `DOCS` crudo, así que ofrecía generar hojas que el sobre omite
  // —las recetas cuando el convenio las suprime, por ejemplo— y el botón
  // descargaba un PDF vacío.
  const ctxDocs = contexto();
  const docsDelContexto = ctxDocs ? docsDelSobre(ctxDocs) : [];
  const cantidadElegida = docsDelContexto.filter((d) => !excluidos.includes(d.clave)).length;

  /** Confirma la anulación y recarga, para que el saldo se recalcule. */
  const confirmarAnulacion = async () => {
    if (!anulando) return;
    try {
      await anularEntrega(anulando.id, username, motivoAnulacion);
      setAnulando(null);
      setMotivoAnulacion("");
      await cargar();
    } catch (e) {
      setError((e as Error).message || "No se pudo anular la entrega");
    }
  };

  const labelDe = (clave: string) => CHECKLIST_ITEMS.find((i) => i.clave === clave)?.label || clave;
  const convenioNombre = aceptacion?.convenio_id ? (convenios.find((c) => c.id === aceptacion.convenio_id)?.nombre || "—") : "—";
  const lioNombre = aceptacion?.lio_id ? (lios.find((l) => l.id === aceptacion.lio_id)?.nombre || "—") : "—";
  const ojoLabel = aceptacion?.ojo ? (OJOS.find((o) => o.value === aceptacion.ojo)?.label || aceptacion.ojo) : "—";
  const subRamaLabel = aceptacion?.sub_rama ? (SUB_RAMAS.find((s) => s.value === aceptacion.sub_rama)?.label || aceptacion.sub_rama) : null;

  const listo = listoParaCirugia(rows);
  const prog = progresoChecklist(rows);
  // Contexto para el modal de caja (usa los valores ya persistidos como default).
  const ctxCaja = pendienteCaja ? contexto() : null;

  // Saldo pendiente con las entregas ya registradas. `contexto()` no trae
  // entrega actual (es null al cargar), así que `restaPagar` da justamente
  // "valor total − lo entregado hasta hoy".
  const saldoCaja = (() => {
    if (!entregas.length) return null;
    const c = contexto();
    if (!c) return null;
    const total = valorTotalCaja(c);
    return total > 0 ? restaPagar(c) : null;
  })();

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
                  <p className="text-[11px] text-gray-500 mb-2">
                    Trazabilidad y consentimiento salen en hoja propia al final, para desprenderlos y archivarlos en quirófano.
                  </p>
                  {/*
                    ELEGIR QUÉ SE IMPRIME (16/09/2026).

                    Antes acá había una pastilla de color por documento y cada
                    clic descargaba ESE documento suelto. Administración las leyó
                    como casillas: "cuando vi que me da opciones de tildar pensé
                    que me estaba dando la opción de solamente imprimir esas".
                    Tildaba las que quería y bajaba el sobre entero, que salía
                    completo. La interfaz decía una cosa y hacía otra.

                    Ahora la casilla es una casilla —decide qué entra en el
                    sobre— y para bajar una hoja sola está el ícono de descarga,
                    que es una acción aparte y se ve como tal.
                  */}
                  <div className="space-y-1">
                    {docsDelContexto.map((d) => {
                      const incluido = !excluidos.includes(d.clave);
                      return (
                        <div
                          key={d.clave}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                            incluido ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"
                          }`}
                        >
                          <label className="flex flex-1 items-center gap-2 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={incluido}
                              onChange={() => toggleDoc(d.clave)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                            />
                            <span className={`text-xs font-medium truncate ${incluido ? "text-gray-800" : "text-gray-400 line-through"}`}>
                              {d.label}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                d.quirofano ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {d.quirofano ? "quirófano" : "paciente"}
                            </span>
                          </label>
                          <button
                            onClick={() => generarUno(d.clave)}
                            className="text-[11px] text-gray-500 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded px-1.5 py-0.5 shrink-0"
                            title={`Descargar sólo esta hoja: ${d.label}`}
                          >
                            ↓ sola
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={generarSobre}
                    disabled={cantidadElegida === 0}
                    className="mt-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    {cantidadElegida === 0
                      ? "Sin documentos tildados"
                      : `Descargar el Sobre (${cantidadElegida} de ${docsDelContexto.length})`}
                  </button>
                  {excluidos.length > 0 && cantidadElegida > 0 && (
                    <p className="text-[11px] text-orange-600 mt-1">
                      Quedan afuera: {docsDelContexto.filter((d) => excluidos.includes(d.clave)).map((d) => d.label).join(", ")}.
                    </p>
                  )}

                  {/*
                    Entregas registradas. Acá es donde Ivana y Flavio miran si
                    corresponde emitir factura: la sigla C/IVA — S/IVA que salió
                    impresa en cada comprobante, más el saldo que queda.
                  */}
                  {entregas.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        Entregas registradas ({entregas.length})
                      </p>
                      <div className="space-y-1">
                        {/* Las anuladas SIGUEN EN LA LISTA, tachadas: hubo un
                            comprobante impreso y tiene que verse qué pasó con
                            él. Lo que no hacen es sumar. */}
                        {entregas.map((e) => (
                          <div key={e.id} className="text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className={e.anulada_at ? "text-gray-400 line-through" : "text-gray-600"}>
                                {fmtFecha(e.fecha)}
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  e.anulada_at
                                    ? "bg-gray-100 text-gray-500"
                                    : e.requiere_factura
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-orange-100 text-orange-700"
                                }`}>
                                  {e.requiere_factura ? "C/IVA" : "S/IVA"}
                                </span>
                                {e.registrado_por && (
                                  <span className="ml-2 text-gray-400">{e.registrado_por}</span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <span className={`font-medium tabular-nums ${e.anulada_at ? "text-gray-400 line-through" : "text-gray-800"}`}>
                                  $ {fmtImporte(Number(e.monto))}
                                </span>
                                {!e.anulada_at && (
                                  <button
                                    onClick={() => setAnulando(e)}
                                    title="Anular esta entrega"
                                    className="text-[10px] text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 rounded px-1.5 py-0.5"
                                  >
                                    Anular
                                  </button>
                                )}
                              </span>
                            </div>
                            {e.anulada_at && (
                              <p className="text-[10px] text-gray-400 ml-1 mt-0.5">
                                Anulada por {e.anulada_por || "—"} · {e.anulacion_motivo}
                              </p>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs border-t border-gray-200 pt-1 mt-1">
                          <span className="font-semibold text-gray-700">Entregado</span>
                          <span className="font-bold text-gray-900 tabular-nums">
                            $ {fmtImporte(sumaEntregas(entregas))}
                          </span>
                        </div>
                        {saldoCaja != null && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-700">Resta pagar</span>
                            <span className="font-bold text-gray-900 tabular-nums">
                              $ {fmtImporte(saldoCaja)}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-2">
                        C/IVA: corresponde emitir factura el día de la cirugía.
                        S/IVA: no corresponde (hubo descuento).
                      </p>
                    </div>
                  )}
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

      {/* Anulación de una entrega de caja (migración 47).
          El motivo es obligatorio y lo exige también la base: una anulación sin
          explicación es indistinguible de un error nuevo. */}
      {anulando && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { e.stopPropagation(); setAnulando(null); setMotivoAnulacion(""); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b bg-red-50 border-red-100">
              <h3 className="font-bold text-gray-900">Anular entrega de caja</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {fmtFecha(anulando.fecha)} · $ {fmtImporte(Number(anulando.monto))}
                {anulando.registrado_por ? ` · cargada por ${anulando.registrado_por}` : ""}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                La entrega deja de sumar al saldo, pero <strong>la fila no se borra</strong>: queda
                registrada como anulada, con tu usuario y el motivo. Si ya se imprimió el
                comprobante, conviene recuperarlo o avisarle al paciente que el saldo cambió.
              </p>
              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">Motivo *</span>
                <textarea
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Ej.: prueba del sistema, se cargó en el presupuesto equivocado, monto mal tipeado…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </label>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => { setAnulando(null); setMotivoAnulacion(""); }}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                onClick={confirmarAnulacion}
                disabled={motivoAnulacion.trim().length < 3}
                className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium"
              >
                Anular entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Datos que carga el operador para el comprobante de caja */}
      {pendienteCaja && ctxCaja && (
        <CajaIngresoModal
          ctx={ctxCaja}
          titulo="Ingreso de caja"
          // Ya no es "completo": el sobre lleva lo que el operador haya tildado.
          confirmLabel={
            pendienteCaja.modo === "sobre"
              ? `Generar Sobre (${pendienteCaja.claves.length} ${pendienteCaja.claves.length === 1 ? "documento" : "documentos"})`
              : "Generar comprobante"
          }
          onClose={() => setPendienteCaja(null)}
          onConfirm={confirmarCaja}
        />
      )}
    </div>
  );
}
