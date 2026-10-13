// ============================================================
// Conciliación agenda vs facturación — las reglas puras
// Sistema de Gestión Integral - Survisión S.A.
// ============================================================
// El espejo existe por la purga: `Turnos` es una ventana móvil de ~4.500 filas
// que sostiene tres meses cerrados. Medido: 09/10/2026 julio tenía 1.112
// turnos atendidos; 13/10/2026, 911. Lo que no se espeja deja de ser
// verificable para siempre, así que estas reglas corren cada hora sin que nadie
// las mire. Por eso están testeadas.
// ============================================================

import { describe, it, expect } from "vitest";
// El extractor abre GECLISA y Supabase al cargarse; las reglas puras viven
// aparte justamente para poder importarlas acá.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reglas = require("../../server/services/conciliacionAgendaReglas.js");
const { finDeMes, aFila, resumirPorCausa, CAUSAS, ETIQUETA_CAUSA } = reglas;

describe("finDeMes — el límite abierto del período", () => {
  it("devuelve el primer día del mes siguiente", () => {
    expect(finDeMes("2026-09")).toBe("2026-10-01");
    expect(finDeMes("2026-07")).toBe("2026-08-01");
  });

  it("diciembre salta de año", () => {
    expect(finDeMes("2026-12")).toBe("2027-01-01");
  });

  it("rellena el mes a dos dígitos", () => {
    // "2026-9-01" no es una fecha ISO válida para SQL Server.
    expect(finDeMes("2026-08")).toBe("2026-09-01");
    expect(finDeMes("2026-01")).toBe("2026-02-01");
  });

  it("febrero no necesita saber cuántos días tiene", () => {
    // Es el motivo del límite abierto: nunca se calcula el último día.
    expect(finDeMes("2024-02")).toBe("2024-03-01");
    expect(finDeMes("2026-02")).toBe("2026-03-01");
  });

  it("un mes inválido falla fuerte, no devuelve una fecha inventada", () => {
    expect(() => finDeMes("2026-13")).toThrow(/mes inválido/);
    expect(() => finDeMes("septiembre")).toThrow(/mes inválido/);
    expect(() => finDeMes("")).toThrow(/mes inválido/);
  });
});

describe("aFila — lo que se guarda en el espejo", () => {
  const cruda = {
    turno_id: 48211,
    fecha_turno: "2026-09-18",
    paciente: "FUENTES, MARIA",
    obra_social: "OSEP",
    prestador: "MERCADO",
    cod_agendado: "030514",
    cod_facturado: "030501",
    practica: "Facoemulsificacion mas Implante de Lio Monofocal",
    fecha_movimiento: "2026-09-18",
    monto: 1954056.5,
    causa: "codigo_distinto",
  };

  it("conserva los dos códigos, que son la discrepancia", () => {
    const f = aFila("2026-09", cruda);
    expect(f.cod_agendado).toBe("030514");
    expect(f.cod_facturado).toBe("030501");
    expect(f.mes).toBe("2026-09");
    expect(f.turno_id).toBe(48211);
    expect(f.causa).toBe("codigo_distinto");
  });

  it("un código facturado vacío se guarda NULL, no cadena vacía", () => {
    // Sin práctica cargada no hay código: es la discrepancia misma, y hay que
    // poder distinguirlo de un código real al leer la tabla.
    const f = aFila("2026-09", { ...cruda, cod_facturado: "", causa: "sin_practica" });
    expect(f.cod_facturado).toBeNull();
  });

  it("recorta los espacios que trae GECLISA", () => {
    const f = aFila("2026-09", { ...cruda, cod_agendado: "  030514 ", obra_social: " OSEP " });
    expect(f.cod_agendado).toBe("030514");
    expect(f.obra_social).toBe("OSEP");
  });

  it("el paciente sin nombre no queda con la coma colgando", () => {
    expect(aFila("2026-09", { ...cruda, paciente: "FUENTES, " }).paciente).toBe("FUENTES");
    expect(aFila("2026-09", { ...cruda, paciente: ", MARIA" }).paciente).toBe("MARIA");
  });

  it("un paciente totalmente vacío queda NULL, no ','", () => {
    expect(aFila("2026-09", { ...cruda, paciente: ", " }).paciente).toBeNull();
    expect(aFila("2026-09", { ...cruda, paciente: "" }).paciente).toBeNull();
    expect(aFila("2026-09", { ...cruda, paciente: null }).paciente).toBeNull();
  });

  it("el importe llega como número, no como texto", () => {
    expect(aFila("2026-09", { ...cruda, monto: "1954056.50" }).monto).toBe(1954056.5);
  });

  it("un importe ausente es 0, nunca NaN", () => {
    // Las causas sin_practica y sin_atencion vienen sin importe.
    expect(aFila("2026-09", { ...cruda, monto: null }).monto).toBe(0);
    expect(aFila("2026-09", { ...cruda, monto: undefined }).monto).toBe(0);
    expect(aFila("2026-09", { ...cruda, monto: "" }).monto).toBe(0);
  });

  it("sin atención no hay fecha de movimiento, y eso no rompe", () => {
    const f = aFila("2026-09", { ...cruda, fecha_movimiento: null, causa: "sin_atencion" });
    expect(f.fecha_movimiento).toBeNull();
  });
});

describe("resumirPorCausa — el agregado se deriva del detalle", () => {
  // Las cuatro causas con los números reales de septiembre-2026.
  const sep = [
    ...Array.from({ length: 9 }, (_, i) => ({ causa: "codigo_distinto", monto: i === 0 ? 17586510 : 0 })),
    { causa: "otro_mes", monto: 8911224 },
    { causa: "otro_mes", monto: 0 },
    ...Array.from({ length: 8 }, () => ({ causa: "sin_practica", monto: 0 })),
  ];

  it("cuenta turnos y suma importes por causa", () => {
    const r = resumirPorCausa(sep);
    const porClave = Object.fromEntries(r.map((x: { causa: string }) => [x.causa, x]));
    expect(porClave.codigo_distinto.turnos).toBe(9);
    expect(porClave.codigo_distinto.monto).toBe(17586510);
    expect(porClave.otro_mes.turnos).toBe(2);
    expect(porClave.otro_mes.monto).toBe(8911224);
    expect(porClave.sin_practica.turnos).toBe(8);
    expect(porClave.sin_practica.monto).toBe(0);
  });

  it("el total del detalle cierra contra la suma del resumen", () => {
    // La regla del proyecto: el detalle tiene que cerrar contra su total.
    const r = resumirPorCausa(sep);
    expect(r.reduce((s: number, x: { turnos: number }) => s + x.turnos, 0)).toBe(sep.length);
    expect(r.reduce((s: number, x: { monto: number }) => s + x.monto, 0))
      .toBe(sep.reduce((s, x) => s + x.monto, 0));
  });

  it("no inventa filas para las causas que no aparecieron", () => {
    const r = resumirPorCausa(sep);
    expect(r.map((x: { causa: string }) => x.causa)).not.toContain("sin_atencion");
  });

  it("ordena poniendo primero lo que más plata mueve", () => {
    const r = resumirPorCausa(sep);
    expect(r[0].causa).toBe("codigo_distinto");
    expect(r[1].causa).toBe("otro_mes");
  });

  it("sin discrepancias devuelve una lista vacía, no ceros", () => {
    expect(resumirPorCausa([])).toEqual([]);
  });

  it("cada causa tiene su explicación en palabras", () => {
    for (const c of CAUSAS) {
      expect(ETIQUETA_CAUSA[c]).toBeTruthy();
    }
    expect(CAUSAS).toHaveLength(4);
  });
});
