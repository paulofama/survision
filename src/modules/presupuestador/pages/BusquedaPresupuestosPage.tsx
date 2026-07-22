import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Send, CheckCircle2, Ban, type LucideIcon } from "lucide-react";
import supabase, { ENV_CONFIG } from "@shared/lib/supabase";
import { useAuth } from "@shared/context/AuthContext";
import {
  ResultadoComercial,
  MotivoResultado,
  RESULTADO_META,
  esEmitido,
  estaVencido,
  cutoffVencidos,
} from "../utils/resultado";
import { Convenio, Lio, sbGet } from "../utils/circuito";
import AceptacionModal from "../components/AceptacionModal";
import CircuitoPanel from "../components/CircuitoPanel";
import MatchesRevisionModal from "../components/MatchesRevisionModal";
import HistorialSeguimientoModal from "../components/HistorialSeguimientoModal";
import { derivarSeguimiento, ESTADO_CONTACTO_META, Seguimiento } from "../utils/seguimiento";

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
  // Resultado comercial (circuito post-aceptación)
  resultado: ResultadoComercial | null;
  resultado_motivo_id: string | null;
  resultado_observaciones: string | null;
  fecha_resultado: string | null;
  resultado_por: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos_completos: any;
  // Embed 1:1 del seguimiento (o null si no hay fila).
  seg?: Seguimiento | Seguimiento[] | null;
}

type ToastType = "success" | "error" | "warning";

interface ToastData {
  message: string;
  type: ToastType;
  key: number;
}

