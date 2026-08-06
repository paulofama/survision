// ============================================================================
// Ingesta idempotente del extracto a Supabase. Isomórfico (navegador + Node):
// recibe un cliente supabase, los bytes del archivo y las reglas.
//   - navegador: cliente anon+JWT (subida manual)  → RLS authenticated
//   - CLI diario: cliente service_role             → bypassa RLS
// Una sola implementación del pipeline (parser + categorización + upsert).
//
// Idempotencia: se consultan los hash_dedup ya existentes de la cuenta y solo
// se insertan los nuevos. Re-importar el mismo archivo N veces no duplica nada
// y NO toca el estado de conciliación de los movimientos ya cargados.
// ============================================================================

import { parseExtracto } from './bancoExtractoParser.mjs';
import { categorizar } from './categorizar.mjs';

async function hashesExistentes(supabase, cuentaId, hashes) {
  const set = new Set();
  for (let i = 0; i < hashes.length; i += 200) {
    const chunk = hashes.slice(i, i + 200);
    const { data, error } = await supabase
      .from('banco_movimientos').select('hash_dedup')
      .eq('cuenta_id', cuentaId).in('hash_dedup', chunk);
    if (error) throw new Error('consulta hashes: ' + error.message);
    for (const r of data || []) set.add(r.hash_dedup);
  }
  return set;
}

/**
 * @param {object} p
 * @param {any} p.supabase  cliente supabase-js
 * @param {string} p.cuentaId  uuid de banco_cuentas
 * @param {string} p.nroCuenta  nº de cuenta (para el hash/clave)
 * @param {Uint8Array|ArrayBuffer} p.bytes  archivo .xlsx
 * @param {Array} p.reglas  filas de banco_reglas
 * @param {'manual'|'daemon'} [p.origen]
 * @param {string} [p.usuario]
 * @param {string} [p.archivoNombre]
 * @param {string} [p.archivoHash]
 * @param {boolean} [p.write=true]  false = preview (no escribe)
 */
export async function ingestarExtracto(p) {
  const { supabase, cuentaId, nroCuenta, bytes, reglas } = p;
  const origen = p.origen || 'manual';
  const write = p.write !== false;

  const parsed = parseExtracto(bytes, { nroCuenta });

  // --- Rechazo (cadena de saldos rota / archivo inválido): no se sube nada ---
  if (!parsed.ok) {
    const impRow = {
      cuenta_id: cuentaId, estado: 'rechazada', motivo: parsed.motivoRechazo,
      origen, usuario: p.usuario || null, archivo_nombre: p.archivoNombre || null, archivo_hash: p.archivoHash || null,
      periodo_desde: parsed.resumen?.periodoDesde || null, periodo_hasta: parsed.resumen?.periodoHasta || null,
      saldo_inicial: parsed.resumen?.saldoInicial ?? null, saldo_final: parsed.resumen?.saldoFinal ?? null,
    };
    let importacion = null;
    if (write) {
      const { data, error } = await supabase.from('banco_importaciones').insert(impRow).select().single();
      if (error) throw new Error('importacion rechazada: ' + error.message);
      importacion = data;
    }
    return { ok: false, motivo: parsed.motivoRechazo, resumen: parsed.resumen, importacion, nuevos: 0, duplicados: 0 };
  }

  // --- Categorización + estado inicial ---
  const movs = parsed.movimientos.map((m) => {
    const c = categorizar(m, reglas);
    return { ...m, categoria: c.categoria, estado: c.marcaSoloBanco ? 'solo_banco' : 'pendiente' };
  });
  // Detalle impositivo: autoritativo desde la hoja de impuestos (parser).
  const impositivo = parsed.resumen.impositivo;

  // --- Idempotencia: separar nuevos de ya cargados ---
  const existentes = await hashesExistentes(supabase, cuentaId, movs.map((m) => m.hashDedup));
  const nuevos = movs.filter((m) => !existentes.has(m.hashDedup));
  const duplicados = movs.length - nuevos.length;

  const resultadoBase = {
    ok: true, resumen: parsed.resumen, impositivo,
    nuevos: nuevos.length, duplicados, cantMovimientos: movs.length,
    impositivoRaw: parsed.impositivoRaw,
  };
  if (!write) return { ...resultadoBase, preview: true };

  // --- Registrar la importación ---
  const impRow = {
    cuenta_id: cuentaId, estado: 'ok', origen, usuario: p.usuario || null,
    archivo_nombre: p.archivoNombre || null, archivo_hash: p.archivoHash || null,
    periodo_desde: parsed.resumen.periodoDesde, periodo_hasta: parsed.resumen.periodoHasta,
    saldo_inicial: parsed.resumen.saldoInicial, saldo_final: parsed.resumen.saldoFinal,
    total_creditos: parsed.resumen.totalCreditos, total_debitos: parsed.resumen.totalDebitos,
    cant_movimientos: parsed.resumen.cantMovimientos, cant_nuevos: nuevos.length, cant_duplicados: duplicados,
    detalle_impositivo: impositivo,
  };
  const { data: imp, error: impErr } = await supabase.from('banco_importaciones').insert(impRow).select().single();
  if (impErr) throw new Error('importacion: ' + impErr.message);

  // --- Insertar SOLO los nuevos (upsert defensivo por hash) ---
  const filas = nuevos.map((m) => ({
    hash_dedup: m.hashDedup, cuenta_id: cuentaId, fecha: m.fecha, anio: m.anio, mes: m.mes,
    posicion_dia: m.posicionDia, nro_comprobante: m.nroComprobante, concepto: m.concepto,
    descripcion: m.descripcion, contraparte_nombre: m.contraparteNombre, contraparte_cuit: m.contraparteCuit,
    importe: m.importe, saldo_resultante: m.saldoResultante, categoria: m.categoria,
    estado_conciliacion: m.estado, importacion_id: imp.id,
  }));
  let insertados = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const { error } = await supabase.from('banco_movimientos')
      .upsert(lote, { onConflict: 'hash_dedup', ignoreDuplicates: true });
    if (error) throw new Error('insert movimientos: ' + error.message);
    insertados += lote.length;
  }

  return { ...resultadoBase, importacion: imp, insertados };
}
