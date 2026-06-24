// ============================================
// INTERCEPTOR GLOBAL DE FETCH — JWT al backend
// Sistema Integral de Gestión - Survisión S.A.
// ============================================
//
// Parchea window.fetch UNA vez para adjuntar el access_token de Supabase Auth
// (header Authorization: Bearer ...) a TODA llamada a NUESTRO backend Express
// (rutas que contienen '/api/' o el puerto 3001). El backend exige ese token
// (middleware requireAuth). Así no hay que tocar los ~40 fetch del frontend.
//
// NO toca:
//   - Llamadas a Supabase (supabase.co): tienen su propia auth (anon key / cliente).
//   - Llamadas que ya traen un header Authorization (ej. fetchConAuth).
//
// Se instala desde main.tsx antes de renderizar la app.
// ============================================

import { supabase } from './supabase';

let instalado = false;

/** ¿La URL apunta a nuestro backend Express (no a Supabase)? */
function esLlamadaBackend(url: string): boolean {
  if (url.includes('supabase.co')) return false; // Supabase REST/Auth: su propia auth
  return url.includes('/api/') || /:3001(\/|$|\?)/.test(url);
}

export function installAuthInterceptor(): void {
  if (instalado || typeof window === 'undefined' || !window.fetch) return;
  instalado = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Solo interceptamos cuando el destino es un string/URL (no objetos Request,
    // que en este proyecto solo los usa el cliente de Supabase internamente).
    if (typeof input === 'string' || input instanceof URL) {
      const url = input.toString();
      if (esLlamadaBackend(url)) {
        const headers = new Headers(init?.headers);
        if (!headers.has('Authorization')) {
          try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (token) {
              headers.set('Authorization', `Bearer ${token}`);
              return originalFetch(input, { ...init, headers });
            }
          } catch {
            // Si falla la obtención de sesión, seguimos con la llamada original.
          }
        }
      }
    }
    return originalFetch(input, init);
  };
}
