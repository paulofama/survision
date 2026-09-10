// ============================================================
// Corrige la clasificación de las erogaciones de los 4 prestadores
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// QUÉ PASÓ (relevado el 10/09/2026)
// --------------------------------
// Musa, Mercado, Roca y Mahía son prestadores del instituto y facturan sus
// HONORARIOS. Mercado además factura el ALQUILER del inmueble, con su propia
// numeración correlativa de FC y un importe fijo mensual.
//
// Hasta junio 2026 la distinción estaba bien hecha, a mano: el alquiler
// (FC 660/666/671/674/678, $2.843.500 y después $3.209.174) quedaba en costos
// FIJOS / categoría Alquiler, y las facturas de honorarios en VARIABLES con
// subcategoría 'honorarios'.
//
// El 18/08/2026 una corrida masiva (clasificado_por = 'reglas-2026-08-18')
// reclasificó 156 comprobantes de julio en adelante como 'variable' SIN
// subcategoría. Se llevó puestas las dos cosas:
//
//   1. El ALQUILER de julio (FC 680) y agosto (FC 684) pasó a variable, así que
//      dejó de sumar a los costos fijos: julio y agosto quedaron $3.209.174 más
//      baratos de lo que son, y el resultado operativo de esos meses sobreestimado
//      en el mismo importe. Se ve en la serie: ene-jun tienen alquiler, jul-ago no.
//
//   2. Las facturas de HONORARIOS perdieron la subcategoría. No afectan el
//      estado de resultados (los honorarios del modelo se calculan por fórmula,
//      no de estas erogaciones), pero sí el panel de conciliación entre lo que se
//      paga y lo que el modelo calcula, que las lee por subcategoría.
//
// CRITERIO DE ESTE SCRIPT
// -----------------------
// No adivina por proveedor, que es exactamente el error que hay que evitar con
// alguien que factura dos conceptos distintos. Va por comprobante:
//   · ALQUILER: los FC de Mercado que están en la lista explícita de abajo,
//     verificando que el importe sea el del alquiler vigente.
//   · HONORARIOS: los comprobantes de la lista, todos facturas de los cuatro
//     prestadores o anticipos con "honorarios" en la descripción.
// Lo demás (cumpleaños, viandas, guardias de personal, cobros indebidos) NO se
// toca: no son honorarios médicos ni costos fijos.
//
// Uso:  node scripts/corregir-clasificacion-medicos.cjs          (dry-run)
//       node scripts/corregir-clasificacion-medicos.cjs --write
// ============================================================

require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const write = process.argv.includes('--write');
const fmt = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);

const CAT_ALQUILER = '33a3e1c3-6ff5-4fe7-9a1a-e9141bcbc75b';
const SELLO = 'correccion-medicos-2026-09-10';

// El alquiler que factura Mercado, por descripción exacta del comprobante.
// Importes verificados contra la serie ene-jun (2.843.500 -> 3.209.174 -> 3.763.719).
const ALQUILER = [
  { desc: 'FC 680', monto: 3209174 },
  { desc: 'FC 684', monto: 3209174 },
  { desc: 'FC 686', monto: 3763719 },
];

// Facturas de honorarios de los cuatro prestadores y anticipos de honorarios.
const HONORARIOS = [
  'FC 681', 'FC 265', 'FC 814', 'FC 237',            // julio
  'FC 685', 'FC 266', 'FC 834', 'FC 238',            // agosto
];
// "honotarios" no es un error de tipeo de este archivo: así está cargado en
// GECLISA en varios anticipos, y si el patrón no lo contempla esos comprobantes
// quedan afuera de la corrección.
const HONORARIOS_RE = /anticipo.*hono[rt]ar|hono[rt]ar.*(mercado|musa|roca|mahia)|liquidacion hono[rt]arios/i;
const MEDICOS_RE = /mercado|musa|roca|mahia/i;
/** Proveedores que son un anticipo a un prestador ("ANTIC. HONOR. DR. MERCADO"). */
const ANTICIPO_MEDICO_RE = /^\s*antic/i;

const norm = (s) => String(s || '').trim().toUpperCase();

