// ============================================================
// Dos criterios para la serie de erogaciones: pagado vs devengado
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// USO:
//   cd server
//   node scripts/comparar-criterio-erogaciones.cjs
//
// SÓLO LEE. No escribe una fila ni en GECLISA ni en Supabase.
//
// POR QUÉ EXISTE
// --------------
// El extractor de erogaciones trae de `MovProv` únicamente los comprobantes
// con `TComp_Signo = -1` — Orden de Pago y Nota de Crédito. O sea: la serie
// mide PAGOS, no gastos devengados. Es una decisión deliberada y correcta,
// porque factura y orden de pago conviven en la tabla y sumar las dos
// duplicaría.
//
// El problema apareció el 25/09/2026 buscando el alquiler de 2024: hasta
// septiembre de ese año el instituto registraba con "Factura Proveedor"
// (signo +1) y casi no emitía órdenes de pago. Desde octubre-2024 empezó a
// usar Orden de Pago de forma sistemática. Resultado: los primeros nueve
// meses de 2024 llegan al espejo casi vacíos —costos fijos de $0 a $111.640
// por mes contra $10-17 M en 2025— y el comparativo interanual no se
// sostiene para ese tramo.
//
// Este script pone los dos criterios al lado para 2025 y 2026, que son los
// años donde hay datos completos de las dos formas, así la decisión se toma
// viendo cuánto se mueve y no a ciegas.
//
// LO QUE HAY QUE MIRAR
// --------------------
// 1. Cuánto cambia el total por mes.
// 2. El riesgo de DUPLICAR bajo el criterio devengado: los pagos a
//    proveedores que salen por CAJA (MovValoresEnca) ya están contados, y la
//    factura de ese mismo gasto se contaría de nuevo. Ese número está abajo.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const db = require('../config/database');

const q = async (sql) => (await db.executeQuery(sql)).recordset;
const ars = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  .format(Number(n) || 0);
const MESES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const DESDE = '2024-01-01';
const HASTA = '2026-12-31';

// Los AJUSTES de cuenta no son un gasto: son regularizaciones contables.
// Sin este filtro el criterio devengado se rompe solo — el 31/12/2025 hay un
// único asiento "Ajuste Gral. Caja Positivo / REGULARIZACION HISTORICA" por
// $356.214.943, sin proveedor, que por sí solo multiplica por diez el mes.
// El criterio actual (pagado) no los ve porque son de signo +1.
const SIN_AJUSTES = `AND tc.TComp_Nombre NOT LIKE '%Ajuste%'`;

