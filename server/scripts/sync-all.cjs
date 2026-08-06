// ============================================================
// DAEMON DE SYNC: GECLISA -> Supabase
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Corre TODOS los extractores de sync (GECLISA -> Supabase) registrados.
// A medida que se sumen módulos (movimientos, tesorería, etc.), se agregan acá.
//
// USO:
//   cd server
//   node scripts/sync-all.cjs              -> corre una vez y termina (one-shot)
//   node scripts/sync-all.cjs --loop 60     -> corre cada 60 min (proceso que queda vivo)
//
// RECOMENDADO en la PC de la clínica (siempre prendida): programar el modo
// one-shot con Windows Task Scheduler (sobrevive reinicios, no hay que cuidar
// un proceso). Ver instrucciones que da Claude al crearlo.
//
// Loguea a consola y a server/sync-daemon.log (gitignored por *.log).
// Cada sync corre aislado: si uno falla, los demás siguen.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');

const { sincronizarPacientes } = require('../services/pacientesExtractor');
const { sincronizarPrestadores } = require('../services/prestadoresExtractor');
const { sincronizarInsumos } = require('../services/insumosExtractor');
const { sincronizarNomenclador } = require('../services/nomencladorExtractor');
const { sincronizarTurnos } = require('../services/turnosExtractor');
const { sincronizarSeguimiento } = require('../services/seguimientoExtractor');
const { sincronizarInformes } = require('../services/informesExtractor');
const { sincronizarComparativa } = require('../services/analisisExtractor');
const { sincronizarMovimientos } = require('../services/movimientosExtractor');
const { sincronizarPeriodo: sincronizarIvaPeriodo } = require('../services/ivaExtractor');
const { sincronizarTipoCambio } = require('../services/tipoCambioExtractor');
const { sincronizarTesoreria } = require('../services/tesoreriaExtractor');
const { sincronizarErogaciones } = require('../services/erogacionesExtractor');
const { sincronizarTurnosFuturos } = require('../services/turnosFuturosExtractor');
const { correrMatch } = require('../services/matchPracticasService');
const { correrCierres } = require('../services/seguimientoJob');

// Períodos YYYY-MM del año en curso (ene..mes actual) para el ETL fiscal del IVA.
// Cubre cargas tardías de meses ya cerrados (antes solo mes actual + anterior).
function periodosIvaAnioEnCurso() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const mActual = hoy.getMonth() + 1;
  const periodos = [];
  for (let m = 1; m <= mActual; m++) periodos.push(`${y}-${String(m).padStart(2, '0')}`);
  return periodos;
}

