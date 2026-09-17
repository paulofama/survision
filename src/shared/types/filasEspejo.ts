// ============================================================
// Formas de las filas de las tablas espejo de GECLISA
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
//
// POR QUÉ EXISTE
// --------------
// `movimientos_geclisa`, `prestadores` y `honorarios_config` las consultan los
// mismos tres hooks (conciliación de costos, evolución mensual y su detalle) y
// cada uno traía las filas como `any`. Tipar cada uno por su cuenta habría
// dejado tres definiciones de lo mismo, que es cómo se empieza a divergir.
//
// Son el RECORTE que piden los `select`, no la tabla entera: si una consulta
// necesita una columna más, se extiende la interface acá y el compilador marca
// a quién le falta.
//
// Todo lo que puede venir nulo se declara nulable. Las columnas de GECLISA lo
// hacen —un movimiento sin prestador asignado, una atención sin obra social—, y
// dar por sentado que están rompe recién en producción, con un dato raro.
// ============================================================

import type { RecetaIndexable } from '@shared/utils/buscadorRecetas';

/**
 * Fila del espejo de atenciones, a grano atención × práctica × prestador.
 *
 * Ojo con `total`: es el importe de la ATENCIÓN, repetido en cada fila. Sumarlo
 * sin filtrar por `es_principal` multiplica la plata — ver la memoria del bug
 * de sumar en el grano equivocado.
 */
export interface FilaMovimiento {
  anio: number;
  mes: number;
  practica_codigo: string | null;
  practica_nombre: string | null;
  prestador_nombre: string | null;
  total: number | null;
}

/** `FilaMovimiento` con la fecha y la obra social, para los listados. */
export interface FilaMovimientoDetalle extends FilaMovimiento {
  fecha: string | null;
  os_sigla: string | null;
  os_nombre: string | null;
}

/** Espejo de prestadores. `es_socio` lo togglea el usuario y el sync lo respeta. */
export interface FilaPrestador {
  nombre: string | null;
  es_socio: boolean | null;
}

/** Porcentajes de honorarios por segmento (Consultas / Estudios / Cirugías). */
export interface FilaHonorarioConfig {
  segmento: string;
  porcentaje_socio: number;
  porcentaje_no_socio: number;
}

/**
 * Receta de costos con sus dos columnas de costo.
 *
 * Extiende `RecetaIndexable` (código + nombre) porque es lo que necesita
 * `crearIndiceRecetas` para cruzar lo facturado contra la receta.
 */
export interface FilaRecetaCosto extends RecetaIndexable {
  costo_total_pools: number | null;
  costo_insumos_directos: number | null;
}
