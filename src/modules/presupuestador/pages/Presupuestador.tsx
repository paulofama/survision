import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTipoCambio } from "@/context/TipoCambioContext";
import supabase from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
interface Insumo {
  id: number;
  descripcion: string;
  monto: number;           // siempre en ARS (valor usado en cálculos)
  moneda: "ARS" | "USD";  // moneda en que fue ingresado
  montoOriginal: number;  // valor original en la moneda ingresada (para mostrar)
}

interface CalculosResult {
  montoOriginalUSD: number;
  gastosCirculoUSD: number;
  gastosMontoBase8USD: number;
  subtotalUSD: number;
  subtotalOriginal: number;
  subtotalDespuesCobertura: number;
  totalInsumos: number;
  subtotalConGastos: number;
  descuento: number;
  neto: number;
  iva: number;
  total: number;
}

interface CalculoInput {
  montoUSD: number;
  tipoCambio: number;
  coberturaOS: number;
  circuloMedico: boolean;
  montoBase8: boolean;
  porcentajeDescuento: number;
  insumos: Insumo[];
}

interface FormState {
  nombre: string;
  apellido: string;
  documento: string;
  telefono: string;
  fechaNacimiento: string;
  obraSocial: string;
  numeroAfiliado: string;
  circuloMedico: boolean;
  montoBase8: boolean;
  prestacionCodigo: string;
  ojoTratar: string;
  cirujano: string;
  derivador: string;
  administrativa: string;
  infoAdicional: string;
  montoUSD: number;
  tipoCambio: number;
  coberturaOS: number;
  porcentajeDescuento: number;
  insumos: Insumo[];
  servicios: string[];
  formasPago: string[];
  metodoContacto: string;
  horario: string;
  comentarios: string;
  tratamientosExtra: TratamientoExtra[];
}

interface Prestacion {
  id: string;
  codigo: string;
  practica: string;
  precio: number | string;
  agrupacion_id: string | null;
  activa: boolean;
}

interface Agrupacion {
  id: string;
  nombre: string;
  color: string;
  orden: number;
  activa: boolean;
}

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
  desarrollado_por: string;
  monto_usd: number | string;
  monto_ars: number | string;
  total_final: number | string;
  estado: EstadoPresupuesto;
  fecha_entrega: string | null;
  fecha_practica: string | null;
  datos_completos: DatosCompletos;
}

type EstadoPresupuesto = "borrador" | "entregado" | "practicado" | "cancelado";

interface DatosCompletos {
  numeroPresupuesto?: string;
  fechaCreacion?: string;
  paciente?: {
    nombre?: string;
    apellido?: string;
    documento?: string;
    telefono?: string;
    fechaNacimiento?: string;
    obraSocial?: string;
    numeroAfiliado?: string;
    circuloMedico?: boolean;
    montoBase8?: boolean;
  };
  tratamiento?: {
    prestacionCodigo?: string;
    prestacionDescripcion?: string;
    cirujano?: string;
    ojoTratar?: string;
    derivador?: string;
    administrativa?: string;
    informacionAdicional?: string;
  };
  insumos?: Insumo[];
  servicios?: Array<{ codigo: string; descripcion: string }>;
  formasPago?: Array<{ codigo: string; descripcion: string }>;
  precios?: Record<string, number>;
  tratamientosExtra?: TratamientoExtra[];
  contacto?: {
    metodoPreferido?: string;
    horarioPreferido?: string;
    comentarios?: string;
  };
}

interface TratamientoExtra {
  id: string;
  prestacionCodigo: string;
  ojoTratar: string;
  cirujano: string;
  derivador: string;
  montoUSD: number;
  infoAdicional: string;
}

interface SelectOption {
  value: string;
  label: string;
}

type ToastType = "success" | "error" | "warning" | "info";

interface ToastData {
  message: string;
  type: ToastType;
  key: number;
}

interface GroupedPrestaciones {
  nombre: string;
  color: string;
  items: Prestacion[];
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE CLIENT (REST API) — usa sesión autenticada del cliente compartido
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = "https://eawtvwuayahbldzjzeer.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhd3R2d3VheWFoYmxkemp6ZWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODc1OTksImV4cCI6MjA3OTU2MzU5OX0.Fo3kChA3Ozv3XGW19DimlZ_8uH-v6LWd2SvTXZfkIaE";

/**
 * Obtiene los headers con el token JWT del usuario logueado.
 * Si no hay sesión activa, cae en el anon key (mismo comportamiento anterior).
 * Esto resuelve el problema de RLS: el Presupuestador ahora tiene los mismos
 * permisos que el resto de la aplicación.
 */
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

const sb = {
  async select<T = unknown>(table: string, query = ""): Promise<T[]> {
    const h = await getAuthHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: h });
    if (!r.ok) throw new Error(`Select ${table}: ${r.statusText}`);
    return r.json();
  },
  async insert<T = unknown>(table: string, data: Record<string, unknown>): Promise<T[]> {
    const h = await getAuthHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.message || r.statusText);
    }
    return r.json();
  },
  async update<T = unknown>(table: string, match: string, data: Record<string, unknown>): Promise<T[]> {
    const h = await getAuthHeaders();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.message || r.statusText);
    }
    return r.json();
  },
  /** Upsert: insert or update on conflict (requires unique constraint) */
  async upsert<T = unknown>(table: string, data: Record<string, unknown>, onConflict: string): Promise<T[]> {
    const h = await getAuthHeaders("return=representation,resolution=merge-duplicates");
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const e = await r.json();
      throw new Error(e.message || r.statusText);
    }
    return r.json();
  },
};

// ═══════════════════════════════════════════════════════════════
// BACKEND API (Express → GECLISA)
// ═══════════════════════════════════════════════════════════════
const BACKEND_URL = `http://${window.location.hostname}:3001`;

interface PacienteGeclisa {
  fichaId: number;
  apellido: string;
  nombre: string;
  documento: string;
  telefono: string;
  fechaNacimiento: string;
  obraSocial: string;
  obraSocialSigla: string;
  numeroAfiliado: string;
  planNombre: string;
  esParticular: boolean;
}

interface PacienteSupabase {
  id: string;
  documento: string;
  apellido: string;
  nombre: string;
  telefono: string | null;
  fecha_nacimiento: string | null;
  obra_social: string | null;
  obra_social_sigla: string | null;
  numero_afiliado: string | null;
  plan_nombre: string | null;
  es_particular: boolean;
  geclisa_ficha_id: number | null;
  origen: string;
}

/** Fuente unificada para el DNI lookup */
type DniFuente = "geclisa" | "supabase" | null;

interface BuscarDniResponse {
  encontrado: boolean;
  fuente?: string;
  paciente?: PacienteGeclisa;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
// CIRUJANOS - lista fija con valores estables (no depende de IDs de GECLISA)
const CIRUJANOS_FALLBACK: SelectOption[] = [
  { value: "sd", label: "S/D" },
  { value: "survision", label: "Survision" },
  { value: "dr_mahia", label: "Dr. Pablo Mahia" },
  { value: "dr_musa", label: "Dr. Carlos Musa" },
  { value: "dr_roca", label: "Dr. Leandro Roca" },
  { value: "dr_mercado", label: "Dr. Jorge Mercado" },
  { value: "dr_oliva", label: "Dra. Ignacia Oliva" },
];

const DERIVADORES: SelectOption[] = [
  { value: "", label: "Sin derivador" },
  ...CIRUJANOS_FALLBACK,
  { value: "dr_lopez", label: "Dr. Jorge Lopez" },
];

const ADMINISTRATIVAS: SelectOption[] = [
  { value: "agostina_quiroga", label: "Agostina Quiroga" },
  { value: "carolina_martinez", label: "Carolina Martinez" },
  { value: "celeste_guerrero", label: "Celeste Guerrero" },
  { value: "claudia_guliani", label: "Claudia Guliani" },
  { value: "claudia_martinez", label: "Claudia Martinez" },
  { value: "gisela_cornuz", label: "Gisela Cornuz" },
  { value: "ivana_parra", label: "Ivana Parra" },
  { value: "marianela_murgo", label: "Marianela Murgo" },
  { value: "nancy_narambuena", label: "Nancy Narambuena" },
  { value: "romina_villar", label: "Romina Villar" },
  { value: "rosa_rodriguez", label: "Rosa Rodriguez" },
  { value: "admin", label: "Admin" },
];

const SERVICIOS = [
  { id: "honorarios", label: "Honorarios médicos" },
  { id: "insumos", label: "Insumos descartables" },
  { id: "material", label: "Material quirúrgico" },
  { id: "controles", label: "Controles post-operatorios" },
] as const;

const FORMAS_PAGO = [
  { id: "efectivo", label: "Efectivo" },
  { id: "debito", label: "Tarjeta Débito" },
  { id: "credito", label: "Tarjeta Crédito" },
  { id: "transferencia", label: "Transferencia" },
  { id: "qr", label: "QR / Billetera virtual" },
] as const;

const DEFAULT_TC = 1210;
const IVA_RATE = 0.21;
const CIRCULO_RATE = 0.08;

const ESTADOS: Record<EstadoPresupuesto, { label: string; bg: string; text: string; icon: string }> = {
  borrador: { label: "Borrador", bg: "bg-gray-100", text: "text-gray-700", icon: "📝" },
  entregado: { label: "Entregado", bg: "bg-blue-100", text: "text-blue-700", icon: "📤" },
  practicado: { label: "Practicado", bg: "bg-green-100", text: "text-green-700", icon: "✅" },
  cancelado: { label: "Cancelado", bg: "bg-red-100", text: "text-red-700", icon: "❌" },
};

// ═══════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════
const fmtARS = (v: number): string => {
  if (isNaN(v) || v == null) v = 0;
  const [ent, dec] = v.toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

const fmtUSD = (v: number): string => `USD ${fmtARS(v)}`;
const fmtPesos = (v: number): string => `$ ${fmtARS(v)}`;

const parseArgNum = (str: string | number): number => {
  if (typeof str === "number") return str;
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, "").replace(",", ".")) || 0;
};

const toTitleCase = (s: string): string =>
  s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const fmtFecha = (d: string | null | undefined): string => {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${dt.getFullYear()}`;
};

// ═══════════════════════════════════════════════════════════════
// CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════
function calcular(datos: Partial<CalculoInput>): CalculosResult {
  const {
    montoUSD = 0,
    tipoCambio = DEFAULT_TC,
    coberturaOS = 0,
    circuloMedico = false,
    montoBase8 = false,
    porcentajeDescuento = 0,
    insumos = [],
  } = datos;

  const montoOriginalUSD = montoUSD;
  const gastosCirculoUSD =
    circuloMedico && coberturaOS > 0 ? (coberturaOS * CIRCULO_RATE) / tipoCambio : 0;
  const gastosMontoBase8USD =
    montoBase8 ? montoOriginalUSD * CIRCULO_RATE : 0;
  const subtotalUSD = montoOriginalUSD + gastosCirculoUSD + gastosMontoBase8USD;
  const subtotalOriginal = subtotalUSD * tipoCambio;
  const subtotalDespuesCobertura = Math.max(0, subtotalOriginal - coberturaOS);
  const totalInsumos = insumos.reduce((s, i) => s + (i.monto || 0), 0);
  // Descuento se aplica SOLO sobre la base (sin insumos especiales)
  const descuento = subtotalDespuesCobertura * (porcentajeDescuento / 100);
  const baseConDescuento = Math.max(0, subtotalDespuesCobertura - descuento);
  // Insumos se agregan DESPUÉS del descuento
  const subtotalConGastos = baseConDescuento + totalInsumos;
  const neto = subtotalConGastos;
  const iva = neto * IVA_RATE;
  const total = neto + iva;

  return {
    montoOriginalUSD,
    gastosCirculoUSD,
    gastosMontoBase8USD,
    subtotalUSD,
    subtotalOriginal,
    subtotalDespuesCobertura,
    totalInsumos,
    subtotalConGastos,
    descuento,
    neto,
    iva,
    total,
  };
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════
interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const styles: Record<ToastType, string> = {
    success: "bg-green-50 border-green-400 text-green-800",
    error: "bg-red-50 border-red-400 text-red-800",
    warning: "bg-yellow-50 border-yellow-400 text-yellow-800",
    info: "bg-blue-50 border-blue-400 text-blue-800",
  };

  const icons: Record<ToastType, string> = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 ${styles[type]} border-l-4 px-5 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm`}
      style={{ animation: "slideInRight 0.3s ease" }}
    >
      <span className="text-lg">{icons[type]}</span>
      <span className="text-sm font-medium flex-1">{message}</span>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 text-lg leading-none">
        ✕
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const INITIAL_FORM: FormState = {
  nombre: "",
  apellido: "",
  documento: "",
  telefono: "",
  fechaNacimiento: "",
  obraSocial: "",
  numeroAfiliado: "",
  circuloMedico: false,
  montoBase8: false,
  prestacionCodigo: "",
  ojoTratar: "",
  cirujano: "",
  derivador: "",
  administrativa: "",
  infoAdicional: "",
  montoUSD: 0,
  tipoCambio: DEFAULT_TC,
  coberturaOS: 0,
  porcentajeDescuento: 0,
  insumos: [],
  servicios: ["honorarios"],
  formasPago: ["efectivo"],
  metodoContacto: "whatsapp",
  horario: "manana",
  comentarios: "",
  tratamientosExtra: [],
};

