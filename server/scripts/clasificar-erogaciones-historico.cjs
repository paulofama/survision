// ============================================================
// CLASIFICAR EROGACIONES SEGÚN EL HISTÓRICO — por año completo
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/clasificar-erogaciones-historico.cjs --anio 2025          (simulacro)
//   node scripts/clasificar-erogaciones-historico.cjs --anio 2025 --write  (escribe)
//
// POR QUÉ EXISTE
// --------------
// La pantalla de Costos Fijos tiene "Sugerir s/ histórico", pero trabaja sobre
// EL MES QUE ESTÁ ABIERTO. Para un año hay que repetirlo doce veces, y por eso
// nunca se hizo: al 23/09/2026, de las 2.241 erogaciones de 2025 había UNA
// clasificada, así que el Análisis Marginal mostraba el año con los sueldos
// como único costo fijo y un resultado operativo del 35%.
//
// Este script corre EL MISMO algoritmo que la pantalla, sobre todos los meses
// del año de una sola vez. Si el algoritmo cambia allá, tiene que cambiar acá:
// son dos implementaciones de la misma regla y no hay forma de compartir el
// código (la pantalla es TypeScript de navegador, esto es Node).
//
// EL ALGORITMO (igual que `sugerirSegunHistorico` en useErogaciones.ts)
// --------------------------------------------------------------------
//   1. Aprende de TODAS las clasificaciones ya hechas.
//   2. Arma dos índices: proveedor+monto (específico) y proveedor (dominante).
//   3. Para cada erogación sin clasificar busca primero el específico y, si no
//      hay, el dominante.
//   4. Si el histórico no sabe, lo dice el TIPO DE PROVEEDOR de GECLISA
//      (migración 58): 4 insumos, 5 honorarios, 3 insumos de oficina, 1
//      servicios u honorarios profesionales según el concepto de ganancias.
//      Este nivel nunca pisa al histórico, sólo lo completa. Sin nada de esto,
//      la deja sin clasificar: NO inventa.
//   5. Escribe con `auto_clasificado: true` y `clasificado_por: 'sugerencia'`,
//      que es lo que hace que salgan marcadas "Auto" para revisar.
//
// DOS COSAS QUE ESTE SCRIPT TENÍA DESACTUALIZADAS (30/09/2026)
// -------------------------------------------------------------
// El aviso de arriba —"si el algoritmo cambia allá, tiene que cambiar acá"—
// se cumplió, y había divergido en dos puntos:
//
//   · Le faltaba el nivel 4 entero, agregado al front el 27/09.
//   · `normProv` no neutralizaba "-", "S/D" ni "—", así que todos los
//     comprobantes SIN proveedor caían en un mismo balde y el histórico de ese
//     balde sugería cualquier cosa. Ese bug ya se había arreglado en el front
//     después de dejar 11 de 15 sugerencias mal en agosto-2026; acá seguía
//     vivo, y este script escribe de a un año entero.
//
// Lo que el script NO hace es decidir: sugiere lo que ya se decidió antes para
// ese proveedor. Una sugerencia sin revisar es una hipótesis, no un asiento.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const iAnio = args.indexOf('--anio');
const ANIO = iAnio >= 0 ? Number(args[iAnio + 1]) : null;

if (!ANIO || !Number.isInteger(ANIO)) {
  console.error('USO: node scripts/clasificar-erogaciones-historico.cjs --anio 2025 [--write]');
  process.exit(1);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);

const ars = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

/**
 * Igual que `normalizarProveedor` en useErogaciones.ts.
 *
 * "-", "S/D" y "—" NO son proveedores: son el campo vacío escrito de tres
 * maneras. Si se los deja pasar, todos los comprobantes sin proveedor caen en
 * un mismo balde y el histórico de ese balde "aprende" cualquier cosa. Ya
 * pasó: 11 de 15 sugerencias mal en agosto-2026. Devuelven cadena vacía, y
 * quien llama tiene que saltear el histórico cuando el proveedor viene vacío.
 */
