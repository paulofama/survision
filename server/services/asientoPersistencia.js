// ============================================================
// SERVICIO: persistencia de la propuesta de asiento (Sueldos)
// Sistema de Gestion Integral - Survision S.A.
// ============================================================
//
// POR QUE EXISTE
// --------------
// La orquestacion de "generar el asiento del mes" (leer liquidacion + F.931 +
// empleados, correr el generador puro, reemplazar el asiento, persistir el
// bruto estimado y avanzar el estado) vivia adentro del handler HTTP de
// routes/asientos.js. El unico modo de invocarla era por POST.
//
// Eso rompio la carga mensual: cuando se agrego autenticacion, la ruta paso a
// exigir un JWT con permiso de sueldos, y los scripts de carga -escritos antes
// de que existiera auth- siguen mandando la peticion sin token. Devuelve 401.
// Ademas exigian tener el backend levantado en localhost:3001.
//
// Aca vive la orquestacion. La ruta HTTP queda como una capa fina que traduce
// errores a codigos de estado, y los scripts la llaman directo: sin servidor,
// sin puerto, sin credenciales.
//
// El calculo sigue siendo de services/asientoGenerator.js (funcion pura). Esto
// es solo la orquestacion de lecturas y escrituras.
//
// PRIVILEGIOS
// -----------
// Usa el cliente de config/supabase (service_role): bypassa RLS. La ruta HTTP
// verifica identidad y permiso ANTES de llamar acá (requireSueldos). Un script
// de consola ya corre con la service key en la mano, asi que no agrega
// exposicion: cualquiera que pueda correrlo ya tiene el .env.
// ============================================================

const { supabase, mensajeError } = require('../config/supabase');
const { generarAsiento } = require('./asientoGenerator');

/**
 * Error de negocio con un codigo estable. La capa HTTP lo mapea a un status;
 * la CLI lo imprime. Ninguna de las dos tiene que interpretar el mensaje.
 */
class ErrorAsiento extends Error {
  constructor(codigo, mensaje, status) {
    super(mensaje);
    this.name = 'ErrorAsiento';
    this.codigo = codigo;
    this.status = status;
  }
}

/** Carga la LiquidacionMesCompleta para (anio, mes). Devuelve null si no existe. */
async function cargarLiquidacionCompleta(anio, mes) {
  const { data: liqRow, error: liqErr } = await supabase
    .from('liquidaciones_mes').select('*').eq('anio', anio).eq('mes', mes).maybeSingle();
  if (liqErr) throw new Error(mensajeError(liqErr));
  if (!liqRow) return null;

  const { data: bloques, error: blqErr } = await supabase
    .from('liquidacion_bloques').select('*').eq('liquidacion_id', liqRow.id);
  if (blqErr) throw new Error(mensajeError(blqErr));

  const bloqueIds = (bloques || []).map((b) => b.id);
  let lineasEmp = [], lineasConc = [];
  if (bloqueIds.length > 0) {
    const [empRes, concRes] = await Promise.all([
      supabase.from('liquidacion_lineas_empleado').select('*').in('bloque_id', bloqueIds),
      supabase.from('liquidacion_lineas_concepto').select('*').in('bloque_id', bloqueIds),
    ]);
    if (empRes.error) throw new Error(mensajeError(empRes.error));
    if (concRes.error) throw new Error(mensajeError(concRes.error));
    lineasEmp = empRes.data || [];
    lineasConc = concRes.data || [];
  }

  const bloquesCompletos = (bloques || []).map((b) => ({
    ...b,
    lineas_empleado: lineasEmp.filter((l) => l.bloque_id === b.id),
    lineas_concepto: lineasConc.filter((l) => l.bloque_id === b.id),
  }));
  return { ...liqRow, bloques: bloquesCompletos };
}

