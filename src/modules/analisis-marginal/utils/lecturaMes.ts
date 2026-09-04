// ============================================================
// Lectura del mes — viñetas por regla, con umbral explícito
// Sistema de Gestión Integral · Survisión S.A.
// ============================================================
// El informe no interpreta: aplica reglas. Cada viñeta nace de una condición
// numérica con un umbral declarado acá, y si ninguna regla da verdadera no se
// escribe nada. Es la diferencia entre un informe que se puede auditar y uno
// que le pone adjetivos a los números.
//
// Para agregar una lectura nueva: sumá una entrada a REGLAS. No metas texto
// condicional en el generador del PDF.
//
// Los umbrales de abajo son de arranque, elegidos para que no salte una viñeta
// por ruido de un mes a otro. Se pueden mover sin tocar la lógica.
// ============================================================

export const UMBRALES = {
  /** Variación de facturación que se considera relevante. */
  FACTURACION_MATERIAL: 5,
  /** Debajo de esto, la cantidad de prácticas "se mantuvo". */
  CANTIDAD_ESTABLE: 2,
  /** Variación de cantidad que se considera relevante. */
  CANTIDAD_MATERIAL: 5,
  /** Debajo de esto, el ticket promedio "se mantuvo". */
  TICKET_ESTABLE: 2,
  /** Caída de margen de contribución, en puntos porcentuales. */
  MARGEN_CAIDA_PP: 2,
  /** Suba de costos fijos contra el mes anterior. */
  COSTOS_FIJOS_SUBA: 10,
  /** Desvío de costos fijos contra el promedio de meses cerrados. */
  COSTOS_FIJOS_VS_PROMEDIO: 15,
  /** Participación a partir de la cual una sola línea concentra el resultado. */
  CONCENTRACION: 40,
  /** Caída de cantidad dentro de un segmento. */
  SEGMENTO_CAIDA: 15,
  /** Cobertura de receta debajo de la cual el costo variable es poco confiable. */
  COBERTURA_RECETA: 80,
} as const;

export interface ContextoLectura {
  mesEtiqueta: string;
  mesAnteriorEtiqueta: string;

  /** Variaciones porcentuales contra el mes anterior. */
  varFacturacion: number;
  varCantidad: number;
  varTicket: number;
  varCostosFijos: number;
  /** Variación de costos fijos contra el promedio de meses cerrados previos. */
  varCostosFijosVsPromedio: number;

  /** Margen de contribución sobre facturación, en %. */
  margenPct: number;
  margenPctAnterior: number;

  resultadoOperativo: number;
  resultadoOperativoPct: number;

  /** Segmentos con su variación de cantidad. */
  segmentos: { nombre: string; cantidad: number; varCantidad: number }[];

  /** Línea más concentrada de facturación (obra social). */
  obraSocialTop: { nombre: string; participacion: number } | null;

  /** Cobertura de receta del mes, en %. */
  coberturaReceta: number;

  /** Categorías de costo fijo con dato estimado (ej. sueldos simulados). */
  categoriasSimuladas: string[];

  /** Erogaciones sin clasificar del mes, en $. */
  sinClasificar: number;

  /**
   * false cuando la vista no trae cantidad de prácticas (la grilla de Evolución
   * Temporal es sólo importes). Las reglas que separan volumen de precio se
   * callan en vez de afirmar sobre un cero que no significa "cero prácticas"
   * sino "no lo sé".
   */
  cantidadesDisponibles?: boolean;
}

/** Las cantidades están, salvo que el llamador diga explícitamente que no. */
const hayCantidades = (c: ContextoLectura): boolean => c.cantidadesDisponibles !== false;

export type TonoLectura = 'positivo' | 'negativo' | 'neutro' | 'alerta';

export interface Lectura {
  /** Identifica la regla que la generó, para poder rastrearla. */
  regla: string;
  texto: string;
  tono: TonoLectura;
}

interface Regla {
  clave: string;
  /** Qué mira la regla y con qué umbral. Se documenta en el entregable. */
  descripcion: string;
  evaluar: (c: ContextoLectura) => Lectura | null;
}

/**
 * Formato argentino, un decimal y coma. `toFixed` devuelve punto y las viñetas
 * salían con "10.3%" mientras las tablas del mismo informe decían "10,3%".
 */
const n1 = (n: number): string =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

/** Magnitud sin signo, para frases del tipo "cayó 6,7%". */
const pct = (n: number) => `${n1(Math.abs(n))}%`;
/** Con signo explícito, para cuando el sentido importa. */
const pctFirmado = (n: number) => `${n >= 0 ? '+' : ''}${n1(n)}%`;

