// ============================================================
// CARGADOR de netos por empleado desde la minuta .xlsx (Fase 4)
// Modulo Sueldos - Survision S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-netos-minuta.js [hoja]            -> DRY-RUN (no escribe)
//   node scripts/cargar-netos-minuta.js [hoja] --write    -> escribe en Supabase
//
//   default hoja = 12-2025
//
// Lee la hoja mensual de 'C:\FISCAL\Minuta contable 2025.xlsx', extrae los
// netos por empleado de las secciones "Pago de Sueldos" (origen recibo) y
// "Pago de Horas complementaria" (origen facturado), los matchea contra la
// tabla empleados (por apellido+nombre normalizado) y, con --write, inserta
// las lineas en liquidacion_lineas_empleado (upsert por bloque+empleado).
//
// Los montos del Excel ya son numericos (no hay parseo es-AR).
// Empleados sin match (ej. servicios que facturan: Rodriguez, Narambuena) se
// reportan y se saltan.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const XLSX = require(path.join(__dirname, '..', '..', 'node_modules', 'xlsx'));
const { supabase, mensajeError } = require('../config/supabase');

const ARCHIVO = 'C:\\FISCAL\\Minuta contable 2025.xlsx';
const hoja = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '12-2025';
const WRITE = process.argv.includes('--write');

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => fmt.format(Number(n) || 0);
const log = console.log;
const section = (t) => log('\n' + '='.repeat(60) + '\n' + t + '\n' + '='.repeat(60));

// Normaliza nombre para matchear (minusculas, sin acentos, espacios colapsados)
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parsea una seccion: devuelve [{ nombre, monto }] de filas de empleado.
// Las filas de empleado tienen el nombre en col0 y el monto como ultimo numero.
// Se descartan headers de area, totales y separadores.
const STOP = ['caja', 'banco', 'sumas iguales', 'retenciones css', 'retenciones cos'];
function parsearSeccion(filas, headerRegex, finRegex) {
  const out = [];
  let dentro = false;
  for (const fila of filas) {
    const c0 = norm(fila[0]);
    if (!dentro) {
      if (headerRegex.test(c0)) dentro = true;
      continue;
    }
    if (finRegex.test(c0)) break;
    if (!c0) continue;
    if (c0.startsWith('area ')) continue;          // header de area (total en col3)
    if (STOP.includes(c0)) continue;               // totales / contracuenta
    // monto = ultimo valor numerico de la fila
    let monto = null;
    for (let i = fila.length - 1; i >= 1; i--) {
      const v = fila[i];
      if (typeof v === 'number' && Number.isFinite(v)) { monto = v; break; }
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) { monto = Number(v); break; }
    }
    if (monto === null) continue;                  // fila sin monto (no es empleado)
    out.push({ nombre: String(fila[0]).trim(), monto: Math.round(monto * 100) / 100 });
  }
  return out;
}

