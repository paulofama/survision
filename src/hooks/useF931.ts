// ===========================================================================
// HOOK: useF931 - MODULO CARGA DE SUELDOS (Fase 3)
// ===========================================================================
// Sistema: SurVision / Sistema Integral de Gestion
// Cliente: Instituto Dr. Mercado / Survision S.A.
// Desarrollo: P. Fama
//
// Orquesta el flujo completo del F.931 para un mes:
//   1. Subir el PDF al endpoint POST /api/f931/parse para extraer campos
//      (preview, sin persistir).
//   2. Confirmado el preview, hacer upload del PDF a Supabase Storage
//      (bucket `sueldos-adjuntos`) + INSERT en f931_declaraciones +
//      INSERT en f931_adjuntos.
//   3. Confirmar la declaracion (PARSEADO_PENDIENTE_REVISION ->
//      REVISADO_CONFIRMADO) o descartarla.
//   4. Editar campos manualmente antes de confirmar.
//   5. Generar URL firmada para descargar el PDF (bucket privado).
//
// Path en Storage: `${anio}/${mes_pad}/${timestamp}_${nombre_archivo}`
//
// API:
//   const {
//     declaracion,                  // F931Declaracion | null
//     adjuntos,                     // F931Adjunto[]
//     loading, error, refetch,
//
//     parsearPdf,                   // (file) => Promise<ResultadoOperacion<F931ParseResult>>
//     crearDeclaracion,             // (datos, nombreUsuario?) => ResultadoOperacion<F931Declaracion>
//     actualizarCampos,             // (id, cambios) => ResultadoOperacion<F931Declaracion>
//     confirmar,                    // (id, nombreUsuario?) => ResultadoOperacion<F931Declaracion>
//     descartar,                    // (id) => ResultadoOperacion<F931Declaracion>
//     eliminarAdjunto,              // (id) => ResultadoOperacion<void>
//     obtenerUrlDescarga,           // (bucketPath, ttlSeg?) => Promise<string | null>
//   } = useF931(2026, 5);
// ===========================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  EstadoF931,
  F931Adjunto,
  F931Declaracion,
  F931DeclaracionActualizacion,
  F931ParseResult,
  F931ParsedFields,
  ResultadoOperacion,
  TipoAdjunto,
} from '../types/sueldos';

// ---------------------------------------------------------------------------
// CACHE MODULE-LEVEL
// ---------------------------------------------------------------------------

