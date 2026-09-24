// ============================================================
// RECUPERAR LOS ALQUILERES QUE QUEDARON EN "VARIABLE"
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/recuperar-alquileres-2025.cjs          (simulacro)
//   node scripts/recuperar-alquileres-2025.cjs --write
//
// QUÉ PASÓ
// --------
// El control de categorías mensuales (commit 55042bd) avisó que de enero a
// agosto de 2025 no había alquiler en los costos fijos. No faltaba el
// comprobante: estaba cargado y clasificado como 'variable', que no entra al
// estado de resultados. Nueve meses de alquiler pagándose y sin contarse.
//
// La causa es la de siempre con este proveedor: Mercado factura ALQUILER y
// HONORARIOS con la misma razón social, así que cualquier regla por proveedor
// le aplica la clasificación dominante —honorarios— y se lleva puesto el
// alquiler. Está documentado en `corregir-clasificacion-medicos.cjs` desde
// septiembre y lo volvimos a pisar.
//
// CÓMO SE IDENTIFICAN, ENTONCES
// -----------------------------
// Por COMPROBANTE, igual que aquel script, y no por proveedor ni por importe
// suelto. La firma del alquiler es inconfundible cuando se ordenan las FC de
// Mercado por número:
//
//   · UNA factura a principio de cada mes, sin saltearse ninguno
//   · importe FIJO dentro de cada período de ajuste
//   · numeración correlativa, intercalada con las FC de honorarios
//
//   nov-24 a feb-25 ...... $884.838     FC 591, 603, 608
//   mar-25 a ago-25 ...... $1.194.519   FC 612, 614, 619, 623, 628, 638
//   sep-25 en adelante ... $2.843.500   FC 642, 644, 652  (ya estaban bien)
//
// Ninguna otra FC de Mercado se repite mes a mes con el mismo importe: las de
// honorarios son todas distintas (FC 626 $1.833.920, FC 631 $1.395.026...).
//
// Y POR LAS DUDAS, se verifica el importe antes de escribir: si una FC de la
// lista no vale lo que tiene que valer, NO se toca y se reporta. Una lista
// escrita a mano también se puede equivocar.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');

const WRITE = process.argv.includes('--write');
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
);
const ars = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });

const CAT_ALQUILER = '33a3e1c3-6ff5-4fe7-9a1a-e9141bcbc75b';

/** Las FC del alquiler con el importe que TIENE que tener cada una. */
const ALQUILERES = [
  { fc: 591, monto: 884838,  periodo: 'nov-2024' },
  { fc: 603, monto: 884838,  periodo: 'ene-2025' },
  { fc: 608, monto: 884838,  periodo: 'feb-2025' },
  { fc: 612, monto: 1194519, periodo: 'mar-2025' },
  { fc: 614, monto: 1194519, periodo: 'abr-2025' },
  { fc: 619, monto: 1194519, periodo: 'may-2025' },
  { fc: 623, monto: 1194519, periodo: 'jun-2025' },
  { fc: 628, monto: 1194519, periodo: 'jul-2025' },
  { fc: 638, monto: 1194519, periodo: 'ago-2025' },
];

const numeroFC = (desc) => {
  const m = String(desc || '').toUpperCase().match(/FC\s*0*(\d+)/);
  return m ? Number(m[1]) : null;
};

(async () => {
  console.log(`Recuperar alquileres · ${WRITE ? 'ESCRIBE' : 'SIMULACRO (no escribe)'}`);
  console.log('');

  const { data, error } = await sb
    .from('erogaciones_geclisa')
    .select('fuente, id_geclisa, anio, mes, fecha, monto, descripcion, proveedor_nombre')
    .ilike('proveedor_nombre', '%MERCADO JORGE%')
    .order('fuente').order('id_geclisa');
  if (error) throw new Error(error.message);

  const porFC = new Map();
  for (const e of data) {
    const fc = numeroFC(e.descripcion);
    if (fc !== null) porFC.set(fc, e);
  }

  const aplicar = [];
  const problemas = [];
  for (const a of ALQUILERES) {
    const e = porFC.get(a.fc);
    if (!e) { problemas.push(`FC ${a.fc} (${a.periodo}): no está en el espejo`); continue; }
    const monto = Math.round(Number(e.monto) || 0);
    if (monto !== a.monto) {
      problemas.push(`FC ${a.fc} (${a.periodo}): vale ${ars(monto)} y se esperaba ${ars(a.monto)} — NO se toca`);
      continue;
    }
    aplicar.push({ ...a, e });
  }

  console.log('A reclasificar como fijo / Alquiler:');
  for (const x of aplicar) {
    console.log(`  FC ${String(x.fc).padStart(3)} · ${x.periodo} · ${String(x.e.fecha).slice(0, 10)} · ${ars(x.e.monto)}`);
  }
  console.log(`  TOTAL: ${aplicar.length} comprobantes · ${ars(aplicar.reduce((s, x) => s + Number(x.e.monto), 0))}`);

  if (problemas.length) {
    console.log('');
    console.log('NO SE TOCAN:');
    for (const p of problemas) console.log('  ' + p);
  }

  if (!WRITE) {
    console.log('');
    console.log('SIMULACRO: no se escribió nada. Agregá --write para aplicar.');
    return;
  }

  console.log('');
  const ahora = new Date().toISOString();
  let n = 0;
  for (const x of aplicar) {
    const { error: e } = await sb.from('erogaciones_clasificacion').upsert({
      fuente: x.e.fuente,
      id_geclisa: x.e.id_geclisa,
      anio: x.e.anio,
      mes: x.e.mes,
      fecha: x.e.fecha,
      descripcion: x.e.descripcion,
      proveedor_nombre: x.e.proveedor_nombre,
      monto: x.e.monto,
      tipo_costo: 'fijo',
      es_costo_fijo: true,
      categoria_costo_fijo_id: CAT_ALQUILER,
      subcategoria_variable: null,
      // NO es una sugerencia: el comprobante está identificado uno por uno.
      auto_clasificado: false,
      clasificado_por: 'recuperacion-alquileres-2026-09-24',
      clasificado_at: ahora,
    }, { onConflict: 'fuente,id_geclisa' });
    if (e) throw new Error(`FC ${x.fc}: ${e.message}`);
    n++;
  }
  console.log(`LISTO: ${n} alquileres recuperados.`);
  console.log('Suman al costo fijo de sus meses, que es donde tenían que estar desde el principio.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