(async () => {
  // ---- MovProv, separado por signo ----
  const prov = await q(`
    SELECT YEAR(mp.Fecha) AS anio, MONTH(mp.Fecha) AS mes, tc.TComp_Signo AS signo,
           COUNT(*) AS n, SUM(ABS(ISNULL(mp.Total, 0))) AS total
      FROM MovProv mp
      INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
     WHERE mp.Fecha >= '${DESDE}' AND mp.Fecha <= '${HASTA}'
       AND ISNULL(mp.Anulado, 0) = 0 AND ABS(ISNULL(mp.Total, 0)) > 0
       ${SIN_AJUSTES}
     GROUP BY YEAR(mp.Fecha), MONTH(mp.Fecha), tc.TComp_Signo`);

  // Cuánto se está excluyendo por ajustes, para que el filtro sea visible.
  const ajustes = await q(`
    SELECT YEAR(mp.Fecha) AS anio, tc.TComp_Nombre AS tipo, COUNT(*) AS n, SUM(ABS(ISNULL(mp.Total, 0))) AS total
      FROM MovProv mp
      INNER JOIN TipoComp tc ON mp.TComp_id = tc.TComp_id
     WHERE mp.Fecha >= '${DESDE}' AND mp.Fecha <= '${HASTA}'
       AND ISNULL(mp.Anulado, 0) = 0 AND ABS(ISNULL(mp.Total, 0)) > 0
       AND tc.TComp_Nombre LIKE '%Ajuste%'
     GROUP BY YEAR(mp.Fecha), tc.TComp_Nombre ORDER BY 1`);

  // ---- Caja: igual en los dos criterios ----
  const caja = await q(`
    SELECT YEAR(mve.Mve_Fecha) AS anio, MONTH(mve.Mve_Fecha) AS mes,
           COUNT(*) AS n, SUM(ABS(ISNULL(mve.Mve_Total, 0))) AS total,
           SUM(CASE WHEN ISNULL(mve.Mve_Obs, '') LIKE '%Pago Proveedores%'
                    THEN ABS(ISNULL(mve.Mve_Total, 0)) ELSE 0 END) AS pago_proveedores
      FROM MovValoresEnca mve
     WHERE mve.Mve_Fecha >= '${DESDE}' AND mve.Mve_Fecha <= '${HASTA}'
       AND ISNULL(mve.Mve_Anulado, 0) = 0 AND ISNULL(mve.Mve_Signo, 0) = -1
       AND ABS(ISNULL(mve.Mve_Total, 0)) > 0
     GROUP BY YEAR(mve.Mve_Fecha), MONTH(mve.Mve_Fecha)`);

  const liq = await q(`
    SELECT YEAR(lc.LiqComp_Fecha) AS anio, MONTH(lc.LiqComp_Fecha) AS mes,
           COUNT(*) AS n, SUM(ABS(ISNULL(lc.LiqComp_Total, 0))) AS total
      FROM LiqComp lc
     WHERE lc.LiqComp_Fecha >= '${DESDE}' AND lc.LiqComp_Fecha <= '${HASTA}'
       AND ISNULL(lc.LiqComp_Anulado, 0) = 0 AND ABS(ISNULL(lc.LiqComp_Total, 0)) > 0
     GROUP BY YEAR(lc.LiqComp_Fecha), MONTH(lc.LiqComp_Fecha)`);

  const idx = (filas, extra = () => true) => {
    const m = new Map();
    for (const f of filas) {
      if (!extra(f)) continue;
      const k = `${f.anio}-${f.mes}`;
      m.set(k, (m.get(k) || 0) + Number(f.total));
    }
    return m;
  };

  const pagos = idx(prov, (f) => f.signo === -1);
  const facturas = idx(prov, (f) => f.signo === 1);
  const cajaM = idx(caja);
  const liqM = idx(liq);
  const ppM = new Map(caja.map((f) => [`${f.anio}-${f.mes}`, Number(f.pago_proveedores)]));

  console.log('Excluidos por ser ajustes de cuenta (no son gasto):');
  for (const x of ajustes) console.log(`  ${x.anio}  ${String(x.tipo).padEnd(30)} ${String(x.n).padStart(3)} · ${ars(x.total)}`);

  for (const anio of [2024, 2025, 2026]) {
    console.log(`\n================ ${anio} ================`);
    console.log('       A: criterio ACTUAL (pagado)    B: criterio DEVENGADO (facturas)');
    console.log('  mes        MovProv    TOTAL A         MovProv    TOTAL B       dif B-A');
    let ta = 0, tb = 0;
    for (let mes = 1; mes <= 12; mes++) {
      const k = `${anio}-${mes}`;
      if (!pagos.has(k) && !facturas.has(k) && !cajaM.has(k)) continue;
      const base = (cajaM.get(k) || 0) + (liqM.get(k) || 0);
      const a = (pagos.get(k) || 0) + base;
      const b = (facturas.get(k) || 0) + base;
      ta += a; tb += b;
      const dif = b - a;
      const pct = a ? ((dif / a) * 100).toFixed(0) + '%' : '—';
      console.log(`  ${MESES[mes]}  ${ars(pagos.get(k) || 0).padStart(14)} ${ars(a).padStart(15)}  `
        + `${ars(facturas.get(k) || 0).padStart(14)} ${ars(b).padStart(15)}  ${ars(dif).padStart(15)} ${pct.padStart(6)}`);
    }
    const dif = tb - ta;
    console.log(`  ───────────────────────────────────────────────────────────────────────────`);
    console.log(`  AÑO  ${''.padStart(14)} ${ars(ta).padStart(15)}  ${''.padStart(14)} ${ars(tb).padStart(15)}  `
      + `${ars(dif).padStart(15)} ${(ta ? ((dif / ta) * 100).toFixed(0) + '%' : '—').padStart(6)}`);
  }

  // ---- El riesgo del criterio B ----
  console.log('\n\n================ RIESGO DE DUPLICAR EN EL CRITERIO B ================');
  console.log('Pagos a proveedores que salen por CAJA. Bajo el criterio devengado, la');
  console.log('factura de ese mismo gasto se contaría además de este pago:');
  let totPP = 0;
  for (const anio of [2024, 2025, 2026]) {
    let s = 0;
    for (const [k, v] of ppM) if (k.startsWith(`${anio}-`)) s += v;
    totPP += s;
    console.log(`  ${anio}: ${ars(s)}`);
  }
  console.log(`  TOTAL: ${ars(totPP)}`);

  const pares = await q(`
    SELECT YEAR(a.Fecha) AS anio, COUNT(*) AS pares, SUM(ABS(ISNULL(a.Total, 0))) AS total
      FROM MovProv a
      INNER JOIN TipoComp ta ON a.TComp_id = ta.TComp_id AND ta.TComp_Signo = 1
      INNER JOIN MovProv b ON b.Prov_id = a.Prov_id
        AND ABS(ISNULL(b.Total, 0)) = ABS(ISNULL(a.Total, 0))
        AND b.Fecha >= a.Fecha AND b.Fecha <= DATEADD(day, 60, a.Fecha)
      INNER JOIN TipoComp tb ON b.TComp_id = tb.TComp_id AND tb.TComp_Signo = -1
     WHERE a.Fecha >= '${DESDE}' AND ISNULL(a.Anulado, 0) = 0 AND ISNULL(b.Anulado, 0) = 0
       AND ABS(ISNULL(a.Total, 0)) > 0
     GROUP BY YEAR(a.Fecha) ORDER BY 1`);
  console.log('\nY por qué NO se pueden sumar los dos: facturas que ya tienen su orden');
  console.log('de pago del mismo importe dentro de 60 días (son el mismo gasto, dos veces):');
  for (const x of pares) console.log(`  ${x.anio}: ${x.pares} pares · ${ars(x.total)}`);

  // ---- Cobertura: dónde cada criterio se queda sin datos ----
  console.log('\n\n================ COBERTURA DE CADA CRITERIO ================');
  console.log('Comprobantes de MovProv por mes. Un criterio sirve si tiene datos TODOS');
  console.log('los meses; si un tramo queda en cero, ese tramo no se puede comparar.');
  for (const anio of [2024, 2025, 2026]) {
    const fa = [], fb = [];
    for (let mes = 1; mes <= 12; mes++) {
      const row = prov.filter((p) => p.anio === anio && p.mes === mes);
      fa.push(String(row.filter((p) => p.signo === -1).reduce((s, p) => s + p.n, 0)).padStart(4));
      fb.push(String(row.filter((p) => p.signo === 1).reduce((s, p) => s + p.n, 0)).padStart(4));
    }
    console.log(`  ${anio}  pagado    ${fa.join('')}`);
    console.log(`        devengado ${fb.join('')}`);
  }

  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