// Payload que devuelve el modal según el modo.
interface ResultadoPayload {
  motivoId?: string | null;
  observaciones?: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPABASE_URL = ENV_CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV_CONFIG.SUPABASE_ANON_KEY;

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

// ─── Modal de resultado (Aceptar / Rechazar) ──────────────────────────────────

function ResultadoModal({
  modo,
  presupuesto,
  motivos,
  onClose,
  onConfirm,
}: {
  modo: "aceptar" | "rechazar";
  presupuesto: Presupuesto;
  motivos: MotivoResultado[];
  onClose: () => void;
  onConfirm: (payload: ResultadoPayload) => void;
}) {
  const [motivoId, setMotivoId] = useState<string>("");
  const [obs, setObs] = useState<string>("");

  const motivoSel = motivos.find((m) => m.id === motivoId) || null;
  const exigeObs = !!motivoSel?.exige_observacion;
  const puedeConfirmar =
    modo === "aceptar" || (!!motivoId && (!exigeObs || obs.trim().length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-5 py-4 border-b ${modo === "aceptar" ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
          <h3 className="font-bold text-gray-900">
            {modo === "aceptar" ? "Registrar ACEPTADO" : "Registrar RECHAZADO"}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {presupuesto.numero_presupuesto} — {presupuesto.paciente_apellido}, {presupuesto.paciente_nombre}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {modo === "aceptar" ? (
            <p className="text-sm text-gray-600">
              Vas a registrar este presupuesto como <b>ACEPTADO</b>. El circuito de aceptación
              (cobertura, LIO, fecha y ojo) se completa en la ficha del presupuesto (próxima fase).
            </p>
          ) : (
            <>
              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">Motivo del rechazo *</span>
                <select
                  value={motivoId}
                  onChange={(e) => setMotivoId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <option value="">Seleccioná un motivo…</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block text-gray-600 mb-1 font-medium">
                  Observaciones {exigeObs ? "*" : "(opcional)"}
                </span>
                <textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  rows={3}
                  placeholder={exigeObs ? "Requerido para este motivo…" : "Detalle opcional…"}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </label>
            </>
          )}
        </div>

        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            disabled={!puedeConfirmar}
            onClick={() => onConfirm(modo === "aceptar" ? {} : { motivoId, observaciones: obs.trim() || null })}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 ${
              modo === "aceptar" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de confirmación genérico (revertir / vencidos masivos) ─────────────

function ConfirmModal({
  titulo,
  mensaje,
  confirmLabel = "Confirmar",
  danger = false,
  onClose,
  onConfirm,
}: {
  titulo: string;
  mensaje: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-bold text-gray-900">{titulo}</h3>
          <p className="text-sm text-gray-600 mt-2">{mensaje}</p>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Celda de Resultado (badge + acciones por fila) ───────────────────────────

// Botón de acción operativa (ícono, cuadrado consistente 32px).
function TransicionBtn({ onClick, title, color, Icon }: { onClick: () => void; title: string; color: "blue" | "green" | "red"; Icon: LucideIcon }) {
  const hover = {
    blue: "hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200",
    green: "hover:bg-green-50 hover:text-green-600 hover:border-green-200",
    red: "hover:bg-red-50 hover:text-red-600 hover:border-red-200",
  }[color];
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 transition-colors ${hover}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// Badge de estado de contacto (seguimiento). Solo aplica a entregados; abre el historial al clic.
function CeldaContacto({ p, onHistorial }: { p: Presupuesto; onHistorial: () => void }) {
  if (p.estado !== "entregado") return <span className="text-gray-300 text-xs">—</span>;
  const seg = Array.isArray(p.seg) ? (p.seg[0] ?? null) : (p.seg ?? null);
  const { estado } = derivarSeguimiento(p, seg);
  const meta = ESTADO_CONTACTO_META[estado];
  return (
    <button
      onClick={onHistorial}
      title="Ver historial de seguimiento"
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition ${meta.bg} ${meta.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </button>
  );
}

function CeldaResultado({
  p,
  plazoDias,
  onAceptar,
  onRechazar,
  onSinRespuesta,
  onRevertir,
  onCircuito,
}: {
  p: Presupuesto;
  plazoDias: number;
  onAceptar: () => void;
  onRechazar: () => void;
  onSinRespuesta: () => void;
  onRevertir: () => void;
  onCircuito: () => void;
}) {
  // Fuera del circuito comercial.
  if (!esEmitido(p.estado)) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  // Resultado ya registrado.
  if (p.resultado) {
    const meta = RESULTADO_META[p.resultado];
    return (
      <div className="flex flex-col items-center gap-1">
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${meta.bg} ${meta.text}`}
          title={[
            p.resultado_observaciones ? `Obs.: ${p.resultado_observaciones}` : "",
            p.fecha_resultado ? `Registrado: ${fmtFecha(p.fecha_resultado)}` : "",
            p.resultado_por ? `Por: ${p.resultado_por}` : "",
          ].filter(Boolean).join("\n")}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <div className="flex items-center gap-1.5">
          {p.resultado === "ACEPTADO" && (
            <button onClick={onCircuito} className="px-2 py-0.5 text-[11px] font-medium rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
              Circuito
            </button>
          )}
          <button onClick={onRevertir} className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline">
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  // 'practicado' sin resultado => ACEPTADO implícito (ya se operó).
  if (p.estado === "practicado") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600" title="Ya se operó: aceptado implícito">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Aceptado (practicado)
      </span>
    );
  }

  // 'entregado' sin resultado => pendiente (o vencido).
  const vencido = estaVencido(p.estado, p.resultado, p.fecha_creacion, plazoDias);
  return (
    <div className="flex flex-col items-center gap-1.5">
      {vencido && (
        <span className="text-[11px] font-medium text-amber-600">
          Sin respuesta (vencido)
        </span>
      )}
      <div className="inline-flex items-center gap-1.5">
        <button onClick={onAceptar} className="px-2.5 py-1 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors">
          Aceptar
        </button>
        <button onClick={onRechazar} className="px-2.5 py-1 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors">
          Rechazar
        </button>
        {vencido && (
          <button onClick={onSinRespuesta} title="Marcar como Sin respuesta" className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
            Sin resp.
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusquedaPresupuestosPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const username = usuario?.username ?? null;

  // ── State ──
  const [data, setData]         = useState<Presupuesto[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [searchTerm, setSearchTerm]       = useState("");
  const [filterEstado, setFilterEstado]   = useState<EstadoPresupuesto | "">("");
  const [filterResultado, setFilterResultado] = useState<string>(""); // "" | pendiente | ACEPTADO | RECHAZADO | SIN_RESPUESTA | vencido
  const [toast, setToast]       = useState<ToastData | null>(null);
  const searchRef               = useRef<HTMLInputElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Catálogos / config del circuito
  const [motivos, setMotivos]   = useState<MotivoResultado[]>([]);
  const [plazoDias, setPlazoDias] = useState<number>(45);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [lios, setLios] = useState<Lio[]>([]);

  // Modales
  const [modal, setModal] = useState<{ modo: "aceptar" | "rechazar"; p: Presupuesto } | null>(null);
  const [aceptModal, setAceptModal] = useState<Presupuesto | null>(null);
  const [circuito, setCircuito] = useState<Presupuesto | null>(null);
  const [revert, setRevert] = useState<Presupuesto | null>(null);
  const [bulk, setBulk] = useState<{ count: number } | null>(null);
  const [matchesCount, setMatchesCount] = useState(0);
  const [showMatches, setShowMatches] = useState(false);
  const [filterContacto, setFilterContacto] = useState<string>(""); // "" | pendiente | en_seguimiento | contactado | contactado_whatsapp | sin_respuesta
  const [historial, setHistorial] = useState<Presupuesto | null>(null);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // ── Toast helper ──
  const notify = (message: string, type: ToastType = "success") => {
    setToast({ message, type, key: Date.now() });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Cargar catálogos (motivos de rechazo + plazo) ──
  const loadCatalogos = async () => {
    try {
      const headers = await getAuthHeaders();
      const [rM, rC] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/presupuestos_motivos_resultado?tipo=eq.RECHAZADO&activo=eq.true&order=orden&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/presupuestos_config?clave=eq.plazo_sin_respuesta_dias&select=valor`, { headers }),
      ]);
      if (rM.ok) setMotivos(await rM.json());
      if (rC.ok) {
        const c = await rC.json();
        const n = parseInt(c?.[0]?.valor, 10);
        if (Number.isFinite(n) && n > 0) setPlazoDias(n);
      }
      // Catálogos del circuito de aceptación (convenios + LIOs).
      const [cv, li] = await Promise.all([
        sbGet<Convenio>("presupuestos_convenios?activo=eq.true&order=orden&select=*"),
        sbGet<Lio>("presupuestos_lios?activo=eq.true&order=orden&select=*"),
      ]);
      setConvenios(cv);
      setLios(li);
    } catch {
      // Silencioso: si falla, se usa el default (45) y sin motivos (se avisa al rechazar).
    }
  };

  // ── Load data ──
  const loadData = async (
    pg   = 1,
    term = searchTerm,
    est  = filterEstado,
    res  = filterResultado,
    con  = filterContacto,
  ) => {
    setLoading(true);
    try {
      // Embed 1:1 del seguimiento; inner cuando se filtra por un estado persistido.
      const embedInner = !!con && con !== "pendiente";
      const embed = `seg:presupuestos_seguimiento${embedInner ? "!inner" : ""}(estado_contacto,ronda,intentos_ronda,whatsapp_enviado_at,rellamada_at,cerrado_at)`;
      const parts: string[] = ["order=fecha_creacion.desc", `select=*,${embed}`];
      const t = term.trim();
      if (t.length >= 2) {
        parts.push(
          `or=(paciente_apellido.ilike.*${t}*,paciente_nombre.ilike.*${t}*,paciente_documento.ilike.*${t}*,numero_presupuesto.ilike.*${t}*)`
        );
      }
      if (est) parts.push(`estado=eq.${est}`);

      // Filtro por resultado comercial.
      if (res === "pendiente") {
        parts.push("resultado=is.null", "estado=in.(entregado,practicado)");
      } else if (res === "vencido") {
        parts.push("resultado=is.null", "estado=eq.entregado", `fecha_creacion=lt.${cutoffVencidos(plazoDias)}`);
      } else if (res) {
        parts.push(`resultado=eq.${res}`);
      }

      // Filtro por estado de contacto (seguimiento).
      if (con === "pendiente") { parts.push("estado=eq.entregado", "seg=is.null"); }
      else if (con) { parts.push(`seg.estado_contacto=eq.${con}`); }

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

  // ── Cambiar estado operativo ──
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

  // ── Registrar resultado comercial ──
  const patchResultado = async (id: string, body: Record<string, unknown>, msg: string) => {
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/presupuestos?id=eq.${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(r.statusText);
      notify(msg, "success");
      setTimeout(() => loadData(page), 250);
    } catch (e) {
      notify("Error: " + (e as Error).message, "error");
    }
  };

  // El modal 'aceptar' quedó reemplazado por AceptacionModal (captura la rama);
  // este confirmarModal maneja solo el RECHAZO.
  const confirmarModal = (payload: ResultadoPayload) => {
    if (!modal) return;
    patchResultado(modal.p.id, {
      resultado: "RECHAZADO",
      resultado_motivo_id: payload.motivoId ?? null,
      resultado_observaciones: payload.observaciones ?? null,
      fecha_resultado: new Date().toISOString(),
      resultado_por: username,
    }, "Presupuesto registrado como RECHAZADO");
    setModal(null);
  };

  const marcarSinRespuesta = (p: Presupuesto) => {
    patchResultado(p.id, {
      resultado: "SIN_RESPUESTA",
      resultado_motivo_id: null,
      resultado_observaciones: null,
      fecha_resultado: new Date().toISOString(),
      resultado_por: username,
    }, "Presupuesto marcado como Sin respuesta");
  };

  const confirmarRevertir = () => {
    if (!revert) return;
    patchResultado(revert.id, {
      resultado: null,
      resultado_motivo_id: null,
      resultado_observaciones: null,
      fecha_resultado: null,
      resultado_por: null,
    }, "Resultado revertido a Pendiente");
    setRevert(null);
  };

  // ── Confirmación masiva de vencidos ──
  const abrirBulk = async () => {
    try {
      const headers = await getAuthHeaders("count=exact");
      const filtro = `estado=eq.entregado&resultado=is.null&fecha_creacion=lt.${cutoffVencidos(plazoDias)}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/presupuestos?${filtro}&select=id`, {
        headers: { ...headers, Range: "0-0" },
      });
      const contentRange = r.headers.get("content-range");
      const count = contentRange ? parseInt(contentRange.split("/")[1]) || 0 : 0;
      if (count === 0) { notify("No hay presupuestos vencidos sin respuesta.", "warning"); return; }
      setBulk({ count });
    } catch (e) {
      notify("Error: " + (e as Error).message, "error");
    }
  };

  const confirmarBulk = async () => {
    try {
      const headers = await getAuthHeaders("return=minimal");
      const filtro = `estado=eq.entregado&resultado=is.null&fecha_creacion=lt.${cutoffVencidos(plazoDias)}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/presupuestos?${filtro}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          resultado: "SIN_RESPUESTA",
          fecha_resultado: new Date().toISOString(),
          resultado_por: username,
        }),
      });
      if (!r.ok) throw new Error(r.statusText);
      notify(`${bulk?.count ?? 0} presupuesto(s) marcados como Sin respuesta`, "success");
      setBulk(null);
      setTimeout(() => loadData(page), 300);
    } catch (e) {
      notify("Error: " + (e as Error).message, "error");
      setBulk(null);
    }
  };

  // ── Abrir para editar ──
  const abrirPresupuesto = (p: Presupuesto) => {
    navigate("/presupuestos", { state: { presupuesto: p } });
  };

  // ── Contador de matches pendientes de revisión (presupuestos con sugeridos) ──
  const loadMatchesCount = async () => {
    try {
      const rows = await sbGet<{ presupuesto_id: string }>("presupuestos_practica_match?estado=eq.sugerido&select=presupuesto_id");
      setMatchesCount(new Set(rows.map((r) => r.presupuesto_id)).size);
    } catch { /* silencioso */ }
  };

  // ── Cargar al montar ──
  useEffect(() => {
    loadCatalogos();
    loadData(1);
    loadMatchesCount();
    searchRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce en búsqueda y filtros ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(1, searchTerm, filterEstado, filterResultado, filterContacto), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, filterEstado, filterResultado, filterContacto]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear ──
  const limpiarFiltros = () => {
    setSearchTerm("");
    setFilterEstado("");
    setFilterResultado("");
    setFilterContacto("");
    loadData(1, "", "", "", "");
  };

  const hayFiltros = searchTerm !== "" || filterEstado !== "" || filterResultado !== "" || filterContacto !== "";

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 min-h-screen">

      {/* Header de la página */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Búsqueda de Presupuestos</h1>
              <p className="text-sm text-gray-500">Consultá, editá y registrá el resultado de cada presupuesto</p>
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

      <div className="max-w-[1800px] mx-auto p-6 space-y-4">

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
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as EstadoPresupuesto | "")}
            >
              <option value="">Todos los estados</option>
              <option value="borrador">📝 Borrador</option>
              <option value="entregado">📤 Entregado</option>
              <option value="practicado">✅ Practicado</option>
              <option value="cancelado">❌ Cancelado</option>
            </select>

            {/* Filtro resultado comercial */}
            <select
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
              value={filterResultado}
              onChange={(e) => setFilterResultado(e.target.value)}
            >
              <option value="">Todos los resultados</option>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="vencido">⚠️ Sin respuesta (vencido)</option>
              <option value="ACEPTADO">✅ Aceptado</option>
              <option value="RECHAZADO">✖️ Rechazado</option>
              <option value="SIN_RESPUESTA">➖ Sin respuesta</option>
            </select>

            {/* Filtro estado de contacto (seguimiento) */}
            <select
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[190px]"
              value={filterContacto}
              onChange={(e) => setFilterContacto(e.target.value)}
            >
              <option value="">Todos (contacto)</option>
              <option value="pendiente">🟡 Pendiente de contacto</option>
              <option value="en_seguimiento">🔵 En seguimiento</option>
              <option value="contactado_whatsapp">🟢 Contactado por WhatsApp</option>
              <option value="contactado">✅ Contactado</option>
              <option value="sin_respuesta">➖ Sin respuesta</option>
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

          {/* Acción masiva: confirmar vencidos */}
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-gray-400">
              Vencido = entregado sin respuesta hace más de {plazoDias} días.
            </p>
            <div className="flex items-center gap-2">
              {matchesCount > 0 && (
                <button
                  onClick={() => setShowMatches(true)}
                  className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Matches a confirmar ({matchesCount})
                </button>
              )}
              <button
                onClick={abrirBulk}
                className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                Confirmar vencidos como “Sin respuesta”
              </button>
            </div>
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
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 [&>tr>th]:bg-gray-50">
                  <tr className="bg-gray-50 border-b border-gray-200 shadow-sm">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nº</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrega</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">DNI</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Prestación</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resultado</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacto</th>
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
                        className="even:bg-gray-50/60 hover:bg-blue-50/50 transition-colors cursor-pointer group"
                        onClick={() => abrirPresupuesto(p)}
                      >
                        {/* Nº */}
                        <td className="px-4 py-3 font-mono text-blue-600 font-semibold text-xs whitespace-nowrap">
                          {p.numero_presupuesto}
                        </td>

                        {/* Fecha de entrega */}
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {fmtFecha(p.fecha_entrega || p.fecha_creacion)}
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
                          className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate"
                          title={p.prestacion_descripcion}
                        >
                          {p.prestacion_descripcion || p.prestacion_codigo || "—"}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 text-xs whitespace-nowrap">
                          {totalFinal > 0 ? `$ ${fmtARS(totalFinal)}` : "—"}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3 text-center align-middle">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${est.bg} ${est.text}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />
                            {est.label}
                          </span>
                        </td>

                        {/* Resultado comercial */}
                        <td className="px-4 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <CeldaResultado
                            p={p}
                            plazoDias={plazoDias}
                            onAceptar={() => setAceptModal(p)}
                            onRechazar={() => setModal({ modo: "rechazar", p })}
                            onSinRespuesta={() => marcarSinRespuesta(p)}
                            onRevertir={() => setRevert(p)}
                            onCircuito={() => setCircuito(p)}
                          />
                        </td>

                        {/* Estado de contacto (seguimiento) */}
                        <td className="px-4 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <CeldaContacto p={p} onHistorial={() => setHistorial(p)} />
                        </td>

                        {/* Acciones (operativas) */}
                        <td
                          className="px-4 py-3 text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => abrirPresupuesto(p)}
                              title="Abrir presupuesto para editar"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Abrir
                            </button>
                            {p.estado === "borrador" && (
                              <TransicionBtn onClick={() => cambiarEstado(p.id, "entregado")} title="Marcar como entregado" color="blue" Icon={Send} />
                            )}
                            {p.estado === "entregado" && (
                              <TransicionBtn onClick={() => cambiarEstado(p.id, "practicado")} title="Marcar como practicado" color="green" Icon={CheckCircle2} />
                            )}
                            {p.estado !== "cancelado" && (
                              <TransicionBtn onClick={() => cambiarEstado(p.id, "cancelado")} title="Cancelar presupuesto" color="red" Icon={Ban} />
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

      {/* Modales */}
      {modal && (
        <ResultadoModal
          modo={modal.modo}
          presupuesto={modal.p}
          motivos={motivos}
          onClose={() => setModal(null)}
          onConfirm={confirmarModal}
        />
      )}
      {aceptModal && (
        <AceptacionModal
          presupuesto={aceptModal}
          convenios={convenios}
          lios={lios}
          username={username}
          onClose={() => setAceptModal(null)}
          onDone={() => {
            const abrir = aceptModal;
            setAceptModal(null);
            notify("Presupuesto ACEPTADO — circuito iniciado", "success");
            setCircuito(abrir);        // abre el panel Circuito recién aceptado
            setTimeout(() => loadData(page), 250);
          }}
        />
      )}
      {circuito && (
        <CircuitoPanel
          presupuesto={circuito}
          convenios={convenios}
          lios={lios}
          username={username}
          onClose={() => setCircuito(null)}
        />
      )}
      {showMatches && (
        <MatchesRevisionModal
          username={username}
          onClose={() => setShowMatches(false)}
          onChanged={() => { loadMatchesCount(); loadData(page); }}
        />
      )}
      {revert && (
        <ConfirmModal
          titulo="Revertir resultado"
          mensaje={`El presupuesto ${revert.numero_presupuesto} volverá a estado Pendiente (se borra el resultado registrado). ¿Confirmás?`}
          confirmLabel="Revertir"
          danger
          onClose={() => setRevert(null)}
          onConfirm={confirmarRevertir}
        />
      )}
      {bulk && (
        <ConfirmModal
          titulo="Confirmar vencidos"
          mensaje={`Vas a marcar ${bulk.count} presupuesto(s) entregados sin respuesta hace más de ${plazoDias} días como “Sin respuesta”. ¿Confirmás?`}
          confirmLabel={`Marcar ${bulk.count}`}
          onClose={() => setBulk(null)}
          onConfirm={confirmarBulk}
        />
      )}

      {historial && (
        <HistorialSeguimientoModal
          presupuestoId={historial.id}
          numero={historial.numero_presupuesto}
          onClose={() => setHistorial(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast data={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
