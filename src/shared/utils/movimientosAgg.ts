// ============================================================
// Agregación de movimientos (cliente) — reemplaza stats-periodo del backend
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Reconstruye, desde el espejo `movimientos_geclisa` (grano atención×práctica×
// prestador), las mismas vistas que daba /api/movimientos/stats-periodo:
//   - totales / por OS / listado  -> grano ATENCIÓN (filas es_principal)
//   - por prestador               -> PRORRATEO (atención,prestador) distintos
//   - por prestación / por grupo  -> grano (atención,práctica) distinto
// Filtros os/prestador/grupo se aplican a NIVEL ATENCIÓN (igual que el backend).
// ============================================================

import type {
  PrestacionRealizada,
  TotalesPeriodo,
  StatsPorObraSocial,
  StatsPorPrestador,
  StatsPorPrestacion,
  StatsPorGrupo,
  FiltrosPrestaciones,
} from '../hooks/useMovimientosPrestaciones';

// Fila cruda tal como viene de la tabla movimientos_geclisa
export interface MovGecRow {
  atencion_id: number;
  mp_id: number;
  pre_id: number;
  fecha: string;
  anio: number;
  mes: number;
  dia: number;
  hora: number | null;
  paciente: string | null;
  edad: number | null;
  diagnostico: string | null;
  estado: string | null;
  usuario_alta: string | null;
  os_id: number | null;
  os_sigla: string | null;
  os_nombre: string | null;
  practica_codigo: string | null;
  practica_nombre: string | null;
  grupo_id: number | null;
  grupo_nombre: string | null;
  prestador_nombre: string | null;
  derivador_id: number | null;
  derivador: string | null;
  coseguro: number;
  cobertura: number;
  total: number;
  cant_prestadores: number;
  es_principal: boolean;
}

const num = (v: unknown) => Number(v) || 0;

// ------------------------------------------------------------
// Filtro a NIVEL ATENCIÓN (igual que el whereClause con EXISTS del backend):
// devuelve solo las filas de las atenciones que cumplen os/prestador/grupo.
// ------------------------------------------------------------
export function filtrarAtenciones(
  filas: MovGecRow[],
  f: { obraSocialId?: string; prestadorId?: string; grupoPracticas?: string },
): MovGecRow[] {
  const os = f.obraSocialId ? parseInt(f.obraSocialId, 10) : null;
  const pre = f.prestadorId ? parseInt(f.prestadorId, 10) : null;
  const grupo = f.grupoPracticas ? parseInt(f.grupoPracticas, 10) : null;
  if (os == null && pre == null && grupo == null) return filas;

  // atenciones que cumplen cada criterio (EXISTS a nivel atención)
  const ok = new Set<number>();
  const noOk = new Set<number>();
  const porAtencion = new Map<number, MovGecRow[]>();
  for (const r of filas) {
    if (!porAtencion.has(r.atencion_id)) porAtencion.set(r.atencion_id, []);
    porAtencion.get(r.atencion_id)!.push(r);
  }
  for (const [aid, rows] of porAtencion) {
    const cumpleOs = os == null || rows[0].os_id === os;
    const cumplePre = pre == null || rows.some((r) => r.pre_id === pre);
    const cumpleGrupo = grupo == null || rows.some((r) => r.grupo_id === grupo);
    if (cumpleOs && cumplePre && cumpleGrupo) ok.add(aid);
    else noOk.add(aid);
  }
  return filas.filter((r) => ok.has(r.atencion_id));
}

// ------------------------------------------------------------
// Totales (grano atención: filas principales)
// ------------------------------------------------------------
export function calcularTotales(filas: MovGecRow[]): TotalesPeriodo {
  const principales = filas.filter((r) => r.es_principal);
  let coseguro = 0;
  let cobertura = 0;
  for (const r of principales) { coseguro += num(r.coseguro); cobertura += num(r.cobertura); }
  return {
    atenciones: principales.length,
    practicas: principales.length, // el backend usa COUNT(Me_id) también para "prácticas"
    coseguro,
    cobertura,
    ingresos: coseguro + cobertura,
  };
}

function pct(parte: number, total: number): string {
  return total > 0 ? ((parte / total) * 100).toFixed(1) : '0.0';
}

// ------------------------------------------------------------
// Por Obra Social (grano atención)
// ------------------------------------------------------------
export function porObraSocial(filas: MovGecRow[], totalIngresos: number): StatsPorObraSocial[] {
  const map = new Map<number, StatsPorObraSocial>();
  for (const r of filas) {
    if (!r.es_principal) continue;
    const id = r.os_id ?? 0;
    let e = map.get(id);
    if (!e) {
      e = { os_id: id, sigla: (r.os_sigla || 'S/D'), nombre: (r.os_nombre || 'Sin OS'), cantidad: 0, coseguro: 0, cobertura: 0, total_ingresos: 0, porcentaje: '0.0', promedio: 0 };
      map.set(id, e);
    }
    e.cantidad += 1;
    e.coseguro += num(r.coseguro);
    e.cobertura += num(r.cobertura);
    e.total_ingresos += num(r.total);
  }
  return [...map.values()]
    .map((e) => ({ ...e, porcentaje: pct(e.total_ingresos, totalIngresos), promedio: e.cantidad > 0 ? e.total_ingresos / e.cantidad : 0 }))
    .sort((a, b) => b.total_ingresos - a.total_ingresos);
}

// ------------------------------------------------------------
// Por Prestador (PRORRATEO: (atención,prestador) distintos × total/cant_prestadores)
// ------------------------------------------------------------
export function porPrestador(filas: MovGecRow[], totalIngresos: number): StatsPorPrestador[] {
  const map = new Map<number, StatsPorPrestador>();
  const vistos = new Set<string>();
  for (const r of filas) {
    if (!r.pre_id) continue;
    const clave = `${r.atencion_id}-${r.pre_id}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const cant = r.cant_prestadores > 0 ? r.cant_prestadores : 1;
    const cose = num(r.coseguro) / cant;
    const cob = num(r.cobertura) / cant;
    let e = map.get(r.pre_id);
    if (!e) {
      e = { prestador_id: r.pre_id, prestador: (r.prestador_nombre || 'Sin Asignar'), cantidad: 0, coseguro: 0, cobertura: 0, total_ingresos: 0, porcentaje: '0.0', promedio: 0 };
      map.set(r.pre_id, e);
    }
    e.cantidad += 1;
    e.coseguro += cose;
    e.cobertura += cob;
    e.total_ingresos += cose + cob;
  }
  return [...map.values()]
    .map((e) => ({ ...e, porcentaje: pct(e.total_ingresos, totalIngresos), promedio: e.cantidad > 0 ? e.total_ingresos / e.cantidad : 0 }))
    .sort((a, b) => b.total_ingresos - a.total_ingresos);
}

// ------------------------------------------------------------
// Por Prestación (grano (atención,práctica) distinto)
// ------------------------------------------------------------
export function porPrestacion(filas: MovGecRow[], totalIngresos: number): StatsPorPrestacion[] {
  const map = new Map<string, StatsPorPrestacion>();
  const vistos = new Set<string>();
  for (const r of filas) {
    if (!r.mp_id) continue;
    const claveAP = `${r.atencion_id}-${r.mp_id}`;
    if (vistos.has(claveAP)) continue;
    vistos.add(claveAP);
    const codigo = (r.practica_codigo || 'S/C');
    let e = map.get(codigo);
    if (!e) {
      e = { codigo, prestacion: (r.practica_nombre || 'Sin Prestación'), grupo_id: r.grupo_id ?? 0, cantidad: 0, coseguro: 0, cobertura: 0, total_ingresos: 0, porcentaje: '0.0', promedio: 0 };
      map.set(codigo, e);
    }
    e.cantidad += 1;
    e.coseguro += num(r.coseguro);
    e.cobertura += num(r.cobertura);
    e.total_ingresos += num(r.total);
  }
  return [...map.values()]
    .map((e) => ({ ...e, porcentaje: pct(e.total_ingresos, totalIngresos), promedio: e.cantidad > 0 ? e.total_ingresos / e.cantidad : 0 }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

// ------------------------------------------------------------
// Por Grupo / Servicio (grano (atención,práctica) distinto)
// ------------------------------------------------------------
export function porGrupo(filas: MovGecRow[], totalIngresos: number): StatsPorGrupo[] {
  const map = new Map<number, StatsPorGrupo & { _codigos: Set<string> }>();
  const vistos = new Set<string>();
  for (const r of filas) {
    if (!r.mp_id) continue;
    const claveAP = `${r.atencion_id}-${r.mp_id}`;
    if (vistos.has(claveAP)) continue;
    vistos.add(claveAP);
    const id = r.grupo_id ?? 0;
    let e = map.get(id);
    if (!e) {
      e = { grupo_id: id, grupo_nombre: (r.grupo_nombre || 'Sin Servicio'), tipos_prestacion: 0, cantidad: 0, coseguro: 0, cobertura: 0, total_ingresos: 0, porcentaje: '0.0', promedio: 0, _codigos: new Set() };
      map.set(id, e);
    }
    e.cantidad += 1;
    e.coseguro += num(r.coseguro);
    e.cobertura += num(r.cobertura);
    e.total_ingresos += num(r.total);
    if (r.practica_codigo) e._codigos.add(r.practica_codigo);
  }
  return [...map.values()]
    .map(({ _codigos, ...e }) => ({ ...e, tipos_prestacion: _codigos.size, porcentaje: pct(e.total_ingresos, totalIngresos), promedio: e.cantidad > 0 ? e.total_ingresos / e.cantidad : 0 }))
    .sort((a, b) => b.total_ingresos - a.total_ingresos);
}

// ------------------------------------------------------------
// Listado (grano atención: filas principales) + filtros del listado
// (os a nivel atención; prestador/grupo/prestación sobre la fila principal)
// ------------------------------------------------------------
export function mapearListado(filas: MovGecRow[], f: FiltrosPrestaciones): PrestacionRealizada[] {
  const os = f.obraSocialId ? parseInt(f.obraSocialId, 10) : null;
  const pre = f.prestadorId ? parseInt(f.prestadorId, 10) : null;
  const grupo = f.grupoPracticas ? parseInt(f.grupoPracticas, 10) : null;
  const der = f.derivadorId ? parseInt(f.derivadorId, 10) : null;
  const prest = f.prestacion ? f.prestacion.toLowerCase() : null;
  const pac = f.paciente ? f.paciente.toLowerCase() : null;
  const dia = f.dia ? parseInt(f.dia, 10) : null;

  return filas
    .filter((r) => r.es_principal)
    .filter((r) => {
      if (os != null && r.os_id !== os) return false;
      if (pre != null && r.pre_id !== pre) return false;
      if (grupo != null && r.grupo_id !== grupo) return false;
      if (der != null && r.derivador_id !== der) return false;
      if (dia != null && r.dia !== dia) return false;
      if (prest && !((r.practica_nombre || '').toLowerCase().includes(prest) || (r.practica_codigo || '').toLowerCase().includes(prest))) return false;
      if (pac && !(r.paciente || '').toLowerCase().includes(pac)) return false;
      return true;
    })
    .map((r) => ({
      id: r.mp_id,
      atencion_id: r.atencion_id,
      fecha: r.fecha,
      hora: num(r.hora),
      paciente: r.paciente || 'Sin nombre',
      coseguro: num(r.coseguro),
      cobertura: num(r.cobertura),
      total: num(r.total),
      edad: num(r.edad),
      diagnostico: r.diagnostico || '',
      estado: r.estado || '',
      usuario_alta: r.usuario_alta || '',
      os_id: r.os_id ?? 0,
      os_nombre: r.os_nombre || 'Sin OS',
      os_sigla: r.os_sigla || '',
      codigo_prestacion: r.practica_codigo || '',
      prestacion: r.practica_nombre || 'Sin práctica',
      grupo_id: r.grupo_id ?? 0,
      prestador_id: r.pre_id || null,
      prestador: r.prestador_nombre || 'Sin prestador',
      derivador_id: r.derivador_id ?? null,
      derivador: r.derivador || '',
      atendio: r.usuario_alta || '',
      anio: r.anio,
      mes_numero: r.mes,
    }))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.atencion_id - a.atencion_id));
}

// ------------------------------------------------------------
// Stats completas del período (totales + 4 agrupaciones), ya filtradas
// ------------------------------------------------------------
export function calcularStats(filasDelPeriodo: MovGecRow[], f: FiltrosPrestaciones) {
  const filas = filtrarAtenciones(filasDelPeriodo, f);
  const totales = calcularTotales(filas);
  return {
    totales,
    porObraSocial: porObraSocial(filas, totales.ingresos),
    porPrestador: porPrestador(filas, totales.ingresos),
    porPrestacion: porPrestacion(filas, totales.ingresos),
    porGrupo: porGrupo(filas, totales.ingresos),
  };
}
