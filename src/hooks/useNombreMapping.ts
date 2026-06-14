// ============================================
// HOOK: useNombreMapping
// Mapeo de nombres GECLISA → Receta para matching
// Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/hooks/useNombreMapping.ts
// ============================================
// Carga la tabla prestaciones_nombre_mapping y provee
// una función para enriquecer el recetasMap con aliases.
// Usar en las 4 páginas de Análisis Marginal.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface NombreMapping {
  nombre_geclisa: string;
  nombre_receta: string;
}

// Misma función de normalización que usan las páginas
const normalizarNombre = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/**
 * Hook que carga los mapeos de nombres y provee una función
 * para agregar aliases al recetasMap de cada página.
 * 
 * Uso en las páginas de Análisis Marginal:
 * 
 * ```ts
 * const { agregarAliases } = useNombreMapping();
 * 
 * // Dentro del useMemo de prestacionesBase:
 * const recetasMap = new Map(
 *   recetasConPools.map(r => [normalizarNombre(r.nombre_practica), r])
 * );
 * agregarAliases(recetasMap);  // ← agregar esta línea
 * ```
 */
const useNombreMapping = () => {
  const [mappings, setMappings] = useState<NombreMapping[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const { data, error } = await supabase
          .from('prestaciones_nombre_mapping')
          .select('nombre_geclisa, nombre_receta');

        if (!error && data) {
          setMappings(data);
          console.log(`✅ ${data.length} mapeos de nombres cargados`);
        }
      } catch (err) {
        console.warn('⚠️ No se pudieron cargar mapeos de nombres:', err);
      } finally {
        setLoaded(true);
      }
    };
    cargar();
  }, []);

  /**
   * Agrega aliases al recetasMap para que el matching fuzzy
   * encuentre prestaciones con nombres diferentes.
   * 
   * Para cada mapeo (nombre_geclisa → nombre_receta):
   *   1. Busca la receta por nombre_receta normalizado
   *   2. Si la encuentra, agrega una entrada con nombre_geclisa normalizado
   *   3. Ahora el lookup por nombre GECLISA encuentra la receta
   */
  const agregarAliases = useCallback(<T,>(recetasMap: Map<string, T>) => {
    if (mappings.length === 0) return;

    let agregados = 0;
    mappings.forEach(m => {
      const recetaNorm = normalizarNombre(m.nombre_receta);
      const geclisaNorm = normalizarNombre(m.nombre_geclisa);

      // Si ya existe por el nombre GECLISA, no hace falta
      if (recetasMap.has(geclisaNorm)) return;

      // Buscar la receta por su nombre normalizado
      const receta = recetasMap.get(recetaNorm);
      if (receta) {
        recetasMap.set(geclisaNorm, receta);
        agregados++;
      }
    });

    if (agregados > 0) {
      console.log(`🔗 ${agregados} aliases de nombres agregados al mapa de recetas`);
    }
  }, [mappings]);

  return { mappings, loaded, agregarAliases };
};

export default useNombreMapping;
export { normalizarNombre };
