// ============================================================
// SERVICIO: devengo de comisiones sobre presupuestos operados
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// Corre después de `correrMatch`: una vez que el sistema sabe qué presupuestos
// se operaron, esto decide a quién le corresponde plata por cada uno y lo
// escribe en el libro `comisiones_movimientos`.
//
// La aritmética NO está acá. Vive en `src/modules/comisiones/core/calculo.mjs`
// y la comparte con el navegador (se carga con `import()` dinámico, mismo
// patrón que `tesoreria/bancos/core/`). Este archivo hace lo otro: traer los
// datos, elegir los parámetros que estaban vigentes, y persistir.
//
// EL RÉGIMEN NACE INERTE — y hacen falta DOS actos explícitos para encenderlo:
//
//   1. `fecha_vigencia_regimen` (YYYYMMDD en la columna numérica): desde qué
//      día un presupuesto ENTREGADO entra al régimen. Sin esta fila el job no
//      devenga nada, pase lo que pase.
//   2. `tasa_comision`: cuánto. Sin tasa vigente a la fecha de la práctica,
//      el núcleo devuelve cero movimientos.
//
// POR QUÉ EL PISO SE MIDE SOBRE LA ENTREGA Y NO SOBRE LA PRÁCTICA
// ---------------------------------------------------------------
// La Dirección dijo "de acá en adelante". Un presupuesto entregado en junio y
// operado en noviembre se entregó cuando el régimen no existía: nadie lo
// asesoró sabiendo que iba a cobrar. Medir el piso sobre la práctica haría
// que el día que se enciende el sistema aparezca deuda por trabajo hecho sin
// acuerdo, sobre los 423 presupuestos que hoy están entregados esperando.
// Es la lectura conservadora, y es una línea: si la Dirección quiere lo
// contrario, se cambia `fechaDeCorte` por `fechaPractica` y listo.
//
// IDEMPOTENTE. `evento_origen` es la misma cadena para el mismo hecho y hay un
// UNIQUE en la tabla: correrlo dos veces no paga dos veces.
// ============================================================

const path = require('path');
const { pathToFileURL } = require('url');
const { supabase } = require('../config/supabase');

const CORE = path.join(__dirname, '..', '..', 'src', 'modules', 'comisiones', 'core');

async function cargarCore() {
  const [calculo, parametros] = await Promise.all([
    import(pathToFileURL(path.join(CORE, 'calculo.mjs')).href),
    import(pathToFileURL(path.join(CORE, 'parametros.mjs')).href),
  ]);
  return { ...calculo, ...parametros };
}

/**
 * Carga paginada. **Con ORDER BY, y no es decorativo**: PostgREST corta en
 * 1000 filas y sin un orden estable las páginas se superponen y se saltean
 * filas a la vez. Ya nos costó 125 claves duplicadas una vez.
 */
async function loadAll(table, select, orderBy, filterFn) {
  const acc = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(select).order(orderBy, { ascending: true }).range(from, from + 999);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    acc.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return acc;
}

/**
 * Emite los devengos de todos los presupuestos operados que todavía no los
 * tienen.
 *
 * @param {{write?: boolean}} opts  sin `write` es un simulacro: calcula todo y
 *   no escribe una sola fila. Es el modo por defecto a propósito.
 * @returns resumen + (en simulacro) el detalle de lo que emitiría.
 */
