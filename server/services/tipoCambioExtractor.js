// ============================================================
// SERVICIO: Extractor del tipo de cambio USD -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Obtiene el TC oficial (BNA) de DolarAPI con fallback al BCRA, y lo guarda en
// la tabla singleton `tipo_cambio`. Antes esto vivía en /api/nomenclador/tipocambio
// (backend) -> el frontend remoto no podía obtenerlo. Ahora el daemon lo refresca
// 2x/día y el frontend lee de Supabase.
// ============================================================

const https = require('https');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function procesarCotizacionBCRA(data, fecha) {
  if (data.status === 200 && data.results && data.results.detalle) {
    const usd = data.results.detalle.find((d) => d.codigoMoneda === 'USD');
    if (usd && usd.tipoCotizacion) {
      return { compra: usd.tipoCotizacion, venta: usd.tipoCotizacion, fecha, fuente: 'BCRA Oficial' };
    }
  }
  return null;
}

/** Obtiene el TC (DolarAPI BNA, fallback BCRA hoy/ayer). Lanza si ninguna fuente responde. */
async function obtenerTipoCambio() {
  // Fuente 1: DolarAPI (compra/venta reales del BNA)
  try {
    const r = await fetchJSON('https://dolarapi.com/v1/dolares/oficial');
    if (r.ok && r.data && r.data.venta > 0) {
      return { compra: r.data.compra, venta: r.data.venta, fecha: r.data.fechaActualizacion || new Date().toISOString().split('T')[0], fuente: 'BNA Oficial' };
    }
  } catch { /* sigue al fallback */ }

  // Fuente 2: BCRA (hoy, luego ayer)
  const hoy = new Date().toISOString().split('T')[0];
  try {
    const r = await fetchJSON(`https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones?fecha=${hoy}`);
    if (r.ok && r.data) {
      const res = procesarCotizacionBCRA(r.data, hoy);
      if (res) return res;
    }
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
    const fAyer = ayer.toISOString().split('T')[0];
    const r2 = await fetchJSON(`https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones?fecha=${fAyer}`);
    if (r2.ok && r2.data) {
      const res = procesarCotizacionBCRA(r2.data, fAyer);
      if (res) return res;
    }
  } catch { /* nada */ }

  throw new Error('No se pudo obtener tipo de cambio de ninguna fuente');
}

/** Obtiene el TC y lo guarda en la tabla singleton. */
async function sincronizarTipoCambio({ write = false } = {}) {
  const tc = await obtenerTipoCambio();
  if (!write) return { ...tc, escrito: false };
  const { error } = await supabase
    .from('tipo_cambio')
    .upsert({ id: 1, compra: tc.compra, venta: tc.venta, fecha: tc.fecha, fuente: tc.fuente, synced_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw new Error('upsert tipo_cambio: ' + error.message);
  return { ...tc, escrito: true, insertados: 1, total: 1 };
}

module.exports = { obtenerTipoCambio, sincronizarTipoCambio };
