// ============================================================
// SCRIPT DE DIAGNOSTICO - Modulo Sueldos (Fase 1 + Fase 2 + Fase 3)
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// USO:
//   cd server
//   node scripts/test-fase2.js
//
// QUE VERIFICA:
//   - Conexion a Supabase (SUPABASE_URL / SUPABASE_ANON_KEY desde server/.env)
//   - Existencia y conteo de las 10 tablas del modulo:
//       Fase 1: plan_cuentas, empleados, log_auditoria_sueldos
//       Fase 2: liquidaciones_mes, liquidacion_bloques,
//               liquidacion_lineas_empleado, liquidacion_lineas_concepto
//       Fase 3: f931_declaraciones, f931_adjuntos, conciliacion_diferencias
//   - Bucket Storage sueldos-adjuntos existe y es accesible
//   - Distribucion de empleados por area/estado
//   - Cuentas contables criticas usadas por el modulo (presentes y bien marcadas)
//   - Liquidaciones existentes (estado, fechas de cierre/reapertura)
//   - Bloques por liquidacion (cuantos completos / total)
//   - Declaraciones F.931 cargadas (estado, periodo, totales)
//   - Diferencias de conciliacion (por tipo, justificadas / pendientes)
//   - Ultimas 10 entradas del log de auditoria
//   - Resumen final: OK / advertencias / fallos
//
// NO MODIFICA DATOS. Solo SELECT.
// ============================================================

// Cargar el .env del directorio padre (server/.env)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { supabase, mensajeError } = require('../config/supabase');

// ============================================================
// LOG HELPERS
// ============================================================

const log = console.log;
const ok = (msg) => log('  ✅', msg);
const warn = (msg) => log('  ⚠️ ', msg);
const err = (msg) => log('  ❌', msg);
const info = (msg) => log('  ℹ️ ', msg);
const section = (title) => log('\n=== ' + title + ' ===');

// Contadores globales para el resumen final
const stats = {
  ok: 0,
  warn: 0,
  fail: 0,
  errores: [],
};

function markOk() { stats.ok++; }
function markWarn(msg) { stats.warn++; if (msg) stats.errores.push('WARN: ' + msg); }
function markFail(msg) { stats.fail++; if (msg) stats.errores.push('FAIL: ' + msg); }

// ============================================================
// TESTS
// ============================================================

/**
 * Verifica que una tabla exista y devuelve el conteo de filas.
 * Retorna null si la tabla no existe / hay error.
 */
async function probarTabla(tabla, descripcion) {
  const { count, error } = await supabase
    .from(tabla)
    .select('*', { count: 'exact', head: true });

  if (error) {
    const msg = mensajeError(error);
    err(`${tabla.padEnd(32)} — ${msg} (code: ${error.code || '?'})`);
    markFail(`tabla ${tabla}: ${msg}`);
    return null;
  }
  ok(`${tabla.padEnd(32)} — ${(count ?? 0).toString().padStart(5)} filas  (${descripcion})`);
  markOk();
  return count ?? 0;
}

