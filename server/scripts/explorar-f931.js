// ============================================================
// SCRIPT DE EXPLORACION - PDFs F.931
// Sistema Integral de Gestion - Survision S.A.
// ============================================================
//
// USO:
//   cd server
//   node scripts/explorar-f931.js
//
// QUE HACE:
//   - Lee todos los PDFs en C:\FISCAL\931\931\
//   - Extrae el texto crudo con pdf-parse
//   - Detecta si es F.931 o VEP
//   - Para los F.931, extrae los campos clave con regex y los muestra
//   - Para los VEP, muestra cuales fueron los marcadores que lo identificaron
//   - Guarda el texto crudo de cada uno en server/tmp/extraidos-f931/ para
//     debug del parser definitivo (gitignore-able)
//
// NO MODIFICA NADA. Solo lectura + escritura a server/tmp/.
// ============================================================

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const DIR_PDFS = 'C:\\FISCAL\\931\\931';
const DIR_OUT = path.join(__dirname, '..', 'tmp', 'extraidos-f931');

// ============================================================
// HELPERS
// ============================================================

/** Convierte "1.234.567,89" -> 1234567.89, o null si no parsea. */
function parsearMontoAR(raw) {
  if (raw === undefined || raw === null) return null;
  const limpio = String(raw).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Busca un campo "label: monto" en el texto y devuelve el monto parseado.
 * Tolerante a multiples espacios y tabs entre label y valor.
 */
function buscarMonto(texto, regexLabel) {
  const re = new RegExp(regexLabel.source + '\\s*([\\d.]+,\\d{2})', regexLabel.flags || '');
  const match = texto.match(re);
  if (!match) return null;
  return parsearMontoAR(match[1]);
}

function buscarEntero(texto, regexLabel) {
  const re = new RegExp(regexLabel.source + '\\s*(\\d+)', regexLabel.flags || '');
  const match = texto.match(re);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function buscarString(texto, regexConCaptura) {
  const match = texto.match(regexConCaptura);
  return match ? match[1].trim() : null;
}

// ============================================================
// DETECCION TIPO DOCUMENTO
// ============================================================

function detectarTipo(texto) {
  const esVep = /Volante\s+Electr[oó]nico\s+de\s+Pago|Nro\.\s*VEP\s*:/i.test(texto);
  const esF931 = /(?:Declaraci[oó]n\s+Jurada[\s\S]*?S\.U\.S\.S\.)|(?:Suma\s+de\s+Rem\.\s*1\s*:)/i.test(texto);

  let tipo;
  if (esF931 && !esVep) tipo = 'F931';
  else if (esVep && !esF931) tipo = 'VEP';
  else if (esF931 && esVep) tipo = 'F931 (con marcadores VEP)';
  else tipo = 'DESCONOCIDO';

  return { tipo, esVep, esF931 };
}

// ============================================================
// EXTRACCION DE CAMPOS F.931
// ============================================================

function extraerF931(texto) {
  return {
    cuit:                    buscarString(texto, /C\.U\.I\.T\.\s*(\d{2}-?\d{8}-?\d)/i),
    // Razon social aparece despues del label, antes de un nro verificador (4-7 digitos)
    // y de "Suma de Rem. 8:" — captura todo el bloque entre esos anclajes.
    razon_social:            buscarString(texto, /Apellido y Nombre o Raz[oó]n Social:[\s\S]{0,80}?\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.\s]+?)\s+\d{4,7}\s+Suma de Rem/i),
    periodo:                 buscarString(texto, /Mes\s*-\s*A[ñn]o[\s\S]{0,80}?(\d{1,2}\/\d{4})/i),
    nro_verificador:         buscarString(texto, /Nro\.\s*Verificador[:\s\S]{0,40}?(\d{4,})/i),
    cantidad_trabajadores:   buscarEntero(texto, /Empleados en n[oó]mina\s*:/i),

    // Sumas de Remuneraciones (1 a 10)
    rem_1:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*1\s*:/i),
    rem_2:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*2\s*:/i),
    rem_3:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*3\s*:/i),
    rem_4:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*4\s*:/i),
    rem_5:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*5\s*:/i),
    rem_6:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*6\s*:/i),
    rem_7:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*7\s*:/i),
    rem_8:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*8\s*:/i),
    rem_9:  buscarMonto(texto, /Suma\s+de\s+Rem\.\s*9\s*:/i),
    rem_10: buscarMonto(texto, /Suma\s+de\s+Rem\.\s*10\s*:/i),

    // Asignaciones familiares pagadas (en seccion I)
    asignaciones_familiares: buscarMonto(texto, /b\s*-?\s*Asignaciones familiares pagadas/i),

    // Bloque VIII - Montos que se ingresan (forma canonica)
    contrib_ss_351: buscarMonto(texto, /351\s*-?\s*Contribuciones de Seguridad Social/i),
    aporte_ss_301:  buscarMonto(texto, /301\s*-?\s*Aportes de Seguridad Social/i),
    contrib_os_352: buscarMonto(texto, /352\s*-?\s*Contribuciones de Obra Social/i),
    aporte_os_302:  buscarMonto(texto, /302\s*-?\s*Aportes de Obra Social/i),
    art:            buscarMonto(texto, /312\s*-?\s*L\.R\.T\./i),
    scvo:           buscarMonto(texto, /028\s*-?\s*Seguro Colectivo de Vida Obligatorio/i),

    // Otros conceptos secundarios (campos_extra)
    // El label completo es "270 - Vales Alimentarios/Cajas de alimentos" — tolerar
    // texto intermedio antes del monto.
    vales_270:      buscarMonto(texto, /270\s*-?\s*Vales\s+Alimentarios[\s\S]{0,40}?/i),
    renatre_360:    buscarMonto(texto, /360\s*-?\s*Contribuciones RENATRE/i),
    sepelio_uatre_935: buscarMonto(texto, /935\s*-?\s*Seg\.\s*Sepelio UATRE/i),
    detraccion_art23:  buscarMonto(texto, /b3\s*-?\s*Detracci[oó]n art\.\s*23 Ley 27\.541/i),
  };
}

