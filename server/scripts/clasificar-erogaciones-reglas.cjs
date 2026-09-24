// ============================================================
// CLASIFICAR EROGACIONES POR REGLA — los criterios que fijó Paulo
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-erogaciones-reglas.cjs --anio 2025          (simulacro)
//   node scripts/clasificar-erogaciones-reglas.cjs --anio 2025 --write
//
// LOS CRITERIOS DE PAULO (23/09/2026)
// -----------------------------------
//   "las rendiciones no son gasto"             -> 'no_es_gasto'
//   "los honorarios van a variable/honorarios" -> 'variable' + subcategoría
//   "931 a Sueldos y Cargas, ganancias a Impuestos"
//
// Los dos primeros NO cambian el estado de resultados: 'no_es_gasto' no suma a
// nada y 'variable' tampoco (el costo variable lo calcula el modelo con la
// fórmula de honorarios y las recetas). Lo que cambia es que dejan de contar
// como "sin clasificar", que es lo que hacía que el aviso de costos incompletos
// de 2025 no se pudiera apagar nunca.
//
// El tercero SÍ toca el costo fijo, pero sólo la parte de impuestos: el VEP del
// 931 va a la categoría "Sueldos y Cargas", que el informe SALTEA en los meses
// cubiertos por el módulo de Sueldos. Queda clasificado y no se cuenta dos
// veces — ver la REGLA 3.
//
// POR QUÉ NO ALCANZA CON BUSCAR EL APELLIDO
// -----------------------------------------
// Al listar candidatos por nombre apareció esto:
//
//   $1.922.319 · LIO VIVITY PAC. MERCADO GUSTAVO
//
// Es un PACIENTE apellidado Mercado comprando un lente, no el doctor. Y hay
// más: "REINTEGRO DR. MERCADO", "ANTICIPO DR. MERCADO TRANSFERENCIA ROMERO
// JOEL". Clasificar por nombre suelto es el error que ya costó plata tres
// veces en este sistema (ver la memoria `feedback-clasificar-por-nombre`).
//
// Por eso las reglas piden que el texto EMPIECE con el patrón o lo contenga
// como concepto, y hay una lista de exclusiones explícita. Lo que no entra en
// ninguna regla queda sin clasificar, a mano. El script no adivina.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const iAnio = args.indexOf('--anio');
const ANIO = iAnio >= 0 ? Number(args[iAnio + 1]) : null;
if (!ANIO || !Number.isInteger(ANIO)) {
  console.error('USO: node scripts/clasificar-erogaciones-reglas.cjs --anio 2025 [--write]');
  process.exit(1);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);
const ars = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

/** Mayúsculas, sin acentos, espacios colapsados. */
const norm = (s) => String(s || '')
  .toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// ── EXCLUSIONES: ganan sobre cualquier regla ──
// Casos verificados uno por uno que parecen honorarios y no lo son.
const EXCLUIR = [
  /\bPAC\b/,            // "LIO VIVITY PAC. MERCADO GUSTAVO": es un paciente
  /\bPACIENTE\b/,
  /\bREINTEGRO\b/,      // devolución, no un pago de honorarios
  /\bTRANSFERENCIA\b/,  // "ANTICIPO DR. MERCADO TRANSFERENCIA ROMERO JOEL"
];

// ── REGLA 1: movimientos de fondos ──
// Rendiciones de caja, depósitos y pases a tesorería. El texto tiene que
// EMPEZAR con el concepto: "RENDICION ..." es una rendición; "PAGO A X POR
// RENDICION" no necesariamente.
const FONDOS = [
  /^RENDICION\b/,
  /^DEPOSITO BANCARIO\b/,
  /^TESORERIA\b/,
  /^TRANSFERENCIA A TESORERIA\b/,
];

