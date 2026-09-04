// ============================================================
// Puente del resultado operativo — mes contra mes anterior
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// Responde "qué explica el cambio": descompone la diferencia de resultado
// operativo entre dos meses en cuatro efectos que SUMAN EXACTAMENTE esa
// diferencia. Si no cierra al peso, el informe estaría contando un cuento.
//
// LA FÓRMULA (definida con Paulo, 01/09/2026)
// -------------------------------------------
// Sobre la facturación, la apertura clásica volumen / precio:
//
//   ticket = facturación / cantidad de prácticas
//
//   efecto volumen      = (cantidad_act - cantidad_ant) x ticket_ant
//   efecto precio/mix   = (ticket_act - ticket_ant)     x cantidad_act
//
// Las dos piezas suman exactamente la variación de facturación:
//
//   Δfact = c_act·t_act - c_ant·t_ant
//         = (c_act - c_ant)·t_ant + (t_act - t_ant)·c_act        ✓ identidad
//
// El término cruzado (Δcantidad × Δticket) queda dentro de precio/mix por
// construcción, porque el segundo factor usa la cantidad ACTUAL y no la
// anterior. Es una decisión, no un descuido: evita una quinta barra
// "efecto combinado" que nadie sabe leer.
//
// "Mix" y "precio" van juntos a propósito. Con estos datos no se pueden
// separar: un ticket promedio más alto puede venir de haber aumentado precios
// o de haber hecho proporcionalmente más cirugías que consultas, y desde la
// facturación agregada las dos cosas se ven igual. Separarlas exigiría una
// lista de precios por prestación versionada por mes, que el sistema no tiene.
// Por eso la sección del informe abre las 5 líneas de mayor impacto: ahí se ve
// si el ticket se movió por mezcla o por precio.
//
// Del margen para abajo los efectos son diferencias directas, con el signo dado
// vuelta porque un costo que sube baja el resultado:
//
//   efecto costos variables = -(cv_act - cv_ant)
//   efecto costos fijos     = -(cf_act - cf_ant)
//
// Y el cierre:
//
//   RO = facturación - costos variables - costos fijos
//   ΔRO = Δfact - Δcv - Δcf
//       = (volumen + precio/mix) + efecto_cv + efecto_cf                ✓
// ============================================================

export interface MesPuente {
  /** Etiqueta para el gráfico: "Julio 2026". */
  etiqueta: string;
  facturacion: number;
  cantidad: number;
  costosVariables: number;
  costosFijos: number;
}

export type ClaveEfecto = 'volumen' | 'precio_mix' | 'costos_variables' | 'costos_fijos';

export interface Efecto {
  clave: ClaveEfecto;
  etiqueta: string;
  /** Contribución con signo al cambio de resultado operativo. */
  valor: number;
  /** Peso sobre el desvío total, en %. 0 si el desvío es nulo. */
  peso: number;
  /** Explicación en palabras, para la tabla de contribuciones. */
  detalle: string;
}

export interface Puente {
  desde: { etiqueta: string; resultadoOperativo: number };
  hasta: { etiqueta: string; resultadoOperativo: number };
  /** Diferencia a explicar. */
  variacion: number;
  efectos: Efecto[];
  /**
   * Residuo de la descomposición. Tiene que ser 0 salvo error de punto
   * flotante. Se expone para que el informe pueda afirmar que cerró.
   */
  residuo: number;
  /** Tickets promedio, que son los que explican el efecto precio/mix. */
  ticketAnterior: number;
  ticketActual: number;
}

const resultadoOperativo = (m: MesPuente): number =>
  m.facturacion - m.costosVariables - m.costosFijos;

const ticket = (m: MesPuente): number => (m.cantidad > 0 ? m.facturacion / m.cantidad : 0);

const fmtCant = (n: number): string => new Intl.NumberFormat('es-AR').format(Math.round(n));
const fmtPesos = (n: number): string =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);

/**
 * Descompone la variación de resultado operativo entre dos meses.
 *
 * `anterior` y `actual` tienen que ser meses CERRADOS y comparables. El informe
 * no llama a esta función con el mes en curso.
 */