// ============================================================
// EXTRACCION DE CAMPOS VEP (para informacion, no se usa)
// ============================================================

function extraerVep(texto) {
  return {
    nro_vep:        buscarString(texto, /Nro\.\s*VEP\s*:\s*(\d+)/i),
    tipo_pago:      buscarString(texto, /Tipo de Pago\s*:\s*([^\n]+)/i),
    descripcion:    buscarString(texto, /Descripci[oó]n Reducida\s*:\s*([^\n]+)/i),
    cuit:           buscarString(texto, /CUIT\s*:\s*(\d{2}-?\d{8}-?\d)/i),
    periodo:        buscarString(texto, /Per[ií]odo\s*:\s*(\d{4}-\d{2})/i),
    importe_total:  buscarMonto(texto, /Importe total a pagar/i),

    // Tambien tiene los conceptos (351, 301, 352, 302, 312, 28)
    contrib_ss_351: buscarMonto(texto, /CONTRIBUCIONES SEG\.\s*SOCIAL[\s\S]{0,30}?\(351\)\s*\$?/i),
    aporte_ss_301:  buscarMonto(texto, /EMPLEADOR-APORTES SEG\.\s*SOCIAL[\s\S]{0,30}?\(301\)\s*\$?/i),
    contrib_os_352: buscarMonto(texto, /CONTRIBUCIONES OBRA SOCIAL[\s\S]{0,30}?\(352\)\s*\$?/i),
    aporte_os_302:  buscarMonto(texto, /APORTES OBRAS SOCIALES\s*\(302\)\s*\$?/i),
    art_312:        buscarMonto(texto, /ASEG\.RIESGO DE TRABAJO[\s\S]{0,40}?\(312\)\s*\$?/i),
    scvo_28:        buscarMonto(texto, /SEGURO DE VIDA COLECTIVO\s*\(28\)\s*\$?/i),
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('\n🔍 Exploracion de PDFs F.931');
  console.log('=====================================================');
  console.log(`Directorio: ${DIR_PDFS}`);

  // Crear directorio de output
  fs.mkdirSync(DIR_OUT, { recursive: true });
  console.log(`Texto crudo se guarda en: ${DIR_OUT}\n`);

  // Listar PDFs
  let archivos;
  try {
    archivos = fs.readdirSync(DIR_PDFS).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  } catch (e) {
    console.error(`❌ No se puede leer ${DIR_PDFS}: ${e.message}`);
    process.exit(1);
  }

  console.log(`Encontrados ${archivos.length} PDFs\n`);

  const resumenes = [];

  for (const archivo of archivos) {
    const rutaPdf = path.join(DIR_PDFS, archivo);
    console.log('─'.repeat(70));
    console.log(`📄 ${archivo}`);

    let pdfBuffer;
    try {
      pdfBuffer = fs.readFileSync(rutaPdf);
    } catch (e) {
      console.log(`  ❌ No se pudo leer el archivo: ${e.message}`);
      continue;
    }

    let parser;
    let parsed;
    try {
      parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
      parsed = await parser.getText();
    } catch (e) {
      console.log(`  ❌ pdf-parse fallo: ${e.message}`);
      if (parser) await parser.destroy().catch(() => {});
      continue;
    }
    await parser.destroy().catch(() => {});

    const texto = parsed.text || '';
    const { tipo, esVep, esF931 } = detectarTipo(texto);
    const numPages = parsed.total ?? parsed.pages?.length ?? '?';
    console.log(`  Tipo detectado: ${tipo}   (esF931=${esF931}, esVep=${esVep})`);
    console.log(`  Texto extraido: ${texto.length} chars, paginas: ${numPages}`);

    // Guardar texto crudo para debug
    const slug = archivo.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.pdf$/i, '.txt');
    fs.writeFileSync(path.join(DIR_OUT, slug), texto, 'utf8');

    if (tipo === 'F931' || tipo.startsWith('F931')) {
      const campos = extraerF931(texto);
      mostrarCampos('Campos F.931 extraidos', campos);
      resumenes.push({ archivo, tipo, ...resumirF931(campos) });
    } else if (tipo === 'VEP') {
      const campos = extraerVep(texto);
      mostrarCampos('Campos VEP extraidos', campos);
      resumenes.push({ archivo, tipo, vep_nro: campos.nro_vep, vep_periodo: campos.periodo, vep_importe: campos.importe_total });
    } else {
      console.log('  ⚠️  Formato desconocido. Primeros 200 chars del texto:');
      console.log('    ' + texto.substring(0, 200).replace(/\n/g, ' '));
    }
  }

  // Tabla resumen final
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('RESUMEN GLOBAL');
  console.log('═'.repeat(70));
  for (const r of resumenes) {
    console.log(JSON.stringify(r, null, 2));
  }

  console.log(`\n✅ Listo. Textos crudos guardados en: ${DIR_OUT}\n`);
}

function mostrarCampos(titulo, campos) {
  console.log(`  ${titulo}:`);
  for (const [k, v] of Object.entries(campos)) {
    const valStr = v === null ? '(no encontrado)' :
                   typeof v === 'number' ? v.toLocaleString('es-AR', { minimumFractionDigits: 2 }) :
                   String(v);
    const marca = v === null ? '⚠️ ' : '  ';
    console.log(`    ${marca}${k.padEnd(28)} ${valStr}`);
  }
}

function resumirF931(campos) {
  return {
    cuit: campos.cuit,
    periodo: campos.periodo,
    empleados: campos.cantidad_trabajadores,
    rem_1: campos.rem_1,
    aporte_ss_301: campos.aporte_ss_301,
    contrib_ss_351: campos.contrib_ss_351,
    aporte_os_302: campos.aporte_os_302,
    contrib_os_352: campos.contrib_os_352,
    art: campos.art,
    scvo: campos.scvo,
  };
}

main().catch((e) => {
  console.error('\n❌ Error fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});