(async () => {
  const eros = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from('erogaciones_geclisa').select('*').eq('anio', 2026).range(d, d + 999);
    if (error) throw new Error(error.message);
    eros.push(...data);
    if (data.length < 1000) break;
  }
  const clas = new Map();
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from('erogaciones_clasificacion').select('*').eq('anio', 2026).range(d, d + 999);
    if (error) throw new Error(error.message);
    for (const c of data) clas.set(`${c.fuente}|${c.id_geclisa}`, c);
    if (data.length < 1000) break;
  }

  const cambios = [];
  for (const e of eros) {
    const desc = norm(e.descripcion);
    const monto = Math.round(Number(e.monto) || 0);
    const actual = clas.get(`${e.fuente}|${e.id_geclisa}`);
    const tipoActual = actual ? actual.tipo_costo : 'SIN CLASIFICAR';
    const subActual = actual ? actual.subcategoria_variable : null;

    const alq = ALQUILER.find((a) => a.desc === desc && Math.abs(a.monto - monto) < 1);
    if (alq && /mercado/i.test(e.proveedor_nombre || '')) {
      if (tipoActual !== 'fijo' || actual?.categoria_costo_fijo_id !== CAT_ALQUILER) {
        cambios.push({ e, actual, destino: 'fijo', sub: null, cat: CAT_ALQUILER, motivo: 'alquiler del inmueble' });
      }
      continue;
    }

    const esHonorario =
      (HONORARIOS.includes(desc) && MEDICOS_RE.test(e.proveedor_nombre || '')) ||
      HONORARIOS_RE.test(e.descripcion || '') ||
      HONORARIOS_RE.test(e.proveedor_nombre || '') ||
      (ANTICIPO_MEDICO_RE.test(e.proveedor_nombre || '') && MEDICOS_RE.test(e.proveedor_nombre || ''));
    if (esHonorario) {
      if (tipoActual !== 'variable' || subActual !== 'honorarios') {
        cambios.push({ e, actual, destino: 'variable', sub: 'honorarios', cat: null, motivo: 'honorarios del prestador' });
      }
    }
  }

  console.log(`\n${cambios.length} comprobantes a corregir\n`);
  console.log('fecha       proveedor              monto        desc         de                -> a');
  let dFijos = 0;
  for (const c of cambios) {
    const de = `${c.actual ? c.actual.tipo_costo : 'sin clasif.'}${c.actual?.subcategoria_variable ? '/' + c.actual.subcategoria_variable : ''}`;
    const a = `${c.destino}${c.sub ? '/' + c.sub : c.cat ? '/Alquiler' : ''}`;
    console.log(`${c.e.fecha}  ${(c.e.proveedor_nombre || '').slice(0, 20).padEnd(20)} $${fmt(c.e.monto).padStart(11)}  ${(c.e.descripcion || '').slice(0, 11).padEnd(11)}  ${de.padEnd(18)}-> ${a}`);
    if (c.destino === 'fijo') dFijos += Number(c.e.monto || 0);
    if (c.actual?.tipo_costo === 'fijo' && c.destino !== 'fijo') dFijos -= Number(c.e.monto || 0);
  }
  console.log(`\nefecto sobre costos fijos: ${dFijos >= 0 ? '+' : ''}$${fmt(dFijos)}`);

  if (!write) {
    console.log('\n(dry-run: no se escribió nada. Correr con --write para aplicar)');
    process.exit(0);
  }

  const ahora = new Date().toISOString();
  const filas = cambios.map(({ e, destino, sub, cat }) => ({
    fuente: e.fuente,
    id_geclisa: e.id_geclisa,
    anio: e.anio,
    mes: e.mes,
    fecha: e.fecha,
    descripcion: e.descripcion,
    proveedor_nombre: e.proveedor_nombre,
    monto: e.monto,
    categoria: e.categoria_sugerida,
    tipo_costo: destino,
    es_costo_fijo: destino === 'fijo',
    categoria_costo_fijo_id: cat,
    subcategoria_variable: sub,
    auto_clasificado: false,          // es una corrección revisada, no una sugerencia
    clasificado_por: SELLO,
    clasificado_at: ahora,
  }));

  const { error } = await sb.from('erogaciones_clasificacion')
    .upsert(filas, { onConflict: 'fuente,id_geclisa' });
  if (error) throw new Error(error.message);
  console.log(`\n${filas.length} clasificaciones corregidas (sello ${SELLO})`);
  process.exit(0);
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