// ── REGLA 2: honorarios médicos ──
// Los cuatro prestadores por nombre COMPLETO, o un anticipo/pago que diga
// honorarios. "HONOTARIOS" no es un error de tipeo de este archivo: así está
// cargado en GECLISA (ver corregir-clasificacion-medicos.cjs).
const PRESTADORES = [
  'MAHIA PABLO DANIEL',
  'ROCA LEANDRO NICOLAS',
  'MUSA CARLOS',
  'MERCADO JORGE IGNACIO',
];
const HONORARIOS = [
  /\bHONORARIO/,
  /\bHONOTARIO/,          // así está cargado en GECLISA; no es un error de acá
  /\bHONOR\./,            // "HONOR. DR. MERCADO": la abreviatura de los MovProv,
                          // donde el proveedor viene vacío y todo está en la
                          // descripción. En 2026, 51 de 52 comprobantes que
                          // dicen HONOR quedaron en variable/honorarios.
  /^ANTIC(IP)?O?\.? ?(DR\.?|DRA\.?)/,   // "ANTIC. DR MERCADO", "ANTICIPO DR MUSA"
];

// ── REGLA 3: los VEP ──
// Paulo, 23/09/2026: "931 a Sueldos y Cargas, ganancias a Impuestos".
//
// El VEP del 931 es la carga social, y el módulo de Sueldos YA la cuenta con
// su propia fuente. Por eso va a la categoría "Sueldos y Cargas": el informe
// SALTEA esa categoría en los meses que el módulo cubre
// (`CAT_EROGACION_SUELDOS` en useEvolucionMensual), así que queda clasificada
// sin contarse dos veces. Ese es justamente el mecanismo que hace que esta
// clasificación sea la correcta y no una que infla el costo fijo.
const CAT_SUELDOS_Y_CARGAS = 'ff6f48c6-0e03-43d1-9448-bd91a6a34901';
const CAT_IMPUESTOS = '1c29d173-6b81-48a4-8a00-bd5a713609e9';

const VEP_931 = [/\b931\b/];
// Ganancias, ingresos brutos y ATM (rentas de Mendoza): son impuestos, que es
// el criterio que dio Paulo. Un "VEP ARCA" a secas NO entra: no dice de qué es,
// y adivinarlo es lo que hay que evitar.
const VEP_IMPUESTOS = [/\bGANANCIA/, /\bINGRESOS BRUTOS\b/, /\bATM\b/];

function reglaDe(e) {
  const prov = norm(e.proveedor_nombre);
  const desc = norm(e.descripcion);
  const texto = `${prov} ${desc}`.trim();

  if (EXCLUIR.some((re) => re.test(texto))) return null;

  if (FONDOS.some((re) => re.test(prov) || re.test(desc))) {
    return { tipo: 'no_es_gasto', sub: null, motivo: 'movimiento de fondos' };
  }

  // Los VEP se miran antes que los honorarios: un "VEP 931" no es un honorario
  // aunque el 931 salga de la nómina.
  if (/\b(VEP|ARCA|AFIP)\b/.test(texto)) {
    if (VEP_931.some((re) => re.test(texto))) {
      return { tipo: 'fijo', cat: CAT_SUELDOS_Y_CARGAS, sub: null, motivo: 'VEP 931 (cargas sociales)' };
    }
    if (VEP_IMPUESTOS.some((re) => re.test(texto))) {
      return { tipo: 'fijo', cat: CAT_IMPUESTOS, sub: null, motivo: 'VEP de impuestos' };
    }
    return null;   // "VEP ARCA" a secas, "VEP ARCA 713": no dice de qué es
  }
  if (PRESTADORES.includes(prov)) {
    return { tipo: 'variable', sub: 'honorarios', motivo: 'prestador' };
  }
  if (HONORARIOS.some((re) => re.test(prov) || re.test(desc))) {
    return { tipo: 'variable', sub: 'honorarios', motivo: 'anticipo/honorarios' };
  }
  return null;
}

