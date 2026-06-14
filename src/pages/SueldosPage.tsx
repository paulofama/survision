// ============================================
// SUELDOS PAGE - v3.0
// Sistema Integral de Gestión — Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/pages/SueldosPage.tsx
// ============================================
// v3.0: Layout de columnas por concepto
//       EMPLEADO | ÁREA | SUELDOS | HS.COMP | DÍA SANIDAD | TOTAL
// ============================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Save, X,
  Loader2, DollarSign, Users, Clock, Shield, Heart, AlertCircle,
  CheckCircle, RefreshCw, FileText, UserCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ============================================
// TIPOS
// ============================================

interface SueldoCategoria { id: string; nombre: string; orden: number; color: string; }

interface SueldoRegistro {
  id: string; anio: number; mes: number; categoria_id: string;
  area: string; empleado: string | null; concepto: string;
  monto: number; observaciones: string | null;
}

// Fila pivoteada: un empleado con sus 3 columnas
interface EmpleadoFila {
  empleado: string;
  area: string;
  sueldos: number;
  sueldosId: string | null;
  horasComp: number;
  horasCompId: string | null;
  diaSanidad: number;
  diaSanidadId: string | null;
  total: number;
}

interface FormData {
  categoria_id: string; area: string; empleado: string;
  concepto: string; monto: string; observaciones: string;
}

const FORM_VACIO: FormData = { categoria_id: '', area: '', empleado: '', concepto: '', monto: '', observaciones: '' };
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const AREAS = ['Administracion', 'Cajera', 'Limpieza', 'Medición', 'Recepción', 'Telefonista'];
const CONCEPTOS_EMPLEADO = ['Sueldos', 'Horas complementarias', 'Día de la Sanidad'];
const CONCEPTOS_GENERALES = ['Contribucion Seg Social', 'Aporte Seguridad Social', 'Contribuición Obra Social', 'Aporte Obra Social', 'Art', 'Seguro', 'Sindicato', 'Intereses CSS', 'Intereses ASS'];