/** Carga el F.931 confirmado del periodo. Devuelve null si no hay ninguno. */
async function cargarF931Confirmado(anio, mes) {
  const { data, error } = await supabase
    .from('f931_declaraciones').select('*')
    .eq('anio', anio).eq('mes', mes).eq('estado', 'REVISADO_CONFIRMADO')
    .order('confirmado_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(mensajeError(error));
  return data || null;
}

/** Carga todos los empleados como Map<id, empleado>. */
async function cargarEmpleadosMap() {
  const { data, error } = await supabase
    .from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (error) throw new Error(mensajeError(error));
  const map = new Map();
  for (const e of data || []) map.set(e.id, e);
  return map;
}

/** Lee el asiento persistido (cabecera + lineas) de una liquidacion. */
async function cargarAsientoPersistido(liquidacionId) {
  const { data: cab, error: cabErr } = await supabase
    .from('asientos_sueldos').select('*').eq('liquidacion_id', liquidacionId).maybeSingle();
  if (cabErr) throw new Error(mensajeError(cabErr));
  if (!cab) return null;

  const { data: lineas, error: linErr } = await supabase
    .from('asiento_sueldos_lineas').select('*').eq('asiento_id', cab.id).order('orden', { ascending: true });
  if (linErr) throw new Error(mensajeError(linErr));

  return { cabecera: cab, lineas: lineas || [] };
}

/**
 * Genera y persiste el asiento del mes. Reemplaza el que hubiera.
 *
 * @param {number} anio
 * @param {number} mes  1-12
 * @param {{criterio?: 'REM1_AJUSTE'|'RECONCILIABLE', generadoPorNombre?: string}} [opts]
 * @returns {Promise<{cabecera: object, lineas: object[], warnings: string[], criterio: string}>}
 * @throws {ErrorAsiento} SIN_LIQUIDACION | MES_CERRADO | SIN_F931 | SIN_NETOS
 */
async function generarYPersistirAsiento(anio, mes, opts = {}) {
  const criterio = opts.criterio || 'RECONCILIABLE';
  const generadoPorNombre = opts.generadoPorNombre || null;

  const liq = await cargarLiquidacionCompleta(anio, mes);
  if (!liq) {
    throw new ErrorAsiento('SIN_LIQUIDACION', `No hay liquidacion para ${mes}/${anio}`, 404);
  }
  if (liq.estado === 'CERRADO') {
    throw new ErrorAsiento('MES_CERRADO', 'El mes esta CERRADO. Reabrilo antes de regenerar el asiento.', 409);
  }

  const f931 = await cargarF931Confirmado(anio, mes);
  if (!f931) {
    throw new ErrorAsiento(
      'SIN_F931',
      `No hay F.931 confirmado para ${mes}/${anio}. Confirmá el F.931 antes de generar el asiento.`,
      422,
    );
  }

  const empleadosMap = await cargarEmpleadosMap();

  // 1. Correr el generador (puro)
  let resultado;
  try {
    resultado = generarAsiento(liq, f931, empleadosMap, { criterio });
  } catch (genErr) {
    if (genErr.codigo === 'SIN_NETOS') {
      throw new ErrorAsiento('SIN_NETOS', genErr.message, 422);
    }
    throw genErr;
  }
  const { cabecera, lineas, repartos, warnings } = resultado;

  // 2. Reemplazar el asiento existente (delete cascade borra las lineas)
  const { error: delErr } = await supabase
    .from('asientos_sueldos').delete().eq('liquidacion_id', liq.id);
  if (delErr) throw new Error(mensajeError(delErr));

  // 3. Insertar cabecera
  const { data: cabRow, error: cabErr } = await supabase
    .from('asientos_sueldos')
    .insert({
      liquidacion_id: liq.id,
      anio: cabecera.anio,
      mes: cabecera.mes,
      f931_declaracion_id: cabecera.f931_declaracion_id,
      criterio_bruto: cabecera.criterio_bruto,
      rem_1_usado: cabecera.rem_1_usado,
      total_neto: cabecera.total_neto,
      bruto_total: cabecera.bruto_total,
      monto_ajuste: cabecera.monto_ajuste,
      total_debe: cabecera.total_debe,
      total_haber: cabecera.total_haber,
      generado_at: new Date().toISOString(),
      generado_por_nombre: generadoPorNombre,
    })
    .select()
    .single();
  if (cabErr) throw new Error(mensajeError(cabErr));

  // 4. Insertar lineas
  const lineasInsert = lineas.map((l) => ({
    asiento_id: cabRow.id,
    orden: l.orden,
    seccion: l.seccion,
    cuenta_codigo: l.cuenta_codigo,
    cuenta_nombre: l.cuenta_nombre,
    detalle: l.detalle,
    debe: l.debe,
    haber: l.haber,
    es_ajuste: l.es_ajuste,
    es_estimado: l.es_estimado,
    empleado_id: l.empleado_id,
    area: l.area,
  }));
  if (lineasInsert.length > 0) {
    const { error: linErr } = await supabase.from('asiento_sueldos_lineas').insert(lineasInsert);
    if (linErr) throw new Error(mensajeError(linErr));
  }

  // 5. Persistir bruto_estimado en las lineas de empleado del bloque pago_sueldos
  await Promise.all(
    repartos
      .filter((r) => r.linea_id)
      .map((r) =>
        supabase
          .from('liquidacion_lineas_empleado')
          .update({ bruto_estimado: r.bruto })
          .eq('id', r.linea_id)
          .then(({ error }) => {
            if (error) throw new Error(mensajeError(error));
          })
      )
  );

  // 6. Avanzar el estado del mes a ASIENTO_GENERADO (si no estaba mas avanzado)
  if (liq.estado !== 'ASIENTO_GENERADO' && liq.estado !== 'CERRADO') {
    const { error: estErr } = await supabase
      .from('liquidaciones_mes')
      .update({ estado: 'ASIENTO_GENERADO' })
      .eq('id', liq.id);
    if (estErr) throw new Error(mensajeError(estErr));
  }

  // 7. Releer y devolver
  const persistido = await cargarAsientoPersistido(liq.id);
  return {
    cabecera: persistido?.cabecera ?? cabRow,
    lineas: persistido?.lineas ?? [],
    warnings,
    criterio,
  };
}

/**
 * Borra el asiento del mes y, si el mes estaba en ASIENTO_GENERADO, lo
 * retrocede a CONCILIADO.
 * @throws {ErrorAsiento} SIN_LIQUIDACION | MES_CERRADO
 */
async function borrarAsiento(anio, mes) {
  const liq = await cargarLiquidacionCompleta(anio, mes);
  if (!liq) {
    throw new ErrorAsiento('SIN_LIQUIDACION', `No hay liquidacion para ${mes}/${anio}`, 404);
  }
  if (liq.estado === 'CERRADO') {
    throw new ErrorAsiento('MES_CERRADO', 'El mes esta CERRADO. Reabrilo antes de borrar el asiento.', 409);
  }

  const { error: delErr } = await supabase
    .from('asientos_sueldos').delete().eq('liquidacion_id', liq.id);
  if (delErr) throw new Error(mensajeError(delErr));

  if (liq.estado === 'ASIENTO_GENERADO') {
    const { error: estErr } = await supabase
      .from('liquidaciones_mes').update({ estado: 'CONCILIADO' }).eq('id', liq.id);
    if (estErr) throw new Error(mensajeError(estErr));
  }
  return { estadoAnterior: liq.estado };
}

module.exports = {
  ErrorAsiento,
  cargarLiquidacionCompleta,
  cargarF931Confirmado,
  cargarEmpleadosMap,
  cargarAsientoPersistido,
  generarYPersistirAsiento,
  borrarAsiento,
};
