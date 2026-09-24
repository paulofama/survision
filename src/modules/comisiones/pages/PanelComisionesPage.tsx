// ============================================================
// Panel de comisiones — la vista de la Dirección
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Un mes, todas las personas, y los tres actos que hay sobre él: cerrarlo,
// aprobarlo y marcarlo pagado. Cada uno es un acto humano con nombre y fecha,
// no un efecto lateral de otra cosa.
//
// LO QUE ESTA PANTALLA **NO** PUEDE HACER, Y ES A PROPÓSITO
// ---------------------------------------------------------
// No emite ni borra movimientos. El libro lo escribe el job con la service
// key; la UI sólo puede ponerle a un movimiento su `liquidacion_id`, y el
// trigger append-only de la migración 56 impide todo lo demás — importes,
// beneficiario, rol, fechas— para todos, service key incluida. Si mañana hace
// falta corregir una comisión, se emite un asiento en contrario desde el
// servidor, no se edita nada desde acá.
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Lock, RefreshCw, Users, Wallet } from 'lucide-react';
import supabase from '@shared/lib/supabase';
import { useAuth } from '@shared/context/AuthContext';
import AvisoRegimen from '../components/AvisoRegimen';
import TablaMovimientos from '../components/TablaMovimientos';
import {
  MESES,
  fmtARS,
  hoyLocal,
  usePeriodoComisiones,
  useRegimenComisiones,
  type EstadoLiquidacion,
  type FilaPersona,
} from '../hooks/useComisiones';

const ESTADO_ESTILO: Record<EstadoLiquidacion, string> = {
  DEVENGADA: 'bg-gray-100 text-gray-700 border-gray-300',
  APROBADA: 'bg-blue-50 text-blue-700 border-blue-300',
  PAGADA: 'bg-green-50 text-green-700 border-green-300',
};

const ESTADO_TEXTO: Record<EstadoLiquidacion, string> = {
  DEVENGADA: 'Devengada',
  APROBADA: 'Aprobada',
  PAGADA: 'Pagada',
};

const hoy = new Date();

