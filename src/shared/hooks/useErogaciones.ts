// ============================================
// HOOK: useErogaciones
// Sistema de Costos - Instituto Dr. Mercado
// v2.2 - Toggle 3 estados (sin_clasificar / fijo / variable)
// ============================================
// RUTA DESTINO: src/hooks/useErogaciones.ts
// ============================================

import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/apiConfig';

// ============================================
// TIPOS
// ============================================

export type TipoCosto = 'sin_clasificar' | 'fijo' | 'variable';

export interface CategoriaCostoFijo {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  icono: string;
  orden: number;
  activa: boolean;
}

export interface Erogacion {
  fuente: 'MovProv' | 'MovValoresEnca' | 'LiqComp';
  id_geclisa: number;
  fecha: string;
  proveedor_nombre: string;
  descripcion: string;
  monto: number;
  categoria_sugerida: string;
  tipo_comprobante: string;
  numero_comprobante: string;
  // Campos de clasificación (de Supabase)
  tipo_costo: TipoCosto;
  clasificacion_id?: string;
  categoria_costo_fijo_id?: string | null;
  categoria_costo_fijo_nombre?: string | null;
  categoria_costo_fijo_color?: string | null;
  auto_clasificado?: boolean;
  // Subcategoría variable (honorarios / insumos)
  subcategoria_variable?: 'honorarios' | 'insumos' | null;
  // Retrocompatibilidad
  es_costo_fijo?: boolean;
}

export type SubcategoriaVariable = 'honorarios' | 'insumos';

interface ClasificacionErogacion {
  id: string;
  fuente: string;
  id_geclisa: number;
  anio: number;
  mes: number;
  tipo_costo: TipoCosto;
  es_costo_fijo: boolean;
  categoria_costo_fijo_id?: string | null;
  subcategoria_variable?: 'honorarios' | 'insumos' | null;
  auto_clasificado?: boolean;
  clasificado_por?: string;
  clasificado_at?: string;
}

interface ProveedorDefault {
  id: string;
  prov_id_geclisa: number;
  prov_nombre: string;
  tipo_costo_default: TipoCosto;
  es_costo_fijo_default: boolean;
  categoria_costo_fijo_id?: string | null;
  categoria?: string;
}

interface ResumenMensual {
  mes: number;
  proveedores: number;
  egresos_caja: number;
  liquidaciones: number;
  total_mes: number;
  cantidad_total: number;
}

interface PendienteGuardarDefault {
  proveedor_nombre: string;
  categoria_id: string;
  categoria_nombre: string;
}

// ============================================
// CONSTANTES
// ============================================

