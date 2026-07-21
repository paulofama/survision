import { describe, it, expect } from "vitest";
import { nuevoLienzo, nuevaHoja, cerrar } from "../modules/presupuestador/utils/sobre/pdfBase";
import {
  docPedidoCirugia, docIndicaciones, docRecetas, docAnalisisEcg, docDeposito, SobreCtx,
} from "../modules/presupuestador/utils/sobre/documentos";

const fmtARS = (v: number) => { const [e, d] = (v || 0).toFixed(2).split("."); return `${e.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`; };

const ctx: SobreCtx = {
  numeroPresupuesto: "P-2026-999",
  paciente: { apellidoNombre: "Pérez, Juan Carlos", documento: "30111222", edad: "68", telefono: "2604111222", obraSocial: "OSDE 210", numeroAfiliado: "AF-12345" },
  ojo: "OD", ojoDiag: "OD", ojoTexto: "ojo derecho (OD)",
  fechaCirugia: "15/08/2026", lioNombre: "Básico", requiereAnalisisEcg: true,
  convenio: { nombre: "Círculo Médico San Rafael", subRama: "circulo_medico", codigo: "020701", config: { cuenta: "62252", leyenda: "Valor según Círculo Médico San Rafael", lineas: ["Gastos", "Honorarios de Especialista"], diag: "Catarata" } },
  total: 1869450, iva: 324450,
  consentimiento: [
    { titulo: "En qué consiste la cirugía", cuerpo: "Texto de ejemplo. ".repeat(40) },
    { titulo: "Riesgos y complicaciones", cuerpo: "Listado de ejemplo. ".repeat(60) },
  ],
  fmtARS,
};

const head = (ab: ArrayBuffer) => String.fromCharCode(...new Uint8Array(ab).slice(0, 5));

describe("Sobre Quirúrgico — builders jsPDF", () => {
  const docs: [string, (L: ReturnType<typeof nuevoLienzo>, c: SobreCtx) => void][] = [
    ["pedido", docPedidoCirugia], ["indicaciones", docIndicaciones], ["recetas", docRecetas], ["analisis", docAnalisisEcg], ["deposito", docDeposito],
  ];

  it.each(docs)("genera el documento %s como PDF válido", (_name, build) => {
    const L = nuevoLienzo();
    build(L, ctx);
    cerrar(L);
    const ab = L.doc.output("arraybuffer");
    expect(head(ab)).toBe("%PDF-");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBeGreaterThan(0);
  });

  it("genera el Sobre combinado multipágina (>= 5 páginas)", () => {
    const L = nuevoLienzo();
    docs.forEach(([, build], i) => { if (i > 0) nuevaHoja(L); build(L, ctx); });
    cerrar(L);
    const ab = L.doc.output("arraybuffer");
    expect(head(ab)).toBe("%PDF-");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((L.doc as any).getNumberOfPages()).toBeGreaterThanOrEqual(5);
  });
});
