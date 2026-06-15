// ============================================================
// Alta de empleada faltante: Castillo Romina (Telefonista, ene-mar 2025).
// ============================================================
// No está en la planilla de personal -> registro MÍNIMO (decisión de Paulo).
// Datos ciertos: apellido, nombre, area=Telefonista -> cuenta 4.1.1.08,
//   estado=inactivo (egresó ~mar-2025), fecha_egreso estimada 2025-03-31.
// Datos personales (cuil/dni/fechas) NO disponibles -> placeholder SOLO donde la
//   BD lo exija (NOT NULL). Se intenta primero el set mínimo y se agregan
//   placeholders de a uno según las constraints que devuelva Postgres.
//
// USO:  cd server
//   node scripts/cargar-castillo-romina.cjs           -> DRY-RUN
//   node scripts/cargar-castillo-romina.cjs --write     -> inserta
// Idempotente: si ya existe Castillo Romina, no hace nada.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { supabase, mensajeError } = require('../config/supabase');
const WRITE = process.argv.includes('--write');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Campos ciertos (no fabricados)
const base = {
  apellido: 'Castillo',
  nombre: 'Romina',
  area: 'Telefonista',
  cuenta_contable: '4.1.1.08',
  estado: 'inactivo',
  fecha_egreso: '2025-03-31', // estimada (último mes con sueldo en la minuta)
};

// Placeholders SOLO si la BD los exige (NOT NULL). Marcados como claramente no-reales.
const placeholders = {
  cuil: '00-00000000-0',
  tipo_documento: 'DNI',
  numero_documento: '0',
  fecha_nacimiento: '1900-01-01',
  sexo: 'F', // Romina (deducible); igual es placeholder de campo obligatorio
  fecha_ingreso: '2025-01-01', // estimada (presente ya en enero 2025)
};

(async () => {
  console.log('='.repeat(60));
  console.log(`ALTA Castillo Romina — ${WRITE ? 'MODO ESCRITURA' : 'DRY-RUN'}`);
  console.log('='.repeat(60));

  // Idempotencia
  const { data: existentes } = await supabase.from('empleados').select('id, apellido, nombre');
  const yaEsta = (existentes || []).some(e => norm(`${e.apellido} ${e.nombre}`) === norm('Castillo Romina'));
  if (yaEsta) { console.log('Ya existe Castillo Romina en el maestro. Nada que hacer.'); process.exit(0); }

  let payload = { ...base };
  console.log('Payload base (datos ciertos):', JSON.stringify(payload, null, 2));

  if (!WRITE) {
    console.log('\nDRY-RUN. Para escribir: node scripts/cargar-castillo-romina.cjs --write');
    console.log('(Los placeholders se agregarán solo si la BD los exige por NOT NULL.)');
    process.exit(0);
  }

  // Intento adaptativo: agrega placeholder a la columna que Postgres reporte como NOT NULL.
  const agregados = [];
  for (let intento = 0; intento < 10; intento++) {
    const { data, error } = await supabase.from('empleados').insert(payload).select().single();
    if (!error) {
      console.log('\n-> INSERT OK. id =', data.id);
      if (agregados.length) console.log('   Placeholders agregados (campos NOT NULL sin dato real):', agregados.join(', '));
      console.log('   Empleada:', `${data.apellido}, ${data.nombre} | ${data.area} | ${data.cuenta_contable} | ${data.estado} | egreso ${data.fecha_egreso}`);
      process.exit(0);
    }
    // not-null violation -> identificar columna y poner placeholder
    const m = /null value in column "?([a-z_]+)"?/i.exec(error.message || '') || /column "?([a-z_]+)"? .*not-null/i.exec(error.message || '');
    const col = m && m[1];
    if (col && placeholders[col] !== undefined && payload[col] === undefined) {
      payload[col] = placeholders[col];
      agregados.push(col);
      console.log(`   NOT NULL en "${col}" -> agrego placeholder ${JSON.stringify(placeholders[col])} y reintento.`);
      continue;
    }
    console.log('\n-> ERROR no resuelto:', mensajeError(error));
    console.log('   Payload final:', JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.log('-> Demasiados reintentos, abortando.');
  process.exit(1);
})();
