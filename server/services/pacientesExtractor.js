// ============================================================
// SERVICIO: Extractor de pacientes GECLISA -> Supabase
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
//
// Replica la lógica del viejo endpoint /api/pacientes/buscar-dni pero para
// TODOS los pacientes: corre la query compleja en GECLISA (Ficha + FichaPlan +
// Planes + ObrasSociales + MovEnca), resuelve la obra social de cada uno, y
// escribe el resultado PLANO en la tabla Supabase `pacientes_geclisa`.
//
// Así el Presupuestador (frontend remoto) busca por DNI en Supabase, sin pegarle
// a GECLISA en vivo. Lo dispara el daemon de sync on-prem y el CLI de carga.
//
// Patrón: igual que ivaExtractor.js (módulo Fiscal).
// ============================================================

const { executeQuery } = require('../config/database');
const { supabase } = require('../config/supabase'); // service_role -> bypassa RLS

// ------------------------------------------------------------
// QUERY: todos los pacientes con su OS resuelta (fp_* y me_*).
// Es la misma de buscar-dni pero sin WHERE/TOP (una fila por Ficha).
// ------------------------------------------------------------
const QUERY_TODOS = `
  SELECT
    f.Ficha_id,
    RTRIM(LTRIM(f.fic_ape)) AS apellido,
    RTRIM(LTRIM(f.fic_nombre)) AS nombre,
    RTRIM(LTRIM(f.fic_nrodoc)) AS documento,
    RTRIM(LTRIM(ISNULL(f.fic_cel, f.fic_tele))) AS telefono,
    f.fic_fechanac AS fechaNacimiento,
    RTRIM(LTRIM(ISNULL(f.fic_email, ''))) AS email,

    os_fp.os_id AS fp_os_id,
    RTRIM(LTRIM(os_fp.os_nombre)) AS fp_obraSocial,
    RTRIM(LTRIM(os_fp.os_sigla)) AS fp_obraSocialSigla,
    os_fp.esParticular AS fp_esParticular,
    RTRIM(LTRIM(ISNULL(fp.Nro_Afiliado, ''))) AS fp_numeroAfiliado,
    ISNULL(p_fp.plan_nombre, '') AS fp_planNombre,

    os_me.os_id AS me_os_id,
    RTRIM(LTRIM(os_me.os_nombre)) AS me_obraSocial,
    RTRIM(LTRIM(os_me.os_sigla)) AS me_obraSocialSigla,
    os_me.esParticular AS me_esParticular,
    RTRIM(LTRIM(ISNULL(me_last.Nro_Afiliado, ''))) AS me_numeroAfiliado,
    ISNULL(p_me.plan_nombre, '') AS me_planNombre
  FROM Ficha f
  LEFT JOIN (
    SELECT
      fp2.Ficha_id, fp2.Plan_id, fp2.Nro_Afiliado,
      ROW_NUMBER() OVER (
        PARTITION BY fp2.Ficha_id
        ORDER BY
          CASE WHEN os_chk.esParticular = 1 OR os_chk.esParticular IS NULL THEN 1 ELSE 0 END,
          fp2.FicPlan_id DESC
      ) AS rn
    FROM FichaPlan fp2
    LEFT JOIN Planes p_chk ON fp2.Plan_id = p_chk.plan_id
    LEFT JOIN ObrasSociales os_chk ON p_chk.os_id = os_chk.os_id
  ) fp ON f.Ficha_id = fp.Ficha_id AND fp.rn = 1
  LEFT JOIN Planes p_fp ON fp.Plan_id = p_fp.plan_id
  LEFT JOIN ObrasSociales os_fp ON p_fp.os_id = os_fp.os_id
  LEFT JOIN (
    SELECT
      me2.Ficha_id, me2.Os_id, me2.Plan_id, me2.Nro_Afiliado, me2.Me_Fecha,
      ROW_NUMBER() OVER (PARTITION BY me2.Ficha_id ORDER BY me2.Me_Fecha DESC, me2.Me_id DESC) AS rn
    FROM MovEnca me2
    WHERE me2.Os_id IS NOT NULL AND me2.Os_id > 0
  ) me_last ON f.Ficha_id = me_last.Ficha_id AND me_last.rn = 1
  LEFT JOIN Planes p_me ON me_last.Plan_id = p_me.plan_id
  LEFT JOIN ObrasSociales os_me ON me_last.Os_id = os_me.os_id
`;

