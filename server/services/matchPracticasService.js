// ============================================================
// SERVICIO: Match presupuesto → práctica/cirugía realizada (Fase C)
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Cruza presupuestos EMITIDOS (estado='entregado', aún no practicados) con las
// prácticas realizadas del espejo movimientos_geclisa, por:
//   DNI (normalizado) + código (o alias de presupuestos_match_codigos) + fecha ≥
//   fecha del presupuesto.
//
// Reglas (decididas con Paulo):
//   - Presupuesto FRESCO (sin filas de match) con UN candidato -> se auto-confirma:
//     fila estado='confirmado' auto=true y se marca el presupuesto practicado
//     (estado='practicado' + fecha_practica = fecha real de la cirugía).
//   - Varios candidatos (o ya hay filas en revisión) -> se registran como
//     'sugerido' (van a la pantalla de revisión); el presupuesto NO se toca.
//   - Las atenciones marcadas 'descartado' por el operador no se re-sugieren.
//
// Idempotente: corre por el daemon o por CLI cuantas veces se quiera (upsert
// ignore-duplicates; los practicados salen del universo de candidatos).
// Todo sobre datos de Supabase (no toca GECLISA). service_role -> bypassa RLS.
// ============================================================

const { supabase } = require('../config/supabase');

/** Normaliza un documento: solo dígitos, sin ceros a la izquierda. */
const normDoc = (d) => String(d || '').replace(/\D/g, '').replace(/^0+/, '');

/** Carga paginada de una tabla (para superar el tope de 1000 de PostgREST). */
async function loadAll(table, select, filterFn) {
  const acc = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    acc.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return acc;
}

async function correrMatch({ write = false } = {}) {
  // 1) Alias de códigos (identidad implícita).
  const { data: aliasRows, error: aliasErr } = await supabase
    .from('presupuestos_match_codigos').select('codigo_presupuesto,codigo_realizado').eq('activo', true);
  if (aliasErr) throw new Error('alias: ' + aliasErr.message);
  const aliasMap = new Map();
  for (const r of aliasRows || []) {
    const k = String(r.codigo_presupuesto).trim();
    if (!aliasMap.has(k)) aliasMap.set(k, new Set());
    aliasMap.get(k).add(String(r.codigo_realizado).trim());
  }
  const equiv = (cod) => {
    const s = new Set([cod]);
    const a = aliasMap.get(cod);
    if (a) for (const x of a) s.add(x);
    return s;
  };

  // 2) Presupuestos candidatos (entregado = emitido y aún no practicado).
  const pres = await loadAll('presupuestos', 'id,paciente_documento,prestacion_codigo,fecha_creacion,resultado', (q) => q.eq('estado', 'entregado'));

  // 3) Códigos realizados relevantes (para acotar la carga de movimientos).
  const relevantes = new Set();
  for (const p of pres) for (const c of equiv((p.prestacion_codigo || '').trim())) if (c) relevantes.add(c);
  const relArr = [...relevantes];

  // 4) Movimientos de esos códigos, indexados por DNI normalizado.
  const movIndex = new Map();
  if (relArr.length) {
    const mov = await loadAll(
      'movimientos_geclisa',
      'atencion_id,paciente_documento,practica_codigo,fecha,practica_nombre,prestador_nombre',
      (q) => q.in('practica_codigo', relArr),
    );
    for (const m of mov) {
      const k = normDoc(m.paciente_documento);
      if (!k) continue;
      if (!movIndex.has(k)) movIndex.set(k, []);
      movIndex.get(k).push(m);
    }
  }

  // 5) Matches ya existentes (para no duplicar / respetar descartados).
  const existing = await loadAll('presupuestos_practica_match', 'presupuesto_id,atencion_id,estado');
  const byPres = new Map();
  for (const r of existing) {
    if (!byPres.has(r.presupuesto_id)) byPres.set(r.presupuesto_id, []);
    byPres.get(r.presupuesto_id).push(r);
  }

  // 6) Resolver candidatos por presupuesto.
  const nuevos = [];
  const practicar = [];
  for (const p of pres) {
    const rows = byPres.get(p.id) || [];
    if (rows.some((r) => r.estado === 'confirmado')) continue; // ya matcheado
    const descartadas = new Set(rows.filter((r) => r.estado === 'descartado').map((r) => r.atencion_id));
    const yaEnTabla = new Set(rows.map((r) => r.atencion_id));
    const hasRows = rows.length > 0;

    const k = normDoc(p.paciente_documento);
    if (!k) continue;
    const eq = equiv((p.prestacion_codigo || '').trim());
    const fc = (p.fecha_creacion || '').slice(0, 10);

    const porAt = new Map();
    for (const m of movIndex.get(k) || []) {
      if (!eq.has(String(m.practica_codigo).trim())) continue;
      if ((m.fecha || '') < fc) continue;
      if (descartadas.has(m.atencion_id)) continue;
      const prev = porAt.get(m.atencion_id);
      if (!prev || (m.fecha || '') < (prev.fecha || '')) porAt.set(m.atencion_id, m);
    }
    const candidatos = [...porAt.values()];
    if (candidatos.length === 0) continue;

    // No auto-confirmar si el presupuesto está marcado rechazado/sin respuesta
    // (sería contradictorio): esos casos van a revisión como 'sugerido'.
    const bloqueaAuto = p.resultado === 'RECHAZADO' || p.resultado === 'SIN_RESPUESTA';

    if (!hasRows && candidatos.length === 1 && !bloqueaAuto) {
      const m = candidatos[0];
      nuevos.push({
        presupuesto_id: p.id, atencion_id: m.atencion_id, codigo_realizado: m.practica_codigo,
        practica_nombre: m.practica_nombre, prestador_nombre: m.prestador_nombre, fecha_practica: m.fecha,
        estado: 'confirmado', confianza: 'unica', auto: true,
        revisado_por: 'match_auto', revisado_at: new Date().toISOString(),
      });
      practicar.push({ id: p.id, fecha: m.fecha });
    } else {
      const conf = candidatos.length === 1 ? 'unica' : 'ambigua';
      for (const m of candidatos) {
        if (yaEnTabla.has(m.atencion_id)) continue;
        nuevos.push({
          presupuesto_id: p.id, atencion_id: m.atencion_id, codigo_realizado: m.practica_codigo,
          practica_nombre: m.practica_nombre, prestador_nombre: m.prestador_nombre, fecha_practica: m.fecha,
          estado: 'sugerido', confianza: conf, auto: false,
        });
      }
    }
  }

  const resumen = {
    presupuestosEntregados: pres.length,
    autoConfirmados: practicar.length,
    sugeridosNuevos: nuevos.filter((r) => r.estado === 'sugerido').length,
    filasAInsertar: nuevos.length,
  };
  if (!write) return { ...resumen, escrito: false };

  for (let i = 0; i < nuevos.length; i += 500) {
    const lote = nuevos.slice(i, i + 500);
    const { error } = await supabase.from('presupuestos_practica_match')
      .upsert(lote, { onConflict: 'presupuesto_id,atencion_id', ignoreDuplicates: true });
    if (error) throw new Error('insert match: ' + error.message);
  }
  for (const pr of practicar) {
    const { error } = await supabase.from('presupuestos')
      .update({ estado: 'practicado', fecha_practica: pr.fecha }).eq('id', pr.id);
    if (error) throw new Error('practicar: ' + error.message);
  }
  return { ...resumen, escrito: true };
}

module.exports = { correrMatch };
