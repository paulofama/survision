// ============================================================
// BACKEND - API F.931 (Modulo Carga de Sueldos - Fase 3)
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// Endpoints relacionados al parsing del PDF F.931. La persistencia (upload
// del PDF a Storage + INSERT a f931_declaraciones / f931_adjuntos) la hace
// el frontend usando el cliente Supabase compartido — manteniendo el patron
// del proyecto.
//
// ENDPOINTS:
//   POST /api/f931/parse?anio=YYYY&mes=MM  - parsea un PDF (body raw application/pdf)
//
// HEADERS:
//   Content-Type: application/pdf
//
// QUERY PARAMS (opcionales pero recomendados):
//   anio, mes: para validar que el periodo declarado en el PDF coincida.
//
// RESPONSE (200):
//   {
//     ok: true,
//     detectado_como_vep: boolean,
//     cuit_detectado: string | null,
//     periodo_detectado: { anio, mes } | null,
//     cuit_coincide: boolean,
//     campos: { ... F931ParsedFields ... },
//     raw_text: string,
//     warnings: string[]
//   }
//
// RESPONSE (400/422):
//   { ok: false, error: { codigo, mensaje, detalle? } }
// ============================================================

const express = require('express');
const router = express.Router();
const { parsearF931 } = require('../services/f931Parser');

// Tamanio maximo del PDF en bytes (acorde con la config del bucket: 10 MB)
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// ============================================================
// POST /parse - parsea un PDF y devuelve el resultado tipado
// ============================================================
//
// Middleware express.raw para recibir el binario del PDF directamente
// en req.body como Buffer. Limit 10 MB; rechaza si no es application/pdf.

router.post(
  '/parse',
  express.raw({ type: 'application/pdf', limit: MAX_PDF_BYTES }),
  async (req, res) => {
    try {
      // Validar body
      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          ok: false,
          error: {
            codigo: 'PDF_INVALIDO',
            mensaje: 'El body de la request debe ser application/pdf (binario)',
          },
        });
      }

      // Parsear query params opcionales (anio, mes) para validacion
      let periodoEsperado;
      if (req.query.anio && req.query.mes) {
        const a = parseInt(String(req.query.anio), 10);
        const m = parseInt(String(req.query.mes), 10);
        if (Number.isFinite(a) && Number.isFinite(m) && m >= 1 && m <= 12) {
          periodoEsperado = { anio: a, mes: m };
        }
      }

      // Llamar al parser
      const result = await parsearF931(req.body, { periodoEsperado });

      // Devolver el resultado tal cual (es un F931ParseResult)
      // Usar 422 si es error pero el PDF se proceso (semantico vs 500)
      if (!result.ok) {
        // PDF_INVALIDO -> 400; otros errores de parsing -> 422
        const status = result.error.codigo === 'PDF_INVALIDO' ? 400 : 422;
        return res.status(status).json(result);
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error('[F931 parse] Error inesperado:', err);
      return res.status(500).json({
        ok: false,
        error: {
          codigo: 'PARSE_FALLO_GENERICO',
          mensaje: 'Error interno del servidor al procesar el PDF',
          detalle: err.message,
        },
      });
    }
  }
);

// ============================================================
// GET /health/parser - smoke test del parser (no requiere PDF)
// ============================================================
//
// Devuelve OK si el modulo f931Parser se importo correctamente.
// Util para verificar que pdf-parse + el servicio estan vivos.

router.get('/health/parser', (_req, res) => {
  res.json({
    ok: true,
    servicio: 'f931Parser',
    descripcion: 'Parser de PDFs F.931 / VEP de AFIP',
    cuit_esperado: require('../services/f931Parser').SURVISION_CUIT,
    max_pdf_bytes: MAX_PDF_BYTES,
  });
});

module.exports = router;
