// ============================================
// Carga diferida de páginas que sobrevive a un deploy
// Sistema de Gestión Integral · Survisión S.A.
// ============================================
//
// Cada deploy de Netlify cambia el nombre de los archivos de las páginas
// (InformesPage-<hash>.js) y borra los viejos. Una pestaña que quedó abierta
// sigue pidiendo los nombres viejos, el import falla y la página caía en el
// fallback de "en desarrollo", aunque la sección exista y ande.
//
// Acá, si el import falla, se recarga la página una vez para traer la versión
// nueva. Si después de recargar vuelve a fallar, el problema es real: se loguea
// y recién ahí se muestra el fallback. El aviso de "ya recargué" se guarda con
// hora, para que un deploy posterior en la misma pestaña vuelva a recargar.
// ============================================

import type { ComponentType } from 'react';

const CLAVE = 'importarPagina:recargado';
const VENTANA_MS = 60_000;

function recargoHacePoco(): boolean {
  try {
    const t = Number(sessionStorage.getItem(CLAVE));
    return Number.isFinite(t) && Date.now() - t < VENTANA_MS;
  } catch {
    // Sin sessionStorage no hay forma de evitar un bucle: no se recarga.
    return true;
  }
}

function marcarRecarga(): void {
  try {
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    /* ignorado: recargoHacePoco ya devuelve true en este caso */
  }
}

export function importarPagina<P>(
  importar: () => Promise<{ default: ComponentType<P> }>,
  fallback: ComponentType<P>,
): () => Promise<{ default: ComponentType<P> }> {
  return () =>
    importar().catch((error: unknown) => {
      if (!recargoHacePoco()) {
        marcarRecarga();
        window.location.reload();
        // La recarga ya está en marcha: no se muestra nada mientras tanto.
        return new Promise<{ default: ComponentType<P> }>(() => {});
      }
      console.error('[importarPagina] no se pudo cargar la página:', error);
      return { default: fallback };
    });
}
