// ============================================
// CONFIGURACIÓN CENTRALIZADA DE API
// Sistema de Costos - Instituto Dr. Mercado
// ============================================
// RUTA DESTINO: src/lib/apiConfig.ts
// ============================================

/**
 * Detecta automáticamente la URL base del API
 * - En localhost: usa localhost:3001
 * - En red: usa la IP del servidor (mismo host que el frontend)
 */

const API_PORT = 3001;

/**
 * Obtiene la URL base del API de forma dinámica
 * Funciona tanto en localhost como en acceso por red
 */
export const getApiBaseUrl = (): string => {
  // Si hay una variable de entorno definida, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Detectar automáticamente basándose en el hostname actual
  const hostname = window.location.hostname;
  
  // Si es localhost, usar localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `http://localhost:${API_PORT}/api`;
  }
  
  // Si es una IP de red, usar esa misma IP para el API
  // Esto asume que el backend corre en la misma máquina
  return `http://${hostname}:${API_PORT}/api`;
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
