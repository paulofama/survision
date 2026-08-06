// ============================================================================
// Parser del extracto bancario Santander (conversión de PDF a Excel).
// Sistema de Gestión Integral - Survisión S.A.
//
// ISOMÓRFICO: lo consume el navegador (subida manual) y el CLI diario (Node).
// Única dependencia: 'xlsx' (SheetJS). Sin APIs de DOM ni de fs.
//
// Reglas críticas (verificadas contra un archivo real de julio 2026):
//  - Detecta las hojas de movimientos por la fila header
//    Fecha/Comprobante/Movimiento/Débito/Crédito/Saldo (no por nombre de hoja).
//  - Forward-fill de la Fecha (viene salteada).
//  - La FUENTE DE VERDAD del importe es el delta de "Saldo en cuenta"
//    (saldo_fila − saldo_anterior); las columnas Débito/Crédito no son confiables.
//  - Valida la cadena de saldos contra el saldo final; si no cierra (tol $0,01)
//    devuelve ok=false y NO se debe subir nada.
//  - Dedup determinístico por (cuenta, fecha, posición_en_el_día, importe,
//    saldo_resultante, descripción_normalizada).
// ============================================================================

import * as XLSX from 'xlsx';

const TOLERANCIA = 0.01;

const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Número desde number o texto es-AR "1.234.567,89". null si vacío/no numérico. */
export function parseNumeroAR(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s === '' || s === '-') return null;
  const neg = /^\(.*\)$/.test(s); // (1.234,56) = negativo
  s = s.replace(/[()]/g, '');
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Fecha (Date de xlsx o texto dd/mm/aa[aa]) → 'YYYY-MM-DD' (UTC, sin corrimiento). */
function fechaISO(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** FNV-1a 64-bit → hex. Determinístico, sirve en navegador y Node. */
function fnv1a64(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

function esHeader(row) {
  const c = (row || []).map(norm);
  const has = (t) => c.some((x) => x.includes(t));
  return has('fecha') && has('comprobante') && has('movimiento') && has('debito') && has('credito') && has('saldo');
}

/** Descompone la descripción (1–2 líneas) en concepto / contraparte / CUIT. */
function parseDescripcion(desc) {
  const full = String(desc ?? '').replace(/\r/g, '');
  const lineas = full.split('\n').map((l) => l.trim()).filter(Boolean);
  const concepto = lineas[0] || '';
  const contraparteLinea = lineas.slice(1).join(' ');
  // CUIT/CUIL: 11 dígitos (con o sin guiones) en cualquier parte de la descripción.
  let cuit = null;
  const m = full.replace(/[.\-\s]/g, '').match(/(\d{11})(?!\d)/g);
  if (m && m.length) cuit = m[m.length - 1];
  // Nombre de contraparte: saca prefijos "De " / "Id ..." y corta antes del CUIT.
  let contraparte = contraparteLinea
    .replace(/^de\s+/i, '')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();
  return { concepto, contraparte: contraparte || null, cuit };
}

/** Parser "flojo" de montos del encabezado (US "8,664,001.92" o AR mal armado
 *  "24.376.03053"): toma todos los dígitos y asume 2 decimales. */
function parseMoneyLoose(v) {
  if (v == null) return null;
  const s = String(v);
  const neg = s.includes('-');
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits) / 100;
  return neg ? -n : n;
}

/** Saldo final DECLARADO + período, del encabezado (hojas sin movimientos). */
function extraerDeclarado(workbook) {
  let saldoFinalDeclarado = null, periodoDesde = null, periodoHasta = null;
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: null, blankrows: false });
    if (rows.some((r) => Array.isArray(r) && esHeader(r))) continue;
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      for (const cell of r) {
        const t = String(cell ?? '');
        const tn = norm(t);
        if (saldoFinalDeclarado == null && tn.includes('saldo total en cuentas')) {
          const m = t.match(/\$\s*([\d.,]+)/); // primer monto en pesos tras "saldo total"
          if (m) saldoFinalDeclarado = parseMoneyLoose(m[1]);
        }
        const md = t.match(/desde:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
        const mh = t.match(/hasta:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
        if (md && !periodoDesde) periodoDesde = fechaISO(md[1]);
        if (mh && !periodoHasta) periodoHasta = fechaISO(mh[1]);
      }
    }
  }
  return { saldoFinalDeclarado, periodoDesde, periodoHasta };
}

