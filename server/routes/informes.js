// ============================================================
// BACKEND - API: INFORME DE GESTIÓN MENSUAL
// Instituto Dr. Mercado - Sistema Integral de Gestión
// ============================================================
// ENDPOINT:
//   GET /api/informes/gestion-mensual?mes=1&anio=2026
//
// El cómputo (19 queries + procesamiento) vive en
// server/services/informesExtractor.js — MISMA fuente que usa el daemon de sync
// para guardar el snapshot en Supabase (dashboards_snapshot, modulo='informes').
// Así no hay drift entre el uso en LAN (esta ruta) y el remoto (frontend leyendo
// el snapshot).
// ============================================================

const express = require('express');
const router = express.Router();
const { generarInformeGestion } = require('../services/informesExtractor');

router.get('/gestion-mensual', async (req, res) => {
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
    console.log(`✅ [INFORMES] Generando informe mes=${mesNum} anio=${anioNum}`);
    const response = await generarInformeGestion(mesNum, anioNum);
    console.log(`✅ [INFORMES] Informe generado - Facturado actual: $${response.resumenMensual.actual.totalFacturado}`);
    res.json(response);
  } catch (error) {
    console.error('Error generando informe de gestión:', error);
    res.status(500).json({
      error: 'Error al generar el informe de gestión',
      detalle: error.message,
    });
  }
});

module.exports = router;
