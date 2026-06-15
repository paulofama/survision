import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "@shared/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

type EstadoPresupuesto = "borrador" | "entregado" | "practicado" | "cancelado";

interface Presupuesto {
  id: string;
  numero_presupuesto: string;
  fecha_creacion: string;
  fecha_modificacion: string | null;
  paciente_nombre: string;
  paciente_apellido: string;
  paciente_documento: string;
  prestacion_codigo: string;
  prestacion_descripcion: string;
  cirujano: string;
  administrativa: string;
  monto_usd: number | string;
  total_final: number | string;
  estado: EstadoPresupuesto;
  fecha_entrega: string | null;
  fecha_practica: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos_completos: any;
}

type ToastType = "success" | "error" | "warning";

interface ToastData {
  message: string;
  type: ToastType;
  key: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://eawtvwuayahbldzjzeer.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhd3R2d3VheWFoYmxkemp6ZWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODc1OTksImV4cCI6MjA3OTU2MzU5OX0.Fo3kChA3Ozv3XGW19DimlZ_8uH-v6LWd2SvTXZfkIaE";

const ITEMS_PER_PAGE = 20;

const ESTADOS: Record<
  EstadoPresupuesto,
  { label: string; bg: string; text: string; dot: string }
> = {
  borrador:   { label: "Borrador",   bg: "bg-gray-100",   text: "text-gray-700",  dot: "bg-gray-400"   },
  entregado:  { label: "Entregado",  bg: "bg-blue-100",   text: "text-blue-700",  dot: "bg-blue-500"   },
  practicado: { label: "Practicado", bg: "bg-green-100",  text: "text-green-700", dot: "bg-green-500"  },
  cancelado:  { label: "Cancelado",  bg: "bg-red-100",    text: "text-red-600",   dot: "bg-red-400"    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthHeaders = async (extraPrefer?: string): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: extraPrefer ?? "return=representation",
  };
};

const fmtARS = (v: number): string => {
  if (isNaN(v) || v == null) v = 0;
  const [ent, dec] = v.toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

const fmtFecha = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${dt.getFullYear()}`;
  } catch {
    return "—";
  }
};

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  const colors = {
    success: "bg-green-600",
    error:   "bg-red-600",
    warning: "bg-amber-500",
  };
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-xl ${colors[data.type]}`}
    >
      <span>{data.message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusquedaPresupuestosPage() {
  const navigate = useNavigate();

  // ── State ──
  const [data, setData]         = useState<Presupuesto[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [searchTerm, setSearchTerm]       = useState("");
  const [filterEstado, setFilterEstado]   = useState<EstadoPresupuesto | "">("");
  const [toast, setToast]       = useState<ToastData | null>(null);
  const searchRef               = useRef<HTMLInputElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // ── Toast helper ──
  const notify = (message: string, type: ToastType = "success") => {
    setToast({ message, type, key: Date.now() });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Load data ──
  const loadData = async (
    pg   = 1,
    term = searchTerm,
    est  = filterEstado,
  ) => {
    setLoading(true);
    try {
      const parts: string[] = ["order=fecha_creacion.desc"];
      const t = term.trim();
      if (t.length >= 2) {
        parts.push(
          `or=(paciente_apellido.ilike.*${t}*,paciente_nombre.ilike.*${t}*,paciente_documento.ilike.*${t}*,numero_presupuesto.ilike.*${t}*)`
        );
      }
      if (est) parts.push(`estado=eq.${est}`);

      const query   = parts.join("&");
      const from    = (pg - 1) * ITEMS_PER_PAGE;
      const to      = from + ITEMS_PER_PAGE - 1;
      const headers = await getAuthHeaders("count=exact");

      const r = await fetch(`${SUPABASE_URL}/rest/v1/presupuestos?${query}`, {
        headers: { ...headers, Range: `${from}-${to}` },
      });
      if (!r.ok) throw new Error(r.statusText);

      const contentRange = r.headers.get("content-range");
      const totalCount   = contentRange ? parseInt(contentRange.split("/")[1]) || 0 : 0;
      const rows: Presupuesto[] = await r.json();

      setData(rows);
      setTotal(totalCount);
      setPage(pg);
    } catch (e) {
      notify("Error cargando presupuestos: " + (e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Cambiar estado ──
  const cambiarEstado = async (id: string, nuevoEstado: EstadoPresupuesto) => {
    try {
      const updates: Record<string, unknown> = { estado: nuevoEstado };
      if (nuevoEstado === "entregado")  updates.fecha_entrega  = new Date().toISOString().split("T")[0];
      if (nuevoEstado === "practicado") updates.fecha_practica = new Date().toISOString().split("T")[0];

      const headers = await getAuthHeaders();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/presupuestos?id=eq.${id}`, {
        method:  "PATCH",
        headers,
        body:    JSON.stringify(updates),
      });
      if (!r.ok) throw new Error(r.statusText);

      notify(`Estado cambiado a ${ESTADOS[nuevoEstado]?.label}`, "success");
      setTimeout(() => loadData(page), 300);
    } catch (e) {
      notify("Error: " + (e as Error).message, "error");
    }
  };

  // ── Abrir para editar ──
  // Navega a /presupuestos pasando el objeto completo en location.state.
  // El Presupuestador.tsx lee location.state?.presupuesto al montar y lo carga.
  const abrirPresupuesto = (p: Presupuesto) => {
    navigate("/presupuestos", { state: { presupuesto: p } });
  };

  // ── Cargar al montar ──
  useEffect(() => {
    loadData(1);
    searchRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce en búsqueda y filtro ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(1, searchTerm, filterEstado), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, filterEstado]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear ──
  const limpiarFiltros = () => {
    setSearchTerm("");
    setFilterEstado("");
    loadData(1, "", "");
  };

  const hayFiltros = searchTerm !== "" || filterEstado !== "";

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 min-h-screen">

      {/* Header de la página */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Búsqueda de Presupuestos</h1>
              <p className="text-sm text-gray-500">Consultá, editá y gestioná el estado de cada presupuesto</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/presupuestos")}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo presupuesto
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-4">

        {/* ── Filtros ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">

            {/* Buscador */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar por apellido, nombre, DNI o número de presupuesto..."
                className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              )}
            </div>

            {/* Filtro estado */}
            <select
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[170px]"
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as EstadoPresupuesto | "")}
            >
              <option value="">Todos los estados</option>
              <option value="borrador">📝 Borrador</option>
              <option value="entregado">📤 Entregado</option>
              <option value="practicado">✅ Practicado</option>
              <option value="cancelado">❌ Cancelado</option>
            </select>

            {/* Limpiar */}
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* ── Tabla ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Header de tabla */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-5 py-3 flex items-center justify-between">
            <span className="text-white font-semibold text-sm">Presupuestos registrados</span>
            <div className="flex items-center gap-3">
              {loading && !data.length && (
                <div className="w-4 h-4 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
              )}
              <span className="text-xs bg-white/20 text-white px-3 py-1 rounded-full">
                {total.toLocaleString("es-AR")} resultado{total !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Loading inicial */}
          {loading && data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">Cargando presupuestos...</p>
            </div>

          /* Sin resultados */
          ) : !loading && data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No se encontraron presupuestos</p>
              {hayFiltros && (
                <button onClick={limpiarFiltros} className="text-blue-600 hover:underline text-sm">
                  Limpiar filtros
                </button>
              )}
            </div>

          /* Tabla con datos */
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nº</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">DNI</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prestación</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cirujano</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((p) => {
                    const est        = ESTADOS[p.estado] ?? ESTADOS.borrador;
                    const totalFinal = parseFloat(String(p.total_final)) || 0;
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                        onClick={() => abrirPresupuesto(p)}
                      >
                        {/* Nº */}
                        <td className="px-4 py-3 font-mono text-blue-600 font-semibold text-xs whitespace-nowrap">
                          {p.numero_presupuesto}
                        </td>

                        {/* Fecha */}
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {fmtFecha(p.fecha_creacion)}
                        </td>

                        {/* Paciente */}
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                          {p.paciente_apellido}, {p.paciente_nombre}
                        </td>

                        {/* DNI */}
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {p.paciente_documento || "—"}
                        </td>

                        {/* Prestación */}
                        <td
                          className="px-4 py-3 text-gray-600 text-xs max-w-[220px] truncate"
                          title={p.prestacion_descripcion}
                        >
                          {p.prestacion_descripcion || p.prestacion_codigo || "—"}
                        </td>

                        {/* Cirujano */}
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {p.cirujano || "—"}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 text-xs whitespace-nowrap">
                          {totalFinal > 0 ? `$ ${fmtARS(totalFinal)}` : "—"}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${est.bg} ${est.text}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />
                            {est.label}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td
                          className="px-4 py-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1">

                            {/* Abrir / Editar */}
                            <button
                              onClick={() => abrirPresupuesto(p)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm"
                              title="Abrir presupuesto para editar"
                            >
                              Abrir
                            </button>

                            {/* Cambios de estado rápidos */}
                            {p.estado === "borrador" && (
                              <button
                                onClick={() => cambiarEstado(p.id, "entregado")}
                                className="text-blue-500 hover:bg-blue-100 p-1.5 rounded-lg transition-colors"
                                title="Marcar como entregado"
                              >
                                📤
                              </button>
                            )}
                            {p.estado === "entregado" && (
                              <button
                                onClick={() => cambiarEstado(p.id, "practicado")}
                                className="text-green-500 hover:bg-green-100 p-1.5 rounded-lg transition-colors"
                                title="Marcar como practicado"
                              >
                                ✅
                              </button>
                            )}
                            {p.estado !== "cancelado" && (
                              <button
                                onClick={() => cambiarEstado(p.id, "cancelado")}
                                className="text-red-400 hover:bg-red-100 p-1.5 rounded-lg transition-colors"
                                title="Cancelar presupuesto"
                              >
                                ❌
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Paginación ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => loadData(page - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ← Anterior
                </button>

                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pg: number;
                  if (totalPages <= 7)            pg = i + 1;
                  else if (page <= 4)             pg = i + 1;
                  else if (page >= totalPages - 3) pg = totalPages - 6 + i;
                  else                             pg = page - 3 + i;
                  return (
                    <button
                      key={pg}
                      onClick={() => loadData(pg)}
                      className={`w-9 h-9 text-sm rounded-lg font-medium transition-colors ${
                        pg === page
                          ? "bg-blue-600 text-white shadow-sm"
                          : "border border-gray-300 hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      {pg}
                    </button>
                  );
                })}

                <button
                  disabled={page >= totalPages}
                  onClick={() => loadData(page + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast data={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
