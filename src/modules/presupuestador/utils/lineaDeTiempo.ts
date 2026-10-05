// ============================================================
// Línea de tiempo de un presupuesto
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Junta las dos cosas que el sistema ya registraba y nadie veía:
//
//   · los CAMBIOS   — `presupuestos_historial` (migraciones 70 y 71)
//   · las EMISIONES — `presupuestos_sobres`    (migraciones 46 y 72)
//
// Hasta ahora el historial era write-only: lo escribían el modal de aceptación
// y el de cambio de estado, y no lo leía ninguna pantalla. Tenía 3 filas, las
// tres escritas por la migración 70. Registrar sin mostrar es escribir en un
// cajón.
//
// Las dos fuentes se mezclan en una sola lista ordenada por fecha porque la
// pregunta que contesta la línea no es "en qué tabla está", es "qué pasó con
// este presupuesto y en qué orden".
// ============================================================

import { Convenio, Emision, HistorialFila, OJOS, esPedido } from "./circuito";
import { fmtFechaISO } from "./sobre";

export interface Evento {
  /** Timestamp ISO, para ordenar. */
  cuando: string;
  /** Qué clase de cosa pasó: define el color del punto en la lista. */
  clase: "emision" | "cambio";
  titulo: string;
  /** Motivo, observaciones o la vía del pedido. Vacío = no hay nada que agregar. */
  detalle: string;
  quien: string | null;
}

/** Nombres de campo como los lee una persona, no como se llama la columna. */
export const CAMPO_LABEL: Record<string, string> = {
  resultado: "Resultado",
  estado: "Estado",
  rama_cobertura: "Cobertura",
  convenio_id: "Convenio",
  ojo: "Ojo a operar",
  fecha_tentativa_cirugia: "Fecha de cirugía",
  requiere_analisis_ecg: "Análisis y ECG",
  diagnostico_opcion_id: "Indicación",
};

/**
 * Un valor del historial, legible.
 *
 * Los ids se resuelven contra el catálogo de convenios, que la pantalla ya
 * tiene cargado: un UUID impreso no le dice nada a nadie. Si el convenio se
 * dio de baja se dice eso, en vez de mostrar el id igual.
 */
export const valorLegible = (
  campo: string,
  valor: string | null,
  convenios: Convenio[],
): string => {
  const v = String(valor ?? "").trim();
  if (!v) return "(sin dato)";
  switch (campo) {
    case "convenio_id":
      return convenios.find((c) => c.id === v)?.nombre || "(convenio dado de baja)";
    case "requiere_analisis_ecg":
      return v === "true" ? "sí" : "no";
    case "fecha_tentativa_cirugia":
      return fmtFechaISO(v) || v;
    case "ojo":
      return OJOS.find((o) => o.value === v)?.label || v;
    case "diagnostico_opcion_id":
      // La opción elegida vive en una tabla que esta pantalla no carga. Decir
      // que cambió es honesto; imprimir el id, inútil.
      return "otra indicación";
    default:
      return v;
  }
};

/** Qué se emitió, en palabras. */
export const tituloEmision = (e: Emision): string => {
  if (esPedido(e)) return "Pedido de cirugía emitido";
  if (e.modo === "sobre") return "Sobre Quirúrgico impreso";
  if (e.documentos.length === 1) return `Documento emitido: ${e.documentos[0]}`;
  return `Documentos emitidos (${e.documentos.length})`;
};

/**
 * Detalle de una emisión.
 *
 * La vía de autorización sólo la trae el Pedido de cirugía previo a la
 * aceptación, que es el único documento donde la elige quien emite: todo lo que
 * sale del Sobre la toma de la aceptación (migración 72).
 */
export const detalleEmision = (e: Emision): string => {
  if (esPedido(e)) return e.cobertura ? `Vía: ${e.cobertura}` : "";
  return e.documentos.join(", ");
};

/**
 * Los eventos del presupuesto, del más nuevo al más viejo.
 *
 * El orden es por fecha real, no por tabla: una reversión de ayer va después
 * del sobre que se imprimió hoy.
 */
export function lineaDeTiempo(
  historial: HistorialFila[],
  emisiones: Emision[],
  convenios: Convenio[],
): Evento[] {
  const deEmisiones: Evento[] = emisiones.map((e) => ({
    cuando: e.generado_en,
    clase: "emision",
    titulo: tituloEmision(e),
    detalle: detalleEmision(e),
    quien: e.generado_por,
  }));
  const deHistorial: Evento[] = historial.map((h) => ({
    cuando: h.created_at,
    clase: "cambio",
    titulo: `${CAMPO_LABEL[h.campo] || h.campo}: `
      + `${valorLegible(h.campo, h.valor_anterior, convenios)} → `
      + `${valorLegible(h.campo, h.valor_nuevo, convenios)}`,
    detalle: [h.motivo?.nombre, h.observaciones].filter(Boolean).join(" · "),
    quien: h.usuario,
  }));
  return [...deEmisiones, ...deHistorial].sort(
    (x, y) => new Date(y.cuando).getTime() - new Date(x.cuando).getTime(),
  );
}
