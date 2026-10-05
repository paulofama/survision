// ============================================================
// Línea de tiempo del presupuesto — qué pasó y en qué orden
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// Las dos fuentes existían y nadie las veía: `presupuestos_historial`
// (migraciones 70 y 71) tenía 3 filas y ninguna pantalla la leía, y
// `presupuestos_sobres` (46 y 72) tenía 12 emisiones que sólo se usaban para
// contar. Estos tests fijan lo que la pantalla ahora muestra.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  lineaDeTiempo, valorLegible, tituloEmision, detalleEmision, CAMPO_LABEL,
} from "../modules/presupuestador/utils/lineaDeTiempo";
import { Convenio, Emision, HistorialFila } from "../modules/presupuestador/utils/circuito";

const CONVENIOS: Convenio[] = [
  {
    id: "c1", nombre: "Círculo Médico San Rafael", sub_rama: "circulo_medico",
    codigo_practica: "020701", config: { cuenta: "62252" }, activo: true, orden: 1,
  },
  {
    id: "c2", nombre: "OSEP", sub_rama: "directa",
    codigo_practica: "02.09.03", config: { recetas_suprimir: true }, activo: true, orden: 2,
  },
];

const emision = (over: Partial<Emision>): Emision => ({
  documentos: ["caja"],
  modo: "documento",
  cobertura: null,
  generado_por: "ivana_parra",
  generado_en: "2026-10-01T14:30:00+00:00",
  ...over,
});

const cambio = (over: Partial<HistorialFila>): HistorialFila => ({
  campo: "resultado",
  valor_anterior: "ACEPTADO",
  valor_nuevo: null,
  observaciones: null,
  usuario: "marianela_murgo",
  created_at: "2026-10-02T09:00:00+00:00",
  motivo: null,
  ...over,
});

describe("Línea de tiempo — orden", () => {
  it("mezcla las dos fuentes y ordena por fecha, no por tabla", () => {
    const ev = lineaDeTiempo(
      [cambio({ created_at: "2026-10-01T10:00:00+00:00" })],
      [
        emision({ generado_en: "2026-10-03T10:00:00+00:00", documentos: ["pedido"] }),
        emision({ generado_en: "2026-09-30T10:00:00+00:00", modo: "sobre", documentos: ["caja"] }),
      ],
      CONVENIOS,
    );
    expect(ev.map((e) => e.cuando)).toEqual([
      "2026-10-03T10:00:00+00:00",
      "2026-10-01T10:00:00+00:00",
      "2026-09-30T10:00:00+00:00",
    ]);
  });

  it("sin nada registrado, la lista queda vacía", () => {
    expect(lineaDeTiempo([], [], CONVENIOS)).toEqual([]);
  });

  it("cada evento dice de qué clase es, para distinguirlos en pantalla", () => {
    const ev = lineaDeTiempo([cambio({})], [emision({})], CONVENIOS);
    expect(ev.map((e) => e.clase).sort()).toEqual(["cambio", "emision"]);
  });
});

describe("Línea de tiempo — emisiones", () => {
  it("el pedido de cirugía se nombra como tal y muestra la vía elegida", () => {
    const e = emision({ documentos: ["pedido"], cobertura: "OSEP", generado_por: "rosa_rodriguez" });
    expect(tituloEmision(e)).toBe("Pedido de cirugía emitido");
    expect(detalleEmision(e)).toBe("Vía: OSEP");
    expect(lineaDeTiempo([], [e], CONVENIOS)[0].quien).toBe("rosa_rodriguez");
  });

  it("un pedido con la vía sin definir muestra la obra social de la ficha", () => {
    expect(detalleEmision(emision({ documentos: ["pedido"], cobertura: "Osep" }))).toBe("Vía: Osep");
  });

  it("una emisión vieja sin cobertura no imprime 'Vía: null'", () => {
    // Las 12 filas que existían antes de la migración 72 tienen cobertura null.
    const d = detalleEmision(emision({ documentos: ["pedido"], cobertura: null }));
    expect(d).toBe("");
    expect(d).not.toContain("null");
  });

  it("el sobre entero se nombra sobre, y lista qué llevó", () => {
    const e = emision({ modo: "sobre", documentos: ["indicaciones", "cronograma", "caja"] });
    expect(tituloEmision(e)).toBe("Sobre Quirúrgico impreso");
    expect(detalleEmision(e)).toBe("indicaciones, cronograma, caja");
  });

  it("un documento suelto se nombra por su clave", () => {
    expect(tituloEmision(emision({ modo: "documento", documentos: ["caja"] })))
      .toBe("Documento emitido: caja");
  });

  it("varios documentos sueltos se cuentan", () => {
    expect(tituloEmision(emision({ modo: "documento", documentos: ["caja", "receta_costos"] })))
      .toBe("Documentos emitidos (2)");
  });
});

