// ============================================================
// BACKEND - API ASIENTOS (Modulo Carga de Sueldos - Fase 4)
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// Endpoints para generar y leer la PROPUESTA DE ASIENTO de devengamiento
// (borrador para contabilidad). La logica de calculo vive en
// services/asientoGenerator.js (funcion pura); estos endpoints orquestan:
// leer de Supabase, llamar al generador, persistir el resultado (cabecera +
// lineas + bruto_estimado por empleado) y avanzar el estado del mes.
//
// ENDPOINTS:
//   GET    /api/asientos/:anio/:mes
//          Devuelve el asiento persistido (cabecera + lineas) o 404 si no hay.
//
//   POST   /api/asientos/:anio/:mes/generar
//          Body: { criterio?: 'REM1_AJUSTE'|'RECONCILIABLE', generado_por_nombre?: string }
//          Lee liquidacion + F.931 confirmado, corre el generador, reemplaza el
//          asiento, persiste bruto_estimado en las lineas de empleado y avanza
//          el estado del mes a ASIENTO_GENERADO. Devuelve cabecera + lineas + warnings.
//
//   DELETE /api/asientos/:anio/:mes
//          Borra el asiento del mes (cascade borra las lineas) y, si el mes
//          estaba en ASIENTO_GENERADO, lo retrocede a CONCILIADO.
//
// CONVENCIONES:
//   - Persiste via Supabase con anon key (RLS permisivo, ver migracion 05).
//   - Nunca enviar updated_at (lo maneja el trigger).
// ============================================================

const express = require('express');
const router = express.Router();
const { supabase, mensajeError } = require('../config/supabase');
const { generarAsiento } = require('../services/asientoGenerator');

// ============================================================
// HELPERS DE LECTURA SUPABASE
// ============================================================

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

function parsePeriodo(req, res) {
  const anio = parseInt(req.params.anio, 10);
  const mes = parseInt(req.params.mes, 10);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    res.status(400).json({ error: 'anio/mes invalidos' });
    return null;
  }
  return { anio, mes };
}

// ============================================================
// GET /:anio/:mes - leer asiento persistido
// ============================================================
router.get('/:anio/:mes', async (req, res) => {
  try {
    const p = parsePeriodo(req, res);
    if (!p) return;

    const liq = await cargarLiquidacionCompleta(p.anio, p.mes);
    if (!liq) return res.status(404).json({ error: `No hay liquidacion para ${p.mes}/${p.anio}` });

    const asiento = await cargarAsientoPersistido(liq.id);
    if (!asiento) {
      return res.status(404).json({ error: `No hay asiento generado para ${p.mes}/${p.anio}` });
    }

    res.json({ cabecera: asiento.cabecera, lineas: asiento.lineas });
  } catch (err) {
    console.error('[ASIENTOS GET] Error:', err);
    res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
});

// ============================================================
// POST /:anio/:mes/generar - generar y persistir
// ============================================================
router.post('/:anio/:mes/generar', express.json(), async (req, res) => {
  try {
    const p = parsePeriodo(req, res);
    if (!p) return;

    const criterio = (req.body && req.body.criterio) || 'RECONCILIABLE';
    const generadoPorNombre = (req.body && req.body.generado_por_nombre) || null;

    const liq = await cargarLiquidacionCompleta(p.anio, p.mes);
    if (!liq) return res.status(404).json({ error: `No hay liquidacion para ${p.mes}/${p.anio}` });

    if (liq.estado === 'CERRADO') {
      return res.status(409).json({ error: 'El mes esta CERRADO. Reabrilo antes de regenerar el asiento.' });
    }

    const f931 = await cargarF931Confirmado(p.anio, p.mes);
    if (!f931) {
      return res.status(422).json({
        error: `No hay F.931 confirmado para ${p.mes}/${p.anio}. Confirmá el F.931 antes de generar el asiento.`,
      });
    }

    const empleadosMap = await cargarEmpleadosMap();

    // 1. Correr el generador (puro)
    let resultado;
    try {
      resultado = generarAsiento(liq, f931, empleadosMap, { criterio });
    } catch (genErr) {
      if (genErr.codigo === 'SIN_NETOS') {
        return res.status(422).json({ error: genErr.message, codigo: 'SIN_NETOS' });
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
    res.json({
      cabecera: persistido?.cabecera ?? cabRow,
      lineas: persistido?.lineas ?? [],
      warnings,
      mensaje: `Asiento generado: ${lineas.length} líneas, criterio ${criterio}, ${warnings.length} advertencia(s).`,
    });
  } catch (err) {
    console.error('[ASIENTOS generar] Error:', err);
    res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
});

// ============================================================
// DELETE /:anio/:mes - borrar asiento y retroceder estado
// ============================================================
router.delete('/:anio/:mes', async (req, res) => {
  try {
    const p = parsePeriodo(req, res);
    if (!p) return;

    const liq = await cargarLiquidacionCompleta(p.anio, p.mes);
    if (!liq) return res.status(404).json({ error: `No hay liquidacion para ${p.mes}/${p.anio}` });

    if (liq.estado === 'CERRADO') {
      return res.status(409).json({ error: 'El mes esta CERRADO. Reabrilo antes de borrar el asiento.' });
    }

    const { error: delErr } = await supabase
      .from('asientos_sueldos').delete().eq('liquidacion_id', liq.id);
    if (delErr) throw new Error(mensajeError(delErr));

    if (liq.estado === 'ASIENTO_GENERADO') {
      const { error: estErr } = await supabase
        .from('liquidaciones_mes').update({ estado: 'CONCILIADO' }).eq('id', liq.id);
      if (estErr) throw new Error(mensajeError(estErr));
    }

    res.json({ ok: true, mensaje: 'Asiento borrado.' });
  } catch (err) {
    console.error('[ASIENTOS delete] Error:', err);
    res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
});

module.exports = router;
