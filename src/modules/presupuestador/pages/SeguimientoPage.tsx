// ============================================================
// Cola de Seguimiento telefónico de presupuestos
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Lista los presupuestos que hay que llamar hoy (derivado al vuelo del circuito).
// Cada uno: datos del llamado + acción (Llamar / WhatsApp). Registra todo con el
// usuario logueado. No modifica el resultado comercial.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { PhoneCall, MessageCircle, RefreshCw, Bell } from "lucide-react";
import { useAuth } from "@shared/context/AuthContext";
import { sbGet, sbInsert, sbUpsert } from "../utils/circuito";
import {
  Seguimiento, PresMin, EstadoCola, ESTADO_CONTACTO_META,
  derivarSeguimiento, aplicarLlamada, urlWhatsApp, mensajeWhatsApp,
} from "../utils/seguimiento";
import LlamadaModal from "../components/LlamadaModal";

interface Pres extends PresMin {
  numero_presupuesto: string;
  paciente_apellido: string;
  paciente_nombre: string;
  paciente_documento: string;
  total_final: number | string | null;
}

interface Item { p: Pres; seg: Seguimiento | null; cola: EstadoCola; }

const fmtARS = (v: number) => { const [e, d] = (v || 0).toFixed(2).split("."); return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`; };
const fmtFecha = (d: string | null | undefined) => {
  if (!d) return "—";
  const [a, m, dd] = String(d).slice(0, 10).split("-");
  return `${dd}/${m}/${a}`;
};

const SELECT_PRES = "id,numero_presupuesto,paciente_apellido,paciente_nombre,paciente_documento,prestacion_descripcion,total_final,fecha_entrega,fecha_creacion,telefono,estado";

export default function SeguimientoPage() {
  const { usuario } = useAuth();
  const username = usuario?.username ?? null;
  const operador = usuario?.nombre_completo || usuario?.username || "el equipo";

  const [pres, setPres] = useState<Pres[]>([]);
  const [segMap, setSegMap] = useState<Map<string, Seguimiento>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [llamando, setLlamando] = useState<Item | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const acc: Pres[] = [];
      let from = 0;
      for (;;) {
        const page = await sbGet<Pres>(`presupuestos?estado=eq.entregado&select=${SELECT_PRES}&order=fecha_entrega&limit=1000&offset=${from}`);
        acc.push(...page);
        if (page.length < 1000) break;
        from += 1000;
      }
      const segs = await sbGet<Seguimiento>("presupuestos_seguimiento?select=*");
      setPres(acc);
      setSegMap(new Map(segs.map((s) => [s.presupuesto_id, s])));
    } catch (e) {
      setError((e as Error).message || "No se pudieron cargar los seguimientos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cola = useMemo(() => {
    const items: Item[] = [];
    for (const p of pres) {
      const seg = segMap.get(p.id) || null;
      const c = derivarSeguimiento(p, seg);
      if (c.enCola && (c.accion === "llamar" || c.accion === "whatsapp")) items.push({ p, seg, cola: c });
    }
    // los que hay que llamar primero, ordenados por fecha de entrega
    return items.sort((a, b) => String(a.p.fecha_entrega || "").localeCompare(String(b.p.fecha_entrega || "")));
  }, [pres, segMap]);

  const enviarWhatsApp = async (it: Item) => {
    setBusy(it.p.id); setError("");
    try {
      const url = urlWhatsApp(it.p, operador);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      await sbInsert("presupuestos_seguimiento_llamadas", {
        presupuesto_id: it.p.id, usuario: username, canal: "whatsapp", resultado: "whatsapp_enviado",
        numero: it.p.telefono, texto: mensajeWhatsApp(it.p, operador),
      });
      await sbUpsert("presupuestos_seguimiento", {
        ...aplicarLlamada(it.seg, it.p.id, "whatsapp_enviado"),
        updated_by: username, ...(it.seg ? {} : { created_by: username }),
      }, "presupuesto_id", "merge");
      cargar();
    } catch (e) {
      setError((e as Error).message || "No se pudo registrar el WhatsApp");
    } finally { setBusy(null); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 min-h-screen">
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
              <Bell className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Seguimiento de Presupuestos</h1>
              <p className="text-sm text-gray-500">Cola de llamados de hoy · el resultado del presupuesto no se modifica desde acá</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              {cola.length} llamado{cola.length !== 1 ? "s" : ""} pendiente{cola.length !== 1 ? "s" : ""}
            </span>
            <button onClick={cargar} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6">
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading && cola.length === 0 ? (
            <div className="flex justify-center py-16"><div className="w-9 h-9 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : cola.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No hay llamados pendientes por ahora.</div>
          ) : (
            <div className="overflow-auto max-h-[72vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 [&>tr>th]:bg-gray-50">
                  <tr className="bg-gray-50 border-b border-gray-200 shadow-sm">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrega</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Práctica</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Teléfono</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cola.map(({ p, seg, cola: c }) => {
                    const meta = ESTADO_CONTACTO_META[c.estado];
                    return (
                      <tr key={p.id} className="even:bg-gray-50/60 hover:bg-blue-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap align-middle">{fmtFecha(p.fecha_entrega)}</td>
                        <td className="px-4 py-3 align-middle">
                          <p className="font-medium text-gray-800">{p.paciente_apellido}, {p.paciente_nombre}</p>
                          <p className="text-xs text-gray-400">DNI {p.paciente_documento || "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px] truncate align-middle" title={p.prestacion_descripcion || ""}>{p.prestacion_descripcion || "—"}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 text-xs whitespace-nowrap align-middle">$ {fmtARS(parseFloat(String(p.total_final)) || 0)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap align-middle">{p.telefono || <span className="text-red-400">sin teléfono</span>}</td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${meta.bg} ${meta.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          <p className="text-[11px] text-gray-400 mt-1">Ronda {c.ronda} · {c.intentos} intento{c.intentos !== 1 ? "s" : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          {c.accion === "whatsapp" ? (
                            <button
                              onClick={() => enviarWhatsApp({ p, seg, cola: c })}
                              disabled={!p.telefono || busy === p.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40"
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> {busy === p.id ? "…" : "WhatsApp"}
                            </button>
                          ) : (
                            <button
                              onClick={() => setLlamando({ p, seg, cola: c })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              <PhoneCall className="h-3.5 w-3.5" /> Llamar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {llamando && (
        <LlamadaModal
          presupuesto={llamando.p as any}
          seguimiento={llamando.seg}
          username={username}
          onClose={() => setLlamando(null)}
          onDone={() => { setLlamando(null); cargar(); }}
        />
      )}
    </div>
  );
}
