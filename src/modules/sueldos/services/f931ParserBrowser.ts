// ============================================================
// SERVICIO (browser): Parser F.931 / VEP con pdf.js
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Port del backend server/services/f931Parser.js al navegador. La ÚNICA
// diferencia es la extracción de texto: antes pdf-parse (Node), ahora pdf.js
// (pdfjs-dist) en el browser. Toda la lógica de regex/extracción es idéntica al
// original (validada contra los 15 PDFs reales). Así el módulo Sueldos parsea el
// F.931 sin backend on-prem.
//
// El texto se reconstruye agrupando los items por coordenada Y (una línea por
// fila visual), para preservar los saltos de línea que algunas regex usan.
// ============================================================

import * as pdfjsLib from 'pdfjs-dist';
// Worker de pdf.js servido por Vite (?url -> ruta del asset)
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { F931ParseResult, F931ParsedFields } from '../types/sueldos';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const SURVISION_CUIT = '30-70967266-1';

// ------------------------------------------------------------
// Extracción de texto del PDF (reconstruye líneas por coordenada Y)
// ------------------------------------------------------------
async function extraerTextoPDF(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Agrupar items por Y (redondeado) -> cada grupo es una "línea".
    const lineas = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      if (typeof it.str !== 'string' || it.str === '') continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!lineas.has(y)) lineas.set(y, []);
      lineas.get(y)!.push({ x, str: it.str });
    }
    // Ordenar líneas por Y descendente (arriba -> abajo) y dentro por X ascendente.
    const ys = [...lineas.keys()].sort((a, b) => b - a);
    const texto = ys
      .map((y) => lineas.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '))
      .join('\n');
    paginas.push(texto);
  }
  await (doc as { destroy?: () => Promise<void> }).destroy?.();
  return paginas.join('\n');
}

// ------------------------------------------------------------
// Helpers de parsing (idénticos al backend)
// ------------------------------------------------------------
function parsearMontoAR(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const limpio = String(raw).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}
function buscarMonto(texto: string, regexLabel: RegExp): number | null {
  const re = new RegExp(regexLabel.source + '\\s*([\\d.]+,\\d{2})', regexLabel.flags || '');
  const match = texto.match(re);
  return match ? parsearMontoAR(match[1]) : null;
}
function buscarEntero(texto: string, regexLabel: RegExp): number | null {
  const re = new RegExp(regexLabel.source + '\\s*(\\d+)', regexLabel.flags || '');
  const match = texto.match(re);
  return match ? parseInt(match[1], 10) : null;
}
function buscarString(texto: string, regexConCaptura: RegExp): string | null {
  const match = texto.match(regexConCaptura);
  return match ? match[1].trim() : null;
}
function soloDigitos(s: string | null | undefined): string {
  return String(s || '').replace(/\D/g, '');
}

// ------------------------------------------------------------
// Detección del tipo de documento
// ------------------------------------------------------------
function detectarTipo(texto: string) {
  const esVep = /Volante\s+Electr[oó]nico\s+de\s+Pago|Nro\.\s*VEP\s*:/i.test(texto);
  const esF931 = /(?:Declaraci[oó]n\s+Jurada[\s\S]*?S\.U\.S\.S\.)|(?:Suma\s+de\s+Rem\.\s*1\s*:)/i.test(texto);
  if (esF931) return { tipo: 'F931' as const, esVep, esF931 };
  if (esVep) return { tipo: 'VEP' as const, esVep, esF931 };
  return { tipo: 'DESCONOCIDO' as const, esVep, esF931 };
}

