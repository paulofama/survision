// ============================================================
// SERVICIO: Parser F.931 (Formulario AFIP - Cargas Sociales)
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// Toma el buffer de un PDF y devuelve un F931ParseResult con los campos
// extraidos o un error tipado. Detecta VEP vs F.931, valida CUIT, extrae
// los ~22 campos canonicos del formulario y agrega warnings no fatales.
//
// API:
//   const { parsearF931 } = require('./services/f931Parser');
//   const result = await parsearF931(buffer, { cuitEsperado: '30-70967266-1' });
//   if (result.ok) {
//     // result.campos: F931ParsedFields
//     // result.cuit_detectado, result.periodo_detectado
//     // result.detectado_como_vep, result.warnings
//   } else {
//     // result.error.codigo / mensaje / detalle
//   }
//
// Las regex estan validadas contra los 15 PDFs reales de Survision en
// server/scripts/explorar-f931.js (14 F.931 + 1 VEP). Si AFIP cambia
// formato, ajustar las regex en `extraerCamposF931` y `extraerCamposVep`.
// ============================================================

const { PDFParse } = require('pdf-parse');

// ============================================================
// CONSTANTES
// ============================================================

// CUIT de Survision S.A. (mismo valor que en src/utils/sueldos/constantes.ts).
// Si la empresa cambia su CUIT, actualizar en ambos lados.
const SURVISION_CUIT = '30-70967266-1';

// ============================================================
// HELPERS DE PARSING
// ============================================================

/**
 * Convierte un monto en formato AR ("1.234.567,89") a Number (1234567.89).
 * Devuelve null si la cadena no parsea.
 */
function parsearMontoAR(raw) {
  if (raw === undefined || raw === null) return null;
  const limpio = String(raw).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Busca "label  monto-AR" en el texto y devuelve el numero parseado.
 * Tolerante a espacios y tabs entre label y valor.
 */
function buscarMonto(texto, regexLabel) {
  const re = new RegExp(regexLabel.source + '\\s*([\\d.]+,\\d{2})', regexLabel.flags || '');
  const match = texto.match(re);
  return match ? parsearMontoAR(match[1]) : null;
}

function buscarEntero(texto, regexLabel) {
  const re = new RegExp(regexLabel.source + '\\s*(\\d+)', regexLabel.flags || '');
  const match = texto.match(re);
  return match ? parseInt(match[1], 10) : null;
}

function buscarString(texto, regexConCaptura) {
  const match = texto.match(regexConCaptura);
  return match ? match[1].trim() : null;
}

/** Normaliza "30-70967266-1" -> "30709672661" para comparar. */
function soloDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

// ============================================================
// DETECCION DEL TIPO DE DOCUMENTO
// ============================================================

/**
 * Determina si el texto extraido corresponde a un F.931, VEP, ambos, o ninguno.
 * Marcadores:
 *   - VEP:   "Volante Electronico de Pago" o "Nro. VEP:"
 *   - F.931: "Declaracion Jurada" + "S.U.S.S." o "Suma de Rem. 1:"
 */
function detectarTipo(texto) {
  const esVep = /Volante\s+Electr[oó]nico\s+de\s+Pago|Nro\.\s*VEP\s*:/i.test(texto);
  const esF931 = /(?:Declaraci[oó]n\s+Jurada[\s\S]*?S\.U\.S\.S\.)|(?:Suma\s+de\s+Rem\.\s*1\s*:)/i.test(texto);

  if (esF931) return { tipo: 'F931', esVep, esF931 };
  if (esVep) return { tipo: 'VEP', esVep, esF931 };
  return { tipo: 'DESCONOCIDO', esVep, esF931 };
}

// ============================================================
// EXTRACCION F.931 (formato AFIP estandar)
// ============================================================

/**
 * Extrae los campos del F.931 a partir del texto crudo.
 * Devuelve un objeto F931ParsedFields-shape (todos opcionales / null si no se encuentra).
 */
function extraerCamposF931(texto) {
  const cuit = buscarString(texto, /C\.U\.I\.T\.\s*(\d{2}-?\d{8}-?\d)/i);
  const razon_social = buscarString(
    texto,
    // El nombre aparece despues del label "Razon Social:" pero antes
    // de un nro verificador (4-7 digitos) y "Suma de Rem. 8:".
    /Apellido y Nombre o Raz[oó]n Social:[\s\S]{0,80}?\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.\s]+?)\s+\d{4,7}\s+Suma de Rem/i
  );
  const periodoStr = buscarString(texto, /Mes\s*-\s*A[ñn]o[\s\S]{0,80}?(\d{1,2}\/\d{4})/i);

  // Parsear "MM/YYYY" -> { anio, mes }
  let periodo = null;
  if (periodoStr) {
    const [mm, yyyy] = periodoStr.split('/').map((s) => parseInt(s, 10));
    if (Number.isFinite(mm) && Number.isFinite(yyyy)) {
      periodo = { mes: mm, anio: yyyy };
    }
  }

  // ----- Campos tipados -----
  const campos = {
    cantidad_trabajadores: buscarEntero(texto, /Empleados en n[oó]mina\s*:/i),
    rem_total: null, // No aparece como campo unico; se mantiene null por defecto.
    rem_1: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*1\s*:/i),
    rem_2: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*2\s*:/i),
    rem_3: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*3\s*:/i),
    rem_4: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*4\s*:/i),
    rem_5: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*5\s*:/i),

    aporte_ss_301: buscarMonto(texto, /301\s*-?\s*Aportes de Seguridad Social/i),
    aporte_os_302: buscarMonto(texto, /302\s*-?\s*Aportes de Obra Social/i),
    contrib_ss_351: buscarMonto(texto, /351\s*-?\s*Contribuciones de Seguridad Social/i),
    contrib_os_352: buscarMonto(texto, /352\s*-?\s*Contribuciones de Obra Social/i),
    art: buscarMonto(texto, /312\s*-?\s*L\.R\.T\./i),
    scvo: buscarMonto(texto, /028\s*-?\s*Seguro Colectivo de Vida Obligatorio/i),
    asignaciones_familiares: buscarMonto(texto, /b\s*-?\s*Asignaciones familiares pagadas/i),

    total_a_depositar: null, // Calculado abajo
    campos_extra: null,      // Asignado abajo
  };

  // total_a_depositar = suma de los 9 items de seccion VIII
  const items = [
    campos.contrib_ss_351,
    campos.aporte_ss_301,
    campos.contrib_os_352,
    campos.aporte_os_302,
    campos.art,
    campos.scvo,
  ];
  const suma = items.reduce((s, v) => s + (v ?? 0), 0);
  if (suma > 0) campos.total_a_depositar = Math.round(suma * 100) / 100;

  // ----- campos_extra (JSONB) -----
  campos.campos_extra = {
    razon_social: razon_social,
    nro_verificador: buscarString(texto, /Nro\.\s*Verificador[\s\S]{0,40}?(\d{4,})/i),
    rem_6: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*6\s*:/i),
    rem_7: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*7\s*:/i),
    rem_8: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*8\s*:/i),
    rem_9: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*9\s*:/i),
    rem_10: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*10\s*:/i),
    detraccion_art23: buscarMonto(texto, /b3\s*-?\s*Detracci[oó]n art\.\s*23 Ley 27\.541/i),
    vales_270: buscarMonto(texto, /270\s*-?\s*Vales\s+Alimentarios[\s\S]{0,40}?/i),
    renatre_360: buscarMonto(texto, /360\s*-?\s*Contribuciones RENATRE/i),
    sepelio_uatre_935: buscarMonto(texto, /935\s*-?\s*Seg\.\s*Sepelio UATRE/i),
    servicios_eventuales: buscarString(texto, /Servicios Eventuales:\s*(\S+)/i),
    domicilio_fiscal: buscarString(texto, /Domicilio Fiscal:\s*([^\n]+?)(?:\s+V\s*\d+|$)/i),
  };

  return { campos, cuit, razon_social, periodo };
}