const PanelComisionesPage: React.FC = () => {
  const { usuario } = useAuth();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const regimen = useRegimenComisiones();
  const periodo = usePeriodoComisiones(anio, mes);

  const nombres = useMemo(
    () => Object.fromEntries(regimen.comisionables.map((c) => [c.username, c.nombre_completo || c.username])),
    [regimen.comisionables],
  );

  const totales = useMemo(() => {
    const devengado = periodo.total;
    const aprobado = periodo.personas
      .filter((p) => p.liquidacion && p.liquidacion.estado !== 'DEVENGADA')
      .reduce((s, p) => s + Number(p.liquidacion!.total), 0);
    const pagado = periodo.personas
      .filter((p) => p.liquidacion?.estado === 'PAGADA')
      .reduce((s, p) => s + Number(p.liquidacion!.total), 0);
    return { devengado, aprobado: Math.round(aprobado * 100) / 100, pagado: Math.round(pagado * 100) / 100 };
  }, [periodo.personas, periodo.total]);

  const fallar = useCallback((e: unknown, quéIba: string) => {
    const msg = e instanceof Error ? e.message : String(e);
    // El caso más probable la primera vez: la migración 57 no está aplicada y
    // la RLS rechaza la escritura. Decirlo con todas las letras ahorra una
    // hora de buscar un bug que no existe.
    setAviso({
      tipo: 'error',
      texto: /permission|policy|row-level|violates/i.test(msg)
        ? `No se pudo ${quéIba}: la base rechazó la escritura. Si es la primera vez, falta aplicar la migración 57.`
        : `No se pudo ${quéIba}: ${msg}`,
    });
  }, []);

  /**
   * Cerrar el mes de una persona: crea su liquidación y le estampa el
   * `liquidacion_id` a los movimientos del período que todavía no lo tienen.
   *
   * El total se calcula sumando los movimientos que efectivamente quedaron
   * adentro, no el subtotal que mostraba la pantalla: entre que se dibujó y se
   * hizo clic, el job puede haber devengado uno más.
   */
  const cerrarMes = useCallback(async (p: FilaPersona) => {
    setTrabajando(p.beneficiario);
    setAviso(null);
    try {
      const pendientes = p.movimientos.filter((m) => !m.liquidacion_id);
      if (pendientes.length === 0) {
        setAviso({ tipo: 'error', texto: 'No hay movimientos sueltos en este período.' });
        return;
      }
      const total = Math.round(pendientes.reduce((s, m) => s + Number(m.importe), 0) * 100) / 100;

      let liquidacionId = p.liquidacion?.id ?? null;
      if (!liquidacionId) {
        const { data, error } = await supabase.from('comisiones_liquidaciones')
          .insert({
            beneficiario: p.beneficiario, anio, mes, estado: 'DEVENGADA',
            total, created_by: usuario?.username ?? null,
          })
          .select('id').single();
        if (error) throw new Error(error.message);
        liquidacionId = data.id;
      } else {
        const { error } = await supabase.from('comisiones_liquidaciones')
          .update({ total: Math.round((Number(p.liquidacion!.total) + total) * 100) / 100 })
          .eq('id', liquidacionId);
        if (error) throw new Error(error.message);
      }

      const { error: e2 } = await supabase.from('comisiones_movimientos')
        .update({ liquidacion_id: liquidacionId })
        .in('id', pendientes.map((m) => m.id));
      if (e2) throw new Error(e2.message);

      setAviso({ tipo: 'ok', texto: `Cerrado ${MESES[mes - 1]} de ${nombres[p.beneficiario] || p.beneficiario}: ${fmtARS(total)}.` });
      await periodo.recargar();
    } catch (e) {
      fallar(e, 'cerrar el mes');
    } finally {
      setTrabajando(null);
    }
  }, [anio, mes, nombres, periodo, usuario, fallar]);

  const cambiarEstado = useCallback(async (p: FilaPersona, nuevo: EstadoLiquidacion) => {
    if (!p.liquidacion) return;
    const etiqueta = nuevo === 'APROBADA' ? 'aprobar' : 'marcar como pagada';
    const persona = nombres[p.beneficiario] || p.beneficiario;
    if (!window.confirm(
      `¿${etiqueta === 'aprobar' ? 'Aprobar' : 'Marcar como pagada'} la liquidación de ${persona} `
      + `por ${fmtARS(p.liquidacion.total)}?\n\n`
      + (nuevo === 'APROBADA'
        ? 'Después de aprobarla no se le pueden sumar movimientos: los que lleguen tarde caen en el mes siguiente.'
        : 'Queda registrado quién y cuándo.'),
    )) return;

    setTrabajando(p.beneficiario);
    setAviso(null);
    try {
      const sello = new Date().toISOString();
      const campos = nuevo === 'APROBADA'
        ? { estado: nuevo, aprobada_at: sello, aprobada_por: usuario?.username ?? null }
        : { estado: nuevo, pagada_at: sello, pagada_por: usuario?.username ?? null };
      const { error } = await supabase.from('comisiones_liquidaciones').update(campos).eq('id', p.liquidacion.id);
      if (error) throw new Error(error.message);
      setAviso({ tipo: 'ok', texto: `Liquidación de ${persona}: ${ESTADO_TEXTO[nuevo].toLowerCase()}.` });
      await periodo.recargar();
    } catch (e) {
      fallar(e, etiqueta);
    } finally {
      setTrabajando(null);
    }
  }, [nombres, periodo, usuario, fallar]);

  const anios = useMemo(() => {
    const actual = hoy.getFullYear();
    return [actual + 1, actual, actual - 1, actual - 2];
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-blue-600" />
            Comisiones — panel de la Dirección
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Lo devengado del mes por persona, y los actos de aprobación y pago.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            type="button"
            onClick={() => { void periodo.recargar(); void regimen.recargar(); }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-2"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </div>

      {!regimen.loading && !regimen.activo && (
        <AvisoRegimen motivo={regimen.motivo} desde={regimen.desde} esAdmin />
      )}

      {aviso && (
        <div className={`rounded-xl p-4 text-sm border ${
          aviso.tipo === 'ok'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {aviso.texto}
        </div>
      )}

      {periodo.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">{periodo.error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { t: 'Devengado del mes', v: totales.devengado, c: 'text-blue-600', n: 'Con los reversos ya restados' },
          { t: 'Aprobado', v: totales.aprobado, c: 'text-indigo-600', n: 'Liquidaciones firmadas' },
          { t: 'Pagado', v: totales.pagado, c: 'text-green-600', n: 'Lo que ya salió' },
        ].map((x) => (
          <div key={x.t} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-sm text-gray-500">{x.t}</div>
            <div className={`text-2xl font-bold mt-1 ${x.c}`}>{fmtARS(x.v)}</div>
            <div className="text-xs text-gray-500 mt-1">{x.n}</div>
          </div>
        ))}
      </div>

      {periodo.loading && <div className="text-gray-500 text-sm">Cargando el período…</div>}

      {!periodo.loading && periodo.personas.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
          <Users className="h-8 w-8 mx-auto text-gray-300 mb-2" />
          No hay comisiones devengadas en {MESES[mes - 1]} de {anio}.
        </div>
      )}

      <div className="space-y-3">
        {periodo.personas.map((p) => {
          const estado = p.liquidacion?.estado ?? 'DEVENGADA';
          const esteAbierto = abierto === p.beneficiario;
          const ocupado = trabajando === p.beneficiario;
          const cerrado = Boolean(p.liquidacion) && p.sinLiquidar === 0;
          return (
            <div key={p.beneficiario} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAbierto(esteAbierto ? null : p.beneficiario)}
                  className="flex items-center gap-2 text-left min-w-0"
                >
                  {esteAbierto ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{p.nombre}</div>
                    <div className="text-xs text-gray-500">
                      {p.movimientos.length} {p.movimientos.length === 1 ? 'movimiento' : 'movimientos'}
                      {p.sinLiquidar !== 0 && (
                        <span className="text-amber-700"> · {fmtARS(p.sinLiquidar)} sin liquidar</span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-xs border rounded-full px-2.5 py-1 ${ESTADO_ESTILO[estado]}`}>
                    {ESTADO_TEXTO[estado]}
                  </span>
                  <span className="text-lg font-bold text-gray-900">{fmtARS(p.devengado)}</span>

                  {!cerrado && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void cerrarMes(p)}
                      className="inline-flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-3 py-2"
                    >
                      <Lock className="h-4 w-4" />
                      Cerrar el mes
                    </button>
                  )}
                  {cerrado && estado === 'DEVENGADA' && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void cambiarEstado(p, 'APROBADA')}
                      className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg px-3 py-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aprobar
                    </button>
                  )}
                  {estado === 'APROBADA' && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void cambiarEstado(p, 'PAGADA')}
                      className="inline-flex items-center gap-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg px-3 py-2"
                    >
                      <Wallet className="h-4 w-4" />
                      Marcar pagada
                    </button>
                  )}
                </div>
              </div>

              {esteAbierto && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-3">
                  <TablaMovimientos movimientos={p.movimientos} />
                  {p.liquidacion && (
                    <p className="text-xs text-gray-500 mt-3">
                      Liquidación creada el {p.liquidacion.created_at.slice(0, 10)}
                      {p.liquidacion.created_by ? ` por ${p.liquidacion.created_by}` : ''}
                      {p.liquidacion.aprobada_at && ` · aprobada el ${p.liquidacion.aprobada_at.slice(0, 10)} por ${p.liquidacion.aprobada_por}`}
                      {p.liquidacion.pagada_at && ` · pagada el ${p.liquidacion.pagada_at.slice(0, 10)} por ${p.liquidacion.pagada_por}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 pt-2">
        Al {hoyLocal()}. Los movimientos los emite el job automático cuando el paciente se opera; esta pantalla
        no puede crearlos ni borrarlos, sólo agruparlos en una liquidación.
      </p>
    </div>
  );
};

export default PanelComisionesPage;