async function correrDevengos({ write = false } = {}) {
  const core = await cargarCore();

  // 1) Parámetros. Si el régimen no está encendido, no se hace nada más:
  //    ni siquiera vale la pena leer los presupuestos.
  const { data: paramRows, error: paramErr } = await supabase
    .from('comisiones_parametros').select('clave,valor,vigencia_desde');
  if (paramErr) throw new Error('parametros: ' + paramErr.message);

  // 2) Quiénes pueden cobrar. Alguien desmarcado después de entregar no
  //    genera devengos nuevos, pero los que ya emitió quedan: el libro es
  //    append-only y lo devengado es deuda.
  const usuarios = await loadAll('usuarios_sistema', 'username,es_comisionable', 'username', (q) => q.eq('es_comisionable', true));
  const comisionables = new Set(usuarios.map((u) => u.username));

  const estado = core.estadoRegimen(paramRows || [], { comisionables: comisionables.size });
  if (!estado.activo) {
    return { activo: false, motivo: estado.motivo, desdeRegimen: estado.desde || null, escrito: false };
  }
  const desdeRegimen = estado.desde;

  // 3) Los presupuestos operados que entraron al régimen.
  const pres = (await loadAll(
    'presupuestos',
    'id,numero_presupuesto,fecha_creacion,fecha_entrega,fecha_practica,estado,entregado_por,datos_completos',
    'id',
    (q) => q.eq('estado', 'practicado').not('entregado_por', 'is', null),
  )).map((p) => ({
    ...p,
    // La entrega manda; si no se registró, la creación. Sobre esta fecha se
    // mide TODO: el piso del régimen y el enfriamiento.
    fechaDeCorte: p.fecha_entrega || core.fechaLocal(p.fecha_creacion),
  })).filter((p) => p.fecha_practica && p.fechaDeCorte && p.fechaDeCorte >= desdeRegimen);

  if (pres.length === 0) {
    return { activo: true, desdeRegimen, candidatos: 0, movimientos: 0, escrito: false };
  }
  const ids = new Set(pres.map((p) => p.id));

  // 4) El atencion_id del match confirmado, cuando lo hay. Le da al
  //    `evento_origen` la identidad del hecho real; si no hay match (pasa: no
  //    todo 'practicado' viene del cruce automático) el núcleo cae al id del
  //    presupuesto, que sigue siendo único por presupuesto.
  const matches = await loadAll('presupuestos_practica_match', 'presupuesto_id,atencion_id,estado', 'presupuesto_id', (q) => q.eq('estado', 'confirmado'));
  const atencionPorPres = new Map();
  for (const m of matches) if (ids.has(m.presupuesto_id)) atencionPorPres.set(m.presupuesto_id, m.atencion_id);

  // 5) Participantes y llamadas.
  const participantes = await loadAll('presupuestos_participantes', 'presupuesto_id,usuario', 'presupuesto_id');
  const partesPorPres = new Map();
  for (const r of participantes) {
    if (!ids.has(r.presupuesto_id) || !comisionables.has(r.usuario)) continue;
    if (!partesPorPres.has(r.presupuesto_id)) partesPorPres.set(r.presupuesto_id, []);
    partesPorPres.get(r.presupuesto_id).push(r.usuario);
  }

  const llamadas = await loadAll('presupuestos_seguimiento_llamadas', 'id,presupuesto_id,usuario,canal,resultado,created_at', 'id');
  const llamadasPorPres = new Map();
  for (const l of llamadas) {
    if (!ids.has(l.presupuesto_id)) continue;
    if (!llamadasPorPres.has(l.presupuesto_id)) llamadasPorPres.set(l.presupuesto_id, []);
    llamadasPorPres.get(l.presupuesto_id).push({
      id: l.id, usuario: l.usuario, canal: l.canal, resultado: l.resultado,
      fecha: core.fechaLocal(l.created_at),
    });
  }

  // 6) Lo ya devengado, para no recalcular al pedo. El UNIQUE de la tabla es
  //    la garantía de verdad; esto es sólo para que el resumen diga la verdad.
  const yaEmitidos = await loadAll('comisiones_movimientos', 'presupuesto_id,beneficiario,rol,tipo,evento_origen', 'presupuesto_id');
  const claveMov = (m) => `${m.presupuesto_id}|${m.beneficiario}|${m.rol}|${m.tipo}|${m.evento_origen}`;
  const emitidos = new Set(yaEmitidos.map(claveMov));

  // 7) Calcular.
  const aInsertar = [];
  const omitidos = { sinBase: 0, entregadorNoComisionable: 0, sinTasaVigente: 0, yaDevengado: 0 };

  for (const p of pres) {
    if (!comisionables.has(p.entregado_por)) { omitidos.entregadorNoComisionable++; continue; }

    const parametros = core.parametrosVigentes(paramRows, p.fecha_practica);
    if (!parametros.tasaComision) { omitidos.sinTasaVigente++; continue; }

    const movs = core.devengosDePractica({
      presupuesto: {
        id: p.id,
        atencionId: atencionPorPres.get(p.id) ?? null,
        precios: (p.datos_completos && p.datos_completos.precios) || {},
        entregadoPor: p.entregado_por,
        fechaEntrega: p.fechaDeCorte,
        fechaPractica: p.fecha_practica,
      },
      participantes: partesPorPres.get(p.id) || [],
      // El recuperador también tiene que ser comisionable: si no, la llamada
      // no genera derecho y la parte se queda donde estaba.
      llamadas: (llamadasPorPres.get(p.id) || []).filter((l) => comisionables.has(l.usuario)),
      parametros,
    });

    if (movs.length === 0) { omitidos.sinBase++; continue; }

    for (const m of movs) {
      if (emitidos.has(claveMov(m))) { omitidos.yaDevengado++; continue; }
      aInsertar.push({ ...m, created_by: 'job_devengo' });
      emitidos.add(claveMov(m));
    }
  }

  const resumen = {
    activo: true,
    desdeRegimen,
    candidatos: pres.length,
    movimientos: aInsertar.length,
    importeTotal: Math.round(aInsertar.reduce((s, m) => s + m.importe, 0) * 100) / 100,
    beneficiarios: [...new Set(aInsertar.map((m) => m.beneficiario))].length,
    conRecupero: aInsertar.filter((m) => m.rol === 'RECUPERADOR').length,
    omitidos,
  };

  if (!write) return { ...resumen, escrito: false, detalle: aInsertar };

  // 8) Escribir. `ignoreDuplicates` contra el UNIQUE: si dos corridas se
  //    pisan, la segunda no paga de nuevo.
  for (let i = 0; i < aInsertar.length; i += 500) {
    const lote = aInsertar.slice(i, i + 500);
    const { error } = await supabase.from('comisiones_movimientos')
      .upsert(lote, { onConflict: 'presupuesto_id,beneficiario,rol,tipo,evento_origen', ignoreDuplicates: true });
    if (error) throw new Error('insert movimientos: ' + error.message);
  }

  return { ...resumen, escrito: true };
}

module.exports = { correrDevengos };