export default function Presupuestador() {
  // ── State ──
  const [toast, setToast] = useState<ToastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [presupuestoNumero, setPresupuestoNumero] = useState<string | null>(null);
  const [presupuestoEstado, setPresupuestoEstado] = useState<EstadoPresupuesto | null>(null);
  const [yaGuardado, setYaGuardado] = useState(false);
  // Snapshot de los datos exactos guardados en DB — el PDF se genera desde acá, no desde form
  const [datosGuardados, setDatosGuardados] = useState<DatosCompletos | null>(null);
  const location = useLocation();
  const navegarSeccion = useNavigate();

  // Derive section from URL path
  const section: "form" | "search" | "analisis" = useMemo(() => {
    if (location.pathname.includes("/busqueda")) return "search";
    if (location.pathname.includes("/analisis")) return "analisis";
    return "form";
  }, [location.pathname]);

  // Navigate helper (replaces setSection)
  const setSection = useCallback((s: "form" | "search" | "analisis") => {
    switch (s) {
      case "form": navegarSeccion("/presupuestos"); break;
      case "search": navegarSeccion("/presupuestos/busqueda"); break;
      case "analisis": navegarSeccion("/presupuestos/analisis"); break;
    }
  }, [navegarSeccion]);

  // ── Análisis state ──
  const [analisisData, setAnalisisData] = useState<Presupuesto[]>([]);
  const [analisisLoading, setAnalisisLoading] = useState(false);
  const [analisisPage, setAnalisisPage] = useState(1);
  const [analisisTotal, setAnalisisTotal] = useState(0);
  const [analisisStats, setAnalisisStats] = useState({ total: 0, borrador: 0, entregado: 0, practicado: 0, cancelado: 0, montoTotal: 0, montoPromedio: 0 });
  const ITEMS_PER_PAGE = 20;
  const [analisisFilters, setAnalisisFilters] = useState({
    paciente: "",
    estado: "" as EstadoPresupuesto | "",
    fechaDesde: "",
    fechaHasta: "",
    prestacion: "",
    cirujano: "",
    administrativa: "",
  });

  const [prestaciones, setPrestaciones] = useState<Prestacion[]>([]);
  const [agrupaciones, setAgrupaciones] = useState<Agrupacion[]>([]);
  const [preciosMap, setPreciosMap] = useState<Record<string, number>>({});
  const [adminTelefonoMap, setAdminTelefonoMap] = useState<Record<string, string>>({});
  const cirujanos = CIRUJANOS_FALLBACK;

  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const totalMontoUSD = useMemo(
    () => form.montoUSD + form.tratamientosExtra.reduce((sum, t) => sum + (t.montoUSD || 0), 0),
    [form.montoUSD, form.tratamientosExtra]
  );

  const calcs = useMemo<CalculosResult>(
    () =>
      calcular({
        montoUSD: totalMontoUSD,
        tipoCambio: form.tipoCambio || DEFAULT_TC,
        coberturaOS: form.coberturaOS,
        circuloMedico: form.circuloMedico,
        montoBase8: form.montoBase8,
        porcentajeDescuento: form.porcentajeDescuento,
        insumos: form.insumos,
      }),
    [totalMontoUSD, form.tipoCambio, form.coberturaOS, form.circuloMedico, form.montoBase8, form.porcentajeDescuento, form.insumos]
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Presupuesto[]>([]);
  const [searching, setSearching] = useState(false);

  const [newInsumoDesc, setNewInsumoDesc] = useState("");
  const [newInsumoMonto, setNewInsumoMonto] = useState("");
  const [newInsumoMoneda, setNewInsumoMoneda] = useState<"ARS" | "USD">("ARS");

  const [showPreview, setShowPreview] = useState(false);

  // ── Prestacion Combo Search ──
  const [prestSearch, setPrestSearch] = useState("");
  const [prestOpen, setPrestOpen] = useState(false);
  const prestComboRef = useRef<HTMLDivElement>(null);

  // ── Tipo de Cambio (from context) ──
  const { tipoCambio: tcData, loading: tcLoading, refresh: tcRefresh, lastUpdate: tcLastUpdate } = useTipoCambio();
  const forceTcSync = useRef(false);

  // ── Tipo de Cambio sync ──
  // Regla de negocio:
  //   Nuevo presupuesto  → auto-sync al TC actual al cargar
  //   Presupuesto existente → conserva el TC histórico guardado
  //   Botón "Actualizar" → fuerza reemplazo por TC vigente (ambos casos)
  useEffect(() => {
    if (!tcData?.venta || tcData.venta <= 0) return;

    if (forceTcSync.current) {
      // Actualización manual explícita — aplica siempre
      updateField("tipoCambio", tcData.venta);
      notify(`TC actualizado: $${fmtARS(tcData.venta)} (${tcData.fuente || "BCRA"} - vendedor)`, "success");
      forceTcSync.current = false;
    } else if (!editMode) {
      // Presupuesto nuevo → tomar TC actual automáticamente
      updateField("tipoCambio", tcData.venta);
    }
    // Presupuesto existente (editMode=true) → no tocar el TC histórico
  }, [tcData, editMode]);

  // ── DNI Autocomplete ──
  const [dniLoading, setDniLoading] = useState(false);
  const [dniStatus, setDniStatus] = useState<"idle" | "found" | "not_found" | "error">("idle");
  const [dniPaciente, setDniPaciente] = useState<PacienteGeclisa | null>(null);
  const [dniFuente, setDniFuente] = useState<DniFuente>(null);
  const [pacienteSupabaseId, setPacienteSupabaseId] = useState<string | null>(null);
  const dniTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Notify ──
  const notify = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type, key: Date.now() });
  }, []);

  // ── DNI Lookup (GECLISA) ──
  const buscarPorDNI = useCallback(
    async (dni: string) => {
      if (dni.length < 6) {
        setDniStatus("idle");
        setDniPaciente(null);
        setDniFuente(null);
        setPacienteSupabaseId(null);
        return;
      }

      setDniLoading(true);
      setDniStatus("idle");

      try {
        // ═══ PASO 1: Buscar en GECLISA ═══
        let geclisaPac: PacienteGeclisa | null = null;
        try {
          const r = await fetch(`${BACKEND_URL}/api/pacientes/buscar-dni/${dni}`);
          if (r.ok) {
            const data: BuscarDniResponse = await r.json();
            if (data.encontrado && data.paciente) {
              geclisaPac = data.paciente;
            }
          }
        } catch (gErr) {
          console.warn("⚠️ GECLISA no disponible:", gErr);
        }

        // ═══ PASO 2: Buscar en Supabase ═══
        let supabasePac: PacienteSupabase | null = null;
        try {
          const sbResult = await sb.select<PacienteSupabase>(
            "pacientes",
            `documento=eq.${dni}&activo=eq.true&select=*&limit=1`
          );
          if (sbResult && sbResult.length > 0) {
            supabasePac = sbResult[0];
            setPacienteSupabaseId(supabasePac.id);
          }
        } catch (sbErr) {
          console.warn("⚠️ Supabase pacientes query failed:", sbErr);
        }

        // ═══ PASO 3: Decidir fuente y llenar form ═══
        if (geclisaPac) {
          // Encontrado en GECLISA → usar esos datos (más completos)
          setDniStatus("found");
          setDniFuente("geclisa");
          setDniPaciente(geclisaPac);

          setForm((prev) => ({
            ...prev,
            apellido: geclisaPac!.apellido || prev.apellido,
            nombre: geclisaPac!.nombre || prev.nombre,
            documento: dni,
            telefono: geclisaPac!.telefono || prev.telefono,
            fechaNacimiento: geclisaPac!.fechaNacimiento || prev.fechaNacimiento,
            obraSocial: geclisaPac!.esParticular ? "" : toTitleCase(geclisaPac!.obraSocial || prev.obraSocial),
            numeroAfiliado: geclisaPac!.numeroAfiliado || prev.numeroAfiliado,
          }));

          // Sync a Supabase en background (upsert para tenerlo local)
          try {
            const upserted = await sb.upsert<PacienteSupabase>("pacientes", {
              documento: dni,
              apellido: geclisaPac.apellido,
              nombre: geclisaPac.nombre,
              telefono: geclisaPac.telefono || null,
              fecha_nacimiento: geclisaPac.fechaNacimiento || null,
              obra_social: geclisaPac.esParticular ? null : (geclisaPac.obraSocial ? toTitleCase(geclisaPac.obraSocial) : null),
              obra_social_sigla: geclisaPac.obraSocialSigla || null,
              numero_afiliado: geclisaPac.numeroAfiliado || null,
              plan_nombre: geclisaPac.planNombre || null,
              es_particular: geclisaPac.esParticular || false,
              geclisa_ficha_id: geclisaPac.fichaId || null,
              origen: "geclisa",
            }, "documento");
            if (upserted?.[0]?.id) {
              setPacienteSupabaseId(upserted[0].id);
            }
            console.log("✅ Paciente sincronizado a Supabase desde GECLISA");
          } catch (syncErr) {
            console.warn("⚠️ No se pudo sincronizar paciente a Supabase:", syncErr);
          }

          notify(`✅ Paciente encontrado: ${geclisaPac.apellido}, ${geclisaPac.nombre} (GECLISA)`, "success");

        } else if (supabasePac) {
          // No en GECLISA pero sí en Supabase → usar datos locales
          setDniStatus("found");
          setDniFuente("supabase");

          // Mapear a PacienteGeclisa shape para UI consistente
          const mapped: PacienteGeclisa = {
            fichaId: supabasePac.geclisa_ficha_id || 0,
            apellido: supabasePac.apellido,
            nombre: supabasePac.nombre,
            documento: supabasePac.documento,
            telefono: supabasePac.telefono || "",
            fechaNacimiento: supabasePac.fecha_nacimiento || "",
            obraSocial: toTitleCase(supabasePac.obra_social || ""),
            obraSocialSigla: supabasePac.obra_social_sigla || "",
            numeroAfiliado: supabasePac.numero_afiliado || "",
            planNombre: supabasePac.plan_nombre || "",
            esParticular: supabasePac.es_particular,
          };
          setDniPaciente(mapped);

          setForm((prev) => ({
            ...prev,
            apellido: mapped.apellido || prev.apellido,
            nombre: mapped.nombre || prev.nombre,
            documento: dni,
            telefono: mapped.telefono || prev.telefono,
            fechaNacimiento: mapped.fechaNacimiento || prev.fechaNacimiento,
            obraSocial: mapped.esParticular ? "" : toTitleCase(mapped.obraSocial || prev.obraSocial),
            numeroAfiliado: mapped.numeroAfiliado || prev.numeroAfiliado,
          }));

          notify(`✅ Paciente encontrado: ${mapped.apellido}, ${mapped.nombre} (base local)`, "success");

        } else {
          // No encontrado en ninguna fuente → paciente nuevo
          setDniStatus("not_found");
          setDniPaciente(null);
          setDniFuente(null);
          setPacienteSupabaseId(null);
        }
      } catch (e) {
        console.error("Error buscando DNI:", e);
        setDniStatus("error");
        setDniPaciente(null);
        setDniFuente(null);
      } finally {
        setDniLoading(false);
      }
    },
    [notify]
  );

  // ── Load prestaciones + teléfonos administrativas ──
  // IMPORTANTE: usa el cliente compartido (src/lib/supabase.ts) para leer
  // prestaciones y agrupaciones del mismo proyecto Supabase que PrestacionesPage.
  // El cliente sb propio del Presupuestador apunta a un proyecto diferente y no
  // tiene estos datos.
  useEffect(() => {
    (async () => {
      try {
        const [
          { data: prest, error: prestError },
          { data: agrup, error: agrupError },
          { data: usuarios, error: usuariosError },
        ] = await Promise.all([
          supabase
            .from("prestaciones")
            .select("id,codigo,practica,precio,agrupacion_id,activa")
            .eq("activa", true)
            .order("codigo"),
          supabase
            .from("agrupaciones")
            .select("id,nombre,color,orden,activa")
            .eq("activa", true)
            .order("orden"),
          supabase
            .from("usuarios_sistema")
            .select("username,nombre_completo,telefono")
            .eq("activo", true),
        ]);

        if (prestError) throw new Error(prestError.message);
        if (agrupError) throw new Error(agrupError.message);

        setPrestaciones((prest as Prestacion[]) || []);
        setAgrupaciones((agrup as Agrupacion[]) || []);
        const map: Record<string, number> = {};
        ((prest as Prestacion[]) || []).forEach((p) => {
          map[p.codigo] = parseFloat(String(p.precio));
        });
        setPreciosMap(map);

        // Mapa username → teléfono, con fallback por nombre normalizado
        if (!usuariosError && usuarios) {
          const telMap: Record<string, string> = {};
          (usuarios as { username: string; nombre_completo: string; telefono: string | null }[]).forEach((u) => {
            if (!u.telefono) return;
            telMap[u.username] = u.telefono;
            const nombreNorm = u.nombre_completo
              .toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "_");
            telMap[nombreNorm] = u.telefono;
          });
          setAdminTelefonoMap(telMap);
        }

        notify(`${((prest as Prestacion[]) || []).length} prestaciones cargadas`, "success");
      } catch (e) {
        console.error(e);
        notify("Error cargando prestaciones: " + (e as Error).message, "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // ── Grouped prestaciones ──
  const prestacionesByGroup = useMemo<Array<[string, GroupedPrestaciones]>>(() => {
    const groups: Record<string, GroupedPrestaciones> = {};
    agrupaciones.forEach((a) => {
      groups[a.id] = { nombre: a.nombre, color: a.color, items: [] };
    });
    groups["sin_grupo"] = { nombre: "Otros", color: "#666", items: [] };
    prestaciones.forEach((p) => {
      const gid = p.agrupacion_id || "sin_grupo";
      if (groups[gid]) groups[gid].items.push(p);
      else groups["sin_grupo"].items.push(p);
    });
    return Object.entries(groups).filter(([, g]) => g.items.length > 0);
  }, [prestaciones, agrupaciones]);

  // ── Filtered prestaciones for combo search ──
  const filteredPrestByGroup = useMemo<Array<[string, GroupedPrestaciones]>>(() => {
    if (!prestSearch.trim()) return prestacionesByGroup;
    const q = prestSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return prestacionesByGroup
      .map(([gid, group]) => {
        const filtered = group.items.filter((p) => {
          const text = `${p.codigo} ${p.practica}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return text.includes(q);
        });
        return [gid, { ...group, items: filtered }] as [string, GroupedPrestaciones];
      })
      .filter(([, g]) => g.items.length > 0);
  }, [prestacionesByGroup, prestSearch]);

  // Click-outside to close prestacion combo
  // Si no hay prestación seleccionada al cerrar, limpia el texto de búsqueda
  // para que no quede un texto que dé apariencia de selección sin serlo
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (prestComboRef.current && !prestComboRef.current.contains(e.target as Node)) {
        setPrestOpen(false);
        if (!form.prestacionCodigo) setPrestSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [form.prestacionCodigo]);

  // ── Form handlers ──
  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setYaGuardado(false);
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        if (field === "prestacionCodigo" && preciosMap[value as string] !== undefined) {
          next.montoUSD = preciosMap[value as string];
        }
        return next;
      });
    },
    [preciosMap]
  );

  const onDniChange = useCallback(
    (value: string) => {
      const dniClean = value.replace(/\D/g, "");
      updateField("documento", dniClean);

      // Reset status when typing
      setDniStatus("idle");
      setDniPaciente(null);

      // Debounced search
      if (dniTimeout.current) clearTimeout(dniTimeout.current);
      if (dniClean.length >= 6) {
        dniTimeout.current = setTimeout(() => buscarPorDNI(dniClean), 600);
      }
    },
    [buscarPorDNI, updateField]
  );

  const toggleArrayItem = useCallback((field: "servicios" | "formasPago", item: string) => {
    setYaGuardado(false);
    setForm((prev) => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item],
      };
    });
  }, []);

  // ── Tratamientos extra ──
  const addTratamientoExtra = useCallback(() => {
    setYaGuardado(false);
    setForm((prev) => ({
      ...prev,
      tratamientosExtra: [
        ...prev.tratamientosExtra,
        {
          id: String(Date.now()),
          prestacionCodigo: "",
          ojoTratar: "",
          cirujano: prev.cirujano, // hereda el cirujano del tratamiento principal
          derivador: prev.derivador,
          montoUSD: 0,
          infoAdicional: "",
        },
      ],
    }));
  }, []);

  const updateTratamientoExtra = useCallback((id: string, field: keyof TratamientoExtra, value: string | number) => {
    setYaGuardado(false);
    setForm((prev) => ({
      ...prev,
      tratamientosExtra: prev.tratamientosExtra.map((t) =>
        t.id === id ? { ...t, [field]: value } : t
      ),
    }));
  }, []);

  const removeTratamientoExtra = useCallback((id: string) => {
    setYaGuardado(false);
    setForm((prev) => ({
      ...prev,
      tratamientosExtra: prev.tratamientosExtra.filter((t) => t.id !== id),
    }));
  }, []);

  // ── Insumos ──
  const addInsumo = useCallback(() => {
    if (!newInsumoDesc.trim()) return notify("Descripción requerida", "warning");
    const montoOriginal = parseArgNum(newInsumoMonto);
    if (montoOriginal <= 0) return notify("Monto debe ser mayor a 0", "warning");
    const tc = form.tipoCambio || DEFAULT_TC;
    const montoARS = newInsumoMoneda === "USD" ? montoOriginal * tc : montoOriginal;
    setYaGuardado(false);
    setForm((prev) => ({
      ...prev,
      insumos: [...prev.insumos, {
        id: Date.now(),
        descripcion: newInsumoDesc.trim(),
        monto: montoARS,
        moneda: newInsumoMoneda,
        montoOriginal,
      }],
    }));
    setNewInsumoDesc("");
    setNewInsumoMonto("");
  }, [newInsumoDesc, newInsumoMonto, newInsumoMoneda, form.tipoCambio, notify]);

  const removeInsumo = useCallback((id: number) => {
    setYaGuardado(false);
    setForm((prev) => ({
      ...prev,
      insumos: prev.insumos.filter((i) => i.id !== id),
    }));
  }, []);

  // ── Generate numero ──
  const generarNumero = async (): Promise<string> => {
    const anio = new Date().getFullYear();
    try {
      const seqs = await sb.select<{ año: number; ultimo_numero: number }>(
        "secuencias",
        `año=eq.${anio}`
      );
      let num: number;
      if (seqs && seqs.length > 0) {
        num = seqs[0].ultimo_numero + 1;
      } else {
        num = 1;
      }

      // Verificar que el número generado no exista ya en presupuestos
      // (puede pasar si un insert anterior falló a mitad de camino)
      let candidato = `P-${anio}-${String(num).padStart(3, "0")}`;
      let intentos = 0;
      while (intentos < 10) {
        const existente = await sb.select<{ id: string }>(
          "presupuestos",
          `numero_presupuesto=eq.${candidato}&select=id&limit=1`
        );
        if (!existente || existente.length === 0) break; // número libre
        num++;
        candidato = `P-${anio}-${String(num).padStart(3, "0")}`;
        intentos++;
      }

      // Actualizar/crear la secuencia con el número final
      if (seqs && seqs.length > 0) {
        await sb.update("secuencias", `año=eq.${anio}`, { ultimo_numero: num });
      } else {
        await sb.insert("secuencias", { año: anio, ultimo_numero: num });
      }

      return candidato;
    } catch (e) {
      console.error("Error secuencia:", e);
      return `P-${anio}-${Date.now().toString().slice(-6)}`;
    }
  };

  // ── Save ──
  const guardar = async () => {
    if (!form.apellido.trim()) return notify("Apellido es requerido", "warning");
    if (!form.nombre.trim()) return notify("Nombre es requerido", "warning");
    if (!form.prestacionCodigo) return notify("Seleccione una prestación", "warning");
    if (!form.cirujano) return notify("Seleccione cirujano", "warning");
    if (!form.administrativa) return notify("Seleccione administrativa", "warning");

    setLoading(true);
    try {
      const prestDesc =
        prestaciones.find((p) => p.codigo === form.prestacionCodigo)?.practica || "";

      // ═══ GUARDAR PACIENTE EN SUPABASE (select + insert/update) ═══
      let pacId = pacienteSupabaseId;
      if (form.documento.trim()) {
        try {
          const pacData = {
            apellido: toTitleCase(form.apellido),
            nombre: toTitleCase(form.nombre),
            telefono: form.telefono || null,
            fecha_nacimiento: form.fechaNacimiento || null,
            obra_social: form.obraSocial ? toTitleCase(form.obraSocial) : null,
            numero_afiliado: form.numeroAfiliado || null,
            es_particular: !form.obraSocial,
            geclisa_ficha_id: dniPaciente?.fichaId || null,
            origen: dniFuente === "geclisa" ? "geclisa" : "manual",
          };

          if (pacId) {
            // Ya tenemos el id — actualizar directamente
            await sb.update("pacientes", `id=eq.${pacId}`, pacData);
          } else {
            // Buscar por documento primero
            const existentes = await sb.select<PacienteSupabase>(
              "pacientes",
              `documento=eq.${form.documento.trim()}&select=id&limit=1`
            );
            if (existentes && existentes.length > 0) {
              pacId = existentes[0].id;
              await sb.update("pacientes", `id=eq.${pacId}`, pacData);
            } else {
              const inserted = await sb.insert<PacienteSupabase>("pacientes", {
                documento: form.documento.trim(),
                ...pacData,
              });
              if (inserted?.[0]?.id) pacId = inserted[0].id;
            }
          }
          if (pacId) setPacienteSupabaseId(pacId);
        } catch (pacErr) {
          console.warn("⚠️ No se pudo guardar paciente en Supabase:", pacErr);
          // No bloquea el guardado del presupuesto
        }
      }

      const datosCompletos: DatosCompletos = {
        paciente: {
          nombre: toTitleCase(form.nombre),
          apellido: toTitleCase(form.apellido),
          documento: form.documento,
          telefono: form.telefono,
          fechaNacimiento: form.fechaNacimiento,
          obraSocial: toTitleCase(form.obraSocial),
          numeroAfiliado: form.numeroAfiliado,
          circuloMedico: form.circuloMedico,
          montoBase8: form.montoBase8,
        },
        tratamiento: {
          prestacionCodigo: form.prestacionCodigo,
          prestacionDescripcion: prestDesc,
          cirujano: form.cirujano,
          ojoTratar: form.ojoTratar,
          derivador: form.derivador,
          administrativa: form.administrativa,
          informacionAdicional: form.infoAdicional,
        },
        insumos: form.insumos,
        tratamientosExtra: form.tratamientosExtra,
        servicios: form.servicios.map((s) => ({
          codigo: s,
          descripcion: SERVICIOS.find((sv) => sv.id === s)?.label || s,
        })),
        formasPago: form.formasPago.map((f) => ({
          codigo: f,
          descripcion: FORMAS_PAGO.find((fp) => fp.id === f)?.label || f,
        })),
        precios: {
          montoUSD: form.montoUSD,
          tipoCambio: form.tipoCambio,
          coberturaOS: form.coberturaOS,
          porcentajeDescuento: form.porcentajeDescuento,
          ...calcs,
        },
        contacto: {
          metodoPreferido: form.metodoContacto,
          horarioPreferido: form.horario,
          comentarios: form.comentarios,
        },
      };

      if (editMode && editId) {
        await sb.update("presupuestos", `id=eq.${editId}`, {
          fecha_modificacion: new Date().toISOString(),
          paciente_nombre: toTitleCase(form.nombre),
          paciente_apellido: toTitleCase(form.apellido),
          paciente_documento: form.documento,
          paciente_id: pacId || null,
          prestacion_codigo: form.prestacionCodigo,
          prestacion_descripcion: prestDesc,
          cirujano: form.cirujano,
          administrativa: form.administrativa,
          desarrollado_por: form.administrativa,
          monto_usd: totalMontoUSD,
          monto_ars: calcs.subtotalOriginal,
          total_final: calcs.total,
          datos_completos: datosCompletos,
        });
        notify("Presupuesto actualizado ✅", "success");
        setDatosGuardados(datosCompletos);
        setYaGuardado(true);
      } else {
        const numero = await generarNumero();
        datosCompletos.numeroPresupuesto = numero;
        datosCompletos.fechaCreacion = new Date().toISOString();
        const inserted = await sb.insert<{ id: string }>("presupuestos", {
          numero_presupuesto: numero,
          fecha_creacion: new Date().toISOString(),
          paciente_nombre: toTitleCase(form.nombre),
          paciente_apellido: toTitleCase(form.apellido),
          paciente_documento: form.documento,
          paciente_id: pacId || null,
          prestacion_codigo: form.prestacionCodigo,
          prestacion_descripcion: prestDesc,
          cirujano: form.cirujano,
          administrativa: form.administrativa,
          desarrollado_por: form.administrativa,
          monto_usd: totalMontoUSD,
          monto_ars: calcs.subtotalOriginal,
          total_final: calcs.total,
          estado: "borrador",
          datos_completos: datosCompletos,
        });
        // Quedar en modo edición para poder imprimir sin resetear el form
        if (inserted?.[0]?.id) {
          setEditId(inserted[0].id);
          setEditMode(true);
        }
        setPresupuestoNumero(numero);
        setPresupuestoEstado("borrador");
        setDatosGuardados(datosCompletos);
        setYaGuardado(true);
        notify(`Presupuesto ${numero} guardado ✅ — Ya podés imprimir`, "success");
      }
    } catch (e) {
      console.error(e);
      notify("Error al guardar: " + (e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ ...INITIAL_FORM });
    setEditMode(false);
    setEditId(null);
    setPresupuestoNumero(null);
    setPresupuestoEstado(null);
    setYaGuardado(false);
    setDatosGuardados(null);
    setDniStatus("idle");
    setDniPaciente(null);
    setDniFuente(null);
    setPacienteSupabaseId(null);
    setPrestSearch("");
    setPrestOpen(false);
  };

  // ── Load for editing ──
  const cargarPresupuesto = useCallback(
    (presup: Presupuesto) => {
      const dc = presup.datos_completos || {};
      const pac = dc.paciente || {};
      const trat = dc.tratamiento || {};
      const prec = dc.precios || {};
      const cont = dc.contacto || {};

      setForm({
        nombre: pac.nombre || presup.paciente_nombre || "",
        apellido: pac.apellido || presup.paciente_apellido || "",
        documento: pac.documento || presup.paciente_documento || "",
        telefono: pac.telefono || "",
        fechaNacimiento: pac.fechaNacimiento || "",
        obraSocial: toTitleCase(pac.obraSocial || ""),
        numeroAfiliado: pac.numeroAfiliado || "",
        circuloMedico: pac.circuloMedico || false,
        montoBase8: pac.montoBase8 || false,
        prestacionCodigo: trat.prestacionCodigo || presup.prestacion_codigo || "",
        ojoTratar: trat.ojoTratar || "",
        cirujano: trat.cirujano || presup.cirujano || "",
        derivador: trat.derivador || "",
        administrativa: trat.administrativa || presup.administrativa || "",
        infoAdicional: trat.informacionAdicional || "",
        montoUSD: prec.montoUSD || parseFloat(String(presup.monto_usd)) || 0,
        tipoCambio: prec.tipoCambio || DEFAULT_TC,
        coberturaOS: prec.coberturaOS || 0,
        porcentajeDescuento: prec.porcentajeDescuento || 0,
        insumos: dc.insumos || [],
        servicios: (dc.servicios || []).map((s) => s.codigo),
        formasPago: (dc.formasPago || []).map((f) => f.codigo),
        metodoContacto: cont.metodoPreferido || "whatsapp",
        horario: cont.horarioPreferido || "manana",
        comentarios: cont.comentarios || "",
        tratamientosExtra: (dc.tratamientosExtra || []).map((t: TratamientoExtra) => ({ ...t, id: t.id || String(Date.now() + Math.random()) })),
      });

      setEditMode(true);
      setEditId(presup.id);
      setPresupuestoNumero(presup.numero_presupuesto);
      setPresupuestoEstado(presup.estado);
      setDatosGuardados(presup.datos_completos || null);
      setYaGuardado(true);
      setSection("form");
      setPrestSearch("");
      setPrestOpen(false);
      notify(`Presupuesto ${presup.numero_presupuesto} cargado para edición`, "info");
    },
    [notify]
  );

  // ── Cargar presupuesto desde BusquedaPresupuestosPage (via location.state) ──
  useEffect(() => {
    const p = (location.state as { presupuesto?: Presupuesto } | null)?.presupuesto;
    if (p) {
      cargarPresupuesto(p);
      window.history.replaceState({}, ""); // limpiar para que no recargue al volver
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Change status ──
  const cambiarEstado = async (id: string, nuevoEstado: EstadoPresupuesto) => {
    try {
      const updates: Record<string, unknown> = { estado: nuevoEstado };
      if (nuevoEstado === "entregado") updates.fecha_entrega = new Date().toISOString().split("T")[0];
      if (nuevoEstado === "practicado")
        updates.fecha_practica = new Date().toISOString().split("T")[0];
      await sb.update("presupuestos", `id=eq.${id}`, updates);
      notify(`Estado cambiado a ${ESTADOS[nuevoEstado]?.label}`, "success");
      if (searchResults.length > 0) buscar(searchTerm);
    } catch (e) {
      notify("Error: " + (e as Error).message, "error");
    }
  };

  // ── Search ──
  const buscar = async (term: string) => {
    if (!term || term.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const isNumero = /^P-/i.test(term);
      let query = "select=*&order=fecha_creacion.desc&limit=20";

      if (isNumero) {
        query += `&numero_presupuesto=ilike.*${term}*`;
      } else if (/^\d+$/.test(term)) {
        query += `&paciente_documento=ilike.*${term}*`;
      } else {
        query += `&or=(paciente_apellido.ilike.*${term}*,paciente_nombre.ilike.*${term}*,numero_presupuesto.ilike.*${term}*)`;
      }

      const results = await sb.select<Presupuesto>("presupuestos", query);
      setSearchResults(results || []);
    } catch (e) {
      notify("Error en búsqueda: " + (e as Error).message, "error");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (searchTerm.length >= 2) {
      searchTimeout.current = setTimeout(() => buscar(searchTerm), 350);
    } else {
      setSearchResults([]);
    }
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // ── Fetch TC (via Context) ──
  const fetchTC = async () => {
    try {
      forceTcSync.current = true;
      await tcRefresh();
      // tcData will update → useEffect syncs to form and shows notification
    } catch {
      forceTcSync.current = false;
      notify("No se pudo obtener TC. Usando valor actual.", "warning");
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // ANÁLISIS FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  const buildAnalisisQuery = useCallback(() => {
    const parts: string[] = ["order=fecha_creacion.desc"];
    const f = analisisFilters;
    if (f.paciente) {
      parts.push(`or=(paciente_apellido.ilike.*${f.paciente}*,paciente_nombre.ilike.*${f.paciente}*,paciente_documento.ilike.*${f.paciente}*,numero_presupuesto.ilike.*${f.paciente}*)`);
    }
    if (f.estado) parts.push(`estado=eq.${f.estado}`);
    if (f.fechaDesde) parts.push(`fecha_creacion=gte.${f.fechaDesde}`);
    if (f.fechaHasta) parts.push(`fecha_creacion=lte.${f.fechaHasta}T23:59:59`);
    if (f.prestacion) parts.push(`prestacion_descripcion=ilike.*${f.prestacion}*`);
    if (f.cirujano) parts.push(`cirujano=ilike.*${f.cirujano}*`);
    if (f.administrativa) parts.push(`administrativa=ilike.*${f.administrativa}*`);
    return parts.join("&");
  }, [analisisFilters]);

  const loadAnalisis = useCallback(async (page = 1) => {
    setAnalisisLoading(true);
    try {
      const query = buildAnalisisQuery();
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const analisisHeaders = await getAuthHeaders("count=exact");
      const r = await fetch(`${SUPABASE_URL}/rest/v1/presupuestos?${query}`, {
        headers: { ...analisisHeaders, Range: `${from}-${to}` },
      });
      if (!r.ok) throw new Error(r.statusText);
      const contentRange = r.headers.get("content-range");
      const total = contentRange ? parseInt(contentRange.split("/")[1]) || 0 : 0;
      const data: Presupuesto[] = await r.json();
      setAnalisisData(data);
      setAnalisisTotal(total);
      setAnalisisPage(page);
    } catch (e) {
      console.error("Error loading analisis:", e);
      notify("Error cargando datos de análisis", "error");
    } finally {
      setAnalisisLoading(false);
    }
  }, [buildAnalisisQuery]);

  const loadAnalisisStats = useCallback(async () => {
    try {
      const all = await sb.select<Presupuesto>("presupuestos", "select=id,estado,total_final");
      const stats = {
        total: all.length,
        borrador: all.filter((p) => p.estado === "borrador").length,
        entregado: all.filter((p) => p.estado === "entregado").length,
        practicado: all.filter((p) => p.estado === "practicado").length,
        cancelado: all.filter((p) => p.estado === "cancelado").length,
        montoTotal: all.reduce((s, p) => s + (parseFloat(String(p.total_final)) || 0), 0),
        montoPromedio: 0,
      };
      stats.montoPromedio = stats.total > 0 ? stats.montoTotal / stats.total : 0;
      setAnalisisStats(stats);
    } catch (e) {
      console.error("Error loading stats:", e);
    }
  }, []);

  useEffect(() => {
    if (section === "analisis") {
      loadAnalisis(1);
      loadAnalisisStats();
    }
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyAnalisisFilters = useCallback(() => {
    setAnalisisPage(1);
    loadAnalisis(1);
  }, [loadAnalisis]);

  const clearAnalisisFilters = useCallback(() => {
    setAnalisisFilters({ paciente: "", estado: "" as EstadoPresupuesto | "", fechaDesde: "", fechaHasta: "", prestacion: "", cirujano: "", administrativa: "" });
    setTimeout(() => loadAnalisis(1), 50);
  }, [loadAnalisis]);

  const analisisTotalPages = Math.ceil(analisisTotal / ITEMS_PER_PAGE);

  const conversionRate = useMemo(() => {
    if (analisisStats.total === 0) return 0;
    return ((analisisStats.practicado / analisisStats.total) * 100);
  }, [analisisStats]);

  const selectedPrestacion = prestaciones.find((p) => p.codigo === form.prestacionCodigo);

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── CONTENT ── */}
      <div className="min-h-screen overflow-y-auto">

      {(section === "form" || section === "search") && (<>
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {section === "form" ? (editMode ? "Editar Presupuesto" : "Nuevo Presupuesto") : "Buscar Presupuestos"}
              </h1>
              <p className="text-sm text-gray-500">
                {section === "form" ? "Gestión de presupuestos médicos" : "Búsqueda y consulta de presupuestos"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {editMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-amber-800 text-sm font-medium">
              ✏️ Modo edición — Modificando presupuesto existente
            </span>
            <button
              onClick={resetForm}
              className="text-xs bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1.5 rounded-md font-medium transition-colors"
            >
              Cancelar edición
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        {/* ═══ SEARCH TAB ═══ */}
        {section === "search" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por apellido, nombre, documento o número de presupuesto..."
                  className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searching && (
                <p className="text-blue-600 text-sm mt-2 font-medium">Buscando...</p>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500 font-medium">
                  {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} encontrado{searchResults.length !== 1 ? "s" : ""}
                </p>
                {searchResults.map((r) => {
                  const est = ESTADOS[r.estado] || ESTADOS.borrador;
                  return (
                    <div
                      key={r.id}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-mono text-blue-600 font-semibold">
                            {r.numero_presupuesto}
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${est.bg} ${est.text}`}
                          >
                            {est.icon} {est.label}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900">
                          {r.paciente_apellido}, {r.paciente_nombre}
                        </p>
                        <p className="text-sm text-gray-500">
                          {r.prestacion_descripcion || r.prestacion_codigo} · {fmtFecha(r.fecha_creacion)}
                          {parseFloat(String(r.total_final)) > 0 && (
                            <span className="ml-2 font-semibold text-gray-700">
                              {fmtPesos(parseFloat(String(r.total_final)))}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        <button
                          onClick={() => cargarPresupuesto(r)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs px-3 py-2 rounded-lg font-medium transition-colors border border-blue-200"
                        >
                          ✏️ Editar
                        </button>
                        {r.estado === "borrador" && (
                          <button
                            onClick={() => cambiarEstado(r.id, "entregado")}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs px-3 py-2 rounded-lg font-medium transition-colors border border-blue-200"
                          >
                            📤 Entregar
                          </button>
                        )}
                        {r.estado === "entregado" && (
                          <button
                            onClick={() => cambiarEstado(r.id, "practicado")}
                            className="bg-green-50 hover:bg-green-100 text-green-700 text-xs px-3 py-2 rounded-lg font-medium transition-colors border border-green-200"
                          >
                            ✅ Practicado
                          </button>
                        )}
                        {r.estado !== "cancelado" && (
                          <button
                            onClick={() => cambiarEstado(r.id, "cancelado")}
                            className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-3 py-2 rounded-lg font-medium transition-colors border border-red-200"
                          >
                            ❌
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-400 text-lg">No se encontraron resultados</p>
                <p className="text-gray-300 text-sm mt-1">Intentá con otro término de búsqueda</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ FORM TAB ═══ */}
        {section === "form" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: Form sections */}
            <div className="lg:col-span-2 space-y-4">
              {/* Section 1: Paciente */}
              <Section icon="👤" title="Datos del Paciente">
                <div className="grid grid-cols-2 gap-4">
                  <FormInput label="Apellido *" value={form.apellido} onChange={(v) => updateField("apellido", v)} />
                  <FormInput label="Nombre *" value={form.nombre} onChange={(v) => updateField("nombre", v)} />

                  {/* DNI con autocompletado GECLISA + Supabase */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Documento
                      {dniLoading && (
                        <span className="ml-2 text-blue-500 text-xs font-normal">
                          Buscando...
                        </span>
                      )}
                      {dniStatus === "found" && !dniLoading && (
                        <span className="ml-2 text-green-600 text-xs font-normal">
                          ✅ {dniFuente === "geclisa" ? "Encontrado en GECLISA" : "Encontrado en base local"}
                        </span>
                      )}
                      {dniStatus === "not_found" && !dniLoading && (
                        <span className="ml-2 text-amber-500 text-xs font-normal">
                          Paciente nuevo — se guardará al crear presupuesto
                        </span>
                      )}
                      {dniStatus === "error" && !dniLoading && (
                        <span className="ml-2 text-red-500 text-xs font-normal">
                          Sin conexión al servidor
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.documento}
                        onChange={(e) => onDniChange(e.target.value)}
                        placeholder="Ingrese DNI (mín. 6 dígitos)"
                        className={`w-full border rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-blue-500 pr-10 ${
                          dniStatus === "found"
                            ? "border-green-400 focus:ring-green-500 bg-green-50/30"
                            : dniStatus === "not_found"
                            ? "border-amber-300 focus:ring-amber-400"
                            : dniStatus === "error"
                            ? "border-red-300 focus:ring-red-400"
                            : "border-gray-300 focus:ring-blue-500"
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {dniLoading && (
                          <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                        {dniStatus === "found" && !dniLoading && (
                          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {dniStatus === "not_found" && !dniLoading && (
                          <span className="text-amber-400 text-sm">●</span>
                        )}
                      </div>
                    </div>
                    {dniStatus === "found" && dniPaciente && (
                      <p className="text-xs text-green-600 mt-1 font-medium">
                        {toTitleCase(dniPaciente.apellido)}, {toTitleCase(dniPaciente.nombre)}
                        {dniPaciente.obraSocial && !dniPaciente.esParticular
                          ? ` · ${toTitleCase(dniPaciente.obraSocial)}`
                          : " · Particular"}
                        <span className="text-gray-400 font-normal ml-1">
                          ({dniFuente === "geclisa" ? "GECLISA" : "local"})
                        </span>
                      </p>
                    )}
                  </div>

                  <FormInput label="Teléfono" value={form.telefono} onChange={(v) => updateField("telefono", v)} />
                  <FormInput label="Fecha Nacimiento" type="date" value={form.fechaNacimiento} onChange={(v) => updateField("fechaNacimiento", v)} />
                  <FormInput label="Obra Social" value={form.obraSocial} onChange={(v) => updateField("obraSocial", toTitleCase(v))} />
                  <FormInput label="Nro. Afiliado" value={form.numeroAfiliado} onChange={(v) => updateField("numeroAfiliado", v)} />
                  <div className="flex items-center gap-6 pt-6">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.circuloMedico}
                        onChange={(e) => updateField("circuloMedico", e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 font-medium">Círculo Médico (8%)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.montoBase8}
                        onChange={(e) => updateField("montoBase8", e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-gray-700 font-medium">Monto Base (8%)</span>
                    </label>
                  </div>
                </div>
              </Section>

              {/* Section 2: Tratamiento */}
              <Section icon="🏥" title="Tratamiento">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 relative" ref={prestComboRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Prestación *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar por código o nombre..."
                        value={prestOpen ? prestSearch : (selectedPrestacion ? `${selectedPrestacion.codigo} - ${selectedPrestacion.practica}` : prestSearch)}
                        onChange={(e) => {
                          setPrestSearch(e.target.value);
                          if (!prestOpen) setPrestOpen(true);
                          if (form.prestacionCodigo && e.target.value !== `${selectedPrestacion?.codigo} - ${selectedPrestacion?.practica}`) {
                            updateField("prestacionCodigo", "" as any);
                          }
                        }}
                        onFocus={() => {
                          setPrestOpen(true);
                          if (selectedPrestacion) {
                            setPrestSearch("");
                          }
                        }}
                        className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-20 ${
                          selectedPrestacion ? "border-blue-300 bg-blue-50/30 text-gray-900" : "border-gray-300 bg-white text-gray-900"
                        }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {selectedPrestacion && (
                          <button
                            type="button"
                            onClick={() => {
                              updateField("prestacionCodigo", "" as any);
                              setPrestSearch("");
                              setPrestOpen(false);
                            }}
                            className="text-gray-400 hover:text-red-500 p-1"
                            title="Limpiar"
                          >
                            ✕
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPrestOpen(!prestOpen)}
                          className="text-gray-400 hover:text-gray-600 p-1"
                        >
                          <svg className={`w-4 h-4 transition-transform ${prestOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Dropdown */}
                    {prestOpen && (
                      <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                        {filteredPrestByGroup.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-400">Sin resultados para "{prestSearch}"</div>
                        ) : (
                          filteredPrestByGroup.map(([gid, group]) => (
                            <div key={gid}>
                              <div className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-gray-50 uppercase tracking-wider sticky top-0 border-b border-gray-100" style={{ color: group.color }}>
                                {group.nombre}
                              </div>
                              {group.items.map((p) => (
                                <button
                                  key={p.codigo}
                                  type="button"
                                  onClick={() => {
                                    updateField("prestacionCodigo", p.codigo as any);
                                    setPrestSearch("");
                                    setPrestOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 ${
                                    form.prestacionCodigo === p.codigo ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                                  }`}
                                >
                                  <span className="truncate">
                                    <span className="font-mono text-xs text-gray-400 mr-2">{p.codigo}</span>
                                    {p.practica}
                                  </span>
                                  {parseFloat(String(p.precio)) > 0 && (
                                    <span className="text-xs text-green-600 font-medium whitespace-nowrap">USD {p.precio}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {selectedPrestacion && (
                      <p className="text-xs text-blue-600 mt-1.5 font-medium">
                        💰 Precio: {fmtUSD(parseFloat(String(selectedPrestacion.precio)))}
                      </p>
                    )}
                  </div>
                  <FormSelect
                    label="Ojo a tratar"
                    value={form.ojoTratar}
                    onChange={(v) => updateField("ojoTratar", v)}
                    options={[
                      { value: "", label: "Seleccionar..." },
                      { value: "derecho", label: "Derecho" },
                      { value: "izquierdo", label: "Izquierdo" },
                      { value: "ambos", label: "Ambos" },
                    ]}
                  />
                  <FormSelect
                    label="Cirujano *"
                    value={form.cirujano}
                    onChange={(v) => updateField("cirujano", v)}
                    options={[{ value: "", label: "Seleccionar..." }, ...cirujanos]}
                  />
                  <FormSelect
                    label="Derivador"
                    value={form.derivador}
                    onChange={(v) => updateField("derivador", v)}
                    options={DERIVADORES}
                  />
                  <FormSelect
                    label="Administrativa *"
                    value={form.administrativa}
                    onChange={(v) => updateField("administrativa", v)}
                    options={[{ value: "", label: "Seleccionar..." }, ...ADMINISTRATIVAS]}
                  />
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Info adicional
                    </label>
                    <textarea
                      value={form.infoAdicional}
                      onChange={(e) => updateField("infoAdicional", e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Observaciones del tratamiento..."
                    />
                  </div>
                </div>

                {/* ── Tratamientos adicionales ── */}
                {form.tratamientosExtra.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {form.tratamientosExtra.map((t, i) => (
                      <TratamientoExtraCard
                        key={t.id}
                        item={t}
                        index={i}
                        prestacionesByGroup={prestacionesByGroup}
                        preciosMap={preciosMap}
                        onUpdate={updateTratamientoExtra}
                        onRemove={removeTratamientoExtra}
                      />
                    ))}
                  </div>
                )}

                {/* Botón agregar tratamiento */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={addTratamientoExtra}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Agregar prestación
                  </button>
                </div>
              </Section>

              {/* Section 3: Precios */}
              <Section icon="💰" title="Precios y Costos">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Monto USD {form.tratamientosExtra.length > 0 ? "(Trat. 1)" : ""}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.montoUSD || ""}
                      onChange={(e) => updateField("montoUSD", parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Tipo Cambio{" "}
                      <button
                        onClick={fetchTC}
                        disabled={tcLoading}
                        className="text-blue-600 hover:text-blue-800 text-xs font-semibold ml-1 disabled:opacity-50"
                      >
                        {tcLoading ? "⏳" : "🔄"} {tcLoading ? "Cargando..." : "Actualizar"}
                      </button>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tipoCambio || ""}
                      onChange={(e) =>
                        updateField("tipoCambio", parseFloat(e.target.value) || DEFAULT_TC)
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {tcData && (
                      <p className="text-xs text-gray-400 mt-1">
                        {tcData.fuente || "BCRA"} vendedor · {tcLastUpdate ? new Date(tcLastUpdate).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Cobertura OS (ARS)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={form.coberturaOS || ""}
                      onChange={(e) => updateField("coberturaOS", parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Descuento (%)
                    </label>
                    <select
                      value={form.porcentajeDescuento}
                      onChange={(e) => updateField("porcentajeDescuento", parseInt(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      {[0, 5, 10, 15, 20, 25, 30].map((d) => (
                        <option key={d} value={d}>
                          {d}%
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Total USD combinado — visible siempre cuando hay extras */}
                {form.tratamientosExtra.length > 0 && (
                  <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">
                        Total USD ({1 + form.tratamientosExtra.length} tratamientos)
                      </span>
                      <span className="text-blue-500 text-xs">
                        = USD {fmtARS(form.montoUSD)} {form.tratamientosExtra.map((t, i) => `+ USD ${fmtARS(t.montoUSD || 0)}`).join(" ")}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-blue-700">
                      USD {fmtARS(totalMontoUSD)}
                    </span>
                  </div>
                )}
              </Section>

              {/* Section 4: Insumos */}
              <Section icon="💊" title="Insumos Especiales">
                <div className="flex gap-2 mb-3">
                  {/* Toggle ARS / USD */}
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setNewInsumoMoneda("ARS")}
                      className={`px-3 py-2 text-xs font-semibold transition-colors ${newInsumoMoneda === "ARS" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      ARS
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewInsumoMoneda("USD")}
                      className={`px-3 py-2 text-xs font-semibold transition-colors ${newInsumoMoneda === "USD" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      USD
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Descripción del insumo"
                    value={newInsumoDesc}
                    onChange={(e) => setNewInsumoDesc(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="number"
                    placeholder={`Monto ${newInsumoMoneda}`}
                    value={newInsumoMonto}
                    onChange={(e) => setNewInsumoMonto(e.target.value)}
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={addInsumo}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                  >
                    + Agregar
                  </button>
                </div>
                {/* Preview conversión cuando es USD */}
                {newInsumoMoneda === "USD" && newInsumoMonto && parseArgNum(newInsumoMonto) > 0 && (
                  <p className="text-xs text-blue-600 mb-2">
                    = {fmtPesos(parseArgNum(newInsumoMonto) * (form.tipoCambio || DEFAULT_TC))} al TC actual
                  </p>
                )}
                {form.insumos.length > 0 && (
                  <div className="space-y-1.5">
                    {form.insumos.map((ins) => (
                      <div
                        key={ins.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                      >
                        <span className="text-sm text-gray-700">{ins.descripcion}</span>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-sm font-semibold text-gray-900">
                              {fmtPesos(ins.monto)}
                            </span>
                            {ins.moneda === "USD" && (
                              <p className="text-xs text-blue-500">
                                USD {fmtARS(ins.montoOriginal)}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removeInsumo(ins.id)}
                            className="text-red-400 hover:text-red-600 text-sm font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Section 5: Servicios & Pago */}
              <div className="grid grid-cols-2 gap-4">
                <Section icon="🛎️" title="Servicios Incluidos">
                  <div className="space-y-2.5">
                    {SERVICIOS.map((s) => (
                      <label key={s.id} className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.servicios.includes(s.id)}
                          onChange={() => toggleArrayItem("servicios", s.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </Section>
                <Section icon="💳" title="Formas de Pago">
                  <div className="space-y-2.5">
                    {FORMAS_PAGO.map((f) => (
                      <label key={f.id} className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.formasPago.includes(f.id)}
                          onChange={() => toggleArrayItem("formasPago", f.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </Section>
              </div>

              {/* Section 6: Contacto */}
              <Section icon="📞" title="Contacto">
                <div className="grid grid-cols-3 gap-4">
                  <FormSelect
                    label="Método preferido"
                    value={form.metodoContacto}
                    onChange={(v) => updateField("metodoContacto", v)}
                    options={[
                      { value: "whatsapp", label: "WhatsApp" },
                      { value: "telefono", label: "Teléfono" },
                      { value: "email", label: "Email" },
                    ]}
                  />
                  <FormSelect
                    label="Horario"
                    value={form.horario}
                    onChange={(v) => updateField("horario", v)}
                    options={[
                      { value: "manana", label: "Mañana" },
                      { value: "tarde", label: "Tarde" },
                      { value: "noche", label: "Noche" },
                    ]}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Comentarios
                    </label>
                    <input
                      value={form.comentarios}
                      onChange={(e) => updateField("comentarios", e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Observaciones..."
                    />
                  </div>
                </div>
              </Section>
            </div>

            {/* RIGHT: Desglose + Actions */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sticky top-4">
                <h3 className="text-sm font-bold text-gray-800 text-center mb-4 pb-3 border-b border-gray-100 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  DESGLOSE
                </h3>

                <div className="space-y-2 text-sm">
                  <DesgRow label="Monto base" value={fmtUSD(calcs.montoOriginalUSD)} />

                  {(form.circuloMedico && form.coberturaOS > 0 || form.montoBase8) && (
                    <>
                      {form.circuloMedico && form.coberturaOS > 0 && (
                        <DesgRow label="Gastos Círculo (8%)" value={`+${fmtUSD(calcs.gastosCirculoUSD)}`} className="text-amber-600" />
                      )}
                      {form.montoBase8 && (
                        <DesgRow label="Monto Base (8%)" value={`+${fmtUSD(calcs.gastosMontoBase8USD)}`} className="text-amber-600" />
                      )}
                      <DesgRow label="Subtotal USD" value={fmtUSD(calcs.subtotalUSD)} bold />
                    </>
                  )}

                  <div className="border-t border-gray-100 my-2" />
                  <DesgRow label="Tipo de cambio" value={fmtPesos(form.tipoCambio)} className="text-gray-400" />
                  <DesgRow label="Subtotal ARS" value={fmtPesos(calcs.subtotalOriginal)} />

                  {form.coberturaOS > 0 && (
                    <DesgRow label="Cobertura OS" value={`-${fmtPesos(form.coberturaOS)}`} className="text-green-600" />
                  )}
                  <DesgRow label="Después de cobertura" value={fmtPesos(calcs.subtotalDespuesCobertura)} />

                  {form.porcentajeDescuento > 0 && (
                    <DesgRow
                      label={`Descuento (${form.porcentajeDescuento}%)`}
                      value={`-${fmtPesos(calcs.descuento)}`}
                      className="text-orange-500"
                    />
                  )}

                  {form.insumos.length > 0 && (
                    <>
                      {form.insumos.map((ins) => (
                        <div key={ins.id} className="flex justify-between items-baseline">
                          <span className="text-gray-500 text-xs truncate max-w-[60%]">+ {ins.descripcion}</span>
                          <div className="text-right">
                            <span className="text-gray-700 tabular-nums text-sm">{fmtPesos(ins.monto)}</span>
                            {ins.moneda === "USD" && (
                              <p className="text-blue-400 text-xs">USD {fmtARS(ins.montoOriginal)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  <div className="border-t border-gray-100 my-2" />
                  <DesgRow label="Neto" value={fmtPesos(calcs.neto)} bold />
                  <DesgRow label="IVA (21%)" value={`+${fmtPesos(calcs.iva)}`} className="text-gray-400" />

                  <div className="border-t-2 border-blue-200 pt-3 mt-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-base font-bold text-gray-700">TOTAL</span>
                      <span className="text-2xl font-bold text-blue-600">{fmtPesos(calcs.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-6 space-y-2.5">
                  <button
                    onClick={guardar}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Guardando...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        {editMode ? "Actualizar Presupuesto" : "Guardar Presupuesto"}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowPreview(true)}
                    className="w-full bg-white hover:bg-gray-50 text-gray-700 py-2.5 rounded-lg transition-colors text-sm font-medium border border-gray-300 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Vista Previa
                  </button>
                  <button
                    onClick={resetForm}
                    className="w-full text-gray-400 hover:text-gray-600 py-2 rounded-lg transition-colors text-sm"
                  >
                    Limpiar Formulario
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </>)}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══ ANÁLISIS SECTION ═══ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {section === "analisis" && (
        <>
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-5">
            <div className="flex items-center gap-4 max-w-[1600px] mx-auto">
              <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Análisis de Presupuestos</h1>
                <p className="text-sm text-gray-500">Panel de control y métricas</p>
              </div>
            </div>
          </div>

          <div className="max-w-[1600px] mx-auto p-6 space-y-5">
            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "Total", value: analisisStats.total, color: "bg-slate-700", textColor: "text-white" },
                { label: "Borradores", value: analisisStats.borrador, color: "bg-gray-100", textColor: "text-gray-700", icon: "📝" },
                { label: "Entregados", value: analisisStats.entregado, color: "bg-blue-50", textColor: "text-blue-700", icon: "📤" },
                { label: "Practicados", value: analisisStats.practicado, color: "bg-green-50", textColor: "text-green-700", icon: "✅" },
                { label: "Cancelados", value: analisisStats.cancelado, color: "bg-red-50", textColor: "text-red-700", icon: "❌" },
                { label: "Conversión", value: `${conversionRate.toFixed(1)}%`, color: "bg-indigo-50", textColor: "text-indigo-700", isText: true },
                { label: "Monto Total", value: fmtPesos(analisisStats.montoTotal), color: "bg-emerald-50", textColor: "text-emerald-700", isText: true },
              ].map((kpi, i) => (
                <div key={i} className={`${kpi.color} rounded-xl p-3 text-center`}>
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-1">{kpi.label}</p>
                  <p className={`text-lg font-bold ${kpi.textColor}`}>
                    {"icon" in kpi && kpi.icon ? `${kpi.icon} ` : ""}
                    {"isText" in kpi && kpi.isText ? kpi.value : typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* ── FILTERS ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Paciente / Nº</label>
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={analisisFilters.paciente}
                    onChange={(e) => setAnalisisFilters((f) => ({ ...f, paciente: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && applyAnalisisFilters()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Estado</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={analisisFilters.estado}
                    onChange={(e) => setAnalisisFilters((f) => ({ ...f, estado: e.target.value as EstadoPresupuesto | "" }))}
                  >
                    <option value="">Todos</option>
                    <option value="borrador">Borrador</option>
                    <option value="entregado">Entregado</option>
                    <option value="practicado">Practicado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Desde</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={analisisFilters.fechaDesde}
                    onChange={(e) => setAnalisisFilters((f) => ({ ...f, fechaDesde: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Hasta</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={analisisFilters.fechaHasta}
                    onChange={(e) => setAnalisisFilters((f) => ({ ...f, fechaHasta: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Prestación</label>
                  <input
                    type="text"
                    placeholder="Descripción..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={analisisFilters.prestacion}
                    onChange={(e) => setAnalisisFilters((f) => ({ ...f, prestacion: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && applyAnalisisFilters()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Cirujano</label>
                  <input
                    type="text"
                    placeholder="Nombre..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={analisisFilters.cirujano}
                    onChange={(e) => setAnalisisFilters((f) => ({ ...f, cirujano: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && applyAnalisisFilters()}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={applyAnalisisFilters}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    Buscar
                  </button>
                  <button
                    onClick={clearAnalisisFilters}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
                    title="Limpiar filtros"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* ── TABLE ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-5 py-3 flex items-center justify-between">
                <span className="font-semibold text-sm">Presupuestos Registrados</span>
                <span className="text-xs bg-white/20 px-3 py-1 rounded-full">
                  {analisisTotal} resultado{analisisTotal !== 1 ? "s" : ""}
                </span>
              </div>

              {analisisLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  <span className="ml-3 text-gray-500 text-sm">Cargando...</span>
                </div>
              ) : analisisData.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-gray-400 text-lg">No se encontraron presupuestos</p>
                  <p className="text-gray-300 text-sm mt-1">Ajustá los filtros para ver resultados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Nº</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Fecha</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Paciente</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">DNI</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Obra Social</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Prestación</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Ojo</th>
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Cirujano</th>
                        <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">USD</th>
                        <th className="text-right px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Total ARS</th>
                        <th className="text-center px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Estado</th>
                        <th className="text-center px-3 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {analisisData.map((p) => {
                        const est = ESTADOS[p.estado] || ESTADOS.borrador;
                        const dc = p.datos_completos || {};
                        const obraSocial = dc.paciente?.obraSocial || "";
                        const ojo = dc.tratamiento?.ojoTratar || "";
                        const montoUSD = parseFloat(String(p.monto_usd)) || 0;
                        const totalFinal = parseFloat(String(p.total_final)) || 0;
                        return (
                          <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="px-3 py-2.5 font-mono text-blue-600 font-semibold text-xs whitespace-nowrap">
                              {p.numero_presupuesto}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                              {fmtFecha(p.fecha_creacion)}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                              {p.paciente_apellido}, {p.paciente_nombre}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">{p.paciente_documento}</td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs max-w-[120px] truncate" title={obraSocial}>
                              {obraSocial || "-"}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 text-xs max-w-[180px] truncate" title={p.prestacion_descripcion}>
                              {p.prestacion_descripcion || p.prestacion_codigo}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs text-center">{ojo || "-"}</td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{p.cirujano || "-"}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600 font-mono text-xs whitespace-nowrap">
                              {montoUSD > 0 ? `USD ${fmtARS(montoUSD)}` : "-"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 font-mono text-xs whitespace-nowrap">
                              $ {fmtARS(totalFinal)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${est.bg} ${est.text}`}>
                                {est.icon} {est.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => { cargarPresupuesto(p); setSection("form"); }}
                                  className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-md transition-colors"
                                  title="Editar"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                {p.estado === "borrador" && (
                                  <button
                                    onClick={() => { cambiarEstado(p.id, "entregado"); setTimeout(() => { loadAnalisis(analisisPage); loadAnalisisStats(); }, 300); }}
                                    className="text-blue-500 hover:bg-blue-100 p-1.5 rounded-md transition-colors"
                                    title="Marcar entregado"
                                  >📤</button>
                                )}
                                {p.estado === "entregado" && (
                                  <button
                                    onClick={() => { cambiarEstado(p.id, "practicado"); setTimeout(() => { loadAnalisis(analisisPage); loadAnalisisStats(); }, 300); }}
                                    className="text-green-500 hover:bg-green-100 p-1.5 rounded-md transition-colors"
                                    title="Marcar practicado"
                                  >✅</button>
                                )}
                                {p.estado !== "cancelado" && (
                                  <button
                                    onClick={() => { cambiarEstado(p.id, "cancelado"); setTimeout(() => { loadAnalisis(analisisPage); loadAnalisisStats(); }, 300); }}
                                    className="text-red-400 hover:bg-red-100 p-1.5 rounded-md transition-colors"
                                    title="Cancelar"
                                  >❌</button>
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

              {/* Pagination */}
              {analisisTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-4 border-t border-gray-100">
                  <button
                    disabled={analisisPage <= 1}
                    onClick={() => loadAnalisis(analisisPage - 1)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    ← Anterior
                  </button>
                  {Array.from({ length: Math.min(analisisTotalPages, 7) }, (_, i) => {
                    let pg: number;
                    if (analisisTotalPages <= 7) {
                      pg = i + 1;
                    } else if (analisisPage <= 4) {
                      pg = i + 1;
                    } else if (analisisPage >= analisisTotalPages - 3) {
                      pg = analisisTotalPages - 6 + i;
                    } else {
                      pg = analisisPage - 3 + i;
                    }
                    return (
                      <button
                        key={pg}
                        onClick={() => loadAnalisis(pg)}
                        className={`w-9 h-9 text-sm rounded-lg font-medium transition-colors ${
                          pg === analisisPage
                            ? "bg-blue-600 text-white"
                            : "border border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    disabled={analisisPage >= analisisTotalPages}
                    onClick={() => loadAnalisis(analisisPage + 1)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      </div>{/* close content wrapper */}

      {/* ═══ PREVIEW MODAL ═══ */}
      {showPreview && (
        <PreviewModal
          form={form}
          calcs={calcs}
          prestaciones={prestaciones}
          numeroPresupuesto={presupuestoNumero ?? undefined}
          estadoPresupuesto={presupuestoEstado ?? undefined}
          adminTelefonoMap={adminTelefonoMap}
          yaGuardado={yaGuardado}
          datosGuardados={datosGuardados}
          loading={loading}
          onGuardar={guardar}
          onClose={() => setShowPreview(false)}
        />
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

interface SectionProps {
  icon: string;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2 pb-2 border-b border-gray-100">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function FormInput({ label, value, onChange, placeholder, type = "text" }: FormInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}

function FormSelect({ label, value, onChange, options }: FormSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface DesgRowProps {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}

function DesgRow({ label, value, bold, className = "" }: DesgRowProps) {
  return (
    <div className={`flex justify-between items-baseline ${className}`}>
      <span className={bold ? "font-semibold text-gray-800" : "text-gray-500"}>{label}</span>
      <span className={`${bold ? "font-bold text-gray-900" : "text-gray-700"} tabular-nums`}>
        {value}
      </span>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// TRATAMIENTO EXTRA CARD - Sub-componente para tratamientos adicionales
// ═══════════════════════════════════════════════════════════════
interface TratamientoExtraCardProps {
  item: TratamientoExtra;
  index: number;
  prestacionesByGroup: Array<[string, GroupedPrestaciones]>;
  preciosMap: Record<string, number>;
  onUpdate: (id: string, field: keyof TratamientoExtra, value: string | number) => void;
  onRemove: (id: string) => void;
}

function TratamientoExtraCard({ item, index, prestacionesByGroup, preciosMap, onUpdate, onRemove }: TratamientoExtraCardProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  const selectedPrest = useMemo(() => {
    for (const [, group] of prestacionesByGroup) {
      const found = group.items.find((p) => p.codigo === item.prestacionCodigo);
      if (found) return found;
    }
    return null;
  }, [prestacionesByGroup, item.prestacionCodigo]);

  const filtered = useMemo(() => {
    if (!search.trim()) return prestacionesByGroup;
    const q = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return prestacionesByGroup
      .map(([gid, group]) => {
        const items = group.items.filter((p) => {
          const text = `${p.codigo} ${p.practica}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return text.includes(q);
        });
        return [gid, { ...group, items }] as [string, GroupedPrestaciones];
      })
      .filter(([, g]) => g.items.length > 0);
  }, [prestacionesByGroup, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
          Tratamiento {index + 2}
        </span>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
          title="Eliminar tratamiento"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Prestación combobox */}
        <div className="col-span-2 relative" ref={comboRef}>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Prestación</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={open ? search : (selectedPrest ? `${selectedPrest.codigo} - ${selectedPrest.practica}` : search)}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!open) setOpen(true);
                if (item.prestacionCodigo && e.target.value !== `${selectedPrest?.codigo} - ${selectedPrest?.practica}`) {
                  onUpdate(item.id, "prestacionCodigo", "");
                }
              }}
              onFocus={() => { setOpen(true); if (selectedPrest) setSearch(""); }}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-16 ${
                selectedPrest ? "border-blue-300 bg-blue-50/30 text-gray-900" : "border-gray-300 bg-white text-gray-900"
              }`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {selectedPrest && (
                <button type="button" onClick={() => { onUpdate(item.id, "prestacionCodigo", ""); setSearch(""); setOpen(false); }}
                  className="text-gray-400 hover:text-red-500 p-1">✕</button>
              )}
              <button type="button" onClick={() => setOpen(!open)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
          {open && (
            <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">Sin resultados</div>
              ) : (
                filtered.map(([gid, group]) => (
                  <div key={gid}>
                    <div className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-gray-50 uppercase tracking-wider sticky top-0 border-b border-gray-100" style={{ color: group.color }}>
                      {group.nombre}
                    </div>
                    {group.items.map((p) => (
                      <button key={p.codigo} type="button"
                        onClick={() => {
                          onUpdate(item.id, "prestacionCodigo", p.codigo);
                          if (preciosMap[p.codigo] !== undefined) onUpdate(item.id, "montoUSD", preciosMap[p.codigo]);
                          setSearch(""); setOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2 ${
                          item.prestacionCodigo === p.codigo ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                        }`}
                      >
                        <span className="truncate">
                          <span className="font-mono text-xs text-gray-400 mr-2">{p.codigo}</span>{p.practica}
                        </span>
                        {parseFloat(String(p.precio)) > 0 && (
                          <span className="text-xs text-green-600 font-medium whitespace-nowrap">USD {p.precio}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
          {selectedPrest && (
            <p className="text-xs text-blue-600 mt-1.5 font-medium">
              💰 Precio: USD {fmtARS(parseFloat(String(selectedPrest.precio)))}
            </p>
          )}
        </div>

        {/* Ojo a tratar */}
        <FormSelect label="Ojo a tratar" value={item.ojoTratar}
          onChange={(v) => onUpdate(item.id, "ojoTratar", v)}
          options={[
            { value: "", label: "Seleccionar..." },
            { value: "derecho", label: "Derecho" },
            { value: "izquierdo", label: "Izquierdo" },
            { value: "ambos", label: "Ambos" },
          ]}
        />

        {/* Cirujano — solo lectura, hereda del tratamiento principal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Cirujano</label>
          <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-600 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>{CIRUJANOS_FALLBACK.find((c) => c.value === item.cirujano)?.label || item.cirujano || "—"}</span>
          </div>
        </div>

        {/* Derivador */}
        <FormSelect label="Derivador" value={item.derivador}
          onChange={(v) => onUpdate(item.id, "derivador", v)}
          options={DERIVADORES}
        />

        {/* Monto USD */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Monto USD</label>
          <input type="number" step="0.01" value={item.montoUSD || ""}
            onChange={(e) => onUpdate(item.id, "montoUSD", parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Info adicional */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Info adicional</label>
          <textarea value={item.infoAdicional}
            onChange={(e) => onUpdate(item.id, "infoAdicional", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Observaciones..."
          />
        </div>
      </div>
    </div>
  );
}

interface PreviewModalProps {
  form: FormState;
  calcs: CalculosResult;
  prestaciones: Prestacion[];
  numeroPresupuesto?: string;
  estadoPresupuesto?: EstadoPresupuesto;
  adminTelefonoMap: Record<string, string>;
  yaGuardado: boolean;
  datosGuardados: DatosCompletos | null;
  loading: boolean;
  onGuardar: () => void;
  onClose: () => void;
}

function PreviewModal({ form, calcs, prestaciones, numeroPresupuesto, estadoPresupuesto, adminTelefonoMap, yaGuardado, datosGuardados, loading, onGuardar, onClose }: PreviewModalProps) {
  const prestDesc = prestaciones.find((p) => p.codigo === form.prestacionCodigo)?.practica || "";
  const cirujanoLabel = CIRUJANOS_FALLBACK.find((c) => c.value === form.cirujano)?.label || form.cirujano;
  const adminLabel =
    ADMINISTRATIVAS.find((a) => a.value === form.administrativa)?.label || form.administrativa;

  // Buscar teléfono: primero por value exacto, luego por nombre normalizado
  const adminNombreNorm = adminLabel
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
  const adminTelefono = adminTelefonoMap[form.administrativa]
    ?? adminTelefonoMap[adminNombreNorm]
    ?? "";

  const openPrintWindow = (autoPrint: boolean) => {
    const w = window.open("", "_blank");
    if (!w) {
      alert("El navegador bloqueó la ventana emergente. Por favor permitila para este sitio.");
      return;
    }

    // ── Fuente de datos ──
    // Si está guardado: usar el snapshot de DB (datosGuardados) → garantiza que
    // el PDF coincide exactamente con lo almacenado.
    // Si es vista previa sin guardar: usar el form en memoria.
    const src = yaGuardado && datosGuardados ? datosGuardados : null;

    const srcPrecios = src?.precios ?? {};
    const srcPaciente = src?.paciente ?? {};
    const srcTratamiento = src?.tratamiento ?? {};
    const srcInsumos = src?.insumos ?? form.insumos;
    const srcServicios = src?.servicios ?? form.servicios.map((s) => ({ codigo: s, descripcion: SERVICIOS.find((sv) => sv.id === s)?.label || s }));
    const srcExtras = src?.tratamientosExtra ?? form.tratamientosExtra;

    const tc = (srcPrecios as any).tipoCambio || form.tipoCambio || DEFAULT_TC;
    const freshCalcs = calcular({
      montoUSD: (srcPrecios as any).montoUSD ?? (form.montoUSD + form.tratamientosExtra.reduce((s, t) => s + (t.montoUSD || 0), 0)),
      tipoCambio: tc,
      coberturaOS: (srcPrecios as any).coberturaOS ?? form.coberturaOS,
      circuloMedico: srcPaciente.circuloMedico ?? form.circuloMedico,
      montoBase8: srcPaciente.montoBase8 ?? form.montoBase8,
      porcentajeDescuento: (srcPrecios as any).porcentajeDescuento ?? form.porcentajeDescuento,
      insumos: srcInsumos,
    });

    // Datos del paciente para el PDF
    const pdfApellido = (srcPaciente as any).apellido || toTitleCase(form.apellido);
    const pdfNombre = (srcPaciente as any).nombre || toTitleCase(form.nombre);
    const pdfDocumento = (srcPaciente as any).documento || form.documento;
    const pdfTelefono = (srcPaciente as any).telefono || form.telefono;
    const pdfFechaNac = (srcPaciente as any).fechaNacimiento || form.fechaNacimiento;
    const pdfObraSocial = (srcPaciente as any).obraSocial || toTitleCase(form.obraSocial);
    const pdfAfiliado = (srcPaciente as any).numeroAfiliado || form.numeroAfiliado;
    const pdfCoberturaOS = (srcPrecios as any).coberturaOS ?? form.coberturaOS;

    const pdfCirujanoValue = (srcTratamiento as any).cirujano || form.cirujano;
    const pdfCirujanoLabel = CIRUJANOS_FALLBACK.find((c) => c.value === pdfCirujanoValue)?.label || pdfCirujanoValue;
    const pdfAdminValue = (srcTratamiento as any).administrativa || form.administrativa;
    const pdfAdminLabel = ADMINISTRATIVAS.find((a) => a.value === pdfAdminValue)?.label || pdfAdminValue;
    const pdfAdminNormKey = pdfAdminLabel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
    const pdfAdminTel = adminTelefonoMap[pdfAdminValue] ?? adminTelefonoMap[pdfAdminNormKey] ?? "";
    const pdfDerivadorValue = (srcTratamiento as any).derivador || form.derivador;
    const pdfDerivadorLabel = DERIVADORES.find((d) => d.value === pdfDerivadorValue)?.label || pdfDerivadorValue || "";
    const pdfPrestDesc = (srcTratamiento as any).prestacionDescripcion || prestaciones.find((p) => p.codigo === ((srcTratamiento as any).prestacionCodigo || form.prestacionCodigo))?.practica || "";
    const pdfOjo = (srcTratamiento as any).ojoTratar || form.ojoTratar;

    // Fecha: usar fecha de creación guardada, no la actual
    const fechaCreacionGuardada = (src as any)?.fechaCreacion || null;
    const fechaStr = fechaCreacionGuardada
      ? new Date(fechaCreacionGuardada).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

    const numeroStr = numeroPresupuesto || "NUEVO";
    const estadoStr = estadoPresupuesto ? (ESTADOS[estadoPresupuesto]?.label.toUpperCase() ?? "BORRADOR") : "BORRADOR";

    const serviciosParaPDF = srcServicios.map((s: any) => typeof s === "string"
      ? SERVICIOS.find((sv) => sv.id === s)?.label || s
      : s.descripcion
    ).filter(Boolean);

    const serviciosHTML = serviciosParaPDF.length > 0
      ? `<div class="pdf-section">
          <div class="pdf-section-title">Servicios Incluidos</div>
          <ul class="servicios-list">
            ${serviciosParaPDF.map((s: string) => `<li>${s}</li>`).join("")}
          </ul>
        </div>`
      : "";

    const pdfTitle = `${pdfDocumento || "Sin-DNI"} - ${pdfApellido || "Paciente"}, ${pdfNombre || ""}`.trim();

    const tieneCobertura = pdfCoberturaOS > 0;
    const tieneInsumos = freshCalcs.totalInsumos > 0;
    const tieneDescuento = freshCalcs.descuento > 0;
    const tieneExtras = srcExtras.length > 0;

    const pdfStyles = `
      * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
      body { background: white; color: #111827; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      .pdf-header { background: #1e3a6e !important; color: white; padding: 22px 32px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .pdf-header h1 { font-size: 22px; font-weight: 800; letter-spacing: 2px; margin-bottom: 4px; color: white !important; }
      .pdf-header p { font-size: 11px; font-style: italic; color: #93c5fd; }

      .pdf-title-bar { background: #f0f6ff; border-bottom: 1px solid #dbeafe; padding: 8px 24px; text-align: center; }
      .pdf-title-bar h2 { color: #1e3a6e; font-size: 15px; font-weight: 700; letter-spacing: 1px; }

      .pdf-meta { display: flex; justify-content: space-between; padding: 7px 24px; background: #f8faff; border-bottom: 2px solid #dbeafe; font-size: 10px; }
      .pdf-meta .meta-item { display: flex; gap: 5px; }
      .pdf-meta strong { color: #1e3a6e; font-weight: 700; }

      .pdf-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 16px 24px; }

      .pdf-section { margin-bottom: 14px; }
      .pdf-section-title { color: #1e3a6e; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #dbeafe; padding-bottom: 4px; margin-bottom: 8px; }

      .pdf-field { display: flex; padding: 3px 0; font-size: 10px; border-bottom: 1px dotted #f3f4f6; align-items: flex-start; }
      .pdf-field-label { color: #6b7280; font-weight: 600; min-width: 110px; flex-shrink: 0; }
      .pdf-field-value { color: #111827; }

      .prestacion-box { background: #f9fafb; border: 1px solid #e5e7eb; border-left: 3px solid #1e3a6e; border-radius: 3px; padding: 6px 8px; font-size: 10px; color: #111827; margin: 4px 0 8px; font-weight: 500; line-height: 1.5; }

      .price-section-title { color: #1e3a6e; font-size: 13px; font-weight: 700; text-align: center; border-bottom: 2px solid #1e3a6e; padding-bottom: 6px; margin-bottom: 10px; }

      .price-table { width: 100%; border-collapse: collapse; }
      .price-table td { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
      .price-table td:last-child { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }

      .row-subtotal td { background: #eff6ff !important; font-weight: 700; color: #1e40af; border-top: 1px solid #dbeafe; border-bottom: 1px solid #dbeafe; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .row-gastos td { color: #d97706; }
      .row-cobertura td { color: #059669; }
      .row-despues td { background: #f0fdf4 !important; font-weight: 600; color: #166534; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .row-insumos td { color: #2563eb; }
      .row-descuento td { color: #ea580c; }
      .row-neto td { background: #f8faff !important; font-weight: 700; font-size: 12px; border-top: 2px solid #d1d5db !important; border-bottom: 2px solid #d1d5db !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .row-iva td { color: #6b7280; font-size: 10.5px; }
      .row-total td { background: #1e3a6e !important; color: white !important; font-weight: 800; font-size: 14px; border: none !important; white-space: nowrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

      .servicios-list { list-style: none; padding: 0; }
      .servicios-list li { font-size: 10px; padding: 2px 0; color: #374151; display: flex; align-items: center; gap: 6px; }
      .servicios-list li::before { content: "•"; color: #1e3a6e; font-size: 14px; line-height: 1; }

      .firmas-section { border-top: 1px solid #e5e7eb; padding: 20px 24px 16px; }
      .firmas-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 16px; text-align: center; }
      .firmas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; }
      .firma-box { text-align: center; }
      .firma-role { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1e3a6e; margin-bottom: 32px; }
      .firma-line { border-top: 1px solid #374151; padding-top: 6px; font-size: 10px; line-height: 1.6; color: #374151; }

      .preview-banner { background: #fef3c7; border: 2px solid #f59e0b; color: #92400e; text-align: center; padding: 8px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1px; display: flex; align-items: center; justify-content: center; gap: 8px; }
      .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 80px; font-weight: 900; color: rgba(245,158,11,0.10); pointer-events: none; white-space: nowrap; z-index: 0; letter-spacing: 8px; }
      @media print { .watermark { position: fixed; } }

      .no-print { padding: 12px 20px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; }
      @media print { .no-print { display: none !important; } }
    `;

    const pdfBody = `
      ${!yaGuardado ? `<div class="preview-banner">⚠️ VISTA PREVIA — Este documento no ha sido guardado y no es válido como presupuesto oficial</div>` : ""}
      ${!yaGuardado ? `<div class="watermark">VISTA PREVIA</div>` : ""}
      <div class="pdf-header">
        <h1>INSTITUTO DR. MERCADO</h1>
        <p>"Tu visión es nuestra misión"</p>
      </div>

      <div class="pdf-title-bar">
        <h2>PRESUPUESTO MÉDICO</h2>
      </div>

      <div class="pdf-meta">
        <div class="meta-item"><strong>Número:</strong> ${numeroStr}</div>
        <div class="meta-item"><strong>Fecha:</strong> ${fechaStr}</div>
      </div>

      <div class="pdf-columns">

        <!-- ── COLUMNA IZQUIERDA ── -->
        <div>

          <!-- Información del Paciente -->
          <div class="pdf-section">
            <div class="pdf-section-title">Información del Paciente</div>
            <div class="pdf-field">
              <span class="pdf-field-label">Nombre completo:</span>
              <span class="pdf-field-value">${pdfApellido}, ${pdfNombre}</span>
            </div>
            <div class="pdf-field">
              <span class="pdf-field-label">Documento:</span>
              <span class="pdf-field-value">${pdfDocumento || "-"}</span>
            </div>
            <div class="pdf-field">
              <span class="pdf-field-label">Teléfono:</span>
              <span class="pdf-field-value">${pdfTelefono || "-"}</span>
            </div>
            ${pdfFechaNac ? `
            <div class="pdf-field">
              <span class="pdf-field-label">Fecha de nacimiento:</span>
              <span class="pdf-field-value">${fmtFecha(pdfFechaNac)}</span>
            </div>` : ""}
            <div class="pdf-field">
              <span class="pdf-field-label">Obra Social:</span>
              <span class="pdf-field-value">${pdfObraSocial || "Particular"}</span>
            </div>
            ${pdfAfiliado ? `
            <div class="pdf-field">
              <span class="pdf-field-label">Nro. Afiliado:</span>
              <span class="pdf-field-value">${pdfAfiliado}</span>
            </div>` : ""}
          </div>

          <!-- Información del Tratamiento -->
          <div class="pdf-section">
            <div class="pdf-section-title">Información del Tratamiento</div>
            <div style="margin-bottom:6px;">
              <div style="font-size:9px;font-weight:700;color:#6b7280;margin-bottom:3px;">Prestación:</div>
              <div class="prestacion-box">${
                tieneExtras
                  ? `${pdfPrestDesc}${srcExtras.map((t: TratamientoExtra) => {
                      const pD = prestaciones.find((p) => p.codigo === t.prestacionCodigo)?.practica || t.prestacionCodigo || "";
                      return (pD && pD !== pdfPrestDesc) ? `<br>• ${pD}` : "";
                    }).join("")}`
                  : (pdfPrestDesc || "-")
              }</div>
            </div>
            <div class="pdf-field">
              <span class="pdf-field-label">Cirujano:</span>
              <span class="pdf-field-value">${pdfCirujanoLabel}</span>
            </div>
            <div class="pdf-field">
              <span class="pdf-field-label">Ojo a tratar:</span>
              <span class="pdf-field-value">${pdfOjo ? pdfOjo.charAt(0).toUpperCase() + pdfOjo.slice(1) : "-"}</span>
            </div>
            ${pdfDerivadorLabel ? `
            <div class="pdf-field">
              <span class="pdf-field-label">Derivador:</span>
              <span class="pdf-field-value">${pdfDerivadorLabel}</span>
            </div>` : ""}
            ${pdfAdminLabel ? `
            <div class="pdf-field">
              <span class="pdf-field-label">Administrativa:</span>
              <span class="pdf-field-value">${pdfAdminLabel}</span>
            </div>` : ""}
          </div>

          <!-- Servicios Incluidos -->
          ${serviciosHTML}

        </div>

        <!-- ── COLUMNA DERECHA: Detalle de Precios ── -->
        <div>
          <div class="price-section-title">Detalle de Precios</div>
          <table class="price-table">
            <tbody>

              <!-- Monto USD con IVA incluido -->
              ${tieneExtras
                ? `<tr><td>Trat. 1 — ${pdfPrestDesc || "Prestación"}</td><td>${fmtUSD((srcPrecios as any).montoUSD ?? form.montoUSD)}</td></tr>
                  ${srcExtras.map((t: TratamientoExtra, i: number) => {
                    const pD = prestaciones.find((p) => p.codigo === t.prestacionCodigo)?.practica || t.prestacionCodigo || "Prestación";
                    return `<tr><td>Trat. ${i + 2} — ${pD}</td><td>${fmtUSD(t.montoUSD || 0)}</td></tr>`;
                  }).join("")}
                  <tr class="row-subtotal"><td><strong>Monto en USD (IVA inc.):</strong></td><td>${fmtUSD(freshCalcs.subtotalUSD * (1 + IVA_RATE))}</td></tr>`
                : `<tr><td><strong>Monto en USD (IVA inc.):</strong></td><td><strong>${fmtUSD(freshCalcs.subtotalUSD * (1 + IVA_RATE))}</strong></td></tr>`
              }

              <!-- Tipo de cambio -->
              <tr><td>Tipo de cambio:</td><td>${fmtPesos(tc)}</td></tr>

              <!-- Subtotal ARS con IVA -->
              <tr class="row-subtotal"><td><strong>SUBTOTAL ARS:</strong></td><td>${fmtPesos(freshCalcs.subtotalUSD * (1 + IVA_RATE) * tc)}</td></tr>

              <!-- Cobertura OS -->
              ${tieneCobertura
                ? `<tr class="row-cobertura"><td>Menos: Cobertura Obra Social:</td><td>- ${fmtPesos(pdfCoberturaOS)}</td></tr>`
                : ""}

              <!-- Descuento (sobre base, sin insumos) -->
              ${tieneDescuento
                ? `<tr class="row-descuento"><td>Descuento:</td><td>- ${fmtPesos(freshCalcs.descuento)}</td></tr>`
                : ""}

              <!-- Insumos especiales — uno por línea, excluidos del descuento -->
              ${tieneInsumos
                ? srcInsumos.map((ins: Insumo) =>
                    `<tr class="row-insumos"><td>+ ${ins.descripcion}${ins.moneda === "USD" ? ` <span style="font-size:9px;color:#93c5fd;">(USD ${fmtARS(ins.montoOriginal)})</span>` : ""}</td><td>+ ${fmtPesos(ins.monto)}</td></tr>`
                  ).join("")
                : ""}

              <!-- TOTAL A PAGAR -->
              <tr class="row-total"><td><strong>TOTAL A PAGAR:</strong></td><td>${fmtPesos(freshCalcs.total)}</td></tr>

            </tbody>
          </table>
        </div>

      </div>

      <!-- ── FIRMAS ── -->
      <div class="firmas-section">
        <div class="firmas-title">Firmas y Conformidad</div>
        <div class="firmas">
          <div class="firma-box">
            <div class="firma-role">Cirujano / Prestador</div>
            <div class="firma-line">${pdfCirujanoLabel}</div>
          </div>
          <div class="firma-box">
            <div class="firma-role">Paciente / Responsable</div>
            <div class="firma-line">${pdfApellido}, ${pdfNombre}<br>DNI: ${pdfDocumento || "-"}</div>
          </div>
          <div class="firma-box">
            <div class="firma-role">Administrativo/a</div>
            <div class="firma-line">${pdfAdminLabel || "-"}${pdfAdminTel ? `<br>Tel: ${pdfAdminTel}` : ""}</div>
          </div>
        </div>
      </div>
    `;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${pdfTitle}</title>
  <style>${pdfStyles}</style>
</head>
<body>
  <div class="no-print" style="display:flex;align-items:center;gap:12px;">
    <button onclick="window.print()" style="background:#1e3a6e;color:white;border:none;padding:10px 28px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨️ Imprimir / Guardar PDF</button>
    <button onclick="window.close()" style="padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;border:1px solid #d1d5db;background:white;">Cerrar</button>
    <span style="font-size:12px;color:#6b7280;">Para guardar como PDF: Imprimir → Destino → Guardar como PDF</span>
  </div>
  ${pdfBody}
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (autoPrint) {
      w.onload = () => { w.focus(); w.print(); };
    }
  };

  const handleSavePDF = () => openPrintWindow(false);
  const handlePrint = () => openPrintWindow(true);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Vista Previa del Presupuesto
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {!yaGuardado && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-amber-500 text-lg">⚠️</span>
              <div>
                <p className="font-semibold text-amber-800 text-xs uppercase tracking-wide">Vista previa — Sin guardar</p>
                <p className="text-amber-700 text-xs mt-0.5">Guardá el presupuesto para habilitar la impresión.</p>
              </div>
            </div>
          )}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Paciente
            </h4>
            <p className="font-semibold text-gray-900">
              {toTitleCase(form.apellido)}, {toTitleCase(form.nombre)} — DNI:{" "}
              {form.documento || "-"}
            </p>
            <p className="text-gray-500">
              OS: {toTitleCase(form.obraSocial) || "-"}{" "}
              {form.circuloMedico ? "· Círculo Médico ✓" : ""}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Tratamiento
            </h4>
            <p className="font-semibold text-gray-900">{prestDesc}</p>
            <p className="text-gray-500">
              {cirujanoLabel} · Ojo: {form.ojoTratar || "-"}
            </p>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Desglose
            </h4>
            <div className="space-y-1.5">
              <DesgRow label="Monto base" value={fmtUSD(calcs.montoOriginalUSD)} />
              {calcs.gastosCirculoUSD > 0 && (
                <DesgRow
                  label="Gastos Círculo (8%)"
                  value={`+${fmtUSD(calcs.gastosCirculoUSD)}`}
                  className="text-amber-600"
                />
              )}
              {calcs.gastosMontoBase8USD > 0 && (
                <DesgRow
                  label="Monto Base (8%)"
                  value={`+${fmtUSD(calcs.gastosMontoBase8USD)}`}
                  className="text-amber-600"
                />
              )}
              <DesgRow
                label={`× TC ${fmtPesos(form.tipoCambio)}`}
                value={fmtPesos(calcs.subtotalOriginal)}
              />
              {form.coberturaOS > 0 && (
                <DesgRow
                  label="Cobertura OS"
                  value={`-${fmtPesos(form.coberturaOS)}`}
                  className="text-green-600"
                />
              )}
              {form.porcentajeDescuento > 0 && (
                <DesgRow
                  label={`Descuento ${form.porcentajeDescuento}%`}
                  value={`-${fmtPesos(calcs.descuento)}`}
                  className="text-orange-500"
                />
              )}
              {form.insumos.length > 0 && (
                <>
                  {form.insumos.map((ins) => (
                    <div key={ins.id} className="flex justify-between items-baseline">
                      <span className="text-gray-500 text-xs truncate max-w-[60%]">+ {ins.descripcion}</span>
                      <div className="text-right">
                        <span className="text-blue-600 tabular-nums text-sm font-medium">{fmtPesos(ins.monto)}</span>
                        {ins.moneda === "USD" && (
                          <p className="text-blue-400 text-xs">USD {fmtARS(ins.montoOriginal)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <DesgRow label="Neto" value={fmtPesos(calcs.neto)} bold />
              <DesgRow label="IVA 21%" value={`+${fmtPesos(calcs.iva)}`} />
              <div className="border-t-2 border-blue-200 pt-3 mt-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-base font-bold text-gray-700">TOTAL</span>
                  <span className="text-2xl font-bold text-blue-600">{fmtPesos(calcs.total)}</span>
                </div>
              </div>
            </div>
          </div>
          {form.servicios.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Servicios Incluidos
              </h4>
              <ul className="space-y-1">
                {form.servicios.map((sid) => {
                  const srv = SERVICIOS.find((s) => s.id === sid);
                  return srv ? (
                    <li key={sid} className="text-sm text-gray-700 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      {srv.label}
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="p-5 pt-0 space-y-2">
          {/* Botón Guardar — siempre visible, se deshabilita una vez guardado */}
          {!yaGuardado && (
            <button
              onClick={onGuardar}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Guardando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Guardar Presupuesto
                </>
              )}
            </button>
          )}

          {/* Botones PDF e Imprimir — solo habilitados después de guardar */}
          <div className="flex gap-3">
            <button
              onClick={handleSavePDF}
              disabled={!yaGuardado}
              title={!yaGuardado ? "Guardá el presupuesto primero" : ""}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                yaGuardado
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Guardar PDF
            </button>
            <button
              onClick={handlePrint}
              disabled={!yaGuardado}
              title={!yaGuardado ? "Guardá el presupuesto primero" : ""}
              className={`flex-1 py-2.5 rounded-lg font-medium transition-colors border flex items-center justify-center gap-2 ${
                yaGuardado
                  ? "bg-white hover:bg-gray-50 text-gray-700 border-gray-300"
                  : "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="px-6 bg-white hover:bg-gray-50 text-gray-500 py-2.5 rounded-lg font-medium transition-colors border border-gray-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
