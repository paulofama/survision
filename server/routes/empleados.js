// ============================================================
// BACKEND - API EMPLEADOS (Modulo Carga de Sueldos)
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// CRUD del maestro de empleados sobre la tabla `empleados` en Supabase.
// El frontend actualmente escribe directo a Supabase via `useEmpleados`;
// estos endpoints existen como alternativa server-side para:
//   - Auditoria centralizada (log_auditoria_sueldos).
//   - Acceso desde clientes no-web (scripts de importacion historica).
//   - Endurecer reglas con SERVICE_ROLE_KEY a futuro (bypass RLS).
//
// ENDPOINTS:
//   GET    /api/empleados             - listar (filtros opcionales)
//   GET    /api/empleados/:id         - obtener uno
//   POST   /api/empleados             - crear
//   PUT    /api/empleados/:id         - actualizar
//   DELETE /api/empleados/:id         - baja logica (estado=inactivo)
//
// CONVENCIONES:
//   - No se envia `updated_at` en INSERT/UPDATE: triggers lo manejan.
//   - DELETE es soft delete. fecha_egreso viene en body/query, por defecto hoy.
//   - Validacion liviana (campos obligatorios). Validacion estricta vive en
//     el form (Zod) y en constraints de Supabase.
// ============================================================

const express = require('express');
const router = express.Router();
const { supabase, mensajeError } = require('../config/supabase');

// ============================================================
// HELPERS
// ============================================================

const AREAS_VALIDAS = new Set([
  'Administración',
  'Cajera',
  'Limpieza',
  'Medición',
  'Recepción',
  'Telefonista',
  'Cirugías',
]);

const TIPOS_DOC_VALIDOS = new Set(['DNI', 'LE', 'LC', 'PASAPORTE', 'CI']);
const SEXOS_VALIDOS = new Set(['M', 'F']);
const ESTADOS_VALIDOS = new Set(['activo', 'inactivo']);

function fechaHoyIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Valida los campos minimos requeridos para crear un empleado.
 * Retorna null si OK, o un string con el primer error encontrado.
 */
function validarCamposCreacion(body) {
  const requeridos = [
    'apellido', 'nombre', 'cuil', 'tipo_documento', 'numero_documento',
    'fecha_nacimiento', 'sexo', 'fecha_ingreso', 'area', 'cuenta_contable',
  ];
  for (const campo of requeridos) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Falta campo obligatorio: ${campo}`;
    }
  }
  if (!AREAS_VALIDAS.has(body.area)) {
    return `Area invalida: ${body.area}`;
  }
  if (!TIPOS_DOC_VALIDOS.has(body.tipo_documento)) {
    return `Tipo de documento invalido: ${body.tipo_documento}`;
  }
  if (!SEXOS_VALIDOS.has(body.sexo)) {
    return `Sexo invalido: ${body.sexo}`;
  }
  return null;
}

/**
 * Filtra campos del body que no deben llegar a la BD (id, created_at, updated_at).
 */
function limpiarPayload(body) {
  const payload = { ...body };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  return payload;
}

// ============================================================
// GET / - listar empleados
// Query params opcionales:
//   ?area=Administración          filtra por area
//   ?estado=activo|inactivo       filtra por estado
//   ?busqueda=texto               busca en apellido/nombre/cuil/doc (ilike)
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { area, estado, busqueda } = req.query;

    let query = supabase
      .from('empleados')
      .select('*')
      .order('apellido', { ascending: true })
      .order('nombre', { ascending: true });

    if (area && AREAS_VALIDAS.has(area)) {
      query = query.eq('area', area);
    }
    if (estado && ESTADOS_VALIDOS.has(estado)) {
      query = query.eq('estado', estado);
    }
    if (busqueda && typeof busqueda === 'string' && busqueda.trim()) {
      const q = busqueda.trim();
      // ilike en multiples columnas con OR
      query = query.or(
        `apellido.ilike.%${q}%,nombre.ilike.%${q}%,cuil.ilike.%${q}%,numero_documento.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[EMPLEADOS GET] Error Supabase:', error);
      return res.status(500).json({ error: mensajeError(error), codigo: error.code });
    }

    res.json({ empleados: data || [], total: (data || []).length });
  } catch (err) {
    console.error('[EMPLEADOS GET] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
});

// ============================================================
// GET /:id - obtener un empleado
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('empleados')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[EMPLEADOS GET/:id] Error Supabase:', error);
      return res.status(500).json({ error: mensajeError(error), codigo: error.code });
    }
    if (!data) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json({ empleado: data });
  } catch (err) {
    console.error('[EMPLEADOS GET/:id] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
});

// ============================================================
// POST / - crear empleado
// ============================================================
router.post('/', async (req, res) => {
  try {
    const errorValidacion = validarCamposCreacion(req.body);
    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    const payload = limpiarPayload({
      ...req.body,
      // Defaults seguros
      estado: req.body.estado || 'activo',
      fecha_egreso: req.body.fecha_egreso || null,
    });

    const { data, error } = await supabase
      .from('empleados')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[EMPLEADOS POST] Error Supabase:', error);
      const status = error.code === '23505' ? 409 : 500;
      return res.status(status).json({ error: mensajeError(error), codigo: error.code });
    }

    res.status(201).json({ empleado: data });
  } catch (err) {
    console.error('[EMPLEADOS POST] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
});

// ============================================================
// PUT /:id - actualizar empleado
// ============================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = limpiarPayload(req.body);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'Sin campos para actualizar' });
    }

    // Validaciones puntuales solo si los campos estan presentes
    if (payload.area && !AREAS_VALIDAS.has(payload.area)) {
      return res.status(400).json({ error: `Area invalida: ${payload.area}` });
    }
    if (payload.tipo_documento && !TIPOS_DOC_VALIDOS.has(payload.tipo_documento)) {
      return res.status(400).json({ error: `Tipo de documento invalido: ${payload.tipo_documento}` });
    }
    if (payload.sexo && !SEXOS_VALIDOS.has(payload.sexo)) {
      return res.status(400).json({ error: `Sexo invalido: ${payload.sexo}` });
    }
    if (payload.estado && !ESTADOS_VALIDOS.has(payload.estado)) {
      return res.status(400).json({ error: `Estado invalido: ${payload.estado}` });
    }

    const { data, error } = await supabase
      .from('empleados')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[EMPLEADOS PUT] Error Supabase:', error);
      const status = error.code === '23505' ? 409 : 500;
      return res.status(status).json({ error: mensajeError(error), codigo: error.code });
    }
    if (!data) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json({ empleado: data });
  } catch (err) {
    console.error('[EMPLEADOS PUT] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
});

// ============================================================
// DELETE /:id - baja logica (soft delete)
// Body opcional: { fecha_egreso: 'YYYY-MM-DD' }. Default: hoy.
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fechaEgreso = (req.body && req.body.fecha_egreso) || req.query.fecha_egreso || fechaHoyIso();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEgreso)) {
      return res.status(400).json({ error: 'fecha_egreso debe estar en formato YYYY-MM-DD' });
    }

    const { data, error } = await supabase
      .from('empleados')
      .update({ estado: 'inactivo', fecha_egreso: fechaEgreso })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[EMPLEADOS DELETE] Error Supabase:', error);
      return res.status(500).json({ error: mensajeError(error), codigo: error.code });
    }
    if (!data) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json({ empleado: data, mensaje: 'Empleado dado de baja (soft delete)' });
  } catch (err) {
    console.error('[EMPLEADOS DELETE] Error inesperado:', err);
    res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
});

module.exports = router;