const normProv = (s) => {
  const limpio = String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return limpio === '-' || limpio === 'S/D' || limpio === '—' ? '' : limpio;
};

/** Nombres de categoría que implica el tipo de proveedor de GECLISA. */
const NOMBRE_CATEGORIA_POR_TIPO = { 3: 'Insumos de Oficina', 1: 'Servicios' };

/** Igual que `porTipoProveedor` en useErogaciones.ts. */
const porTipoProveedor = (tipoProv, concGan, idDeCategoria) => {
  switch (tipoProv) {
    case 4: return { tipo: 'variable', cat: null, sub: 'insumos' };
    case 5: return { tipo: 'variable', cat: null, sub: 'honorarios' };
    case 3: return { tipo: 'fijo', cat: idDeCategoria('Insumos de Oficina'), sub: null };
    case 1: {
      // El tipo 1 mezcla un flete con un estudio jurídico: lo desempata el
      // concepto de ganancias.
      const nombre = concGan === 2 ? 'Honorarios Profesionales' : NOMBRE_CATEGORIA_POR_TIPO[1];
      return { tipo: 'fijo', cat: idDeCategoria(nombre), sub: null };
    }
    // 0 es "S/D" y null es caja o liquidaciones: en los dos casos no se sabe.
    default: return null;
  }
};

/** Igual que `normalizeTipoCosto` en useErogaciones.ts. */
const normTipo = (v) => {
  if (!v) return 'sin_clasificar';
  const s = String(v).replace(/^"|"$/g, '').trim();
  return (s === 'fijo' || s === 'variable' || s === 'sin_clasificar') ? s : 'sin_clasificar';
};

/**
 * Pagina: PostgREST corta en 1000 filas sin avisar y estas tablas ya las pasaron.
 *
 * EL ORDER BY NO ES DECORATIVO. Sin él, Postgres no garantiza qué 1.000 filas
 * devuelve cada página, así que dos páginas pueden traer las MISMAS filas y
 * saltearse otras. Acá se vio como 125 claves repetidas en el lote y un upsert
 * rechazado entero ("ON CONFLICT DO UPDATE command cannot affect row a second
 * time"); la otra mitad —las filas que NUNCA llegaron— no se ve, simplemente
 * quedan sin clasificar y nadie lo nota.
 *
 * Se ordena por la clave única (fuente, id_geclisa) para que el corte de cada
 * página sea determinístico.
 */
async function traerTodo(tabla, select, filtro, orden) {
  // El orden se puede cambiar, pero NUNCA sacar: es lo que hace que las
  // páginas no se pisen. Las tablas que no tienen (fuente, id_geclisa) pasan
  // el suyo.
  const claves = orden || ['fuente', 'id_geclisa'];
  const out = [];
  let desde = 0;
  for (;;) {
    let q = sb.from(tabla).select(select);
    for (const k of claves) q = q.order(k, { ascending: true });
    q = q.range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
    desde += 1000;
  }
  return out;
}

/** El combo que se aprende: qué clasificación se le puso a ese proveedor. */
const comboDe = (r) => JSON.stringify({
  tipo: normTipo(r.tipo_costo),
  cat: r.categoria_costo_fijo_id || null,
  sub: r.subcategoria_variable || null,
});