const CAT_ICONS: Record<string, React.ReactNode> = {
  'sueldos': <DollarSign className="w-4 h-4" />, 'horas_complementarias': <Clock className="w-4 h-4" />,
  'cargas_sociales': <Shield className="w-4 h-4" />, 'sindicato': <Users className="w-4 h-4" />,
  'dia_sanidad': <Heart className="w-4 h-4" />, 'intereses_mora': <AlertCircle className="w-4 h-4" />,
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function SueldosPage() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [categorias, setCategorias] = useState<SueldoCategoria[]>([]);
  const [registros, setRegistros] = useState<SueldoRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccion, setLoadingAccion] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formData, setFormData] = useState<FormData>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [tipoForm, setTipoForm] = useState<'empleado' | 'general'>('empleado');

  // CARGAR
  const cargarCategorias = useCallback(async () => {
    const { data } = await supabase.from('sueldos_categorias').select('*').eq('activa', true).order('orden');
    if (data) setCategorias(data);
  }, []);

  const cargarRegistros = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('sueldos_registros').select('*')
        .eq('anio', anio).eq('mes', mes).order('area').order('empleado').order('categoria_id');
      if (error) throw error;
      setRegistros(data || []);
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  }, [anio, mes]);

  useEffect(() => { cargarCategorias(); }, [cargarCategorias]);
  useEffect(() => { cargarRegistros(); }, [cargarRegistros]);

  // NAVEGACIÓN
  const irMes = (dir: -1 | 1) => {
    if (dir === -1) { if (mes === 1) { setAnio(a => a - 1); setMes(12); } else setMes(m => m - 1); }
    else { if (mes === 12) { setAnio(a => a + 1); setMes(1); } else setMes(m => m + 1); }
  };

  // CRUD
  const guardarRegistro = useCallback(async () => {
    const concepto = formData.concepto.trim();
    const area = formData.area.trim();
    const monto = parseFloat(formData.monto.replace(/[^0-9.,-]/g, '').replace(',', '.'));
    if (!formData.categoria_id || !concepto || !area || isNaN(monto) || monto === 0) { setErrorMsg('Completá todos los campos obligatorios'); return; }

    setLoadingAccion(true); setErrorMsg('');
    try {
      const payload: any = {
        anio, mes, categoria_id: formData.categoria_id, area, concepto, monto,
        empleado: tipoForm === 'empleado' && formData.empleado.trim() ? formData.empleado.trim() : null,
        observaciones: formData.observaciones.trim() || null,
      };

      if (editandoId) {
        const { error } = await supabase.from('sueldos_registros')
          .update({ area: payload.area, empleado: payload.empleado, concepto: payload.concepto, monto: payload.monto, categoria_id: payload.categoria_id, observaciones: payload.observaciones })
          .eq('id', editandoId);
        if (error) throw error;
        setSuccessMsg('Actualizado');
      } else {
        const { error } = await supabase.from('sueldos_registros').insert([payload]);
        if (error) { if (error.code === '23505') throw new Error('Ya existe ese registro en este período'); throw error; }
        setSuccessMsg('Agregado');
      }
      setFormData(FORM_VACIO); setEditandoId(null); setMostrarForm(false);
      await cargarRegistros();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Error'); }
    finally { setLoadingAccion(false); }
  }, [formData, anio, mes, editandoId, tipoForm, cargarRegistros]);

  const editarRegistro = (reg: SueldoRegistro) => {
    setTipoForm(reg.empleado ? 'empleado' : 'general');
    setFormData({ categoria_id: reg.categoria_id, area: reg.area, empleado: reg.empleado || '', concepto: reg.concepto, monto: reg.monto.toString(), observaciones: reg.observaciones || '' });
    setEditandoId(reg.id); setMostrarForm(true);
  };

  const eliminarRegistro = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    setLoadingAccion(true);
    try {
      const { error } = await supabase.from('sueldos_registros').delete().eq('id', id);
      if (error) throw error;
      setSuccessMsg('Eliminado'); await cargarRegistros(); setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Error'); }
    finally { setLoadingAccion(false); }
  };

  const cancelarForm = () => { setFormData(FORM_VACIO); setEditandoId(null); setMostrarForm(false); setErrorMsg(''); };

  // ============================================
  // PIVOTAR DATOS: filas → columnas
  // ============================================

  const registrosEmpleados = useMemo(() => registros.filter(r => r.empleado), [registros]);
  const registrosGenerales = useMemo(() => registros.filter(r => !r.empleado), [registros]);

  const empleadosFilas = useMemo((): EmpleadoFila[] => {
    const map = new Map<string, EmpleadoFila>();

    registrosEmpleados.forEach(r => {
      const key = r.empleado!;
      if (!map.has(key)) {
        map.set(key, { empleado: key, area: r.area, sueldos: 0, sueldosId: null, horasComp: 0, horasCompId: null, diaSanidad: 0, diaSanidadId: null, total: 0 });
      }
      const fila = map.get(key)!;
      if (r.concepto === 'Sueldos') { fila.sueldos = r.monto; fila.sueldosId = r.id; }
      else if (r.concepto === 'Horas complementarias') { fila.horasComp = r.monto; fila.horasCompId = r.id; }
      else if (r.concepto === 'Día de la Sanidad') { fila.diaSanidad = r.monto; fila.diaSanidadId = r.id; }
      fila.total = fila.sueldos + fila.horasComp + fila.diaSanidad;
    });

    return Array.from(map.values()).sort((a, b) => {
      const areaComp = a.area.localeCompare(b.area);
      return areaComp !== 0 ? areaComp : b.total - a.total;
    });
  }, [registrosEmpleados]);

  // Totales
  const totalEmpleados = useMemo(() => empleadosFilas.reduce((s, e) => s + e.total, 0), [empleadosFilas]);
  const totalSueldos = useMemo(() => empleadosFilas.reduce((s, e) => s + e.sueldos, 0), [empleadosFilas]);
  const totalHoras = useMemo(() => empleadosFilas.reduce((s, e) => s + e.horasComp, 0), [empleadosFilas]);
  const totalDiaSanidad = useMemo(() => empleadosFilas.reduce((s, e) => s + e.diaSanidad, 0), [empleadosFilas]);
  const totalGenerales = useMemo(() => registrosGenerales.reduce((s, r) => s + r.monto, 0), [registrosGenerales]);
  const totalMes = useMemo(() => registros.reduce((s, r) => s + r.monto, 0), [registros]);

  const empleadosUnicos = useMemo(() => {
    const s = new Set<string>();
    registros.forEach(r => { if (r.empleado) s.add(r.empleado); });
    return Array.from(s).sort();
  }, [registros]);

  const getCatColor = (id: string) => categorias.find(c => c.id === id)?.color || '#6B7280';
  const getCatNombre = (id: string) => categorias.find(c => c.id === id)?.nombre || id;

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 max-w-full">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sueldos y Cargas Sociales</h1>
          <p className="text-sm text-gray-500 mt-1">Detalle por empleado — carga mensual</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => irMes(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-800">{MESES[mes - 1]} {anio}</span>
          </div>
          <button onClick={() => irMes(1)} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-5 h-5" /></button>
          <button onClick={cargarRegistros} disabled={loading} className="p-2 hover:bg-gray-100 rounded-lg ml-2">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* MENSAJES */}
      {successMsg && (<div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm"><CheckCircle className="w-4 h-4" /> {successMsg}</div>)}
      {errorMsg && (<div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm"><AlertCircle className="w-4 h-4" /> {errorMsg}<button onClick={() => setErrorMsg('')} className="ml-auto"><X className="w-4 h-4" /></button></div>)}

      {/* RESUMEN RÁPIDO */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="p-3 bg-white rounded-xl border border-l-4 border-l-blue-500">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5 text-blue-600" /><span className="text-[10px] text-gray-500">Sueldos Base</span></div>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(totalSueldos)}</p>
        </div>
        <div className="p-3 bg-white rounded-xl border border-l-4 border-l-purple-500">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-purple-600" /><span className="text-[10px] text-gray-500">Hs. Complem.</span></div>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(totalHoras)}</p>
        </div>
        <div className="p-3 bg-white rounded-xl border border-l-4 border-l-green-500">
          <div className="flex items-center gap-1.5 mb-1"><Heart className="w-3.5 h-3.5 text-green-600" /><span className="text-[10px] text-gray-500">Día Sanidad</span></div>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(totalDiaSanidad)}</p>
        </div>
        <div className="p-3 bg-white rounded-xl border border-l-4 border-l-amber-500">
          <div className="flex items-center gap-1.5 mb-1"><Shield className="w-3.5 h-3.5 text-amber-600" /><span className="text-[10px] text-gray-500">Cargas Soc.</span></div>
          <p className="text-lg font-bold text-gray-800">{formatCurrency(totalGenerales)}</p>
        </div>
        <div className="p-3 bg-white rounded-xl border border-l-4 border-l-blue-800">
          <div className="flex items-center gap-1.5 mb-1"><Users className="w-3.5 h-3.5 text-blue-800" /><span className="text-[10px] text-gray-500">Empleados</span></div>
          <p className="text-lg font-bold text-gray-800">{empleadosFilas.length}</p>
        </div>
        <div className="p-3 bg-gray-800 rounded-xl text-white">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5 text-gray-300" /><span className="text-[10px] text-gray-300">Total Mes</span></div>
          <p className="text-lg font-bold">{formatCurrency(totalMes)}</p>
        </div>
      </div>

      {/* BOTÓN AGREGAR */}
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => { setMostrarForm(true); setEditandoId(null); setFormData(FORM_VACIO); setTipoForm('empleado'); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {/* FORMULARIO */}
      {mostrarForm && (
        <div className="mb-4 bg-white border rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              {editandoId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editandoId ? 'Editar' : 'Nuevo'} — {MESES[mes - 1]} {anio}
            </h3>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
              <button onClick={() => setTipoForm('empleado')} className={`px-3 py-1 rounded text-xs font-medium ${tipoForm === 'empleado' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
                <UserCircle className="w-3 h-3 inline mr-1" />Por Empleado
              </button>
              <button onClick={() => setTipoForm('general')} className={`px-3 py-1 rounded text-xs font-medium ${tipoForm === 'general' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
                <Shield className="w-3 h-3 inline mr-1" />Concepto General
              </button>
            </div>
          </div>
          <div className={`grid gap-4 ${tipoForm === 'empleado' ? 'grid-cols-1 md:grid-cols-6' : 'grid-cols-1 md:grid-cols-4'}`}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría *</label>
              <select value={formData.categoria_id} onChange={e => setFormData(f => ({ ...f, categoria_id: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none">
                <option value="">Seleccionar...</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Área *</label>
              <input type="text" list="dl-areas" value={formData.area} onChange={e => setFormData(f => ({ ...f, area: e.target.value }))}
                placeholder="Ej: Administracion" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              <datalist id="dl-areas">{AREAS.map(a => <option key={a} value={a} />)}</datalist>
            </div>
            {tipoForm === 'empleado' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Empleado *</label>
                <input type="text" list="dl-emp" value={formData.empleado} onChange={e => setFormData(f => ({ ...f, empleado: e.target.value }))}
                  placeholder="Ej: Parra Ivana" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                <datalist id="dl-emp">{empleadosUnicos.map(e => <option key={e} value={e} />)}</datalist>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Concepto *</label>
              <input type="text" list="dl-conc" value={formData.concepto} onChange={e => setFormData(f => ({ ...f, concepto: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              <datalist id="dl-conc">{(tipoForm === 'empleado' ? CONCEPTOS_EMPLEADO : CONCEPTOS_GENERALES).map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto *</label>
              <input type="text" value={formData.monto} onChange={e => setFormData(f => ({ ...f, monto: e.target.value }))}
                placeholder="0.00" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none text-right font-mono" />
            </div>
            {tipoForm === 'empleado' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Obs.</label>
                <input type="text" value={formData.observaciones} onChange={e => setFormData(f => ({ ...f, observaciones: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button onClick={cancelarForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={guardarRegistro} disabled={loadingAccion}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loadingAccion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editandoId ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /><span className="ml-3 text-gray-500">Cargando...</span></div>
      ) : registros.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white border rounded-xl">
          <DollarSign className="w-12 h-12 mb-3" /><p className="font-medium">No hay registros para {MESES[mes - 1]} {anio}</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ══════ TABLA EMPLEADOS — COLUMNAS ══════ */}
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <h2 className="font-semibold text-blue-800 flex items-center gap-2"><UserCircle className="w-5 h-5" /> Remuneraciones por Empleado</h2>
              <span className="text-sm text-blue-600">{formatCurrency(totalEmpleados)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Empleado</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Área</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-blue-600 uppercase bg-blue-50/50">Sueldos</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-purple-600 uppercase bg-purple-50/50">Hs. Comp.</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-green-600 uppercase bg-green-50/50">Día Sanidad</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                    <th className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-16">Acc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    let currentArea = '';
                    const rows: React.ReactNode[] = [];

                    empleadosFilas.forEach((fila, idx) => {
                      // Separador de área
                      if (fila.area !== currentArea) {
                        currentArea = fila.area;
                        const areaTotal = empleadosFilas.filter(f => f.area === fila.area).reduce((s, f) => s + f.total, 0);
                        rows.push(
                          <tr key={`area-${fila.area}`} className="bg-gray-50">
                            <td colSpan={5} className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wider">{fila.area}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-700 text-sm">{formatCurrency(areaTotal)}</td>
                            <td />
                          </tr>
                        );
                      }

                      rows.push(
                        <tr key={fila.empleado} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <UserCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="font-medium text-gray-800">{fila.empleado}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">{fila.area}</td>
                          <td className="px-3 py-2.5 text-right font-mono bg-blue-50/20">
                            {fila.sueldos > 0 ? (
                              <button onClick={() => fila.sueldosId && editarRegistro(registros.find(r => r.id === fila.sueldosId)!)}
                                className="text-blue-700 hover:text-blue-900 hover:underline cursor-pointer">
                                {formatCurrency(fila.sueldos)}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono bg-purple-50/20">
                            {fila.horasComp > 0 ? (
                              <button onClick={() => fila.horasCompId && editarRegistro(registros.find(r => r.id === fila.horasCompId)!)}
                                className="text-purple-700 hover:text-purple-900 hover:underline cursor-pointer">
                                {formatCurrency(fila.horasComp)}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono bg-green-50/20">
                            {fila.diaSanidad > 0 ? (
                              <button onClick={() => fila.diaSanidadId && editarRegistro(registros.find(r => r.id === fila.diaSanidadId)!)}
                                className="text-green-700 hover:text-green-900 hover:underline cursor-pointer">
                                {formatCurrency(fila.diaSanidad)}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">{formatCurrency(fila.total)}</td>
                          <td className="px-2 py-2.5 text-center">
                            <button onClick={() => {
                              // Buscar el primer registro de este empleado para eliminar
                              const primerReg = registrosEmpleados.find(r => r.empleado === fila.empleado);
                              if (primerReg) eliminarRegistro(primerReg.id);
                            }} className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600" title="Eliminar">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    });
                    return rows;
                  })()}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr className="font-semibold">
                    <td className="px-4 py-3 text-gray-700" colSpan={2}>SUBTOTAL REMUNERACIONES</td>
                    <td className="px-3 py-3 text-right text-blue-700 font-mono bg-blue-50/30">{formatCurrency(totalSueldos)}</td>
                    <td className="px-3 py-3 text-right text-purple-700 font-mono bg-purple-50/30">{formatCurrency(totalHoras)}</td>
                    <td className="px-3 py-3 text-right text-green-700 font-mono bg-green-50/30">{formatCurrency(totalDiaSanidad)}</td>
                    <td className="px-3 py-3 text-right text-gray-800 font-mono font-bold">{formatCurrency(totalEmpleados)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ══════ CONCEPTOS GENERALES ══════ */}
          {registrosGenerales.length > 0 && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <h2 className="font-semibold text-amber-800 flex items-center gap-2"><Shield className="w-5 h-5" /> Cargas Sociales y Conceptos Generales</h2>
                <span className="text-sm text-amber-600">{formatCurrency(totalGenerales)}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Concepto</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Monto</th>
                    <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-16">Acc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {registrosGenerales.sort((a, b) => b.monto - a.monto).map(reg => (
                    <tr key={reg.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ backgroundColor: `${getCatColor(reg.categoria_id)}15`, color: getCatColor(reg.categoria_id) }}>
                          {CAT_ICONS[reg.categoria_id]} {getCatNombre(reg.categoria_id)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-800 font-medium">{reg.concepto}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-800">{formatCurrency(reg.monto)}</td>
                      <td className="px-2 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => editarRegistro(reg)} className="p-1 hover:bg-blue-100 rounded text-blue-500"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => eliminarRegistro(reg.id)} className="p-1 hover:bg-red-100 rounded text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                  <tr><td className="px-4 py-3 font-semibold text-gray-700" colSpan={2}>SUBTOTAL CARGAS Y GENERALES</td><td className="px-3 py-3 text-right font-bold text-gray-800 font-mono">{formatCurrency(totalGenerales)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* TOTAL GENERAL */}
          <div className="bg-gray-800 text-white rounded-xl p-4 flex items-center justify-between">
            <span className="font-semibold text-lg">TOTAL GENERAL — {MESES[mes - 1]} {anio}</span>
            <span className="text-2xl font-bold">{formatCurrency(totalMes)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