interface CacheEntry {
  declaracion: F931Declaracion | null;
  adjuntos: F931Adjunto[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<{ declaracion: F931Declaracion | null; adjuntos: F931Adjunto[] }>>();

const CACHE_TTL_MS = 60 * 1000;
const BUCKET = 'sueldos-adjuntos';

function cacheKey(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

function isCacheValid(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export function invalidarCacheF931(anio?: number, mes?: number): void {
  if (anio === undefined || mes === undefined) cache.clear();
  else cache.delete(cacheKey(anio, mes));
}

// ---------------------------------------------------------------------------
// FETCH LA DECLARACION + ADJUNTOS
// ---------------------------------------------------------------------------

async function fetchDeclaracionConAdjuntos(
  anio: number,
  mes: number,
  force = false
): Promise<{ declaracion: F931Declaracion | null; adjuntos: F931Adjunto[] }> {
  const key = cacheKey(anio, mes);

  if (!force && isCacheValid(key)) {
    const c = cache.get(key)!;
    return { declaracion: c.declaracion, adjuntos: c.adjuntos };
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    // 1. Buscar declaracion (puede haber varias por periodo si hubo cambios;
    //    tomamos la mas reciente que no este DESCARTADA, sino la mas reciente).
    const { data: rows, error: declErr } = await supabase
      .from('f931_declaraciones')
      .select('*')
      .eq('anio', anio)
      .eq('mes', mes)
      .order('created_at', { ascending: false })
      .limit(5);

    if (declErr) {
      throw new Error(declErr.message || 'Error cargando F931');
    }

    let declaracion: F931Declaracion | null = null;
    if (rows && rows.length > 0) {
      // Preferir REVISADO_CONFIRMADO > PARSEADO_PENDIENTE_REVISION > DESCARTADO
      const prioridad: Record<EstadoF931, number> = {
        REVISADO_CONFIRMADO: 3,
        PARSEADO_PENDIENTE_REVISION: 2,
        DESCARTADO: 1,
      };
      declaracion = [...rows].sort(
        (a, b) =>
          (prioridad[b.estado as EstadoF931] ?? 0) -
            (prioridad[a.estado as EstadoF931] ?? 0) ||
          (new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      )[0] as F931Declaracion;
    }

    // 2. Buscar adjuntos
    let adjuntos: F931Adjunto[] = [];
    if (declaracion) {
      const { data: adjRows, error: adjErr } = await supabase
        .from('f931_adjuntos')
        .select('*')
        .eq('declaracion_id', declaracion.id)
        .order('subido_at', { ascending: false });
      if (adjErr) {
        throw new Error(adjErr.message || 'Error cargando adjuntos');
      }
      adjuntos = (adjRows || []) as F931Adjunto[];
    }

    cache.set(key, { declaracion, adjuntos, fetchedAt: Date.now() });
    return { declaracion, adjuntos };
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

// ---------------------------------------------------------------------------
// LLAMAR AL ENDPOINT /api/f931/parse
// ---------------------------------------------------------------------------

async function llamarParseEndpoint(
  file: File,
  anio: number,
  mes: number
): Promise<ResultadoOperacion<F931ParseResult>> {
  try {
    const url = `/api/f931/parse?anio=${anio}&mes=${mes}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });

    const body = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg = body?.error?.mensaje || body?.error || `Error HTTP ${resp.status}`;
      return { ok: false, error: msg, codigo: body?.error?.codigo };
    }
    if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') {
      return { ok: false, error: 'Respuesta inesperada del servidor' };
    }

    return { ok: true, data: body as F931ParseResult };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error desconocido al conectar al backend',
    };
  }
}

// ---------------------------------------------------------------------------
// HELPERS DE STORAGE
// ---------------------------------------------------------------------------

function armarBucketPath(anio: number, mes: number, nombreOriginal: string): string {
  const mm = String(mes).padStart(2, '0');
  const ts = Date.now();
  // Sanitizar nombre: solo letras, numeros, puntos, guiones, underscores
  const slug = nombreOriginal.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return `${anio}/${mm}/${ts}_${slug}`;
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

export interface CrearDeclaracionInput {
  /** El archivo PDF original que la contadora subio. */
  pdfFile: File;
  /** Nombre original del archivo (para la columna nombre_original del adjunto). */
  nombreOriginal: string;
  /** Campos ya parseados y revisados (el usuario pudo editar antes de guardar). */
  campos: F931ParsedFields;
  /** Si el parser detecto que parecia VEP, true. */
  parecioVep: boolean;
  /** Texto crudo del PDF (para guardar en raw_extract_text). */
  rawText?: string | null;
  /** Si true, deja la declaracion ya en REVISADO_CONFIRMADO. */
  confirmarAlGuardar: boolean;
  /** ID de la liquidacion del mes para vincular (opcional). */
  liquidacionId?: string | null;
  /** Tipo de adjunto (por defecto F931_OFICIAL; usar VEP_ERROR si parecioVep). */
  tipoAdjunto?: TipoAdjunto;
}

interface UseF931Return {
  declaracion: F931Declaracion | null;
  adjuntos: F931Adjunto[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;

  parsearPdf: (file: File) => Promise<ResultadoOperacion<F931ParseResult>>;
  crearDeclaracion: (
    datos: CrearDeclaracionInput,
    nombreUsuario?: string
  ) => Promise<ResultadoOperacion<F931Declaracion>>;
  actualizarCampos: (
    id: string,
    cambios: F931DeclaracionActualizacion
  ) => Promise<ResultadoOperacion<F931Declaracion>>;
  confirmar: (
    id: string,
    nombreUsuario?: string
  ) => Promise<ResultadoOperacion<F931Declaracion>>;
  descartar: (id: string) => Promise<ResultadoOperacion<F931Declaracion>>;
  eliminarAdjunto: (id: string) => Promise<ResultadoOperacion<void>>;
  obtenerUrlDescarga: (bucketPath: string, ttlSeg?: number) => Promise<string | null>;
}

export function useF931(anio: number, mes: number): UseF931Return {
  const key = cacheKey(anio, mes);
  const initial = cache.get(key);

  const [declaracion, setDeclaracion] = useState<F931Declaracion | null>(
    initial?.declaracion ?? null
  );
  const [adjuntos, setAdjuntos] = useState<F931Adjunto[]>(initial?.adjuntos ?? []);
  const [loading, setLoading] = useState<boolean>(!isCacheValid(key));
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (force = false): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const { declaracion: d, adjuntos: a } = await fetchDeclaracionConAdjuntos(anio, mes, force);
      setDeclaracion(d);
      setAdjuntos(a);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      console.error(`[useF931 ${anio}-${mes}] Error:`, err);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    if (isCacheValid(key) && cache.get(key)) {
      const c = cache.get(key)!;
      setDeclaracion(c.declaracion);
      setAdjuntos(c.adjuntos);
      setLoading(false);
      return;
    }
    cargar(false);
  }, [key, cargar]);

  const refetch = useCallback(async () => {
    invalidarCacheF931(anio, mes);
    await cargar(true);
  }, [anio, mes, cargar]);

  // ---- Parse (no persiste) ------------------------------------------------

  const parsearPdf = useCallback(
    (file: File) => llamarParseEndpoint(file, anio, mes),
    [anio, mes]
  );

  // ---- Crear declaracion + upload + adjunto -------------------------------

  const crearDeclaracion = useCallback(
    async (
      datos: CrearDeclaracionInput,
      nombreUsuario?: string
    ): Promise<ResultadoOperacion<F931Declaracion>> => {
      try {
        const bucketPath = armarBucketPath(anio, mes, datos.nombreOriginal);

        // 1. Upload del PDF a Storage (primero — si falla evitamos crear filas huerfanas)
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(bucketPath, datos.pdfFile, {
            contentType: datos.pdfFile.type || 'application/pdf',
            upsert: false,
          });
        if (upErr) {
          return {
            ok: false,
            error: `Error subiendo PDF al Storage: ${upErr.message}`,
            codigo: 'STORAGE_UPLOAD_FAIL',
          };
        }

        // 2. INSERT declaracion
        const payloadDecl = {
          cuit: '30-70967266-1',
          cuit_sin_guiones: '30709672661',
          razon_social:
            (datos.campos.campos_extra as { razon_social?: string } | null)?.razon_social ?? 'Survision S.A.',
          anio,
          mes,
          liquidacion_id: datos.liquidacionId ?? null,
          estado: datos.confirmarAlGuardar ? 'REVISADO_CONFIRMADO' : 'PARSEADO_PENDIENTE_REVISION',
          parecio_vep: datos.parecioVep,
          cantidad_trabajadores: datos.campos.cantidad_trabajadores,
          rem_total: datos.campos.rem_total,
          rem_1: datos.campos.rem_1,
          rem_2: datos.campos.rem_2,
          rem_3: datos.campos.rem_3,
          rem_4: datos.campos.rem_4,
          rem_5: datos.campos.rem_5,
          aporte_ss_301: datos.campos.aporte_ss_301,
          aporte_os_302: datos.campos.aporte_os_302,
          contrib_ss_351: datos.campos.contrib_ss_351,
          contrib_os_352: datos.campos.contrib_os_352,
          art: datos.campos.art,
          scvo: datos.campos.scvo,
          asignaciones_familiares: datos.campos.asignaciones_familiares,
          total_a_depositar: datos.campos.total_a_depositar,
          campos_extra: datos.campos.campos_extra,
          raw_extract_text: datos.rawText ?? null,
          parseado_at: new Date().toISOString(),
          confirmado_at: datos.confirmarAlGuardar ? new Date().toISOString() : null,
          confirmado_por_nombre: datos.confirmarAlGuardar ? nombreUsuario || null : null,
        };

        const { data: declData, error: declErr } = await supabase
          .from('f931_declaraciones')
          .insert(payloadDecl)
          .select()
          .single();

        if (declErr) {
          // Cleanup: borrar el archivo
          await supabase.storage.from(BUCKET).remove([bucketPath]).catch(() => {});
          const status = declErr.code === '23505' ? 'F931_DUPLICADO' : undefined;
          return {
            ok: false,
            error: declErr.message,
            codigo: status ?? declErr.code,
          };
        }

        // 3. INSERT adjunto
        const tipoAdjunto: TipoAdjunto =
          datos.tipoAdjunto ?? (datos.parecioVep ? 'VEP_ERROR' : 'F931_OFICIAL');

        const payloadAdj = {
          declaracion_id: (declData as F931Declaracion).id,
          tipo_adjunto: tipoAdjunto,
          bucket_path: bucketPath,
          nombre_original: datos.nombreOriginal,
          mime_type: datos.pdfFile.type || 'application/pdf',
          tamano_bytes: datos.pdfFile.size,
          detectado_como_vep: datos.parecioVep,
          subido_por_nombre: nombreUsuario || null,
        };

        const { error: adjErr } = await supabase.from('f931_adjuntos').insert(payloadAdj);

        if (adjErr) {
          // Cleanup: borrar declaracion + archivo (best effort)
          await supabase.from('f931_declaraciones').delete().eq('id', (declData as F931Declaracion).id);
          await supabase.storage.from(BUCKET).remove([bucketPath]).catch(() => {});
          return {
            ok: false,
            error: `Declaracion creada pero adjunto fallo: ${adjErr.message}`,
            codigo: adjErr.code,
          };
        }

        await refetch();
        return { ok: true, data: declData as F931Declaracion };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido';
        return { ok: false, error: msg };
      }
    },
    [anio, mes, refetch]
  );

  // ---- Actualizar campos --------------------------------------------------

  const actualizarCampos = useCallback(
    async (
      id: string,
      cambios: F931DeclaracionActualizacion
    ): Promise<ResultadoOperacion<F931Declaracion>> => {
      const payload = { ...cambios };
      // Defensiva: no enviar id/timestamps
      delete (payload as Record<string, unknown>).id;
      delete (payload as Record<string, unknown>).created_at;
      delete (payload as Record<string, unknown>).updated_at;

      const { data, error: err } = await supabase
        .from('f931_declaraciones')
        .update(payload)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (err) return { ok: false, error: err.message, codigo: err.code };
      if (!data) return { ok: false, error: 'Declaracion no encontrada' };
      await refetch();
      return { ok: true, data: data as F931Declaracion };
    },
    [refetch]
  );

  // ---- Confirmar ----------------------------------------------------------

  const confirmar = useCallback(
    async (
      id: string,
      nombreUsuario?: string
    ): Promise<ResultadoOperacion<F931Declaracion>> => {
      return actualizarCampos(id, {
        estado: 'REVISADO_CONFIRMADO',
        confirmado_at: new Date().toISOString(),
        confirmado_por_nombre: nombreUsuario || null,
      });
    },
    [actualizarCampos]
  );

  // ---- Descartar ----------------------------------------------------------

  const descartar = useCallback(
    async (id: string): Promise<ResultadoOperacion<F931Declaracion>> => {
      return actualizarCampos(id, { estado: 'DESCARTADO' });
    },
    [actualizarCampos]
  );

  // ---- Eliminar adjunto (Storage + tabla) ---------------------------------

  const eliminarAdjunto = useCallback(
    async (id: string): Promise<ResultadoOperacion<void>> => {
      // Leer primero para saber el bucket_path
      const { data, error: errRead } = await supabase
        .from('f931_adjuntos')
        .select('bucket_path')
        .eq('id', id)
        .maybeSingle();
      if (errRead) return { ok: false, error: errRead.message };
      if (!data) return { ok: false, error: 'Adjunto no encontrado' };

      // Borrar fila
      const { error: errDel } = await supabase.from('f931_adjuntos').delete().eq('id', id);
      if (errDel) return { ok: false, error: errDel.message };

      // Borrar de Storage (best effort)
      await supabase.storage.from(BUCKET).remove([data.bucket_path as string]).catch(() => {});

      await refetch();
      return { ok: true, data: undefined };
    },
    [refetch]
  );

  // ---- URL firmada para descargar -----------------------------------------

  const obtenerUrlDescarga = useCallback(
    async (bucketPath: string, ttlSeg = 300): Promise<string | null> => {
      const { data, error: err } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(bucketPath, ttlSeg);
      if (err) {
        console.error('[useF931] Error generando URL firmada:', err);
        return null;
      }
      return data?.signedUrl ?? null;
    },
    []
  );

  return {
    declaracion,
    adjuntos,
    loading,
    error,
    refetch,
    parsearPdf,
    crearDeclaracion,
    actualizarCampos,
    confirmar,
    descartar,
    eliminarAdjunto,
    obtenerUrlDescarga,
  };
}

export default useF931;