/** Pagina con ORDER BY: sin él las páginas se solapan y se pierden filas. */
async function traerTodo(tabla, select, filtro) {
  const out = [];
  let desde = 0;
  for (;;) {
    let q = sb.from(tabla).select(select)
      .order('fuente', { ascending: true })
      .order('id_geclisa', { ascending: true })
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
  console.log(`Clasificación por regla · año ${ANIO} · ${WRITE ? 'ESCRIBE' : 'SIMULACRO (no escribe)'}`);
  console.log('');

  const crudas = await traerTodo(
    'erogaciones_geclisa',
    'fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto, categoria_sugerida',
    (q) => q.eq('anio', ANIO),
  );
  const yaClas = await traerTodo('erogaciones_clasificacion', 'fuente, id_geclisa', (q) => q.eq('anio', ANIO));
  const clasificadas = new Set(yaClas.map((c) => `${c.fuente}_${c.id_geclisa}`));
  console.log(`Erogaciones ${ANIO}: ${crudas.length} · ya clasificadas: ${clasificadas.size}`);

  const ahora = new Date().toISOString();
  const filas = [];
  const porMotivo = new Map();
  const excluidas = [];

  for (const e of crudas) {
    if (clasificadas.has(`${e.fuente}_${e.id_geclisa}`)) continue;
    const texto = `${norm(e.proveedor_nombre)} ${norm(e.descripcion)}`.trim();
    if (EXCLUIR.some((re) => re.test(texto))) { excluidas.push(e); continue; }
    const r = reglaDe(e);
    if (!r) continue;

    const k = r.motivo;
    const v = porMotivo.get(k) || { n: 0, monto: 0 };
    v.n++; v.monto += Number(e.monto) || 0;
    porMotivo.set(k, v);

    filas.push({
      fuente: e.fuente, id_geclisa: e.id_geclisa, anio: e.anio, mes: e.mes,
      fecha: e.fecha, descripcion: e.descripcion, proveedor_nombre: e.proveedor_nombre,
      monto: e.monto, categoria: e.categoria_sugerida,
      tipo_costo: r.tipo,
      es_costo_fijo: r.tipo === "fijo",
      categoria_costo_fijo_id: r.tipo === "fijo" ? (r.cat || null) : null,
      subcategoria_variable: r.tipo === "variable" ? (r.sub || null) : null,
      auto_clasificado: true,
      clasificado_por: 'regla-fondos-honorarios',
      clasificado_at: ahora,
    });
  }

  console.log('');
  console.log('POR REGLA:');
  for (const [k, v] of [...porMotivo].sort((a, b) => b[1].monto - a[1].monto)) {
    console.log(`  ${k.padEnd(24)} ${String(v.n).padStart(4)} · ${ars(v.monto)}`);
  }
  console.log(`  TOTAL                    ${String(filas.length).padStart(4)} · ${ars(filas.reduce((s, f) => s + (Number(f.monto) || 0), 0))}`);

  if (excluidas.length) {
    console.log('');
    console.log(`EXCLUIDAS a propósito (${excluidas.length}) — parecían honorarios y no lo son:`);
    for (const e of excluidas.slice(0, 12)) {
      console.log(`  ${ars(e.monto).padStart(14)} · ${e.proveedor_nombre || ''} ${String(e.descripcion || '').slice(0, 45)}`);
    }
  }

  // Claves repetidas: el upsert rechaza el INSERT entero si el lote las trae.
  const vistas = new Set();
  const rep = filas.filter((r) => {
    const k = `${r.fuente}_${r.id_geclisa}`;
    if (vistas.has(k)) return true;
    vistas.add(k); return false;
  });
  if (rep.length) throw new Error(`${rep.length} claves repetidas en el lote — revisar la paginación`);

  if (!WRITE) {
    console.log('');
    console.log('SIMULACRO: no se escribió nada. Agregá --write para aplicar.');
    return;
  }

  console.log('');
  let escritas = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await sb.from('erogaciones_clasificacion')
      .upsert(lote, { onConflict: 'fuente,id_geclisa' });
    if (error) throw new Error(`upsert lote ${i}: ${error.message}`);
    escritas += lote.length;
    console.log(`  escritas ${escritas}/${filas.length}`);
  }
  console.log('');
  console.log(`LISTO: ${escritas} clasificadas por regla, marcadas "Auto".`);

  // Sólo los VEP de impuestos mueven el estado de resultados. Las rendiciones
  // y los honorarios cambian de "sin clasificar" a "decidido" y nada más, y el
  // VEP del 931 queda en una categoría que el informe saltea.
  const sumaSi = (p) => filas.filter(p).reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const alResultado = sumaSi((f) => f.categoria_costo_fijo_id === CAT_IMPUESTOS);
  console.log(`Suman al costo fijo: ${ars(alResultado)} (sólo los VEP de impuestos).`);
  console.log(`El resto no toca el estado de resultados: deja de contar como sin clasificar.`);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