// ============================================================
// EXTRACCION VEP (cuando el usuario sube VEP por error)
// ============================================================

/**
 * Extrae los campos canonicos del VEP. El VEP comparte 6 codigos con el F.931
 * (351, 301, 352, 302, 312, 28) y los podemos guardar como referencia mientras
 * marcamos `detectado_como_vep = true`.
 */
function extraerCamposVep(texto) {
  const cuit = buscarString(texto, /CUIT\s*:\s*(\d{2}-?\d{8}-?\d)/i);
  const periodoStr = buscarString(texto, /Per[ií]odo\s*:\s*(\d{4}-\d{2})/i);

  let periodo = null;
  if (periodoStr) {
    const [yyyy, mm] = periodoStr.split('-').map((s) => parseInt(s, 10));
    if (Number.isFinite(mm) && Number.isFinite(yyyy)) {
      periodo = { mes: mm, anio: yyyy };
    }
  }

  const campos = {
    cantidad_trabajadores: null,
    rem_total: null,
    rem_1: null,
    rem_2: null,
    rem_3: null,
    rem_4: null,
    rem_5: null,
    aporte_ss_301: buscarMonto(texto, /EMPLEADOR-APORTES SEG\.\s*SOCIAL[\s\S]{0,30}?\(301\)\s*\$?/i),
    aporte_os_302: buscarMonto(texto, /APORTES OBRAS SOCIALES\s*\(302\)\s*\$?/i),
    contrib_ss_351: buscarMonto(texto, /CONTRIBUCIONES SEG\.\s*SOCIAL[\s\S]{0,30}?\(351\)\s*\$?/i),
    contrib_os_352: buscarMonto(texto, /CONTRIBUCIONES OBRA SOCIAL[\s\S]{0,30}?\(352\)\s*\$?/i),
    art: buscarMonto(texto, /ASEG\.RIESGO DE TRABAJO[\s\S]{0,40}?\(312\)\s*\$?/i),
    scvo: buscarMonto(texto, /SEGURO DE VIDA COLECTIVO\s*\(28\)\s*\$?/i),
    asignaciones_familiares: null,
    total_a_depositar: buscarMonto(texto, /Importe total a pagar\s*\$?/i),
    campos_extra: {
      origen: 'VEP_extraido',
      nro_vep: buscarString(texto, /Nro\.\s*VEP\s*:\s*(\d+)/i),
      tipo_pago: buscarString(texto, /Tipo de Pago\s*:\s*([^\n]+)/i),
      descripcion: buscarString(texto, /Descripci[oó]n Reducida\s*:\s*([^\n]+)/i),
    },
  };

  return { campos, cuit, periodo };
}

