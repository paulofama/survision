// ============================================================
// Ventana de sincronización — una sola regla para todos los espejos
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// EL PROBLEMA QUE RESUELVE
// ------------------------
// Cada extractor tenía su propia copia de "desde el 1-ene del año en curso".
// Eso deja dos agujeros:
//
//   1. UN AÑO CERRADO NO SE VUELVE A MIRAR NUNCA. Si alguien corrige una
//      atención de 2025, el sistema no se entera. Y el comparativo 2025 vs
//      2026 se apoya justamente en ese año.
//
//   2. EL SALTO DE AÑO. El 1 de enero la ventana pasa a arrancar en enero del
//      año nuevo, así que todo lo que se cargue o se corrija de diciembre —que
//      es cuando se corrige diciembre— queda afuera para siempre.
//      No es hipotético: diciembre-2025 recibió 3 altas en enero-2026 por
//      $1.536.444 y 39 modificaciones. Las levantó una resincronización
//      histórica que alguien corrió a mano en julio, no el daemon.
//
// LA REGLA
// --------
// La ventana arranca el 1 de enero del año ANTERIOR. Así el año cerrado sigue
// vivo todo el año siguiente, y el salto de diciembre queda cubierto por
// construcción: el 2 de enero de 2027 la ventana empieza el 1-ene-2026.
//
// Cuesta: el daemon pasa de ~135s a ~220s por corrida. Corre cada hora en una
// máquina que no hace otra cosa.
//
// `SYNC_ANIOS_ATRAS` en server/.env lo cambia sin tocar código (1 = año
// anterior, 0 = sólo el año en curso, 2 = dos años atrás).
// ============================================================

const ANIOS_ATRAS = (() => {
  const n = Number(process.env.SYNC_ANIOS_ATRAS);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 1;
})();

const hoyISO = () => new Date().toISOString().split('T')[0];

/** Primer año que entra en la ventana. */
function anioDesde() {
  return new Date().getFullYear() - ANIOS_ATRAS;
}

/** Rango de fechas de la ventana: { desde: 'YYYY-01-01', hasta: hoy }. */
function rangoSync() {
  return { desde: `${anioDesde()}-01-01`, hasta: hoyISO() };
}

/**
 * Los meses de la ventana como {anio, mes}, del más viejo al mes en curso.
 * Para los extractores que trabajan por mes (informes, seguimiento).
 */
function mesesSync() {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  const out = [];
  for (let a = anioDesde(); a <= anioActual; a++) {
    const hasta = a === anioActual ? mesActual : 12;
    for (let m = 1; m <= hasta; m++) out.push({ anio: a, mes: m });
  }
  return out;
}

/** Los meses de la ventana como 'YYYY-MM' (para el ETL fiscal del IVA). */
function periodosSync() {
  return mesesSync().map(({ anio, mes }) => `${anio}-${String(mes).padStart(2, '0')}`);
}

/**
 * Guarda contra vaciar un espejo.
 *
 * Los espejos se refrescan con DELETE del rango + INSERT. Mientras la ventana
 * era el año en curso, un DELETE fallido se arreglaba solo a la hora
 * siguiente y sólo afectaba meses que se vuelven a leer igual. Con dos años
 * adentro, una lectura que vuelve corta —GECLISA a medias, un timeout que no
 * tiró error, una query que cambió— borraría historia que nadie está mirando
 * y el hueco recién aparecería cuando alguien imprima un informe viejo.
 *
 * Así que antes de borrar se compara contra lo que YA está guardado: si lo
 * que se leyó es bastante menos, se aborta sin tocar nada. Un borrado masivo
 * legítimo en el ERP también cae acá, y está bien que caiga: eso lo tiene que
 * mirar una persona, no resolverlo un daemon a las 3 de la mañana.
 *
 * @returns {string|null} el motivo por el que NO hay que escribir, o null.
 */
function motivoParaNoEscribir({ leidas, guardadas, tolerancia = 0.5 }) {
  if (guardadas === 0) return null;            // espejo vacío: nada que perder
  if (leidas >= guardadas * tolerancia) return null;
  return (
    `la lectura trajo ${leidas} filas contra ${guardadas} ya guardadas ` +
    `(menos del ${Math.round(tolerancia * 100)}%). No se borra nada. ` +
    `Si el ERP realmente perdió esas filas, correr la sincronización histórica a mano.`
  );
}

module.exports = {
  ANIOS_ATRAS,
  anioDesde,
  rangoSync,
  mesesSync,
  periodosSync,
  motivoParaNoEscribir,
};
