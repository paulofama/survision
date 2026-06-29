// ============================================================
// Ruta de inicio según el rol/permisos del usuario
// Sistema Integral de Gestión - Survisión S.A.
// ============================================================
// Al loguearse (o entrar a "/"), cada usuario va a su pantalla principal:
//   - Admin o quien tenga acceso al dashboard (prestaciones/análisis) -> "/".
//   - Roles especializados (ej. Ester, solo 'sueldos') -> su módulo.
// Conservador: NO cambia el comportamiento de los usuarios operativos actuales;
// solo redirige a quienes hoy caerían en un dashboard que no les corresponde.
// ============================================================

import type { UsuarioPublico, ModuloSistema } from '../types/auth.types';

// Módulo -> ruta "home", en orden de prioridad (gana el primero con permiso).
const RUTA_POR_MODULO: { modulo: ModuloSistema; ruta: string }[] = [
  { modulo: 'sueldos', ruta: '/sueldos' },
  { modulo: 'presupuestador', ruta: '/presupuestos' },
  { modulo: 'seguimiento_pacientes', ruta: '/seguimiento-pacientes' },
  { modulo: 'tesoreria', ruta: '/tesoreria' },
  { modulo: 'liquidaciones', ruta: '/liquidaciones/honorarios' },
  { modulo: 'informes', ruta: '/informes' },
  { modulo: 'analisis_marginal', ruta: '/analisis-marginal' },
  { modulo: 'insumos', ruta: '/recetas-costos' },
  { modulo: 'herramientas', ruta: '/recetario' },
];

export function rutaInicialPara(usuario: UsuarioPublico | null): string {
  if (!usuario || usuario.es_admin) return '/';
  // Si puede ver el dashboard principal, se queda ahí (comportamiento actual).
  if (usuario.permisos?.prestaciones === true || usuario.permisos?.analisis === true) return '/';
  // Si no, al primer módulo con permiso según prioridad.
  for (const { modulo, ruta } of RUTA_POR_MODULO) {
    if (usuario.permisos?.[modulo] === true) return ruta;
  }
  return '/';
}
