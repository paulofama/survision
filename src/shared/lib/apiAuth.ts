// ============================================
// HELPER: fetch al backend con el JWT de Supabase Auth
// Sistema Integral de Gestión - Survisión S.A.
// ============================================
//
// Los endpoints del módulo Sueldos del backend exigen el access_token de la
// sesión actual (middleware requireSueldos). Este helper lo inyecta solo en
// el header Authorization, preservando los demás headers/opciones del caller.
// ============================================

import { supabase } from './supabase';

/** Header Authorization con el JWT de la sesión actual (o {} si no hay sesión). */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** fetch que agrega automáticamente el Bearer token de Supabase Auth. */
export async function fetchConAuth(url: string, init?: RequestInit): Promise<Response> {
  const auth = await authHeader();
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...auth,
    },
  });
}
