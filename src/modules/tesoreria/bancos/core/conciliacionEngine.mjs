// ============================================================================
// Motor de conciliación banco <-> GECLISA. Isomórfico (CLI diario + navegador).
// Opera sobre datos de Supabase (recibe el cliente). No toca GECLISA (solo lectura
// ya hecha por el extractor). Toda conciliación es trazable y reversible.
//
// Alcance v1 (cobranzas de pacientes):
//  - Auto 1:1: crédito del banco ↔ cobranza de GECLISA por IMPORTE exacto +
//    FECHA dentro de ±ventana días hábiles + NOMBRE (el CUIT viene vacío en
//    GECLISA). Solo se auto-concilia si hay UN único candidato con nombre que
//    matchea; si hay varios → queda pendiente (ambigüedad).
//  - El resto (OS, Getnet, egresos) queda en las colas de pendientes; la
//    pantalla manual ofrece sugerencias rankeadas (buscarSugerencias / lote).
// ============================================================================

export const DEFAULTS = {
  ventanaDiasHabiles: 3,
  toleranciaImporte: 0.01,
  toleranciaLotePct: 0.05,
  umbralNombre: 0.6,
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const claveImporte = (v) => num(v).toFixed(2);
const soloDig = (s) => String(s ?? '').replace(/\D/g, ''); // CUIT a solo-dígitos (banco sin guiones, GECLISA con)

const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Nombre "limpio": toma la parte antes del primer '/' y saca ruido. */
function tokensNombre(nombre) {
  const base = String(nombre ?? '').split('/')[0];
  const ruido = new Set(['de', 'transf', 'var', 'cuit', 'sa', 'srl', 's', 'a']);
  return norm(base).split(' ').filter((t) => t.length > 1 && !ruido.has(t));
}

/** Similitud de nombres 0..1 (Jaccard de tokens). */
export function nombreSimilitud(a, b) {
  const ta = new Set(tokensNombre(a));
  const tb = new Set(tokensNombre(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Días hábiles (lun-vie) entre dos fechas 'YYYY-MM-DD'. */
export function diasHabilesEntre(a, b) {
  let d1 = new Date(a + 'T00:00:00Z');
  let d2 = new Date(b + 'T00:00:00Z');
  if (d1 > d2) { const t = d1; d1 = d2; d2 = t; }
  let n = 0;
  const cur = new Date(d1);
  while (cur < d2) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Candidatos de GECLISA para un movimiento del banco, rankeados.
 * @returns {Array<{valor, score, dias, importeOk}>}
 */
export function buscarSugerencias(bancoMov, valoresPendientes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const imp = num(bancoMov.importe);
  const out = [];
  for (const v of valoresPendientes) {
    const importeOk = Math.abs(num(v.importe) - imp) <= o.toleranciaImporte;
    const dias = bancoMov.fecha && v.fecha ? diasHabilesEntre(bancoMov.fecha, v.fecha) : 99;
    if (!importeOk || dias > o.ventanaDiasHabiles) continue;
    // Si ambos tienen CUIT, deben coincidir (comparando solo dígitos)
    const cuitB = soloDig(bancoMov.contraparte_cuit);
    const cuitV = soloDig(v.tercero_cuit);
    if (cuitB && cuitV && cuitB !== cuitV) continue;
    const sim = nombreSimilitud(bancoMov.contraparte_nombre, v.tercero_nombre);
    const cuitMatch = !!cuitB && cuitB === cuitV;
    const score = (cuitMatch ? 1 : sim) - dias * 0.02;
    out.push({ valor: v, score, sim, dias, importeOk, cuitMatch });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** Crea una conciliación (N:M) + puentes y actualiza estados. Devuelve el id. */
export async function crearConciliacion(supabase, {
  tipo = 'manual', usuario = null, bancoIds = [], geclisaIds = [],
  diferencia = 0, motivoDiferencia = null, observacion = null,
  totalBanco = 0, totalGeclisa = 0,
}) {
  const estado = tipo === 'automatica' ? 'conciliado_auto' : 'conciliado_manual';
  const { data: c, error } = await supabase.from('conciliaciones').insert({
    tipo, usuario, observacion, diferencia, motivo_diferencia: motivoDiferencia,
    total_banco: totalBanco, total_geclisa: totalGeclisa,
  }).select('id').single();
  if (error) throw new Error('crear conciliacion: ' + error.message);
  const cid = c.id;

  if (bancoIds.length) {
    const { error: e1 } = await supabase.from('conciliacion_banco')
      .insert(bancoIds.map((id) => ({ conciliacion_id: cid, banco_movimiento_id: id })));
    if (e1) throw new Error('puente banco: ' + e1.message);
    const { error: e2 } = await supabase.from('banco_movimientos')
      .update({ estado_conciliacion: estado }).in('id', bancoIds);
    if (e2) throw new Error('estado banco: ' + e2.message);
  }
  if (geclisaIds.length) {
    const { error: e3 } = await supabase.from('conciliacion_geclisa')
      .insert(geclisaIds.map((id) => ({ conciliacion_id: cid, geclisa_valor_id: id })));
    if (e3) throw new Error('puente geclisa: ' + e3.message);
    const { error: e4 } = await supabase.from('geclisa_valores')
      .update({ estado_conciliacion: estado }).in('id', geclisaIds);
    if (e4) throw new Error('estado geclisa: ' + e4.message);
  }
  return cid;
}

/** Revierte una conciliación: ambos lados vuelven a pendiente. Trazable (anulada). */
export async function desconciliar(supabase, conciliacionId, usuario = null) {
  const { data: pb } = await supabase.from('conciliacion_banco').select('banco_movimiento_id').eq('conciliacion_id', conciliacionId);
  const { data: pg } = await supabase.from('conciliacion_geclisa').select('geclisa_valor_id').eq('conciliacion_id', conciliacionId);
  const bancoIds = (pb || []).map((r) => r.banco_movimiento_id);
  const geclisaIds = (pg || []).map((r) => r.geclisa_valor_id);
  if (bancoIds.length) await supabase.from('banco_movimientos').update({ estado_conciliacion: 'pendiente' }).in('id', bancoIds);
  if (geclisaIds.length) await supabase.from('geclisa_valores').update({ estado_conciliacion: 'pendiente' }).in('id', geclisaIds);
  const { error } = await supabase.from('conciliaciones')
    .update({ anulada: true, anulada_por: usuario, anulada_at: new Date().toISOString() })
    .eq('id', conciliacionId);
  if (error) throw new Error('anular conciliacion: ' + error.message);
  return { bancoIds, geclisaIds };
}

async function traerTodo(query) {
  const filas = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query.range(from, from + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return filas;
}

/**
 * Corre la conciliación automática (fase 1:1 exacta con nombre) sobre los
 * pendientes de la cuenta. Devuelve un resumen.
 */
export async function conciliarAutomatico(supabase, { cuentaId, usuario = 'motor', desde, hasta, ...opts } = {}) {
  const o = { ...DEFAULTS, ...opts };

  // Movimientos pendientes (créditos ↔ cobranzas, débitos ↔ pagos). Getnet se
  // concilia aparte (lote con arancel), por eso se excluye de esta fase 1:1.
  let qBanco = supabase.from('banco_movimientos')
    .select('id, fecha, importe, contraparte_nombre, contraparte_cuit, categoria')
    .eq('cuenta_id', cuentaId).eq('estado_conciliacion', 'pendiente').neq('categoria', 'getnet')
    .order('fecha', { ascending: true });
  if (desde) qBanco = qBanco.gte('fecha', desde);
  if (hasta) qBanco = qBanco.lte('fecha', hasta);
  const banco = await traerTodo(qBanco);
  if (!banco.length) return { auto: 0, ambiguos: 0, sinCandidato: 0, banco: 0 };

  // Valores GECLISA pendientes en la ventana de fechas
  const fechas = banco.map((b) => b.fecha).filter(Boolean).sort();
  const buffer = 5; // días calendario de colchón sobre la ventana hábil
  const desdeGV = new Date(new Date(fechas[0] + 'T00:00:00Z').getTime() - buffer * 86400000).toISOString().slice(0, 10);
  const hastaGV = new Date(new Date(fechas[fechas.length - 1] + 'T00:00:00Z').getTime() + buffer * 86400000).toISOString().slice(0, 10);
  const valores = await traerTodo(
    supabase.from('geclisa_valores')
      .select('id, fecha, importe, tercero_nombre, tercero_cuit')
      .eq('estado_conciliacion', 'pendiente').gte('fecha', desdeGV).lte('fecha', hastaGV)
  );

  // Índice por importe
  const porImporte = new Map();
  for (const v of valores) {
    const k = claveImporte(v.importe);
    if (!porImporte.has(k)) porImporte.set(k, []);
    porImporte.get(k).push(v);
  }
  const usados = new Set();

  let auto = 0, ambiguos = 0, sinCandidato = 0;
  for (const b of banco) {
    const cand = (porImporte.get(claveImporte(b.importe)) || [])
      .filter((v) => !usados.has(v.id));
    const sug = buscarSugerencias(b, cand, o).filter((s) => s.cuitMatch || s.sim >= o.umbralNombre);
    if (sug.length === 1) {
      const v = sug[0].valor;
      await crearConciliacion(supabase, {
        tipo: 'automatica', usuario, bancoIds: [b.id], geclisaIds: [v.id],
        diferencia: 0, totalBanco: num(b.importe), totalGeclisa: num(v.importe),
        observacion: `Auto 1:1 (nombre ${(sug[0].sim * 100).toFixed(0)}%, ${sug[0].dias} d háb)`,
      });
      usados.add(v.id);
      auto++;
    } else if (sug.length > 1) {
      ambiguos++;
    } else {
      sinCandidato++;
    }
  }
  return { auto, ambiguos, sinCandidato, banco: banco.length, valores: valores.length };
}

/**
 * Conciliación de acreditaciones Getnet contra cobranzas con tarjeta de GECLISA.
 * El banco acredita NETO de arancel; se busca la tarjeta cuyo bruto menos el
 * arancel (hasta toleranciaLotePct) dé el neto acreditado. Auto solo si el
 * candidato es único (montos repetidos → queda pendiente, sin riesgo).
 */
export async function conciliarGetnet(supabase, { cuentaId, usuario = 'motor', ...opts } = {}) {
  const o = { ...DEFAULTS, ...opts };
  const getnet = await traerTodo(supabase.from('banco_movimientos')
    .select('id, fecha, importe, contraparte_nombre')
    .eq('cuenta_id', cuentaId).eq('estado_conciliacion', 'pendiente').eq('categoria', 'getnet').gt('importe', 0)
    .order('fecha', { ascending: true }));
  if (!getnet.length) return { auto: 0, ambiguos: 0, sinCandidato: 0, getnet: 0 };

  const fechas = getnet.map((g) => g.fecha).filter(Boolean).sort();
  const buffer = 5;
  const d0 = new Date(new Date(fechas[0] + 'T00:00:00Z').getTime() - buffer * 86400000).toISOString().slice(0, 10);
  const d1 = new Date(new Date(fechas[fechas.length - 1] + 'T00:00:00Z').getTime() + buffer * 86400000).toISOString().slice(0, 10);
  const tarjetas = await traerTodo(supabase.from('geclisa_valores')
    .select('id, fecha, importe, tercero_nombre, medio_nombre')
    .eq('estado_conciliacion', 'pendiente').eq('tipo', 'cobranza').ilike('medio_nombre', '%tarjeta%')
    .gte('fecha', d0).lte('fecha', d1));

  const usados = new Set();
  let auto = 0, ambiguos = 0, sinCandidato = 0;
  for (const g of getnet) {
    const net = num(g.importe);
    const cand = tarjetas.filter((t) => {
      if (usados.has(t.id) || !t.fecha) return false;
      if (diasHabilesEntre(g.fecha, t.fecha) > o.ventanaDiasHabiles) return false;
      const bruto = num(t.importe);
      return bruto >= net - 0.01 && (bruto - net) <= o.toleranciaLotePct * bruto + 0.01;
    });
    if (cand.length === 1) {
      const t = cand[0];
      const bruto = num(t.importe);
      const arancel = Math.round((bruto - net) * 100) / 100;
      await crearConciliacion(supabase, {
        tipo: 'automatica', usuario, bancoIds: [g.id], geclisaIds: [t.id],
        diferencia: arancel, motivoDiferencia: 'Arancel Getnet',
        totalBanco: net, totalGeclisa: bruto,
        observacion: `Getnet neto de arancel ${bruto ? (arancel / bruto * 100).toFixed(1) : '0'}%`,
      });
      usados.add(t.id);
      auto++;
    } else if (cand.length > 1) ambiguos++;
    else sinCandidato++;
  }
  return { auto, ambiguos, sinCandidato, getnet: getnet.length, tarjetas: tarjetas.length };
}

/** Corre todas las fases: 1:1 (cobranzas + pagos) y lote Getnet. */
export async function conciliarTodo(supabase, opts = {}) {
  const uno = await conciliarAutomatico(supabase, opts);
  const getnet = await conciliarGetnet(supabase, opts);
  return { ...uno, getnet };
}
