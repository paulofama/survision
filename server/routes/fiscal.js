// ============================================================
// RUTAS: Modulo Fiscal (IVA)
// ============================================================
// Solo expone lo que depende de GECLISA: la SINCRONIZACION GECLISA->Supabase
// (auto al abrir el modulo si esta desactualizado + boton manual) y el chequeo
// de frescura. Las LECTURAS del libro las hace el frontend directo desde Supabase
// (mismo patron que el resto de la app).
// ============================================================

const express = require('express');
const router = express.Router();
const iva = require('../services/ivaExtractor');

// GET /api/fiscal/health
router.get('/health', (req, res) => res.json({ success: true, modulo: 'fiscal', ts: new Date().toISOString() }));

// GET /api/fiscal/:periodo/freshness  -> ¿el periodo en Supabase coincide con GECLISA?
router.get('/:periodo/freshness', async (req, res) => {
  try {
    const r = await iva.freshness(req.params.periodo);
    res.json({ success: true, ...r });
  } catch (error) {
    console.error('❌ [fiscal] freshness:', error.message);
    res.status(/invalido/i.test(error.message) ? 400 : 500).json({ success: false, error: error.message });
  }
});

// POST /api/fiscal/:periodo/sync  -> re-extrae el periodo de GECLISA y lo reescribe en Supabase
router.post('/:periodo/sync', async (req, res) => {
  try {
    console.log(`🔄 [fiscal] sync ${req.params.periodo}...`);
    const r = await iva.sincronizarPeriodo(req.params.periodo);
    console.log(`✅ [fiscal] sync ${r.periodo}: ventas ${r.v.filas} / compras ${r.c.filas}`);
    res.json({ success: true, ...r });
  } catch (error) {
    console.error('❌ [fiscal] sync:', error.message);
    res.status(/invalido/i.test(error.message) ? 400 : 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