export function construirPuente(anterior: MesPuente, actual: MesPuente): Puente {
  const roAnt = resultadoOperativo(anterior);
  const roAct = resultadoOperativo(actual);
  const variacion = roAct - roAnt;

  const tAnt = ticket(anterior);
  const tAct = ticket(actual);

  const efVolumen = (actual.cantidad - anterior.cantidad) * tAnt;
  const efPrecioMix = (tAct - tAnt) * actual.cantidad;
  const efCV = -(actual.costosVariables - anterior.costosVariables);
  const efCF = -(actual.costosFijos - anterior.costosFijos);

  const peso = (v: number) => (variacion !== 0 ? (v / Math.abs(variacion)) * 100 : 0);

  const dCant = actual.cantidad - anterior.cantidad;
  const dTicket = tAct - tAnt;

  const efectos: Efecto[] = [
    {
      clave: 'volumen',
      etiqueta: 'Efecto volumen',
      valor: efVolumen,
      peso: peso(efVolumen),
      detalle:
        `${dCant >= 0 ? '+' : ''}${fmtCant(dCant)} prácticas al ticket de ${anterior.etiqueta} ` +
        `(${fmtPesos(tAnt)})`,
    },
    {
      clave: 'precio_mix',
      etiqueta: 'Efecto precio y mezcla',
      valor: efPrecioMix,
      peso: peso(efPrecioMix),
      detalle:
        `ticket promedio ${dTicket >= 0 ? '+' : ''}${fmtPesos(dTicket)} ` +
        `sobre ${fmtCant(actual.cantidad)} prácticas`,
    },
    {
      clave: 'costos_variables',
      etiqueta: 'Efecto costos variables',
      valor: efCV,
      peso: peso(efCV),
      detalle:
        `honorarios, pools e insumos ${efCV <= 0 ? 'subieron' : 'bajaron'} ` +
        `${fmtPesos(Math.abs(actual.costosVariables - anterior.costosVariables))}`,
    },
    {
      clave: 'costos_fijos',
      etiqueta: 'Efecto costos fijos',
      valor: efCF,
      peso: peso(efCF),
      detalle:
        `estructura ${efCF <= 0 ? 'subió' : 'bajó'} ` +
        `${fmtPesos(Math.abs(actual.costosFijos - anterior.costosFijos))}`,
    },
  ];

  const suma = efectos.reduce((s, e) => s + e.valor, 0);

  return {
    desde: { etiqueta: anterior.etiqueta, resultadoOperativo: roAnt },
    hasta: { etiqueta: actual.etiqueta, resultadoOperativo: roAct },
    variacion,
    efectos,
    residuo: variacion - suma,
    ticketAnterior: tAnt,
    ticketActual: tAct,
  };
}

/**
 * ¿Cerró el puente? Tolerancia de un centavo por el punto flotante: los importes
 * llegan como sumas de miles de filas y el error acumulado es del orden de 1e-8.
 */
export const puenteCierra = (p: Puente): boolean => Math.abs(p.residuo) < 0.01;

// ============================================================
// Líneas de mayor impacto
// ============================================================

export interface LineaImpacto {
  /** Obra social, prestación o categoría de costo. */
  nombre: string;
  tipo: 'obra_social' | 'prestacion' | 'costo_fijo';
  cantidadActual: number;
  cantidadAnterior: number;
  montoActual: number;
  montoAnterior: number;
  /** Variación en $. En costos va con el signo dado vuelta (sube = resta). */
  variacion: number;
  /** Peso sobre el desvío total del resultado operativo, en %. */
  peso: number;
}

export interface RankingImpacto {
  lineas: LineaImpacto[];
  /** Cuántas quedaron fuera del top y cuánto suman: nunca truncar en silencio. */
  omitidas: number;
  montoOmitido: number;
}

/**
 * Ordena por impacto absoluto y devuelve las N primeras, informando qué quedó
 * afuera. El informe imprime ese resto como "otras N líneas", nunca lo esconde.
 */
export function rankearImpacto(
  lineas: LineaImpacto[],
  desvioTotal: number,
  top = 5,
): RankingImpacto {
  const ordenadas = [...lineas].sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion));
  const conPeso = ordenadas.map((l) => ({
    ...l,
    peso: desvioTotal !== 0 ? (l.variacion / Math.abs(desvioTotal)) * 100 : 0,
  }));
  const visibles = conPeso.slice(0, top);
  const resto = conPeso.slice(top);
  return {
    lineas: visibles,
    omitidas: resto.length,
    montoOmitido: resto.reduce((s, l) => s + l.variacion, 0),
  };
}
