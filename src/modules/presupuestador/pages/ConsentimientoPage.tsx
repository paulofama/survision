// ============================================================
// Consentimiento informado — carga del texto vigente
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Cargar el texto legal era un INSERT a mano, así que desde el 21/07/2026 sigue
// vigente el placeholder y cada sobre quirúrgico lleva una hoja de
// consentimiento sin contenido real.
//
// UNA VERSIÓN NO SE EDITA: guardar crea una versión nueva y la anterior queda
// para consulta. El texto que firmó un paciente en agosto tiene que poder
// leerse tal como estaba en agosto.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, FileText, Plus, RefreshCw, Scale, Trash2 } from 'lucide-react';
import { useAuth } from '@shared/context/AuthContext';
import {
  activarVersion,
  cargarVersiones,
  guardarVersion,
  limpiarSecciones,
  mover,
  REQUISITOS_LEY_26529,
  validarTexto,
  type SeccionTexto,
  type VersionTexto,
} from '../utils/textosLegales';

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const SECCION_NUEVA: SeccionTexto = { titulo: '', cuerpo: '' };

export default function ConsentimientoPage() {
  const { usuario } = useAuth();
  const [versiones, setVersiones] = useState<VersionTexto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [secciones, setSecciones] = useState<SeccionTexto[]>([{ ...SECCION_NUEVA }]);
  const [notas, setNotas] = useState('');
  const [activar, setActivar] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVersiones(await cargarVersiones());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las versiones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const vigente = useMemo(() => versiones.find((v) => v.vigente) ?? null, [versiones]);
  const invalido = validarTexto(secciones);

  const editarSeccion = (i: number, campo: keyof SeccionTexto, valor: string) =>
    setSecciones((ss) => ss.map((s, ix) => (ix === i ? { ...s, [campo]: valor } : s)));

  const copiarDe = (v: VersionTexto) => {
    // Copiar una versión para editarla no la modifica: al guardar nace otra.
    setSecciones(v.contenido.length ? v.contenido.map((s) => ({ ...s })) : [{ ...SECCION_NUEVA }]);
    setNotas(`Basado en la versión ${v.version}.`);
    setAviso(null);
  };

  const guardar = async () => {
    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      const version = await guardarVersion({
        secciones,
        notas: notas.trim() || undefined,
        activar,
        creadoPor: usuario?.email ?? undefined,
      });
      setAviso(
        activar
          ? `Guardado como versión ${version} y activado. Los sobres que se generen ahora imprimen este texto, con los renglones de firma.`
          : `Guardado como versión ${version}. Todavía NO rige: activala cuando esté revisada.`,
      );
      setSecciones([{ ...SECCION_NUEVA }]);
      setNotas('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const activarUna = async (v: VersionTexto) => {
    setError(null);
    setAviso(null);
    try {
      await activarVersion(v.version);
      setAviso(`Versión ${v.version} activada.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar.');
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-gray-900">Consentimiento informado</h1>
          <p className="text-xs text-gray-500">
            Texto de la hoja que se archiva en quirófano, versionado
          </p>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="text-xs border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Qué está rigiendo hoy. Es lo primero que hay que saber al abrir esto. */}
      {vigente && vigente.es_placeholder && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> El consentimiento vigente es un texto de relleno
          </p>
          <p className="text-xs text-red-800 mt-1">
            Está así desde el {fecha(vigente.created_at)}. Mientras siga, la hoja del sobre sale con el aviso
            <strong> "ESTA HOJA NO SE FIRMA" y sin renglones de firma</strong>, para que nadie firme un texto que no
            rige. Los pacientes tienen que seguir firmando el formulario en papel.
          </p>
        </div>
      )}
      {vigente && !vigente.es_placeholder && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
            <Check className="w-4 h-4" /> Rige la versión {vigente.version}, del {fecha(vigente.created_at)}
          </p>
          <p className="text-xs text-emerald-800 mt-1">
            La hoja del sobre imprime este texto con los renglones de firma del paciente y del testigo.
          </p>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
      {aviso && <div className="bg-blue-50 border border-blue-200 text-blue-900 text-sm rounded-lg p-3">{aviso}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-bold text-gray-900">Texto nuevo</h2>
            </div>
            <p className="text-[11px] text-gray-500 mb-4">
              Cada sección sale con su título en negrita y su párrafo debajo. Guardar crea una versión nueva: las
              anteriores no se tocan, porque son el texto que firmó cada paciente.
            </p>

            <div className="space-y-3">
              {secciones.map((s, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-gray-400 w-5">{i + 1}</span>
                    <input
                      value={s.titulo}
                      onChange={(e) => editarSeccion(i, 'titulo', e.target.value)}
                      placeholder="Título de la sección (opcional)"
                      className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-semibold"
                    />
                    <button
                      onClick={() => setSecciones((ss) => mover(ss, i, -1))}
                      disabled={i === 0}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-25 p-1"
                      aria-label="Subir"
                    ><ArrowUp className="w-4 h-4" /></button>
                    <button
                      onClick={() => setSecciones((ss) => mover(ss, i, 1))}
                      disabled={i === secciones.length - 1}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-25 p-1"
                      aria-label="Bajar"
                    ><ArrowDown className="w-4 h-4" /></button>
                    <button
                      onClick={() => setSecciones((ss) => (ss.length === 1 ? [{ ...SECCION_NUEVA }] : ss.filter((_, ix) => ix !== i)))}
                      className="text-gray-400 hover:text-red-600 p-1"
                      aria-label="Quitar"
                    ><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <textarea
                    value={s.cuerpo}
                    onChange={(e) => editarSeccion(i, 'cuerpo', e.target.value)}
                    rows={4}
                    placeholder="Texto de la sección"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => setSecciones((ss) => [...ss, { ...SECCION_NUEVA }])}
              className="mt-3 text-xs border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar sección
            </button>

            <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Nota de esta versión</span>
                <input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="De dónde salió el texto, quién lo revisó, qué cambió"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={activar} onChange={(e) => setActivar(e.target.checked)} className="mt-0.5" />
                <span>
                  Dejarla vigente al guardar
                  <span className="block text-[11px] text-gray-500">
                    Destildado la guarda para revisar: se activa después, desde la lista.
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={guardar}
                  disabled={!!invalido || guardando}
                  title={invalido ?? undefined}
                  className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg px-4 py-2 font-medium"
                >
                  {guardando ? 'Guardando…' : 'Guardar versión nueva'}
                </button>
                {invalido && <span className="text-xs text-gray-500">{invalido}</span>}
              </div>
            </div>
          </section>

          {/* Vista previa */}
          {limpiarSecciones(secciones).length > 0 && (
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                  Cómo sale en la hoja
                </span>
              </div>
              <div className="p-5 font-serif text-sm space-y-3">
                {limpiarSecciones(secciones).map((s, i) => (
                  <div key={i}>
                    {s.titulo && <p className="font-bold text-gray-900">{s.titulo}</p>}
                    <p className="text-gray-800 whitespace-pre-wrap">{s.cuerpo}</p>
                  </div>
                ))}
                <div className="pt-4 mt-2 border-t border-dashed border-gray-300 text-gray-500 text-xs font-sans">
                  Debajo van la frase de autorización, el renglón de los doctores del equipo y las firmas del
                  paciente y del testigo.
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Columna derecha */}
        <div className="space-y-4">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-bold text-gray-900">Qué tiene que decir</h2>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              Lo que enumera el artículo 5 de la Ley 26.529. Es una guía de temas que no pueden faltar, no una
              validación: el sistema no puede juzgar si un párrafo explica bien un riesgo. La redacción final la
              confirma quien la escriba.
            </p>
            <ul className="space-y-2">
              {REQUISITOS_LEY_26529.map((r) => (
                <li key={r.inciso} className="flex gap-2 text-xs text-gray-700">
                  <span className="font-mono font-semibold text-gray-400 shrink-0">{r.inciso})</span>
                  <span>{r.texto}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-500 mt-3 pt-3 border-t border-gray-200">
              Para una cirugía el consentimiento va por escrito y firmado (art. 7, inc. b). Los incisos g) y h) que
              agregó la Ley 26.742 son sobre enfermedad irreversible y cuidados paliativos: no aplican acá.
            </p>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Versiones</h2>
            {loading && <p className="text-xs text-gray-500">Cargando…</p>}
            {!loading && versiones.length === 0 && <p className="text-xs text-gray-500">No hay ninguna cargada.</p>}
            <ul className="space-y-2">
              {versiones.map((v) => (
                <li
                  key={v.id}
                  className={`border rounded-lg p-3 ${v.vigente ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Versión {v.version}</span>
                    {v.vigente && (
                      <span className="text-[10px] bg-blue-600 text-white rounded px-1.5 py-px font-medium">VIGENTE</span>
                    )}
                    {v.es_placeholder && (
                      <span className="text-[10px] bg-red-100 text-red-800 rounded px-1.5 py-px font-medium">RELLENO</span>
                    )}
                    <span className="text-[11px] text-gray-500 ml-auto">{fecha(v.created_at)}</span>
                  </div>
                  {v.notas && <p className="text-[11px] text-gray-600 mt-1">{v.notas}</p>}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {v.contenido.length} sección{v.contenido.length === 1 ? '' : 'es'}
                    {v.created_by && ` · ${v.created_by}`}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => copiarDe(v)}
                      className="text-[11px] border border-gray-300 rounded px-2 py-1 hover:bg-white"
                    >
                      Copiar para editar
                    </button>
                    {!v.vigente && (
                      <button
                        onClick={() => activarUna(v)}
                        className="text-[11px] border border-gray-300 rounded px-2 py-1 hover:bg-white"
                      >
                        Dejar vigente
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