// ============================================================
// API PRINCIPAL
// ============================================================

/**
 * Parsea un PDF de F.931 o VEP y devuelve un F931ParseResult.
 *
 * @param {Buffer|Uint8Array} buffer - Contenido del PDF
 * @param {Object} options
 * @param {string} [options.cuitEsperado] - CUIT a comparar (default SURVISION_CUIT)
 * @param {{ anio: number, mes: number }} [options.periodoEsperado] - opcional, para validar
 * @returns {Promise<F931ParseResult>}
 */
async function parsearF931(buffer, options = {}) {
  if (!buffer || buffer.length === 0) {
    return {
      ok: false,
      error: {
        codigo: 'PDF_INVALIDO',
        mensaje: 'Buffer vacio o invalido',
      },
    };
  }

  const cuitEsperado = options.cuitEsperado || SURVISION_CUIT;
  const periodoEsperado = options.periodoEsperado;

  // 1. Extraer texto con pdf-parse
  let texto;
  let parser;
  try {
    parser = new PDFParse({
      data: buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer),
    });
    const result = await parser.getText();
    texto = result.text || '';
  } catch (e) {
    if (parser) await parser.destroy().catch(() => {});
    return {
      ok: false,
      error: {
        codigo: 'PDF_INVALIDO',
        mensaje: 'No se pudo abrir el PDF',
        detalle: e.message,
      },
    };
  }
  await parser.destroy().catch(() => {});

  if (!texto || texto.trim().length === 0) {
    return {
      ok: false,
      error: {
        codigo: 'TEXTO_NO_EXTRACTABLE',
        mensaje: 'El PDF no contiene texto extraible (puede ser escaneado/imagen)',
      },
    };
  }

  // 2. Detectar tipo
  const { tipo, esVep, esF931 } = detectarTipo(texto);

  if (tipo === 'DESCONOCIDO') {
    return {
      ok: false,
      error: {
        codigo: 'FORMATO_NO_F931',
        mensaje: 'El PDF no parece ser un F.931 ni un VEP (formato desconocido)',
        detalle: `Primeros 200 chars: ${texto.substring(0, 200).replace(/\n/g, ' ')}`,
      },
    };
  }

  // 3. Extraer campos segun tipo
  const extraido = tipo === 'F931'
    ? extraerCamposF931(texto)
    : extraerCamposVep(texto);

  // 4. Validar CUIT
  const cuitDetectado = extraido.cuit || null;
  const cuitCoincide = cuitDetectado
    ? soloDigitos(cuitDetectado) === soloDigitos(cuitEsperado)
    : false;

  // 5. Armar warnings
  const warnings = [];
  if (tipo === 'VEP') {
    warnings.push('El PDF subido parece un VEP (Volante Electrónico de Pago) en vez de un F.931. Se extrajeron los códigos conocidos como referencia, pero conviene reemplazarlo por el F.931 oficial.');
  }
  if (!cuitDetectado) {
    warnings.push('No se pudo detectar el CUIT en el documento.');
  } else if (!cuitCoincide) {
    warnings.push(`CUIT del documento (${cuitDetectado}) no coincide con el esperado (${cuitEsperado}).`);
  }
  if (!extraido.periodo) {
    warnings.push('No se pudo detectar el período (mes/año) en el documento.');
  } else if (periodoEsperado) {
    if (extraido.periodo.anio !== periodoEsperado.anio || extraido.periodo.mes !== periodoEsperado.mes) {
      warnings.push(
        `Período del documento (${String(extraido.periodo.mes).padStart(2, '0')}/${extraido.periodo.anio}) ` +
        `no coincide con el esperado (${String(periodoEsperado.mes).padStart(2, '0')}/${periodoEsperado.anio}).`
      );
    }
  }

  return {
    ok: true,
    detectado_como_vep: tipo === 'VEP',
    cuit_detectado: cuitDetectado,
    periodo_detectado: extraido.periodo,
    cuit_coincide: cuitCoincide,
    campos: extraido.campos,
    raw_text: texto,
    warnings,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  parsearF931,
  // Helpers exportados para tests / debug
  detectarTipo,
  extraerCamposF931,
  extraerCamposVep,
  parsearMontoAR,
  SURVISION_CUIT,
};
