// ===========================================================================
// PAGE: MesDetallePage - MODULO CARGA DE SUELDOS (Fase 2 + Fase 3)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Detalle del mes liquidado. Wrapper con pestañas (Minuta, F.931,
// Conciliación, Asiento, Adjuntos, Hallazgos) + controles globales del mes
// (Cerrar / Reabrir, etc.).
//
// Tabs activos en Fase 3: Minuta, F.931, Conciliación, Adjuntos.
// Pendientes: Asiento (Fase 4), Hallazgos (Fase 5).
//
// Ruta: /sueldos/mes/:anio/:mes
// ===========================================================================

import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ListChecks,
  FileText,
  Scale,
  FileSpreadsheet,
  Paperclip,
  Flag,
  Loader2,
  AlertCircle,
  CheckCircle,
  Calendar,
  CalendarPlus,
  Lock,
  Unlock,
} from 'lucide-react';
import { useLiquidacionMes } from '../../hooks/useLiquidacionMes';
import { useEmpleados } from '../../hooks/useEmpleados';
import { useF931 } from '../../hooks/useF931';
import { useConciliacion } from '../../hooks/useConciliacion';
import { useAsiento } from '../../hooks/useAsiento';
import { useHallazgos } from '../../hooks/useHallazgos';
import { useAuth } from '../../context/AuthContext';
import {
  COLOR_ESTADO_MES,
  LABEL_ESTADO_MES,
  PERMISO_REPORTES_SUELDOS,
  periodoLabel,
} from '../../utils/sueldos/constantes';
import type { ModuloSistema } from '../../types/auth.types';
import { TabMinuta } from '../../components/sueldos/TabMinuta';
import { TabF931 } from '../../components/sueldos/TabF931';
import { TabConciliacion } from '../../components/sueldos/TabConciliacion';
import { TabAsiento } from '../../components/sueldos/TabAsiento';
import { TabHallazgos } from '../../components/sueldos/TabHallazgos';
import { TabAdjuntos } from '../../components/sueldos/TabAdjuntos';
import { ConfirmarCierreMesModal } from '../../components/sueldos/ConfirmarCierreMesModal';
import { ReabrirMesModal } from '../../components/sueldos/ReabrirMesModal';

// ---------------------------------------------------------------------------
// TIPOS / CONFIG DE TABS (module scope)
// ---------------------------------------------------------------------------

type TabKey = 'minuta' | 'f931' | 'conciliacion' | 'asiento' | 'adjuntos' | 'hallazgos';

interface TabConfig {
  key: TabKey;
  label: string;
  icon: React.ElementType;
  disponibleEnFase: 2 | 3 | 4 | 5;
}

const TABS: TabConfig[] = [
  { key: 'minuta',       label: 'Minuta',       icon: ListChecks,      disponibleEnFase: 2 },
  { key: 'f931',         label: 'F.931',        icon: FileText,        disponibleEnFase: 3 },
  { key: 'conciliacion', label: 'Conciliación', icon: Scale,           disponibleEnFase: 3 },
  { key: 'adjuntos',     label: 'Adjuntos',     icon: Paperclip,       disponibleEnFase: 3 },
  { key: 'asiento',      label: 'Asiento',      icon: FileSpreadsheet, disponibleEnFase: 4 },
  { key: 'hallazgos',    label: 'Hallazgos',    icon: Flag,            disponibleEnFase: 5 },
];

// ---------------------------------------------------------------------------
// PAGINA
// ---------------------------------------------------------------------------

