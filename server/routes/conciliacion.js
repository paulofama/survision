// ============================================================
// BACKEND - API CONCILIACION (Modulo Carga de Sueldos - Fase 3)
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// Endpoints para conciliar la minuta (Fase 2) contra el F.931 (Fase 3).
// La logica de comparacion vive en services/conciliacionEngine.js (funcion pura);
// estos endpoints orquestan: leer de Supabase, llamar al engine, persistir
// el resultado (preservando justificaciones manuales del usuario).
//
// ENDPOINTS:
//   GET    /api/conciliacion/:anio/:mes
//          Devuelve las diferencias ya guardadas + resumen.
//
//   POST   /api/conciliacion/:anio/:mes/recalcular
//          Lee liquidacion + F.931 (estado=REVISADO_CONFIRMADO), corre el
//          engine, hace upsert (preservando JUSTIFICADA_MANUAL existentes),
//          devuelve las diferencias resultantes.
//
//   PATCH  /api/conciliacion/diferencia/:id/justificar
//          Body: { justificacion: string, justificada_por_nombre?: string }
//          Marca una diferencia MATERIAL_RESIDUAL como JUSTIFICADA_MANUAL.
//
// CONVENCIONES:
//   - Cambios persisten via Supabase con anon key (RLS permisivo, ver migracion).
//   - Si no hay liquidacion o no hay F.931 confirmado, devuelve 404/422.
// ============================================================

const express = require('express');
const router = express.Router();
const { supabase, mensajeError } = require('../config/supabase');
const { conciliar } = require('../services/conciliacionEngine');

// ============================================================
// HELPERS DE LECTURA SUPABASE
// ============================================================

/**
 * Carga la LiquidacionMesCompleta para (anio, mes), incluyendo bloques
 * y lineas anidadas. Devuelve null si no existe.
 */
async function cargarLiquidacionCompleta(anio, mes) {
  const { data: liqRow, error: liqErr } = await supabase
    .from('liquidaciones_mes')
    .select('*')
    .eq('anio', anio)
    .eq('mes', mes)
    .maybeSingle();
  if (liqErr) throw new Error(mensajeError(liqErr));
  if (!liqRow) return null;

  const { data: bloques, error: blqErr } = await supabase
    .from('liquidacion_bloques')
    .select('*')
    .eq('liquidacion_id', liqRow.id);
  if (blqErr) throw new Error(mensajeError(blqErr));

  const bloqueIds = (bloques || []).map((b) => b.id);

  let lineasEmp = [];
  let lineasConc = [];
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

/**
 * Carga el F.931 confirmado del periodo. Devuelve null si no hay ninguno
 * en estado REVISADO_CONFIRMADO.
 */
async function cargarF931Confirmado(anio, mes) {
  const { data, error } = await supabase
    .from('f931_declaraciones')
    .select('*')
    .eq('anio', anio)
    .eq('mes', mes)
    .eq('estado', 'REVISADO_CONFIRMADO')
    .order('confirmado_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(mensajeError(error));
  return data || null;
}

/**
 * Lee todas las diferencias actuales de la liquidacion.
 */
async function cargarDiferenciasActuales(liquidacionId) {
  const { data, error } = await supabase
    .from('conciliacion_diferencias')
    .select('*')
    .eq('liquidacion_id', liquidacionId);
  if (error) throw new Error(mensajeError(error));
  return data || [];
}

/**
 * Computa el "resumen" a partir del array de diferencias persistidas
 * (incluye conteo de JUSTIFICADA_MANUAL).
 */
function calcularResumen(liquidacionId, diferencias, tieneF931Confirmado) {
  const total = diferencias.length;
  const auto = diferencias.filter((d) => d.tipo_diferencia.startsWith('AUTO_')).length;
  const residuales = diferencias.filter(
    (d) => d.tipo_diferencia === 'MATERIAL_RESIDUAL' && !d.justificada
  ).length;
  const manuales = diferencias.filter((d) => d.tipo_diferencia === 'JUSTIFICADA_MANUAL').length;
  const monto = diferencias.reduce((s, d) => s + Math.abs(Number(d.diferencia || 0)), 0);

  return {
    liquidacion_id: liquidacionId,
    tiene_f931_confirmado: tieneF931Confirmado,
    total_diferencias: total,
    auto_justificadas: auto,
    residuales_pendientes: residuales,
    justificadas_manualmente: manuales,
    monto_total_diferencias_absoluto: monto,
    conciliado_completo: total > 0 && residuales === 0,
  };
}

// ============================================================
// GET /:anio/:mes - leer diferencias guardadas + resumen
// ============================================================
router.get('/:anio/:mes', async (req, res) => {
  try {
    const anio = parseInt(req.params.anio, 10);
    const mes = parseInt(req.params.mes, 10);
    if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'anio/mes invalidos' });
    }

    const liq = await cargarLiquidacionCompleta(anio, mes);
    if (!liq) {
      return res.status(404).json({ error: `No hay liquidacion para ${mes}/${anio}` });
    }

    const f931 = await cargarF931Confirmado(anio, mes);
    const diferencias = await cargarDiferenciasActuales(liq.id);
    const resumen = calcularResumen(liq.id, diferencias, !!f931);

    res.json({ diferencias, resumen });
  } catch (err) {
    console.error('[CONCILIACION GET] Error:', err);
    res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
});

