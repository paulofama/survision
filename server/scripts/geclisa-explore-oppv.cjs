// Read-only: signo de los tipos + muestra de OP/PV en MovProv.
const { executeQuery } = require('../config/database');
(async () => {
  try {
    console.log('=== TComp_Signo por tipo (caja vs proveedores) ===');
    const sg = await executeQuery(`SELECT TComp_id, RTRIM(TComp_sigla) sigla, RTRIM(TComp_Nombre) nombre, TComp_Signo signo FROM TipoComp WHERE RTRIM(TComp_sigla) IN ('IC','EC','FAC','NC','OP','PV','OPL','PS','IV','RI') ORDER BY sigla`);
    sg.recordset.forEach(r => console.log(`  ${String(r.sigla).padEnd(5)} signo=${String(r.signo).padStart(3)} | id=${r.TComp_id} | ${r.nombre}`));

    console.log('\n=== Muestra OP (Orden de Pago) — ult. 5 ===');
    const op = await executeQuery(`SELECT TOP 5 MProv_id, CAST(Fecha AS DATE) fecha, RTRIM(Nombre) prov, Letra, Numero, Total, RTRIM(ISNULL(Obs,'')) obs, Anulado FROM MovProv m WHERE m.TComp_id=4 ORDER BY Fecha DESC`);
    op.recordset.forEach(r => console.log(`  ${r.MProv_id} | ${r.fecha?.toISOString?.().slice(0,10)} | ${String(r.prov).slice(0,28).padEnd(28)} | ${r.Letra}${r.Numero} | $${r.Total} | anul=${r.Anulado} | ${r.obs.slice(0,30)}`));

    console.log('\n=== Muestra PV (Pagos Varios) — ult. 5 ===');
    const pv = await executeQuery(`SELECT TOP 5 MProv_id, CAST(Fecha AS DATE) fecha, RTRIM(Nombre) prov, Letra, Numero, Total, RTRIM(ISNULL(ObsPagosVarios,ISNULL(Obs,''))) obs, Anulado FROM MovProv m WHERE m.TComp_id=13 ORDER BY Fecha DESC`);
    pv.recordset.forEach(r => console.log(`  ${r.MProv_id} | ${r.fecha?.toISOString?.().slice(0,10)} | ${String(r.prov).slice(0,28).padEnd(28)} | ${r.Letra}${r.Numero} | $${r.Total} | anul=${r.Anulado} | ${r.obs.slice(0,30)}`));

    console.log('\n=== Totales OP/PV no anulados (todo el historico) ===');
    const tot = await executeQuery(`SELECT RTRIM(tc.TComp_sigla) sigla, COUNT(*) cnt, SUM(m.Total) total FROM MovProv m JOIN TipoComp tc ON m.TComp_id=tc.TComp_id WHERE tc.TComp_id IN (4,13) AND (m.Anulado IS NULL OR m.Anulado=0) GROUP BY tc.TComp_sigla`);
    tot.recordset.forEach(r => console.log(`  ${r.sigla} | ${r.cnt} comprobantes | total $${Number(r.total).toLocaleString('es-AR')}`));
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
})();