async function verificarCuentasCriticas() {
  const criticas = [
    { codigo: '1.1.1.01',    desc: 'CAJA',                              imputable: true  },
    { codigo: '1.1.1.03',    desc: 'BANCO SANTANDER RIO',               imputable: true  },
    { codigo: '4.1.1.01',    desc: 'SUELDOS ADMINISTRACION',            imputable: true  },
    { codigo: '4.1.1.02',    desc: 'SUELDOS LIMPIEZA',                  imputable: true  },
    { codigo: '4.1.1.04',    desc: 'CARGAS SOCIALES (AGRUPADORA)',      imputable: false },
    { codigo: '4.1.1.04.01', desc: 'CONTRIB SEGURIDAD SOCIAL',          imputable: true  },
    { codigo: '4.1.1.04.02', desc: 'CONTRIB OBRA SOCIAL',               imputable: true  },
    { codigo: '4.1.1.04.03', desc: 'ART',                               imputable: true  },
    { codigo: '4.1.1.04.04', desc: 'SCVO',                              imputable: true  },
    { codigo: '2.1.2.01',    desc: 'SUELDOS Y JORNALES A PAGAR',        imputable: true  },
    { codigo: '2.1.2.02',    desc: 'CARGAS SOCIALES A PAGAR (AGRUP)',   imputable: false },
    { codigo: '2.1.2.02.01', desc: 'SS A PAGAR',                        imputable: true  },
    { codigo: '2.1.2.02.02', desc: 'OS A PAGAR',                        imputable: true  },
    { codigo: '2.1.2.02.03', desc: 'ART A PAGAR',                       imputable: true  },
    { codigo: '2.1.2.02.04', desc: 'SCVO A PAGAR',                      imputable: true  },
    { codigo: '2.1.2.03',    desc: 'SINDICATO A PAGAR',                 imputable: true  },
  ];

  const codigos = criticas.map((c) => c.codigo);
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('cta_codigo, cta_nombre, imputable, activo')
    .in('cta_codigo', codigos);

  if (error) {
    err(`No se pudo leer plan_cuentas: ${mensajeError(error)}`);
    markFail('plan_cuentas no consultable');
    return;
  }

  const indexada = new Map(data.map((r) => [r.cta_codigo, r]));
  for (const c of criticas) {
    const row = indexada.get(c.codigo);
    if (!row) {
      err(`${c.codigo.padEnd(12)} ${c.desc.padEnd(38)} NO ENCONTRADA`);
      markFail(`cuenta ${c.codigo} no existe`);
      continue;
    }
    const imputableOk = row.imputable === c.imputable;
    const activaOk = row.activo === true;
    if (!imputableOk) {
      warn(`${c.codigo.padEnd(12)} ${c.desc.padEnd(38)} imputable=${row.imputable} esperado ${c.imputable}`);
      markWarn(`${c.codigo} flag imputable inconsistente`);
    } else if (!activaOk) {
      warn(`${c.codigo.padEnd(12)} ${c.desc.padEnd(38)} INACTIVA`);
      markWarn(`${c.codigo} esta marcada como inactiva`);
    } else {
      ok(`${c.codigo.padEnd(12)} ${row.cta_nombre.padEnd(38)} ${row.imputable ? '[imputable]' : '[agrupadora]'}`);
      markOk();
    }
  }
}

async function verificarEmpleados(total) {
  if (!total) {
    warn('Aun no hay empleados cargados (esperando datos administrativos).');
    markWarn('empleados vacios');
    return;
  }

  const { data, error } = await supabase
    .from('empleados')
    .select('area, estado');

  if (error) {
    err(`Error leyendo empleados: ${mensajeError(error)}`);
    markFail('empleados no consultables');
    return;
  }

  const conteo = {};
  for (const e of data) {
    const k = `${e.area} (${e.estado})`;
    conteo[k] = (conteo[k] || 0) + 1;
  }
  const sorted = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    info(`${k.padEnd(36)} ${v}`);
  }
  ok(`Total empleados: ${total}`);
  markOk();
}

async function verificarLiquidaciones(total) {
  if (!total) {
    warn('Aun no hay liquidaciones (iniciar primer mes desde la UI).');
    markWarn('liquidaciones_mes vacia');
    return;
  }

  const { data: liqs, error } = await supabase
    .from('liquidaciones_mes')
    .select('id, anio, mes, estado, created_at, cerrado_at, reabierto_at, reapertura_justificacion')
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })
    .limit(20);

  if (error) {
    err(`Error leyendo liquidaciones_mes: ${mensajeError(error)}`);
    markFail('liquidaciones_mes no consultable');
    return;
  }

  log('  (mostrando hasta las 20 mas recientes)');
  for (const l of liqs) {
    const periodo = `${l.anio}-${String(l.mes).padStart(2, '0')}`;
    const cerrado = l.cerrado_at ? `  CERRADO ${new Date(l.cerrado_at).toLocaleDateString('es-AR')}` : '';
    const reabierto = l.reabierto_at ? `  REABIERTO ${new Date(l.reabierto_at).toLocaleDateString('es-AR')}` : '';
    log(`  ${periodo}  ->  ${l.estado.padEnd(20)}${cerrado}${reabierto}`);
    if (l.reapertura_justificacion) {
      log(`           justif.: "${l.reapertura_justificacion.substring(0, 80)}${l.reapertura_justificacion.length > 80 ? '...' : ''}"`);
    }
  }
  markOk();

  // Bloques por liquidacion
  log('');
  const { data: bloques, error: blqErr } = await supabase
    .from('liquidacion_bloques')
    .select('liquidacion_id, tipo, completo, total_declarado');

  if (blqErr) {
    err(`Error leyendo liquidacion_bloques: ${mensajeError(blqErr)}`);
    markFail('liquidacion_bloques no consultable');
    return;
  }

  const grouped = {};
  for (const b of (bloques || [])) {
    if (!grouped[b.liquidacion_id]) grouped[b.liquidacion_id] = [];
    grouped[b.liquidacion_id].push(b);
  }

  for (const l of liqs) {
    const bs = grouped[l.id] || [];
    const completos = bs.filter((b) => b.completo).length;
    const periodo = `${l.anio}-${String(l.mes).padStart(2, '0')}`;
    const tipos = bs.map((b) => b.tipo).join(', ');
    info(`${periodo}  ${completos}/${bs.length} bloques completos  [${tipos}]`);
  }
}

