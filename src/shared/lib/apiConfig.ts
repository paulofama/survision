// ============================================
// CONFIGURACIÓN CENTRALIZADA DE API
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/lib/apiConfig.ts
// ============================================

/**
 * Obtiene la URL base del API.
 * - Por defecto devuelve la ruta RELATIVA '/api': en dev la resuelve el proxy
 *   de Vite (vite.config.ts) y en Netlify el redirect de netlify.toml. Funciona
 *   igual en acceso por LAN (mismo host sirve el frontend y proxea /api).
 * - Si se define VITE_API_URL, se usa como override absoluto (ej. URL del túnel).
 */
export const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
};

/**
 * URL base del API (evaluada una vez al cargar)
 */
export const API_BASE_URL = getApiBaseUrl();

/**
 * Helper para construir URLs de API
 */
export const apiUrl = (endpoint: string): string => {
  // Asegurar que el endpoint empiece con /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
};

/**
 * Fetch wrapper con la URL base correcta
 */
export const apiFetch = async (
  endpoint: string, 
  options?: RequestInit
): Promise<Response> => {
  const url = apiUrl(endpoint);
  console.log(`🌐 API Call: ${url}`);
  return fetch(url, options);
};

/**
 * Verificar conectividad con el API
 */
export const checkApiConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 segundos timeout
    });
    return response.ok;
  } catch {
    return false;
  }
};

// Log de configuración (solo en desarrollo)
if (import.meta.env.DEV) {
  console.log('📡 API Configuration:');
  console.log(`   Base URL: ${API_BASE_URL}`);
  console.log(`   Hostname: ${window.location.hostname}`);
}

export default API_BASE_URL;
