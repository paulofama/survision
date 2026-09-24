// ============================================================
// REVERTIR los "no es gasto" mal marcados + los alquileres perdidos
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/revertir-fondos-mal-marcados.cjs          (simulacro)
//   node scripts/revertir-fondos-mal-marcados.cjs --write
//
// DOS ERRORES DE LA CORRIDA DEL 23/09/2026, los dos encontrados verificando
// 2024 contra la realidad (no había NI UNA línea de alquiler en todo el año,
// y eso es imposible).
//
// ERROR 1 — la regla de fondos miraba la DESCRIPCIÓN.
// En los movimientos de caja (`MovValoresEnca`) la descripción no es el
// concepto sino la FORMA DE PAGO: "Tesoreria", "Depósito Bancario". Así que
// cualquier pago hecho por tesorería quedó marcado "no es gasto":
//
//     2025-07 · $5.257.480 · MAHIA PABLO DANIEL | Tesoreria
//     2024-05 · $4.308.000 · LATTANZIO MARIA CRISTINA | Depósito Bancario
//
// Son 1.008 comprobantes por $162.415.046 que sí son gastos. El concepto de
// verdad vive en el PROVEEDOR ("RENDICION CAJA CIRUGIA"), y ahí mira ahora la
// regla corregida.
//
// Este script BORRA esas filas —no las reclasifica— para que vuelvan a estar
// sin clasificar y las tome la regla arreglada en la corrida siguiente. Sólo
// toca filas que escribió ese mismo script (`clasificado_por` =
// 'regla-fondos-honorarios'): nada cargado a mano corre riesgo.
//
// ERROR 2 — dos alquileres fueron a parar a "variable".
// El proveedor es Mercado, que factura alquiler Y honorarios, y la sugerencia
// por histórico le aplicó su clasificación dominante. Es exactamente el caso
// que documenta `corregir-clasificacion-medicos.cjs`, y lo reintrodujimos:
//
//     2024-10 · $884.838 · MERCADO JORGE IGNACIO | ALQUILER
//     2024-12 · $884.838 · MERCADO JORGE IGNACIO | PAGO ALQUILER
//
// Van a fijo / Alquiler, que es lo que dice el comprobante.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

const WRITE = process.argv.includes('--write');
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);
const ars = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const CAT_ALQUILER = '33a3e1c3-6ff5-4fe7-9a1a-e9141bcbc75b';

/** Los mismos patrones que la regla corregida: el concepto vive en el proveedor. */
const FONDOS = [/^RENDICIO?J?N\b/, /^DEPOSITO BANCARIO\b/, /^TESOR(ERIA|\.)?\b/];

async function traerTodo(tabla, select, filtro) {
  const out = [];
  let desde = 0;
  for (;;) {
    let q = sb.from(tabla).select(select)
      .order('fuente', { ascending: true }).order('id_geclisa', { ascending: true })
      .range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
    desde += 1000;
  }
  return out;
}

(async () => {
  console.log(`Revertir mal marcados · ${WRITE ? 'ESCRIBE' : 'SIMULACRO (no escribe)'}`);
  console.log('');

  // ── ERROR 1 ──
  const marcadas = await traerTodo(
    'erogaciones_clasificacion',
    'id, fuente, id_geclisa, anio, mes, proveedor_nombre, descripcion, monto',
    (q) => q.eq('clasificado_por', 'regla-fondos-honorarios').eq('tipo_costo', 'no_es_gasto'),
  );
  const malMarcadas = marcadas.filter((r) => !FONDOS.some((re) => re.test(norm(r.proveedor_nombre))));
  const bienMarcadas = marcadas.length - malMarcadas.length;

  console.log(`Marcadas "no es gasto" por la regla: ${marcadas.length}`);
  console.log(`  bien (el proveedor ES el movimiento): ${bienMarcadas}`);
  console.log(`  MAL (pagos reales): ${malMarcadas.length} · ${ars(malMarcadas.reduce((s, r) => s + (Number(r.monto) || 0), 0))}`);
  console.log('');
  console.log('  Las 10 más grandes de las mal marcadas:');
  for (const r of [...malMarcadas].sort((a, b) => Number(b.monto) - Number(a.monto)).slice(0, 10)) {
    console.log(`    ${r.anio}-${String(r.mes).padStart(2, '0')} · ${ars(r.monto).padStart(13)} · ${String(r.proveedor_nombre || '').slice(0, 34).padEnd(34)} | ${r.descripcion || ''}`);
  }

  // ── ERROR 2 ──
  const todas = await traerTodo(
    'erogaciones_clasificacion',
    'id, fuente, id_geclisa, anio, mes, proveedor_nombre, descripcion, monto, tipo_costo, categoria_costo_fijo_id',
  );
  const alquileres = todas.filter((r) =>
    norm(r.descripcion).includes('ALQUILER')
    && norm(r.proveedor_nombre).includes('MERCADO')
    && r.categoria_costo_fijo_id !== CAT_ALQUILER);

  console.log('');
  console.log(`Alquileres que quedaron fuera de la categoría Alquiler: ${alquileres.length}`);
  for (const r of alquileres) {
    console.log(`    ${r.anio}-${String(r.mes).padStart(2, '0')} · ${ars(r.monto).padStart(13)} · ${r.proveedor_nombre} | ${r.descripcion} · hoy: ${r.tipo_costo}`);
  }

  if (!WRITE) {
    console.log('');
    console.log('SIMULACRO: no se escribió nada. Agregá --write para aplicar.');
    return;
  }

  console.log('');
  // Borrar de a tandas: el filtro `in` tiene tope de largo de URL.
  let borradas = 0;
  const LOTE = 200;
  for (let i = 0; i < malMarcadas.length; i += LOTE) {
    const ids = malMarcadas.slice(i, i + LOTE).map((r) => r.id);
    const { error } = await sb.from('erogaciones_clasificacion').delete().in('id', ids);
    if (error) throw new Error(`delete lote ${i}: ${error.message}`);
    borradas += ids.length;
    console.log(`  borradas ${borradas}/${malMarcadas.length}`);
  }

  for (const r of alquileres) {
    const { error } = await sb.from('erogaciones_clasificacion')
      .update({
        tipo_costo: 'fijo',
        es_costo_fijo: true,
        categoria_costo_fijo_id: CAT_ALQUILER,
        subcategoria_variable: null,
        auto_clasificado: false,           // lo dice el comprobante: no es una sugerencia
        clasificado_por: 'correccion-alquiler-2026-09-23',
        clasificado_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (error) throw new Error(`update alquiler ${r.id}: ${error.message}`);
  }
  console.log(`  alquileres corregidos: ${alquileres.length}`);

  console.log('');
  console.log('LISTO. Las borradas vuelven a estar sin clasificar:');
  console.log('correr de nuevo `clasificar-erogaciones-reglas.cjs` para que las tome la regla arreglada.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