const REGLAS: Regla[] = [
  // ── Volumen vs precio ──────────────────────────────────────────────────────
  {
    clave: 'caida_por_mix',
    descripcion:
      `Facturación cae más de ${UMBRALES.FACTURACION_MATERIAL}% y la cantidad de ` +
      `prácticas se mueve menos de ${UMBRALES.CANTIDAD_ESTABLE}%.`,
    evaluar: (c) => {
      if (!hayCantidades(c)) return null;
      if (c.varFacturacion >= -UMBRALES.FACTURACION_MATERIAL) return null;
      if (Math.abs(c.varCantidad) >= UMBRALES.CANTIDAD_ESTABLE) return null;
      return {
        regla: 'caida_por_mix',
        tono: 'negativo',
        texto:
          `La facturación cayó ${pct(c.varFacturacion)} con la cantidad de prácticas ` +
          `prácticamente igual (${pctFirmado(c.varCantidad)}). ` +
          `La caída es de precio o de mezcla de prestaciones, no de volumen: se hizo ` +
          `lo mismo pero se facturó menos por práctica.`,
      };
    },
  },
  {
    clave: 'caida_por_volumen',
    descripcion:
      `Cantidad cae más de ${UMBRALES.CANTIDAD_MATERIAL}% y el ticket promedio se ` +
      `mueve menos de ${UMBRALES.TICKET_ESTABLE}%.`,
    evaluar: (c) => {
      if (!hayCantidades(c)) return null;
      if (c.varCantidad >= -UMBRALES.CANTIDAD_MATERIAL) return null;
      if (Math.abs(c.varTicket) >= UMBRALES.TICKET_ESTABLE) return null;
      return {
        regla: 'caida_por_volumen',
        tono: 'negativo',
        texto:
          `Se hicieron ${pct(c.varCantidad)} menos prácticas con el mismo ticket promedio. ` +
          `La caída es de volumen: el problema es de actividad, no de precios.`,
      };
    },
  },
  {
    clave: 'crecimiento_por_volumen',
    descripcion:
      `Cantidad sube más de ${UMBRALES.CANTIDAD_MATERIAL}% y el ticket se mueve ` +
      `menos de ${UMBRALES.TICKET_ESTABLE}%.`,
    evaluar: (c) => {
      if (!hayCantidades(c)) return null;
      if (c.varCantidad <= UMBRALES.CANTIDAD_MATERIAL) return null;
      if (Math.abs(c.varTicket) >= UMBRALES.TICKET_ESTABLE) return null;
      return {
        regla: 'crecimiento_por_volumen',
        tono: 'positivo',
        texto:
          `Se hicieron ${pct(c.varCantidad)} más prácticas al mismo ticket promedio: ` +
          `el crecimiento es de actividad real.`,
      };
    },
  },
  {
    clave: 'crecimiento_por_precio',
    descripcion:
      `Facturación sube más de ${UMBRALES.FACTURACION_MATERIAL}% con la cantidad ` +
      `estable o en baja.`,
    evaluar: (c) => {
      if (!hayCantidades(c)) return null;
      if (c.varFacturacion <= UMBRALES.FACTURACION_MATERIAL) return null;
      if (c.varCantidad > UMBRALES.CANTIDAD_ESTABLE) return null;
      return {
        regla: 'crecimiento_por_precio',
        tono: 'neutro',
        texto:
          `La facturación subió ${pct(c.varFacturacion)} sin más prácticas ` +
          `(${pctFirmado(c.varCantidad)}). ` +
          `El aumento viene de precio o de mezcla, no de actividad.`,
      };
    },
  },

  // ── Rentabilidad ───────────────────────────────────────────────────────────
  {
    clave: 'margen_cae',
    descripcion: `El margen de contribución cae más de ${UMBRALES.MARGEN_CAIDA_PP} puntos porcentuales.`,
    evaluar: (c) => {
      const dpp = c.margenPct - c.margenPctAnterior;
      if (dpp >= -UMBRALES.MARGEN_CAIDA_PP) return null;
      return {
        regla: 'margen_cae',
        tono: 'negativo',
        texto:
          `El margen de contribución bajó de ${n1(c.margenPctAnterior)}% a ` +
          `${n1(c.margenPct)}% (${pctFirmado(dpp).replace("%","")} pp): cada peso facturado deja ` +
          `menos que en ${c.mesAnteriorEtiqueta}.`,
      };
    },
  },
  {
    clave: 'resultado_negativo',
    descripcion: 'El resultado operativo del mes es negativo.',
    evaluar: (c) => {
      if (c.resultadoOperativo >= 0) return null;
      return {
        regla: 'resultado_negativo',
        tono: 'alerta',
        texto:
          `El resultado operativo de ${c.mesEtiqueta} es negativo ` +
          `(${n1(c.resultadoOperativoPct)}% sobre facturación): la facturación ` +
          `no alcanzó a cubrir los costos variables más la estructura.`,
      };
    },
  },

  // ── Costos ─────────────────────────────────────────────────────────────────
  {
    clave: 'costos_fijos_suben',
    descripcion: `Los costos fijos suben más de ${UMBRALES.COSTOS_FIJOS_SUBA}% contra el mes anterior.`,
    evaluar: (c) => {
      if (c.varCostosFijos <= UMBRALES.COSTOS_FIJOS_SUBA) return null;
      return {
        regla: 'costos_fijos_suben',
        tono: 'negativo',
        texto:
          `Los costos fijos subieron ${pct(c.varCostosFijos)} contra ${c.mesAnteriorEtiqueta}. ` +
          `El detalle por categoría y los comprobantes que lo explican están en la sección de costos.`,
      };
    },
  },
  {
    clave: 'costos_fijos_vs_promedio',
    descripcion:
      `Los costos fijos se desvían más de ${UMBRALES.COSTOS_FIJOS_VS_PROMEDIO}% ` +
      `del promedio de los meses cerrados previos.`,
    evaluar: (c) => {
      if (Math.abs(c.varCostosFijosVsPromedio) <= UMBRALES.COSTOS_FIJOS_VS_PROMEDIO) return null;
      const sube = c.varCostosFijosVsPromedio > 0;
      return {
        regla: 'costos_fijos_vs_promedio',
        tono: sube ? 'negativo' : 'positivo',
        texto:
          `La estructura del mes está ${pct(c.varCostosFijosVsPromedio)} ` +
          `${sube ? 'por encima' : 'por debajo'} del promedio de los meses cerrados. ` +
          `${sube ? 'Conviene revisar si es un gasto puntual o un escalón nuevo.' : ''}`.trim(),
      };
    },
  },

  // ── Concentración y segmentos ──────────────────────────────────────────────
  {
    clave: 'concentracion_obra_social',
    descripcion: `Una sola obra social explica más del ${UMBRALES.CONCENTRACION}% de la facturación.`,
    evaluar: (c) => {
      if (!c.obraSocialTop) return null;
      if (c.obraSocialTop.participacion <= UMBRALES.CONCENTRACION) return null;
      return {
        regla: 'concentracion_obra_social',
        tono: 'alerta',
        texto:
          `${c.obraSocialTop.nombre} concentra el ${n1(c.obraSocialTop.participacion)}% ` +
          `de la facturación del mes. Un cambio de arancel o de padrón de ese convenio ` +
          `mueve el resultado del instituto.`,
      };
    },
  },
  {
    clave: 'segmento_cae',
    descripcion: `Un segmento pierde más de ${UMBRALES.SEGMENTO_CAIDA}% de sus prácticas.`,
    evaluar: (c) => {
      if (!hayCantidades(c)) return null;
      const caidos = c.segmentos
        .filter(s => s.varCantidad < -UMBRALES.SEGMENTO_CAIDA && s.cantidad > 0)
        .sort((a, b) => a.varCantidad - b.varCantidad);
      if (!caidos.length) return null;
      const s = caidos[0];
      return {
        regla: 'segmento_cae',
        tono: 'negativo',
        texto:
          `${s.nombre} hizo ${pct(s.varCantidad)} menos prácticas que en ` +
          `${c.mesAnteriorEtiqueta} (${new Intl.NumberFormat('es-AR').format(s.cantidad)} en el mes).`,
      };
    },
  },

  // ── Calidad del dato ───────────────────────────────────────────────────────
  {
    clave: 'dato_simulado',
    descripcion: 'Hay categorías de costo con valor estimado en lugar de liquidado.',
    evaluar: (c) => {
      if (!c.categoriasSimuladas.length) return null;
      return {
        regla: 'dato_simulado',
        tono: 'alerta',
        texto:
          `El resultado incluye ${c.categoriasSimuladas.join(', ')} con valor ESTIMADO, ` +
          `no liquidado. Las cifras de margen y resultado de este mes son provisorias ` +
          `hasta que se cargue el dato real.`,
      };
    },
  },
  {
    clave: 'cobertura_receta_baja',
    descripcion: `Menos del ${UMBRALES.COBERTURA_RECETA}% de la facturación tiene receta cargada.`,
    evaluar: (c) => {
      if (c.coberturaReceta >= UMBRALES.COBERTURA_RECETA) return null;
      return {
        regla: 'cobertura_receta_baja',
        tono: 'alerta',
        texto:
          `Sólo el ${n1(c.coberturaReceta)}% de la facturación tiene receta de costos ` +
          `cargada. El costo variable del mes está subestimado en la porción restante.`,
      };
    },
  },
];

/**
 * Aplica todas las reglas y devuelve las que dieron verdadero, ordenadas por
 * severidad. `max` recorta las menos severas; el default de 5 es el techo que
 * pidió Administración para que el resumen se lea de un vistazo.
 */
export function leerMes(c: ContextoLectura, max = 5): Lectura[] {
  const orden: Record<TonoLectura, number> = { alerta: 0, negativo: 1, positivo: 2, neutro: 3 };
  return REGLAS
    .map(r => r.evaluar(c))
    .filter((l): l is Lectura => l !== null)
    .sort((a, b) => orden[a.tono] - orden[b.tono])
    .slice(0, max);
}

/** Catálogo de reglas y umbrales, para documentar el informe. */
export const catalogoReglas = (): { clave: string; descripcion: string }[] =>
  REGLAS.map(r => ({ clave: r.clave, descripcion: r.descripcion }));
