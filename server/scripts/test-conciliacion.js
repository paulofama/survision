// ============================================================
// SCRIPT DE PRUEBA - Engine de conciliacion
// ============================================================
//
// Usa los montos reales del F.931 122025 (extraidos en el script
// previo) y simula 4 escenarios de minuta para validar el engine:
//   1. Minuta perfecta (cuadra exacto)            -> 0 diferencias
//   2. Minuta con redondeos chicos (<$1)          -> AUTO_REDONDEO
//   3. Minuta con error material en CONTRIB_SS    -> MATERIAL_RESIDUAL
//   4. Minuta con sindicato cargado               -> AUTO_SINDICATO_NO_F931
// ============================================================

const { conciliar } = require('../services/conciliacionEngine');

// Montos del F.931 122025 (validados con el parser real)
const f931_122025 = {
  aporte_ss_301:  1680562.30,
  aporte_os_302:  480935.33,
  contrib_ss_351: 446925.82,
  contrib_os_352: 961870.87,
  art:            330648.42,
  scvo:           3012.12,
};

// Helper: arma una LiquidacionMesCompleta simulada con montos en SS y sindicato
function armarLiqSimulada(montosSS, montoSind) {
  return {
    id: 'liq-test',
    anio: 2025,
    mes: 12,
    bloques: [
      {
        id: 'blq-ss',
        tipo: 'seguridad_social',
        lineas_empleado: [],
        lineas_concepto: Object.entries(montosSS).map(([codigo, monto]) => ({
          id: `linea-${codigo}`,
          concepto_codigo: codigo,
          monto,
        })),
      },
      {
        id: 'blq-sind',
        tipo: 'sindicato',
        lineas_empleado: [],
        lineas_concepto: montoSind > 0 ? [
          { id: 'linea-sind', concepto_codigo: 'SINDICATO', monto: montoSind }
        ] : [],
      },
    ],
  };
}

function imprimirResultado(titulo, res) {
  console.log('\n' + '='.repeat(70));
  console.log(titulo);
  console.log('='.repeat(70));
  console.log(`Diferencias: ${res.diferencias.length}`);
  for (const d of res.diferencias) {
    const dif = d.monto_minuta - d.monto_f931;
    console.log(`  ${d.bloque_tipo.padEnd(20)} ${(d.concepto_codigo || '').padEnd(15)} M=${d.monto_minuta.toFixed(2).padStart(12)}  F=${d.monto_f931.toFixed(2).padStart(12)}  dif=${dif.toFixed(2).padStart(10)}  [${d.tipo_diferencia}] ${d.justificada ? 'AUTO' : 'PENDIENTE'}`);
    if (d.justificacion) {
      console.log(`    justif: ${d.justificacion}`);
    }
  }
  console.log(`Resumen:`, res.resumen);
}

// ---- Escenario 1: minuta perfecta ----
{
  const liq = armarLiqSimulada({
    APORTE_SS:  1680562.30,
    CONTRIB_SS: 446925.82,
    APORTE_OS:  480935.33,
    CONTRIB_OS: 961870.87,
    ART:        330648.42,
    SCVO:       3012.12,
  }, 0);
  imprimirResultado('ESCENARIO 1: Minuta perfecta (sin sindicato)', conciliar(liq, f931_122025));
}

// ---- Escenario 2: redondeos chicos ----
{
  const liq = armarLiqSimulada({
    APORTE_SS:  1680562.50,   // +0.20
    CONTRIB_SS: 446925.82,    // exacto
    APORTE_OS:  480935.00,    // -0.33
    CONTRIB_OS: 961870.87,
    ART:        330648.42,
    SCVO:       3012.12,
  }, 0);
  imprimirResultado('ESCENARIO 2: Minuta con redondeos chicos (<$1)', conciliar(liq, f931_122025));
}

// ---- Escenario 3: error material en CONTRIB_SS ----
{
  const liq = armarLiqSimulada({
    APORTE_SS:  1680562.30,
    CONTRIB_SS: 450000.00,    // +3074 vs F.931 — material
    APORTE_OS:  480935.33,
    CONTRIB_OS: 961870.87,
    ART:        330648.42,
    SCVO:       3012.12,
  }, 0);
  imprimirResultado('ESCENARIO 3: Error material en CONTRIB_SS (+$3074)', conciliar(liq, f931_122025));
}

// ---- Escenario 4: sindicato cargado ----
{
  const liq = armarLiqSimulada({
    APORTE_SS:  1680562.30,
    CONTRIB_SS: 446925.82,
    APORTE_OS:  480935.33,
    CONTRIB_OS: 961870.87,
    ART:        330648.42,
    SCVO:       3012.12,
  }, 95000);  // sindicato 95k
  imprimirResultado('ESCENARIO 4: Minuta perfecta + sindicato $95.000', conciliar(liq, f931_122025));
}

// ---- Escenario 5: minuta vacia ----
{
  const liq = armarLiqSimulada({}, 0);
  imprimirResultado('ESCENARIO 5: Minuta sin cargar nada (todo en 0 vs F.931 con montos)', conciliar(liq, f931_122025));
}

console.log('\n✅ Pruebas completadas.');
