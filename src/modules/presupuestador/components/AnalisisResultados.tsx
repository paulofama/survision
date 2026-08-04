// ============================================================
// Análisis de resultado comercial del Presupuestador (Fase 5)
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Funnel de emitidos, tasa de conversión (aceptados/emitidos), ranking de
// motivos de rechazo y cruces por obra social, prestador y rango de monto.
// Carga los presupuestos EMITIDOS una vez y agrega en el cliente; filtra por
// rango de fechas sobre los datos en memoria.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { sbGet } from "../utils/circuito";
import { esEmitido, estaVencido } from "../utils/resultado";

interface Row {
  id: string;
  estado: string;
  resultado: string | null;
  resultado_motivo_id: string | null;
  fecha_creacion: string;
  total_final: number | string | null;
  cirujano: string | null;
  os: string | null;
}

type Efectivo = "ACEPTADO" | "RECHAZADO" | "SIN_RESPUESTA" | "PENDIENTE";

const SELECT = "id,estado,resultado,resultado_motivo_id,fecha_creacion,total_final,cirujano,os:datos_completos->paciente->>obraSocial";

const fmtInt = (n: number) => n.toLocaleString("es-AR");
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Resultado efectivo: incluye ACEPTADO implícito (practicado) y SIN RESPUESTA derivado (vencido). */
function efectivo(r: Row, plazo: number): Efectivo {
  if (r.resultado === "ACEPTADO") return "ACEPTADO";
  if (r.resultado === "RECHAZADO") return "RECHAZADO";
  if (r.resultado === "SIN_RESPUESTA") return "SIN_RESPUESTA";
  if (r.estado === "practicado") return "ACEPTADO"; // ya se operó
  if (estaVencido(r.estado, r.resultado, r.fecha_creacion, plazo)) return "SIN_RESPUESTA";
  return "PENDIENTE";
}

function prettyCirujano(c: string | null): string {
  if (!c) return "Sin prestador";
  return c.replace(/^dr_/i, "Dr. ").replace(/_/g, " ").replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

// Buckets de monto (ARS)
const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "Hasta $500 mil", min: 0, max: 500_000 },
  { label: "$500 mil – $1 M", min: 500_000, max: 1_000_000 },
  { label: "$1 M – $2 M", min: 1_000_000, max: 2_000_000 },
  { label: "$2 M – $3 M", min: 2_000_000, max: 3_000_000 },
  { label: "Más de $3 M", min: 3_000_000, max: Infinity },
];

interface Agrupado { clave: string; emitidos: number; aceptados: number; }

function agrupar(rows: Row[], plazo: number, key: (r: Row) => string): Agrupado[] {
  const m = new Map<string, Agrupado>();
  for (const r of rows) {
    const k = key(r) || "—";
    const g = m.get(k) || { clave: k, emitidos: 0, aceptados: 0 };
    g.emitidos++;
    if (efectivo(r, plazo) === "ACEPTADO") g.aceptados++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.emitidos - a.emitidos);
}