/** Detalle impositivo estructurado de la hoja de impuestos (Table 4). */
function extraerImpositivo(workbook) {
  const raw = [];
  let leyCred = null, leyDeb = null, compCred = null, compDeb = null, sircreb = null;
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: null, blankrows: false });
    if (rows.some((r) => Array.isArray(r) && esHeader(r))) continue;
    const txt = rows.map((r) => (Array.isArray(r) ? r.filter(Boolean).join(' ') : '')).join(' ').toLowerCase();
    if (!(txt.includes('25413') || txt.includes('25.413') || txt.includes('sircreb'))) continue;
    for (const r of rows) {
      if (!Array.isArray(r) || !r.some(Boolean)) continue;
      raw.push(r.map((c) => (c == null ? '' : String(c).trim())));
      const etiqueta = norm(r[0]);
      const monto = parseMoneyLoose(r.find((c, i) => i > 0 && String(c ?? '').includes('$')) ?? r[1]);
      if (etiqueta.includes('impuesto ley 25413 por creditos') && !etiqueta.includes('alicuota')) leyCred = monto;
      else if (etiqueta.includes('impuesto ley 25413 por debitos') && !etiqueta.includes('alicuota')) leyDeb = monto;
      else if (etiqueta.includes('por creditos alicuota')) compCred = monto;
      else if (etiqueta.includes('por debitos alicuota')) compDeb = monto;
      else if (etiqueta.includes('sircreb')) sircreb = monto;
    }
  }
  return {
    ley25413_creditos: leyCred, ley25413_debitos: leyDeb,
    ley25413_total: (leyCred != null || leyDeb != null) ? r2((leyCred || 0) + (leyDeb || 0)) : null,
    computable_creditos_33: compCred, computable_debitos_33: compDeb,
    sircreb_total: sircreb, raw,
  };
}

/**
 * Parsea el workbook ya leído. Núcleo puro (sin IO).
 * @returns {ParseResult}
 */
