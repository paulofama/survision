// ============================================================
// Informe mensual de Seguimiento telefónico
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Se presenta todos los meses. Los números salen de `utils/informeSeguimiento`,
// el mismo módulo que alimenta el PDF: la pantalla y el papel no pueden
// discrepar.
//
// EL INDICADOR DE PORTADA ES EL TIEMPO AL PRIMER CONTACTO, y no la cantidad de
// llamadas, porque los datos dicen que la decisión del paciente se toma en los
// primeros 30 días (mediana 9,5) mientras el circuito llama a los 294. Llamar
// más no mueve la aguja si se llama tarde.
// ============================================================

import { useState } from "react";
import { FileDown, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { useInformeSeguimiento } from "../hooks/useInformeSeguimiento";
import { generarPdfInformeSeguimiento } from "../utils/pdfInformeSeguimiento";
import type { Indicador, InformeSeguimiento } from "../utils/informeSeguimiento";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ars = (n: number) =>
  "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
const unDec = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n || 0);

/** Un indicador, formateado según lo que mide. */
const valorDe = (i: Indicador): string => {
  if (i.formato === "porcentaje") return unDec(i.valor) + " %";
  if (i.formato === "dias") return Math.round(i.valor) + " días";
  if (i.formato === "ratio") return unDec(i.valor);
  return String(Math.round(i.valor));
};

const deltaDe = (i: Indicador): { texto: string; bueno: boolean } | null => {
  if (i.delta === null) return null;
  const signo = i.delta >= 0 ? "+" : "−";
  const abs = Math.abs(i.delta);
  const texto = i.formato === "porcentaje" ? `${signo}${unDec(abs)} pp`
    : i.formato === "dias" ? `${signo}${Math.round(abs)} días`
    : i.formato === "ratio" ? `${signo}${unDec(abs)}`
    : `${signo}${Math.round(abs)}`;
  const mejora = i.delta === 0 ? true : (i.delta > 0) === i.subirEsBueno;
  return { texto, bueno: mejora };
};

// ── Bloques ─────────────────────────────────────────────────────────────────