async function verificarLineas() {
  const tablas = [
    { nombre: 'liquidacion_lineas_empleado', col: 'monto_neto_cargado' },
    { nombre: 'liquidacion_lineas_concepto', col: 'monto' },
  ];

  for (const t of tablas) {
    const { data, error } = await supabase
      .from(t.nombre)
      .select(t.col);
    if (error) {
      err(`Error leyendo ${t.nombre}: ${mensajeError(error)}`);
      markFail(`${t.nombre} no consultable`);
      continue;
    }
    const cant = data.length;
    const total = data.reduce((s, r) => s + Number(r[t.col] || 0), 0);
    info(`${t.nombre.padEnd(32)} ${cant.toString().padStart(4)} lineas  Total: $${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
  }
}

async function verificarBucketStorage() {
  try {
    const { data, error } = await supabase.storage.getBucket('sueldos-adjuntos');
    if (error) {
      err(`Bucket sueldos-adjuntos no accesible: ${error.message}`);
      markFail('bucket sueldos-adjuntos no consultable');
      return;
    }
    if (!data) {
      err('Bucket sueldos-adjuntos no encontrado');
      markFail('bucket sueldos-adjuntos no existe');
      return;
    }
    ok(`Bucket sueldos-adjuntos: existe (public=${data.public}, max_size=${data.file_size_limit || '?'} bytes)`);
    markOk();

    // Intentar listar archivos (puede estar vacio)
    const { data: archivos } = await supabase.storage.from('sueldos-adjuntos').list('', { limit: 5 });
    if (archivos && archivos.length > 0) {
      info(`Archivos en el bucket (top 5): ${archivos.length}`);
      for (const a of archivos) {
        info(`  ${a.name}`);
      }
    } else {
      info('Bucket vacio (todavia no se subio ningun PDF)');
    }
  } catch (e) {
    err(`Error verificando bucket: ${e.message}`);
    markFail('bucket verificacion fallo');
  }
}

async function verificarF931(total) {
  if (!total) {
    warn('Aun no hay declaraciones F.931 cargadas.');
    markWarn('f931_declaraciones vacia');
    return;
  }
  const { data, error } = await supabase
    .from('f931_declaraciones')
    .select('id, cuit, anio, mes, estado, parecio_vep, total_a_depositar, confirmado_at, parseado_at')
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })
    .limit(20);

  if (error) {
    err(`Error leyendo f931_declaraciones: ${mensajeError(error)}`);
    markFail('f931_declaraciones no consultable');
    return;
  }

  for (const d of data) {
    const periodo = `${d.anio}-${String(d.mes).padStart(2, '0')}`;
    const total = d.total_a_depositar !== null
      ? `$${Number(d.total_a_depositar).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
      : '(sin total)';
    const vep = d.parecio_vep ? ' [VEP]' : '';
    const confirm = d.confirmado_at ? `  conf:${new Date(d.confirmado_at).toLocaleDateString('es-AR')}` : '';
    log(`  ${periodo}  ${d.estado.padEnd(28)}  ${total.padStart(20)}${vep}${confirm}`);
  }
  markOk();
}

async function verificarConciliacion(total) {
  if (!total) {
    warn('Aun no hay diferencias de conciliacion (correr "Recalcular" en el TabConciliacion del mes).');
    markWarn('conciliacion_diferencias vacia');
    return;
  }
  const { data, error } = await supabase
    .from('conciliacion_diferencias')
    .select('liquidacion_id, bloque_tipo, concepto_codigo, tipo_diferencia, justificada, diferencia')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    err(`Error leyendo conciliacion_diferencias: ${mensajeError(error)}`);
    markFail('conciliacion_diferencias no consultable');
    return;
  }

  // Agrupar por tipo
  const porTipo = {};
  for (const d of data) {
    const t = d.tipo_diferencia;
    if (!porTipo[t]) porTipo[t] = { count: 0, justificadas: 0, monto: 0 };
    porTipo[t].count++;
    if (d.justificada) porTipo[t].justificadas++;
    porTipo[t].monto += Math.abs(Number(d.diferencia || 0));
  }

  for (const [tipo, s] of Object.entries(porTipo)) {
    info(`${tipo.padEnd(32)} ${s.count.toString().padStart(3)}  (${s.justificadas} just.)  $${s.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
  }
  markOk();
}

async function verificarLogAuditoria() {
  const { data, error } = await supabase
    .from('log_auditoria_sueldos')
    .select('accion, entidad, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    err(`Error leyendo log_auditoria_sueldos: ${mensajeError(error)}`);
    markFail('log_auditoria_sueldos no consultable');
    return;
  }

  if (!data || data.length === 0) {
    warn('Sin entradas todavia en el log de auditoria.');
    markWarn('log vacio');
    return;
  }

  for (const r of data) {
    const fecha = new Date(r.created_at).toLocaleString('es-AR');
    log(`  ${fecha.padEnd(22)} ${r.accion.padEnd(30)} ${r.entidad}`);
  }
  markOk();
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log('\n\u{1F50D} Diagnostico Sueldos — Fase 1 + Fase 2');
  log('=====================================================');
  log(`URL: ${process.env.SUPABASE_URL || '(NO CONFIGURADA)'}`);
  log(`Key: ${process.env.SUPABASE_ANON_KEY ? '(presente)' : '(FALTA — revisar server/.env)'}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    err('Faltan variables de entorno. Abortando.');
    process.exit(1);
  }

  // Fase 1
  section('Fase 1 — Tablas');
  const f1Cuentas = await probarTabla('plan_cuentas', 'Plan contable (esperado: 134 filas)');
  const f1Empleados = await probarTabla('empleados', 'Maestro de empleados');
  await probarTabla('log_auditoria_sueldos', 'Log de auditoria del modulo');

  // Fase 2
  section('Fase 2 — Tablas (liquidaciones)');
  const f2Liqs = await probarTabla('liquidaciones_mes', 'Liquidaciones mensuales');
  await probarTabla('liquidacion_bloques', 'Bloques de minuta');
  await probarTabla('liquidacion_lineas_empleado', 'Lineas por empleado');
  await probarTabla('liquidacion_lineas_concepto', 'Lineas por concepto');

  // Fase 3
  section('Fase 3 — Tablas (F.931 y conciliacion)');
  const f3Decls = await probarTabla('f931_declaraciones', 'Declaraciones F.931');
  await probarTabla('f931_adjuntos', 'PDFs subidos al bucket');
  const f3Difs = await probarTabla('conciliacion_diferencias', 'Diferencias minuta vs F.931');

  // Fase 3 — Bucket Storage
  section('Fase 3 — Storage');
  await verificarBucketStorage();

  // Cuentas criticas
  if (f1Cuentas !== null) {
    section('Plan de cuentas — cuentas criticas del modulo Sueldos');
    await verificarCuentasCriticas();
  }

  // Empleados
  if (f1Empleados !== null) {
    section('Empleados — distribucion por area/estado');
    await verificarEmpleados(f1Empleados);
  }

  // Liquidaciones
  if (f2Liqs !== null) {
    section('Liquidaciones — estado actual');
    await verificarLiquidaciones(f2Liqs);
  }

  // F.931 declaraciones
  if (f3Decls !== null) {
    section('F.931 — declaraciones cargadas');
    await verificarF931(f3Decls);
  }

  // Conciliacion
  if (f3Difs !== null) {
    section('Conciliacion — diferencias');
    await verificarConciliacion(f3Difs);
  }

  // Lineas
  section('Lineas cargadas — resumen');
  await verificarLineas();

  // Log
  section('Log de auditoria — ultimas 10 acciones');
  await verificarLogAuditoria();

  // Resumen final
  section('Resumen');
  log(`  OK:           ${stats.ok}`);
  log(`  Advertencias: ${stats.warn}`);
  log(`  Fallos:       ${stats.fail}`);

  if (stats.errores.length > 0) {
    log('');
    log('Detalle:');
    stats.errores.forEach((e) => log('  - ' + e));
  }

  if (stats.fail > 0) {
    log('\n❌ Diagnostico con fallos. Revisar arriba.\n');
    process.exit(2);
  } else if (stats.warn > 0) {
    log('\n⚠️  Diagnostico OK con advertencias.\n');
    process.exit(0);
  } else {
    log('\n✅ Diagnostico OK — todo en orden.\n');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('\n❌ Error fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
