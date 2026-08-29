// ============================================================
// BACKEND - API ASIENTOS (Modulo Carga de Sueldos - Fase 4)
// Sistema de Gestion Integral - Survision S.A.
// ============================================================
//
// Endpoints para generar y leer la PROPUESTA DE ASIENTO de devengamiento
// (borrador para contabilidad).
//
// CAPA FINA: la logica de calculo vive en services/asientoGenerator.js
// (funcion pura) y la orquestacion (leer Supabase, persistir, avanzar estado)
// en services/asientoPersistencia.js. Estos handlers solo parsean el periodo y
// traducen los errores de negocio a codigos de estado HTTP.
//
// La orquestacion se movio al servicio para que los scripts de carga mensual
// puedan invocarla sin backend levantado y sin JWT: estas rutas exigen
// autenticacion (requireSueldos en index.js), y los scripts -escritos antes de
// que existiera auth- se rompian con 401.
//
// ENDPOINTS:
//   GET    /api/asientos/:anio/:mes
//          Devuelve el asiento persistido (cabecera + lineas) o 404 si no hay.
//
//   POST   /api/asientos/:anio/:mes/generar
//          Body: { criterio?: 'REM1_AJUSTE'|'RECONCILIABLE', generado_por_nombre?: string }
//          Genera, reemplaza el asiento, persiste bruto_estimado y avanza el
//          estado del mes a ASIENTO_GENERADO. Devuelve cabecera + lineas + warnings.
//
//   DELETE /api/asientos/:anio/:mes
//          Borra el asiento del mes (cascade borra las lineas) y, si el mes
//          estaba en ASIENTO_GENERADO, lo retrocede a CONCILIADO.
// ============================================================

const express = require('express');
const router = express.Router();
const {
  ErrorAsiento,
  cargarLiquidacionCompleta,
  cargarAsientoPersistido,
  generarYPersistirAsiento,
  borrarAsiento,
} = require('../services/asientoPersistencia');

function parsePeriodo(req, res) {
  const anio = parseInt(req.params.anio, 10);
  const mes = parseInt(req.params.mes, 10);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    res.status(400).json({ error: 'anio/mes invalidos' });
    return null;
  }
  return { anio, mes };
}

/** Traduce un ErrorAsiento a su status; cualquier otro error es un 500. */
function responderError(res, err, contexto) {
  if (err instanceof ErrorAsiento) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  }
  console.error(`[ASIENTOS ${contexto}] Error:`, err);
  return res.status(500).json({ error: 'Error interno', detalle: err.message });
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
    responderError(res, err, 'GET');
  }
});

// ============================================================
// POST /:anio/:mes/generar - generar y persistir
// ============================================================
router.post('/:anio/:mes/generar', express.json(), async (req, res) => {
  try {
    const p = parsePeriodo(req, res);
    if (!p) return;

    const { cabecera, lineas, warnings, criterio } = await generarYPersistirAsiento(p.anio, p.mes, {
      criterio: (req.body && req.body.criterio) || 'RECONCILIABLE',
      generadoPorNombre: (req.body && req.body.generado_por_nombre) || null,
    });

    res.json({
      cabecera,
      lineas,
      warnings,
      mensaje: `Asiento generado: ${lineas.length} líneas, criterio ${criterio}, ${warnings.length} advertencia(s).`,
    });
  } catch (err) {
    responderError(res, err, 'generar');
  }
});

// ============================================================
// DELETE /:anio/:mes - borrar asiento y retroceder estado
// ============================================================
router.delete('/:anio/:mes', async (req, res) => {
  try {
    const p = parsePeriodo(req, res);
    if (!p) return;

    await borrarAsiento(p.anio, p.mes);
    res.json({ ok: true, mensaje: 'Asiento borrado.' });
  } catch (err) {
    responderError(res, err, 'delete');
  }
});

module.exports = router;
