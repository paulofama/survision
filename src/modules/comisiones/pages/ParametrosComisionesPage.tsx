// ============================================================
// Comisiones — parametrización
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Acá se enciende el régimen. Hacen falta tres cosas y las tres son decisiones
// de la Dirección: desde cuándo rige, cuánto se paga, y quiénes cobran.
// Mientras falte cualquiera, el sistema no devenga nada — no es un error, es
// el diseño.
//
// UN VALOR NO SE EDITA: SE LE PONE UNA VIGENCIA NUEVA
// ---------------------------------------------------
// Cambiar la tasa agrega una fila con su fecha; la anterior queda. Cada
// movimiento guarda además la tasa con la que se calculó, así que recalcular
// el pasado es imposible por dos caminos distintos.
//
// Esto no es prolijidad: `honorarios_config` tenía un UNIQUE por segmento y
// cada vez que alguien tocaba un porcentaje reescribía la historia hacia
// atrás. Se descubrió en agosto y costó dos migraciones (54 y 55). Es el mismo
// problema, un módulo después.
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Percent, Plus, Power, Users } from 'lucide-react';
import supabase from '@shared/lib/supabase';
import { useAuth } from '@shared/context/AuthContext';
import {
  fmtPct,
  hoyLocal,
  useRegimenComisiones,
  type Comisionable,
} from '../hooks/useComisiones';

/** Las claves editables, con su explicación en castellano. */
const CLAVES: { clave: string; label: string; ayuda: string; unidad: '%' | 'días' }[] = [
  { clave: 'tasa_comision', label: 'Tasa de comisión', unidad: '%',
    ayuda: 'Porcentaje sobre la base (precio de lista menos descuento más insumos, sin descontar la cobertura de la obra social).' },
  { clave: 'participantes_pct', label: 'Parte de los participantes', unidad: '%',
    ayuda: 'Qué porción del total va al conjunto de los terceros que participaron. Se reparte en partes iguales entre ellos.' },
  { clave: 'recuperador_pct', label: 'Parte del recuperador', unidad: '%',
    ayuda: 'Qué porción de la parte del ENTREGADOR se lleva quien recuperó el presupuesto. El participante nunca cede.' },
  { clave: 'dias_para_frio', label: 'Días para considerarlo frío', unidad: 'días',
    ayuda: 'Desde la entrega. Pasados estos días, el presupuesto se considera perdido y una llamada que lo reactive genera recupero.' },
  { clave: 'ventana_recupero_dias', label: 'Ventana de recupero', unidad: 'días',
    ayuda: 'Desde el contacto efectivo. Si la cirugía cae fuera de esta ventana, no hay recupero: todo es del entregador.' },
];