const MesDetallePage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ anio: string; mes: string }>();
  const anio = parseInt(params.anio || '0', 10);
  const mes = parseInt(params.mes || '0', 10);

  const valido = anio >= 2020 && anio <= 2050 && mes >= 1 && mes <= 12;

  const liq = useLiquidacionMes(valido ? anio : 0, valido ? mes : 0);
  const emp = useEmpleados();
  const f931 = useF931(valido ? anio : 0, valido ? mes : 0);
  const concil = useConciliacion(valido ? anio : 0, valido ? mes : 0);
  const asiento = useAsiento(valido ? anio : 0, valido ? mes : 0);
  const hallazgos = useHallazgos({ liquidacionId: liq.liquidacion?.id });

  const { tienePermiso, usuario } = useAuth();
  const esAuditor = tienePermiso(PERMISO_REPORTES_SUELDOS as ModuloSistema);

  const [tab, setTab] = useState<TabKey>('minuta');
  const [iniciando, setIniciando] = useState(false);
  const [iniciarError, setIniciarError] = useState<string | null>(null);

  // Modales de cierre / reapertura
  const [modalCierre, setModalCierre] = useState(false);
  const [modalReapertura, setModalReapertura] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  const periodo = useMemo(
    () => (valido ? periodoLabel(anio, mes) : 'Período inválido'),
    [valido, anio, mes]
  );

  // ---- Handlers ----------------------------------------------------------

  const handleInicializar = async () => {
    setIniciando(true);
    setIniciarError(null);
    const res = await liq.inicializarMes();
    setIniciando(false);
    if (!res.ok) setIniciarError(res.error);
  };

  const handleConfirmarCierre = async (confirmacion: string, nombre: string | undefined) => {
    setGlobalError(null);
    const res = await liq.cerrarMes(confirmacion, nombre);
    if (res.ok) {
      setModalCierre(false);
      setGlobalSuccess('Mes cerrado correctamente');
      setTimeout(() => setGlobalSuccess(null), 4000);
    } else {
      setGlobalError(res.error);
    }
  };

  const handleConfirmarReapertura = async (justificacion: string, nombre: string | undefined) => {
    setGlobalError(null);
    const res = await liq.reabrirMes(justificacion, nombre);
    if (res.ok) {
      setModalReapertura(false);
      setGlobalSuccess('Mes reabierto correctamente');
      setTimeout(() => setGlobalSuccess(null), 4000);
    } else {
      setGlobalError(res.error);
    }
  };

  // Wrappers que descartan el ResultadoOperacion para pasarlo al TabMinuta
  // (sus handlers esperan Promise<void>).
  const handleAvanzar = async () => {
    const res = await liq.avanzarEstado();
    if (!res.ok) setGlobalError(res.error);
    else setGlobalError(null);
  };

  const handleAgregarDiaSanidad = async () => {
    const res = await liq.agregarBloqueDiaSanidad();
    if (!res.ok) setGlobalError(res.error);
    else setGlobalError(null);
  };

  // ---- Render guards ------------------------------------------------------

  if (!valido) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/sueldos')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </button>
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-800">
          URL inválida: <code>/sueldos/mes/{params.anio}/{params.mes}</code>.
          El año debe estar entre 2020 y 2050; el mes entre 1 y 12.
        </div>
      </div>
    );
  }

  if (liq.loading && !liq.liquidacion && !liq.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ---- Render -------------------------------------------------------------

  const colores = liq.existeEnBD && liq.liquidacion
    ? COLOR_ESTADO_MES[liq.liquidacion.estado]
    : null;
  const labelEstado = liq.existeEnBD && liq.liquidacion
    ? LABEL_ESTADO_MES[liq.liquidacion.estado]
    : 'Sin iniciar';
  const esCerrado = liq.liquidacion?.estado === 'CERRADO';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/sueldos')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            title="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="h-6 w-6 text-blue-600" />
              {periodo}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-gray-500">Estado:</span>
              <span
                className={`
                  inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium
                  ${colores ? `${colores.bg} ${colores.text} border ${colores.border}` : 'bg-gray-100 text-gray-600 border border-dashed border-gray-300'}
                `}
              >
                {labelEstado}
              </span>
            </div>
          </div>
        </div>

        {/* Controles globales del mes: Cerrar / Reabrir */}
        {liq.existeEnBD && (
          <div className="flex items-center gap-2">
            {!esCerrado && liq.puedeCerrar && (
              <button
                type="button"
                onClick={() => setModalCierre(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                <Lock className="h-4 w-4" />
                Cerrar mes
              </button>
            )}
            {esCerrado && (
              <button
                type="button"
                onClick={() => setModalReapertura(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700"
              >
                <Unlock className="h-4 w-4" />
                Reabrir mes
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mensajes globales */}
      {globalSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{globalSuccess}</p>
        </div>
      )}
      {(globalError || liq.error || iniciarError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{globalError ?? liq.error ?? iniciarError}</p>
        </div>
      )}

      {/* Mes no iniciado: CTA */}
      {!liq.existeEnBD && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <CalendarPlus className="h-12 w-12 text-blue-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Este mes todavía no está iniciado
          </h2>
          <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
            Al iniciar el mes se crean los 4 bloques estables de la minuta
            (Pago de sueldos, Horas complementarias, Seguridad social, Sindicato).
            Después podés agregar el bloque Día de la Sanidad si corresponde.
          </p>
          <button
            type="button"
            onClick={handleInicializar}
            disabled={iniciando}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {iniciando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Iniciar mes
          </button>
        </div>
      )}

      {/* Mes iniciado: pestañas */}
      {liq.existeEnBD && liq.liquidacion && liq.resumen && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px min-w-max">
              {TABS.map((t) => {
                const Icon = t.icon;
                const activo = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`
                      flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                      ${activo
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {t.disponibleEnFase > 2 && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        Fase {t.disponibleEnFase}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Contenido de la tab */}
          <div className="p-5">
            {tab === 'minuta' && (
              <TabMinuta
                bloques={liq.liquidacion.bloques}
                estado={liq.liquidacion.estado}
                resumen={liq.resumen}
                puedeAvanzar={liq.puedeAvanzar}
                disabled={esCerrado}
                empleados={emp.empleados}
                loadingEmpleados={emp.loading}
                onAvanzarEstado={handleAvanzar}
                onAgregarBloqueDiaSanidad={handleAgregarDiaSanidad}
                onEliminarBloqueDiaSanidad={liq.eliminarBloqueDiaSanidad}
                onActualizarBloque={liq.actualizarBloque}
                onAgregarLineaConcepto={liq.agregarLineaConcepto}
                onActualizarLineaConcepto={liq.actualizarLineaConcepto}
                onEliminarLineaConcepto={liq.eliminarLineaConcepto}
                onAgregarLineaEmpleado={liq.agregarLineaEmpleado}
                onActualizarLineaEmpleado={liq.actualizarLineaEmpleado}
                onEliminarLineaEmpleado={liq.eliminarLineaEmpleado}
              />
            )}
            {tab === 'f931' && (
              <TabF931
                anio={anio}
                mes={mes}
                liquidacionId={liq.liquidacion.id}
                declaracion={f931.declaracion}
                loading={f931.loading}
                error={f931.error}
                parsearPdf={f931.parsearPdf}
                crearDeclaracion={f931.crearDeclaracion}
                actualizarCampos={f931.actualizarCampos}
                confirmar={f931.confirmar}
                descartar={f931.descartar}
                refetch={f931.refetch}
                disabled={esCerrado}
              />
            )}
            {tab === 'conciliacion' && (
              <TabConciliacion
                diferencias={concil.diferencias}
                resumen={concil.resumen}
                loading={concil.loading}
                error={concil.error}
                recalcular={concil.recalcular}
                justificarManual={concil.justificarManual}
                disabled={esCerrado}
                tieneF931Confirmado={f931.declaracion?.estado === 'REVISADO_CONFIRMADO'}
              />
            )}
            {tab === 'adjuntos' && (
              <TabAdjuntos
                adjuntos={f931.adjuntos}
                loading={f931.loading}
                error={f931.error}
                obtenerUrlDescarga={f931.obtenerUrlDescarga}
                eliminarAdjunto={f931.eliminarAdjunto}
                disabled={esCerrado}
              />
            )}
            {tab === 'asiento' && (
              <TabAsiento
                asiento={asiento.asiento}
                lineasRecibo={asiento.lineasRecibo}
                lineasFacturado={asiento.lineasFacturado}
                warnings={asiento.warnings}
                loading={asiento.loading}
                error={asiento.error}
                cuadra={asiento.cuadra}
                generar={asiento.generar}
                borrar={asiento.borrar}
                disabled={esCerrado}
                tieneF931Confirmado={f931.declaracion?.estado === 'REVISADO_CONFIRMADO'}
              />
            )}
            {tab === 'hallazgos' && (
              <TabHallazgos
                hallazgos={hallazgos.hallazgos}
                loading={hallazgos.loading}
                error={hallazgos.error}
                crear={hallazgos.crear}
                actualizar={hallazgos.actualizar}
                eliminar={hallazgos.eliminar}
                liquidacionId={liq.liquidacion.id}
                anio={anio}
                mes={mes}
                nombreUsuario={usuario?.nombre_completo}
                esAuditor={esAuditor}
              />
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      <ConfirmarCierreMesModal
        open={modalCierre}
        periodo={periodo}
        onClose={() => setModalCierre(false)}
        onConfirm={handleConfirmarCierre}
      />
      <ReabrirMesModal
        open={modalReapertura}
        periodo={periodo}
        onClose={() => setModalReapertura(false)}
        onConfirm={handleConfirmarReapertura}
      />
    </div>
  );
};

export default MesDetallePage;