function Seccion({ titulo, bajada, children }: { titulo: string; bajada?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>
      {bajada && <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{bajada}</p>}
      <div className={bajada ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/** El indicador de portada: grande, con su contexto al lado. */
function Portada({ inf }: { inf: InformeSeguimiento }) {
  const lat = inf.indicadores.find((i) => i.clave === "latencia");
  const vd = inf.ventanaDecision;
  const dias = lat && lat.n > 0 ? Math.round(lat.valor) : null;
  // La comparación que da sentido al número: cuándo decide el paciente.
  const tarde = dias !== null && vd.medianaDias !== null && dias > 30;

  return (
    <section className={`rounded-xl border p-5 ${tarde ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <Clock className={`w-8 h-8 shrink-0 ${tarde ? "text-red-600" : "text-emerald-600"}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tiempo al primer contacto</p>
          <p className={`text-4xl font-bold ${tarde ? "text-red-700" : "text-emerald-700"}`}>
            {dias === null ? "sin datos" : `${dias} días`}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            mediana sobre {lat?.n ?? 0} presupuesto{(lat?.n ?? 0) === 1 ? "" : "s"} contactado{(lat?.n ?? 0) === 1 ? "" : "s"} en el mes
          </p>
        </div>
        <div className="flex-1 min-w-[260px] border-l border-gray-300 pl-4 ml-auto">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ventana de decisión del paciente</p>
          <p className="text-2xl font-bold text-gray-900">
            {vd.medianaDias === null ? "—" : `${unDec(vd.medianaDias)} días`}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {vd.dentro30} de {vd.n} cirugías ({Math.round(vd.pctDentro30)} %) se hicieron dentro de los 30 días del presupuesto
          </p>
          {tarde && (
            <p className="text-xs text-red-700 font-medium mt-2">
              El llamado llega fuera de la ventana en la que el paciente decide.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Kpi({ i }: { i: Indicador }) {
  const d = deltaDe(i);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[11px] text-gray-500 font-medium">{i.label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-xl font-bold ${i.confiable ? "text-gray-900" : "text-gray-400"}`}>{valorDe(i)}</span>
        {d && <span className={`text-[11px] font-semibold ${d.bueno ? "text-emerald-600" : "text-red-600"}`}>{d.texto}</span>}
      </div>
      <p className="text-[10px] text-gray-400 mt-1">
        n = {i.n}
        {!i.confiable && <span className="text-amber-600 font-medium"> · muestra chica</span>}
      </p>
      <p className="text-[10px] text-gray-500 mt-1 leading-snug">{i.definicion}</p>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function InformeSeguimientoPage() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const { informe, loading, error, recargar } = useInformeSeguimiento(anio, mes);

  const anios = [hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2];

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Encabezado */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-gray-900">Informe de Seguimiento telefónico</h1>
          <p className="text-xs text-gray-500">
            {informe ? informe.etiquetaPeriodo : "—"} · presupuestos entregados y su recuperación
          </p>
        </div>
        <label className="text-xs text-gray-600">
          <span className="block mb-1">Mes</span>
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          <span className="block mb-1">Año</span>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button onClick={recargar} disabled={loading}
          className="text-xs border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
        <button
          onClick={() => informe && generarPdfInformeSeguimiento(informe)}
          disabled={!informe || loading}
          className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg px-3 py-2 font-medium flex items-center gap-1.5">
          <FileDown className="w-3.5 h-3.5" /> Descargar PDF
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Cargando…</p>}

      {informe && !loading && (
        <>
          <Portada inf={informe} />

          {/* Advertencias metodológicas: van arriba, no escondidas al final. */}
          {informe.advertencias.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Cómo leer este informe
              </p>
              <ul className="mt-2 space-y-1">
                {informe.advertencias.map((a, i) => (
                  <li key={i} className="text-[11px] text-amber-900">· {a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Indicadores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {informe.indicadores.map((i) => <Kpi key={i.clave} i={i} />)}
          </div>

          {/* Plata en riesgo */}
          <Seccion
            titulo={`Plata en riesgo — ${ars(informe.plataEnRiesgo.total)} en ${informe.plataEnRiesgo.cantidad} presupuestos`}
            bajada="Presupuestos entregados que todavía no se operaron, por antigüedad.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left py-1.5">Antigüedad</th>
                    <th className="text-right">Presupuestos</th>
                    <th className="text-right">Monto</th>
                    <th className="text-right">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.plataEnRiesgo.tramos.filter((t) => t.cantidad > 0).map((t) => (
                    <tr key={t.etiqueta} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">{t.etiqueta}</td>
                      <td className="text-right text-gray-700">{t.cantidad}</td>
                      <td className="text-right font-medium text-gray-900">{ars(t.monto)}</td>
                      <td className="text-right text-gray-500">
                        {unDec(informe.plataEnRiesgo.total ? (t.monto / informe.plataEnRiesgo.total) * 100 : 0)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* Embudo */}
          <Seccion titulo="Embudo del mes"
            bajada="Cada escalón es un subconjunto del anterior. La conversión del mes completo va aparte, porque incluye presupuestos que el circuito nunca tocó.">
            <div className="space-y-1.5">
              {informe.embudo.map((e) => {
                const base = informe.embudo[0].cantidad || 1;
                const ancho = Math.max(2, (e.cantidad / base) * 100);
                return (
                  <div key={e.etiqueta} className="flex items-center gap-3">
                    <span className="text-[11px] text-gray-600 w-52 shrink-0">{e.etiqueta}</span>
                    <div className="flex-1 bg-gray-100 rounded h-6 relative min-w-[80px]">
                      <div className="bg-blue-500 h-6 rounded" style={{ width: `${ancho}%` }} />
                      <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-white mix-blend-difference">
                        {e.cantidad}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 w-32 text-right shrink-0">{ars(e.monto)}</span>
                    <span className="text-[11px] text-gray-400 w-24 text-right shrink-0">
                      {e.retencion === null ? "" : `${Math.round(e.retencion)} % del anterior`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-600 mt-3 pt-3 border-t border-gray-100">
              Conversión del mes completo: <strong>{informe.conversionMes.operados} de {informe.conversionMes.total}</strong>
              {" "}({unDec(informe.conversionMes.tasa)} %), con y sin seguimiento.
            </p>
          </Seccion>

          {/* Cohortes */}
          <Seccion titulo="Cohortes"
            bajada="Presupuestos de cada mes y cuántos se operaron dentro de 30, 60 y 90 días. Una ventana abierta todavía puede sumar.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left py-1.5">Mes</th>
                    <th className="text-right">Entregados</th>
                    <th className="text-right">En circuito</th>
                    <th className="text-right">30 días</th>
                    <th className="text-right">60 días</th>
                    <th className="text-right">90 días</th>
                    <th className="text-right">Conversión</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.cohortes.map((c) => (
                    <tr key={c.etiqueta} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">
                        {c.etiqueta}
                        {!c.cerrada90 && <span className="ml-1 text-[10px] text-amber-600">abierta</span>}
                      </td>
                      <td className="text-right text-gray-700">{c.entregados}</td>
                      <td className="text-right text-gray-500">{c.enCircuito}</td>
                      <td className="text-right text-gray-700">{c.a30}</td>
                      <td className="text-right text-gray-700">{c.a60}</td>
                      <td className="text-right text-gray-700">{c.a90}</td>
                      <td className="text-right font-medium text-gray-900">
                        {c.entregados ? unDec((c.a90 / c.entregados) * 100) + " %" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* Contactabilidad */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Seccion titulo="Contactabilidad por hora" bajada="Histórico completo. El n importa tanto como el porcentaje.">
              <TablaFranjas filas={informe.porHora} />
            </Seccion>
            <Seccion titulo="Contactabilidad por día" bajada="Histórico completo.">
              <TablaFranjas filas={informe.porDiaSemana} />
            </Seccion>
          </div>

          {/* Objeciones */}
          <Seccion titulo="Mapa de objeciones"
            bajada="Qué contestan los pacientes que atienden. Es lo que dice cómo convertir a un indeciso.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left py-1.5">Pregunta</th>
                    <th className="text-right">Sí</th>
                    <th className="text-right">No</th>
                    <th className="text-right">n</th>
                    <th className="text-left pl-4">Qué significa</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.objeciones.map((o) => (
                    <tr key={o.clave} className="border-b border-gray-100 align-top">
                      <td className="py-1.5 text-gray-700">{o.pregunta}</td>
                      <td className="text-right font-medium text-emerald-700">{o.si}</td>
                      <td className="text-right font-medium text-red-700">{o.no}</td>
                      <td className="text-right text-gray-500">{o.n}</td>
                      <td className="pl-4 text-[11px] text-gray-500">{o.lectura}</td>
                    </tr>
                  ))}
                  {!informe.objeciones.length && (
                    <tr><td colSpan={5} className="py-3 text-gray-400 text-xs">Sin encuestas respondidas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* Operadores */}
          <Seccion titulo="Actividad del mes por operador">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-200">
                    <th className="text-left py-1.5">Operador</th>
                    <th className="text-right">Intentos</th>
                    <th className="text-right">Contactos</th>
                    <th className="text-right">Tasa</th>
                    <th className="text-right">Encuestas</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.operadores.map((o) => (
                    <tr key={o.usuario} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-700">{o.usuario}</td>
                      <td className="text-right text-gray-700">{o.intentos}</td>
                      <td className="text-right text-gray-700">{o.contactos}</td>
                      <td className="text-right text-gray-500">{unDec(o.tasa)} %</td>
                      <td className="text-right text-gray-700">{o.encuestas}</td>
                    </tr>
                  ))}
                  {!informe.operadores.length && (
                    <tr><td colSpan={5} className="py-3 text-gray-400 text-xs">Sin actividad en el mes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Seccion>

          {/* Pendientes con nombre */}
          <Seccion
            titulo={`Sin seguimiento — ${informe.sinSeguimiento.length} presupuestos, ${ars(informe.sinSeguimiento.reduce((a, x) => a + x.monto, 0))}`}
            bajada="Entregados sin operar que nunca entraron al circuito, del monto más alto al más bajo. Esta es la lista para llamar.">
            <TablaPendientes filas={informe.sinSeguimiento} />
          </Seccion>

          {informe.perdidosDeSeguimiento.length > 0 && (
            <Seccion
              titulo={`Perdidos de seguimiento — ${informe.perdidosDeSeguimiento.length}`}
              bajada="Están en el circuito, se agotaron los intentos y nunca atendieron. Requieren otro canal, no otra llamada.">
              <TablaPendientes filas={informe.perdidosDeSeguimiento} />
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}

function TablaFranjas({ filas }: { filas: { etiqueta: string; intentos: number; contactos: number; tasa: number }[] }) {
  const max = Math.max(1, ...filas.map((f) => f.intentos));
  return (
    <div className="space-y-1">
      {filas.map((f) => (
        <div key={f.etiqueta} className="flex items-center gap-2 text-[11px]">
          <span className="w-20 text-gray-600 shrink-0">{f.etiqueta}</span>
          <div className="flex-1 bg-gray-100 rounded h-4 min-w-[60px]">
            <div className="bg-blue-400 h-4 rounded" style={{ width: `${(f.intentos / max) * 100}%` }} />
          </div>
          <span className="w-24 text-right text-gray-500 shrink-0">{f.intentos} intentos</span>
          <span className={`w-20 text-right font-semibold shrink-0 ${f.tasa >= 40 ? "text-emerald-600" : f.tasa < 15 ? "text-red-600" : "text-gray-700"}`}>
            {Math.round(f.tasa)} %
          </span>
        </div>
      ))}
      {!filas.length && <p className="text-xs text-gray-400">Sin llamadas registradas.</p>}
    </div>
  );
}

function TablaPendientes({ filas }: { filas: { numero: string; paciente: string; telefono: string | null; practica: string; monto: number; diasDesdeCreacion: number }[] }) {
  const [verTodos, setVerTodos] = useState(false);
  const visibles = verTodos ? filas : filas.slice(0, 15);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-500 border-b border-gray-200">
              <th className="text-left py-1.5">Presupuesto</th>
              <th className="text-left">Paciente</th>
              <th className="text-left">Teléfono</th>
              <th className="text-left">Práctica</th>
              <th className="text-right">Monto</th>
              <th className="text-right">Antigüedad</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.numero} className="border-b border-gray-100">
                <td className="py-1.5 text-gray-600">{f.numero}</td>
                <td className="text-gray-900 font-medium">{f.paciente}</td>
                <td className="text-gray-600">{f.telefono || <span className="text-amber-600">sin teléfono</span>}</td>
                <td className="text-gray-600 max-w-[260px] truncate" title={f.practica}>{f.practica}</td>
                <td className="text-right font-medium text-gray-900">{ars(f.monto)}</td>
                <td className="text-right text-gray-500">{f.diasDesdeCreacion} días</td>
              </tr>
            ))}
            {!filas.length && <tr><td colSpan={6} className="py-3 text-gray-400 text-xs">Nada pendiente.</td></tr>}
          </tbody>
        </table>
      </div>
      {filas.length > 15 && (
        <button onClick={() => setVerTodos((v) => !v)} className="mt-2 text-xs text-blue-600 hover:underline">
          {verTodos ? "Ver sólo los 15 primeros" : `Ver los ${filas.length}`}
        </button>
      )}
    </>
  );
}