export function parseWorkbook(workbook, opts = {}) {
  const nroCuenta = opts.nroCuenta || '';
  const filas = []; // {fechaRaw, comprobante, desc, debito, credito, saldo}
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    let hIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (Array.isArray(rows[i]) && esHeader(rows[i])) { hIdx = i; break; }
    }
    if (hIdx < 0) continue;
    const header = rows[hIdx].map(norm);
    const col = {
      fecha: header.findIndex((c) => c.includes('fecha')),
      comp: header.findIndex((c) => c.includes('comprobante')),
      mov: header.findIndex((c) => c.includes('movimiento')),
      saldo: header.findIndex((c) => c.includes('saldo')),
      deb: header.findIndex((c) => c.includes('debito')),
      cred: header.findIndex((c) => c.includes('credito')),
    };
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i]; if (!Array.isArray(r)) continue;
      const descTxt = String(r[col.mov] ?? '').trim();
      const saldo = parseNumeroAR(r[col.saldo]);
      if (saldo == null && descTxt === '') continue;
      filas.push({
        fechaRaw: r[col.fecha] ?? null,
        comprobante: r[col.comp] != null ? String(r[col.comp]).trim() : null,
        desc: descTxt,
        debito: parseNumeroAR(r[col.deb]),
        credito: parseNumeroAR(r[col.cred]),
        saldo,
      });
    }
  }

  if (!filas.length) {
    return { ok: false, motivoRechazo: 'No se encontraron hojas de movimientos con el header esperado.', resumen: null, movimientos: [], impositivoRaw: [] };
  }

  // Forward-fill de fecha
  let lastFecha = null;
  for (const f of filas) {
    const iso = fechaISO(f.fechaRaw);
    if (iso) lastFecha = iso;
    f.fecha = lastFecha;
  }

  // Ancla: fila "Saldo Inicial"
  const idxIni = filas.findIndex((f) => norm(f.desc).includes('saldo inicial'));
  if (idxIni < 0 || filas[idxIni].saldo == null) {
    return { ok: false, motivoRechazo: 'No se encontró la fila "Saldo Inicial" (ancla de la cadena de saldos).', resumen: null, movimientos: [], impositivoRaw: [] };
  }
  const saldoInicial = filas[idxIni].saldo;

  // Movimientos reales
  const reales = filas.slice(idxIni + 1).filter((f) => f.saldo != null);
  const movimientos = [];
  let prev = saldoInicial;
  let sumaCred = 0, sumaDeb = 0;
  let diaActual = null, pos = 0;
  for (const f of reales) {
    const importe = r2(f.saldo - prev);
    f.importe = importe;
    if (f.fecha !== diaActual) { diaActual = f.fecha; pos = 0; }
    pos += 1;
    if (importe > 0) sumaCred += importe;
    else if (importe < 0) sumaDeb += -importe;
    const { concepto, contraparte, cuit } = parseDescripcion(f.desc);
    const descNorm = norm(f.desc).replace(/\s+/g, ' ');
    const clave = `${nroCuenta}|${f.fecha}|${pos}|${importe.toFixed(2)}|${f.saldo.toFixed(2)}|${descNorm}`;
    movimientos.push({
      fecha: f.fecha,
      anio: f.fecha ? Number(f.fecha.slice(0, 4)) : null,
      mes: f.fecha ? Number(f.fecha.slice(5, 7)) : null,
      posicionDia: pos,
      nroComprobante: f.comprobante || null,
      concepto,
      descripcion: f.desc,
      contraparteNombre: contraparte,
      contraparteCuit: cuit,
      importe,
      saldoResultante: f.saldo,
      hashDedup: fnv1a64(clave),
    });
    prev = f.saldo;
  }

  const saldoFinal = reales.length ? reales[reales.length - 1].saldo : saldoInicial;
  const recalculado = r2(saldoInicial + sumaCred - sumaDeb); // telescopa a saldoFinal

  // --- Saldo final DECLARADO en el encabezado (fuente independiente) ---
  const declarado = extraerDeclarado(workbook);
  const saldoFinalDeclarado = declarado.saldoFinalDeclarado;

  // --- Control secundario por columnas Débito/Crédito (solo donde la columna
  //     correcta está presente; las mal ubicadas quedan en null y se ignoran) ---
  let ctrlVerificados = 0, ctrlDiscrepancias = 0;
  for (const f of reales) {
    const colEsperada = f.importe > 0 ? f.credito : f.importe < 0 ? f.debito : null;
    if (colEsperada != null) {
      ctrlVerificados++;
      if (Math.abs(colEsperada - Math.abs(f.importe)) > TOLERANCIA) ctrlDiscrepancias++;
    }
  }

  // Consistencia interna (debe cumplirse siempre; guarda de bugs numéricos)
  const internaOk = Math.abs(recalculado - saldoFinal) <= TOLERANCIA;
  // Validación fuerte: el saldo calculado debe igualar al DECLARADO (si existe)
  const declaradoOk = saldoFinalDeclarado != null
    ? Math.abs(r2(saldoFinal) - r2(saldoFinalDeclarado)) <= TOLERANCIA
    : null;
  const cierraCadena = internaOk && declaradoOk !== false;

  const fechasMov = movimientos.map((m) => m.fecha).filter(Boolean).sort();
  const impositivo = extraerImpositivo(workbook);
  const resumen = {
    nroCuenta,
    periodoDesde: declarado.periodoDesde || fechasMov[0] || null,
    periodoHasta: declarado.periodoHasta || fechasMov[fechasMov.length - 1] || null,
    saldoInicial: r2(saldoInicial),
    saldoFinal: r2(saldoFinal),
    saldoFinalDeclarado: saldoFinalDeclarado != null ? r2(saldoFinalDeclarado) : null,
    validadoContraDeclarado: declaradoOk === true,
    totalCreditos: r2(sumaCred),
    totalDebitos: r2(sumaDeb),
    cantMovimientos: movimientos.length,
    saldoRecalculado: recalculado,
    cierraCadena,
    controlSecundario: { verificados: ctrlVerificados, discrepancias: ctrlDiscrepancias },
    impositivo,
  };

  if (!cierraCadena) {
    const motivo = declaradoOk === false
      ? `El saldo calculado ${saldoFinal.toFixed(2)} no coincide con el saldo final DECLARADO ${saldoFinalDeclarado.toFixed(2)} (dif ${r2(saldoFinal - saldoFinalDeclarado).toFixed(2)}). El archivo puede estar truncado o corrupto: se rechaza completo.`
      : `Inconsistencia interna de la cadena de saldos (recalculado ${recalculado.toFixed(2)} ≠ último saldo ${saldoFinal.toFixed(2)}).`;
    return { ok: false, motivoRechazo: motivo, resumen, movimientos: [], impositivoRaw: impositivo.raw };
  }

  return { ok: true, motivoRechazo: null, resumen, movimientos, impositivoRaw: impositivo.raw };
}

/** Lee bytes (Uint8Array/ArrayBuffer/Buffer) y parsea. Sirve en navegador y Node. */
export function parseExtracto(bytes, opts = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  return parseWorkbook(wb, opts);
}
