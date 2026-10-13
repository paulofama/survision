// ============================================================
// Reglas puras de la conciliación agenda vs facturación
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Separado de `conciliacionAgendaExtractor.js` a propósito: ese módulo abre
// GECLISA y Supabase al cargarse, así que no se puede importar desde un test.
// Acá va lo que no toca ninguna base, con sus tests en
// `src/test/conciliacionAgenda.test.ts`.
// ============================================================

/** Las cuatro causas, en el orden en que se muestran: primero lo que más mueve. */
const CAUSAS = ['codigo_distinto', 'otro_mes', 'sin_practica', 'sin_atencion'];

/** Qué significa cada causa, en palabras. */
const ETIQUETA_CAUSA = {
  codigo_distinto: 'El código facturado no es el agendado',
  otro_mes: 'El movimiento cae en otro período',
  sin_practica: 'Hay atención pero ninguna práctica cargada',
  sin_atencion: 'El turno no tiene atención',
};

/**
 * Primer día del mes siguiente, para el filtro `< hasta`.
 *
 * Se usa un límite abierto en vez de "último día del mes" para no tener que
 * saber cuántos días tiene febrero, y para que una atención con hora no se
 * caiga del período por ser posterior a la medianoche del día 31.
 *
 * @param {string} mes - "YYYY-MM"
 * @returns {string} "YYYY-MM-01" del mes siguiente
 */
function finDeMes(mes) {
  const [anio, mesN] = String(mes).split('-').map(Number);
  if (!anio || !mesN || mesN < 1 || mesN > 12) {
    throw new Error(`mes inválido: "${mes}" (se espera YYYY-MM)`);
  }
  return mesN === 12
    ? `${anio + 1}-01-01`
    : `${anio}-${String(mesN + 1).padStart(2, '0')}-01`;
}

/**
 * Una fila de GECLISA, lista para el espejo.
 *
 * Los vacíos se guardan como NULL, no como "": un código facturado vacío no es
 * un dato que falte, es la discrepancia misma (no hay práctica cargada), y
 * distinguirlo de un código real importa al leer la tabla.
 *
 * El paciente llega como "APELLIDO, NOMBRE" armado en SQL, así que puede venir
 * con la coma colgando si falta una de las dos partes.
 */
function aFila(mes, row) {
  const limpio = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
  };
  return {
    mes,
    turno_id: row.turno_id,
    fecha_turno: row.fecha_turno,
    paciente: limpio(String(row.paciente ?? '').replace(/^\s*,\s*|\s*,\s*$/g, '')),
    obra_social: limpio(row.obra_social),
    prestador: limpio(row.prestador),
    cod_agendado: limpio(row.cod_agendado),
    cod_facturado: limpio(row.cod_facturado),
    practica: limpio(row.practica),
    fecha_movimiento: row.fecha_movimiento || null,
    monto: Number(row.monto) || 0,
    causa: row.causa,
  };
}

/**
 * Resumen por causa de un conjunto de discrepancias.
 *
 * Se DERIVA del detalle, no se guarda aparte: una sola fuente de números. El
 * orden es el de `CAUSAS`, que pone primero lo que más plata mueve.
 */
function resumirPorCausa(filas) {
  return CAUSAS
    .map((causa) => {
      const propias = filas.filter((f) => f.causa === causa);
      return {
        causa,
        etiqueta: ETIQUETA_CAUSA[causa],
        turnos: propias.length,
        monto: propias.reduce((s, f) => s + (Number(f.monto) || 0), 0),
      };
    })
    .filter((r) => r.turnos > 0);
}

module.exports = { CAUSAS, ETIQUETA_CAUSA, finDeMes, aFila, resumirPorCausa };
