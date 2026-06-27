// ============================================================
// BACKEND - API: SEGUIMIENTO MENSUAL DE PACIENTES
// Instituto Dr. Mercado - Sistema Integral de Gestión
// ============================================================
// ENDPOINTS:
//   GET /api/seguimiento-pacientes/informe-mensual?mes=1&anio=2026
//   GET /api/seguimiento-pacientes/meses-disponibles
//
// El cómputo vive en server/services/seguimientoExtractor.js — MISMA fuente que
// usa el daemon de sync para guardar el snapshot en Supabase (dashboards_snapshot,
// modulo='seguimiento'). Así no hay drift entre el uso en LAN (esta ruta) y el
// remoto (frontend leyendo el snapshot). Reglas/umbrales/queries: ver el extractor.
// ============================================================

const express = require('express');
const router = express.Router();
const { generarInformeMensual, mesesConDatos } = require('../services/seguimientoExtractor');

// ============================================================
// GET /informe-mensual?mes=1&anio=2026
// ============================================================
router.get('/informe-mensual', async (req, res) => {
  const { mes, anio } = req.query;

  if (!mes || !anio) {
    return res.status(400).json({ error: 'Parámetros mes y anio son requeridos' });
  }

  const mesNum = parseInt(mes);
  const anioNum = parseInt(anio);

  if (mesNum < 1 || mesNum > 12 || anioNum < 2020 || anioNum > 2030) {
    return res.status(400).json({ error: 'Parámetros fuera de rango' });
  }

  try {
    console.log(`📋 [SEGUIMIENTO] Generando informe mes=${mesNum} anio=${anioNum}`);
    const response = await generarInformeMensual(mesNum, anioNum);
    console.log(`✅ [SEGUIMIENTO] Informe generado: ${response.kpis.actual.totalAtenciones} atenciones`);
    res.json(response);
  } catch (error) {
    console.error('❌ [SEGUIMIENTO] Error generando informe:', error);
    res.status(500).json({
      error: 'Error al generar el informe de seguimiento de pacientes',
      detalle: error.message,
    });
  }
});

// ============================================================
// GET /meses-disponibles — meses con datos para el selector
// ============================================================
router.get('/meses-disponibles', async (req, res) => {
  try {
    const meses = await mesesConDatos();
    res.json({ meses });
  } catch (error) {
    console.error('❌ [SEGUIMIENTO] Error obteniendo meses:', error);
    res.status(500).json({ error: 'Error al obtener meses disponibles', detalle: error.message });
  }
});

module.exports = router;