(async () => {
  section(`CARGA DE NETOS — hoja ${hoja}  (${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'})`);

  // 1. Leer Excel
  const wb = XLSX.readFile(ARCHIVO);
  const ws = wb.Sheets[hoja];
  if (!ws) { log(`No existe la hoja "${hoja}".`); process.exit(1); }
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

  const pago = parsearSeccion(filas, /^pago de sueldos/, /^(pago de horas|seguridad social|sindicato)/);
  const hc = parsearSeccion(filas, /^pago de horas/, /^(seguridad social|sindicato)/);

  log(`\nPago de Sueldos: ${pago.length} empleados, total $ ${$(pago.reduce((s, e) => s + e.monto, 0))}`);
  log(`Horas Complementarias: ${hc.length} filas, total $ ${$(hc.reduce((s, e) => s + e.monto, 0))}`);

  // 2. Cargar liquidacion del mes + empleados
  const [anioStr, mesStr] = hoja.split('-').length === 2 ? hoja.split('-') : [null, null];
  // hoja formato MM-AAAA
  const mes = parseInt(hoja.split('-')[0], 10);
  const anio = parseInt(hoja.split('-')[1], 10);

  const { data: liq, error: eLiq } = await supabase
    .from('liquidaciones_mes').select('id, estado').eq('anio', anio).eq('mes', mes).maybeSingle();
  if (eLiq) throw new Error(mensajeError(eLiq));
  if (!liq) { log(`\nNo hay liquidacion para ${mes}/${anio}. Iniciá el mes primero.`); process.exit(1); }

  const { data: bloques, error: eBlq } = await supabase
    .from('liquidacion_bloques').select('id, tipo').eq('liquidacion_id', liq.id);
  if (eBlq) throw new Error(mensajeError(eBlq));
  const bloquePago = (bloques || []).find((b) => b.tipo === 'pago_sueldos');
  const bloqueHC = (bloques || []).find((b) => b.tipo === 'horas_complementarias');

  const { data: empleados, error: eEmp } = await supabase
    .from('empleados').select('id, apellido, nombre, area, cuenta_contable');
  if (eEmp) throw new Error(mensajeError(eEmp));

  // indice de match: "apellido nombre" y "nombre apellido" normalizados
  const idx = new Map();
  for (const e of empleados || []) {
    idx.set(norm(`${e.apellido} ${e.nombre}`), e);
    idx.set(norm(`${e.nombre} ${e.apellido}`), e);
  }
  // Alias explicitos para typos entre fuentes (Excel vs maestro empleados).
  // Mismo empleado sin ambiguedad (confirmado por area). NO modifica el maestro.
  const ALIAS = {
    'giulini claudia': 'giuliani claudia',   // typo en Excel (falta 'a'); el maestro tiene "Giuliani"
    // (el maestro tenía "Guerero" → corregido a "Guerrero" el 2026-06-13, ya matchea directo)
  };
  function matchEmpleado(nombreExcel) {
    const n = norm(nombreExcel);
    if (idx.get(n)) return idx.get(n);
    if (ALIAS[n] && idx.get(ALIAS[n])) return idx.get(ALIAS[n]);
    return null;
  }

  // 3. Matchear y armar inserts
  function preparar(filasSeccion, origen, bloque) {
    const matched = [], unmatched = [];
    for (const r of filasSeccion) {
      const emp = matchEmpleado(r.nombre);
      if (!emp) { unmatched.push(r); continue; }
      matched.push({
        bloque_id: bloque ? bloque.id : null,
        empleado_id: emp.id,
        monto_neto_cargado: r.monto,
        origen,
        area_snapshot: emp.area,
        cuenta_contable_snapshot: emp.cuenta_contable,
        _nombre: `${emp.apellido}, ${emp.nombre}`,
        _excel: r.nombre,
      });
    }
    return { matched, unmatched };
  }

  const pagoPrep = preparar(pago, 'recibo', bloquePago);
  const hcPrep = preparar(hc, 'facturado', bloqueHC);

  section('MATCHEO — Pago de Sueldos (origen recibo)');
  for (const m of pagoPrep.matched) log(`  OK  ${String(m._excel).padEnd(22)} -> ${String(m._nombre).padEnd(26)} ${String(m.area_snapshot).padEnd(16)} ${m.cuenta_contable_snapshot}  $ ${$(m.monto_neto_cargado)}`);
  for (const u of pagoPrep.unmatched) log(`  ??  ${String(u.nombre).padEnd(22)} SIN MATCH  $ ${$(u.monto)}`);

  section('MATCHEO — Horas Complementarias (origen facturado)');
  for (const m of hcPrep.matched) log(`  OK  ${String(m._excel).padEnd(22)} -> ${String(m._nombre).padEnd(26)} $ ${$(m.monto_neto_cargado)}`);
  for (const u of hcPrep.unmatched) log(`  ??  ${String(u.nombre).padEnd(22)} SIN MATCH (se saltea)  $ ${$(u.monto)}`);

  // 4. Escribir o no
  section(WRITE ? 'ESCRIBIENDO en Supabase' : 'DRY-RUN (no se escribe nada)');
  if (!WRITE) {
    log(`Pago de Sueldos: ${pagoPrep.matched.length} a insertar, ${pagoPrep.unmatched.length} sin match.`);
    log(`HC:              ${hcPrep.matched.length} a insertar, ${hcPrep.unmatched.length} sin match (se saltean).`);
    log('\nPara escribir: node scripts/cargar-netos-minuta.js ' + hoja + ' --write');
    process.exit(0);
  }

  async function upsertLineas(prep, etiqueta) {
    if (!prep.matched.length) { log(`  ${etiqueta}: nada que insertar.`); return; }
    const rows = prep.matched.map(({ _nombre, _excel, ...r }) => r);
    const { error } = await supabase
      .from('liquidacion_lineas_empleado')
      .upsert(rows, { onConflict: 'bloque_id,empleado_id' });
    if (error) throw new Error(mensajeError(error));
    log(`  ${etiqueta}: ${rows.length} lineas upserted OK.`);
  }

  await upsertLineas(pagoPrep, 'Pago de Sueldos');
  await upsertLineas(hcPrep, 'Horas Complementarias');

  log('\nListo. Netos cargados. Ahora podés generar el asiento.');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