/** De un Map<clave, Map<combo, veces>> saca el combo más frecuente por clave. */
function dominantes(indice) {
  const out = new Map();
  for (const [clave, combos] of indice) {
    const top = [...combos.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.set(clave, JSON.parse(top));
  }
  return out;
}

(async () => {
  console.log(`Clasificación según histórico · año ${ANIO} · ${WRITE ? 'ESCRIBE' : 'SIMULACRO (no escribe)'}`);
  console.log('');

  // 1. Histórico: todo lo ya clasificado, de cualquier período.
  const hist = await traerTodo(
    'erogaciones_clasificacion',
    'proveedor_nombre, monto, tipo_costo, categoria_costo_fijo_id, subcategoria_variable',
  );
  const utiles = hist.filter((r) => normTipo(r.tipo_costo) !== 'sin_clasificar' && normProv(r.proveedor_nombre));
  console.log(`Histórico: ${hist.length} clasificaciones, ${utiles.length} utilizables.`);

  const porProv = new Map();
  const porProvMonto = new Map();
  for (const r of utiles) {
    const prov = normProv(r.proveedor_nombre);
    const combo = comboDe(r);
    if (!porProv.has(prov)) porProv.set(prov, new Map());
    porProv.get(prov).set(combo, (porProv.get(prov).get(combo) || 0) + 1);

    const key = `${prov}|${Math.round(Number(r.monto) || 0)}`;
    if (!porProvMonto.has(key)) porProvMonto.set(key, new Map());
    porProvMonto.get(key).set(combo, (porProvMonto.get(key).get(combo) || 0) + 1);
  }
  const domProv = dominantes(porProv);
  const domProvMonto = dominantes(porProvMonto);
  console.log(`Proveedores aprendidos: ${domProv.size} · combinaciones proveedor+monto: ${domProvMonto.size}`);
  console.log('');

  // 1b. Las categorías, para poder traducir el nombre que implica el tipo de
  // proveedor al id que se guarda.
  const cats = await traerTodo('categorias_costo_fijo', 'id, nombre', null, ['id']);
  const porNombre = new Map(cats.map((x) => [String(x.nombre).trim().toUpperCase(), x.id]));
  const idDeCategoria = (nombre) => porNombre.get(String(nombre).trim().toUpperCase()) || null;

  // 2. Las erogaciones del año, y cuáles ya están clasificadas.
  const crudas = await traerTodo(
    'erogaciones_geclisa',
    'fuente, id_geclisa, anio, mes, fecha, descripcion, proveedor_nombre, monto, categoria_sugerida, '
      + 'tipo_proveedor_id, concepto_ganancias_id',
    (q) => q.eq('anio', ANIO),
  );
  const yaClas = await traerTodo('erogaciones_clasificacion', 'fuente, id_geclisa', (q) => q.eq('anio', ANIO));
  const clasificadas = new Set(yaClas.map((c) => `${c.fuente}_${c.id_geclisa}`));
  console.log(`Erogaciones ${ANIO}: ${crudas.length} · ya clasificadas: ${clasificadas.size}`);

  // 3. Sugerir.
  const ahora = new Date().toISOString();
  const filas = [];
  const sinMatch = [];
  let porEspecifico = 0;
  let porTipo = 0;
  for (const e of crudas) {
    if (clasificadas.has(`${e.fuente}_${e.id_geclisa}`)) continue;
    const prov = normProv(e.proveedor_nombre);
    // Sin proveedor no se consulta el histórico: ver `normProv`.
    const especifico = prov ? domProvMonto.get(`${prov}|${Math.round(Number(e.monto) || 0)}`) : undefined;
    const delHistorico = especifico || (prov ? domProv.get(prov) : undefined);
    // Tercer nivel: si el histórico no sabe, lo dice el tipo de proveedor de
    // GECLISA (migración 58). Nunca pisa al histórico, sólo lo completa.
    const d = delHistorico || porTipoProveedor(e.tipo_proveedor_id, e.concepto_ganancias_id, idDeCategoria);
    if (!d) { sinMatch.push(e); continue; }
    if (especifico) porEspecifico++;
    if (!delHistorico) porTipo++;
    filas.push({
      fuente: e.fuente,
      id_geclisa: e.id_geclisa,
      anio: e.anio,
      mes: e.mes,
      fecha: e.fecha,
      descripcion: e.descripcion,
      proveedor_nombre: e.proveedor_nombre,
      monto: e.monto,
      categoria: e.categoria_sugerida,
      tipo_costo: d.tipo,
      es_costo_fijo: d.tipo === 'fijo',
      categoria_costo_fijo_id: d.tipo === 'fijo' ? d.cat : null,
      subcategoria_variable: d.tipo === 'variable' ? d.sub : null,
      auto_clasificado: true,
      clasificado_por: 'sugerencia',
      clasificado_at: ahora,
    });
  }

  const suma = (arr) => arr.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const fijo = filas.filter((f) => f.tipo_costo === 'fijo');
  const variable = filas.filter((f) => f.tipo_costo === 'variable');

  console.log('');
  console.log(`SE PUEDEN SUGERIR: ${filas.length} (${porEspecifico} por proveedor+monto, `
    + `${filas.length - porEspecifico - porTipo} por proveedor, ${porTipo} por tipo de proveedor)`);
  console.log(`   fijo     ${String(fijo.length).padStart(5)} · ${ars(suma(fijo))}`);
  console.log(`   variable ${String(variable.length).padStart(5)} · ${ars(suma(variable))}`);
  console.log(`SIN MATCH:     ${sinMatch.length} · ${ars(suma(sinMatch))}  (quedan sin clasificar, a mano)`);

  // Por mes, para ver que ningún mes quede huérfano.
  const porMes = new Map();
  for (const f of filas) porMes.set(f.mes, (porMes.get(f.mes) || 0) + 1);
  const porMesSin = new Map();
  for (const e of sinMatch) porMesSin.set(e.mes, (porMesSin.get(e.mes) || 0) + 1);
  console.log('');
  console.log('mes | sugeridas | sin match');
  for (let m = 1; m <= 12; m++) {
    if (!porMes.has(m) && !porMesSin.has(m)) continue;
    console.log(` ${String(m).padStart(2)} | ${String(porMes.get(m) || 0).padStart(9)} | ${String(porMesSin.get(m) || 0).padStart(9)}`);
  }

  // Los proveedores sin match, por plata: son los que hay que resolver a mano.
  const provSin = new Map();
  for (const e of sinMatch) {
    const p = e.proveedor_nombre || '(sin proveedor)';
    const v = provSin.get(p) || { n: 0, monto: 0 };
    v.n++; v.monto += Number(e.monto) || 0;
    provSin.set(p, v);
  }
  if (provSin.size) {
    console.log('');
    console.log('Proveedores SIN match en el histórico (los 15 de mayor monto):');
    for (const [p, v] of [...provSin].sort((a, b) => b[1].monto - a[1].monto).slice(0, 15)) {
      console.log(`  ${String(v.n).padStart(4)} · ${ars(v.monto).padStart(16)} · ${p}`);
    }
  }

  // El upsert va por (fuente, id_geclisa): si el lote trae la misma clave dos
  // veces, Postgres rechaza el INSERT entero ("cannot affect row a second
  // time"). Mejor verlo acá, con la clave a la vista, que como un error opaco.
  const vistas = new Map();
  const repetidas = [];
  for (const r of filas) {
    const k = `${r.fuente}_${r.id_geclisa}`;
    if (vistas.has(k)) repetidas.push({ k, a: vistas.get(k), b: r });
    else vistas.set(k, r);
  }
  if (repetidas.length) {
    console.log('');
    console.log(`⚠ CLAVES REPETIDAS EN EL LOTE: ${repetidas.length}`);
    for (const r of repetidas.slice(0, 10)) {
      console.log(`   ${r.k} · ${ars(r.a.monto)} "${String(r.a.descripcion || '').slice(0, 40)}" vs ${ars(r.b.monto)} "${String(r.b.descripcion || '').slice(0, 40)}"`);
    }
  }

  if (!WRITE) {
    console.log('');
    console.log('SIMULACRO: no se escribió nada. Agregá --write para aplicar.');
    return;
  }

  // 4. Escribir en lotes.
  console.log('');
  let escritas = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await sb
      .from('erogaciones_clasificacion')
      .upsert(lote, { onConflict: 'fuente,id_geclisa' });
    if (error) throw new Error(`upsert lote ${i}: ${error.message}`);
    escritas += lote.length;
    console.log(`  escritas ${escritas}/${filas.length}`);
  }
  console.log('');
  console.log(`LISTO: ${escritas} erogaciones clasificadas, TODAS marcadas "Auto".`);
  console.log('Revisalas en Costos Fijos antes de presentar un informe con estos números.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
