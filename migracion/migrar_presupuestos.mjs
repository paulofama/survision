import { createClient } from '@supabase/supabase-js';

// ========== CONFIGURACIÓN ==========
// ORIGEN - Presupuestador v50
const ORIGEN = createClient(
  'https://ecraryyvngnyxusdggvj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjcmFyeXl2bmdueXh1c2RnZ3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0OTA1MTIsImV4cCI6MjA3NDA2NjUxMn0.maI7EoUD8i33V2Sxmi_RQtyd1rJHcvtRQvdHy-RYKAw'
);

// DESTINO - Sistema de Costos Mercado
const DESTINO = createClient(
  'https://eawtvwuayahbldzjzeer.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhd3R2d3VheWFoYmxkemp6ZWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODc1OTksImV4cCI6MjA3OTU2MzU5OX0.Fo3kChA3Ozv3XGW19DimlZ_8uH-v6LWd2SvTXZfkIaE'
);

const BATCH_SIZE = 50;

// ========== FUNCIONES ==========

async function exportarPresupuestos() {
  console.log('📥 Exportando presupuestos del origen...');
  let todos = [];
  let offset = 0;
  
  while (true) {
    const { data, error } = await ORIGEN
      .from('presupuestos')
      .select('*')
      .order('fecha_creacion', { ascending: true })
      .range(offset, offset + 999);
    
    if (error) {
      console.error('❌ Error:', error.message);
      if (error.message.includes('permission') || error.code === 'PGRST301') {
        console.error('\n⚠️  RLS activo. Reemplazá la anon key del ORIGEN por service_role key.');
      }
      return null;
    }
    
    if (!data || data.length === 0) break;
    todos = todos.concat(data);
    offset += data.length;
    console.log(`   ... ${todos.length} registros`);
  }
  
  console.log(`✅ ${todos.length} presupuestos exportados\n`);
  return todos;
}

async function exportarSecuencias() {
  console.log('📥 Exportando secuencias...');
  const { data, error } = await ORIGEN.from('secuencias').select('*');
  if (error) {
    console.log('⚠️  Secuencias no accesible:', error.message);
    return [];
  }
  console.log(`✅ ${data.length} secuencias exportadas\n`);
  return data;
}

async function importarPresupuestos(presupuestos) {
  if (!presupuestos?.length) { console.log('⚠️  Sin presupuestos'); return; }
  
  console.log(`📤 Importando ${presupuestos.length} presupuestos...`);
  let ok = 0, fail = 0;
  
  for (let i = 0; i < presupuestos.length; i += BATCH_SIZE) {
    const batch = presupuestos.slice(i, i + BATCH_SIZE).map(p => ({
      numero_presupuesto: p.numero_presupuesto,
      fecha_creacion: p.fecha_creacion,
      fecha_modificacion: p.fecha_modificacion,
      paciente_nombre: p.paciente_nombre,
      paciente_apellido: p.paciente_apellido,
      paciente_documento: p.paciente_documento,
      prestacion_codigo: p.prestacion_codigo,
      prestacion_descripcion: p.prestacion_descripcion,
      cirujano: p.cirujano,
      administrativa: p.administrativa,
      desarrollado_por: p.desarrollado_por,
      monto_usd: p.monto_usd,
      monto_ars: p.monto_ars,
      total_final: p.total_final,
      estado: p.estado || 'borrador',
      fecha_entrega: p.fecha_entrega,
      fecha_practica: p.fecha_practica,
      fecha_realizacion: p.fecha_realizacion,
      datos_completos: p.datos_completos || {},
      pdf_url: p.pdf_url
    }));
    
    const { data, error } = await DESTINO
      .from('presupuestos')
      .upsert(batch, { onConflict: 'numero_presupuesto', ignoreDuplicates: false })
      .select('numero_presupuesto');
    
    if (error) { console.error(`   ❌ Batch ${Math.floor(i/BATCH_SIZE)+1}:`, error.message); fail += batch.length; }
    else { ok += data.length; }
    
    process.stdout.write(`\r   ${Math.min(i+BATCH_SIZE, presupuestos.length)}/${presupuestos.length}`);
  }
  
  console.log(`\n✅ ${ok} importados, ${fail} errores\n`);
}

async function importarSecuencias(secuencias) {
  if (!secuencias?.length) { console.log('⚠️  Sin secuencias'); return; }
  
  console.log(`📤 Importando ${secuencias.length} secuencias...`);
  const { error } = await DESTINO
    .from('secuencias')
    .upsert(secuencias.map(s => ({ año: s.año, ultimo_numero: s.ultimo_numero })), { onConflict: 'año' });
  
  if (error) console.error('❌', error.message);
  else console.log('✅ Secuencias importadas\n');
}

async function verificar() {
  console.log('🔍 Verificación final:\n');
  
  const { count: c1 } = await DESTINO.from('presupuestos').select('*', { count: 'exact', head: true });
  const { data: s1 } = await DESTINO.from('secuencias').select('*');
  const { count: c2 } = await DESTINO.from('prestaciones').select('*', { count: 'exact', head: true });
  const { count: c3 } = await DESTINO.from('agrupaciones').select('*', { count: 'exact', head: true });
  
  console.log(`   📋 Presupuestos: ${c1 ?? '?'}`);
  console.log(`   🔢 Secuencias: ${JSON.stringify(s1 ?? [])}`);
  console.log(`   💊 Prestaciones: ${c2 ?? '?'}`);
  console.log(`   📂 Agrupaciones: ${c3 ?? '?'}`);
  
  const { data: ultimos } = await DESTINO
    .from('presupuestos')
    .select('numero_presupuesto, paciente_apellido, estado, total_final')
    .order('fecha_creacion', { ascending: false })
    .limit(3);
  
  if (ultimos?.length) {
    console.log('\n   Últimos 3:');
    ultimos.forEach(p => console.log(`   - ${p.numero_presupuesto} | ${p.paciente_apellido} | ${p.estado} | $${p.total_final}`));
  }
  
  console.log('\n✅ Migración completada');
}

// ========== MAIN ==========
console.log('╔═══════════════════════════════════════════╗');
console.log('║   MIGRACIÓN PRESUPUESTADOR → DESTINO      ║');
console.log('╚═══════════════════════════════════════════╝\n');

const presupuestos = await exportarPresupuestos();
const secuencias = await exportarSecuencias();

if (!presupuestos) {
  console.log('\n❌ Falló la exportación. Verificar credenciales/RLS.');
  process.exit(1);
}

await importarPresupuestos(presupuestos);
await importarSecuencias(secuencias);
await verificar();
