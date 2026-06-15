// ============================================================
// CARGADOR de F.931 2026 (feb y mar) - Modulo Sueldos
// ============================================================
// USO:
//   cd server
//   node scripts/cargar-f931-2026.js            -> DRY-RUN (parsea y muestra)
//   node scripts/cargar-f931-2026.js --write     -> sube PDF + crea declaracion confirmada
//
// Carga SOLO feb (02) y mar (03) de 2026 (son los unicos F.931 reales 2026;
// enero-2026 es un VEP y feb/mar no tienen minuta todavia -> sin netos no hay
// asiento, pero el F.931 queda registrado para conciliar cuando llegue la minuta).
//
// Para cada mes:
//   1. Lee 'C:\FISCAL\931\931\F 931 MM2026.pdf' y lo parsea (parser de la UI).
//   2. Si NO existe la liquidacion_mes del periodo, la crea (estado VACIO + 4 bloques)
//      como contenedor (equivalente a abrir el mes en la UI). NO carga netos.
//   3. Con --write: sube el PDF al bucket, inserta la declaracion REVISADO_CONFIRMADO
//      (linkeada a la liquidacion) y el adjunto.
//
// Idempotente: si ya existe una declaracion REVISADO_CONFIRMADO para el periodo,
// se saltea. VEPs / parseos fallidos se reportan y se saltean.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const { supabase, mensajeError } = require('../config/supabase');
const { parsearF931, SURVISION_CUIT } = require('../services/f931Parser');

const DIR = 'C:\\FISCAL\\931\\931\\';
const WRITE = process.argv.includes('--write');
const ANIO = 2026;
const MESES = [2, 3];
const BUCKET = 'sueldos-adjuntos';
const NOMBRE_USUARIO = 'P. Famá (carga masiva)';
const CTA_BANCO = '1.1.1.03';
const CTA_CAJA = '1.1.1.01';

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 });
const $ = (n) => (n === null || n === undefined ? '—' : fmt.format(Number(n)));
const log = console.log;

function armarBucketPath(anio, mes, nombreOriginal) {
  const mm = String(mes).padStart(2, '0');
  const ts = Date.now();
  const slug = nombreOriginal.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return `${anio}/${mm}/${ts}_${slug}`;
}

// Crea la liquidacion_mes (VACIO) + 4 bloques como contenedor del mes.
async function inicializarMes(mes) {
  const { data: liqRow, error: e1 } = await supabase.from('liquidaciones_mes')
    .insert({ anio: ANIO, mes, estado: 'VACIO', observaciones: 'Inicializado por carga F.931 2026 (sin minuta aun)' }).select().single();
  if (e1) throw new Error('crear liquidacion ' + mes + ': ' + mensajeError(e1));
  const bloques = [
    { liquidacion_id: liqRow.id, tipo: 'pago_sueldos', medio_pago: 'banco_santander_rio', cuenta_contracuenta: CTA_BANCO, completo: false },
    { liquidacion_id: liqRow.id, tipo: 'horas_complementarias', medio_pago: 'caja', cuenta_contracuenta: CTA_CAJA, completo: false },
    { liquidacion_id: liqRow.id, tipo: 'seguridad_social', medio_pago: 'banco_santander_rio', cuenta_contracuenta: CTA_BANCO, completo: false },
    { liquidacion_id: liqRow.id, tipo: 'sindicato', medio_pago: 'banco_santander_rio', cuenta_contracuenta: CTA_BANCO, completo: false },
  ];
  const { error: e2 } = await supabase.from('liquidacion_bloques').insert(bloques);
  if (e2) { await supabase.from('liquidaciones_mes').delete().eq('id', liqRow.id); throw new Error('crear bloques ' + mes + ': ' + mensajeError(e2)); }
  return liqRow.id;
}