export default function AnalisisResultados() {
  const [rows, setRows] = useState<Row[]>([]);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [plazo, setPlazo] = useState(45);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        // Emitidos (entregado/practicado), paginado por las dudas.
        const acc: Row[] = [];
        let from = 0;
        for (;;) {
          const page = await sbGet<Row>(
            `presupuestos?select=${SELECT}&estado=in.(entregado,practicado)&order=fecha_creacion.desc&limit=1000&offset=${from}`,
          );
          acc.push(...page);
          if (page.length < 1000) break;
          from += 1000;
        }
        setRows(acc);

        const [mot, cfg] = await Promise.all([
          sbGet<{ id: string; nombre: string }>("presupuestos_motivos_resultado?tipo=eq.RECHAZADO&select=id,nombre"),
          sbGet<{ valor: string }>("presupuestos_config?clave=eq.plazo_sin_respuesta_dias&select=valor"),
        ]);
        setMotivos(Object.fromEntries(mot.map((m) => [m.id, m.nombre])));
        const n = parseInt(cfg?.[0]?.valor ?? "45", 10);
        if (Number.isFinite(n) && n > 0) setPlazo(n);
      } catch (e) {
        setError((e as Error).message || "No se pudieron cargar los datos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtrados = useMemo(() => rows.filter((r) => {
    const f = (r.fecha_creacion || "").slice(0, 10);
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  }), [rows, desde, hasta]);

  const resumen = useMemo(() => {
    let aceptados = 0, rechazados = 0, sinResp = 0, pendientes = 0;
    for (const r of filtrados) {
      const e = efectivo(r, plazo);
      if (e === "ACEPTADO") aceptados++;
      else if (e === "RECHAZADO") rechazados++;
      else if (e === "SIN_RESPUESTA") sinResp++;
      else pendientes++;
    }
    const emitidos = filtrados.length;
    return { emitidos, aceptados, rechazados, sinResp, pendientes, conversion: emitidos ? (aceptados / emitidos) * 100 : 0 };
  }, [filtrados, plazo]);

  const rankingMotivos = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtrados) {
      if (efectivo(r, plazo) !== "RECHAZADO") continue;
      const nombre = r.resultado_motivo_id ? (motivos[r.resultado_motivo_id] || "Otro / sin catálogo") : "Sin motivo registrado";
      m.set(nombre, (m.get(nombre) || 0) + 1);
    }
    return [...m.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n);
  }, [filtrados, plazo, motivos]);

  const porOS = useMemo(() => agrupar(filtrados, plazo, (r) => r.os || "Sin obra social").slice(0, 12), [filtrados, plazo]);
  const porPrestador = useMemo(() => agrupar(filtrados, plazo, (r) => prettyCirujano(r.cirujano)).slice(0, 12), [filtrados, plazo]);
  const porMonto = useMemo(() => {
    return BUCKETS.map((b) => {
      const rs = filtrados.filter((r) => { const v = Number(r.total_final) || 0; return v >= b.min && v < b.max; });
      const aceptados = rs.filter((r) => efectivo(r, plazo) === "ACEPTADO").length;
      return { clave: b.label, emitidos: rs.length, aceptados };
    });
  }, [filtrados, plazo]);

  const maxMotivo = rankingMotivos[0]?.n || 1;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex items-center justify-center">
        <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Resultados comerciales</h2>
          <p className="text-xs text-gray-500">Sobre presupuestos emitidos (entregados y practicados). Vencido = entregado sin respuesta &gt; {plazo} días.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs">
            <span className="block text-gray-500 mb-1">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <span className="block text-gray-500 mb-1">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          {(desde || hasta) && (
            <button onClick={() => { setDesde(""); setHasta(""); }} className="text-xs text-gray-500 hover:text-gray-700 underline pb-1.5">Limpiar</button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Emitidos", value: fmtInt(resumen.emitidos), color: "bg-slate-50 text-slate-700" },
          { label: "Aceptados", value: fmtInt(resumen.aceptados), color: "bg-green-50 text-green-700" },
          { label: "Tasa de conversión", value: pct(resumen.conversion), color: "bg-indigo-50 text-indigo-700" },
          { label: "Rechazados", value: fmtInt(resumen.rechazados), color: "bg-red-50 text-red-700" },
          { label: "Sin respuesta", value: fmtInt(resumen.sinResp), color: "bg-gray-100 text-gray-600" },
          { label: "Pendientes", value: fmtInt(resumen.pendientes), color: "bg-amber-50 text-amber-700" },
        ].map((k, i) => (
          <div key={i} className={`rounded-xl p-3 text-center ${k.color}`}>
            <p className="text-[11px] font-medium uppercase tracking-wider opacity-70 mb-1">{k.label}</p>
            <p className="text-lg font-bold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Motivos de rechazo */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Motivos de rechazo</h3>
        {rankingMotivos.length === 0 ? (
          <p className="text-sm text-gray-400">Sin rechazos en el período.</p>
        ) : (
          <div className="space-y-1.5">
            {rankingMotivos.map((m) => (
              <div key={m.nombre} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-56 flex-shrink-0 truncate" title={m.nombre}>{m.nombre}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-red-400" style={{ width: `${(m.n / maxMotivo) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-8 text-right">{m.n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cruces */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TablaCruce titulo="Por obra social" filas={porOS} />
        <TablaCruce titulo="Por prestador" filas={porPrestador} />
        <TablaCruce titulo="Por rango de monto" filas={porMonto} />
      </div>
    </div>
  );
}

// ── Tabla de cruce (emitidos / aceptados / conversión) ──
function TablaCruce({ titulo, filas }: { titulo: string; filas: Agrupado[] }) {
  const datos = filas;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{titulo}</h4>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left px-3 py-1.5 font-medium">&nbsp;</th>
              <th className="text-right px-2 py-1.5 font-medium">Emit.</th>
              <th className="text-right px-2 py-1.5 font-medium">Acept.</th>
              <th className="text-right px-3 py-1.5 font-medium">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {datos.filter((f) => f.emitidos > 0).map((f) => {
              const conv = f.emitidos ? (f.aceptados / f.emitidos) * 100 : 0;
              return (
                <tr key={f.clave} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-700 truncate max-w-[130px]" title={f.clave}>{f.clave}</td>
                  <td className="px-2 py-1.5 text-right text-gray-600">{fmtInt(f.emitidos)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700 font-medium">{fmtInt(f.aceptados)}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${conv >= 50 ? "text-green-700" : conv >= 25 ? "text-amber-600" : "text-red-600"}`}>{pct(conv)}</td>
                </tr>
              );
            })}
            {datos.filter((f) => f.emitidos > 0).length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Sin datos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
