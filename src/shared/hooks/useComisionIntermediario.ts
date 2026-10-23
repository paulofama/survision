// ============================================
// HOOK: useComisionIntermediario
// Carga el porcentaje del Círculo Médico y sus obras sociales (migración 76).
// Ver `@shared/utils/comisionIntermediario`.
// ============================================

import { useEffect, useState } from 'react';
import {
  CONFIG_COMISION_VACIA,
  cargarConfigComisionIntermediario,
} from '@shared/utils/comisionIntermediario';
import type { ConfigComisionIntermediario } from '@shared/utils/comisionIntermediario';

export function useComisionIntermediario(): {
  config: ConfigComisionIntermediario;
  loading: boolean;
  error: string | null;
} {
  const [config, setConfig] = useState<ConfigComisionIntermediario>(CONFIG_COMISION_VACIA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cargarConfigComisionIntermediario()
      .then((c) => { if (vivo) setConfig(c); })
      .catch((e: unknown) => {
        // Sin la configuración el informe saldría sin la comisión y con el
        // margen inflado: se avisa en vez de seguir en silencio.
        console.error('[comisión Círculo] no se pudo cargar:', e);
        if (vivo) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  return { config, loading, error };
}
