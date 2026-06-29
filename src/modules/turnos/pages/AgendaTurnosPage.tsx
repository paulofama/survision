// ============================================================
// AGENDA DE TURNOS — listado operativo + recordatorios por WhatsApp
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Sección operativa (distinta del dashboard analítico AnalisisTurnosPage):
// lista los turnos futuros vigentes con sus datos y un botón de WhatsApp por
// paciente (click-to-chat con el recordatorio precargado; la secretaria aprieta
// enviar). Lee el espejo turnos_futuros de Supabase (lo refresca el daemon).
// ============================================================

import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  RefreshCw,
  AlertCircle,
  Filter,
  CheckCircle,
  Clock,
  Users,
  BarChart3,
  MessageCircle,
  PhoneOff,
  Bell,
  Sun,
  Phone,
} from 'lucide-react';
import { useTurnosFuturos, TurnoFuturo } from '../hooks/useTurnosFuturos';
import { useRecordatorios } from '../hooks/useRecordatorios';

// ============================================================
// HELPERS (module scope)
// ============================================================

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "YYYY-MM-DD" -> "dd/mm/aaaa" sin usar Date (evita corrimiento por timezone). */
function formatFechaISO(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** "YYYY-MM-DD" -> "martes 30/06" para el mensaje y la tabla. */
function formatFechaLarga(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  // Mediodía local: evita que el cómputo del día de semana se corra por TZ.
  const dt = new Date(a, m - 1, d, 12, 0, 0);
  const dia = DIAS_SEMANA[dt.getDay()];
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Today as "YYYY-MM-DD" en hora local. */
function hoyISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function sumarDiasISO(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + dias, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** "H:MM" / "HH:MM" -> minutos desde medianoche (NaN si no parsea). */
function horaAMinutos(hora: string): number {
  const [h, m] = (hora || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

/** Minutos desde medianoche de la hora local actual. */
function ahoraEnMinutos(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/** "APELLIDO, Nombre Segundo" -> "Nombre" (primer nombre de pila, capitalizado). */
function nombrePila(paciente: string): string {
  const partes = paciente.split(',');
  const pila = (partes[1] || partes[0] || '').trim();
  const primero = pila.split(/\s+/)[0] || '';
  return primero ? titleCase(primero) : 'paciente';
}

/** Arma el link wa.me con el recordatorio precargado, o null si no hay teléfono. */
function buildWhatsAppUrl(t: TurnoFuturo): string | null {
  if (!t.telefono_norm) return null;
  const msg =
    `Hola ${nombrePila(t.paciente)}, le recordamos su turno en el Instituto Dr. Mercado ` +
    `el ${formatFechaLarga(t.fecha)} a las ${t.hora} hs con ${t.prestador}. ` +
    `Ante cualquier cambio, comuníquese con nosotros. ¡Gracias!`;
  return `https://wa.me/${t.telefono_norm}?text=${encodeURIComponent(msg)}`;
}

function rankearTop(turnos: TurnoFuturo[], key: 'prestador' | 'servicio', top = 5): Array<{ nombre: string; total: number }> {
  const conteo = new Map<string, number>();
  for (const t of turnos) {
    const k = t[key] || 'S/D';
    conteo.set(k, (conteo.get(k) || 0) + 1);
  }
  return [...conteo.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((x, y) => y.total - x.total)
    .slice(0, top);
}

// ============================================================
// SUB-COMPONENTES (module scope)
// ============================================================

const TarjetaIndicador: React.FC<{
  titulo: string;
  valor: number | string;
  subtitulo?: string;
  icono: React.ElementType;
  color: 'blue' | 'green' | 'yellow' | 'gray';
}> = ({ titulo, valor, subtitulo, icono: Icon, color }) => {
  const colores = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  const iconColors = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    yellow: 'text-yellow-500',
    gray: 'text-gray-500',
  };
  return (
    <div className={`rounded-xl border-2 p-4 ${colores[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{titulo}</p>
          <p className="text-3xl font-bold mt-1">{valor}</p>
          {subtitulo && <p className="text-xs mt-1 opacity-70">{subtitulo}</p>}
        </div>
        <div className="p-2 rounded-lg bg-white/50">
          <Icon className={`h-6 w-6 ${iconColors[color]}`} />
        </div>
      </div>
    </div>
  );
};

const BotonWhatsApp: React.FC<{
  turno: TurnoFuturo;
  avisado?: boolean;
  onSent?: (turnoId: number) => void;
}> = ({ turno, avisado, onSent }) => {
  const url = buildWhatsAppUrl(turno);
  if (!url) {
    return (
      <span
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-400 cursor-not-allowed"
        title="Sin celular válido para este paciente"
      >
        <PhoneOff className="h-3.5 w-3.5" />
        Sin teléfono
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onSent?.(turno.turno_id)}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        avisado
          ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
          : 'bg-green-600 text-white hover:bg-green-700'
      }`}
      title={avisado ? 'Ya avisado — reenviar' : 'Abrir WhatsApp con el recordatorio precargado'}
    >
      {avisado ? <CheckCircle className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
      {avisado ? 'Reenviar' : 'WhatsApp'}
    </a>
  );
};

// Grupo de recordatorios (una ventana: "mañana" o "próximas 3 h").
const RecordatorioGrupo: React.FC<{
  titulo: string;
  subtitulo: string;
  icono: React.ElementType;
  color: 'blue' | 'orange';
  turnos: TurnoFuturo[];
  avisados: Set<number>;
  onMarcar: (turnoId: number) => void;
  onDesmarcar: (turnoId: number) => void;
}> = ({ titulo, subtitulo, icono: Icon, color, turnos, avisados, onMarcar, onDesmarcar }) => {
  const conTel = turnos.filter((t) => t.telefono_norm);
  const sinTel = turnos.filter((t) => !t.telefono_norm);
  const avisadosCount = conTel.filter((t) => avisados.has(t.turno_id)).length;
  const pct = conTel.length ? Math.round((avisadosCount / conTel.length) * 100) : 0;

  const cab = color === 'blue'
    ? 'bg-blue-50 border-blue-200'
    : 'bg-orange-50 border-orange-200';
  const iconColor = color === 'blue' ? 'text-blue-600' : 'text-orange-600';
  const barColor = color === 'blue' ? 'bg-blue-500' : 'bg-orange-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      <div className={`px-4 py-3 border-b ${cab}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            <span className="font-semibold text-gray-800">{titulo}</span>
          </div>
          <span className="text-sm font-bold text-gray-700">{turnos.length}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>
        {conTel.length > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Avisados</span>
              <span>{avisadosCount} / {conTel.length}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto flex-1">
        {turnos.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No hay turnos en esta ventana.</p>
        )}

        {conTel.map((t) => {
          const av = avisados.has(t.turno_id);
          return (
            <div
              key={t.turno_id}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${
                av ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
              }`}
            >
              <button
                onClick={() => (av ? onDesmarcar(t.turno_id) : onMarcar(t.turno_id))}
                title={av ? 'Marcar como NO avisado' : 'Marcar como avisado'}
                className={`flex-shrink-0 ${av ? 'text-green-600' : 'text-gray-300 hover:text-gray-400'}`}
              >
                <CheckCircle className="h-5 w-5" />
              </button>
              <span className="font-mono text-xs text-gray-700 w-12 flex-shrink-0">{t.hora}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{t.paciente}</p>
                <p className="text-xs text-gray-500 truncate">{t.prestador}</p>
              </div>
              <BotonWhatsApp turno={t} avisado={av} onSent={onMarcar} />
            </div>
          );
        })}

        {sinTel.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
              <Phone className="h-3.5 w-3.5" /> Sin teléfono — llamar ({sinTel.length})
            </p>
            {sinTel.map((t) => (
              <div key={t.turno_id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-gray-600">
                <span className="font-mono text-xs w-12 flex-shrink-0">{t.hora}</span>
                <span className="truncate flex-1">{t.paciente}</span>
                <span className="text-xs text-gray-400 truncate">{t.prestador}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

const AgendaTurnosPage: React.FC = () => {
  const { turnos, loading, error, ultimaActualizacion, refetch } = useTurnosFuturos();
  const { avisados, marcar, desmarcar } = useRecordatorios();

  const [desde, setDesde] = useState<string>(hoyISO());
  const [hasta, setHasta] = useState<string>(sumarDiasISO(hoyISO(), 7));
  const [prestador, setPrestador] = useState<string>('');
  const [servicio, setServicio] = useState<string>('');
  const [soloSinConfirmar, setSoloSinConfirmar] = useState<boolean>(false);

  // Opciones de filtro (de todos los turnos, no del set filtrado).
  const prestadores = useMemo(
    () => [...new Set(turnos.map((t) => t.prestador))].sort((a, b) => a.localeCompare(b)),
    [turnos],
  );
  const servicios = useMemo(
    () => [...new Set(turnos.map((t) => t.servicio))].sort((a, b) => a.localeCompare(b)),
    [turnos],
  );

  // Set filtrado.
  const filtrados = useMemo(() => {
    return turnos.filter((t) => {
      if (desde && t.fecha < desde) return false;
      if (hasta && t.fecha > hasta) return false;
      if (prestador && t.prestador !== prestador) return false;
      if (servicio && t.servicio !== servicio) return false;
      if (soloSinConfirmar && t.confirmado) return false;
      return true;
    });
  }, [turnos, desde, hasta, prestador, servicio, soloSinConfirmar]);

  // Ventanas de recordatorios (independientes de los filtros: son la cola de trabajo).
  const turnosManana = useMemo(() => {
    const manana = sumarDiasISO(hoyISO(), 1);
    return turnos.filter((t) => t.fecha === manana);
  }, [turnos]);

  const turnos3h = useMemo(() => {
    const hoy = hoyISO();
    const ahora = ahoraEnMinutos();
    return turnos.filter((t) => {
      if (t.fecha !== hoy) return false;
      const min = horaAMinutos(t.hora);
      return !Number.isNaN(min) && min >= ahora && min <= ahora + 180;
    });
  }, [turnos]);

  const subtMananaFecha = useMemo(() => formatFechaLarga(sumarDiasISO(hoyISO(), 1)), []);

  // Indicadores del set filtrado.
  const total = filtrados.length;
  const confirmados = filtrados.filter((t) => t.confirmado).length;
  const sinConfirmar = total - confirmados;
  const sinTelefono = filtrados.filter((t) => !t.telefono_norm).length;
  const topPrestadores = useMemo(() => rankearTop(filtrados, 'prestador'), [filtrados]);
  const topServicios = useMemo(() => rankearTop(filtrados, 'servicio'), [filtrados]);

  // ----- Loading / Error -----
  if (loading && turnos.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-blue-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Cargando agenda de turnos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <h3 className="mt-4 text-lg font-semibold text-red-800">Error al cargar la agenda</h3>
          <p className="mt-2 text-red-600">{error}</p>
          <button
            onClick={refetch}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <CalendarClock className="h-7 w-7 text-blue-600" />
            Turnos — Agenda y recordatorios
          </h1>
          <p className="text-gray-500 mt-1">
            Turnos futuros vigentes. Enviá el recordatorio por WhatsApp con un clic.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ultimaActualizacion && (
            <span className="text-sm text-gray-500">
              Datos: {ultimaActualizacion.toLocaleString('es-AR')}
            </span>
          )}
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Panel de recordatorios (cola de trabajo: a quién avisar ahora) */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-3">
          <Bell className="h-5 w-5 text-blue-600" />
          Recordatorios para enviar
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecordatorioGrupo
            titulo="Para mañana"
            subtitulo={subtMananaFecha}
            icono={Sun}
            color="blue"
            turnos={turnosManana}
            avisados={avisados}
            onMarcar={marcar}
            onDesmarcar={desmarcar}
          />
          <RecordatorioGrupo
            titulo="Hoy, próximas 3 horas"
            subtitulo="Turnos de hoy entre ahora y dentro de 3 h"
            icono={Clock}
            color="orange"
            turnos={turnos3h}
            avisados={avisados}
            onMarcar={marcar}
            onDesmarcar={desmarcar}
          />
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TarjetaIndicador titulo="Turnos en el rango" valor={total} icono={CalendarClock} color="blue" />
        <TarjetaIndicador titulo="Confirmados" valor={confirmados} subtitulo={`${sinConfirmar} sin confirmar`} icono={CheckCircle} color="green" />
        <TarjetaIndicador titulo="Sin confirmar" valor={sinConfirmar} icono={Clock} color="yellow" />
        <TarjetaIndicador titulo="Sin teléfono" valor={sinTelefono} subtitulo="No se puede mandar WhatsApp" icono={PhoneOff} color="gray" />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-blue-600" /> Por prestador
          </h3>
          <div className="space-y-1.5">
            {topPrestadores.map((p) => (
              <div key={p.nombre} className="flex justify-between text-sm">
                <span className="text-gray-700 truncate pr-2">{p.nombre}</span>
                <span className="font-medium text-gray-900">{p.total}</span>
              </div>
            ))}
            {topPrestadores.length === 0 && <p className="text-sm text-gray-400">Sin datos en el rango.</p>}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
            <BarChart3 className="h-5 w-5 text-blue-600" /> Por servicio
          </h3>
          <div className="space-y-1.5">
            {topServicios.map((s) => (
              <div key={s.nombre} className="flex justify-between text-sm">
                <span className="text-gray-700 truncate pr-2">{s.nombre}</span>
                <span className="font-medium text-gray-900">{s.total}</span>
              </div>
            ))}
            {topServicios.length === 0 && <p className="text-sm text-gray-400">Sin datos en el rango.</p>}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3 text-gray-700">
          <Filter className="h-5 w-5 text-blue-600" />
          <span className="font-semibold">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Prestador</span>
            <select value={prestador} onChange={(e) => setPrestador(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="">Todos</option>
              {prestadores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Servicio</span>
            <select value={servicio} onChange={(e) => setServicio(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="">Todos</option>
              {servicios.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm mt-6">
            <input type="checkbox" checked={soloSinConfirmar} onChange={(e) => setSoloSinConfirmar(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300" />
            <span className="text-gray-700">Solo sin confirmar</span>
          </label>
        </div>
      </div>

      {/* Tabla de pacientes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2.5 px-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-600">Hora</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-600">Paciente</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-600">Prestador</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-600">Servicio</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-600">O. Social</th>
                <th className="text-center py-2.5 px-3 font-medium text-gray-600">Estado</th>
                <th className="text-center py-2.5 px-3 font-medium text-gray-600">Recordatorio</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => (
                <tr key={t.turno_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{formatFechaISO(t.fecha)}</td>
                  <td className="py-2 px-3 font-mono text-gray-800 whitespace-nowrap">{t.hora}</td>
                  <td className="py-2 px-3 font-medium text-gray-800">{t.paciente}</td>
                  <td className="py-2 px-3 text-gray-600">{t.prestador}</td>
                  <td className="py-2 px-3 text-gray-600">{t.servicio}</td>
                  <td className="py-2 px-3 text-gray-600">{t.obra_social}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      t.confirmado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {t.confirmado ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {t.confirmado ? 'Confirmado' : 'Sin confirmar'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <BotonWhatsApp turno={t} avisado={avisados.has(t.turno_id)} onSent={marcar} />
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400">
                    No hay turnos en el rango y filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-center text-sm text-gray-400 py-2">
        <p>Datos sincronizados desde GECLISA (2 veces/día: 12:00 y 17:00). Solo turnos vigentes (no atendidos ni pasados).</p>
      </div>
    </div>
  );
};

export default AgendaTurnosPage;