// ------------------------------------------------------------
// Registro de sincronizaciones (agregar más módulos acá)
// ------------------------------------------------------------
const SYNCS = [
  { nombre: 'pacientes (GECLISA→Supabase)', fn: () => sincronizarPacientes({ write: true }) },
  { nombre: 'prestadores (GECLISA→Supabase)', fn: () => sincronizarPrestadores({ write: true }) },
  { nombre: 'insumos (GECLISA→Supabase)', fn: () => sincronizarInsumos({ write: true }) },
  { nombre: 'nomenclador (GECLISA→Supabase)', fn: () => sincronizarNomenclador({ write: true }) },
  { nombre: 'turnos (GECLISA→Supabase)', fn: () => sincronizarTurnos({ write: true }) },
  // Seguimiento e Informes: todo el año en curso (cubre ediciones tardías de
  // meses ya cerrados). El histórico se carga una vez con sus CLIs (--historico).
  { nombre: 'seguimiento (GECLISA→Supabase)', fn: () => sincronizarSeguimiento({ write: true, anioEnCurso: true }) },
  { nombre: 'informes (GECLISA→Supabase)', fn: () => sincronizarInformes({ write: true, anioEnCurso: true }) },
  // Comparativa de Análisis: singleton dinámico (depende del día); se recalcula siempre.
  { nombre: 'comparativa (GECLISA→Supabase)', fn: () => sincronizarComparativa({ write: true }) },
  // Movimientos crudos: el AÑO en curso (cargas/ediciones tardías de meses ya
  // cerrados —p. ej. un derivante— se auto-corrigen). El histórico (2024+) se
  // carga una vez con cargar-movimientos-geclisa.cjs --write --historico
  { nombre: 'movimientos (GECLISA→Supabase)', fn: () => sincronizarMovimientos({ write: true }) },
  // IVA fiscal: re-sincroniza todo el año en curso (cargas tardías de meses ya
  // cerrados). El histórico (2025-02..) se carga con cargar-iva.cjs.
  {
    nombre: 'iva fiscal (GECLISA→Supabase)',
    fn: async () => {
      let filas = 0;
      for (const per of periodosIvaAnioEnCurso()) {
        const r = await sincronizarIvaPeriodo(per);
        filas += (r.v?.filas || 0) + (r.c?.filas || 0);
      }
      return { total: filas, insertados: filas };
    },
  },
  // Tipo de cambio USD (DolarAPI/BCRA) -> tabla singleton; el frontend remoto lo lee.
  { nombre: 'tipo de cambio (BNA→Supabase)', fn: () => sincronizarTipoCambio({ write: true }) },
  // Tesorería: caja/valores del año en curso + proveedores full. El histórico
  // de caja (2018+) se carga una vez con cargar-tesoreria-geclisa.cjs --historico
  { nombre: 'tesorería (GECLISA→Supabase)', fn: () => sincronizarTesoreria({ write: true, anioEnCurso: true }) },
  // Erogaciones (costos fijos): full refresh 2024+ (~5.4k filas).
  { nombre: 'erogaciones (GECLISA→Supabase)', fn: () => sincronizarErogaciones({ write: true }) },
  // Turnos futuros: full refresh de turnos vigentes (~245 filas) para la agenda + recordatorios.
  { nombre: 'turnos futuros (GECLISA→Supabase)', fn: () => sincronizarTurnosFuturos({ write: true }) },
  // Match presupuesto→práctica realizada (solo Supabase; corre después de movimientos):
  // auto-marca practicado los matches inequívocos y deja los ambiguos como sugeridos.
  { nombre: 'match presupuesto→práctica (Supabase)', fn: () => correrMatch({ write: true }) },
  // Seguimiento: cierre automático "sin respuesta" (2ª ronda agotada + 5 días).
  { nombre: 'cierres seguimiento (Supabase)', fn: () => correrCierres({ write: true }) },
  // Próximos: prestaciones-realizadas, etc.
];

// ------------------------------------------------------------
const LOG_FILE = path.join(__dirname, '..', 'sync-daemon.log');
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
function log(msg) {
  const linea = `[${ts()}] ${msg}`;
  console.log(linea);
  try { fs.appendFileSync(LOG_FILE, linea + '\n'); } catch { /* ignore */ }
}

async function correrTodo() {
  log(`=== Sync iniciado (${SYNCS.length} tareas) ===`);
  const t0 = Date.now();
  for (const s of SYNCS) {
    const ti = Date.now();
    try {
      const r = await s.fn();
      const seg = ((Date.now() - ti) / 1000).toFixed(1);
      const detalle = r && r.insertados !== undefined ? `${r.insertados}/${r.total} filas` : 'OK';
      log(`  ✔ ${s.nombre}: ${detalle} (${seg}s)`);
    } catch (e) {
      log(`  ✖ ${s.nombre}: ERROR ${e.message}`); // no frena las demás
    }
  }
  log(`=== Sync terminado en ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
}

// ------------------------------------------------------------
// Modo: one-shot (default) o --loop <minutos>
// ------------------------------------------------------------
const loopIdx = process.argv.indexOf('--loop');
if (loopIdx >= 0) {
  const min = parseInt(process.argv[loopIdx + 1], 10) || 60;
  log(`Modo LOOP: cada ${min} min. (Ctrl+C para cortar.)`);
  (async () => {
    await correrTodo();
    setInterval(() => { correrTodo().catch((e) => log('ERROR loop: ' + e.message)); }, min * 60 * 1000);
  })();
} else {
  correrTodo()
    .then(() => process.exit(0))
    .catch((e) => { log('ERROR fatal: ' + e.message); process.exit(1); });
}
