// ============================================================
// Mis comisiones — lo que cobra una persona
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Cada comisionista ve SÓLO lo suyo, y eso no lo decide esta pantalla: lo
// decide la RLS de la base (migración 56). Acá no hay un filtro por usuario
// porque no hace falta — la consulta ya vuelve recortada. Si alguien sacara
// este componente y llamara a la API con su token, vería exactamente lo mismo.
//
// La pantalla existe para que la persona pueda discutir su liquidación con el
// detalle en la mano: de qué paciente salió cada peso, con qué rol lo cobró y
// sobre qué base. Una comisión que no se puede explicar es una comisión que se
// va a reclamar.
// ============================================================

import React, { useMemo, useState } from 'react';
import { Award, Clock, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '@shared/context/AuthContext';
import AvisoRegimen from '../components/AvisoRegimen';
import TablaMovimientos from '../components/TablaMovimientos';
import {
  MESES,
  fmtARS,
  useFichaComisionista,
  useRegimenComisiones,
  type EstadoLiquidacion,
  type Liquidacion,
  type MovimientoComision,
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

interface Periodo {
  clave: string;
  anio: number;
  mes: number;
  movimientos: MovimientoComision[];
  total: number;
  liquidacion: Liquidacion | null;
}

const Tarjeta: React.FC<{ titulo: string; valor: string; Icono: React.ElementType; color: string; nota?: string }> = ({
  titulo, valor, Icono, color, nota,
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5">
    <div className="flex items-center gap-2 text-gray-500 text-sm">
      <Icono className={`h-4 w-4 ${color}`} />
      {titulo}
    </div>
    <div className="text-2xl font-bold text-gray-900 mt-1">{valor}</div>
    {nota && <div className="text-xs text-gray-500 mt-1">{nota}</div>}
  </div>
);

const MisComisionesPage: React.FC = () => {
  const { usuario, esAdmin } = useAuth();
  const username = usuario?.username ?? null;

  const regimen = useRegimenComisiones();
  const ficha = useFichaComisionista(username);
  const [abierto, setAbierto] = useState<string | null>(null);

  const soyComisionable = useMemo(
    () => regimen.comisionables.some((c) => c.username === username && c.es_comisionable),
    [regimen.comisionables, username],
  );

  // Agrupar por mes de devengo. La liquidación es mensual, así que el mes es
  // la unidad en la que la persona va a discutir lo suyo.
  const periodos = useMemo<Periodo[]>(() => {
    const porLiq = new Map(ficha.liquidaciones.map((l) => [`${l.anio}-${l.mes}`, l]));
    const grupos = new Map<string, MovimientoComision[]>();
    for (const m of ficha.movimientos) {
      const clave = m.fecha_devengo.slice(0, 7);
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave)!.push(m);
    }
    for (const l of ficha.liquidaciones) {
      const clave = `${l.anio}-${String(l.mes).padStart(2, '0')}`;
      if (!grupos.has(clave)) grupos.set(clave, []);
    }
    return [...grupos.entries()]
      .map(([clave, movs]) => {
        const [anio, mes] = clave.split('-').map(Number);
        return {
          clave, anio, mes, movimientos: movs,
          total: Math.round(movs.reduce((s, m) => s + Number(m.importe), 0) * 100) / 100,
          liquidacion: porLiq.get(`${anio}-${mes}`) ?? null,
        };
      })
      .sort((a, b) => (a.clave < b.clave ? 1 : -1));
  }, [ficha.movimientos, ficha.liquidaciones]);

  if (regimen.loading) {
    return <div className="p-8 text-gray-500">Cargando…</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="h-6 w-6 text-blue-600" />
            Mis comisiones
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Lo que devengaste por los presupuestos que entregaste, y lo que ya se liquidó.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void ficha.recargar(); void regimen.recargar(); }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-2"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {!regimen.activo && <AvisoRegimen motivo={regimen.motivo} desde={regimen.desde} esAdmin={esAdmin()} />}

      {regimen.activo && !soyComisionable && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700">
          El régimen de comisiones está en marcha, pero <strong>no estás incluido</strong>. Si creés que
          corresponde, habla con la Dirección: quién entra al régimen lo decide ella, una persona a la vez.
        </div>
      )}

      {ficha.error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">{ficha.error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tarjeta titulo="Devengado" valor={fmtARS(ficha.totalDevengado)} Icono={Award} color="text-blue-600"
                 nota="Total histórico, con reversos restados" />
        <Tarjeta titulo="Pagado" valor={fmtARS(ficha.totalPagado)} Icono={Wallet} color="text-green-600"
                 nota="Liquidaciones marcadas como pagadas" />
        <Tarjeta titulo="Pendiente" valor={fmtARS(ficha.pendiente)} Icono={Clock} color="text-amber-600"
                 nota="Devengado que todavía no se pagó" />
      </div>

      {ficha.loading && <div className="text-gray-500 text-sm">Cargando el detalle…</div>}

      {!ficha.loading && periodos.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
          Todavía no tenés comisiones devengadas.
          <p className="text-sm mt-2">
            Se devengan cuando el paciente <strong>se opera</strong>, no cuando se entrega el presupuesto.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {periodos.map((p) => {
          const estado = p.liquidacion?.estado ?? 'DEVENGADA';
          const esteAbierto = abierto === p.clave;
          return (
            <div key={p.clave} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setAbierto(esteAbierto ? null : p.clave)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 text-left"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{MESES[p.mes - 1]} {p.anio}</div>
                  <div className="text-xs text-gray-500">
                    {p.movimientos.length} {p.movimientos.length === 1 ? 'movimiento' : 'movimientos'}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs border rounded-full px-2.5 py-1 ${ESTADO_ESTILO[estado]}`}>
                    {ESTADO_TEXTO[estado]}
                  </span>
                  <span className="text-lg font-bold text-gray-900">{fmtARS(p.total)}</span>
                </div>
              </button>
              {esteAbierto && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-3">
                  <TablaMovimientos movimientos={p.movimientos} />
                  {p.liquidacion?.pagada_at && (
                    <p className="text-xs text-green-700 mt-3">
                      Pagada el {p.liquidacion.pagada_at.slice(0, 10)}
                      {p.liquidacion.pagada_por ? ` por ${p.liquidacion.pagada_por}` : ''}.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 pt-2">
        Un movimiento emitido no se edita ni se borra: si hay que corregirlo se emite un asiento en contrario,
        que vas a ver acá en rojo con su motivo.
      </p>
    </div>
  );
};

export default MisComisionesPage;