describe("Línea de tiempo — cambios legibles", () => {
  it("usa nombres de campo, no nombres de columna", () => {
    expect(CAMPO_LABEL.fecha_tentativa_cirugia).toBe("Fecha de cirugía");
    expect(CAMPO_LABEL.diagnostico_opcion_id).toBe("Indicación");
    const ev = lineaDeTiempo([cambio({ campo: "rama_cobertura", valor_anterior: "PARTICULAR", valor_nuevo: "OBRA_SOCIAL" })], [], CONVENIOS);
    expect(ev[0].titulo).toBe("Cobertura: PARTICULAR → OBRA_SOCIAL");
  });

  it("un campo desconocido no rompe: se muestra tal cual", () => {
    const ev = lineaDeTiempo([cambio({ campo: "campo_nuevo", valor_anterior: "a", valor_nuevo: "b" })], [], CONVENIOS);
    expect(ev[0].titulo).toBe("campo_nuevo: a → b");
  });

  it("el convenio se resuelve a su nombre, nunca al UUID", () => {
    expect(valorLegible("convenio_id", "c2", CONVENIOS)).toBe("OSEP");
    const ev = lineaDeTiempo([cambio({ campo: "convenio_id", valor_anterior: "c2", valor_nuevo: "c1" })], [], CONVENIOS);
    expect(ev[0].titulo).toBe("Convenio: OSEP → Círculo Médico San Rafael");
    expect(ev[0].titulo).not.toContain("c1");
  });

  it("un convenio dado de baja lo dice, en vez de mostrar el id", () => {
    expect(valorLegible("convenio_id", "borrado-123", CONVENIOS)).toBe("(convenio dado de baja)");
  });

  it("el ojo sale con su etiqueta completa", () => {
    expect(valorLegible("ojo", "OD", CONVENIOS)).toBe("Ojo derecho (OD)");
    expect(valorLegible("ojo", "AMBOS", CONVENIOS)).toBe("Ambos ojos");
  });

  it("análisis y ECG sale como sí/no, no como true/false", () => {
    expect(valorLegible("requiere_analisis_ecg", "true", CONVENIOS)).toBe("sí");
    expect(valorLegible("requiere_analisis_ecg", "false", CONVENIOS)).toBe("no");
  });

  it("la fecha de cirugía NO se corre un día (columna date en huso negativo)", () => {
    // El bug recurrente: new Date("2026-08-11") es medianoche UTC, que en
    // Argentina es el 10/08. La fecha se formatea sin construir un Date.
    expect(valorLegible("fecha_tentativa_cirugia", "2026-08-11", CONVENIOS)).toBe("11/08/2026");
  });

  it("un valor vacío dice que no hay dato, no queda la flecha suelta", () => {
    expect(valorLegible("resultado", null, CONVENIOS)).toBe("(sin dato)");
    expect(valorLegible("resultado", "   ", CONVENIOS)).toBe("(sin dato)");
    const ev = lineaDeTiempo([cambio({ campo: "resultado", valor_anterior: "ACEPTADO", valor_nuevo: null })], [], CONVENIOS);
    expect(ev[0].titulo).toBe("Resultado: ACEPTADO → (sin dato)");
  });

  it("la indicación no imprime el UUID de la opción", () => {
    const id = "7f3a1c2e-0000-4000-8000-000000000001";
    expect(valorLegible("diagnostico_opcion_id", id, CONVENIOS)).toBe("otra indicación");
    expect(valorLegible("diagnostico_opcion_id", id, CONVENIOS)).not.toContain(id);
  });

  it("el motivo y las observaciones van juntos en el detalle", () => {
    const ev = lineaDeTiempo([cambio({
      motivo: { nombre: "Error de carga" },
      observaciones: "pedido ya emitido (1)",
    })], [], CONVENIOS);
    expect(ev[0].detalle).toBe("Error de carga · pedido ya emitido (1)");
  });

  it("sin motivo ni observaciones el detalle queda vacío, sin separador colgando", () => {
    const ev = lineaDeTiempo([cambio({ motivo: null, observaciones: null })], [], CONVENIOS);
    expect(ev[0].detalle).toBe("");
  });

  it("con motivo y sin observaciones no queda el punto medio solo", () => {
    const ev = lineaDeTiempo([cambio({ motivo: { nombre: "Duplicado" }, observaciones: null })], [], CONVENIOS);
    expect(ev[0].detalle).toBe("Duplicado");
  });
});

describe("Línea de tiempo — el caso real de la base", () => {
  it("reproduce las 3 filas de la migración 70 más un pedido emitido", () => {
    const ev = lineaDeTiempo(
      [
        cambio({ valor_anterior: "ACEPTADO", valor_nuevo: null, usuario: "migracion_70", created_at: "2026-10-03T12:00:00+00:00" }),
        cambio({ valor_anterior: "ACEPTADO", valor_nuevo: "RECHAZADO", usuario: "migracion_70", created_at: "2026-10-03T12:00:01+00:00" }),
      ],
      [emision({ documentos: ["pedido"], cobertura: "Círculo Médico San Rafael", generado_en: "2026-10-04T08:15:00+00:00" })],
      CONVENIOS,
    );
    expect(ev).toHaveLength(3);
    expect(ev[0].titulo).toBe("Pedido de cirugía emitido");
    expect(ev[0].detalle).toBe("Vía: Círculo Médico San Rafael");
    expect(ev[1].titulo).toBe("Resultado: ACEPTADO → RECHAZADO");
    expect(ev[2].titulo).toBe("Resultado: ACEPTADO → (sin dato)");
  });
});