// Normaliza tipo_costo: elimina comillas embebidas que genera Supabase JSONB
// Ejemplo: '"variable"' → 'variable', '"fijo"' → 'fijo'
const normalizeTipoCosto = (valor: any): TipoCosto => {
  if (!valor) return 'sin_clasificar';
  const str = String(valor).replace(/^"|"$/g, '').trim();
  if (str === 'fijo' || str === 'variable' || str === 'sin_clasificar') {
    return str as TipoCosto;
  }
  return 'sin_clasificar';
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ============================================
// HOOK PRINCIPAL
// ============================================

const useErogaciones = (anioInicial?: number, mesInicial?: number) => {
  // Estado del período
  const [anio, setAnio] = useState<number>(anioInicial || new Date().getFullYear());
  const [mes, setMes] = useState<number>(mesInicial || new Date().getMonth() + 1);

  // Estado de datos
  const [erogaciones, setErogaciones] = useState<Erogacion[]>([]);
  const [clasificaciones, setClasificaciones] = useState<Map<string, ClasificacionErogacion>>(new Map());
  const [proveedoresDefault, setProveedoresDefault] = useState<ProveedorDefault[]>([]);
  const [categorias, setCategorias] = useState<CategoriaCostoFijo[]>([]);
  const [resumenAnual, setResumenAnual] = useState<ResumenMensual[]>([]);

  // Estado de UI
  const [loading, setLoading] = useState(false);
  const [loadingClasificacion, setLoadingClasificacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Auto-parametrización
  const [pendienteGuardarDefault, setPendienteGuardarDefault] = useState<PendienteGuardarDefault | null>(null);

  // ============================================
  // HELPERS
  // ============================================

  const getClaveErogacion = (fuente: string, idGeclisa: number): string => {
    return `${fuente}_${idGeclisa}`;
  };

  const mostrarMensaje = (mensaje: string, tipo: 'success' | 'error') => {
    if (tipo === 'success') {
      setSuccessMessage(mensaje);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(mensaje);
      setTimeout(() => setError(null), 5000);
    }
  };

  // ============================================
  // CARGAR CATEGORÍAS DE COSTO FIJO
  // ============================================

  const cargarCategorias = useCallback(async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('categorias_costo_fijo')
        .select('*')
        .eq('activa', true)
        .order('orden');

      if (supabaseError) throw supabaseError;
      setCategorias(data || []);
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  }, []);

  // ============================================
  // CARGAR PROVEEDORES DEFAULT
  // ============================================

  const cargarProveedoresDefault = useCallback(async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('proveedores_clasificacion_default')
        .select('*')
        .order('prov_nombre');

      if (supabaseError) throw supabaseError;
      setProveedoresDefault(data || []);
    } catch (err) {
      console.error('Error cargando proveedores default:', err);
    }
  }, []);

  // ============================================
  // BUSCAR PROVEEDOR DEFAULT
  // ============================================

  const buscarProveedorDefault = useCallback((proveedorNombre: string): ProveedorDefault | undefined => {
    const nombreUpper = proveedorNombre.toUpperCase();
    return proveedoresDefault.find(p =>
      nombreUpper.includes(p.prov_nombre.toUpperCase()) ||
      p.prov_nombre.toUpperCase().includes(nombreUpper)
    );
  }, [proveedoresDefault]);

  // ============================================
  // GUARDAR PROVEEDOR DEFAULT
  // ============================================

  const guardarProveedorDefault = useCallback(async (
    provNombre: string,
    tipoCostoDefault: TipoCosto,
    categoriaId?: string
  ) => {
    try {
      const { error: insertError } = await supabase
        .from('proveedores_clasificacion_default')
        .insert([{
          prov_id_geclisa: 0, // Se actualiza después si se encuentra el ID real
          prov_nombre: provNombre,
          tipo_costo_default: tipoCostoDefault,
          es_costo_fijo_default: tipoCostoDefault === 'fijo',
          categoria_costo_fijo_id: categoriaId || null,
          categoria: categorias.find(c => c.id === categoriaId)?.nombre || null
        }]);

      if (insertError) throw insertError;

      await cargarProveedoresDefault();
      mostrarMensaje(`Regla guardada: "${provNombre}" → ${tipoCostoDefault}`, 'success');
    } catch (err) {
      console.error('Error guardando proveedor default:', err);
      mostrarMensaje('Error al guardar regla', 'error');
    }
  }, [categorias, cargarProveedoresDefault]);

  // ============================================
  // CONFIRMAR GUARDAR DEFAULT (desde banner)
  // ============================================

  const confirmarGuardarDefault = useCallback(async () => {
    if (!pendienteGuardarDefault) return;

    await guardarProveedorDefault(
      pendienteGuardarDefault.proveedor_nombre,
      'fijo',
      pendienteGuardarDefault.categoria_id
    );
    setPendienteGuardarDefault(null);
  }, [pendienteGuardarDefault, guardarProveedorDefault]);

  // ============================================
  // ELIMINAR PROVEEDOR DEFAULT
  // ============================================

  const eliminarProveedorDefault = useCallback(async (provNombre: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('proveedores_clasificacion_default')
        .delete()
        .ilike('prov_nombre', provNombre);

      if (deleteError) throw deleteError;
      await cargarProveedoresDefault();
    } catch (err) {
      console.error('Error eliminando proveedor default:', err);
    }
  }, [cargarProveedoresDefault]);

  // ============================================
  // CARGAR CLASIFICACIONES DE SUPABASE
  // ============================================

  const cargarClasificaciones = useCallback(async (anioParam: number, mesParam: number) => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('erogaciones_clasificacion')
        .select('*')
        .eq('anio', anioParam)
        .eq('mes', mesParam);

      if (supabaseError) throw supabaseError;

      const mapa = new Map<string, ClasificacionErogacion>();
      (data || []).forEach((c: any) => {
        const clave = getClaveErogacion(c.fuente, c.id_geclisa);
        // Normalizar tipo_costo para eliminar comillas embebidas de JSONB
        mapa.set(clave, { ...c, tipo_costo: normalizeTipoCosto(c.tipo_costo) });
      });
      setClasificaciones(mapa);
    } catch (err) {
      console.error('Error cargando clasificaciones:', err);
    }
  }, []);

  // ============================================
  // AUTO-CLASIFICAR MES (por proveedores default)
  // ============================================

  const autoClasificarMes = useCallback(async (
    erogacionesData: Erogacion[],
    clasificacionesMap: Map<string, ClasificacionErogacion>
  ) => {
    if (proveedoresDefault.length === 0) return;

    let autoClasificados = 0;

    for (const erogacion of erogacionesData) {
      const clave = getClaveErogacion(erogacion.fuente, erogacion.id_geclisa);
      // Solo auto-clasificar si no tiene clasificación previa
      if (clasificacionesMap.has(clave)) continue;

      const provDefault = buscarProveedorDefault(erogacion.proveedor_nombre);
      if (!provDefault) continue;

      try {
        const nuevaClasificacion = {
          fuente: erogacion.fuente,
          id_geclisa: erogacion.id_geclisa,
          anio,
          mes,
          fecha: erogacion.fecha,
          descripcion: erogacion.descripcion,
          proveedor_nombre: erogacion.proveedor_nombre,
          monto: erogacion.monto,
          categoria: erogacion.categoria_sugerida,
          tipo_costo: provDefault.tipo_costo_default || 'fijo',
          es_costo_fijo: provDefault.es_costo_fijo_default,
          categoria_costo_fijo_id: provDefault.categoria_costo_fijo_id || null,
          auto_clasificado: true,
          clasificado_por: 'auto',
          clasificado_at: new Date().toISOString()
        };

        const { data, error: insertError } = await supabase
          .from('erogaciones_clasificacion')
          .upsert([nuevaClasificacion], { onConflict: 'fuente,id_geclisa' })
          .select()
          .single();

        if (!insertError && data) {
          clasificacionesMap.set(clave, data);
          autoClasificados++;
        }
      } catch (err) {
        // Silenciar errores individuales de auto-clasificación
      }
    }

    if (autoClasificados > 0) {
      setClasificaciones(new Map(clasificacionesMap));
      console.log(`🤖 Auto-clasificados: ${autoClasificados} registros`);
    }
  }, [anio, mes, proveedoresDefault, buscarProveedorDefault]);

  // ============================================
  // CARGAR EROGACIONES DE GECLISA
  // ============================================

  const cargarErogaciones = useCallback(async (anioParam?: number, mesParam?: number) => {
    const anioCargar = anioParam || anio;
    const mesCargar = mesParam || mes;

    setLoading(true);
    setError(null);

    try {
      console.log(`🔄 Cargando erogaciones ${mesCargar}/${anioCargar}...`);

      // 1. Cargar desde GECLISA (backend Express)
      const response = await fetch(`${API_BASE_URL}/erogaciones/${anioCargar}/${mesCargar}`);
      if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Error del servidor');

      const erogacionesGeclisa: Erogacion[] = (result.data || []).map((e: any) => ({
        fuente: e.fuente,
        id_geclisa: e.id_geclisa,
        fecha: e.fecha,
        proveedor_nombre: e.proveedor_nombre || '-',
        descripcion: e.descripcion || '',
        monto: Number(e.monto) || 0,
        categoria_sugerida: e.categoria_sugerida || 'Sin categoría',
        tipo_comprobante: e.tipo_comprobante || '',
        numero_comprobante: e.numero_comprobante || '',
        tipo_costo: 'sin_clasificar' as TipoCosto,
        es_costo_fijo: false
      }));

      console.log(`📊 Erogaciones de GECLISA: ${erogacionesGeclisa.length}`);

      // 2. Cargar clasificaciones de Supabase
      await cargarClasificaciones(anioCargar, mesCargar);

      // 3. Cargar proveedores default si no están
      if (proveedoresDefault.length === 0) {
        await cargarProveedoresDefault();
      }

      // 4. Cargar categorías si no están
      if (categorias.length === 0) {
        await cargarCategorias();
      }

      setErogaciones(erogacionesGeclisa);

    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error cargando erogaciones:', mensaje);
      setError(mensaje);
      setErogaciones([]);
    } finally {
      setLoading(false);
    }
  }, [anio, mes, cargarClasificaciones, cargarProveedoresDefault, cargarCategorias,
      proveedoresDefault.length, categorias.length]);

  // ============================================
  // COMBINAR EROGACIONES CON CLASIFICACIONES
  // ============================================

  const erogacionesConClasificacion = useMemo(() => {
    return erogaciones.map(e => {
      const clave = getClaveErogacion(e.fuente, e.id_geclisa);
      const clasificacion = clasificaciones.get(clave);

      if (clasificacion) {
        // Buscar nombre de categoría
        const cat = categorias.find(c => c.id === clasificacion.categoria_costo_fijo_id);

        return {
          ...e,
          tipo_costo: normalizeTipoCosto(clasificacion.tipo_costo),
          es_costo_fijo: clasificacion.es_costo_fijo || normalizeTipoCosto(clasificacion.tipo_costo) === 'fijo',
          clasificacion_id: clasificacion.id,
          categoria_costo_fijo_id: clasificacion.categoria_costo_fijo_id,
          categoria_costo_fijo_nombre: cat?.nombre || null,
          categoria_costo_fijo_color: cat?.color || null,
          auto_clasificado: clasificacion.auto_clasificado || false,
          subcategoria_variable: clasificacion.subcategoria_variable || null
        };
      }

      // Sin clasificación → verificar si hay default de proveedor
      const provDefault = buscarProveedorDefault(e.proveedor_nombre);
      if (provDefault) {
        const cat = categorias.find(c => c.id === provDefault.categoria_costo_fijo_id);
        return {
          ...e,
          tipo_costo: (provDefault.tipo_costo_default || 'fijo') as TipoCosto,
          es_costo_fijo: provDefault.es_costo_fijo_default,
          categoria_costo_fijo_id: provDefault.categoria_costo_fijo_id,
          categoria_costo_fijo_nombre: cat?.nombre || provDefault.categoria || null,
          categoria_costo_fijo_color: cat?.color || null,
          auto_clasificado: true,
          subcategoria_variable: null
        };
      }

      return {
        ...e,
        tipo_costo: 'sin_clasificar' as TipoCosto,
        es_costo_fijo: false,
        auto_clasificado: false,
        subcategoria_variable: null
      };
    });
  }, [erogaciones, clasificaciones, categorias, buscarProveedorDefault]);

  // ============================================
  // CLASIFICAR EROGACIÓN (3 estados)
  // ============================================

  const clasificarErogacion = useCallback(async (
    erogacion: Erogacion,
    nuevoTipo: TipoCosto,
    categoriaCostoFijoId?: string | null,
    subcategoriaVariable?: 'honorarios' | 'insumos' | null
  ) => {
    setLoadingClasificacion(true);
    const clave = getClaveErogacion(erogacion.fuente, erogacion.id_geclisa);
    const clasificacionExistente = clasificaciones.get(clave);

    try {
      const updateData: any = {
        tipo_costo: nuevoTipo,
        es_costo_fijo: nuevoTipo === 'fijo',
        clasificado_por: 'manual',
        clasificado_at: new Date().toISOString()
        // NOTA: updated_at es trigger-managed en Supabase → NO incluir aquí
      };

      // Fijo → asignar categoría, limpiar subcategoria variable
      if (nuevoTipo === 'fijo' && categoriaCostoFijoId) {
        updateData.categoria_costo_fijo_id = categoriaCostoFijoId;
      }
      if (nuevoTipo !== 'fijo') {
        updateData.categoria_costo_fijo_id = null;
      }

      // Variable → asignar subcategoría, limpiar categoría fijo
      if (nuevoTipo === 'variable' && subcategoriaVariable) {
        updateData.subcategoria_variable = subcategoriaVariable;
      }
      if (nuevoTipo !== 'variable') {
        updateData.subcategoria_variable = null;
      }

      if (clasificacionExistente) {
        // UPDATE
        const { error: updateError } = await supabase
          .from('erogaciones_clasificacion')
          .update(updateData)
          .eq('id', clasificacionExistente.id);

        if (updateError) throw updateError;

        setClasificaciones(prev => {
          const nuevo = new Map(prev);
          nuevo.set(clave, {
            ...clasificacionExistente,
            ...updateData,
            categoria_costo_fijo_id: updateData.categoria_costo_fijo_id ?? clasificacionExistente.categoria_costo_fijo_id
          });
          return nuevo;
        });
      } else {
        // INSERT
        const nuevaClasificacion = {
          fuente: erogacion.fuente,
          id_geclisa: erogacion.id_geclisa,
          anio,
          mes,
          fecha: erogacion.fecha,
          descripcion: erogacion.descripcion,
          proveedor_nombre: erogacion.proveedor_nombre,
          monto: erogacion.monto,
          categoria: erogacion.categoria_sugerida,
          ...updateData
        };

        const { data, error: insertError } = await supabase
          .from('erogaciones_clasificacion')
          .insert([nuevaClasificacion])
          .select()
          .single();

        if (insertError) throw insertError;

        setClasificaciones(prev => {
          const nuevo = new Map(prev);
          nuevo.set(clave, { ...data, tipo_costo: nuevoTipo });
          return nuevo;
        });
      }

      // Si se marcó como FIJO con categoría → preguntar si guardar regla
      if (nuevoTipo === 'fijo' && categoriaCostoFijoId) {
        const yaExisteRegla = buscarProveedorDefault(erogacion.proveedor_nombre);
        if (!yaExisteRegla) {
          const catNombre = categorias.find(c => c.id === categoriaCostoFijoId)?.nombre || '';
          setPendienteGuardarDefault({
            proveedor_nombre: erogacion.proveedor_nombre,
            categoria_id: categoriaCostoFijoId,
            categoria_nombre: catNombre
          });
        }
      }

      // Si pasó de fijo a variable o sin_clasificar → eliminar regla default
      if (nuevoTipo !== 'fijo') {
        const reglaExistente = buscarProveedorDefault(erogacion.proveedor_nombre);
        if (reglaExistente) {
          await eliminarProveedorDefault(erogacion.proveedor_nombre);
        }
      }

      const mensajes: Record<TipoCosto, string> = {
        'fijo': 'Marcado como Costo Fijo',
        'variable': 'Marcado como Variable',
        'sin_clasificar': 'Clasificación removida'
      };
      mostrarMensaje(mensajes[nuevoTipo], 'success');

    } catch (err) {
      console.error('Error actualizando clasificación:', err);
      mostrarMensaje('Error al actualizar clasificación', 'error');
    } finally {
      setLoadingClasificacion(false);
    }
  }, [clasificaciones, anio, mes, buscarProveedorDefault, categorias, eliminarProveedorDefault]);

  // ============================================
  // TOGGLE TIPO COSTO (avanza al siguiente estado)
  // sin_clasificar → fijo (abre selector) → variable → sin_clasificar
  // ============================================

  const toggleTipoCosto = useCallback(async (
    erogacion: Erogacion,
    categoriaCostoFijoId?: string
  ): Promise<'necesita_categoria' | 'ok'> => {
    const tipoActual = erogacion.tipo_costo;

    switch (tipoActual) {
      case 'sin_clasificar':
        // Si se proporcionó categoría, marcar como fijo directamente
        if (categoriaCostoFijoId) {
          await clasificarErogacion(erogacion, 'fijo', categoriaCostoFijoId);
          return 'ok';
        }
        // Si no, indicar que necesita categoría (la UI abrirá el dropdown)
        return 'necesita_categoria';

      case 'fijo':
        // De fijo → variable (directo, sin selector)
        await clasificarErogacion(erogacion, 'variable');
        return 'ok';

      case 'variable':
        // De variable → sin_clasificar (directo)
        await clasificarErogacion(erogacion, 'sin_clasificar');
        return 'ok';

      default:
        return 'ok';
    }
  }, [clasificarErogacion]);

  // ============================================
  // ASIGNAR CATEGORÍA A EROGACIÓN YA FIJA
  // ============================================

  const asignarCategoria = useCallback(async (
    erogacion: Erogacion,
    categoriaCostoFijoId: string | null
  ) => {
    setLoadingClasificacion(true);
    const clave = getClaveErogacion(erogacion.fuente, erogacion.id_geclisa);
    const clasificacionExistente = clasificaciones.get(clave);

    try {
      if (clasificacionExistente) {
        const { error: updateError } = await supabase
          .from('erogaciones_clasificacion')
          .update({
            categoria_costo_fijo_id: categoriaCostoFijoId
            // NOTA: updated_at es trigger-managed en Supabase → NO incluir aquí
          })
          .eq('id', clasificacionExistente.id);

        if (updateError) throw updateError;

        setClasificaciones(prev => {
          const nuevo = new Map(prev);
          nuevo.set(clave, {
            ...clasificacionExistente,
            categoria_costo_fijo_id: categoriaCostoFijoId
          });
          return nuevo;
        });

        const catNombre = categorias.find(c => c.id === categoriaCostoFijoId)?.nombre || 'Sin categoría';
        mostrarMensaje(`Categoría asignada: ${catNombre}`, 'success');
      }
    } catch (err) {
      console.error('Error asignando categoría:', err);
      mostrarMensaje('Error al asignar categoría', 'error');
    } finally {
      setLoadingClasificacion(false);
    }
  }, [clasificaciones, categorias]);

  // ============================================
  // MARCAR MÚLTIPLES COMO FIJO
  // ============================================

  const marcarMultiplesFijos = useCallback(async (
    erogacionesList: Erogacion[],
    categoriaCostoFijoId: string
  ) => {
    let exitos = 0;
    for (const e of erogacionesList) {
      try {
        await clasificarErogacion(e, 'fijo', categoriaCostoFijoId);
        exitos++;
      } catch {
        // continuar con las demás
      }
    }
    if (exitos > 0) {
      mostrarMensaje(`${exitos} erogaciones clasificadas como fijo`, 'success');
    }
  }, [clasificarErogacion]);

  // ============================================
  // ESTADÍSTICAS v2.2
  // ============================================

  const estadisticas = useMemo(() => {
    const fijos = erogacionesConClasificacion.filter(e => e.tipo_costo === 'fijo');
    const variables = erogacionesConClasificacion.filter(e => e.tipo_costo === 'variable');
    const sinClasificar = erogacionesConClasificacion.filter(e => e.tipo_costo === 'sin_clasificar');
    const total = erogacionesConClasificacion.length;

    const variablesHonorarios = variables.filter(e => e.subcategoria_variable === 'honorarios');
    const variablesInsumos = variables.filter(e => e.subcategoria_variable === 'insumos');

    return {
      totalErogaciones: erogacionesConClasificacion.reduce((sum, e) => sum + e.monto, 0),
      totalCostosFijos: fijos.reduce((sum, e) => sum + e.monto, 0),
      totalCostosVariables: variables.reduce((sum, e) => sum + e.monto, 0),
      totalSinClasificar: sinClasificar.reduce((sum, e) => sum + e.monto, 0),
      totalVariablesHonorarios: variablesHonorarios.reduce((sum, e) => sum + e.monto, 0),
      totalVariablesInsumos: variablesInsumos.reduce((sum, e) => sum + e.monto, 0),
      cantidadTotal: total,
      cantidadFijos: fijos.length,
      cantidadVariables: variables.length,
      cantidadSinClasificar: sinClasificar.length,
      cantidadVariablesHonorarios: variablesHonorarios.length,
      cantidadVariablesInsumos: variablesInsumos.length,
      porcentajeClasificado: total > 0 ? Math.round(((fijos.length + variables.length) / total) * 100) : 0,
      porcentajeFijos: total > 0 ? Math.round((fijos.length / total) * 100) : 0,
      porcentajeVariables: total > 0 ? Math.round((variables.length / total) * 100) : 0,
      porFuente: {
        proveedores: erogacionesConClasificacion
          .filter(e => e.fuente === 'MovProv')
          .reduce((sum, e) => sum + e.monto, 0),
        egresosCaja: erogacionesConClasificacion
          .filter(e => e.fuente === 'MovValoresEnca')
          .reduce((sum, e) => sum + e.monto, 0),
        liquidaciones: erogacionesConClasificacion
          .filter(e => e.fuente === 'LiqComp')
          .reduce((sum, e) => sum + e.monto, 0)
      }
    };
  }, [erogacionesConClasificacion]);

  // ============================================
  // RESUMEN POR CATEGORÍA (solo fijos)
  // ============================================

  const resumenPorCategoria = useMemo(() => {
    const agrupado = new Map<string, {
      categoria_id: string;
      categoria_nombre: string;
      categoria_color: string;
      cantidad: number;
      total: number;
    }>();

    erogacionesConClasificacion
      .filter(e => e.tipo_costo === 'fijo')
      .forEach(e => {
        const catId = e.categoria_costo_fijo_id || 'sin-categoria';
        const catNombre = e.categoria_costo_fijo_nombre || 'Sin categoría';
        const catColor = e.categoria_costo_fijo_color || '#6B7280';

        const existente = agrupado.get(catId);
        if (existente) {
          existente.cantidad += 1;
          existente.total += e.monto;
        } else {
          agrupado.set(catId, {
            categoria_id: catId,
            categoria_nombre: catNombre,
            categoria_color: catColor,
            cantidad: 1,
            total: e.monto
          });
        }
      });

    return Array.from(agrupado.values()).sort((a, b) => b.total - a.total);
  }, [erogacionesConClasificacion]);

  // ============================================
  // CARGAR RESUMEN ANUAL
  // ============================================

  const cargarResumenAnual = useCallback(async (anioParam?: number) => {
    const anioCargar = anioParam || anio;

    try {
      const response = await fetch(`${API_BASE_URL}/erogaciones/resumen/${anioCargar}`);
      if (!response.ok) throw new Error('Error al cargar resumen');

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      const resumen = result.data.map((r: any) => ({
        mes: r.Mes,
        proveedores: r.Proveedores || 0,
        egresos_caja: r.EgresosCaja || 0,
        liquidaciones: r.Liquidaciones || 0,
        total_mes: r.TotalMes || 0,
        cantidad_total: r.CantidadTotal || 0
      }));

      setResumenAnual(resumen);
    } catch (err) {
      console.error('Error cargando resumen anual:', err);
    }
  }, [anio]);

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    cargarProveedoresDefault();
    cargarCategorias();
  }, [cargarProveedoresDefault, cargarCategorias]);

  useEffect(() => {
    cargarResumenAnual(anio);
  }, [anio, cargarResumenAnual]);

  // ============================================
  // CAMBIAR MES/AÑO
  // ============================================

  const cambiarPeriodo = useCallback((nuevoAnio: number, nuevoMes: number) => {
    setAnio(nuevoAnio);
    setMes(nuevoMes);
    cargarErogaciones(nuevoAnio, nuevoMes);
  }, [cargarErogaciones]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Estado
    anio,
    mes,
    setAnio,
    setMes,
    erogaciones: erogacionesConClasificacion,
    resumenAnual,
    proveedoresDefault,
    categorias,
    loading,
    loadingClasificacion,
    error,
    successMessage,

    // Auto-parametrización
    pendienteGuardarDefault,
    confirmarGuardarDefault,
    setPendienteGuardarDefault,
    guardarProveedorDefault,
    eliminarProveedorDefault,

    // Estadísticas
    estadisticas,
    resumenPorCategoria,

    // Acciones
    cargarErogaciones,
    cargarResumenAnual,
    clasificarErogacion,
    toggleTipoCosto,
    asignarCategoria,
    marcarMultiplesFijos,
    cambiarPeriodo,

    // Helpers
    MESES
  };
};

export default useErogaciones;