(async () => {
  log('='.repeat(70));
  log(`CARGA F.931 ${ANIO} (feb/mar) — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  log('='.repeat(70));

  const { data: liqs, error: eLiq } = await supabase
    .from('liquidaciones_mes').select('id, mes').eq('anio', ANIO);
  if (eLiq) throw new Error(mensajeError(eLiq));
  const liqByMes = new Map((liqs || []).map((l) => [l.mes, l]));

  const { data: decls } = await supabase
    .from('f931_declaraciones').select('mes, estado').eq('anio', ANIO);
  const declByMes = new Map((decls || []).map((d) => [d.mes, d]));

  let okCount = 0;
  for (const mes of MESES) {
    const mm = String(mes).padStart(2, '0');
    const nombre = `F 931 ${mm}${ANIO}.pdf`;
    const ruta = DIR + nombre;

    if (!fs.existsSync(ruta)) { log(`\n${mm}/${ANIO}: NO existe ${nombre}, salteo.`); continue; }

    const buffer = fs.readFileSync(ruta);
    const res = await parsearF931(buffer, { cuitEsperado: SURVISION_CUIT, periodoEsperado: { anio: ANIO, mes } });

    if (!res.ok) { log(`\n${mm}/${ANIO}: PARSE FALLO (${res.error.codigo}) ${res.error.mensaje} — salteo.`); continue; }
    if (res.detectado_como_vep) { log(`\n${mm}/${ANIO}: parece VEP, no F.931 — salteo.`); continue; }

    const c = res.campos;
    const periodoOk = res.periodo_detectado && res.periodo_detectado.anio === ANIO && res.periodo_detectado.mes === mes;
    const yaExiste = declByMes.get(mes);
    let liq = liqByMes.get(mes);

    log(`\n${mm}/${ANIO}  cuit_ok=${res.cuit_coincide}  periodo_ok=${!!periodoOk}  trab=${c.cantidad_trabajadores}` +
        (yaExiste ? `  [YA EXISTE: ${yaExiste.estado}]` : '') + (liq ? '' : '  [SIN LIQUIDACION -> se creara]'));
    log(`   rem_1=$ ${$(c.rem_1)}  301=$ ${$(c.aporte_ss_301)}  302=$ ${$(c.aporte_os_302)}  351=$ ${$(c.contrib_ss_351)}  352=$ ${$(c.contrib_os_352)}  ART=$ ${$(c.art)}  SCVO=$ ${$(c.scvo)}`);
    if (res.warnings && res.warnings.length) log('   warnings: ' + res.warnings.join(' | '));

    if (!WRITE) continue;

    if (yaExiste && yaExiste.estado === 'REVISADO_CONFIRMADO') { log('   -> ya confirmada, salteo.'); continue; }

    // Crear la liquidacion contenedora si no existe
    if (!liq) {
      const id = await inicializarMes(mes);
      liq = { id, mes };
      log('   -> liquidacion VACIO creada (contenedor, sin minuta).');
    }

    // 1. Upload PDF al Storage
    const bucketPath = armarBucketPath(ANIO, mes, nombre);
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(bucketPath, buffer, { contentType: 'application/pdf', upsert: false });
    if (upErr) { log('   -> ERROR upload Storage: ' + upErr.message + ', salteo.'); continue; }

    // 2. INSERT declaracion confirmada
    const razon = (c.campos_extra && c.campos_extra.razon_social) || 'Survision S.A.';
    const ahora = new Date().toISOString();
    const payloadDecl = {
      cuit: SURVISION_CUIT, cuit_sin_guiones: '30709672661', razon_social: razon,
      anio: ANIO, mes, liquidacion_id: liq.id,
      estado: 'REVISADO_CONFIRMADO', parecio_vep: false,
      cantidad_trabajadores: c.cantidad_trabajadores,
      rem_total: c.rem_total, rem_1: c.rem_1, rem_2: c.rem_2, rem_3: c.rem_3, rem_4: c.rem_4, rem_5: c.rem_5,
      aporte_ss_301: c.aporte_ss_301, aporte_os_302: c.aporte_os_302,
      contrib_ss_351: c.contrib_ss_351, contrib_os_352: c.contrib_os_352,
      art: c.art, scvo: c.scvo,
      asignaciones_familiares: c.asignaciones_familiares, total_a_depositar: c.total_a_depositar,
      campos_extra: c.campos_extra, raw_extract_text: res.raw_text ?? null,
      parseado_at: ahora, confirmado_at: ahora, confirmado_por_nombre: NOMBRE_USUARIO,
    };
    const { data: declData, error: declErr } = await supabase
      .from('f931_declaraciones').insert(payloadDecl).select().single();
    if (declErr) {
      await supabase.storage.from(BUCKET).remove([bucketPath]).catch(() => {});
      log('   -> ERROR insert declaracion: ' + mensajeError(declErr) + ', salteo.');
      continue;
    }

    // 3. INSERT adjunto
    const { error: adjErr } = await supabase.from('f931_adjuntos').insert({
      declaracion_id: declData.id, tipo_adjunto: 'F931_OFICIAL', bucket_path: bucketPath,
      nombre_original: nombre, mime_type: 'application/pdf', tamano_bytes: buffer.length,
      detectado_como_vep: false, subido_por_nombre: NOMBRE_USUARIO,
    });
    if (adjErr) {
      await supabase.from('f931_declaraciones').delete().eq('id', declData.id);
      await supabase.storage.from(BUCKET).remove([bucketPath]).catch(() => {});
      log('   -> ERROR insert adjunto: ' + mensajeError(adjErr) + ', salteo.');
      continue;
    }

    okCount++;
    log('   -> CONFIRMADA OK.');
  }

  log('\n' + '='.repeat(70));
  if (!WRITE) log('DRY-RUN. Para escribir: node scripts/cargar-f931-2026.js --write');
  else log(`Listo. ${okCount} F.931 cargados y confirmados (feb/mar 2026).`);
  log('NOTA: feb/mar 2026 quedan SIN minuta (sin netos) -> no se generan asientos aun.');
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
