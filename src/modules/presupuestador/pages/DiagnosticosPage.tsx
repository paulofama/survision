// ============================================================
// Diagnósticos del pedido de cirugía
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Carga el diagnóstico, el texto de la solicitud y si la práctica lleva lente,
// por código de práctica (`presupuestos_diagnosticos`, migraciones 48/49/50).
// Es lo que el pedido de cirugía imprime y el médico firma.
//
// LA PANTALLA ORDENA POR LO QUE FALTA, no alfabéticamente: primero las
// prácticas ya aceptadas sin diagnóstico (ésas están imprimiendo pedidos hoy),
// después las que más se presupuestan. Es la única pregunta que tiene quien
// abre esto: por dónde empiezo.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Eye, Pencil, RefreshCw, Search, X } from 'lucide-react';
import {
  cargarPanelDiagnosticos,
  conOjo,
  esPropuesta,
  faltaElOjo,
  filtrar,
  guardarDiagnostico,
  validarDiagnostico,
  MARCADOR_OJO,
  type Diagnostico,
  type FiltroCarga,
  type Ojo,
  type PanelDiagnosticos,
  type PracticaConDx,
} from '../utils/diagnosticos';

const num = (n: number) => new Intl.NumberFormat('es-AR').format(n || 0);

const OJOS: { valor: Ojo; etiqueta: string }[] = [
  { valor: 'OD', etiqueta: 'Ojo derecho' },
  { valor: 'OI', etiqueta: 'Ojo izquierdo' },
  { valor: 'AMBOS', etiqueta: 'Ambos' },
];

// ── Editor ──────────────────────────────────────────────────────────────────

interface EditorProps {
  fila: PracticaConDx;
  onCerrar: () => void;
  onGuardado: () => void;
}