// ------------------------------------------------------------
// Helpers de formato (idénticos al endpoint original)
// ------------------------------------------------------------
function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/(?:^|\s|[-/.(])\S/g, (c) => c.toUpperCase());
}
function toUpperTrim(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toUpperCase();
}

// Resuelve la OS con la misma prioridad que buscar-dni: FichaPlan no-particular
// -> MovEnca no-particular -> FichaPlan particular -> MovEnca particular -> Particular.
function resolverOS(pac) {
  if (pac.fp_os_id && pac.fp_esParticular !== true && pac.fp_esParticular !== 1) {
    return { obraSocial: pac.fp_obraSocial || '', obraSocialSigla: pac.fp_obraSocialSigla || '', esParticular: false, numeroAfiliado: pac.fp_numeroAfiliado || '', planNombre: pac.fp_planNombre || '' };
  }
  if (pac.me_os_id && pac.me_esParticular !== true && pac.me_esParticular !== 1) {
    return { obraSocial: pac.me_obraSocial || '', obraSocialSigla: pac.me_obraSocialSigla || '', esParticular: false, numeroAfiliado: pac.me_numeroAfiliado || '', planNombre: pac.me_planNombre || '' };
  }
  if (pac.fp_os_id) {
    return { obraSocial: pac.fp_obraSocial || 'Particular', obraSocialSigla: pac.fp_obraSocialSigla || '', esParticular: true, numeroAfiliado: '', planNombre: '' };
  }
  if (pac.me_os_id) {
    return { obraSocial: pac.me_obraSocial || 'Particular', obraSocialSigla: pac.me_obraSocialSigla || '', esParticular: true, numeroAfiliado: '', planNombre: '' };
  }
  return { obraSocial: 'Particular', obraSocialSigla: '', esParticular: true, numeroAfiliado: '', planNombre: '' };
}

function mapearFila(pac) {
  const os = resolverOS(pac);
  let fechaNac = null;
  if (pac.fechaNacimiento) {
    const d = new Date(pac.fechaNacimiento);
    if (!isNaN(d.getTime())) fechaNac = d.toISOString().split('T')[0];
  }
  return {
    ficha_id: pac.Ficha_id,
    documento: (pac.documento || '').trim().replace(/\D/g, ''),
    apellido: toTitleCase(pac.apellido),
    nombre: toTitleCase(pac.nombre),
    telefono: (pac.telefono || '').trim(),
    fecha_nacimiento: fechaNac,
    email: ((pac.email || '').trim().toLowerCase()) || null,
    obra_social: os.esParticular ? '' : toUpperTrim(os.obraSocial),
    obra_social_sigla: toUpperTrim(os.obraSocialSigla),
    numero_afiliado: (os.numeroAfiliado || '').trim(),
    plan_nombre: toUpperTrim(os.planNombre),
    es_particular: os.esParticular,
  };
}

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

/** Lee todos los pacientes de GECLISA y los devuelve planos (filtra docs < 6 dígitos). */
async function extraerPacientes() {
  const r = await executeQuery(QUERY_TODOS, {});
  return (r.recordset || [])
    .map(mapearFila)
    .filter((p) => p.documento && p.documento.length >= 6);
}

/** Sincroniza GECLISA -> Supabase (borra todo + inserta en lotes). */
async function sincronizarPacientes({ write = false } = {}) {
  const filas = await extraerPacientes();
  if (!write) return { total: filas.length, escrito: false };

  const { error: delErr } = await supabase.from('pacientes_geclisa').delete().neq('ficha_id', -1);
  if (delErr) throw new Error('delete: ' + delErr.message);

  let insertados = 0;
  const LOTE = 500;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await supabase.from('pacientes_geclisa').insert(lote);
    if (error) throw new Error(`insert lote ${i}: ${error.message}`);
    insertados += lote.length;
  }
  return { total: filas.length, insertados, escrito: true };
}

/** Compara cantidad de Fichas GECLISA vs filas en Supabase (para decidir si re-sync). */
async function freshness() {
  const r = await executeQuery('SELECT COUNT(*) AS n FROM Ficha', {});
  const geclisa = r.recordset[0].n;
  const { count } = await supabase.from('pacientes_geclisa').select('*', { count: 'exact', head: true });
  return { geclisa, supabase: count ?? 0, stale: geclisa !== (count ?? 0) };
}

module.exports = { extraerPacientes, sincronizarPacientes, freshness };