const ParametrosComisionesPage: React.FC = () => {
  const { usuario } = useAuth();
  const regimen = useRegimenComisiones();

  const [nuevo, setNuevo] = useState<{ clave: string; valor: string; desde: string; notas: string }>({
    clave: 'tasa_comision', valor: '', desde: hoyLocal(), notas: '',
  });
  const [fechaRegimen, setFechaRegimen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const marcados = useMemo(() => regimen.comisionables.filter((c) => c.es_comisionable), [regimen.comisionables]);

  /** El historial de una clave, de la vigencia más nueva a la más vieja. */
  const historial = useCallback((clave: string) =>
    regimen.filas
      .filter((f) => f.clave === clave)
      .sort((a, b) => (String(a.vigencia_desde) < String(b.vigencia_desde) ? 1 : -1)),
  [regimen.filas]);

  const fallar = useCallback((e: unknown, quéIba: string) => {
    const msg = e instanceof Error ? e.message : String(e);
    setAviso({ tipo: 'error', texto: `No se pudo ${quéIba}: ${msg}` });
  }, []);

  const agregarVigencia = useCallback(async () => {
    const valor = Number(nuevo.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      setAviso({ tipo: 'error', texto: 'El valor tiene que ser un número mayor o igual a cero.' });
      return;
    }
    if (!nuevo.desde) {
      setAviso({ tipo: 'error', texto: 'Falta desde cuándo rige.' });
      return;
    }
    const meta = CLAVES.find((c) => c.clave === nuevo.clave)!;
    if (meta.unidad === '%' && valor > 100) {
      setAviso({ tipo: 'error', texto: 'Un porcentaje no puede pasar de 100.' });
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      const { error } = await supabase.from('comisiones_parametros').upsert({
        clave: nuevo.clave, valor, vigencia_desde: nuevo.desde,
        notas: nuevo.notas || null, created_by: usuario?.username ?? null,
      }, { onConflict: 'clave,vigencia_desde' });
      if (error) throw new Error(error.message);
      setAviso({ tipo: 'ok', texto: `${meta.label}: ${valor} ${meta.unidad}, desde el ${nuevo.desde}.` });
      setNuevo((n) => ({ ...n, valor: '', notas: '' }));
      await regimen.recargar();
    } catch (e) {
      fallar(e, 'guardar la vigencia');
    } finally {
      setGuardando(false);
    }
  }, [nuevo, regimen, usuario, fallar]);

  /**
   * Encender el régimen. Es el acto más pesado de la pantalla: a partir de esa
   * fecha, todo presupuesto entregado empieza a generar derecho a comisión.
   */
  const encenderRegimen = useCallback(async () => {
    if (!fechaRegimen) return;
    const comoNumero = Number(fechaRegimen.replace(/-/g, ''));
    if (!window.confirm(
      `Desde el ${fechaRegimen}, todo presupuesto que se ENTREGUE genera derecho a comisión `
      + 'cuando el paciente se opere.\n\n'
      + 'Los entregados antes de esa fecha quedan afuera. ¿Confirmás?',
    )) return;

    setGuardando(true);
    setAviso(null);
    try {
      const { error } = await supabase.from('comisiones_parametros').upsert({
        clave: 'fecha_vigencia_regimen', valor: comoNumero, vigencia_desde: '2000-01-01',
        notas: `Régimen vigente para presupuestos entregados desde el ${fechaRegimen}`,
        created_by: usuario?.username ?? null,
      }, { onConflict: 'clave,vigencia_desde' });
      if (error) throw new Error(error.message);
      setAviso({ tipo: 'ok', texto: `Régimen vigente desde el ${fechaRegimen}.` });
      await regimen.recargar();
    } catch (e) {
      fallar(e, 'fijar la vigencia del régimen');
    } finally {
      setGuardando(false);
    }
  }, [fechaRegimen, regimen, usuario, fallar]);

  const marcarComisionable = useCallback(async (c: Comisionable, valor: boolean) => {
    if (valor && !window.confirm(
      `${c.nombre_completo || c.username} va a poder figurar como quien entrega, participa o recupera un `
      + 'presupuesto, y a cobrar por eso.\n\n¿Confirmás?',
    )) return;

    setGuardando(true);
    setAviso(null);
    try {
      const { error } = await supabase.from('usuarios_sistema')
        .update({ es_comisionable: valor }).eq('username', c.username);
      if (error) throw new Error(error.message);
      // Sacar a alguien del régimen no le borra lo devengado: el libro es
      // append-only y lo que ya se ganó es deuda. Sólo deja de generar nuevo.
      setAviso({
        tipo: 'ok',
        texto: valor
          ? `${c.nombre_completo || c.username} entra al régimen.`
          : `${c.nombre_completo || c.username} sale del régimen. Lo que ya devengó sigue en pie.`,
      });
      await regimen.recargar();
    } catch (e) {
      fallar(e, 'cambiar la marca');
    } finally {
      setGuardando(false);
    }
  }, [regimen, fallar]);

  const metaSeleccionada = CLAVES.find((c) => c.clave === nuevo.clave)!;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Percent className="h-6 w-6 text-blue-600" />
          Comisiones — parametrización
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Desde cuándo rige, cuánto se paga y quiénes cobran.
        </p>
      </div>

      {aviso && (
        <div className={`rounded-xl p-4 text-sm border ${
          aviso.tipo === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {aviso.texto}
        </div>
      )}
      {regimen.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">{regimen.error}</div>
      )}

      {/* ---------- 1. El interruptor ---------- */}
      <div className={`border rounded-xl p-5 ${regimen.activo ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
        <div className="flex items-start gap-3">
          {regimen.activo
            ? <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" />
            : <Power className="h-5 w-5 text-yellow-700 mt-0.5 shrink-0" />}
          <div className="min-w-0 w-full">
            <h2 className={`font-semibold ${regimen.activo ? 'text-green-900' : 'text-yellow-900'}`}>
              {regimen.activo ? 'El régimen está en marcha' : 'El régimen no está en marcha'}
            </h2>
            <p className={`text-sm mt-1 ${regimen.activo ? 'text-green-800' : 'text-yellow-800'}`}>
              {regimen.activo
                ? `Vigente para presupuestos entregados desde el ${regimen.desde}. Hay ${marcados.length} ${marcados.length === 1 ? 'persona' : 'personas'} en el régimen.`
                : regimen.motivo}
            </p>

            {!regimen.desde && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-yellow-900 mb-1">Vigente para entregas desde</label>
                  <input
                    type="date"
                    value={fechaRegimen}
                    onChange={(e) => setFechaRegimen(e.target.value)}
                    className="border border-yellow-400 rounded-lg px-3 py-2 text-sm bg-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={!fechaRegimen || guardando}
                  onClick={() => void encenderRegimen()}
                  className="inline-flex items-center gap-1.5 text-sm bg-yellow-700 hover:bg-yellow-800 disabled:opacity-50 text-white rounded-lg px-4 py-2"
                >
                  <Power className="h-4 w-4" />
                  Fijar la vigencia
                </button>
              </div>
            )}

            {regimen.desde && (
              <p className="text-xs text-gray-600 mt-3 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                La fecha de vigencia se fija una vez. Cambiarla después mueve a gente dentro o fuera del régimen
                retroactivamente: si hace falta, se hace desde la base, a mano y a conciencia.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---------- 2. Los valores ---------- */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          Valores y vigencias
        </h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">
          Cambiar un valor agrega una vigencia nueva. La anterior queda, y lo devengado con ella no se recalcula.
        </p>

        <div className="space-y-4">
          {CLAVES.map((c) => {
            const filas = historial(c.clave);
            const vigente = filas.find((f) => String(f.vigencia_desde).slice(0, 10) <= hoyLocal());
            return (
              <div key={c.clave} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{c.label}</div>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl">{c.ayuda}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xl font-bold ${vigente ? 'text-gray-900' : 'text-gray-300'}`}>
                      {vigente ? (c.unidad === '%' ? fmtPct(Number(vigente.valor)) : `${vigente.valor} días`) : 'sin cargar'}
                    </div>
                    {vigente && (
                      <div className="text-xs text-gray-500">desde {String(vigente.vigencia_desde).slice(0, 10)}</div>
                    )}
                  </div>
                </div>
                {filas.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                    {filas.slice(1).map((f) => (
                      <div key={`${f.clave}-${f.vigencia_desde}`}>
                        {String(f.vigencia_desde).slice(0, 10)}: {c.unidad === '%' ? fmtPct(Number(f.valor)) : `${f.valor} días`}
                        {f.notas ? ` — ${f.notas}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 pt-5 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Cargar una vigencia nueva</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Parámetro</label>
              <select
                value={nuevo.clave}
                onChange={(e) => setNuevo((n) => ({ ...n, clave: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {CLAVES.map((c) => <option key={c.clave} value={c.clave}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Valor ({metaSeleccionada.unidad})
              </label>
              <input
                type="number"
                min={0}
                step={metaSeleccionada.unidad === '%' ? 0.5 : 1}
                value={nuevo.valor}
                onChange={(e) => setNuevo((n) => ({ ...n, valor: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rige desde</label>
              <input
                type="date"
                value={nuevo.desde}
                onChange={(e) => setNuevo((n) => ({ ...n, desde: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Nota (por qué cambió)</label>
              <input
                type="text"
                value={nuevo.notas}
                onChange={(e) => setNuevo((n) => ({ ...n, notas: e.target.value }))}
                placeholder="Acta de Dirección, acuerdo, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={guardando || !nuevo.valor}
                onClick={() => void agregarVigencia()}
                className="w-full inline-flex items-center justify-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 3. Quiénes cobran ---------- */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          Quiénes cobran comisión
        </h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">
          Sólo las personas marcadas acá aparecen en el presupuesto como quien entregó o participó.
          Sacar a alguien no le borra lo que ya devengó.
        </p>

        <div className="divide-y divide-gray-100">
          {regimen.comisionables.map((c) => (
            <label key={c.username} className="flex items-center justify-between gap-4 py-2.5 cursor-pointer">
              <div className="min-w-0">
                <div className="text-sm text-gray-900 truncate">{c.nombre_completo || c.username}</div>
                <div className="text-xs text-gray-400">{c.username}</div>
              </div>
              <input
                type="checkbox"
                checked={c.es_comisionable}
                disabled={guardando}
                onChange={(e) => void marcarComisionable(c, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 shrink-0"
              />
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        El régimen tiene consecuencias laborales. Antes de encenderlo, consultarlo con el asesor:
        una comisión habitual integra la remuneración.
        {regimen.desde && ` · Vigente para entregas desde el ${regimen.desde}.`}
      </p>
    </div>
  );
};

export default ParametrosComisionesPage;