// ============================================================
// POST /:anio/:mes/recalcular - recalcular y persistir
// ============================================================
router.post('/:anio/:mes/recalcular', async (req, res) => {
  try {
    const anio = parseInt(req.params.anio, 10);
    const mes = parseInt(req.params.mes, 10);
    if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'anio/mes invalidos' });
    }

    const liq = await cargarLiquidacionCompleta(anio, mes);
    if (!liq) {
      return res.status(404).json({ error: `No hay liquidacion para ${mes}/${anio}` });
    }

    const f931 = await cargarF931Confirmado(anio, mes);
    if (!f931) {
      return res.status(422).json({
        error: `No hay F.931 confirmado para ${mes}/${anio}. Subi y confirma el F.931 antes de conciliar.`,
      });
    }

    // 1. Correr el engine (puro)
    const { diferencias: nuevas } = conciliar(liq, f931);

    // 2. Leer diferencias actuales para preservar JUSTIFICADA_MANUAL
    const existentes = await cargarDiferenciasActuales(liq.id);
    const claveExistente = new Map();
    for (const d of existentes) {
      const k = `${d.bloque_tipo}::${d.concepto_codigo ?? ''}`;
      claveExistente.set(k, d);
    }

    // 3. Borrar todas las diferencias NO manuales (vamos a recrearlas)
    const idsParaBorrar = existentes
      .filter((d) => d.tipo_diferencia !== 'JUSTIFICADA_MANUAL')
      .map((d) => d.id);
    if (idsParaBorrar.length > 0) {
      const { error: delErr } = await supabase
        .from('conciliacion_diferencias')
        .delete()
        .in('id', idsParaBorrar);
      if (delErr) throw new Error(mensajeError(delErr));
    }

    // 4. Insertar las nuevas, saltando las que ya tienen JUSTIFICADA_MANUAL
    const aInsertar = nuevas
      .filter((d) => {
        const k = `${d.bloque_tipo}::${d.concepto_codigo ?? ''}`;
        const prev = claveExistente.get(k);
        return !(prev && prev.tipo_diferencia === 'JUSTIFICADA_MANUAL');
      })
      .map((d) => ({
        liquidacion_id: liq.id,
        bloque_tipo: d.bloque_tipo,
        concepto_codigo: d.concepto_codigo,
        monto_minuta: d.monto_minuta,
        monto_f931: d.monto_f931,
        tipo_diferencia: d.tipo_diferencia,
        justificada: d.justificada,
        justificacion: d.justificacion,
      }));

    if (aInsertar.length > 0) {
      const { error: insErr } = await supabase
        .from('conciliacion_diferencias')
        .insert(aInsertar);
      if (insErr) throw new Error(mensajeError(insErr));
    }

    // 5. Releer todas las diferencias resultantes y armar resumen
    const finales = await cargarDiferenciasActuales(liq.id);
    const resumen = calcularResumen(liq.id, finales, true);

    res.json({
      diferencias: finales,
      resumen,
      mensaje: `Conciliacion recalculada: ${nuevas.length} diferencias nuevas, ${claveExistente.size} previas (${[...claveExistente.values()].filter(d => d.tipo_diferencia === 'JUSTIFICADA_MANUAL').length} JUSTIFICADA_MANUAL preservadas).`,
    });
  } catch (err) {
    console.error('[CONCILIACION recalcular] Error:', err);
    res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
});

// ============================================================
// PATCH /diferencia/:id/justificar - justificar manualmente
// ============================================================
router.patch('/diferencia/:id/justificar', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { justificacion, justificada_por_nombre } = req.body || {};

    if (!justificacion || typeof justificacion !== 'string' || justificacion.trim().length < 5) {
      return res.status(400).json({ error: 'justificacion requerida (min 5 chars)' });
    }

    const { data, error } = await supabase
      .from('conciliacion_diferencias')
      .update({
        tipo_diferencia: 'JUSTIFICADA_MANUAL',
        justificada: true,
        justificacion: justificacion.trim(),
        justificada_at: new Date().toISOString(),
        justificada_por_nombre: justificada_por_nombre || null,
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: mensajeError(error), codigo: error.code });
    }
    if (!data) {
      return res.status(404).json({ error: 'Diferencia no encontrada' });
    }

    res.json({ diferencia: data });
  } catch (err) {
    console.error('[CONCILIACION justificar] Error:', err);
    res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
});

module.exports = router;