function Editor({ fila, onCerrar, onGuardado }: EditorProps) {
  const [diagnostico, setDiagnostico] = useState(fila.dx?.diagnostico ?? '');
  const [solicitud, setSolicitud] = useState(fila.dx?.solicitud ?? '');
  const [llevaLio, setLlevaLio] = useState(fila.dx?.lleva_lio ?? false);
  const [activo, setActivo] = useState(fila.dx?.activo ?? true);
  const [nota, setNota] = useState(fila.dx?.nota_interna ?? '');
  const propuesta = esPropuesta(fila.dx);
  const [ojoPrueba, setOjoPrueba] = useState<Ojo>('OD');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalido = validarDiagnostico({ diagnostico, solicitud });
  const sinOjo = diagnostico.trim() !== '' && faltaElOjo(diagnostico);

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      const d: Diagnostico = {
        codigo_practica: fila.codigo,
        diagnostico,
        solicitud,
        lleva_lio: llevaLio,
        activo,
        nota_interna: nota,
      };
      await guardarDiagnostico(d);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
        <div className="flex items-start gap-3 p-5 border-b border-gray-200">
          <div className="min-w-0 mr-auto">
            <p className="text-[11px] font-mono text-gray-500">{fila.codigo}</p>
            <h2 className="text-base font-bold text-gray-900 leading-tight">{fila.nombre}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {num(fila.presupuestos)} presupuesto{fila.presupuestos === 1 ? '' : 's'}
              {fila.aceptados > 0 && ` · ${num(fila.aceptados)} aceptado${fila.aceptados === 1 ? '' : 's'}`}
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {propuesta && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Propuesta sin revisar — todavía no se imprime
              </p>
              <p className="text-xs text-amber-900 mt-1">{fila.dx?.nota_interna}</p>
              <p className="text-[11px] text-amber-800 mt-1.5">
                Si está bien, tildá <strong>Activo</strong> y guardá. Si no, corregila o dejala apagada.
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="dx-diagnostico">
              Diagnóstico
            </label>
            <input
              id="dx-diagnostico"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              placeholder={`Catarata ${MARCADOR_OJO}`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Escribí <code className="bg-gray-100 px-1 rounded">{MARCADOR_OJO}</code> donde va el ojo: se reemplaza
              por OD, OI o AO según el ojo que se cargó al aceptar el presupuesto.{' '}
              <button
                type="button"
                onClick={() => setDiagnostico((d) => (d.trim() ? `${d.trim()} ${MARCADOR_OJO}` : MARCADOR_OJO))}
                className="text-blue-600 hover:underline"
              >
                insertar
              </button>
            </p>
            {sinOjo && (
              <p className="text-[11px] text-yellow-700 mt-1 flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Este diagnóstico no lleva el ojo. Está bien si la práctica es bilateral por definición; si no, falta.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="dx-solicitud">
              Se solicita
            </label>
            <textarea
              id="dx-solicitud"
              value={solicitud}
              onChange={(e) => setSolicitud(e.target.value)}
              rows={2}
              placeholder="Cirugía de catarata con técnica de facoemulsificación e implante de LIO plegable."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              El renglón "Solicito" del pedido. Sin esto se solicita la práctica por su nombre del catálogo.
            </p>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={llevaLio} onChange={(e) => setLlevaLio(e.target.checked)} className="mt-0.5" />
              <span>
                Lleva lente intraocular
                <span className="block text-[11px] text-gray-500">
                  Imprime el renglón "LIO indicado". En un pterigión no significa nada.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="mt-0.5" />
              <span>
                Activo
                <span className="block text-[11px] text-gray-500">
                  Destildado deja de imprimirse y el renglón vuelve a salir en blanco.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="dx-nota">
              Nota interna
            </label>
            <textarea
              id="dx-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="De dónde salió este diagnóstico, qué duda quedó, quién lo confirmó"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              No se imprime. Es para el que abra esto dentro de un año.
            </p>
          </div>

          {/* Vista previa: usa la MISMA función que el PDF, así no pueden discrepar. */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 bg-gray-50 border-b border-gray-200 px-3 py-2">
              <Eye className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                Cómo sale en el pedido
              </span>
              <div className="ml-auto flex gap-1">
                {OJOS.map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => setOjoPrueba(o.valor)}
                    className={`text-[11px] px-2 py-0.5 rounded border ${
                      ojoPrueba === o.valor
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {o.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 bg-white font-serif text-sm space-y-2">
              <p className="text-[11px] font-sans font-semibold text-gray-500 uppercase tracking-wide">Solicito</p>
              <p className="text-gray-900">
                {solicitud.trim() || <span className="text-gray-400">{fila.nombre}.</span>}
              </p>
              <p className="text-gray-900">
                <span className="font-semibold">Diagnóstico: </span>
                {conOjo(diagnostico, ojoPrueba) || (
                  <span className="text-yellow-700 font-sans text-xs">
                    (en blanco, con el aviso para completarlo a mano)
                  </span>
                )}
              </p>
              {llevaLio && (
                <p className="text-gray-900">
                  <span className="font-semibold">LIO indicado: </span>
                  <span className="text-gray-500">el del presupuesto</span>
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-gray-200">
          <p className="text-[11px] text-gray-500 mr-auto max-w-sm">
            Si no estás seguro del diagnóstico, no lo cargues: en blanco se completa a mano, equivocado se firma.
          </p>
          <button onClick={onCerrar} className="text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!!invalido || guardando}
            title={invalido ?? undefined}
            className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg px-4 py-2 font-medium"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function DiagnosticosPage() {
  const [panel, setPanel] = useState<PanelDiagnosticos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [carga, setCarga] = useState<FiltroCarga>('todas');
  const [editando, setEditando] = useState<PracticaConDx | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPanel(await cargarPanelDiagnosticos());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(
    () => (panel ? filtrar(panel.filas, texto, carga) : []),
    [panel, texto, carga],
  );

  const aceptadosSinDx = useMemo(
    () => (panel ? panel.filas.filter((f) => (!f.dx || !f.dx.activo) && f.aceptados > 0) : []),
    [panel],
  );

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Encabezado */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-gray-900">Diagnósticos del pedido de cirugía</h1>
          <p className="text-xs text-gray-500">
            {panel
              ? `${num(panel.cargadas)} de ${num(panel.total)} prácticas quirúrgicas con diagnóstico cargado`
              : '—'}
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

      {/* La regla del módulo, arriba y no escondida. */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <p>
          Esto es lo que el pedido de cirugía imprime y el médico firma para presentar a la obra social.
        </p>
        <p className="mt-1.5">
          <strong>Una práctica sin diagnóstico cargado imprime el renglón en blanco</strong>, con un aviso para
          completarlo a mano. Es a propósito: un blanco se nota y se llena, un diagnóstico equivocado se firma y se
          presenta. <strong>No cargues uno por las dudas</strong> — si la indicación depende del paciente (una
          inyección intravítrea puede ser por DMAE, edema macular o una oclusión venosa), dejalo vacío.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {/* Lo urgente: prácticas ya aceptadas que hoy imprimen el renglón en blanco. */}
      {aceptadosSinDx.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-yellow-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {aceptadosSinDx.length} práctica{aceptadosSinDx.length === 1 ? '' : 's'} ya aceptada
            {aceptadosSinDx.length === 1 ? '' : 's'} sin diagnóstico
          </p>
          <p className="text-xs text-yellow-800 mt-1">
            Estas tienen un presupuesto en el circuito: el pedido ya se imprime, y sale con el renglón vacío.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {aceptadosSinDx.map((f) => (
              <button
                key={f.codigo}
                onClick={() => setEditando(f)}
                className="text-xs bg-white border border-yellow-400 rounded-lg px-2.5 py-1 hover:bg-yellow-100"
              >
                <span className="font-mono text-gray-500">{f.codigo}</span> {f.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por código, práctica o diagnóstico"
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-80 max-w-full"
          />
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {([
            ['todas', 'Todas'],
            ['sin', 'Sin diagnóstico'],
            ['propuestas', 'Propuestas'],
            ['con', 'Cargadas'],
          ] as [FiltroCarga, string][]).map(([v, etiqueta]) => (
            <button
              key={v}
              onClick={() => setCarga(v)}
              className={`text-xs px-3 py-1.5 ${
                carga === v ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {num(visibles.length)} de {num(panel?.total ?? 0)}
          {panel && panel.presupuestosSinDx > 0 && (
            <> · {num(panel.presupuestosSinDx)} presupuestos saldrían con el renglón en blanco</>
          )}
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-semibold">Código</th>
                <th className="px-3 py-2 font-semibold">Práctica</th>
                <th className="px-3 py-2 font-semibold text-right">Presup.</th>
                <th className="px-3 py-2 font-semibold text-right">Acept.</th>
                <th className="px-3 py-2 font-semibold">Diagnóstico que imprime</th>
                <th className="px-3 py-2 font-semibold w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>
              )}
              {!loading && visibles.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No hay prácticas que coincidan.</td></tr>
              )}
              {!loading && visibles.map((f) => {
                const vigente = f.dx && f.dx.activo;
                return (
                  <tr key={f.codigo} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 align-top">{f.codigo}</td>
                    <td className="px-3 py-2 text-gray-900 align-top max-w-[380px]">{f.nombre}</td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums align-top">
                      {f.presupuestos > 0 ? num(f.presupuestos) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {f.aceptados > 0
                        ? <span className="font-semibold text-gray-900">{num(f.aceptados)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {vigente ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-gray-900">{f.dx!.diagnostico}</span>
                          {f.dx!.lleva_lio && (
                            <span className="text-[10px] bg-sky-100 text-sky-800 rounded px-1.5 py-px">LIO</span>
                          )}
                        </span>
                      ) : esPropuesta(f.dx) ? (
                        <span className="inline-flex items-start gap-1.5">
                          <span className="text-[10px] bg-amber-100 text-amber-900 rounded px-1.5 py-px font-semibold shrink-0 mt-px">
                            PROPUESTA
                          </span>
                          <span className="text-gray-500">{f.dx!.diagnostico}</span>
                        </span>
                      ) : f.dx ? (
                        <span className="text-xs text-gray-400 line-through">{f.dx.diagnostico}</span>
                      ) : (
                        <span className="text-xs text-yellow-700">en blanco, se completa a mano</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={() => setEditando(f)}
                        className="text-xs border border-gray-300 rounded-lg px-2.5 py-1 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                      >
                        <Pencil className="w-3 h-3" /> {f.dx ? 'Editar' : 'Cargar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <Editor
          fila={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); }}
        />
      )}
    </div>
  );
}