// ------------------------------------------------------------
// Extracción F.931
// ------------------------------------------------------------
function extraerCamposF931(texto: string) {
  const cuit = buscarString(texto, /C\.U\.I\.T\.\s*(\d{2}-?\d{8}-?\d)/i);
  const razon_social = buscarString(
    texto,
    /Apellido y Nombre o Raz[oó]n Social:[\s\S]{0,80}?\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ.\s]+?)\s+\d{4,7}\s+Suma de Rem/i,
  );
  const periodoStr = buscarString(texto, /Mes\s*-\s*A[ñn]o[\s\S]{0,80}?(\d{1,2}\/\d{4})/i);

  let periodo: { mes: number; anio: number } | null = null;
  if (periodoStr) {
    const [mm, yyyy] = periodoStr.split('/').map((s) => parseInt(s, 10));
    if (Number.isFinite(mm) && Number.isFinite(yyyy)) periodo = { mes: mm, anio: yyyy };
  }

  const campos: F931ParsedFields = {
    cantidad_trabajadores: buscarEntero(texto, /Empleados en n[oó]mina\s*:/i),
    rem_total: null,
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
    total_a_depositar: null,
    campos_extra: null,
  };

  const items: (number | null)[] = [campos.contrib_ss_351, campos.aporte_ss_301, campos.contrib_os_352, campos.aporte_os_302, campos.art, campos.scvo];
  const suma = items.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (suma > 0) campos.total_a_depositar = Math.round(suma * 100) / 100;

  campos.campos_extra = {
    razon_social,
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

// ------------------------------------------------------------
// Extracción VEP
// ------------------------------------------------------------
function extraerCamposVep(texto: string) {
  const cuit = buscarString(texto, /CUIT\s*:\s*(\d{2}-?\d{8}-?\d)/i);
  const periodoStr = buscarString(texto, /Per[ií]odo\s*:\s*(\d{4}-\d{2})/i);

  let periodo: { mes: number; anio: number } | null = null;
  if (periodoStr) {
    const [yyyy, mm] = periodoStr.split('-').map((s) => parseInt(s, 10));
    if (Number.isFinite(mm) && Number.isFinite(yyyy)) periodo = { mes: mm, anio: yyyy };
  }

  const campos: F931ParsedFields = {
    cantidad_trabajadores: null,
    rem_total: null,
    rem_1: null, rem_2: null, rem_3: null, rem_4: null, rem_5: null,
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

// ------------------------------------------------------------
// API principal (mismo contrato que el backend, pero recibe File)
// ------------------------------------------------------------
export async function parsearF931Browser(
  file: File,
  options: { cuitEsperado?: string; periodoEsperado?: { anio: number; mes: number } } = {},
): Promise<F931ParseResult> {
  const cuitEsperado = options.cuitEsperado || SURVISION_CUIT;
  const periodoEsperado = options.periodoEsperado;

  let texto = '';
  try {
    const buf = await file.arrayBuffer();
    if (!buf || buf.byteLength === 0) {
      return { ok: false, error: { codigo: 'PDF_INVALIDO', mensaje: 'Archivo vacío o inválido' } };
    }
    texto = await extraerTextoPDF(buf);
  } catch (e) {
    return { ok: false, error: { codigo: 'PDF_INVALIDO', mensaje: 'No se pudo abrir el PDF', detalle: (e as Error).message } };
  }

  if (!texto || texto.trim().length === 0) {
    return { ok: false, error: { codigo: 'TEXTO_NO_EXTRACTABLE', mensaje: 'El PDF no contiene texto extraíble (puede ser escaneado/imagen)' } };
  }

  const { tipo } = detectarTipo(texto);
  if (tipo === 'DESCONOCIDO') {
    return { ok: false, error: { codigo: 'FORMATO_NO_F931', mensaje: 'El PDF no parece ser un F.931 ni un VEP (formato desconocido)', detalle: `Primeros 200 chars: ${texto.substring(0, 200).replace(/\n/g, ' ')}` } };
  }

  const extraido = tipo === 'F931' ? extraerCamposF931(texto) : extraerCamposVep(texto);

  const cuitDetectado = extraido.cuit || null;
  const cuitCoincide = cuitDetectado ? soloDigitos(cuitDetectado) === soloDigitos(cuitEsperado) : false;

  const warnings: string[] = [];
  if (tipo === 'VEP') warnings.push('El PDF subido parece un VEP (Volante Electrónico de Pago) en vez de un F.931. Se extrajeron los códigos conocidos como referencia, pero conviene reemplazarlo por el F.931 oficial.');
  if (!cuitDetectado) warnings.push('No se pudo detectar el CUIT en el documento.');
  else if (!cuitCoincide) warnings.push(`CUIT del documento (${cuitDetectado}) no coincide con el esperado (${cuitEsperado}).`);
  if (!extraido.periodo) warnings.push('No se pudo detectar el período (mes/año) en el documento.');
  else if (periodoEsperado) {
    if (extraido.periodo.anio !== periodoEsperado.anio || extraido.periodo.mes !== periodoEsperado.mes) {
      warnings.push(`Período del documento (${String(extraido.periodo.mes).padStart(2, '0')}/${extraido.periodo.anio}) no coincide con el esperado (${String(periodoEsperado.mes).padStart(2, '0')}/${periodoEsperado.anio}).`);
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
